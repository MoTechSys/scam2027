"use client";

/**
 * Academic structure shell — URL-segment tabs (/academic/<tab>), shared search box, current-period card, and dispatch
 * to the years view (year cards + nested semesters) or the catalogue view (colleges / departments / majors / levels).
 */
import { CalendarCheck, Search } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageTabs } from "@/components/ui/page-tabs";
import type { AcademicCounts, CollegeRow, CurrentPeriod, DepartmentRow, LevelRow, MajorRow, Option, YearRow } from "@/features/academic/queries";
import { ACADEMIC_TABS, type AcademicTab, type CatalogueListQuery } from "@/features/academic/schemas";
import { CatalogueClient } from "./catalogue-client";
import { YearsClient } from "./years-client";

export type AcademicCan = { college: boolean; department: boolean; major: boolean; level: boolean; semester: boolean; setCurrent: boolean; viewYears: boolean };

export type TabData =
  | { tab: "years"; rows: YearRow[] }
  | { tab: "colleges"; rows: CollegeRow[] }
  | { tab: "departments"; rows: DepartmentRow[] }
  | { tab: "majors"; rows: MajorRow[] }
  | { tab: "levels"; rows: LevelRow[] };

type Props = { data: TabData; options: Option[]; query: CatalogueListQuery; counts: AcademicCounts; period: CurrentPeriod; can: AcademicCan };

function CurrentPeriodCard({ period }: { period: CurrentPeriod }) {
  const t = useTranslations("academic");
  const f = useFormatter();
  return (
    <Card data-testid="current-period">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarCheck className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t("current.title")}</p>
            <p className="truncate font-semibold">
              {period.year ? period.year.name : t("current.none")}
              {period.semester && <span className="text-muted-foreground"> · {period.semester.name}</span>}
            </p>
          </div>
        </div>
        {period.semester ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{t(`term.${period.semester.term}`)}</Badge>
            <Badge variant={period.semester.status === "ACTIVE" ? "default" : "outline"}>{t(`status.${period.semester.status}`)}</Badge>
            <span className="tabular-nums" dir="ltr">
              {f.dateTime(period.semester.startDate, { dateStyle: "medium" })} → {f.dateTime(period.semester.endDate, { dateStyle: "medium" })}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("current.semester")}: {t("current.none")}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function AcademicClient({ data, options, query, counts, period, can }: Props) {
  const t = useTranslations("academic");
  const tc = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [, start] = useTransition();
  const [q, setQ] = useState(query.q);

  const tabCount: Record<AcademicTab, number> = { years: counts.years, colleges: counts.colleges, departments: counts.departments, majors: counts.majors, levels: counts.levels };
  const visibleTabs = ACADEMIC_TABS.filter((id) => id !== "years" || can.viewYears);

  const setParams = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (!v) next.delete(k);
        else next.set(k, v);
      }
      start(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`));
    },
    [sp, router, pathname],
  );

  return (
    <div className="space-y-4">
      <PageTabs tabs={visibleTabs.map((id) => ({ id, label: t(`tabs.${id}`), badge: tabCount[id] }))} activeTab={data.tab} onTabChange={(id) => start(() => router.push(`/academic/${id}`))} />

      {can.viewYears && <CurrentPeriodCard period={period} />}

      {data.tab !== "years" && (
        <form
          role="search"
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            setParams({ q, parentId: undefined });
          }}
        >
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("searchPlaceholder")} aria-label={tc("search")} className="min-h-11 ps-10" />
        </form>
      )}

      {data.tab === "years" ? (
        <YearsClient years={data.rows} yearOptions={options} can={can} />
      ) : (
        <CatalogueClient data={data} options={options} query={query} can={can} onFilter={(parentId) => setParams({ parentId })} />
      )}
    </div>
  );
}
