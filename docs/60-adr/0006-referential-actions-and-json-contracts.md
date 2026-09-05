# ADR-0006 — قواعد المفاتيح الأجنبية والإسناد وعقود أعمدة Json

- **الحالة:** مقبول — 2026-09-05
- **السياق:** مع P1-01 أُضيف 18 موديلاً (أكاديمي/محتوى/تواصل/نظام). كل موديل يحمل `tenantId` و FK مركّبة `(tenantId, fk) → (tenantId, id)`. ظهرت ثلاثة أسئلة متكررة: (1) ماذا يحدث عند حذف المُنشئ/المُرسل؟ (2) ماذا يحدث عند حذف أب هيكلي (كلية/مقرر/فصل)؟ (3) كيف نمنع العشوائية في أعمدة `Json`؟
- **القرار:**
  1. **أعمدة الإسناد بلا FK** (`senderId`, `enrolledBy`, `reviewedBy`, `createdBy`, `AuditLog.actorId`): تبقى القيمة بعد الحذف الصلب للفاعل (متطلب احتفاظ PDPL/التدقيق).
  2. **FK مركّبة اختيارية → `NoAction`**: لا يمكن استخدام `SetNull` لأنه سيُصفّر `tenantId` أيضاً؛ و`Restrict` سيمنع سلسلة حذف المستأجر. `NoAction` يمنع الحذف اليتيم مع السماح بـ `Tenant onDelete: Cascade` داخل نفس المعاملة.
  3. **الآباء الهيكليون → `Restrict`**: `College→Department`, `Department→Major`, `AcademicYear→Semester`, `Course→CourseOffering`, `Semester→CourseOffering`. لا حذف لأب يحوي أبناء؛ التطبيق يستخدم `isActive=false` أو الحذف الناعم.
  4. **الأبناء التابعون → `Cascade`**: `Level`, `CourseMajor`, `OfferingInstructor`, `Enrollment`, `FileDownloadLog`, `NotificationRecipient`, `NotificationPreference`, `PasswordResetToken`.
  5. **قيود لا يعبّر عنها Prisma تُكتب SQL يدوياً في نفس الـmigration**: فهرس فريد جزئي «سنة/فصل حالي واحد لكل مستأجر»، وقيود `CHECK` للتواريخ والأعداد.
  6. **كل عمود `Json` له مخطط Zod في `src/lib/contracts/json-columns.ts`** (`schedule`, `targetSpec`, `Job.payload` حسب النوع) ولا يُقرأ أو يُكتب إلا عبره.
  7. **كل موديل جديد يُضاف إلى `tests/integration/p1-schema-isolation.test.ts`** (أو ملف مرحلته): RLS مفعّل ومفروض + سياسة، عزل A/B، رفض FK عبر المستأجرين.
- **البدائل المرفوضة:** `SetNull` (يكسر `tenantId`)، FK على أعمدة الإسناد (يفقد سجل التدقيق عند الحذف)، `Json` حرّ (عشوائية غير قابلة للترحيل).
- **العواقب:** سكربت `gen-rls.ts` يُعاد تشغيله مع كل migration تضيف جداول؛ حذف كلية/مقرر يتطلب تفريغ الأبناء أولاً (سلوك مقصود يظهر برسالة واضحة في الواجهة).
