import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { hasPermission, requireUser } from "@/lib/auth/rbac";
import { listRoleOptions, listUsers, userStatusCounts } from "@/features/users/queries";
import { userListQuerySchema } from "@/features/users/schemas";
import { UsersClient } from "./users-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("users");
  return { title: t("title") };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function UsersPage({ searchParams }: Props) {
  const ctx = await requireUser();
  if (!hasPermission(ctx, "user.view")) redirect("/unauthorized");
  const sp = await searchParams;
  const parsed = userListQuerySchema.safeParse(Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])));
  const query = parsed.success ? parsed.data : userListQuerySchema.parse({});
  const [page, counts, roles, t] = await Promise.all([
    listUsers(ctx, query),
    userStatusCounts(ctx),
    listRoleOptions(ctx),
    getTranslations("users"),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>
      <UsersClient
        page={page}
        query={query}
        counts={counts}
        roles={roles}
        selfId={ctx.user.id}
        can={{
          create: hasPermission(ctx, "user.create"),
          edit: hasPermission(ctx, "user.edit"),
          delete: hasPermission(ctx, "user.delete"),
          restore: hasPermission(ctx, "user.restore"),
          activate: hasPermission(ctx, "user.activate"),
          freeze: hasPermission(ctx, "user.freeze"),
          resetPassword: hasPermission(ctx, "user.reset_password"),
          changeRole: hasPermission(ctx, "user.change_role", "role.assign"),
          viewDetails: hasPermission(ctx, "user.view_details"),
        }}
      />
    </div>
  );
}
