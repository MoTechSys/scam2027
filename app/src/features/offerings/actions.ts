"use server";

/**
 * Course offerings (sections) — Server Actions (FR-OFF-001, FR-CRS-003). Every action:
 *  requireUserOrThrow → assertPermission (+ scope for own-scope instructors) → tx(tenantId) → audit → revalidate.
 *
 * Invariants
 *  - (course, semester, section) unique per tenant (checked in-tx → fieldError; DB unique index is the final guard).
 *  - Status follows OFFERING_TRANSITIONS; OPEN → DRAFT only while no enrolments exist.
 *  - At most one PRIMARY instructor; assignees must be active users (any role — a department head may teach).
 *  - Delete is soft and refused while ACTIVE enrolments exist.
 */
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { assertPermission, requireUserOrThrow, type Ctx } from "@/lib/auth/rbac";
import { tx, type TenantTx } from "@/lib/db/tenant";
import { AppError, type Result } from "@/lib/result";
import { safeAction } from "@/lib/safe-action";
import { assertOfferingScope } from "./scope";
import {
  canTransition,
  createOfferingSchema,
  idSchema,
  setInstructorsSchema,
  setOfferingStatusSchema,
  updateOfferingSchema,
  type InstructorRole,
} from "./schemas";

function revalidateOfferings(id?: string, courseId?: string) {
  revalidatePath("/offerings");
  if (id) revalidatePath(`/offerings/${id}`);
  if (courseId) revalidatePath(`/courses/${courseId}`);
  revalidatePath("/courses");
  revalidatePath("/dashboard");
}

const orNull = (s: string | undefined | null) => (s ? s : null);

function conflict(field: string, msg: string): AppError {
  return new AppError("CONFLICT", msg, { [field]: [msg] });
}

const offeringSelect = {
  id: true,
  courseId: true,
  semesterId: true,
  section: true,
  status: true,
  capacity: true,
  location: true,
  schedule: true,
  deletedAt: true,
} as const;

async function assertSectionFree(
  t: TenantTx,
  courseId: string,
  semesterId: string,
  section: string,
  exceptId?: string,
) {
  const dup = await t.courseOffering.findFirst({
    where: { courseId, semesterId, section, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (dup) throw conflict("section", "هذه الشعبة موجودة مسبقًا لنفس المقرر والفصل");
}

async function assertInstructors(t: TenantTx, rows: { userId: string; role: InstructorRole }[]) {
  if (!rows.length) return;
  const ids = rows.map((r) => r.userId);
  const users = await t.user.findMany({
    where: { id: { in: ids }, deletedAt: null, status: "ACTIVE" },
    select: { id: true },
  });
  if (users.length !== new Set(ids).size) throw conflict("instructors", "مستخدم غير موجود أو غير نشط");
}

async function replaceInstructors(
  t: TenantTx,
  ctx: Ctx,
  offeringId: string,
  rows: { userId: string; role: InstructorRole }[],
) {
  await t.offeringInstructor.deleteMany({ where: { offeringId } });
  if (rows.length)
    await t.offeringInstructor.createMany({
      data: rows.map((r) => ({ tenantId: ctx.tenantId, offeringId, userId: r.userId, role: r.role })),
    });
}

export async function createOfferingAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "offering.create");
      const data = createOfferingSchema.parse(input);
      if (data.instructors.length) assertPermission(ctx, "offering.assign_instructor");
      const created = await tx(ctx.tenantId, async (t) => {
        const [course, semester] = await Promise.all([
          t.course.findFirst({ where: { id: data.courseId, deletedAt: null }, select: { id: true } }),
          t.semester.findFirst({ where: { id: data.semesterId }, select: { id: true, status: true } }),
        ]);
        if (!course) throw conflict("courseId", "المقرر غير موجود");
        if (!semester) throw conflict("semesterId", "الفصل غير موجود");
        if (semester.status === "ARCHIVED") throw conflict("semesterId", "لا يمكن إنشاء شُعب في فصل مؤرشف");
        await assertSectionFree(t, data.courseId, data.semesterId, data.section);
        await assertInstructors(t, data.instructors);
        const o = await t.courseOffering.create({
          data: {
            tenantId: ctx.tenantId,
            courseId: data.courseId,
            semesterId: data.semesterId,
            section: data.section,
            status: data.status,
            capacity: data.capacity ?? null,
            location: orNull(data.location),
            schedule: data.schedule as Prisma.InputJsonValue,
          },
          select: offeringSelect,
        });
        await replaceInstructors(t, ctx, o.id, data.instructors);
        await audit(
          ctx,
          {
            action: "offering.create",
            entity: "CourseOffering",
            entityId: o.id,
            after: { ...o, instructors: data.instructors },
          },
          t,
        );
        return o;
      });
      revalidateOfferings(created.id, created.courseId);
      return { id: created.id };
    },
    { action: "offering.create" },
  );
}

/** Section/capacity/location/schedule. Own-scope instructors (`offering.edit` ◐) may edit only sections they teach. */
export async function updateOfferingAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "offering.edit");
      const data = updateOfferingSchema.parse(input);
      const courseId = await tx(ctx.tenantId, async (t) => {
        await assertOfferingScope(ctx, data.id, "teaching", t);
        const before = await t.courseOffering.findFirst({
          where: { id: data.id, deletedAt: null },
          select: offeringSelect,
        });
        if (!before) throw new AppError("NOT_FOUND", "الشعبة غير موجودة");
        if (before.status === "ARCHIVED") throw new AppError("CONFLICT", "لا يمكن تعديل شعبة مؤرشفة");
        await assertSectionFree(t, before.courseId, before.semesterId, data.section, data.id);
        if (data.capacity !== null && data.capacity !== undefined) {
          const active = await t.enrollment.count({ where: { offeringId: data.id, status: "ACTIVE" } });
          if (active > data.capacity)
            throw conflict("capacity", `السعة أقل من عدد المسجّلين حاليًا (${active})`);
        }
        const after = await t.courseOffering.update({
          where: { id: data.id },
          data: {
            section: data.section,
            capacity: data.capacity ?? null,
            location: orNull(data.location),
            schedule: data.schedule as Prisma.InputJsonValue,
          },
          select: offeringSelect,
        });
        await audit(
          ctx,
          { action: "offering.update", entity: "CourseOffering", entityId: data.id, before, after },
          t,
        );
        return before.courseId;
      });
      revalidateOfferings(data.id, courseId);
      return { id: data.id };
    },
    { action: "offering.update" },
  );
}

export async function setOfferingStatusAction(
  input: unknown,
): Promise<Result<{ id: string; status: string }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "offering.edit");
      const data = setOfferingStatusSchema.parse(input);
      const courseId = await tx(ctx.tenantId, async (t) => {
        await assertOfferingScope(ctx, data.id, "teaching", t);
        const o = await t.courseOffering.findFirst({
          where: { id: data.id, deletedAt: null },
          select: { id: true, courseId: true, status: true, _count: { select: { enrollments: true } } },
        });
        if (!o) throw new AppError("NOT_FOUND", "الشعبة غير موجودة");
        if (o.status === data.status) return o.courseId;
        if (!canTransition(o.status, data.status))
          throw conflict("status", `لا يمكن الانتقال من ${o.status} إلى ${data.status}`);
        if (data.status === "DRAFT" && o._count.enrollments > 0)
          throw conflict("status", "لا يمكن إعادة الشعبة إلى مسودة بعد وجود تسجيلات");
        await t.courseOffering.update({ where: { id: data.id }, data: { status: data.status } });
        await audit(
          ctx,
          {
            action: "offering.set_status",
            entity: "CourseOffering",
            entityId: data.id,
            before: { status: o.status },
            after: { status: data.status },
          },
          t,
        );
        return o.courseId;
      });
      revalidateOfferings(data.id, courseId);
      return { id: data.id, status: data.status };
    },
    { action: "offering.set_status" },
  );
}

/** Replace the instructor set (FR-CRS-003). */
export async function setInstructorsAction(input: unknown): Promise<Result<{ id: string; count: number }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "offering.assign_instructor");
      const data = setInstructorsSchema.parse(input);
      const courseId = await tx(ctx.tenantId, async (t) => {
        const o = await t.courseOffering.findFirst({
          where: { id: data.id, deletedAt: null },
          select: {
            id: true,
            courseId: true,
            status: true,
            instructors: { select: { userId: true, role: true } },
          },
        });
        if (!o) throw new AppError("NOT_FOUND", "الشعبة غير موجودة");
        if (o.status === "ARCHIVED") throw new AppError("CONFLICT", "لا يمكن تعديل شعبة مؤرشفة");
        await assertInstructors(t, data.instructors);
        await replaceInstructors(t, ctx, data.id, data.instructors);
        await audit(
          ctx,
          {
            action: "offering.set_instructors",
            entity: "CourseOffering",
            entityId: data.id,
            before: o.instructors,
            after: data.instructors,
          },
          t,
        );
        return o.courseId;
      });
      revalidateOfferings(data.id, courseId);
      return { id: data.id, count: data.instructors.length };
    },
    { action: "offering.set_instructors" },
  );
}

/** Soft delete. Refused while ACTIVE enrolments exist (withdraw them or archive the section instead). */
export async function deleteOfferingAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "offering.delete");
      const { id } = idSchema.parse(input);
      const courseId = await tx(ctx.tenantId, async (t) => {
        const o = await t.courseOffering.findFirst({
          where: { id, deletedAt: null },
          select: { ...offeringSelect, _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } },
        });
        if (!o) throw new AppError("NOT_FOUND", "الشعبة غير موجودة");
        if (o._count.enrollments > 0)
          throw new AppError(
            "CONFLICT",
            `لا يمكن الحذف: الشعبة تحوي ${o._count.enrollments} تسجيلًا نشطًا. أرشفها أو اسحب التسجيلات أولًا`,
          );
        await t.courseOffering.update({ where: { id }, data: { deletedAt: new Date() } });
        await audit(ctx, { action: "offering.delete", entity: "CourseOffering", entityId: id, before: o }, t);
        return o.courseId;
      });
      revalidateOfferings(id, courseId);
      return { id };
    },
    { action: "offering.delete" },
  );
}
