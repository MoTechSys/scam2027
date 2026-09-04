# P2 — مصفوفة الصلاحيات الموحّدة (Unified Permissions Matrix)

> **المشكلة:** وُجد مفردتان: 51 صلاحية `snake_case` هرمية (s-acm-master) و52 كوداً منقّطاً `resource.action` (V2). **القرار (ADR-0003):** المفردة القانونية هي **`resource.action` المنقّطة** (قابلة للتجميع برمجياً، متوافقة مع V2)، مع الحفاظ على **الهرمية ثلاثية المستويات** في واجهة إدارة الأدوار (فئة → مورد → إجراء). يُحفظ تعيين snake_case القديم في §4 لتسهيل نقل الصفحات الخضراء.

## 1. الأدوار النظامية (لا تُحذف، لكل مستأجر)

| الدور | الكود | الوصف |
|---|---|---|
| مدير المنصة | `PLATFORM_SUPER_ADMIN` | خارج المستأجرين؛ يدير المستأجرين والاشتراكات فقط |
| مدير النظام | `TENANT_ADMIN` | كل الصلاحيات داخل مستأجره |
| مدير أكاديمي | `ACADEMIC_ADMIN` | البنية الأكاديمية، المقررات، الشُعب، التسجيل، التقارير |
| مدرس | `INSTRUCTOR` | شُعبه: ملفات، اختبارات، درجات، إشعارات، AI |
| طالب | `STUDENT` | مقرراته: عرض ملفات، أداء اختبارات، درجاته، إشعاراته |
| مخصص | — | أي مجموعة من الصلاحيات دون تجاوز صلاحيات المانح |

## 2. المصفوفة الكاملة (113 صلاحية مستأجر + 8 منصة)

الأعمدة: A = TENANT_ADMIN · AC = ACADEMIC_ADMIN · I = INSTRUCTOR · S = STUDENT. `●` ممنوحة · `◐` ضمن نطاقه فقط (own/enrolled) · `—` لا.

### 2.1 لوحة التحكم (dashboard)
| الكود | الوصف | A | AC | I | S |
|---|---|:-:|:-:|:-:|:-:|
| `dashboard.view` | عرض لوحة التحكم | ● | ● | ● | ● |
| `dashboard.view_system_stats` | إحصائيات النظام الكلية | ● | ● | — | — |

### 2.2 المستخدمون (user)
| الكود | الوصف | A | AC | I | S |
|---|---|:-:|:-:|:-:|:-:|
| `user.view` | عرض القائمة | ● | ● | ◐ | — |
| `user.view_details` | التفاصيل الكاملة | ● | ● | — | — |
| `user.create` | إنشاء | ● | ● | — | — |
| `user.edit` | تعديل | ● | ● | — | — |
| `user.delete` | حذف ناعم | ● | — | — | — |
| `user.restore` | استعادة | ● | — | — | — |
| `user.activate` | تفعيل/تعليق | ● | ● | — | — |
| `user.freeze` | تجميد (إبطال جلسات) | ● | — | — | — |
| `user.reset_password` | إعادة تعيين كلمة مرور | ● | ● | — | — |
| `user.change_role` | تغيير/تعيين أدوار | ● | — | — | — |
| `user.import` | استيراد | ● | ● | — | — |
| `user.export` | تصدير | ● | ● | — | — |
| `user.promote` | ترقية جماعية | ● | ● | — | — |

### 2.3 الأدوار (role)
| الكود | الوصف | A | AC | I | S |
|---|---|:-:|:-:|:-:|:-:|
| `role.view` | عرض | ● | ● | — | — |
| `role.view_permissions` | عرض صلاحيات دور | ● | ● | — | — |
| `role.create` | إنشاء | ● | — | — | — |
| `role.edit` | تعديل | ● | — | — | — |
| `role.edit_permissions` | تعديل صلاحيات | ● | — | — | — |
| `role.delete` | حذف | ● | — | — | — |
| `role.assign` | تعيين لمستخدم | ● | — | — | — |

### 2.4 البنية الأكاديمية (college / department / major / level / semester / year)
| الكود | الوصف | A | AC | I | S |
|---|---|:-:|:-:|:-:|:-:|
| `academic.view` | عرض البنية | ● | ● | ● | ● |
| `college.manage` | كليات CRUD | ● | ● | — | — |
| `department.manage` | أقسام CRUD | ● | ● | — | — |
| `major.manage` | تخصصات CRUD | ● | ● | — | — |
| `level.manage` | مستويات CRUD | ● | ● | — | — |
| `semester.view` | عرض الفصول | ● | ● | ● | ● |
| `semester.manage` | فصول CRUD | ● | ● | — | — |
| `semester.set_current` | تعيين الفصل الحالي | ● | ● | — | — |
| `year.manage` | سنوات أكاديمية CRUD | ● | ● | — | — |

### 2.5 المقررات والشُعب والتسجيل (course / offering / enrollment)
| الكود | الوصف | A | AC | I | S |
|---|---|:-:|:-:|:-:|:-:|
| `course.view` | عرض المقررات | ● | ● | ● | ◐ |
| `course.view_details` | تفاصيل | ● | ● | ● | ◐ |
| `course.create` | إنشاء | ● | ● | — | — |
| `course.edit` | تعديل | ● | ● | — | — |
| `course.delete` | حذف | ● | ● | — | — |
| `course.view_stats` | إحصائيات | ● | ● | ◐ | — |
| `offering.view` | عرض الشُعب | ● | ● | ◐ | ◐ |
| `offering.create` | إنشاء | ● | ● | — | — |
| `offering.edit` | تعديل | ● | ● | ◐ | — |
| `offering.delete` | حذف | ● | ● | — | — |
| `offering.assign_instructor` | تعيين مدرس | ● | ● | — | — |
| `offering.enroll_students` | تسجيل طلاب | ● | ● | ◐ | — |
| `enrollment.view` | عرض التسجيلات | ● | ● | ◐ | ◐ |
| `enrollment.manage` | تعديل/انسحاب | ● | ● | ◐ | — |

### 2.6 الملفات (file)
| الكود | الوصف | A | AC | I | S |
|---|---|:-:|:-:|:-:|:-:|
| `file.view` | عرض/معاينة | ● | ● | ◐ | ◐ |
| `file.download` | تنزيل | ● | ● | ◐ | ◐ |
| `file.upload` | رفع | ● | ● | ◐ | — |
| `file.edit` | تعديل بيانات/إعادة تسمية/نقل | ● | ● | ◐ | — |
| `file.delete` | حذف ملفاتي | ● | ● | ◐ | — |
| `file.approve` | الموافقة على النشر | ● | ● | — | — |
| `file.manage_all` | إدارة كل الملفات | ● | ● | — | — |
| `file.view_stats` | إحصائيات | ● | ● | ◐ | — |

### 2.7 الاختبارات والواجبات والدرجات (quiz / assignment / grade)
| الكود | الوصف | A | AC | I | S |
|---|---|:-:|:-:|:-:|:-:|
| `quiz.view` | عرض | ● | ● | ◐ | ◐ |
| `quiz.create` | إنشاء | ● | — | ◐ | — |
| `quiz.edit` | تعديل | ● | — | ◐ | — |
| `quiz.delete` | حذف | ● | — | ◐ | — |
| `quiz.publish` | نشر | ● | — | ◐ | — |
| `quiz.take` | أداء | — | — | — | ◐ |
| `quiz.grade` | تصحيح | ● | — | ◐ | — |
| `quiz.view_results_all` | نتائج الجميع | ● | ● | ◐ | — |
| `question_bank.manage` | بنك الأسئلة | ● | — | ◐ | — |
| `assignment.view` | عرض | ● | ● | ◐ | ◐ |
| `assignment.manage` | إنشاء/تعديل/حذف | ● | — | ◐ | — |
| `assignment.submit` | تسليم | — | — | — | ◐ |
| `assignment.grade` | تصحيح | ● | — | ◐ | — |
| `grade.view_own` | درجاتي | — | — | — | ● |
| `grade.view_offering` | درجات الشعبة | ● | ● | ◐ | — |
| `grade.edit` | تعديل | ● | — | ◐ | — |
| `grade.export` | تصدير | ● | ● | ◐ | — |
| `gradebook.configure` | أوزان ومقاييس | ● | ● | ◐ | — |

### 2.8 الحضور (attendance)
| الكود | الوصف | A | AC | I | S |
|---|---|:-:|:-:|:-:|:-:|
| `attendance.view` | عرض | ● | ● | ◐ | ◐ |
| `attendance.manage` | تسجيل/تعديل | ● | — | ◐ | — |

### 2.9 الإشعارات (notification)
| الكود | الوصف | A | AC | I | S |
|---|---|:-:|:-:|:-:|:-:|
| `notification.view` | عرض إشعاراتي | ● | ● | ● | ● |
| `notification.send` | إرسال | ● | ● | ◐ | — |
| `notification.send_to_all` | إرسال للجميع | ● | ● | — | — |
| `notification.send_to_role` | لدور | ● | ● | — | — |
| `notification.send_to_offering` | لشعبة | ● | ● | ◐ | — |
| `notification.manage` | إدارة كل الإشعارات | ● | — | — | — |
| `notification.view_sent` | المُرسَلة وإحصاء القراءة | ● | ● | ◐ | — |

### 2.10 الذكاء الاصطناعي (ai)
| الكود | الوصف | A | AC | I | S |
|---|---|:-:|:-:|:-:|:-:|
| `ai.summarize` | تلخيص | ● | ● | ● | ◐ |
| `ai.generate_questions` | توليد أسئلة | ● | — | ● | — |
| `ai.chat` | محادثة مع المحتوى | ● | ● | ● | ◐ |
| `ai.review` | اعتماد مخرجات AI | ● | — | ◐ | — |
| `ai.view_usage` | إحصائيات الاستخدام | ● | ● | ◐ | — |
| `ai.configure` | إعدادات المزوّد/الحصص | ● | — | — | — |

### 2.11 التقارير (report)
| الكود | الوصف | A | AC | I | S |
|---|---|:-:|:-:|:-:|:-:|
| `report.view` | عرض التقارير | ● | ● | ◐ | — |
| `report.users` | تقارير المستخدمين | ● | ● | — | — |
| `report.courses` | تقارير المقررات | ● | ● | ◐ | — |
| `report.files` | تقارير الملفات | ● | ● | ◐ | — |
| `report.ai` | تقارير AI | ● | ● | — | — |
| `report.export` | تصدير PDF/XLSX | ● | ● | ◐ | — |
| `report.at_risk` | تنبيهات الطلاب المعرّضين للخطر | ● | ● | ◐ | — |

### 2.12 النظام (system / settings / audit / trash / backup)
| الكود | الوصف | A | AC | I | S |
|---|---|:-:|:-:|:-:|:-:|
| `settings.view` | عرض الإعدادات | ● | — | — | — |
| `settings.edit_general` | عامة | ● | — | — | — |
| `settings.edit_security` | أمان | ● | — | — | — |
| `settings.edit_email` | بريد | ● | — | — | — |
| `settings.edit_branding` | علامة تجارية | ● | — | — | — |
| `audit.view` | سجل التدقيق | ● | — | — | — |
| `audit.export` | تصدير | ● | — | — | — |
| `trash.view` | سلة المحذوفات | ● | — | — | — |
| `trash.restore` | استعادة | ● | — | — | — |
| `trash.permanent_delete` | حذف دائم | ● | — | — | — |
| `backup.manage` | نسخ احتياطي/تصدير المستأجر | ● | — | — | — |
| `system.health` | صحة النظام والسجلات | ● | — | — | — |

### 2.13 حماية البيانات (privacy)
| الكود | الوصف | A | AC | I | S |
|---|---|:-:|:-:|:-:|:-:|
| `privacy.export_own` | تصدير بياناتي | ● | ● | ● | ● |
| `privacy.request_own` | طلب تصحيح/محو | ● | ● | ● | ● |
| `privacy.manage_dsar` | إدارة طلبات DSAR | ● | — | — | — |
| `privacy.manage_ropa` | سجل المعالجة | ● | — | — | — |
| `privacy.manage_incidents` | سجل الحوادث | ● | — | — | — |

### 2.14 التكاملات (integration)
| الكود | الوصف | A | AC | I | S |
|---|---|:-:|:-:|:-:|:-:|
| `integration.sis_import` | استيراد SIS | ● | ● | — | — |
| `integration.lti_manage` | تسجيلات LTI | ● | — | — | — |
| `integration.webhooks` | Webhooks | ● | — | — | — |

### 2.15 المنصة (platform) — خارج المستأجر
| الكود | الوصف | Super |
|---|---|:-:|
| `platform.tenant.view` / `.create` / `.edit` / `.suspend` / `.delete` | إدارة المستأجرين | ● |
| `platform.subscription.manage` | الاشتراكات والحدود | ● |
| `platform.audit.view` | تدقيق المنصة | ● |
| `platform.impersonate` | دخول دعم مُسجَّل (بموافقة المستأجر) | ● |

## 3. قواعد التنفيذ

1. المصدر البرمجي الوحيد: `app/src/lib/auth/permissions.ts` (`as const` + نوع `Permission`). اختبار يفشل إذا وُجد كود في DB غير معرّف في الملف أو بالعكس.
2. `◐` تُنفَّذ كصلاحية + **فحص نطاق** (`assertOwnsOffering`, `assertEnrolled`) على الخادم — الصلاحية وحدها لا تكفي.
3. Sidebar/BottomNav يُبنى من نفس المصفوفة (`navItems[].permission`).
4. ترحيل الصلاحيات في `prisma/seed.ts` — لكل مستأجر جديد تُنسخ الأدوار النظامية الأربعة بصلاحياتها الافتراضية أعلاه.
5. منع رفع الامتياز: `grantablePermissions(actor) = actor.permissions`؛ أي محاولة منح كود خارجها → `failure('FORBIDDEN')` + تدقيق.

## 4. تعيين المفردة القديمة (للنقل من الواجهة الخضراء)

| snake_case (قديم) | dotted (جديد) |
|---|---|
| `view_dashboard` | `dashboard.view` |
| `view_users` / `view_user_details` / `add_user` / `edit_user` / `delete_user` / `activate_user` / `reset_user_password` / `change_user_role` / `export_users` | `user.view` / `user.view_details` / `user.create` / `user.edit` / `user.delete` / `user.activate` / `user.reset_password` / `user.change_role` / `user.export` |
| `view_roles` / `view_role_permissions` / `add_role` / `edit_role` / `edit_role_permissions` / `delete_role` | `role.view` / `role.view_permissions` / `role.create` / `role.edit` / `role.edit_permissions` / `role.delete` |
| `view_academic` / `view_colleges` / `manage_colleges` / `add_college` / `edit_college` / `delete_college` | `academic.view` / `college.manage` |
| `view_departments` / `manage_departments` / `add_department` / `edit_department` / `delete_department` | `academic.view` / `department.manage` |
| `manage_majors` (Sidebar) | `academic.view` (للعرض) + `major.manage` |
| `view_levels` / `manage_levels` / `add_level` / `edit_level` / `delete_level` | `academic.view` / `level.manage` |
| `manage_semesters` / `add_semester` / `edit_semester` / `delete_semester` | `semester.manage` |
| `view_courses` / `view_course_details` / `add_course` / `edit_course` / `delete_course` / `assign_instructor` / `view_course_stats` / `view_course_files` | `course.view` / `course.view_details` / `course.create` / `course.edit` / `course.delete` / `offering.assign_instructor` / `course.view_stats` / `file.view` |
| `view_files` / `preview_files` / `download_files` / `upload_files` / `edit_files` / `rename_files` / `move_files` / `delete_files` / `approve_files` / `view_file_stats` | `file.view` / `file.view` / `file.download` / `file.upload` / `file.edit` / `file.edit` / `file.edit` / `file.delete` / `file.approve` / `file.view_stats` |
| `view_notifications` / `send_notifications` / `send_to_all` / `send_to_role` / `send_to_user` / `manage_notifications` / `delete_notification` / `edit_notification_settings` | `notification.view` / `notification.send` / `notification.send_to_all` / `notification.send_to_role` / `notification.send` / `notification.manage` / `notification.manage` / `settings.edit_general` |
| `use_ai_summary` / `use_ai_questions` / `use_ai_chat` | `ai.summarize` / `ai.generate_questions` / `ai.chat` |
| `view_reports` / `view_statistics` / `view_user_reports` / `view_course_reports` / `view_file_reports` / `view_activity_stats` / `view_user_stats` / `generate_reports` / `export_reports` / `export_pdf` / `export_excel` | `report.view` / `report.view` / `report.users` / `report.courses` / `report.files` / `report.view` / `report.users` / `report.view` / `report.export` / `report.export` / `report.export` |
| `view_settings` / `edit_settings` / `edit_general_settings` / `edit_security_settings` | `settings.view` / `settings.edit_general` / `settings.edit_general` / `settings.edit_security` |
| `view_audit_logs` / `export_audit_logs` / `filter_logs` / `search_logs` | `audit.view` / `audit.export` / `audit.view` / `audit.view` |
| `view_trash` / `restore_items` / `permanent_delete` / `manage_users` (Sidebar trash) | `trash.view` / `trash.restore` / `trash.permanent_delete` / `trash.view` |
| V2 `system.audit_log` / `system.backup` / `system.reports` / `system.settings` / `system.trash` / `system.trash_restore` | `audit.view` / `backup.manage` / `report.view` / `settings.view` / `trash.view` / `trash.restore` |
| V2 `ai.generate_quiz` | `ai.generate_questions` |
