/**
 * P1-15 closure — files read side + core against a real tenant with RLS on (the P1-06 gap):
 *  - fileScopeWhere: admin sees all; instructor sees own uploads + files on taught sections (+ course-level files of
 *    courses with a taught section); student sees APPROVED files on enrolled sections only; unattached = uploader only
 *  - listFiles: tabs ALL/MINE/TRASH, search (name/originalName/description/course code), category/course/offering
 *    filters, pagination; fileCounts badges; getFileDetail in/out of scope; storageUsage; attachable options
 *  - resolveAttachment: offering wins over course; instructor may attach only to taught scope; unknown → errors
 *  - RLS: other tenant sees nothing
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveAttachment } from "@/features/files/core";
import {
  attachableCourseOptions,
  attachableOfferingOptions,
  fileCounts,
  getFileDetail,
  listFiles,
  storageUsage,
} from "@/features/files/queries";
import { fileListQuerySchema } from "@/features/files/schemas";
import type { PermissionCode } from "@/lib/auth/permissions";
import type { Ctx } from "@/lib/auth/rbac";
import { platformPrisma, tx } from "@/lib/db";
import { basePrisma } from "@/lib/db/prisma";

const suffix = Date.now().toString(36);
const d = (s: string) => new Date(s);
const q = (o: Record<string, unknown> = {}) => fileListQuerySchema.parse(o);
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
  i1: "",
  i2: "",
  s1: "",
  s2: "",
  cs101: "",
  cs102: "",
  sec1: "",
  sec2: "",
  sec3: "",
  fLecture: "",
  fCourse: "",
  fPending: "",
  fOther: "",
  fLoose: "",
  fTrash: "",
};
let admin: Ctx, i1: Ctx, i2: Ctx, s1: Ctx, s2: Ctx, other: Ctx;

beforeAll(async () => {
  tid = (await platformPrisma.tenant.create({ data: { slug: `fil-${suffix}`, name: "Fil" } })).id;
  otherTid = (await platformPrisma.tenant.create({ data: { slug: `fil2-${suffix}`, name: "Fil2" } })).id;
  await tx(tid, async (x) => {
    const student = await x.role.create({
      data: { tenantId: tid, code: "STUDENT", name: "طالب", isSystem: true },
    });
    const mk = async (email: string, academicId: string, role?: string) => {
      const u = await x.user.create({
        data: {
          tenantId: tid,
          email,
          name: `U ${academicId}`,
          academicId,
          passwordHash: "x",
          status: "ACTIVE",
        },
      });
      if (role) await x.userRole.create({ data: { tenantId: tid, userId: u.id, roleId: student.id } });
      return u.id;
    };
    ids.admin = await mk("a@f", "A1");
    ids.i1 = await mk("i1@f", "I1");
    ids.i2 = await mk("i2@f", "I2");
    ids.s1 = await mk("s1@f", "S1", "STUDENT");
    ids.s2 = await mk("s2@f", "S2", "STUDENT");
    const year = await x.academicYear.create({
      data: {
        tenantId: tid,
        code: "26",
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
        name: "s",
        startDate: d("2026-09-01"),
        endDate: d("2027-01-31"),
        isCurrent: true,
        status: "ACTIVE",
      },
    });
    const cs101 = await x.course.create({ data: { tenantId: tid, code: "CS101", name: "برمجة" } });
    const cs102 = await x.course.create({ data: { tenantId: tid, code: "CS102", name: "كائنية" } });
    ids.cs101 = cs101.id;
    ids.cs102 = cs102.id;
    const sec1 = await x.courseOffering.create({
      data: { tenantId: tid, courseId: cs101.id, semesterId: sem.id, section: "1", status: "OPEN" },
    });
    const sec2 = await x.courseOffering.create({
      data: { tenantId: tid, courseId: cs101.id, semesterId: sem.id, section: "2", status: "OPEN" },
    });
    const sec3 = await x.courseOffering.create({
      data: { tenantId: tid, courseId: cs102.id, semesterId: sem.id, section: "1", status: "OPEN" },
    });
    ids.sec1 = sec1.id;
    ids.sec2 = sec2.id;
    ids.sec3 = sec3.id;
    await x.offeringInstructor.createMany({
      data: [
        { tenantId: tid, offeringId: sec1.id, userId: ids.i1, role: "PRIMARY" },
        { tenantId: tid, offeringId: sec3.id, userId: ids.i2, role: "PRIMARY" },
      ],
    });
    await x.enrollment.createMany({
      data: [
        { tenantId: tid, offeringId: sec1.id, studentId: ids.s1, status: "ACTIVE", source: "MANUAL" },
        { tenantId: tid, offeringId: sec3.id, studentId: ids.s2, status: "ACTIVE", source: "MANUAL" },
      ],
    });
    const mkFile = async (name: string, o: Record<string, unknown>) =>
      (
        await x.file.create({
          data: {
            tenantId: tid,
            uploaderId: ids.i1,
            name,
            originalName: `${name}.orig`,
            storageKey: `${tid}/x/${name}`,
            mimeType: "application/pdf",
            size: 1000,
            checksum: name,
            category: "LECTURE",
            status: "APPROVED",
            ...o,
          } as never,
          select: { id: true },
        })
      ).id;
    ids.fLecture = await mkFile("lecture1", {
      courseId: cs101.id,
      offeringId: sec1.id,
      description: "الفصل الأول",
    });
    ids.fCourse = await mkFile("syllabus", { courseId: cs101.id, category: "REFERENCE" }); // course-level, no offering
    ids.fPending = await mkFile("draft", { courseId: cs101.id, offeringId: sec1.id, status: "PENDING" });
    ids.fOther = await mkFile("cs102-notes", { courseId: cs102.id, offeringId: sec3.id, uploaderId: ids.i2 });
    ids.fLoose = await mkFile("scratch", { uploaderId: ids.i2 }); // unattached
    ids.fTrash = await mkFile("old", { courseId: cs101.id, offeringId: sec1.id, deletedAt: new Date() });
  });
  admin = mkCtx(tid, ids.admin, ["file.manage_all", "course.manage_all"]);
  i1 = mkCtx(tid, ids.i1);
  i2 = mkCtx(tid, ids.i2);
  s1 = mkCtx(tid, ids.s1);
  s2 = mkCtx(tid, ids.s2);
  other = mkCtx(otherTid, ids.admin, ["file.manage_all", "course.manage_all"]);
});

afterAll(async () => {
  await platformPrisma.tenant.deleteMany({ where: { id: { in: [tid, otherTid] } } });
  await platformPrisma.$disconnect();
  await basePrisma.$disconnect();
});

const names = (rows: { name: string }[]) => rows.map((r) => r.name).sort();

describe("scope (FR-FIL-006)", () => {
  it("admin sees every live file; trash tab shows deleted; counts match", async () => {
    expect(names((await listFiles(admin, q())).items)).toEqual([
      "cs102-notes",
      "draft",
      "lecture1",
      "scratch",
      "syllabus",
    ]);
    expect(names((await listFiles(admin, q({ tab: "TRASH" }))).items)).toEqual(["old"]);
    expect(await fileCounts(admin, q())).toEqual({ ALL: 5, MINE: 0, TRASH: 1 });
  });
  it("instructor: own uploads (incl. pending) + taught-section files + course-level files of taught course", async () => {
    // i1 uploaded lecture1/syllabus/draft (own) — cs102-notes and scratch belong to i2 and sit outside i1's scope
    expect(names((await listFiles(i1, q())).items)).toEqual(["draft", "lecture1", "syllabus"]);
    // i2 teaches sec3 → cs102-notes; own loose file; nothing from CS101
    expect(names((await listFiles(i2, q())).items)).toEqual(["cs102-notes", "scratch"]);
    expect(await fileCounts(i2, q())).toEqual({ ALL: 2, MINE: 2, TRASH: 0 });
  });
  it("student: APPROVED files of enrolled sections + course-level files of that course; never PENDING or loose", async () => {
    expect(names((await listFiles(s1, q())).items)).toEqual(["lecture1", "syllabus"]);
    expect(names((await listFiles(s2, q())).items)).toEqual(["cs102-notes"]);
    expect(await getFileDetail(s1, ids.fPending)).toBeNull();
    expect(await getFileDetail(s1, ids.fLoose)).toBeNull();
    expect(await getFileDetail(s2, ids.fLecture)).toBeNull();
  });
  it("other tenant sees nothing (RLS)", async () => {
    expect((await listFiles(other, q())).total).toBe(0);
    expect(await getFileDetail(other, ids.fLecture)).toBeNull();
    expect((await storageUsage(other)).usedBytes).toBe(0);
  });
});

describe("listFiles filters", () => {
  it("search matches name, originalName, description and course code (case-insensitive)", async () => {
    expect(names((await listFiles(admin, q({ q: "LECTURE1" }))).items)).toEqual(["lecture1"]);
    expect(names((await listFiles(admin, q({ q: "syllabus.orig" }))).items)).toEqual(["syllabus"]);
    expect(names((await listFiles(admin, q({ q: "الفصل" }))).items)).toEqual(["lecture1"]);
    expect(names((await listFiles(admin, q({ q: "cs102" }))).items)).toEqual(["cs102-notes"]);
  });
  it("category / course / offering / mine narrow; offering wins over course", async () => {
    expect(names((await listFiles(admin, q({ category: "REFERENCE" }))).items)).toEqual(["syllabus"]);
    expect(names((await listFiles(admin, q({ courseId: ids.cs101 }))).items)).toEqual([
      "draft",
      "lecture1",
      "syllabus",
    ]);
    expect(names((await listFiles(admin, q({ courseId: ids.cs102, offeringId: ids.sec1 }))).items)).toEqual([
      "draft",
      "lecture1",
    ]);
    expect(names((await listFiles(admin, q({ mine: "1" }))).items)).toEqual([]);
    expect(names((await listFiles(i1, q({ tab: "MINE" }))).items)).toEqual(["draft", "lecture1", "syllabus"]);
  });
  it("pagination is stable and reports totals", async () => {
    const p1 = await listFiles(admin, q({ pageSize: 5, page: 1 }));
    expect(p1.total).toBe(5);
    expect(p1.pageCount).toBe(1);
    const p2 = await listFiles(admin, q({ pageSize: 5, page: 2 }));
    expect(p2.items).toHaveLength(0);
  });
  it("getFileDetail exposes checksum/storageKey/download log count and ownership", async () => {
    const detail = await getFileDetail(i1, ids.fLecture);
    expect(detail).toMatchObject({
      name: "lecture1",
      checksum: "lecture1",
      storageKey: `${tid}/x/lecture1`,
      downloadLogCount: 0,
      isOwner: true,
      courseCode: "CS101",
      offeringSection: "1",
    });
    expect((await getFileDetail(admin, ids.fLecture))?.isOwner).toBe(false);
  });
  it("storageUsage sums live files only and falls back to the 20 GB default cap", async () => {
    const u = await storageUsage(admin);
    expect(u.usedBytes).toBe(5000); // 5 live × 1000, 'old' excluded
    expect(u.capBytes).toBe(20 * 1024 ** 3);
  });
});

describe("attachments (resolveAttachment + options)", () => {
  it("options: admin sees all courses/offerings; instructor only taught", async () => {
    expect((await attachableCourseOptions(admin)).map((c) => c.label).join()).toContain("CS101");
    expect((await attachableCourseOptions(i2)).map((c) => c.label)).toEqual([
      expect.stringContaining("CS102"),
    ]);
    expect((await attachableOfferingOptions(i1)).map((o) => o.id)).toEqual([ids.sec1]);
  });
  it("offering attachment resolves its course and enforces teaching scope", async () => {
    await tx(tid, async (t) => {
      expect(await resolveAttachment(i1, t, { offeringId: ids.sec1 })).toEqual({
        courseId: ids.cs101,
        offeringId: ids.sec1,
      });
      await expect(resolveAttachment(i1, t, { offeringId: ids.sec3 })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(resolveAttachment(i1, t, { offeringId: ids.sec2 })).rejects.toMatchObject({
        code: "FORBIDDEN",
      }); // same course, not taught
      expect(await resolveAttachment(admin, t, { offeringId: ids.sec2 })).toEqual({
        courseId: ids.cs101,
        offeringId: ids.sec2,
      });
    });
  });
  it("course attachment: instructor must teach a section of it; unknown course → VALIDATION; nothing → nulls", async () => {
    await tx(tid, async (t) => {
      expect(await resolveAttachment(i1, t, { courseId: ids.cs101 })).toEqual({
        courseId: ids.cs101,
        offeringId: null,
      });
      await expect(resolveAttachment(i1, t, { courseId: ids.cs102 })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await expect(
        resolveAttachment(admin, t, { courseId: "00000000-0000-4000-8000-000000000000" }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
      expect(await resolveAttachment(i1, t, {})).toEqual({ courseId: null, offeringId: null });
    });
  });
});
