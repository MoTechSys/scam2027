import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCourseDetail } from "@/features/courses/queries";
import { hasPermission, requireUser } from "@/lib/auth/rbac";
import { CourseStateBadge, OfferingStatusBadge } from "../badges";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const ctx = await requireUser();
  if (!hasPermission(ctx, "course.view_details") || !/^[0-9a-f-]{36}$/i.test(id)) return {};
  const c = await getCourseDetail(ctx, id);
  return { title: c ? `${c.code} — ${c.name}` : "" };
}

/** `/courses/[id]` — course info, majors↔levels mapping and its sections (scope-filtered by the query layer). */
export default async function CourseDetailPage({ params }: Props) {
  const { id } = await params;
  const ctx = await requireUser();
  if (!hasPermission(ctx, "course.view_details")) redirect("/unauthorized");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [c, t, to, f] = await Promise.all([
    getCourseDetail(ctx, id),
    getTranslations("courses"),
    getTranslations("offerings"),
    getFormatter(),
  ]);
  if (!c) notFound();

  const info: { label: string; value: React.ReactNode }[] = [
    {
      label: t("form.code"),
      value: (
        <span dir="ltr" className="font-mono">
          {c.code}
        </span>
      ),
    },
    { label: t("form.nameEn"), value: c.nameEn ? <span dir="ltr">{c.nameEn}</span> : "—" },
    { label: t("form.department"), value: c.departmentName ?? t("noDepartment") },
    { label: t("form.creditHours"), value: t("credit", { count: c.creditHours }) },
    { label: t("detail.files"), value: c.fileCount },
    { label: t("detail.createdAt"), value: f.dateTime(c.createdAt, { dateStyle: "medium" }) },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ms-2 gap-1 text-muted-foreground">
        <Link href="/courses">
          <ArrowRight className="size-4 ltr:rotate-180 rtl:rotate-0" aria-hidden /> {t("title")}
        </Link>
      </Button>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold sm:text-3xl">{c.name}</h1>
          <CourseStateBadge isActive={c.isActive} deleted={!!c.deletedAt} />
        </div>
        {c.description && <p className="max-w-prose text-sm text-muted-foreground">{c.description}</p>}
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("detail.info")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {info.map((i) => (
                <div key={i.label} className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">{i.label}</dt>
                  <dd className="text-sm">{i.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.majors")}</CardTitle>
          </CardHeader>
          <CardContent>
            {c.majors.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("detail.noMajors")}</p>
            ) : (
              <ul className="space-y-2">
                {c.majors.map((m) => (
                  <li key={m.majorId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{m.majorName}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {m.levelName ?? t("form.anyLevel")}
                      <Badge variant="secondary">
                        {m.isRequired ? t("form.required") : t("form.elective")}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("detail.offerings")}</CardTitle>
        </CardHeader>
        <CardContent>
          {c.offerings.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("detail.noOfferings")}</p>
          ) : (
            <ol className="divide-y divide-border">
              {c.offerings.map((o) => (
                <li
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                  data-testid="course-offering"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t("detail.section", { section: o.section })}</span>
                    <span className="text-muted-foreground">{o.semesterName}</span>
                    {o.isCurrentSemester && <Badge variant="secondary">{t("detail.current")}</Badge>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{o.instructors.map((i) => i.name).join(" · ") || to("noInstructor")}</span>
                    <span className="tabular-nums" dir="ltr">
                      {o.capacity
                        ? to("enrolledOf", { active: o.activeCount, capacity: o.capacity })
                        : `${o.activeCount}`}
                    </span>
                    <OfferingStatusBadge status={o.status} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
