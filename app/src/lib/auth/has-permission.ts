/**
 * Pure permission predicates — no `server-only`, no next-auth, no Prisma.
 *
 * `rbac.ts` re-exports these so call sites keep importing from `@/lib/auth/rbac`; modules that must stay
 * loadable under vitest (feature scope helpers, queries) import from here directly to avoid dragging the
 * auth runtime (next-auth → next/server) into the test process.
 */
import { AppError } from "@/lib/result";
import type { PermissionCode } from "./permissions";

export type PermissionCtx = { user: { permissions: ReadonlySet<PermissionCode>; roles: string[] } };

/** Any of the given permissions suffices. */
export function hasPermission(ctx: PermissionCtx, ...perms: PermissionCode[]): boolean {
  return perms.some((p) => ctx.user.permissions.has(p));
}

export function hasAllPermissions(ctx: PermissionCtx, ...perms: PermissionCode[]): boolean {
  return perms.every((p) => ctx.user.permissions.has(p));
}

/** Any of the given permissions suffices. */
export function assertPermission(ctx: PermissionCtx, ...perms: PermissionCode[]): void {
  if (!hasPermission(ctx, ...perms)) throw new AppError("FORBIDDEN", "ليس لديك صلاحية لهذا الإجراء");
}

export function assertAllPermissions(ctx: PermissionCtx, ...perms: PermissionCode[]): void {
  if (!hasAllPermissions(ctx, ...perms)) throw new AppError("FORBIDDEN", "ليس لديك صلاحية لهذا الإجراء");
}

export function hasRole(ctx: PermissionCtx, ...roles: string[]): boolean {
  return roles.some((r) => ctx.user.roles.includes(r));
}
