/**
 * The permission catalogue has three copies that must never drift:
 *  docs/20-product/02-PERMISSIONS-MATRIX.md (source of truth) → src/lib/auth/permissions.ts (generated) → DB `Permission` rows (seeded).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PERMISSION_CODES,
  PERMISSIONS,
  PLATFORM_PERMISSIONS,
  SYSTEM_ROLE_GRANTS,
  SYSTEM_ROLES,
  isPermissionCode,
} from "@/lib/auth/permissions";
import { NAV_ITEMS } from "@/lib/nav/items";

const matrix = readFileSync(resolve(__dirname, "../../../docs/20-product/02-PERMISSIONS-MATRIX.md"), "utf8");
const docCodes = [...matrix.matchAll(/^\| `([a-z_]+\.[a-z_]+)` \|/gm)].map((m) => m[1] as string);
// Platform rows use a shorthand: `platform.tenant.view` / `.create` / `.edit` → expand to full codes.
const platformDocCodes = [...matrix.matchAll(/^\| (`platform\.[^|]+) \|/gm)].flatMap((m) => {
  const parts = [...(m[1] as string).matchAll(/`([^`]+)`/g)].map((x) => x[1] as string);
  const base = parts[0] as string;
  const prefix = base.slice(0, base.lastIndexOf("."));
  return parts.map((p) => (p.startsWith(".") ? `${prefix}${p}` : p));
});
// Own-scope codes only make sense for the actor themself; admins act through the full-scope code instead.
const OWN_SCOPE_ONLY = ["quiz.take", "assignment.submit", "grade.view_own"];

describe("permission catalogue", () => {
  it("codes are unique, dotted resource.action", () => {
    expect(new Set(PERMISSION_CODES).size).toBe(PERMISSION_CODES.length);
    for (const c of PERMISSION_CODES) expect(c).toMatch(/^[a-z_]+\.[a-z_]+$/);
  });

  it("generated file matches the matrix document exactly", () => {
    const tenantDoc = docCodes.filter((c) => !c.startsWith("platform."));
    expect([...PERMISSION_CODES].sort()).toEqual([...new Set(tenantDoc)].sort());
    expect([...PLATFORM_PERMISSIONS].sort()).toEqual([...new Set(platformDocCodes)].sort());
  });

  it("every system role grants only known codes and TENANT_ADMIN has them all", () => {
    for (const role of SYSTEM_ROLES) {
      for (const code of Object.keys(SYSTEM_ROLE_GRANTS[role])) expect(isPermissionCode(code)).toBe(true);
    }
    const adminCodes = new Set(Object.keys(SYSTEM_ROLE_GRANTS.TENANT_ADMIN));
    const missing = PERMISSIONS.map((p) => p.code).filter((c) => !adminCodes.has(c));
    expect(missing.sort()).toEqual([...OWN_SCOPE_ONLY].sort());
    expect(Object.keys(SYSTEM_ROLE_GRANTS.STUDENT).length).toBeLessThan(Object.keys(SYSTEM_ROLE_GRANTS.INSTRUCTOR).length);
  });

  it("nav items reference existing permission codes", () => {
    for (const item of NAV_ITEMS) if (item.permission) expect(isPermissionCode(item.permission)).toBe(true);
  });
});
