"use server";

/**
 * Enrollment — Server Actions (FR-ENR-001/002).
 *  enrollStudentAction  — single (offering.enroll_students; own-scope instructors must teach the section)
 *  bulkEnrollAction     — many by academic id / email, per-line report (same permission)
 *  setEnrollmentStatusAction — withdraw / complete / re-activate (enrollment.manage)
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { assertPermission, requireUserOrThrow } from "@/lib/auth/rbac";
import { tx } from "@/lib/db/tenant";
import { AppError, type Result } from "@/lib/result";
import { safeAction } from "@/lib/safe-action";
import { assertOfferingScope } from "@/features/offerings/scope";
import { assertOpen, enrolOne, lineFor, loadOfferingForEnrol, resolveIdentifiers } from "./core";
import { studentCandidates, type StudentOption } from "./queries";
import { bulkEnrollSchema, enrollSchema, setEnrollmentStatusSchema, type BulkEnrollResult } from "./schemas";

function revalidateOffering(offeringId: string) {
  revalidatePath(`/offerings/${offeringId}`);
  revalidatePath("/offerings");
  revalidatePath("/courses", "layout");
  revalidatePath("/dashboard");
}

const OUTCOME_MESSAGE = {
  ALREADY: "الطالب مسجّل مسبقًا في هذه الشعبة",
  NOT_STUDENT: "المستخدم ليس طالبًا نشطًا",
  FULL: "الشعبة مكتملة العدد",
} as const;

export async function enrollStudentAction(
  input: unknown,
): Promise<Result<{ enrollmentId: string; reactivated: boolean }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "offering.enroll_students");
      const data = enrollSchema.parse(input);
      const out = await tx(ctx.tenantId, async (t) => {
        await assertOfferingScope(ctx, data.offeringId, "teaching", t);
        const o = await loadOfferingForEnrol(t, data.offeringId);
        assertOpen(o);
        const r = await enrolOne(t, ctx.tenantId, o, data.studentId, "MANUAL", ctx.user.id);
        if (r.outcome === "ALREADY" || r.outcome === "NOT_STUDENT" || r.outcome === "FULL")
          throw new AppError("CONFLICT", OUTCOME_MESSAGE[r.outcome], { studentId: [r.outcome] });
        await audit(
          ctx,
          {
            action: "enrollment.create",
            entity: "Enrollment",
            entityId: r.enrollmentId,
            after: { offeringId: o.id, studentId: data.studentId, outcome: r.outcome },
          },
          t,
        );
        return { enrollmentId: r.enrollmentId as string, reactivated: r.outcome === "REACTIVATED" };
      });
      revalidateOffering(data.offeringId);
      return out;
    },
    { action: "enrollment.create" },
  );
}

export async function bulkEnrollAction(input: unknown): Promise<Result<BulkEnrollResult>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "offering.enroll_students");
      const data = bulkEnrollSchema.parse(input);
      const result = await tx(
        ctx.tenantId,
        async (t) => {
          await assertOfferingScope(ctx, data.offeringId, "teaching", t);
          const o = await loadOfferingForEnrol(t, data.offeringId);
          assertOpen(o);
          const resolved = await resolveIdentifiers(t, data.identifiers);
          const res: BulkEnrollResult = { enrolled: 0, reactivated: 0, skipped: 0, lines: [] };
          const seenUsers = new Set<string>();
          for (const ident of data.identifiers) {
            const userId = resolved.get(ident.toLowerCase());
            if (!userId) {
              res.lines.push(lineFor(ident, "NOT_FOUND"));
              res.skipped++;
              continue;
            }
            if (seenUsers.has(userId)) continue; // same student listed by id and email
            seenUsers.add(userId);
            const r = await enrolOne(t, ctx.tenantId, o, userId, "BULK", ctx.user.id);
            res.lines.push(lineFor(ident, r.outcome));
            if (r.outcome === "ENROLLED") res.enrolled++;
            else if (r.outcome === "REACTIVATED") res.reactivated++;
            else res.skipped++;
          }
          await audit(
            ctx,
            {
              action: "enrollment.bulk",
              entity: "CourseOffering",
              entityId: o.id,
              after: {
                enrolled: res.enrolled,
                reactivated: res.reactivated,
                skipped: res.skipped,
                total: data.identifiers.length,
              },
            },
            t,
          );
          return res;
        },
        { timeout: 60_000 },
      );
      revalidateOffering(data.offeringId);
      return result;
    },
    { action: "enrollment.bulk" },
  );
}

/** ACTIVE ↔ WITHDRAWN, ACTIVE → COMPLETED. Re-activation respects capacity and requires an OPEN section. */
export async function setEnrollmentStatusAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "enrollment.manage");
      const data = setEnrollmentStatusSchema.parse(input);
      const offeringId = await tx(ctx.tenantId, async (t) => {
        const e = await t.enrollment.findFirst({
          where: { id: data.id },
          select: { id: true, offeringId: true, studentId: true, status: true },
        });
        if (!e) throw new AppError("NOT_FOUND", "التسجيل غير موجود");
        await assertOfferingScope(ctx, e.offeringId, "teaching", t);
        if (e.status === data.status) return e.offeringId;
        if (e.status === "COMPLETED") throw new AppError("CONFLICT", "لا يمكن تغيير تسجيل مكتمل");
        if (data.status === "ACTIVE") {
          const o = await loadOfferingForEnrol(t, e.offeringId);
          assertOpen(o);
          if (o.capacity !== null && o.active >= o.capacity)
            throw new AppError("CONFLICT", OUTCOME_MESSAGE.FULL);
          await t.enrollment.update({
            where: { id: e.id },
            data: { status: "ACTIVE", withdrawnAt: null, enrolledAt: new Date(), enrolledBy: ctx.user.id },
          });
        } else if (data.status === "WITHDRAWN") {
          await t.enrollment.update({
            where: { id: e.id },
            data: { status: "WITHDRAWN", withdrawnAt: new Date() },
          });
        } else {
          await t.enrollment.update({
            where: { id: e.id },
            data: { status: "COMPLETED", completedAt: new Date() },
          });
        }
        await audit(
          ctx,
          {
            action: "enrollment.set_status",
            entity: "Enrollment",
            entityId: e.id,
            before: { status: e.status },
            after: { status: data.status, studentId: e.studentId },
          },
          t,
        );
        return e.offeringId;
      });
      revalidateOffering(offeringId);
      return { id: data.id };
    },
    { action: "enrollment.set_status" },
  );
}

const searchSchema = z.object({
  offeringId: z.string().uuid(),
  q: z.string().trim().max(80).optional().default(""),
});

/** Candidate students for the single-enrol dialog (STUDENT role, not ACTIVE in the offering). Scope: teaching or tenant-wide. */
export async function searchStudentsAction(input: unknown): Promise<Result<StudentOption[]>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "offering.enroll_students");
      const data = searchSchema.parse(input);
      await assertOfferingScope(ctx, data.offeringId, "teaching");
      return studentCandidates(ctx, data.offeringId, data.q);
    },
    { action: "enrollment.search_students" },
  );
}
