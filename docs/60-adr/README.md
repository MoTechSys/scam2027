# سجل القرارات المعمارية (ADRs)

| # | القرار | الحالة |
|---|---|---|
| [0001](0001-engine-and-ui-sources.md) | المحرّك من V2 والواجهة من s-acm/apps/web | مقبول |
| [0002](0002-shared-schema-multitenancy-rls.md) | تعدد مستأجرين بمخطط مشترك + RLS | مقبول |
| [0003](0003-dotted-permission-codes.md) | صلاحيات `resource.action` | مقبول |
| [0004](0004-server-actions-over-rest.md) | Server Actions أساساً | مقبول |
| [0005](0005-docs-with-every-change.md) | الوثائق جزء من DoD | مقبول |
| [0006](0006-referential-actions-and-json-contracts.md) | قواعد FK/الإسناد + عقود Json + قيود SQL يدوية | مقبول |
| [0007](0007-mobile-app-shell.md) | قشرة تطبيق للجوال: PageHeader في Header، MiniStatCard 3×2، شريط سفلي بنمط تطبيق، manifest | مقبول |
| [0008](0008-app-viewport-scroll-regions.md) | الشاشة viewport ثابت؛ القوائم تُمرَّر داخل `ScrollRegion`؛ `PageShell`؛ زر ☰ في App bar بدل «المزيد» | مقبول |
| [0009](0009-account-recovery-tokens.md) | التفعيل/الاستعادة برابط موقّع أحادي (لا OTP)؛ بريد عبر `Job mail.send`؛ «تذكرني» وإجبار التغيير وسياسة كلمات المرور من `security.*` | مقبول |
| [0010](0010-job-worker.md) | worker مستقل (`pnpm worker`) بحجز `FOR UPDATE SKIP LOCKED` + قفل شرطي موحّد في المعالجات + مسار inline احتياطي (`JOBS_INLINE`) + SMTP عبر nodemailer/Mailpit؛ لا Redis الآن | مقبول |

قالب ADR جديد: `NNNN-title.md` بأقسام: الحالة، السياق، القرار، البدائل، العواقب.
