"use server";

/**
 * Notifications — Server Actions (FR-NTF-001..005, 008). Every action:
 *  requireUserOrThrow → assertPermission → scope check → tx(tenantId) → audit → revalidate.
 *
 * Invariants
 *  - Sending is rate-limited per user (20 / 10 min) and needs a kind-specific grant (see scope.ts).
 *  - ≤ SYNC_FANOUT_LIMIT recipients are delivered inline; otherwise a `notification.fanout` Job is created and kicked
 *    off after the response (`after()`), so the sender never waits on a 10k-row insert.
 *  - Read / archive / unarchive touch only the caller's own recipient rows; delete is soft and allowed to the sender or
 *    `notification.manage`.
 */
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { audit } from "@/lib/audit";
import { assertPermission, requireUserOrThrow } from "@/lib/auth/rbac";
import { db, tx } from "@/lib/db/tenant";
import { rateLimit } from "@/lib/ratelimit";
import { AppError, type Result } from "@/lib/result";
import { safeAction } from "@/lib/safe-action";
import { countRecipients, fanOut, processFanoutJob } from "./core";
import { addressableUsers, type UserOption } from "./queries";
import { assertCanTarget, isNotificationAdmin } from "./scope";
import {
  SYNC_FANOUT_LIMIT,
  idSchema,
  idsSchema,
  notificationTargetSchema,
  savePreferencesSchema,
  searchUsersSchema,
  sendNotificationSchema,
} from "./schemas";

function revalidateNotifications() {
  revalidatePath("/notifications");
  revalidatePath("/dashboard"); // the header bell re-reads its count on router.refresh() / polling
}

export type SendResult = { id: string; recipientCount: number; queued: boolean };

export async function sendNotificationAction(input: unknown): Promise<Result<SendResult>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "notification.send");
      const data = sendNotificationSchema.parse(input);
      const rl = rateLimit(`notif:send:${ctx.tenantId}:${ctx.user.id}`, 20, 10 * 60_000);
      if (!rl.ok)
        throw new AppError("RATE_LIMITED", `تجاوزت حد الإرسال، أعد المحاولة بعد ${rl.retryAfterSec} ثانية`);

      const out = await tx(ctx.tenantId, async (t) => {
        await assertCanTarget(ctx, data.target, t);
        const total = await countRecipients(t, data.target, ctx.user.id);
        if (total === 0)
          throw new AppError("VALIDATION", "لا يوجد مستلمون مطابقون لهذا الهدف", { "target.ids": ["EMPTY"] });
        const n = await t.notification.create({
          data: {
            tenantId: ctx.tenantId,
            senderId: ctx.user.id,
            type: data.type,
            priority: data.priority,
            title: data.title,
            body: data.body,
            link: data.link ? data.link : null,
            targetSpec: data.target,
          },
          select: { id: true, senderId: true, type: true, targetSpec: true },
        });
        let recipientCount = 0;
        let jobId: string | null = null;
        if (total <= SYNC_FANOUT_LIMIT) {
          recipientCount = await fanOut(t, ctx.tenantId, { ...n, targetSpec: data.target });
        } else {
          const job = await t.job.create({
            data: {
              tenantId: ctx.tenantId,
              type: "notification.fanout",
              payload: { notificationId: n.id },
              createdBy: ctx.user.id,
            },
            select: { id: true },
          });
          jobId = job.id;
        }
        await audit(
          ctx,
          {
            action: "notification.send",
            entity: "Notification",
            entityId: n.id,
            after: {
              title: data.title,
              type: data.type,
              priority: data.priority,
              target: data.target,
              total,
              jobId,
            },
          },
          t,
        );
        return { id: n.id, recipientCount, jobId };
      });

      if (out.jobId) {
        const jobId = out.jobId;
        after(() => processFanoutJob(ctx.tenantId, jobId, "after"));
      }
      revalidateNotifications();
      return { id: out.id, recipientCount: out.recipientCount, queued: out.jobId !== null };
    },
    { action: "notification.send" },
  );
}

/** Preview how many users a target resolves to (compose dialog). Same grants as sending. */
export async function previewRecipientsAction(input: unknown): Promise<Result<{ count: number }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "notification.send");
      const target = notificationTargetSchema.parse(input);
      const count = await tx(ctx.tenantId, async (t) => {
        await assertCanTarget(ctx, target, t);
        return countRecipients(t, target, ctx.user.id);
      });
      return { count };
    },
    { action: "notification.preview" },
  );
}

export async function searchRecipientsAction(input: unknown): Promise<Result<UserOption[]>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "notification.send");
      const { q } = searchUsersSchema.parse(input);
      return addressableUsers(ctx, q);
    },
    { action: "notification.search_recipients" },
  );
}

async function updateOwnRecipients(
  ids: string[],
  data: { readAt?: Date | null; archivedAt?: Date | null },
  action: string,
): Promise<Result<{ count: number }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "notification.view");
      const r = await db(ctx.tenantId).notificationRecipient.updateMany({
        where: { userId: ctx.user.id, notificationId: { in: ids } },
        data,
      });
      revalidateNotifications();
      return { count: r.count };
    },
    { action },
  );
}

export async function markReadAction(input: unknown): Promise<Result<{ count: number }>> {
  const { ids } = idsSchema.parse(input);
  return updateOwnRecipients(ids, { readAt: new Date() }, "notification.read");
}

export async function markUnreadAction(input: unknown): Promise<Result<{ count: number }>> {
  const { ids } = idsSchema.parse(input);
  return updateOwnRecipients(ids, { readAt: null }, "notification.unread");
}

export async function archiveAction(input: unknown): Promise<Result<{ count: number }>> {
  const { ids } = idsSchema.parse(input);
  return updateOwnRecipients(ids, { archivedAt: new Date(), readAt: new Date() }, "notification.archive");
}

export async function unarchiveAction(input: unknown): Promise<Result<{ count: number }>> {
  const { ids } = idsSchema.parse(input);
  return updateOwnRecipients(ids, { archivedAt: null }, "notification.unarchive");
}

export async function markAllReadAction(): Promise<Result<{ count: number }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "notification.view");
      const r = await db(ctx.tenantId).notificationRecipient.updateMany({
        where: { userId: ctx.user.id, readAt: null, archivedAt: null },
        data: { readAt: new Date() },
      });
      revalidateNotifications();
      return { count: r.count };
    },
    { action: "notification.read_all" },
  );
}

/** Soft-delete a sent notification (disappears from every inbox). Sender or `notification.manage`. */
export async function deleteNotificationAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      const { id } = idSchema.parse(input);
      await tx(ctx.tenantId, async (t) => {
        const n = await t.notification.findFirst({
          where: { id, deletedAt: null },
          select: { id: true, title: true, senderId: true, recipientCount: true },
        });
        if (!n) throw new AppError("NOT_FOUND", "الإشعار غير موجود");
        if (n.senderId !== ctx.user.id && !isNotificationAdmin(ctx))
          throw new AppError("FORBIDDEN", "لا يمكنك حذف إشعار لم تُرسله");
        if (n.senderId === ctx.user.id) assertPermission(ctx, "notification.view_sent");
        await t.notification.update({ where: { id }, data: { deletedAt: new Date() } });
        await audit(
          ctx,
          { action: "notification.delete", entity: "Notification", entityId: id, before: n },
          t,
        );
      });
      revalidateNotifications();
      return { id };
    },
    { action: "notification.delete" },
  );
}

export async function savePreferencesAction(input: unknown): Promise<Result<{ count: number }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "notification.view");
      const { items } = savePreferencesSchema.parse(input);
      await tx(ctx.tenantId, async (t) => {
        for (const it of items) {
          await t.notificationPreference.upsert({
            where: {
              tenantId_userId_channel_type: {
                tenantId: ctx.tenantId,
                userId: ctx.user.id,
                channel: "IN_APP",
                type: it.type,
              },
            },
            create: {
              tenantId: ctx.tenantId,
              userId: ctx.user.id,
              channel: "IN_APP",
              type: it.type,
              enabled: it.enabled,
            },
            update: { enabled: it.enabled },
          });
        }
        await audit(
          ctx,
          {
            action: "notification.preferences",
            entity: "NotificationPreference",
            entityId: ctx.user.id,
            after: { items },
          },
          t,
        );
      });
      revalidatePath("/notifications");
      return { count: items.length };
    },
    { action: "notification.preferences" },
  );
}
