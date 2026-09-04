# A1 — تصميم تعدد المستأجرين (Multi-Tenancy Design)

> القرار المرجعي: ADR-0002. البحث: `docs/10-research/01-MULTI-TENANCY.md`.

## 1. الموديلات الأساسية

```prisma
model Tenant {
  id            String   @id @default(uuid())
  slug          String   @unique          // ksu → ksu.scam.app
  name          String
  nameEn        String?
  customDomain  String?  @unique          // lms.ksu.edu.sa
  status        TenantStatus @default(ACTIVE) // ACTIVE | SUSPENDED | ARCHIVED
  locale        String   @default("ar")
  timezone      String   @default("Asia/Riyadh")
  branding      TenantBranding?
  subscription  Subscription?
  settings      TenantSetting[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model TenantBranding { tenantId String @id; logoUrl String?; faviconUrl String?; primaryColor String @default("#39ff14"); accentColor String?; loginMessage String? }

model Subscription { tenantId String @id; plan Plan; maxUsers Int; maxStorageGB Int; maxAiTokensMonthly Int; startsAt DateTime; endsAt DateTime; status SubStatus }

model TenantSetting { tenantId String; category String; key String; value Json; isSecret Boolean @default(false); @@id([tenantId, category, key]) }
```

كل موديل آخر: `tenantId String` + `tenant Tenant @relation(...)` + `@@index([tenantId, ...])`.

## 2. طبقة الوصول (Prisma)

```ts
// lib/db/prisma.ts
export const basePrisma = new PrismaClient();            // بدور DB "app_user" (بلا BYPASSRLS)
export const platformPrisma = new PrismaClient({ datasourceUrl: env.PLATFORM_DATABASE_URL }); // دور "platform_admin" لصفحات المنصة فقط

// lib/db/tenant.ts
export function db(tenantId: string) {
  return basePrisma.$extends({
    query: { $allModels: { async $allOperations({ args, query }) {
      const [, r] = await basePrisma.$transaction([
        basePrisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`,
        query(args),
      ]);
      return r;
    } } },
  });
}
```

**قاعدة:** لا يُستورد `basePrisma` مباشرة في أي feature (قاعدة ESLint `no-restricted-imports`). كل شيء عبر `db(ctx.tenantId)`.

## 3. RLS migration (نموذج لكل جدول — تُولَّد بسكربت)

```sql
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "User"
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "User" TO app_user;
```

جداول المنصة (`Tenant`, `Subscription`, `PlatformUser`, `PlatformAuditLog`) بلا RLS ولا تُمنح لـ `app_user` إلا قراءة `Tenant` المحدودة (للحل من host).

## 4. تحديد المستأجر

```ts
// middleware.ts (مبسّط)
const host = req.headers.get('host')!.split(':')[0];
const tenant = await resolveTenant(host); // slug من subdomain أو customDomain؛ كاش 60s
if (!tenant) return rewrite('/tenant-not-found');
if (tenant.status !== 'ACTIVE') return rewrite('/tenant-suspended');
res.headers.set('x-tenant-id', tenant.id);
const session = await auth();
if (session && session.user.tenantId !== tenant.id) return signOutRedirect();
```

في التطوير: `localhost` → مستأجر `demo` عبر env `DEV_TENANT_SLUG`.

## 5. الجلسة

`session.user = { id, tenantId, roles[], permissions[], locale, mustChangePassword }`. الصلاحيات تُحسب عند الدخول وتُعاد عند تغيير الأدوار (`sessionVersion` في User؛ الكوكي تحمل الإصدار؛ اختلاف = إعادة تحميل).

## 6. الحدود والحصص

`assertQuota(ctx, 'users' | 'storage' | 'aiTokens', delta)` يُستدعى في الإجراءات المعنية؛ يقرأ `Subscription` + عدّادات مجمّعة (`TenantUsage { tenantId, month, users, storageBytes, aiTokens }`).

## 7. دورة حياة المستأجر

| الحالة | السلوك |
|---|---|
| ACTIVE | طبيعي |
| SUSPENDED | الدخول مرفوض برسالة؛ البيانات محفوظة |
| ARCHIVED | بعد التصدير؛ حذف صلب بعد فترة سماح (افتراضي 90 يوماً) بأمر Super Admin |

`exportTenant(tenantId)` → job → ZIP (JSON لكل جدول + ملفات) → رابط موقّع → تدقيق منصة.

## 8. الاختبارات الإلزامية

- لكل موديل: إنشاء صف في A، محاولة قراءة/تعديل/حذف من B → 0 نتائج / خطأ.
- بدون GUC → 0 صفوف (وليس خطأ صامتاً يكشف البيانات).
- host/session mismatch → خروج.
- تجاوز الحصة → `QUOTA_EXCEEDED`.
