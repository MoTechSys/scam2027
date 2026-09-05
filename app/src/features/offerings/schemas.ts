/**
 * Course offerings (sections) — Zod schemas (FR-OFF-001, FR-CRS-003).
 *
 * Lifecycle: DRAFT → OPEN → CLOSED → ARCHIVED (ARCHIVED is terminal; CLOSED may re-OPEN, OPEN may go back to DRAFT
 * only while it has no enrollments — enforced in the action). Schedule is validated by `offeringScheduleSchema`
 * (src/lib/contracts/json-columns.ts) and stored as JSON.
 */
import { z } from "zod";
import { offeringScheduleSchema } from "@/lib/contracts/json-columns";
import { urlBool } from "@/features/courses/schemas";

export const OFFERING_STATUSES = ["DRAFT", "OPEN", "CLOSED", "ARCHIVED"] as const;
export type OfferingStatus = (typeof OFFERING_STATUSES)[number];
export const INSTRUCTOR_ROLES = ["PRIMARY", "CO_INSTRUCTOR", "ASSISTANT"] as const;
export type InstructorRole = (typeof INSTRUCTOR_ROLES)[number];

/** Allowed status transitions (FR-OFF-001). */
export const OFFERING_TRANSITIONS: Readonly<Record<OfferingStatus, readonly OfferingStatus[]>> = {
  DRAFT: ["OPEN", "ARCHIVED"],
  OPEN: ["CLOSED", "DRAFT"],
  CLOSED: ["OPEN", "ARCHIVED"],
  ARCHIVED: [],
};
export function canTransition(from: OfferingStatus, to: OfferingStatus): boolean {
  return OFFERING_TRANSITIONS[from].includes(to);
}

export const MAX_CAPACITY = 2000;
export const MAX_INSTRUCTORS = 10;

const uuid = z.string().uuid();
export const idSchema = z.object({ id: uuid });

/** Section labels: `1`, `A`, `01-B` … 1–10 chars, upper-cased. */
const section = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{0,9}$/, "أحرف لاتينية وأرقام و- (حتى 10)");
const location = z.string().trim().max(120).optional().or(z.literal(""));

export const instructorAssignmentSchema = z.object({
  userId: uuid,
  role: z.enum(INSTRUCTOR_ROLES).optional().default("PRIMARY"),
});
const instructorsList = z
  .array(instructorAssignmentSchema)
  .max(MAX_INSTRUCTORS)
  .optional()
  .default([])
  .refine((rows) => new Set(rows.map((r) => r.userId)).size === rows.length, { message: "مدرس مكرر" })
  .refine((rows) => rows.filter((r) => r.role === "PRIMARY").length <= 1, { message: "مدرس أساسي واحد فقط" });

const offeringBase = z.object({
  courseId: uuid,
  semesterId: uuid,
  section,
  capacity: z.coerce.number().int().min(1).max(MAX_CAPACITY).optional().nullable(),
  location,
  schedule: offeringScheduleSchema.optional().default([]),
});

export const createOfferingSchema = offeringBase.extend({
  status: z.enum(OFFERING_STATUSES).optional().default("DRAFT"),
  instructors: instructorsList,
});
export type CreateOfferingInput = z.input<typeof createOfferingSchema>;

/** Course/semester are immutable after creation (they define the unique key and the enrolment context). */
export const updateOfferingSchema = offeringBase
  .omit({ courseId: true, semesterId: true })
  .extend({ id: uuid });
export type UpdateOfferingInput = z.input<typeof updateOfferingSchema>;

export const setOfferingStatusSchema = z.object({ id: uuid, status: z.enum(OFFERING_STATUSES) });
export const setInstructorsSchema = z.object({ id: uuid, instructors: instructorsList });

/* ───────────── List query (URL) ───────────── */
export const OFFERING_TABS = ["ALL", ...OFFERING_STATUSES] as const;
export type OfferingTab = (typeof OFFERING_TABS)[number];

export const offeringListQuerySchema = z.object({
  q: z.string().trim().max(80).optional().default(""),
  status: z.enum(OFFERING_TABS).optional().default("ALL"),
  semesterId: uuid.optional(),
  courseId: uuid.optional(),
  /** `true` → only sections the actor teaches (instructor) / is enrolled in (student). Forced when no `course.manage_all`. */
  mine: urlBool.optional().default(false),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(5).max(100).optional().default(20),
});
export type OfferingListQuery = z.infer<typeof offeringListQuerySchema>;
