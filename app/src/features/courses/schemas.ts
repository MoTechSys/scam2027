/**
 * Courses — Zod schemas shared by Server Actions, dialogs and URL queries (FR-CRS-001, 002, 005).
 *
 * A Course is the catalogue entry (`CS101`); it is offered per semester as CourseOffering sections (features/offerings).
 * Major mapping is M:N with an optional Level (`CourseMajor`), so one course can sit at Level 2 of CS and Level 3 of SE.
 */
import { z } from "zod";

/** Course codes: letters/digits/`-`/`_`, 2–20 chars, upper-cased (e.g. `CS101`, `MATH-201`). */
export const COURSE_CODE_RE = /^[A-Z0-9][A-Z0-9_-]{1,19}$/;
export const MAX_CREDIT_HOURS = 12;
export const MAX_MAJORS_PER_COURSE = 30;

const uuid = z.string().uuid();
export const idSchema = z.object({ id: uuid });

const code = z.string().trim().toUpperCase().regex(COURSE_CODE_RE, "أحرف لاتينية وأرقام و- _ (2–20)");
const name = z.string().trim().min(2, "حرفان على الأقل").max(160, "الحد الأقصى 160 حرفًا");
const nameEn = z.string().trim().max(160).optional().or(z.literal(""));
const description = z.string().trim().max(2000, "الحد الأقصى 2000 حرف").optional().or(z.literal(""));

/** One row of the course ↔ major mapping. `levelId` must belong to `majorId` (checked in the action). */
export const courseMajorSchema = z.object({
  majorId: uuid,
  levelId: uuid.optional().nullable(),
  isRequired: z.boolean().optional().default(true),
});
export type CourseMajorInput = z.input<typeof courseMajorSchema>;

const majorsList = z
  .array(courseMajorSchema)
  .max(MAX_MAJORS_PER_COURSE)
  .optional()
  .default([])
  .refine((rows) => new Set(rows.map((r) => r.majorId)).size === rows.length, { message: "تخصص مكرر" });

export const createCourseSchema = z.object({
  code,
  name,
  nameEn,
  description,
  departmentId: uuid.optional().nullable(),
  creditHours: z.coerce.number().int().min(0).max(MAX_CREDIT_HOURS).optional().default(3),
  isActive: z.boolean().optional().default(true),
  majors: majorsList,
});
export type CreateCourseInput = z.input<typeof createCourseSchema>;

export const updateCourseSchema = createCourseSchema.extend({ id: uuid });
export type UpdateCourseInput = z.input<typeof updateCourseSchema>;

/** Replace the whole mapping of a course (idempotent; used by the "majors" dialog). */
export const setCourseMajorsSchema = z.object({ id: uuid, majors: majorsList });

/* ───────────── List query (URL) ───────────── */
/** URL-safe boolean: accepts true/false/1/0 (strings or booleans). `z.coerce.boolean()` would turn "false" into true. */
export const urlBool = z.preprocess(
  (v) => (v === "false" || v === "0" || v === 0 ? false : v === "true" || v === "1" || v === 1 ? true : v),
  z.boolean(),
);

export const COURSE_TABS = ["ALL", "ACTIVE", "INACTIVE", "DELETED"] as const;
export type CourseTab = (typeof COURSE_TABS)[number];

export const courseListQuerySchema = z.object({
  q: z.string().trim().max(80).optional().default(""),
  status: z.enum(COURSE_TABS).optional().default("ALL"),
  departmentId: uuid.optional(),
  majorId: uuid.optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(5).max(100).optional().default(20),
});
export type CourseListQuery = z.infer<typeof courseListQuerySchema>;
