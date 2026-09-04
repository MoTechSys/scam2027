# Changelog

كل التغييرات الملحوظة في هذا المشروع تُوثَّق في هذا الملف.

الصيغة مبنية على [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)،
والمشروع يلتزم بـ [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

أنواع التغييرات: `Added` · `Changed` · `Deprecated` · `Removed` · `Fixed` · `Security` · `Docs`.

---

## [Unreleased]

### Added
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
