# 00 — جرد المستودعات وسلالة المشروع (Repository Inventory & Lineage)

> **الهدف:** تحديد كل النسخ السابقة للمشروع بدقة، وعلاقة كل منها بالأخرى، وما الذي يُؤخذ من كل نسخة إلى `scam2027`.
> **المصدر:** فحص مباشر لـ 58 مستودعاً في حساب `MoTechSys` عبر GitHub API، واستنساخ 9 مستودعات ذات صلة إلى `.refs/` (مستثناة من Git).
> **تاريخ الفحص:** 2026-09-04

## 1. جدول الجرد

| # | المستودع | آخر Commit | Commits | ملفات | التقنية | الدور في السلالة |
|---|---|---|---|---|---|---|
| 1 | `MoTechSys/S-ACM-Project` | 2026-01-29 `b4f8927` | 13 | 125 | React 19 + Vite + wouter + Tailwind v4 (Omnitrix أخضر) | **النموذج الأول للواجهة الخضراء** — مصدر لقطة الشاشة التي أرسلها المستخدم (`client/src/pages/Dashboard.tsx`). بيانات وهمية بالكامل. |
| 2 | `MoTechSys/s-acm-frontend` | 2026-01-30 `ee6de12` | 30 | 141 | نفس الستاك | تطوّر #1؛ إضافة `lib/api.ts` وربط جزئي بالـ API. |
| 3 | `MoTechSys/s-acm-master` | 2026-01-30 `a84d503` | 3 | 15 | Markdown فقط | **مستودع التوثيق الرسمي**: `docs/permissions/SYSTEM.md` (51 صلاحية)، `docs/workflows/FLOWS.md` (10 تدفقات)، `docs/project/UNDERSTANDING.md`، `ROADMAP.md`، `docs/design/THEME.md`. |
| 4 | `MoTechSys/s-acm` | 2026-02-01 `489a92a` | 5 | 183 | Monorepo: `apps/web` (نسخة #2 مطابقة) + `apps/api` (Hono + Drizzle + Supabase) + `docs/` | **النسخة القانونية (Canonical) للواجهة الخضراء** + أول Backend حقيقي (12 جدول). |
| 5 | `MoTechSys/s-acm-backend` | 2026-01-30 `b145854` | 7 | 39 | Hono + Drizzle + Supabase Storage | النسخة المستقلة من `s-acm/apps/api` (قبل الدمج في Monorepo). |
| 6 | `MoTechSys/SCAM` | 2026-02-01 `f98c025` | 6 | 150 | نسخة نشر من #4 | يحوي `HANDOVER.md` و`TEST_REPORT.md`. ⚠️ **يحوي سرّاً مكشوفاً** (كلمة مرور قاعدة Supabase ومعرّف المشروع) — يجب تدويره ولا يُنسخ أبداً. |
| 7 | `MoTechSys/scamV9` | 2026-02-17 `a05960a` | 56 | 214 | Django 6 + HTMX + Gemini | **إعادة كتابة كاملة** بـ Django: 27 موديل، 57 اختبار، وثائق تحليل شاملة (`S-ACM_FULL_ANALYSIS.md`، `UNICORE_PLAN.md`، `MASTER_PROMPT.md`). ليس أخضر. |
| 8 | `MoTechSys/UniCore-OS` | 2026-02-07 `6c56cc9` | 17 | 167 | Next.js (نسخة أولى) | الجيل الأول من UniCore. |
| 9 | `MoTechSys/UniCore-OS-V2` | 2026-09-04 `739231b` | 42 | 258 | Next.js 16.1.6 + React 19.2.3 + Prisma 5.22 + NextAuth v5 beta.30 + Tailwind v4 + Vitest 4 + Playwright 1.62 | **المحرّك الأكثر اكتمالاً وظيفياً**: 22 موديل Prisma، 52 كود صلاحية، 15 وحدة ميزات، اختبارات وحدة وE2E، Quizzes/Grades/Enrollments/Offerings/Semesters. ثيم مختلف (ليس أخضر). |
| 10 | `MoTechSys/scam2027` | — | 0 | 0 | **الهدف** | المستودع الحالي — سيجمع: واجهة #4 الخضراء + محرّك #9 + تعدد المستأجرين + ما ينقص الجميع. |

## 2. شجرة السلالة (Lineage)

```
S-ACM-Project (UI أخضر، mock)  ──►  s-acm-frontend (UI + api.ts)  ──►  s-acm/apps/web  ══►  [الواجهة المعتمدة]
                                                                          │
s-acm-backend (Hono/Drizzle)  ─────────────────────────────────────────►  s-acm/apps/api  ──►  SCAM (نشر)
                                                                          │
s-acm-master (Docs: 51 perms, 10 flows) ──────────────────────────────────┘
                                                                          
scamV9 (Django rewrite + تحليل شامل + 11 Bug)  ──►  UniCore-OS  ──►  UniCore-OS-V2  ══►  [المحرّك المعتمد]

                                    scam2027 = s-acm/apps/web (UI) ⊕ UniCore-OS-V2 (engine) ⊕ Multi-tenancy ⊕ Gap fixes
```

## 3. ما يُؤخذ من كل نسخة

| المصدر | يُؤخذ | لا يُؤخذ |
|---|---|---|
| `s-acm/apps/web` | نظام الألوان Omnitrix (`index.css`)، التخطيط (Sidebar/Header/BottomNavigation/MobileDrawer)، 60 مكوّن shadcn مضبوط للموبايل (`mobile-data-table`, `mobile-list`, `page-tabs`, `pull-to-refresh`, `stat-card`)، بنية الصفحات والتبويبات، الرسوم (Recharts)، خط Cairo، RTL | wouter (سيُستبدل بـ App Router)، `mockData.ts`، تخزين JWT في localStorage، أي منطق أعمال في العميل |
| `UniCore-OS-V2` | مخطط Prisma (22 موديل) كأساس، أكواد الصلاحيات المنقّطة، نمط `require*/assert*/failure()`، Server Actions، Zod، Vitest/Playwright، صفحة `/developer`، ميزات Quizzes/Grades/Enrollments/Offerings/Semesters | الثيم البصري، أي صفحة لا تلتزم بمعيار الموبايل 390×844 |
| `s-acm/apps/api` | تصميم مسارات REST كمرجع للعقد، منطق سلة المحذوفات (restore/permanent/empty)، إعدادات حسب الفئة (`/settings/:category`)، محادثات AI (`aiConversations`) | Drizzle/Supabase (سنستخدم Prisma/Postgres ذاتي الإدارة) |
| `s-acm-master/docs` | الصلاحيات الهرمية ثلاثية المستويات (51)، تدفقات العمل (10)، فهم الصفحات (5 مصادقة + 14 نظام) | — |
| `s-acm/docs/analysis` | 59 متطلباً وظيفياً (FR-*) و NFR، حالات الاستخدام (UC-*) | — |
| `scamV9` | قائمة الأخطاء BUG-001..011، متطلبات المحاضر (إدارة إشعارات، مركز AI، صفحة استخدام AI)، `StudentProgress`, `AIUsageLog`, `NotificationPreference`, `APIKey` كأفكار موديلات | Django/HTMX |
| `SCAM/HANDOVER.md` | **لا شيء** — يُسجَّل فقط كاكتشاف أمني (سر مكشوف) | كل شيء |

## 4. ملاحظات الجرد

1. `s-acm/apps/web/src` مطابق لـ `s-acm-frontend/client/src` باستثناء `lib/api.ts` (نسخة `s-acm` أحدث وأكثر شمولاً).
2. لا توجد اختبارات آلية في أي نسخة خضراء. الاختبارات موجودة فقط في `scamV9` (57 Django tests) و `UniCore-OS-V2` (Vitest + Playwright).
3. لا توجد CI في أي نسخة (لا `.github/workflows`).
4. لا يوجد أي مستودع يدعم **تعدد المستأجرين** (Multi-tenancy) — مطلب جوهري للبيع لعدة جامعات.
5. لا يوجد أي مستودع يعالج **PDPL السعودي** (حقوق أصحاب البيانات، سجل المعالجة، الإبلاغ عن الخروقات).
6. ملفات المرجع محفوظة في `/home/user/webapp/.refs/` ومستثناة عبر `.gitignore`؛ يجب إعادة استنساخها عند بدء بيئة جديدة (انظر `docs/90-handoff/HANDOFF.md`).
