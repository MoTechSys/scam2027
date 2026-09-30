/**
 * P1-09 — audit log read side against a real tenant with RLS on:
 *  - listAuditLogs: newest first, pagination, every filter (actor, actorKind, entity, entityId, action exact/prefix,
 *    day range in tenant tz, free text incl. actor name), actor resolution (user / deleted user / system)
 *  - getAuditEntry: full row with before/after; unknown id → null
 *  - auditFacets: distinct entities/actions/actors
 *  - iterateAuditLogs: keyset batches, stable order, cap, no duplicates
 *  - cross-tenant invisibility (RLS)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditFacets,
  countAuditLogs,
  getAuditEntry,
  iterateAuditLogs,
  listAuditLogs,
} from "@/features/audit/queries";
import { auditQuerySchema } from "@/features/audit/schemas";
import type { Ctx } from "@/lib/auth/rbac";
import { platformPrisma, tx } from "@/lib/db";

const suffix = Date.now().toString(36);
const TZ = "Asia/Riyadh";
const q = (o: Record<string, unknown> = {}) => auditQuerySchema.parse(o);
const mkCtx = (tenantId: string, userId: string): Ctx => ({
  tenantId,
  sessionId: "test",
  requestId: "test",
  user: {
    id: userId,
    name: "t",
    email: "t",
    academicId: "t",
    locale: "ar",
    mustChangePassword: false,
    passwordChangeRequired: null,
    roles: [],
    permissions: new Set(),
  },
});

let tid = "";
let otherTid = "";
let admin = "";
let staff = "";
const ghost = "00000000-0000-4000-8000-00000000dead"; // never created → "deleted actor"
let ctx: Ctx;
const at = (iso: string) => new Date(iso);

beforeAll(async () => {
  tid = (
    await platformPrisma.tenant.create({
      data: { slug: `audit-${suffix}`, name: "Audit", timezone: TZ },
      select: { id: true },
    })
  ).id;
  otherTid = (
    await platformPrisma.tenant.create({
      data: { slug: `audit2-${suffix}`, name: "Audit2" },
      select: { id: true },
    })
  ).id;
  await tx(tid, async (x) => {
    const mk = async (email: string, academicId: string, name: string) =>
      (
        await x.user.create({
          data: { tenantId: tid, email, name, academicId, passwordHash: "x", status: "ACTIVE" },
          select: { id: true },
        })
      ).id;
    admin = await mk("admin@a", "A1", "Amal Admin");
    staff = await mk("staff@a", "S1", "Sami Staff");
    const rows = [
      {
        actorId: admin,
        action: "user.create",
        entity: "User",
        entityId: "u1",
        after: { name: "X" },
        createdAt: at("2026-03-10T08:00:00Z"),
      },
      {
        actorId: admin,
        action: "user.edit",
        entity: "User",
        entityId: "u1",
        before: { name: "X" },
        after: { name: "Y" },
        createdAt: at("2026-03-10T09:00:00Z"),
      },
      {
        actorId: staff,
        action: "course.create",
        entity: "Course",
        entityId: "c1",
        after: { code: "CS101" },
        createdAt: at("2026-03-11T10:00:00Z"),
      },
      {
        actorId: null,
        action: "trash.purge_auto",
        entity: "Trash",
        after: { purged: { FILE: 2 } },
        createdAt: at("2026-03-12T00:30:00Z"),
      },
      {
        actorId: ghost,
        action: "role.delete",
        entity: "Role",
        entityId: "r1",
        before: { name: "Old" },
        createdAt: at("2026-03-15T20:59:00Z"),
      }, // 23:59 Riyadh on the 15th
      {
        actorId: admin,
        action: "auth.login.success",
        entity: "Session",
        createdAt: at("2026-03-15T21:00:00Z"),
      }, // 00:00 Riyadh on the 16th
    ];
    for (const r of rows)
      await x.auditLog.create({
        data: { tenantId: tid, ip: "10.0.0.1", requestId: `req-${r.action}`, ...r },
      });
  });
  await tx(otherTid, (x) =>
    x.auditLog.create({
      data: { tenantId: otherTid, action: "user.create", entity: "User", entityId: "other" },
    }),
  );
  ctx = mkCtx(tid, admin);
});

afterAll(async () => {
  await platformPrisma.tenant.deleteMany({ where: { id: { in: [tid, otherTid] } } });
});

describe("listAuditLogs", () => {
  it("returns newest first with resolved actors and paginates", async () => {
    const p1 = await listAuditLogs(ctx, q({ pageSize: 10 }), TZ);
    expect(p1.total).toBe(6);
    expect(p1.items.map((r) => r.action)).toEqual([
      "auth.login.success",
      "role.delete",
      "trash.purge_auto",
      "course.create",
      "user.edit",
      "user.create",
    ]);
    const [login, del, purge] = p1.items;
    expect(login!.actor).toMatchObject({ kind: "user", name: "Amal Admin", deleted: false });
    expect(del!.actor).toMatchObject({ kind: "user", id: ghost, deleted: true });
    expect(purge!.actor).toEqual({ kind: "system" });
    expect(login!.hasDiff).toBe(false);
    expect(del!.hasDiff).toBe(true);
    const p2 = await listAuditLogs(ctx, q({ pageSize: 10, page: 2 }), TZ);
    expect(p2.items).toHaveLength(0);
    expect(p2.pageCount).toBe(1);
  });
  it("filters by actor, actorKind, entity, entityId and action (exact and prefix)", async () => {
    expect((await listAuditLogs(ctx, q({ actorId: staff }), TZ)).items.map((r) => r.action)).toEqual([
      "course.create",
    ]);
    expect((await listAuditLogs(ctx, q({ actorKind: "SYSTEM" }), TZ)).items.map((r) => r.action)).toEqual([
      "trash.purge_auto",
    ]);
    expect((await listAuditLogs(ctx, q({ actorKind: "USER" }), TZ)).total).toBe(5);
    expect((await listAuditLogs(ctx, q({ entity: "User" }), TZ)).total).toBe(2);
    expect((await listAuditLogs(ctx, q({ entityId: "c1" }), TZ)).items[0]!.entity).toBe("Course");
    expect((await listAuditLogs(ctx, q({ action: "user.edit" }), TZ)).total).toBe(1);
    expect((await listAuditLogs(ctx, q({ action: "user." }), TZ)).total).toBe(2);
    expect((await listAuditLogs(ctx, q({ action: "user" }), TZ)).total).toBe(0); // exact match without dot
  });
  it("widens from/to to whole tenant-local days", async () => {
    // 2026-03-15 in Riyadh = 14T21:00Z .. 15T20:59:59Z → includes role.delete (20:59Z), excludes login (21:00Z)
    const day15 = await listAuditLogs(ctx, q({ from: "2026-03-15", to: "2026-03-15" }), TZ);
    expect(day15.items.map((r) => r.action)).toEqual(["role.delete"]);
    const day16 = await listAuditLogs(ctx, q({ from: "2026-03-16" }), TZ);
    expect(day16.items.map((r) => r.action)).toEqual(["auth.login.success"]);
    expect((await listAuditLogs(ctx, q({ to: "2026-03-10" }), TZ)).total).toBe(2);
  });
  it("free text matches action/entity/id/requestId and actor name/email", async () => {
    expect((await listAuditLogs(ctx, q({ q: "purge" }), TZ)).total).toBe(1);
    expect((await listAuditLogs(ctx, q({ q: "CS" }), TZ)).total).toBe(0); // snapshots are not searched
    expect((await listAuditLogs(ctx, q({ q: "c1" }), TZ)).total).toBe(1);
    expect((await listAuditLogs(ctx, q({ q: "req-user.edit" }), TZ)).total).toBe(1);
    expect((await listAuditLogs(ctx, q({ q: "Sami" }), TZ)).items.map((r) => r.action)).toEqual([
      "course.create",
    ]);
    expect((await listAuditLogs(ctx, q({ q: "staff@a" }), TZ)).total).toBe(1);
  });
});

describe("getAuditEntry / auditFacets", () => {
  it("returns the full entry with snapshots; unknown id → null", async () => {
    const row = (await listAuditLogs(ctx, q({ action: "user.edit" }), TZ)).items[0]!;
    const e = await getAuditEntry(ctx, row.id);
    expect(e).toMatchObject({
      action: "user.edit",
      before: { name: "X" },
      after: { name: "Y" },
      ip: "10.0.0.1",
    });
    expect(await getAuditEntry(ctx, "00000000-0000-4000-8000-000000000001")).toBeNull();
  });
  it("lists distinct entities, actions and resolvable actors", async () => {
    const f = await auditFacets(ctx);
    expect(f.entities).toEqual(["Course", "Role", "Session", "Trash", "User"]);
    expect(f.actions).toContain("trash.purge_auto");
    expect(f.actors.map((a) => a.name).sort()).toEqual(["Amal Admin", "Sami Staff"]); // ghost is not resolvable
  });
});

describe("iterateAuditLogs (export)", () => {
  it("streams keyset batches in the same order as the list, without gaps or duplicates", async () => {
    const seen: string[] = [];
    for await (const batch of iterateAuditLogs(ctx, q({}), TZ)) seen.push(...batch.map((r) => r.id));
    const list = await listAuditLogs(ctx, q({ pageSize: 100 }), TZ);
    expect(seen).toEqual(list.items.map((r) => r.id));
    expect(new Set(seen).size).toBe(6);
    expect(await countAuditLogs(ctx, q({ entity: "User" }), TZ)).toBe(2);
  });
  it("respects filters in the stream", async () => {
    const out: string[] = [];
    for await (const b of iterateAuditLogs(ctx, q({ actorKind: "SYSTEM" }), TZ))
      out.push(...b.map((r) => r.action));
    expect(out).toEqual(["trash.purge_auto"]);
  });
});

describe("tenant isolation", () => {
  it("never leaks rows across tenants", async () => {
    const other = mkCtx(otherTid, admin);
    const p = await listAuditLogs(other, q({}), TZ);
    expect(p.total).toBe(1);
    expect(p.items[0]!.entityId).toBe("other");
    const mine = (await listAuditLogs(ctx, q({}), TZ)).items[0]!;
    expect(await getAuditEntry(other, mine.id)).toBeNull();
  });
});
