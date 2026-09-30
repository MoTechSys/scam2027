/**
 * Request context + RBAC helpers — docs/30-architecture/03-AUTH-RBAC.md §2
 *
 * `requireUser()` is THE authorization entry point for Server Actions, RSC pages and Route Handlers:
 *   JWT → Session row (not revoked, not expired) → User (active, sessionVersion match) → roles → permissions.
 * Result is cached per request with React `cache()`.
 */
import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { auth } from "./auth";
import { db, tx } from "@/lib/db/tenant";
import { AppError } from "@/lib/result";
import { canManagePermissionSet, type PermissionCode } from "./permissions";
import { hasRole } from "./has-permission";
import { forcedChangeReason, loadSecurityPolicy } from "@/features/auth/core";
import type { ChangeReason } from "@/features/auth/schemas";

export type Ctx = {
  tenantId: string;
  sessionId: string;
  user: {
    id: string;
    name: string;
    email: string;
    academicId: string;
    locale: string;
    mustChangePassword: boolean;
    /** ADR-0009 §6 — non-null ⇒ every page redirects to /change-password and every action fails PASSWORD_CHANGE_REQUIRED. */
    passwordChangeRequired: ChangeReason | null;
    roles: string[]; // role codes
    permissions: ReadonlySet<PermissionCode>;
  };
  requestId: string;
  ip?: string;
  userAgent?: string;
};

export type CtxLoadResult =
  | { ok: true; ctx: Ctx }
  | { ok: false; reason: "NO_SESSION" | "SESSION_INVALID" | "TENANT_MISMATCH" | "USER_INACTIVE" };

/** Load the context without redirecting (used by middleware-like layouts and API handlers). */
export const loadCtx = cache(async (): Promise<CtxLoadResult> => {
  const session = await auth();
  const h = await headers();
  const hostTenantId = h.get("x-tenant-id") ?? undefined;
  if (!session?.user?.id || !session.user.tenantId || !session.user.sessionId)
    return { ok: false, reason: "NO_SESSION" };
  if (hostTenantId && hostTenantId !== session.user.tenantId) return { ok: false, reason: "TENANT_MISMATCH" };

  const tenantId = session.user.tenantId;
  const prisma = db(tenantId);
  const row = await prisma.session.findFirst({
    where: {
      id: session.user.sessionId,
      userId: session.user.id,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          academicId: true,
          locale: true,
          status: true,
          deletedAt: true,
          sessionVersion: true,
          mustChangePassword: true,
          passwordChangedAt: true,
          roles: {
            select: {
              role: {
                select: { code: true, deletedAt: true, permissions: { select: { permissionCode: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!row) return { ok: false, reason: "SESSION_INVALID" };
  const u = row.user;
  if (u.deletedAt || u.status !== "ACTIVE") return { ok: false, reason: "USER_INACTIVE" };
  // Cheap when nothing is configured (one findMany on the settings PK prefix + one findUnique), cached per request.
  const policy = await tx(tenantId, (t) => loadSecurityPolicy(t, tenantId));
  const passwordChangeRequired = forcedChangeReason(u, policy);

  const roles = u.roles.filter((r) => !r.role.deletedAt).map((r) => r.role.code);
  const perms = new Set<PermissionCode>();
  for (const r of u.roles)
    if (!r.role.deletedAt) for (const p of r.role.permissions) perms.add(p.permissionCode as PermissionCode);

  // Touch lastSeenAt at most once per minute (cheap, fire-and-forget).
  void prisma.session
    .updateMany({
      where: { id: row.id, lastSeenAt: { lt: new Date(Date.now() - 60_000) } },
      data: { lastSeenAt: new Date() },
    })
    .catch(() => undefined);

  return {
    ok: true,
    ctx: {
      tenantId,
      sessionId: row.id,
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        academicId: u.academicId,
        locale: u.locale,
        mustChangePassword: u.mustChangePassword,
        passwordChangeRequired,
        roles,
        permissions: perms,
      },
      requestId: h.get("x-request-id") ?? randomUUID(),
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? undefined,
      userAgent: h.get("user-agent") ?? undefined,
    },
  };
});

export type RequireOptions = {
  /** Only /change-password itself (page + action) and sign-out may proceed while a password change is pending. */
  allowPasswordChangeRequired?: boolean;
};

/** For pages/layouts: redirect to /login when unauthenticated, to /change-password when a rotation is pending. */
export async function requireUser(opts: RequireOptions = {}): Promise<Ctx> {
  const r = await loadCtx();
  if (!r.ok) redirect(`/login?reason=${r.reason.toLowerCase()}`);
  if (r.ctx.user.passwordChangeRequired && !opts.allowPasswordChangeRequired)
    redirect(`/change-password?reason=${r.ctx.user.passwordChangeRequired.toLowerCase()}`);
  return r.ctx;
}

/** For Server Actions: throw AppError instead of redirecting (converted to Result by safeAction). */
export async function requireUserOrThrow(opts: RequireOptions = {}): Promise<Ctx> {
  const r = await loadCtx();
  if (!r.ok) throw new AppError("UNAUTHENTICATED", "يجب تسجيل الدخول");
  if (r.ctx.user.passwordChangeRequired && !opts.allowPasswordChangeRequired)
    throw new AppError("PASSWORD_CHANGE_REQUIRED", "يجب تغيير كلمة المرور أولًا");
  return r.ctx;
}

export {
  hasPermission,
  hasAllPermissions,
  assertPermission,
  assertAllPermissions,
  hasRole,
} from "./has-permission";

/**
 * Privilege-escalation guard: an actor may only manage users whose *escalating* permission set is a subset
 * of theirs (self-scope codes such as quiz.take carry no admin power and are ignored), and never a TENANT_ADMIN
 * unless they are one.
 */
export async function assertCanManageUser(ctx: Ctx, targetUserId: string): Promise<void> {
  if (targetUserId === ctx.user.id) return;
  const target = await db(ctx.tenantId).user.findFirst({
    where: { id: targetUserId },
    select: {
      roles: {
        select: { role: { select: { code: true, permissions: { select: { permissionCode: true } } } } },
      },
    },
  });
  if (!target) throw new AppError("NOT_FOUND", "المستخدم غير موجود");
  const targetIsAdmin = target.roles.some((r) => r.role.code === "TENANT_ADMIN");
  if (targetIsAdmin && !hasRole(ctx, "TENANT_ADMIN"))
    throw new AppError("FORBIDDEN", "لا يمكن إدارة مستخدم أعلى صلاحية");
  const targetCodes = target.roles.flatMap((r) => r.role.permissions.map((p) => p.permissionCode));
  if (!canManagePermissionSet(ctx.user.permissions, targetCodes))
    throw new AppError("FORBIDDEN", "لا يمكن إدارة مستخدم يملك صلاحيات لا تملكها");
}
