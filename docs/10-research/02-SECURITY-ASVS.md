# R2 — الأمان: OWASP ASVS 5.0 (المستوى 2) كخط أساس

> ASVS 5.0 صدر في مايو 2025 (~350 متطلباً في 17 فصلاً). **المستوى 2** هو الموصى به للتطبيقات التي تعالج بيانات شخصية/أكاديمية. كل متطلب أدناه يُربط بمعرّف `SEC-R-xx` في المتطلبات وبحالة اختبار.

## 1. الضوابط المعتمدة حسب الفصل

| فصل ASVS | الضابط في scam2027 | التنفيذ | اختبار |
|---|---|---|---|
| V1 Encoding & Sanitization | كل مخرجات React مُهرَّبة؛ Markdown من AI يُنظَّف بـ `rehype-sanitize` | مكتبة | وحدة |
| V2 Validation & Business Logic | Zod على كل Server Action وRoute Handler؛ رفض الحقول غير المعروفة (`.strict()`) | نمط V2 | وحدة |
| V3 Web Frontend Security | CSP صارمة (nonce)، `X-Frame-Options: DENY` (إلا مسارات LTI)، `Referrer-Policy`, HSTS | `next.config` headers + middleware | E2E header check |
| V4 API & Web Service | Route Handlers بمصادقة موحّدة، حد حجم الجسم، CORS مقيّد على المستأجر | middleware | تكامل |
| V5 File Handling | magic bytes، قائمة سماح MIME، حد حجم، اسم ملف مُعاد توليده (UUID)، تخزين خارج الجذر، روابط تنزيل موقّعة قصيرة العمر، `Content-Disposition: attachment` | `file-type` + storage adapter | تكامل |
| V6 Authentication | Argon2id للتجزئة، سياسة كلمات مرور (≥ 12، فحص قائمة شائعة)، قفل بعد 5 محاولات/15 دقيقة، OTP بريد بصلاحية 10 دقائق، TOTP MFA (P3)، رسائل فشل موحّدة | Auth.js Credentials + جداول | وحدة + E2E |
| V7 Session Management | كوكيز `HttpOnly; Secure; SameSite=Lax`، JWT قصير (15 دقيقة) + تدوير refresh، إبطال عند تغيير كلمة المرور/التجميد، عرض الجلسات النشطة وإنهاؤها | Auth.js + جدول `Session` | E2E |
| V8 Authorization | RBAC على الخادم فقط (`require*`/`assert*`)، فحص ملكية الكائن (IDOR)، RLS كخط دفاع ثانٍ، رفض افتراضي | نمط V2 + RLS | وحدة لكل صلاحية + اختبار عزل المستأجر |
| V9 Self-contained Tokens | JWT موقّع HS256/RS256، `aud`/`iss`/`exp` تُفحص، لا بيانات حساسة في الحمولة | Auth.js | وحدة |
| V10 OAuth/OIDC | عند SSO: PKCE، state، nonce، تحقق `iss` لكل مستأجر | P4 | تكامل |
| V11 Cryptography | أسرار من env فقط، تدوير، AES-256-GCM لمفاتيح API المخزّنة لكل مستأجر | `env.ts` Zod | وحدة |
| V12 Secure Communication | TLS 1.2+ فقط، HSTS preload | النشر | فحص خارجي |
| V13 Configuration | `.env.example` بلا قيم؛ رفض الإقلاع إن نقص متغيّر؛ لا Debug في الإنتاج؛ gitleaks في CI | `env.ts` + CI | CI |
| V14 Data Protection | تصنيف البيانات (عام/داخلي/سري/شخصي)، تشفير أعمدة حساسة عند الحاجة، إخفاء في السجلات، حذف ناعم ثم صلب وفق سياسة احتفاظ | Prisma middleware للتنقيح | وحدة |
| V15 Secure Coding & Architecture | تبعيات مثبّتة، `npm audit`/Dependabot، لا `eval`، فصل الطبقات | CI | CI |
| V16 Logging & Error Handling | سجلات منظمة (pino) بلا بيانات شخصية، `requestId`، سجل تدقيق للأحداث الأمنية (دخول/فشل/تغيير صلاحيات/تصدير)، أخطاء عامة للمستخدم | pino + AuditLog | وحدة |
| V17 WebRTC | غير مطبّق | — | — |

## 2. نموذج التهديد المختصر (STRIDE على المستأجر)

| التهديد | السيناريو | الضابط |
|---|---|---|
| Spoofing | مستخدم يزوّر `tenantId` في الطلب | tenantId من الجلسة فقط + تحقق host↔session |
| Tampering | تعديل درجة عبر IDOR | فحص ملكية + RLS + تدقيق |
| Repudiation | مدرس ينكر تعديل درجة | AuditLog غير قابل للتعديل (append-only + hash chain اختياري) |
| Information Disclosure | تسريب ملف عبر رابط عام | روابط موقّعة قصيرة + فحص صلاحية عند كل تنزيل |
| DoS | brute force / رفع ملفات ضخمة | rate limit + حدود حجم + حصص لكل مستأجر |
| Elevation | دور مخصص يمنح `role.assign` لنفسه | منع تعديل الدور الخاص + منع منح صلاحيات أعلى من الممنوحة للمانح |

## 3. المراجع
- OWASP ASVS 5.0 — https://owasp.org/www-project-application-security-verification-standard/
- OWASP Cheat Sheets (Password Storage, Session Management, File Upload) — https://cheatsheetseries.owasp.org/
- NCA ECC-2:2024 (4 مجالات، 28 مجالاً فرعياً، 108 ضوابط) — https://nca.gov.sa/en/regulatory-documents/controls-list/ecc/
