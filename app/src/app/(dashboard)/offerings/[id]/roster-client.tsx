"use client";

/**
 * Offering roster — status tabs, search, server pagination; enrol / bulk-enrol; withdraw / reactivate / complete
 * per row (P1-05, FR-ENR-001).
 */
import { CheckCircle2, MoreHorizontal, Plus, RotateCcw, Search, UserMinus, Users } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { MobileDataTable } from "@/components/ui/mobile-data-table";
import { PageTabs } from "@/components/ui/page-tabs";
import { setEnrollmentStatusAction } from "@/features/enrollment/actions";
import type { EnrollmentRow } from "@/features/enrollment/queries";
import {
  ENROLLMENT_TABS,
  type EnrollmentListQuery,
  type EnrollmentStatus,
} from "@/features/enrollment/schemas";
import type { Page } from "@/lib/result";
import { EnrollmentStatusBadge } from "../../courses/badges";
import { BulkEnrollDialog, EnrollDialog } from "./enrollment-dialogs";

export type RosterCan = { enroll: boolean; manage: boolean };
type Props = {
  offeringId: string;
  isOpen: boolean;
  page: Page<EnrollmentRow>;
  query: EnrollmentListQuery;
  counts: Record<string, number>;
  can: RosterCan;
};
type ConfirmKind = "withdraw" | "reactivate" | "complete";
type Confirm = { kind: ConfirmKind; row: EnrollmentRow } | null;
const TARGET: Record<ConfirmKind, EnrollmentStatus> = {
  withdraw: "WITHDRAWN",
  reactivate: "ACTIVE",
  complete: "COMPLETED",
};

export function RosterClient({ offeringId, isOpen, page, query, counts, can }: Props) {
  const t = useTranslations("enrollment");
  const tc = useTranslations("common");
  const f = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, start] = useTransition();
  const [enroll, setEnroll] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [q, setQ] = useState(query.q);

  const setParams = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (!v || v === "ALL") next.delete(k);
        else next.set(k, v);
      }
      if (!("page" in patch)) next.delete("page");
      start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`));
    },
    [sp, router, pathname],
  );

  const actionsFor = (r: EnrollmentRow) => {
    const items: { key: ConfirmKind; label: string; icon: React.ReactNode; destructive?: boolean }[] = [];
    if (!can.manage || r.status === "COMPLETED") return items;
    if (r.status === "ACTIVE") {
      items.push({
        key: "withdraw",
        label: t("actions.withdraw"),
        icon: <UserMinus className="size-4" aria-hidden />,
        destructive: true,
      });
      items.push({
        key: "complete",
        label: t("actions.complete"),
        icon: <CheckCircle2 className="size-4" aria-hidden />,
      });
    } else if (r.status === "WITHDRAWN" && isOpen) {
      items.push({
        key: "reactivate",
        label: t("actions.reactivate"),
        icon: <RotateCcw className="size-4" aria-hidden />,
      });
    }
    return items;
  };

  const columns: Column<EnrollmentRow>[] = useMemo(
    () => [
      {
        key: "studentName",
        header: t("columns.student"),
        render: (r) => <span className="font-medium">{r.studentName}</span>,
      },
      {
        key: "academicId",
        header: t("columns.academicId"),
        render: (r) => (
          <span dir="ltr" className="font-mono text-xs">
            {r.academicId}
          </span>
        ),
      },
      {
        key: "email",
        header: t("columns.email"),
        render: (r) => (
          <span dir="ltr" className="text-xs text-muted-foreground">
            {r.email}
          </span>
        ),
      },
      {
        key: "status",
        header: t("columns.status"),
        render: (r) => <EnrollmentStatusBadge status={r.status} />,
      },
      {
        key: "source",
        header: t("columns.source"),
        render: (r) => <span className="text-xs">{t(`source.${r.source}`)}</span>,
      },
      {
        key: "enrolledAt",
        header: t("columns.enrolledAt"),
        render: (r) => (
          <span className="text-xs text-muted-foreground">
            {f.dateTime(r.enrolledAt, { dateStyle: "medium" })}
          </span>
        ),
      },
      {
        key: "id",
        header: tc("actions"),
        className: "w-12 text-end",
        render: (r) => {
          const items = actionsFor(r);
          if (!items.length) return null;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${tc("actions")}: ${r.studentName}`}
                  className="size-9"
                >
                  <MoreHorizontal className="size-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {items.map((it) => (
                  <DropdownMenuItem
                    key={it.key}
                    onSelect={() => setConfirm({ kind: it.key, row: r })}
                    variant={it.destructive ? "destructive" : "default"}
                    className="min-h-10 gap-2"
                  >
                    {it.icon} {it.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, tc, f, can, isOpen],
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
    <section className="space-y-4" aria-labelledby="roster-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="roster-title" className="flex items-center gap-2 text-lg font-semibold">
          <Users className="size-5" aria-hidden /> {t("title")}
        </h2>
        {can.enroll && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="min-h-11 gap-2"
              disabled={!isOpen}
              onClick={() => setBulk(true)}
              data-testid="bulk-enroll"
              title={isOpen ? undefined : t("notOpen")}
            >
              {t("actions.bulk")}
            </Button>
            <Button
              className="min-h-11 gap-2"
              disabled={!isOpen}
              onClick={() => setEnroll(true)}
              data-testid="enroll-student"
              title={isOpen ? undefined : t("notOpen")}
            >
              <Plus className="size-4" aria-hidden /> {t("actions.enroll")}
            </Button>
          </div>
        )}
      </div>
      {!isOpen && can.enroll && <p className="text-sm text-muted-foreground">{t("notOpen")}</p>}

      <PageTabs
        tabs={ENROLLMENT_TABS.map((id) => ({ id, label: t(`tabs.${id}`), badge: counts[id] ?? 0 }))}
        activeTab={query.status}
        onTabChange={(id) => setParams({ status: id })}
      />

      <form
        role="search"
        className="relative"
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

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t("total", { count: page.total })}
      </p>

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
            {
              key: "studentName",
              header: t("columns.student"),
              primary: true,
              render: (r) => <span className="font-medium">{r.studentName}</span>,
            },
            {
              key: "academicId",
              header: t("columns.academicId"),
              secondary: true,
              render: (r) => (
                <span dir="ltr" className="font-mono">
                  {r.academicId}
                </span>
              ),
            },
            {
              key: "status",
              header: t("columns.status"),
              badge: true,
              render: (r) => <EnrollmentStatusBadge status={r.status} />,
            },
            { key: "source", header: t("columns.source"), render: (r) => t(`source.${r.source}`) },
          ]}
          data={page.items}
          keyExtractor={(r) => r.id}
          emptyMessage={t("empty")}
          actionsLabel={tc("actions")}
          actions={
            can.manage
              ? [
                  {
                    label: t("actions.withdraw"),
                    variant: "destructive" as const,
                    onClick: (r: EnrollmentRow) => setConfirm({ kind: "withdraw", row: r }),
                  },
                  {
                    label: t("actions.reactivate"),
                    onClick: (r: EnrollmentRow) => setConfirm({ kind: "reactivate", row: r }),
                  },
                  {
                    label: t("actions.complete"),
                    onClick: (r: EnrollmentRow) => setConfirm({ kind: "complete", row: r }),
                  },
                ]
              : []
          }
          pagination={pagination}
        />
      </div>

      <EnrollDialog
        key={enroll ? "open" : "closed"}
        open={enroll}
        onOpenChange={setEnroll}
        offeringId={offeringId}
      />
      <BulkEnrollDialog
        key={bulk ? "open" : "closed"}
        open={bulk}
        onOpenChange={setBulk}
        offeringId={offeringId}
      />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? `${t(`actions.${confirm.kind}`)}: ${confirm.row.studentName}` : ""}
        body={confirm ? t(`confirm.${confirm.kind}`) : ""}
        destructive={confirm?.kind === "withdraw"}
        onConfirm={async () => {
          if (!confirm) return { ok: true, data: null };
          const r = await setEnrollmentStatusAction({ id: confirm.row.id, status: TARGET[confirm.kind] });
          if (r.ok) toast.success(t("toast.statusChanged"));
          return r;
        }}
      />
    </section>
  );
}
