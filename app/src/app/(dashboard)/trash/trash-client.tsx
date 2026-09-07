"use client";

/**
 * Unified trash — one tab per soft-deletable kind with a badge, search, desktop table with multi-select + mobile
 * list, row / bulk restore and permanent delete, "empty this tab" with typed confirmation, and a manual run of the
 * 30-day retention job (P1-08, FR-SYS-001). Built on the ADR-0008 list-page skeleton: tabs, toolbar and counter
 * are fixed, only the list scrolls.
 */
import { Clock, MoreHorizontal, RotateCcw, Search, Trash2, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type Column } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { MobileDataTable } from "@/components/ui/mobile-data-table";
import { PageTabs } from "@/components/ui/page-tabs";
import { ScrollRegion } from "@/components/ui/scroll-region";
import {
  emptyTrashAction,
  purgeItemsAction,
  restoreItemsAction,
  schedulePurgeJobAction,
} from "@/features/trash/actions";
import type { TrashRow } from "@/features/trash/queries";
import { TRASH_KINDS, TRASH_RETENTION_DAYS, type TrashKind, type TrashQuery } from "@/features/trash/schemas";
import type { Page } from "@/lib/result";
import { TypedConfirmDialog } from "@/components/typed-confirm-dialog";

export type Can = { restore: boolean; purge: boolean };
type Props = { page: Page<TrashRow>; query: TrashQuery; counts: Record<TrashKind, number>; can: Can };

export function TrashClient({ page, query, counts, can }: Props) {
  const t = useTranslations("trash");
  const tc = useTranslations("common");
  const f = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, start] = useTransition();
  const [q, setQ] = useState(query.q);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [purge, setPurge] = useState<TrashRow[] | null>(null);
  const [emptyTab, setEmptyTab] = useState(false);
  const [runJob, setRunJob] = useState(false);
  const kind = query.kind;

  const setParams = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (!v) next.delete(k);
        else next.set(k, v);
      }
      if (!("page" in patch)) next.delete("page");
      setSelected(new Set());
      start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`));
    },
    [sp, router, pathname],
  );

  const restore = useCallback(
    async (ids: string[]) => {
      const r = await restoreItemsAction({ kind, ids });
      if (!r.ok) return toast.error(r.message);
      if (r.data.restored) toast.success(t("toast.restored", { count: r.data.restored }));
      for (const fkey of r.data.failed) toast.error(fkey.message);
      setSelected(new Set());
      router.refresh();
    },
    [kind, router, t],
  );

  const allOnPage = page.items.length > 0 && page.items.every((r) => selected.has(r.id));
  const toggleAll = (c: boolean) => setSelected(c ? new Set(page.items.map((r) => r.id)) : new Set());
  const toggle = (id: string, c: boolean) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (c) n.add(id);
      else n.delete(id);
      return n;
    });

  const daysLeft = (r: TrashRow) =>
    Math.max(0, Math.ceil((r.purgeAfter.getTime() - Date.now()) / 86_400_000));

  const titleCell = (r: TrashRow) => (
    <div className="flex min-w-0 flex-col" data-testid="trash-row" data-id={r.id}>
      <span className="truncate font-medium text-foreground" title={r.title}>
        {r.title}
      </span>
      {r.subtitle && (
        <span className="truncate text-xs text-muted-foreground" dir="auto">
          {r.subtitle}
        </span>
      )}
    </div>
  );
  const metaCell = (r: TrashRow) =>
    r.meta ? (
      <span className="text-xs text-muted-foreground tabular-nums" dir="auto">
        {kind === "OFFERING" || kind === "NOTIFICATION" ? t(`meta.${kind}`, { value: r.meta }) : r.meta}
      </span>
    ) : null;
  const deletedCell = (r: TrashRow) => (
    <span className="text-xs tabular-nums">
      {f.dateTime(r.deletedAt, { dateStyle: "medium", timeStyle: "short" })}
    </span>
  );
  const purgeCell = (r: TrashRow) => {
    const d = daysLeft(r);
    return (
      <Badge
        variant="outline"
        className={d <= 3 ? "border-destructive/40 text-destructive" : "text-muted-foreground"}
        title={f.dateTime(r.purgeAfter, { dateStyle: "medium" })}
      >
        <Clock className="size-3" aria-hidden /> {t("purgeIn", { days: d })}
      </Badge>
    );
  };
  const actionsCell = (r: TrashRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`${tc("actions")}: ${r.title}`} className="size-9">
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {can.restore && (
          <DropdownMenuItem
            onSelect={() => void restore([r.id])}
            className="min-h-10 gap-2"
            data-testid="restore"
          >
            <RotateCcw className="size-4" aria-hidden /> {t("actions.restore")}
          </DropdownMenuItem>
        )}
        {can.restore && can.purge && <DropdownMenuSeparator />}
        {can.purge && (
          <DropdownMenuItem
            onSelect={() => setPurge([r])}
            variant="destructive"
            className="min-h-10 gap-2"
            data-testid="purge"
          >
            <Trash2 className="size-4" aria-hidden /> {t("actions.purge")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const columns: Column<TrashRow>[] = useMemo(
    () => [
      {
        key: "id",
        header: "",
        className: "w-10",
        render: (r) => (
          <Checkbox
            checked={selected.has(r.id)}
            onCheckedChange={(c) => toggle(r.id, c === true)}
            aria-label={`${t("select")}: ${r.title}`}
            data-testid="select-row"
          />
        ),
      },
      { key: "title", header: t("columns.item"), render: titleCell, className: "max-w-md" },
      { key: "meta", header: t(`columns.meta.${kind}`), render: metaCell },
      { key: "deletedAt", header: t("columns.deletedAt"), render: deletedCell },
      { key: "purgeAfter", header: t("columns.purgeAfter"), render: purgeCell },
      ...(can.restore || can.purge
        ? [{ key: "kind" as const, header: tc("actions"), className: "w-12 text-end", render: actionsCell }]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, tc, can, kind, selected, page.items],
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

  const mobileActions = [
    ...(can.restore ? [{ label: t("actions.restore"), onClick: (r: TrashRow) => void restore([r.id]) }] : []),
    ...(can.purge
      ? [
          {
            label: t("actions.purge"),
            variant: "destructive" as const,
            onClick: (r: TrashRow) => setPurge([r]),
          },
        ]
      : []),
  ];

  const selectedRows = page.items.filter((r) => selected.has(r.id));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:gap-4" data-testid="page-shell">
      <PageTabs
        tabs={TRASH_KINDS.map((id) => ({ id, label: t(`tabs.${id}`), badge: counts[id] ?? 0 }))}
        activeTab={kind}
        onTabChange={(id) => setParams({ kind: id, q: undefined })}
      />

      <div className="grid grid-cols-2 gap-2 lg:flex lg:items-center lg:gap-3">
        <form
          role="search"
          className="relative col-span-2 flex-1 lg:col-span-1"
          onSubmit={(e) => {
            e.preventDefault();
            setParams({ q });
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
          />
        </form>
        {can.purge && (
          <Button
            variant="outline"
            onClick={() => setRunJob(true)}
            className="min-h-10 gap-2 lg:min-h-11"
            data-testid="run-purge-job"
          >
            <Clock className="size-4" aria-hidden /> {t("actions.runJob")}
          </Button>
        )}
        {can.purge && (counts[kind] ?? 0) > 0 && (
          <Button
            variant="destructive"
            onClick={() => setEmptyTab(true)}
            className="min-h-10 gap-2 lg:min-h-11"
            data-testid="empty-trash"
          >
            <Trash2 className="size-4" aria-hidden /> {t("actions.emptyTab", { tab: t(`tabs.${kind}`) })}
          </Button>
        )}
      </div>

      <div className="flex min-h-8 flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground lg:text-sm" aria-live="polite">
          {t("total", { count: page.total })} · {t("retention", { days: TRASH_RETENTION_DAYS })}
        </p>
        {selectedRows.length > 0 && (
          <div className="ms-auto flex items-center gap-2" data-testid="bulk-bar">
            <span className="text-xs font-medium">{t("selected", { count: selectedRows.length })}</span>
            {can.restore && (
              <Button
                size="sm"
                variant="outline"
                className="min-h-9 gap-1"
                onClick={() => void restore([...selected])}
                data-testid="bulk-restore"
              >
                <RotateCcw className="size-3.5" aria-hidden /> {t("actions.restore")}
              </Button>
            )}
            {can.purge && (
              <Button
                size="sm"
                variant="destructive"
                className="min-h-9 gap-1"
                onClick={() => setPurge(selectedRows)}
                data-testid="bulk-purge"
              >
                <Trash2 className="size-3.5" aria-hidden /> {t("actions.purge")}
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="size-9"
              aria-label={tc("reset")}
              onClick={() => setSelected(new Set())}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </div>
        )}
      </div>

      <ScrollRegion label={t("title")} className="-mx-1 px-1">
        <div className="hidden md:block">
          {page.items.length > 0 && (
            <div className="mb-2 flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <Checkbox
                checked={allOnPage}
                onCheckedChange={(c) => toggleAll(c === true)}
                aria-label={t("selectAll")}
                data-testid="select-all"
              />
              <span>{t("selectAll")}</span>
            </div>
          )}
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
              { key: "title", header: t("columns.item"), primary: true, render: titleCell },
              { key: "meta", header: t(`columns.meta.${kind}`), secondary: true, render: metaCell },
              { key: "purgeAfter", header: t("columns.purgeAfter"), badge: true, render: purgeCell },
              { key: "deletedAt", header: t("columns.deletedAt"), render: deletedCell },
            ]}
            data={page.items}
            keyExtractor={(r) => r.id}
            emptyMessage={t("empty")}
            actionsLabel={tc("actions")}
            actions={mobileActions}
            pagination={pagination}
          />
        </div>
      </ScrollRegion>

      <ConfirmDialog
        open={!!purge}
        onOpenChange={(o) => !o && setPurge(null)}
        title={
          purge?.length === 1
            ? `${t("actions.purge")}: ${purge[0]!.title}`
            : t("confirm.purgeManyTitle", { count: purge?.length ?? 0 })
        }
        body={t("confirm.purge")}
        destructive
        onConfirm={async () => {
          if (!purge) return { ok: true, data: null };
          const r = await purgeItemsAction({ kind, ids: purge.map((p) => p.id) });
          if (r.ok) {
            toast.success(t("toast.purged", { count: r.data.purged }));
            if (r.data.blocked) toast.warning(t("toast.blocked", { count: r.data.blocked }));
            setSelected(new Set());
          }
          return r;
        }}
      />
      <TypedConfirmDialog
        open={emptyTab}
        onOpenChange={setEmptyTab}
        title={t("actions.emptyTab", { tab: t(`tabs.${kind}`) })}
        body={t("confirm.emptyTab", { count: counts[kind] ?? 0 })}
        keyword="DELETE"
        onConfirm={async () => {
          const r = await emptyTrashAction({ kind });
          if (r.ok) {
            const k = r.data[kind];
            toast.success(t("toast.purged", { count: k.purged }));
            if (k.blocked) toast.warning(t("toast.blocked", { count: k.blocked }));
          }
          return r;
        }}
      />
      <ConfirmDialog
        open={runJob}
        onOpenChange={setRunJob}
        title={t("actions.runJob")}
        body={t("confirm.runJob", { days: TRASH_RETENTION_DAYS })}
        onConfirm={async () => {
          const r = await schedulePurgeJobAction({});
          if (r.ok) toast.success(t("toast.jobScheduled"));
          return r;
        }}
      />
    </div>
  );
}
