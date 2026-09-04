/**
 * Dashboard data — all counts are real, tenant-scoped (RLS) and permission-gated.
 * System stats require `dashboard.view_system_stats`; the audit feed requires `audit.view`.
 */
import "server-only";
import type { Ctx } from "@/lib/auth/rbac";
import { hasPermission } from "@/lib/auth/rbac";
import { db } from "@/lib/db/tenant";

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

export type DashboardData = {
  system: SystemStats | null;
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
  const localMs = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
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
    prisma.userRole.count({ where: { role: { code: "INSTRUCTOR", deletedAt: null }, user: { deletedAt: null } } }),
    prisma.userRole.count({ where: { role: { code: "STUDENT", deletedAt: null }, user: { deletedAt: null } } }),
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

export async function loadDashboard(ctx: Ctx, timezone: string): Promise<DashboardData> {
  const canSystem = hasPermission(ctx, "dashboard.view_system_stats");
  const canAudit = hasPermission(ctx, "audit.view");
  const [system, me, mySessions, audit] = await Promise.all([
    canSystem ? loadSystemStats(ctx, timezone) : Promise.resolve(null),
    db(ctx.tenantId).user.findUnique({ where: { id: ctx.user.id }, select: { lastLoginAt: true } }),
    loadMySessions(ctx),
    canAudit ? loadRecentAudit(ctx) : Promise.resolve(null),
  ]);
  return { system, lastLoginAt: me?.lastLoginAt ?? null, mySessions, audit };
}
