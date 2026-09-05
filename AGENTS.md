# AGENTS.md — دليل الوكيل الكامل لمشروع scam2027

> **ابدأ هنا.** هذا الملف هو نقطة الدخول الوحيدة لأي وكيل (AI أو مطوّر) يُكلَّف بمتابعة المشروع. اقرأه كاملًا (10 دقائق) قبل أي أمر. كل ما فيه مُتحقَّق منه فعليًا بتاريخ **2026-09-05** على الالتزام `590df59` (`main`).
>
> تعليمات المالك الدائمة (نصًّا): *«كون ادمج انت وسوي كل شي»* · *«انجز وادمج وتحقق واختبر واكمل المشروع كله عليك بس بدقه»* · *«لا شغل عشوائي … كل شيء يكون مدروس بدقة»* · *«نظام لأي جامعة، متكامل، قابل للتطوير، ومرن»*.

---

## 0. الملخص التنفيذي (60 ثانية)

| البند | القيمة |
|---|---|
| المنتج | **scam2027** — نظام إدارة تعلّم (LMS) جامعي **متعدد المستأجرين** (عدة جامعات على منصة واحدة) بواجهة **Omnitrix الخضراء** RTL، عربي/إنجليزي، جوال أولًا |
| المستودع | `https://github.com/MoTechSys/scam2027` (عام) — `main` محمي بالمنطق التالي: فرع `genspark_ai_developer` → PR → **squash-merge** مصرّح به للوكيل |
| التقدّم | **22 / 65 مهمة (34%)** — P0 كامل (16/16) · P1 6/15 · P2–P5 لم تبدأ. انظر §4 |
| التالي مباشرة | **P1-07 الإشعارات** (نموذج، `/notifications`، جرس، بريد بطابور، مشغّلات) ثم P1-08 — §5 |
| كيف تبدأ | §2 (Bootstrap 10 أوامر) → §6 (دورة العمل الإلزامية لكل مهمة) |
| المرجع الكامل | `docs/` (28 وثيقة) — خريطتها في §3 |

---

## 1. ما هذا المشروع ومن أين جاء

### 1.1 السلالة (Lineage)
المالك (`MoTechSys`) طوّر **9 مستودعات** سابقة متفرقة (2026-01 → 2026-09). حُلِّلت جميعها في الجلسة 1 وقُرِّر توحيدها في `scam2027`:

| المستودع | ما أُخذ منه | القرار |
|---|---|---|
| `s-acm/apps/web` (≡ `s-acm-frontend`, `S-ACM-Project`) | **الواجهة الخضراء المعتمدة**: tokens، 60 مكوّن shadcn + 5 مكوّنات جوال، تخطيط Sidebar/Header/BottomNav | ADR-0001 |
| `UniCore-OS-V2` | **نمط المحرّك**: Server Actions + `require*`/`assert*` + `Result<T>` + Prisma + Auth.js؛ وحدات Quizzes/Grades/Enrollments كمرجع للنقل في P2 | ADR-0001, ADR-0004 |
| `s-acm-master` | الوثائق الرسمية: 51 صلاحية أصلية، 10 تدفقات (FLOWS.md)، UNDERSTANDING.md | دُمجت في `docs/20-product` |
| `scamV9` (Django) | تحليل شامل (`S-ACM_FULL_ANALYSIS.md`)، 27 موديل كمرجع مقارن | مرجع فقط |
| `s-acm-backend`, `SCAM`, `UniCore-OS` | مراجع تاريخية. ⚠️ `SCAM/HANDOVER.md` يحوي **سرًّا مكشوفًا** (كلمة مرور Supabase) — لا يُنسخ أبدًا، يجب تدويره (SEC-01) | — |

**التفاصيل:** `docs/00-analysis/00-INVENTORY.md` (جرد 58 مستودعًا)، `01-UI-AUDIT.md`، `02-BACKEND-AUDIT.md`، `03-DOCS-CORPUS.md`، `04-GAP-ANALYSIS.md` (**27 فجوة** GAP-01..27 يجب أن يغلقها المنتج).

### 1.2 المراجع المحلية (غير ملتزمة)
المستودعات التسعة تُستنسخ إلى `.refs/` (في `.gitignore`). إن لم تكن موجودة في بيئتك:
```bash
mkdir -p .refs && cd .refs
for r in S-ACM-Project s-acm-frontend s-acm-master s-acm s-acm-backend SCAM scamV9 UniCore-OS UniCore-OS-V2; do
  git clone --depth 1 https://github.com/MoTechSys/$r.git; done
```
تحتاجها فقط عند: نقل وحدة من V2 (P2 الاختبارات/الدرجات)، أو مراجعة تصميم صفحة خضراء أصلية (`.refs/s-acm/apps/web/src/pages/*.tsx`)، أو إعادة تشغيل `scripts/port-ui.py`.

### 1.3 لماذا لا نُكمل على أحد المستودعات القديمة؟
لا أحد منها يملك: تعدد المستأجرين، RLS، اختبارات جادّة، CI، امتثال PDPL، أو واجهة خضراء **مع** محرّك حقيقي في نفس الوقت. `scam2027` يجمع الأفضل من كل واحد **بلا mock**.

---

## 2. Bootstrap — تشغيل بيئة جديدة من الصفر

المتطلبات: Node 22+، pnpm 10، PostgreSQL 17 (محلي أو Docker)، Python 3 (للمولّدات).

```bash
# 1) الكود
git clone https://github.com/MoTechSys/scam2027.git /home/user/webapp && cd /home/user/webapp
git checkout genspark_ai_developer || git checkout -b genspark_ai_developer origin/main

# 2) قاعدة البيانات (دور التشغيل app_user بلا BYPASSRLS يُنشأ بواسطة migration RLS)
sudo service postgresql start   # أو: docker compose up -d db
sudo -u postgres psql -c "CREATE DATABASE scam2027;" -c "CREATE DATABASE scam2027_test;"

# 3) التطبيق
cd app && cp .env.example .env
# ولّد: AUTH_SECRET=$(openssl rand -base64 32) و APP_ENCRYPTION_KEY="base64:$(openssl rand -base64 32)"
pnpm install                                 # postinstall يشغّل prisma generate
pnpm exec prisma migrate deploy              # قاعدة التطوير (DIRECT_DATABASE_URL)
DIRECT_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/scam2027_test?schema=public" pnpm exec prisma migrate deploy   # قاعدة الاختبار — إلزامي
pnpm tsx prisma/seed.ts                      # مستأجر demo + 4 أدوار نظام + 4 مستخدمين

# 4) البوابة الكاملة (يجب أن تكون خضراء قبل أي عمل)
pnpm check                                   # typecheck · lint · vitest · build
pnpm exec playwright install chromium
scripts/restart-server.sh                    # خادم إنتاج على :3000
pnpm exec playwright test                    # 39 ✓ + 2 fixme (سطح المكتب + جوال)
```

**حسابات demo** (مستأجر `demo`، `localhost` يُحلّ إليه عبر `DEFAULT_TENANT_SLUG`):

| الدور | المعرّف | كلمة المرور | الصلاحيات |
|---|---|---|---|
| مدير المستأجر | `admin@demo.edu` | `Admin@123456` | 111/114 |
| مدير أكاديمي | `academic@demo.edu` | `Academic@123456` | 70 |
| مدرّس | `EMP-0101` | `Doctor@123456` | 51 |
| طالب | `443100001` | `Student@123456` | 20 |

**ملاحظات بيئة الـsandbox (Genspark):** أداة Bash تبدأ من `/home/user` — ابدأ كل أمر بـ`cd /home/user/webapp/app &&`. الأوامر الطويلة توجَّه إلى `/tmp/*.txt` ثم تُقرأ. الخادم يُشغَّل بـ`setsid scripts/restart-server.sh`. توكن GitHub في `~/.git-credentials` يخدم API لإنشاء/دمج PR (لا يملك صلاحية `workflows`؛ لذلك CI في `.github/ci.yml.template` — انظر §7).

---

## 3. خريطة التوثيق — من أين يقرأ الوكيل ماذا

| السؤال | الوثيقة |
|---|---|
| ما المطلوب بالضبط؟ (≈150 FR/NFR بمعرّفات وحالة ☐/◐/☑) | `docs/20-product/01-REQUIREMENTS.md` |
| ما الصلاحيات؟ (**114 رمزًا** `resource.action`، 30 موردًا، 4 أدوار نظام) — **المصدر الوحيد**؛ `permissions.ts` يُولَّد منه | `docs/20-product/02-PERMISSIONS-MATRIX.md` → `python3 app/scripts/gen-permissions.py` |
| تدفقات المستخدم | `docs/20-product/03-USE-CASES.md` |
| المعمارية ودورة الطلب | `docs/30-architecture/00-ARCHITECTURE.md` |
| عزل المستأجرين (RLS، GUC، `db(tenantId)`) | `docs/30-architecture/01-MULTI-TENANCY.md` |
| نموذج البيانات (68 موديلًا مخطَّطًا؛ 34 منفَّذًا) | `docs/30-architecture/02-DATA-MODEL.md` |
| المصادقة/RBAC ونمط Server Action القياسي | `docs/30-architecture/03-AUTH-RBAC.md` |
| عقد الواجهة (Result, أخطاء, ترقيم) | `docs/30-architecture/04-API-CONTRACT.md` |
| نظام التصميم (tokens، مكوّنات، جوال) | `docs/30-architecture/05-UI-DESIGN-SYSTEM.md` |
| **الخطة** P0→P5 (65 مهمة، معايير قبول لكل مرحلة) | `docs/40-plan/01-ROADMAP.md` |
| **تعريف المنجز** (قائمة تحقق إلزامية لكل مهمة) | `docs/50-quality/00-DEFINITION-OF-DONE.md` |
| استراتيجية الاختبار | `docs/50-quality/01-TESTING-STRATEGY.md` |
| سياسة التوثيق (ما يُحدَّث مع كل PR) | `docs/50-quality/02-DOCUMENTATION-POLICY.md` |
| القرارات المعمارية (6 ADR) | `docs/60-adr/` |
| الأمان (ASVS 5.0 L2)، PDPL/NCA، معايير LTI/QTI/OneRoster/WCAG | `docs/10-research/02..04` |
| سجل الجلسات والدروس المستفادة | `docs/90-handoff/HANDOFF.md` |
| سجل التغييرات | `CHANGELOG.md` |
| **الحالة الآلية** (لقراءة سريعة/برمجية) | `docs/90-handoff/STATUS.json` |

---

## 4. الحالة الفعلية للكود (مُتحقَّق منها)

### 4.1 ما هو مبني ومختبَر ومُدمَج في `main`
| المرحلة/المهمة | المحتوى | الملفات الرئيسية |
|---|---|---|
| **P0 (16/16)** | Next.js 16 App Router + React 19 + TS strict · Tailwind 4 tokens Omnitrix + Cairo + RTL · 65 مكوّنًا · تخطيط (Sidebar/Header/BottomNav/MobileDrawer مبنية من الصلاحيات) · next-intl ar/en · Prisma + PostgreSQL + **RLS** (`app_user` بلا BYPASSRLS، GUC `app.current_tenant_id`) · Auth.js v5 Credentials + Argon2id + جلسات DB قابلة للإبطال + قفل + rate-limit · RBAC (`requireUser`, `assertPermission`, `hasRole`, `assertCanManageUser`) · `safeAction`/`Result` · `audit` · `logger` · `env.ts` Zod · `/login`, `/dashboard` (إحصائيات حقيقية لكل دور), `/developer`, `/unauthorized`, `/tenant-not-found`, `/tenant-suspended`, `/api/health` · Vitest + Playwright (desktop+mobile) + axe · قالب CI + PR template + CODEOWNERS | `app/src/lib/**`, `app/src/components/**`, `app/src/app/**`, `app/prisma/migrations/2026090422*` |
| **P1-02 المستخدمون** | قائمة (تبويبات/بحث/فلتر/ترقيم)، إنشاء برقم أكاديمي تلقائي، تعديل، تجميد/إيقاف (يُبطل الجلسات)، حذف ناعم/استرجاع، تعيين أدوار متعددة، إعادة تعيين كلمة المرور، إنهاء الجلسات، صفحة تفاصيل؛ حارس رفع الامتياز | `app/src/features/users/*`, `app/src/app/(dashboard)/users/**` |
| **P1-03 الأدوار** | قائمة/تفاصيل، مصفوفة صلاحيات 14 فئة، إنشاء/تعديل/نسخ/حذف (سلة)/استرجاع، أدوار النظام محمية، لا منح لما لا يملكه الفاعل، تدقيق قبل/بعد | `app/src/features/roles/*`, `app/src/app/(dashboard)/roles/**` |
| **P1-04 البنية الأكاديمية** | `/academic/[tab]` (سنوات/فصول · كليات · أقسام · تخصصات · مستويات)، فترة حالية واحدة متماسكة، CRUD بحوارات + توليد مستويات، حذف محمي بالتبعيات، Wizard الإعداد الأول (عملية ذرية)، seed واقعي | `app/src/features/academic/*`, `app/src/app/(dashboard)/academic/**` |
| **P1-05 المقررات والشُعب والتسجيل** | `/courses` + `/courses/[id]` (CRUD، ربط M:N تخصص↔مستوى، بحث، حذف ناعم)، `/offerings` + `/offerings/[id]` (شعبة لكل فصل بحالات مسودة/مفتوحة/مغلقة/مؤرشفة، مدرّسون بأدوار، سعة، جدول أسبوعي، قائمة الطلاب)، تسجيل فردي ببحث حيّ + جماعي بمعرّفات مع نتيجة لكل سطر، انسحاب/إعادة/إكمال؛ **نطاق الرؤية**: `course.manage_all` = كل المستأجر، وإلا المدرّس شُعبه والطالب تسجيلاته؛ seed 6 مقررات/4 شُعب/30 طالبًا | `app/src/features/{courses,offerings,enrollment}/*`, `app/src/app/(dashboard)/{courses,offerings}/**`, `app/src/components/forms/*`, `app/src/lib/auth/has-permission.ts` |
| **P1-06 الملفات** | `lib/storage` (local/S3، عدّاد + SHA-256، حارس مسار)، `POST /api/files/upload` (busboy stream + magic bytes + قائمة سماح + حد حجم حسب الاشتراك + مفتاح `tenant/course/uuid`)، `GET /api/files/[id]/download` (HMAC 5 دقائق مرتبط بالمستخدم + سجل تنزيل)، `/files` (تبويبات/بحث/مرشّحات/سلة/استرجاع/حذف نهائي، رفع متعدد بتقدّم)، نطاق `fileScopeWhere`، seed ملفَّين | `app/src/lib/storage/*`, `app/src/features/files/*`, `app/src/app/(dashboard)/files/**`, `app/src/app/api/files/**` |
| **P1-01 المخطط** | 18 موديلًا (أكاديمي/مقررات/محتوى/تواصل/نظام) + قيود SQL يدوية + RLS على 30 جدولًا + عقود Zod لأعمدة Json | `app/prisma/schema.prisma`, `app/prisma/migrations/20260905*`, `app/src/lib/contracts/json-columns.ts`, ADR-0006 |

**مقاييس الجودة الحالية:** `tsc` 0 · `eslint` 0 · Vitest **136/136** (21 ملفًا: 15 وحدة + 6 تكامل بقاعدة اختبار مستقلة) · Playwright **67 ✓ / 6 skip** (9 ملفات × 2 مشروع؛ skips = logout fixme + حوارات Radix Select على mobile-safari المغطّاة على سطح المكتب) · `pnpm build` ✓ · 0 تمرير أفقي على 390px · 0 انتهاكات axe serious/critical على الصفحات المبنية.

### 4.2 ما هو **غير** مبني (بصراحة)
- لا ملفات ولا إشعارات ولا اختبارات (quizzes) ولا درجات **في الواجهة** — الجداول موجودة (P1-01) لكن بلا صفحات أو Server Actions. الطالب يرى لوحة التحكم + المقررات + شُعبه؛ المدرّس يرى شُعبه وقوائم طلابه.
- القائمة الجانبية تُظهر: لوحة التحكم، المستخدمون، الأدوار، البنية الأكاديمية، المقررات، الشُعب (+ ما يُضاف عند إزالة `phase` من `src/lib/nav/items.ts` لكل وحدة تُبنى).
- `seed.ts` يبذر المستأجر والأدوار والمستخدمين والبنية الأكاديمية والمقررات/الشُعب/30 طالبًا وملفَّين على CS101 (P1-06)؛ **لا إشعارات** بعد (تُوسَّع مع P1-07).
- لا worker للمهام (`Job` جدول فقط) — P1-12. لا بريد. لا استعادة كلمة مرور/تفعيل — P1-11.
- CI غير مفعَّل على GitHub (ملف القالب موجود، انظر §7).
- `e2e/crawl.spec.ts` (زحف كل روابط Sidebar لكل دور) المذكور في استراتيجية الاختبار **لم يُكتب بعد** — يُكتب مع P1-15.
- اختبار logout في Playwright معلَّم `fixme`.

### 4.3 نقاط قد تُربك وكيلًا جديدًا (اقرأها)
1. `README.md` كان يقول «لم يُكتب كود بعد» — **قديم**؛ حُدِّث في PR #7 (الجلسة 7). `AGENTS.md` و`STATUS.json` هما الحقيقة.
2. `permissions.ts` **مولَّد** — لا تعدّله يدويًا؛ عدّل `02-PERMISSIONS-MATRIX.md` أو قالب المولّد `scripts/gen-permissions.py`.
3. المفاتيح المركّبة `(tenantId, id)`: لا تنشئ صفوفًا تابعة عبر `nested create` — استخدم `createMany` داخل نفس `tx`.
4. بعد كل migration: طبّقها على **قاعدة الاختبار أيضًا** (أمر في §2 خطوة 3) وأعد توليد RLS إن أُضيفت جداول: `pnpm tsx scripts/gen-rls.ts > prisma/migrations/<ts>_rls_<name>/migration.sql`.
5. `Permission` جدول عام غير مستأجري؛ اختبارات التكامل تحتاج `platformPrisma.permission.upsert` قبل `RolePermission`.
6. next-intl: النقاط في المفاتيح تُعشّش → رموز الصلاحيات في `messages/*.json` بصيغة `codes.user_view`.
7. React 19 + `react-hooks/set-state-in-effect`: لا `setState` داخل `useEffect` لمزامنة props — استخدم نمط الحالة المشتقّة (مثال: `roles/[id]/permissions-editor.tsx`).
8. Playwright على الجوال: جدول سطح المكتب موجود مخفيًا في DOM → طابق `.locator("visible=true")`.
9. القائمة الجانبية قصيرة **بالتصميم**: `visibleNavItems` يفلتر بالصلاحية **و**يخفي ما له `phase` (لم يُبنَ). عند شحن وحدة: احذف `phase` وحدّث `tests/unit/login-helpers.test.ts`.
10. `next start` يفرض `NODE_ENV=production` (روابط المعاينة أيضًا) — لا تربط سلوكًا بـ`NODE_ENV`؛ استخدم متغيّر بيئة صريحًا (PR #11).
11. **لا تضبط `AUTH_URL` أبدًا** (متعدد المستأجرين): Auth.js يثبّت كل إعادة توجيه على ذلك الأصل → `localhost:3000` بعد الدخول. الأصل يُشتق من الطلب عبر `src/lib/auth/forwarded.ts` (تطبيع `x-forwarded-*` في الـproxy + إعادة بناء `request.url` في `api/auth/[...nextauth]/route.ts` لأن Next يبنيه من `hostname:port` الخادم). عند وكيل عكسي جديد افحص ترويساته فعليًا (PR #12).

---

## 5. الخطة المتبقية — بالترتيب الملزم

> مصدر الحقيقة: `docs/40-plan/01-ROADMAP.md`. لا تُغيّر الترتيب دون ADR. كل مهمة = PR واحد مُدمَج.

### P1 — النواة الإدارية (متبقٍ 10 مهام)
| # | المهمة | مخرجات محددة | ملاحظات تنفيذ |
|---|---|---|---|
| ~~**P1-06**~~ ☑ PR #13 | الملفات | storage adapter (local/S3 عبر واجهة واحدة)، رفع stream متعدد بتقدّم، فحص magic bytes + قائمة سماح + حد حجم حسب الاشتراك، اسم مُعاد التوليد `tenant/course/uuid`، تصنيف، روابط تنزيل موقّعة قصيرة العمر (`/api/files/[id]/download`)، `/files` بتبويبات | `lib/storage/`؛ حذف ناعم؛ `file.manage_all` |
| **P1-07** | الإشعارات | إرسال بهدف مرن (`notificationTargetSchema`: الكل/دور/كلية/قسم/تخصص/مستوى/شعبة/أفراد) → fan-out إلى `NotificationRecipient`، inbox، مقروء/غير مقروء، أرشفة، عدّاد Header، «المُرسَلة» مع إحصاء القراءة، تفضيلات in-app | fan-out عبر `Job` إن تجاوز المستلمون 500 |
| **P1-08** | سلة المحذوفات الموحّدة | `/trash` لكل الكيانات ذات `deletedAt` + استرجاع + حذف دائم تلقائي بعد 30 يومًا (job `trash.purge`) | |
| **P1-09** | سجل التدقيق | `/audit-logs`: فلاتر (فاعل/كيان/إجراء/تاريخ)، تفاصيل diff قبل/بعد، تصدير CSV | البيانات موجودة منذ P0 |
| **P1-10** | الإعدادات | `/settings`: عام/أمان/علامة تجارية (شعار، ألوان، اسم) + حقن العلامة في `/login` والتخطيط؛ `TenantSetting` مشفّر للأسرار | |
| **P1-11** | المصادقة المكتملة | تفعيل الحساب (`/activate`)، استعادة كلمة المرور OTP/رابط 10 دقائق (`PasswordResetToken`)، «تذكرني»، إجبار تغيير كلمة المرور عند أول دخول (`mustChangePassword`) | |
| **P1-12** | Worker + بريد | `worker/` يلتقط `Job` بقفل (`lockedAt/lockedBy`)، إعادة محاولة، SMTP أساسي للمنصة (تفعيل/استعادة)، `mail.send` | يتصل بدور المالك ويضبط GUC لكل مهمة |
| **P1-13** | التقارير الأساسية | `/reports`: مستخدمون/مقررات/ملفات/نظرة عامة + رسوم Recharts | |
| **P1-14** | الملف الشخصي | `/profile`: بيانات، كلمة مرور، مظهر (فاتح/داكن)، تفضيلات الإشعارات | |
| **P1-15** | اختبارات P1 | وحدة لكل action، E2E لكل UC، `e2e/crawl.spec.ts` (كل رابط Sidebar لكل دور = 200)، عزل لكل موديل | يُغلق P1 |

**معيار قبول P1:** مدير يُعدّ جامعة كاملة من الصفر (Wizard) → مستخدمون وأدوار → شُعب وتسجيل → ملفات → إشعارات موجّهة → سلة → تدقيق؛ على الجوال وسطح المكتب بلا mock؛ E2E لكل تدفق.

### P2 — التعليم والذكاء → **MVP قابل للبيع** (12 مهمة)
Schema P2 (Quiz…AIUsageLog، SisImport، Consent، DSAR، EmailLog) → الاختبارات (نقل من `UniCore-OS-V2` بالثيم الأخضر: إنشاء/نشر/أداء بمؤقّت خادمي/تصحيح) → دفتر الدرجات → عارض ملفات موقّع → AI (adapter OpenAI-compatible + Gemini، استخراج نص، تلخيص/أسئلة بمسودة/اعتماد، إخفاء PII، حصص) → استيراد SIS CSV/XLSX بـdry-run → بريد لكل مستأجر → موافقة الملفات → الجلسات النشطة → PDPL أساسي → تقارير AI → أداء + مراجعة ASVS L2.

### P3 — النضج (12): واجبات، بنك أسئلة، مقاييس تقدير، تصدير PDF/XLSX، MFA TOTP، اشتراكات + لوحة المنصة `/platform`، نسخ احتياطي/تصدير مستأجر، PDPL كامل (DSAR/RoPA/احتفاظ/حوادث 72h)، OpenAPI `/api/v1`، مركز AI للمدرّس، تقرير «من يملك ماذا»، إنجليزية كاملة.
### P4 — التوسّع (7): SSO OIDC/SAML، Web Push، الحضور (يدوي+QR)، at-risk، PWA، Webhooks، إصدارات الملفات.
### P5 — التكامل (3): LTI 1.3 Tool (NRPS+AGS)، QTI 3.0، OneRoster 1.2.

---

## 6. دورة العمل الإلزامية لكل مهمة (لا استثناء)

```
1. اقرأ    → المهمة في ROADMAP + متطلباتها FR-* + UC + الوثيقة المعمارية المعنية + مصفوفة الصلاحيات
2. صمّم    → إن لزم قرار: ADR جديد في docs/60-adr/ قبل الكود
3. نفّذ    → features/<f>/{schemas,queries,actions}.ts + app/(dashboard)/<route>/**
            نمط Server Action الثابت:
              safeAction → requireUserOrThrow → assertPermission/نطاق → Zod .strict()
              → tx(tenantId) → audit(before/after) → revalidatePath → Result<T>
            بلا mock، بلا placeholder، بلا TODO بلا ticket، CSS منطقي فقط (ps/pe/ms/me/start/end)
4. اختبر   → وحدة (schemas + منطق) · تكامل (queries بمستأجر مستقل) · E2E desktop+mobile لكل دور معني
            · 0 تمرير أفقي 390px · axe 0 serious · كل رابط nav = 200
5. وثّق    → REQUIREMENTS (☑) · ROADMAP (☑) · CHANGELOG [Unreleased] · HANDOFF (جلسة جديدة + دروس)
            · DATA-MODEL/API-CONTRACT/PERMISSIONS إن تغيّر العقد · STATUS.json
6. بوابة   → cd app && pnpm check && scripts/restart-server.sh && pnpm exec playwright test
7. Git     → commit (Conventional) → git fetch origin main && git rebase origin/main
            → squash إلى التزام واحد → push -f genspark_ai_developer
            → PR إلى main (وصف: ما تغيّر / كيف اُختبر / الوثائق) → squash-merge → git reset --hard origin/main
```

**أوامر GitHub API** (التوكن من `~/.git-credentials`):
```bash
TOKEN=$(sed -n 's#.*://[^:]*:\([^@]*\)@.*#\1#p' ~/.git-credentials | head -1)
# إنشاء PR (الجسم في /tmp/pr.json: {"title","head":"genspark_ai_developer","base":"main","body"})
curl -s -H "Authorization: token $TOKEN" -X POST https://api.github.com/repos/MoTechSys/scam2027/pulls -d @/tmp/pr.json
# دمج
curl -s -H "Authorization: token $TOKEN" -X PUT https://api.github.com/repos/MoTechSys/scam2027/pulls/<N>/merge -d '{"merge_method":"squash"}'
```

---

## 7. المعايير غير القابلة للتفاوض

| المجال | المعيار | كيف يُتحقَّق |
|---|---|---|
| الأمان | **OWASP ASVS 5.0 L2**: Argon2id، جلسات قابلة للإبطال، rate-limit، قفل حساب، CSP/HSTS/headers، لا أسرار في الكود، RLS فرض على كل جدول مستأجري، FK مركّبة، لا `basePrisma` خارج `lib/db` | `tests/integration/tenant-isolation*`, `e2e/tenant.spec.ts` (headers), gitleaks في CI |
| الخصوصية | **PDPL (السعودية) + NCA ECC**: تصنيف البيانات (`02-DATA-MODEL.md §4`)، احتفاظ، DSAR (P3)، تدقيق لا يُحذف مع الفاعل | ADR-0006 |
| الوصولية | **WCAG 2.1 AA**: skip-link، تباين، تسميات aria، لوحة مفاتيح، axe 0 serious | `e2e/a11y.spec.ts` |
| الجوال | 390×844 بلا تمرير أفقي، أهداف لمس ≥ 44px، جداول → كروت | `expectNoHorizontalScroll` في كل spec |
| i18n/RTL | next-intl، كل نص في `messages/{ar,en}.json`، خصائص CSS منطقية فقط (ESLint يمنع left/right) | lint |
| الكود | TS strict بلا `any`، ESLint 0، Prettier، Zod `.strict()`، `Result<T>` لا throw إلى الواجهة | `pnpm check` |
| Git | Conventional Commits، Keep a Changelog، PR واحد لكل مهمة، squash-merge | PR template |
| التوثيق | تُحدَّث في **نفس الالتزام** (ADR-0005) | مراجعة PR |
| المعايير التعليمية | LTI 1.3 Advantage (P5)، QTI 3.0 (P5)، OneRoster 1.2 (P5) — التصميم الحالي لا يمنعها (Enrollment/Offering/Grade متوافقة) | `docs/10-research/04-STANDARDS-AND-STACK.md` |
| القابلية للتوسع | shared-schema + RLS (ADR-0002) يخدم آلاف المستأجرين؛ فهارس `(tenantId, …)` على كل استعلام؛ ترقيم خادمي؛ مهام ثقيلة عبر `Job`/worker؛ لا N+1 (فحص في P2-12) | `00-ARCHITECTURE.md §6` |

**CI:** `.github/ci.yml.template` كامل (lint → typecheck → test → build → e2e → gitleaks → audit على Postgres 17). توكن الوكيل لا يملك صلاحية `workflows`؛ **إجراء للمالك أو لوكيل بتوكن كامل:** `git mv .github/ci.yml.template .github/workflows/ci.yml` ثم commit. حتى ذلك الحين البوابة تُنفَّذ محليًا قبل كل PR (وهذا ما جرى في PRs #2–#6).

---

## 8. إجراءات مطلوبة من المالك (لا يستطيع الوكيل فعلها)

| # | الإجراء | السبب | الحالة |
|---|---|---|---|
| 1 | تدوير كلمة مرور Supabase للمشروع القديم `hmqmtxgyuarccyrioics` وأرشفة `MoTechSys/SCAM` كخاص | سرّ مكشوف في `SCAM/HANDOVER.md` (SEC-01) | ☐ |
| 2 | تفعيل CI: نقل `ci.yml.template` إلى `.github/workflows/ci.yml` | توكن الوكيل بلا `workflows` | ☐ |
| 3 | تحديد النطاق الجذري للإنتاج (مثال `lms.example.sa`) | نطاقات فرعية للمستأجرين `<slug>.<ROOT_DOMAIN>` | ☐ (التطوير على `localhost` كافٍ) |
| 4 | مفتاح AI للتطوير (OpenAI-compatible أو Gemini) | P2-05 | ☐ |
| 5 | SMTP للاختبار | P1-12 | ☐ (يمكن استخدام Mailpit محليًا مؤقتًا) |
| 6 | حساب S3-compatible أو الاكتفاء بالتخزين المحلي مبدئيًا | P1-06 | ☐ |

---

## 9. قائمة تحقق للوكيل الجديد قبل أول PR

- [ ] قرأت هذا الملف كاملًا + `01-ROADMAP.md` + `00-DEFINITION-OF-DONE.md` + `03-AUTH-RBAC.md §3`.
- [ ] Bootstrap §2 نجح: `pnpm check` أخضر، Playwright 39 ✓.
- [ ] فتحت `/roles` و`/users` بحساب admin على سطح المكتب والجوال وفهمت النمط (قائمة + تفاصيل + حوارات + Server Actions).
- [ ] قرأت `features/roles/actions.ts` كنموذج مرجعي لأي وحدة جديدة.
- [ ] حدّدت المهمة التالية من `STATUS.json → progress.nextTask` ولم أُغيّر الترتيب.
- [ ] عند الشك بين خيارين معماريين: ADR أولًا، ثم كود.

> **مبدأ المشروع:** لا شيء عشوائي. كل حقل، كل صلاحية، كل صفحة، كل تحميل عند فتح شيء — له متطلب مُرقَّم، وقرار موثَّق، واختبار يثبته.
