import type { Metadata } from "next";
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
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>
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
