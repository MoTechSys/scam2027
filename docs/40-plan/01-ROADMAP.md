# خارطة الطريق وهيكل تجزئة العمل (Roadmap & WBS)

> 6 مراحل. كل مرحلة لها: هدف، مخرجات، معايير قبول، ومهام مرقّمة `Pn-xx` تُنفَّذ بترتيبها. **كل مهمة = PR واحد على الأقل** يتضمن: الكود + الاختبارات + تحديث الوثائق + سطر CHANGELOG. الحالة تُحدَّث هنا: `☐` / `◐` / `☑`.

## نظرة عامة

| المرحلة | الاسم | الهدف | المخرج القابل للعرض |
|---|---|---|---|
| **P0** | الأساس | مشروع يعمل بثيم أخضر، مستأجر، مصادقة، RBAC، CI، اختبارات | تسجيل دخول لمستأجر تجريبي ولوحة تحكم حقيقية بالثيم الأخضر على الموبايل وسطح المكتب |
| **P1** | النواة الإدارية | مستخدمون، أدوار، بنية أكاديمية كاملة، شُعب، تسجيل، ملفات، إشعارات، سلة، تدقيق، إعدادات، علامة تجارية | إدارة جامعة كاملة من الصفر |
| **P2** | التعليم والذكاء | اختبارات، درجات، عارض ملفات، AI حقيقي بحوكمة، استيراد SIS، بريد، PDPL أساسي | **MVP قابل للبيع لجامعة واحدة** |
| **P3** | النضج | واجبات، تصدير تقارير، MFA، اشتراكات، نسخ احتياطي، PDPL كامل، OpenAPI، إنجليزية | قابل للبيع لعدة جامعات مع امتثال |
| **P4** | التوسّع | SSO، Web Push، حضور، at-risk، PWA، Webhooks | تنافسي مع LMS التجارية |
| **P5** | التكامل | LTI 1.3 Tool، QTI 3.0، OneRoster REST | يندمج في بيئة الجامعة القائمة |

---

## P0 — الأساس (Foundation)

**معايير القبول:** `pnpm build` ✅ · `pnpm test` ✅ · `pnpm e2e` (desktop+mobile) ✅ · CI أخضر · دخول 4 أدوار للمستأجر التجريبي · لوحة تحكم بالثيم الأخضر بلا تمرير أفقي على 390×844 · اختبار عزل المستأجر يمر · `/developer` موجودة · `/api/health` يعمل · 0 انتهاكات axe serious.

| # | المهمة | المتطلبات | حالة |
|---|---|---|---|
| P0-01 | تهيئة `app/` بـ Next.js 16 + TS strict + pnpm + ESLint (next, jsx-a11y, no-restricted-imports, logical-props) + Prettier | NFR-MNT-001 | ☑ |
| P0-02 | Tailwind v4 + tokens Omnitrix + خط Cairo + RTL + `globals.css` | A5 §1 | ☑ |
| P0-03 | نقل مكوّنات shadcn/ui (60) + `mobile-data-table`, `mobile-list`, `page-tabs`, `pull-to-refresh`, `stat-card` | A5 §4 | ☑ |
| P0-04 | التخطيط: `DashboardLayout`, `Sidebar`, `Header`, `BottomNavigation`, `MobileDrawer` (مبنية من مصفوفة الصلاحيات) | A5 §3 | ☑ |
| P0-05 | `next-intl` بنية + `ar.json` أولي + `en.json` هيكلي | FR-I18N-001 | ☑ |
| P0-06 | Prisma + Postgres (docker-compose) + `schema.prisma` P0: Tenant, TenantBranding, Subscription, User, UserProfile, Role, Permission, RolePermission, UserRole, Session, LoginAttempt, VerificationCode, AuditLog, TenantSetting | A2 | ☑ |
| P0-07 | RLS migration generator + `db(tenantId)` extension + دور `app_user` | A1 §2-3 | ☑ |
| P0-08 | `env.ts` (Zod) + `logger` (pino) + `result.ts` + `audit.ts` + `ratelimit.ts` | R2 V13/V16 | ☑ |
| P0-09 | Auth.js Credentials + Argon2id + جلسة DB + قفل + `proxy.ts` (tenant + auth + locale — Next 16) | FR-AUTH-001/002/006/011, FR-TEN-002/003 | ☑ |
| P0-10 | `permissions.ts` (المصفوفة الكاملة `as const`) + `rbac.ts` (`requireUser`, `assertPermission`, …) + اختبار تطابق DB↔ملف | P2 §3 | ☑ |
| P0-11 | `seed.ts`: مستأجر `demo` + 4 أدوار نظامية بصلاحياتها + مستخدمون (admin/academic/instructor/student) + بنية أكاديمية صغيرة واقعية | — | ☑ |
| P0-12 | صفحات: `/login` (بالعلامة التجارية)، `/dashboard` (إحصائيات حقيقية حسب الدور — مطابق للقطة المرجعية)، `/developer`, `/unauthorized`, `/404`, `/tenant-not-found` | FR-SYS-002, FR-RPT-007 | ☑ |
| P0-13 | `/api/health` | FR-SYS-003 | ☑ |
| P0-14 | Vitest (unit + integration بـ DB اختبار) + Playwright (projects: desktop-chromium 1280×800, mobile-safari 390×844) + axe + سكربت crawl لكل مسارات Sidebar لكل دور | GAP-21 | ☑ |
| P0-15 | GitHub Actions CI: lint, typecheck, test, e2e, build, gitleaks, `pnpm audit` | GAP-22 | ☑ |
| P0-16 | قالب PR + `CODEOWNERS` + Definition of Done + تحديث HANDOFF/CHANGELOG | PG-02/05 | ☑ |

## P1 — النواة الإدارية (Admin Core)

**معايير القبول:** مدير النظام يستطيع إعداد جامعة كاملة (Wizard)، إدارة المستخدمين والأدوار، فتح شُعب وتسجيل طلاب، رفع ملفات وموافقتها، إرسال إشعارات موجّهة، استعادة من السلة، مراجعة التدقيق — كل ذلك على الموبايل وسطح المكتب بلا mock. E2E لكل تدفق UC-USR/ROL/ACD/CRS/FIL/NTF/SYS.

| # | المهمة | المتطلبات | حالة |
|---|---|---|---|
| P1-01 | Schema P1: AcademicYear, Semester, College, Department, Major, Level, Course, CourseMajor, CourseOffering, OfferingInstructor, Enrollment, File, FileDownloadLog, Notification, NotificationRecipient, NotificationPreference, Job, PasswordResetToken | A2 | ☑ |
| P1-02 | المستخدمون: list/add/edit/soft-delete/freeze/reset/assign-roles + رقم أكاديمي تلقائي + `/users/[tab]` | FR-USR-001..005, 009..012 | ☑ |
| P1-03 | الأدوار: CRUD + مصفوفة صلاحيات هرمية + منع رفع الامتياز | FR-ROL-001..006 | ☑ |
| P1-04 | البنية الأكاديمية: كليات/أقسام/تخصصات/مستويات/سنوات/فصول + Wizard أول إعداد + `/academic/[tab]` | FR-ACD-001..006 | ☑ |
| P1-05 | المقررات + الشُعب + التسجيل (يدوي/جماعي) + `/courses`, `/course/[id]`, `/offerings/[id]` | FR-CRS-*, FR-OFF-001, FR-ENR-001/002 | ☑ (PR #9 جزء 1: /courses · PR #10 جزء 2: /offerings + roster + تسجيل) |
| P1-06 | الملفات: storage adapter (local/S3)، رفع stream، magic bytes، روابط موقّعة، تصنيف، `/files/[tab]` | FR-FIL-001..008, 011 | ☑ PR #13 |
| P1-07 | الإشعارات: send (targets)، inbox، sent+read stats، عدّاد Header، تفضيلات in-app | FR-NTF-001..005, 008 | ☑ PR #14 |
| P1-08 | سلة المحذوفات الموحّدة + حذف دائم تلقائي بعد 30 يوماً (job) | FR-SYS-001 | ☐ |
| P1-09 | سجل التدقيق: صفحة، فلاتر، تفاصيل diff، تصدير CSV | FR-SET-004 | ☐ |
| P1-10 | الإعدادات: general/security/branding + حقن العلامة التجارية | FR-SET-001/005, FR-TEN-004/007 | ☐ |
| P1-11 | المصادقة المكتملة: تفعيل، استعادة OTP، تذكرني، أول دخول | FR-AUTH-003/004/005/010 | ☐ |
| P1-12 | Worker + جدول Job + بريد (SMTP أساسي للمنصة) للتفعيل/الاستعادة | GAP-24 | ☐ |
| P1-13 | التقارير الأساسية + الرسوم (users/courses/files/overview) | FR-RPT-001/002/003/006 | ☐ |
| P1-14 | البروفايل: info/password/appearance(dark/light)/notifications | FR-USR-011 | ☐ |
| P1-15 | اختبارات: وحدة لكل action، E2E لكل تدفق UC، عزل المستأجر لكل موديل جديد | — | ☐ |

## P2 — التعليم والذكاء (Teaching & AI) → MVP

**معايير القبول:** مدرس ينشئ اختباراً (يدوي + AI مسودة) وينشره؛ طالب يؤديه من الموبايل ويرى درجته؛ دفتر درجات؛ عارض PDF؛ استيراد 1,000 طالب من CSV مع تقرير؛ بريد إشعارات؛ "بياناتي" تصدير؛ حصص AI تعمل.

| # | المهمة | المتطلبات | حالة |
|---|---|---|---|
| P2-01 | Schema P2: Quiz, Question, Option, QuestionBankItem, QuizAttempt, Answer, GradebookColumn, Grade, AIProviderConfig, AIConversation, AIMessage, AISummary, AIGeneratedQuestion, AIUsageLog, AIGenerationJob, SisImport, Consent, DataSubjectRequest, EmailLog, TenantUsage | A2 | ☐ |
| P2-02 | الاختبارات (نقل V2 بالثيم الأخضر): إنشاء/تحرير/نشر/أداء بمؤقّت خادمي/تصحيح آلي ويدوي/نتائج | FR-QUZ-001..006 | ☐ |
| P2-03 | دفتر الدرجات + عرض الطالب + تصدير CSV | FR-GRD-001/002 | ☐ |
| P2-04 | عارض الملفات (PDF/صور/فيديو) بروابط موقّعة + Range | FR-FIL-010 | ☐ |
| P2-05 | AI: adapter (OpenAI-compatible + Gemini)، استخراج نص (pdf-parse, mammoth, pptx)، تلخيص/أسئلة/محادثة، إخفاء PII، حصص، سجل، مسودة/اعتماد، شارة AI، `/ai/[tab]` | FR-AI-001..008 | ☐ |
| P2-06 | استيراد SIS (CSV/XLSX) Dry-run + job + تقرير + ترقية جماعية + تصدير | FR-USR-006/007/008, FR-INT-001 | ☐ |
| P2-07 | البريد لكل مستأجر (SMTP settings + test) + إشعارات نظامية آلية + قناة بريد | FR-SET-006, FR-NTF-006(email)/007 | ☐ |
| P2-08 | موافقة الملفات (اختياري لكل مستأجر) | FR-FIL-009 | ☐ |
| P2-09 | الجلسات النشطة | FR-AUTH-007 | ☐ |
| P2-10 | PDPL أساسي: قبول سياسة الخصوصية، "بياناتي" تصدير، تصنيف ملفات | FR-PDP-001/003 | ☐ |
| P2-11 | تقارير AI + إحصائيات المقرر | FR-RPT-004, FR-CRS-006 | ☐ |
| P2-12 | اختبارات + أداء (N+1 guard، LCP موبايل) + مراجعة ASVS L2 قائمة تحقق | NFR-* | ☐ |

## P3 — النضج (Maturity)

| # | المهمة | المتطلبات | حالة |
|---|---|---|---|
| P3-01 | الواجبات + التسليم + التصحيح + ربط الدرجات | FR-ASG-001 | ☐ |
| P3-02 | بنك الأسئلة + تحليل الاختبارات | FR-QUZ-003/006 | ☐ |
| P3-03 | مقاييس التقدير | FR-GRD-003 | ☐ |
| P3-04 | تصدير التقارير PDF/XLSX | FR-RPT-005 | ☐ |
| P3-05 | MFA TOTP + إلزام حسب الدور | FR-AUTH-008 | ☐ |
| P3-06 | الاشتراكات والحدود + لوحة المنصة `/platform` | FR-TEN-005/006 | ☐ |
| P3-07 | تصدير/نسخ احتياطي المستأجر + سجل + استعادة موثّقة | FR-SET-003, FR-TEN-008 | ☐ |
| P3-08 | PDPL كامل: DSAR، RoPA، احتفاظ + job، حوادث 72h، حزمة امتثال | FR-PDP-002/004..007 | ☐ |
| P3-09 | OpenAPI + `/api/v1` بمفاتيح API لكل مستأجر | FR-SYS-004 | ☐ |
| P3-10 | مركز AI للمدرس + مراجعة | FR-AI-009 | ☐ |
| P3-11 | تقرير "من يملك ماذا" | FR-ROL-007 | ☐ |
| P3-12 | الترجمة الإنجليزية الكاملة | FR-I18N-002 | ☐ |

## P4 — التوسّع (Scale)

| # | المهمة | المتطلبات | حالة |
|---|---|---|---|
| P4-01 | SSO OIDC/SAML لكل مستأجر + JIT | FR-AUTH-009 | ☐ |
| P4-02 | Web Push + تفضيلات القنوات الكاملة | FR-NTF-006(push) | ☐ |
| P4-03 | الحضور (يدوي + QR) | FR-ATT-001/002 | ☐ |
| P4-04 | تنبيهات at-risk | FR-RPT-008 | ☐ |
| P4-05 | PWA (manifest, SW, offline للقراءة) | GAP-25 | ☐ |
| P4-06 | Webhooks | FR-INT-003 | ☐ |
| P4-07 | إصدارات الملفات | FR-FIL-012 | ☐ |

## P5 — التكامل (Interoperability)

| # | المهمة | المتطلبات | حالة |
|---|---|---|---|
| P5-01 | LTI 1.3 Tool: login/launch/jwks + NRPS + AGS | FR-INT-002 | ☐ |
| P5-02 | QTI 3.0 تصدير/استيراد | FR-QUZ-007 | ☐ |
| P5-03 | OneRoster 1.2 REST | FR-INT-001 (توسعة) | ☐ |

---

## قواعد التنفيذ

1. لا ننتقل لمرحلة قبل تحقيق معايير قبول السابقة وتوثيقها في `HANDOFF.md`.
2. كل PR: Conventional Commit، اختبارات، وثائق محدّثة (`01-REQUIREMENTS.md` حالة ☑، هذه الخارطة، `CHANGELOG.md`، الوثيقة المعنية).
3. أي قرار معماري جديد = ADR في `docs/60-adr/`.
4. الفرع `genspark_ai_developer` → PR → `main` (دمج مباشر مصرّح به).
5. تقدير الجهد: P0 ≈ 5–7 أيام عمل وكيل، P1 ≈ 10–14، P2 ≈ 10–14، P3 ≈ 10، P4 ≈ 8، P5 ≈ 6 (تقديرات تخطيط، تُراجع بعد P0).
