"use server";

/**
 * Courses — Server Actions (FR-CRS-001, 002, 005). Every action:
 *  requireUserOrThrow → assertPermission → tx(tenantId) → audit → revalidate.
 *
 * Invariants
 *  - `code` unique per tenant (checked in-tx for a friendly fieldError; DB unique index is the final guard).
 *  - Major mapping rows must reference a Level that belongs to the same Major (checked in-tx).
 *  - Delete is soft (`deletedAt`) and refused while the course has non-archived sections; restore clears the flag.
 */
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { assertPermission, requireUserOrThrow, type Ctx } from "@/lib/auth/rbac";
import { tx, type TenantTx } from "@/lib/db/tenant";
import { AppError, type Result } from "@/lib/result";
import { safeAction } from "@/lib/safe-action";
import {
  createCourseSchema,
  idSchema,
  setCourseMajorsSchema,
  updateCourseSchema,
  type CourseMajorInput,
} from "./schemas";

function revalidateCourses(id?: string) {
  revalidatePath("/courses");
  if (id) revalidatePath(`/courses/${id}`);
  revalidatePath("/offerings");
  revalidatePath("/dashboard");
}

const orNull = (s: string | undefined | null) => (s ? s : null);

function conflict(field: string, msg: string): AppError {
  return new AppError("CONFLICT", msg, { [field]: [msg] });
}

async function assertCodeFree(t: TenantTx, code: string, exceptId?: string) {
  const dup = await t.course.findFirst({
    where: { code, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (dup) throw conflict("code", "رمز المقرر مستخدم مسبقًا");
}

async function assertDepartment(t: TenantTx, departmentId: string | null | undefined) {
  if (!departmentId) return;
  const dep = await t.department.findFirst({ where: { id: departmentId }, select: { id: true } });
  if (!dep) throw conflict("departmentId", "القسم غير موجود");
}

/** Validate every (major, level) pair: major exists, level (if any) belongs to that major. */
async function validateMajors(
  t: TenantTx,
  rows: Array<Required<Pick<CourseMajorInput, "majorId">> & { levelId?: string | null; isRequired: boolean }>,
) {
  if (!rows.length) return;
  const majorIds = rows.map((r) => r.majorId);
  const majors = await t.major.findMany({ where: { id: { in: majorIds } }, select: { id: true } });
  if (majors.length !== new Set(majorIds).size) throw conflict("majors", "تخصص غير موجود");
  const levelIds = rows.map((r) => r.levelId).filter((x): x is string => !!x);
  if (!levelIds.length) return;
  const levels = await t.level.findMany({
    where: { id: { in: levelIds } },
    select: { id: true, majorId: true },
  });
  const byId = new Map(levels.map((l) => [l.id, l.majorId]));
  for (const [i, r] of rows.entries()) {
    if (!r.levelId) continue;
    const owner = byId.get(r.levelId);
    if (!owner)
      throw new AppError("CONFLICT", "المستوى غير موجود", { [`majors.${i}.levelId`]: ["المستوى غير موجود"] });
    if (owner !== r.majorId)
      throw new AppError("CONFLICT", "المستوى لا يتبع هذا التخصص", {
        [`majors.${i}.levelId`]: ["المستوى لا يتبع هذا التخصص"],
      });
  }
}

/** Replace the mapping set inside `t` (delete-then-create keeps the compound PK simple and the audit diff readable). */
async function replaceMajors(
  t: TenantTx,
  ctx: Ctx,
  courseId: string,
  rows: Array<{ majorId: string; levelId?: string | null; isRequired: boolean }>,
) {
  await t.courseMajor.deleteMany({ where: { courseId } });
  if (rows.length)
    await t.courseMajor.createMany({
      data: rows.map((r) => ({
        tenantId: ctx.tenantId,
        courseId,
        majorId: r.majorId,
        levelId: r.levelId ?? null,
        isRequired: r.isRequired,
      })),
    });
}

const courseSelect = {
  id: true,
  code: true,
  name: true,
  nameEn: true,
  description: true,
  departmentId: true,
  creditHours: true,
  isActive: true,
  deletedAt: true,
} as const;

export async function createCourseAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "course.create");
      const data = createCourseSchema.parse(input);
      const created = await tx(ctx.tenantId, async (t) => {
        await assertCodeFree(t, data.code);
        await assertDepartment(t, data.departmentId);
        await validateMajors(t, data.majors);
        const c = await t.course.create({
          data: {
            tenantId: ctx.tenantId,
            code: data.code,
            name: data.name,
            nameEn: orNull(data.nameEn),
            description: orNull(data.description),
            departmentId: data.departmentId ?? null,
            creditHours: data.creditHours,
            isActive: data.isActive,
          },
          select: courseSelect,
        });
        await replaceMajors(t, ctx, c.id, data.majors);
        await audit(
          ctx,
          { action: "course.create", entity: "Course", entityId: c.id, after: { ...c, majors: data.majors } },
          t,
        );
        return c;
      });
      revalidateCourses();
      return { id: created.id };
    },
    { action: "course.create" },
  );
}

export async function updateCourseAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "course.edit");
      const data = updateCourseSchema.parse(input);
      await tx(ctx.tenantId, async (t) => {
        const before = await t.course.findFirst({
          where: { id: data.id, deletedAt: null },
          select: { ...courseSelect, majors: { select: { majorId: true, levelId: true, isRequired: true } } },
        });
        if (!before) throw new AppError("NOT_FOUND", "المقرر غير موجود");
        await assertCodeFree(t, data.code, data.id);
        await assertDepartment(t, data.departmentId);
        await validateMajors(t, data.majors);
        const after = await t.course.update({
          where: { id: data.id },
          data: {
            code: data.code,
            name: data.name,
            nameEn: orNull(data.nameEn),
            description: orNull(data.description),
            departmentId: data.departmentId ?? null,
            creditHours: data.creditHours,
            isActive: data.isActive,
          },
          select: courseSelect,
        });
        await replaceMajors(t, ctx, data.id, data.majors);
        await audit(
          ctx,
          {
            action: "course.update",
            entity: "Course",
            entityId: data.id,
            before,
            after: { ...after, majors: data.majors },
          },
          t,
        );
      });
      revalidateCourses(data.id);
      return { id: data.id };
    },
    { action: "course.update" },
  );
}

/** Replace only the major/level mapping (FR-CRS-002). */
export async function setCourseMajorsAction(input: unknown): Promise<Result<{ id: string; count: number }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "course.edit");
      const data = setCourseMajorsSchema.parse(input);
      await tx(ctx.tenantId, async (t) => {
        const course = await t.course.findFirst({
          where: { id: data.id, deletedAt: null },
          select: { id: true, majors: { select: { majorId: true, levelId: true, isRequired: true } } },
        });
        if (!course) throw new AppError("NOT_FOUND", "المقرر غير موجود");
        await validateMajors(t, data.majors);
        await replaceMajors(t, ctx, data.id, data.majors);
        await audit(
          ctx,
          {
            action: "course.set_majors",
            entity: "Course",
            entityId: data.id,
            before: course.majors,
            after: data.majors,
          },
          t,
        );
      });
      revalidateCourses(data.id);
      return { id: data.id, count: data.majors.length };
    },
    { action: "course.set_majors" },
  );
}

/** Soft delete. Refused while non-archived sections exist (archive or delete them first). */
export async function deleteCourseAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "course.delete");
      const { id } = idSchema.parse(input);
      await tx(ctx.tenantId, async (t) => {
        const course = await t.course.findFirst({
          where: { id, deletedAt: null },
          select: {
            ...courseSelect,
            _count: { select: { offerings: { where: { deletedAt: null, status: { not: "ARCHIVED" } } } } },
          },
        });
        if (!course) throw new AppError("NOT_FOUND", "المقرر غير موجود");
        if (course._count.offerings > 0)
          throw new AppError(
            "CONFLICT",
            `لا يمكن الحذف: للمقرر ${course._count.offerings} شعبة غير مؤرشفة. أرشف الشُعب أو احذفها أولًا`,
          );
        await t.course.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
        await audit(ctx, { action: "course.delete", entity: "Course", entityId: id, before: course }, t);
      });
      revalidateCourses(id);
      return { id };
    },
    { action: "course.delete" },
  );
}

export async function restoreCourseAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "course.delete");
      const { id } = idSchema.parse(input);
      await tx(ctx.tenantId, async (t) => {
        const course = await t.course.findFirst({
          where: { id, deletedAt: { not: null } },
          select: courseSelect,
        });
        if (!course) throw new AppError("NOT_FOUND", "المقرر غير موجود");
        await assertCodeFree(t, course.code, id);
        await t.course.update({ where: { id }, data: { deletedAt: null } });
        await audit(ctx, { action: "course.restore", entity: "Course", entityId: id, before: course }, t);
      });
      revalidateCourses(id);
      return { id };
    },
    { action: "course.restore" },
  );
}
