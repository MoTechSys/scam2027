/**
 * Offerings (sections) — read side (RSC). Gate with `offering.view`; rows are narrowed by `offeringScopeWhere`
 * (instructor → own sections, student → enrolled sections, `course.manage_all` → everything).
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/rbac";
import type { Option } from "@/lib/contracts/option";
import type { OfferingSchedule } from "@/lib/contracts/json-columns";
import { offeringScheduleSchema } from "@/lib/contracts/json-columns";
import { db } from "@/lib/db/tenant";
import { paginate, type Page } from "@/lib/result";
import { offeringRelation, offeringScopeWhere, type OfferingRelation } from "./scope";
import type { InstructorRole, OfferingListQuery, OfferingStatus, OfferingTab } from "./schemas";

export type OfferingInstructorRow = {
  userId: string;
  name: string;
  academicId: string;
  role: InstructorRole;
};

export type OfferingRow = {
  id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  creditHours: number;
  semesterId: string;
  semesterName: string;
  isCurrentSemester: boolean;
  section: string;
  status: OfferingStatus;
  capacity: number | null;
  location: string | null;
  schedule: OfferingSchedule;
  instructors: OfferingInstructorRow[];
  activeCount: number;
  updatedAt: Date;
};

const offeringSelect = {
  id: true,
  courseId: true,
  semesterId: true,
  section: true,
  status: true,
  capacity: true,
  location: true,
  schedule: true,
  updatedAt: true,
  course: { select: { code: true, name: true, creditHours: true } },
  semester: { select: { name: true, isCurrent: true } },
  instructors: {
    select: { userId: true, role: true, user: { select: { name: true, academicId: true } } },
    orderBy: { role: "asc" },
  },
  _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
} satisfies Prisma.CourseOfferingSelect;
type RawOffering = Prisma.CourseOfferingGetPayload<{ select: typeof offeringSelect }>;

/** Stored JSON is validated on write; parse defensively on read so a bad row degrades to an empty schedule. */
export function parseSchedule(json: unknown): OfferingSchedule {
  const r = offeringScheduleSchema.safeParse(json ?? []);
  return r.success ? r.data : [];
}

function toRow({ course, semester, instructors, _count, schedule, ...o }: RawOffering): OfferingRow {
  return {
    ...o,
    courseCode: course.code,
    courseName: course.name,
    creditHours: course.creditHours,
    semesterName: semester.name,
    isCurrentSemester: semester.isCurrent,
    schedule: parseSchedule(schedule),
    instructors: instructors.map((i) => ({
      userId: i.userId,
      name: i.user.name,
      academicId: i.user.academicId,
      role: i.role,
    })),
    activeCount: _count.enrollments,
  };
}

function tabWhere(tab: OfferingTab): Prisma.CourseOfferingWhereInput {
  return tab === "ALL" ? {} : { status: tab };
}

function searchWhere(q: string): Prisma.CourseOfferingWhereInput {
  if (!q) return {};
  return {
    OR: [
      { course: { name: { contains: q, mode: "insensitive" } } },
      { course: { code: { contains: q.toUpperCase() } } },
      { section: { contains: q.toUpperCase() } },
      { instructors: { some: { user: { name: { contains: q, mode: "insensitive" } } } } },
    ],
  };
}

function baseWhere(ctx: Ctx, q: OfferingListQuery): Prisma.CourseOfferingWhereInput {
  const mine: Prisma.CourseOfferingWhereInput = q.mine
    ? {
        OR: [
          { instructors: { some: { userId: ctx.user.id } } },
          { enrollments: { some: { studentId: ctx.user.id } } },
        ],
      }
    : {};
  return {
    AND: [
      { deletedAt: null },
      offeringScopeWhere(ctx),
      mine,
      q.semesterId ? { semesterId: q.semesterId } : {},
      q.courseId ? { courseId: q.courseId } : {},
    ],
  };
}

export async function listOfferings(ctx: Ctx, q: OfferingListQuery): Promise<Page<OfferingRow>> {
  const where: Prisma.CourseOfferingWhereInput = {
    AND: [baseWhere(ctx, q), tabWhere(q.status), searchWhere(q.q)],
  };
  const prisma = db(ctx.tenantId);
  const [total, rows] = await Promise.all([
    prisma.courseOffering.count({ where }),
    prisma.courseOffering.findMany({
      where,
      select: offeringSelect,
      orderBy: [{ semester: { startDate: "desc" } }, { course: { code: "asc" } }, { section: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  return paginate(rows.map(toRow), total, q.page, q.pageSize);
}

/** Status tab badges under the same semester/course/mine filters. */
export async function offeringCounts(ctx: Ctx, q: OfferingListQuery): Promise<Record<OfferingTab, number>> {
  const groups = await db(ctx.tenantId).courseOffering.groupBy({
    by: ["status"],
    where: baseWhere(ctx, q),
    _count: { _all: true },
  });
  const out: Record<OfferingTab, number> = { ALL: 0, DRAFT: 0, OPEN: 0, CLOSED: 0, ARCHIVED: 0 };
  for (const g of groups) {
    out[g.status] = g._count._all;
    out.ALL += g._count._all;
  }
  return out;
}

export type OfferingDetail = OfferingRow & {
  createdAt: Date;
  courseNameEn: string | null;
  semesterStatus: "PLANNED" | "ACTIVE" | "CLOSED" | "ARCHIVED";
  counts: { ACTIVE: number; WITHDRAWN: number; COMPLETED: number };
  /** Actor's relation — drives which actions the UI offers (a tenant-wide actor is "NONE" unless also assigned). */
  relation: OfferingRelation;
  fileCount: number;
};

/** Offering header for `/offerings/[id]`. Null when missing, soft-deleted or out of scope. */
export async function getOfferingDetail(ctx: Ctx, id: string): Promise<OfferingDetail | null> {
  const prisma = db(ctx.tenantId);
  const row = await prisma.courseOffering.findFirst({
    where: { AND: [{ id, deletedAt: null }, offeringScopeWhere(ctx)] },
    select: {
      ...offeringSelect,
      createdAt: true,
      course: { select: { code: true, name: true, nameEn: true, creditHours: true } },
      semester: { select: { name: true, isCurrent: true, status: true } },
      _count: { select: { enrollments: { where: { status: "ACTIVE" } }, files: true } },
    },
  });
  if (!row) return null;
  const [groups, relation] = await Promise.all([
    prisma.enrollment.groupBy({ by: ["status"], where: { offeringId: id }, _count: { _all: true } }),
    offeringRelation(ctx, id),
  ]);
  const counts = { ACTIVE: 0, WITHDRAWN: 0, COMPLETED: 0 };
  for (const g of groups) counts[g.status] = g._count._all;
  const { createdAt, course, semester, _count, ...rest } = row;
  return {
    ...toRow({ ...rest, course, semester, _count: { enrollments: _count.enrollments } }),
    createdAt,
    courseNameEn: course.nameEn,
    semesterStatus: semester.status,
    counts,
    relation,
    fileCount: _count.files,
  };
}

/* ───────────── Options ───────────── */

export async function semesterOptions(ctx: Ctx): Promise<Option[]> {
  const rows = await db(ctx.tenantId).semester.findMany({
    select: { id: true, name: true, isCurrent: true, academicYear: { select: { code: true } } },
    orderBy: [{ startDate: "desc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.isCurrent ? `${r.name} ★` : r.name,
    group: r.academicYear.code,
  }));
}

/** Active users holding a role that grants `offering.view` in own scope — i.e. potential instructors. */
export type InstructorOption = { id: string; name: string; academicId: string; title: string | null };
export async function instructorOptions(ctx: Ctx): Promise<InstructorOption[]> {
  const rows = await db(ctx.tenantId).user.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      roles: { some: { role: { code: "INSTRUCTOR", deletedAt: null } } },
    },
    select: { id: true, name: true, academicId: true, profile: { select: { title: true } } },
    orderBy: { name: "asc" },
    take: 500,
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    academicId: r.academicId,
    title: r.profile?.title ?? null,
  }));
}
