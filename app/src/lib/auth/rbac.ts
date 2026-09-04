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
import { db } from "@/lib/db/tenant";
import { AppError } from "@/lib/result";
import type { PermissionCode } from "./permissions";

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
        roles,
        permissions: perms,
      },
      requestId: h.get("x-request-id") ?? randomUUID(),
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? undefined,
      userAgent: h.get("user-agent") ?? undefined,
    },
  };
});

/** For pages/layouts: redirect to /login when unauthenticated. */
export async function requireUser(): Promise<Ctx> {
  const r = await loadCtx();
  if (!r.ok) redirect(`/login?reason=${r.reason.toLowerCase()}`);
  return r.ctx;
}

/** For Server Actions: throw AppError instead of redirecting (converted to Result by safeAction). */
export async function requireUserOrThrow(): Promise<Ctx> {
  const r = await loadCtx();
  if (!r.ok) throw new AppError("UNAUTHENTICATED", "يجب تسجيل الدخول");
  return r.ctx;
}

export function hasPermission(ctx: Pick<Ctx, "user">, ...perms: PermissionCode[]): boolean {
  return perms.some((p) => ctx.user.permissions.has(p));
}

export function hasAllPermissions(ctx: Pick<Ctx, "user">, ...perms: PermissionCode[]): boolean {
  return perms.every((p) => ctx.user.permissions.has(p));
}

/** Any of the given permissions suffices. */
export function assertPermission(ctx: Pick<Ctx, "user">, ...perms: PermissionCode[]): void {
  if (!hasPermission(ctx, ...perms)) throw new AppError("FORBIDDEN", "ليس لديك صلاحية لهذا الإجراء");
}

export function assertAllPermissions(ctx: Pick<Ctx, "user">, ...perms: PermissionCode[]): void {
  if (!hasAllPermissions(ctx, ...perms)) throw new AppError("FORBIDDEN", "ليس لديك صلاحية لهذا الإجراء");
}

export function hasRole(ctx: Pick<Ctx, "user">, ...roles: string[]): boolean {
  return roles.some((r) => ctx.user.roles.includes(r));
}

/**
 * Privilege-escalation guard: an actor may only manage users whose permission set is a subset of theirs,
 * and never a TENANT_ADMIN unless they are one.
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
  for (const r of target.roles)
    for (const p of r.role.permissions)
      if (!ctx.user.permissions.has(p.permissionCode as PermissionCode))
        throw new AppError("FORBIDDEN", "لا يمكن إدارة مستخدم يملك صلاحيات لا تملكها");
}
