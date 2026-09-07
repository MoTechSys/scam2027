/**
 * Dashboard data — all counts are real, tenant-scoped (RLS) and permission-gated.
 * System stats require `dashboard.view_system_stats`; the audit feed requires `audit.view`.
 */
import "server-only";
import type { Ctx } from "@/lib/auth/rbac";
import { hasPermission } from "@/lib/auth/rbac";
import { db } from "@/lib/db/tenant";
import { fileScopeWhere } from "@/features/files/scope";
import { courseScopeWhere, offeringScopeWhere } from "@/features/offerings/scope";

export type SystemStats = {
  users: number;
  activeUsers: number;
  pendingActivation: number;
  lockedAccounts: number;
  roles: number;
  sessions: number;
  loginsToday: number;
  failedLogins24h: number;
  instructors: number;
  students: number;
};

export type MySession = {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  current: boolean;
};

export type AuditRow = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorName: string | null;
  createdAt: Date;
};

/** Compact mobile overview (ADR-0007 §3): counts the actor is allowed to see; `null` = no permission. */
export type Overview = {
  courses: number | null;
  files: number | null;
  openOfferings: number | null;
  unreadNotifications: number | null;
  /** New users per month for the trailing 6 months (oldest first). Requires `dashboard.view_system_stats`. */
  growth: { month: Date; users: number }[] | null;
};

export type DashboardData = {
  system: SystemStats | null;
  overview: Overview;
  lastLoginAt: Date | null;
  mySessions: MySession[];
  audit: AuditRow[] | null;
};

function startOfToday(tz: string): Date {
  // Midnight in the tenant timezone, expressed as a UTC instant.
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const localMs = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  const offsetMs = localMs - now.getTime();
  const localMidnight = Date.UTC(get("year"), get("month") - 1, get("day"));
  return new Date(localMidnight - offsetMs);
}

export async function loadSystemStats(ctx: Ctx, timezone: string): Promise<SystemStats> {
  const prisma = db(ctx.tenantId);
  const now = new Date();
  const since24h = new Date(now.getTime() - 86_400_000);
  const today = startOfToday(timezone);
  const [
    users,
    activeUsers,
    pendingActivation,
    lockedAccounts,
    roles,
    sessions,
    loginsToday,
    failedLogins24h,
    instructors,
    students,
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null, status: "ACTIVE" } }),
    prisma.user.count({ where: { deletedAt: null, status: "PENDING_ACTIVATION" } }),
    prisma.user.count({ where: { deletedAt: null, lockedUntil: { gt: now } } }),
    prisma.role.count({ where: { deletedAt: null } }),
    prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
    prisma.loginAttempt.count({ where: { success: true, createdAt: { gte: today } } }),
    prisma.loginAttempt.count({ where: { success: false, createdAt: { gte: since24h } } }),
    prisma.userRole.count({
      where: { role: { code: "INSTRUCTOR", deletedAt: null }, user: { deletedAt: null } },
    }),
    prisma.userRole.count({
      where: { role: { code: "STUDENT", deletedAt: null }, user: { deletedAt: null } },
    }),
  ]);
  return {
    users,
    activeUsers,
    pendingActivation,
    lockedAccounts,
    roles,
    sessions,
    loginsToday,
    failedLogins24h,
    instructors,
    students,
  };
}

export async function loadMySessions(ctx: Ctx): Promise<MySession[]> {
  const rows = await db(ctx.tenantId).session.findMany({
    where: { userId: ctx.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    take: 10,
    select: { id: true, ip: true, userAgent: true, createdAt: true, lastSeenAt: true },
  });
  return rows.map((r) => ({ ...r, current: r.id === ctx.sessionId }));
}

export async function loadRecentAudit(ctx: Ctx, take = 8): Promise<AuditRow[]> {
  const prisma = db(ctx.tenantId);
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, action: true, entity: true, entityId: true, actorId: true, createdAt: true },
  });
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(actors.map((a) => [a.id, a.name]));
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    actorName: r.actorId ? (names.get(r.actorId) ?? null) : null,
    createdAt: r.createdAt,
  }));
}

/** First day (UTC) of the month `back` months before now. */
function monthStart(back: number): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1));
}

/** New users per calendar month for the trailing `months` months (oldest first). One grouped query, no N+1. */
export async function loadUserGrowth(ctx: Ctx, months = 6): Promise<{ month: Date; users: number }[]> {
  const from = monthStart(months - 1);
  const rows = await db(ctx.tenantId).$queryRaw<{ month: Date; users: bigint }[]>`
    SELECT date_trunc('month', "createdAt") AS month, count(*)::bigint AS users
    FROM "User"
    WHERE "tenantId" = ${ctx.tenantId}::uuid AND "deletedAt" IS NULL AND "createdAt" >= ${from}
    GROUP BY 1 ORDER BY 1`;
  const byKey = new Map(rows.map((r) => [new Date(r.month).toISOString().slice(0, 7), Number(r.users)]));
  return Array.from({ length: months }, (_, i) => {
    const m = monthStart(months - 1 - i);
    return { month: m, users: byKey.get(m.toISOString().slice(0, 7)) ?? 0 };
  });
}

/** Scope-aware counts for the mobile 3×2 grid. Uses the same visibility rules as the module pages. */
export async function loadOverview(ctx: Ctx): Promise<Overview> {
  const prisma = db(ctx.tenantId);
  const [courses, files, openOfferings, unread, growth] = await Promise.all([
    hasPermission(ctx, "course.view")
      ? prisma.course.count({ where: { AND: [{ deletedAt: null }, courseScopeWhere(ctx)] } })
      : Promise.resolve(null),
    hasPermission(ctx, "file.view")
      ? prisma.file.count({ where: { AND: [{ deletedAt: null }, fileScopeWhere(ctx)] } })
      : Promise.resolve(null),
    hasPermission(ctx, "offering.view")
      ? prisma.courseOffering.count({
          where: { AND: [{ deletedAt: null, status: "OPEN" }, offeringScopeWhere(ctx)] },
        })
      : Promise.resolve(null),
    hasPermission(ctx, "notification.view")
      ? prisma.notificationRecipient.count({
          where: { userId: ctx.user.id, readAt: null, archivedAt: null, notification: { deletedAt: null } },
        })
      : Promise.resolve(null),
    hasPermission(ctx, "dashboard.view_system_stats") ? loadUserGrowth(ctx) : Promise.resolve(null),
  ]);
  return { courses, files, openOfferings, unreadNotifications: unread, growth };
}

export async function loadDashboard(ctx: Ctx, timezone: string): Promise<DashboardData> {
  const canSystem = hasPermission(ctx, "dashboard.view_system_stats");
  const canAudit = hasPermission(ctx, "audit.view");
  const [system, overview, me, mySessions, audit] = await Promise.all([
    canSystem ? loadSystemStats(ctx, timezone) : Promise.resolve(null),
    loadOverview(ctx),
    db(ctx.tenantId).user.findUnique({ where: { id: ctx.user.id }, select: { lastLoginAt: true } }),
    loadMySessions(ctx),
    canAudit ? loadRecentAudit(ctx) : Promise.resolve(null),
  ]);
  return { system, overview, lastLoginAt: me?.lastLoginAt ?? null, mySessions, audit };
}
