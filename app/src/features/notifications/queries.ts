/**
 * Notifications — read side (RSC). Inbox rows are the actor's own `NotificationRecipient` rows; the SENT tab lists
 * notifications the actor sent (`notification.view_sent`) or every notification (`notification.manage`) with read stats.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/rbac";
import { hasPermission } from "@/lib/auth/has-permission";
import type { Option } from "@/lib/contracts/option";
import { db } from "@/lib/db/tenant";
import { paginate, type Page } from "@/lib/result";
import { isTenantWide } from "@/features/offerings/scope";
import { isNotificationAdmin } from "./scope";
import {
  MUTABLE_TYPES,
  type InboxQuery,
  type MutableType,
  type InboxTab,
  type NotificationPriority,
  type NotificationTarget,
  type NotificationType,
} from "./schemas";

export type InboxRow = {
  id: string; // notification id
  title: string;
  body: string;
  type: NotificationType;
  priority: NotificationPriority;
  link: string | null;
  senderName: string | null; // null = system
  deliveredAt: Date;
  readAt: Date | null;
  archivedAt: Date | null;
};

export type SentRow = {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  priority: NotificationPriority;
  link: string | null;
  target: NotificationTarget;
  senderId: string | null;
  senderName: string | null;
  recipientCount: number;
  readCount: number;
  sentAt: Date | null;
  createdAt: Date;
  isOwner: boolean;
};

const recipientSelect = {
  deliveredAt: true,
  readAt: true,
  archivedAt: true,
  notification: {
    select: { id: true, title: true, body: true, type: true, priority: true, link: true, senderId: true },
  },
} satisfies Prisma.NotificationRecipientSelect;

function inboxWhere(ctx: Ctx, q: InboxQuery): Prisma.NotificationRecipientWhereInput {
  const where: Prisma.NotificationRecipientWhereInput = {
    userId: ctx.user.id,
    notification: {
      deletedAt: null,
      ...(q.type ? { type: q.type } : {}),
      ...(q.q
        ? {
            OR: [
              { title: { contains: q.q, mode: "insensitive" } },
              { body: { contains: q.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
  };
  if (q.tab === "UNREAD") Object.assign(where, { readAt: null, archivedAt: null });
  else if (q.tab === "ARCHIVED") Object.assign(where, { archivedAt: { not: null } });
  else Object.assign(where, { archivedAt: null });
  return where;
}

async function senderNames(tenantId: string, ids: Array<string | null>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map();
  const users = await db(tenantId).user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(users.map((u) => [u.id, u.name]));
}

export async function listInbox(ctx: Ctx, q: InboxQuery): Promise<Page<InboxRow>> {
  const client = db(ctx.tenantId);
  const where = inboxWhere(ctx, q);
  const [rows, total] = await Promise.all([
    client.notificationRecipient.findMany({
      where,
      select: recipientSelect,
      orderBy: [{ deliveredAt: "desc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    client.notificationRecipient.count({ where }),
  ]);
  const names = await senderNames(
    ctx.tenantId,
    rows.map((r) => r.notification.senderId),
  );
  const items: InboxRow[] = rows.map((r) => ({
    id: r.notification.id,
    title: r.notification.title,
    body: r.notification.body,
    type: r.notification.type,
    priority: r.notification.priority,
    link: r.notification.link,
    senderName: r.notification.senderId ? (names.get(r.notification.senderId) ?? null) : null,
    deliveredAt: r.deliveredAt,
    readAt: r.readAt,
    archivedAt: r.archivedAt,
  }));
  return paginate(items, total, q.page, q.pageSize);
}

/** Unread, non-archived count for the header bell. */
export async function unreadCount(ctx: Ctx): Promise<number> {
  return db(ctx.tenantId).notificationRecipient.count({
    where: { userId: ctx.user.id, readAt: null, archivedAt: null, notification: { deletedAt: null } },
  });
}

export async function inboxCounts(ctx: Ctx): Promise<Record<InboxTab, number>> {
  const client = db(ctx.tenantId);
  const live = { deletedAt: null } as const;
  const [all, unread, archived, sent] = await Promise.all([
    client.notificationRecipient.count({
      where: { userId: ctx.user.id, archivedAt: null, notification: live },
    }),
    client.notificationRecipient.count({
      where: { userId: ctx.user.id, readAt: null, archivedAt: null, notification: live },
    }),
    client.notificationRecipient.count({
      where: { userId: ctx.user.id, archivedAt: { not: null }, notification: live },
    }),
    canViewSent(ctx)
      ? client.notification.count({ where: { ...live, ...sentWhere(ctx) } })
      : Promise.resolve(0),
  ]);
  return { ALL: all, UNREAD: unread, ARCHIVED: archived, SENT: sent };
}

export function canViewSent(ctx: Pick<Ctx, "user">): boolean {
  return hasPermission(ctx, "notification.view_sent") || isNotificationAdmin(ctx);
}

function sentWhere(ctx: Ctx): Prisma.NotificationWhereInput {
  return isNotificationAdmin(ctx) ? {} : { senderId: ctx.user.id };
}

export async function listSent(ctx: Ctx, q: InboxQuery): Promise<Page<SentRow>> {
  if (!canViewSent(ctx)) return paginate([], 0, q.page, q.pageSize);
  const client = db(ctx.tenantId);
  const where: Prisma.NotificationWhereInput = {
    deletedAt: null,
    ...sentWhere(ctx),
    ...(q.type ? { type: q.type } : {}),
    ...(q.q
      ? {
          OR: [
            { title: { contains: q.q, mode: "insensitive" } },
            { body: { contains: q.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    client.notification.findMany({
      where,
      select: {
        id: true,
        title: true,
        body: true,
        type: true,
        priority: true,
        link: true,
        targetSpec: true,
        senderId: true,
        recipientCount: true,
        sentAt: true,
        createdAt: true,
        _count: { select: { recipients: { where: { readAt: { not: null } } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    client.notification.count({ where }),
  ]);
  const names = await senderNames(
    ctx.tenantId,
    rows.map((r) => r.senderId),
  );
  const items: SentRow[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    type: r.type,
    priority: r.priority,
    link: r.link,
    target: r.targetSpec as NotificationTarget,
    senderId: r.senderId,
    senderName: r.senderId ? (names.get(r.senderId) ?? null) : null,
    recipientCount: r.recipientCount,
    readCount: r._count.recipients,
    sentAt: r.sentAt,
    createdAt: r.createdAt,
    isOwner: r.senderId === ctx.user.id,
  }));
  return paginate(items, total, q.page, q.pageSize);
}

/* ───────────── Preferences ───────────── */
export type PreferenceRow = { type: MutableType; enabled: boolean };

/** In-app preference per mutable type (missing row = enabled). */
export async function preferences(ctx: Ctx): Promise<PreferenceRow[]> {
  const rows = await db(ctx.tenantId).notificationPreference.findMany({
    where: { userId: ctx.user.id, channel: "IN_APP" },
    select: { type: true, enabled: true },
  });
  const map = new Map(rows.map((r) => [r.type as string, r.enabled]));
  return MUTABLE_TYPES.map((type) => ({ type, enabled: map.get(type) ?? true }));
}

/* ───────────── Compose lookups ───────────── */
export type TargetLookups = {
  roles: Option[];
  colleges: Option[];
  departments: Option[];
  majors: Option[];
  levels: Option[];
  offerings: Option[];
};

/** Options for the compose dialog, narrowed to what the actor may address (offerings: taught ones unless tenant-wide). */
export async function targetLookups(ctx: Ctx): Promise<TargetLookups> {
  const client = db(ctx.tenantId);
  const wide = isTenantWide(ctx);
  const [roles, colleges, departments, majors, levels, offerings] = await Promise.all([
    hasPermission(ctx, "notification.send_to_role")
      ? client.role.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : [],
    hasPermission(ctx, "notification.send_to_all")
      ? client.college.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
          orderBy: { sortOrder: "asc" },
        })
      : [],
    hasPermission(ctx, "notification.send_to_all")
      ? client.department.findMany({
          where: { isActive: true },
          select: { id: true, name: true, college: { select: { name: true } } },
          orderBy: { sortOrder: "asc" },
        })
      : [],
    hasPermission(ctx, "notification.send_to_all")
      ? client.major.findMany({
          where: { isActive: true },
          select: { id: true, name: true, department: { select: { name: true } } },
          orderBy: { sortOrder: "asc" },
        })
      : [],
    hasPermission(ctx, "notification.send_to_all")
      ? client.level.findMany({
          where: { isActive: true },
          select: { id: true, name: true, major: { select: { name: true } } },
          orderBy: [{ majorId: "asc" }, { number: "asc" }],
        })
      : [],
    hasPermission(ctx, "notification.send_to_offering")
      ? client.courseOffering.findMany({
          where: { deletedAt: null, ...(wide ? {} : { instructors: { some: { userId: ctx.user.id } } }) },
          select: {
            id: true,
            section: true,
            course: { select: { code: true, name: true } },
            semester: { select: { name: true } },
          },
          orderBy: [{ semester: { startDate: "desc" } }, { course: { code: "asc" } }, { section: "asc" }],
        })
      : [],
  ]);
  return {
    roles: roles.map((r) => ({ id: r.id, label: r.name })),
    colleges: colleges.map((c) => ({ id: c.id, label: c.name })),
    departments: departments.map((d) => ({ id: d.id, label: d.name, group: d.college.name })),
    majors: majors.map((m) => ({ id: m.id, label: m.name, group: m.department.name })),
    levels: levels.map((l) => ({ id: l.id, label: l.name, group: l.major.name })),
    offerings: offerings.map((o) => ({
      id: o.id,
      label: `${o.course.code} — ${o.course.name} (${o.section})`,
      group: o.semester.name,
    })),
  };
}

export type UserOption = { id: string; name: string; academicId: string; email: string };

/** Users addressable by the actor for the USERS kind (tenant-wide: anyone active; own-scope: people in taught sections). */
export async function addressableUsers(ctx: Ctx, q: string, take = 20): Promise<UserOption[]> {
  const term = q.trim();
  const scope: Prisma.UserWhereInput = isTenantWide(ctx)
    ? {}
    : {
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
      };
  return db(ctx.tenantId).user.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      id: { not: ctx.user.id },
      ...scope,
      ...(term
        ? {
            AND: [
              {
                OR: [
                  { name: { contains: term, mode: "insensitive" } },
                  { academicId: { contains: term } },
                  { email: { contains: term.toLowerCase() } },
                ],
              },
            ],
          }
        : {}),
    },
    select: { id: true, name: true, academicId: true, email: true },
    orderBy: { name: "asc" },
    take,
  });
}
