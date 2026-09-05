import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import {
  academicCounts,
  collegeOptions,
  currentPeriod,
  departmentOptions,
  listColleges,
  listDepartments,
  listLevels,
  listMajors,
  listYears,
  majorOptions,
  needsSetup,
  yearOptions,
  type Option,
} from "@/features/academic/queries";
import { ACADEMIC_TABS, catalogueListQuerySchema, type AcademicTab } from "@/features/academic/schemas";
import { hasPermission, requireUser } from "@/lib/auth/rbac";
import { AcademicClient, type AcademicCan, type TabData } from "../academic-client";
import { SetupWizard } from "../setup-wizard";

type Props = { params: Promise<{ tab: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

function isTab(v: string): v is AcademicTab {
  return (ACADEMIC_TABS as readonly string[]).includes(v);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tab } = await params;
  const t = await getTranslations("academic");
  return { title: isTab(tab) ? `${t("title")} — ${t(`tabs.${tab}`)}` : t("title") };
}

export default async function AcademicTabPage({ params, searchParams }: Props) {
  const { tab } = await params;
  if (!isTab(tab)) notFound();
  const ctx = await requireUser();
  if (!hasPermission(ctx, "academic.view")) redirect("/unauthorized");
  if (tab === "years" && !hasPermission(ctx, "semester.view")) redirect("/academic/colleges");

  const can: AcademicCan = {
    college: hasPermission(ctx, "college.manage"),
    department: hasPermission(ctx, "department.manage"),
    major: hasPermission(ctx, "major.manage"),
    level: hasPermission(ctx, "level.manage"),
    semester: hasPermission(ctx, "semester.manage"),
    setCurrent: hasPermission(ctx, "semester.set_current"),
    viewYears: hasPermission(ctx, "semester.view"),
  };
  const canWizard = can.college && can.department && can.major && can.level && can.semester;

  const sp = await searchParams;
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const parsed = catalogueListQuerySchema.safeParse(flat);
  const query = parsed.success ? parsed.data : catalogueListQuerySchema.parse({});

  const [t, counts, period, setup] = await Promise.all([getTranslations("academic"), academicCounts(ctx), currentPeriod(ctx), needsSetup(ctx)]);

  const header = (
    <header className="space-y-1">
      <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
      <p className="text-muted-foreground">{t("subtitle")}</p>
    </header>
  );

  if (setup && canWizard && flat.manual !== "1") {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-6">
        {header}
        <SetupWizard />
      </div>
    );
  }

  let data: TabData;
  let options: Option[] = [];
  switch (tab) {
    case "years":
      data = { tab, rows: await listYears(ctx) };
      options = await yearOptions(ctx);
      break;
    case "colleges":
      data = { tab, rows: await listColleges(ctx, query) };
      break;
    case "departments":
      [data, options] = await Promise.all([listDepartments(ctx, query).then((rows) => ({ tab, rows }) as TabData), collegeOptions(ctx)]);
      break;
    case "majors":
      [data, options] = await Promise.all([listMajors(ctx, query).then((rows) => ({ tab, rows }) as TabData), departmentOptions(ctx)]);
      break;
    case "levels":
      [data, options] = await Promise.all([listLevels(ctx, query).then((rows) => ({ tab, rows }) as TabData), majorOptions(ctx)]);
      break;
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {header}
      <AcademicClient data={data} options={options} query={query} counts={counts} period={period} can={can} />
    </div>
  );
}
