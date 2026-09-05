/**
 * Visibility / ownership scope for courses, offerings and enrollments (FR-ENR-002).
 *
 *  - `course.manage_all` → tenant-wide (admins).
 *  - Otherwise an actor is *in scope* of an offering when they teach it (OfferingInstructor) or are enrolled in it
 *    (Enrollment, any status). Lists are filtered with `offeringScopeWhere`; mutations call `assertOfferingScope`.
 *
 * Everything runs through db(tenantId) so RLS remains the outer fence; scope is the inner one.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/rbac";
import { hasPermission } from "@/lib/auth/has-permission";
import { db, type TenantTx } from "@/lib/db/tenant";
import { AppError } from "@/lib/result";

export function isTenantWide(ctx: Pick<Ctx, "user">): boolean {
  return hasPermission(ctx, "course.manage_all");
}

/** Prisma `where` fragment restricting offerings to the actor's own sections/enrolments (empty for tenant-wide). */
export function offeringScopeWhere(ctx: Ctx): Prisma.CourseOfferingWhereInput {
  if (isTenantWide(ctx)) return {};
  return {
    OR: [
      { instructors: { some: { userId: ctx.user.id } } },
      { enrollments: { some: { studentId: ctx.user.id } } },
    ],
  };
}

/** Courses visible to the actor: all when tenant-wide, else those with at least one in-scope offering. */
export function courseScopeWhere(ctx: Ctx): Prisma.CourseWhereInput {
  if (isTenantWide(ctx)) return {};
  return { offerings: { some: { deletedAt: null, ...offeringScopeWhere(ctx) } } };
}

export type OfferingRelation = "TEACHES" | "ENROLLED" | "NONE";

/** How the actor relates to an offering (teaching wins over enrolled). */
export async function offeringRelation(
  ctx: Ctx,
  offeringId: string,
  t?: TenantTx,
): Promise<OfferingRelation> {
  const client = t ?? db(ctx.tenantId);
  const [teach, enrol] = await Promise.all([
    client.offeringInstructor.findFirst({
      where: { offeringId, userId: ctx.user.id },
      select: { userId: true },
    }),
    client.enrollment.findFirst({ where: { offeringId, studentId: ctx.user.id }, select: { id: true } }),
  ]);
  return teach ? "TEACHES" : enrol ? "ENROLLED" : "NONE";
}

/**
 * Throw FORBIDDEN unless the actor is tenant-wide or teaches the offering (`teaching` mode, for mutations) /
 * teaches-or-is-enrolled (`any` mode, for reads). NOT_FOUND when the offering does not exist.
 */
export async function assertOfferingScope(
  ctx: Ctx,
  offeringId: string,
  mode: "teaching" | "any",
  t?: TenantTx,
): Promise<void> {
  const client = t ?? db(ctx.tenantId);
  const exists = await client.courseOffering.findFirst({
    where: { id: offeringId, deletedAt: null },
    select: { id: true },
  });
  if (!exists) throw new AppError("NOT_FOUND", "الشعبة غير موجودة");
  if (isTenantWide(ctx)) return;
  const rel = await offeringRelation(ctx, offeringId, t);
  if (rel === "TEACHES" || (mode === "any" && rel === "ENROLLED")) return;
  throw new AppError("FORBIDDEN", "هذه الشعبة خارج نطاقك");
}
