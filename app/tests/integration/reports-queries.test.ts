/**
 * P1-13 — reports read side against a real tenant with RLS on:
 *  - overview / users / courses / files aggregates equal hand-counted fixtures
 *  - filters (role, status, major, semester, department, category, course, day range) narrow correctly
 *  - instructor scope (`course.manage_all` absent) narrows every tab to taught sections / visible files
 *  - CSV iterators: header-compatible rows, keyset batching, no duplicates, cap respected
 *  - cross-tenant invisibility (RLS)
 *  - pure helpers: bucketByMonth / monthKeys / mimeGroup / bytesToMb / pct
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bucketByMonth,
  countFilesExport,
  countUsersExport,
  iterateFilesExport,
  iterateUsersExport,
  loadCoursesExport,
  loadCoursesReport,
  loadFilesReport,
  loadOverviewReport,
  loadUsersReport,
  mimeGroup,
  monthKeys,
} from "@/features/reports/queries";
import {
  bytesToMb,
  coursesReportFilterSchema,
  filesReportFilterSchema,
  pct,
  usersReportFilterSchema,
} from "@/features/reports/schemas";
import type { PermissionCode } from "@/lib/auth/permissions";
import type { Ctx } from "@/lib/auth/rbac";
import { platformPrisma, tx } from "@/lib/db";
import { basePrisma } from "@/lib/db/prisma";

const suffix = Date.now().toString(36);
const TZ = "Asia/Riyadh";
const d = (s: string) => new Date(s);
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
    passwordChangeRequired: null,
    roles: [],
    permissions: new Set(perms),
  },
});

let tid = "";
let otherTid = "";
const ids = {
  admin: "",
  instr: "",
  instr2: "",
  s1: "",
  s2: "",
  s3: "",
  roleStudent: "",
  roleInstr: "",
  majorA: "",
  deptA: "",
  deptB: "",
  semester: "",
  oldSemester: "",
  cs101: "",
  cs102: "",
  mth: "",
  sec1: "",
  sec3: "",
  f1: "",
};
let admin: Ctx, instr: Ctx, other: Ctx;
const NOW = d("2026-09-15T12:00:00Z");

beforeAll(async () => {
  tid = (await platformPrisma.tenant.create({ data: { slug: `rep-${suffix}`, name: "Rep", timezone: TZ } }))
    .id;
  otherTid = (await platformPrisma.tenant.create({ data: { slug: `rep2-${suffix}`, name: "Rep2" } })).id;
  await tx(tid, async (x) => {
    const mkRole = async (code: string) =>
      (await x.role.create({ data: { tenantId: tid, code, name: code, isSystem: true } })).id;
    ids.roleStudent = await mkRole("STUDENT");
    ids.roleInstr = await mkRole("INSTRUCTOR");
    const mk = async (
      email: string,
      academicId: string,
      opts: {
        role?: string;
        status?: "ACTIVE" | "PENDING_ACTIVATION" | "FROZEN";
        createdAt?: Date;
        lastLoginAt?: Date | null;
        lockedUntil?: Date;
      } = {},
    ) => {
      const u = await x.user.create({
        data: {
          tenantId: tid,
          email,
          name: `User ${academicId}`,
          academicId,
          passwordHash: "x",
          status: opts.status ?? "ACTIVE",
          createdAt: opts.createdAt ?? d("2026-09-01T00:00:00Z"),
          lastLoginAt: opts.lastLoginAt === undefined ? d("2026-09-10T00:00:00Z") : opts.lastLoginAt,
          lockedUntil: opts.lockedUntil,
        },
      });
      if (opts.role) await x.userRole.create({ data: { tenantId: tid, userId: u.id, roleId: opts.role } });
      return u.id;
    };
    ids.admin = await mk("admin@t", "A1", { createdAt: d("2026-06-05T00:00:00Z") });
    ids.instr = await mk("i1@t", "I1", { role: ids.roleInstr, createdAt: d("2026-07-05T00:00:00Z") });
    ids.instr2 = await mk("i2@t", "I2", { role: ids.roleInstr, createdAt: d("2026-07-06T00:00:00Z") });
    ids.s1 = await mk("s1@t", "S1", { role: ids.roleStudent, lastLoginAt: null });
    ids.s2 = await mk("s2@t", "S2", {
      role: ids.roleStudent,
      status: "PENDING_ACTIVATION",
      lastLoginAt: null,
    });
    ids.s3 = await mk("s3@t", "S3", {
      role: ids.roleStudent,
      status: "FROZEN",
      lastLoginAt: d("2026-01-01T00:00:00Z"),
      lockedUntil: d("2099-01-01T00:00:00Z"),
    });
    await mk("gone@t", "G1").then((id) => x.user.update({ where: { id }, data: { deletedAt: new Date() } }));

    const college = await x.college.create({ data: { tenantId: tid, code: "ENG", name: "الهندسة" } });
    const deptA = await x.department.create({
      data: { tenantId: tid, collegeId: college.id, code: "CS", name: "حاسب" },
    });
    const deptB = await x.department.create({
      data: { tenantId: tid, collegeId: college.id, code: "MTH", name: "رياضيات" },
    });
    ids.deptA = deptA.id;
    ids.deptB = deptB.id;
    const major = await x.major.create({
      data: { tenantId: tid, departmentId: deptA.id, code: "SE", name: "برمجيات" },
    });
    ids.majorA = major.id;

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
    const oldSem = await x.semester.create({
      data: {
        tenantId: tid,
        academicYearId: year.id,
        term: "SUMMER",
        name: "صيفي",
        startDate: d("2026-06-01"),
        endDate: d("2026-08-15"),
        status: "CLOSED",
      },
    });
    ids.semester = sem.id;
    ids.oldSemester = oldSem.id;

    const cs101 = await x.course.create({
      data: { tenantId: tid, code: "CS101", name: "برمجة", departmentId: deptA.id },
    });
    const cs102 = await x.course.create({
      data: { tenantId: tid, code: "CS102", name: "كائنية", departmentId: deptA.id },
    });
    const mth = await x.course.create({
      data: { tenantId: tid, code: "MTH101", name: "تفاضل", departmentId: deptB.id },
    });
    await x.course.create({ data: { tenantId: tid, code: "OLD1", name: "محذوف", deletedAt: new Date() } });
    ids.cs101 = cs101.id;
    ids.cs102 = cs102.id;
    ids.mth = mth.id;
    await x.courseMajor.create({ data: { tenantId: tid, courseId: cs101.id, majorId: major.id } });

    const sec1 = await x.courseOffering.create({
      data: {
        tenantId: tid,
        courseId: cs101.id,
        semesterId: sem.id,
        section: "1",
        status: "OPEN",
        capacity: 4,
      },
    });
    await x.courseOffering.create({
      data: { tenantId: tid, courseId: cs101.id, semesterId: sem.id, section: "2", status: "DRAFT" },
    });
    const sec3 = await x.courseOffering.create({
      data: {
        tenantId: tid,
        courseId: cs102.id,
        semesterId: sem.id,
        section: "1",
        status: "OPEN",
        capacity: 6,
      },
    });
    // old semester offering — excluded from the current-semester report
    await x.courseOffering.create({
      data: { tenantId: tid, courseId: mth.id, semesterId: oldSem.id, section: "1", status: "ARCHIVED" },
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
        { tenantId: tid, offeringId: sec1.id, studentId: ids.s2, status: "ACTIVE", source: "MANUAL" },
        { tenantId: tid, offeringId: sec1.id, studentId: ids.s3, status: "WITHDRAWN", source: "MANUAL" },
        { tenantId: tid, offeringId: sec3.id, studentId: ids.s1, status: "ACTIVE", source: "MANUAL" },
      ],
    });

    const mkFile = (name: string, o: Partial<Parameters<typeof x.file.create>[0]["data"]>) =>
      x.file.create({
        data: {
          tenantId: tid,
          uploaderId: ids.instr,
          name,
          originalName: name,
          storageKey: `${tid}/x/${name}`,
          mimeType: "application/pdf",
          size: 1024 * 1024,
          checksum: name,
          category: "LECTURE",
          status: "APPROVED",
          createdAt: d("2026-09-02T00:00:00Z"),
          ...o,
        } as never,
        select: { id: true },
      });
    ids.f1 = (await mkFile("l1.pdf", { courseId: cs101.id, offeringId: sec1.id, downloads: 5 })).id;
    await mkFile("l2.pdf", {
      courseId: cs101.id,
      offeringId: sec1.id,
      category: "ASSIGNMENT",
      mimeType: "image/png",
      size: 512 * 1024,
      downloads: 2,
    });
    await mkFile("l3.pdf", {
      courseId: cs102.id,
      offeringId: sec3.id,
      uploaderId: ids.instr2,
      createdAt: d("2026-08-20T00:00:00Z"),
    });
    await mkFile("gone.pdf", { courseId: cs101.id, deletedAt: new Date() });
  });
  admin = mkCtx(tid, ids.admin, ["course.manage_all", "file.manage_all"]);
  instr = mkCtx(tid, ids.instr);
  other = mkCtx(otherTid, ids.admin, ["course.manage_all", "file.manage_all"]);
});

afterAll(async () => {
  await platformPrisma.tenant.deleteMany({ where: { id: { in: [tid, otherTid] } } });
  await platformPrisma.$disconnect();
  await basePrisma.$disconnect();
});

describe("pure helpers", () => {
  it("monthKeys / bucketByMonth cover the trailing window, oldest first, drop out-of-window rows", () => {
    const keys = monthKeys(3, NOW);
    expect(keys).toEqual([
      "2026-07-01T00:00:00.000Z",
      "2026-08-01T00:00:00.000Z",
      "2026-09-01T00:00:00.000Z",
    ]);
    const b = bucketByMonth(
      [
        { createdAt: d("2026-07-31T23:59:59Z") },
        { createdAt: d("2026-09-01T00:00:00Z") },
        { createdAt: d("2026-01-01T00:00:00Z") },
      ],
      3,
      NOW,
    );
    expect(b.map((x) => x.count)).toEqual([1, 0, 1]);
  });
  it("mimeGroup / bytesToMb / pct", () => {
    expect(mimeGroup("application/pdf")).toBe("pdf");
    expect(mimeGroup("image/webp")).toBe("image");
    expect(mimeGroup("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(
      "document",
    );
    expect(mimeGroup("application/x-7z-compressed")).toBe("archive");
    expect(mimeGroup("application/octet-stream")).toBe("other");
    expect(bytesToMb(1024 * 1024)).toBe(1);
    expect(bytesToMb(BigInt(1572864))).toBe(1.5);
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(1, 0)).toBe(0);
  });
  it("filter schemas are strict and validate day order", () => {
    expect(usersReportFilterSchema.safeParse({ bogus: 1 }).success).toBe(false);
    expect(coursesReportFilterSchema.safeParse({ semesterId: "nope" }).success).toBe(false);
    expect(filesReportFilterSchema.safeParse({ from: "2026-09-10", to: "2026-09-01" }).success).toBe(false);
    expect(filesReportFilterSchema.safeParse({ from: "2026-09-01", to: "2026-09-10" }).success).toBe(true);
  });
});

describe("overview", () => {
  it("admin sees tenant-wide numbers matching the fixtures", async () => {
    const r = await loadOverviewReport(admin, NOW);
    expect(r.tenantWide).toBe(true);
    expect(r.users).toEqual({ total: 6, active: 4, pending: 1, frozen: 1, disabled: 0 });
    expect(r.academic).toEqual({ colleges: 1, departments: 2, majors: 1, courses: 3, offerings: 4 });
    expect(r.enrollments).toEqual({ active: 3, withdrawn: 1, completed: 0 });
    expect(r.files).toEqual({ count: 3, sizeMb: 2.5, downloads: 7 });
    // users per month (Jun 1, Jul 2, Aug 0, Sep 3) within trailing 6 months (Apr..Sep)
    expect(r.usersByMonth.map((m) => m.count)).toEqual([0, 0, 1, 2, 0, 3]);
    expect(r.filesByMonth.slice(-2).map((m) => m.count)).toEqual([1, 2]);
  });
  it("instructor is narrowed to taught sections and visible files", async () => {
    const r = await loadOverviewReport(instr, NOW);
    expect(r.tenantWide).toBe(false);
    expect(r.academic.courses).toBe(1); // CS101 only
    expect(r.academic.offerings).toBe(1); // sec1 only
    expect(r.enrollments).toEqual({ active: 2, withdrawn: 1, completed: 0 });
    expect(r.files.count).toBe(2); // own uploads on sec1
  });
  it("other tenant sees zeros (RLS)", async () => {
    const r = await loadOverviewReport(other, NOW);
    expect(r.users.total).toBe(0);
    expect(r.academic.courses).toBe(0);
    expect(r.files.count).toBe(0);
  });
});

describe("users report", () => {
  it("aggregates + options", async () => {
    const r = await loadUsersReport(admin, {}, NOW);
    expect(r.total).toBe(6);
    expect(Object.fromEntries(r.byStatus.map((s) => [s.status, s.count]))).toEqual({
      ACTIVE: 4,
      PENDING_ACTIVATION: 1,
      FROZEN: 1,
      DISABLED: 0,
    });
    expect(r.byRole.find((x) => x.id === ids.roleStudent)?.count).toBe(3);
    expect(r.byRole.find((x) => x.id === ids.roleInstr)?.count).toBe(2);
    expect(r.byMajor).toEqual([{ id: ids.majorA, label: "برمجيات", count: 3 }]); // s1,s2,s3 enrolled in CS101 sections
    expect(r.activeLast30d).toBe(3); // admin, i1, i2 (Sep 10) — s3 logged in Jan
    expect(r.neverLoggedIn).toBe(2);
    expect(r.lockedNow).toBe(1);
    expect(r.options.roles.map((x) => x.id)).toContain(ids.roleStudent);
  });
  it("filters narrow: role, status, major", async () => {
    expect((await loadUsersReport(admin, { roleId: ids.roleStudent }, NOW)).total).toBe(3);
    expect((await loadUsersReport(admin, { status: "FROZEN" }, NOW)).total).toBe(1);
    expect((await loadUsersReport(admin, { majorId: ids.majorA, status: "ACTIVE" }, NOW)).total).toBe(1); // s1
  });
  it("CSV iterator: all rows once, roles joined, respects filter", async () => {
    const rows: string[] = [];
    for await (const batch of iterateUsersExport(admin, {})) rows.push(...batch.map((r) => r.academicId));
    expect(rows.sort()).toEqual(["A1", "I1", "I2", "S1", "S2", "S3"]);
    expect(await countUsersExport(admin, { roleId: ids.roleInstr })).toBe(2);
    const one: string[] = [];
    for await (const b of iterateUsersExport(admin, { roleId: ids.roleInstr }))
      one.push(...b.map((r) => r.roles));
    expect(one).toEqual(["INSTRUCTOR", "INSTRUCTOR"]);
    expect(await countUsersExport(other, {})).toBe(0);
  });
});

describe("courses report", () => {
  it("defaults to the current semester and rolls up per course", async () => {
    const r = await loadCoursesReport(admin, {});
    expect(r.semester?.id).toBe(ids.semester);
    expect(r.totals).toEqual({ courses: 3, offerings: 3, activeEnrollments: 3, avgFill: 30 }); // 3 / (4+6)
    expect(Object.fromEntries(r.byOfferingStatus.map((s) => [s.status, s.count]))).toEqual({
      DRAFT: 1,
      OPEN: 2,
      CLOSED: 0,
      ARCHIVED: 0,
    });
    const cs101 = r.rows.find((c) => c.code === "CS101")!;
    expect(cs101).toMatchObject({
      offerings: 2,
      openOfferings: 1,
      activeEnrollments: 2,
      instructors: 1,
      files: 2,
      department: "حاسب",
    });
    const mth = r.rows.find((c) => c.code === "MTH101")!;
    expect(mth.offerings).toBe(0); // its only section is in the old semester
    expect(r.topCourses[0]).toMatchObject({ code: "CS101", enrollments: 2 });
    expect(r.byDepartment).toEqual([
      { id: "حاسب", label: "حاسب", count: 2 },
      { id: "رياضيات", label: "رياضيات", count: 1 },
    ]);
    expect(r.options.semesters.find((s) => s.id === ids.semester)?.isCurrent).toBe(true);
  });
  it("filters: explicit semester and department", async () => {
    const old = await loadCoursesReport(admin, { semesterId: ids.oldSemester });
    expect(old.totals.offerings).toBe(1);
    expect(old.rows.find((c) => c.code === "MTH101")?.offerings).toBe(1);
    const dept = await loadCoursesReport(admin, { departmentId: ids.deptB });
    expect(dept.rows.map((c) => c.code)).toEqual(["MTH101"]);
  });
  it("instructor scope narrows to taught sections; export mirrors the page", async () => {
    const r = await loadCoursesReport(instr, {});
    expect(r.tenantWide).toBe(false);
    expect(r.rows.map((c) => c.code)).toEqual(["CS101"]);
    expect(r.rows[0]).toMatchObject({ offerings: 1, activeEnrollments: 2 });
    const exp = await loadCoursesExport(instr, {});
    expect(exp).toEqual(r.rows);
    expect(await loadCoursesExport(other, {})).toEqual([]);
  });
});

describe("files report", () => {
  it("aggregates, groupings, top downloads", async () => {
    const r = await loadFilesReport(admin, {}, TZ, NOW);
    expect(r.totals).toEqual({ count: 3, sizeMb: 2.5, downloads: 7, pending: 0 });
    expect(Object.fromEntries(r.byCategory.map((c) => [c.status, c.count]))).toMatchObject({
      LECTURE: 2,
      ASSIGNMENT: 1,
    });
    expect(r.byMimeGroup).toEqual([
      { id: "pdf", label: "pdf", count: 2 },
      { id: "image", label: "image", count: 1 },
    ]);
    expect(r.byCourse[0]).toMatchObject({ id: ids.cs101, count: 2 });
    expect(r.topDownloaded.map((x) => x.downloads)).toEqual([5, 2]);
    expect(r.topDownloaded[0]).toMatchObject({ id: ids.f1, course: "CS101" });
    expect(r.byMonth.slice(-2).map((m) => m.count)).toEqual([1, 2]);
  });
  it("filters: category, course, day range in tenant tz", async () => {
    expect((await loadFilesReport(admin, { category: "ASSIGNMENT" }, TZ, NOW)).totals.count).toBe(1);
    expect((await loadFilesReport(admin, { courseId: ids.cs102 }, TZ, NOW)).totals.count).toBe(1);
    expect(
      (await loadFilesReport(admin, { from: "2026-09-01", to: "2026-09-30" }, TZ, NOW)).totals.count,
    ).toBe(2);
    expect((await loadFilesReport(admin, { to: "2026-08-31" }, TZ, NOW)).totals.count).toBe(1);
  });
  it("instructor scope + CSV iterator + RLS", async () => {
    const r = await loadFilesReport(instr, {}, TZ, NOW);
    expect(r.tenantWide).toBe(false);
    expect(r.totals.count).toBe(2);
    const names: string[] = [];
    for await (const b of iterateFilesExport(admin, {}, TZ)) names.push(...b.map((x) => x.name));
    expect(names.sort()).toEqual(["l1.pdf", "l2.pdf", "l3.pdf"]);
    const row = (await iterateFilesExport(admin, { courseId: ids.cs101, category: "LECTURE" }, TZ).next())
      .value![0]!;
    expect(row).toMatchObject({
      name: "l1.pdf",
      course: "CS101",
      offering: "CS101-1",
      uploader: "User I1",
      downloads: 5,
    });
    expect(await countFilesExport(other, {}, TZ)).toBe(0);
  });
});
