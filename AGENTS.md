# AGENTS.md — دليل الوكيل الكامل لمشروع scam2027

> **حالة الاستئناف (2026-09-30، جلسة 25):** P1-11 المصادقة المكتملة **مُدمَجة** (PR #25، ADR-0009). لا عناصر مفتوحة. **التالي: P1-12 Worker + بريد** (`worker/` يلتقط `Job` بقفل، ناقل SMTP في `lib/mail` — Mailpit محليًا). التفاصيل في `docs/90-handoff/HANDOFF.md` → «الجلسة 25».


> **ابدأ هنا.** هذا الملف هو نقطة الدخول الوحيدة لأي وكيل (AI أو مطوّر) يُكلَّف بمتابعة المشروع. اقرأه كاملًا (10 دقائق) قبل أي أمر. كل ما فيه مُتحقَّق منه فعليًا بتاريخ **2026-09-30** على `main` بعد دمج PR #25.
>
> تعليمات المالك الدائمة (نصًّا): *«كون ادمج انت وسوي كل شي»* · *«انجز وادمج وتحقق واختبر واكمل المشروع كله عليك بس بدقه»* · *«لا شغل عشوائي … كل شيء يكون مدروس بدقة»* · *«نظام لأي جامعة، متكامل، قابل للتطوير، ومرن»*.

---

## 0. الملخص التنفيذي (60 ثانية)

| البند | القيمة |
|---|---|
| المنتج | **scam2027** — نظام إدارة تعلّم (LMS) جامعي **متعدد المستأجرين** (عدة جامعات على منصة واحدة) بواجهة **Omnitrix الخضراء** RTL، عربي/إنجليزي، جوال أولًا |
| المستودع | `https://github.com/MoTechSys/scam2027` (عام) — `main` محمي بالمنطق التالي: فرع `genspark_ai_developer` → PR → **squash-merge** مصرّح به للوكيل |
| التقدّم | **31 / 65 مهمة (48%)** — **P0 كامل (16/16) · P1 كامل (15/15)** · P2–P5 لم تبدأ. انظر §4 |
| آخر تصليب | **PR #22 (الجلسة 21):** إقلاع من صفر + فحص عميق (200 زحف × دور × عرض، تدفقات، 26 مسبارًا أمنيًا) → 12 إصلاحًا + `e2e/crawl.spec.ts`. انظر HANDOFF الجلسة 21 |
| التالي مباشرة | **P2-01 مخطط P2 — يبدأ بـ ADR-0011** (Quiz/Question/Option/QuestionBankItem/QuizAttempt/Answer/GradebookColumn/Grade/AIProviderConfig/AIConversation/AIMessage/AISummary/AIGeneratedQuestion/AIUsageLog/AIGenerationJob/SisImport…): migration + `gen-rls.ts` على القاعدتَين + عقود Json + `p1-schema-isolation` سيلتقط أي جدول بلا RLS تلقائيًا — §5 |
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
sudo service postgresql start   # أو: sudo pg_ctlcluster 17 main start (بلا systemd) · أو: (cd app && docker compose up -d) → postgres:17 + scam2027_test + Mailpit (SMTP 1025 / UI 8025)
# على sandbox خالٍ: sudo apt-get install -y postgresql-17 ثم ALTER USER postgres PASSWORD 'postgres'
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'postgres';" -c "CREATE DATABASE scam2027;" -c "CREATE DATABASE scam2027_test;"

# 3) التطبيق
cd app && cp .env.example .env
# ولّد: AUTH_SECRET=$(openssl rand -base64 32) و APP_ENCRYPTION_KEY="base64:$(openssl rand -base64 32)"
# .env.test (غير ملتزم — تحتاجه vitest التكاملية): نسخة من .env مع قاعدة scam2027_test و STORAGE_LOCAL_ROOT=./storage-test
sed -e 's#/scam2027?#/scam2027_test?#g' -e 's#STORAGE_LOCAL_ROOT=./storage$#STORAGE_LOCAL_ROOT=./storage-test#' .env > .env.test
pnpm install                                 # postinstall يشغّل prisma generate
pnpm exec prisma migrate deploy              # قاعدة التطوير (DIRECT_DATABASE_URL)
DIRECT_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/scam2027_test?schema=public" pnpm exec prisma migrate deploy   # قاعدة الاختبار — إلزامي
pnpm db:seed                                 # مستأجر demo + 4 أدوار نظام + 4 مستخدمين (seed يحمّل .env بنفسه)

# 4) البوابة الكاملة (يجب أن تكون خضراء قبل أي عمل)
pnpm check                                   # typecheck · lint · vitest · build
pnpm exec playwright install chromium
sudo pnpm exec playwright install-deps chromium   # مكتبات النظام (libatk…) — لازمة على sandbox خالٍ (الجلسة 24)
scripts/restart-server.sh                    # خادم إنتاج على :3000
pnpm exec playwright test                    # الأرقام الحالية في STATUS.json (يشمل crawl.spec: كل مسار × كل دور)

# 5) العامل (P1-12، ADR-0010) — اختياري في التطوير لأن JOBS_INLINE=true ينفّذ المهام داخل الطلب عبر after()
pnpm worker                                  # عملية مستقلة: تلتقط Job بقفل، SIGINT للإيقاف. في الإنتاج: JOBS_INLINE=false + worker دائم
# بريد فعلي محليًا: MAIL_TRANSPORT=smtp SMTP_HOST=127.0.0.1 SMTP_PORT=1025 (Mailpit من docker compose أو ثنائي mailpit)
# اختبار التكامل tests/integration/worker.test.ts يرسل عبر SMTP إلى Mailpit فعليًا ويتحقق من واجهة /api/v1/messages (يُتخطّى إن لم يكن Mailpit يعمل)
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
| القرارات المعمارية (9 ADR) | `docs/60-adr/` |
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
| **P1-07 الإشعارات** | `features/notifications/{schemas,scope,core,queries,actions}` (هدف مرن، fan-out ≤500 أو Job، تفضيلات، rate-limit)، `/notifications` (inbox/المُرسَلة/تفضيلات/حوار إرسال)، `NotificationBell` + `GET /api/notifications/unread-count`، seed 3 إشعارات | `app/src/features/notifications/*`, `app/src/app/(dashboard)/notifications/**`, `app/src/app/api/notifications/**`, `app/src/components/layout/NotificationBell.tsx` |
| **P1-06 الملفات** | `lib/storage` (local/S3، عدّاد + SHA-256، حارس مسار)، `POST /api/files/upload` (busboy stream + magic bytes + قائمة سماح + حد حجم حسب الاشتراك + مفتاح `tenant/course/uuid`)، `GET /api/files/[id]/download` (HMAC 5 دقائق مرتبط بالمستخدم + سجل تنزيل)، `/files` (تبويبات/بحث/مرشّحات/سلة/استرجاع/حذف نهائي، رفع متعدد بتقدّم)، نطاق `fileScopeWhere`، seed ملفَّين | `app/src/lib/storage/*`, `app/src/features/files/*`, `app/src/app/(dashboard)/files/**`, `app/src/app/api/files/**` |
| **قشرة التطبيق (ADR-0007/0008)** | viewport ثابت `h-dvh` + `ScrollRegion`/`PageShell` (القائمة وحدها تتحرك)، App bar بعنوان الصفحة + ☰، `MiniStatCard` 3×2، رسم نمو حقيقي، شريط سفلي 4 عناصر بلا «المزيد»، `manifest.webmanifest`؛ كل صفحة: `<PageHeader>` + جذر `flex h-full min-h-0 flex-col` + `ScrollRegion` | `app/src/components/layout/{page-header,page-shell,Header,BottomNavigation,DashboardLayout}.tsx`, `app/src/components/ui/{scroll-region,mini-stat-card}.tsx`, `app/src/app/(dashboard)/dashboard/*`, `app/src/app/manifest.webmanifest/route.ts` |
| **P1-09 سجل التدقيق** | `features/audit/{schemas,queries}`: مرشّحات (نص/فاعل/نوع الفاعل/كيان/معرّف/إجراء دقيق أو بادئة `resource.`/من–إلى بحدود يوم المستأجر)، حلّ أسماء الفاعلين بلا FK (محذوف = «مستخدم محذوف»، null = «النظام»)، facets؛ `GET /api/audit/export` CSV بتدفّق keyset (BOM، حماية حقن الصيغ، سقف 50k، يُدوَّن `audit.export`)؛ `/audit` (بحث + لوحة مرشّحات + جدول/قائمة جوال + Sheet تفاصيل مع diff قبل/بعد «التغييرات فقط» + نسخ JSON) | `app/src/features/audit/*`, `app/src/app/(dashboard)/audit/**`, `app/src/app/api/audit/export/route.ts` |
| **P1-10 الإعدادات** | `lib/crypto.ts` (AES-256-GCM، `v1:` مُرقَّم، `maskSecret`) + `lib/svg-safe.ts`؛ `features/settings/{schemas,core,queries,actions}`: **`SETTINGS_REGISTRY`** (category/key/Zod/default/secret — إضافة إعداد = سطر لا migration)، `getSetting/setSetting` مع سقوط آمن للصف الفاسد، أسرار مشفّرة لا تُعاد للعميل (`hasValue` + ذيل مقنَّع)؛ `/settings/[tab]` (عام: اسم/لغة/منطقة زمنية/صيغة الرقم الأكاديمي/بريد الدعم · أمان: سياسة كلمات المرور/الجلسة/القفل/MFA للأدوار · هوية: ألوان + شعار)؛ `POST /api/branding/logo` (magic bytes + SVG inert + `<tenantId>/branding/` + حذف القديم) و`GET /api/branding/logo/:tid/:v` (عام، CSP sandbox)؛ حقن `--primary`/الشعار/رسالة الدخول في `/login` والتخطيط عبر `resolveTenant` | `app/src/lib/{crypto,svg-safe}.ts`, `app/src/features/settings/*`, `app/src/app/(dashboard)/settings/**`, `app/src/app/api/branding/**`, `app/prisma/migrations/20260928*` |
| **P1-11 المصادقة المكتملة** | ADR-0009: `features/auth/{schemas,core,actions}` — رابط موقّع أحادي (`PasswordResetToken.tokenHash = <PURPOSE>:<sha256>`, 10 دقائق/72 ساعة، إبطال السابق، مقارنة ثابتة الزمن)، `loadSecurityPolicy` يقرأ `security.*` **ويُطبَّق فعليًا** على القفل/الجلسة/سياسة كلمات المرور، `forcedChangeReason` → `Ctx.user.passwordChangeRequired` تفرضه `requireUser`/`requireUserOrThrow`؛ `lib/mail` (قوالب ar/en + ناقل `log`؛ `smtp` في P1-12) و`Job mail.send` يُعالَج inline؛ صفحات `/forgot`, `/reset`, `/activate`, `/change-password` على `AuthCard`؛ إنشاء مستخدم `PENDING_ACTIVATION` = رمز تفعيل + بريد، وزر إعادة الإرسال | `app/src/features/auth/*`, `app/src/lib/mail/*`, `app/src/app/(auth)/**`, `app/src/lib/auth/{config,rbac,password-policy}.ts`, `app/prisma/migrations/20260930090000*` |
| **P1-12 Worker + بريد** | ADR-0010: `src/worker/index.ts` (`pnpm worker` = `tsx --conditions=react-server`): `claimJobs` بـ`FOR UPDATE SKIP LOCKED` (حجز `lockedBy/lockedAt`)، `reapStaleLocks` (RUNNING راكد → PENDING، تجاوز `maxAttempts` → FAILED)، نوع بلا معالج → FAILED، إيقاف رشيق؛ `lib/jobs/registry.ts` (`mail.send`/`notification.fanout`/`trash.purge`) + `lib/jobs/kick.ts` (`kickJob` = inline عبر `after()` فقط إن `JOBS_INLINE`); `lib/mail` ناقل `smtp` (nodemailer، Mailpit محليًا) singleton على `globalThis`؛ `docker-compose.yml` (postgres:17 + scam2027_test + mailpit)؛ 5 اختبارات تكامل (تفرّد الالتقاط، سباق مرّة واحدة، حاصد، نوع مجهول، تسليم SMTP فعلي إلى Mailpit) | `app/src/worker/*`, `app/src/lib/jobs/*`, `app/src/lib/mail/index.ts`, `app/docker-compose.yml`, `app/tests/integration/worker.test.ts`, ADR-0010 |
| **P1-13 التقارير** | `features/reports/{schemas,queries}`: 4 تبويبات (`/reports/[tab]` نظرة عامة/مستخدمون/مقررات/ملفات) بتجميعات حقيقية (`groupBy`/`aggregate`/`count`) داخل `tx(tenantId)` واحد لكل تبويب؛ نطاق المدرّس (`report.* = own`) عبر نفس `scope` القوائم + ملاحظة نطاق؛ مرشّحات Zod strict في URL؛ `reports/charts.tsx` (MonthlyArea/CountBars/Donut) + `report-blocks.tsx` (Kpi/ChartCard)؛ `GET /api/reports/[kind]/export` CSV بتدفّق مُدوَّن؛ عنصر nav `reports` مفعَّل؛ 15 اختبار تكامل + `e2e/reports.spec` (3×2) + axe على `/reports/overview` | `app/src/features/reports/*`, `app/src/app/(dashboard)/reports/**`, `app/src/app/api/reports/[kind]/export/route.ts` |
| **P1-14 الملف الشخصي** | migration `p1_14_profile_theme_avatar` (`UserProfile.theme` + CHECK، `avatarStorageKey`)؛ `features/profile/{schemas,queries,core,actions}` (`applyProfileUpdate/applyTheme/applyAvatar` داخل `TenantTx` مع تدقيق)؛ `/profile/[tab]` بيانات/كلمة المرور (إعادة استخدام `ChangePasswordForm`)/المظهر (DARK/LIGHT/SYSTEM يُطبَّق فورًا ويُحفَظ)/الإشعارات (مكوّن `Preferences` المشترك المستخرج من مركز الإشعارات)؛ `POST /api/profile/avatar` + `GET /api/profile/avatar/[t]/[u]/[v]` (جلسة نفس المستأجر، CSP sandbox)؛ `lib/theme.ts` + Header يقرأ المظهر المخزَّن من `LayoutUser.theme` ويكتب عبر `updateThemeAction`، `AvatarImage` في الرأس، رابط «الملف الشخصي» فعّال؛ 7 اختبارات تكامل + `e2e/profile.spec` (5×2) | `app/src/features/profile/*`, `app/src/app/(dashboard)/profile/**`, `app/src/app/api/profile/**`, `app/src/lib/theme.ts`, `app/src/components/layout/{Header,types}.tsx` |
| **P1-15 إغلاق اختبارات P1** | `tests/integration/files-queries.test.ts` ×12 (فجوة P1-06: نطاق مدير/مدرّس/طالب، تبويبات، بحث، مرشّحات، ترقيم، `getFileDetail`, `storageUsage`, `resolveAttachment`, خيارات الإرفاق، RLS)؛ `p1-schema-isolation` + **ثابت قاعدة كاملة**: كل جدول بعمود `tenantId NOT NULL` له RLS مفعَّلة + مُجبَرة + سياسة `tenant_isolation` (يلتقط أي جدول مستقبلي)، `app_user` بلا BYPASSRLS، `UserProfile.theme` CHECK؛ e2e: تسجيل الخروج **لم يعد fixme** (Enter على menuitem)، `pickOption` مشترك في `helpers.ts` (تحقق بنص الزناد + إعادة بالكيبورد) → تدفقات إنشاء المقرر/الشعبة+تسجيل+انسحاب/التسجيل الجماعي/إرسال الإشعارات تعمل الآن على **الجوال أيضًا** (5 skips أُزيلت)؛ scripts `e2e:mobile`/`e2e:crawl`/`test:a11y`/`test:all` مطابقة لـ TESTING-STRATEGY §5 | `app/tests/integration/{files-queries,p1-schema-isolation}.test.ts`, `app/e2e/{helpers,auth,offerings,courses,notifications}.spec.ts`, `app/package.json` |
| **P1-01 المخطط** | 18 موديلًا (أكاديمي/مقررات/محتوى/تواصل/نظام) + قيود SQL يدوية + RLS على 30 جدولًا + عقود Zod لأعمدة Json | `app/prisma/schema.prisma`, `app/prisma/migrations/20260905*`, `app/src/lib/contracts/json-columns.ts`, ADR-0006 |

**مقاييس الجودة الحالية (P1-15 غير مدموج، 2026-09-30، مقاسة):** Playwright كاملة **144 ✓ / 4 skip / 2 ✘** (`crawl as admin` desktop+mobile، يمرّ منفردًا) — **دُمج بقرار المالك؛ أول مهمة للجلسة التالية = إصلاحه قبل أي عمل P2.** المقاييس المدموجة (PR #28): `tsc` 0 · `eslint` 0 · Vitest **288/288** (38 ملفًا: 24 وحدة + 14 تكامل بقاعدة اختبار مستقلة، منها `worker.test.ts` بتسليم SMTP فعلي إلى Mailpit) · Playwright **139 ✓ / 11 skip / 0 ✗** (18 ملفًا × 2 مشروع بما فيها `crawl.spec` و`auth-recovery.spec` و`reports.spec` و`profile.spec`؛ skips = logout fixme + حوارات Radix Select/compose على mobile-safari المغطّاة على سطح المكتب + تحديد جماعي في السلة desktop-only؛ فشل `toHaveURL` في login تحت الحمل الكامل عابر — أعد الملف وحده) · مُتحقَّق منها على **sandbox خالٍ تمامًا** (الجلسة 21: تثبيت Postgres/pnpm من الصفر → `pnpm check` exit 0 → Playwright كاملة) · `pnpm build` ✓ · `pnpm audit` 0 ثغرات · 0 تمرير أفقي على 390px · 0 انتهاكات axe serious/critical على الصفحات المبنية.

### 4.2 ما هو **غير** مبني (بصراحة)
- لا اختبارات (quizzes) ولا درجات ولا حضور **في الواجهة** — الجداول موجودة (P1-01) لكن بلا صفحات أو Server Actions. المبني: مستخدمون/أدوار/بنية أكاديمية/مقررات/شُعب/تسجيل/ملفات/إشعارات. الطالب يرى لوحة التحكم + المقررات + شُعبه + ملفاته + إشعاراته؛ المدرّس يرى شُعبه وقوائم طلابه ويرفع ملفات ويرسل إشعارات لشُعبه.
- الإشعارات in-app فقط: قناة البريد للإشعارات وSMTP لكل مستأجر (FR-NTF-006 → P2-07) والمشغّلات الآلية عند رفع ملف/نشر اختبار (FR-NTF-007 → P2) غير مبنية؛ البريد اليوم للتفعيل/الاستعادة فقط (منصة، `MAIL_TRANSPORT`/`SMTP_*` من البيئة).
- القائمة الجانبية تُظهر: لوحة التحكم، المستخدمون، الأدوار، البنية الأكاديمية، المقررات، الشُعب، الملفات، الإشعارات، سلة المحذوفات، التقارير، سجل التدقيق، الإعدادات (+ ما يُضاف عند إزالة `phase` من `src/lib/nav/items.ts` لكل وحدة تُبنى).
- `seed.ts` يبذر المستأجر والأدوار والمستخدمين والبنية الأكاديمية والمقررات/الشُعب/30 طالبًا وملفَّين على CS101 (P1-06)، و3 إشعارات نموذجية (53 مستلمًا) (P1-07).
- العامل (P1-12) موجود لكن **لا يُشغَّل تلقائيًا** مع `next start` — عملية منفصلة `pnpm worker`؛ في التطوير/الاختبار `JOBS_INLINE=true` فينفَّذ كل Job داخل الطلب عبر `after()` والعامل يلتقط ما تبقّى فقط. لا مهام دورية (cron) ولا لوحة `/jobs` لمراقبة الطابور. ناقل البريد في `.env` الافتراضي `log` (المعاينة في `Job.result`). لا MFA (P3) ولا OTP (محجوز لـ MFA). `mfaRequiredRoles` يُخزَّن ولا يُطبَّق (P3).
- CI غير مفعَّل على GitHub (ملف القالب موجود، انظر §7).
- `e2e/crawl.spec.ts` مكتوب (PR #22): كل رابط شِل لكل دور = 200 + h1 واحد + صفر تمرير + صفر أخطاء صفحة/كونسول؛ المسارات المخفية تُعاد توجيهها لا 500؛ مسابير 401 JSON وCSP.
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
12. **`.gitignore` مثبَّت**: قاعدة `storage` القديمة أخفت `src/lib/storage` من Git حتى PR #16. أي مجلد تشغيل جديد يُتجاهل بمسار مثبَّت (`/x/`)، وقبل دمج PR يضيف مجلدًا: `git status --ignored`. ملف `.env.test` غير ملتزم — اشتقّه من `.env` (قاعدة `scam2027_test`, `STORAGE_LOCAL_ROOT=./storage-test`). خطة P1-08 التفصيلية (9 خطوات) في `HANDOFF.md` الجلسة 16.
13. **لا `NODE_ENV` في `.env`** — أداة Next تضبطه؛ تصديره من الـshell يكسر `next build` (`useContext null` في `/_global-error`). **لا `Intl.*(undefined)` ولا `dateTimeRange` في مكوّنات العميل** — SSR (Node ICU) والمتصفح يختلفان → React #418؛ استخدم `useFormatter()` و`lib/format-range.ts`. **h1 واحد فقط** (PageHeader يرسم `<p>` تحت lg). **`/api/*` بلا جلسة = 401 JSON** لا 307. `e2e/crawl.spec.ts` يفشل على أي خطأ صفحة/كونسول أو h1≠1 أو تمرير.
14. **لا تستورد `lib/auth/password.ts` (argon2) في مكوّن عميل** — يكسر `next build`. الثوابت (`PASSWORD_MIN`) في `lib/auth/password-policy.ts` وهو ما يُستورد من العميل.
15. **جدول `Tenant` بلا RLS ومنح `app_user` عليه على مستوى الأعمدة**: `UPDATE (name, nameEn, locale, timezone, updatedAt)` فقط (migration `p1_10_tenant_self_update`؛ مولّدها `scripts/gen-rls.ts`). أي عمود جديد يعدّله المستأجر يحتاج GRANT صريحًا وإلا 42501. `slug/customDomain/status` للمنصة فقط.
16. **`ScrollRegion` هو `relative`** (PR #24): مدخلات Radix المخفية المطلقة (`Switch/Checkbox`) كانت تهرب من الحاوية وتُضخّم `document.scrollHeight` على الجوال. لا تُزل `relative` منه.
17. **Turbopack يُصدر نسخة مستقلة من كل وحدة لكل نوع مدخل (Route Handlers / صفحات RSC / proxy)** حتى في الإنتاج → أي «singleton» على مستوى الوحدة (`const cache = new Map()`، `new PrismaClient()`) يتكرّر 3 مرات؛ `invalidateTenantCache()` من `/api/branding/logo` لم يكن يصل إلى النسخة التي تقرأها `/login`، وكان الخادم يفتح 3 مجمّعات اتصال. **القاعدة:** كل حالة عابرة للطلبات تُسجَّل على `globalThis` بمفتاح `Symbol.for(...)` (انظر `lib/db/prisma.ts` و`lib/auth/tenant-resolver.ts`)، مع اختبار وحدة يستورد الوحدة مرتين (`?instance=2`) ويثبت المشاركة.
20. **إجبار تغيير كلمة المرور يمرّ عبر `requireUser`/`requireUserOrThrow`** (ADR-0009 §6): كل صفحة داخل `(dashboard)` وكل action يُرفض تلقائيًا حتى يغيّر المستخدم كلمته. الاستثناء الوحيد `{ allowPasswordChangeRequired: true }` — لا تضفه إلا لما يلزم قبل التغيير (التغيير نفسه، الخروج، اللغة). اختبارات التكامل التي تبني `Ctx` يدويًا تحتاج `passwordChangeRequired: null`.
21. **لا SMTP من الطلب أبدًا**: أي بريد = `enqueueMail` داخل نفس `tx` ثم `kickJob(tenantId, jobId, "mail.send")` (لا `after(() => processMailJob(...))` مباشرة — P1-12). القوالب في `lib/mail/templates.ts` (بلا next-intl — تُعرض داخل job بلا request scope). `MAIL_TRANSPORT=log` في التطوير/الاختبار؛ e2e يقرأ الرابط من `Job.result.text`.
23. **العامل يعمل خارج Next** (ADR-0010): `pnpm worker` يشغّل `tsx --conditions=react-server` لأن `features/*` تستورد `server-only`؛ بدون الشرط يرمي عند الاستيراد. **لا تستدعِ معالجًا من الطلب مباشرة** — `kickJob()` فقط، وهو يحترم `JOBS_INLINE` (true في التطوير/الاختبار، false في الإنتاج مع عامل دائم). المعالج هو مالك الانتقال `PENDING→RUNNING` الشرطي (`updateMany where status=PENDING`) — العامل يحجز بـ`lockedBy` فقط؛ لا تغيّر أحدهما دون الآخر وإلا كسرت «مرّة واحدة بالضبط» (اختبار `worker.test.ts`). ناقل البريد singleton على `globalThis` (نفس سبب #17). `pnpm audit` ينظّف `brace-expansion` عبر lockfile (1.1.21/5.0.12) — **لا** تضف override بالاسم المجرّد `brace-expansion: ">=5"`: يُسقط 5.x على `minimatch@3` داخل eslint فيتعطّل بـ`expand is not a function`.
25. **المظهر مُخزَّن في القاعدة لا في المتصفح** (P1-14): `UserProfile.theme` → `(dashboard)/layout` → `LayoutUser.theme` → `Header` يطبّقه بـ`applyThemeToDocument` عند الإقلاع ويحفظ التبديل عبر `updateThemeAction`؛ `localStorage["scam.theme"]` كاش لا مصدر. **الـproxy يكتب CSP عامًا على كل استجابة** إلا ما يطابق `BINARY_ASSET` — أي مسار يقدّم ملفًا ثنائيًا بـCSP خاص (`sandbox`) يجب إضافته هناك (كشفته e2e `profile.spec`: ترويسة الأفاتار كانت تُستبدل). صور المستخدمين raster فقط — لا SVG حتى لو مرّ `svgIsInert`. `Preferences` مكوّن مشترك في `notifications/preferences.tsx` — لا تنسخه. **لا تشغّل prettier على مجلد كامل** — ملفات غير مُلتزمة تتلوّث (حدث في الجلسة 28 مع `components/layout`).
24. **التقارير قراءة فقط ومرشّحاتها في URL** (P1-13): الصفحة تتساهل (مرشّح غير صالح → افتراضي) بينما مسار CSV **strict** (→ 400) — لا تُوحّدهما. كل رقم يمرّ عبر `courseScopeWhere/offeringScopeWhere/fileScopeWhere` كي لا يرى المدرّس في التقرير أكثر مما يراه في القائمة؛ اختبار `reports-queries.test.ts` يثبّت ذلك بأرقام مُعدّة يدويًا. الرسوم بلا حركة (`isAnimationActive={false}`) وإلا تتذبذب لقطات e2e/axe؛ `MonthlyArea` تستخدم `reversed` على المحور X لأن الاتجاه RTL.
22. **دلاءُ rate-limit في الـproxy منفصلة**: `login:` (20/دقيقة) و`recover:` (30/15 دقيقة). دلو مشترك أسقط دخولًا مشروعًا في الحزمة الكاملة (كل الاختبارات من IP واحد).
19. **لون العلامة التجارية = نص على أسطح داكنة**: أي `--primary` يُحقن يجب أن يمرّ `primaryContrast(hex).passesAA` (`lib/color.ts`؛ الحد الملزم هو السطح المظلّل `color-mix(primary 10%, card)` لا الكارت نفسه). `e2e/a11y.spec` يفشل على `/dashboard` لأي لون دون 4.5:1. لا ترفع الحد ولا تُضف `color-contrast` إلى قائمة الاستثناءات — أصلح اللون.
18. **قواعد صيغة الرقم الأكاديمي** (`users.academicIdFormat`): `YYYY`/`YY` = السنة، تسلسل `N` واحد، وبقية الحروف حرفية؛ الأحرف المسموحة `A-Z 0-9 - _` فقط. لا أقواس `{}` ولا `{year}`: المحرّك (`features/users/academic-id.ts`) يطبعها حرفيًا. الافتراضي `DEFAULT_ACADEMIC_ID_FORMAT` (`YYYY-NNNNN`) هو المصدر الوحيد ويُستورد في `SETTINGS_REGISTRY`.
11. **لا تضبط `AUTH_URL` أبدًا** (متعدد المستأجرين): Auth.js يثبّت كل إعادة توجيه على ذلك الأصل → `localhost:3000` بعد الدخول. الأصل يُشتق من الطلب عبر `src/lib/auth/forwarded.ts` (تطبيع `x-forwarded-*` في الـproxy + إعادة بناء `request.url` في `api/auth/[...nextauth]/route.ts` لأن Next يبنيه من `hostname:port` الخادم). عند وكيل عكسي جديد افحص ترويساته فعليًا (PR #12).

---

## 5. الخطة المتبقية — بالترتيب الملزم

> مصدر الحقيقة: `docs/40-plan/01-ROADMAP.md`. لا تُغيّر الترتيب دون ADR. كل مهمة = PR واحد مُدمَج.

### P1 — النواة الإدارية (**مكتملة 15/15**)
| # | المهمة | مخرجات محددة | ملاحظات تنفيذ |
|---|---|---|---|
| ~~**P1-06**~~ ☑ PR #13 | الملفات | storage adapter (local/S3 عبر واجهة واحدة)، رفع stream متعدد بتقدّم، فحص magic bytes + قائمة سماح + حد حجم حسب الاشتراك، اسم مُعاد التوليد `tenant/course/uuid`، تصنيف، روابط تنزيل موقّعة قصيرة العمر (`/api/files/[id]/download`)، `/files` بتبويبات | `lib/storage/`؛ حذف ناعم؛ `file.manage_all` |
| ~~**P1-07**~~ ☑ PR #14 | الإشعارات | إرسال بهدف مرن (`notificationTargetSchema`: الكل/دور/كلية/قسم/تخصص/مستوى/شعبة/أفراد) → fan-out إلى `NotificationRecipient`، inbox، مقروء/غير مقروء، أرشفة، عدّاد Header، «المُرسَلة» مع إحصاء القراءة، تفضيلات in-app | fan-out عبر `Job` إن تجاوز المستلمون 500 |
| **P1-08** ☑ | سلة المحذوفات الموحّدة | `features/trash/{schemas,registry,queries,core,actions}` + `/trash` (6 تبويبات) + job `trash.purge` — PR #20 | استخدم `TRASH_REGISTRY` لأي كيان جديد ذي `deletedAt` |
| **P1-09** ☑ | سجل التدقيق | `features/audit/{schemas,queries}` (قراءة فقط)، `GET /api/audit/export` CSV بتدفّق، `/audit` بلوحة مرشّحات + Sheet للـdiff عبر `?entry=` — PR #23 | كل action جديد يظهر تلقائيًا (facets من البيانات) |
| ~~**P1-10**~~ ☑ PR #24 | الإعدادات | `/settings/[tab]` عام/أمان/هوية، `SETTINGS_REGISTRY`، أسرار AES-256-GCM، شعار عبر `lib/storage` + مساري `/api/branding/logo`، حقن العلامة في `/login` | أي إعداد جديد = سطر في `SETTINGS_REGISTRY`؛ الأسرار عبر `setSecretSettingAction` |
| ~~**P1-11**~~ ☑ PR #25 | المصادقة المكتملة | ADR-0009 · `/forgot`→`/reset` (10 دقائق) · `/activate` (72 ساعة) · «تذكرني» من `security.sessionMaxDays` · `/change-password` إلزامي (`ADMIN_RESET/TENANT_FORCED/EXPIRED`) · `security.*` مطبَّقة على الدخول | أي action جديد يمرّ عبر `requireUserOrThrow` يُرفض تلقائيًا أثناء إجبار التغيير؛ لا تستثنِ إلا ما لا يمكن تنفيذه بعد التغيير |
| ~~**P1-12**~~ ☑ PR #26 | Worker + بريد | ADR-0010 · `src/worker/index.ts` (`pnpm worker`) التقاط `FOR UPDATE SKIP LOCKED` + حاصد + إعادة محاولة · `lib/jobs/{registry,kick}` · ناقل SMTP (nodemailer/Mailpit) · `docker-compose.yml` | أي نوع Job جديد = معالج في `JOB_PROCESSORS` يملك قفل `PENDING→RUNNING`؛ من الطلب `kickJob()` فقط |
| ~~**P1-13**~~ ☑ PR #27 | التقارير الأساسية | `/reports/[tab]` نظرة عامة/مستخدمون/مقررات/ملفات + Recharts + CSV (`/api/reports/[kind]/export`) | تقرير جديد = `load*Report` في `features/reports/queries` داخل `tx` واحد + مرشّح Zod strict + تبويب في `REPORT_TABS`/`TAB_PERMISSION`؛ أرقام المدرّس تمرّ عبر `*ScopeWhere` دائمًا |
| ~~**P1-14**~~ ☑ PR #28 | الملف الشخصي | `/profile/[tab]` بيانات + صورة، كلمة مرور، مظهر DARK/LIGHT/SYSTEM مُخزَّن، تفضيلات الإشعارات | المظهر مصدره `UserProfile.theme` عبر `(dashboard)/layout → LayoutUser.theme`؛ `localStorage` كاش فقط. أي مسار ثنائي جديد يضبط CSP خاصًا يجب إضافته إلى `BINARY_ASSET` في `proxy.ts` وإلا يُستبدل بالـCSP العام |
| **P1-15** 🔶 PR #29 **مُدمج بقرار صريح من المالك رغم بوابة حمراء (2 ✘ crawl-as-admin) — عطل مفتوح يُحلّ أولًا في الجلسة التالية** (HANDOFF جلسة 29) | اختبارات P1 | فجوة الملفات (12 تكامل)، ثابت RLS على مستوى القاعدة، logout e2e، `pickOption` آمن على الجوال (5 skips أُزيلت)، scripts الاختبار | **P1 مُغلَق.** الـskips المتبقية (6): dashboard mobile-only، settings mobile-only، trash bulk desktop-only، files row-menu desktop-only (P2-12) |

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
            كل صفحة: <PageHeader title subtitle /> (ADR-0007) + جذر flex h-full min-h-0 flex-col + القائمة داخل <ScrollRegion> (ADR-0008)
            — لا <header> يدوي، لا space-y-* في الجذر، الشاشة لا تُمرَّر (expectNoPageScroll)؛ الجوال يُختبر بلقطة فعلية 390px
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

**CI:** قرار المالك (الجلسة 21): **لا CI على GitHub** — البوابة الكاملة (`pnpm check` + Playwright desktop+mobile بما فيه `crawl.spec`) **يشغّلها الوكيل بنفسه محليًا قبل كل PR** ويسجّل الأرقام في `STATUS.json`. `.github/ci.yml.template` يبقى مرجعًا لمن أراد تفعيله لاحقًا.

---

## 8. إجراءات مطلوبة من المالك (لا يستطيع الوكيل فعلها)

| # | الإجراء | السبب | الحالة |
|---|---|---|---|
| 1–2 | ~~Supabase القديم~~ · ~~CI على GitHub~~ | أُغلقا بقرار المالك (الجلسة 21): خارج النطاق / البوابة محلية بيد الوكيل | ☑ |
| 3 | تحديد النطاق الجذري للإنتاج (مثال `lms.example.sa`) | نطاقات فرعية للمستأجرين `<slug>.<ROOT_DOMAIN>` | ☐ (التطوير على `localhost` كافٍ) |
| 4 | مفتاح AI للتطوير (OpenAI-compatible أو Gemini) | P2-05 | ☐ |
| 5 | SMTP للاختبار | P1-12 | ☐ (يمكن استخدام Mailpit محليًا مؤقتًا) |
| 6 | حساب S3-compatible أو الاكتفاء بالتخزين المحلي مبدئيًا | P1-06 | ☐ |

---

## 9. قائمة تحقق للوكيل الجديد قبل أول PR

- [ ] قرأت هذا الملف كاملًا + `01-ROADMAP.md` + `00-DEFINITION-OF-DONE.md` + `03-AUTH-RBAC.md §3`.
- [ ] Bootstrap §2 نجح: `pnpm check` أخضر، Playwright بالأرقام في `STATUS.json` (إن كان الـsandbox خاليًا: `sudo pnpm exec playwright install-deps chromium` قبل التشغيل).
- [ ] فتحت `/roles` و`/users` بحساب admin على سطح المكتب والجوال وفهمت النمط (قائمة + تفاصيل + حوارات + Server Actions).
- [ ] قرأت `features/roles/actions.ts` كنموذج مرجعي لأي وحدة جديدة.
- [ ] حدّدت المهمة التالية من `STATUS.json → progress.nextTask` ولم أُغيّر الترتيب.
- [ ] عند الشك بين خيارين معماريين: ADR أولًا، ثم كود.

> **مبدأ المشروع:** لا شيء عشوائي. كل حقل، كل صلاحية، كل صفحة، كل تحميل عند فتح شيء — له متطلب مُرقَّم، وقرار موثَّق، واختبار يثبته.
