"use client";

/**
 * Audit entry details — a side sheet (bottom sheet on mobile) with the metadata block and a key-wise
 * before/after diff. Purely presentational; the entry is loaded server-side by the page (`?entry=<id>`).
 */
import { Check, Copy } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import type { AuditEntry } from "@/features/audit/queries";
import { diffSnapshots, type DiffKind } from "@/features/audit/schemas";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { prettyIp } from "../dashboard/my-sessions";
import { ActorCell } from "./actor-cell";

type Props = { entry: AuditEntry | null; open: boolean; onOpenChange: (open: boolean) => void };

const KIND_STYLE: Record<DiffKind, string> = {
  added: "border-primary/40 bg-primary/10 text-primary",
  removed: "border-destructive/40 bg-destructive/10 text-destructive",
  changed: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  same: "text-muted-foreground",
};

function Value({ value }: { value: unknown }) {
  if (value === undefined) return <span className="text-muted-foreground/60">—</span>;
  if (value === null) return <span className="font-mono text-xs text-muted-foreground">null</span>;
  if (typeof value === "object")
    return (
      <pre
        className="max-h-40 overflow-auto rounded bg-muted/50 p-2 font-mono text-[11px] leading-snug"
        dir="ltr"
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  return (
    <span className="font-mono text-xs break-all" dir="auto">
      {String(value)}
    </span>
  );
}

export function EntrySheet({ entry, open, onOpenChange }: Props) {
  const t = useTranslations("audit");
  const f = useFormatter();
  const mobile = !useMediaQuery("(min-width: 768px)");
  const [onlyChanges, setOnlyChanges] = useState(true);
  const [copied, setCopied] = useState(false);

  const rows = useMemo(() => (entry ? diffSnapshots(entry.before, entry.after) : []), [entry]);
  const visible = onlyChanges ? rows.filter((r) => r.kind !== "same") : rows;

  const copy = async () => {
    if (!entry) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify({ before: entry.before, after: entry.after }, null, 2),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (insecure context) — button simply stays */
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={mobile ? "bottom" : "end"}
        className={cn("gap-0 p-0", mobile ? "h-[88dvh] rounded-t-2xl" : "w-full sm:max-w-xl")}
        data-testid="audit-entry-sheet"
      >
        <SheetHeader className="border-b border-border pb-3">
          <SheetTitle className="flex flex-wrap items-center gap-2 text-base">
            {t("sheet.title")}
            {entry && (
              <Badge variant="outline" className="font-mono text-[11px]" dir="ltr">
                {entry.action}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription>
            {entry
              ? f.dateTime(entry.createdAt, { dateStyle: "full", timeStyle: "medium" })
              : t("sheet.notFound")}
          </SheetDescription>
        </SheetHeader>

        {entry && (
          <ScrollRegion label={t("sheet.title")} className="px-4 py-3">
            <section aria-labelledby="audit-meta" className="space-y-2">
              <h3
                id="audit-meta"
                className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                {t("sheet.meta")}
              </h3>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">{t("columns.actor")}</dt>
                <dd>
                  <ActorCell actor={entry.actor} />
                </dd>
                <dt className="text-muted-foreground">{t("columns.entity")}</dt>
                <dd className="font-mono text-xs" dir="ltr">
                  {entry.entity}
                </dd>
                {entry.entityId && (
                  <>
                    <dt className="text-muted-foreground">{t("sheet.entityId")}</dt>
                    <dd className="font-mono text-xs break-all" dir="ltr">
                      {entry.entityId}
                    </dd>
                  </>
                )}
                {entry.ip && (
                  <>
                    <dt className="text-muted-foreground">{t("columns.ip")}</dt>
                    <dd className="font-mono text-xs" dir="ltr">
                      {prettyIp(entry.ip)}
                    </dd>
                  </>
                )}
                {entry.requestId && (
                  <>
                    <dt className="text-muted-foreground">{t("sheet.requestId")}</dt>
                    <dd className="font-mono text-xs break-all" dir="ltr">
                      {entry.requestId}
                    </dd>
                  </>
                )}
                {entry.userAgent && (
                  <>
                    <dt className="text-muted-foreground">{t("sheet.userAgent")}</dt>
                    <dd className="text-xs break-words text-muted-foreground" dir="ltr">
                      {entry.userAgent}
                    </dd>
                  </>
                )}
              </dl>
            </section>

            <section aria-labelledby="audit-diff" className="mt-5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3
                  id="audit-diff"
                  className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  {t("sheet.diff")}
                </h3>
                {rows.length > 0 && (
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-xs">
                      <Switch
                        checked={onlyChanges}
                        onCheckedChange={setOnlyChanges}
                        aria-label={t("sheet.onlyChanges")}
                      />
                      {t("sheet.onlyChanges")}
                    </label>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1 px-2 text-xs"
                      onClick={() => void copy()}
                    >
                      {copied ? (
                        <Check className="size-3.5" aria-hidden />
                      ) : (
                        <Copy className="size-3.5" aria-hidden />
                      )}
                      {copied ? t("sheet.copied") : t("sheet.copy")}
                    </Button>
                  </div>
                )}
              </div>
              {!entry.hasDiff ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  {t("sheet.noDiff")}
                </p>
              ) : (
                <ul
                  className="divide-y divide-border rounded-lg border border-border"
                  data-testid="audit-diff"
                >
                  {visible.map((r) => (
                    <li key={r.key} className="grid gap-1 p-2.5 text-sm" data-kind={r.kind}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-medium" dir="ltr">
                          {r.key}
                        </span>
                        <Badge variant="outline" className={cn("text-[10px]", KIND_STYLE[r.kind])}>
                          {t(`sheet.kind.${r.kind}`)}
                        </Badge>
                      </div>
                      {r.kind !== "added" && (
                        <div className="grid grid-cols-[auto_1fr] items-start gap-x-2">
                          <span className="text-[11px] text-muted-foreground">{t("sheet.before")}</span>
                          <Value value={r.before} />
                        </div>
                      )}
                      {r.kind !== "removed" && (
                        <div className="grid grid-cols-[auto_1fr] items-start gap-x-2">
                          <span className="text-[11px] text-muted-foreground">{t("sheet.after")}</span>
                          <Value value={r.after} />
                        </div>
                      )}
                    </li>
                  ))}
                  {visible.length === 0 && (
                    <li className="p-3 text-center text-xs text-muted-foreground">{t("sheet.kind.same")}</li>
                  )}
                </ul>
              )}
            </section>
          </ScrollRegion>
        )}
      </SheetContent>
    </Sheet>
  );
}
