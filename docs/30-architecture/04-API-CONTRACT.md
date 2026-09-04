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
| — | `auth/requestPasswordReset`, `auth/verifyOtp`, `auth/resetPassword`, `auth/activateAccount` | — |
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
| `settingsApi.get/update(category)` | `settings/getSettings(category)`, `updateSettings(category, values)`, `testEmail()` | `settings.*` |
| `dashboardApi.getStats` | `reports/getDashboard()` (حسب الدور) | `dashboard.view` |
| `reportsApi.*` | `reports/getUsersReport`, `getCoursesReport`, `getFilesReport`, `getAiReport`, `getActivityReport`, `exportReport(kind, format)` | `report.*` |
| `auditLogsApi.getAll` | `audit/listAuditLogs(filters)`, `exportAuditLogs` | `audit.*` |
| `academicApi.*` | `academic/{colleges,departments,majors,levels,years,semesters}.{list,create,update,delete}`, `semesters.setCurrent` | `*.manage` |
| — (mock سابقاً) | `ai/summarizeFile(fileId)`, `generateQuestions(fileId, opts)`, `chat(conversationId?, message, fileIds)`, `listConversations`, `approveSummary`, `getUsage` | `ai.*` |
| — | `quizzes/*`, `grades/*`, `assignments/*` (من V2 مع إعادة تسمية للمصفوفة) | `quiz.*`, `grade.*`, `assignment.*` |
| — | `privacy/exportMyData`, `createDsar`, `listDsar`, `resolveDsar`, `listRopa`, `upsertRopa`, `listIncidents`, `createIncident` | `privacy.*` |
| — | `tenant/getBranding`, `updateBranding`, `getUsage` | `settings.edit_branding` |
| — (منصة) | `platform/listTenants`, `createTenant`, `updateTenant`, `suspendTenant`, `exportTenant`, `setSubscription` | `platform.*` |

## 3. Route Handlers (HTTP)

| المسار | الطريقة | الغرض | المصادقة |
|---|---|---|---|
| `/api/health` | GET | `{ status, db, storage, redis, version }` | عامة (بلا تفاصيل حساسة) |
| `/api/files` | POST | رفع multipart (stream → storage) | جلسة + `file.upload` |
| `/api/files/[id]/download` | GET | تنزيل برابط موقّع (5 دقائق) | توقيع HMAC + جلسة |
| `/api/files/[id]/preview` | GET | تدفق للعارض (Range) | توقيع + جلسة |
| `/api/docs` | GET | OpenAPI 3.1 (من zod-openapi) — P3 | جلسة admin |
| `/api/v1/**` | * | واجهة تكامل عامة بـ API Key لكل مستأجر — P3 | `Authorization: Bearer <tenant api key>` |
| `/api/lti/login`, `/launch`, `/jwks`, `/deep-link` | GET/POST | LTI 1.3 — P5 | OIDC/JWT |
| `/api/webhooks/[id]` | POST | استقبال — P4 | HMAC |
| `/api/cron/retention`, `/api/cron/digest` | POST | مهام دورية (إن لم يوجد worker) | `CRON_SECRET` |

## 4. قواعد

1. كل action لها `schemas.ts` (Zod `.strict()`) و DTO صريح (لا إرجاع موديل Prisma خام؛ لا `passwordHash` أبداً).
2. الترقيم خادمي: `pageSize ≤ 100`.
3. كل action كاتبة تسجّل تدقيقاً وتستدعي `revalidatePath/Tag`.
4. الملفات لا تُقرأ في الذاكرة كاملة؛ stream فقط.
5. أي حقل تاريخ يُرجع ISO-8601 UTC؛ العرض بتوقيت المستأجر.
6. التغيير في هذا العقد = تحديث هذه الوثيقة في نفس PR.
