/**
 * Notifications — authorization scope (FR-NTF-001/002/008).
 *
 *  - Everyone with `notification.view` reads *their own* recipient rows (inbox).
 *  - Sending needs `notification.send` plus a kind-specific grant:
 *      ALL                         → notification.send_to_all
 *      ROLE                        → notification.send_to_role
 *      COLLEGE/DEPARTMENT/MAJOR/LEVEL → notification.send_to_all (tenant-wide audiences)
 *      OFFERING                    → notification.send_to_offering (+ must teach every offering unless tenant-wide)
 *      USERS                       → notification.send (tenant-wide) or the users must share an offering the actor teaches
 *  - `notification.manage` → sees and deletes every notification; `notification.view_sent` → own sent list.
 *
 * RLS remains the outer fence (db(tenantId)); this is the inner one.
 */
import "server-only";
import type { Ctx } from "@/lib/auth/rbac";
import { hasPermission } from "@/lib/auth/has-permission";
import type { TenantTx } from "@/lib/db/tenant";
import { AppError } from "@/lib/result";
import { isTenantWide } from "@/features/offerings/scope";
import type { NotificationTarget, NotificationTargetKind } from "./schemas";

export function isNotificationAdmin(ctx: Pick<Ctx, "user">): boolean {
  return hasPermission(ctx, "notification.manage");
}

/** Target kinds the actor may pick in the compose dialog (drives the UI select). */
export function allowedTargetKinds(ctx: Pick<Ctx, "user">): NotificationTargetKind[] {
  if (!hasPermission(ctx, "notification.send")) return [];
  const kinds: NotificationTargetKind[] = [];
  if (hasPermission(ctx, "notification.send_to_all"))
    kinds.push("ALL", "COLLEGE", "DEPARTMENT", "MAJOR", "LEVEL");
  if (hasPermission(ctx, "notification.send_to_role")) kinds.push("ROLE");
  if (hasPermission(ctx, "notification.send_to_offering")) kinds.push("OFFERING");
  kinds.push("USERS");
  return kinds;
}

/** Throw FORBIDDEN unless the actor holds the grant for this target kind and (for OFFERING) teaches every section. */
export async function assertCanTarget(ctx: Ctx, target: NotificationTarget, t: TenantTx): Promise<void> {
  if (!allowedTargetKinds(ctx).includes(target.kind))
    throw new AppError("FORBIDDEN", "لا تملك صلاحية الإرسال لهذا النوع من المستلمين", {
      "target.kind": ["FORBIDDEN"],
    });
  if (isTenantWide(ctx)) return;

  if (target.kind === "OFFERING") {
    const taught = await t.offeringInstructor.count({
      where: { userId: ctx.user.id, offeringId: { in: target.ids }, offering: { deletedAt: null } },
    });
    if (taught !== new Set(target.ids).size) throw new AppError("FORBIDDEN", "إحدى الشُعب خارج نطاقك");
    return;
  }
  if (target.kind === "USERS") {
    // Own-scope senders may only address students enrolled in a section they teach (any status) or co-instructors.
    const reachable = await t.user.count({
      where: {
        id: { in: target.ids },
        deletedAt: null,
        OR: [
          {
            enrollments: {
              some: { offering: { deletedAt: null, instructors: { some: { userId: ctx.user.id } } } },
            },
          },
          {
            teaching: {
              some: { offering: { deletedAt: null, instructors: { some: { userId: ctx.user.id } } } },
            },
          },
        ],
      },
    });
    if (reachable !== new Set(target.ids).size) throw new AppError("FORBIDDEN", "أحد المستلمين خارج نطاقك");
  }
}
