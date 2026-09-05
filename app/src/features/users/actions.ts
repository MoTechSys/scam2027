"use server";

/**
 * Users module — Server Actions (FR-USR-001..005, 010, 012). Every action:
 *  requireUserOrThrow → assertPermission → (assertCanManageUser for targets) → tx(tenantId) → audit → revalidate.
 * Returns Result<T>; never throws to the client.
 */
import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { assertCanManageUser, assertPermission, hasRole, requireUserOrThrow, type Ctx } from "@/lib/auth/rbac";
import { canManagePermissionSet } from "@/lib/auth/permissions";
import { hashPassword, passwordIssues } from "@/lib/auth/password";
import { audit } from "@/lib/audit";
import { db, tx, type TenantTx } from "@/lib/db/tenant";
import { AppError, type Result } from "@/lib/result";
import { safeAction } from "@/lib/safe-action";
import { nextAcademicId, tenantAcademicIdFormat } from "./academic-id";
import {
  assignRolesSchema,
  createUserSchema,
  resetPasswordSchema,
  setStatusSchema,
  updateUserSchema,
  userIdSchema,
} from "./schemas";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
function generateTempPassword(): string {
  // 12 chars from an unambiguous alphabet + guaranteed classes (upper/lower/digit) per FR-AUTH-002.
  let out = "";
  for (let i = 0; i < 12; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return `${out.slice(0, 4)}A${out.slice(4, 8)}a${out.slice(8)}7`;
}

function revalidateUsers(id?: string) {
  revalidatePath("/users");
  if (id) revalidatePath(`/users/${id}`);
  revalidatePath("/dashboard");
}

/** Roles the actor may grant: only roles whose permissions ⊆ actor's (privilege-escalation guard, FR-ROL-006). */
async function assertGrantableRoles(ctx: Ctx, client: TenantTx, roleIds: string[]): Promise<void> {
  const roles = await client.role.findMany({
    where: { id: { in: roleIds }, deletedAt: null },
    select: { id: true, code: true, permissions: { select: { permissionCode: true } } },
  });
  if (roles.length !== new Set(roleIds).size) throw new AppError("VALIDATION", "دور غير موجود", { roleIds: ["دور غير صالح"] });
  for (const r of roles) {
    if (r.code === "TENANT_ADMIN" && !hasRole(ctx, "TENANT_ADMIN"))
      throw new AppError("FORBIDDEN", "لا يمكن منح دور مدير النظام");
    // Unknown codes are never grantable; self-scope codes (quiz.take …) carry no admin power and are ignored.
    if (!canManagePermissionSet(ctx.user.permissions, r.permissions.map((p) => p.permissionCode)))
      throw new AppError("FORBIDDEN", "لا يمكن منح دور يحوي صلاحيات لا تملكها");
  }
}

async function revokeAllSessions(client: TenantTx, tenantId: string, userId: string, by: string): Promise<void> {
  await client.session.updateMany({
    where: { tenantId, userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedBy: by },
  });
  await client.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}

export type CreateUserResult = { id: string; academicId: string; tempPassword: string | null };

export async function createUserAction(input: unknown): Promise<Result<CreateUserResult>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "user.create");
    const data = createUserSchema.parse(input);
    if (data.password) {
      const issues = passwordIssues(data.password);
      if (issues.length) throw new AppError("VALIDATION", "كلمة مرور ضعيفة", { password: issues });
    }
    const tempPassword = data.password ? null : generateTempPassword();
    const passwordHash = await hashPassword(data.password || (tempPassword as string));

    const created = await tx(ctx.tenantId, async (t) => {
      await assertGrantableRoles(ctx, t, data.roleIds);
      const dup = await t.user.findFirst({
        where: { OR: [{ email: data.email }, ...(data.academicId ? [{ academicId: data.academicId }] : [])] },
        select: { email: true, academicId: true },
      });
      if (dup) {
        const fe: Record<string, string[]> = {};
        if (dup.email === data.email) fe.email = ["البريد مستخدم مسبقًا"];
        if (data.academicId && dup.academicId === data.academicId) fe.academicId = ["الرقم مستخدم مسبقًا"];
        throw new AppError("CONFLICT", "بيانات مكررة", fe);
      }
      const academicId = data.academicId || (await nextAcademicId(t, ctx.tenantId, await tenantAcademicIdFormat(t, ctx.tenantId)));
      const user = await t.user.create({
        data: {
          tenantId: ctx.tenantId,
          academicId,
          email: data.email,
          name: data.name,
          phone: data.phone || null,
          passwordHash,
          status: data.status,
          mustChangePassword: data.mustChangePassword || !!tempPassword,
          profile: data.title ? { create: { title: data.title } } : undefined,
        },
        select: { id: true, academicId: true, email: true, name: true, status: true },
      });
      // UserRole uses a compound tenant FK → cannot be created through the nested relation (Prisma rejects tenantId).
      await t.userRole.createMany({
        data: data.roleIds.map((roleId) => ({ tenantId: ctx.tenantId, userId: user.id, roleId, assignedBy: ctx.user.id })),
      });
      await audit(ctx, { action: "user.create", entity: "User", entityId: user.id, after: { ...user, roleIds: data.roleIds } }, t);
      return user;
    });
    revalidateUsers();
    return { id: created.id, academicId: created.academicId, tempPassword };
  }, { action: "user.create" });
}

export async function updateUserAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "user.edit");
    const data = updateUserSchema.parse(input);
    await assertCanManageUser(ctx, data.id);
    await tx(ctx.tenantId, async (t) => {
      const before = await t.user.findFirst({
        where: { id: data.id, deletedAt: null },
        select: { name: true, email: true, phone: true, locale: true, profile: { select: { title: true } } },
      });
      if (!before) throw new AppError("NOT_FOUND", "المستخدم غير موجود");
      const dup = await t.user.findFirst({ where: { email: data.email, id: { not: data.id } }, select: { id: true } });
      if (dup) throw new AppError("CONFLICT", "البريد مستخدم مسبقًا", { email: ["البريد مستخدم مسبقًا"] });
      await t.user.update({
        where: { id: data.id },
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone || null,
          ...(data.locale ? { locale: data.locale } : {}),
          profile: {
            upsert: {
              create: { title: data.title || null },
              update: { title: data.title || null },
            },
          },
        },
      });
      await audit(ctx, { action: "user.edit", entity: "User", entityId: data.id, before, after: data }, t);
    });
    revalidateUsers(data.id);
    return { id: data.id };
  }, { action: "user.edit" });
}

/** Status transitions (FR-USR-010). FROZEN/DISABLED revoke all sessions immediately. */
export async function setUserStatusAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    const data = setStatusSchema.parse(input);
    assertPermission(ctx, data.status === "FROZEN" ? "user.freeze" : "user.activate");
    if (data.id === ctx.user.id) throw new AppError("FORBIDDEN", "لا يمكنك تغيير حالة حسابك");
    await assertCanManageUser(ctx, data.id);
    await tx(ctx.tenantId, async (t) => {
      const before = await t.user.findFirst({ where: { id: data.id, deletedAt: null }, select: { status: true } });
      if (!before) throw new AppError("NOT_FOUND", "المستخدم غير موجود");
      await t.user.update({
        where: { id: data.id },
        data: { status: data.status, ...(data.status === "ACTIVE" ? { failedLoginCount: 0, lockedUntil: null } : {}) },
      });
      if (data.status === "FROZEN" || data.status === "DISABLED") await revokeAllSessions(t, ctx.tenantId, data.id, ctx.user.id);
      await audit(ctx, { action: `user.status.${data.status.toLowerCase()}`, entity: "User", entityId: data.id, before, after: { status: data.status } }, t);
    });
    revalidateUsers(data.id);
    return { id: data.id };
  }, { action: "user.status" });
}

export async function softDeleteUserAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "user.delete");
    const { id } = userIdSchema.parse(input);
    if (id === ctx.user.id) throw new AppError("FORBIDDEN", "لا يمكنك حذف حسابك");
    await assertCanManageUser(ctx, id);
    await tx(ctx.tenantId, async (t) => {
      const r = await t.user.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date() } });
      if (r.count === 0) throw new AppError("NOT_FOUND", "المستخدم غير موجود");
      await revokeAllSessions(t, ctx.tenantId, id, ctx.user.id);
      await audit(ctx, { action: "user.delete", entity: "User", entityId: id }, t);
    });
    revalidateUsers(id);
    return { id };
  }, { action: "user.delete" });
}

export async function restoreUserAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "user.restore");
    const { id } = userIdSchema.parse(input);
    await tx(ctx.tenantId, async (t) => {
      const r = await t.user.updateMany({ where: { id, deletedAt: { not: null } }, data: { deletedAt: null } });
      if (r.count === 0) throw new AppError("NOT_FOUND", "المستخدم غير موجود في السلة");
      await audit(ctx, { action: "user.restore", entity: "User", entityId: id }, t);
    });
    revalidateUsers(id);
    return { id };
  }, { action: "user.restore" });
}

export async function assignRolesAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "user.change_role", "role.assign");
    const data = assignRolesSchema.parse(input);
    if (data.id === ctx.user.id) throw new AppError("FORBIDDEN", "لا يمكنك تغيير أدوارك");
    await assertCanManageUser(ctx, data.id);
    await tx(ctx.tenantId, async (t) => {
      await assertGrantableRoles(ctx, t, data.roleIds);
      const before = await t.userRole.findMany({ where: { userId: data.id }, select: { roleId: true } });
      await t.userRole.deleteMany({ where: { userId: data.id } });
      await t.userRole.createMany({
        data: data.roleIds.map((roleId) => ({ tenantId: ctx.tenantId, userId: data.id, roleId, assignedBy: ctx.user.id })),
      });
      // Permissions changed → force re-login on other devices.
      await revokeAllSessions(t, ctx.tenantId, data.id, ctx.user.id);
      await audit(ctx, {
        action: "user.change_role",
        entity: "User",
        entityId: data.id,
        before: { roleIds: before.map((b) => b.roleId) },
        after: { roleIds: data.roleIds },
      }, t);
    });
    revalidateUsers(data.id);
    return { id: data.id };
  }, { action: "user.change_role" });
}

export async function resetPasswordAction(input: unknown): Promise<Result<{ id: string; tempPassword: string | null }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "user.reset_password");
    const data = resetPasswordSchema.parse(input);
    await assertCanManageUser(ctx, data.id);
    if (data.password) {
      const issues = passwordIssues(data.password);
      if (issues.length) throw new AppError("VALIDATION", "كلمة مرور ضعيفة", { password: issues });
    }
    const tempPassword = data.password ? null : generateTempPassword();
    const passwordHash = await hashPassword(data.password || (tempPassword as string));
    await tx(ctx.tenantId, async (t) => {
      const r = await t.user.updateMany({
        where: { id: data.id, deletedAt: null },
        data: { passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
      });
      if (r.count === 0) throw new AppError("NOT_FOUND", "المستخدم غير موجود");
      await revokeAllSessions(t, ctx.tenantId, data.id, ctx.user.id);
      await audit(ctx, { action: "user.reset_password", entity: "User", entityId: data.id }, t);
    });
    revalidateUsers(data.id);
    return { id: data.id, tempPassword };
  }, { action: "user.reset_password" });
}

/** Admin-side: terminate every session of a user (e.g. lost device). */
export async function revokeUserSessionsAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "user.freeze", "user.edit");
    const { id } = userIdSchema.parse(input);
    await assertCanManageUser(ctx, id);
    const exists = await db(ctx.tenantId).user.findFirst({ where: { id }, select: { id: true } });
    if (!exists) throw new AppError("NOT_FOUND", "المستخدم غير موجود");
    await tx(ctx.tenantId, async (t) => {
      await revokeAllSessions(t, ctx.tenantId, id, ctx.user.id);
      await audit(ctx, { action: "user.sessions.revoke", entity: "User", entityId: id }, t);
    });
    revalidateUsers(id);
    return { id };
  }, { action: "user.sessions.revoke" });
}
