"use server";

/**
 * Academic structure — Server Actions (FR-ACD-001..006). Every action:
 *  requireUserOrThrow → assertPermission → tx(tenantId) → audit → revalidate.
 *
 * Invariants
 *  - One current year and one current semester per tenant (partial unique indexes; `setCurrent*` flips atomically).
 *  - Structural parents are `Restrict` in SQL (College→Department, Department→Major, Year→Semester); actions translate
 *    that into a CONFLICT with the dependent count instead of a raw FK error.
 *  - Codes are unique per tenant (per parent for Level.number). Checked in-tx for friendly fieldErrors; the DB unique
 *    index remains the final guard.
 *  - Levels belong to a Major (each programme owns its ladder) — ADR-0006 / 02-DATA-MODEL.md.
 */
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { assertPermission, requireUserOrThrow, type Ctx } from "@/lib/auth/rbac";
import { tx, type TenantTx } from "@/lib/db/tenant";
import { AppError, type Result } from "@/lib/result";
import { safeAction } from "@/lib/safe-action";
import {
  createCollegeSchema, createDepartmentSchema, createLevelSchema, createMajorSchema, createSemesterSchema, createYearSchema,
  generateLevelsSchema, idSchema, levelName, setupWizardSchema,
  updateCollegeSchema, updateDepartmentSchema, updateLevelSchema, updateMajorSchema, updateSemesterSchema, updateYearSchema,
} from "./schemas";

function revalidateAcademic() {
  revalidatePath("/academic", "layout");
  revalidatePath("/dashboard");
}

const orNull = (s: string | undefined) => (s ? s : null);

function conflict(field: string, msg: string): AppError {
  return new AppError("CONFLICT", msg, { [field]: [msg] });
}

async function dependentsGuard(count: number, what: string): Promise<void> {
  if (count > 0) throw new AppError("CONFLICT", `لا يمكن الحذف: مرتبط بـ ${count} ${what}. احذف أو انقل التابعين أولًا، أو عطّل العنصر بدل حذفه`);
}

/* ═══════════════ Academic years ═══════════════ */

async function assertYearCodeFree(t: TenantTx, code: string, exceptId?: string) {
  const dup = await t.academicYear.findFirst({ where: { code, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  if (dup) throw conflict("code", "رمز السنة مستخدم مسبقًا");
}

/** Clear the current flag on every other year/semester inside `t` (must run before setting the new one). */
async function clearCurrentYear(t: TenantTx, exceptId?: string) {
  await t.academicYear.updateMany({ where: { isCurrent: true, ...(exceptId ? { id: { not: exceptId } } : {}) }, data: { isCurrent: false } });
}
async function clearCurrentSemester(t: TenantTx, exceptId?: string) {
  await t.semester.updateMany({ where: { isCurrent: true, ...(exceptId ? { id: { not: exceptId } } : {}) }, data: { isCurrent: false } });
}

export async function createYearAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "semester.manage");
    const data = createYearSchema.parse(input);
    const created = await tx(ctx.tenantId, async (t) => {
      await assertYearCodeFree(t, data.code);
      if (data.isCurrent) await clearCurrentYear(t);
      const y = await t.academicYear.create({
        data: { tenantId: ctx.tenantId, code: data.code, name: data.name, startDate: data.startDate, endDate: data.endDate, isCurrent: data.isCurrent },
        select: { id: true, code: true, name: true, startDate: true, endDate: true, isCurrent: true },
      });
      await audit(ctx, { action: "academic_year.create", entity: "AcademicYear", entityId: y.id, after: y }, t);
      return y;
    });
    revalidateAcademic();
    return { id: created.id };
  }, { action: "academic_year.create" });
}

export async function updateYearAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "semester.manage");
    const data = updateYearSchema.parse(input);
    await tx(ctx.tenantId, async (t) => {
      const before = await t.academicYear.findFirst({ where: { id: data.id }, select: { code: true, name: true, startDate: true, endDate: true } });
      if (!before) throw new AppError("NOT_FOUND", "السنة غير موجودة");
      await assertYearCodeFree(t, data.code, data.id);
      const after = { code: data.code, name: data.name, startDate: data.startDate, endDate: data.endDate };
      await t.academicYear.update({ where: { id: data.id }, data: after });
      await audit(ctx, { action: "academic_year.update", entity: "AcademicYear", entityId: data.id, before, after }, t);
    });
    revalidateAcademic();
    return { id: data.id };
  }, { action: "academic_year.update" });
}

export async function setCurrentYearAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "semester.set_current");
    const { id } = idSchema.parse(input);
    await tx(ctx.tenantId, async (t) => {
      const y = await t.academicYear.findFirst({ where: { id }, select: { id: true, code: true, isCurrent: true } });
      if (!y) throw new AppError("NOT_FOUND", "السنة غير موجودة");
      if (y.isCurrent) return;
      const prev = await t.academicYear.findFirst({ where: { isCurrent: true }, select: { id: true, code: true } });
      await clearCurrentYear(t, id);
      await t.academicYear.update({ where: { id }, data: { isCurrent: true } });
      await audit(ctx, { action: "academic_year.set_current", entity: "AcademicYear", entityId: id, before: prev, after: { id, code: y.code } }, t);
    });
    revalidateAcademic();
    return { id };
  }, { action: "academic_year.set_current" });
}

export async function deleteYearAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "semester.manage");
    const { id } = idSchema.parse(input);
    await tx(ctx.tenantId, async (t) => {
      const y = await t.academicYear.findFirst({ where: { id }, select: { code: true, name: true, _count: { select: { semesters: true } } } });
      if (!y) throw new AppError("NOT_FOUND", "السنة غير موجودة");
      await dependentsGuard(y._count.semesters, "فصل دراسي");
      await t.academicYear.delete({ where: { id } });
      await audit(ctx, { action: "academic_year.delete", entity: "AcademicYear", entityId: id, before: { code: y.code, name: y.name } }, t);
    });
    revalidateAcademic();
    return { id };
  }, { action: "academic_year.delete" });
}

/* ═══════════════ Semesters ═══════════════ */

export async function createSemesterAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "semester.manage");
    const data = createSemesterSchema.parse(input);
    const created = await tx(ctx.tenantId, async (t) => {
      const year = await t.academicYear.findFirst({ where: { id: data.academicYearId }, select: { id: true, startDate: true, endDate: true } });
      if (!year) throw new AppError("NOT_FOUND", "السنة الأكاديمية غير موجودة", { academicYearId: ["السنة غير موجودة"] });
      const dup = await t.semester.findFirst({ where: { academicYearId: year.id, term: data.term }, select: { id: true } });
      if (dup) throw conflict("term", "هذا الفصل موجود مسبقًا في السنة المحددة");
      if (data.isCurrent) await clearCurrentSemester(t);
      const s = await t.semester.create({
        data: {
          tenantId: ctx.tenantId, academicYearId: year.id, term: data.term, name: data.name, startDate: data.startDate, endDate: data.endDate,
          registrationOpensAt: data.registrationOpensAt ?? null, registrationClosesAt: data.registrationClosesAt ?? null, status: data.status, isCurrent: data.isCurrent,
        },
        select: { id: true, name: true, term: true, status: true, isCurrent: true, startDate: true, endDate: true },
      });
      await audit(ctx, { action: "semester.create", entity: "Semester", entityId: s.id, after: { ...s, academicYearId: year.id } }, t);
      return s;
    });
    revalidateAcademic();
    return { id: created.id };
  }, { action: "semester.create" });
}

export async function updateSemesterAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "semester.manage");
    const data = updateSemesterSchema.parse(input);
    await tx(ctx.tenantId, async (t) => {
      const before = await t.semester.findFirst({
        where: { id: data.id },
        select: { academicYearId: true, term: true, name: true, startDate: true, endDate: true, registrationOpensAt: true, registrationClosesAt: true, status: true },
      });
      if (!before) throw new AppError("NOT_FOUND", "الفصل غير موجود");
      if (before.term !== data.term) {
        const dup = await t.semester.findFirst({ where: { academicYearId: before.academicYearId, term: data.term, id: { not: data.id } }, select: { id: true } });
        if (dup) throw conflict("term", "هذا الفصل موجود مسبقًا في السنة المحددة");
      }
      const after = {
        term: data.term, name: data.name, startDate: data.startDate, endDate: data.endDate,
        registrationOpensAt: data.registrationOpensAt ?? null, registrationClosesAt: data.registrationClosesAt ?? null, status: data.status,
      };
      await t.semester.update({ where: { id: data.id }, data: after });
      await audit(ctx, { action: "semester.update", entity: "Semester", entityId: data.id, before, after }, t);
    });
    revalidateAcademic();
    return { id: data.id };
  }, { action: "semester.update" });
}

/** Sets the current semester and — for coherence — its year as the current year (FR-ACD-003, GAP-05). */
export async function setCurrentSemesterAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "semester.set_current");
    const { id } = idSchema.parse(input);
    await tx(ctx.tenantId, async (t) => {
      const s = await t.semester.findFirst({ where: { id }, select: { id: true, name: true, academicYearId: true, isCurrent: true } });
      if (!s) throw new AppError("NOT_FOUND", "الفصل غير موجود");
      const prev = await t.semester.findFirst({ where: { isCurrent: true }, select: { id: true, name: true } });
      await clearCurrentSemester(t, id);
      await clearCurrentYear(t, s.academicYearId);
      await t.semester.update({ where: { id }, data: { isCurrent: true, status: "ACTIVE" } });
      await t.academicYear.update({ where: { id: s.academicYearId }, data: { isCurrent: true } });
      await audit(ctx, { action: "semester.set_current", entity: "Semester", entityId: id, before: prev, after: { id, name: s.name, academicYearId: s.academicYearId } }, t);
    });
    revalidateAcademic();
    return { id };
  }, { action: "semester.set_current" });
}

export async function deleteSemesterAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "semester.manage");
    const { id } = idSchema.parse(input);
    await tx(ctx.tenantId, async (t) => {
      const s = await t.semester.findFirst({ where: { id }, select: { name: true, term: true, isCurrent: true, _count: { select: { offerings: true } } } });
      if (!s) throw new AppError("NOT_FOUND", "الفصل غير موجود");
      if (s.isCurrent) throw new AppError("CONFLICT", "لا يمكن حذف الفصل الحالي؛ عيّن فصلًا آخر أولًا");
      await dependentsGuard(s._count.offerings, "شعبة");
      await t.semester.delete({ where: { id } });
      await audit(ctx, { action: "semester.delete", entity: "Semester", entityId: id, before: { name: s.name, term: s.term } }, t);
    });
    revalidateAcademic();
    return { id };
  }, { action: "semester.delete" });
}

/* ═══════════════ Colleges ═══════════════ */

export async function createCollegeAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "college.manage");
    const d = createCollegeSchema.parse(input);
    const created = await tx(ctx.tenantId, async (t) => {
      if (await t.college.findFirst({ where: { code: d.code }, select: { id: true } })) throw conflict("code", "رمز الكلية مستخدم مسبقًا");
      const c = await t.college.create({
        data: { tenantId: ctx.tenantId, code: d.code, name: d.name, nameEn: orNull(d.nameEn), description: orNull(d.description), sortOrder: d.sortOrder, isActive: d.isActive },
        select: { id: true, code: true, name: true },
      });
      await audit(ctx, { action: "college.create", entity: "College", entityId: c.id, after: c }, t);
      return c;
    });
    revalidateAcademic();
    return { id: created.id };
  }, { action: "college.create" });
}

export async function updateCollegeAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "college.manage");
    const d = updateCollegeSchema.parse(input);
    await tx(ctx.tenantId, async (t) => {
      const before = await t.college.findFirst({ where: { id: d.id }, select: { code: true, name: true, nameEn: true, description: true, sortOrder: true, isActive: true } });
      if (!before) throw new AppError("NOT_FOUND", "الكلية غير موجودة");
      if (await t.college.findFirst({ where: { code: d.code, id: { not: d.id } }, select: { id: true } })) throw conflict("code", "رمز الكلية مستخدم مسبقًا");
      const after = { code: d.code, name: d.name, nameEn: orNull(d.nameEn), description: orNull(d.description), sortOrder: d.sortOrder, isActive: d.isActive };
      await t.college.update({ where: { id: d.id }, data: after });
      await audit(ctx, { action: "college.update", entity: "College", entityId: d.id, before, after }, t);
    });
    revalidateAcademic();
    return { id: d.id };
  }, { action: "college.update" });
}

export async function deleteCollegeAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "college.manage");
    const { id } = idSchema.parse(input);
    await tx(ctx.tenantId, async (t) => {
      const c = await t.college.findFirst({ where: { id }, select: { code: true, name: true, _count: { select: { departments: true } } } });
      if (!c) throw new AppError("NOT_FOUND", "الكلية غير موجودة");
      await dependentsGuard(c._count.departments, "قسم");
      await t.college.delete({ where: { id } });
      await audit(ctx, { action: "college.delete", entity: "College", entityId: id, before: { code: c.code, name: c.name } }, t);
    });
    revalidateAcademic();
    return { id };
  }, { action: "college.delete" });
}

/* ═══════════════ Departments ═══════════════ */

export async function createDepartmentAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "department.manage");
    const d = createDepartmentSchema.parse(input);
    const created = await tx(ctx.tenantId, async (t) => {
      if (!(await t.college.findFirst({ where: { id: d.collegeId }, select: { id: true } }))) throw new AppError("NOT_FOUND", "الكلية غير موجودة", { collegeId: ["الكلية غير موجودة"] });
      if (await t.department.findFirst({ where: { code: d.code }, select: { id: true } })) throw conflict("code", "رمز القسم مستخدم مسبقًا");
      const dep = await t.department.create({
        data: { tenantId: ctx.tenantId, collegeId: d.collegeId, code: d.code, name: d.name, nameEn: orNull(d.nameEn), description: orNull(d.description), sortOrder: d.sortOrder, isActive: d.isActive },
        select: { id: true, code: true, name: true, collegeId: true },
      });
      await audit(ctx, { action: "department.create", entity: "Department", entityId: dep.id, after: dep }, t);
      return dep;
    });
    revalidateAcademic();
    return { id: created.id };
  }, { action: "department.create" });
}

export async function updateDepartmentAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "department.manage");
    const d = updateDepartmentSchema.parse(input);
    await tx(ctx.tenantId, async (t) => {
      const before = await t.department.findFirst({ where: { id: d.id }, select: { collegeId: true, code: true, name: true, nameEn: true, description: true, sortOrder: true, isActive: true } });
      if (!before) throw new AppError("NOT_FOUND", "القسم غير موجود");
      if (!(await t.college.findFirst({ where: { id: d.collegeId }, select: { id: true } }))) throw new AppError("NOT_FOUND", "الكلية غير موجودة", { collegeId: ["الكلية غير موجودة"] });
      if (await t.department.findFirst({ where: { code: d.code, id: { not: d.id } }, select: { id: true } })) throw conflict("code", "رمز القسم مستخدم مسبقًا");
      const after = { collegeId: d.collegeId, code: d.code, name: d.name, nameEn: orNull(d.nameEn), description: orNull(d.description), sortOrder: d.sortOrder, isActive: d.isActive };
      await t.department.update({ where: { id: d.id }, data: after });
      await audit(ctx, { action: "department.update", entity: "Department", entityId: d.id, before, after }, t);
    });
    revalidateAcademic();
    return { id: d.id };
  }, { action: "department.update" });
}

export async function deleteDepartmentAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "department.manage");
    const { id } = idSchema.parse(input);
    await tx(ctx.tenantId, async (t) => {
      const dep = await t.department.findFirst({ where: { id }, select: { code: true, name: true, _count: { select: { majors: true, courses: true } } } });
      if (!dep) throw new AppError("NOT_FOUND", "القسم غير موجود");
      await dependentsGuard(dep._count.majors, "تخصص");
      await dependentsGuard(dep._count.courses, "مقرر");
      await t.department.delete({ where: { id } });
      await audit(ctx, { action: "department.delete", entity: "Department", entityId: id, before: { code: dep.code, name: dep.name } }, t);
    });
    revalidateAcademic();
    return { id };
  }, { action: "department.delete" });
}

/* ═══════════════ Majors ═══════════════ */

export async function createMajorAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "major.manage");
    const d = createMajorSchema.parse(input);
    const created = await tx(ctx.tenantId, async (t) => {
      if (!(await t.department.findFirst({ where: { id: d.departmentId }, select: { id: true } }))) throw new AppError("NOT_FOUND", "القسم غير موجود", { departmentId: ["القسم غير موجود"] });
      if (await t.major.findFirst({ where: { code: d.code }, select: { id: true } })) throw conflict("code", "رمز التخصص مستخدم مسبقًا");
      const m = await t.major.create({
        data: {
          tenantId: ctx.tenantId, departmentId: d.departmentId, code: d.code, name: d.name, nameEn: orNull(d.nameEn), description: orNull(d.description),
          degree: d.degree, durationYears: d.durationYears ?? null, sortOrder: d.sortOrder, isActive: d.isActive,
        },
        select: { id: true, code: true, name: true, departmentId: true, degree: true },
      });
      await audit(ctx, { action: "major.create", entity: "Major", entityId: m.id, after: m }, t);
      return m;
    });
    revalidateAcademic();
    return { id: created.id };
  }, { action: "major.create" });
}

export async function updateMajorAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "major.manage");
    const d = updateMajorSchema.parse(input);
    await tx(ctx.tenantId, async (t) => {
      const before = await t.major.findFirst({
        where: { id: d.id },
        select: { departmentId: true, code: true, name: true, nameEn: true, description: true, degree: true, durationYears: true, sortOrder: true, isActive: true },
      });
      if (!before) throw new AppError("NOT_FOUND", "التخصص غير موجود");
      if (!(await t.department.findFirst({ where: { id: d.departmentId }, select: { id: true } }))) throw new AppError("NOT_FOUND", "القسم غير موجود", { departmentId: ["القسم غير موجود"] });
      if (await t.major.findFirst({ where: { code: d.code, id: { not: d.id } }, select: { id: true } })) throw conflict("code", "رمز التخصص مستخدم مسبقًا");
      const after = {
        departmentId: d.departmentId, code: d.code, name: d.name, nameEn: orNull(d.nameEn), description: orNull(d.description),
        degree: d.degree, durationYears: d.durationYears ?? null, sortOrder: d.sortOrder, isActive: d.isActive,
      };
      await t.major.update({ where: { id: d.id }, data: after });
      await audit(ctx, { action: "major.update", entity: "Major", entityId: d.id, before, after }, t);
    });
    revalidateAcademic();
    return { id: d.id };
  }, { action: "major.update" });
}

/** Deleting a major cascades its levels (SQL). Refuse while any course is mapped to it. */
export async function deleteMajorAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "major.manage");
    const { id } = idSchema.parse(input);
    await tx(ctx.tenantId, async (t) => {
      const m = await t.major.findFirst({ where: { id }, select: { code: true, name: true, _count: { select: { courses: true, levels: true } } } });
      if (!m) throw new AppError("NOT_FOUND", "التخصص غير موجود");
      await dependentsGuard(m._count.courses, "مقرر مرتبط");
      await t.major.delete({ where: { id } });
      await audit(ctx, { action: "major.delete", entity: "Major", entityId: id, before: { code: m.code, name: m.name, levelsCascaded: m._count.levels } }, t);
    });
    revalidateAcademic();
    return { id };
  }, { action: "major.delete" });
}

/* ═══════════════ Levels ═══════════════ */

export async function createLevelAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "level.manage");
    const d = createLevelSchema.parse(input);
    const created = await tx(ctx.tenantId, async (t) => {
      if (!(await t.major.findFirst({ where: { id: d.majorId }, select: { id: true } }))) throw new AppError("NOT_FOUND", "التخصص غير موجود", { majorId: ["التخصص غير موجود"] });
      if (await t.level.findFirst({ where: { majorId: d.majorId, number: d.number }, select: { id: true } })) throw conflict("number", "هذا الرقم موجود مسبقًا في التخصص");
      const l = await t.level.create({
        data: { tenantId: ctx.tenantId, majorId: d.majorId, number: d.number, name: d.name, nameEn: orNull(d.nameEn), isActive: d.isActive },
        select: { id: true, majorId: true, number: true, name: true },
      });
      await audit(ctx, { action: "level.create", entity: "Level", entityId: l.id, after: l }, t);
      return l;
    });
    revalidateAcademic();
    return { id: created.id };
  }, { action: "level.create" });
}

export async function updateLevelAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "level.manage");
    const d = updateLevelSchema.parse(input);
    await tx(ctx.tenantId, async (t) => {
      const before = await t.level.findFirst({ where: { id: d.id }, select: { majorId: true, number: true, name: true, nameEn: true, isActive: true } });
      if (!before) throw new AppError("NOT_FOUND", "المستوى غير موجود");
      if (before.number !== d.number && (await t.level.findFirst({ where: { majorId: before.majorId, number: d.number, id: { not: d.id } }, select: { id: true } })))
        throw conflict("number", "هذا الرقم موجود مسبقًا في التخصص");
      const after = { number: d.number, name: d.name, nameEn: orNull(d.nameEn), isActive: d.isActive };
      await t.level.update({ where: { id: d.id }, data: after });
      await audit(ctx, { action: "level.update", entity: "Level", entityId: d.id, before, after }, t);
    });
    revalidateAcademic();
    return { id: d.id };
  }, { action: "level.update" });
}

export async function deleteLevelAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "level.manage");
    const { id } = idSchema.parse(input);
    await tx(ctx.tenantId, async (t) => {
      const l = await t.level.findFirst({ where: { id }, select: { number: true, name: true, _count: { select: { courses: true } } } });
      if (!l) throw new AppError("NOT_FOUND", "المستوى غير موجود");
      await dependentsGuard(l._count.courses, "مقرر مرتبط");
      await t.level.delete({ where: { id } });
      await audit(ctx, { action: "level.delete", entity: "Level", entityId: id, before: { number: l.number, name: l.name } }, t);
    });
    revalidateAcademic();
    return { id };
  }, { action: "level.delete" });
}

/** Create levels 1..count for a major, skipping numbers that already exist. Returns how many were created. */
export async function generateLevelsAction(input: unknown): Promise<Result<{ created: number }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    assertPermission(ctx, "level.manage");
    const d = generateLevelsSchema.parse(input);
    const created = await tx(ctx.tenantId, async (t) => generateLevels(ctx, t, d.majorId, d.count));
    revalidateAcademic();
    return { created };
  }, { action: "level.generate" });
}

async function generateLevels(ctx: Ctx, t: TenantTx, majorId: string, count: number): Promise<number> {
  if (!(await t.major.findFirst({ where: { id: majorId }, select: { id: true } }))) throw new AppError("NOT_FOUND", "التخصص غير موجود", { majorId: ["التخصص غير موجود"] });
  const existing = new Set((await t.level.findMany({ where: { majorId }, select: { number: true } })).map((l) => l.number));
  const rows = Array.from({ length: count }, (_, i) => i + 1)
    .filter((n) => !existing.has(n))
    .map((n) => ({ tenantId: ctx.tenantId, majorId, number: n, ...levelName(n) }));
  if (rows.length) await t.level.createMany({ data: rows });
  await audit(ctx, { action: "level.generate", entity: "Major", entityId: majorId, after: { count, created: rows.length } }, t);
  return rows.length;
}

/* ═══════════════ First-setup wizard ═══════════════ */

/**
 * Creates year + current semester + college + department + major + levels in ONE transaction (FR-ACD-005).
 * Only allowed while the tenant has no year and no college (`needsSetup`), so it can never clobber real data.
 * Requires all four structure permissions plus semester.manage.
 */
export async function setupWizardAction(input: unknown): Promise<Result<{ yearId: string; semesterId: string; collegeId: string; departmentId: string; majorId: string; levels: number }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    for (const p of ["semester.manage", "college.manage", "department.manage", "major.manage", "level.manage"] as const) assertPermission(ctx, p);
    const d = setupWizardSchema.parse(input);
    const out = await tx(ctx.tenantId, async (t) => {
      const [years, colleges] = await Promise.all([t.academicYear.count(), t.college.count()]);
      if (years > 0 || colleges > 0) throw new AppError("CONFLICT", "البنية الأكاديمية موجودة مسبقًا؛ استخدم صفحات الإدارة بدل معالج الإعداد");
      const year = await t.academicYear.create({
        data: { tenantId: ctx.tenantId, code: d.year.code, name: d.year.name, startDate: d.year.startDate, endDate: d.year.endDate, isCurrent: true },
        select: { id: true },
      });
      const sem = await t.semester.create({
        data: {
          tenantId: ctx.tenantId, academicYearId: year.id, term: d.semester.term, name: d.semester.name, startDate: d.semester.startDate, endDate: d.semester.endDate,
          registrationOpensAt: d.semester.registrationOpensAt ?? null, registrationClosesAt: d.semester.registrationClosesAt ?? null, status: "ACTIVE", isCurrent: true,
        },
        select: { id: true },
      });
      const college = await t.college.create({
        data: { tenantId: ctx.tenantId, code: d.college.code, name: d.college.name, nameEn: orNull(d.college.nameEn), description: orNull(d.college.description), sortOrder: 0, isActive: true },
        select: { id: true },
      });
      const dep = await t.department.create({
        data: { tenantId: ctx.tenantId, collegeId: college.id, code: d.department.code, name: d.department.name, nameEn: orNull(d.department.nameEn), description: orNull(d.department.description), sortOrder: 0, isActive: true },
        select: { id: true },
      });
      const major = await t.major.create({
        data: {
          tenantId: ctx.tenantId, departmentId: dep.id, code: d.major.code, name: d.major.name, nameEn: orNull(d.major.nameEn), description: orNull(d.major.description),
          degree: d.major.degree, durationYears: d.major.durationYears ?? null, sortOrder: 0, isActive: true,
        },
        select: { id: true },
      });
      const levels = await generateLevels(ctx, t, major.id, d.levelCount);
      const result = { yearId: year.id, semesterId: sem.id, collegeId: college.id, departmentId: dep.id, majorId: major.id, levels };
      await audit(ctx, { action: "academic.setup_wizard", entity: "Tenant", entityId: ctx.tenantId, after: result }, t);
      return result;
    });
    revalidateAcademic();
    return out;
  }, { action: "academic.setup_wizard" });
}
