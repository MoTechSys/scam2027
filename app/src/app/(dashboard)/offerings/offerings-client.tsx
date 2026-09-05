"use client";

/**
 * Offerings (sections) list — status tabs, semester filter, "mine" toggle for tenant-wide actors, desktop table +
 * mobile list, row actions (edit / instructors / status / delete) and dialogs (P1-05).
 */
import { ArrowLeftRight, MoreHorizontal, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
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
import { deleteOfferingAction } from "@/features/offerings/actions";
import type { OfferingRow } from "@/features/offerings/queries";
import { OFFERING_TABS, type OfferingListQuery, type OfferingTab } from "@/features/offerings/schemas";
import type { Page } from "@/lib/result";
import { OfferingStatusBadge } from "../courses/badges";
import {
  InstructorsDialog,
  OfferingFormDialog,
  StatusDialog,
  type OfferingLookups,
} from "./offering-dialogs";

export type Can = { create: boolean; edit: boolean; delete: boolean; assign: boolean; tenantWide: boolean };
type Props = {
  page: Page<OfferingRow>;
  query: OfferingListQuery;
  counts: Record<OfferingTab, number>;
  lookups: OfferingLookups;
  can: Can;
  openCreate: boolean;
  selfId: string;
};

export function ScheduleText({ schedule }: { schedule: OfferingRow["schedule"] }) {
  const t = useTranslations("offerings");
  if (!schedule.length) return <span className="text-muted-foreground">{t("noSchedule")}</span>;
  return (
    <span className="text-xs">
      {schedule.map((s, i) => (
        <span key={i} className="me-2 inline-block whitespace-nowrap">
          {t(`day.${s.day}`)}{" "}
          <span dir="ltr">
            {s.startTime}–{s.endTime}
          </span>
        </span>
      ))}
    </span>
  );
}

export function OfferingsClient({ page, query, counts, lookups, can, openCreate, selfId }: Props) {
  const t = useTranslations("offerings");
  const tc = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, start] = useTransition();
  const [form, setForm] = useState<OfferingRow | null | undefined>(openCreate ? null : undefined);
  const [insOf, setInsOf] = useState<OfferingRow | null>(null);
  const [statusOf, setStatusOf] = useState<OfferingRow | null>(null);
  const [del, setDel] = useState<OfferingRow | null>(null);
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

  const teaches = (o: OfferingRow) => o.instructors.some((i) => i.userId === selfId);
  const mayEdit = (o: OfferingRow) => can.edit && o.status !== "ARCHIVED" && (can.tenantWide || teaches(o));

  const titleCell = (o: OfferingRow) => (
    <Link
      href={`/offerings/${o.id}`}
      className="font-medium text-foreground hover:text-primary hover:underline"
      data-testid="offering-link"
    >
      <span dir="ltr" className="font-mono">
        {o.courseCode}
      </span>{" "}
      · {t("sectionLabel", { section: o.section })}
    </Link>
  );
  const enrolledCell = (o: OfferingRow) => (
    <span className="tabular-nums" dir="ltr">
      {o.capacity ? t("enrolledOf", { active: o.activeCount, capacity: o.capacity }) : o.activeCount}
    </span>
  );

  const actionsFor = (o: OfferingRow) => {
    const items: {
      key: string;
      label: string;
      icon: React.ReactNode;
      onClick: () => void;
      destructive?: boolean;
    }[] = [
      {
        key: "roster",
        label: t("actions.roster"),
        icon: <Users className="size-4" aria-hidden />,
        onClick: () => router.push(`/offerings/${o.id}`),
      },
    ];
    if (mayEdit(o))
      items.push({
        key: "edit",
        label: t("actions.edit"),
        icon: <Pencil className="size-4" aria-hidden />,
        onClick: () => setForm(o),
      });
    if (can.assign && o.status !== "ARCHIVED")
      items.push({
        key: "instructors",
        label: t("actions.instructors"),
        icon: <Users className="size-4" aria-hidden />,
        onClick: () => setInsOf(o),
      });
    if (can.tenantWide && can.edit && o.status !== "ARCHIVED")
      items.push({
        key: "status",
        label: t("dialogs.status"),
        icon: <ArrowLeftRight className="size-4" aria-hidden />,
        onClick: () => setStatusOf(o),
      });
    if (can.delete)
      items.push({
        key: "delete",
        label: t("actions.delete"),
        icon: <Trash2 className="size-4" aria-hidden />,
        onClick: () => setDel(o),
        destructive: true,
      });
    return items;
  };

  const columns: Column<OfferingRow>[] = useMemo(
    () => [
      {
        key: "courseCode",
        header: t("columns.course"),
        render: (o) => (
          <div className="flex flex-col">
            {titleCell(o)}
            <span className="text-xs text-muted-foreground">{o.courseName}</span>
          </div>
        ),
      },
      {
        key: "semesterName",
        header: t("columns.semester"),
        render: (o) => (
          <span className="text-xs">
            {o.semesterName}
            {o.isCurrentSemester ? " ★" : ""}
          </span>
        ),
      },
      {
        key: "instructors",
        header: t("columns.instructors"),
        render: (o) => (
          <span className="text-xs">{o.instructors.map((i) => i.name).join(" · ") || t("noInstructor")}</span>
        ),
      },
      {
        key: "schedule",
        header: t("columns.schedule"),
        render: (o) => <ScheduleText schedule={o.schedule} />,
      },
      {
        key: "activeCount",
        header: t("columns.enrolled"),
        render: enrolledCell,
        className: "w-24 text-center",
      },
      {
        key: "status",
        header: t("columns.status"),
        render: (o) => <OfferingStatusBadge status={o.status} />,
      },
      {
        key: "id",
        header: tc("actions"),
        className: "w-12 text-end",
        render: (o) => {
          const items = actionsFor(o);
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${tc("actions")}: ${o.courseCode} ${o.section}`}
                  className="size-9"
                >
                  <MoreHorizontal className="size-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {items.map((it, i) => (
                  <span key={it.key}>
                    {it.destructive && i > 0 && !items[i - 1]?.destructive && <DropdownMenuSeparator />}
                    <DropdownMenuItem
                      onSelect={it.onClick}
                      variant={it.destructive ? "destructive" : "default"}
                      className="min-h-10 gap-2"
                    >
                      {it.icon} {it.label}
                    </DropdownMenuItem>
                  </span>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, tc, can, selfId],
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

  return (
    <div className="space-y-4">
      <PageTabs
        tabs={OFFERING_TABS.map((id) => ({ id, label: t(`tabs.${id}`), badge: counts[id] ?? 0 }))}
        activeTab={query.status}
        onTabChange={(id) => setParams({ status: id })}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <form
          role="search"
          className="relative flex-1"
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
            className="min-h-11 ps-10"
          />
        </form>
        <Select value={query.semesterId ?? "ALL"} onValueChange={(v) => setParams({ semesterId: v })}>
          <SelectTrigger className="min-h-11 sm:w-56" aria-label={t("filters.semester")}>
            <SelectValue placeholder={t("filters.allSemesters")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("filters.allSemesters")}</SelectItem>
            {lookups.semesters.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {can.tenantWide && (
          <div className="flex min-h-11 items-center gap-2">
            <Switch
              id="off-mine"
              checked={query.mine}
              onCheckedChange={(c) => setParams({ mine: c ? "true" : undefined })}
            />
            <Label htmlFor="off-mine">{t("filters.mine")}</Label>
          </div>
        )}
        {can.create && (
          <Button onClick={() => setForm(null)} className="min-h-11 gap-2" data-testid="create-offering">
            <Plus className="size-4" aria-hidden /> {t("actions.create")}
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("total", { count: page.total })}
      </p>

      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={page.items}
          keyExtractor={(o) => o.id}
          emptyMessage={t("empty")}
          pagination={pagination}
          maxHeight="none"
        />
      </div>
      <div className="md:hidden">
        <MobileDataTable
          columns={[
            { key: "courseCode", header: t("columns.course"), primary: true, render: titleCell },
            { key: "courseName", header: t("columns.course"), secondary: true, render: (o) => o.courseName },
            {
              key: "status",
              header: t("columns.status"),
              badge: true,
              render: (o) => <OfferingStatusBadge status={o.status} />,
            },
            { key: "semesterName", header: t("columns.semester"), render: (o) => o.semesterName },
            {
              key: "instructors",
              header: t("columns.instructors"),
              render: (o) => o.instructors.map((i) => i.name).join(" · ") || t("noInstructor"),
            },
            { key: "activeCount", header: t("columns.enrolled"), render: enrolledCell },
          ]}
          data={page.items}
          keyExtractor={(o) => o.id}
          emptyMessage={t("empty")}
          actionsLabel={tc("actions")}
          actions={[
            { label: t("actions.roster"), onClick: (o: OfferingRow) => router.push(`/offerings/${o.id}`) },
            ...(can.edit ? [{ label: t("actions.edit"), onClick: (o: OfferingRow) => setForm(o) }] : []),
            ...(can.assign
              ? [{ label: t("actions.instructors"), onClick: (o: OfferingRow) => setInsOf(o) }]
              : []),
            ...(can.tenantWide && can.edit
              ? [{ label: t("dialogs.status"), onClick: (o: OfferingRow) => setStatusOf(o) }]
              : []),
            ...(can.delete
              ? [
                  {
                    label: t("actions.delete"),
                    variant: "destructive" as const,
                    onClick: (o: OfferingRow) => setDel(o),
                  },
                ]
              : []),
          ]}
          pagination={pagination}
        />
      </div>

      <OfferingFormDialog
        key={form === undefined ? "closed" : (form?.id ?? "new")}
        open={form !== undefined}
        onOpenChange={(o) => !o && setForm(undefined)}
        offering={form ?? null}
        lookups={lookups}
        defaultCourseId={query.courseId}
        canAssign={can.assign}
      />
      <InstructorsDialog
        key={insOf?.id ?? "closed"}
        open={!!insOf}
        onOpenChange={(o) => !o && setInsOf(null)}
        offering={insOf}
        options={lookups.instructors}
      />
      <StatusDialog
        key={statusOf?.id ?? "closed"}
        open={!!statusOf}
        onOpenChange={(o) => !o && setStatusOf(null)}
        offering={statusOf}
      />
      <ConfirmDialog
        open={!!del}
        onOpenChange={(o) => !o && setDel(null)}
        title={del ? `${t("actions.delete")}: ${del.courseCode} ${del.section}` : ""}
        body={t("confirm.delete")}
        destructive
        onConfirm={async () => {
          if (!del) return { ok: true, data: null };
          const r = await deleteOfferingAction({ id: del.id });
          if (r.ok) toast.success(t("toast.deleted"));
          return r;
        }}
      />
    </div>
  );
}
