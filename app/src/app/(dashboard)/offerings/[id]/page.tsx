import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listEnrollments } from "@/features/enrollment/queries";
import { enrollmentListQuerySchema } from "@/features/enrollment/schemas";
import { getOfferingDetail } from "@/features/offerings/queries";
import { isTenantWide } from "@/features/offerings/scope";
import { hasPermission, requireUser } from "@/lib/auth/rbac";
import { InstructorRoleBadge, OfferingStatusBadge } from "../../courses/badges";
import { ScheduleText } from "../offerings-client";
import { RosterClient } from "./roster-client";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
const UUID = /^[0-9a-f-]{36}$/i;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const ctx = await requireUser();
  if (!hasPermission(ctx, "offering.view") || !UUID.test(id)) return {};
  const o = await getOfferingDetail(ctx, id);
  return { title: o ? `${o.courseCode} · ${o.section}` : "" };
}

/**
 * `/offerings/[id]` — section header + roster. Roster is visible to tenant-wide actors and to instructors of the
 * section (`enrollment.view`); an enrolled student sees the header only.
 */
export default async function OfferingDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const ctx = await requireUser();
  if (!hasPermission(ctx, "offering.view")) redirect("/unauthorized");
  if (!UUID.test(id)) notFound();
  const [o, t, te, tc, f] = await Promise.all([
    getOfferingDetail(ctx, id),
    getTranslations("offerings"),
    getTranslations("enrollment"),
    getTranslations("courses"),
    getFormatter(),
  ]);
  if (!o) notFound();

  const tenantWide = isTenantWide(ctx);
  const showRoster = hasPermission(ctx, "enrollment.view") && (tenantWide || o.relation === "TEACHES");
  let roster: React.ReactNode = null;
  if (showRoster) {
    const sp = await searchParams;
    const parsed = enrollmentListQuerySchema.safeParse(
      Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])),
    );
    const query = parsed.success ? parsed.data : enrollmentListQuerySchema.parse({});
    const page = await listEnrollments(ctx, id, query);
    const counts = { ALL: o.counts.ACTIVE + o.counts.WITHDRAWN + o.counts.COMPLETED, ...o.counts };
    roster = (
      <RosterClient
        offeringId={id}
        isOpen={o.status === "OPEN"}
        page={page}
        query={query}
        counts={counts}
        can={{
          enroll: hasPermission(ctx, "offering.enroll_students") && (tenantWide || o.relation === "TEACHES"),
          manage: hasPermission(ctx, "enrollment.manage") && (tenantWide || o.relation === "TEACHES"),
        }}
      />
    );
  }

  const info: { label: string; value: React.ReactNode }[] = [
    {
      label: t("detail.course"),
      value: (
        <Link href={`/courses/${o.courseId}`} className="hover:underline">
          <span dir="ltr" className="font-mono">
            {o.courseCode}
          </span>{" "}
          — {o.courseName}
        </Link>
      ),
    },
    {
      label: t("detail.semester"),
      value: (
        <>
          {o.semesterName}
          {o.isCurrentSemester && (
            <Badge variant="secondary" className="ms-2">
              {tc("detail.current")}
            </Badge>
          )}
        </>
      ),
    },
    { label: t("detail.credits"), value: tc("credit", { count: o.creditHours }) },
    {
      label: t("detail.capacity"),
      value: (
        <span dir="ltr" className="tabular-nums">
          {o.capacity
            ? t("enrolledOf", { active: o.activeCount, capacity: o.capacity })
            : `${o.activeCount} · ${t("unlimited")}`}
        </span>
      ),
    },
    { label: t("detail.location"), value: o.location || "—" },
    { label: t("detail.schedule"), value: <ScheduleText schedule={o.schedule} /> },
    { label: tc("detail.createdAt"), value: f.dateTime(o.createdAt, { dateStyle: "medium" }) },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ms-2 gap-1 text-muted-foreground">
        <Link href="/offerings">
          <ArrowRight className="size-4 ltr:rotate-180 rtl:rotate-0" aria-hidden /> {t("title")}
        </Link>
      </Button>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold sm:text-3xl">
            <span dir="ltr" className="font-mono">
              {o.courseCode}
            </span>{" "}
            · {t("sectionLabel", { section: o.section })}
          </h1>
          <OfferingStatusBadge status={o.status} />
          {o.relation !== "NONE" && (
            <Badge variant="secondary">
              {t(o.relation === "TEACHES" ? "detail.teaches" : "detail.enrolled")}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground">
          {o.courseName}
          {o.courseNameEn ? <span dir="ltr"> — {o.courseNameEn}</span> : null}
        </p>
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
            <CardTitle>{t("detail.instructors")}</CardTitle>
          </CardHeader>
          <CardContent>
            {o.instructors.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noInstructor")}</p>
            ) : (
              <ul className="space-y-2">
                {o.instructors.map((i) => (
                  <li key={i.userId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{i.name}</span>
                    <InstructorRoleBadge role={i.role} />
                  </li>
                ))}
              </ul>
            )}
            <dl className="mt-4 grid grid-cols-3 gap-2 border-t pt-4 text-center">
              {(["ACTIVE", "WITHDRAWN", "COMPLETED"] as const).map((k) => (
                <div key={k}>
                  <dt className="text-xs text-muted-foreground">{te(`status.${k}`)}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{o.counts[k]}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      {roster}
    </div>
  );
}
