import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { courseOptions } from "@/features/courses/queries";
import {
  instructorOptions,
  listOfferings,
  offeringCounts,
  semesterOptions,
} from "@/features/offerings/queries";
import { offeringListQuerySchema } from "@/features/offerings/schemas";
import { isTenantWide } from "@/features/offerings/scope";
import { hasPermission, requireUser } from "@/lib/auth/rbac";
import { OfferingsClient } from "./offerings-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("offerings");
  return { title: t("title") };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** `/offerings` — sections per semester. Own-scope actors are limited by `offeringScopeWhere` in the query layer. */
export default async function OfferingsPage({ searchParams }: Props) {
  const ctx = await requireUser();
  if (!hasPermission(ctx, "offering.view")) redirect("/unauthorized");
  const sp = await searchParams;
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const parsed = offeringListQuerySchema.safeParse(flat);
  const query = parsed.success ? parsed.data : offeringListQuerySchema.parse({});
  const tenantWide = isTenantWide(ctx);
  const canCreate = hasPermission(ctx, "offering.create");
  const canAssign = hasPermission(ctx, "offering.assign_instructor");

  const [page, counts, semesters, courses, instructors, t] = await Promise.all([
    listOfferings(ctx, query),
    offeringCounts(ctx, query),
    semesterOptions(ctx),
    canCreate ? courseOptions(ctx) : Promise.resolve([]),
    canAssign ? instructorOptions(ctx) : Promise.resolve([]),
    getTranslations("offerings"),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{tenantWide ? t("title") : t("myTitle")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>
      <OfferingsClient
        page={page}
        query={query}
        counts={counts}
        lookups={{ courses, semesters, instructors }}
        openCreate={canCreate && flat.new === "1"}
        selfId={ctx.user.id}
        can={{
          create: canCreate,
          edit: hasPermission(ctx, "offering.edit"),
          delete: hasPermission(ctx, "offering.delete"),
          assign: canAssign,
          tenantWide,
        }}
      />
    </div>
  );
}
