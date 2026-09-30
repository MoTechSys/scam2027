"use client";

/**
 * Reports shell (P1-13): URL tabs (`/reports/[tab]`) → one report per tab inside the ScrollRegion (ADR-0008).
 * Filters live in the query string (shareable, back-button friendly); the CSV export link reuses them 1:1 so the
 * file always matches what is on screen. Charts mount only inside the visible tab (one branch in the DOM here).
 */
import {
  BarChart3,
  BookOpen,
  Download,
  FolderOpen,
  GraduationCap,
  HardDrive,
  Layers,
  Lock,
  School,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MobileDataTable } from "@/components/ui/mobile-data-table";
import { PageTabs } from "@/components/ui/page-tabs";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type {
  CourseRow,
  CoursesReport,
  FilesReport,
  OverviewReport,
  UsersReport,
} from "@/features/reports/queries";
import {
  REPORT_EXPORT_MAX_ROWS,
  type CoursesReportFilter,
  type FilesReportFilter,
  type ReportTab,
  type UsersReportFilter,
} from "@/features/reports/schemas";
import { CountBars, Donut, MonthlyArea } from "./charts";
import { ChartCard, ChartGrid, Kpi, KpiGrid, ScopeNote } from "./report-blocks";

export type ReportsData =
  | { tab: "overview"; overview: OverviewReport }
  | { tab: "users"; users: UsersReport; filter: UsersReportFilter }
  | { tab: "courses"; courses: CoursesReport; filter: CoursesReportFilter }
  | { tab: "files"; files: FilesReport; filter: FilesReportFilter };

export type ReportsCan = { tabs: ReportTab[]; export: boolean };

const ALL = "__all__";

export function ReportsClient({ data, can }: { data: ReportsData; can: ReportsCan }) {
  const t = useTranslations("reports");
  const tc = useTranslations("common");
  const f = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, start] = useTransition();

  const setParams = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (!v || v === ALL) next.delete(k);
        else next.set(k, v);
      }
      start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
    },
    [sp, router, pathname],
  );

  const exportHref = useMemo(() => {
    if (data.tab === "overview") return null;
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(data.filter)) if (v) p.set(k, String(v));
    return `/api/reports/${data.tab}/export${p.size ? `?${p}` : ""}`;
  }, [data]);

  const selectClass = "min-h-10 w-full lg:min-h-11";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:gap-4" data-testid="page-shell">
      <PageTabs
        tabs={can.tabs.map((id) => ({ id, label: t(`tabs.${id}`) }))}
        activeTab={data.tab}
        onTabChange={(id) => router.push(`/reports/${id as ReportTab}`)}
      />
      <ScrollRegion label={t("title")} className="-mx-1 px-1">
        <div className="flex flex-col gap-3 pb-6">
          {/* toolbar: filters (per tab) + export */}
          {data.tab !== "overview" && (
            <div
              className="flex flex-col gap-2 rounded-lg border border-border bg-card/40 p-2 lg:flex-row lg:items-end lg:p-3"
              data-testid="report-filters"
            >
              <div className="grid flex-1 grid-cols-2 gap-2 lg:grid-cols-4">
                {data.tab === "users" && (
                  <>
                    <Field label={t("filters.role")}>
                      <Select
                        value={data.filter.roleId ?? ALL}
                        onValueChange={(v) => setParams({ roleId: v })}
                      >
                        <SelectTrigger
                          className={selectClass}
                          aria-label={t("filters.role")}
                          data-testid="rf-role"
                        >
                          <SelectValue placeholder={tc("all")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ALL} className="min-h-10">
                            {tc("all")}
                          </SelectItem>
                          {data.users.options.roles.map((r) => (
                            <SelectItem key={r.id} value={r.id} className="min-h-10">
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label={t("filters.status")}>
                      <Select
                        value={data.filter.status ?? ALL}
                        onValueChange={(v) => setParams({ status: v })}
                      >
                        <SelectTrigger
                          className={selectClass}
                          aria-label={t("filters.status")}
                          data-testid="rf-status"
                        >
                          <SelectValue placeholder={tc("all")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ALL} className="min-h-10">
                            {tc("all")}
                          </SelectItem>
                          {(["ACTIVE", "PENDING_ACTIVATION", "FROZEN", "DISABLED"] as const).map((s) => (
                            <SelectItem key={s} value={s} className="min-h-10">
                              {t(`userStatus.${s}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label={t("filters.major")}>
                      <Select
                        value={data.filter.majorId ?? ALL}
                        onValueChange={(v) => setParams({ majorId: v })}
                      >
                        <SelectTrigger
                          className={selectClass}
                          aria-label={t("filters.major")}
                          data-testid="rf-major"
                        >
                          <SelectValue placeholder={tc("all")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ALL} className="min-h-10">
                            {tc("all")}
                          </SelectItem>
                          {data.users.options.majors.map((m) => (
                            <SelectItem key={m.id} value={m.id} className="min-h-10">
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </>
                )}
                {data.tab === "courses" && (
                  <>
                    <Field label={t("filters.semester")}>
                      <Select
                        value={data.courses.semester?.id ?? ALL}
                        onValueChange={(v) => setParams({ semesterId: v })}
                      >
                        <SelectTrigger
                          className={selectClass}
                          aria-label={t("filters.semester")}
                          data-testid="rf-semester"
                        >
                          <SelectValue placeholder={t("filters.currentSemester")} />
                        </SelectTrigger>
                        <SelectContent>
                          {data.courses.options.semesters.map((s) => (
                            <SelectItem key={s.id} value={s.id} className="min-h-10">
                              {s.label}
                              {s.isCurrent ? ` — ${t("filters.current")}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label={t("filters.department")}>
                      <Select
                        value={data.filter.departmentId ?? ALL}
                        onValueChange={(v) => setParams({ departmentId: v })}
                      >
                        <SelectTrigger
                          className={selectClass}
                          aria-label={t("filters.department")}
                          data-testid="rf-department"
                        >
                          <SelectValue placeholder={tc("all")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ALL} className="min-h-10">
                            {tc("all")}
                          </SelectItem>
                          {data.courses.options.departments.map((d) => (
                            <SelectItem key={d.id} value={d.id} className="min-h-10">
                              {d.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </>
                )}
                {data.tab === "files" && (
                  <>
                    <Field label={t("filters.category")}>
                      <Select
                        value={data.filter.category ?? ALL}
                        onValueChange={(v) => setParams({ category: v })}
                      >
                        <SelectTrigger
                          className={selectClass}
                          aria-label={t("filters.category")}
                          data-testid="rf-category"
                        >
                          <SelectValue placeholder={tc("all")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ALL} className="min-h-10">
                            {tc("all")}
                          </SelectItem>
                          {(["LECTURE", "ASSIGNMENT", "EXAM", "REFERENCE", "OTHER"] as const).map((c) => (
                            <SelectItem key={c} value={c} className="min-h-10">
                              {t(`fileCategory.${c}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label={t("filters.course")}>
                      <Select
                        value={data.filter.courseId ?? ALL}
                        onValueChange={(v) => setParams({ courseId: v })}
                      >
                        <SelectTrigger
                          className={selectClass}
                          aria-label={t("filters.course")}
                          data-testid="rf-course"
                        >
                          <SelectValue placeholder={tc("all")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ALL} className="min-h-10">
                            {tc("all")}
                          </SelectItem>
                          {data.files.options.courses.map((c) => (
                            <SelectItem key={c.id} value={c.id} className="min-h-10">
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label={t("filters.from")}>
                      <Input
                        type="date"
                        defaultValue={data.filter.from ?? ""}
                        onChange={(e) => setParams({ from: e.target.value || undefined })}
                        className={selectClass}
                        aria-label={t("filters.from")}
                        data-testid="rf-from"
                      />
                    </Field>
                    <Field label={t("filters.to")}>
                      <Input
                        type="date"
                        defaultValue={data.filter.to ?? ""}
                        onChange={(e) => setParams({ to: e.target.value || undefined })}
                        className={selectClass}
                        aria-label={t("filters.to")}
                        data-testid="rf-to"
                      />
                    </Field>
                  </>
                )}
              </div>
              {can.export && exportHref && (
                <Button asChild variant="outline" className="min-h-10 gap-2 lg:min-h-11">
                  <a
                    href={exportHref}
                    download
                    data-testid="report-export"
                    title={t("export.hint", { max: f.number(REPORT_EXPORT_MAX_ROWS) })}
                    onClick={() => toast.info(t("export.started"))}
                  >
                    <Download className="size-4" aria-hidden /> {t("export.button")}
                  </a>
                </Button>
              )}
            </div>
          )}

          {data.tab === "overview" && <OverviewTab r={data.overview} />}
          {data.tab === "users" && <UsersTab r={data.users} />}
          {data.tab === "courses" && <CoursesTab r={data.courses} />}
          {data.tab === "files" && <FilesTab r={data.files} />}
        </div>
      </ScrollRegion>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

// ───────────────────────────── tabs ─────────────────────────────

function OverviewTab({ r }: { r: OverviewReport }) {
  const t = useTranslations("reports");
  return (
    <>
      {!r.tenantWide && <ScopeNote text={t("scope.own")} />}
      <KpiGrid>
        <Kpi
          title={t("kpi.users")}
          value={r.users.total}
          icon={Users}
          hint={t("kpi.activeOf", { n: r.users.active })}
        />
        <Kpi title={t("kpi.courses")} value={r.academic.courses} icon={BookOpen} />
        <Kpi title={t("kpi.offerings")} value={r.academic.offerings} icon={Layers} />
        <Kpi title={t("kpi.activeEnrollments")} value={r.enrollments.active} icon={GraduationCap} />
        <Kpi
          title={t("kpi.files")}
          value={r.files.count}
          icon={FolderOpen}
          hint={t("kpi.downloads", { n: r.files.downloads })}
        />
        <Kpi title={t("kpi.storage")} value={r.files.sizeMb} unit="MB" icon={HardDrive} />
        <Kpi
          title={t("kpi.colleges")}
          value={r.academic.colleges}
          icon={School}
          hint={t("kpi.deptsMajors", { d: r.academic.departments, m: r.academic.majors })}
        />
        <Kpi
          title={t("kpi.notifications")}
          value={r.notifications.sent}
          icon={BarChart3}
          hint={t("kpi.unreadOf", { n: r.notifications.unread, total: r.notifications.recipients })}
        />
      </KpiGrid>
      <ChartGrid>
        <ChartCard title={t("charts.newUsers")} testId="chart-users-month">
          <MonthlyArea data={r.usersByMonth} label={t("kpi.users")} id="ov-users" />
        </ChartCard>
        <ChartCard title={t("charts.newFiles")} testId="chart-files-month">
          <MonthlyArea data={r.filesByMonth} label={t("kpi.files")} id="ov-files" />
        </ChartCard>
        <ChartCard title={t("charts.userStatus")} testId="chart-user-status">
          <Donut
            label={t("kpi.users")}
            data={[
              { id: "ACTIVE", label: t("userStatus.ACTIVE"), count: r.users.active },
              { id: "PENDING_ACTIVATION", label: t("userStatus.PENDING_ACTIVATION"), count: r.users.pending },
              { id: "FROZEN", label: t("userStatus.FROZEN"), count: r.users.frozen },
              { id: "DISABLED", label: t("userStatus.DISABLED"), count: r.users.disabled },
            ]}
          />
        </ChartCard>
        <ChartCard title={t("charts.enrollmentStatus")} testId="chart-enrol-status">
          <Donut
            label={t("kpi.activeEnrollments")}
            data={[
              { id: "ACTIVE", label: t("enrollmentStatus.ACTIVE"), count: r.enrollments.active },
              { id: "WITHDRAWN", label: t("enrollmentStatus.WITHDRAWN"), count: r.enrollments.withdrawn },
              { id: "COMPLETED", label: t("enrollmentStatus.COMPLETED"), count: r.enrollments.completed },
            ]}
          />
        </ChartCard>
      </ChartGrid>
    </>
  );
}

function UsersTab({ r }: { r: UsersReport }) {
  const t = useTranslations("reports");
  return (
    <>
      <KpiGrid>
        <Kpi title={t("kpi.users")} value={r.total} icon={Users} />
        <Kpi title={t("kpi.active30d")} value={r.activeLast30d} icon={UserCheck} />
        <Kpi title={t("kpi.neverLoggedIn")} value={r.neverLoggedIn} icon={UserX} />
        <Kpi title={t("kpi.lockedNow")} value={r.lockedNow} icon={Lock} />
      </KpiGrid>
      <ChartGrid>
        <ChartCard title={t("charts.usersByRole")} testId="chart-users-role" height="h-64">
          <CountBars data={r.byRole} label={t("kpi.users")} />
        </ChartCard>
        <ChartCard title={t("charts.userStatus")} testId="chart-user-status">
          <Donut
            label={t("kpi.users")}
            data={r.byStatus.map((s) => ({
              id: s.status,
              label: t(`userStatus.${s.status}`),
              count: s.count,
            }))}
          />
        </ChartCard>
        <ChartCard title={t("charts.usersByMajor")} testId="chart-users-major" height="h-64">
          {r.byMajor.length ? (
            <CountBars data={r.byMajor} label={t("kpi.users")} />
          ) : (
            <EmptyChart text={t("empty.noMajorData")} />
          )}
        </ChartCard>
        <ChartCard title={t("charts.newUsers")} testId="chart-users-month">
          <MonthlyArea data={r.byMonth} label={t("kpi.users")} id="u-month" />
        </ChartCard>
      </ChartGrid>
    </>
  );
}

function CoursesTab({ r }: { r: CoursesReport }) {
  const t = useTranslations("reports");
  const f = useFormatter();
  const columns: Column<CourseRow>[] = useMemo(
    () => [
      {
        key: "code",
        header: t("columns.code"),
        render: (c) => (
          <span className="font-mono text-xs" dir="ltr">
            {c.code}
          </span>
        ),
        className: "w-24",
      },
      { key: "name", header: t("columns.name"), className: "max-w-64" },
      { key: "department", header: t("columns.department"), render: (c) => c.department ?? "—" },
      {
        key: "offerings",
        header: t("columns.offerings"),
        render: (c) => f.number(c.offerings),
        className: "w-20 text-center",
      },
      {
        key: "openOfferings",
        header: t("columns.openOfferings"),
        render: (c) => f.number(c.openOfferings),
        className: "w-20 text-center",
      },
      {
        key: "activeEnrollments",
        header: t("columns.activeEnrollments"),
        render: (c) => f.number(c.activeEnrollments),
        className: "w-24 text-center",
      },
      {
        key: "instructors",
        header: t("columns.instructors"),
        render: (c) => f.number(c.instructors),
        className: "w-20 text-center",
      },
      {
        key: "files",
        header: t("columns.files"),
        render: (c) => f.number(c.files),
        className: "w-20 text-center",
      },
    ],
    [t, f],
  );
  return (
    <>
      {!r.tenantWide && <ScopeNote text={t("scope.own")} />}
      {r.semester ? (
        <p className="text-xs text-muted-foreground" data-testid="report-semester">
          {t("semesterLabel", { name: r.semester.name })}
        </p>
      ) : (
        <ScopeNote text={t("empty.noSemester")} />
      )}
      <KpiGrid>
        <Kpi title={t("kpi.courses")} value={r.totals.courses} icon={BookOpen} />
        <Kpi title={t("kpi.offerings")} value={r.totals.offerings} icon={Layers} />
        <Kpi title={t("kpi.activeEnrollments")} value={r.totals.activeEnrollments} icon={GraduationCap} />
        <Kpi
          title={t("kpi.avgFill")}
          value={r.totals.avgFill === null ? "—" : `${f.number(r.totals.avgFill)}%`}
          icon={BarChart3}
          hint={r.totals.avgFill === null ? t("kpi.noCapacity") : undefined}
        />
      </KpiGrid>
      <ChartGrid>
        <ChartCard title={t("charts.offeringStatus")} testId="chart-offering-status">
          <Donut
            label={t("kpi.offerings")}
            data={r.byOfferingStatus.map((s) => ({
              id: s.status,
              label: t(`offeringStatus.${s.status}`),
              count: s.count,
            }))}
          />
        </ChartCard>
        <ChartCard title={t("charts.coursesByDepartment")} testId="chart-courses-dept" height="h-64">
          {r.byDepartment.length ? (
            <CountBars data={r.byDepartment} label={t("kpi.courses")} />
          ) : (
            <EmptyChart text={t("empty.noData")} />
          )}
        </ChartCard>
        <ChartCard
          title={t("charts.topCourses")}
          testId="chart-top-courses"
          className="lg:col-span-2"
          height="h-64"
        >
          {r.topCourses.length ? (
            <CountBars
              data={r.topCourses.map((c) => ({ id: c.id, label: c.code, count: c.enrollments }))}
              label={t("kpi.activeEnrollments")}
            />
          ) : (
            <EmptyChart text={t("empty.noEnrollments")} />
          )}
        </ChartCard>
      </ChartGrid>
      <section aria-labelledby="courses-table-title" className="space-y-2">
        <h2 id="courses-table-title" className="text-sm font-semibold">
          {t("tables.courses")}
        </h2>
        <div className="hidden lg:block">
          <DataTable
            columns={columns}
            data={r.rows}
            keyExtractor={(c) => c.id}
            emptyMessage={t("empty.noData")}
            maxHeight="none"
          />
        </div>
        <div className="lg:hidden">
          <MobileDataTable
            columns={[
              {
                key: "code",
                header: t("columns.code"),
                primary: true,
                render: (c: CourseRow) => `${c.code} — ${c.name}`,
              },
              {
                key: "department",
                header: t("columns.department"),
                secondary: true,
                render: (c: CourseRow) => c.department ?? "—",
              },
              {
                key: "activeEnrollments",
                header: t("columns.activeEnrollments"),
                badge: true,
                render: (c: CourseRow) => <Badge variant="outline">{f.number(c.activeEnrollments)}</Badge>,
              },
              {
                key: "offerings",
                header: t("columns.offerings"),
                render: (c: CourseRow) => f.number(c.offerings),
              },
              { key: "files", header: t("columns.files"), render: (c: CourseRow) => f.number(c.files) },
            ]}
            data={r.rows}
            keyExtractor={(c) => c.id}
            emptyMessage={t("empty.noData")}
          />
        </div>
      </section>
    </>
  );
}

function FilesTab({ r }: { r: FilesReport }) {
  const t = useTranslations("reports");
  const f = useFormatter();
  return (
    <>
      {!r.tenantWide && <ScopeNote text={t("scope.own")} />}
      <KpiGrid>
        <Kpi title={t("kpi.files")} value={r.totals.count} icon={FolderOpen} />
        <Kpi title={t("kpi.storage")} value={r.totals.sizeMb} unit="MB" icon={HardDrive} />
        <Kpi title={t("kpi.downloadsTotal")} value={r.totals.downloads} icon={Download} />
        <Kpi title={t("kpi.pendingReview")} value={r.totals.pending} icon={Lock} />
      </KpiGrid>
      <ChartGrid>
        <ChartCard title={t("charts.filesByCategory")} testId="chart-files-category">
          <Donut
            label={t("kpi.files")}
            data={r.byCategory.map((c) => ({
              id: c.status,
              label: t(`fileCategory.${c.status}`),
              count: c.count,
            }))}
          />
        </ChartCard>
        <ChartCard title={t("charts.filesByType")} testId="chart-files-type">
          {r.byMimeGroup.length ? (
            <Donut
              label={t("kpi.files")}
              data={r.byMimeGroup.map((m) => ({ ...m, label: t(`mime.${m.id}`) }))}
            />
          ) : (
            <EmptyChart text={t("empty.noData")} />
          )}
        </ChartCard>
        <ChartCard title={t("charts.filesByCourse")} testId="chart-files-course" height="h-64">
          {r.byCourse.length ? (
            <CountBars data={r.byCourse} label={t("kpi.files")} />
          ) : (
            <EmptyChart text={t("empty.noData")} />
          )}
        </ChartCard>
        <ChartCard title={t("charts.newFiles")} testId="chart-files-month">
          <MonthlyArea data={r.byMonth} label={t("kpi.files")} id="f-month" />
        </ChartCard>
      </ChartGrid>
      <section aria-labelledby="top-downloads-title" className="space-y-2">
        <h2 id="top-downloads-title" className="text-sm font-semibold">
          {t("tables.topDownloaded")}
        </h2>
        {r.topDownloaded.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("empty.noDownloads")}</p>
        ) : (
          <ol
            className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card/50"
            data-testid="top-downloads"
          >
            {r.topDownloaded.map((x, i) => (
              <li key={x.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-5 text-xs text-muted-foreground tabular-nums" dir="ltr">
                  {i + 1}.
                </span>
                <span className="min-w-0 flex-1 truncate">{x.name}</span>
                {x.course && (
                  <Badge variant="outline" className="font-mono text-[10px]" dir="ltr">
                    {x.course}
                  </Badge>
                )}
                <span className="font-semibold tabular-nums" dir="ltr">
                  {f.number(x.downloads)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function EmptyChart({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center text-xs text-muted-foreground">{text}</div>;
}
