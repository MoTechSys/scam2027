import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { departmentOptions, majorOptions } from "@/features/academic/queries";
import { courseCounts, levelOptionsByMajor, listCourses } from "@/features/courses/queries";
import { courseListQuerySchema } from "@/features/courses/schemas";
import { isTenantWide } from "@/features/offerings/scope";
import { hasPermission, requireUser } from "@/lib/auth/rbac";
import { CoursesClient } from "./courses-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("courses");
  return { title: t("title") };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** `/courses` — catalogue. Own-scope actors (instructor/student without `course.manage_all`) see only courses they teach/attend. */
export default async function CoursesPage({ searchParams }: Props) {
  const ctx = await requireUser();
  if (!hasPermission(ctx, "course.view")) redirect("/unauthorized");
  const sp = await searchParams;
  const parsed = courseListQuerySchema.safeParse(
    Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
  );
  const query = parsed.success ? parsed.data : courseListQuerySchema.parse({});
  const tenantWide = isTenantWide(ctx);
  if (!tenantWide && query.status === "DELETED") redirect("/courses");

  const canEdit = hasPermission(ctx, "course.create", "course.edit");
  const [page, counts, departments, majors, levels, t] = await Promise.all([
    listCourses(ctx, query),
    courseCounts(ctx),
    departmentOptions(ctx),
    majorOptions(ctx),
    canEdit ? levelOptionsByMajor(ctx) : Promise.resolve([]),
    getTranslations("courses"),
  ]);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-3 lg:gap-4">
      <PageHeader title={tenantWide ? t("title") : t("myTitle")} subtitle={t("subtitle")} />
      <CoursesClient
        page={page}
        query={query}
        counts={counts}
        lookups={{ departments, majors, levels }}
        can={{
          create: hasPermission(ctx, "course.create"),
          edit: hasPermission(ctx, "course.edit"),
          delete: hasPermission(ctx, "course.delete"),
          viewDetails: hasPermission(ctx, "course.view_details"),
          createOffering: hasPermission(ctx, "offering.create"),
          tenantWide,
        }}
      />
    </div>
  );
}
