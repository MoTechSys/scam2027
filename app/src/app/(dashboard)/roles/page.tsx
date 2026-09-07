import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { hasPermission, requireUser } from "@/lib/auth/rbac";
import { listRoles, roleTabCounts } from "@/features/roles/queries";
import { roleListQuerySchema } from "@/features/roles/schemas";
import { RolesClient } from "./roles-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("roles");
  return { title: t("title") };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function RolesPage({ searchParams }: Props) {
  const ctx = await requireUser();
  if (!hasPermission(ctx, "role.view")) redirect("/unauthorized");
  const sp = await searchParams;
  const parsed = roleListQuerySchema.safeParse(Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const query = parsed.success ? parsed.data : roleListQuerySchema.parse({});
  const [roles, counts, t] = await Promise.all([listRoles(ctx, query), roleTabCounts(ctx), getTranslations("roles")]);

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-3 lg:gap-4">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <RolesClient
        roles={roles}
        query={query}
        counts={counts}
        grantable={[...ctx.user.permissions]}
        can={{
          create: hasPermission(ctx, "role.create"),
          edit: hasPermission(ctx, "role.edit"),
          editPermissions: hasPermission(ctx, "role.edit_permissions"),
          delete: hasPermission(ctx, "role.delete"),
          viewPermissions: hasPermission(ctx, "role.view_permissions"),
        }}
      />
    </div>
  );
}
