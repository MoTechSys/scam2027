"use server";

/**
 * Roles module — Server Actions (FR-ROL-001..006). Every action:
 *  requireUserOrThrow → assertPermission → escalation guard → tx(tenantId) → audit → revalidate.
 *
 * Invariants
 *  - System roles (isSystem) are immutable and undeletable (FR-ROL-005); customise by cloning.
 *  - An actor may only grant permissions they hold, and may only touch roles whose current permission set they
 *    could grant themselves (FR-ROL-006, `canManagePermissionSet`).
 *  - Roles are soft-deleted and only when no active member holds them (FR-ROL-003).
 *  - Member permissions are recomputed per request from RolePermission (rbac.loadCtx) → no session bump needed.
 */
import { revalidatePath } from "next/cache";
import { assertPermission, requireUserOrThrow, type Ctx } from "@/lib/auth/rbac";
import { canManagePermissionSet, SYSTEM_ROLES } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import { tx, type TenantTx } from "@/lib/db/tenant";
import { AppError, type Result } from "@/lib/result";
import { safeAction } from "@/lib/safe-action";
import { cloneRoleSchema, createRoleSchema, roleIdSchema, setRolePermissionsSchema, updateRoleSchema } from "./schemas";

function revalidateRoles(id?: string) {
  revalidatePath("/roles");
  if (id) revalidatePath(`/roles/${id}`);
  revalidatePath("/users");
  revalidatePath("/dashboard");
}

const roleSelect = {
  id: true,
  code: true,
  name: true,
  nameEn: true,
  description: true,
  isSystem: true,
  deletedAt: true,
  permissions: { select: { permissionCode: true } },
} as const;

type LoadedRole = {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  isSystem: boolean;
  deletedAt: Date | null;
  permissions: { permissionCode: string }[];
};

/** Load a role and enforce: exists, (optionally) not system, and actor outranks its current permission set. */
async function loadManageableRole(ctx: Ctx, t: TenantTx, id: string, opts: { allowSystem?: boolean; allowDeleted?: boolean } = {}): Promise<LoadedRole> {
  const role = await t.role.findFirst({ where: { id }, select: roleSelect });
  if (!role || (role.deletedAt && !opts.allowDeleted)) throw new AppError("NOT_FOUND", "الدور غير موجود");
  if (role.isSystem && !opts.allowSystem) throw new AppError("FORBIDDEN", "أدوار النظام الأساسية محمية ولا يمكن تعديلها أو حذفها");
  if (!canManagePermissionSet(ctx.user.permissions, role.permissions.map((p) => p.permissionCode)))
    throw new AppError("FORBIDDEN", "لا يمكن إدارة دور يحوي صلاحيات لا تملكها");
  return role;
}

function assertGrantable(ctx: Ctx, codes: string[]): void {
  if (!canManagePermissionSet(ctx.user.permissions, codes))
    throw new AppError("FORBIDDEN", "لا يمكن منح صلاحيات لا تملكها", { permissionCodes: ["تحوي صلاحيات لا تملكها"] });
}

async function assertCodeFree(t: TenantTx, code: string, exceptId?: string): Promise<void> {
  if ((SYSTEM_ROLES as readonly string[]).includes(code))
    throw new AppError("CONFLICT", "الرمز محجوز لدور نظام", { code: ["الرمز محجوز لدور نظام"] });
  const dup = await t.role.findFirst({ where: { code, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  if (dup) throw new AppError("CONFLICT", "رمز الدور مستخدم مسبقًا", { code: ["رمز الدور مستخدم مسبقًا"] });
}

export async function createRoleAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "role.create");
    const data = createRoleSchema.parse(input);
    assertGrantable(ctx, data.permissionCodes);
    const created = await tx(ctx.tenantId, async (t) => {
      await assertCodeFree(t, data.code);
      const role = await t.role.create({
        data: {
          tenantId: ctx.tenantId,
          code: data.code,
          name: data.name,
          nameEn: data.nameEn || null,
          description: data.description || null,
          isSystem: false,
        },
        select: { id: true, code: true, name: true },
      });
      // RolePermission uses a compound tenant FK → create separately (never through the nested relation).
      if (data.permissionCodes.length)
        await t.rolePermission.createMany({
          data: data.permissionCodes.map((permissionCode) => ({ tenantId: ctx.tenantId, roleId: role.id, permissionCode })),
        });
      await audit(ctx, { action: "role.create", entity: "Role", entityId: role.id, after: { ...role, permissionCodes: data.permissionCodes } }, t);
      return role;
    });
    revalidateRoles();
    return { id: created.id };
  }, { action: "role.create" });
}

export async function updateRoleAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "role.edit");
    const data = updateRoleSchema.parse(input);
    await tx(ctx.tenantId, async (t) => {
      const before = await loadManageableRole(ctx, t, data.id);
      const after = { name: data.name, nameEn: data.nameEn || null, description: data.description || null };
      await t.role.update({ where: { id: data.id }, data: after });
      await audit(
        ctx,
        { action: "role.update", entity: "Role", entityId: data.id, before: { name: before.name, nameEn: before.nameEn, description: before.description }, after },
        t,
      );
    });
    revalidateRoles(data.id);
    return { id: data.id };
  }, { action: "role.update" });
}

export async function setRolePermissionsAction(input: unknown): Promise<Result<{ id: string; count: number }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "role.edit_permissions");
    const data = setRolePermissionsSchema.parse(input);
    assertGrantable(ctx, data.permissionCodes);
    await tx(ctx.tenantId, async (t) => {
      const role = await loadManageableRole(ctx, t, data.id);
      const before: string[] = role.permissions.map((p) => p.permissionCode).sort();
      const after: string[] = [...data.permissionCodes].sort();
      const removed = before.filter((c) => !after.includes(c));
      const added = after.filter((c) => !before.includes(c));
      if (removed.length) await t.rolePermission.deleteMany({ where: { roleId: data.id, permissionCode: { in: removed } } });
      if (added.length)
        await t.rolePermission.createMany({ data: added.map((permissionCode) => ({ tenantId: ctx.tenantId, roleId: data.id, permissionCode })) });
      await t.role.update({ where: { id: data.id }, data: { updatedAt: new Date() } });
      await audit(ctx, { action: "role.set_permissions", entity: "Role", entityId: data.id, before: { permissionCodes: before }, after: { permissionCodes: after, added, removed } }, t);
    });
    revalidateRoles(data.id);
    return { id: data.id, count: data.permissionCodes.length };
  }, { action: "role.set_permissions" });
}

export async function cloneRoleAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "role.create");
    const data = cloneRoleSchema.parse(input);
    const created = await tx(ctx.tenantId, async (t) => {
      // Cloning a system role is the sanctioned way to customise it; the escalation guard still applies.
      const source = await loadManageableRole(ctx, t, data.sourceId, { allowSystem: true });
      await assertCodeFree(t, data.code);
      const codes = source.permissions.map((p) => p.permissionCode);
      const role = await t.role.create({
        data: { tenantId: ctx.tenantId, code: data.code, name: data.name, nameEn: null, description: source.description, isSystem: false },
        select: { id: true, code: true, name: true },
      });
      if (codes.length)
        await t.rolePermission.createMany({ data: codes.map((permissionCode) => ({ tenantId: ctx.tenantId, roleId: role.id, permissionCode })) });
      await audit(ctx, { action: "role.clone", entity: "Role", entityId: role.id, before: { sourceId: source.id, sourceCode: source.code }, after: { ...role, permissionCodes: codes } }, t);
      return role;
    });
    revalidateRoles();
    return { id: created.id };
  }, { action: "role.clone" });
}

export async function softDeleteRoleAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "role.delete");
    const { id } = roleIdSchema.parse(input);
    await tx(ctx.tenantId, async (t) => {
      const role = await loadManageableRole(ctx, t, id);
      const members = await t.userRole.count({ where: { roleId: id, user: { deletedAt: null } } });
      if (members > 0) throw new AppError("CONFLICT", `لا يمكن حذف دور مرتبط بـ ${members} مستخدم؛ أزل الدور من المستخدمين أولًا`);
      await t.role.update({ where: { id }, data: { deletedAt: new Date() } });
      await audit(ctx, { action: "role.delete", entity: "Role", entityId: id, before: { code: role.code, name: role.name } }, t);
    });
    revalidateRoles(id);
    return { id };
  }, { action: "role.delete" });
}

export async function restoreRoleAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "role.delete");
    const { id } = roleIdSchema.parse(input);
    await tx(ctx.tenantId, async (t) => {
      const role = await loadManageableRole(ctx, t, id, { allowDeleted: true });
      if (!role.deletedAt) throw new AppError("CONFLICT", "الدور غير محذوف");
      await t.role.update({ where: { id }, data: { deletedAt: null } });
      await audit(ctx, { action: "role.restore", entity: "Role", entityId: id, after: { code: role.code, name: role.name } }, t);
    });
    revalidateRoles(id);
    return { id };
  }, { action: "role.restore" });
}
