/**
 * Mandatory tenant-isolation tests — docs/30-architecture/01-MULTI-TENANCY.md §8
 *  1. Row created in tenant A is invisible to tenant B (read/update/delete → 0 rows).
 *  2. Without the GUC → 0 rows (fail-closed), never an error that leaks data.
 *  3. INSERT with a foreign tenantId is rejected by WITH CHECK.
 *  4. Runtime role has NO BYPASSRLS.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, platformPrisma, tx } from "@/lib/db";
import { basePrisma } from "@/lib/db/prisma";

let tenantA = "";
let tenantB = "";
const suffix = Date.now().toString(36);

beforeAll(async () => {
  const a = await platformPrisma.tenant.create({ data: { slug: `iso-a-${suffix}`, name: "Tenant A" } });
  const b = await platformPrisma.tenant.create({ data: { slug: `iso-b-${suffix}`, name: "Tenant B" } });
  tenantA = a.id;
  tenantB = b.id;
});

afterAll(async () => {
  await platformPrisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
  await platformPrisma.$disconnect();
  await basePrisma.$disconnect();
});

describe("RLS tenant isolation", () => {
  it("runtime role is not allowed to bypass RLS", async () => {
    const rows = await basePrisma.$queryRaw<{ rolbypassrls: boolean; rolsuper: boolean }[]>`
      SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user`;
    expect(rows[0]?.rolbypassrls).toBe(false);
    expect(rows[0]?.rolsuper).toBe(false);
  });

  it("tenant A rows are invisible to tenant B (read/update/delete)", async () => {
    const created = await db(tenantA).user.create({
      data: { tenantId: tenantA, academicId: "A-1", email: `a1-${suffix}@a.test`, name: "A One" },
    });

    expect(await db(tenantA).user.findUnique({ where: { id: created.id } })).not.toBeNull();
    expect(await db(tenantB).user.findUnique({ where: { id: created.id } })).toBeNull();
    expect(await db(tenantB).user.count()).toBe(0);

    const upd = await db(tenantB).user.updateMany({ where: { id: created.id }, data: { name: "hacked" } });
    expect(upd.count).toBe(0);
    const del = await db(tenantB).user.deleteMany({ where: { id: created.id } });
    expect(del.count).toBe(0);

    const still = await db(tenantA).user.findUnique({ where: { id: created.id } });
    expect(still?.name).toBe("A One");
  });

  it("no GUC → zero rows, no error (fail-closed)", async () => {
    const rows = await basePrisma.user.findMany();
    expect(rows).toEqual([]);
    const count = await basePrisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "User"`;
    expect(Number(count[0]?.n)).toBe(0);
  });

  it("inserting a row with a foreign tenantId is rejected (WITH CHECK)", async () => {
    await expect(
      db(tenantA).user.create({
        data: { tenantId: tenantB, academicId: "X-1", email: `x1-${suffix}@b.test`, name: "Cross" },
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it("tx() keeps the GUC for the whole transaction", async () => {
    const result = await tx(tenantA, async (t) => {
      const role = await t.role.create({ data: { tenantId: tenantA, code: `R-${suffix}`, name: "Role" } });
      const found = await t.role.findUnique({ where: { id: role.id } });
      return found?.code;
    });
    expect(result).toBe(`R-${suffix}`);
    expect(await db(tenantB).role.count()).toBe(0);
  });

  it("composite FK prevents linking to another tenant's role", async () => {
    const roleB = await db(tenantB).role.create({ data: { tenantId: tenantB, code: `RB-${suffix}`, name: "B Role" } });
    const userA = await db(tenantA).user.create({
      data: { tenantId: tenantA, academicId: "A-2", email: `a2-${suffix}@a.test`, name: "A Two" },
    });
    await expect(
      db(tenantA).userRole.create({ data: { tenantId: tenantA, userId: userA.id, roleId: roleB.id } }),
    ).rejects.toThrow();
  });
});
