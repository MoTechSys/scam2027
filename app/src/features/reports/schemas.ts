/**
 * Reports (P1-13, FR-RPT-001/002/003/006). Pure: tabs, filter contracts, CSV columns, small helpers.
 * Client-safe (no server-only imports) — the tab bar and the export links import from here.
 *
 * Permissions (02-PERMISSIONS-MATRIX §2.11): `report.view` opens `/reports`; each tab has its own code
 * (`report.users` / `report.courses` / `report.files`); `report.export` gates the CSV routes. Instructors hold
 * `report.view/courses/files/export` with scope "own" → their numbers are narrowed by the offering/file scope.
 */
import { z } from "zod";

export const REPORT_TABS = ["overview", "users", "courses", "files"] as const;
export type ReportTab = (typeof REPORT_TABS)[number];

/** Tabs that have a CSV export (overview is a dashboard, not a dataset). */
export const REPORT_EXPORT_KINDS = ["users", "courses", "files"] as const;
export type ReportExportKind = (typeof REPORT_EXPORT_KINDS)[number];

export function isReportTab(v: string): v is ReportTab {
  return (REPORT_TABS as readonly string[]).includes(v);
}
export function isExportKind(v: string): v is ReportExportKind {
  return (REPORT_EXPORT_KINDS as readonly string[]).includes(v);
}

/** Permission code that unlocks a tab (overview needs only `report.view`). */
export const TAB_PERMISSION = {
  overview: "report.view",
  users: "report.users",
  courses: "report.courses",
  files: "report.files",
} as const satisfies Record<ReportTab, string>;

const uuid = z.string().uuid();
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

/** Users report filters — role / status / major are optional narrowing; all strict (unknown query → 400). */
export const usersReportFilterSchema = z
  .object({
    roleId: uuid.optional(),
    status: z.enum(["PENDING_ACTIVATION", "ACTIVE", "FROZEN", "DISABLED"]).optional(),
    majorId: uuid.optional(),
  })
  .strict();
export type UsersReportFilter = z.infer<typeof usersReportFilterSchema>;

/** Courses report filters — one semester (defaults to the current one) and optional department. */
export const coursesReportFilterSchema = z
  .object({
    semesterId: uuid.optional(),
    departmentId: uuid.optional(),
  })
  .strict();
export type CoursesReportFilter = z.infer<typeof coursesReportFilterSchema>;

/** Files report filters — category / course / day range (whole tenant days, like the audit log). */
export const filesReportFilterSchema = z
  .object({
    category: z.enum(["LECTURE", "ASSIGNMENT", "EXAM", "REFERENCE", "OTHER"]).optional(),
    courseId: uuid.optional(),
    from: isoDay.optional(),
    to: isoDay.optional(),
  })
  .strict()
  .refine((f) => !f.from || !f.to || f.from <= f.to, { message: "from must be <= to", path: ["to"] });
export type FilesReportFilter = z.infer<typeof filesReportFilterSchema>;

export const REPORT_EXPORT_MAX_ROWS = 50_000;
export const REPORT_EXPORT_BATCH = 1_000;

export const USERS_CSV_COLUMNS = [
  "academicId",
  "name",
  "email",
  "status",
  "roles",
  "lastLoginAt",
  "createdAt",
] as const;
export const COURSES_CSV_COLUMNS = [
  "code",
  "name",
  "department",
  "creditHours",
  "isActive",
  "offerings",
  "openOfferings",
  "activeEnrollments",
  "instructors",
  "files",
] as const;
export const FILES_CSV_COLUMNS = [
  "name",
  "category",
  "status",
  "mimeType",
  "sizeBytes",
  "course",
  "offering",
  "uploader",
  "downloads",
  "createdAt",
] as const;

/** Bucket a byte count into a human-scale unit for charts/tables — UI formats the number with useFormatter. */
export function bytesToMb(bytes: number | bigint): number {
  const n = typeof bytes === "bigint" ? Number(bytes) : bytes;
  return Math.round((n / (1024 * 1024)) * 100) / 100;
}

/** Percentage helper that never divides by zero (returns 0 when the denominator is 0). */
export function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}
