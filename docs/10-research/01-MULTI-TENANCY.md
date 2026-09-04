# R1 — بحث تعدد المستأجرين (Multi-Tenancy) لبيع النظام لعدة جامعات

## 1. الخيارات

| النموذج | الوصف | المزايا | العيوب | الحكم |
|---|---|---|---|---|
| A. قاعدة بيانات لكل مستأجر | DB منفصلة لكل جامعة | عزل تام، استعادة/نسخ احتياطي سهل لكل جامعة | تكلفة تشغيل، Migrations × N، اتصالات × N، تعقيد Super Admin | مناسب لجامعة تطلب استضافة خاصة (خيار مستقبلي) |
| B. Schema لكل مستأجر | نفس DB، schema مختلف | عزل جيد | Prisma لا يدعمه أصلاً بسهولة؛ Migrations × N | ❌ |
| **C. Schema مشترك + `tenant_id` + RLS** | كل الجداول تحوي `tenant_id`، وPostgres يفرض العزل على مستوى الصف | تكلفة أقل، Migration واحدة، Super Admin طبيعي، عزل مضمون على مستوى DB لا التطبيق فقط | يحتاج انضباطاً في الفهارس والاستعلامات؛ خطأ ضبط GUC = تسريب | ✅ **المعتمد** |

## 2. نمط الإنتاج المعتمد (Postgres RLS + Prisma)

```sql
-- 1) كل جدول
ALTER TABLE "User" ADD COLUMN tenant_id UUID NOT NULL REFERENCES "Tenant"(id);
CREATE INDEX ON "User"(tenant_id, id);

-- 2) تفعيل RLS وإلزام حتى مالك الجدول
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;

-- 3) سياسة العزل
CREATE POLICY tenant_isolation ON "User"
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- 4) سياسة تجاوز للـ Super Admin (اتصال منفصل بدور مميز فقط)
CREATE POLICY super_admin_bypass ON "User"
  USING (current_setting('app.bypass_rls', true) = 'on');
```

```ts
// Prisma Client Extension — كل استعلام داخل معاملة تضبط GUC بنطاق المعاملة
export function tenantClient(tenantId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await prisma.$transaction([
            prisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`,
            query(args),
          ]);
          return result;
        },
      },
    },
  });
}
```

**قواعد إلزامية:**
1. `tenant_id` يُستخرج من **الجلسة/JWT فقط**، لا من body/query أبداً.
2. `set_config(..., TRUE)` → نطاق المعاملة (آمن مع connection pooling / PgBouncer transaction mode).
3. دور DB للتطبيق **ليس** مالك الجداول ولا `BYPASSRLS`؛ `FORCE ROW LEVEL SECURITY` للحماية حتى لو كان.
4. الفهارس المركبة `(tenant_id, …)` على كل عمود يُستعلم به.
5. المفاتيح الأجنبية المركبة `(tenant_id, parent_id)` حيث تكون العلاقات حساسة (Enrollment → Offering) لمنع الربط عبر المستأجرين.
6. مفاتيح الكاش وS3/التخزين تبدأ بـ `tenant/{id}/…`.
7. وظائف الخلفية (jobs) تحمل `tenant_id` في الحمولة وتضبطه قبل أي استعلام.
8. الاختبار الإلزامي: "مستخدم من المستأجر A لا يرى/يعدّل صف المستأجر B" لكل موديل (اختبار مولّد آلياً).
9. **تصدير/محو لكل مستأجر** كأمر واحد (يلزم PDPL وثقة الجامعة).
10. **Fallback أمني:** إن كان `app.current_tenant_id` غير مضبوط تُعيد السياسة صفراً من الصفوف (لأن `NULL::uuid = tenant_id` → NULL → false).

## 3. تحديد المستأجر (Tenant Resolution)

| الطريقة | الاستخدام |
|---|---|
| نطاق فرعي `ksu.scam.app` | الافتراضي للـ SaaS |
| نطاق مخصص `lms.ksu.edu.sa` | للجامعة التي تريد نطاقها (CNAME + TLS تلقائي) |
| اختيار عند الدخول | fallback على النطاق الرئيسي (قائمة الجامعات) |

يُخزَّن `tenantId` في الجلسة عند تسجيل الدخول، ويُتحقّق أن `session.tenantId === resolvedTenantFromHost` في middleware — عدم التطابق = خروج فوري.

## 4. مستويات الحساب

- **Platform Super Admin** (المالك/المورّد): إنشاء مستأجرين، الاشتراكات، الحدود، الدعم. يعمل عبر اتصال DB منفصل بـ `app.bypass_rls=on` و**كل عملية له تُسجَّل في التدقيق**.
- **Tenant Admin** (مدير النظام في الجامعة): كل ما يخص جامعته فقط.
- بقية الأدوار داخل المستأجر (أكاديمي، مدرس، طالب، أدوار مخصصة).

## 5. الحدود والاشتراك (لـ Super Admin)

`Subscription { plan, maxUsers, maxStorageGB, maxAiTokensMonthly, startsAt, endsAt, status }` — تُفحص في الإجراءات (إنشاء مستخدم / رفع ملف / طلب AI) وتُعرض في لوحة المستأجر.

## 6. المراجع
- Postgres RLS production pattern — https://theroadtoenterprise.com/blog/postgres-rls-multi-tenant-saas
- Prisma Client Extensions RLS example — https://www.prisma.io/blog/client-extensions-preview-8t3w27xkrxxn
- Atlas: RLS with Prisma — https://atlasgo.io/guides/orms/prisma/row-level-security
- Securing multi-tenant apps with RLS + Prisma — https://medium.com/@francolabuschagne90/securing-multi-tenant-applications-using-row-level-security-in-postgresql-with-prisma-orm-4237f4d4bd35
