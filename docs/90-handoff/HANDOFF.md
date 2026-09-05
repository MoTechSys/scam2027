# HANDOFF — حالة المشروع وتسليم الجلسة

> يُحدَّث في **كل جلسة عمل**. آخر تحديث: **2026-09-05** (الجلسة 7 — توثيق التسليم).
>
> **للوكيل الجديد:** لا تبدأ من هنا. ابدأ من [`/AGENTS.md`](../../AGENTS.md) (الدليل الكامل) و[`STATUS.json`](STATUS.json) (الحالة الآلية). هذا الملف هو **سجل الجلسات ودروسها** — أقدم الأقسام في الأعلى محفوظة للتاريخ وموسومة بجلستها.

## 0. ملخص الحالة (محدّث — الجلسة 8)

| البند | الحالة |
|---|---|
| المستودع | `MoTechSys/scam2027` (عام) — `main` = `93a3a5d` قبل PR #8 |
| الفرع الرئيسي | `main` |
| فرع العمل | `genspark_ai_developer` → PR → `main` (squash-merge مباشر مصرّح به من المالك) → مزامنة الفرع |
| التقدّم | **20 / 65 مهمة (31%)** — P0 16/16 ☑ · P1 4/15 (P1-01..P1-04) · P2–P5 لم تبدأ |
| المهمة التالية | **P1-05** المقررات/الشُعب/التسجيل (المخرجات مفصّلة في `STATUS.json` → `progress.nextTask` و`AGENTS.md` §5) |
| بوابة الجودة | `pnpm check` ✅ (tsc 0 · eslint 0 · vitest 101/101 · build) · Playwright 50 ✅ / 2 fixme (desktop + mobile) |
| قاعدة البيانات | آخر هجرة `20260905015700_rls_p1_01` — 30 جدولاً محمياً بـRLS + 4 جداول منصة؛ **قاعدتان** (`scam2027`, `scam2027_test`) يجب هجرتهما معاً |
| بيئة التطوير | `/home/user/webapp` (sandbox)؛ المراجع التراثية في `.refs/` (غير ملتزمة، تُستنسخ بالحلقة في §3) |

## 1. ما تم في الجلسة 1 (تاريخي — 2026-09-04)

1. فحص 58 مستودعاً في `MoTechSys` وتحديد 9 مستودعات ذات صلة، واستنساخها إلى `.refs/`.
2. تدقيق كامل للواجهة الخضراء (`s-acm/apps/web`): 19 صفحة، 9,486 سطر، 60 مكوّناً، tokens، تخطيط، عقد API، اعتماد mock.
3. تدقيق 3 خلفيات (Hono/Drizzle، Django، Next/Prisma) و**اختيار V2 كمحرّك** (ADR-0001).
4. فهرسة كل الوثائق الموروثة (59 FR، 51 صلاحية، 10 تدفقات، 11 BUG، ISSUES).
5. بحوث: LMS benchmark، تعدد المستأجرين/RLS، OWASP ASVS 5.0، PDPL/NCA ECC/SDAIA AI، LTI/QTI/WCAG/OneRoster، الستاك.
6. **تحليل الفجوات: 27 فجوة** (GAP-01..27) + 5 فجوات عملية + اكتشاف أمني (SEC-01).
7. كتابة: المتطلبات الموحّدة (~150 FR/NFR بمعرّفات)، مصفوفة 98 صلاحية، حالات الاستخدام، المعمارية، تعدد المستأجرين، نموذج البيانات (68 موديلاً)، Auth/RBAC، عقد API، نظام التصميم، خارطة الطريق (6 مراحل، ~75 مهمة)، DoD، استراتيجية الاختبار، سياسة التوثيق، 5 ADRs.

## 2. ⚠️ إجراءات مطلوبة من المالك (كلها ما زالت مفتوحة — مرآة `STATUS.json` → `ownerActions`)

| # | الإجراء | السبب |
|---|---|---|
| 1 | **تدوير كلمة مرور قاعدة Supabase** للمشروع القديم (`hmqmtxgyuarccyrioics`) | مكشوفة في `MoTechSys/SCAM/HANDOVER.md` (SEC-01). يُفضَّل أيضاً حذف الملف من تاريخ Git أو أرشفة المستودع كخاص. |
| 2 | **نقل `.github/ci.yml.template` إلى `.github/workflows/ci.yml`** | رمز الوكيل لا يملك نطاق `workflows`؛ بدونه لا تعمل بوابة CI على GitHub |
| 3 | تحديد النطاق الرئيسي المستقبلي (مثال `scam.app`) | لتصميم النطاقات الفرعية للمستأجرين (يمكن تأجيله؛ التطوير على `localhost` بمستأجر `demo`) |
| 4 | تحديد مزوّد AI المفضّل ومفتاح تطوير (OpenAI-compatible أو Gemini) | لـ P2-05 |
| 5 | بيانات SMTP للمنصة | لـ P1-12 (تفعيل/استعادة بالبريد) |
| 6 | تحديد الرخصة النهائية | README يقول «تُحدَّد من المالك» |

## 1b. الجلسة 2 — تنفيذ P0 (جزئي)
**منجز (☑):** P0-01, 02, 03, 06, 07, 08, 10, 11. **جزئي (◐):** P0-09 (Auth.js + Argon2id + Session + قفل جاهزة؛ **ناقص** `src/proxy.ts` و`app/api/auth/[...nextauth]/route.ts`).
**غير مبدوء:** P0-04 (Layout), P0-05 (next-intl — `next.config.ts` يشير إلى `src/i18n/request.ts` غير الموجود ⇒ `pnpm build` يفشل حاليًا), P0-12 (الصفحات), P0-13 (`/api/health`), P0-14 (Playwright), P0-15 (CI), P0-16 (PR template/CODEOWNERS).
**حالة الجودة:** `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` ✅ (6/6 عزل مستأجرين) · `pnpm build` ❌ (بسبب i18n المفقود ولا توجد صفحات بعد).
**سكربتات مهمة:** `python3 app/scripts/port-ui.py` (إعادة نقل المكوّنات — idempotent)، `python3 app/scripts/gen-permissions.py`، `pnpm tsx scripts/gen-rls.ts > prisma/migrations/<ts>_rls/migration.sql` (أعِد تشغيله عند إضافة جداول بـ `tenantId`).

## 3. كيف تبدأ بيئة جديدة (Bootstrap)

> النسخة المرجعية المحدّثة (10 أوامر متحقّق منها بما فيها هجرة قاعدة الاختبار) في `AGENTS.md` §2. ما يلي محفوظ للتاريخ.

```bash
cd /home/user/webapp
git clone https://github.com/MoTechSys/scam2027.git .   # أو fetch إن كان موجوداً
# مراجع التحليل (اختياري، غير ملتزمة):
mkdir -p .refs && cd .refs
for r in S-ACM-Project s-acm-frontend s-acm-master s-acm s-acm-backend SCAM scamV9 UniCore-OS UniCore-OS-V2; do
  git clone --depth 1 https://github.com/MoTechSys/$r.git; done
```
عند بدء P0-01 سيُضاف قسم "تشغيل التطبيق" هنا (`pnpm install`, `docker compose up -d db`, `pnpm prisma migrate dev`, `pnpm seed`, `pnpm dev`).

### 3b. أوامر الجلسة 2
```bash
sudo service postgresql start
cd app && cp .env.example .env   # ثم ولّد AUTH_SECRET و APP_ENCRYPTION_KEY
pnpm install
pnpm prisma migrate deploy            # يستخدم DIRECT_DATABASE_URL
pnpm tsx prisma/seed.ts
pnpm test && pnpm lint && pnpm typecheck
```

## 4. بيانات الدخول التجريبية (بعد P0-11)

انظر `docs/50-quality/01-TESTING-STRATEGY.md` §4 (مستأجر `demo`؛ كلمات مرور تطوير فقط).

| الدور | البريد | الرقم الأكاديمي | كلمة المرور |
|---|---|---|---|
| مدير المستأجر | admin@demo.edu | EMP-0001 | Admin@123456 |
| مدير أكاديمي | academic@demo.edu | EMP-0002 | Academic@123456 |
| مدرّس | dr.ahmad@demo.edu | EMP-0101 | Doctor@123456 |
| طالب | student1@demo.edu | 443100001 | Student@123456 |
| مدير المنصة | super@scam.local | — | Super@123456 |

## 5. المشاكل المعروفة (محدّث — الجلسة 7)

- اختبار logout في Playwright معلَّم `fixme` (قائمة Radix + form action) — 2 متخطّى (desktop + mobile).
- `prettier --check` يرصد 10 ملفات قديمة غير منسّقة؛ ليس جزءاً من `pnpm check`. نسّق ما تلمسه فقط أو افتح PR `style:` مستقلاً.
- CI في `.github/ci.yml.template` وليس مفعّلاً (إجراء مالك #2).
- `01-TESTING-STRATEGY.md` §5 يذكر `e2e:mobile`/`e2e:crawl`/`test:a11y` غير الموجودة في `package.json` (a11y مغطّى بـ`e2e/a11y.spec.ts`؛ crawl غير مكتوب).
- `prisma/seed.ts` بلا بنية أكاديمية بعد (تُمدَّد في P1-04/P1-05 وفق §4 من استراتيجية الاختبار).
- المراجع في `.refs/` قد تحوي `node_modules` لـ UniCore-OS-V2 (~1.3GB) — يمكن حذفها عند الحاجة للمساحة.
- قد تكون هناك عملية `next` قديمة على المنفذ 3000 في الـ sandbox؛ استخدم `setsid scripts/restart-server.sh` (يقتل ويعيد التشغيل ويطبع `BUILD_ID`).

## 6. الخطوة التالية (محدّث — الجلسة 8)

**P1-05 المقررات والشُعب والتسجيل** ثم P1-06 → P1-15 بالترتيب، ثم P2 → P5. مخرجات P1-05 مفصّلة في `STATUS.json` → `progress.nextTask.deliverables` و`AGENTS.md` §5. كل مهمة = PR مستقل بدورة العمل السباعية (`AGENTS.md` §6) وتحديث ROADMAP + REQUIREMENTS + CHANGELOG + HANDOFF + **STATUS.json** في نفس الالتزام.

## 7. سجل الجلسات

| التاريخ | الجلسة | الناتج | PR |
|---|---|---|---|
| 2026-09-04 | 1 — تحليل وتخطيط | `docs/**`, `README.md`, `CHANGELOG.md`, `.gitignore` | #1 |
| 2026-09-04 | 2–3 — P0 كامل | `app/**` (bootstrap, RLS, Auth, RBAC, shell, tests, CI template) | #2, #3 |
| 2026-09-05 | 4 — P1-02 المستخدمون | `app/src/features/users`, `app/src/app/(dashboard)/users`, e2e users, RBAC guard fix | #4 |
| 2026-09-05 | 5 — P1-03 الأدوار | `app/src/features/roles`, `app/src/app/(dashboard)/roles`, مصفوفة الصلاحيات، e2e roles | #5 |
| 2026-09-05 | 6 — P1-01 المخطط | 18 موديلاً + migrations + RLS + عقود Json + ADR-0006 | #6 |
| 2026-09-05 | 7 — توثيق التسليم | `AGENTS.md`, `STATUS.json`, `CLAUDE.md`, تحديث README/HANDOFF | #7 |
| 2026-09-05 | 8 — P1-04 البنية الأكاديمية | `app/src/features/academic`, `app/src/app/(dashboard)/academic/**`, wizard، seed، e2e academic | #8 |


## الجلسة 3 — إكمال P0 (PR #3)
- أُنجز: P0-04/05/09/12/13/14/15/16 (انظر CHANGELOG «Unreleased»). كل P0 ☑ في خارطة الطريق.
- أوامر التحقق: `cd app && pnpm check` (typecheck·lint·vitest·build) ثم `pnpm e2e` (يشغّل `pnpm start` تلقائيًا أو يعيد استخدام خادم يعمل على 3000).
- ملاحظة porter: بعد أي تحديث لمكوّنات shadcn شغّل `python3 scripts/port-ui.py && pnpm eslint --fix src/components/ui` — يضيف `"use client"` فقط عند الحاجة.
- معروف/متبقٍ: اختبار logout في Playwright معلَّم `fixme` (قائمة Radix + form action) — يُعاد تفعيله بقيادة لوحة المفاتيح؛ CI لم يُنفَّذ بعد على GitHub (أول تشغيل مع هذا الـPR)؛ التالي: P1 حسب `docs/40-plan/01-ROADMAP.md`.
- حسابات demo: admin@demo.edu/Admin@123456 · academic@demo.edu/Academic@123456 · EMP-0101/Doctor@123456 · 443100001/Student@123456.

> **CI:** الملف `.github/ci.yml.template` يجب نقله يدويًا إلى `.github/workflows/ci.yml` (توكن GitHub App لا يملك صلاحية `workflows`).

## الجلسة 4 — P1-02 المستخدمون (PR #4)
- أُنجز: وحدة المستخدمين كاملة (`src/features/users/*`, `src/app/(dashboard)/users/**`) — انظر CHANGELOG «Unreleased». P1-02 ☑؛ 17 متطلبًا FR ☑ في `01-REQUIREMENTS.md`.
- **درس مهم (RBAC):** الأدوار الإدارية لا تحمل الصلاحيات الذاتية (`quiz.take`, `assignment.submit`, `grade.view_own`) عمدًا، لذا أي فحص «هل صلاحيات الهدف ⊆ صلاحياتي؟» يجب أن يمرّ عبر `canManagePermissionSet` من `permissions.ts` (يتجاهلها) — وليس مقارنة مباشرة. استخدمه في P1-03 (الأدوار) أيضًا.
- **درس Prisma:** الجداول ذات المفتاح المركّب `(tenantId, …)` لا تُنشأ عبر العلاقة المتداخلة (`roles: { create }`) — استخدم `createMany` منفصلًا داخل نفس `tx`.
- **لماذا القائمة الجانبية قصيرة؟** `src/lib/nav/items.ts` يخفي العناصر ذات `phase` (صفحاتها لم تُبنَ) إضافة إلى فلترة الصلاحيات. عند إكمال كل وحدة: احذف `phase` من عنصرها، وحدّث اختبار `login-helpers.test.ts` (يتحقق من العناصر المرئية).
- تشغيل محلي: `pnpm build && scripts/restart-server.sh` (يقتل أي عملية تحتجز :3000 — خادم `next-server` قديم قد يبقى بعد قتل الأب ويقدّم chunks قديمة → 500/MIME). ثم `pnpm exec playwright test` (34 ✓ + 2 fixme؛ `global-teardown` ينظّف مستخدمي `e2e-*@demo.edu`).
- أداة Bash في الـsandbox تفشل أحيانًا (exit −1) مع الأوامر الطويلة: وجّه المخرجات إلى `/tmp/*.txt` ثم اقرأها، وشغّل الخوادم بـ `setsid`/خلفية.
- التالي: P1-03 الأدوار (CRUD + مصفوفة صلاحيات مجمّعة + منع رفع الامتياز + حذف/نسخ دور)، ثم P1-01 المخطط الأكاديمي + RLS، P1-04، P1-09، P1-10، P1-14.

## الجلسة 5 — P1-03 الأدوار والصلاحيات (PR #5)
- أُنجز: وحدة الأدوار كاملة (`src/features/roles/*`, `src/app/(dashboard)/roles/**`) — انظر CHANGELOG «Unreleased». P1-03 ☑؛ FR-ROL-001..006 ☑. القائمة الجانبية تُظهر «الأدوار» لحاملي `role.view`.
- **السيناريو المطلوب من المالك يعمل الآن:** المدير ينشئ دورًا → يحدد صلاحياته من المصفوفة (لا يمكنه منح ما لا يملك) → يعيّن المستخدمين عليه من `/users` → لا يظهر لهؤلاء في القائمة والصفحات إلا ما يغطيه الدور (تُحسب الصلاحيات في كل طلب داخل `loadCtx`، بلا حاجة لتسجيل خروج).
- **درس Prisma/اختبارات:** `Permission` جدول عام (غير مستأجري) ومرجع FK لـ`RolePermission.permissionCode`؛ قاعدة اختبارات التكامل غير مبذورة → `platformPrisma.permission.upsert` قبل إنشاء صفوف الصلاحيات.
- **درس React 19/ESLint:** قاعدة `react-hooks/set-state-in-effect` تمنع مزامنة الحالة في `useEffect`؛ استُخدم نمط الحالة المشتقّة (`edited {key,value}` مفتاحها الرموز الأولية) في `permissions-editor.tsx`.
- **درس next-intl:** النقاط في المفاتيح تُعشّش → رموز الصلاحيات تُخزَّن بـ`_` (`codes.user_view`)، مع `t.has()` للرجوع إلى التسمية الافتراضية.
- **درس Playwright:** المصفوفة تفتح أول 3 فئات فقط → استخدم `openCategory()` (يعتمد `data-category` على `AccordionItem`) قبل النقر على صلاحية؛ وعلى الجوال طابق العناصر المرئية فقط (`.locator("visible=true")`) لأن جدول سطح المكتب موجود مخفيًا في DOM.
- الحالة: tsc/lint/build ✓، vitest 60/60، e2e 39 ✓ + 2 fixme (سطح المكتب + الجوال).
- التالي: P1-01 المخطط الأكاديمي (AcademicYear…PasswordResetToken) + `pnpm tsx scripts/gen-rls.ts`، ثم P1-04 الأكاديمي، P1-09 التدقيق، P1-10 الإعدادات، P1-14 الملف الشخصي، ثم بقية P1 → P2…P5.

## الجلسة 6 — P1-01 مخطط البيانات (PR #6)
- أُنجز: 18 موديلاً (انظر CHANGELOG) + migration بقيود SQL يدوية + RLS مولَّدة لـ30 جدولاً + عقود Json + ADR-0006. P1-01 ☑.
- **إجراء إلزامي بعد كل migration:** `pnpm exec prisma migrate dev` على `.env` ثم `DIRECT_DATABASE_URL=<من .env.test> pnpm exec prisma migrate deploy` على قاعدة الاختبار `scam2027_test` — وإلا تفشل اختبارات التكامل بـ«table does not exist».
- **قرار تصميمي:** `Level` تابع للتخصص (كل برنامج سلّمه الخاص) و`CourseMajor.levelId` يحدد مستوى المقرر داخل التخصص؛ `CourseOffering` = شعبة (course × semester × section). `File` يرتبط بمقرر و/أو شعبة (اختياري) ليخدم المكتبة العامة للمقرر والمواد الفصلية معاً.
- التالي: P1-04 البنية الأكاديمية (`/academic/[tab]` كليات/أقسام/تخصصات/مستويات/سنوات/فصول + Wizard أول إعداد) ثم P1-05 المقررات/الشُعب/التسجيل.

## الجلسة 7 — توثيق التسليم الكامل (PR #7)

**الطلب:** وثّق كل شيء بحيث يستطيع وكيل جديد، يُمنح المستودع فقط، أن يفهم المصادر والتاريخ والقرارات والحالة وما تبقّى ويستكمل بنفس المعايير.

**ما تم:**
1. **تدقيق واقعي** قبل الكتابة: ملفات، اختبارات، سكربتات، سجل git، نطاقات رمز GitHub، الوثائق القديمة. النتائج الصريحة: README كان يقول «لم يُكتب كود بعد» (قديم)، لا `STATUS.json`، لا crawl spec، قالب CI غير مفعّل، seed بلا بنية أكاديمية — كلها مُوثَّقة الآن بدل إخفائها.
2. **`AGENTS.md`** (جذر المستودع — نقطة الدخول): §0 ملخص تنفيذي · §1 سلالة 9 مستودعات تراثية + حلقة استنساخ `.refs/` + لماذا لا نُكمل القديم · §2 إقلاع (10 أوامر) · §3 خريطة 28 وثيقة → أي سؤال يجيبه أي ملف · §4 الحالة الفعلية المتحقَّق منها + 9 نقاط تعثّر · §5 خطة ما تبقّى P1-04..P1-15 بمخرجات ملموسة + P2–P5 · §6 دورة العمل الإلزامية السباعية + أوامر GitHub API · §7 المعايير غير القابلة للتفاوض · §8 إجراءات المالك · §9 قائمة تحقق للوكيل الجديد.
3. **`docs/90-handoff/STATUS.json`** حالة آلية (عدّادات لكل مرحلة، `doneTaskIds`، `nextTask` بمخرجاته، بوابة الجودة الأخيرة، الهجرات، الحسابات التجريبية، إجراءات المالك، الجلسات) — مُتحقَّق منه برمجياً أن 16+15+12+12+7+3 = 65 و 19 منجزة.
4. **`CLAUDE.md`** مؤشّر من سطر واحد إلى `AGENTS.md` (وكلاء بعض المنصات يقرؤونه أولاً).
5. تحديث `README.md` (فقرة الحالة، خريطة التوثيق، قسم البدء بأوامر فعلية) و`HANDOFF.md` (الرأس، §0، §2، §5، §6، §7).

**درس:** الوثيقة السردية (`HANDOFF.md`) تتقادم بصمت في رأسها بينما تُضاف الجلسات في ذيلها؛ لذلك صار §0 يُعاد كتابته كل جلسة، و`STATUS.json` هو المرجع الآلي الوحيد للأرقام.

## الجلسة 8 — P1-04 البنية الأكاديمية (PR #8)

- **الميزة:** `features/academic/{schemas,queries,actions}.ts` (23 Server Action) + `/academic/[tab]` (`years|colleges|departments|majors|levels`) + `academic-client` / `years-client` / `catalogue-client` / `dialogs` / `form-fields` / `setup-wizard`.
- **القرارات:** التبويبات مقاطع URL (قابلة للربط)؛ `setCurrentSemester` يعيّن السنة أيضًا ويجعل الحالة `ACTIVE`؛ الحذف يُرفض عند وجود تابعين (الرسالة من الخادم، الحوار يبقى مفتوحًا)؛ التخصص يحذف مستوياته (Cascade) ويُرفض إن كانت له مقررات؛ Wizard يظهر فقط عند `years==0 && colleges==0` ولمن يملك صلاحيات الإدارة الخمس، ويمكن تجاوزه بـ`?manual=1`.
- **إصلاح:** `includeInactive` في استعلام URL (`z.coerce.boolean("false") === true`) → مُعالج صريح.
- **البيانات:** seed موسّع وidempotent (سنة 2026/2027 حالية، الفصل الأول حالي، CCIS → CS/IS → CS-BSC/SE-BSC/IS-BSC → 4 مستويات لكل تخصص). teardown الـe2e يحذف صفوف `E2E*` من الأسفل للأعلى ويعيد الفصل الأول حاليًا.
- **الجودة:** tsc 0 · eslint 0 · vitest 101/101 (17 ملفًا) · build ✓ · Playwright 50 ✓ / 2 fixme (desktop + mobile، 0 تمرير أفقي على 390px).
- **التالي:** P1-05 المقررات/الشُعب/التسجيل.


## الجلسة 9 — P1-05 جزء 1 (PR #9)
**منجز:** `course.manage_all` (+regen 114)، `features/{courses,offerings,enrollment}` كاملة ومختبرة بالـtypecheck، `/courses` + `/courses/[id]` + حوارات المقرر ومحرّر التخصصات، i18n للمجالات الثلاثة، `components/forms/{fields,use-submit,dialog-shell}`، e2e `courses.spec.ts`، teardown يحذف `E2E*` مقررات. البوابة: typecheck ✓ lint ✓ vitest 102/102 ✓ build ✓ Playwright courses 5 ✓ (1 skip مقصود على mobile لحوار Radix Select).
**التالي مباشرة (P1-05 جزء 2):**
1. `src/app/(dashboard)/offerings/{page,offerings-client,offering-dialogs}.tsx` + `offerings/[id]/{page,roster-client,enrollment-dialogs}.tsx` — استخدم `listOfferings/offeringCounts/semesterOptions/instructorOptions/courseOptions`, `getOfferingDetail`, `listEnrollments`, actions الموجودة؛ أضف `searchStudentsAction({offeringId,q})` حول `studentCandidates` في `features/enrollment/actions.ts`.
2. أزل `phase:"P1"` من عنصر `offerings` في `lib/nav/items.ts` وعدّل اختبار `login-helpers.test.ts` (`toContain("offerings")`).
3. `seedCourses(tenantId)` في `prisma/seed.ts` (6 مقررات، 4 شُعب OPEN بالفصل الحالي مع EMP-0101 PRIMARY، 30 طالبًا، تسجيلات) ثم `pnpm db:seed`.
4. اختبارات: unit (transitions/parseIdentifiers/urlBool)، integration (scope instructor/student/tenant-wide، enrolOne سعة/إعادة تفعيل)، e2e offerings (admin→open→enrol→withdraw؛ instructor يرى شعبته فقط).
5. ROADMAP P1-05 ☑، REQUIREMENTS FR-CRS-003/005, FR-OFF-001, FR-ENR-001/002 ☑، STATUS.json (doneTasks 21, nextTask P1-06)، AGENTS §0/§4.1/§5.
