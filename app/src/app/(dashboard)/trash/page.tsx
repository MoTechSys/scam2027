import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { listTrash, trashCounts } from "@/features/trash/queries";
import { trashQuerySchema } from "@/features/trash/schemas";
import { hasPermission, requireUser } from "@/lib/auth/rbac";
import { TrashClient } from "./trash-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("trash");
  return { title: t("title") };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** `/trash` — unified recycle bin for every soft-deletable entity (P1-08, FR-SYS-001). Gate: `trash.view`. */
export default async function TrashPage({ searchParams }: Props) {
  const ctx = await requireUser();
  if (!hasPermission(ctx, "trash.view")) redirect("/unauthorized");
  const sp = await searchParams;
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const parsed = trashQuerySchema.safeParse(flat);
  const query = parsed.success ? parsed.data : trashQuerySchema.parse({});

  const [page, counts, t] = await Promise.all([
    listTrash(ctx, query),
    trashCounts(ctx),
    getTranslations("trash"),
  ]);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-3 lg:gap-4">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <TrashClient
        page={page}
        query={query}
        counts={counts}
        can={{
          restore: hasPermission(ctx, "trash.restore"),
          purge: hasPermission(ctx, "trash.permanent_delete"),
        }}
      />
    </div>
  );
}
