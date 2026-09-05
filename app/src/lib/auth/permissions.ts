/**
 * Permission catalogue — GENERATED from docs/20-product/02-PERMISSIONS-MATRIX.md by scripts/gen-permissions.py
 * DO NOT EDIT BY HAND. ADR-0003: dotted `resource.action` codes.
 *
 * Scope legend (matches the matrix): "all" = ● granted tenant-wide · "own" = ◐ limited to own/enrolled scope.
 * Scope is enforced by assert* helpers in rbac.ts (e.g. assertOwnsOffering), not by the code itself.
 */

export type PermissionScope = "all" | "own";

export interface PermissionDef {
  readonly code: PermissionCode;
  readonly group: PermissionGroup;
  readonly description: string;
}

export const SYSTEM_ROLES = ["TENANT_ADMIN", "ACADEMIC_ADMIN", "INSTRUCTOR", "STUDENT"] as const;
export type SystemRoleCode = (typeof SYSTEM_ROLES)[number];

export const PLATFORM_ROLE = "PLATFORM_SUPER_ADMIN" as const;

export const PERMISSION_GROUPS = {
  dashboard: "لوحة التحكم",
  user: "المستخدمون",
  role: "الأدوار",
  academic: "البنية الأكاديمية",
  college: "البنية الأكاديمية",
  department: "البنية الأكاديمية",
  major: "البنية الأكاديمية",
  level: "البنية الأكاديمية",
  semester: "البنية الأكاديمية",
  year: "البنية الأكاديمية",
  course: "المقررات والشُعب والتسجيل",
  offering: "المقررات والشُعب والتسجيل",
  enrollment: "المقررات والشُعب والتسجيل",
  file: "الملفات",
  quiz: "الاختبارات والواجبات والدرجات",
  question_bank: "الاختبارات والواجبات والدرجات",
  assignment: "الاختبارات والواجبات والدرجات",
  grade: "الاختبارات والواجبات والدرجات",
  gradebook: "الاختبارات والواجبات والدرجات",
  attendance: "الحضور",
  notification: "الإشعارات",
  ai: "الذكاء الاصطناعي",
  report: "التقارير",
  settings: "النظام",
  audit: "النظام",
  trash: "النظام",
  backup: "النظام",
  system: "النظام",
  privacy: "حماية البيانات",
  integration: "التكاملات",
} as const;
export type PermissionGroup = keyof typeof PERMISSION_GROUPS;

export const PERMISSIONS = [
  // ── dashboard — لوحة التحكم
  { code: "dashboard.view", group: "dashboard", description: "عرض لوحة التحكم" },
  { code: "dashboard.view_system_stats", group: "dashboard", description: "إحصائيات النظام الكلية" },
  // ── user — المستخدمون
  { code: "user.view", group: "user", description: "عرض القائمة" },
  { code: "user.view_details", group: "user", description: "التفاصيل الكاملة" },
  { code: "user.create", group: "user", description: "إنشاء" },
  { code: "user.edit", group: "user", description: "تعديل" },
  { code: "user.delete", group: "user", description: "حذف ناعم" },
  { code: "user.restore", group: "user", description: "استعادة" },
  { code: "user.activate", group: "user", description: "تفعيل/تعليق" },
  { code: "user.freeze", group: "user", description: "تجميد (إبطال جلسات)" },
  { code: "user.reset_password", group: "user", description: "إعادة تعيين كلمة مرور" },
  { code: "user.change_role", group: "user", description: "تغيير/تعيين أدوار" },
  { code: "user.import", group: "user", description: "استيراد" },
  { code: "user.export", group: "user", description: "تصدير" },
  { code: "user.promote", group: "user", description: "ترقية جماعية" },
  // ── role — الأدوار
  { code: "role.view", group: "role", description: "عرض" },
  { code: "role.view_permissions", group: "role", description: "عرض صلاحيات دور" },
  { code: "role.create", group: "role", description: "إنشاء" },
  { code: "role.edit", group: "role", description: "تعديل" },
  { code: "role.edit_permissions", group: "role", description: "تعديل صلاحيات" },
  { code: "role.delete", group: "role", description: "حذف" },
  { code: "role.assign", group: "role", description: "تعيين لمستخدم" },
  // ── academic — البنية الأكاديمية
  { code: "academic.view", group: "academic", description: "عرض البنية" },
  // ── college — البنية الأكاديمية
  { code: "college.manage", group: "college", description: "كليات CRUD" },
  // ── department — البنية الأكاديمية
  { code: "department.manage", group: "department", description: "أقسام CRUD" },
  // ── major — البنية الأكاديمية
  { code: "major.manage", group: "major", description: "تخصصات CRUD" },
  // ── level — البنية الأكاديمية
  { code: "level.manage", group: "level", description: "مستويات CRUD" },
  // ── semester — البنية الأكاديمية
  { code: "semester.view", group: "semester", description: "عرض الفصول" },
  { code: "semester.manage", group: "semester", description: "فصول CRUD" },
  { code: "semester.set_current", group: "semester", description: "تعيين الفصل الحالي" },
  // ── year — البنية الأكاديمية
  { code: "year.manage", group: "year", description: "سنوات أكاديمية CRUD" },
  // ── course — المقررات والشُعب والتسجيل
  { code: "course.view", group: "course", description: "عرض المقررات" },
  { code: "course.view_details", group: "course", description: "تفاصيل" },
  { code: "course.create", group: "course", description: "إنشاء" },
  { code: "course.edit", group: "course", description: "تعديل" },
  { code: "course.delete", group: "course", description: "حذف" },
  { code: "course.view_stats", group: "course", description: "إحصائيات" },
  // ── offering — المقررات والشُعب والتسجيل
  { code: "offering.view", group: "offering", description: "عرض الشُعب" },
  { code: "offering.create", group: "offering", description: "إنشاء" },
  { code: "offering.edit", group: "offering", description: "تعديل" },
  { code: "offering.delete", group: "offering", description: "حذف" },
  { code: "offering.assign_instructor", group: "offering", description: "تعيين مدرس" },
  { code: "offering.enroll_students", group: "offering", description: "تسجيل طلاب" },
  // ── enrollment — المقررات والشُعب والتسجيل
  { code: "enrollment.view", group: "enrollment", description: "عرض التسجيلات" },
  { code: "enrollment.manage", group: "enrollment", description: "تعديل/انسحاب" },
  // ── file — الملفات
  { code: "file.view", group: "file", description: "عرض/معاينة" },
  { code: "file.download", group: "file", description: "تنزيل" },
  { code: "file.upload", group: "file", description: "رفع" },
  { code: "file.edit", group: "file", description: "تعديل بيانات/إعادة تسمية/نقل" },
  { code: "file.delete", group: "file", description: "حذف ملفاتي" },
  { code: "file.approve", group: "file", description: "الموافقة على النشر" },
  { code: "file.manage_all", group: "file", description: "إدارة كل الملفات" },
  { code: "file.view_stats", group: "file", description: "إحصائيات" },
  // ── quiz — الاختبارات والواجبات والدرجات
  { code: "quiz.view", group: "quiz", description: "عرض" },
  { code: "quiz.create", group: "quiz", description: "إنشاء" },
  { code: "quiz.edit", group: "quiz", description: "تعديل" },
  { code: "quiz.delete", group: "quiz", description: "حذف" },
  { code: "quiz.publish", group: "quiz", description: "نشر" },
  { code: "quiz.take", group: "quiz", description: "أداء" },
  { code: "quiz.grade", group: "quiz", description: "تصحيح" },
  { code: "quiz.view_results_all", group: "quiz", description: "نتائج الجميع" },
  // ── question_bank — الاختبارات والواجبات والدرجات
  { code: "question_bank.manage", group: "question_bank", description: "بنك الأسئلة" },
  // ── assignment — الاختبارات والواجبات والدرجات
  { code: "assignment.view", group: "assignment", description: "عرض" },
  { code: "assignment.manage", group: "assignment", description: "إنشاء/تعديل/حذف" },
  { code: "assignment.submit", group: "assignment", description: "تسليم" },
  { code: "assignment.grade", group: "assignment", description: "تصحيح" },
  // ── grade — الاختبارات والواجبات والدرجات
  { code: "grade.view_own", group: "grade", description: "درجاتي" },
  { code: "grade.view_offering", group: "grade", description: "درجات الشعبة" },
  { code: "grade.edit", group: "grade", description: "تعديل" },
  { code: "grade.export", group: "grade", description: "تصدير" },
  // ── gradebook — الاختبارات والواجبات والدرجات
  { code: "gradebook.configure", group: "gradebook", description: "أوزان ومقاييس" },
  // ── attendance — الحضور
  { code: "attendance.view", group: "attendance", description: "عرض" },
  { code: "attendance.manage", group: "attendance", description: "تسجيل/تعديل" },
  // ── notification — الإشعارات
  { code: "notification.view", group: "notification", description: "عرض إشعاراتي" },
  { code: "notification.send", group: "notification", description: "إرسال" },
  { code: "notification.send_to_all", group: "notification", description: "إرسال للجميع" },
  { code: "notification.send_to_role", group: "notification", description: "لدور" },
  { code: "notification.send_to_offering", group: "notification", description: "لشعبة" },
  { code: "notification.manage", group: "notification", description: "إدارة كل الإشعارات" },
  { code: "notification.view_sent", group: "notification", description: "المُرسَلة وإحصاء القراءة" },
  // ── ai — الذكاء الاصطناعي
  { code: "ai.summarize", group: "ai", description: "تلخيص" },
  { code: "ai.generate_questions", group: "ai", description: "توليد أسئلة" },
  { code: "ai.chat", group: "ai", description: "محادثة مع المحتوى" },
  { code: "ai.review", group: "ai", description: "اعتماد مخرجات AI" },
  { code: "ai.view_usage", group: "ai", description: "إحصائيات الاستخدام" },
  { code: "ai.configure", group: "ai", description: "إعدادات المزوّد/الحصص" },
  // ── report — التقارير
  { code: "report.view", group: "report", description: "عرض التقارير" },
  { code: "report.users", group: "report", description: "تقارير المستخدمين" },
  { code: "report.courses", group: "report", description: "تقارير المقررات" },
  { code: "report.files", group: "report", description: "تقارير الملفات" },
  { code: "report.ai", group: "report", description: "تقارير AI" },
  { code: "report.export", group: "report", description: "تصدير PDF/XLSX" },
  { code: "report.at_risk", group: "report", description: "تنبيهات الطلاب المعرّضين للخطر" },
  // ── settings — النظام
  { code: "settings.view", group: "settings", description: "عرض الإعدادات" },
  { code: "settings.edit_general", group: "settings", description: "عامة" },
  { code: "settings.edit_security", group: "settings", description: "أمان" },
  { code: "settings.edit_email", group: "settings", description: "بريد" },
  { code: "settings.edit_branding", group: "settings", description: "علامة تجارية" },
  // ── audit — النظام
  { code: "audit.view", group: "audit", description: "سجل التدقيق" },
  { code: "audit.export", group: "audit", description: "تصدير" },
  // ── trash — النظام
  { code: "trash.view", group: "trash", description: "سلة المحذوفات" },
  { code: "trash.restore", group: "trash", description: "استعادة" },
  { code: "trash.permanent_delete", group: "trash", description: "حذف دائم" },
  // ── backup — النظام
  { code: "backup.manage", group: "backup", description: "نسخ احتياطي/تصدير المستأجر" },
  // ── system — النظام
  { code: "system.health", group: "system", description: "صحة النظام والسجلات" },
  // ── privacy — حماية البيانات
  { code: "privacy.export_own", group: "privacy", description: "تصدير بياناتي" },
  { code: "privacy.request_own", group: "privacy", description: "طلب تصحيح/محو" },
  { code: "privacy.manage_dsar", group: "privacy", description: "إدارة طلبات DSAR" },
  { code: "privacy.manage_ropa", group: "privacy", description: "سجل المعالجة" },
  { code: "privacy.manage_incidents", group: "privacy", description: "سجل الحوادث" },
  // ── integration — التكاملات
  { code: "integration.sis_import", group: "integration", description: "استيراد SIS" },
  { code: "integration.lti_manage", group: "integration", description: "تسجيلات LTI" },
  { code: "integration.webhooks", group: "integration", description: "Webhooks" },
] as const satisfies readonly { code: string; group: PermissionGroup; description: string }[];

export type PermissionCode = (typeof PERMISSIONS)[number]["code"];

export const PERMISSION_CODES: readonly PermissionCode[] = PERMISSIONS.map((p) => p.code);

export const PERMISSION_COUNT = PERMISSIONS.length;

/**
 * Default grants for system roles. Value = scope ("all" | "own"). Absent = not granted.
 * Seeded into RolePermission for every new tenant.
 */
export const SYSTEM_ROLE_GRANTS: Record<
  SystemRoleCode,
  Readonly<Partial<Record<PermissionCode, PermissionScope>>>
> = {
  TENANT_ADMIN: {
    "dashboard.view": "all",
    "dashboard.view_system_stats": "all",
    "user.view": "all",
    "user.view_details": "all",
    "user.create": "all",
    "user.edit": "all",
    "user.delete": "all",
    "user.restore": "all",
    "user.activate": "all",
    "user.freeze": "all",
    "user.reset_password": "all",
    "user.change_role": "all",
    "user.import": "all",
    "user.export": "all",
    "user.promote": "all",
    "role.view": "all",
    "role.view_permissions": "all",
    "role.create": "all",
    "role.edit": "all",
    "role.edit_permissions": "all",
    "role.delete": "all",
    "role.assign": "all",
    "academic.view": "all",
    "college.manage": "all",
    "department.manage": "all",
    "major.manage": "all",
    "level.manage": "all",
    "semester.view": "all",
    "semester.manage": "all",
    "semester.set_current": "all",
    "year.manage": "all",
    "course.view": "all",
    "course.view_details": "all",
    "course.create": "all",
    "course.edit": "all",
    "course.delete": "all",
    "course.view_stats": "all",
    "offering.view": "all",
    "offering.create": "all",
    "offering.edit": "all",
    "offering.delete": "all",
    "offering.assign_instructor": "all",
    "offering.enroll_students": "all",
    "enrollment.view": "all",
    "enrollment.manage": "all",
    "file.view": "all",
    "file.download": "all",
    "file.upload": "all",
    "file.edit": "all",
    "file.delete": "all",
    "file.approve": "all",
    "file.manage_all": "all",
    "file.view_stats": "all",
    "quiz.view": "all",
    "quiz.create": "all",
    "quiz.edit": "all",
    "quiz.delete": "all",
    "quiz.publish": "all",
    "quiz.grade": "all",
    "quiz.view_results_all": "all",
    "question_bank.manage": "all",
    "assignment.view": "all",
    "assignment.manage": "all",
    "assignment.grade": "all",
    "grade.view_offering": "all",
    "grade.edit": "all",
    "grade.export": "all",
    "gradebook.configure": "all",
    "attendance.view": "all",
    "attendance.manage": "all",
    "notification.view": "all",
    "notification.send": "all",
    "notification.send_to_all": "all",
    "notification.send_to_role": "all",
    "notification.send_to_offering": "all",
    "notification.manage": "all",
    "notification.view_sent": "all",
    "ai.summarize": "all",
    "ai.generate_questions": "all",
    "ai.chat": "all",
    "ai.review": "all",
    "ai.view_usage": "all",
    "ai.configure": "all",
    "report.view": "all",
    "report.users": "all",
    "report.courses": "all",
    "report.files": "all",
    "report.ai": "all",
    "report.export": "all",
    "report.at_risk": "all",
    "settings.view": "all",
    "settings.edit_general": "all",
    "settings.edit_security": "all",
    "settings.edit_email": "all",
    "settings.edit_branding": "all",
    "audit.view": "all",
    "audit.export": "all",
    "trash.view": "all",
    "trash.restore": "all",
    "trash.permanent_delete": "all",
    "backup.manage": "all",
    "system.health": "all",
    "privacy.export_own": "all",
    "privacy.request_own": "all",
    "privacy.manage_dsar": "all",
    "privacy.manage_ropa": "all",
    "privacy.manage_incidents": "all",
    "integration.sis_import": "all",
    "integration.lti_manage": "all",
    "integration.webhooks": "all",
  },
  ACADEMIC_ADMIN: {
    "dashboard.view": "all",
    "dashboard.view_system_stats": "all",
    "user.view": "all",
    "user.view_details": "all",
    "user.create": "all",
    "user.edit": "all",
    "user.activate": "all",
    "user.reset_password": "all",
    "user.import": "all",
    "user.export": "all",
    "user.promote": "all",
    "role.view": "all",
    "role.view_permissions": "all",
    "academic.view": "all",
    "college.manage": "all",
    "department.manage": "all",
    "major.manage": "all",
    "level.manage": "all",
    "semester.view": "all",
    "semester.manage": "all",
    "semester.set_current": "all",
    "year.manage": "all",
    "course.view": "all",
    "course.view_details": "all",
    "course.create": "all",
    "course.edit": "all",
    "course.delete": "all",
    "course.view_stats": "all",
    "offering.view": "all",
    "offering.create": "all",
    "offering.edit": "all",
    "offering.delete": "all",
    "offering.assign_instructor": "all",
    "offering.enroll_students": "all",
    "enrollment.view": "all",
    "enrollment.manage": "all",
    "file.view": "all",
    "file.download": "all",
    "file.upload": "all",
    "file.edit": "all",
    "file.delete": "all",
    "file.approve": "all",
    "file.manage_all": "all",
    "file.view_stats": "all",
    "quiz.view": "all",
    "quiz.view_results_all": "all",
    "assignment.view": "all",
    "grade.view_offering": "all",
    "grade.export": "all",
    "gradebook.configure": "all",
    "attendance.view": "all",
    "notification.view": "all",
    "notification.send": "all",
    "notification.send_to_all": "all",
    "notification.send_to_role": "all",
    "notification.send_to_offering": "all",
    "notification.view_sent": "all",
    "ai.summarize": "all",
    "ai.chat": "all",
    "ai.view_usage": "all",
    "report.view": "all",
    "report.users": "all",
    "report.courses": "all",
    "report.files": "all",
    "report.ai": "all",
    "report.export": "all",
    "report.at_risk": "all",
    "privacy.export_own": "all",
    "privacy.request_own": "all",
    "integration.sis_import": "all",
  },
  INSTRUCTOR: {
    "dashboard.view": "all",
    "user.view": "own",
    "academic.view": "all",
    "semester.view": "all",
    "course.view": "all",
    "course.view_details": "all",
    "course.view_stats": "own",
    "offering.view": "own",
    "offering.edit": "own",
    "offering.enroll_students": "own",
    "enrollment.view": "own",
    "enrollment.manage": "own",
    "file.view": "own",
    "file.download": "own",
    "file.upload": "own",
    "file.edit": "own",
    "file.delete": "own",
    "file.view_stats": "own",
    "quiz.view": "own",
    "quiz.create": "own",
    "quiz.edit": "own",
    "quiz.delete": "own",
    "quiz.publish": "own",
    "quiz.grade": "own",
    "quiz.view_results_all": "own",
    "question_bank.manage": "own",
    "assignment.view": "own",
    "assignment.manage": "own",
    "assignment.grade": "own",
    "grade.view_offering": "own",
    "grade.edit": "own",
    "grade.export": "own",
    "gradebook.configure": "own",
    "attendance.view": "own",
    "attendance.manage": "own",
    "notification.view": "all",
    "notification.send": "own",
    "notification.send_to_offering": "own",
    "notification.view_sent": "own",
    "ai.summarize": "all",
    "ai.generate_questions": "all",
    "ai.chat": "all",
    "ai.review": "own",
    "ai.view_usage": "own",
    "report.view": "own",
    "report.courses": "own",
    "report.files": "own",
    "report.export": "own",
    "report.at_risk": "own",
    "privacy.export_own": "all",
    "privacy.request_own": "all",
  },
  STUDENT: {
    "dashboard.view": "all",
    "academic.view": "all",
    "semester.view": "all",
    "course.view": "own",
    "course.view_details": "own",
    "offering.view": "own",
    "enrollment.view": "own",
    "file.view": "own",
    "file.download": "own",
    "quiz.view": "own",
    "quiz.take": "own",
    "assignment.view": "own",
    "assignment.submit": "own",
    "grade.view_own": "all",
    "attendance.view": "own",
    "notification.view": "all",
    "ai.summarize": "own",
    "ai.chat": "own",
    "privacy.export_own": "all",
    "privacy.request_own": "all",
  },
};

/** Platform (Super Admin) permissions — outside tenants; never stored in RolePermission. */
export const PLATFORM_PERMISSIONS = [
  "platform.tenant.view",
  "platform.tenant.create",
  "platform.tenant.edit",
  "platform.tenant.suspend",
  "platform.tenant.delete",
  "platform.subscription.manage",
  "platform.audit.view",
  "platform.impersonate",
] as const;
export type PlatformPermissionCode = (typeof PLATFORM_PERMISSIONS)[number];

export function isPermissionCode(value: string): value is PermissionCode {
  return (PERMISSION_CODES as readonly string[]).includes(value);
}

/**
 * Self-scope permissions: they only act on the holder's own data (take a quiz, submit an assignment,
 * view own grades) and confer no administrative power. Admin roles intentionally do not hold them, so the
 * privilege-escalation guard (FR-ROL-006) ignores them when checking whether an actor may grant a role.
 */
export const SELF_SCOPE_PERMISSIONS: ReadonlySet<PermissionCode> = new Set<PermissionCode>([
  "quiz.take",
  "assignment.submit",
  "grade.view_own",
]);

/** True when `code` grants administrative reach beyond the holder's own records. */
export function isEscalatingPermission(code: PermissionCode): boolean {
  return !SELF_SCOPE_PERMISSIONS.has(code);
}

/**
 * Pure core of the privilege-escalation guard (FR-ROL-006): may an actor holding `actor` manage a user / grant a
 * role whose permission codes are `target`? Unknown codes are never manageable; self-scope codes are ignored.
 */
export function canManagePermissionSet(
  actor: ReadonlySet<PermissionCode>,
  target: Iterable<string>,
): boolean {
  for (const code of target) {
    if (!isPermissionCode(code)) return false;
    if (isEscalatingPermission(code) && !actor.has(code)) return false;
  }
  return true;
}

export function permissionsByGroup(): Record<PermissionGroup, PermissionDef[]> {
  const out = {} as Record<PermissionGroup, PermissionDef[]>;
  for (const g of Object.keys(PERMISSION_GROUPS) as PermissionGroup[]) out[g] = [];
  for (const p of PERMISSIONS) out[p.group].push(p);
  return out;
}

export interface PermissionCategory {
  /** Stable key derived from the first group in the category (e.g. "academic"); used for i18n + DOM ids. */
  readonly key: PermissionGroup;
  /** Arabic label from the matrix (fallback when no translation exists). */
  readonly label: string;
  readonly permissions: readonly PermissionDef[];
}

/**
 * Permissions grouped by matrix category (several `group` keys share one label, e.g. college/department/major →
 * "البنية الأكاديمية"). Order follows the matrix. Used by the roles permission-matrix UI (FR-ROL-002).
 */
export function permissionCategories(): readonly PermissionCategory[] {
  const byLabel = new Map<string, { key: PermissionGroup; label: string; permissions: PermissionDef[] }>();
  for (const p of PERMISSIONS) {
    const label = PERMISSION_GROUPS[p.group];
    let cat = byLabel.get(label);
    if (!cat) {
      cat = { key: p.group, label, permissions: [] };
      byLabel.set(label, cat);
    }
    cat.permissions.push(p);
  }
  return [...byLabel.values()];
}
