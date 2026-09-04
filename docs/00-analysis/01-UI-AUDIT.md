# 01 — تدقيق الواجهة الخضراء (Green UI Audit)

> **المصدر المدقَّق:** `.refs/s-acm/apps/web/src` (≡ `s-acm-frontend/client/src`) + `.refs/S-ACM-Project/client/src` للمقارنة.
> **الستاك:** React 19.2.1 · Vite 7.1.7 · wouter 3.3.5 · Tailwind 4.1.14 (`@theme inline`) · shadcn/ui · Recharts 2.15 · lucide-react · zod 4 · خط Cairo · RTL · ثيم داكن فقط.

## 1. نظام التصميم (Design Tokens) — من `index.css`

| Token | القيمة | الاستخدام |
|---|---|---|
| `--background` | `#0f172a` | خلفية الصفحة |
| `--foreground` | `#f1f5f9` | النص الأساسي |
| `--card` | `#1e293b` | الكروت / الأسطح |
| `--primary` | `#39ff14` | **Neon Green** — الأزرار، التبويب النشط، الحدود المضيئة |
| `--primary-foreground` | `#0f172a` | نص على الأخضر |
| `--secondary` / `--muted` / `--border` / `--input` | `#334155` | الأسطح الثانوية والحدود |
| `--muted-foreground` | `#94a3b8` | النص الثانوي |
| `--accent` | `rgba(57,255,20,.1)` | خلفية hover |
| `--accent-foreground` | `#39ff14` | نص على accent |
| `--destructive` | `#ef4444` | حذف / خطأ |
| `--ring` | `#39ff14` | Focus ring |
| Charts | `#39ff14`, `#22d3ee`, `#a855f7`, `#f59e0b`, `#ef4444` | Recharts palette |
| Extra | `--color-neon`, `--color-neon-dim`, `--color-neon-glow`, `--color-cyan`, success `#10b981`, warning `#f59e0b` | حالات |

**Utilities مخصصة:** `.neon-glow`, `.neon-glow-sm`, `.neon-border`, `.neon-text`, `.card-hover`, `.sidebar-item.active { border-right: 3px solid var(--primary) }`, `.tab-item.active`, `.table-sticky-header`, scrollbar مخصص. `html { direction: rtl }`. كلاس `.dark` مطابق للجذر (ثيم واحد).

**قرار:** تُنقل هذه الـ tokens حرفياً إلى `app/src/app/globals.css` في Next.js مع إبقاء أسماء المتغيرات كما هي لضمان توافق مكوّنات shadcn.

## 2. التخطيط (Layout)

| المكوّن | LOC | الوظيفة | ملاحظات الموبايل |
|---|---|---|---|
| `DashboardLayout.tsx` | 312 | يجمع Sidebar (سطح المكتب) + Header + المحتوى + BottomNavigation (موبايل) + MobileDrawer | يستخدم `dvh/svh` و `safe-area-inset` (مُصلَح في ISSUES.md) |
| `Sidebar.tsx` | 274 | قائمة جانبية مع صلاحيات لكل عنصر | مخفي < `md` |
| `Header.tsx` | 152 | Avatar · Bell (إشعارات) · DropdownMenu · Search · LogOut | بحث مطوي على الموبايل |
| `BottomNavigation.tsx` | 91 | 5 عناصر: `/dashboard` الرئيسية · `/users` المستخدمين · `/courses` المقررات · `/notifications` الإشعارات · `#more` المزيد | ثابت في الأسفل، يحترم safe-area |
| `MobileDrawer.tsx` | 105 | يُفتح من "المزيد" ويعرض باقي القائمة | Sheet من الجانب |

**خريطة صلاحيات Sidebar (كما هي في الكود):**
`users→view_users`, `roles→view_roles`, `courses→view_courses`, `files→view_files`, `academic→manage_majors`, `ai→use_ai_summary`, `reports→view_statistics`, `settings→manage_settings`, `logs→view_audit_logs`, `trash→manage_users`.

> ملاحظة: `trash→manage_users` و `academic→manage_majors` غير دقيقتين دلالياً؛ تُصحَّح في مصفوفة الصلاحيات الموحدة (`docs/20-product/02-PERMISSIONS-MATRIX.md`).

## 3. المسارات والصفحات (من `App.tsx`)

| المسار | الصفحة | LOC | التبويبات | حالة البيانات |
|---|---|---|---|---|
| `/` | Home | 25 | — | redirect |
| `/login` | Login | 226 | — | API (authApi.login) |
| `/activate` | Activate | 362 | otp · password · verify | API جزئي |
| `/dashboard` | Dashboard | 455 | — | API (dashboardApi.getStats) + بعض mock للرسوم |
| `/users(/:tab)` | Users | 810 | all · list · add · import · promote | API |
| `/roles(/:tab)` | Roles | 614 | list · add · permissions | API |
| `/courses(/:tab)` | Courses | 749 | list · first · second · summer · add | API |
| `/course/:id` | CourseDetails | 810 | files · students · stats · settings | **mock** |
| `/files(/:tab)` | Files | 689 | all · lecture · assignment · exam · resource · other | API |
| `/viewer/:id` | Viewer | 289 | — | **mock** |
| `/academic(/:tab)` | Academic | 633 | departments · levels · majors | API |
| `/notifications(/:tab)` | Notifications | 453 | inbox · send | API |
| `/ai(/:tab)` | AI | 894 | chat · questions · summary | **mock** |
| `/settings(/:tab)` | Settings | 853 | general · security · email · ai | API |
| `/reports(/:tab)` | Reports | 366 | overview · users · courses · files | API |
| `/audit-logs`, `/logs` | AuditLogs | 352 | — | API |
| `/trash(/:tab)` | Trash | 400 | users · roles · courses · files | API |
| `/profile(/:tab)` | Profile | 457 | info · password · notifications · appearance | API جزئي |
| `/404` | NotFound | 49 | — | — |

**الإجمالي:** 19 صفحة / 9,486 سطر. **3 صفحات ما زالت على mock بالكامل:** AI، CourseDetails، Viewer.

## 4. مكوّنات UI (60 مكوّن shadcn + 5 مخصصة للموبايل)

`accordion alert-dialog alert aspect-ratio avatar badge breadcrumb button-group button calendar card carousel chart checkbox collapsible command context-menu data-table dialog drawer dropdown-menu empty field form hover-card input-group input-otp input item kbd label menubar navigation-menu pagination popover progress radio-group resizable scroll-area select separator sheet sidebar skeleton slider sonner spinner switch table tabs textarea toggle-group toggle tooltip`

**مخصصة للموبايل (تُنقل كما هي):** `mobile-data-table` (يتحول إلى كروت < md)، `mobile-list`، `page-tabs` (تبويبات لاصقة قابلة للتمرير أفقياً)، `pull-to-refresh`، `stat-card`.

**أخرى:** `ErrorBoundary.tsx`, `ManusDialog.tsx` (يُحذف — خاص بمنصة Manus), `Map.tsx` (يُحذف — غير مستخدم).

**Hooks:** `use-media-query`, `useApi`, `useComposition`, `useMobile`, `usePersistFn`. **Contexts:** `AuthContext`, `ThemeContext`.

## 5. عقد API الذي تتوقعه الواجهة (من `lib/api.ts`)

| Namespace | الدوال |
|---|---|
| `authApi` | login, logout, getMe, refreshToken, changePassword |
| `usersApi` | getAll(paginated), getById, create, update, delete, resetPassword |
| `rolesApi` | getAll, getById, create, update, delete, getPermissions |
| `coursesApi` | getAll, getById, create, update, delete |
| `filesApi` | getAll, getByCourse, getById, upload(FormData), download, delete |
| `notificationsApi` | getAll, markAsRead, markAllAsRead, send, delete |
| `trashApi` | getAll, restore, permanentDelete, empty |
| `settingsApi` | get(category), update(category) |
| `dashboardApi` | getStats |
| `reportsApi` | getDashboard, getUsers, getCourses, getFiles, getActivity |
| `auditLogsApi` | getAll |
| `academicApi` | departments/majors/levels CRUD |

**قرار معماري:** في Next.js سنستبدل هذا العميل بـ **Server Actions + Route Handlers** مع الحفاظ على نفس الحدود الدلالية (نفس أسماء العمليات) لتسهيل نقل الصفحات.

## 6. اعتماد البيانات الوهمية (`data/mockData.ts` — 710 سطر)

Exports: `users, deletedUsers, roles, permissions, permissionCategories, majors, levels, semesters, courses, files, fileTypes, notifications, notificationTypes, notificationPriorities, auditLogs, systemSettings, dashboardStats, chartData, currentUser, hasPermission`.

**سياسة scam2027:** يُحذف الملف بالكامل. تُستخدم `prisma/seed.ts` لبيانات تجريبية واقعية (مستأجر تجريبي + جامعة تجريبية) وليس mock في العميل.

## 7. أنماط الموبايل الموروثة (يجب الحفاظ عليها)

1. Bottom Navigation بـ 5 عناصر + Drawer للمزيد.
2. جداول تتحول إلى كروت عند < 768px (`mobile-data-table`).
3. تبويبات لاصقة قابلة للتمرير أفقياً (`page-tabs`) — مُصلَحة في ISSUES.md.
4. `min-height: 100dvh` + `padding-bottom: env(safe-area-inset-bottom)`.
5. Pull-to-refresh على القوائم.
6. Dashboard "مضغوط" على الموبايل (commit `b4f8927`).
7. نماذج بعرض كامل، أزرار بارتفاع ≥ 44px.

## 8. عيوب مكتشفة في الواجهة

| # | العيب | الخطورة | المعالجة |
|---|---|---|---|
| UI-01 | JWT في `localStorage` (XSS → سرقة الجلسة) | عالية | كوكيز HttpOnly + SameSite=Lax عبر Auth.js |
| UI-02 | 3 صفحات على mock (AI, CourseDetails, Viewer) | عالية | ربط كامل بالباك إند |
| UI-03 | لا يوجد ForgotPassword / ResetPassword كمسارات مستقلة (فقط `Activate`) | متوسطة | إضافة `/forgot-password`, `/reset-password/[token]`, `/verify-otp` |
| UI-04 | لا فصول دراسية (Semesters) ولا سنوات أكاديمية ولا كليات في الواجهة رغم وجودها في الـ docs و V2 | متوسطة | تبويبات جديدة في `/academic` |
| UI-05 | لا Quizzes / Grades / Enrollments (موجودة في V2 فقط) | عالية | نقل من V2 بالثيم الأخضر |
| UI-06 | `ManusDialog`, `Map` بقايا منصة | منخفضة | حذف |
| UI-07 | `hasPermission` من mock وليس من الجلسة | عالية | من الجلسة (server) |
| UI-08 | لا i18n (نصوص عربية مضمّنة) | متوسطة | `next-intl` مع `ar` افتراضي و `en` |
| UI-09 | لا اختبارات | عالية | Vitest + Playwright (desktop + 390×844) |
| UI-10 | ثيم داكن فقط دون احترام `prefers-color-scheme` | منخفضة | إبقاء داكن افتراضياً + خيار فاتح في Profile/appearance (موجود تبويب appearance بلا وظيفة) |
| UI-11 | تباين `#39ff14` على `#0f172a` = 15.1:1 (ممتاز)، لكن `#94a3b8` على `#1e293b` = 5.6:1 (مقبول AA للنص العادي) | منخفضة | مراجعة أحجام النص الصغير ≥ 14px |
