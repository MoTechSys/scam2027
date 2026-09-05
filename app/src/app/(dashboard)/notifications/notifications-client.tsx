"use client";

/**
 * Notification centre — tabs (all / unread / archive / sent / preferences), search + type filter, inbox list with
 * per-row read/archive actions, sent table with read stats, preference switches and the compose dialog (P1-07).
 * The inbox is a single responsive list (no separate desktop table) — notification rows are card-like on every size.
 */
import {
  Archive,
  ArchiveRestore,
  Bell,
  CheckCheck,
  ExternalLink,
  Mail,
  MailOpen,
  MoreHorizontal,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { DataTable, TablePagination, type Column } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MobileDataTable } from "@/components/ui/mobile-data-table";
import { PageTabs } from "@/components/ui/page-tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  archiveAction,
  deleteNotificationAction,
  markAllReadAction,
  markReadAction,
  markUnreadAction,
  savePreferencesAction,
  unarchiveAction,
} from "@/features/notifications/actions";
import type { InboxRow, PreferenceRow, SentRow, TargetLookups } from "@/features/notifications/queries";
import {
  INBOX_TABS,
  NOTIFICATION_TYPES,
  type InboxQuery,
  type InboxTab,
  type NotificationTargetKind,
} from "@/features/notifications/schemas";
import type { Page, Result } from "@/lib/result";
import { cn } from "@/lib/utils";
import { PriorityBadge, TargetLabel, TypeBadge } from "./badges";
import { ComposeDialog } from "./compose-dialog";

type Tab = InboxTab | "PREFS";
export type Can = { send: boolean; viewSent: boolean; admin: boolean };
type Props = {
  tab: Tab;
  query: InboxQuery;
  inbox: Page<InboxRow> | null;
  sent: Page<SentRow> | null;
  counts: Record<InboxTab, number>;
  prefs: PreferenceRow[];
  lookups: TargetLookups | null;
  allowedKinds: NotificationTargetKind[];
  openCompose: boolean;
  can: Can;
};

export function NotificationsClient({
  tab,
  query,
  inbox,
  sent,
  counts,
  prefs,
  lookups,
  allowedKinds,
  openCompose,
  can,
}: Props) {
  const t = useTranslations("notifications");
  const tc = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, start] = useTransition();
  const [compose, setCompose] = useState(openCompose);
  const [del, setDel] = useState<SentRow | null>(null);
  const [q, setQ] = useState(query.q);

  const setParams = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(sp.toString());
      next.delete("new");
      for (const [k, v] of Object.entries(patch)) {
        if (!v || v === "ALL") next.delete(k);
        else next.set(k, v);
      }
      if (!("page" in patch)) next.delete("page");
      start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`));
    },
    [sp, router, pathname],
  );

  const tabs = useMemo(() => {
    const list: { id: string; label: string; badge: number }[] = INBOX_TABS.filter(
      (k) => k !== "SENT" || can.viewSent,
    ).map((k) => ({
      id: k as string,
      label: t(`tabs.${k}`),
      badge:
        k === "SENT"
          ? counts.SENT
          : k === "UNREAD"
            ? counts.UNREAD
            : k === "ALL"
              ? counts.ALL
              : counts.ARCHIVED,
    }));
    list.push({ id: "PREFS", label: t("tabs.PREFS"), badge: 0 });
    return list;
  }, [t, counts, can.viewSent]);

  const act = (fn: () => Promise<Result<unknown>>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.message);
      else {
        toast.success(ok);
        router.refresh();
      }
    });

  const toolbar = (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      {tab !== "PREFS" && (
        <div className="grid flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
          <div className="space-y-1.5">
            <Label htmlFor="notif-q" className="sr-only">
              {tc("search")}
            </Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="notif-q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setParams({ q })}
                onBlur={() => q !== query.q && setParams({ q })}
                placeholder={t("filters.search")}
                className="min-h-11 ps-9"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notif-type" className="sr-only">
              {t("filters.type")}
            </Label>
            <Select value={query.type ?? "ALL"} onValueChange={(v) => setParams({ type: v })}>
              <SelectTrigger id="notif-type" className="min-h-11 w-full">
                <SelectValue placeholder={t("filters.allTypes")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("filters.allTypes")}</SelectItem>
                {NOTIFICATION_TYPES.map((v) => (
                  <SelectItem key={v} value={v}>
                    {t(`type.${v}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {(tab === "ALL" || tab === "UNREAD") && counts.UNREAD > 0 && (
          <Button
            variant="outline"
            className="min-h-11 gap-2"
            data-testid="mark-all-read"
            onClick={() => act(() => markAllReadAction(), t("toast.readAll", { count: counts.UNREAD }))}
          >
            <CheckCheck className="size-4" aria-hidden />
            {t("actions.markAllRead")}
          </Button>
        )}
        {can.send && lookups && (
          <Button
            className="min-h-11 gap-2"
            data-testid="compose-notification"
            onClick={() => setCompose(true)}
          >
            <Send className="size-4" aria-hidden />
            {t("actions.compose")}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <PageTabs tabs={tabs} activeTab={tab} onTabChange={(id) => setParams({ tab: id })} />
      {toolbar}

      {tab === "PREFS" && <Preferences prefs={prefs} />}
      {tab === "SENT" && sent && (
        <SentTable page={sent} can={can} onDelete={setDel} onPage={(p) => setParams({ page: String(p) })} />
      )}
      {tab !== "PREFS" && tab !== "SENT" && inbox && (
        <InboxList page={inbox} tab={tab} act={act} onPage={(p) => setParams({ page: String(p) })} />
      )}

      {can.send && lookups && (
        <ComposeDialog
          open={compose}
          onOpenChange={setCompose}
          lookups={lookups}
          allowedKinds={allowedKinds}
        />
      )}
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={t("confirm.deleteTitle")}
        body={t("confirm.deleteDesc")}
        destructive
        onConfirm={() => deleteNotificationAction({ id: del!.id })}
      />
    </div>
  );
}

/* ───────────── Inbox ───────────── */
function InboxList({
  page,
  tab,
  act,
  onPage,
}: {
  page: Page<InboxRow>;
  tab: InboxTab;
  act: (fn: () => Promise<Result<unknown>>, ok: string) => void;
  onPage: (p: number) => void;
}) {
  const t = useTranslations("notifications");
  const tc = useTranslations("common");
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }),
    [],
  );
  const [expanded, setExpanded] = useState<string | null>(null);

  if (page.items.length === 0)
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-14 text-center"
        data-testid="inbox-empty"
      >
        <Bell className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">{t(`empty.${tab}`)}</p>
      </div>
    );

  const toggle = (n: InboxRow) => {
    setExpanded((e) => (e === n.id ? null : n.id));
    if (!n.readAt) act(() => markReadAction({ ids: [n.id] }), t("toast.read"));
  };

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-lg border border-border" data-testid="inbox-list">
        {page.items.map((n) => {
          const unread = !n.readAt;
          const open = expanded === n.id;
          return (
            <li
              key={n.id}
              data-testid="inbox-item"
              data-unread={unread}
              className={cn("flex gap-3 px-3 py-3 sm:px-4", unread && "bg-primary/5")}
            >
              <span className="mt-2 flex w-2 shrink-0 justify-center" aria-hidden>
                {unread && <span className="size-2 rounded-full bg-primary" />}
              </span>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  className="block w-full text-start"
                  aria-expanded={open}
                  onClick={() => toggle(n)}
                  data-testid="inbox-title"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-sm",
                        unread ? "font-semibold" : "font-medium",
                      )}
                    >
                      {n.title}
                    </span>
                    {unread && <span className="sr-only">{t("unreadDot")}</span>}
                    <PriorityBadge value={n.priority} />
                    <TypeBadge value={n.type} />
                  </div>
                  <p
                    className={cn(
                      "mt-1 text-sm text-muted-foreground",
                      open ? "whitespace-pre-wrap" : "line-clamp-2",
                    )}
                  >
                    {n.body}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {n.senderName ? t("from", { name: n.senderName }) : t("system")} ·{" "}
                    <time dateTime={new Date(n.deliveredAt).toISOString()} dir="ltr">
                      {dateFmt.format(new Date(n.deliveredAt))}
                    </time>
                  </p>
                </button>
                {open && n.link && (
                  <Button asChild variant="link" size="sm" className="mt-1 h-9 gap-1.5 px-0">
                    <Link href={n.link} data-testid="inbox-link">
                      <ExternalLink className="size-3.5" aria-hidden />
                      {t("actions.open")}
                    </Link>
                  </Button>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0"
                    aria-label={`${tc("actions")}: ${n.title}`}
                    data-testid="inbox-actions"
                  >
                    <MoreHorizontal className="size-4" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {unread ? (
                    <DropdownMenuItem
                      className="min-h-11 gap-2"
                      onClick={() => act(() => markReadAction({ ids: [n.id] }), t("toast.read"))}
                    >
                      <MailOpen className="size-4" aria-hidden /> {t("actions.markRead")}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      className="min-h-11 gap-2"
                      onClick={() => act(() => markUnreadAction({ ids: [n.id] }), t("toast.unread"))}
                    >
                      <Mail className="size-4" aria-hidden /> {t("actions.markUnread")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {n.archivedAt ? (
                    <DropdownMenuItem
                      className="min-h-11 gap-2"
                      onClick={() => act(() => unarchiveAction({ ids: [n.id] }), t("toast.unarchived"))}
                    >
                      <ArchiveRestore className="size-4" aria-hidden /> {t("actions.unarchive")}
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      className="min-h-11 gap-2"
                      onClick={() => act(() => archiveAction({ ids: [n.id] }), t("toast.archived"))}
                    >
                      <Archive className="size-4" aria-hidden /> {t("actions.archive")}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
      </ul>
      {page.pageCount > 1 && (
        <TablePagination
          currentPage={page.page}
          totalPages={page.pageCount}
          onPageChange={onPage}
          labels={{
            prev: tc("prev"),
            next: tc("next"),
            page: (c, n) => tc("pageOf", { current: c, total: n }),
          }}
        />
      )}
    </div>
  );
}

/* ───────────── Sent ───────────── */
function SentTable({
  page,
  can,
  onDelete,
  onPage,
}: {
  page: Page<SentRow>;
  can: Can;
  onDelete: (r: SentRow) => void;
  onPage: (p: number) => void;
}) {
  const t = useTranslations("notifications");
  const tc = useTranslations("common");
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }),
    [],
  );
  const mayDelete = (r: SentRow) => can.admin || r.isOwner;

  const readCell = (r: SentRow) => {
    const pct = r.recipientCount > 0 ? Math.round((r.readCount / r.recipientCount) * 100) : 0;
    return (
      <div className="min-w-32 space-y-1" data-testid="read-stats">
        <span className="text-xs tabular-nums">
          {t("readStats", { read: r.readCount, total: r.recipientCount, percent: pct })}
        </span>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  const columns: Column<SentRow>[] = [
    {
      key: "title",
      header: t("columns.title"),
      render: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium" data-testid="sent-title">
            {r.title}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {can.admin && r.senderName ? `${r.senderName} · ` : ""}
            <TargetLabel target={r.target} />
          </span>
        </div>
      ),
    },
    { key: "type", header: t("columns.type"), render: (r) => <TypeBadge value={r.type} /> },
    { key: "priority", header: t("columns.priority"), render: (r) => <PriorityBadge value={r.priority} /> },
    { key: "readCount", header: t("columns.read"), render: readCell },
    {
      key: "createdAt",
      header: t("columns.sentAt"),
      render: (r) => (
        <span className="text-xs tabular-nums" dir="ltr">
          {dateFmt.format(new Date(r.sentAt ?? r.createdAt))}
        </span>
      ),
    },
    {
      key: "id",
      header: tc("actions"),
      className: "w-14 text-end",
      render: (r) =>
        mayDelete(r) ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label={`${tc("actions")}: ${r.title}`}
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" className="min-h-11 gap-2" onClick={() => onDelete(r)}>
                <Trash2 className="size-4" aria-hidden /> {t("actions.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ];

  const pagination = {
    currentPage: page.page,
    totalPages: page.pageCount,
    onPageChange: onPage,
    labels: {
      prev: tc("prev"),
      next: tc("next"),
      page: (c: number, n: number) => tc("pageOf", { current: c, total: n }),
    },
  };

  return (
    <>
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={page.items}
          keyExtractor={(r) => r.id}
          emptyMessage={t("empty.SENT")}
          pagination={pagination}
        />
      </div>
      <div className="md:hidden">
        <MobileDataTable
          columns={[
            { ...columns[0]!, primary: true },
            {
              key: "priority",
              header: t("columns.priority"),
              render: (r) => <PriorityBadge value={r.priority} />,
              badge: true,
            },
            { key: "readCount", header: t("columns.read"), render: readCell },
            { ...columns[4]!, secondary: true },
          ]}
          data={page.items}
          keyExtractor={(r) => r.id}
          emptyMessage={t("empty.SENT")}
          actionsLabel={tc("actions")}
          actions={[
            {
              label: t("actions.delete"),
              icon: <Trash2 className="size-4" aria-hidden />,
              onClick: onDelete,
              variant: "destructive",
            },
          ]}
          pagination={pagination}
        />
      </div>
    </>
  );
}

/* ───────────── Preferences ───────────── */
function Preferences({ prefs }: { prefs: PreferenceRow[] }) {
  const t = useTranslations("notifications");
  const tc = useTranslations("common");
  const router = useRouter();
  const [state, setState] = useState(prefs);
  const [pending, start] = useTransition();
  const dirty = state.some((s, i) => s.enabled !== prefs[i]?.enabled);

  const save = () =>
    start(async () => {
      const r = await savePreferencesAction({ items: state });
      if (!r.ok) toast.error(r.message);
      else {
        toast.success(t("toast.prefsSaved"));
        router.refresh();
      }
    });

  return (
    <section className="space-y-4 rounded-lg border border-border p-4 sm:p-6" data-testid="prefs">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t("prefs.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("prefs.desc")}</p>
      </div>
      <ul className="divide-y divide-border">
        {state.map((p, i) => (
          <li key={p.type} className="flex min-h-14 items-center justify-between gap-4 py-2">
            <Label htmlFor={`pref-${p.type}`} className="cursor-pointer text-sm">
              {t(`type.${p.type}`)}
            </Label>
            <Switch
              id={`pref-${p.type}`}
              checked={p.enabled}
              onCheckedChange={(v) => setState((s) => s.map((x, j) => (j === i ? { ...x, enabled: v } : x)))}
              data-testid={`pref-${p.type}`}
            />
          </li>
        ))}
        {(["SYSTEM", "SECURITY"] as const).map((type) => (
          <li
            key={type}
            className="flex min-h-14 items-center justify-between gap-4 py-2 text-muted-foreground"
          >
            <span className="text-sm">{t(`type.${type}`)}</span>
            <span className="text-xs">{t("prefs.always")}</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Button className="min-h-11" onClick={save} disabled={!dirty || pending} data-testid="save-prefs">
          {pending ? tc("loading") : t("prefs.save")}
        </Button>
      </div>
    </section>
  );
}
