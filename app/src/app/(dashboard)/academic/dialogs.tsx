"use client";

/**
 * Academic dialogs — one create/edit dialog per entity (year, semester, college, department, major, level) plus
 * "generate levels". All submit FormData → Server Action → Result; server fieldErrors are merged into the form.
 */
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createCollegeAction, createDepartmentAction, createLevelAction, createMajorAction, createSemesterAction, createYearAction, generateLevelsAction,
  updateCollegeAction, updateDepartmentAction, updateLevelAction, updateMajorAction, updateSemesterAction, updateYearAction,
} from "@/features/academic/actions";
import type { CollegeRow, DepartmentRow, LevelRow, MajorRow, Option, SemesterRow, YearRow } from "@/features/academic/queries";
import { DEGREE_TYPES, SEMESTER_STATUSES, SEMESTER_TERMS } from "@/features/academic/schemas";
import type { FieldErrors, Result } from "@/lib/result";
import { CheckField, DateField, FieldError, FormFooter, SelectField, TextAreaField, TextField, formValues } from "@/components/forms/fields";

type Base = { open: boolean; onOpenChange: (o: boolean) => void };

/** Shared submit plumbing: run action, merge fieldErrors, toast, close + refresh. */
function useSubmit(onOpenChange: (o: boolean) => void, successKey: string) {
  const t = useTranslations("academic.toast");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const run = (fn: () => Promise<Result<unknown>>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.message);
        return;
      }
      toast.success(t(successKey));
      setErrors({});
      onOpenChange(false);
      router.refresh();
    });
  const reset = () => setErrors({});
  return { pending, errors, run, reset };
}

function Shell({ open, onOpenChange, title, description, children, onReset, wide }: Base & { title: string; description?: string; children: React.ReactNode; onReset: () => void; wide?: boolean }) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onReset();
        onOpenChange(o);
      }}
    >
      <DialogContent className={`max-h-[92dvh] overflow-y-auto ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** Enum select (term / status / degree) — hidden input keeps FormData submission. */
function EnumSelect<T extends string>({ id, name, label, value, onChange, values, render, errors }: { id: string; name: string; label: string; value: T; onChange: (v: T) => void; values: readonly T[]; render: (v: T) => string; errors: FieldErrors }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <input type="hidden" name={name} value={value} />
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger id={id} className="min-h-11 w-full" aria-invalid={!!errors[name]}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map((v) => (
            <SelectItem key={v} value={v}>
              {render(v)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError errors={errors} name={name} />
    </div>
  );
}

/* ═══════════════ Year ═══════════════ */
export function YearDialog({ open, onOpenChange, year }: Base & { year: YearRow | null }) {
  const t = useTranslations("academic");
  const isEdit = !!year;
  const { pending, errors, run, reset } = useSubmit(onOpenChange, isEdit ? "updated" : "created");
  return (
    <Shell open={open} onOpenChange={onOpenChange} onReset={reset} title={t(isEdit ? "dialogs.year.edit" : "dialogs.year.create")} description={year?.code}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const v = formValues(new FormData(e.currentTarget), { bools: isEdit ? [] : ["isCurrent"] });
          run(() => (isEdit ? updateYearAction({ ...v, id: year.id }) : createYearAction(v)));
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="y-code" name="code" label={t("form.code")} errors={errors} dir="ltr" required defaultValue={year?.code ?? ""} placeholder="2026/2027" hint={t("form.codeHint")} className="font-mono" />
          <TextField id="y-name" name="name" label={t("form.name")} errors={errors} required defaultValue={year?.name ?? ""} />
          <DateField id="y-start" name="startDate" label={t("form.startDate")} errors={errors} required defaultValue={year?.startDate} />
          <DateField id="y-end" name="endDate" label={t("form.endDate")} errors={errors} required defaultValue={year?.endDate} />
        </div>
        {!isEdit && <CheckField id="y-current" name="isCurrent" label={t("form.isCurrent")} />}
        <FormFooter pending={pending} onCancel={() => onOpenChange(false)} />
      </form>
    </Shell>
  );
}

/* ═══════════════ Semester ═══════════════ */
export function SemesterDialog({ open, onOpenChange, semester, years, defaultYearId }: Base & { semester: SemesterRow | null; years: Option[]; defaultYearId?: string }) {
  const t = useTranslations("academic");
  const isEdit = !!semester;
  const { pending, errors, run, reset } = useSubmit(onOpenChange, isEdit ? "updated" : "created");
  const [yearId, setYearId] = useState(semester?.academicYearId ?? defaultYearId ?? years[0]?.id ?? "");
  const [term, setTerm] = useState<(typeof SEMESTER_TERMS)[number]>(semester?.term ?? "FIRST");
  const [status, setStatus] = useState<(typeof SEMESTER_STATUSES)[number]>(semester?.status ?? "PLANNED");
  return (
    <Shell open={open} onOpenChange={onOpenChange} onReset={reset} title={t(isEdit ? "dialogs.semester.edit" : "dialogs.semester.create")} description={semester?.name} wide>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const v = formValues(new FormData(e.currentTarget), { bools: isEdit ? [] : ["isCurrent"], nullable: ["registrationOpensAt", "registrationClosesAt"] });
          run(() => (isEdit ? updateSemesterAction({ ...v, id: semester.id }) : createSemesterAction(v)));
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {!isEdit && <SelectField id="s-year" name="academicYearId" label={t("form.year")} errors={errors} value={yearId} onChange={setYearId} options={years} placeholder={t("form.choose")} />}
          <EnumSelect id="s-term" name="term" label={t("form.term")} value={term} onChange={setTerm} values={SEMESTER_TERMS} render={(v) => t(`term.${v}`)} errors={errors} />
          <TextField id="s-name" name="name" label={t("form.name")} errors={errors} required defaultValue={semester?.name ?? ""} className="sm:col-span-2" />
          <DateField id="s-start" name="startDate" label={t("form.startDate")} errors={errors} required defaultValue={semester?.startDate} />
          <DateField id="s-end" name="endDate" label={t("form.endDate")} errors={errors} required defaultValue={semester?.endDate} />
          <DateField id="s-ropen" name="registrationOpensAt" label={t("form.registrationOpensAt")} errors={errors} optional defaultValue={semester?.registrationOpensAt} />
          <DateField id="s-rclose" name="registrationClosesAt" label={t("form.registrationClosesAt")} errors={errors} optional defaultValue={semester?.registrationClosesAt} />
          <EnumSelect id="s-status" name="status" label={t("form.status")} value={status} onChange={setStatus} values={SEMESTER_STATUSES} render={(v) => t(`status.${v}`)} errors={errors} />
        </div>
        {!isEdit && <CheckField id="s-current" name="isCurrent" label={t("form.isCurrent")} />}
        <FormFooter pending={pending} onCancel={() => onOpenChange(false)} />
      </form>
    </Shell>
  );
}

/* ═══════════════ Catalogue entities (college / department / major) ═══════════════ */
type CatalogueRow = Pick<CollegeRow, "id" | "code" | "name" | "nameEn" | "description" | "sortOrder" | "isActive">;

function CatalogueFields({ row, errors, prefix, t }: { row: CatalogueRow | null; errors: FieldErrors; prefix: string; t: ReturnType<typeof useTranslations<"academic">> }) {
  return (
    <>
      <TextField id={`${prefix}-code`} name="code" label={t("form.code")} errors={errors} dir="ltr" required defaultValue={row?.code ?? ""} hint={t("form.codeHint")} className="font-mono" />
      <TextField id={`${prefix}-name`} name="name" label={t("form.name")} errors={errors} required defaultValue={row?.name ?? ""} />
      <TextField id={`${prefix}-nameEn`} name="nameEn" label={t("form.nameEn")} errors={errors} optional dir="ltr" defaultValue={row?.nameEn ?? ""} />
      <TextField id={`${prefix}-sort`} name="sortOrder" label={t("form.sortOrder")} errors={errors} type="number" inputMode="numeric" min={0} max={9999} dir="ltr" defaultValue={row?.sortOrder ?? 0} />
      <TextAreaField id={`${prefix}-desc`} name="description" label={t("form.description")} errors={errors} optional defaultValue={row?.description ?? ""} maxLength={500} className="sm:col-span-2" />
    </>
  );
}

export function CollegeDialog({ open, onOpenChange, college }: Base & { college: CollegeRow | null }) {
  const t = useTranslations("academic");
  const isEdit = !!college;
  const { pending, errors, run, reset } = useSubmit(onOpenChange, isEdit ? "updated" : "created");
  return (
    <Shell open={open} onOpenChange={onOpenChange} onReset={reset} title={t(isEdit ? "dialogs.college.edit" : "dialogs.college.create")} description={college?.code} wide>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const v = formValues(new FormData(e.currentTarget), { bools: ["isActive"] });
          run(() => (isEdit ? updateCollegeAction({ ...v, id: college.id }) : createCollegeAction(v)));
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <CatalogueFields row={college} errors={errors} prefix="c" t={t} />
        </div>
        <CheckField id="c-active" name="isActive" label={t("form.isActive")} defaultChecked={college?.isActive ?? true} />
        <FormFooter pending={pending} onCancel={() => onOpenChange(false)} />
      </form>
    </Shell>
  );
}

export function DepartmentDialog({ open, onOpenChange, department, colleges }: Base & { department: DepartmentRow | null; colleges: Option[] }) {
  const t = useTranslations("academic");
  const isEdit = !!department;
  const { pending, errors, run, reset } = useSubmit(onOpenChange, isEdit ? "updated" : "created");
  const [collegeId, setCollegeId] = useState(department?.collegeId ?? colleges[0]?.id ?? "");
  return (
    <Shell open={open} onOpenChange={onOpenChange} onReset={reset} title={t(isEdit ? "dialogs.department.edit" : "dialogs.department.create")} description={department?.code} wide>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const v = formValues(new FormData(e.currentTarget), { bools: ["isActive"] });
          run(() => (isEdit ? updateDepartmentAction({ ...v, id: department.id }) : createDepartmentAction(v)));
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField id="d-college" name="collegeId" label={t("form.college")} errors={errors} value={collegeId} onChange={setCollegeId} options={colleges} placeholder={t("form.choose")} className="sm:col-span-2" />
          <CatalogueFields row={department} errors={errors} prefix="d" t={t} />
        </div>
        <CheckField id="d-active" name="isActive" label={t("form.isActive")} defaultChecked={department?.isActive ?? true} />
        <FormFooter pending={pending} onCancel={() => onOpenChange(false)} />
      </form>
    </Shell>
  );
}

export function MajorDialog({ open, onOpenChange, major, departments }: Base & { major: MajorRow | null; departments: Option[] }) {
  const t = useTranslations("academic");
  const isEdit = !!major;
  const { pending, errors, run, reset } = useSubmit(onOpenChange, isEdit ? "updated" : "created");
  const [departmentId, setDepartmentId] = useState(major?.departmentId ?? departments[0]?.id ?? "");
  const [degree, setDegree] = useState<(typeof DEGREE_TYPES)[number]>(major?.degree ?? "BACHELOR");
  return (
    <Shell open={open} onOpenChange={onOpenChange} onReset={reset} title={t(isEdit ? "dialogs.major.edit" : "dialogs.major.create")} description={major?.code} wide>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const v = formValues(new FormData(e.currentTarget), { bools: ["isActive"], nullable: ["durationYears"] });
          run(() => (isEdit ? updateMajorAction({ ...v, id: major.id }) : createMajorAction(v)));
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField id="m-dept" name="departmentId" label={t("form.department")} errors={errors} value={departmentId} onChange={setDepartmentId} options={departments} placeholder={t("form.choose")} className="sm:col-span-2" />
          <CatalogueFields row={major} errors={errors} prefix="m" t={t} />
          <EnumSelect id="m-degree" name="degree" label={t("form.degree")} value={degree} onChange={setDegree} values={DEGREE_TYPES} render={(v) => t(`degree.${v}`)} errors={errors} />
          <TextField id="m-duration" name="durationYears" label={t("form.durationYears")} errors={errors} optional type="number" inputMode="numeric" min={1} max={10} dir="ltr" defaultValue={major?.durationYears ?? ""} />
        </div>
        <CheckField id="m-active" name="isActive" label={t("form.isActive")} defaultChecked={major?.isActive ?? true} />
        <FormFooter pending={pending} onCancel={() => onOpenChange(false)} />
      </form>
    </Shell>
  );
}

/* ═══════════════ Level ═══════════════ */
export function LevelDialog({ open, onOpenChange, level, majors, defaultMajorId }: Base & { level: LevelRow | null; majors: Option[]; defaultMajorId?: string }) {
  const t = useTranslations("academic");
  const isEdit = !!level;
  const { pending, errors, run, reset } = useSubmit(onOpenChange, isEdit ? "updated" : "created");
  const [majorId, setMajorId] = useState(level?.majorId ?? defaultMajorId ?? majors[0]?.id ?? "");
  return (
    <Shell open={open} onOpenChange={onOpenChange} onReset={reset} title={t(isEdit ? "dialogs.level.edit" : "dialogs.level.create")} description={level ? `${level.majorName} · ${level.number}` : undefined}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const v = formValues(new FormData(e.currentTarget), { bools: ["isActive"] });
          run(() => (isEdit ? updateLevelAction({ ...v, id: level.id }) : createLevelAction(v)));
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {!isEdit && <SelectField id="l-major" name="majorId" label={t("form.major")} errors={errors} value={majorId} onChange={setMajorId} options={majors} placeholder={t("form.choose")} className="sm:col-span-2" />}
          <TextField id="l-number" name="number" label={t("form.number")} errors={errors} type="number" inputMode="numeric" min={1} max={20} dir="ltr" required defaultValue={level?.number ?? 1} />
          <TextField id="l-name" name="name" label={t("form.name")} errors={errors} required defaultValue={level?.name ?? ""} />
          <TextField id="l-nameEn" name="nameEn" label={t("form.nameEn")} errors={errors} optional dir="ltr" defaultValue={level?.nameEn ?? ""} className="sm:col-span-2" />
        </div>
        <CheckField id="l-active" name="isActive" label={t("form.isActive")} defaultChecked={level?.isActive ?? true} />
        <FormFooter pending={pending} onCancel={() => onOpenChange(false)} />
      </form>
    </Shell>
  );
}

export function GenerateLevelsDialog({ open, onOpenChange, majors, defaultMajorId }: Base & { majors: Option[]; defaultMajorId?: string }) {
  const t = useTranslations("academic");
  const tt = useTranslations("academic.toast");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [majorId, setMajorId] = useState(defaultMajorId ?? majors[0]?.id ?? "");
  return (
    <Shell open={open} onOpenChange={onOpenChange} onReset={() => setErrors({})} title={t("dialogs.generate.title")} description={t("dialogs.generate.hint")}>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const v = formValues(new FormData(e.currentTarget));
          start(async () => {
            const res = await generateLevelsAction(v);
            if (!res.ok) {
              setErrors(res.fieldErrors ?? {});
              toast.error(res.message);
              return;
            }
            toast.success(tt("generated", { count: res.data.created }));
            onOpenChange(false);
            router.refresh();
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField id="g-major" name="majorId" label={t("form.major")} errors={errors} value={majorId} onChange={setMajorId} options={majors} placeholder={t("form.choose")} className="sm:col-span-2" />
          <TextField id="g-count" name="count" label={t("form.levelCount")} errors={errors} type="number" inputMode="numeric" min={1} max={20} dir="ltr" required defaultValue={8} />
        </div>
        <FormFooter pending={pending} onCancel={() => onOpenChange(false)} submitLabel={t("actions.generateLevels")} />
      </form>
    </Shell>
  );
}
