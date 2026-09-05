# Changelog

كل التغييرات الملحوظة في هذا المشروع تُوثَّق في هذا الملف.

الصيغة مبنية على [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)،
والمشروع يلتزم بـ [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

أنواع التغييرات: `Added` · `Changed` · `Deprecated` · `Removed` · `Fixed` · `Security` · `Docs`.

---

## [Unreleased]

### Added — P1-07 الإشعارات (PR #14)
- **وحدة `features/notifications`**: `sendNotificationSchema` (رابط داخلي فقط `^/`، أنواع قابلة للإرسال بدون SYSTEM/SECURITY)، `allowedTargetKinds`/`assertCanTarget` (الكل/كلية/قسم/تخصص/مستوى ← `send_to_all`، دور ← `send_to_role`، شعبة ← `send_to_offering` + يدرّسها، أفراد ← ضمن شُعبه)، `recipientsWhere` لكل نوع هدف (نشطون فقط، المرسل مستثنى، الوحدات الأكاديمية عبر التسجيل النشط)، `fanOut` idempotent (createMany skipDuplicates بدفعات 1000) يحترم تفضيل IN_APP إلا لـ SYSTEM/SECURITY، `processFanoutJob` لجمهور > 500 عبر `Job notification.fanout` (قفل PENDING→RUNNING، إعادة محاولة حتى maxAttempts) يُطلق فورًا بـ `after()`.
- **إجراءات**: send (rate-limit 20/10 دقائق + تدقيق) / preview / search recipients / read / unread / archive / unarchive / readAll / delete (المالك أو `notification.manage`) / preferences (upsert).
- **`/notifications`**: تبويبات الكل/غير المقروء/الأرشيف/المُرسَلة/التفضيلات مع عدّادات، بحث ومرشّح نوع، توسيع العنصر = مقروء، جدول المُرسَلة مع شريط نسبة القراءة، تفضيلات in-app لكل نوع، حوار إرسال (رقائق نوع الهدف + قائمة اختيار متعدد / بحث أفراد + معاينة عدد المستلمين).
- **جرس Header** `NotificationBell` بعدّاد أولي من RSC + `GET /api/notifications/unread-count` (كل 60 ث وعند التنقّل/الظهور)؛ عنصر التنقّل فعّال؛ نطاق i18n `notifications` ar/en.
- **Seed**: 3 إشعارات نموذجية (53 صف مستلم)؛ تنظيف e2e لعناوين `E2E*`.
- **اختبارات**: unit 18 + integration 12 + e2e 4 (مدير→الكل، طالب inbox/تفضيلات، مدرّس→شعبة؛ الجوال بدون تمرير أفقي).

### Added — P1-06 الملفات (PR #13)
- **طبقة تخزين** `src/lib/storage/`: واجهة `StorageAdapter` بمحرّكين `LocalStorage` (مسار آمن، `wx`, 0600، حارس traversal) و`S3Storage` (lib-storage Upload، MinIO/R2 عبر `S3_ENDPOINT`)، عدّاد بايتات + SHA-256 يوقف الرفع عند تجاوز الحد (`StorageLimitError`)، متغيرات `STORAGE_DRIVER/STORAGE_LOCAL_ROOT/MAX_UPLOAD_BYTES/S3_*`.
- **رفع stream** `POST /api/files/upload`: busboy → معاينة أول 4 KB → فحص magic bytes (`file-type`) مقابل قائمة سماح بالامتدادات (pdf/docx/pptx/xlsx/صور/mp4/zip/txt/csv/md) → حد حجم = min(`MAX_UPLOAD_BYTES`، سعة الاشتراك المتبقية) → مفتاح `tenant/course/uuid.ext` لا يحمل الاسم الأصلي → صف + تدقيق في معاملة واحدة؛ تنظيف الكائن عند أي فشل؛ 401/403/413/429 JSON.
- **تنزيل موقّع** `GET /api/files/[id]/download?exp&uid&sig`: HMAC-SHA256 مرتبط بالملف والمستخدم و5 دقائق، إعادة فحص الجلسة والنطاق، `attachment` + `nosniff` + `no-store`، سجل `FileDownloadLog` + عدّاد التنزيلات.
- **`/files`**: تبويبات الكل/ملفاتي/سلة المحذوفات بعدّادات، بحث، مرشّحات فئة/تصنيف/مقرر، مفتاح «ملفاتي فقط» للمدير، شريط سعة التخزين، جدول سطح مكتب + قائمة جوال، إجراءات تنزيل/تعديل/حذف ناعم/استرجاع/حذف نهائي (مدير)، حوار رفع متعدد بسحب/إفلات وتقدّم لكل ملف (XHR) ورفض مبكر للأنواع غير المسموحة، حوار تعديل البيانات وربط مقرر/شعبة.
- **النطاق** (`fileScopeWhere`): `file.manage_all` كل شيء؛ وإلا ملفاتي + ملفات شُعبي (مدرّس/طالب) + ملفات المقرر غير المرتبطة بشعبة؛ التعديل/الحذف للمالك أو المدير.
- عنصر تنقّل «الملفات» (`file.view`)، نطاق i18n `files` ar/en، seed ملفَّين على CS101 (PDF صالح + Markdown)، تنظيف e2e لملفات `E2E*`.
- اختبارات: `files-storage.test.ts` (11 — تحقق/توقيع/تخزين محلي)، `login-helpers` (+1)، `e2e/files.spec.ts` (مدير رفع→تنزيل→تعديل→حذف→استرجاع، مدرّس، طالب قراءة فقط، جوال بلا تمرير أفقي).

### Fixed — PR #12
- **إعادة التوجيه بعد الدخول إلى `localhost:3000`:** على الرابط العام كان المتصفح يُحوَّل بعد الدخول إلى `http://localhost:3000/dashboard` (`ERR_CONNECTION_REFUSED`). سببان: (1) `AUTH_URL="http://localhost:3000"` في `.env` يجعل Auth.js يثبّت كل إعادة توجيه على أصل واحد؛ (2) نفق المعاينة لا يرسل `x-forwarded-host`/`x-forwarded-proto` (يرسل `x-client-proto` فقط) وNext يبني `request.url` لمعالِجات المسار من `hostname:port` الخاص بالخادم لا من `Host`. **الإصلاح:** أُلغي `AUTH_URL` نهائيًا (`.env.example`/`.env.test` توثّق ذلك)، ووحدة نقية جديدة `src/lib/auth/forwarded.ts` (`normalizeForwardedHeaders`, `forwardedOrigin`, `rebaseUrlToForwardedOrigin`) يستدعيها الـproxy لتطبيع الترويسات، ومعالِج `/api/auth/[...nextauth]` يعيد بناء `request.url` على أصل الطلب الفعلي. النتيجة: كل إعادات التوجيه (دخول، `next=`، خطأ، خروج، بوابة الجلسة) تبقى على نفس المضيف الذي استخدمه المتصفح — نطاق مستأجر فرعي أو رابط معاينة. 10 اختبارات وحدة (`forwarded.test.ts`) + تحقّق بمتصفح حقيقي على الرابط العام (مدير/مدرّس/طالب، خطأ كلمة المرور، تسجيل خروج).

### Fixed — PR #11
- **حلّ المستأجر على روابط المعاينة/الـsandbox:** كان الرجوع إلى `DEFAULT_TENANT_SLUG` مقيّدًا بـ`NODE_ENV !== "production"`، لكن `next start` يفرض `production` دائمًا، فظهرت صفحة «الجامعة غير موجودة» على عنوان المعاينة العام. أصبح الرجوع اعتمادًا صريحًا على وجود المتغيّر (يبقى فارغًا في الإنتاج، ويُسجَّل تحذير `tenant.fallback_default_slug_in_production` إن استُخدم هناك). اختبار وحدة لمضيف `3000-xxx.sandbox…`.
- أيقونة التطبيق `src/app/icon.svg` (Omnitrix) كبديل افتراضي عند غياب شعار المستأجر؛ استثناء `icon.svg`/`apple-icon.png` من مطابق الـproxy حتى لا يُعاد توجيهها إلى `/login` — لا مزيد من 404 في الكونسول.

### Added — P1-05 (part 2, PR #10)
- الشُعب: `/offerings` (تبويبات الحالة، بحث بالمقرر/الشعبة/المدرّس، فلتر الفصل، مفتاح «شُعبي فقط» لأصحاب `course.manage_all`، سطح مكتب + جوال) و`/offerings/[id]` (بيانات الشعبة، الجدول، المدرّسون، عدّادات التسجيل، **قائمة الطلاب**).
- حوارات الشعبة: إنشاء/تعديل مع محرّر الجدول الأسبوعي (`offeringScheduleSchema`) ومحرّر المدرّسين (أساسي/مشارك/مساعد)، تعيين المدرّسين، تغيير الحالة وفق `OFFERING_TRANSITIONS` (مسودة→مفتوحة→مغلقة→مؤرشفة)، حذف محمي بالتسجيلات النشطة. السعة الفارغة = غير محدودة.
- التسجيل: تسجيل فردي ببحث حيّ عن الطالب (`searchStudentsAction`، يستثني المسجَّلين نشطًا)، **تسجيل جماعي** بمعرّفات (رقم أكاديمي/بريد، حتى 500) مع نتيجة لكل سطر (سُجِّل/أُعيد/مسجّل مسبقًا/غير موجود/ليس طالبًا/الشعبة ممتلئة)، انسحاب/إعادة تسجيل/إكمال من الصفوف.
- نطاق الرؤية (FR-ENR-002) مطبَّق في الواجهة: المدرّس يرى «شُعبي» وقائمة طلابه فقط ولا يُنشئ شُعبًا؛ الطالب يرى شُعبه بلا أدوات قائمة الطلاب.
- Seed: 6 مقررات (CS101, CS102, CS201, SE201, IS101, MATH101) بربط تخصص↔مستوى، 4 شُعب مفتوحة في الفصل الحالي بمدرّس EMP-0101، 30 طالبًا (`student1..30@demo.edu` / `4431000NN`) و68 تسجيلًا.
- عنصر التنقل `offerings` مُفعّل (بصلاحية `offering.view`).
- اختبارات: 6 وحدة (`courses-schemas`) + 6 تكامل (`courses-queries`: نطاق المستأجر/المدرّس/الطالب، `mine`، بحث، `enrolOne` سعة/إعادة تفعيل، `resolveIdentifiers`/`studentCandidates`) + e2e `offerings.spec.ts` (مدير: مقرر→شعبة→فتح→تسجيل→انسحاب، تسجيل جماعي؛ مدرّس/طالب نطاق خاص؛ جوال بلا تمرير أفقي).

### Changed — P1-05 (part 2, PR #10)
- استُخرجت مسندات الصلاحيات النقية (`hasPermission`, `hasAllPermissions`, `assertPermission`, `assertAllPermissions`, `hasRole`) إلى `src/lib/auth/has-permission.ts` بلا اعتماد على next-auth؛ `rbac.ts` يعيد تصديرها، و`features/offerings/scope.ts` يستوردها مباشرة حتى تبقى الاستعلامات قابلة للتحميل في vitest.

### Added — P1-05 (part 1, PR #9)
- المقررات: `/courses` (تبويبات، بحث، فلترة قسم/تخصص، ترقيم خادمي، سطح مكتب + جوال) و`/courses/[id]` (بيانات، تخصصات/مستويات، الشُعب).
- حوارات إنشاء/تعديل المقرر مع محرّر ربط التخصصات↔المستويات (إلزامي/اختياري)، حذف/استرجاع ناعم.
- طبقة الميزات كاملة للشُعب والتسجيل (`features/offerings`, `features/enrollment`: schemas/scope/queries/actions/core) بانتظار واجهاتها في الجزء 2.
- صلاحية `course.manage_all` (114 رمز مستأجر) — نطاق كامل؛ بدونها المدرس يرى شُعبه والطالب تسجيلاته فقط (FR-ENR-002).
- e2e `courses.spec.ts` + تنظيف `E2E*` (مقررات/شُعب/تسجيلات) في `global-teardown`.

### Changed
- نُقلت حقول النماذج المشتركة إلى `@/components/forms/fields` مع `use-submit.ts` و`dialog-shell.tsx`؛ نوع `Option` في `@/lib/contracts/option`.
- عنصر التنقل `offerings` مضاف (مخفي بـ `phase:"P1"` حتى تصل صفحة `/offerings` — فُعِّل في PR #10).


### Added
- **P1-04 البنية الأكاديمية (PR #8):** `/academic/[tab]` بخمسة تبويبات (سنوات وفصول · كليات · أقسام · تخصصات · مستويات) — بطاقات سنوات مع فصول متداخلة وبطاقة «الفترة الحالية»، جداول سطح المكتب + قوائم جوال، بحث وفلتر بالأب، حوارات إنشاء/تعديل لكل كيان، توليد مستويات 1..N، حذف محمي بالتبعيات (Restrict) وتعيين «الحالي» لسنة/فصل بعملية واحدة متماسكة (GAP-05). **Wizard الإعداد الأول** (4 خطوات، عملية ذرية واحدة) لمستأجر بلا بنية. 23 Server Action بـ`safeAction` + `assertPermission` + `audit`. Seed: سنة 2026/2027 + فصلان، كلية CCIS، قسمان، 3 تخصصات، 12 مستوى. عنصر التنقل `academic` مُفعّل. اختبارات: 18 وحدة (schemas) + 13 تكامل (queries/RLS/فهارس جزئية/CHECK) + e2e `academic.spec.ts` (5 سيناريوهات × سطح مكتب/جوال) مع تنظيف تلقائي لصفوف `E2E*`.

### Fixed
- `catalogueListQuerySchema.includeInactive`: كان `z.coerce.boolean()` يحوّل `"false"` إلى `true`؛ استُبدل بمُعالج URL-safe.

### Docs
- **توثيق التسليم الكامل (PR #7):** `AGENTS.md` في الجذر كنقطة دخول وحيدة للوكلاء (سلالة 9 مستودعات تراثية وأين قرأنا، إقلاع 10 أوامر، خريطة الوثائق، الحالة الفعلية المتحقَّق منها ونقاط التعثّر، خطة ما تبقّى P1-04..P5 بمخرجات ملموسة، دورة العمل الإلزامية، المعايير غير القابلة للتفاوض، إجراءات المالك، قائمة تحقق)؛ `docs/90-handoff/STATUS.json` حالة آلية (19/65، عدّادات المراحل، `nextTask`، بوابة الجودة، الهجرات، الحسابات التجريبية)؛ `CLAUDE.md` مؤشّر.
- تحديث `README.md` (الحالة الحقيقية بدل «لم يُكتب كود بعد»، خريطة التوثيق، أوامر البدء الفعلية مع هجرة قاعدة الاختبار)، و`HANDOFF.md` (الرأس، §0، §2 إجراءات المالك 6، §5 المشاكل المعروفة، §6 الخطوة التالية، الجلسة 7)، و`02-DOCUMENTATION-POLICY.md` (AGENTS.md وSTATUS.json وثائق إلزامية + قاعدة CI: عدد ☑ = `doneTasks`).

### Added
- **P1-01 مخطط البيانات** (`prisma/schema.prisma`): 18 موديلاً جديداً — البنية الأكاديمية (AcademicYear, Semester, College, Department, Major, Level)، المقررات (Course, CourseMajor, CourseOffering, OfferingInstructor, Enrollment)، المحتوى (File, FileDownloadLog)، التواصل (Notification, NotificationRecipient, NotificationPreference)، النظام (Job, PasswordResetToken) — كلها بـ`tenantId` وFK مركّبة، مع 10 تعدادات (SemesterTerm, OfferingStatus, EnrollmentStatus, FileCategory, DataClassification, NotificationType…).
- Migration `p1_01_academic_content_comms` + قيود SQL يدوية (سنة/فصل حالي واحد لكل مستأجر، `CHECK` للتواريخ/المستويات/الساعات/السعة) + migration `rls_p1_01` مولَّدة (30 جدولاً محمياً بـRLS).
- `src/lib/contracts/json-columns.ts`: عقود Zod لأعمدة Json (`OfferingSchedule`, `NotificationTarget`, `Job.payload` حسب النوع).
- ADR-0006 قواعد إجراءات FK والإسناد وعقود Json؛ تحديث `02-DATA-MODEL.md` بجدول حالة التنفيذ.
- اختبارات: `p1-schema-isolation` (RLS مفعّل/مفروض/سياسة لكل جدول جديد، عزل A/B للسلسلة الأكاديمية كاملة، رفض FK عبر المستأجرين، فهرس «الحالي» الجزئي، CHECK، Restrict) + `json-columns` وحدة.

- **P1-03 الأدوار والصلاحيات** (`/roles`, `/roles/[id]`): تبويبات (الكل/النظام/مخصّصة/المحذوفة) مع عدّادات، بحث، عدد الأعضاء النشطين وعدد الصلاحيات لكل دور، جدول لسطح المكتب + كروت للجوال، صفحة تفاصيل مع مصفوفة صلاحيات (أكورديون 14 فئة، تحديد جماعي ثلاثي الحالة، قفل الصلاحيات غير المملوكة) وشريط حفظ لاصق مع تحذير عند مغادرة الصفحة بتغييرات غير محفوظة، قائمة الأعضاء، إنشاء/تعديل/نسخ/حذف (سلة)/استرجاع.
- 6 Server Actions في `src/features/roles/actions.ts` (`create/update/set_permissions/clone/delete/restore`): أدوار النظام محمية (تُنسخ للتخصيص)، حارس رفع الامتياز عبر `canManagePermissionSet` (لا يمكن منح أو إدارة صلاحيات لا يملكها الفاعل)، رموز `^[A-Z][A-Z0-9_]{2,39}$` غير محجوزة، حذف فقط بلا أعضاء نشطين، تدقيق قبل/بعد مع فرق الصلاحيات المُضافة/المحذوفة.
- `permissionCategories()` في مولّد الصلاحيات (`scripts/gen-permissions.py` → `permissions.ts`) لتجميع المصفوفة؛ نقل مساعدي الامتياز إلى قالب المولّد كي لا تُفقد عند إعادة التوليد.
- `src/components/confirm-dialog.tsx`: حوار تأكيد مشترك (يبقى مفتوحًا عند الفشل) يُستخدم في المستخدمين والأدوار.
- i18n: مجالا `permissions` (فئات/موارد/113 رمزًا) و`roles` كاملان (ar/en).
- اختبارات: وحدة (`roles-schemas`, `permissionCategories`, nav roles)، تكامل (`roles-queries` بمستأجر مستقل)، E2E `roles.spec.ts` (دور نظام للقراءة فقط، إنشاء→تعديل صلاحيات→حذف للسلة، منع الطالب) على سطح المكتب والجوال؛ `global-teardown` ينظّف أدوار `E2E_*`.

### Changed
- القائمة الجانبية: عنصر «الأدوار» ظاهر الآن لحاملي `role.view` (أُزيل `phase`).
- `users/user-dialogs.tsx` يعيد تصدير `ConfirmDialog` المشترك بدل نسخة محلية.

### Added (P1-02 — مُدمج في PR #4)
- **P1-02 المستخدمون** (`/users`, `/users/[id]`): تبويبات الحالة مع عدّادات، بحث (اسم/بريد/رقم أكاديمي/هاتف)، فلتر الأدوار، ترقيم صفحات خادمي، جدول لسطح المكتب + كروت للجوال (390px بدون تمرير أفقي)، قائمة إجراءات لكل صف، صفحة تفاصيل (البيانات/الأمان/النشاط).
- 8 Server Actions في `src/features/users/actions.ts`: إنشاء (رقم أكاديمي تلقائي `YYYY-NNNNN` قابل للضبط عبر `TenantSetting users.academicIdFormat`، كلمة مرور مؤقتة تُعرض مرة واحدة)، تعديل، تغيير الحالة (التجميد/الإيقاف يُبطل الجلسات)، حذف ناعم، استرجاع، تعيين أدوار متعددة، إعادة تعيين كلمة المرور، إنهاء الجلسات — كلها عبر `requireUserOrThrow → assertPermission → assertCanManageUser → tx(RLS) → audit → revalidatePath`.
- `SELF_SCOPE_PERMISSIONS` / `isEscalatingPermission` / `canManagePermissionSet` في `permissions.ts`: حارس رفع الامتياز (FR-ROL-006) يتجاهل الصلاحيات الذاتية (`quiz.take`, `assignment.submit`, `grade.view_own`) لأنها لا تمنح أي نفوذ إداري.
- i18n: مجال `users` كامل (ar/en) + مفاتيح `common.confirm/close/optional/filters/reset`.
- اختبارات: وحدة (`academic-id`, `users-schemas`, `rbac-escalation`)، تكامل (`users-queries` بمستأجر مستقل)، E2E `users.spec.ts` (قائمة/بحث/تفاصيل، إنشاء→تجميد→حذف→سلة المحذوفات، منع الطالب) على سطح المكتب والجوال؛ `e2e/global-teardown.ts` يحذف بيانات الاختبار تلقائيًا.
- `scripts/restart-server.sh`: إعادة تشغيل خادم الإنتاج المحلي بأمان (يقتل ما يحتجز المنفذ).

### Changed
- عنصر «المستخدمون» في التنقّل لم يعد مقيّدًا بـ `phase` — يظهر لكل من يملك `user.view`.

### Fixed
- `assertCanManageUser` كان يمنع `TENANT_ADMIN` من إدارة الطلاب (صلاحيات ذاتية لا يملكها المدير) — أُصلح عبر `canManagePermissionSet`.
- إنشاء `UserRole` عبر العلاقة المتداخلة كان يفشل (`Unknown argument tenantId` — مفتاح مركّب) — أصبح `userRole.createMany` منفصلًا.
- تسميات إغلاق `Dialog`/`Sheet` كانت إنجليزية ثابتة (`sr-only Close`) — أصبحت مترجمة (WCAG 3.1.2).
- `auth.spec.ts`: كان يتحقق من `h1` بينما عنوان صفحة الدخول هو `h2` (الـ`h1` اسم المستأجر)، واصطدام `role=alert` مع مُعلِن مسارات Next.

### Added
- App shell: `DashboardLayout`, `Sidebar` (collapsible, tooltips), `Header` (locale/theme toggles, user menu + logout), `BottomNavigation`, `MobileDrawer` — nav derived from the permission matrix (P0-04).
- Root layout: Cairo font, tenant `--primary`, `dir`/`lang` per locale, skip link, `NextIntlClientProvider` with `now`/`timeZone` (tenant TZ via `x-tenant-tz`), Sonner toaster.
- Pages: `/login` (Server Action + Auth.js error mapping + `?reason=` messages), `/dashboard` (real role-gated stats, my sessions with revoke, recent audit), `/developer`, `/unauthorized`, `/tenant-not-found`, `/tenant-suspended`, `not-found`, `error` (P0-12).
- Session actions: `logoutAction` (revokes DB session + audit), `revokeSessionAction`, `setLocaleAction`.
- `/api/health` (P0-13).
- Tests: 6 unit suites (permissions catalogue ↔ matrix doc, ratelimit, password, safe-action, login helpers, tenant resolver) — 32 passing; Playwright config (desktop-chromium 1280×800 + iPhone 12 390×844) with auth/tenant/a11y (axe WCAG 2.1 AA) specs — 26 passing, logout spec `fixme` (P0-14).
- GitHub Actions CI (postgres:17, migrate, RLS, seed, lint, typecheck, vitest, build, Playwright, gitleaks, audit), PR template, CODEOWNERS (P0-15/16).

### Changed
- `scripts/port-ui.py` adds `"use client"` only when a component actually needs it (14 UI primitives are now RSC-safe); `StatCard` gained `valueClassName`.
- `proxy.ts`: removed disallowed `runtime` config; forwards `x-tenant-tz`.

### Fixed
- Non-existent Tailwind utilities `inset-inline-*`/`inset-block-*` replaced with `inset-x-0`/`inset-y-0`/`start-*`.
- RTL sidebar active indicator drawn on the wrong edge (direction-aware inset box-shadow).
- next-intl `ENVIRONMENT_FALLBACK` error from client `relativeTime`.

### Added
- **P0 — أساس التطبيق (`app/`)**: Next.js 16.3.4 + React 19 + TypeScript strict + pnpm، ESLint (next + jsx-a11y strict + قاعدة تمنع فئات الاتجاه الفيزيائي `ml-/pl-/left-…` + منع `PrismaClient` خارج `lib/db`)، Prettier، رؤوس أمان HTTP.
- **نظام التصميم**: `globals.css` مع رموز Omnitrix الكاملة (`@theme inline`)، ثيم فاتح، خصائص منطقية RTL، `prefers-reduced-motion`.
- **مكوّنات UI (59)**: نقل shadcn/ui من التراث عبر سكربت `scripts/port-ui.py` (radix-ui meta-package، فئات منطقية، `"use client"`), مع `chart`/`resizable`/`carousel` من upstream (recharts 3 / panels 4) و`data-table`/`mobile-data-table`/`mobile-list` مُعاد كتابتها (مُنمَّطة، وصول لوحة المفاتيح، أهداف 44px). خطافات `useIsMobile`, `useMediaQuery`, `useDirection`, `usePersistFn`, `useComposition`.
- **قاعدة البيانات**: Prisma 6 + PostgreSQL 17، 16 نموذجًا (Tenant, TenantBranding, Subscription, TenantSetting, PlatformUser, PlatformAuditLog, Permission, User, UserProfile, Role, RolePermission, UserRole, Session, LoginAttempt, VerificationCode, AuditLog) بمفاتيح خارجية مركّبة `(tenantId, id)`.
- **تعددية المستأجرين**: مولّد RLS `scripts/gen-rls.ts` (ENABLE/FORCE + سياسة `tenant_isolation` عبر `current_setting('app.current_tenant_id')`)، دور `app_user` بلا BYPASSRLS، `db(tenantId)` عبر `$extends` + `set_config` داخل معاملة واحدة، و6 اختبارات عزل تكاملية (fail-closed).
- **المصادقة/RBAC**: Auth.js v5 Credentials + Argon2id + صف `Session` قابل للإبطال + قفل 5 محاولات/15 دقيقة + `LoginAttempt` + تدقيق؛ `permissions.ts` مولّد من مصفوفة الوثائق (113 رمزًا + 8 منصة) عبر `scripts/gen-permissions.py`؛ `rbac.ts` (`requireUser`, `assertPermission`, …)؛ `env.ts`, `logger`, `result.ts`, `audit.ts`, `ratelimit.ts`, `safe-action.ts`؛ حلّ المستأجر من المضيف.
- **Seed**: مستأجر `demo` + 4 أدوار نظامية (110/70/51/20 صلاحية) + 4 مستخدمين + مدير منصة.

### Changed
- مصفوفة الصلاحيات: العدد الفعلي **113** صلاحية مستأجر (لا 98) — صُحّح العنوان ليطابق الجداول والملف المولَّد.

### Added (Session 1)
- **تحليل شامل (docs/00-analysis)**: جرد 9 مستودعات قديمة (`00-INVENTORY`)، تدقيق واجهة Omnitrix الخضراء (`01-UI-AUDIT` — 19 صفحة، 65 مكوّن، 11 عيب UI)، تدقيق الخلفيات الثلاث (`02-BACKEND-AUDIT` — Hono API / scamV9 / UniCore-OS-V2)، فهرس وثائق التراث (`03-DOCS-CORPUS` — BUG-001..011)، وتحليل الفجوات (`04-GAP-ANALYSIS` — **GAP-01..27** + PG-01..05).
- **أبحاث (docs/10-research)**: مقارنة Moodle/Canvas/Blackboard، تعددية المستأجرين (Shared schema + RLS)، OWASP ASVS 5.0 L2 (V1–V17 + STRIDE)، امتثال PDPL السعودي + NCA ECC-2:2024 + أخلاقيات الذكاء الاصطناعي (SDAIA)، المعايير (LTI 1.3 / QTI 3.0 / OneRoster 1.2 / WCAG 2.1 AA) والحزمة التقنية المعتمدة.
- **المنتج (docs/20-product)**: المتطلبات الموحّدة FR-*/NFR-* مع حالة التنفيذ وتتبّع GAP→FR، مصفوفة الصلاحيات (98 رمزًا منقّطًا في 15 مجموعة × 5 أدوار) مع جدول تحويل التراث، وحالات الاستخدام UC-*.
- **المعمارية (docs/30-architecture)**: المخطط العام وشجرة المستودع المستهدفة، تصميم تعددية المستأجرين (Prisma `$extends` + RLS + middleware)، نموذج البيانات (68 نموذجًا + تصنيف PII والاحتفاظ)، المصادقة/RBAC (Auth.js + `require*`/`assert*`)، عقد الواجهة (Server Actions + Route Handlers + `Result<T>`), ونظام التصميم (رموز `@theme inline`، RTL، الجوال 390×844).
- **الخطة (docs/40-plan)**: خارطة الطريق P0→P5 (65 مهمة بمعايير قبول وروابط FR).
- **الجودة (docs/50-quality)**: تعريف الإنجاز (DoD)، استراتيجية الاختبار (Vitest + Playwright سطح مكتب 1280×800 وجوال 390×844 + حسابات seed تجريبية)، وسياسة التوثيق (10 قواعد + `check-docs` CI).
- **قرارات معمارية (docs/60-adr)**: ADR-0001..0005 (مصادر المحرّك والواجهة، RLS، الرموز المنقّطة، Server Actions بدل REST، التوثيق ضمن DoD).
- **التسليم (docs/90-handoff)**: `HANDOFF.md` بحالة المشروع، إجراءات المالك المطلوبة، أوامر الإقلاع، وسجل الجلسات.
- ملفات الجذر: `README.md`، `CHANGELOG.md`، `.gitignore` (يتجاهل `.refs/` المرجعية).

### Security
- تسجيل SEC-01: كلمة مرور قاعدة بيانات Supabase مكشوفة في وثيقة تراثية (`SCAM/HANDOVER.md`) — **مطلوب من المالك تدويرها فورًا**. لم يُنسخ السرّ إلى هذا المستودع.

---

[Unreleased]: https://github.com/MoTechSys/scam2027/compare/main...genspark_ai_developer
