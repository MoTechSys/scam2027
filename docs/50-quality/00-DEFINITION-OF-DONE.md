# تعريف "المنجز" (Definition of Done)

لا تُعتبر مهمة (`Pn-xx`) منجزة إلا إذا تحقق **كل** ما يلي:

## الكود
- [ ] TypeScript strict بلا `any` غير مبرَّر، ESLint 0 خطأ، Prettier.
- [ ] كل Server Action: `requireUser` → `assertPermission`/نطاق → Zod `.strict()` → `db(tenantId)` → `audit` → `Result`.
- [ ] لا بيانات وهمية (mock) في المنتج؛ لا `TODO` بلا ticket.
- [ ] لا أسرار في الكود؛ المتغيرات في `env.ts` و`.env.example`.
- [ ] الاستيراد من `basePrisma` ممنوع خارج `lib/db`.

## الاختبارات
- [ ] وحدة لكل action (نجاح + كل حالة فشل متوقعة + `FORBIDDEN` بلا صلاحية).
- [ ] عزل المستأجر لكل موديل جديد.
- [ ] E2E لكل تدفق UC جديد على **desktop 1280×800** و**mobile 390×844** لكل دور معني.
- [ ] axe: 0 انتهاكات serious/critical على الصفحات المتأثرة.
- [ ] crawl: كل رابط في Sidebar/BottomNav لكل دور يعيد 200 (لا 404 — درس V2 `/logs`).
- [ ] لا تمرير أفقي على 390px (اختبار `document.documentElement.scrollWidth <= 390`).

## الوثائق (في نفس الـ PR)
- [ ] `docs/20-product/01-REQUIREMENTS.md`: حالة المتطلبات ☐→◐/☑.
- [ ] `docs/40-plan/01-ROADMAP.md`: حالة المهمة.
- [ ] الوثيقة المعمارية المعنية إن تغيّر العقد/النموذج (`02-DATA-MODEL.md`, `04-API-CONTRACT.md`, `02-PERMISSIONS-MATRIX.md`).
- [ ] `CHANGELOG.md` تحت `[Unreleased]`.
- [ ] `docs/90-handoff/HANDOFF.md` إن تغيّرت طريقة التشغيل/بيانات الدخول/الحالة.
- [ ] ADR إن اتُّخذ قرار معماري.

## Git
- [ ] Conventional Commit (`feat(users): …`, `fix(auth): …`, `docs(plan): …`).
- [ ] فرع `genspark_ai_developer` → PR إلى `main` بوصف يتضمن: ما تغيّر، كيف اُختبر (أوامر + لقطات موبايل/سطح مكتب عند تغيّر UI)، الوثائق المحدّثة.
- [ ] CI أخضر.
