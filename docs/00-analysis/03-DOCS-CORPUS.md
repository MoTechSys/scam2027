# 03 — فهرس التوثيق الموروث (Legacy Documentation Corpus)

> كل وثيقة موروثة، أين توجد، ماذا تحوي، وكيف استُوعبت في `scam2027`.

## 1. `s-acm/docs` و `s-acm-master/docs` (التوثيق الرسمي للواجهة الخضراء)

| الملف | المحتوى | الاستيعاب في scam2027 |
|---|---|---|
| `analysis/01-project-overview.md` | نظرة عامة على S-ACM | `README.md` |
| `analysis/02-requirements.md` | **59 FR** (`FR-USR-001..010, FR-ROL-001..005, FR-CRS-001..006, FR-FIL-001..008, FR-ACD-001..005, FR-NTF-001..005, FR-AI-001..005, FR-RPT-001..006, FR-SET-001..004, FR-AUTH-001..005`) + NFR (`PER, SEC, USA, COM, MNT, AVL`) | `docs/20-product/01-REQUIREMENTS.md` (موحّدة ومرقّمة، مع إضافات) |
| `analysis/03-user-roles.md` | الأدوار: مدير النظام، مدير أكاديمي، مدرس، طالب | مصفوفة الأدوار |
| `analysis/04-use-cases.md` | `UC-AUTH-001/002, UC-USR-001/002/003, UC-FIL-001, UC-AI-001/002/003, UC-NTF-001, UC-RPT-001` | `docs/20-product/03-USE-CASES.md` |
| `permissions/SYSTEM.md` | **51 صلاحية snake_case** هرمية 3 مستويات | `docs/20-product/02-PERMISSIONS-MATRIX.md` |
| `workflows/FLOWS.md` | **10 تدفقات**: مصادقة (دخول/تفعيل/استعادة)، مستخدمون (إضافة/تعديل/حذف)، أدوار (إنشاء/تعديل صلاحيات)، مقررات (إضافة/تعيين مدرس)، ملفات (رفع/موافقة)، AI (تلخيص/توليد أسئلة) | `docs/20-product/03-USE-CASES.md` |
| `project/UNDERSTANDING.md` | 5 صفحات مصادقة + 14 صفحة نظام + علاقة المستودعات | `00-INVENTORY.md`, `01-UI-AUDIT.md` |
| `project/ROADMAP.md` | خارطة طريق سابقة (غير مكتملة) | حلّت محلها `docs/40-plan/01-ROADMAP.md` |
| `design/THEME.md`, `design/02-ui-design.md`, `design/03-components.md` | الثيم Omnitrix والمكوّنات | `01-UI-AUDIT.md` §1, §4 |
| `design/01-architecture.md` | معمارية Hono/Supabase | مرجعية فقط |
| `guides/DEVELOPER.md`, `guides/SUPABASE_SETUP.md` | إعداد بيئة قديمة | مستبدلة بـ `docs/90-handoff/HANDOFF.md` |
| `changelog/CHANGELOG.md`, `changelog/ISSUES.md` | إصلاحات: sticky tabs، `dvh/svh`/safe-area، menuItems import، روابط nav | حالات اختبار انحدار للموبايل |

## 2. `scamV9` (Django)

| الملف | المحتوى | الاستيعاب |
|---|---|---|
| `S-ACM_FULL_ANALYSIS.md` | **BUG-001..011** + متطلبات المحاضر (إدارة إشعارات، مركز AI، صفحة استخدام AI، تنبيهات الطالب، إعادة تصميم البروفايل/كلمة المرور، تنظيف legacy) | `04-GAP-ANALYSIS.md` §5 كحالات انحدار + متطلبات جديدة |
| `UNICORE_PLAN.md` | خطة الانتقال إلى UniCore | مرجعية |
| `التحليل_الشامل.md`, `COMPREHENSIVE_ANALYSIS_2.md` | تحليل وظيفي عميق | مرجعية |
| `MASTER_PROMPT.md` | برومبت رئيسي للوكيل السابق | مرجعية |
| `docs/ARCHITECTURE.md` | معمارية Django | مرجعية |
| `CHANGELOG.md` | تاريخ V9 | مرجعية |

**BUG-001..011 (تُحوَّل إلى اختبارات انحدار):**
1. خدمة AI معطلة بالكامل → اختبار تكامل AI بمفتاح وهمي.
2. قوالب AI غير موجودة → اختبار وجود مسارات `/ai/*`.
3. Profile Form غير ممرر → اختبار E2E حفظ البروفايل.
4. تغيير كلمة المرور — عدم تطابق الحقول → اختبار Zod `confirm === password`.
5. Context Processor للإشعارات معطل → اختبار عدّاد الإشعارات في Header.
6. `OPENAI_BASE_URL` رابط Redirect → تحقق Zod من env عند الإقلاع.
7. `SECRET_KEY` مكرر في `.env` → `env.ts` بـ Zod يرفض التكرار/الفراغ.
8. N+1 في Dashboard → اختبار عدد الاستعلامات (Prisma `$on('query')`).
9. البروفايل يستخدم base غير صحيح → E2E layout.
10. Sidebar للمدرس بلا رابط إرسال إشعارات → اختبار Sidebar لكل دور.
11. Notifications dropdown نص ثابت → اختبار بيانات حقيقية.

## 3. `UniCore-OS-V2/docs`

| الملف | المحتوى | الاستيعاب |
|---|---|---|
| `HANDOFF.md` | §0-10: حالة المشروع، بيانات الدخول، قرارات، مشاكل معروفة (ملف `/logs` مفقود) | `docs/90-handoff/HANDOFF.md` (جديد) |
| `MASTER_BLUEPRINT.md` | المخطط الرئيسي لـ V2 | `docs/30-architecture/00-ARCHITECTURE.md` |
| `DATABASE_DOCUMENTATION.md`, `ERD.svg` | 22 موديل | `docs/30-architecture/02-DATA-MODEL.md` |
| `AUTH_SYSTEM_REPORT.md` | NextAuth v5 + RBAC | `docs/30-architecture/03-AUTH-RBAC.md` |
| `AUDIT_REPORT_2026-09-03.md` | تدقيق شامل | `04-GAP-ANALYSIS.md` |
| `MIGRATION_*.md`, `RECOVERY_PLAN.md`, `PROJECT_STATUS.md`, `ROADMAP.md`, `NEXT_AGENT_PROMPT.txt` | إدارة انتقال | مرجعية |

## 4. `SCAM`

| الملف | المحتوى | الاستيعاب |
|---|---|---|
| `HANDOVER.md` | تسليم نشر — **يحوي سراً مكشوفاً** | SEC-01 فقط. لا يُنسخ. |
| `TEST_REPORT.md` | تقرير اختبار يدوي | حالات اختبار |

## 5. ملخّص الاستيعاب

- **متطلبات:** 59 FR + NFR ← `s-acm` ⊕ 52 قدرة ← `V2` ⊕ متطلبات المحاضر ← `scamV9` ⊕ **جديد:** تعدد المستأجرين، PDPL، SIS import/export، SSO، LTI، i18n، نسخ احتياطي.
- **صلاحيات:** 51 snake_case ⊕ 52 dotted → مصفوفة موحّدة واحدة.
- **تدفقات:** 10 ← `s-acm-master` ⊕ تدفقات Quizzes/Enrollments ← `V2` ⊕ تدفقات المستأجر/DSAR (جديد).
- **أخطاء تاريخية:** 11 BUG + 4 ISSUES ← اختبارات انحدار إلزامية.
