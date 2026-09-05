"use client";

/**
 * First-time setup wizard (FR-ACD-005) — shown when the tenant has neither a year nor a college.
 * 4 steps: period → college & department → major & levels → review. Every step is validated locally with the same
 * Zod sub-schemas the Server Action uses; the final call is one atomic `setupWizardAction`.
 * Field names are dotted (`year.code`) so server `fieldErrors` map 1:1 onto inputs.
 */
import { Check, ChevronLeft, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setupWizardAction } from "@/features/academic/actions";
import { DEGREE_TYPES, MAX_LEVELS, SEMESTER_TERMS, setupWizardSchema } from "@/features/academic/schemas";
import type { FieldErrors } from "@/lib/result";
import { cn } from "@/lib/utils";
import { DateField, FieldError, TextAreaField, TextField } from "./form-fields";

const STEPS = ["period", "structure", "major", "review"] as const;
type Step = (typeof STEPS)[number];

type Draft = {
  year: { code: string; name: string; startDate: string; endDate: string };
  semester: { term: (typeof SEMESTER_TERMS)[number]; name: string; startDate: string; endDate: string; registrationOpensAt: string; registrationClosesAt: string };
  college: { code: string; name: string; nameEn: string; description: string };
  department: { code: string; name: string; nameEn: string; description: string };
  major: { code: string; name: string; nameEn: string; description: string; degree: (typeof DEGREE_TYPES)[number]; durationYears: string };
  levelCount: number;
};

function defaultDraft(): Draft {
  const y = new Date().getUTCFullYear();
  const iso = (yy: number, m: string) => `${yy}-${m}`;
  return {
    year: { code: `${y}/${y + 1}`, name: `العام الأكاديمي ${y}/${y + 1}`, startDate: iso(y, "09-01"), endDate: iso(y + 1, "07-31") },
    semester: { term: "FIRST", name: `الفصل الأول ${y}/${y + 1}`, startDate: iso(y, "09-01"), endDate: iso(y + 1, "01-31"), registrationOpensAt: "", registrationClosesAt: "" },
    college: { code: "", name: "", nameEn: "", description: "" },
    department: { code: "", name: "", nameEn: "", description: "" },
    major: { code: "", name: "", nameEn: "", description: "", degree: "BACHELOR", durationYears: "4" },
    levelCount: 8,
  };
}

/** Payload as the Server Action expects it (empty optional dates → null, durationYears → number|null). */
function toPayload(d: Draft) {
  return {
    year: d.year,
    semester: { ...d.semester, registrationOpensAt: d.semester.registrationOpensAt || null, registrationClosesAt: d.semester.registrationClosesAt || null, status: "PLANNED" as const },
    college: d.college,
    department: d.department,
    major: { ...d.major, durationYears: d.major.durationYears ? Number(d.major.durationYears) : null },
    levelCount: d.levelCount,
  };
}

const stepSchemas: Record<Exclude<Step, "review">, z.ZodTypeAny> = {
  period: setupWizardSchema.pick({ year: true, semester: true }),
  structure: setupWizardSchema.pick({ college: true, department: true }),
  major: setupWizardSchema.pick({ major: true, levelCount: true }),
};

function validateStep(step: Exclude<Step, "review">, d: Draft): FieldErrors {
  const r = stepSchemas[step].safeParse(toPayload(d));
  if (r.success) return {};
  const out: FieldErrors = {};
  for (const i of r.error.issues) (out[i.path.join(".")] ??= []).push(i.message);
  return out;
}

export function SetupWizard() {
  const t = useTranslations("academic");
  const tw = useTranslations("academic.wizard");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [stepIdx, setStepIdx] = useState(0);
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const [errors, setErrors] = useState<FieldErrors>({});
  const step = STEPS[stepIdx] as Step;

  const set = <K extends keyof Draft>(k: K, patch: Partial<Draft[K]>) => setDraft((d) => ({ ...d, [k]: typeof d[k] === "object" ? { ...(d[k] as object), ...patch } : patch }));
  // Read a field value from the change event; inputs are named with the dotted path.
  const bind = <K extends Exclude<keyof Draft, "levelCount">>(k: K, f: keyof Draft[K]) => ({
    name: `${k}.${String(f)}`,
    id: `${k}.${String(f)}`,
    value: String(draft[k][f] ?? ""),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k, { [f]: e.target.value } as Partial<Draft[K]>),
    errors,
  });

  const next = () => {
    if (step === "review") return;
    const e = validateStep(step, draft);
    setErrors(e);
    if (Object.keys(e).length) return;
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  };
  const prev = () => setStepIdx((i) => Math.max(i - 1, 0));

  const finish = () =>
    start(async () => {
      const res = await setupWizardAction(toPayload(draft));
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.message);
        // Jump back to the first step that has an error.
        const firstKey = Object.keys(res.fieldErrors ?? {})[0] ?? "";
        const target = firstKey.startsWith("year") || firstKey.startsWith("semester") ? 0 : firstKey.startsWith("college") || firstKey.startsWith("department") ? 1 : firstKey ? 2 : stepIdx;
        setStepIdx(target);
        return;
      }
      toast.success(tw("success"));
      router.replace("/academic/years");
      router.refresh();
    });

  return (
    <Card data-testid="setup-wizard" className="mx-auto w-full max-w-3xl">
      <CardHeader>
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="size-5" aria-hidden />
          <CardTitle>{tw("title")}</CardTitle>
        </div>
        <CardDescription>{tw("subtitle")}</CardDescription>
        <ol className="mt-4 grid grid-cols-4 gap-1" aria-label={tw("title")}>
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-col items-center gap-1 text-center" aria-current={i === stepIdx ? "step" : undefined}>
              <span className={cn("flex size-7 items-center justify-center rounded-full border text-xs font-semibold", i < stepIdx && "border-primary bg-primary text-primary-foreground", i === stepIdx && "border-primary text-primary")}>
                {i < stepIdx ? <Check className="size-4" aria-hidden /> : i + 1}
              </span>
              <span className={cn("text-[11px] leading-tight sm:text-xs", i === stepIdx ? "font-medium" : "text-muted-foreground")}>{tw(`steps.${s}`)}</span>
            </li>
          ))}
        </ol>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (step === "review") finish();
            else next();
          }}
        >
          {step === "period" && (
            <div className="space-y-6">
              <fieldset className="grid gap-4 sm:grid-cols-2">
                <legend className="mb-2 text-sm font-semibold">{t("form.year")}</legend>
                <TextField label={t("form.code")} hint={t("form.codeHint")} dir="ltr" {...bind("year", "code")} />
                <TextField label={t("form.name")} {...bind("year", "name")} />
                <DateField label={t("form.startDate")} {...bind("year", "startDate")} required />
                <DateField label={t("form.endDate")} {...bind("year", "endDate")} required />
              </fieldset>
              <fieldset className="grid gap-4 sm:grid-cols-2">
                <legend className="mb-2 text-sm font-semibold">{t("tabs.years")}</legend>
                <div className="space-y-1.5">
                  <Label htmlFor="semester.term">{t("form.term")}</Label>
                  <Select value={draft.semester.term} onValueChange={(v) => set("semester", { term: v as Draft["semester"]["term"] })}>
                    <SelectTrigger id="semester.term" className="min-h-11 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEMESTER_TERMS.map((v) => (
                        <SelectItem key={v} value={v}>
                          {t(`term.${v}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <TextField label={t("form.name")} {...bind("semester", "name")} />
                <DateField label={t("form.startDate")} {...bind("semester", "startDate")} required />
                <DateField label={t("form.endDate")} {...bind("semester", "endDate")} required />
                <DateField label={t("form.registrationOpensAt")} optional {...bind("semester", "registrationOpensAt")} />
                <DateField label={t("form.registrationClosesAt")} optional {...bind("semester", "registrationClosesAt")} />
              </fieldset>
            </div>
          )}

          {step === "structure" && (
            <div className="space-y-6">
              <fieldset className="grid gap-4 sm:grid-cols-2">
                <legend className="mb-2 text-sm font-semibold">{t("form.college")}</legend>
                <TextField label={t("form.code")} hint={t("form.codeHint")} dir="ltr" {...bind("college", "code")} />
                <TextField label={t("form.name")} {...bind("college", "name")} />
                <TextField label={t("form.nameEn")} optional dir="ltr" {...bind("college", "nameEn")} />
                <TextAreaField label={t("form.description")} optional className="sm:col-span-2" {...bind("college", "description")} />
              </fieldset>
              <fieldset className="grid gap-4 sm:grid-cols-2">
                <legend className="mb-2 text-sm font-semibold">{t("form.department")}</legend>
                <TextField label={t("form.code")} hint={t("form.codeHint")} dir="ltr" {...bind("department", "code")} />
                <TextField label={t("form.name")} {...bind("department", "name")} />
                <TextField label={t("form.nameEn")} optional dir="ltr" {...bind("department", "nameEn")} />
                <TextAreaField label={t("form.description")} optional className="sm:col-span-2" {...bind("department", "description")} />
              </fieldset>
            </div>
          )}

          {step === "major" && (
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-2 text-sm font-semibold">{t("form.major")}</legend>
              <TextField label={t("form.code")} hint={t("form.codeHint")} dir="ltr" {...bind("major", "code")} />
              <TextField label={t("form.name")} {...bind("major", "name")} />
              <TextField label={t("form.nameEn")} optional dir="ltr" {...bind("major", "nameEn")} />
              <div className="space-y-1.5">
                <Label htmlFor="major.degree">{t("form.degree")}</Label>
                <Select value={draft.major.degree} onValueChange={(v) => set("major", { degree: v as Draft["major"]["degree"] })}>
                  <SelectTrigger id="major.degree" className="min-h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEGREE_TYPES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {t(`degree.${v}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <TextField label={t("form.durationYears")} optional type="number" min={1} max={10} inputMode="numeric" dir="ltr" {...bind("major", "durationYears")} />
              <div className="space-y-1.5">
                <Label htmlFor="levelCount">{t("form.levelCount")}</Label>
                <input
                  id="levelCount"
                  name="levelCount"
                  type="number"
                  min={1}
                  max={MAX_LEVELS}
                  dir="ltr"
                  inputMode="numeric"
                  value={draft.levelCount}
                  onChange={(e) => setDraft((d) => ({ ...d, levelCount: Number(e.target.value) || 0 }))}
                  className="flex min-h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  aria-invalid={!!errors.levelCount}
                  aria-describedby="levelCount-error"
                />
                <p className="text-xs text-muted-foreground">{t("dialogs.generate.hint")}</p>
                <FieldError errors={errors} name="levelCount" />
              </div>
              <TextAreaField label={t("form.description")} optional className="sm:col-span-2" {...bind("major", "description")} />
            </fieldset>
          )}

          {step === "review" && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">{tw("review.intro")}</p>
              <dl className="grid gap-3 rounded-md border p-4 sm:grid-cols-2">
                <Row label={t("form.year")} value={`${draft.year.name} (${draft.year.code})`} badge={t("current.badge")} />
                <Row label={t(`term.${draft.semester.term}`)} value={draft.semester.name} badge={t("current.badge")} />
                <Row label={t("form.college")} value={`${draft.college.name} (${draft.college.code})`} />
                <Row label={t("form.department")} value={`${draft.department.name} (${draft.department.code})`} />
                <Row label={t("form.major")} value={`${draft.major.name} (${draft.major.code}) · ${t(`degree.${draft.major.degree}`)}`} />
                <Row label={t("tabs.levels")} value={tw("review.levels", { count: draft.levelCount })} />
              </dl>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button asChild variant="link" className="min-h-11 px-0 text-muted-foreground">
              <Link href="/academic/years?manual=1">{tw("skip")}</Link>
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="min-h-11 gap-1" onClick={prev} disabled={stepIdx === 0 || pending}>
                <ChevronRight className="size-4 rtl:block ltr:hidden" aria-hidden />
                <ChevronLeft className="size-4 rtl:hidden ltr:block" aria-hidden />
                {tw("prev")}
              </Button>
              <Button type="submit" className="min-h-11 gap-1" disabled={pending} data-testid="wizard-next">
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                {step === "review" ? tw("finish") : tw("next")}
                {step !== "review" && (
                  <>
                    <ChevronLeft className="size-4 rtl:block ltr:hidden" aria-hidden />
                    <ChevronRight className="size-4 rtl:hidden ltr:block" aria-hidden />
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex flex-wrap items-center gap-2 font-medium">
        <span className="truncate">{value}</span>
        {badge && <Badge variant="secondary">{badge}</Badge>}
      </dd>
    </div>
  );
}
