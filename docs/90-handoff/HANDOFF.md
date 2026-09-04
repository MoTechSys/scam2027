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

- لا شيء في الكود (لا كود بعد).
- المراجع في `.refs/` تحوي `node_modules` لـ UniCore-OS-V2 (~1.3GB) — يمكن حذفها عند الحاجة للمساحة.
- قد تكون هناك عملية `next dev` قديمة على المنفذ 3000 من مسار سابق في الـ sandbox؛ تُقتل قبل التشغيل.

## 6. الخطوة التالية

**P0-01 → P0-16** بالترتيب في `docs/40-plan/01-ROADMAP.md`، بدءاً بتهيئة `app/` ونقل الـ tokens والمكوّنات، ثم Prisma + RLS + Auth + RBAC + seed + Dashboard + اختبارات + CI. كل مهمة PR مستقل مع تحديث الوثائق.

## 7. سجل الجلسات

| التاريخ | الجلسة | الناتج | PR |
|---|---|---|---|
| 2026-09-04 | 1 — تحليل وتخطيط | `docs/**`, `README.md`, `CHANGELOG.md`, `.gitignore` | #1 |
