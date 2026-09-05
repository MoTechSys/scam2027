/**
 * Notifications — shared server logic (not a "use server" file): recipient resolution, preference filtering and
 * fan-out into `NotificationRecipient`.
 *
 * Recipient resolution per target kind (all users must be ACTIVE and not deleted; the sender is never a recipient):
 *   ALL         every user of the tenant
 *   ROLE        users holding any of the roles
 *   COLLEGE / DEPARTMENT / MAJOR / LEVEL
 *               students actively enrolled in an offering of a course that belongs to the unit (course.department or
 *               CourseMajor.major/level). The schema has no direct user→major link, so enrolment is the source of truth.
 *   OFFERING    active students + instructors of the sections
 *   USERS       the listed ids
 *
 * Fan-out: ≤ SYNC_FANOUT_LIMIT recipients are inserted in the sender's transaction; larger audiences are queued as a
 * `notification.fanout` Job which `processFanoutJob` executes (kicked off right away via `after()`, and re-runnable by
 * the P1-12 worker for retries). Recipients whose IN_APP preference for the type is disabled are skipped.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import type { TenantTx } from "@/lib/db/tenant";
import { db, tx } from "@/lib/db/tenant";
import { logger } from "@/lib/logger";
import { MUTABLE_TYPES, type NotificationTarget, type NotificationType } from "./schemas";

const INSERT_CHUNK = 1000;

const activeUser = { deletedAt: null, status: "ACTIVE" } as const satisfies Prisma.UserWhereInput;

function courseUnitWhere(target: NotificationTarget): Prisma.CourseWhereInput {
  switch (target.kind) {
    case "COLLEGE":
      return {
        OR: [
          { department: { collegeId: { in: target.ids } } },
          { majors: { some: { major: { department: { collegeId: { in: target.ids } } } } } },
        ],
      };
    case "DEPARTMENT":
      return {
        OR: [
          { departmentId: { in: target.ids } },
          { majors: { some: { major: { departmentId: { in: target.ids } } } } },
        ],
      };
    case "MAJOR":
      return { majors: { some: { majorId: { in: target.ids } } } };
    case "LEVEL":
      return { majors: { some: { levelId: { in: target.ids } } } };
    default:
      return {};
  }
}

/** Prisma `where` selecting the users addressed by `target` (sender excluded, active only). */
export function recipientsWhere(target: NotificationTarget, senderId: string | null): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { ...activeUser, ...(senderId ? { id: { not: senderId } } : {}) };
  switch (target.kind) {
    case "ALL":
      return base;
    case "ROLE":
      return { ...base, roles: { some: { roleId: { in: target.ids }, role: { deletedAt: null } } } };
    case "OFFERING":
      return {
        ...base,
        OR: [
          {
            enrollments: {
              some: { status: "ACTIVE", offeringId: { in: target.ids }, offering: { deletedAt: null } },
            },
          },
          { teaching: { some: { offeringId: { in: target.ids }, offering: { deletedAt: null } } } },
        ],
      };
    case "USERS":
      return { ...base, id: senderId ? { in: target.ids, not: senderId } : { in: target.ids } };
    case "COLLEGE":
    case "DEPARTMENT":
    case "MAJOR":
    case "LEVEL":
      return {
        ...base,
        enrollments: {
          some: {
            status: "ACTIVE",
            offering: { deletedAt: null, course: { deletedAt: null, ...courseUnitWhere(target) } },
          },
        },
      };
  }
}

/** Count matching recipients (used to decide inline vs queued fan-out and to show a preview in the compose dialog). */
export async function countRecipients(
  t: TenantTx,
  target: NotificationTarget,
  senderId: string | null,
): Promise<number> {
  return t.user.count({ where: recipientsWhere(target, senderId) });
}

/** Users who opted out of in-app delivery for `type` (pure helper, unit-tested). */
export function applyPreferences(userIds: string[], optedOut: ReadonlySet<string>): string[] {
  if (optedOut.size === 0) return userIds;
  return userIds.filter((id) => !optedOut.has(id));
}

/** Whether a type honours user preferences at all (SYSTEM / SECURITY never do). */
export function isMutableType(type: NotificationType): boolean {
  return (MUTABLE_TYPES as readonly string[]).includes(type);
}

async function optedOutSet(t: TenantTx, type: NotificationType, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0 || !isMutableType(type)) return new Set();
  const rows = await t.notificationPreference.findMany({
    where: { channel: "IN_APP", type, enabled: false, userId: { in: userIds } },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

/**
 * Resolve + filter + insert recipients for an existing notification row. Idempotent (skipDuplicates) so a retried job
 * never double-delivers. Returns the number of recipients delivered.
 */
export async function fanOut(
  t: TenantTx,
  tenantId: string,
  notification: {
    id: string;
    senderId: string | null;
    type: NotificationType;
    targetSpec: NotificationTarget;
  },
): Promise<number> {
  const users = await t.user.findMany({
    where: recipientsWhere(notification.targetSpec, notification.senderId),
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  const optedOut = await optedOutSet(t, notification.type, ids);
  const deliverTo = applyPreferences(ids, optedOut);
  const now = new Date();
  for (let i = 0; i < deliverTo.length; i += INSERT_CHUNK) {
    await t.notificationRecipient.createMany({
      data: deliverTo.slice(i, i + INSERT_CHUNK).map((userId) => ({
        tenantId,
        notificationId: notification.id,
        userId,
        deliveredAt: now,
      })),
      skipDuplicates: true,
    });
  }
  await t.notification.update({
    where: { id: notification.id },
    data: { recipientCount: deliverTo.length, sentAt: now },
  });
  return deliverTo.length;
}

/**
 * Execute a queued `notification.fanout` job. Locks the row (PENDING → RUNNING) so a concurrent worker skips it,
 * then fans out in its own transaction and records the outcome. Safe to call again after a crash (attempts < max).
 */
export async function processFanoutJob(tenantId: string, jobId: string, workerId = "inline"): Promise<void> {
  const client = db(tenantId);
  const locked = await client.job.updateMany({
    where: { id: jobId, status: "PENDING", type: "notification.fanout" },
    data: {
      status: "RUNNING",
      lockedAt: new Date(),
      lockedBy: workerId,
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  });
  if (locked.count === 0) return;
  const job = await client.job.findFirst({
    where: { id: jobId },
    select: { payload: true, attempts: true, maxAttempts: true },
  });
  if (!job) return;
  const payload = job.payload as { notificationId: string };
  try {
    const delivered = await tx(tenantId, async (t) => {
      const n = await t.notification.findFirst({
        where: { id: payload.notificationId, deletedAt: null },
        select: { id: true, senderId: true, type: true, targetSpec: true },
      });
      if (!n) return 0;
      return fanOut(t, tenantId, { ...n, targetSpec: n.targetSpec as NotificationTarget });
    });
    await client.job.update({
      where: { id: jobId },
      data: { status: "SUCCEEDED", finishedAt: new Date(), result: { delivered } },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ jobId, tenantId, err: message }, "notification.fanout failed");
    await client.job.update({
      where: { id: jobId },
      data: {
        status: job.attempts >= job.maxAttempts ? "FAILED" : "PENDING",
        error: message.slice(0, 1000),
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    });
  }
}
