#!/usr/bin/env python3
"""Regenerate app/src/lib/auth/permissions.ts from docs/20-product/02-PERMISSIONS-MATRIX.md.

Single source of truth = the docs matrix. Run from anywhere:
    python3 app/scripts/gen-permissions.py
A Vitest test (src/lib/auth/permissions.test.ts) asserts the generated file is in sync with the doc
and that the DB `Permission` table matches after seeding.
"""
import re, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
DOC = ROOT / "docs/20-product/02-PERMISSIONS-MATRIX.md"
OUT = ROOT / "app/src/lib/auth/permissions.ts"

ROW_RE = re.compile(r"\| `([a-z_]+\.[a-z_]+)` \| (.+?) \|\s*(.)\s*\|\s*(.)\s*\|\s*(.)\s*\|\s*(.)\s*\|")
HDR_RE = re.compile(r"### 2\.\d+ (.+?) \((.+?)\)")


def parse():
    sec2 = DOC.read_text(encoding="utf8").split("## 2. ")[1].split("\n## 3")[0]
    label, rows = None, []
    for line in sec2.splitlines():
        m = HDR_RE.match(line)
        if m:
            label = m.group(1).split(" — ")[0].strip()
            continue
        m = ROW_RE.match(line)
        if m and label:
            code, desc, a, ac, i, s = m.groups()
            rows.append(dict(code=code, desc=desc.strip(), group=code.split(".")[0], label=label, A=a, AC=ac, I=i, S=s))
    return rows


def render(rows):
    groups = {}
    for r in rows:
        groups.setdefault(r["group"], (r["label"], []))[1].append(r)
    L = []
    L.append(
        """/**
 * Permission catalogue — GENERATED from docs/20-product/02-PERMISSIONS-MATRIX.md by scripts/gen-permissions.py
 * DO NOT EDIT BY HAND. ADR-0003: dotted `resource.action` codes.
 *
 * Scope legend (matches the matrix): "all" = ● granted tenant-wide · "own" = ◐ limited to own/enrolled scope.
 * Scope is enforced by assert* helpers in rbac.ts (e.g. assertOwnsOffering), not by the code itself.
 */

export type PermissionScope = "all" | "own";

export interface PermissionDef {
  readonly code: PermissionCode;
  readonly group: PermissionGroup;
  readonly description: string;
}

export const SYSTEM_ROLES = ["TENANT_ADMIN", "ACADEMIC_ADMIN", "INSTRUCTOR", "STUDENT"] as const;
export type SystemRoleCode = (typeof SYSTEM_ROLES)[number];

export const PLATFORM_ROLE = "PLATFORM_SUPER_ADMIN" as const;
"""
    )
    L.append("export const PERMISSION_GROUPS = {")
    for g, (label, _) in groups.items():
        L.append(f'  {g}: "{label}",')
    L.append("} as const;\nexport type PermissionGroup = keyof typeof PERMISSION_GROUPS;\n")
    L.append("export const PERMISSIONS = [")
    for g, (label, rs) in groups.items():
        L.append(f"  // ── {g} — {label}")
        for r in rs:
            d = r["desc"].replace('"', '\\"')
            L.append(f'  {{ code: "{r["code"]}", group: "{g}", description: "{d}" }},')
    L.append("] as const satisfies readonly { code: string; group: PermissionGroup; description: string }[];\n")
    L.append('export type PermissionCode = (typeof PERMISSIONS)[number]["code"];\n')
    L.append("export const PERMISSION_CODES: readonly PermissionCode[] = PERMISSIONS.map((p) => p.code);\n")
    L.append("export const PERMISSION_COUNT = PERMISSIONS.length;\n")
    L.append(
        """/**
 * Default grants for system roles. Value = scope ("all" | "own"). Absent = not granted.
 * Seeded into RolePermission for every new tenant.
 */"""
    )
    L.append(
        "export const SYSTEM_ROLE_GRANTS: Record<SystemRoleCode, Readonly<Partial<Record<PermissionCode, PermissionScope>>>> = {"
    )
    for col, role in (("A", "TENANT_ADMIN"), ("AC", "ACADEMIC_ADMIN"), ("I", "INSTRUCTOR"), ("S", "STUDENT")):
        L.append(f"  {role}: {{")
        for r in rows:
            if r[col] == "●":
                L.append(f'    "{r["code"]}": "all",')
            elif r[col] == "◐":
                L.append(f'    "{r["code"]}": "own",')
        L.append("  },")
    L.append("};\n")
    L.append(
        """/** Platform (Super Admin) permissions — outside tenants; never stored in RolePermission. */
export const PLATFORM_PERMISSIONS = [
  "platform.tenant.view",
  "platform.tenant.create",
  "platform.tenant.edit",
  "platform.tenant.suspend",
  "platform.tenant.delete",
  "platform.subscription.manage",
  "platform.audit.view",
  "platform.impersonate",
] as const;
export type PlatformPermissionCode = (typeof PLATFORM_PERMISSIONS)[number];

export function isPermissionCode(value: string): value is PermissionCode {
  return (PERMISSION_CODES as readonly string[]).includes(value);
}

export function permissionsByGroup(): Record<PermissionGroup, PermissionDef[]> {
  const out = {} as Record<PermissionGroup, PermissionDef[]>;
  for (const g of Object.keys(PERMISSION_GROUPS) as PermissionGroup[]) out[g] = [];
  for (const p of PERMISSIONS) out[p.group].push(p);
  return out;
}
"""
    )
    return "\n".join(L)


if __name__ == "__main__":
    rows = parse()
    OUT.write_text(render(rows), encoding="utf8")
    print(f"✓ {len(rows)} tenant permissions → {OUT.relative_to(ROOT)}")
