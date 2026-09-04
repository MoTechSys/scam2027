# Changelog

كل التغييرات الملحوظة في هذا المشروع تُوثَّق في هذا الملف.

الصيغة مبنية على [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)،
والمشروع يلتزم بـ [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

أنواع التغييرات: `Added` · `Changed` · `Deprecated` · `Removed` · `Fixed` · `Security` · `Docs`.

---

## [Unreleased]

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
