# استراتيجية الاختبار (Testing Strategy)

## 1. الطبقات

| الطبقة | الأداة | النطاق | متى |
|---|---|---|---|
| Static | TypeScript strict, ESLint (next, jsx-a11y, custom rules), Prettier, gitleaks, `pnpm audit` | كل الكود | كل commit (CI) |
| Unit | Vitest | `schemas.ts`, `rbac.ts`, `permissions.ts`, utils, DTO mappers | كل PR |
| Integration | Vitest + Postgres حقيقي (docker, DB `scam_test`) + `prisma migrate reset` | كل `actions.ts`, `queries.ts`, RLS, jobs | كل PR |
| E2E | Playwright | التدفقات UC-* لكل دور، على desktop + mobile | كل PR (subset) / كل merge إلى main (full) |
| A11y | `@axe-core/playwright` داخل E2E | كل صفحة مزارة | مع E2E |
| Visual (اختياري) | Playwright screenshots للموبايل | Dashboard, Login, Users | عند تغيّر UI |
| Performance | Lighthouse CI (mobile) على Login/Dashboard/Files | LCP ≤ 2.5s | أسبوعي / قبل الإصدار |
| Security | قائمة تحقق ASVS L2 + اختبارات آلية (rate limit, lockout, IDOR, CSP headers, tenant isolation) | — | كل مرحلة |

## 2. تكوين Playwright

```ts
projects: [
  { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  { name: 'mobile',  use: { ...devices['iPhone 14'], viewport: { width: 390, height: 844 } } },
]
```
- `storageState` لكل دور (`admin.json`, `academic.json`, `instructor.json`, `student.json`, `super.json`) يُولَّد في `global-setup`.
- بيانات من `seed.ts` (مستأجر `demo`) — يُعاد ضبط DB قبل الحزمة.

## 3. الحزم الإلزامية

### 3.1 `e2e/crawl.spec.ts`
لكل دور: اجمع روابط Sidebar + BottomNav + Drawer → زر كل رابط → `expect(status).toBe(200)` + لا `console.error` + axe 0 serious + `scrollWidth ≤ viewport.width` على الموبايل.

### 3.2 `e2e/auth.spec.ts`
UC-AUTH-001..004 + قفل بعد 5 محاولات + OTP منتهٍ + host/session mismatch.

### 3.3 `e2e/<feature>.spec.ts`
سيناريو UC كامل لكل ميزة (إنشاء → قراءة → تعديل → حذف ناعم → سلة → استعادة) على المشروعَين.

### 3.4 `tests/integration/tenant-isolation.spec.ts`
مولَّد: لكل موديل في Prisma DMMF يحوي `tenantId`: أنشئ في A، اقرأ من B → 0؛ عدّل من B → 0 صفوف؛ بدون GUC → 0.

### 3.5 `tests/integration/permissions.spec.ts`
مولَّد من المصفوفة: لكل action مسجّلة في `actionRegistry` مع صلاحيتها → بصلاحية تنجح/بدونها `FORBIDDEN`.

### 3.6 `tests/unit/permissions-consistency.spec.ts`
`permissions.ts` ≡ `seed` ≡ الوثيقة `02-PERMISSIONS-MATRIX.md` (يُحلَّل الجدول).

### 3.7 اختبارات الانحدار التاريخية
BUG-001..011 (scamV9) و ISSUES (s-acm) كما في `docs/00-analysis/03-DOCS-CORPUS.md` §2 — كل واحد اختبار مسمّى `regression: BUG-00x`.

## 4. بيانات الاختبار (Seed `demo`)

| الدور | البريد | كلمة المرور (تطوير فقط) |
|---|---|---|
| Super Admin (منصة) | `super@scam.local` | `Super@123456` |
| مدير النظام | `admin@demo.edu` | `Admin@123456` |
| مدير أكاديمي | `academic@demo.edu` | `Academic@123456` |
| مدرس | `dr.ahmad@demo.edu` | `Doctor@123456` |
| طالب | `student1@demo.edu` | `Student@123456` |

+ كلية واحدة، قسمان، 3 تخصصات، 4 مستويات، سنة + فصل حالي، 6 مقررات، 4 شُعب، 30 طالباً، 12 ملفاً، إشعارات، سجل تدقيق. (كلمات المرور تُغيَّر إجبارياً في الإنتاج؛ `seed` لا يعمل إذا `NODE_ENV=production` إلا بعلم صريح.)

## 5. الأوامر

```
pnpm lint · pnpm typecheck · pnpm test (unit+integration) · pnpm e2e · pnpm e2e:mobile · pnpm e2e:crawl · pnpm test:a11y · pnpm test:all
```

## 6. بوابات CI

`lint → typecheck → test → build → e2e(desktop+mobile) → gitleaks → audit`. أي فشل يمنع الدمج.
