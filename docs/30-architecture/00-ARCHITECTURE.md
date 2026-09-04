# A0 — المعمارية (System Architecture)

## 1. نظرة عامة

```
                    ┌────────────────────────────────────────────────────────────┐
  ksu.scam.app ───► │  Edge / Reverse Proxy (TLS, HSTS)                          │
  lms.uni.edu.sa ─► │                                                            │
                    └──────────────┬─────────────────────────────────────────────┘
                                   ▼
        ┌──────────────────────────────────────────────────────────────────────┐
        │  Next.js 16 (App Router)  — Node runtime, Docker                     │
        │  ┌──────────────┐  ┌──────────────────┐  ┌────────────────────────┐   │
        │  │ middleware   │─►│ RSC Pages /[locale]│  │ Server Actions        │   │
        │  │ tenant+auth  │  │ (Omnitrix UI)     │  │ + Route Handlers /api │   │
        │  └──────────────┘  └──────────────────┘  └───────────┬────────────┘   │
        │                                                      ▼                │
        │  ┌──────────── features/* (auth, users, roles, academic, offerings,   │
        │  │             enrollments, files, quizzes, grades, notifications,    │
        │  │             ai, reports, settings, trash, privacy, tenant)         │
        │  │    each: actions.ts · schemas.ts · queries.ts · components/        │
        │  └──────────────────────┬─────────────────────────────────────────    │
        │                         ▼                                              │
        │  lib/: auth (Auth.js + RBAC), db (Prisma + tenant ext), storage,      │
        │        mail, ai (provider adapter), jobs, audit, ratelimit, logger    │
        └───────────┬──────────────────┬──────────────────┬─────────────────────┘
                    ▼                  ▼                  ▼
          PostgreSQL 16 (RLS)   Object Storage      Redis (optional)
          tenant_id everywhere  tenant/…/uuid       ratelimit · jobs · cache
                    ▲
          Worker (same codebase, `pnpm worker`) — jobs: import, export, AI, retention, email
```

## 2. المبادئ

1. **الخادم هو الحقيقة:** كل تحقق (Zod)، كل صلاحية (RBAC)، كل نطاق (ownership)، كل عزل (RLS) يحدث على الخادم. العميل يعرض فقط.
2. **مستأجر في كل مكان:** `tenantId` في الجلسة، في كل جدول، في مفاتيح التخزين والكاش، في حمولة كل job.
3. **Feature-sliced:** كل ميزة مجلد مستقل بنمط V2 (`actions.ts` تُرجع `Result<T>` = `{ ok: true, data } | { ok: false, error, code }`).
4. **رفض افتراضي:** لا صلاحية = `FORBIDDEN`. لا مستأجر = 0 صفوف.
5. **واجهة الموبايل أولاً:** كل صفحة تُصمَّم على 390px ثم تتوسع.
6. **الوثائق جزء من التعريف بالمنجز.**

## 3. هيكل المستودع المستهدف

```
scam2027/
├── app/                          # تطبيق Next.js (pnpm)
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/           # تتضمن SQL لـ RLS policies
│   │   └── seed.ts               # مستأجر تجريبي + أدوار + بيانات واقعية
│   ├── src/
│   │   ├── app/
│   │   │   ├── [locale]/
│   │   │   │   ├── (auth)/login | forgot-password | verify-otp | reset-password/[token] | activate/[token]
│   │   │   │   ├── (dashboard)/dashboard | users | roles | academic | courses | course/[id] | offerings | files | viewer/[id] | quizzes | grades | assignments | notifications | ai | reports | audit-logs | trash | settings | profile | privacy
│   │   │   │   ├── (platform)/platform/tenants | subscriptions | audit     # Super Admin
│   │   │   │   ├── developer/
│   │   │   │   └── unauthorized/
│   │   │   ├── api/ health | docs | files/[id]/download | lti/* | webhooks/*
│   │   │   ├── globals.css        # Omnitrix tokens
│   │   │   └── layout.tsx
│   │   ├── components/ ui/ (shadcn + mobile-*) · layout/ (Sidebar, Header, BottomNavigation, MobileDrawer, DashboardLayout)
│   │   ├── features/<feature>/ actions.ts · schemas.ts · queries.ts · components/ · __tests__/
│   │   ├── lib/ auth/ (auth.ts, permissions.ts, rbac.ts) · db/ (prisma.ts, tenant.ts) · storage/ · mail/ · ai/ · jobs/ · audit.ts · ratelimit.ts · logger.ts · env.ts · result.ts
│   │   ├── i18n/ ar.json · en.json · request.ts
│   │   └── middleware.ts          # tenant resolution + auth guard + locale
│   ├── e2e/                       # Playwright (desktop + mobile projects)
│   ├── worker/                    # jobs runner
│   ├── package.json · next.config.ts · tailwind (v4 via CSS) · vitest.config.ts · playwright.config.ts
├── docs/                          # هذا التوثيق
├── .github/workflows/ci.yml
├── docker-compose.yml             # postgres + redis + app + worker (dev/prod)
├── .env.example
├── CHANGELOG.md · README.md · .gitignore
```

## 4. الطلب من البداية للنهاية (Request Lifecycle)

1. `middleware.ts`: يحلّ locale؛ يحلّ `tenant` من host (كاش قصير) → يضع `x-tenant-id` header؛ يفحص الجلسة؛ إن كانت `session.tenantId ≠ tenant.id` → signOut + redirect؛ يحمي مجموعات `(dashboard)` و`(platform)`.
2. RSC page: يستدعي `queries.ts` عبر `db(tenantId)` (Prisma extension تضبط GUC داخل معاملة).
3. تفاعل المستخدم → Server Action: `const ctx = await requireUser(); assertPermission(ctx, 'user.create'); const input = schema.parse(raw); ... await audit(ctx, 'user.create', entity)`.
4. الخطأ → `failure(code, message)` → يُعرض بـ `sonner` toast؛ لا تفاصيل داخلية.
5. الملفات: رفع عبر Route Handler (stream) → storage adapter → سجل `File`.
6. Jobs: `enqueue({ tenantId, type, payload })` → worker يضبط المستأجر → ينفّذ → يكتب نتيجة + إشعار.

## 5. الأمان بالتصميم (خلاصة، التفاصيل في R2)

Argon2id · كوكيز HttpOnly/SameSite · CSP nonce · rate limit · RLS · تدقيق شامل · فحص ملفات · أسرار عبر `env.ts` · gitleaks في CI.

## 6. القابلية للتوسع

- Stateless app → عدة نسخ خلف proxy.
- Postgres مع فهارس `(tenant_id, …)` وقراءات replica لاحقاً.
- Storage كائني مستقل.
- Worker منفصل قابل للتوسع أفقياً.
- خيار "استضافة خاصة" لجامعة = نفس الصورة مع مستأجر واحد.

## 7. المراقبة

`/api/health` (DB, storage, redis) · pino JSON logs بـ `requestId, tenantId, userId(hash)` · مقاييس لكل مستأجر (طلبات، أخطاء، AI tokens، تخزين) في لوحة المنصة · Sentry اختياري عبر env.
