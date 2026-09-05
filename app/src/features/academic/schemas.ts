/**
 * Academic structure — Zod schemas shared by Server Actions, forms and the first-setup wizard (FR-ACD-001..006).
 *
 * Entities: AcademicYear → Semester; College → Department → Major → Level.
 * Dates travel as ISO `YYYY-MM-DD` strings and are normalised to UTC midnight (`@db.Date` columns).
 */
import { z } from "zod";

export const ACADEMIC_TABS = ["years", "colleges", "departments", "majors", "levels"] as const;
export type AcademicTab = (typeof ACADEMIC_TABS)[number];

export const SEMESTER_TERMS = ["FIRST", "SECOND", "SUMMER"] as const;
export const SEMESTER_STATUSES = ["PLANNED", "ACTIVE", "CLOSED", "ARCHIVED"] as const;
export const DEGREE_TYPES = ["DIPLOMA", "BACHELOR", "MASTER", "PHD"] as const;

/** Structural codes: letters/digits/`-`/`_`/`/`, 1–20 chars, upper-cased (e.g. `CCIS`, `CS`, `2026/2027`). */
export const STRUCT_CODE_RE = /^[A-Z0-9][A-Z0-9_\-/]{0,19}$/;
export const MAX_LEVELS = 20;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "صيغة التاريخ YYYY-MM-DD")
  .transform((s) => new Date(`${s}T00:00:00.000Z`))
  .refine((d) => !Number.isNaN(d.getTime()), "تاريخ غير صالح");

const code = z.string().trim().toUpperCase().regex(STRUCT_CODE_RE, "أحرف لاتينية وأرقام و- _ / (حتى 20)");
const name = z.string().trim().min(2, "حرفان على الأقل").max(120, "الحد الأقصى 120 حرفًا");
const nameEn = z.string().trim().max(120).optional().or(z.literal(""));
const description = z.string().trim().max(500, "الحد الأقصى 500 حرف").optional().or(z.literal(""));
const uuid = z.string().uuid();
export const idSchema = z.object({ id: uuid });

/* ───────────── Academic year ───────────── */
const yearBase = z.object({ code, name, startDate: isoDate, endDate: isoDate });
export const createYearSchema = yearBase
  .extend({ isCurrent: z.boolean().optional().default(false) })
  .refine((v) => v.endDate > v.startDate, { message: "تاريخ النهاية يجب أن يكون بعد البداية", path: ["endDate"] });
export type CreateYearInput = z.input<typeof createYearSchema>;
export const updateYearSchema = yearBase
  .extend({ id: uuid })
  .refine((v) => v.endDate > v.startDate, { message: "تاريخ النهاية يجب أن يكون بعد البداية", path: ["endDate"] });
export type UpdateYearInput = z.input<typeof updateYearSchema>;

/* ───────────── Semester ───────────── */
const semesterBase = z.object({
  academicYearId: uuid,
  term: z.enum(SEMESTER_TERMS),
  name,
  startDate: isoDate,
  endDate: isoDate,
  registrationOpensAt: isoDate.optional().nullable(),
  registrationClosesAt: isoDate.optional().nullable(),
  status: z.enum(SEMESTER_STATUSES).optional().default("PLANNED"),
});
type SemesterDates = { startDate: Date; endDate: Date; registrationOpensAt?: Date | null; registrationClosesAt?: Date | null };
function semesterDateRules(v: SemesterDates, ctx: z.RefinementCtx) {
  if (v.endDate <= v.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "تاريخ النهاية يجب أن يكون بعد البداية" });
  if (v.registrationOpensAt && v.registrationClosesAt && v.registrationClosesAt <= v.registrationOpensAt)
    ctx.addIssue({ code: "custom", path: ["registrationClosesAt"], message: "إغلاق التسجيل يجب أن يكون بعد فتحه" });
}
export const createSemesterSchema = semesterBase.extend({ isCurrent: z.boolean().optional().default(false) }).superRefine(semesterDateRules);
export type CreateSemesterInput = z.input<typeof createSemesterSchema>;
export const updateSemesterSchema = semesterBase.omit({ academicYearId: true }).extend({ id: uuid }).superRefine(semesterDateRules);
export type UpdateSemesterInput = z.input<typeof updateSemesterSchema>;

/* ───────────── College / Department / Major (catalogue entities) ───────────── */
const catalogueBase = z.object({ code, name, nameEn, description, sortOrder: z.coerce.number().int().min(0).max(9999).optional().default(0), isActive: z.boolean().optional().default(true) });

export const createCollegeSchema = catalogueBase;
export const updateCollegeSchema = catalogueBase.extend({ id: uuid });
export const createDepartmentSchema = catalogueBase.extend({ collegeId: uuid });
export const updateDepartmentSchema = createDepartmentSchema.extend({ id: uuid });
export const createMajorSchema = catalogueBase.extend({
  departmentId: uuid,
  degree: z.enum(DEGREE_TYPES).optional().default("BACHELOR"),
  durationYears: z.coerce.number().int().min(1).max(10).optional().nullable(),
});
export const updateMajorSchema = createMajorSchema.extend({ id: uuid });
export type CreateCollegeInput = z.input<typeof createCollegeSchema>;
export type CreateDepartmentInput = z.input<typeof createDepartmentSchema>;
export type CreateMajorInput = z.input<typeof createMajorSchema>;

/* ───────────── Level ───────────── */
export const createLevelSchema = z.object({
  majorId: uuid,
  number: z.coerce.number().int().min(1).max(MAX_LEVELS),
  name,
  nameEn,
  isActive: z.boolean().optional().default(true),
});
export const updateLevelSchema = createLevelSchema.omit({ majorId: true }).extend({ id: uuid });
/** Bulk-create levels 1..count for a major (skips numbers that already exist). */
export const generateLevelsSchema = z.object({ majorId: uuid, count: z.coerce.number().int().min(1).max(MAX_LEVELS) });

/* ───────────── First-setup wizard ───────────── */
export const setupWizardSchema = z.object({
  year: yearBase.refine((v) => v.endDate > v.startDate, { message: "تاريخ النهاية يجب أن يكون بعد البداية", path: ["endDate"] }),
  semester: semesterBase.omit({ academicYearId: true }).superRefine(semesterDateRules),
  college: createCollegeSchema,
  department: createDepartmentSchema.omit({ collegeId: true }),
  major: createMajorSchema.omit({ departmentId: true }),
  levelCount: z.coerce.number().int().min(1).max(MAX_LEVELS).default(8),
});
export type SetupWizardInput = z.input<typeof setupWizardSchema>;

/* ───────────── List queries ───────────── */
/** URL-safe boolean: accepts true/false/1/0 (strings or booleans). `z.coerce.boolean()` would turn "false" into true. */
const urlBool = z.preprocess((v) => (v === "false" || v === "0" || v === 0 ? false : v === "true" || v === "1" || v === 1 ? true : v), z.boolean());
export const catalogueListQuerySchema = z.object({
  q: z.string().trim().max(80).optional().default(""),
  parentId: uuid.optional(),
  includeInactive: urlBool.optional().default(true),
});
export type CatalogueListQuery = z.infer<typeof catalogueListQuerySchema>;

/** Arabic ordinal names for generated levels (المستوى الأول … العشرون). */
export const LEVEL_ORDINALS_AR = [
  "الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر",
  "الحادي عشر", "الثاني عشر", "الثالث عشر", "الرابع عشر", "الخامس عشر", "السادس عشر", "السابع عشر", "الثامن عشر", "التاسع عشر", "العشرون",
] as const;
export function levelName(n: number): { name: string; nameEn: string } {
  return { name: `المستوى ${LEVEL_ORDINALS_AR[n - 1] ?? n}`, nameEn: `Level ${n}` };
}
