"use client";

/**
 * Course dialogs (P1-05 / FR-CRS-001, FR-CRS-002): create/edit with an inline majors↔levels mapping editor,
 * and a standalone "majors" dialog for editing the mapping alone. Parents remount via `key` so local drafts reset.
 */
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { DialogShell } from "@/components/forms/dialog-shell";
import {
  CheckField,
  FieldError,
  FormFooter,
  SelectField,
  TextAreaField,
  TextField,
  formValues,
} from "@/components/forms/fields";
import { useSubmit } from "@/components/forms/use-submit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createCourseAction, setCourseMajorsAction, updateCourseAction } from "@/features/courses/actions";
import type { CourseRow, LevelOption } from "@/features/courses/queries";
import { MAX_CREDIT_HOURS, MAX_MAJORS_PER_COURSE } from "@/features/courses/schemas";
import type { Option } from "@/lib/contracts/option";
import type { FieldErrors } from "@/lib/result";

type Base = { open: boolean; onOpenChange: (o: boolean) => void };
export type Lookups = { departments: Option[]; majors: Option[]; levels: LevelOption[] };

export type MajorDraft = { majorId: string; levelId: string; isRequired: boolean };
const NO_LEVEL = "__any__";
const NO_DEPT = "__none__";

function draftsFrom(course: CourseRow | null): MajorDraft[] {
  return (course?.majors ?? []).map((m) => ({
    majorId: m.majorId,
    levelId: m.levelId ?? "",
    isRequired: m.isRequired,
  }));
}
function toPayload(drafts: MajorDraft[]) {
  return drafts
    .filter((d) => d.majorId)
    .map((d) => ({ majorId: d.majorId, levelId: d.levelId || null, isRequired: d.isRequired }));
}

/** Majors ↔ level mapping editor (rows of major / level / required). */
export function MajorsEditor({
  drafts,
  onChange,
  lookups,
  errors,
  idPrefix,
}: {
  drafts: MajorDraft[];
  onChange: (d: MajorDraft[]) => void;
  lookups: Lookups;
  errors: FieldErrors;
  idPrefix: string;
}) {
  const t = useTranslations("courses.form");
  const update = (i: number, patch: Partial<MajorDraft>) =>
    onChange(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const used = new Set(drafts.map((d) => d.majorId));
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{t("majors")}</legend>
      {drafts.length === 0 && <p className="text-sm text-muted-foreground">{t("noMajors")}</p>}
      <ul className="space-y-3">
        {drafts.map((d, i) => {
          const levels = lookups.levels.filter((l) => l.majorId === d.majorId);
          return (
            <li
              key={i}
              className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
              data-testid="major-row"
            >
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-major-${i}`}>{t("majors")}</Label>
                <Select
                  value={d.majorId || undefined}
                  onValueChange={(v) => update(i, { majorId: v, levelId: "" })}
                >
                  <SelectTrigger
                    id={`${idPrefix}-major-${i}`}
                    className="min-h-11 w-full"
                    aria-invalid={!!errors[`majors.${i}.majorId`]}
                  >
                    <SelectValue placeholder={t("choose")} />
                  </SelectTrigger>
                  <SelectContent>
                    {lookups.majors.map((m) => (
                      <SelectItem key={m.id} value={m.id} disabled={used.has(m.id) && m.id !== d.majorId}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError errors={errors} name={`majors.${i}.majorId`} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-level-${i}`}>{t("level")}</Label>
                <Select
                  value={d.levelId || NO_LEVEL}
                  onValueChange={(v) => update(i, { levelId: v === NO_LEVEL ? "" : v })}
                  disabled={!d.majorId}
                >
                  <SelectTrigger
                    id={`${idPrefix}-level-${i}`}
                    className="min-h-11 w-full"
                    aria-invalid={!!errors[`majors.${i}.levelId`]}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_LEVEL}>{t("anyLevel")}</SelectItem>
                    {levels.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError errors={errors} name={`majors.${i}.levelId`} />
              </div>
              <div className="flex min-h-11 items-center gap-2">
                <Checkbox
                  id={`${idPrefix}-req-${i}`}
                  checked={d.isRequired}
                  onCheckedChange={(c) => update(i, { isRequired: c === true })}
                />
                <Label htmlFor={`${idPrefix}-req-${i}`} className="cursor-pointer whitespace-nowrap">
                  {d.isRequired ? t("required") : t("elective")}
                </Label>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 text-destructive"
                aria-label={t("removeMajor")}
                onClick={() => onChange(drafts.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          );
        })}
      </ul>
      <FieldError errors={errors} name="majors" />
      <Button
        type="button"
        variant="outline"
        className="min-h-11 gap-2"
        disabled={drafts.length >= MAX_MAJORS_PER_COURSE || drafts.length >= lookups.majors.length}
        onClick={() => onChange([...drafts, { majorId: "", levelId: "", isRequired: true }])}
        data-testid="add-major"
      >
        <Plus className="size-4" aria-hidden /> {t("addMajor")}
      </Button>
    </fieldset>
  );
}

/* ═══════════════ Create / Edit ═══════════════ */
export function CourseFormDialog({
  open,
  onOpenChange,
  course,
  lookups,
}: Base & { course: CourseRow | null; lookups: Lookups }) {
  const t = useTranslations("courses");
  const isEdit = !!course;
  const { pending, errors, run, reset } = useSubmit(
    onOpenChange,
    t(isEdit ? "toast.updated" : "toast.created"),
  );
  const [departmentId, setDepartmentId] = useState(course?.departmentId ?? "");
  const [drafts, setDrafts] = useState<MajorDraft[]>(() => draftsFrom(course));

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      onReset={reset}
      wide
      title={t(isEdit ? "dialogs.edit" : "dialogs.create")}
      description={course?.code}
    >
      <form
        noValidate
        className="space-y-4"
        data-testid="course-form"
        onSubmit={(e) => {
          e.preventDefault();
          const v = formValues(new FormData(e.currentTarget), {
            bools: ["isActive"],
            nullable: ["departmentId"],
          });
          const payload = { ...v, majors: toPayload(drafts) };
          run(() =>
            isEdit ? updateCourseAction({ ...payload, id: course.id }) : createCourseAction(payload),
          );
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="crs-code"
            name="code"
            label={t("form.code")}
            errors={errors}
            dir="ltr"
            required
            defaultValue={course?.code ?? ""}
            placeholder="CS101"
            hint={t("form.codeHint")}
            className="font-mono"
            autoCapitalize="characters"
          />
          <TextField
            id="crs-credit"
            name="creditHours"
            label={t("form.creditHours")}
            errors={errors}
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_CREDIT_HOURS}
            dir="ltr"
            defaultValue={course?.creditHours ?? 3}
          />
          <TextField
            id="crs-name"
            name="name"
            label={t("form.name")}
            errors={errors}
            required
            defaultValue={course?.name ?? ""}
            className="sm:col-span-2"
          />
          <TextField
            id="crs-name-en"
            name="nameEn"
            label={t("form.nameEn")}
            errors={errors}
            optional
            dir="ltr"
            defaultValue={course?.nameEn ?? ""}
            className="sm:col-span-2"
          />
          {/* Radix Select rejects "" values → sentinel option; the real value is posted via the hidden input. */}
          <input type="hidden" name="departmentId" value={departmentId} />
          <SelectField
            id="crs-dept"
            name="_dept"
            label={t("form.department")}
            errors={{ _dept: errors.departmentId ?? [] }}
            optional
            value={departmentId || NO_DEPT}
            onChange={(v) => setDepartmentId(v === NO_DEPT ? "" : v)}
            options={[{ id: NO_DEPT, label: t("form.noDepartment") }, ...lookups.departments]}
            className="sm:col-span-2"
          />
          <TextAreaField
            id="crs-desc"
            name="description"
            label={t("form.description")}
            errors={errors}
            optional
            defaultValue={course?.description ?? ""}
            className="sm:col-span-2"
            rows={3}
          />
        </div>
        <CheckField
          id="crs-active"
          name="isActive"
          label={t("form.isActive")}
          defaultChecked={course?.isActive ?? true}
        />
        <MajorsEditor drafts={drafts} onChange={setDrafts} lookups={lookups} errors={errors} idPrefix="crs" />
        <FormFooter pending={pending} onCancel={() => onOpenChange(false)} />
      </form>
    </DialogShell>
  );
}

/* ═══════════════ Majors only ═══════════════ */
export function CourseMajorsDialog({
  open,
  onOpenChange,
  course,
  lookups,
}: Base & { course: CourseRow | null; lookups: Lookups }) {
  const t = useTranslations("courses");
  const { pending, errors, run, reset } = useSubmit(onOpenChange, t("toast.majorsSaved"));
  const [drafts, setDrafts] = useState<MajorDraft[]>(() => draftsFrom(course));
  if (!course) return null;
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      onReset={reset}
      wide
      title={t("dialogs.majors")}
      description={`${course.code} — ${course.name}. ${t("dialogs.majorsHint")}`}
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => setCourseMajorsAction({ id: course.id, majors: toPayload(drafts) }));
        }}
      >
        <MajorsEditor drafts={drafts} onChange={setDrafts} lookups={lookups} errors={errors} idPrefix="cm" />
        <FormFooter pending={pending} onCancel={() => onOpenChange(false)} />
      </form>
    </DialogShell>
  );
}
