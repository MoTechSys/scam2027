import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { auditFacets, getAuditEntry, listAuditLogs, tenantTimeZone } from "@/features/audit/queries";
import { auditEntryIdSchema, auditQuerySchema } from "@/features/audit/schemas";
import { hasPermission, requireUser } from "@/lib/auth/rbac";
import { AuditClient } from "./audit-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("audit");
  return { title: t("title") };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * `/audit` — searchable, filterable, exportable audit trail (P1-09, FR-SET-004, UC-SYS-002). Gate: `audit.view`.
 * The details sheet is URL-addressable (`?entry=<id>`) so a row can be linked from anywhere (e.g. a user page).
 */
export default async function AuditPage({ searchParams }: Props) {
  const ctx = await requireUser();
  if (!hasPermission(ctx, "audit.view")) redirect("/unauthorized");
  const sp = await searchParams;
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const parsed = auditQuerySchema.safeParse(flat);
  const query = parsed.success ? parsed.data : auditQuerySchema.parse({});
  const entryId = auditEntryIdSchema.safeParse({ id: flat.entry });

  const timeZone = await tenantTimeZone(ctx);
  const [page, facets, entry, t] = await Promise.all([
    listAuditLogs(ctx, query, timeZone),
    auditFacets(ctx),
    entryId.success ? getAuditEntry(ctx, entryId.data.id) : Promise.resolve(null),
    getTranslations("audit"),
  ]);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-3 lg:gap-4">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <AuditClient
        page={page}
        query={query}
        facets={facets}
        entry={entry}
        entryRequested={entryId.success}
        can={{ export: hasPermission(ctx, "audit.export") }}
      />
    </div>
  );
}
