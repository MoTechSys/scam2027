/**
 * Roles module read side — self-contained tenant, RLS on. Covers list/tabs/search, counts, detail and members.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getRoleDetail, listRoleMembers, listRoles, roleTabCounts } from "@/features/roles/queries";
import { roleListQuerySchema } from "@/features/roles/schemas";
import { PERMISSION_COUNT, PERMISSIONS } from "@/lib/auth/permissions";
import { platformPrisma, tx } from "@/lib/db";
import { basePrisma } from "@/lib/db/prisma";
import type { Ctx } from "@/lib/auth/rbac";

const suffix = Date.now().toString(36);
let ctx: Ctx;
let customId = "";

beforeAll(async () => {
  // Permission is a global (non-tenant) catalogue table; the test DB is unseeded, so upsert the two codes we reference.
  for (const p of PERMISSIONS.filter((p) => p.code === "file.view" || p.code === "file.download"))
    await platformPrisma.permission.upsert({ where: { code: p.code }, create: p, update: {} });
  const t = await platformPrisma.tenant.create({ data: { slug: `rol-${suffix}`, name: "Roles T" }, select: { id: true } });
  ctx = {
    tenantId: t.id,
    sessionId: "test",
    requestId: "test",
    user: { id: "00000000-0000-0000-0000-000000000000", name: "t", email: "t", academicId: "t", locale: "ar", mustChangePassword: false, roles: [], permissions: new Set() },
  };
  await tx(t.id, async (x) => {
    const student = await x.role.create({ data: { tenantId: t.id, code: "STUDENT", name: "طالب", isSystem: true } });
    const custom = await x.role.create({ data: { tenantId: t.id, code: "LIBRARIAN", name: "أمين مكتبة", nameEn: "Librarian", description: "d" } });
    await x.role.create({ data: { tenantId: t.id, code: "OLD_ROLE", name: "قديم", deletedAt: new Date() } });
    customId = custom.id;
    await x.rolePermission.createMany({
      data: [
        { tenantId: t.id, roleId: custom.id, permissionCode: "file.view" },
        { tenantId: t.id, roleId: custom.id, permissionCode: "file.download" },
      ],
    });
    const u1 = await x.user.create({ data: { tenantId: t.id, academicId: "L-1", email: `l1-${suffix}@t.test`, name: "Lib One" } });
    const u2 = await x.user.create({ data: { tenantId: t.id, academicId: "L-2", email: `l2-${suffix}@t.test`, name: "Lib Two", deletedAt: new Date() } });
    await x.userRole.createMany({
      data: [
        { tenantId: t.id, userId: u1.id, roleId: custom.id },
        { tenantId: t.id, userId: u2.id, roleId: custom.id }, // deleted user → not counted
        { tenantId: t.id, userId: u1.id, roleId: student.id },
      ],
    });
  });
});

afterAll(async () => {
  await platformPrisma.tenant.delete({ where: { id: ctx.tenantId } });
  await platformPrisma.$disconnect();
  await basePrisma.$disconnect();
});

describe("roles queries", () => {
  it("lists roles by tab with counts (active members only, deleted excluded)", async () => {
    const all = await listRoles(ctx, roleListQuerySchema.parse({}));
    expect(all.map((r) => r.code)).toEqual(["STUDENT", "LIBRARIAN"]); // system first, then by name
    const lib = all.find((r) => r.code === "LIBRARIAN")!;
    expect(lib).toMatchObject({ userCount: 1, permissionCount: 2, permissionTotal: PERMISSION_COUNT, isSystem: false });

    expect((await listRoles(ctx, roleListQuerySchema.parse({ tab: "SYSTEM" }))).map((r) => r.code)).toEqual(["STUDENT"]);
    expect((await listRoles(ctx, roleListQuerySchema.parse({ tab: "CUSTOM" }))).map((r) => r.code)).toEqual(["LIBRARIAN"]);
    expect((await listRoles(ctx, roleListQuerySchema.parse({ tab: "DELETED" }))).map((r) => r.code)).toEqual(["OLD_ROLE"]);
  });

  it("searches by name, English name and code (case-insensitive)", async () => {
    expect((await listRoles(ctx, roleListQuerySchema.parse({ q: "مكتبة" }))).map((r) => r.code)).toEqual(["LIBRARIAN"]);
    expect((await listRoles(ctx, roleListQuerySchema.parse({ q: "librar" }))).map((r) => r.code)).toEqual(["LIBRARIAN"]);
    expect((await listRoles(ctx, roleListQuerySchema.parse({ q: "stud" }))).map((r) => r.code)).toEqual(["STUDENT"]);
  });

  it("tab counts", async () => {
    expect(await roleTabCounts(ctx)).toEqual({ ALL: 2, SYSTEM: 1, CUSTOM: 1, DELETED: 1 });
  });

  it("detail returns sorted permission codes; members exclude deleted users", async () => {
    const d = await getRoleDetail(ctx, customId);
    expect(d?.permissionCodes).toEqual(["file.download", "file.view"]);
    const members = await listRoleMembers(ctx, customId);
    expect(members.map((m) => m.academicId)).toEqual(["L-1"]);
    expect(await getRoleDetail(ctx, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
