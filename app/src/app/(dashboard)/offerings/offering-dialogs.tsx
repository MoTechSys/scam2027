"use client";

/**
 * Offering (section) dialogs — create/edit with a weekly-schedule editor, instructors assignment, and status change
 * (P1-05 / FR-OFF-001, FR-CRS-003). Parents remount via `key` so local drafts reset between openings.
 */
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { DialogShell } from "@/components/forms/dialog-shell";
import { FieldError, FormFooter, SelectField, TextField, formValues } from "@/components/forms/fields";
import { useSubmit } from "@/components/forms/use-submit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  createOfferingAction,
  setInstructorsAction,
  setOfferingStatusAction,
  updateOfferingAction,
} from "@/features/offerings/actions";
import type { InstructorOption, OfferingRow } from "@/features/offerings/queries";
import {
  INSTRUCTOR_ROLES,
  MAX_CAPACITY,
  MAX_INSTRUCTORS,
  OFFERING_STATUSES,
  OFFERING_TRANSITIONS,
  type InstructorRole,
  type OfferingStatus,
} from "@/features/offerings/schemas";
import { WEEKDAYS, type Weekday } from "@/lib/contracts/json-columns";
import type { Option } from "@/lib/contracts/option";
import type { FieldErrors } from "@/lib/result";

type Base = { open: boolean; onOpenChange: (o: boolean) => void };
export type OfferingLookups = { courses: Option[]; semesters: Option[]; instructors: InstructorOption[] };

/* ───────── Schedule editor ───────── */
type Slot = { day: Weekday; startTime: string; endTime: string; room: string };
const slotsFrom = (o: OfferingRow | null): Slot[] =>
  (o?.schedule ?? []).map((s) => ({
    day: s.day,
    startTime: s.startTime,
    endTime: s.endTime,
    room: s.room ?? "",
  }));
const slotsPayload = (slots: Slot[]) =>
  slots.map((s) => ({
    day: s.day,
    startTime: s.startTime,
    endTime: s.endTime,
    ...(s.room ? { room: s.room } : {}),
  }));

function ScheduleEditor({
  slots,
  onChange,
  errors,
}: {
  slots: Slot[];
  onChange: (s: Slot[]) => void;
  errors: FieldErrors;
}) {
  const t = useTranslations("offerings");
  const update = (i: number, patch: Partial<Slot>) =>
    onChange(slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{t("form.schedule")}</legend>
      {slots.length === 0 && <p className="text-sm text-muted-foreground">{t("noSchedule")}</p>}
      <ul className="space-y-3">
        {slots.map((s, i) => (
          <li
            key={i}
            className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-end"
            data-testid="slot-row"
          >
            <div className="space-y-1.5">
              <Label htmlFor={`sl-day-${i}`}>{t("form.day")}</Label>
              <Select value={s.day} onValueChange={(v) => update(i, { day: v as Weekday })}>
                <SelectTrigger id={`sl-day-${i}`} className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {t(`day.${d}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`sl-start-${i}`}>{t("form.start")}</Label>
              <Input
                id={`sl-start-${i}`}
                type="time"
                dir="ltr"
                className="min-h-11"
                value={s.startTime}
                onChange={(e) => update(i, { startTime: e.target.value })}
                aria-invalid={!!errors[`schedule.${i}.startTime`]}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`sl-end-${i}`}>{t("form.end")}</Label>
              <Input
                id={`sl-end-${i}`}
                type="time"
                dir="ltr"
                className="min-h-11"
                value={s.endTime}
                onChange={(e) => update(i, { endTime: e.target.value })}
                aria-invalid={!!errors[`schedule.${i}.endTime`]}
              />
              <FieldError errors={errors} name={`schedule.${i}.endTime`} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`sl-room-${i}`}>{t("form.room")}</Label>
              <Input
                id={`sl-room-${i}`}
                className="min-h-11"
                value={s.room}
                maxLength={60}
                onChange={(e) => update(i, { room: e.target.value })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 text-destructive"
              aria-label={t("form.removeSlot")}
              onClick={() => onChange(slots.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <FieldError errors={errors} name="schedule" />
      <Button
        type="button"
        variant="outline"
        className="min-h-11 gap-2"
        disabled={slots.length >= 14}
        onClick={() => onChange([...slots, { day: "SUN", startTime: "08:00", endTime: "09:00", room: "" }])}
        data-testid="add-slot"
      >
        <Plus className="size-4" aria-hidden /> {t("form.addSlot")}
      </Button>
    </fieldset>
  );
}

/* ───────── Instructors editor ───────── */
type Assign = { userId: string; role: InstructorRole };
const assignFrom = (o: OfferingRow | null): Assign[] =>
  (o?.instructors ?? []).map((i) => ({ userId: i.userId, role: i.role }));
const instructorLabel = (i: InstructorOption) => `${i.title ? `${i.title} ` : ""}${i.name} (${i.academicId})`;

function InstructorsEditor({
  rows,
  onChange,
  options,
  errors,
}: {
  rows: Assign[];
  onChange: (r: Assign[]) => void;
  options: InstructorOption[];
  errors: FieldErrors;
}) {
  const t = useTranslations("offerings");
  const update = (i: number, patch: Partial<Assign>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const used = new Set(rows.map((r) => r.userId));
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">{t("form.instructors")}</legend>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">{t("form.noInstructors")}</p>}
      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li
            key={i}
            className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
            data-testid="instructor-row"
          >
            <div className="space-y-1.5">
              <Label htmlFor={`ins-user-${i}`}>{t("form.instructors")}</Label>
              <Select value={r.userId || undefined} onValueChange={(v) => update(i, { userId: v })}>
                <SelectTrigger
                  id={`ins-user-${i}`}
                  className="min-h-11 w-full"
                  aria-invalid={!!errors[`instructors.${i}.userId`]}
                >
                  <SelectValue placeholder={t("form.choose")} />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.id} value={o.id} disabled={used.has(o.id) && o.id !== r.userId}>
                      {instructorLabel(o)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={errors} name={`instructors.${i}.userId`} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`ins-role-${i}`}>{t("form.role")}</Label>
              <Select value={r.role} onValueChange={(v) => update(i, { role: v as InstructorRole })}>
                <SelectTrigger id={`ins-role-${i}`} className="min-h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INSTRUCTOR_ROLES.map((x) => (
                    <SelectItem key={x} value={x}>
                      {t(`role.${x}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 text-destructive"
              aria-label={t("form.removeSlot")}
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <FieldError errors={errors} name="instructors" />
      <Button
        type="button"
        variant="outline"
        className="min-h-11 gap-2"
        disabled={rows.length >= MAX_INSTRUCTORS || rows.length >= options.length}
        onClick={() =>
          onChange([
            ...rows,
            { userId: "", role: rows.some((r) => r.role === "PRIMARY") ? "CO_INSTRUCTOR" : "PRIMARY" },
          ])
        }
        data-testid="add-instructor"
      >
        <Plus className="size-4" aria-hidden /> {t("form.addInstructor")}
      </Button>
    </fieldset>
  );
}

/* ═══════════════ Create / Edit ═══════════════ */
export function OfferingFormDialog({
  open,
  onOpenChange,
  offering,
  lookups,
  defaultCourseId,
  canAssign,
}: Base & {
  offering: OfferingRow | null;
  lookups: OfferingLookups;
  defaultCourseId?: string;
  canAssign: boolean;
}) {
  const t = useTranslations("offerings");
  const isEdit = !!offering;
  const { pending, errors, run, reset } = useSubmit(
    onOpenChange,
    t(isEdit ? "toast.updated" : "toast.created"),
  );
  const [courseId, setCourseId] = useState(offering?.courseId ?? defaultCourseId ?? "");
  const [semesterId, setSemesterId] = useState(
    offering?.semesterId ?? lookups.semesters.find((s) => s.label.endsWith("★"))?.id ?? "",
  );
  const [status, setStatus] = useState<OfferingStatus>("DRAFT");
  const [slots, setSlots] = useState<Slot[]>(() => slotsFrom(offering));
  const [assign, setAssign] = useState<Assign[]>(() => assignFrom(offering));

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      onReset={reset}
      wide
      title={t(isEdit ? "dialogs.edit" : "dialogs.create")}
      description={
        offering ? `${offering.courseCode} — ${t("sectionLabel", { section: offering.section })}` : undefined
      }
    >
      <form
        noValidate
        className="space-y-4"
        data-testid="offering-form"
        onSubmit={(e) => {
          e.preventDefault();
          const v = formValues(new FormData(e.currentTarget), { nullable: ["capacity"] });
          const common = {
            section: v.section,
            capacity: v.capacity,
            location: v.location,
            schedule: slotsPayload(slots),
          };
          run(() =>
            isEdit
              ? updateOfferingAction({ ...common, id: offering.id })
              : createOfferingAction({
                  ...common,
                  courseId,
                  semesterId,
                  status,
                  instructors: canAssign ? assign.filter((a) => a.userId) : [],
                }),
          );
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {!isEdit && (
            <>
              <SelectField
                id="off-course"
                name="courseId"
                label={t("form.course")}
                errors={errors}
                value={courseId}
                onChange={setCourseId}
                options={lookups.courses}
                placeholder={t("form.choose")}
                className="sm:col-span-2"
              />
              <SelectField
                id="off-semester"
                name="semesterId"
                label={t("form.semester")}
                errors={errors}
                value={semesterId}
                onChange={setSemesterId}
                options={lookups.semesters}
                placeholder={t("form.choose")}
              />
              <div className="space-y-1.5">
                <Label htmlFor="off-status">{t("form.status")}</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as OfferingStatus)}>
                  <SelectTrigger id="off-status" className="min-h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OFFERING_STATUSES.filter((s) => s !== "ARCHIVED").map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`status.${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          <TextField
            id="off-section"
            name="section"
            label={t("form.section")}
            errors={errors}
            dir="ltr"
            required
            defaultValue={offering?.section ?? "1"}
            hint={t("form.sectionHint")}
            className="font-mono"
            autoCapitalize="characters"
            maxLength={10}
          />
          <TextField
            id="off-capacity"
            name="capacity"
            label={t("form.capacity")}
            errors={errors}
            optional
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_CAPACITY}
            dir="ltr"
            defaultValue={offering?.capacity ?? ""}
            hint={t("form.capacityHint")}
          />
          <TextField
            id="off-location"
            name="location"
            label={t("form.location")}
            errors={errors}
            optional
            defaultValue={offering?.location ?? ""}
            className="sm:col-span-2"
            maxLength={120}
          />
        </div>
        <ScheduleEditor slots={slots} onChange={setSlots} errors={errors} />
        {!isEdit && canAssign && (
          <InstructorsEditor
            rows={assign}
            onChange={setAssign}
            options={lookups.instructors}
            errors={errors}
          />
        )}
        <FormFooter pending={pending} onCancel={() => onOpenChange(false)} />
      </form>
    </DialogShell>
  );
}

/* ═══════════════ Instructors only ═══════════════ */
export function InstructorsDialog({
  open,
  onOpenChange,
  offering,
  options,
}: Base & { offering: OfferingRow | null; options: InstructorOption[] }) {
  const t = useTranslations("offerings");
  const { pending, errors, run, reset } = useSubmit(onOpenChange, t("toast.instructorsSaved"));
  const [rows, setRows] = useState<Assign[]>(() => assignFrom(offering));
  if (!offering) return null;
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      onReset={reset}
      wide
      title={t("dialogs.instructors")}
      description={`${offering.courseCode} — ${t("sectionLabel", { section: offering.section })}`}
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => setInstructorsAction({ id: offering.id, instructors: rows.filter((r) => r.userId) }));
        }}
      >
        <InstructorsEditor rows={rows} onChange={setRows} options={options} errors={errors} />
        <FormFooter pending={pending} onCancel={() => onOpenChange(false)} />
      </form>
    </DialogShell>
  );
}

/* ═══════════════ Status ═══════════════ */
export function StatusDialog({ open, onOpenChange, offering }: Base & { offering: OfferingRow | null }) {
  const t = useTranslations("offerings");
  const { pending, errors, run, reset } = useSubmit(onOpenChange, t("toast.statusChanged"));
  const allowed = offering ? OFFERING_TRANSITIONS[offering.status] : [];
  const [next, setNext] = useState<OfferingStatus | "">(allowed[0] ?? "");
  if (!offering) return null;
  const CONFIRM_KEY: Record<OfferingStatus, "open" | "close" | "draft" | "archive"> = {
    OPEN: "open",
    CLOSED: "close",
    DRAFT: "draft",
    ARCHIVED: "archive",
  };
  const confirmKey = next ? CONFIRM_KEY[next] : null;
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      onReset={reset}
      title={t("dialogs.status")}
      description={`${offering.courseCode} — ${t("sectionLabel", { section: offering.section })} · ${t(`status.${offering.status}`)}`}
    >
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!next) return;
          run(() => setOfferingStatusAction({ id: offering.id, status: next }));
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="off-next">{t("form.status")}</Label>
          <Select
            value={next || undefined}
            onValueChange={(v) => setNext(v as OfferingStatus)}
            disabled={!allowed.length}
          >
            <SelectTrigger id="off-next" className="min-h-11 w-full" aria-invalid={!!errors.status}>
              <SelectValue placeholder={t("form.choose")} />
            </SelectTrigger>
            <SelectContent>
              {allowed.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`status.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError errors={errors} name="status" />
        </div>
        {confirmKey && <p className="text-sm text-muted-foreground">{t(`confirm.${confirmKey}`)}</p>}
        <FormFooter
          pending={pending}
          onCancel={() => onOpenChange(false)}
          submitLabel={
            next
              ? t(
                  `actions.${next === "OPEN" ? (offering.status === "CLOSED" ? "reopen" : "open") : next === "CLOSED" ? "close" : next === "DRAFT" ? "draft" : "archive"}`,
                )
              : undefined
          }
        />
      </form>
    </DialogShell>
  );
}
