/**
 * Users module — read side (RSC). All queries go through db(tenantId) (RLS) and are permission-gated by callers.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/tenant";
import type { Ctx } from "@/lib/auth/rbac";
import { paginate, type Page } from "@/lib/result";
import type { UserListQuery, UserStatusValue } from "./schemas";

export type UserRow = {
  id: string;
  academicId: string;
  name: string;
  email: string;
  phone: string | null;
  status: UserStatusValue;
  deletedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  roles: { id: string; code: string; name: string }[];
};

export type RoleOption = { id: string; code: string; name: string; isSystem: boolean };

const rowSelect = {
  id: true,
  academicId: true,
  name: true,
  email: true,
  phone: true,
  status: true,
  deletedAt: true,
  lastLoginAt: true,
  createdAt: true,
  roles: { select: { role: { select: { id: true, code: true, name: true } } } },
} satisfies Prisma.UserSelect;

type Raw = Prisma.UserGetPayload<{ select: typeof rowSelect }>;
const toRow = (u: Raw): UserRow => ({ ...u, roles: u.roles.map((r) => r.role) });

export async function listUsers(ctx: Ctx, q: UserListQuery): Promise<Page<UserRow>> {
  const prisma = db(ctx.tenantId);
  const where: Prisma.UserWhereInput = {
    deletedAt: q.status === "DELETED" ? { not: null } : null,
    ...(q.status !== "ALL" && q.status !== "DELETED" ? { status: q.status } : {}),
    ...(q.roleId ? { roles: { some: { roleId: q.roleId } } } : {}),
    ...(q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: "insensitive" } },
            { email: { contains: q.q, mode: "insensitive" } },
            { academicId: { contains: q.q, mode: "insensitive" } },
            { phone: { contains: q.q } },
          ],
        }
      : {}),
  };
  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: rowSelect,
      orderBy: [{ [q.sort]: q.dir }, { id: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  return paginate(items.map(toRow), total, q.page, q.pageSize);
}

export async function userStatusCounts(ctx: Ctx): Promise<Record<UserStatusValue | "DELETED" | "ALL", number>> {
  const prisma = db(ctx.tenantId);
  const [groups, deleted] = await Promise.all([
    prisma.user.groupBy({ by: ["status"], where: { deletedAt: null }, _count: { _all: true } }),
    prisma.user.count({ where: { deletedAt: { not: null } } }),
  ]);
  const out = { PENDING_ACTIVATION: 0, ACTIVE: 0, FROZEN: 0, DISABLED: 0, DELETED: deleted, ALL: 0 };
  for (const g of groups) {
    out[g.status] = g._count._all;
    out.ALL += g._count._all;
  }
  return out;
}

export async function listRoleOptions(ctx: Ctx): Promise<RoleOption[]> {
  return db(ctx.tenantId).role.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, name: true, isSystem: true },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });
}

export type UserDetail = UserRow & {
  locale: string;
  mustChangePassword: boolean;
  emailVerifiedAt: Date | null;
  failedLoginCount: number;
  lockedUntil: Date | null;
  updatedAt: Date;
  profile: { title: string | null; avatarUrl: string | null } | null;
  activeSessions: number;
  recentAudit: { id: string; action: string; actorName: string | null; createdAt: Date }[];
};

export async function getUserDetail(ctx: Ctx, id: string): Promise<UserDetail | null> {
  const prisma = db(ctx.tenantId);
  const u = await prisma.user.findFirst({
    where: { id },
    select: {
      ...rowSelect,
      locale: true,
      mustChangePassword: true,
      emailVerifiedAt: true,
      failedLoginCount: true,
      lockedUntil: true,
      updatedAt: true,
      profile: { select: { title: true, avatarUrl: true } },
    },
  });
  if (!u) return null;
  const [activeSessions, audit] = await Promise.all([
    prisma.session.count({ where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } } }),
    prisma.auditLog.findMany({
      where: { entity: "User", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, action: true, actorId: true, createdAt: true },
    }),
  ]);
  const actorIds = [...new Set(audit.map((a) => a.actorId).filter((x): x is string => !!x))];
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const nameOf = new Map(actors.map((a) => [a.id, a.name]));
  return {
    ...toRow(u),
    locale: u.locale,
    mustChangePassword: u.mustChangePassword,
    emailVerifiedAt: u.emailVerifiedAt,
    failedLoginCount: u.failedLoginCount,
    lockedUntil: u.lockedUntil,
    updatedAt: u.updatedAt,
    profile: u.profile,
    activeSessions,
    recentAudit: audit.map((a) => ({
      id: a.id,
      action: a.action,
      actorName: a.actorId ? (nameOf.get(a.actorId) ?? null) : null,
      createdAt: a.createdAt,
    })),
  };
}
