/**
 * Academic structure — read side (RSC). All queries go through db(tenantId) (RLS); callers gate with `academic.view`
 * (structure) / `semester.view` (years & semesters).
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/rbac";
import { db } from "@/lib/db/tenant";
import type { CatalogueListQuery } from "./schemas";

/* ───────────── Years & semesters ───────────── */

export type SemesterRow = {
  id: string;
  academicYearId: string;
  term: "FIRST" | "SECOND" | "SUMMER";
  name: string;
  startDate: Date;
  endDate: Date;
  registrationOpensAt: Date | null;
  registrationClosesAt: Date | null;
  status: "PLANNED" | "ACTIVE" | "CLOSED" | "ARCHIVED";
  isCurrent: boolean;
  offeringCount: number;
};

export type YearRow = {
  id: string;
  code: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isCurrent: boolean;
  updatedAt: Date;
  semesters: SemesterRow[];
};

const semesterSelect = {
  id: true,
  academicYearId: true,
  term: true,
  name: true,
  startDate: true,
  endDate: true,
  registrationOpensAt: true,
  registrationClosesAt: true,
  status: true,
  isCurrent: true,
  _count: { select: { offerings: true } },
} satisfies Prisma.SemesterSelect;
type RawSemester = Prisma.SemesterGetPayload<{ select: typeof semesterSelect }>;
const toSemester = ({ _count, ...s }: RawSemester): SemesterRow => ({ ...s, offeringCount: _count.offerings });

const TERM_ORDER: Record<SemesterRow["term"], number> = { FIRST: 0, SECOND: 1, SUMMER: 2 };

/** Years newest-first, each with its semesters ordered FIRST → SECOND → SUMMER. */
export async function listYears(ctx: Ctx): Promise<YearRow[]> {
  const rows = await db(ctx.tenantId).academicYear.findMany({
    select: { id: true, code: true, name: true, startDate: true, endDate: true, isCurrent: true, updatedAt: true, semesters: { select: semesterSelect } },
    orderBy: [{ startDate: "desc" }],
  });
  return rows.map((y) => ({ ...y, semesters: y.semesters.map(toSemester).sort((a, b) => TERM_ORDER[a.term] - TERM_ORDER[b.term]) }));
}

export type CurrentPeriod = { year: Pick<YearRow, "id" | "code" | "name"> | null; semester: Pick<SemesterRow, "id" | "name" | "term" | "status" | "startDate" | "endDate"> | null };

/** The tenant's current year/semester (partial unique index guarantees ≤ 1 each). */
export async function currentPeriod(ctx: Ctx): Promise<CurrentPeriod> {
  const prisma = db(ctx.tenantId);
  const [year, semester] = await Promise.all([
    prisma.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true, code: true, name: true } }),
    prisma.semester.findFirst({ where: { isCurrent: true }, select: { id: true, name: true, term: true, status: true, startDate: true, endDate: true } }),
  ]);
  return { year, semester };
}

/* ───────────── Catalogue: colleges / departments / majors / levels ───────────── */

export type CollegeRow = {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  updatedAt: Date;
  departmentCount: number;
};
export type DepartmentRow = Omit<CollegeRow, "departmentCount"> & { collegeId: string; collegeName: string; majorCount: number; courseCount: number };
export type MajorRow = Omit<CollegeRow, "departmentCount"> & {
  departmentId: string;
  departmentName: string;
  collegeName: string;
  degree: "DIPLOMA" | "BACHELOR" | "MASTER" | "PHD";
  durationYears: number | null;
  levelCount: number;
  courseCount: number;
};
export type LevelRow = {
  id: string;
  majorId: string;
  majorName: string;
  number: number;
  name: string;
  nameEn: string | null;
  isActive: boolean;
  updatedAt: Date;
  courseCount: number;
};

function nameFilter(q: string): Prisma.CollegeWhereInput {
  if (!q) return {};
  return { OR: [{ name: { contains: q, mode: "insensitive" } }, { nameEn: { contains: q, mode: "insensitive" } }, { code: { contains: q.toUpperCase() } }] };
}

export async function listColleges(ctx: Ctx, q: CatalogueListQuery): Promise<CollegeRow[]> {
  const rows = await db(ctx.tenantId).college.findMany({
    where: { ...nameFilter(q.q), ...(q.includeInactive ? {} : { isActive: true }) },
    select: { id: true, code: true, name: true, nameEn: true, description: true, sortOrder: true, isActive: true, updatedAt: true, _count: { select: { departments: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(({ _count, ...c }) => ({ ...c, departmentCount: _count.departments }));
}

export async function listDepartments(ctx: Ctx, q: CatalogueListQuery): Promise<DepartmentRow[]> {
  const rows = await db(ctx.tenantId).department.findMany({
    where: { ...(nameFilter(q.q) as Prisma.DepartmentWhereInput), ...(q.parentId ? { collegeId: q.parentId } : {}), ...(q.includeInactive ? {} : { isActive: true }) },
    select: {
      id: true, code: true, name: true, nameEn: true, description: true, sortOrder: true, isActive: true, updatedAt: true, collegeId: true,
      college: { select: { name: true } },
      _count: { select: { majors: true, courses: true } },
    },
    orderBy: [{ college: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(({ _count, college, ...d }) => ({ ...d, collegeName: college.name, majorCount: _count.majors, courseCount: _count.courses }));
}

export async function listMajors(ctx: Ctx, q: CatalogueListQuery): Promise<MajorRow[]> {
  const rows = await db(ctx.tenantId).major.findMany({
    where: { ...(nameFilter(q.q) as Prisma.MajorWhereInput), ...(q.parentId ? { departmentId: q.parentId } : {}), ...(q.includeInactive ? {} : { isActive: true }) },
    select: {
      id: true, code: true, name: true, nameEn: true, description: true, sortOrder: true, isActive: true, updatedAt: true, departmentId: true, degree: true, durationYears: true,
      department: { select: { name: true, college: { select: { name: true } } } },
      _count: { select: { levels: true, courses: true } },
    },
    orderBy: [{ department: { name: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(({ _count, department, ...m }) => ({ ...m, departmentName: department.name, collegeName: department.college.name, levelCount: _count.levels, courseCount: _count.courses }));
}

export async function listLevels(ctx: Ctx, q: CatalogueListQuery): Promise<LevelRow[]> {
  const rows = await db(ctx.tenantId).level.findMany({
    where: {
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { nameEn: { contains: q.q, mode: "insensitive" } }, { major: { name: { contains: q.q, mode: "insensitive" } } }] } : {}),
      ...(q.parentId ? { majorId: q.parentId } : {}),
      ...(q.includeInactive ? {} : { isActive: true }),
    },
    select: { id: true, majorId: true, number: true, name: true, nameEn: true, isActive: true, updatedAt: true, major: { select: { name: true } }, _count: { select: { courses: true } } },
    orderBy: [{ major: { name: "asc" } }, { number: "asc" }],
  });
  return rows.map(({ _count, major, ...l }) => ({ ...l, majorName: major.name, courseCount: _count.courses }));
}

/* ───────────── Aggregates ───────────── */

export type AcademicCounts = { years: number; semesters: number; colleges: number; departments: number; majors: number; levels: number };

export async function academicCounts(ctx: Ctx): Promise<AcademicCounts> {
  const p = db(ctx.tenantId);
  const [years, semesters, colleges, departments, majors, levels] = await Promise.all([
    p.academicYear.count(), p.semester.count(), p.college.count(), p.department.count(), p.major.count(), p.level.count(),
  ]);
  return { years, semesters, colleges, departments, majors, levels };
}

/** True when the tenant has neither a year nor a college → show the first-setup wizard (FR-ACD-005). */
export async function needsSetup(ctx: Ctx): Promise<boolean> {
  const c = await academicCounts(ctx);
  return c.years === 0 && c.colleges === 0;
}

/** Lightweight option lists for selects (active only). */
export type Option = { id: string; label: string; group?: string };
export async function collegeOptions(ctx: Ctx): Promise<Option[]> {
  const rows = await db(ctx.tenantId).college.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return rows.map((r) => ({ id: r.id, label: `${r.name} (${r.code})` }));
}
export async function departmentOptions(ctx: Ctx): Promise<Option[]> {
  const rows = await db(ctx.tenantId).department.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true, college: { select: { name: true } } }, orderBy: [{ college: { sortOrder: "asc" } }, { sortOrder: "asc" }] });
  return rows.map((r) => ({ id: r.id, label: `${r.name} (${r.code})`, group: r.college.name }));
}
export async function majorOptions(ctx: Ctx): Promise<Option[]> {
  const rows = await db(ctx.tenantId).major.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true, department: { select: { name: true } } }, orderBy: [{ department: { name: "asc" } }, { sortOrder: "asc" }] });
  return rows.map((r) => ({ id: r.id, label: `${r.name} (${r.code})`, group: r.department.name }));
}
export async function yearOptions(ctx: Ctx): Promise<Option[]> {
  const rows = await db(ctx.tenantId).academicYear.findMany({ select: { id: true, name: true, code: true }, orderBy: { startDate: "desc" } });
  return rows.map((r) => ({ id: r.id, label: `${r.name} (${r.code})` }));
}
