"use client";

/**
 * Enrolment dialogs (FR-ENR-001): single enrol with live student search, and bulk enrol from a pasted list of
 * academic ids / emails with a per-line result table.
 */
import { Loader2, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { DialogShell } from "@/components/forms/dialog-shell";
import { FieldError, FormFooter, TextAreaField } from "@/components/forms/fields";
import { useSubmit } from "@/components/forms/use-submit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bulkEnrollAction, enrollStudentAction, searchStudentsAction } from "@/features/enrollment/actions";
import type { StudentOption } from "@/features/enrollment/queries";
import { MAX_BULK, parseIdentifiers, type BulkEnrollResult } from "@/features/enrollment/schemas";

type Base = { open: boolean; onOpenChange: (o: boolean) => void; offeringId: string };

/* ═══════════════ Single ═══════════════ */
export function EnrollDialog({ open, onOpenChange, offeringId }: Base) {
  const t = useTranslations("enrollment");
  const { pending, errors, run, reset } = useSubmit<{ enrollmentId: string; reactivated: boolean }>(
    onOpenChange,
    (d) => t(d.reactivated ? "toast.reactivated" : "toast.enrolled"),
  );
  const [q, setQ] = useState("");
  const [results, setResults] = useState<StudentOption[] | null>(null);
  const [selected, setSelected] = useState<StudentOption | null>(null);
  const [searching, startSearch] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      startSearch(async () => {
        const r = await searchStudentsAction({ offeringId, q });
        if (r.ok) setResults(r.data);
        else toast.error(r.message);
      });
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, open, offeringId]);

  return (
    <DialogShell open={open} onOpenChange={onOpenChange} onReset={reset} title={t("dialogs.enroll")}>
      <form
        noValidate
        className="space-y-4"
        data-testid="enroll-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!selected) return;
          run(() => enrollStudentAction({ offeringId, studentId: selected.id }));
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="enr-student">{t("form.student")}</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="enr-student"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("form.searchStudent")}
              className="min-h-11 ps-10"
              autoComplete="off"
              aria-controls="enr-results"
            />
          </div>
          <FieldError errors={errors} name="studentId" />
          <FieldError errors={errors} name="offeringId" />
        </div>
        <div
          id="enr-results"
          role="listbox"
          aria-label={t("form.student")}
          className="max-h-64 overflow-y-auto rounded-lg border"
        >
          {searching && results === null ? (
            <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> …
            </p>
          ) : results && results.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">{t("form.noCandidates")}</p>
          ) : (
            (results ?? []).map((s) => (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={selected?.id === s.id}
                data-testid="student-candidate"
                onClick={() => setSelected(s)}
                className={`flex min-h-11 w-full items-center justify-between gap-3 border-b px-3 py-2 text-start text-sm last:border-b-0 hover:bg-accent ${selected?.id === s.id ? "bg-primary/10" : ""}`}
              >
                <span className="font-medium">{s.name}</span>
                <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                  {s.academicId}
                </span>
              </button>
            ))
          )}
        </div>
        <FormFooter
          pending={pending || !selected}
          onCancel={() => onOpenChange(false)}
          submitLabel={t("actions.enroll")}
        />
      </form>
    </DialogShell>
  );
}

/* ═══════════════ Bulk ═══════════════ */
export function BulkEnrollDialog({ open, onOpenChange, offeringId }: Base) {
  const t = useTranslations("enrollment");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<BulkEnrollResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ids = parseIdentifiers(raw);

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={t(result ? "dialogs.result" : "dialogs.bulk")}
      onReset={() => {
        setResult(null);
        setError(null);
      }}
    >
      {result ? (
        <div className="space-y-4" data-testid="bulk-result">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="outline" className="border-transparent bg-primary/15 text-primary">
              {t("result.enrolled")}: {result.enrolled}
            </Badge>
            <Badge
              variant="outline"
              className="border-transparent bg-sky-500/15 text-sky-600 dark:text-sky-400"
            >
              {t("result.reactivated")}: {result.reactivated}
            </Badge>
            <Badge variant="outline" className="border-transparent bg-muted text-muted-foreground">
              {t("result.skipped")}: {result.skipped}
            </Badge>
          </div>
          <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border text-sm">
            {result.lines.map((l) => (
              <li key={l.identifier} className="flex items-center justify-between gap-3 px-3 py-2">
                <span dir="ltr" className="font-mono text-xs">
                  {l.identifier}
                </span>
                <span
                  className={
                    l.status === "ENROLLED" || l.status === "REACTIVATED"
                      ? "text-primary"
                      : "text-muted-foreground"
                  }
                >
                  {t(`result.${l.status}`)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end">
            <Button type="button" className="min-h-11" onClick={() => onOpenChange(false)}>
              {t("actions.bulk")} ✓
            </Button>
          </div>
        </div>
      ) : (
        <form
          noValidate
          className="space-y-4"
          data-testid="bulk-form"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await bulkEnrollAction({ offeringId, identifiers: ids });
              if (!r.ok) {
                setError(r.fieldErrors?.identifiers?.[0] ?? r.fieldErrors?.offeringId?.[0] ?? r.message);
                toast.error(r.message);
                return;
              }
              setResult(r.data);
              toast.success(
                t("toast.bulkDone", {
                  enrolled: r.data.enrolled,
                  reactivated: r.data.reactivated,
                  skipped: r.data.skipped,
                }),
              );
              router.refresh();
            });
          }}
        >
          <TextAreaField
            id="enr-ids"
            name="identifiers"
            label={t("form.identifiers")}
            errors={error ? { identifiers: [error] } : {}}
            rows={8}
            dir="ltr"
            className="font-mono"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={"443100002\n443100003\nstudent4@demo.edu"}
          />
          <p className="text-xs text-muted-foreground">
            {t("form.identifiersHint")} — {t("form.count", { count: ids.length })}
          </p>
          <FormFooter
            pending={pending || ids.length === 0 || ids.length > MAX_BULK}
            onCancel={() => onOpenChange(false)}
            submitLabel={t("actions.bulk")}
          />
        </form>
      )}
    </DialogShell>
  );
}
