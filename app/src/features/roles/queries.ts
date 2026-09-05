/**
 * Roles module — read side (RSC). All queries go through db(tenantId) (RLS); callers gate with role.view / role.view_permissions.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/tenant";
import type { Ctx } from "@/lib/auth/rbac";
import { PERMISSION_COUNT, type PermissionCode } from "@/lib/auth/permissions";
import type { RoleListQuery } from "./schemas";

export type RoleRow = {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  isSystem: boolean;
  deletedAt: Date | null;
  updatedAt: Date;
  /** FR-ROL-004 — active (non-deleted) members. */
  userCount: number;
  permissionCount: number;
  /** Total permissions in the catalogue, for "n / total" display. */
  permissionTotal: number;
};

export type RoleDetail = RoleRow & { permissionCodes: PermissionCode[] };

const rowSelect = {
  id: true,
  code: true,
  name: true,
  nameEn: true,
  description: true,
  isSystem: true,
  deletedAt: true,
  updatedAt: true,
  _count: { select: { users: { where: { user: { deletedAt: null } } }, permissions: true } },
} satisfies Prisma.RoleSelect;

type Raw = Prisma.RoleGetPayload<{ select: typeof rowSelect }>;
const toRow = ({ _count, ...r }: Raw): RoleRow => ({
  ...r,
  userCount: _count.users,
  permissionCount: _count.permissions,
  permissionTotal: PERMISSION_COUNT,
});

export async function listRoles(ctx: Ctx, q: RoleListQuery): Promise<RoleRow[]> {
  const where: Prisma.RoleWhereInput = {
    deletedAt: q.tab === "DELETED" ? { not: null } : null,
    ...(q.tab === "SYSTEM" ? { isSystem: true } : q.tab === "CUSTOM" ? { isSystem: false } : {}),
    ...(q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: "insensitive" } },
            { nameEn: { contains: q.q, mode: "insensitive" } },
            { code: { contains: q.q.toUpperCase() } },
          ],
        }
      : {}),
  };
  const rows = await db(ctx.tenantId).role.findMany({
    where,
    select: rowSelect,
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });
  return rows.map(toRow);
}

export async function roleTabCounts(ctx: Ctx): Promise<Record<RoleListQuery["tab"], number>> {
  const prisma = db(ctx.tenantId);
  const [system, custom, deleted] = await Promise.all([
    prisma.role.count({ where: { deletedAt: null, isSystem: true } }),
    prisma.role.count({ where: { deletedAt: null, isSystem: false } }),
    prisma.role.count({ where: { deletedAt: { not: null } } }),
  ]);
  return { ALL: system + custom, SYSTEM: system, CUSTOM: custom, DELETED: deleted };
}

export async function getRoleDetail(ctx: Ctx, id: string): Promise<RoleDetail | null> {
  const r = await db(ctx.tenantId).role.findFirst({
    where: { id },
    select: { ...rowSelect, permissions: { select: { permissionCode: true }, orderBy: { permissionCode: "asc" } } },
  });
  if (!r) return null;
  const { permissions, ...rest } = r;
  return { ...toRow(rest), permissionCodes: permissions.map((p) => p.permissionCode as PermissionCode) };
}

export type RoleMember = { id: string; name: string; academicId: string; email: string; status: string };

/** First `take` active members of a role (detail page side panel). */
export async function listRoleMembers(ctx: Ctx, roleId: string, take = 20): Promise<RoleMember[]> {
  const rows = await db(ctx.tenantId).userRole.findMany({
    where: { roleId, user: { deletedAt: null } },
    select: { user: { select: { id: true, name: true, academicId: true, email: true, status: true } } },
    orderBy: { user: { name: "asc" } },
    take,
  });
  return rows.map((r) => r.user);
}
