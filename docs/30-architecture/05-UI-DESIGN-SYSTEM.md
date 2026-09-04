# A5 — نظام التصميم والواجهة (Omnitrix Design System — Next.js port)

## 1. الـ Tokens (تُنقل حرفياً إلى `app/src/app/globals.css`)

```css
@import "tailwindcss";
@theme inline {
  --color-background: #0f172a;  --color-foreground: #f1f5f9;
  --color-card: #1e293b;        --color-card-foreground: #f1f5f9;
  --color-primary: #39ff14;     --color-primary-foreground: #0f172a;
  --color-secondary: #334155;   --color-muted: #334155;  --color-muted-foreground: #94a3b8;
  --color-accent: rgba(57,255,20,.1); --color-accent-foreground: #39ff14;
  --color-destructive: #ef4444; --color-border: #334155; --color-input: #334155; --color-ring: #39ff14;
  --color-neon: #39ff14; --color-neon-dim: rgba(57,255,20,.6); --color-neon-glow: rgba(57,255,20,.35);
  --color-cyan: #22d3ee; --color-success: #10b981; --color-warning: #f59e0b;
  --color-chart-1: #39ff14; --color-chart-2: #22d3ee; --color-chart-3: #a855f7; --color-chart-4: #f59e0b; --color-chart-5: #ef4444;
  --font-sans: "Cairo", system-ui, sans-serif;
  --radius: 0.75rem;
}
```
Utilities: `.neon-glow`, `.neon-glow-sm`, `.neon-border`, `.neon-text`, `.card-hover`, `.sidebar-item.active`, `.tab-item.active`, `.table-sticky-header`, scrollbar. **العلامة التجارية للمستأجر** تُحقن كـ `style="--color-primary: …"` على `<html>` من RSC (الأخضر افتراضي).

## 2. الثيم الفاتح (اختياري في Profile/appearance)
`[data-theme=light]`: background `#f8fafc`, card `#ffffff`, foreground `#0f172a`, primary `#16a34a` (أخضر داكن للتباين ≥ 4.5:1 على الأبيض)، border `#e2e8f0`. الافتراضي داكن.

## 3. التخطيط

| نقطة الكسر | التخطيط |
|---|---|
| `< 768px` | Header مختصر + محتوى + BottomNavigation (5) + MobileDrawer للمزيد؛ `min-h-dvh`; `pb-[calc(4rem+env(safe-area-inset-bottom))]` |
| `768–1023` | Sidebar مطوي (أيقونات) + Header |
| `≥ 1024` | Sidebar كامل (`w-64`) + Header |

BottomNavigation تُبنى من أول 4 عناصر مسموحة حسب الدور + "المزيد" (الطالب: الرئيسية، مقرراتي، اختباراتي، الإشعارات).

## 4. أنماط الصفحات

- **PageHeader**: عنوان + وصف + إجراءات (على الموبايل: الإجراء الأساسي زر عائم أو في الأسفل).
- **PageTabs** (`page-tabs`): مسار `/[page]/[tab]`؛ لاصقة؛ تمرير أفقي بلا شريط.
- **DataTable / MobileDataTable**: جدول ≥ md، كروت < md؛ فرز/فلترة/ترقيم خادمي؛ أعمدة ثانوية تُخفى على الموبايل.
- **StatCard**: رقم + عنوان + اتجاه؛ شبكة 2 على الموبايل، 4 على سطح المكتب.
- **Forms**: `react-hook-form` + Zod (نفس schema الخادم)؛ حقول بعرض كامل؛ أخطاء تحت الحقل؛ أزرار ≥ 44px.
- **Dialogs**: `Dialog` ≥ md، `Drawer` (من الأسفل) < md.
- **Empty / Skeleton / Error** لكل قائمة.
- **PullToRefresh** على القوائم في الموبايل (يستدعي `router.refresh()`).

## 5. الوصولية (WCAG 2.1 AA)

- كل أيقونة تفاعلية بـ `aria-label`؛ كل حقل بـ `<Label>`؛ ترتيب تبويب منطقي؛ `focus-visible` بحلقة `--color-ring`.
- التباين: `#39ff14`/`#0f172a` = 15.1:1 ✅؛ `#94a3b8`/`#1e293b` = 5.6:1 ✅؛ لا نص أصغر من 14px بلون muted.
- الحركة: تُحترم `prefers-reduced-motion`.
- الاتجاه: خصائص منطقية (`ps/pe/ms/me/start/end`) فقط؛ ESLint يمنع `pl-/pr-/ml-/mr-/left-/right-`.
- `lang` و`dir` من locale.

## 6. i18n

`next-intl` مع `messages/ar.json` (المصدر) و`messages/en.json`. لا نص حرفي في JSX (قاعدة ESLint `no-literal-strings` للمكوّنات). التواريخ/الأرقام عبر `Intl` بتقويم ميلادي افتراضياً وخيار هجري في إعدادات المستأجر.

## 7. قائمة الصفحات (مطابقة للواجهة الخضراء + إضافات)

| المسار | التبويبات | المصدر |
|---|---|---|
| `/login`, `/forgot-password`, `/verify-otp`, `/reset-password/[token]`, `/activate/[token]` | — | أخضر + جديد |
| `/dashboard` | — (حسب الدور) | أخضر (Dashboard.tsx) |
| `/users/[tab]` | list · add · import · promote · frozen | أخضر |
| `/roles/[tab]` | list · add · permissions | أخضر |
| `/academic/[tab]` | colleges · departments · majors · levels · years · semesters | أخضر + GAP-05 |
| `/courses/[tab]` | list · add · (فلترة بالفصل بدل تبويبات first/second/summer) | أخضر |
| `/course/[id]/[tab]` | files · offerings · students · stats · settings | أخضر (كان mock) |
| `/offerings/[id]/[tab]` | files · students · quizzes · assignments · grades · attendance · analytics | V2 |
| `/files/[tab]` | all · lecture · assignment · exam · resource · other · pending | أخضر + موافقة |
| `/viewer/[id]` | — | أخضر (كان mock) |
| `/quizzes`, `/quizzes/my`, `/quizzes/[id]/edit|take|result` | — | V2 |
| `/grades` | — | V2 |
| `/assignments` | — | جديد P3 |
| `/notifications/[tab]` | inbox · sent · send · preferences | أخضر + V9 |
| `/ai/[tab]` | chat · summary · questions · usage · review | أخضر (كان mock) + V9 |
| `/reports/[tab]` | overview · users · courses · files · ai · at-risk | أخضر |
| `/audit-logs` | — | أخضر |
| `/trash/[tab]` | users · roles · courses · files | أخضر |
| `/settings/[tab]` | general · branding · security · email · ai · integrations · privacy | أخضر + جديد |
| `/profile/[tab]` | info · password · sessions · notifications · appearance · my-data | أخضر + PDPL |
| `/privacy/[tab]` (admin) | dsar · ropa · retention · incidents | جديد |
| `/platform/[tab]` (super) | tenants · subscriptions · audit | جديد |
| `/developer` | — | V2 (إلزامي) |
| `/unauthorized`, `/404`, `/tenant-not-found`, `/tenant-suspended` | — | — |
