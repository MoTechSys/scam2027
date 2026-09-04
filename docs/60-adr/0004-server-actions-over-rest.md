# ADR-0004 — Server Actions كطبقة أساسية، وRoute Handlers للحالات HTTP فقط

- **الحالة:** مقبول — 2026-09-04
- **السياق:** الواجهة الخضراء تتوقع عميل REST (`lib/api.ts`)؛ V2 يستخدم Server Actions.
- **القرار:** Server Actions لكل تفاعل الواجهة (بنفس الحدود الدلالية للعميل القديم — `docs/30-architecture/04-API-CONTRACT.md`)؛ Route Handlers فقط لـ: رفع/تنزيل ملفات (stream)، health، OpenAPI/`/api/v1` للتكامل (P3)، LTI (P5)، Webhooks (P4)، cron.
- **البدائل:** REST كامل + fetch من العميل (مرفوض: ازدواج التحقق، حمولة JS أكبر على الموبايل).
- **العواقب:** التكامل الخارجي يحتاج `/api/v1` مستقلاً في P3؛ اختبارات التكامل تستدعي actions مباشرة.
