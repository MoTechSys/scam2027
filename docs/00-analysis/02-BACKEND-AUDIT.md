# 02 — تدقيق الخلفيات الثلاث (Backend Audit)

> يقارن هذا المستند الخلفيات الموجودة في السلالة لاختيار المحرّك الأساسي وتحديد ما يُدمج منها.

## 1. `s-acm/apps/api` — Hono + Drizzle + Supabase

**الجداول (12):** `users, roles, departments, majors, levels, courses, files, notifications, auditLogs, refreshTokens, aiConversations, settings`.

**المسارات:**
- `auth`: login, logout, me, refresh, change-password
- `users`: CRUD + `reset-password`
- `roles`: CRUD + `permissions`
- `courses`: CRUD
- `files`: `upload`, `stats`, `download/:id`, CRUD
- `notifications`: list, `sent`, `read/:id`, `read-all`, send, delete
- `academic`: departments/majors/levels
- `ai`: `chat`, `summarize`, `generate`, `translate`, `conversations`
- `audit`: list
- `reports`: dashboard/users/courses/files/activity
- `settings/:category`
- `trash`: list, `restore/:id`, `permanent/:id`, `empty`

**Middleware:** `auth` (JWT Bearer)، `permissions` (فحص صلاحية نصية)، `errorHandler`.

**التقييم:**
| الجانب | الحكم |
|---|---|
| تغطية الواجهة | ✅ يغطي 16/19 صفحة |
| الصلاحيات | ⚠️ نصوص حرّة بلا مصدر وحيد للحقيقة |
| Soft delete / Trash | ✅ منطق جيد يُنقل |
| الاختبارات | ❌ لا شيء |
| تعدد المستأجرين | ❌ |
| Quizzes / Grades / Enrollments | ❌ |
| الأمان | ⚠️ Refresh tokens في جدول (جيد) لكن JWT في localStorage على العميل |

## 2. `scamV9` — Django 6 + HTMX + Gemini

**الموديلات (27):** `Role, Permission, RolePermission, Major, Level, Semester, VerificationCode, PasswordResetToken, UserActivity, AIConfiguration, APIKey, AISummary, AIGeneratedQuestion, AIChat, AIUsageLog, AIGenerationJob, StudentProgress, SystemSetting, AuditLog, Course, CourseMajor, InstructorCourse, LectureFile, Notification, NotificationRecipient, NotificationPreference`.

**قيمة مضافة يجب دمجها في scam2027:**
- `NotificationRecipient` (إشعار واحد → مستلمون متعددون بحالة قراءة مستقلة) — أفضل من نموذج `Notification` الأحادي.
- `NotificationPreference` (تفضيلات لكل مستخدم/قناة).
- `AIUsageLog` + `AIGenerationJob` (حصص وتتبع تكلفة ووظائف خلفية).
- `APIKey` (مفاتيح لكل مستأجر/مزوّد).
- `StudentProgress` (تتبّع التقدم).
- `VerificationCode` / `PasswordResetToken` كجداول مستقلة بتاريخ انتهاء.
- `InstructorCourse` / `CourseMajor` (علاقات M:N صريحة).
- **57 اختباراً** — تُستخدم كقائمة تحقق لسيناريوهات الاختبار.
- **BUG-001..011** (في `S-ACM_FULL_ANALYSIS.md`) — تُدرج كحالات اختبار انحدار.

## 3. `UniCore-OS-V2` — Next.js 16 + Prisma 5.22 + NextAuth v5

**الموديلات (22):** `User, UserProfile, Permission, Role, RolePermission, UserRole, College, Department, Major, Course, Semester, CourseOffering, Enrollment, Quiz, Question, Option, QuizAttempt, Answer, File, Notification, AuditLog, SystemSetting`.

**الصلاحيات (52 كود منقّط):**
```
ai.chat ai.generate_quiz ai.summarize
college.manage department.manage major.manage
course.create course.delete course.edit course.view
file.delete file.download file.manage_all file.upload file.view
notification.manage notification.send notification.view
offering.assign_instructor offering.create offering.delete offering.edit offering.enroll_students offering.view
quiz.create quiz.delete quiz.edit quiz.grade quiz.publish quiz.take quiz.view
role.assign role.create role.delete role.edit role.view
semester.manage semester.set_current semester.view
system.audit_log system.backup system.reports system.settings system.trash system.trash_restore
user.create user.delete user.edit user.export user.freeze user.import user.view
```

**الميزات (15 وحدة):** `academic, ai, auth, enrollments, notifications, offerings, profile, quizzes, reports, resources, roles, semesters, settings, system, users`.

**المسارات (26):** `/login, /dashboard, /academic, /ai, /courses, /files, /grades, /notifications, /offerings, /offerings/[id], /offerings/[id]/analytics, /profile, /quizzes, /quizzes/[id]/edit, /quizzes/[id]/result, /quizzes/[id]/take, /quizzes/my, /reports, /roles, /semesters, /settings, /trash, /users, /developer, /unauthorized`.

**النمط المعماري:** Server Actions مع `require*`/`assert*` + `failure()` ثابتة الشكل، Zod للتحقق، Prisma singleton، `auth()` من Auth.js، Vitest للوحدة، Playwright للـ E2E.

**التقييم:**
| الجانب | الحكم |
|---|---|
| نموذج البيانات | ✅ الأغنى (Offerings/Enrollments/Quizzes) |
| RBAC | ✅ مصدر وحيد للحقيقة (`constants.ts`) |
| الأمان | ✅ كوكيز HttpOnly، تحقق Zod، فحص صلاحية على الخادم |
| الاختبارات | ✅ Vitest + Playwright (تغطية جزئية) |
| الثيم | ❌ ليس أخضر |
| تعدد المستأجرين | ❌ |
| الإشعارات | ⚠️ نموذج أحادي (يُستبدل بنموذج scamV9) |
| AI | ⚠️ بلا سجل استخدام/حصص |
| Trash | ⚠️ عبر `deletedAt` دون واجهة موحّدة بقدر s-acm |
| ملف `/logs` | ❌ مفقود من Git (HANDOFF §10) |

## 4. القرار

**المحرّك الأساسي = UniCore-OS-V2** (Next.js 16 + Prisma + Postgres)، مع:
1. **استبدال الثيم بالكامل** بثيم Omnitrix الأخضر ومكوّنات الموبايل من `s-acm/apps/web`.
2. **إضافة طبقة المستأجر** (`Tenant`) + `tenant_id` على كل جدول + Postgres RLS (انظر `docs/30-architecture/01-MULTI-TENANCY.md`).
3. **دمج موديلات scamV9** (`NotificationRecipient`, `NotificationPreference`, `AIUsageLog`, `AIGenerationJob`, `APIKey`, `VerificationCode`, `PasswordResetToken`, `StudentProgress`).
4. **نقل منطق Trash وSettings-by-category** من `s-acm/apps/api`.
5. **توحيد الصلاحيات** في مصفوفة واحدة (انظر `docs/20-product/02-PERMISSIONS-MATRIX.md`).
6. **ترقية الإصدارات** إلى أحدث المستقر عند بدء التنفيذ (Prisma 6.x، Auth.js v5 stable إن صدر، Next 16.x أحدث patch) بعد اختبار توافق.

## 5. اكتشافات أمنية

| # | الاكتشاف | المصدر | الإجراء |
|---|---|---|---|
| SEC-01 | كلمة مرور قاعدة بيانات Supabase ومعرّف المشروع مكشوفان في ملف Markdown | `SCAM/HANDOVER.md` | **يجب تدوير كلمة المرور فوراً** في لوحة Supabase؛ لا يُنسخ الملف؛ يُضاف فحص أسرار (gitleaks) في CI لـ scam2027 |
| SEC-02 | JWT في localStorage | `s-acm/apps/web` | كوكيز HttpOnly في scam2027 |
| SEC-03 | الصلاحيات نصوص حرّة بلا enum | `s-acm/apps/api` | enum/const موحّد + اختبار يفشل عند صلاحية غير معرّفة |
| SEC-04 | لا rate-limit على `/auth/login` | كل النسخ | حد معدل بـ Redis/Upstash أو جدول DB |
| SEC-05 | لا فحص نوع MIME حقيقي للملفات المرفوعة (اعتماد على الامتداد) | s-acm/api, V2 | فحص magic bytes + حد حجم + عزل مسار التخزين لكل مستأجر |
