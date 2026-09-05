# HANDOFF — حالة المشروع وتسليم الجلسة

> يُحدَّث في **كل جلسة عمل**. آخر تحديث: **2026-09-04** (الجلسة 1 — التحليل والتخطيط).

## 0. ملخص الحالة

| البند | الحالة |
|---|---|
| المستودع | `MoTechSys/scam2027` (عام) |
| الفرع الرئيسي | `main` |
| فرع العمل | `genspark_ai_developer` → PR → `main` (دمج مباشر مصرّح به من المالك) |
| المرحلة الحالية | **P0 لم يبدأ** — التحليل والتخطيط منجزان (هذا PR) |
| الكود | لا يوجد كود تطبيق بعد؛ `docs/` فقط |
| بيئة التطوير | `/home/user/webapp` (sandbox)؛ المراجع في `.refs/` (غير ملتزمة) |

## 1. ما تم في هذه الجلسة

1. فحص 58 مستودعاً في `MoTechSys` وتحديد 9 مستودعات ذات صلة، واستنساخها إلى `.refs/`.
2. تدقيق كامل للواجهة الخضراء (`s-acm/apps/web`): 19 صفحة، 9,486 سطر، 60 مكوّناً، tokens، تخطيط، عقد API، اعتماد mock.
3. تدقيق 3 خلفيات (Hono/Drizzle، Django، Next/Prisma) و**اختيار V2 كمحرّك** (ADR-0001).
4. فهرسة كل الوثائق الموروثة (59 FR، 51 صلاحية، 10 تدفقات، 11 BUG، ISSUES).
5. بحوث: LMS benchmark، تعدد المستأجرين/RLS، OWASP ASVS 5.0، PDPL/NCA ECC/SDAIA AI، LTI/QTI/WCAG/OneRoster، الستاك.
6. **تحليل الفجوات: 27 فجوة** (GAP-01..27) + 5 فجوات عملية + اكتشاف أمني (SEC-01).
7. كتابة: المتطلبات الموحّدة (~150 FR/NFR بمعرّفات)، مصفوفة 98 صلاحية، حالات الاستخدام، المعمارية، تعدد المستأجرين، نموذج البيانات (68 موديلاً)، Auth/RBAC، عقد API، نظام التصميم، خارطة الطريق (6 مراحل، ~75 مهمة)، DoD، استراتيجية الاختبار، سياسة التوثيق، 5 ADRs.

## 2. ⚠️ إجراءات مطلوبة من المالك

| # | الإجراء | السبب |
|---|---|---|
| 1 | **تدوير كلمة مرور قاعدة Supabase** للمشروع القديم (`hmqmtxgyuarccyrioics`) | مكشوفة في `MoTechSys/SCAM/HANDOVER.md` (SEC-01). يُفضَّل أيضاً حذف الملف من تاريخ Git أو أرشفة المستودع كخاص. |
| 2 | مراجعة واعتماد الخطة (`docs/40-plan/01-ROADMAP.md`) والقرارات (`docs/60-adr/`) | قبل بدء P0 |
| 3 | تحديد النطاق الرئيسي المستقبلي (مثال `scam.app`) | لتصميم النطاقات الفرعية للمستأجرين (يمكن تأجيله؛ التطوير على `localhost` بمستأجر `demo`) |
| 4 | تحديد مزوّد AI المفضّل ومفتاح تطوير (OpenAI-compatible أو Gemini) | لـ P2 |

## 1b. الجلسة 2 — تنفيذ P0 (جزئي)
**منجز (☑):** P0-01, 02, 03, 06, 07, 08, 10, 11. **جزئي (◐):** P0-09 (Auth.js + Argon2id + Session + قفل جاهزة؛ **ناقص** `src/proxy.ts` و`app/api/auth/[...nextauth]/route.ts`).
**غير مبدوء:** P0-04 (Layout), P0-05 (next-intl — `next.config.ts` يشير إلى `src/i18n/request.ts` غير الموجود ⇒ `pnpm build` يفشل حاليًا), P0-12 (الصفحات), P0-13 (`/api/health`), P0-14 (Playwright), P0-15 (CI), P0-16 (PR template/CODEOWNERS).
**حالة الجودة:** `pnpm lint` ✅ · `pnpm typecheck` ✅ · `pnpm test` ✅ (6/6 عزل مستأجرين) · `pnpm build` ❌ (بسبب i18n المفقود ولا توجد صفحات بعد).
**سكربتات مهمة:** `python3 app/scripts/port-ui.py` (إعادة نقل المكوّنات — idempotent)، `python3 app/scripts/gen-permissions.py`، `pnpm tsx scripts/gen-rls.ts > prisma/migrations/<ts>_rls/migration.sql` (أعِد تشغيله عند إضافة جداول بـ `tenantId`).

## 3. كيف تبدأ بيئة جديدة (Bootstrap)

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

## 5. المشاكل المعروفة

- اختبار logout في Playwright معلَّم `fixme` (قائمة Radix + form action).
- المراجع في `.refs/` تحوي `node_modules` لـ UniCore-OS-V2 (~1.3GB) — يمكن حذفها عند الحاجة للمساحة.
- قد تكون هناك عملية `next dev` قديمة على المنفذ 3000 من مسار سابق في الـ sandbox؛ تُقتل قبل التشغيل.

## 6. الخطوة التالية

**P0-01 → P0-16** بالترتيب في `docs/40-plan/01-ROADMAP.md`، بدءاً بتهيئة `app/` ونقل الـ tokens والمكوّنات، ثم Prisma + RLS + Auth + RBAC + seed + Dashboard + اختبارات + CI. كل مهمة PR مستقل مع تحديث الوثائق.

## 7. سجل الجلسات

| التاريخ | الجلسة | الناتج | PR |
|---|---|---|---|
| 2026-09-04 | 1 — تحليل وتخطيط | `docs/**`, `README.md`, `CHANGELOG.md`, `.gitignore` | #1 |
| 2026-09-04 | 2–3 — P0 كامل | `app/**` (bootstrap, RLS, Auth, RBAC, shell, tests, CI template) | #2, #3 |
| 2026-09-05 | 4 — P1-02 المستخدمون | `app/src/features/users`, `app/src/app/(dashboard)/users`, e2e users, RBAC guard fix | #4 |


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
