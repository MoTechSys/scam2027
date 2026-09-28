"use client";

/**
 * Audit log list (P1-09, UC-SYS-002). ADR-0008 skeleton: search + filter row + counter are fixed, the list scrolls.
 * Filters live in the URL (shareable, back-button friendly); the details sheet is `?entry=<id>`.
 * Export = plain navigation to the streaming route (the browser handles the download; nothing is buffered here).
 */
import { Download, Filter, Search, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MobileDataTable } from "@/components/ui/mobile-data-table";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AuditEntry, AuditFacets, AuditRow } from "@/features/audit/queries";
import {
  AUDIT_ACTOR_KINDS,
  AUDIT_EXPORT_MAX_ROWS,
  actionResource,
  type AuditActorKind,
  type AuditQuery,
} from "@/features/audit/schemas";
import type { Page } from "@/lib/result";
import { cn } from "@/lib/utils";
import { prettyIp } from "../dashboard/my-sessions";
import { ActorCell } from "./actor-cell";
import { EntrySheet } from "./entry-sheet";

type Props = {
  page: Page<AuditRow>;
  query: AuditQuery;
  facets: AuditFacets;
  entry: AuditEntry | null;
  entryRequested: boolean;
  can: { export: boolean };
};

const ALL = "__all__";
const FILTER_KEYS = ["actorId", "actorKind", "entity", "action", "from", "to"] as const;

/** Colour by resource so a scan of the column reads at a glance (destructive verbs stand out). */
function actionTone(action: string): string {
  if (/\.(delete|purge|purge_auto|permanent_delete|revoke|disable)\b/.test(action))
    return "border-destructive/40 text-destructive";
  if (/\.(create|restore|send|upload|login\.success)\b/.test(action)) return "border-primary/40 text-primary";
  if (/^auth\./.test(action)) return "border-sky-500/40 text-sky-600 dark:text-sky-400";
  return "text-foreground";
}

export function AuditClient({ page, query, facets, entry, entryRequested, can }: Props) {
  const t = useTranslations("audit");
  const tc = useTranslations("common");
  const f = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, start] = useTransition();
  const [q, setQ] = useState(query.q ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const setParams = useCallback(
    (patch: Record<string, string | undefined>, opts: { keepPage?: boolean } = {}) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (!v || v === ALL) next.delete(k);
        else next.set(k, v);
      }
      if (!opts.keepPage && !("page" in patch)) next.delete("page");
      start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
    },
    [sp, router, pathname],
  );

  const activeFilters = FILTER_KEYS.filter((k) =>
    k === "actorKind" ? query.actorKind !== "ANY" : !!query[k],
  ).length;
  const clearFilters = () => setParams(Object.fromEntries([...FILTER_KEYS, "q"].map((k) => [k, undefined])));

  const exportHref = useMemo(() => {
    const p = new URLSearchParams();
    for (const k of ["q", ...FILTER_KEYS] as const) {
      const v = query[k];
      if (k === "actorKind" ? v !== "ANY" : v) p.set(k, String(v));
    }
    return `/api/audit/export${p.size ? `?${p}` : ""}`;
  }, [query]);

  const openEntry = (id: string) => setParams({ entry: id }, { keepPage: true });
  const closeEntry = () => setParams({ entry: undefined }, { keepPage: true });

  const whenCell = (r: AuditRow) => (
    <time dateTime={r.createdAt.toISOString()} className="text-xs whitespace-nowrap tabular-nums" dir="ltr">
      {f.dateTime(r.createdAt, { dateStyle: "medium", timeStyle: "short" })}
    </time>
  );
  const actionCell = (r: AuditRow) => (
    <Badge variant="outline" className={cn("font-mono text-[11px]", actionTone(r.action))} dir="ltr">
      {r.action}
    </Badge>
  );
  const entityCell = (r: AuditRow) => (
    <span className="flex min-w-0 flex-col leading-tight" dir="ltr">
      <span className="text-xs font-medium">{r.entity}</span>
      {r.entityId && (
        <span className="truncate font-mono text-[10px] text-muted-foreground">{r.entityId}</span>
      )}
    </span>
  );
  const ipCell = (r: AuditRow) => (
    <span className="font-mono text-xs text-muted-foreground" dir="ltr">
      {prettyIp(r.ip)}
    </span>
  );
  const detailsCell = (r: AuditRow) => (
    <Button
      size="sm"
      variant={r.hasDiff ? "outline" : "ghost"}
      className="min-h-9"
      onClick={() => openEntry(r.id)}
      data-testid="audit-view"
      aria-label={`${t("view")}: ${r.action}`}
    >
      {t("view")}
    </Button>
  );

  const columns: Column<AuditRow>[] = useMemo(
    () => [
      { key: "createdAt", header: t("columns.when"), render: whenCell, className: "w-40" },
      {
        key: "actor",
        header: t("columns.actor"),
        render: (r) => <ActorCell actor={r.actor} />,
        className: "max-w-48",
      },
      { key: "action", header: t("columns.action"), render: actionCell },
      { key: "entity", header: t("columns.entity"), render: entityCell, className: "max-w-64" },
      { key: "ip", header: t("columns.ip"), render: ipCell, className: "w-32" },
      { key: "id", header: t("columns.details"), render: detailsCell, className: "w-28 text-end" },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, f],
  );

  const pagination = {
    currentPage: page.page,
    totalPages: page.pageCount,
    onPageChange: (p: number) => setParams({ page: String(p) }),
    labels: {
      prev: tc("prev"),
      next: tc("next"),
      page: (c: number, n: number) => tc("pageOf", { current: c, total: n }),
    },
  };

  const selectClass = "min-h-10 w-full lg:min-h-11";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:gap-4" data-testid="page-shell">
      <div className="grid grid-cols-[1fr_auto] gap-2 lg:flex lg:items-center lg:gap-3">
        <form
          role="search"
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            setParams({ q: q.trim() || undefined });
          }}
        >
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={tc("search")}
            className="min-h-10 ps-10 lg:min-h-11"
            data-testid="audit-search"
          />
        </form>
        <Button
          variant={activeFilters ? "default" : "outline"}
          className="min-h-10 gap-2 lg:min-h-11"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
          aria-controls="audit-filters"
          data-testid="audit-toggle-filters"
        >
          <Filter className="size-4" aria-hidden />
          <span className="hidden sm:inline">{tc("filters")}</span>
          {activeFilters > 0 && <Badge className="px-1.5 text-[10px]">{activeFilters}</Badge>}
        </Button>
        {can.export && (
          <Button asChild variant="outline" className="col-span-2 min-h-10 gap-2 lg:col-span-1 lg:min-h-11">
            <a
              href={exportHref}
              download
              data-testid="audit-export"
              title={t("export.hint", { max: f.number(AUDIT_EXPORT_MAX_ROWS) })}
              onClick={() => toast.info(t("export.started"))}
            >
              <Download className="size-4" aria-hidden /> {t("export.button")}
            </a>
          </Button>
        )}
      </div>

      {filtersOpen && (
        <div
          id="audit-filters"
          className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-card/40 p-2 lg:grid-cols-6 lg:p-3"
          data-testid="audit-filters"
        >
          <div className="space-y-1">
            <Label className="text-xs">{t("filters.actorKind.ANY")}</Label>
            <Select
              value={query.actorKind}
              onValueChange={(v) => setParams({ actorKind: v as AuditActorKind })}
            >
              <SelectTrigger className={selectClass} aria-label={t("filters.actor")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUDIT_ACTOR_KINDS.map((k) => (
                  <SelectItem key={k} value={k} className="min-h-10">
                    {t(`filters.actorKind.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("filters.actor")}</Label>
            <Select value={query.actorId ?? ALL} onValueChange={(v) => setParams({ actorId: v })}>
              <SelectTrigger className={selectClass} aria-label={t("filters.actor")}>
                <SelectValue placeholder={t("filters.anyActor")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL} className="min-h-10">
                  {t("filters.anyActor")}
                </SelectItem>
                {facets.actors.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="min-h-10">
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("filters.entity")}</Label>
            <Select value={query.entity ?? ALL} onValueChange={(v) => setParams({ entity: v })}>
              <SelectTrigger className={selectClass} aria-label={t("filters.entity")}>
                <SelectValue placeholder={t("filters.anyEntity")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL} className="min-h-10">
                  {t("filters.anyEntity")}
                </SelectItem>
                {facets.entities.map((e) => (
                  <SelectItem key={e} value={e} className="min-h-10 font-mono text-xs">
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("filters.action")}</Label>
            <Select value={query.action ?? ALL} onValueChange={(v) => setParams({ action: v })}>
              <SelectTrigger className={selectClass} aria-label={t("filters.action")}>
                <SelectValue placeholder={t("filters.anyAction")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL} className="min-h-10">
                  {t("filters.anyAction")}
                </SelectItem>
                {[...new Set(facets.actions.map(actionResource))].map((res) => (
                  <SelectItem key={`${res}.`} value={`${res}.`} className="min-h-10 font-mono text-xs">
                    {res}.*
                  </SelectItem>
                ))}
                {facets.actions.map((a) => (
                  <SelectItem key={a} value={a} className="min-h-10 ps-6 font-mono text-xs">
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-from" className="text-xs">
              {t("filters.from")}
            </Label>
            <Input
              id="audit-from"
              type="date"
              value={query.from ?? ""}
              max={query.to}
              onChange={(e) => setParams({ from: e.target.value || undefined })}
              className={selectClass}
              dir="ltr"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-to" className="text-xs">
              {t("filters.to")}
            </Label>
            <Input
              id="audit-to"
              type="date"
              value={query.to ?? ""}
              min={query.from}
              onChange={(e) => setParams({ to: e.target.value || undefined })}
              className={selectClass}
              dir="ltr"
            />
          </div>
        </div>
      )}

      <div className="flex min-h-8 flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground lg:text-sm" aria-live="polite" data-testid="audit-total">
          {t("total", { count: page.total })} ·{" "}
          {t("filters.active", { count: activeFilters + (query.q ? 1 : 0) })}
        </p>
        {(activeFilters > 0 || query.q) && (
          <Button
            size="sm"
            variant="ghost"
            className="ms-auto min-h-8 gap-1 text-xs"
            onClick={clearFilters}
            data-testid="audit-clear"
          >
            <X className="size-3.5" aria-hidden /> {t("filters.clear")}
          </Button>
        )}
      </div>

      <ScrollRegion label={t("title")} className="-mx-1 px-1">
        <div className="hidden md:block">
          <DataTable
            columns={columns}
            data={page.items}
            keyExtractor={(r) => r.id}
            emptyMessage={t("empty")}
            pagination={pagination}
            maxHeight="none"
          />
        </div>
        <div className="md:hidden">
          <MobileDataTable
            columns={[
              { key: "action", header: t("columns.action"), primary: true, render: actionCell },
              {
                key: "actor",
                header: t("columns.actor"),
                secondary: true,
                render: (r) => <ActorCell actor={r.actor} link={false} />,
              },
              { key: "entity", header: t("columns.entity"), render: entityCell },
              { key: "createdAt", header: t("columns.when"), render: whenCell },
            ]}
            data={page.items}
            keyExtractor={(r) => r.id}
            emptyMessage={t("empty")}
            actionsLabel={tc("actions")}
            actions={[{ label: t("view"), onClick: (r) => openEntry(r.id) }]}
            onItemClick={(r) => openEntry(r.id)}
            pagination={pagination}
          />
        </div>
      </ScrollRegion>

      <EntrySheet entry={entry} open={entryRequested} onOpenChange={(o) => !o && closeEntry()} />
    </div>
  );
}
