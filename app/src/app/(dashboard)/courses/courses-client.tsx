"use client";

/**
 * Courses catalogue — URL-driven tabs/search/filters (server pagination), desktop table + mobile list,
 * row action menu, create/edit/majors dialogs and delete/restore confirms (P1-05).
 */
import { GraduationCap, Layers, MoreHorizontal, Pencil, Plus, RotateCcw, Search, Trash2 } from "lucide-react";
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
import { MobileDataTable } from "@/components/ui/mobile-data-table";
import { PageTabs } from "@/components/ui/page-tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteCourseAction, restoreCourseAction } from "@/features/courses/actions";
import type { CourseRow } from "@/features/courses/queries";
import { COURSE_TABS, type CourseListQuery, type CourseTab } from "@/features/courses/schemas";
import type { Page } from "@/lib/result";
import { CourseStateBadge } from "./badges";
import { CourseFormDialog, CourseMajorsDialog, type Lookups } from "./course-dialogs";

export type Can = {
  create: boolean;
  edit: boolean;
  delete: boolean;
  viewDetails: boolean;
  createOffering: boolean;
  tenantWide: boolean;
};

type Props = {
  page: Page<CourseRow>;
  query: CourseListQuery;
  counts: Record<CourseTab, number>;
  lookups: Lookups;
  can: Can;
};
type Confirm = { kind: "delete" | "restore"; course: CourseRow } | null;

export function CoursesClient({ page, query, counts, lookups, can }: Props) {
  const t = useTranslations("courses");
  const tc = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, start] = useTransition();
  const [form, setForm] = useState<CourseRow | null | undefined>(undefined);
  const [majorsOf, setMajorsOf] = useState<CourseRow | null>(null);
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

  const codeCell = (c: CourseRow) =>
    can.viewDetails ? (
      <Link
        href={`/courses/${c.id}`}
        className="font-mono font-semibold text-foreground hover:text-primary hover:underline"
        dir="ltr"
        data-testid="course-link"
      >
        {c.code}
      </Link>
    ) : (
      <span className="font-mono font-semibold" dir="ltr">
        {c.code}
      </span>
    );

  const actionsFor = (c: CourseRow) => {
    const items: {
      key: string;
      label: string;
      icon: React.ReactNode;
      onClick: () => void;
      destructive?: boolean;
    }[] = [];
    if (c.deletedAt) {
      if (can.delete)
        items.push({
          key: "restore",
          label: t("actions.restore"),
          icon: <RotateCcw className="size-4" aria-hidden />,
          onClick: () => setConfirm({ kind: "restore", course: c }),
        });
      return items;
    }
    if (can.viewDetails)
      items.push({
        key: "details",
        label: t("actions.details"),
        icon: <GraduationCap className="size-4" aria-hidden />,
        onClick: () => router.push(`/courses/${c.id}`),
      });
    if (can.edit) {
      items.push({
        key: "edit",
        label: t("actions.edit"),
        icon: <Pencil className="size-4" aria-hidden />,
        onClick: () => setForm(c),
      });
      items.push({
        key: "majors",
        label: t("actions.majors"),
        icon: <Layers className="size-4" aria-hidden />,
        onClick: () => setMajorsOf(c),
      });
    }
    if (can.createOffering)
      items.push({
        key: "offering",
        label: t("actions.newOffering"),
        icon: <Plus className="size-4" aria-hidden />,
        onClick: () => router.push(`/offerings?courseId=${c.id}&new=1`),
      });
    if (can.delete)
      items.push({
        key: "delete",
        label: t("actions.delete"),
        icon: <Trash2 className="size-4" aria-hidden />,
        onClick: () => setConfirm({ kind: "delete", course: c }),
        destructive: true,
      });
    return items;
  };

  const columns: Column<CourseRow>[] = useMemo(
    () => [
      { key: "code", header: t("columns.code"), render: codeCell, className: "w-28" },
      {
        key: "name",
        header: t("columns.name"),
        render: (c) => <span className="font-medium">{c.name}</span>,
      },
      {
        key: "departmentName",
        header: t("columns.department"),
        render: (c) => (
          <span className="text-xs text-muted-foreground">{c.departmentName ?? t("noDepartment")}</span>
        ),
      },
      {
        key: "creditHours",
        header: t("columns.creditHours"),
        render: (c) => <span className="tabular-nums">{c.creditHours}</span>,
        className: "w-20 text-center",
      },
      {
        key: "majors",
        header: t("columns.majors"),
        render: (c) => (
          <span className="text-xs">
            {c.majors.length ? c.majors.map((m) => m.majorCode).join(" · ") : "—"}
          </span>
        ),
      },
      {
        key: "offeringCount",
        header: t("columns.offerings"),
        render: (c) => <span className="tabular-nums">{c.offeringCount}</span>,
        className: "w-20 text-center",
      },
      {
        key: "isActive",
        header: t("columns.status"),
        render: (c) => <CourseStateBadge isActive={c.isActive} deleted={!!c.deletedAt} />,
      },
      {
        key: "id",
        header: tc("actions"),
        className: "w-12 text-end",
        render: (c) => {
          const items = actionsFor(c);
          if (!items.length) return null;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`${tc("actions")}: ${c.code}`}
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
    [t, tc, can],
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

  const tabs = (can.tenantWide ? COURSE_TABS : COURSE_TABS.filter((x) => x !== "DELETED")).map((id) => ({
    id,
    label: t(`tabs.${id}`),
    badge: counts[id] ?? 0,
  }));

  return (
    <div className="space-y-4">
      <PageTabs tabs={tabs} activeTab={query.status} onTabChange={(id) => setParams({ status: id })} />

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
        <div className="grid grid-cols-2 gap-3 sm:flex">
          <Select value={query.departmentId ?? "ALL"} onValueChange={(v) => setParams({ departmentId: v })}>
            <SelectTrigger className="min-h-11 sm:w-48" aria-label={t("filters.department")}>
              <SelectValue placeholder={t("filters.allDepartments")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("filters.allDepartments")}</SelectItem>
              {lookups.departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={query.majorId ?? "ALL"} onValueChange={(v) => setParams({ majorId: v })}>
            <SelectTrigger className="min-h-11 sm:w-48" aria-label={t("filters.major")}>
              <SelectValue placeholder={t("filters.allMajors")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("filters.allMajors")}</SelectItem>
              {lookups.majors.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {can.create && (
          <Button onClick={() => setForm(null)} className="min-h-11 gap-2" data-testid="create-course">
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
          keyExtractor={(c) => c.id}
          emptyMessage={t("empty")}
          pagination={pagination}
          maxHeight="none"
        />
      </div>
      <div className="md:hidden">
        <MobileDataTable
          columns={[
            {
              key: "name",
              header: t("columns.name"),
              primary: true,
              render: (c) => <span className="font-medium">{c.name}</span>,
            },
            { key: "code", header: t("columns.code"), secondary: true, render: codeCell },
            {
              key: "isActive",
              header: t("columns.status"),
              badge: true,
              render: (c) => <CourseStateBadge isActive={c.isActive} deleted={!!c.deletedAt} />,
            },
            {
              key: "departmentName",
              header: t("columns.department"),
              render: (c) => c.departmentName ?? t("noDepartment"),
            },
            {
              key: "creditHours",
              header: t("columns.creditHours"),
              render: (c) => t("credit", { count: c.creditHours }),
            },
            {
              key: "offeringCount",
              header: t("columns.offerings"),
              render: (c) => t("offeringsCount", { count: c.offeringCount }),
            },
          ]}
          data={page.items}
          keyExtractor={(c) => c.id}
          emptyMessage={t("empty")}
          actionsLabel={tc("actions")}
          actions={[
            ...(can.viewDetails
              ? [{ label: t("actions.details"), onClick: (c: CourseRow) => router.push(`/courses/${c.id}`) }]
              : []),
            ...(can.edit
              ? [
                  { label: t("actions.edit"), onClick: (c: CourseRow) => setForm(c) },
                  { label: t("actions.majors"), onClick: (c: CourseRow) => setMajorsOf(c) },
                ]
              : []),
            ...(can.delete
              ? [
                  {
                    label: t("actions.delete"),
                    variant: "destructive" as const,
                    onClick: (c: CourseRow) =>
                      setConfirm({ kind: c.deletedAt ? "restore" : "delete", course: c }),
                  },
                ]
              : []),
          ]}
          pagination={pagination}
        />
      </div>

      <CourseFormDialog
        open={form !== undefined}
        onOpenChange={(o) => !o && setForm(undefined)}
        course={form ?? null}
        lookups={lookups}
      />
      <CourseMajorsDialog
        open={!!majorsOf}
        onOpenChange={(o) => !o && setMajorsOf(null)}
        course={majorsOf}
        lookups={lookups}
      />
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm ? `${t(`actions.${confirm.kind}`)}: ${confirm.course.code}` : ""}
        body={confirm ? t(`confirm.${confirm.kind}`) : ""}
        destructive={confirm?.kind === "delete"}
        onConfirm={async () => {
          if (!confirm) return { ok: true, data: null };
          const r =
            confirm.kind === "delete"
              ? await deleteCourseAction({ id: confirm.course.id })
              : await restoreCourseAction({ id: confirm.course.id });
          if (r.ok) toast.success(t(confirm.kind === "delete" ? "toast.deleted" : "toast.restored"));
          return r;
        }}
      />
    </div>
  );
}
