/**
 * P1-07 — notifications against a real tenant with RLS on:
 *  - fanOut: resolves ALL / OFFERING / USERS audiences, excludes the sender, skips users who disabled IN_APP for the
 *    type (but never for SYSTEM), is idempotent (skipDuplicates) and stamps recipientCount/sentAt
 *  - inbox: each user sees only their own recipient rows; unread/archived counts; sender name resolution
 *  - sent: instructor (view_sent) sees own only; manage sees all with read stats; others see nothing
 *  - assertCanTarget: own-scope instructor limited to taught offerings / reachable users
 *  - processFanoutJob: PENDING → SUCCEEDED with result.delivered; second run is a no-op
 *  - cross-tenant invisibility
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { countRecipients, fanOut, processFanoutJob } from "@/features/notifications/core";
import { inboxCounts, listInbox, listSent, preferences, unreadCount } from "@/features/notifications/queries";
import { inboxQuerySchema } from "@/features/notifications/schemas";
import { assertCanTarget } from "@/features/notifications/scope";
import type { Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/rbac";
import type { PermissionCode } from "@/lib/auth/permissions";
import { platformPrisma, tx } from "@/lib/db";
import { db } from "@/lib/db/tenant";
import { basePrisma } from "@/lib/db/prisma";

const suffix = Date.now().toString(36);
const mkCtx = (tenantId: string, userId: string, perms: PermissionCode[] = []): Ctx => ({
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
    roles: [],
    permissions: new Set(perms),
  },
});
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const q = (o: Record<string, unknown> = {}) => inboxQuerySchema.parse(o);

let tid = "";
let otherTid = "";
const ids = { admin: "", instr: "", instr2: "", s1: "", s2: "", s3: "", inactive: "", sec1: "", sec3: "" };
let admin: Ctx, instr: Ctx, instr2: Ctx, s1: Ctx, s2: Ctx, other: Ctx;

async function send(
  senderId: string | null,
  title: string,
  type: "ANNOUNCEMENT" | "ACADEMIC" | "SYSTEM",
  targetSpec: Prisma.InputJsonObject,
) {
  return tx(tid, async (t) => {
    const n = await t.notification.create({
      data: { tenantId: tid, senderId, title, body: "b", type, priority: "NORMAL", targetSpec },
      select: { id: true },
    });
    const delivered = await fanOut(t, tid, {
      id: n.id,
      senderId,
      type,
      targetSpec: targetSpec as never,
    });
    return { id: n.id, delivered };
  });
}

beforeAll(async () => {
  const t1 = await platformPrisma.tenant.create({
    data: { slug: `ntf-${suffix}`, name: "Ntf" },
    select: { id: true },
  });
  const t2 = await platformPrisma.tenant.create({
    data: { slug: `ntf2-${suffix}`, name: "Ntf2" },
    select: { id: true },
  });
  tid = t1.id;
  otherTid = t2.id;
  await tx(tid, async (x) => {
    const mk = async (email: string, academicId: string, status: "ACTIVE" | "DISABLED" = "ACTIVE") =>
      (
        await x.user.create({
          data: { tenantId: tid, email, name: `User ${academicId}`, academicId, passwordHash: "x", status },
          select: { id: true },
        })
      ).id;
    ids.admin = await mk("admin@t", "A1");
    ids.instr = await mk("i1@t", "I1");
    ids.instr2 = await mk("i2@t", "I2");
    ids.s1 = await mk("s1@t", "S1");
    ids.s2 = await mk("s2@t", "S2");
    ids.s3 = await mk("s3@t", "S3");
    ids.inactive = await mk("x@t", "X1", "DISABLED");

    const year = await x.academicYear.create({
      data: {
        tenantId: tid,
        code: "2026/2027",
        name: "y",
        startDate: d("2026-09-01"),
        endDate: d("2027-07-31"),
        isCurrent: true,
      },
    });
    const sem = await x.semester.create({
      data: {
        tenantId: tid,
        academicYearId: year.id,
        term: "FIRST",
        name: "الأول",
        startDate: d("2026-09-01"),
        endDate: d("2027-01-31"),
        isCurrent: true,
        status: "ACTIVE",
      },
    });
    const cs101 = await x.course.create({ data: { tenantId: tid, code: "CS101", name: "برمجة" } });
    const cs102 = await x.course.create({ data: { tenantId: tid, code: "CS102", name: "كائنية" } });
    const sec1 = await x.courseOffering.create({
      data: { tenantId: tid, courseId: cs101.id, semesterId: sem.id, section: "1", status: "OPEN" },
    });
    const sec3 = await x.courseOffering.create({
      data: { tenantId: tid, courseId: cs102.id, semesterId: sem.id, section: "1", status: "OPEN" },
    });
    ids.sec1 = sec1.id;
    ids.sec3 = sec3.id;
    await x.offeringInstructor.createMany({
      data: [
        { tenantId: tid, offeringId: sec1.id, userId: ids.instr, role: "PRIMARY" },
        { tenantId: tid, offeringId: sec3.id, userId: ids.instr2, role: "PRIMARY" },
      ],
    });
    await x.enrollment.createMany({
      data: [
        { tenantId: tid, offeringId: sec1.id, studentId: ids.s1, status: "ACTIVE", source: "MANUAL" },
        { tenantId: tid, offeringId: sec1.id, studentId: ids.s2, status: "WITHDRAWN", source: "MANUAL" },
        { tenantId: tid, offeringId: sec3.id, studentId: ids.s3, status: "ACTIVE", source: "MANUAL" },
      ],
    });
    // s2 opted out of ANNOUNCEMENT in-app
    await x.notificationPreference.create({
      data: { tenantId: tid, userId: ids.s2, channel: "IN_APP", type: "ANNOUNCEMENT", enabled: false },
    });
  });
  admin = mkCtx(tid, ids.admin, [
    "course.manage_all",
    "notification.view",
    "notification.send",
    "notification.send_to_all",
    "notification.send_to_role",
    "notification.send_to_offering",
    "notification.manage",
    "notification.view_sent",
  ]);
  instr = mkCtx(tid, ids.instr, [
    "notification.view",
    "notification.send",
    "notification.send_to_offering",
    "notification.view_sent",
  ]);
  instr2 = mkCtx(tid, ids.instr2, [
    "notification.view",
    "notification.send",
    "notification.send_to_offering",
  ]);
  s1 = mkCtx(tid, ids.s1, ["notification.view"]);
  s2 = mkCtx(tid, ids.s2, ["notification.view"]);
  other = mkCtx(otherTid, ids.admin, ["notification.view", "notification.manage"]);
});

afterAll(async () => {
  await platformPrisma.tenant.deleteMany({ where: { id: { in: [tid, otherTid] } } });
  await platformPrisma.$disconnect();
  await basePrisma.$disconnect();
});

describe("fanOut (FR-NTF-002/003/005)", () => {
  it("ALL: every ACTIVE user except sender; honours disabled IN_APP preference for ANNOUNCEMENT", async () => {
    // active users: admin, instr, instr2, s1, s2, s3 (6) − sender(admin) − s2 (opted out) = 4
    expect(await tx(tid, (t) => countRecipients(t, { kind: "ALL" }, ids.admin))).toBe(5);
    const r = await send(ids.admin, "N-all", "ANNOUNCEMENT", { kind: "ALL" });
    expect(r.delivered).toBe(4);
    const rows = await db(tid).notificationRecipient.findMany({
      where: { notificationId: r.id },
      select: { userId: true },
    });
    expect(rows.map((x) => x.userId).sort()).toEqual([ids.instr, ids.instr2, ids.s1, ids.s3].sort());
    const n = await db(tid).notification.findFirst({ where: { id: r.id } });
    expect(n?.recipientCount).toBe(4);
    expect(n?.sentAt).not.toBeNull();
  });
  it("SYSTEM ignores preferences and can be sender-less", async () => {
    const r = await send(null, "N-sys", "SYSTEM", { kind: "USERS", ids: [ids.s2, ids.inactive] });
    expect(r.delivered).toBe(1); // s2 (opted out only for ANNOUNCEMENT) — inactive skipped
  });
  it("OFFERING reaches active students + instructors of the section, never the sender", async () => {
    const r = await send(ids.instr, "N-sec1", "ACADEMIC", { kind: "OFFERING", ids: [ids.sec1] });
    expect(r.delivered).toBe(1); // s1 only (s2 WITHDRAWN, instr is sender)
    const r2 = await send(ids.admin, "N-sec1-admin", "ACADEMIC", { kind: "OFFERING", ids: [ids.sec1] });
    expect(r2.delivered).toBe(2); // s1 + instr
  });
  it("is idempotent — re-running fanOut does not duplicate rows", async () => {
    const r = await send(ids.admin, "N-idem", "ACADEMIC", { kind: "USERS", ids: [ids.s1] });
    const again = await tx(tid, (t) =>
      fanOut(t, tid, {
        id: r.id,
        senderId: ids.admin,
        type: "ACADEMIC",
        targetSpec: { kind: "USERS", ids: [ids.s1] },
      }),
    );
    expect(again).toBe(1);
    expect(await db(tid).notificationRecipient.count({ where: { notificationId: r.id } })).toBe(1);
  });
});

describe("inbox scope (FR-NTF-001/004)", () => {
  it("s1 sees only own rows, in delivery order, with sender names; unread/archived counts follow state", async () => {
    const page = await listInbox(s1, q());
    // N-all, N-sec1, N-sec1-admin, N-idem
    expect(page.total).toBe(4);
    expect(page.items.map((i) => i.title)).toContain("N-sec1");
    expect(page.items.find((i) => i.title === "N-all")?.senderName).toBe("User A1");
    expect(await unreadCount(s1)).toBe(4);

    const target = page.items.find((i) => i.title === "N-idem")!;
    await db(tid).notificationRecipient.updateMany({
      where: { userId: ids.s1, notificationId: target.id },
      data: { readAt: new Date() },
    });
    expect(await unreadCount(s1)).toBe(3);
    await db(tid).notificationRecipient.updateMany({
      where: { userId: ids.s1, notificationId: target.id },
      data: { archivedAt: new Date() },
    });
    expect(await inboxCounts(s1)).toMatchObject({ ALL: 3, UNREAD: 3, ARCHIVED: 1, SENT: 0 });
    expect((await listInbox(s1, q({ tab: "ARCHIVED" }))).items.map((i) => i.title)).toEqual(["N-idem"]);
    expect((await listInbox(s1, q({ tab: "UNREAD" }))).total).toBe(3);
    expect((await listInbox(s1, q({ type: "ACADEMIC" }))).total).toBe(2);
    expect((await listInbox(s1, q({ q: "sec1-admin" }))).total).toBe(1);
  });
  it("s2 got only the SYSTEM one (opted out of announcements); system sender renders as null", async () => {
    const page = await listInbox(s2, q());
    expect(page.items.map((i) => i.title)).toEqual(["N-sys"]);
    expect(page.items[0]?.senderName).toBeNull();
  });
  it("preferences default to enabled except the stored opt-out", async () => {
    const p = await preferences(s2);
    expect(p).toHaveLength(7);
    expect(p.find((x) => x.type === "ANNOUNCEMENT")?.enabled).toBe(false);
    expect(p.find((x) => x.type === "GRADE")?.enabled).toBe(true);
  });
  it("other tenant sees nothing", async () => {
    expect((await listInbox(other, q())).total).toBe(0);
    expect((await listSent(other, q())).total).toBe(0);
  });
});

describe("sent scope (FR-NTF-008)", () => {
  it("instructor with view_sent sees own only, with read stats; manage sees all", async () => {
    const mine = await listSent(instr, q({ tab: "SENT" }));
    expect(mine.items.map((i) => i.title)).toEqual(["N-sec1"]);
    expect(mine.items[0]!).toMatchObject({
      recipientCount: 1,
      readCount: 0,
      isOwner: true,
      target: { kind: "OFFERING" },
    });

    const all = await listSent(admin, q({ tab: "SENT" }));
    expect(all.total).toBe(5); // N-all, N-sys, N-sec1, N-sec1-admin, N-idem
    expect(all.items.find((i) => i.title === "N-idem")).toMatchObject({ readCount: 1, recipientCount: 1 });
    expect(all.items.find((i) => i.title === "N-sec1")?.isOwner).toBe(false);
    expect((await inboxCounts(admin)).SENT).toBe(5);
  });
  it("without view_sent/manage the sent list is empty", async () => {
    expect((await listSent(instr2, q({ tab: "SENT" }))).total).toBe(0);
    expect((await listSent(s1, q({ tab: "SENT" }))).total).toBe(0);
  });
});

describe("assertCanTarget (own scope)", () => {
  it("instructor may target taught sections / enrolled students only; kinds without grant are FORBIDDEN", async () => {
    await tx(tid, async (t) => {
      await expect(assertCanTarget(instr, { kind: "OFFERING", ids: [ids.sec1] }, t)).resolves.toBeUndefined();
      await expect(
        assertCanTarget(instr, { kind: "OFFERING", ids: [ids.sec1, ids.sec3] }, t),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        assertCanTarget(instr, { kind: "USERS", ids: [ids.s1, ids.s2] }, t),
      ).resolves.toBeUndefined();
      await expect(assertCanTarget(instr, { kind: "USERS", ids: [ids.s3] }, t)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(assertCanTarget(instr, { kind: "ALL" }, t)).rejects.toMatchObject({
        code: "FORBIDDEN",
        fieldErrors: { "target.kind": ["FORBIDDEN"] },
      });
      // tenant-wide admin skips the ownership checks
      await expect(assertCanTarget(admin, { kind: "OFFERING", ids: [ids.sec3] }, t)).resolves.toBeUndefined();
    });
  });
});

describe("processFanoutJob", () => {
  it("delivers a queued job once and records the result", async () => {
    const { nid, jid } = await tx(tid, async (t) => {
      const n = await t.notification.create({
        data: {
          tenantId: tid,
          senderId: ids.admin,
          title: "N-job",
          body: "b",
          type: "ACADEMIC",
          priority: "HIGH",
          targetSpec: { kind: "USERS", ids: [ids.s1, ids.s3] },
        },
        select: { id: true },
      });
      const j = await t.job.create({
        data: {
          tenantId: tid,
          type: "notification.fanout",
          payload: { notificationId: n.id },
          status: "PENDING",
        },
        select: { id: true },
      });
      return { nid: n.id, jid: j.id };
    });
    await processFanoutJob(tid, jid, "test-worker");
    const job = await db(tid).job.findFirst({ where: { id: jid } });
    expect(job).toMatchObject({
      status: "SUCCEEDED",
      attempts: 1,
      lockedBy: "test-worker",
      result: { delivered: 2 },
    });
    expect(await db(tid).notificationRecipient.count({ where: { notificationId: nid } })).toBe(2);
    // second call is a no-op (not PENDING any more)
    await processFanoutJob(tid, jid, "test-worker");
    expect((await db(tid).job.findFirst({ where: { id: jid } }))?.attempts).toBe(1);
  });
});
