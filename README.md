# scam2027 — Smart Course & Assessment Manager

منصّة إدارة مقررات وتقييم أكاديمي **متعدّدة المستأجرين** (جامعة واحدة أو عدة جامعات على نفس المنصّة)، مبنيّة على واجهة **Omnitrix الخضراء** (React 19 + Tailwind 4 + shadcn/ui، RTL، جوال أولًا) ومحرّك خلفي حديث (Next.js 16 + Prisma + PostgreSQL RLS + Auth.js).

> **الحالة الحالية (2026-09-05):** **19 / 65 مهمة (29%)** — **P0 مكتمل (16/16)**: أساس Next.js 16 + Prisma + PostgreSQL RLS + Auth.js + RBAC (113 صلاحية) + واجهة Omnitrix + اختبارات (Vitest 69 ✅ · Playwright 39 ✅ سطح مكتب + جوال). **P1 قيد التنفيذ (3/15)**: مخطط البيانات P1-01، المستخدمون P1-02، الأدوار P1-03. **المهمة التالية: P1-04** (البنية الأكاديمية).
>
> 🤖 **لأي وكيل/مطوّر جديد: ابدأ من [`AGENTS.md`](AGENTS.md)** — نقطة الدخول الوحيدة (المصادر، الإقلاع، الحالة الفعلية، ما تبقّى، دورة العمل، المعايير). الحالة الآلية في [`docs/90-handoff/STATUS.json`](docs/90-handoff/STATUS.json).

---

## لماذا هذا المستودع؟

وُجدت 9 مستودعات تراثية (واجهة خضراء شبه مكتملة تصميميًا، وثلاث خلفيات جزئية، ووثائق متفرّقة) بلا تعددية مستأجرين، بلا اختبارات، بلا CI، وبلا امتثال PDPL. هذا المستودع يوحّدها في منتج واحد **مكتمل بلا نواقص** مع توثيق يتحدّث مع كل تغيير.

- الواجهة المعتمدة: `s-acm/apps/web` (≡ `s-acm-frontend/client`) — انظر [ADR-0001](docs/60-adr/0001-engine-and-ui-sources.md).
- المحرّك المعتمد: نمط `UniCore-OS-V2` (Server Actions + `require*`/`assert*` + `Result<T>`) — [ADR-0004](docs/60-adr/0004-server-actions-over-rest.md).
- العزل: Shared schema + `tenantId` + Postgres **Row Level Security** — [ADR-0002](docs/60-adr/0002-shared-schema-multitenancy-rls.md).

## الحزمة التقنية المعتمدة

| الطبقة | الاختيار |
|---|---|
| إطار العمل | Next.js 16 (App Router, Server Actions) · React 19 · TypeScript strict |
| الواجهة | Tailwind 4 `@theme inline` · shadcn/ui (60 + 5 مكوّنات جوال) · lucide-react · Recharts · خط Cairo · RTL |
| البيانات | PostgreSQL 16 · Prisma 6 · RLS (`app.current_tenant_id`) |
| المصادقة | Auth.js v5 · Argon2id · جلسات DB + `sessionVersion` · OTP · قفل الحساب |
| التحقق | Zod 4 |
| الاختبار | Vitest · Playwright (1280×800 + 390×844) · axe-core |
| i18n | next-intl (ar/en) |
| الجودة | ESLint · Prettier · gitleaks · Conventional Commits · Keep a Changelog |

التفاصيل الكاملة والبدائل المرفوضة: [04-STANDARDS-AND-STACK](docs/10-research/04-STANDARDS-AND-STACK.md).

## خريطة التوثيق

| المجلد | المحتوى |
|---|---|
| [`AGENTS.md`](AGENTS.md) | **نقطة الدخول للوكلاء**: من أين قرأنا (9 مستودعات تراثية)، الإقلاع، الحالة الفعلية المُتحقَّق منها، ما تبقّى بالتفصيل، دورة العمل الإلزامية، المعايير غير القابلة للتفاوض |
| [`docs/90-handoff/STATUS.json`](docs/90-handoff/STATUS.json) | الحالة الآلية: عدّادات التقدّم لكل مرحلة، المهمة التالية ومخرجاتها، بوابة الجودة، الهجرات، الحسابات التجريبية، إجراءات المالك |
| [`docs/00-analysis`](docs/00-analysis) | جرد المستودعات، تدقيق UI، تدقيق الخلفيات، فهرس الوثائق، **تحليل الفجوات GAP-01..27** |
| [`docs/10-research`](docs/10-research) | مقارنة LMS، تعددية المستأجرين، ASVS 5.0، PDPL/NCA، المعايير والحزمة |
| [`docs/20-product`](docs/20-product) | المتطلبات FR/NFR، **مصفوفة الصلاحيات (113 رمزًا، 14 فئة — مصدر `permissions.ts` المولَّد)**، حالات الاستخدام |
| [`docs/30-architecture`](docs/30-architecture) | المعمارية، تعددية المستأجرين، نموذج البيانات (68 نموذجًا)، Auth/RBAC، عقد الواجهة، نظام التصميم |
| [`docs/40-plan`](docs/40-plan) | خارطة الطريق P0→P5 مع معايير القبول |
| [`docs/50-quality`](docs/50-quality) | تعريف الإنجاز، استراتيجية الاختبار، سياسة التوثيق |
| [`docs/60-adr`](docs/60-adr) | سجلّ القرارات المعمارية |
| [`docs/90-handoff`](docs/90-handoff) | `HANDOFF.md` سجل الجلسات ودروسها، إجراءات المالك، أوامر الإقلاع؛ `STATUS.json` الحالة الآلية |
| [`app/`](app) | كود التطبيق (Next.js 16 · Prisma · اختبارات Vitest/Playwright · سكربتات التوليد) — انظر `app/package.json` → `pnpm check` |
| [`CHANGELOG.md`](CHANGELOG.md) | سجل التغييرات (Keep a Changelog) |

## الأدوار

`PLATFORM_SUPER_ADMIN` · `TENANT_ADMIN` · `ACADEMIC_ADMIN` · `INSTRUCTOR` · `STUDENT` — مع أدوار مخصّصة لكل مستأجر مبنيّة على الصلاحيات المنقّطة (`resource.action`). انظر [02-PERMISSIONS-MATRIX](docs/20-product/02-PERMISSIONS-MATRIX.md).

## سير العمل الإلزامي

1. كل تغيير كود ⇒ تحديث الوثائق المتأثرة + `CHANGELOG.md` في **نفس الالتزام** ([سياسة التوثيق](docs/50-quality/02-DOCUMENTATION-POLICY.md)).
2. رسائل الالتزام بصيغة Conventional Commits.
3. الفرع `genspark_ai_developer` → PR إلى `main` → دمج بعد نجاح CI.
4. لا بيانات وهمية ولا placeholders في المنتج المُسلَّم؛ كل دور يُختبر على سطح المكتب والجوال (390×844 بلا تمرير أفقي).
5. OWASP ASVS 5.0 L2 · WCAG 2.1 AA · PDPL.

## البدء

```bash
git clone https://github.com/MoTechSys/scam2027.git && cd scam2027/app
sudo service postgresql start          # أو docker compose up -d db
cp .env.example .env                   # ولّد AUTH_SECRET و APP_ENCRYPTION_KEY (openssl rand -base64 32)
pnpm install
pnpm exec prisma migrate deploy        # قاعدة التطوير (DIRECT_DATABASE_URL)
DIRECT_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/scam2027_test?schema=public" pnpm exec prisma migrate deploy   # قاعدة الاختبار — إلزامي
pnpm tsx prisma/seed.ts                # مستأجر demo + الحسابات التجريبية
pnpm check                             # typecheck + lint + test + build
pnpm build && pnpm start -p 3000 &     # ثم: pnpm exec playwright test
```

التفاصيل الكاملة والحسابات التجريبية ونقاط التعثّر المعروفة: [`AGENTS.md`](AGENTS.md) §2 و§4، و[`docs/90-handoff/HANDOFF.md`](docs/90-handoff/HANDOFF.md).

## المطوّر

**معين العباسي** · +967 770 941 666 · [alabbasi.uk](https://alabbasi.uk) — صفحة `/developer` جزء ثابت من المنتج.

## الرخصة

جميع الحقوق محفوظة © 2026 MoTechSys. (تُحدَّد الرخصة النهائية من المالك.)
