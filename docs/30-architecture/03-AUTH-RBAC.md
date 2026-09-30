# A3 — المصادقة والتفويض (Auth & RBAC)

## 1. المصادقة (Auth.js v5)

| العنصر | القرار |
|---|---|
| المزوّد الأساسي | `Credentials` (بريد أو رقم أكاديمي + كلمة مرور) ضمن المستأجر المحلول من host |
| التجزئة | Argon2id (`@node-rs/argon2`) — memory 64MB, iterations 3, parallelism 1 |
| الجلسة | JWT في كوكي `scam.session` (`HttpOnly; Secure; SameSite=Lax`) **+ صف `Session`** هو المصدر الملزم (يُفحص في كل طلب عبر `requireUser`)؛ العمر من إعدادات المستأجر (ADR-0009 §5): بلا «تذكرني» = `security.sessionIdleMinutes` (0 → 12 ساعة)، مع «تذكرني» = `security.sessionMaxDays` (افتراضي 30، سقف 90) |
| إعادة الحساب | `sessionVersion` على User؛ كل تغيير كلمة مرور/دور/تجميد يزيده → الجلسات القديمة تُرفض |
| القفل | `LoginAttempt` بالـ (tenantId, identifier, ip); `security.lockoutMaxFails` فشل / `security.lockoutWindowMinutes` (افتراضي 5/15) → قفل؛ rate limit 20/دقيقة لكل IP على `/login`، و30/15 دقيقة لكل IP على `/forgot|/reset|/activate` (دلو مستقل) |
| الاستعادة/التفعيل (P1-11) | **رابط موقّع أحادي الاستخدام** (ADR-0009): 32 بايت base64url، يُخزَّن `sha256` فقط في `PasswordResetToken.tokenHash` بصيغة `<PURPOSE>:<hex>`؛ 10 دقائق للاستعادة، 72 ساعة للتفعيل؛ طلب جديد يُبطل السابق؛ الاستهلاك داخل معاملة تغيير كلمة المرور + إبطال كل الجلسات؛ الرد على `/forgot` متطابق وُجد الحساب أم لا (3/15 دقيقة لكل معرّف، 10/15 دقيقة لكل IP). `VerificationCode` (OTP) محجوز لـ MFA (P3) وتغيير البريد |
| MFA (P3) | TOTP (RFC 6238) + 10 رموز احتياطية؛ إلزامي حسب `settings.security.mfaRequiredRoles` |
| SSO (P4) | `SsoConnection` لكل مستأجر (OIDC: issuer, clientId, secret مشفّر; SAML عبر Jackson) + JIT provisioning بالبريد |
| إجبار تغيير كلمة المرور (P1-11) | `Ctx.user.passwordChangeRequired ∈ {ADMIN_RESET, TENANT_FORCED, EXPIRED, null}` يُحسب في `loadCtx` من `User.mustChangePassword`، و`security.forcePasswordChangeOnNextLogin` (مقارنة `passwordChangedAt` بـ`updatedAt` صف الإعداد)، و`security.passwordMaxAgeDays`. غير null ⇒ `requireUser` يعيد التوجيه إلى `/change-password?reason=…` و`requireUserOrThrow` يرمي `PASSWORD_CHANGE_REQUIRED`؛ يُستثنى فقط `changePasswordAction`/`logoutAction`/`setLocaleAction` عبر `{ allowPasswordChangeRequired: true }` |
| سياسة كلمات المرور | `features/auth/core.passwordPolicyIssues(p, policy)`: `security.passwordMinLength` (≥10)، upper/lower/digit ثابتة، `security.passwordRequireSymbol`؛ الرموز `min:N|lower|upper|digit|symbol` تُترجم في `auth.passwordIssues.*`. تُطبَّق في الإنشاء/إعادة التعيين الإداري/الاستعادة/التفعيل/التغيير |
| البريد | لا SMTP من الطلب: `Job mail.send` (`{to, template, params, locale}`) يُكتب في نفس معاملة الرمز ويُعالَج inline عبر `after()` حتى worker P1-12؛ `lib/mail` بناقل `log` (المعاينة في `Job.result`) والـ`smtp` يُفعَّل في P1-12 |

## 2. سياق الطلب

```ts
type Ctx = {
  tenantId: string;
  user: { id: string; roles: string[]; permissions: Set<Permission>; locale: string };
  requestId: string; ip?: string; ua?: string;
};
export async function requireUser(opts?: { allowPasswordChangeRequired?: boolean }): Promise<Ctx> // redirect /login أو /change-password
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
