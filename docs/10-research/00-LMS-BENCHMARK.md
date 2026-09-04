# R0 — مقارنة معيارية مع أنظمة LMS الرائدة (Moodle · Canvas · Blackboard)

> **الغرض:** استخلاص "الحد الأدنى المتوقّع" من أي نظام يُشترى من جامعة، وتحويله إلى متطلبات في `docs/20-product/01-REQUIREMENTS.md`.
> **المنهج:** بحث ويب متنوع + قراءة وثائق المنتجات (2025–2026). لا يوجد "وكيل فرعي" مستقل في بيئة التنفيذ؛ نُفّذت البحوث مباشرة ومتوازية وتوثّق هنا بشفافية.

## 1. جدول المقارنة

| المحور | Moodle 4.x/5 | Canvas | Blackboard Learn Ultra | **scam2027 (المستهدف)** |
|---|---|---|---|---|
| النموذج | مفتوح المصدر، ذاتي الاستضافة أو MoodleCloud | SaaS + مفتوح | SaaS | SaaS متعدد المستأجرين + خيار استضافة خاصة للجامعة |
| المصادقة | LDAP، SAML2، OAuth2، CAS، MFA | SAML، CAS، LDAP، OIDC، MFA | SAML، LDAP، CAS | كلمة مرور + OTP بريد، TOTP MFA (P3)، OIDC/SAML لكل مستأجر (P4) |
| SIS | CSV/Flat file، Web services، IMS OneRoster | SIS Import CSV (OneRoster-ish)، API | SIS Framework (CSV/XML)، Snapshot | استيراد CSV/XLSX بقالب موثّق + Dry-run + تقرير أخطاء (P2)، OneRoster 1.2 لاحقاً |
| LTI | 1.3 Advantage كامل (منصة + أداة) | 1.3 Advantage | 1.3 Advantage | LTI Tool (P5) ثم Platform |
| الاختبارات | Quiz + بنك أسئلة + QTI import | Quizzes (New Quizzes) + QTI | Tests/Pools | Quizzes + بنك أسئلة + توليد AI + تصدير QTI 3.0 (P5) |
| الواجبات | Assignment + Turnitin plugin | Assignments + SpeedGrader | Assignments + SafeAssign | Assignments + تسليم + تصحيح (P3) |
| الدرجات | Gradebook متقدم | Gradebook + Grading schemes | Grade Center | Gradebook (من V2) + مقاييس (P3) |
| الحضور | Attendance module | via plugins | Attendance (Ultra) | Attendance (P4) |
| التحليلات | Learning Analytics (at-risk models) | Analytics/Insights | Retention Center، Achievements | قواعد تنبيه "معرّض للخطر" (P4) |
| الوصولية | WCAG 2.1 AA + Brickfield | WCAG 2.1 AA + Ally | WCAG 2.1 AA + Ally | WCAG 2.1 AA مثبت بـ axe في CI، RTL أصلي |
| الموبايل | Moodle App (offline) | Canvas Student/Teacher apps | Blackboard app | ويب متجاوب 390×844 + PWA (P4) |
| AI | AI subsystem (Moodle 4.5+) مع سياسات | Canvas AI (IgniteAI) | AI Design Assistant | تلخيص/أسئلة/محادثة مع سجل، حصص، إشراف بشري، إخلاء مسؤولية |
| الإشعارات | Email، Push، In-app، Digest | Notifications preferences per channel | Activity stream | In-app + Email (P2) + Push (P4) + تفضيلات لكل قناة |
| تعدد المستأجرين | Moodle Workplace (multi-tenant) | حسابات فرعية | Institution hierarchy | `Tenant` + RLS + نطاق فرعي + علامة تجارية |
| التقارير | Custom reports، Report builder | Admin analytics، exports | Reports | لوحات + تصدير PDF/XLSX (P3) |
| التدقيق | Logs store | Audit logs (via API) | Audit | سجل تدقيق كامل + تصدير |
| حماية البيانات | GDPR tool (DSAR، data registry، retention) | GDPR/FERPA | GDPR/FERPA | **PDPL** أدوات DSAR + سجل معالجة + احتفاظ + خروقات |

## 2. الدروس المستخلصة

1. **الحد الأدنى للبيع لجامعة** = مصادقة قوية + SIS import + مقررات/شُعب/تسجيل + ملفات + اختبارات + درجات + إشعارات + تقارير + تدقيق + WCAG + موبايل. (P0–P2 في الخارطة.)
2. **ما يميّز scam2027 عن Moodle للجامعات العربية:** RTL أصلي بلا إضافات، واجهة موبايل حديثة، AI مدمج بحوكمة، PDPL مدمج، تعدد مستأجرين بسيط الإدارة، تكلفة تشغيل أقل.
3. **ما يجب ألا نتجاهله:** LTI (لأن الجامعة غالباً لديها LMS)، SSO (لأن الجامعة لن تدير كلمات مرور جديدة)، تصدير البيانات (لأن الجامعة تخشى الاحتكار).
4. **نمط Ally/Retention Center** → مدخل بسيط: تنبيهات قائمة على قواعد، ثم نماذج لاحقاً.
5. **Moodle GDPR tool** نموذج مباشر لأدوات PDPL: سجل الأغراض، طلبات الوصول/المحو، سياسة احتفاظ لكل نوع بيانات.

## 3. المراجع
- 1EdTech LTI Advantage overview — https://www.imsglobal.org/lti-advantage-overview
- 1EdTech LTI standard — https://www.1edtech.org/standards/lti
- Open edX LTI Advantage services — https://docs.openedx.org/en/latest/educators/references/course_development/exercise_tools/use_lti_advantage_features.html
- W3C WCAG 2.2 What's new — https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/
- (مقارنات LMS متعددة 2025–2026 تم الاطلاع عليها عبر البحث؛ الجدول أعلاه تلخيص تحليلي وليس نقلاً.)
