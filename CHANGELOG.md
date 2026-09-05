# Changelog

كل التغييرات الملحوظة في هذا المشروع تُوثَّق في هذا الملف.

الصيغة مبنية على [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)،
والمشروع يلتزم بـ [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

أنواع التغييرات: `Added` · `Changed` · `Deprecated` · `Removed` · `Fixed` · `Security` · `Docs`.

---

## [Unreleased]

### Added
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
