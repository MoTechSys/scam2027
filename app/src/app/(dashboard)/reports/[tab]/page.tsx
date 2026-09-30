import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import {
  loadCoursesReport,
  loadFilesReport,
  loadOverviewReport,
  loadUsersReport,
  tenantTimeZone,
} from "@/features/reports/queries";
import {
  REPORT_TABS,
  TAB_PERMISSION,
  coursesReportFilterSchema,
  filesReportFilterSchema,
  isReportTab,
  usersReportFilterSchema,
  type ReportTab,
} from "@/features/reports/schemas";
import type { PermissionCode } from "@/lib/auth/permissions";
import { hasPermission, requireUser } from "@/lib/auth/rbac";
import { ReportsClient, type ReportsData } from "../reports-client";

type Props = {
  params: Promise<{ tab: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tab } = await params;
  const t = await getTranslations("reports");
  return { title: isReportTab(tab) ? `${t("title")} — ${t(`tabs.${tab}`)}` : t("title") };
}

/**
 * `/reports/[tab]` — overview / users / courses / files (P1-13, FR-RPT-001/002/003/006).
 * Gate: `report.view`; each tab additionally needs its own code (`report.users` …). A tab the actor cannot see is
 * not rendered in the tab bar and redirects to /unauthorized when addressed directly. Invalid filters fall back to
 * defaults (the CSV route is strict instead — 400).
 */
export default async function ReportsTabPage({ params, searchParams }: Props) {
  const { tab } = await params;
  if (!isReportTab(tab)) notFound();
  const ctx = await requireUser();
  if (!hasPermission(ctx, "report.view")) redirect("/unauthorized");
  const tabs: ReportTab[] = REPORT_TABS.filter((id) =>
    hasPermission(ctx, TAB_PERMISSION[id] as PermissionCode),
  );
  if (!tabs.includes(tab)) redirect("/unauthorized");

  const sp = await searchParams;
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const t = await getTranslations("reports");

  let data: ReportsData;
  if (tab === "overview") {
    data = { tab, overview: await loadOverviewReport(ctx) };
  } else if (tab === "users") {
    const parsed = usersReportFilterSchema.safeParse(flat);
    const filter = parsed.success ? parsed.data : {};
    data = { tab, users: await loadUsersReport(ctx, filter), filter };
  } else if (tab === "courses") {
    const parsed = coursesReportFilterSchema.safeParse(flat);
    const filter = parsed.success ? parsed.data : {};
    data = { tab, courses: await loadCoursesReport(ctx, filter), filter };
  } else {
    const parsed = filesReportFilterSchema.safeParse(flat);
    const filter = parsed.success ? parsed.data : {};
    const timeZone = await tenantTimeZone(ctx);
    data = { tab, files: await loadFilesReport(ctx, filter, timeZone), filter };
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-3 lg:gap-4">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <ReportsClient data={data} can={{ tabs, export: hasPermission(ctx, "report.export") }} />
    </div>
  );
}
