/**
 * Reports — read side (P1-13, FR-RPT-001/002/003/006). Every number is a real aggregate over the tenant client
 * (RLS is the outer fence); instructors (`report.* = own`) are narrowed by the same scope helpers the lists use
 * (`courseScopeWhere` / `offeringScopeWhere` / `fileScopeWhere`) so a report never shows more than the list does.
 *
 * Aggregates run in one `tx(tenantId)` per tab so all counts describe the same snapshot. `groupBy` is used where
 * Prisma supports it; the few many-to-many roll-ups (users per role, files per course) use one `IN (...)` per page
 * (bounded by the number of roles / courses, never per row).
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/rbac";
import { db, tx, type TenantTx } from "@/lib/db/tenant";
import { fileScopeWhere, isFileAdmin } from "@/features/files/scope";
import { courseScopeWhere, isTenantWide, offeringScopeWhere } from "@/features/offerings/scope";
import { dayRangeInTimeZone } from "@/features/audit/schemas";
import {
  REPORT_EXPORT_BATCH,
  REPORT_EXPORT_MAX_ROWS,
  bytesToMb,
  type CoursesReportFilter,
  type FilesReportFilter,
  type UsersReportFilter,
} from "./schemas";

// ───────────────────────────── shared ─────────────────────────────

export type NamedCount = { id: string; label: string; count: number };
export type StatusCount<S extends string> = { status: S; count: number };
export type MonthPoint = { month: string; count: number }; // month = ISO of the 1st day (UTC)

/** Trailing `months` calendar months (oldest first), as UTC-midnight ISO keys. */
export function monthKeys(months: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    out.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString());
  }
  return out;
}

/** Bucket rows into the trailing months (rows outside the window are dropped). */
export function bucketByMonth(rows: { createdAt: Date }[], months: number, now = new Date()): MonthPoint[] {
  const keys = monthKeys(months, now);
  const map = new Map(keys.map((k) => [k, 0]));
  for (const r of rows) {
    const k = new Date(Date.UTC(r.createdAt.getUTCFullYear(), r.createdAt.getUTCMonth(), 1)).toISOString();
    if (map.has(k)) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return keys.map((k) => ({ month: k, count: map.get(k) ?? 0 }));
}

export async function tenantTimeZone(ctx: Ctx): Promise<string> {
  const t = await db(ctx.tenantId).tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { timezone: true },
  });
  return t?.timezone ?? "Asia/Riyadh";
}

// ───────────────────────────── overview ─────────────────────────────

export type OverviewReport = {
  users: { total: number; active: number; pending: number; frozen: number; disabled: number };
  academic: { colleges: number; departments: number; majors: number; courses: number; offerings: number };
  enrollments: { active: number; withdrawn: number; completed: number };
  files: { count: number; sizeMb: number; downloads: number };
  notifications: { sent: number; recipients: number; unread: number };
  /** New users per month, trailing 6 months. */
  usersByMonth: MonthPoint[];
  /** Files uploaded per month, trailing 6 months. */
  filesByMonth: MonthPoint[];
  /** True when the actor sees tenant-wide numbers (course.manage_all); false = narrowed to own scope. */
  tenantWide: boolean;
};

export async function loadOverviewReport(ctx: Ctx, now = new Date()): Promise<OverviewReport> {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const tenantWide = isTenantWide(ctx);
  const offScope = offeringScopeWhere(ctx);
  const courseScope = courseScopeWhere(ctx);
  const fileScope = fileScopeWhere(ctx);
  return tx(ctx.tenantId, async (t) => {
    const userStatus = await t.user.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    const status = (s: string) => userStatus.find((r) => r.status === s)?._count._all ?? 0;
    const enrolStatus = await t.enrollment.groupBy({
      by: ["status"],
      where: { offering: { deletedAt: null, ...offScope } },
      _count: { _all: true },
    });
    const enrol = (s: string) => enrolStatus.find((r) => r.status === s)?._count._all ?? 0;
    const [
      colleges,
      departments,
      majors,
      courses,
      offerings,
      fileAgg,
      downloads,
      sent,
      recipients,
      unread,
      userRows,
      fileRows,
    ] = await Promise.all([
      t.college.count(),
      t.department.count(),
      t.major.count(),
      t.course.count({ where: { deletedAt: null, ...courseScope } }),
      t.courseOffering.count({ where: { deletedAt: null, ...offScope } }),
      t.file.aggregate({
        where: { deletedAt: null, ...fileScope },
        _count: { _all: true },
        _sum: { size: true },
      }),
      t.file.aggregate({ where: { deletedAt: null, ...fileScope }, _sum: { downloads: true } }),
      t.notification.count({ where: { deletedAt: null } }),
      t.notificationRecipient.count(),
      t.notificationRecipient.count({ where: { readAt: null } }),
      t.user.findMany({ where: { deletedAt: null, createdAt: { gte: since } }, select: { createdAt: true } }),
      t.file.findMany({
        where: { deletedAt: null, createdAt: { gte: since }, ...fileScope },
        select: { createdAt: true },
      }),
    ]);
    return {
      users: {
        total: userStatus.reduce((a, r) => a + r._count._all, 0),
        active: status("ACTIVE"),
        pending: status("PENDING_ACTIVATION"),
        frozen: status("FROZEN"),
        disabled: status("DISABLED"),
      },
      academic: { colleges, departments, majors, courses, offerings },
      enrollments: { active: enrol("ACTIVE"), withdrawn: enrol("WITHDRAWN"), completed: enrol("COMPLETED") },
      files: {
        count: fileAgg._count._all,
        sizeMb: bytesToMb(fileAgg._sum.size ?? 0),
        downloads: downloads._sum.downloads ?? 0,
      },
      notifications: { sent, recipients, unread },
      usersByMonth: bucketByMonth(userRows, 6, now),
      filesByMonth: bucketByMonth(fileRows, 6, now),
      tenantWide,
    };
  });
}

// ───────────────────────────── users ─────────────────────────────

export type UsersReport = {
  total: number;
  byStatus: StatusCount<"PENDING_ACTIVATION" | "ACTIVE" | "FROZEN" | "DISABLED">[];
  byRole: NamedCount[];
  /** Distinct users enrolled in any offering of a course linked to the major (one bounded count per major). */
  byMajor: NamedCount[];
  activeLast30d: number;
  neverLoggedIn: number;
  lockedNow: number;
  byMonth: MonthPoint[];
  /** Filter options for the UI (roles + majors). */
  options: { roles: { id: string; label: string }[]; majors: { id: string; label: string }[] };
};

function usersWhere(f: UsersReportFilter): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [{ deletedAt: null }];
  if (f.status) and.push({ status: f.status });
  if (f.roleId) and.push({ roles: { some: { roleId: f.roleId } } });
  if (f.majorId)
    and.push({
      enrollments: {
        some: { offering: { deletedAt: null, course: { majors: { some: { majorId: f.majorId } } } } },
      },
    });
  return { AND: and };
}

export async function loadUsersReport(
  ctx: Ctx,
  f: UsersReportFilter,
  now = new Date(),
): Promise<UsersReport> {
  const where = usersWhere(f);
  const since30 = new Date(now.getTime() - 30 * 86_400_000);
  const since6m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  return tx(ctx.tenantId, async (t) => {
    const [byStatusRaw, roles, majors, activeLast30d, neverLoggedIn, lockedNow, createdRows, total] =
      await Promise.all([
        t.user.groupBy({ by: ["status"], where, _count: { _all: true } }),
        t.role.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true, code: true },
          orderBy: [{ isSystem: "desc" }, { name: "asc" }],
        }),
        t.major.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        }),
        t.user.count({ where: { AND: [where, { lastLoginAt: { gte: since30 } }] } }),
        t.user.count({ where: { AND: [where, { lastLoginAt: null }] } }),
        t.user.count({ where: { AND: [where, { lockedUntil: { gt: now } }] } }),
        t.user.findMany({
          where: { AND: [where, { createdAt: { gte: since6m } }] },
          select: { createdAt: true },
        }),
        t.user.count({ where }),
      ]);
    // Users per role: one grouped count over UserRole restricted to the filtered users.
    const roleCounts = await t.userRole.groupBy({
      by: ["roleId"],
      where: { user: where, role: { deletedAt: null } },
      _count: { _all: true },
    });
    const byRole: NamedCount[] = roles
      .map((r) => ({
        id: r.id,
        label: r.name,
        count: roleCounts.find((c) => c.roleId === r.id)?._count._all ?? 0,
      }))
      .filter((r) => r.count > 0 || roles.length <= 8);
    // Users per major: distinct students enrolled in any offering of a course linked to the major.
    const byMajor: NamedCount[] = [];
    for (const m of majors) {
      const count = await t.user.count({
        where: {
          AND: [
            where,
            {
              enrollments: {
                some: {
                  offering: { deletedAt: null, course: { majors: { some: { majorId: m.id } } } },
                },
              },
            },
          ],
        },
      });
      if (count > 0) byMajor.push({ id: m.id, label: m.name, count });
    }
    const order = ["ACTIVE", "PENDING_ACTIVATION", "FROZEN", "DISABLED"] as const;
    return {
      total,
      byStatus: order.map((s) => ({
        status: s,
        count: byStatusRaw.find((r) => r.status === s)?._count._all ?? 0,
      })),
      byRole,
      byMajor,
      activeLast30d,
      neverLoggedIn,
      lockedNow,
      byMonth: bucketByMonth(createdRows, 6, now),
      options: {
        roles: roles.map((r) => ({ id: r.id, label: r.name })),
        majors: majors.map((m) => ({ id: m.id, label: m.name })),
      },
    };
  });
}

export type UserExportRow = {
  academicId: string;
  name: string;
  email: string;
  status: string;
  roles: string;
  lastLoginAt: Date | null;
  createdAt: Date;
};

/** Keyset-paginated rows for the CSV (ordered by id, bounded by REPORT_EXPORT_MAX_ROWS). */
export async function* iterateUsersExport(ctx: Ctx, f: UsersReportFilter): AsyncGenerator<UserExportRow[]> {
  const prisma = db(ctx.tenantId);
  let cursor: string | undefined;
  let emitted = 0;
  while (emitted < REPORT_EXPORT_MAX_ROWS) {
    const take = Math.min(REPORT_EXPORT_BATCH, REPORT_EXPORT_MAX_ROWS - emitted);
    const rows = await prisma.user.findMany({
      where: usersWhere(f),
      orderBy: { id: "asc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        academicId: true,
        name: true,
        email: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    });
    if (rows.length === 0) return;
    yield rows.map((r) => ({
      academicId: r.academicId,
      name: r.name,
      email: r.email,
      status: r.status,
      roles: r.roles.map((x) => x.role.name).join(" | "),
      lastLoginAt: r.lastLoginAt,
      createdAt: r.createdAt,
    }));
    emitted += rows.length;
    cursor = rows[rows.length - 1]!.id;
    if (rows.length < take) return;
  }
}

export async function countUsersExport(ctx: Ctx, f: UsersReportFilter): Promise<number> {
  return db(ctx.tenantId).user.count({ where: usersWhere(f) });
}

// ───────────────────────────── courses ─────────────────────────────

export type CourseRow = {
  id: string;
  code: string;
  name: string;
  department: string | null;
  creditHours: number;
  isActive: boolean;
  offerings: number;
  openOfferings: number;
  activeEnrollments: number;
  instructors: number;
  files: number;
};

export type CoursesReport = {
  semester: { id: string; name: string } | null;
  totals: { courses: number; offerings: number; activeEnrollments: number; avgFill: number | null };
  byOfferingStatus: StatusCount<"DRAFT" | "OPEN" | "CLOSED" | "ARCHIVED">[];
  byDepartment: NamedCount[];
  /** Top courses by active enrolments in the selected semester (max 10). */
  topCourses: { id: string; code: string; name: string; enrollments: number }[];
  rows: CourseRow[];
  options: {
    semesters: { id: string; label: string; isCurrent: boolean }[];
    departments: { id: string; label: string }[];
  };
  tenantWide: boolean;
};

async function resolveSemester(t: TenantTx, semesterId?: string) {
  if (semesterId) {
    const s = await t.semester.findFirst({ where: { id: semesterId }, select: { id: true, name: true } });
    if (s) return s;
  }
  return t.semester.findFirst({ where: { isCurrent: true }, select: { id: true, name: true } });
}

function coursesWhere(ctx: Ctx, f: CoursesReportFilter): Prisma.CourseWhereInput {
  const and: Prisma.CourseWhereInput[] = [{ deletedAt: null }, courseScopeWhere(ctx)];
  if (f.departmentId) and.push({ departmentId: f.departmentId });
  return { AND: and };
}

async function courseRows(
  ctx: Ctx,
  t: TenantTx,
  f: CoursesReportFilter,
  semesterId: string | null,
  take?: number,
) {
  const offScope = offeringScopeWhere(ctx);
  const offWhere: Prisma.CourseOfferingWhereInput = {
    deletedAt: null,
    ...offScope,
    ...(semesterId ? { semesterId } : {}),
  };
  const courses = await t.course.findMany({
    where: coursesWhere(ctx, f),
    orderBy: { code: "asc" },
    ...(take ? { take } : {}),
    select: {
      id: true,
      code: true,
      name: true,
      creditHours: true,
      isActive: true,
      department: { select: { name: true } },
      offerings: {
        where: offWhere,
        select: {
          id: true,
          status: true,
          capacity: true,
          _count: { select: { enrollments: { where: { status: "ACTIVE" } }, instructors: true } },
        },
      },
      _count: { select: { files: { where: { deletedAt: null, ...fileScopeWhere(ctx) } } } },
    },
  });
  return courses.map((c) => {
    const offerings = c.offerings;
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      department: c.department?.name ?? null,
      creditHours: c.creditHours,
      isActive: c.isActive,
      offerings: offerings.length,
      openOfferings: offerings.filter((o) => o.status === "OPEN").length,
      activeEnrollments: offerings.reduce((a, o) => a + o._count.enrollments, 0),
      instructors: offerings.reduce((a, o) => a + o._count.instructors, 0),
      files: c._count.files,
      _capacity: offerings.reduce((a, o) => a + (o.capacity ?? 0), 0),
      _hasCapacity: offerings.some((o) => o.capacity != null),
    };
  });
}

export async function loadCoursesReport(ctx: Ctx, f: CoursesReportFilter): Promise<CoursesReport> {
  return tx(ctx.tenantId, async (t) => {
    const semester = await resolveSemester(t, f.semesterId);
    const semesterId = semester?.id ?? null;
    const offScope = offeringScopeWhere(ctx);
    const offWhere: Prisma.CourseOfferingWhereInput = {
      deletedAt: null,
      ...offScope,
      ...(semesterId ? { semesterId } : {}),
      ...(f.departmentId ? { course: { departmentId: f.departmentId } } : {}),
    };
    const [rows, byStatusRaw, semesters, departments] = await Promise.all([
      courseRows(ctx, t, f, semesterId),
      t.courseOffering.groupBy({ by: ["status"], where: offWhere, _count: { _all: true } }),
      t.semester.findMany({
        select: { id: true, name: true, isCurrent: true, academicYear: { select: { name: true } } },
        orderBy: [{ startDate: "desc" }],
        take: 12,
      }),
      t.department.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    const deptMap = new Map<string, NamedCount>();
    for (const r of rows) {
      const key = r.department ?? "—";
      const cur = deptMap.get(key) ?? { id: key, label: key, count: 0 };
      cur.count += 1;
      deptMap.set(key, cur);
    }
    const capacity = rows.reduce((a, r) => a + r._capacity, 0);
    const activeEnrollments = rows.reduce((a, r) => a + r.activeEnrollments, 0);
    const order = ["DRAFT", "OPEN", "CLOSED", "ARCHIVED"] as const;
    return {
      semester,
      totals: {
        courses: rows.length,
        offerings: rows.reduce((a, r) => a + r.offerings, 0),
        activeEnrollments,
        avgFill: capacity > 0 ? Math.round((activeEnrollments / capacity) * 1000) / 10 : null,
      },
      byOfferingStatus: order.map((s) => ({
        status: s,
        count: byStatusRaw.find((r) => r.status === s)?._count._all ?? 0,
      })),
      byDepartment: [...deptMap.values()].sort((a, b) => b.count - a.count),
      topCourses: [...rows]
        .filter((r) => r.activeEnrollments > 0)
        .sort((a, b) => b.activeEnrollments - a.activeEnrollments)
        .slice(0, 10)
        .map((r) => ({ id: r.id, code: r.code, name: r.name, enrollments: r.activeEnrollments })),
      rows: rows.map(({ _capacity: _c, _hasCapacity: _h, ...rest }) => rest),
      options: {
        semesters: semesters.map((s) => ({
          id: s.id,
          label: `${s.academicYear.name} — ${s.name}`,
          isCurrent: s.isCurrent,
        })),
        departments: departments.map((d) => ({ id: d.id, label: d.name })),
      },
      tenantWide: isTenantWide(ctx),
    };
  });
}

/** CSV rows = the same table the page shows (courses are bounded per tenant; one batch). */
export async function loadCoursesExport(ctx: Ctx, f: CoursesReportFilter): Promise<CourseRow[]> {
  return tx(ctx.tenantId, async (t) => {
    const semester = await resolveSemester(t, f.semesterId);
    const rows = await courseRows(ctx, t, f, semester?.id ?? null, REPORT_EXPORT_MAX_ROWS);
    return rows.map(({ _capacity: _c, _hasCapacity: _h, ...rest }) => rest);
  });
}

// ───────────────────────────── files ─────────────────────────────

export type FilesReport = {
  totals: { count: number; sizeMb: number; downloads: number; pending: number };
  byCategory: StatusCount<"LECTURE" | "ASSIGNMENT" | "EXAM" | "REFERENCE" | "OTHER">[];
  byStatus: StatusCount<"PENDING" | "APPROVED" | "REJECTED">[];
  byMimeGroup: NamedCount[];
  /** Files per course (top 10 by count), plus one bucket for unattached files. */
  byCourse: NamedCount[];
  topDownloaded: { id: string; name: string; downloads: number; course: string | null }[];
  byMonth: MonthPoint[];
  options: { courses: { id: string; label: string }[] };
  tenantWide: boolean;
};

export function mimeGroup(mime: string): string {
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (/(word|officedocument\.word|msword)/.test(mime)) return "document";
  if (/(excel|spreadsheet)/.test(mime)) return "spreadsheet";
  if (/(powerpoint|presentation)/.test(mime)) return "presentation";
  if (/(zip|compressed|tar|7z|rar)/.test(mime)) return "archive";
  if (mime.startsWith("text/")) return "text";
  return "other";
}

function filesWhere(ctx: Ctx, f: FilesReportFilter, timeZone: string): Prisma.FileWhereInput {
  const and: Prisma.FileWhereInput[] = [{ deletedAt: null }, fileScopeWhere(ctx)];
  if (f.category) and.push({ category: f.category });
  if (f.courseId) and.push({ courseId: f.courseId });
  if (f.from || f.to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (f.from) createdAt.gte = dayRangeInTimeZone(f.from, timeZone).start;
    if (f.to) createdAt.lt = dayRangeInTimeZone(f.to, timeZone).end;
    and.push({ createdAt });
  }
  return { AND: and };
}

export async function loadFilesReport(
  ctx: Ctx,
  f: FilesReportFilter,
  timeZone: string,
  now = new Date(),
): Promise<FilesReport> {
  const where = filesWhere(ctx, f, timeZone);
  const since6m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  return tx(ctx.tenantId, async (t) => {
    const [agg, byCategoryRaw, byStatusRaw, mimeRows, byCourseRaw, top, monthRows, courses] =
      await Promise.all([
        t.file.aggregate({ where, _count: { _all: true }, _sum: { size: true, downloads: true } }),
        t.file.groupBy({ by: ["category"], where, _count: { _all: true } }),
        t.file.groupBy({ by: ["status"], where, _count: { _all: true } }),
        t.file.groupBy({ by: ["mimeType"], where, _count: { _all: true } }),
        t.file.groupBy({ by: ["courseId"], where, _count: { _all: true } }),
        t.file.findMany({
          where: { AND: [where, { downloads: { gt: 0 } }] },
          orderBy: [{ downloads: "desc" }, { createdAt: "desc" }],
          take: 10,
          select: { id: true, name: true, downloads: true, course: { select: { code: true } } },
        }),
        t.file.findMany({
          where: { AND: [where, { createdAt: { gte: since6m } }] },
          select: { createdAt: true },
        }),
        t.course.findMany({
          where: { deletedAt: null, ...courseScopeWhere(ctx) },
          select: { id: true, code: true, name: true },
          orderBy: { code: "asc" },
        }),
      ]);
    const courseLabel = new Map(courses.map((c) => [c.id, `${c.code} — ${c.name}`]));
    const mimeMap = new Map<string, number>();
    for (const r of mimeRows) {
      const g = mimeGroup(r.mimeType);
      mimeMap.set(g, (mimeMap.get(g) ?? 0) + r._count._all);
    }
    const cats = ["LECTURE", "ASSIGNMENT", "EXAM", "REFERENCE", "OTHER"] as const;
    const sts = ["APPROVED", "PENDING", "REJECTED"] as const;
    return {
      totals: {
        count: agg._count._all,
        sizeMb: bytesToMb(agg._sum.size ?? 0),
        downloads: agg._sum.downloads ?? 0,
        pending: byStatusRaw.find((r) => r.status === "PENDING")?._count._all ?? 0,
      },
      byCategory: cats.map((c) => ({
        status: c,
        count: byCategoryRaw.find((r) => r.category === c)?._count._all ?? 0,
      })),
      byStatus: sts.map((s) => ({
        status: s,
        count: byStatusRaw.find((r) => r.status === s)?._count._all ?? 0,
      })),
      byMimeGroup: [...mimeMap.entries()]
        .map(([id, count]) => ({ id, label: id, count }))
        .sort((a, b) => b.count - a.count),
      byCourse: byCourseRaw
        .map((r) => ({
          id: r.courseId ?? "none",
          label: r.courseId ? (courseLabel.get(r.courseId) ?? r.courseId) : "—",
          count: r._count._all,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      topDownloaded: top.map((x) => ({
        id: x.id,
        name: x.name,
        downloads: x.downloads,
        course: x.course?.code ?? null,
      })),
      byMonth: bucketByMonth(monthRows, 6, now),
      options: { courses: courses.map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` })) },
      tenantWide: isFileAdmin(ctx),
    };
  });
}

export type FileExportRow = {
  name: string;
  category: string;
  status: string;
  mimeType: string;
  sizeBytes: number;
  course: string | null;
  offering: string | null;
  uploader: string;
  downloads: number;
  createdAt: Date;
};

export async function* iterateFilesExport(
  ctx: Ctx,
  f: FilesReportFilter,
  timeZone: string,
): AsyncGenerator<FileExportRow[]> {
  const prisma = db(ctx.tenantId);
  const where = filesWhere(ctx, f, timeZone);
  let cursor: string | undefined;
  let emitted = 0;
  while (emitted < REPORT_EXPORT_MAX_ROWS) {
    const take = Math.min(REPORT_EXPORT_BATCH, REPORT_EXPORT_MAX_ROWS - emitted);
    const rows = await prisma.file.findMany({
      where,
      orderBy: { id: "asc" },
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        name: true,
        category: true,
        status: true,
        mimeType: true,
        size: true,
        downloads: true,
        createdAt: true,
        course: { select: { code: true } },
        offering: { select: { section: true, course: { select: { code: true } } } },
        uploader: { select: { name: true } },
      },
    });
    if (rows.length === 0) return;
    yield rows.map((r) => ({
      name: r.name,
      category: r.category,
      status: r.status,
      mimeType: r.mimeType,
      sizeBytes: r.size,
      course: r.course?.code ?? null,
      offering: r.offering ? `${r.offering.course.code}-${r.offering.section}` : null,
      uploader: r.uploader.name,
      downloads: r.downloads,
      createdAt: r.createdAt,
    }));
    emitted += rows.length;
    cursor = rows[rows.length - 1]!.id;
    if (rows.length < take) return;
  }
}

export async function countFilesExport(ctx: Ctx, f: FilesReportFilter, timeZone: string): Promise<number> {
  return db(ctx.tenantId).file.count({ where: filesWhere(ctx, f, timeZone) });
}
