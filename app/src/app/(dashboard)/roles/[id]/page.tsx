import { ArrowRight, Users } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRoleDetail, listRoleMembers } from "@/features/roles/queries";
import { hasPermission, requireUser } from "@/lib/auth/rbac";
import { RoleTypeBadge } from "../roles-client";
import { RoleDetailActions } from "./detail-actions";
import { PermissionsEditor } from "./permissions-editor";

type Props = { params: Promise<{ id: string }> };
const MEMBERS_TAKE = 12;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const ctx = await requireUser();
  if (!hasPermission(ctx, "role.view")) return {};
  const r = /^[0-9a-f-]{36}$/i.test(id) ? await getRoleDetail(ctx, id) : null;
  return { title: r?.name ?? "" };
}

export default async function RoleDetailPage({ params }: Props) {
  const { id } = await params;
  const ctx = await requireUser();
  if (!hasPermission(ctx, "role.view")) redirect("/unauthorized");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const canViewPerms = hasPermission(ctx, "role.view_permissions");
  const canViewUsers = hasPermission(ctx, "user.view");
  const [role, members, t, tc, f] = await Promise.all([
    getRoleDetail(ctx, id),
    canViewUsers ? listRoleMembers(ctx, id, MEMBERS_TAKE) : Promise.resolve([]),
    getTranslations("roles"),
    getTranslations("common"),
    getFormatter(),
  ]);
  if (!role) notFound();

  const readOnly = role.isSystem || !!role.deletedAt || !hasPermission(ctx, "role.edit_permissions");
  const grantable = [...ctx.user.permissions];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ms-2 gap-1 text-muted-foreground">
        <Link href="/roles">
          <ArrowRight className="size-4 rtl:rotate-0 ltr:rotate-180" aria-hidden /> {t("detail.back")}
        </Link>
      </Button>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold sm:text-3xl">{role.name}</h1>
            <RoleTypeBadge role={role} />
          </div>
          <p dir="ltr" className="font-mono text-sm text-muted-foreground">
            {role.code}
            {role.nameEn && <span className="ms-2 font-sans">· {role.nameEn}</span>}
          </p>
          <p className="text-sm text-muted-foreground">{role.description ?? t("detail.noDescription")}</p>
          {role.isSystem && <p className="text-sm text-amber-600 dark:text-amber-400">{t("systemHint")}</p>}
        </div>
        <RoleDetailActions
          role={role}
          grantable={grantable}
          can={{ create: hasPermission(ctx, "role.create"), edit: hasPermission(ctx, "role.edit"), delete: hasPermission(ctx, "role.delete") }}
        />
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <section aria-labelledby="perm-title" className="space-y-3">
          <div className="space-y-1">
            <h2 id="perm-title" className="text-lg font-semibold">
              {t("matrix.title")}
            </h2>
            {!readOnly && <p className="text-sm text-muted-foreground">{t("matrix.hint")}</p>}
          </div>
          {canViewPerms ? (
            <PermissionsEditor roleId={role.id} initial={role.permissionCodes} grantable={grantable} readOnly={readOnly} />
          ) : (
            <p className="text-sm text-muted-foreground">{t("permissionsOf", { count: role.permissionCount, total: role.permissionTotal })}</p>
          )}
        </section>

        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="size-4" aria-hidden /> {t("detail.members")}
                <span className="ms-auto tabular-nums text-muted-foreground">{role.userCount}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {role.userCount === 0 ? (
                <p className="text-sm text-muted-foreground">{t("detail.noMembers")}</p>
              ) : (
                <ul className="divide-y divide-border text-sm">
                  {members.map((m) => (
                    <li key={m.id} className="flex min-h-10 items-center justify-between gap-2 py-1.5">
                      {hasPermission(ctx, "user.view_details") ? (
                        <Link href={`/users/${m.id}`} className="truncate hover:text-primary hover:underline">
                          {m.name}
                        </Link>
                      ) : (
                        <span className="truncate">{m.name}</span>
                      )}
                      <span dir="ltr" className="shrink-0 font-mono text-xs text-muted-foreground">
                        {m.academicId}
                      </span>
                    </li>
                  ))}
                  {role.userCount > members.length && (
                    <li className="pt-2 text-xs text-muted-foreground">
                      {canViewUsers ? (
                        <Link href={`/users?roleId=${role.id}`} className="hover:text-primary hover:underline">
                          {t("detail.moreMembers", { count: role.userCount - members.length })}
                        </Link>
                      ) : (
                        t("detail.moreMembers", { count: role.userCount - members.length })
                      )}
                    </li>
                  )}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2 pt-4 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("columns.permissions")}</span>
                <span className="tabular-nums">{t("permissionsOf", { count: role.permissionCount, total: role.permissionTotal })}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("detail.updated")}</span>
                <span>{f.dateTime(role.updatedAt, { dateStyle: "medium", timeStyle: "short" })}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{tc("language")}</span>
                <span>{role.nameEn ? `${tc("arabic")} · ${tc("english")}` : tc("arabic")}</span>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
