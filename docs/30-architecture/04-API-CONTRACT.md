# A4 — عقد الواجهة البرمجية (Server Actions & HTTP API Contract)

> الطبقة الأساسية للواجهة = **Server Actions** (نفس الحدود الدلالية لـ `lib/api.ts` القديم لتسهيل نقل الصفحات). **Route Handlers** تُستخدم فقط لما يحتاج HTTP حقيقياً: رفع/تنزيل الملفات، health، OpenAPI، LTI، Webhooks، وواجهة عامة للتكامل (P3).

## 1. شكل النتيجة الموحّد

```ts
type Result<T> = { ok: true; data: T } | { ok: false; code: ErrorCode; message: string; fieldErrors?: Record<string, string[]> };
type ErrorCode = 'VALIDATION' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'QUOTA_EXCEEDED' | 'RATE_LIMITED' | 'TENANT_SUSPENDED' | 'INTERNAL';
type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
```

## 2. خريطة `lib/api.ts` القديم → Server Actions

| قديم | جديد (`features/*/actions.ts`) | صلاحية |
|---|---|---|
| `authApi.login` | Auth.js `signIn('credentials')` | — |
| `authApi.logout` | `signOut()` | — |
| `authApi.getMe` | RSC `getCtx()` | — |
| `authApi.refreshToken` | (لا حاجة — جلسة DB) | — |
| `authApi.changePassword` | `auth/changePassword` | مصادق |
| — | `auth/forgotPasswordAction({identifier})` → دائمًا `{queued:true}` (بلا تعداد) · `auth/inspectTokenAction(token, purpose)` (RSC) · `auth/resetPasswordAction({token,password,confirm})` · `auth/activateAccountAction({token,password,confirm})` · `auth/changePasswordAction({current,password,confirm})` (الوحيد المسموح أثناء `PASSWORD_CHANGE_REQUIRED`) · `auth/sendActivationAction({id})` — ADR-0009؛ لا `verifyOtp` (OTP محجوز لـ MFA P3) | عامة / جلسة / `user.edit` |
| `usersApi.getAll` | `users/listUsers({ q, role, majorId, levelId, status, page, pageSize })` → `Page<UserDTO>` | `user.view` |
| `usersApi.getById` | `users/getUser(id)` | `user.view_details` |
| `usersApi.create/update/delete` | `users/createUser`, `updateUser`, `softDeleteUser` | `user.create/edit/delete` |
| `usersApi.resetPassword` | `users/adminResetPassword(id)` | `user.reset_password` |
| — | `users/importUsers(fileId, { dryRun })`, `exportUsers(filters)`, `promoteStudents({ majorId, fromLevelId, toLevelId })`, `freezeUser`, `assignRoles` | `user.import/export/promote/freeze/change_role` |
| `rolesApi.*` | `roles/listRoles`, `getRole`, `createRole`, `updateRole`, `deleteRole`, `setRolePermissions`, `listPermissionCatalog` | `role.*` |
| `coursesApi.*` | `courses/listCourses`, `getCourse`, `createCourse`, `updateCourse`, `softDeleteCourse` | `course.*` |
| — | `offerings/listOfferings`, `createOffering`, `updateOffering`, `assignInstructors`, `enrollStudents`, `withdrawStudent`, `listEnrollments` | `offering.*`, `enrollment.*` |
| `filesApi.getAll/getByCourse/getById` | `files/listFiles({ type, offeringId, courseId, q, status })`, `getFile` | `file.view` |
| `filesApi.upload` | **HTTP** `POST /api/files` (multipart, stream) | `file.upload` |
| `filesApi.download` | **HTTP** `GET /api/files/[id]/download?sig=…` (رابط موقّع من `files/getDownloadUrl`) | `file.download` |
| `filesApi.delete` | `files/softDeleteFile`, `approveFile`, `rejectFile`, `updateFileMeta` | `file.delete/approve/edit` |
| `notificationsApi.*` | `notifications/listInbox`, `markRead`, `markAllRead`, `archive`, `send({ title, body, priority, target })`, `listSent`, `getReadStats`, `updatePreferences` | `notification.*` |
| `trashApi.*` | `trash/listTrash(kind)`, `restore(kind, id)`, `permanentDelete(kind, id)`, `emptyTrash(kind)` | `trash.*` |
| `settingsApi.get/update(category)` | RSC `settings/queries: loadGeneral`, `loadSecurity`, `loadBranding`, `loadEmail` (الأسرار تُعاد كحالة `hasValue` + ذيل مقنَّع فقط)؛ Server Actions `settings/updateGeneralAction`, `updateSecurityAction`, `updateBrandingAction`, `removeLogoAction`, `setSecretSettingAction({ key, value | null })` (كلها Zod strict؛ `primaryColor` يرفض ما دون WCAG AA 4.5:1 عبر `lib/color.primaryContrast` → `tx` → `audit` → `invalidateTenantCache` → `revalidatePath`)؛ `testEmail()` في P1-12 | `settings.view` + `settings.edit_general/edit_security/edit_branding` |
| `dashboardApi.getStats` | `reports/getDashboard()` (حسب الدور) | `dashboard.view` |
| `reportsApi.*` | `reports/getUsersReport`, `getCoursesReport`, `getFilesReport`, `getAiReport`, `getActivityReport`, `exportReport(kind, format)` | `report.*` |
| `auditLogsApi.getAll` | RSC `audit/queries: listAuditLogs(ctx, query, tz)`, `getAuditEntry`, `auditFacets` (لا Server Actions — السجل للقراءة فقط)؛ **HTTP** `GET /api/audit/export?<filters>` CSV بتدفّق | `audit.view` / `audit.export` |
| `academicApi.*` | `academic/{colleges,departments,majors,levels,years,semesters}.{list,create,update,delete}`, `semesters.setCurrent` | `*.manage` |
| — (mock سابقاً) | `ai/summarizeFile(fileId)`, `generateQuestions(fileId, opts)`, `chat(conversationId?, message, fileIds)`, `listConversations`, `approveSummary`, `getUsage` | `ai.*` |
| — | `quizzes/*`, `grades/*`, `assignments/*` (من V2 مع إعادة تسمية للمصفوفة) | `quiz.*`, `grade.*`, `assignment.*` |
| — | `privacy/exportMyData`, `createDsar`, `listDsar`, `resolveDsar`, `listRopa`, `upsertRopa`, `listIncidents`, `createIncident` | `privacy.*` |
| — | العلامة التجارية ضمن `settings/*` أعلاه (`updateBrandingAction`, `removeLogoAction`)؛ `getUsage` في P3 | `settings.edit_branding` |
| — (منصة) | `platform/listTenants`, `createTenant`, `updateTenant`, `suspendTenant`, `exportTenant`, `setSubscription` | `platform.*` |

## 3. Route Handlers (HTTP)

| المسار | الطريقة | الغرض | المصادقة |
|---|---|---|---|
| `/api/health` | GET | `{ status, db, storage, redis, version }` | عامة (بلا تفاصيل حساسة) |
| `/api/files` | POST | رفع multipart (stream → storage) | جلسة + `file.upload` |
| `/api/files/[id]/download` | GET | تنزيل برابط موقّع (5 دقائق) | توقيع HMAC + جلسة |
| `/forgot`, `/reset?token=`, `/activate?token=`, `/change-password` | صفحات | صفحات المصادقة المستقلة (P1-11)؛ عامة عدا `/change-password` (جلسة، مسموحة أثناء إجبار التغيير)؛ rate-limit 30/15 دقيقة لكل IP على POST | — |
| `/api/branding/logo` | POST | رفع/استبدال شعار المستأجر (multipart `logo`، ≤512 KB، النوع بالـmagic bytes: PNG/WebP/JPEG، أو SVG بعد فحص `svgIsInert` — لا script/on*/foreignObject/مراجع خارجية)؛ يُكتب تحت `<tenantId>/branding/<uuid>.<ext>` عبر `lib/storage`، يحدّث `TenantBranding.logoUrl/faviconUrl/logoStorageKey` ويحذف الكائن القديم، يدوّن `settings.upload_logo`، rate-limit 10/دقيقة؛ 401/403/400/413/415/429 | جلسة + `settings.edit_branding` |
| `/api/branding/logo/[tenantId]/[version]` | GET | الشعار الحالي للمستأجر (عام بطبيعته — يُعرض لزائر `/login` بلا جلسة)؛ `version` كاسر كاش فقط؛ `Cache-Control: immutable` + CSP `default-src 'none'; sandbox` + `nosniff`؛ يُقرأ المفتاح عبر العميل المالك (لا GUC بلا جلسة) ويُرفض أي مفتاح خارج `<tenantId>/branding/`؛ 404 لغير الموجود | عامة |
| `/api/audit/export` | GET | CSV بتدفّق (UTF-8 BOM، RFC 4180، حماية من حقن الصيغ، keyset batches ×1000، سقف 50k صف، `x-audit-rows`/`x-audit-total`)؛ المرشّحات = `auditExportSchema` **strict** (مجهول → 400)؛ التصدير نفسه يُدوَّن `audit.export` | جلسة + `audit.export` |
| `/api/files/[id]/preview` | GET | تدفق للعارض (Range) | توقيع + جلسة |
| `/api/docs` | GET | OpenAPI 3.1 (من zod-openapi) — P3 | جلسة admin |
| `/api/v1/**` | * | واجهة تكامل عامة بـ API Key لكل مستأجر — P3 | `Authorization: Bearer <tenant api key>` |
| `/api/lti/login`, `/launch`, `/jwks`, `/deep-link` | GET/POST | LTI 1.3 — P5 | OIDC/JWT |
| `/api/webhooks/[id]` | POST | استقبال — P4 | HMAC |
| `/api/cron/retention`, `/api/cron/digest` | POST | مهام دورية (إن لم يوجد worker) — غير مبنية؛ اليوم `trash.purge` عبر Job + worker (ADR-0010) | `CRON_SECRET` |
| *(بلا HTTP)* `pnpm worker` | عملية | عامل المهام المستقل (`src/worker/index.ts`): `claimJobs` (`FOR UPDATE SKIP LOCKED`، `WORKER_CONCURRENCY`)، `reapStaleLocks` (`WORKER_STALE_LOCK_MINUTES`)، معالجات `lib/jobs/registry.ts` (`mail.send`, `notification.fanout`, `trash.purge`)؛ نوع بلا معالج → `FAILED`؛ `SIGINT/SIGTERM` = إيقاف رشيق. من الطلب: `kickJob()` فقط (inline إن `JOBS_INLINE`) — لا تستدعِ معالجًا مباشرة | دور المالك (`platformPrisma`) ثم `tx(tenantId)` لكل مهمة |

## 4. قواعد

1. كل action لها `schemas.ts` (Zod `.strict()`) و DTO صريح (لا إرجاع موديل Prisma خام؛ لا `passwordHash` أبداً).
2. الترقيم خادمي: `pageSize ≤ 100`.
3. كل action كاتبة تسجّل تدقيقاً وتستدعي `revalidatePath/Tag`.
4. الملفات لا تُقرأ في الذاكرة كاملة؛ stream فقط.
5. أي حقل تاريخ يُرجع ISO-8601 UTC؛ العرض بتوقيت المستأجر.
6. التغيير في هذا العقد = تحديث هذه الوثيقة في نفس PR.
