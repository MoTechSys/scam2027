/**
 * Files — shared server logic used by both Server Actions and the upload Route Handler (not a "use server" file).
 */
import "server-only";
import type { Ctx } from "@/lib/auth/rbac";
import type { TenantTx } from "@/lib/db/tenant";
import { AppError } from "@/lib/result";
import { assertOfferingScope } from "@/features/offerings/scope";
import { isFileAdmin } from "./scope";

/**
 * Resolve (courseId, offeringId) for an attachment: the offering's course is authoritative; the actor must be
 * tenant-wide or teach the offering / have an in-scope offering of that course. Returns nulls for "unattached".
 */
export async function resolveAttachment(
  ctx: Ctx,
  t: TenantTx,
  input: { courseId?: string; offeringId?: string },
): Promise<{ courseId: string | null; offeringId: string | null }> {
  if (input.offeringId) {
    await assertOfferingScope(ctx, input.offeringId, "teaching", t);
    const o = await t.courseOffering.findFirst({
      where: { id: input.offeringId },
      select: { courseId: true },
    });
    if (!o) throw new AppError("NOT_FOUND", "الشعبة غير موجودة");
    return { courseId: o.courseId, offeringId: input.offeringId };
  }
  if (input.courseId) {
    const c = await t.course.findFirst({
      where: { id: input.courseId, deletedAt: null },
      select: { id: true },
    });
    if (!c) throw new AppError("VALIDATION", "المقرر غير موجود", { courseId: ["المقرر غير موجود"] });
    if (!isFileAdmin(ctx)) {
      const teaches = await t.offeringInstructor.findFirst({
        where: { userId: ctx.user.id, offering: { courseId: input.courseId, deletedAt: null } },
        select: { userId: true },
      });
      if (!teaches) throw new AppError("FORBIDDEN", "هذا المقرر خارج نطاقك");
    }
    return { courseId: input.courseId, offeringId: null };
  }
  return { courseId: null, offeringId: null };
}
