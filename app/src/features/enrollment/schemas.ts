/**
 * Enrollment — Zod schemas (FR-ENR-001/002).
 *
 * Students join an offering one at a time (`enrollSchema`) or in bulk by academic id / email (`bulkEnrollSchema`;
 * the action reports per-line results). Status: ACTIVE → WITHDRAWN | COMPLETED; WITHDRAWN → ACTIVE (re-enrol).
 */
import { z } from "zod";

export const ENROLLMENT_STATUSES = ["ACTIVE", "WITHDRAWN", "COMPLETED"] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];
export const MAX_BULK = 500;

const uuid = z.string().uuid();
export const idSchema = z.object({ id: uuid });

export const enrollSchema = z.object({ offeringId: uuid, studentId: uuid });
export type EnrollInput = z.input<typeof enrollSchema>;

/** Identifiers are academic ids or emails, one per line / comma separated; parsed by `parseIdentifiers`. */
export const bulkEnrollSchema = z.object({
  offeringId: uuid,
  identifiers: z
    .array(z.string().trim().min(1).max(190))
    .min(1, "أدخل معرّفًا واحدًا على الأقل")
    .max(MAX_BULK, `الحد الأقصى ${MAX_BULK}`),
});
export type BulkEnrollInput = z.input<typeof bulkEnrollSchema>;

export const setEnrollmentStatusSchema = z.object({ id: uuid, status: z.enum(ENROLLMENT_STATUSES) });

/** Split a pasted blob into unique, trimmed identifiers (newline / comma / semicolon / whitespace separated). */
export function parseIdentifiers(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(/[\n,;\s]+/)) {
    const v = part.trim();
    if (v) seen.add(v.toLowerCase());
  }
  return [...seen];
}

export type BulkLineResult = {
  identifier: string;
  status: "ENROLLED" | "REACTIVATED" | "ALREADY" | "NOT_FOUND" | "NOT_STUDENT" | "FULL";
};
export type BulkEnrollResult = {
  enrolled: number;
  reactivated: number;
  skipped: number;
  lines: BulkLineResult[];
};

/* ───────────── List query (URL) ───────────── */
export const ENROLLMENT_TABS = ["ALL", ...ENROLLMENT_STATUSES] as const;
export const enrollmentListQuerySchema = z.object({
  q: z.string().trim().max(80).optional().default(""),
  status: z.enum(ENROLLMENT_TABS).optional().default("ALL"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(5).max(200).optional().default(50),
});
export type EnrollmentListQuery = z.infer<typeof enrollmentListQuerySchema>;
