# R4 — المعايير التقنية والستاك (LTI · QTI · WCAG · OneRoster · الستاك المعتمد)

## 1. LTI 1.3 Advantage

- **الأساس:** OIDC third-party login + JWT موقّع (JWKS) بين Platform وTool.
- **الخدمات الثلاث:** NRPS (قوائم الطلاب والأدوار)، AGS (أعمدة الدرجات وإرسالها)، Deep Linking (اختيار المحتوى من داخل LMS الجامعة).
- **استراتيجية scam2027:** المرحلة P5 — أولاً **Tool** (تُطلَق من Moodle/Blackboard/Canvas الجامعة: يفتح مقرر/اختبار في scam2027، ويعيد الدرجات عبر AGS، ويزامن القائمة عبر NRPS)، لاحقاً **Platform**.
- **متطلبات تقنية:** مسارات `/lti/login`, `/lti/launch`, `/lti/jwks`, `/lti/deep-link`؛ تخزين `LtiRegistration` لكل مستأجر (issuer, client_id, deployment_id, key set URL)؛ إطار `X-Frame-Options` مسموح لهذه المسارات فقط؛ كوكيز `SameSite=None; Secure` + Partitioned.
- المرجع: https://www.imsglobal.org/lti-advantage-overview · https://www.1edtech.org/standards/lti

## 2. QTI 3.0

- تنسيق XML لتبادل الأسئلة/الاختبارات. **P5:** تصدير بنك الأسئلة إلى QTI 3.0 (choice, text-entry, extended-text) واستيراد الحد الأدنى. يخدم جامعة تريد نقل اختباراتها من/إلى Moodle.

## 3. OneRoster 1.2 (SIS)

- معيار 1EdTech لتبادل بيانات الطلاب/المقررات/التسجيل (CSV + REST). **P2:** قالب CSV الخاص بنا يتبع أسماء حقول OneRoster (`users.csv`, `courses.csv`, `classes.csv`, `enrollments.csv`) لتسهيل التوافق لاحقاً.

## 4. WCAG 2.1 AA (الهدف) مع مراعاة 2.2

- 2.2 أضاف 9 معايير (منها: Focus Not Obscured، Target Size ≥ 24px، Dragging Movements، Consistent Help، Redundant Entry، Accessible Authentication) وحذف 4.1.1 Parsing.
- **قرار:** نلتزم 2.1 AA كحد أدنى تعاقدي، ونطبّق من 2.2: حجم الهدف ≥ 44px (أعلى من المطلوب)، Accessible Authentication (لا CAPTCHA معرفية؛ OTP قابل للنسخ)، Consistent Help (رابط الدعم ثابت).
- **RTL:** استخدام خصائص منطقية (`ms-`, `me-`, `ps-`, `text-start`) بدل `ml/mr`؛ أيقونات الاتجاه تُقلب؛ `dir` من اللغة.
- **التحقق:** `eslint-plugin-jsx-a11y` + `@axe-core/playwright` في كل E2E + فحص تباين يدوي للـ tokens.
- المرجع: https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/

## 5. الستاك المعتمد لـ scam2027

| الطبقة | الاختيار | السبب |
|---|---|---|
| Framework | **Next.js 16 (App Router) + React 19 + TypeScript strict** | استمرارية V2؛ Server Actions تُلغي طبقة API منفصلة؛ RSC يقلّل JS على الموبايل |
| UI | **Tailwind v4 + shadcn/ui + tokens Omnitrix** | نقل حرفي من الواجهة الخضراء |
| Routing | App Router (`/[locale]/...`) بدل wouter | SSR، حماية مسارات على الخادم |
| i18n | `next-intl` | RTL/LTR، رسائل خارج الكود |
| Auth | **Auth.js v5** (Credentials + OIDC لاحقاً) | كوكيز HttpOnly، مزوّدون |
| ORM | **Prisma** (أحدث 6.x مستقر عند التنفيذ) + PostgreSQL 16 | Client Extensions لـ RLS، Migrations |
| Validation | Zod 4 | مشترك بين العميل والخادم |
| Tables | TanStack Table + `mobile-data-table` | من الواجهة الخضراء |
| Charts | Recharts | من الواجهة الخضراء |
| Files | Storage adapter (Local في التطوير / S3-compatible في الإنتاج) + `file-type` | عزل لكل مستأجر |
| Email | Nodemailer (SMTP لكل مستأجر) أو Resend | OTP/إشعارات |
| Jobs | جدول `Job` + worker (BullMQ إن توافر Redis) | استيراد/تصدير/AI/احتفاظ |
| Rate limit | `@upstash/ratelimit` أو جدول DB | brute force |
| Logging | pino + `requestId` | V16 |
| Testing | Vitest (unit/integration) + Playwright (E2E desktop 1280×800 + mobile 390×844) + axe | GAP-21 |
| Lint | ESLint (next, jsx-a11y) + Prettier + TypeScript strict | جودة |
| CI | GitHub Actions: lint → typecheck → test → build → gitleaks → audit | GAP-22 |
| Docs | Markdown في `docs/` + ADRs + CHANGELOG (Keep a Changelog) + Conventional Commits | سياسة التوثيق |
| Deploy | Node runtime (Docker) — Postgres مُدار؛ خيار استضافة خاصة لجامعة | RLS يحتاج Postgres حقيقي |

## 6. ما تم استبعاده ولماذا

| المستبعد | السبب |
|---|---|
| Supabase كخلفية | قيد مورّد؛ الجامعات تريد استضافة داخلية أحياناً؛ RLS نفسها متاحة على Postgres عادي |
| Django (scamV9) | ازدواج لغات، والواجهة الخضراء React |
| wouter + SPA | حماية المسارات على العميل فقط، لا SSR، تخزين JWT في localStorage |
| Drizzle | Prisma أنضج في V2 وفريقه |
