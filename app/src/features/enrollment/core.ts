/**
 * Enrollment core — pure-ish transaction helpers shared by the Server Actions and integration tests (FR-ENR-001).
 *
 * Rules
 *  - Only OPEN offerings accept enrolments (DRAFT/CLOSED/ARCHIVED → CONFLICT "OFFERING_NOT_OPEN").
 *  - Capacity counts ACTIVE rows only; a WITHDRAWN student re-enrolling is a re-activation (same row, status flips).
 *  - Only users holding the STUDENT system role can be enrolled.
 */
import type { TenantTx } from "@/lib/db/tenant";
import { AppError } from "@/lib/result";
import type { BulkLineResult } from "./schemas";

export type EnrolOutcome = "ENROLLED" | "REACTIVATED" | "ALREADY" | "NOT_STUDENT" | "FULL";

export type OfferingForEnrol = {
  id: string;
  status: "DRAFT" | "OPEN" | "CLOSED" | "ARCHIVED";
  capacity: number | null;
  active: number;
};

export async function loadOfferingForEnrol(t: TenantTx, offeringId: string): Promise<OfferingForEnrol> {
  const o = await t.courseOffering.findFirst({
    where: { id: offeringId, deletedAt: null },
    select: {
      id: true,
      status: true,
      capacity: true,
      _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
    },
  });
  if (!o) throw new AppError("NOT_FOUND", "الشعبة غير موجودة");
  return { id: o.id, status: o.status, capacity: o.capacity, active: o._count.enrollments };
}

export function assertOpen(o: OfferingForEnrol): void {
  if (o.status !== "OPEN")
    throw new AppError("CONFLICT", "الشعبة ليست مفتوحة للتسجيل", { offeringId: ["OFFERING_NOT_OPEN"] });
}

/** Is `userId` an active, non-deleted user holding the STUDENT role? */
export async function isStudent(t: TenantTx, userId: string): Promise<boolean> {
  const u = await t.user.findFirst({
    where: {
      id: userId,
      deletedAt: null,
      status: "ACTIVE",
      roles: { some: { role: { code: "STUDENT", deletedAt: null } } },
    },
    select: { id: true },
  });
  return !!u;
}

/**
 * Enrol one student. Mutates `o.active` so callers looping over many students keep an accurate capacity count.
 * Returns the outcome; the caller decides whether a non-success is an error (single) or a report line (bulk).
 */
export async function enrolOne(
  t: TenantTx,
  tenantId: string,
  o: OfferingForEnrol,
  studentId: string,
  source: "MANUAL" | "BULK" | "IMPORT" | "SELF",
  enrolledBy: string,
): Promise<{ outcome: EnrolOutcome; enrollmentId?: string }> {
  if (!(await isStudent(t, studentId))) return { outcome: "NOT_STUDENT" };
  const existing = await t.enrollment.findFirst({
    where: { offeringId: o.id, studentId },
    select: { id: true, status: true },
  });
  if (existing?.status === "ACTIVE") return { outcome: "ALREADY", enrollmentId: existing.id };
  if (existing?.status === "COMPLETED") return { outcome: "ALREADY", enrollmentId: existing.id };
  if (o.capacity !== null && o.active >= o.capacity) return { outcome: "FULL" };
  if (existing) {
    await t.enrollment.update({
      where: { id: existing.id },
      data: { status: "ACTIVE", withdrawnAt: null, enrolledAt: new Date(), enrolledBy, source },
    });
    o.active += 1;
    return { outcome: "REACTIVATED", enrollmentId: existing.id };
  }
  const e = await t.enrollment.create({
    data: { tenantId, offeringId: o.id, studentId, status: "ACTIVE", source, enrolledBy },
    select: { id: true },
  });
  o.active += 1;
  return { outcome: "ENROLLED", enrollmentId: e.id };
}

/** Resolve pasted identifiers (academic id or email, case-insensitive) to user ids. Unknown ones are reported. */
export async function resolveIdentifiers(t: TenantTx, identifiers: string[]): Promise<Map<string, string>> {
  const lower = identifiers.map((s) => s.toLowerCase());
  const users = await t.user.findMany({
    where: {
      deletedAt: null,
      OR: [{ email: { in: lower } }, { academicId: { in: identifiers, mode: "insensitive" } }],
    },
    select: { id: true, email: true, academicId: true },
  });
  const map = new Map<string, string>();
  for (const u of users) {
    map.set(u.email.toLowerCase(), u.id);
    map.set(u.academicId.toLowerCase(), u.id);
  }
  return map;
}

export function lineFor(identifier: string, outcome: EnrolOutcome | "NOT_FOUND"): BulkLineResult {
  return { identifier, status: outcome };
}
