# A2 — نموذج البيانات (Data Model)

> الأساس: 22 موديل V2 ⊕ 8 موديلات من scamV9 ⊕ موديلات المستأجر/PDPL/الواجبات/الحضور/الوظائف. **كل موديل (ما عدا المنصة) يحمل `tenantId`.** التفاصيل الدقيقة (الأنواع، الفهارس) تُكتب في `app/prisma/schema.prisma` وتبقى هذه الوثيقة خريطة مرجعية تُحدَّث مع كل migration.

## 1. المجالات والموديلات (68 موديلاً)

### المنصة (بلا tenantId)
`Tenant`, `TenantBranding`, `Subscription`, `TenantUsage`, `PlatformUser`, `PlatformAuditLog`, `LtiRegistration`*

### الهوية والوصول
`User` (academicId, email, passwordHash, status, mustChangePassword, sessionVersion, locale, deletedAt), `UserProfile`, `Role` (isSystem), `Permission` (code), `RolePermission`, `UserRole`, `Session`, `LoginAttempt`, `VerificationCode` (purpose: ACTIVATE|RESET|MFA), `PasswordResetToken`, `MfaSecret`, `SsoConnection`

### البنية الأكاديمية
`AcademicYear`, `Semester` (isCurrent), `College`, `Department`, `Major`, `Level`, `Course`, `CourseMajor` (M:N), `CourseOffering` (courseId, semesterId, status, capacity), `OfferingInstructor` (M:N), `Enrollment` (status)

### المحتوى
`File` (type, storageKey, mime, size, checksum, classification, status: PENDING|APPROVED|REJECTED, downloads, deletedAt), `FileVersion`*, `FileDownloadLog`

### التقييم
`Quiz`, `Question`, `Option`, `QuestionBankItem`, `QuizAttempt`, `Answer`, `Assignment`, `Submission`, `GradebookColumn`, `Grade`, `GradingScheme`

### الحضور*
`AttendanceSession`, `AttendanceRecord`

### التواصل
`Notification` (senderId, title, body, priority, targetSpec Json), `NotificationRecipient` (userId, readAt, archivedAt), `NotificationPreference` (channel, type, enabled), `PushSubscription`*, `EmailLog`

### الذكاء الاصطناعي
`AIProviderConfig` (provider, model, encryptedKey), `AIConversation`, `AIMessage`, `AISummary` (status DRAFT|APPROVED|REJECTED), `AIGeneratedQuestion` → `QuestionBankItem`, `AIUsageLog` (tokensIn/Out, costMicro), `AIGenerationJob`

### النظام
`AuditLog` (actorId, action, entity, entityId, before Json, after Json, ip, ua, requestId), `SystemSetting` (per tenant via `TenantSetting`), `Job` (type, status, payload, result, attempts), `Backup`/`TenantExport`

### حماية البيانات (PDPL)
`Consent` (purpose, version, grantedAt, revokedAt), `DataSubjectRequest` (type, status, dueAt, resolution), `ProcessingActivity`, `RetentionPolicy`, `BreachIncident` (detectedAt, reportedAt, affectedCount)

### التكاملات*
`SisImport` (file, dryRun, report), `Webhook`, `WebhookDelivery`, `LtiRegistration`, `LtiDeployment`, `LtiLineItem`

`*` = مرحلة P4/P5، يُضاف عند بلوغ المرحلة.

### حالة التنفيذ في `schema.prisma`
| المرحلة | الموديلات | Migration |
|---|---|---|
| P0 | Tenant, TenantBranding, Subscription, TenantSetting, PlatformUser, PlatformAuditLog, Permission, User, UserProfile, Role, RolePermission, UserRole, Session, LoginAttempt, VerificationCode, AuditLog | `20260904221859_init_p0` + `_rls_p0` |
| P1-01 | AcademicYear, Semester (term FIRST/SECOND/SUMMER, status), College, Department, Major (degree), Level (per major), Course, CourseMajor (+levelId, isRequired), CourseOffering (section, schedule Json), OfferingInstructor (role), Enrollment (status, source), File (category, classification, status, checksum, storageKey), FileDownloadLog, Notification (type, priority, targetSpec Json), NotificationRecipient, NotificationPreference, Job (type, status, attempts, lock), PasswordResetToken (tokenHash) | `20260905015633_p1_01_*` + `20260905015700_rls_p1_01` (30 جدولاً محمياً) |

## 2. مخطط العلاقات المختصر

```
Tenant 1─n User n─n Role n─n Permission
Tenant 1─n College 1─n Department 1─n Major 1─n Level
Course n─n Major ; Course 1─n CourseOffering n─1 Semester n─1 AcademicYear
CourseOffering n─n User(instructor) ; CourseOffering 1─n Enrollment n─1 User(student)
CourseOffering 1─n File ; File 1─n FileDownloadLog
CourseOffering 1─n Quiz 1─n Question 1─n Option ; Quiz 1─n QuizAttempt 1─n Answer
CourseOffering 1─n Assignment 1─n Submission
CourseOffering 1─n GradebookColumn 1─n Grade n─1 Enrollment
Notification 1─n NotificationRecipient n─1 User
User 1─n AIConversation 1─n AIMessage ; File 1─n AISummary ; AIUsageLog n─1 User
User 1─n Consent ; User 1─n DataSubjectRequest
```

## 3. قواعد عامة

| القاعدة | التطبيق |
|---|---|
| المفاتيح | `uuid` لكل الجداول |
| الحذف | ناعم (`deletedAt`) لـ User, Role, Course, CourseOffering, File, Quiz, Assignment, Notification؛ صلب لبقية الجداول عبر سياسة احتفاظ |
| الطوابع | `createdAt`, `updatedAt` في كل جدول |
| الفهارس | `(tenantId, id)`، `(tenantId, deletedAt)`، `(tenantId, <fk>)`، فريدة مركبة مثل `(tenantId, email)`, `(tenantId, academicId)`, `(tenantId, slug)` |
| FK مركبة | `Enrollment(tenantId, offeringId) → CourseOffering(tenantId, id)` وأمثالها لمنع الربط عبر المستأجرين |
| Json | `targetSpec`, `before/after`, `payload`, `value` — مع Zod schema موثّق |
| الأسرار | `AIProviderConfig.encryptedKey`, `TenantSetting.isSecret=true` مشفّرة AES-256-GCM بمفتاح `APP_ENCRYPTION_KEY` |
| البيانات الشخصية | موثّقة في §4 لتغذية RoPA وتصدير DSAR |
| إجراءات FK | ADR-0006: إسناد بلا FK · اختياري `NoAction` · آباء هيكليون `Restrict` · أبناء `Cascade` |
| قيود SQL يدوية | سنة/فصل حالي واحد لكل مستأجر (فهرس فريد جزئي)، `CHECK` للتواريخ/الأعداد — في migration `p1_01` |
| عقود Json | `src/lib/contracts/json-columns.ts` — `OfferingSchedule[]`, `NotificationTarget`, `Job.payload` حسب النوع |

## 4. تصنيف البيانات الشخصية (لـ PDPL)

| الجدول.الحقل | الفئة | الاحتفاظ الافتراضي |
|---|---|---|
| User.email, phone, name | تعريفية | حتى انتهاء العلاقة + 1 سنة |
| User.academicId | تعريفية أكاديمية | دائم (سجل أكاديمي) بعد إخفاء الهوية |
| UserProfile.avatar, bio | شخصية | حتى الحذف |
| Grade, QuizAttempt, Submission | سجل أكاديمي | 10 سنوات (أو حسب لائحة الجامعة) |
| AuditLog | أمنية | 12–24 شهراً |
| LoginAttempt (ip, ua) | تقنية | 90 يوماً |
| AIConversation/AIMessage | محتوى مستخدم | حتى الحذف من المستخدم أو 12 شهراً |
| EmailLog | تقنية | 90 يوماً |
| FileDownloadLog | تقنية | 12 شهراً |

## 5. الترحيل من V2

سكربت `scripts/migrate-from-v2.ts` (اختياري): يقرأ DB V2 → ينشئ مستأجراً → يضيف `tenantId` → يحوّل الصلاحيات حسب `02-PERMISSIONS-MATRIX.md` §4 → `Notification` الأحادي إلى `Notification + NotificationRecipient`.
