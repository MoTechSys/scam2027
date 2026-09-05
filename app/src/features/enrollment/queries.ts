/**
 * Enrollment — read side (RSC). The roster of an offering is visible to tenant-wide actors and to the section's
 * instructors; a student only ever sees their own enrolment rows (`myEnrollments`). Gate with `enrollment.view`.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import type { Ctx } from "@/lib/auth/rbac";
import { db } from "@/lib/db/tenant";
import { paginate, type Page } from "@/lib/result";
import type { EnrollmentListQuery, EnrollmentStatus } from "./schemas";

export type EnrollmentRow = {
  id: string;
  offeringId: string;
  studentId: string;
  studentName: string;
  academicId: string;
  email: string;
  status: EnrollmentStatus;
  source: "MANUAL" | "BULK" | "IMPORT" | "SELF";
  enrolledAt: Date;
  withdrawnAt: Date | null;
  completedAt: Date | null;
};

const enrollmentSelect = {
  id: true,
  offeringId: true,
  studentId: true,
  status: true,
  source: true,
  enrolledAt: true,
  withdrawnAt: true,
  completedAt: true,
  student: { select: { name: true, academicId: true, email: true } },
} satisfies Prisma.EnrollmentSelect;
type Raw = Prisma.EnrollmentGetPayload<{ select: typeof enrollmentSelect }>;
const toRow = ({ student, ...e }: Raw): EnrollmentRow => ({
  ...e,
  studentName: student.name,
  academicId: student.academicId,
  email: student.email,
});

/** Roster of one offering. Caller must have verified scope (`assertOfferingScope(ctx, id, "teaching")` or tenant-wide). */
export async function listEnrollments(
  ctx: Ctx,
  offeringId: string,
  q: EnrollmentListQuery,
): Promise<Page<EnrollmentRow>> {
  const where: Prisma.EnrollmentWhereInput = {
    offeringId,
    ...(q.status === "ALL" ? {} : { status: q.status }),
    ...(q.q
      ? {
          student: {
            OR: [
              { name: { contains: q.q, mode: "insensitive" } },
              { academicId: { contains: q.q } },
              { email: { contains: q.q.toLowerCase() } },
            ],
          },
        }
      : {}),
  };
  const prisma = db(ctx.tenantId);
  const [total, rows] = await Promise.all([
    prisma.enrollment.count({ where }),
    prisma.enrollment.findMany({
      where,
      select: enrollmentSelect,
      orderBy: [{ status: "asc" }, { student: { academicId: "asc" } }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);
  return paginate(rows.map(toRow), total, q.page, q.pageSize);
}

export type MyEnrollmentRow = {
  id: string;
  status: EnrollmentStatus;
  enrolledAt: Date;
  offeringId: string;
  section: string;
  offeringStatus: "DRAFT" | "OPEN" | "CLOSED" | "ARCHIVED";
  courseId: string;
  courseCode: string;
  courseName: string;
  creditHours: number;
  semesterName: string;
  isCurrentSemester: boolean;
  instructors: string[];
};

/** The actor's own enrolments (student view), newest semester first. */
export async function myEnrollments(ctx: Ctx): Promise<MyEnrollmentRow[]> {
  const rows = await db(ctx.tenantId).enrollment.findMany({
    where: { studentId: ctx.user.id, offering: { deletedAt: null } },
    select: {
      id: true,
      status: true,
      enrolledAt: true,
      offeringId: true,
      offering: {
        select: {
          section: true,
          status: true,
          courseId: true,
          course: { select: { code: true, name: true, creditHours: true } },
          semester: { select: { name: true, isCurrent: true } },
          instructors: { select: { user: { select: { name: true } } } },
        },
      },
    },
    orderBy: [{ offering: { semester: { startDate: "desc" } } }, { offering: { course: { code: "asc" } } }],
  });
  return rows.map(({ offering: o, ...e }) => ({
    ...e,
    section: o.section,
    offeringStatus: o.status,
    courseId: o.courseId,
    courseCode: o.course.code,
    courseName: o.course.name,
    creditHours: o.course.creditHours,
    semesterName: o.semester.name,
    isCurrentSemester: o.semester.isCurrent,
    instructors: o.instructors.map((i) => i.user.name),
  }));
}

/** Active students not yet ACTIVE in the offering — for the single-enrol picker (search by name / id / email). */
export type StudentOption = { id: string; name: string; academicId: string; email: string };
export async function studentCandidates(
  ctx: Ctx,
  offeringId: string,
  q: string,
  take = 20,
): Promise<StudentOption[]> {
  const term = q.trim();
  return db(ctx.tenantId).user.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      roles: { some: { role: { code: "STUDENT", deletedAt: null } } },
      enrollments: { none: { offeringId, status: "ACTIVE" } },
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { academicId: { contains: term } },
              { email: { contains: term.toLowerCase() } },
            ],
          }
        : {}),
    },
    select: { id: true, name: true, academicId: true, email: true },
    orderBy: { academicId: "asc" },
    take,
  });
}
