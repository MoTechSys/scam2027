"use client";

/**
 * Compose dialog (FR-NTF-001/002). Audience kind is a chip group (works on touch without Radix Select); ids are a
 * checkbox list for lookups (roles / units / sections) or a search-and-pick list for people. Type / priority keep
 * sensible defaults so a notification can be sent without opening any select.
 */
import { Loader2, Search, Users2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { DialogShell } from "@/components/forms/dialog-shell";
import { FieldError, FormFooter, SelectField, TextAreaField, TextField } from "@/components/forms/fields";
import { useSubmit } from "@/components/forms/use-submit";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  previewRecipientsAction,
  searchRecipientsAction,
  sendNotificationAction,
  type SendResult,
} from "@/features/notifications/actions";
import type { TargetLookups, UserOption } from "@/features/notifications/queries";
import {
  COMPOSABLE_TYPES,
  NOTIFICATION_PRIORITIES,
  type NotificationTarget,
  type NotificationTargetKind,
} from "@/features/notifications/schemas";
import type { Option } from "@/lib/contracts/option";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lookups: TargetLookups;
  allowedKinds: NotificationTargetKind[];
};

const LOOKUP_KEY: Partial<Record<NotificationTargetKind, keyof TargetLookups>> = {
  ROLE: "roles",
  COLLEGE: "colleges",
  DEPARTMENT: "departments",
  MAJOR: "majors",
  LEVEL: "levels",
  OFFERING: "offerings",
};

function buildTarget(kind: NotificationTargetKind, ids: string[]): NotificationTarget {
  return kind === "ALL" ? { kind } : ({ kind, ids } as NotificationTarget);
}

export function ComposeDialog({ open, onOpenChange, lookups, allowedKinds }: Props) {
  const t = useTranslations("notifications");
  const tc = useTranslations("common");
  const { pending, errors, run, reset } = useSubmit<SendResult>(onOpenChange, (d) =>
    d.queued ? t("toast.queued") : t("toast.sent", { count: d.recipientCount }),
  );
  const [kind, setKind] = useState<NotificationTargetKind>(allowedKinds[0] ?? "USERS");
  const [ids, setIds] = useState<string[]>([]);
  const [type, setType] = useState<string>("ANNOUNCEMENT");
  const [priority, setPriority] = useState<string>("NORMAL");
  const [people, setPeople] = useState<UserOption[]>([]);
  const [preview, setPreview] = useState<number | null>(null);
  const [previewing, startPreview] = useTransition();

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset form state whenever the dialog opens
    setKind(allowedKinds[0] ?? "USERS");
    setIds([]);
    setPeople([]);
    setPreview(null);
    setType("ANNOUNCEMENT");
    setPriority("NORMAL");
  }, [open, allowedKinds]);

  const options: Option[] = useMemo(() => {
    const key = LOOKUP_KEY[kind];
    return key ? lookups[key] : [];
  }, [kind, lookups]);

  const typeOptions = COMPOSABLE_TYPES.map((v) => ({ id: v, label: t(`type.${v}`) }));
  const priorityOptions = NOTIFICATION_PRIORITIES.map((v) => ({ id: v, label: t(`priority.${v}`) }));

  const changeKind = (k: NotificationTargetKind) => {
    setKind(k);
    setIds([]);
    setPeople([]);
    setPreview(null);
  };
  const toggleId = (id: string, on: boolean) => {
    setIds((prev) => (on ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
    setPreview(null);
  };

  const doPreview = () =>
    startPreview(async () => {
      const r = await previewRecipientsAction(buildTarget(kind, ids));
      setPreview(r.ok ? r.data.count : null);
    });

  const idsError = errors["target.ids"]?.[0] ?? errors["target.kind"]?.[0];

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={t("dialogs.compose")}
      description={t("dialogs.composeDesc")}
      onReset={reset}
      wide
    >
      <form
        data-testid="compose-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          run(() =>
            sendNotificationAction({
              title: fd.get("title"),
              body: fd.get("body"),
              type,
              priority,
              link: fd.get("link"),
              target: buildTarget(kind, ids),
            }),
          );
        }}
      >
        {/* ── Audience ── */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("form.targetKind")}</legend>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("form.targetKind")}>
            {allowedKinds.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                data-testid={`kind-${k}`}
                onClick={() => changeKind(k)}
                className={cn(
                  "min-h-10 rounded-full border px-3.5 text-sm font-medium transition-colors",
                  kind === k
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted",
                )}
              >
                {t(`target.${k}`)}
              </button>
            ))}
          </div>

          {kind !== "ALL" && kind !== "USERS" && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{t("form.targetIdsHint")}</p>
              <ul
                className="max-h-56 space-y-0.5 overflow-y-auto rounded-md border border-border p-1"
                data-testid="target-list"
                aria-label={t("form.targetIds")}
              >
                {options.length === 0 && (
                  <li className="px-2 py-3 text-center text-sm text-muted-foreground">
                    {t("form.noResults")}
                  </li>
                )}
                {options.map((o) => {
                  const checked = ids.includes(o.id);
                  const cid = `tgt-${o.id}`;
                  return (
                    <li key={o.id}>
                      <label
                        htmlFor={cid}
                        className="flex min-h-11 cursor-pointer items-center gap-3 rounded px-2 hover:bg-muted"
                      >
                        <Checkbox
                          id={cid}
                          checked={checked}
                          onCheckedChange={(v) => toggleId(o.id, v === true)}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">{o.label}</span>
                        {o.group && <span className="truncate text-xs text-muted-foreground">{o.group}</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {kind === "USERS" && (
            <PeoplePicker
              selected={people}
              onChange={(next) => {
                setPeople(next);
                setIds(next.map((p) => p.id));
                setPreview(null);
              }}
            />
          )}

          {idsError && (
            <p className="text-xs text-destructive" role="alert">
              {idsError === "EMPTY" || idsError === "FORBIDDEN" ? t(`form.err.${idsError}`) : idsError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-9 gap-1.5"
              onClick={doPreview}
              disabled={previewing || (kind !== "ALL" && ids.length === 0)}
              data-testid="preview-recipients"
            >
              {previewing ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Users2 className="size-3.5" aria-hidden />
              )}
              {t("actions.preview")}
            </Button>
            <span data-testid="preview-count" aria-live="polite">
              {preview === null
                ? t("form.recipientsUnknown")
                : t("form.recipientsPreview", { count: preview })}
            </span>
          </div>
        </fieldset>

        {/* ── Message ── */}
        <TextField
          id="n-title"
          name="title"
          label={t("form.title")}
          errors={errors}
          required
          maxLength={160}
        />
        <TextAreaField
          id="n-body"
          name="body"
          label={t("form.body")}
          errors={errors}
          required
          rows={4}
          maxLength={4000}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="n-type"
            name="type"
            label={t("form.type")}
            errors={errors}
            value={type}
            onChange={setType}
            options={typeOptions}
          />
          <SelectField
            id="n-priority"
            name="priority"
            label={t("form.priority")}
            errors={errors}
            value={priority}
            onChange={setPriority}
            options={priorityOptions}
          />
        </div>
        <TextField
          id="n-link"
          name="link"
          label={t("form.link")}
          hint={t("form.linkHint")}
          errors={errors}
          optional
          dir="ltr"
          placeholder="/files"
        />
        <FieldError errors={errors} name="target" />
        <FormFooter pending={pending} onCancel={() => onOpenChange(false)} submitLabel={t("send")} />
      </form>
      <span className="sr-only">{tc("loading")}</span>
    </DialogShell>
  );
}

/** Search users the actor may address and collect them as chips. */
function PeoplePicker({
  selected,
  onChange,
}: {
  selected: UserOption[];
  onChange: (next: UserOption[]) => void;
}) {
  const t = useTranslations("notifications");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserOption[]>([]);
  const [searching, start] = useTransition();

  useEffect(() => {
    const id = setTimeout(() => {
      start(async () => {
        const r = await searchRecipientsAction({ q });
        setResults(r.ok ? r.data : []);
      });
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  const add = (u: UserOption) => {
    if (!selected.some((s) => s.id === u.id)) onChange([...selected, u]);
  };
  const remove = (id: string) => onChange(selected.filter((s) => s.id !== id));
  const visible = results.filter((r) => !selected.some((s) => s.id === r.id));

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <Label htmlFor="n-people">{t("form.users")}</Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="n-people"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("form.usersHint")}
            className="min-h-11 ps-9"
            autoComplete="off"
            data-testid="people-search"
          />
          {searching && (
            <Loader2
              className="absolute end-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
              aria-hidden
            />
          )}
        </div>
      </div>
      {selected.length > 0 && (
        <ul
          className="flex flex-wrap gap-1.5"
          aria-label={t("form.selected", { count: selected.length })}
          data-testid="people-selected"
        >
          {selected.map((u) => (
            <li
              key={u.id}
              className="flex items-center gap-1 rounded-full bg-primary/15 ps-3 pe-1 text-xs text-primary"
            >
              <span className="max-w-40 truncate">{u.name}</span>
              <button
                type="button"
                onClick={() => remove(u.id)}
                aria-label={t("form.remove", { name: u.name })}
                className="flex size-6 items-center justify-center rounded-full hover:bg-primary/20"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <ul
        className="max-h-48 space-y-0.5 overflow-y-auto rounded-md border border-border p-1"
        data-testid="people-results"
      >
        {visible.length === 0 && !searching && (
          <li className="px-2 py-3 text-center text-sm text-muted-foreground">{t("form.noResults")}</li>
        )}
        {visible.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              onClick={() => add(u)}
              className="flex min-h-11 w-full items-center gap-3 rounded px-2 text-start hover:bg-muted"
            >
              <span className="min-w-0 flex-1 truncate text-sm">{u.name}</span>
              <span dir="ltr" className="font-mono text-xs text-muted-foreground">
                {u.academicId}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
