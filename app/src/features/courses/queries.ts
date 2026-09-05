/**
 * Courses — read side (RSC). Callers gate with `course.view`; rows are additionally narrowed by `courseScopeWhere`
 * (students only see courses they have a section in — FR-ENR-002). Soft-deleted courses appear only on the DELETED tab.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/rbac";
import type { Option } from "@/lib/contracts/option";
import { db } from "@/lib/db/tenant";
import { paginate, type Page } from "@/lib/result";
import { courseScopeWhere, isTenantWide } from "@/features/offerings/scope";
import type { CourseListQuery, CourseTab } from "./schemas";

export type CourseMajorRow = {
  majorId: string;
  majorName: string;
  majorCode: string;
  levelId: string | null;
  levelName: string | null;
  levelNumber: number | null;
  isRequired: boolean;
};

export type CourseRow = {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  creditHours: number;
  isActive: boolean;
  deletedAt: Date | null;
  updatedAt: Date;
  departmentId: string | null;
  departmentName: string | null;
  majors: CourseMajorRow[];
  offeringCount: number;
  fileCount: number;
};

const courseSelect = {
  id: true,
  code: true,
  name: true,
  nameEn: true,
  description: true,
  creditHours: true,
  isActive: true,
  deletedAt: true,
  updatedAt: true,
  departmentId: true,
  department: { select: { name: true } },
  majors: {
    select: {
      majorId: true,
      levelId: true,
      isRequired: true,
      major: { select: { name: true, code: true } },
      level: { select: { name: true, number: true } },
    },
    orderBy: { major: { name: "asc" } },
  },
  _count: { select: { offerings: { where: { deletedAt: null } }, files: true } },
} satisfies Prisma.CourseSelect;
type RawCourse = Prisma.CourseGetPayload<{ select: typeof courseSelect }>;

function toRow({ department, majors, _count, ...c }: RawCourse): CourseRow {
  return {
    ...c,
    departmentName: department?.name ?? null,
    majors: majors.map((m) => ({
      majorId: m.majorId,
      majorName: m.major.name,
      majorCode: m.major.code,
      levelId: m.levelId,
      levelName: m.level?.name ?? null,
      levelNumber: m.level?.number ?? null,
      isRequired: m.isRequired,
    })),
    offeringCount: _count.offerings,
    fileCount: _count.files,
  };
}

function tabWhere(tab: CourseTab): Prisma.CourseWhereInput {
  switch (tab) {
    case "ACTIVE":
      return { deletedAt: null, isActive: true };
    case "INACTIVE":
      return { deletedAt: null, isActive: false };
    case "DELETED":
      return { deletedAt: { not: null } };
    default:
      return { deletedAt: null };
  }
}

function searchWhere(q: string): Prisma.CourseWhereInput {
  if (!q) return {};
  return {
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { nameEn: { contains: q, mode: "insensitive" } },
      { code: { contains: q.toUpperCase() } },
    ],
  };
}

export async function listCourses(ctx: Ctx, q: CourseListQuery): Promise<Page<CourseRow>> {
  const where: Prisma.CourseWhereInput = {
    AND: [
      tabWhere(q.status),
      searchWhere(q.q),
      courseScopeWhere(ctx),
      q.departmentId ? { departmentId: q.departmentId } : {},
      q.majorId ? { majors: { some: { majorId: q.majorId } } } : {},
    ],
  };
  const prisma = db(ctx.tenantId);
  const [total, rows] = await Promise.all([
    prisma.course.count({ where }),
    prisma.course.findMany({
      where,
      select: courseSelect,
      orderBy: [{ code: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  return paginate(rows.map(toRow), total, q.page, q.pageSize);
}

/** Tab badges. DELETED is only meaningful (and only counted) for tenant-wide actors. */
export async function courseCounts(ctx: Ctx): Promise<Record<CourseTab, number>> {
  const prisma = db(ctx.tenantId);
  const scope = courseScopeWhere(ctx);
  const [all, active, deleted] = await Promise.all([
    prisma.course.count({ where: { AND: [{ deletedAt: null }, scope] } }),
    prisma.course.count({ where: { AND: [{ deletedAt: null, isActive: true }, scope] } }),
    isTenantWide(ctx) ? prisma.course.count({ where: { deletedAt: { not: null } } }) : Promise.resolve(0),
  ]);
  return { ALL: all, ACTIVE: active, INACTIVE: all - active, DELETED: deleted };
}

export type CourseOfferingSummary = {
  id: string;
  section: string;
  status: "DRAFT" | "OPEN" | "CLOSED" | "ARCHIVED";
  capacity: number | null;
  semesterId: string;
  semesterName: string;
  isCurrentSemester: boolean;
  instructors: { userId: string; name: string; role: "PRIMARY" | "CO_INSTRUCTOR" | "ASSISTANT" }[];
  activeCount: number;
};

export type CourseDetail = CourseRow & { createdAt: Date; offerings: CourseOfferingSummary[] };

/** Course + its sections (in-scope ones only for non-tenant-wide actors). Null when missing or out of scope. */
export async function getCourseDetail(ctx: Ctx, id: string): Promise<CourseDetail | null> {
  const scope = courseScopeWhere(ctx);
  const row = await db(ctx.tenantId).course.findFirst({
    where: { AND: [{ id }, scope] },
    select: {
      ...courseSelect,
      createdAt: true,
      offerings: {
        where: {
          deletedAt: null,
          ...(isTenantWide(ctx)
            ? {}
            : {
                OR: [
                  { instructors: { some: { userId: ctx.user.id } } },
                  { enrollments: { some: { studentId: ctx.user.id } } },
                ],
              }),
        },
        select: {
          id: true,
          section: true,
          status: true,
          capacity: true,
          semesterId: true,
          semester: { select: { name: true, isCurrent: true } },
          instructors: { select: { userId: true, role: true, user: { select: { name: true } } } },
          _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
        },
        orderBy: [{ semester: { startDate: "desc" } }, { section: "asc" }],
      },
    },
  });
  if (!row) return null;
  const { offerings, createdAt, ...rest } = row;
  return {
    ...toRow(rest),
    createdAt,
    offerings: offerings.map((o) => ({
      id: o.id,
      section: o.section,
      status: o.status,
      capacity: o.capacity,
      semesterId: o.semesterId,
      semesterName: o.semester.name,
      isCurrentSemester: o.semester.isCurrent,
      instructors: o.instructors.map((i) => ({ userId: i.userId, name: i.user.name, role: i.role })),
      activeCount: o._count.enrollments,
    })),
  };
}

/** Active courses for selects (offering dialog). */
export async function courseOptions(ctx: Ctx): Promise<Option[]> {
  const rows = await db(ctx.tenantId).course.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true, code: true, name: true, department: { select: { name: true } } },
    orderBy: { code: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    label: `${r.code} — ${r.name}`,
    group: r.department?.name ?? undefined,
  }));
}

/** Level options grouped by major (for the course ↔ major mapping editor). */
export type LevelOption = { id: string; majorId: string; number: number; name: string };
export async function levelOptionsByMajor(ctx: Ctx): Promise<LevelOption[]> {
  const rows = await db(ctx.tenantId).level.findMany({
    where: { isActive: true },
    select: { id: true, majorId: true, number: true, name: true },
    orderBy: [{ majorId: "asc" }, { number: "asc" }],
  });
  return rows;
}
