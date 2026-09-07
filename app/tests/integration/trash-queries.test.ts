/**
 * P1-08 — unified trash against a real tenant with RLS on:
 *  - listTrash / trashCounts: only soft-deleted rows, per kind, searchable, newest deletion first
 *  - restoreOne: clears deletedAt; guards — offering under a trashed course, file under a trashed course,
 *    role whose permission set outranks the actor, TENANT_ADMIN target for a non-admin
 *  - purgeKind: hard delete; parents still referenced by live children are `blocked`; files return storage keys
 *  - purgeExpired (trash.purge job): PENDING → SUCCEEDED, removes only rows older than the cutoff, leaves-first,
 *    writes a system audit row (actorId null); second run is a no-op
 *  - cross-tenant invisibility
 */
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { purgeCandidates, purgeExpired, purgeKind, restoreOne } from "@/features/trash/core";
import { listTrash, trashCounts } from "@/features/trash/queries";
import { trashQuerySchema } from "@/features/trash/schemas";
import { PERMISSIONS, type PermissionCode } from "@/lib/auth/permissions";
import type { Ctx } from "@/lib/auth/rbac";
import { platformPrisma, tx } from "@/lib/db";
import { storage } from "@/lib/storage";

const suffix = Date.now().toString(36);
const mkCtx = (
  tenantId: string,
  userId: string,
  perms: PermissionCode[] = [],
  roles: string[] = [],
): Ctx => ({
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
    roles,
    permissions: new Set(perms),
  },
});
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
const q = (o: Record<string, unknown> = {}) => trashQuerySchema.parse(o);

let tid = "";
let otherTid = "";
const ids = {
  admin: "",
  staff: "",
  student: "",
  adminRole: "",
  customRole: "",
  course: "",
  course2: "",
  sec: "",
  file: "",
  notif: "",
  sem: "",
};
let admin: Ctx;
let staff: Ctx;

beforeAll(async () => {
  // Permission is a global catalogue table; the test DB is unseeded, so upsert the one code we reference.
  for (const p of PERMISSIONS.filter((p) => p.code === "user.create"))
    await platformPrisma.permission.upsert({ where: { code: p.code }, create: p, update: {} });
  const t1 = await platformPrisma.tenant.create({
    data: { slug: `trash-${suffix}`, name: "Trash" },
    select: { id: true },
  });
  const t2 = await platformPrisma.tenant.create({
    data: { slug: `trash2-${suffix}`, name: "Trash2" },
    select: { id: true },
  });
  tid = t1.id;
  otherTid = t2.id;
  await tx(tid, async (x) => {
    const mk = async (email: string, academicId: string) =>
      (
        await x.user.create({
          data: {
            tenantId: tid,
            email,
            name: `User ${academicId}`,
            academicId,
            passwordHash: "x",
            status: "ACTIVE",
          },
          select: { id: true },
        })
      ).id;
    ids.admin = await mk("admin@t", "A1");
    ids.staff = await mk("staff@t", "S1");
    ids.student = await mk("student@t", "ST1");

    const adminRole = await x.role.create({
      data: { tenantId: tid, code: "TENANT_ADMIN", name: "مدير", isSystem: true },
      select: { id: true },
    });
    ids.adminRole = adminRole.id;
    await x.userRole.create({ data: { tenantId: tid, userId: ids.admin, roleId: adminRole.id } });
    const custom = await x.role.create({
      data: {
        tenantId: tid,
        code: "custom",
        name: "مخصص",
        permissions: { create: [{ permissionCode: "user.create" }] },
      },
      select: { id: true },
    });
    ids.customRole = custom.id;

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
    ids.sem = sem.id;
    const c1 = await x.course.create({ data: { tenantId: tid, code: "CS101", name: "برمجة" } });
    const c2 = await x.course.create({ data: { tenantId: tid, code: "CS102", name: "كائنية" } });
    ids.course = c1.id;
    ids.course2 = c2.id;
    const sec = await x.courseOffering.create({
      data: { tenantId: tid, courseId: c1.id, semesterId: sem.id, section: "1", status: "OPEN" },
    });
    ids.sec = sec.id;
    await x.enrollment.create({
      data: { tenantId: tid, offeringId: sec.id, studentId: ids.student, status: "ACTIVE" },
    });

    const key = `${tid}/misc/trash-${suffix}.txt`;
    await storage().put(key, Readable.from([Buffer.from("hello")]), {
      contentType: "text/plain",
      maxBytes: 1024,
    });
    const f = await x.file.create({
      data: {
        tenantId: tid,
        uploaderId: ids.staff,
        courseId: c1.id,
        offeringId: sec.id,
        name: "notes.txt",
        originalName: "notes.txt",
        storageKey: key,
        mimeType: "text/plain",
        size: 5,
        checksum: "x",
      },
      select: { id: true },
    });
    ids.file = f.id;
    const n = await x.notification.create({
      data: { tenantId: tid, senderId: ids.admin, title: "إعلان", body: "b", targetSpec: { kind: "ALL" } },
      select: { id: true },
    });
    ids.notif = n.id;
  });
  // Something trashed in the other tenant must never leak.
  await tx(otherTid, async (x) => {
    await x.course.create({
      data: { tenantId: otherTid, code: "OTHER1", name: "other", deletedAt: new Date() },
    });
  });
  admin = mkCtx(
    tid,
    ids.admin,
    ["trash.view", "trash.restore", "trash.permanent_delete", "user.create", "user.view"],
    ["TENANT_ADMIN"],
  );
  staff = mkCtx(tid, ids.staff, ["trash.view", "trash.restore"], ["STAFF"]);
});

afterAll(async () => {
  await platformPrisma.tenant.deleteMany({ where: { id: { in: [tid, otherTid] } } });
});

describe("listTrash / trashCounts", () => {
  it("starts empty, then shows only soft-deleted rows per kind (newest first) and supports search", async () => {
    expect(Object.values(await trashCounts(admin)).every((n) => n === 0)).toBe(true);
    await tx(tid, async (x) => {
      await x.course.update({ where: { id: ids.course2 }, data: { deletedAt: daysAgo(2) } });
      await x.course.update({ where: { id: ids.course }, data: { deletedAt: daysAgo(1) } });
      await x.courseOffering.update({ where: { id: ids.sec }, data: { deletedAt: daysAgo(1) } });
      await x.file.update({ where: { id: ids.file }, data: { deletedAt: daysAgo(1) } });
      await x.notification.update({ where: { id: ids.notif }, data: { deletedAt: daysAgo(1) } });
      await x.role.update({ where: { id: ids.customRole }, data: { deletedAt: daysAgo(1) } });
      await x.user.update({ where: { id: ids.student }, data: { deletedAt: daysAgo(1) } });
    });
    const counts = await trashCounts(admin);
    expect(counts).toEqual({ USER: 1, ROLE: 1, COURSE: 2, OFFERING: 1, FILE: 1, NOTIFICATION: 1 });

    const courses = await listTrash(admin, q({ kind: "COURSE" }));
    expect(courses.total).toBe(2);
    expect(courses.items.map((r) => r.subtitle)).toEqual(["CS101", "CS102"]); // newest deletion first
    expect(courses.items[0]!.purgeAfter.getTime() - courses.items[0]!.deletedAt.getTime()).toBe(
      30 * 86_400_000,
    );

    expect((await listTrash(admin, q({ kind: "COURSE", q: "كائن" }))).items.map((r) => r.subtitle)).toEqual([
      "CS102",
    ]);
    expect((await listTrash(admin, q({ kind: "USER", q: "ST1" }))).total).toBe(1);
    expect((await listTrash(admin, q({ kind: "OFFERING" }))).items[0]).toMatchObject({
      title: "CS101 — برمجة",
      meta: "OPEN",
    });
    expect((await listTrash(admin, q({ kind: "FILE" }))).items[0]).toMatchObject({
      title: "notes.txt",
      meta: "5 B",
    });
  });

  it("never shows rows of another tenant", async () => {
    const other = mkCtx(otherTid, ids.admin, ["trash.view"]);
    expect((await trashCounts(other)).COURSE).toBe(1);
    expect((await listTrash(other, q({ kind: "COURSE" }))).items[0]?.subtitle).toBe("OTHER1");
    expect((await listTrash(admin, q({ kind: "COURSE", q: "OTHER" }))).total).toBe(0);
  });
});

describe("restoreOne guards", () => {
  it("refuses to restore an offering / file whose course is still trashed, then allows it after the course", async () => {
    await expect(tx(tid, (t) => restoreOne(admin, t, "OFFERING", ids.sec))).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(tx(tid, (t) => restoreOne(admin, t, "FILE", ids.file))).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await tx(tid, (t) => restoreOne(admin, t, "COURSE", ids.course));
    await tx(tid, (t) => restoreOne(admin, t, "OFFERING", ids.sec));
    await tx(tid, (t) => restoreOne(admin, t, "FILE", ids.file));
    const counts = await trashCounts(admin);
    expect(counts).toMatchObject({ COURSE: 1, OFFERING: 0, FILE: 0 });
  });

  it("NOT_FOUND for a live row; FORBIDDEN when the actor cannot manage the role's permission set", async () => {
    await expect(tx(tid, (t) => restoreOne(admin, t, "COURSE", ids.course))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    // staff lacks user.create → cannot restore the custom role that grants it
    await expect(tx(tid, (t) => restoreOne(staff, t, "ROLE", ids.customRole))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await tx(tid, (t) => restoreOne(admin, t, "ROLE", ids.customRole));
    expect((await trashCounts(admin)).ROLE).toBe(0);
  });

  it("a non-admin cannot restore a trashed TENANT_ADMIN; the admin can restore a student", async () => {
    await tx(tid, async (x) => {
      await x.user.update({ where: { id: ids.admin }, data: { deletedAt: new Date() } });
    });
    await expect(tx(tid, (t) => restoreOne(staff, t, "USER", ids.admin))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await tx(tid, (t) => restoreOne(admin, t, "USER", ids.admin));
    await tx(tid, (t) => restoreOne(admin, t, "USER", ids.student));
    expect((await trashCounts(admin)).USER).toBe(0);
  });
});

describe("purgeKind", () => {
  it("blocks a course that still owns sections/files and purges it once they are gone; files return storage keys", async () => {
    await tx(tid, async (x) => {
      await x.course.update({ where: { id: ids.course }, data: { deletedAt: new Date() } });
      await x.courseOffering.update({ where: { id: ids.sec }, data: { deletedAt: new Date() } });
      await x.file.update({ where: { id: ids.file }, data: { deletedAt: new Date() } });
    });
    const blocked = await tx(tid, (t) => purgeKind(t, "COURSE", [ids.course]));
    expect(blocked).toEqual({ purged: [], blocked: [ids.course], storageKeys: [] });

    const sec = await tx(tid, (t) => purgeKind(t, "OFFERING", [ids.sec]));
    expect(sec.blocked).toEqual([ids.sec]); // file still attached to the section
    const file = await tx(tid, (t) => purgeKind(t, "FILE", [ids.file]));
    expect(file.purged).toEqual([ids.file]);
    expect(file.storageKeys).toEqual([`${tid}/misc/trash-${suffix}.txt`]);
    expect((await tx(tid, (t) => purgeKind(t, "OFFERING", [ids.sec]))).purged).toEqual([ids.sec]);
    expect((await tx(tid, (t) => purgeKind(t, "COURSE", [ids.course]))).purged).toEqual([ids.course]);
    // enrolment cascaded with the offering; the student is untouched
    expect(await tx(tid, (t) => t.enrollment.count({ where: { studentId: ids.student } }))).toBe(0);
    expect(await tx(tid, (t) => t.user.count({ where: { id: ids.student } }))).toBe(1);
  });

  it("ignores ids that are not trashed", async () => {
    const out = await tx(tid, (t) =>
      purgeKind(t, "COURSE", [ids.course2, "00000000-0000-4000-8000-000000000000"]),
    );
    // course2 IS trashed (from the first test) → purged; the unknown id is silently ignored
    expect(out.purged).toEqual([ids.course2]);
    expect(await tx(tid, (t) => t.course.count({ where: { id: ids.course2 } }))).toBe(0);
  });
});

describe("purgeExpired (trash.purge job)", () => {
  it("purges only rows past the cutoff, leaves-first, records the result and a system audit row; re-run is a no-op", async () => {
    let oldNotif = "";
    let freshNotif = "";
    await tx(tid, async (x) => {
      oldNotif = (
        await x.notification.create({
          data: {
            tenantId: tid,
            title: "old",
            body: "b",
            targetSpec: { kind: "ALL" },
            deletedAt: daysAgo(31),
          },
          select: { id: true },
        })
      ).id;
      freshNotif = (
        await x.notification.create({
          data: {
            tenantId: tid,
            title: "fresh",
            body: "b",
            targetSpec: { kind: "ALL" },
            deletedAt: daysAgo(3),
          },
          select: { id: true },
        })
      ).id;
      await x.role.update({ where: { id: ids.customRole }, data: { deletedAt: daysAgo(40) } });
    });
    expect(await tx(tid, (t) => purgeCandidates(t, "NOTIFICATION", daysAgo(30)))).toEqual([oldNotif]);

    const job = await tx(tid, (t) =>
      t.job.create({
        data: { tenantId: tid, type: "trash.purge", payload: { olderThanDays: 30 } },
        select: { id: true },
      }),
    );
    const summary = await purgeExpired(tid, job.id, "vitest");
    expect(summary).toMatchObject({ NOTIFICATION: 1, ROLE: 1, USER: 0, COURSE: 0, OFFERING: 0, FILE: 0 });

    const after = await tx(tid, (t) => t.job.findFirstOrThrow({ where: { id: job.id } }));
    expect(after.status).toBe("SUCCEEDED");
    expect(after.lockedBy).toBe("vitest");
    expect((after.result as { purged: Record<string, number> }).purged.NOTIFICATION).toBe(1);
    expect(
      await tx(tid, (t) => t.notification.count({ where: { id: { in: [oldNotif, freshNotif] } } })),
    ).toBe(1);
    expect(await tx(tid, (t) => t.role.count({ where: { id: ids.customRole } }))).toBe(0);
    const audits = await tx(tid, (t) => t.auditLog.findMany({ where: { action: "trash.purge_auto" } }));
    expect(audits.length).toBe(2);
    expect(audits.every((a) => a.actorId === null)).toBe(true);

    // Re-running a finished job does nothing.
    expect(Object.values(await purgeExpired(tid, job.id, "vitest")).every((n) => n === 0)).toBe(true);
  });
});
