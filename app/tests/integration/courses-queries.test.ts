/**
 * P1-05 read side + enrol core against a real tenant with RLS on:
 *  - scope: tenant-wide (`course.manage_all`) sees all; instructor sees only sections they teach; student only enrolments
 *  - enrolOne: NOT_STUDENT / ENROLLED / ALREADY / FULL / REACTIVATED
 *  - cross-tenant invisibility
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { courseCounts, getCourseDetail, listCourses } from "@/features/courses/queries";
import { enrolOne, loadOfferingForEnrol, resolveIdentifiers } from "@/features/enrollment/core";
import { listEnrollments, myEnrollments, studentCandidates } from "@/features/enrollment/queries";
import { enrollmentListQuerySchema } from "@/features/enrollment/schemas";
import { getOfferingDetail, listOfferings, offeringCounts } from "@/features/offerings/queries";
import { offeringListQuerySchema } from "@/features/offerings/schemas";
import { offeringRelation } from "@/features/offerings/scope";
import { courseListQuerySchema } from "@/features/courses/schemas";
import type { Ctx } from "@/lib/auth/rbac";
import type { PermissionCode } from "@/lib/auth/permissions";
import { platformPrisma, tx } from "@/lib/db";
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
const oq = (o: Record<string, unknown> = {}) => offeringListQuerySchema.parse(o);

let tid = "";
let otherTid = "";
const ids = {
  admin: "",
  instr: "",
  instr2: "",
  s1: "",
  s2: "",
  s3: "",
  staff: "",
  cs101: "",
  cs102: "",
  sec1: "",
  sec2: "",
  sec3: "",
  semester: "",
};
let admin: Ctx, instr: Ctx, instr2: Ctx, s1: Ctx, other: Ctx;

beforeAll(async () => {
  const t1 = await platformPrisma.tenant.create({
    data: { slug: `crs-${suffix}`, name: "Crs" },
    select: { id: true },
  });
  const t2 = await platformPrisma.tenant.create({
    data: { slug: `crs2-${suffix}`, name: "Crs2" },
    select: { id: true },
  });
  tid = t1.id;
  otherTid = t2.id;
  await tx(tid, async (x) => {
    const mk = async (email: string, academicId: string, roleCode?: string) => {
      const u = await x.user.create({
        data: {
          tenantId: tid,
          email,
          name: `User ${academicId}`,
          academicId,
          passwordHash: "x",
          status: "ACTIVE",
        },
      });
      if (roleCode) {
        const role = await x.role.upsert({
          where: { tenantId_code: { tenantId: tid, code: roleCode } },
          update: {},
          create: { tenantId: tid, code: roleCode, name: roleCode, isSystem: true },
        });
        await x.userRole.create({ data: { tenantId: tid, userId: u.id, roleId: role.id } });
      }
      return u.id;
    };
    ids.admin = await mk("admin@t", "A1");
    ids.instr = await mk("i1@t", "I1", "INSTRUCTOR");
    ids.instr2 = await mk("i2@t", "I2", "INSTRUCTOR");
    ids.s1 = await mk("s1@t", "S1", "STUDENT");
    ids.s2 = await mk("s2@t", "S2", "STUDENT");
    ids.s3 = await mk("s3@t", "S3", "STUDENT");
    ids.staff = await mk("staff@t", "ST"); // no STUDENT role

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
    ids.semester = sem.id;
    const cs101 = await x.course.create({
      data: { tenantId: tid, code: "CS101", name: "برمجة", creditHours: 4 },
    });
    const cs102 = await x.course.create({ data: { tenantId: tid, code: "CS102", name: "كائنية" } });
    await x.course.create({ data: { tenantId: tid, code: "OLD1", name: "محذوف", deletedAt: new Date() } });
    ids.cs101 = cs101.id;
    ids.cs102 = cs102.id;
    const sec1 = await x.courseOffering.create({
      data: {
        tenantId: tid,
        courseId: cs101.id,
        semesterId: sem.id,
        section: "1",
        status: "OPEN",
        capacity: 2,
      },
    });
    const sec2 = await x.courseOffering.create({
      data: { tenantId: tid, courseId: cs101.id, semesterId: sem.id, section: "2", status: "DRAFT" },
    });
    const sec3 = await x.courseOffering.create({
      data: { tenantId: tid, courseId: cs102.id, semesterId: sem.id, section: "1", status: "OPEN" },
    });
    ids.sec1 = sec1.id;
    ids.sec2 = sec2.id;
    ids.sec3 = sec3.id;
    await x.offeringInstructor.createMany({
      data: [
        { tenantId: tid, offeringId: sec1.id, userId: ids.instr, role: "PRIMARY" },
        { tenantId: tid, offeringId: sec3.id, userId: ids.instr2, role: "PRIMARY" },
      ],
    });
    await x.enrollment.create({
      data: { tenantId: tid, offeringId: sec1.id, studentId: ids.s1, status: "ACTIVE", source: "MANUAL" },
    });
  });
  admin = mkCtx(tid, ids.admin, ["course.manage_all"]);
  instr = mkCtx(tid, ids.instr);
  instr2 = mkCtx(tid, ids.instr2);
  s1 = mkCtx(tid, ids.s1);
  other = mkCtx(otherTid, ids.admin, ["course.manage_all"]);
});

afterAll(async () => {
  await platformPrisma.tenant.deleteMany({ where: { id: { in: [tid, otherTid] } } });
  await platformPrisma.$disconnect();
  await basePrisma.$disconnect();
});

describe("scope (FR-ENR-002)", () => {
  it("tenant-wide sees every course/offering incl. deleted tab; other tenant sees nothing", async () => {
    expect((await listCourses(admin, courseListQuerySchema.parse({}))).total).toBe(2);
    expect(await courseCounts(admin)).toMatchObject({ ALL: 2, ACTIVE: 2, INACTIVE: 0, DELETED: 1 });
    expect((await listOfferings(admin, oq())).total).toBe(3);
    expect(await offeringCounts(admin, oq())).toMatchObject({ ALL: 3, OPEN: 2, DRAFT: 1 });
    expect((await listCourses(other, courseListQuerySchema.parse({}))).total).toBe(0);
    expect(await getOfferingDetail(other, ids.sec1)).toBeNull();
  });
  it("instructor sees only sections they teach (and their courses)", async () => {
    const offs = await listOfferings(instr, oq());
    expect(offs.items.map((o) => o.id)).toEqual([ids.sec1]);
    expect((await listCourses(instr, courseListQuerySchema.parse({}))).items.map((c) => c.code)).toEqual([
      "CS101",
    ]);
    expect(await courseCounts(instr)).toMatchObject({ ALL: 1, DELETED: 0 });
    expect(await getOfferingDetail(instr, ids.sec3)).toBeNull();
    expect(await offeringRelation(instr, ids.sec1)).toBe("TEACHES");
    expect(await offeringRelation(instr2, ids.sec1)).toBe("NONE");
    const detail = await getCourseDetail(instr, ids.cs101);
    expect(detail?.offerings.map((o) => o.id)).toEqual([ids.sec1]); // sec2 not taught → hidden
  });
  it("student sees only enrolled sections and their own enrolments", async () => {
    expect((await listOfferings(s1, oq())).items.map((o) => o.id)).toEqual([ids.sec1]);
    expect(await offeringRelation(s1, ids.sec1)).toBe("ENROLLED");
    const mine = await myEnrollments(s1);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      courseCode: "CS101",
      section: "1",
      status: "ACTIVE",
      isCurrentSemester: true,
    });
    expect((await listCourses(s1, courseListQuerySchema.parse({}))).total).toBe(1);
  });
  it("`mine` toggle narrows a tenant-wide actor; search matches course code and instructor", async () => {
    expect((await listOfferings(admin, oq({ mine: "true" }))).total).toBe(0);
    expect((await listOfferings(admin, oq({ q: "cs102" }))).total).toBe(1);
    expect((await listOfferings(admin, oq({ q: "user i2" }))).total).toBe(1); // instructor name
    expect((await listOfferings(admin, oq({ q: "i2@t" }))).total).toBe(0); // by name, not email
    expect((await listOfferings(admin, oq({ status: "DRAFT" }))).items.map((o) => o.id)).toEqual([ids.sec2]);
  });
});

describe("enrol core (FR-ENR-001)", () => {
  it("rejects non-students, enrols, reports ALREADY, enforces capacity, reactivates", async () => {
    await tx(tid, async (t) => {
      const o = await loadOfferingForEnrol(t, ids.sec1);
      expect(o).toMatchObject({ status: "OPEN", capacity: 2, active: 1 });
      expect((await enrolOne(t, tid, o, ids.staff, "MANUAL", ids.admin)).outcome).toBe("NOT_STUDENT");
      expect((await enrolOne(t, tid, o, ids.s1, "MANUAL", ids.admin)).outcome).toBe("ALREADY");
      expect((await enrolOne(t, tid, o, ids.s2, "MANUAL", ids.admin)).outcome).toBe("ENROLLED");
      expect(o.active).toBe(2);
      expect((await enrolOne(t, tid, o, ids.s3, "MANUAL", ids.admin)).outcome).toBe("FULL");
      await t.enrollment.updateMany({
        where: { offeringId: ids.sec1, studentId: ids.s2 },
        data: { status: "WITHDRAWN", withdrawnAt: new Date() },
      });
      o.active = 1;
      expect((await enrolOne(t, tid, o, ids.s2, "BULK", ids.admin)).outcome).toBe("REACTIVATED");
    });
    const roster = await listEnrollments(admin, ids.sec1, enrollmentListQuerySchema.parse({}));
    expect(roster.total).toBe(2);
    expect(
      (await listEnrollments(admin, ids.sec1, enrollmentListQuerySchema.parse({ q: "S2" }))).items.map(
        (r) => r.academicId,
      ),
    ).toEqual(["S2"]);
  });
  it("resolves identifiers case-insensitively by email or academic id; candidates exclude ACTIVE enrolees", async () => {
    await tx(tid, async (t) => {
      const map = await resolveIdentifiers(t, ["s3@t", "s1", "nope@t"]);
      expect(map.get("s3@t")).toBe(ids.s3);
      expect(map.get("s1")).toBe(ids.s1);
      expect(map.has("nope@t")).toBe(false);
    });
    const cands = await studentCandidates(admin, ids.sec1, "");
    expect(cands.map((c) => c.academicId)).toEqual(["S3"]); // s1, s2 ACTIVE; staff not a student
  });
});
