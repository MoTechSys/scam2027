# A3 — المصادقة والتفويض (Auth & RBAC)

## 1. المصادقة (Auth.js v5)

| العنصر | القرار |
|---|---|
| المزوّد الأساسي | `Credentials` (بريد أو رقم أكاديمي + كلمة مرور) ضمن المستأجر المحلول من host |
| التجزئة | Argon2id (`@node-rs/argon2`) — memory 64MB, iterations 3, parallelism 1 |
| الجلسة | استراتيجية `database` (جدول `Session`) لدعم "الجلسات النشطة" والإبطال الفوري؛ كوكي `HttpOnly; Secure; SameSite=Lax; Path=/`؛ مدة 12 ساعة (30 يوماً مع "تذكرني") |
| إعادة الحساب | `sessionVersion` على User؛ كل تغيير كلمة مرور/دور/تجميد يزيده → الجلسات القديمة تُرفض |
| القفل | `LoginAttempt` بالـ (tenantId, identifier, ip); 5 فشل/15 دقيقة → قفل 15 دقيقة; rate limit 20/دقيقة لكل IP على `/login` |
| OTP | 6 أرقام، 10 دقائق، 5 محاولات، تجزئة بالـ SHA-256 في `VerificationCode` |
| MFA (P3) | TOTP (RFC 6238) + 10 رموز احتياطية؛ إلزامي حسب `settings.security.mfaRequiredRoles` |
| SSO (P4) | `SsoConnection` لكل مستأجر (OIDC: issuer, clientId, secret مشفّر; SAML عبر Jackson) + JIT provisioning بالبريد |
| أول دخول | `mustChangePassword=true` → توجيه إجباري لـ `/profile/password` |

## 2. سياق الطلب

```ts
type Ctx = {
  tenantId: string;
  user: { id: string; roles: string[]; permissions: Set<Permission>; locale: string };
  requestId: string; ip?: string; ua?: string;
};
export async function requireUser(): Promise<Ctx>          // يرمي REDIRECT_LOGIN
export function assertPermission(ctx, ...perms: Permission[]) // أي واحدة تكفي؛ يرمي FORBIDDEN
export function assertAllPermissions(ctx, ...perms)
export async function assertOwnsOffering(ctx, offeringId)  // للمدرس (◐)
export async function assertEnrolled(ctx, offeringId)      // للطالب (◐)
export async function assertCanManageUser(ctx, targetUserId) // منع تعديل من هو أعلى
```

## 3. نمط Server Action القياسي

```ts
export async function createUser(raw: unknown): Promise<Result<UserDTO>> {
  const ctx = await requireUser();
  assertPermission(ctx, 'user.create');
  const input = createUserSchema.strict().parse(raw);
  await assertQuota(ctx, 'users', 1);
  const prisma = db(ctx.tenantId);
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({ data: {...} });
    await audit(tx, ctx, 'user.create', 'User', u.id, { after: redact(u) });
    return u;
  });
  await enqueue({ tenantId: ctx.tenantId, type: 'email.activation', payload: { userId: user.id } });
  revalidatePath('/users');
  return success(toDTO(user));
}
```

- كل action تُغلَّف بـ `withErrorBoundary` تحوّل الاستثناءات المعروفة (`ZodError`, `ForbiddenError`, `QuotaError`, `NotFoundError`) إلى `failure(code)`، وغير المعروفة إلى `failure('INTERNAL')` مع سجل كامل بـ `requestId`.

## 4. حماية المسارات

| الطبقة | ماذا تحمي |
|---|---|
| `middleware.ts` | وجود جلسة لمجموعات `(dashboard)/(platform)`; تطابق المستأجر; `mustChangePassword` |
| `layout.tsx` لكل مجموعة | تحميل `Ctx` وتمرير الصلاحيات للـ Sidebar |
| `page.tsx` | `assertPermission` لصلاحية العرض → وإلا `/unauthorized` |
| Actions/Route Handlers | التحقق الكامل (الحقيقة) |
| DB | RLS |

## 5. الصلاحيات في الواجهة

`<Can perm="user.create">` و`useCan()` من `Ctx` المُمرَّر عبر RSC (لا fetch). تُخفي/تعطّل العناصر فقط — **ليست أماناً**.

## 6. سجل التدقيق للأحداث الأمنية

`auth.login.success`, `auth.login.failed`, `auth.lockout`, `auth.logout`, `auth.password.changed`, `auth.password.reset`, `auth.mfa.enabled`, `auth.session.revoked`, `role.permissions.changed`, `user.role.assigned`, `user.frozen`, `data.exported`, `tenant.impersonated`.

## 7. اختبارات إلزامية

- لكل صلاحية في المصفوفة: action بها تنجح؛ بدونها `FORBIDDEN` (مولَّد من المصفوفة).
- لكل `◐`: مدرس شعبة أخرى → `FORBIDDEN`؛ طالب غير مسجّل → `FORBIDDEN`.
- قفل بعد 5 محاولات؛ OTP منتهٍ يُرفض؛ `sessionVersion` يُبطل الجلسة.
- Zod يرفض حقلاً إضافياً (`.strict()`).
