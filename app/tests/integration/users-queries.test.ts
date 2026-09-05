/**
 * Users module read side + academic id sequence — self-contained tenant (test DB has no seed), RLS on.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nextAcademicId } from "@/features/users/academic-id";
import { listUsers, userStatusCounts } from "@/features/users/queries";
import { userListQuerySchema } from "@/features/users/schemas";
import { platformPrisma, tx } from "@/lib/db";
import { basePrisma } from "@/lib/db/prisma";
import type { Ctx } from "@/lib/auth/rbac";

const suffix = Date.now().toString(36);
let ctx: Ctx;

beforeAll(async () => {
  const t = await platformPrisma.tenant.create({ data: { slug: `usr-${suffix}`, name: "Users T" }, select: { id: true } });
  ctx = {
    tenantId: t.id,
    sessionId: "test",
    requestId: "test",
    user: { id: "00000000-0000-0000-0000-000000000000", name: "t", email: "t", academicId: "t", locale: "ar", mustChangePassword: false, roles: [], permissions: new Set() },
  };
  await tx(t.id, async (x) => {
    const role = await x.role.create({ data: { tenantId: t.id, code: "STUDENT", name: "طالب", isSystem: true } });
    const mk = async (i: number, status: "ACTIVE" | "FROZEN", deleted = false) => {
      const u = await x.user.create({
        data: {
          tenantId: t.id,
          academicId: `S-${i}`,
          email: `s${i}-${suffix}@t.test`,
          name: `Student ${i}`,
          status,
          deletedAt: deleted ? new Date() : null,
        },
      });
      await x.userRole.create({ data: { tenantId: t.id, userId: u.id, roleId: role.id } });
    };
    await mk(1, "ACTIVE");
    await mk(2, "ACTIVE");
    await mk(3, "FROZEN");
    await mk(4, "ACTIVE", true);
  });
});

afterAll(async () => {
  await platformPrisma.tenant.delete({ where: { id: ctx.tenantId } });
  await platformPrisma.$disconnect();
  await basePrisma.$disconnect();
});

describe("users queries", () => {
  it("lists users with server pagination, search and trash filter", async () => {
    const all = await listUsers(ctx, { ...userListQuerySchema.parse({}), pageSize: 2 });
    expect(all.total).toBe(3); // deleted excluded
    expect(all.items).toHaveLength(2);
    expect(all.pageCount).toBe(2);
    expect(all.items[0]?.roles[0]?.code).toBe("STUDENT");

    const byId = await listUsers(ctx, userListQuerySchema.parse({ q: "S-3" }));
    expect(byId.items.map((u) => u.name)).toEqual(["Student 3"]);

    const frozen = await listUsers(ctx, userListQuerySchema.parse({ status: "FROZEN" }));
    expect(frozen.total).toBe(1);

    const deleted = await listUsers(ctx, userListQuerySchema.parse({ status: "DELETED" }));
    expect(deleted.total).toBe(1);
    expect(deleted.items[0]?.deletedAt).not.toBeNull();
  });

  it("status counts sum to ALL and count trash separately", async () => {
    const c = await userStatusCounts(ctx);
    expect(c).toMatchObject({ ACTIVE: 2, FROZEN: 1, DELETED: 1, ALL: 3 });
  });

  it("nextAcademicId increments within the year prefix", async () => {
    const year = new Date().getFullYear();
    const a = await tx(ctx.tenantId, (t) => nextAcademicId(t, ctx.tenantId, "TST-YYYY-NNN"));
    expect(a).toBe(`TST-${year}-001`);
    await tx(ctx.tenantId, (t) => t.user.create({ data: { tenantId: ctx.tenantId, academicId: a, email: `tst-${suffix}@t.test`, name: "tmp" } }));
    const b = await tx(ctx.tenantId, (t) => nextAcademicId(t, ctx.tenantId, "TST-YYYY-NNN"));
    expect(b).toBe(`TST-${year}-002`);
  });
});
