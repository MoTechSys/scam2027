/**
 * Academic structure read side — two self-contained tenants, RLS on. Covers listYears ordering, currentPeriod,
 * catalogue lists (search / parent filter / inactive), counts, needsSetup, options, cross-tenant invisibility and
 * the DB-level "one current year/semester per tenant" guarantee (ADR-0006).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  academicCounts,
  collegeOptions,
  currentPeriod,
  departmentOptions,
  listColleges,
  listDepartments,
  listLevels,
  listMajors,
  listYears,
  majorOptions,
  needsSetup,
  yearOptions,
} from "@/features/academic/queries";
import { catalogueListQuerySchema, levelName } from "@/features/academic/schemas";
import type { Ctx } from "@/lib/auth/rbac";
import { platformPrisma, tx } from "@/lib/db";
import { basePrisma } from "@/lib/db/prisma";

const suffix = Date.now().toString(36);
const mkCtx = (tenantId: string): Ctx => ({
  tenantId,
  sessionId: "test",
  requestId: "test",
  user: { id: "00000000-0000-0000-0000-000000000000", name: "t", email: "t", academicId: "t", locale: "ar", mustChangePassword: false, roles: [], permissions: new Set() },
});
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const q = (o: Record<string, unknown> = {}) => catalogueListQuerySchema.parse(o);

let ctx: Ctx; // populated tenant
let other: Ctx; // empty tenant (needsSetup)
const ids = { year: "", oldYear: "", first: "", college: "", cs: "", is: "", csMajor: "", seMajor: "" };

beforeAll(async () => {
  const t1 = await platformPrisma.tenant.create({ data: { slug: `acd-${suffix}`, name: "Acd T" }, select: { id: true } });
  const t2 = await platformPrisma.tenant.create({ data: { slug: `acd2-${suffix}`, name: "Acd Empty" }, select: { id: true } });
  ctx = mkCtx(t1.id);
  other = mkCtx(t2.id);
  const tid = t1.id;
  await tx(tid, async (x) => {
    const oldYear = await x.academicYear.create({ data: { tenantId: tid, code: "2025/2026", name: "القديم", startDate: d("2025-09-01"), endDate: d("2026-07-31") } });
    const year = await x.academicYear.create({ data: { tenantId: tid, code: "2026/2027", name: "الحالي", startDate: d("2026-09-01"), endDate: d("2027-07-31"), isCurrent: true } });
    ids.year = year.id;
    ids.oldYear = oldYear.id;
    // Insert out of order to prove FIRST → SECOND → SUMMER sorting.
    await x.semester.create({ data: { tenantId: tid, academicYearId: year.id, term: "SUMMER", name: "صيفي", startDate: d("2027-07-01"), endDate: d("2027-08-15") } });
    const first = await x.semester.create({ data: { tenantId: tid, academicYearId: year.id, term: "FIRST", name: "الأول", startDate: d("2026-09-01"), endDate: d("2027-01-31"), isCurrent: true, status: "ACTIVE" } });
    await x.semester.create({ data: { tenantId: tid, academicYearId: year.id, term: "SECOND", name: "الثاني", startDate: d("2027-02-01"), endDate: d("2027-06-30") } });
    ids.first = first.id;

    const college = await x.college.create({ data: { tenantId: tid, code: "CCIS", name: "كلية الحاسب", nameEn: "Computing", sortOrder: 1 } });
    await x.college.create({ data: { tenantId: tid, code: "OLD", name: "كلية مغلقة", isActive: false, sortOrder: 9 } });
    ids.college = college.id;
    const cs = await x.department.create({ data: { tenantId: tid, collegeId: college.id, code: "CS", name: "علوم الحاسب", nameEn: "Computer Science", sortOrder: 1 } });
    const is = await x.department.create({ data: { tenantId: tid, collegeId: college.id, code: "IS", name: "نظم المعلومات", sortOrder: 2 } });
    ids.cs = cs.id;
    ids.is = is.id;
    const csMajor = await x.major.create({ data: { tenantId: tid, departmentId: cs.id, code: "CS-BSC", name: "علوم الحاسب", degree: "BACHELOR", durationYears: 4 } });
    const seMajor = await x.major.create({ data: { tenantId: tid, departmentId: cs.id, code: "SE-MSC", name: "هندسة البرمجيات", degree: "MASTER", isActive: false } });
    ids.csMajor = csMajor.id;
    ids.seMajor = seMajor.id;
    await x.level.createMany({ data: [1, 2, 3].map((n) => ({ tenantId: tid, majorId: csMajor.id, number: n, ...levelName(n) })) });
    await x.level.create({ data: { tenantId: tid, majorId: seMajor.id, number: 1, ...levelName(1) } });
  });
});

afterAll(async () => {
  await platformPrisma.tenant.deleteMany({ where: { id: { in: [ctx.tenantId, other.tenantId] } } });
  await platformPrisma.$disconnect();
  await basePrisma.$disconnect();
});

describe("years & semesters", () => {
  it("lists years newest-first with semesters ordered FIRST → SECOND → SUMMER and offering counts", async () => {
    const years = await listYears(ctx);
    expect(years.map((y) => y.code)).toEqual(["2026/2027", "2025/2026"]);
    expect(years[0]!.isCurrent).toBe(true);
    expect(years[0]!.semesters.map((s) => s.term)).toEqual(["FIRST", "SECOND", "SUMMER"]);
    expect(years[0]!.semesters[0]).toMatchObject({ isCurrent: true, status: "ACTIVE", offeringCount: 0 });
    expect(years[1]!.semesters).toEqual([]);
  });
  it("currentPeriod resolves the flagged year + semester; empty tenant → nulls", async () => {
    const p = await currentPeriod(ctx);
    expect(p.year?.code).toBe("2026/2027");
    expect(p.semester).toMatchObject({ id: ids.first, term: "FIRST" });
    expect(await currentPeriod(other)).toEqual({ year: null, semester: null });
  });
  it("DB refuses a second current year / semester in the same tenant (partial unique index)", async () => {
    await expect(tx(ctx.tenantId, (x) => x.academicYear.update({ where: { id: ids.oldYear }, data: { isCurrent: true } }))).rejects.toThrow(/AcademicYear_tenantId_isCurrent_one|Unique constraint/);
    const second = await tx(ctx.tenantId, (x) => x.semester.findFirstOrThrow({ where: { term: "SECOND" }, select: { id: true } }));
    await expect(tx(ctx.tenantId, (x) => x.semester.update({ where: { id: second.id }, data: { isCurrent: true } }))).rejects.toThrow(/Semester_tenantId_isCurrent_one|Unique constraint/);
  });
  it("DB CHECK rejects end ≤ start", async () => {
    await expect(
      tx(ctx.tenantId, (x) => x.academicYear.create({ data: { tenantId: ctx.tenantId, code: "BAD", name: "سيء", startDate: d("2030-01-01"), endDate: d("2029-12-31") } })),
    ).rejects.toThrow();
  });
});

describe("catalogue", () => {
  it("colleges: ordered by sortOrder, includeInactive toggle, dependant counts", async () => {
    const all = await listColleges(ctx, q());
    expect(all.map((c) => c.code)).toEqual(["CCIS", "OLD"]);
    expect(all[0]).toMatchObject({ departmentCount: 2, isActive: true });
    expect((await listColleges(ctx, q({ includeInactive: "false" }))).map((c) => c.code)).toEqual(["CCIS"]);
  });
  it("search matches Arabic name, English name and code (case-insensitive)", async () => {
    expect((await listColleges(ctx, q({ q: "مغلقة" }))).map((c) => c.code)).toEqual(["OLD"]);
    expect((await listColleges(ctx, q({ q: "comput" }))).map((c) => c.code)).toEqual(["CCIS"]);
    expect((await listDepartments(ctx, q({ q: "is" }))).map((c) => c.code)).toEqual(["IS"]); // "IS" code; CS has nameEn "Computer Science" (no "is")
  });
  it("departments carry college name and counts; parent filter narrows", async () => {
    const deps = await listDepartments(ctx, q({ parentId: ids.college }));
    expect(deps.map((x) => x.code)).toEqual(["CS", "IS"]);
    expect(deps[0]).toMatchObject({ collegeName: "كلية الحاسب", majorCount: 2, courseCount: 0 });
    expect(await listDepartments(ctx, q({ parentId: ids.cs }))).toEqual([]); // wrong parent type → nothing
  });
  it("majors carry department/college, degree, level counts", async () => {
    const majors = await listMajors(ctx, q({ parentId: ids.cs }));
    expect(majors.map((m) => m.code).sort()).toEqual(["CS-BSC", "SE-MSC"]);
    const cs = majors.find((m) => m.code === "CS-BSC")!;
    expect(cs).toMatchObject({ departmentName: "علوم الحاسب", collegeName: "كلية الحاسب", degree: "BACHELOR", durationYears: 4, levelCount: 3, courseCount: 0 });
    expect((await listMajors(ctx, q({ includeInactive: "false" }))).map((m) => m.code)).toEqual(["CS-BSC"]);
  });
  it("levels ordered by major then number; parent filter by major", async () => {
    const lv = await listLevels(ctx, q({ parentId: ids.csMajor }));
    expect(lv.map((l) => l.number)).toEqual([1, 2, 3]);
    expect(lv[0]).toMatchObject({ majorName: "علوم الحاسب", name: "المستوى الأول", nameEn: "Level 1", courseCount: 0 });
    expect((await listLevels(ctx, q())).length).toBe(4);
  });
});

describe("aggregates & options", () => {
  it("counts + needsSetup", async () => {
    expect(await academicCounts(ctx)).toEqual({ years: 2, semesters: 3, colleges: 2, departments: 2, majors: 2, levels: 4 });
    expect(await needsSetup(ctx)).toBe(false);
    expect(await academicCounts(other)).toEqual({ years: 0, semesters: 0, colleges: 0, departments: 0, majors: 0, levels: 0 });
    expect(await needsSetup(other)).toBe(true);
  });
  it("options list active rows only, grouped by parent", async () => {
    expect((await collegeOptions(ctx)).map((o) => o.label)).toEqual(["كلية الحاسب (CCIS)"]);
    const deps = await departmentOptions(ctx);
    expect(deps.map((o) => o.group)).toEqual(["كلية الحاسب", "كلية الحاسب"]);
    expect((await majorOptions(ctx)).map((o) => o.id)).toEqual([ids.csMajor]); // SE-MSC inactive
    expect((await yearOptions(ctx)).map((o) => o.label)).toEqual(["الحالي (2026/2027)", "القديم (2025/2026)"]);
  });
});

describe("tenant isolation (RLS)", () => {
  it("the empty tenant sees none of the populated tenant's rows", async () => {
    expect(await listYears(other)).toEqual([]);
    expect(await listColleges(other, q())).toEqual([]);
    expect(await listLevels(other, q())).toEqual([]);
    expect(await collegeOptions(other)).toEqual([]);
  });
  it("cross-tenant parentId filter yields nothing", async () => {
    expect(await listDepartments(other, q({ parentId: ids.college }))).toEqual([]);
  });
});
