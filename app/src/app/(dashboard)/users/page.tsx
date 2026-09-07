import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
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
    <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-3 lg:gap-4">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
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
