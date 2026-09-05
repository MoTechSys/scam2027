import { ArrowRight, KeyRound, Mail, Phone, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getUserDetail, listRoleOptions } from "@/features/users/queries";
import { hasPermission, requireUser } from "@/lib/auth/rbac";
import { UserStatusBadge } from "../status-badge";
import { DetailActions } from "./detail-actions";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const ctx = await requireUser();
  if (!hasPermission(ctx, "user.view_details")) return {};
  const u = await getUserDetail(ctx, id);
  return { title: u?.name ?? "" };
}

export default async function UserDetailPage({ params }: Props) {
  const { id } = await params;
  const ctx = await requireUser();
  if (!hasPermission(ctx, "user.view_details")) redirect("/unauthorized");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [u, roles, t, tc, f] = await Promise.all([
    getUserDetail(ctx, id),
    listRoleOptions(ctx),
    getTranslations("users"),
    getTranslations("common"),
    getFormatter(),
  ]);
  if (!u) notFound();
  const self = u.id === ctx.user.id;

  const info: { label: string; value: React.ReactNode; icon?: React.ReactNode }[] = [
    { label: t("form.academicId"), value: <span dir="ltr" className="font-mono">{u.academicId}</span> },
    { label: t("form.email"), value: <span dir="ltr">{u.email}</span>, icon: <Mail className="size-4" aria-hidden /> },
    { label: t("form.phone"), value: u.phone ? <span dir="ltr">{u.phone}</span> : "—", icon: <Phone className="size-4" aria-hidden /> },
    { label: t("form.title"), value: u.profile?.title ?? "—" },
    { label: t("form.locale"), value: u.locale === "ar" ? tc("arabic") : tc("english") },
    { label: t("columns.createdAt"), value: f.dateTime(u.createdAt, { dateStyle: "medium" }) },
    { label: t("columns.lastLogin"), value: u.lastLoginAt ? f.dateTime(u.lastLoginAt, { dateStyle: "medium", timeStyle: "short" }) : t("never") },
  ];
  const security: { label: string; value: React.ReactNode }[] = [
    { label: t("detail.activeSessions"), value: u.activeSessions },
    { label: t("detail.failedLogins"), value: u.failedLoginCount },
    { label: t("detail.lockedUntil"), value: u.lockedUntil && u.lockedUntil > new Date() ? f.dateTime(u.lockedUntil, { timeStyle: "short" }) : "—" },
    { label: t("detail.mustChange"), value: u.mustChangePassword ? <KeyRound className="size-4 text-amber-500" aria-label="yes" /> : "—" },
    { label: t("detail.emailVerified"), value: u.emailVerifiedAt ? <ShieldCheck className="size-4 text-primary" aria-label="yes" /> : t("detail.notVerified") },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ms-2 gap-1 text-muted-foreground">
        <Link href="/users">
          <ArrowRight className="size-4 rtl:rotate-0 ltr:rotate-180" aria-hidden /> {t("title")}
        </Link>
      </Button>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold sm:text-3xl">{u.name}</h1>
            <UserStatusBadge status={u.status} deleted={!!u.deletedAt} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {u.roles.map((r) => (
              <Badge key={r.id} variant="secondary">
                {r.name}
              </Badge>
            ))}
          </div>
          {self && <p className="text-sm text-muted-foreground">{t("detail.self")}</p>}
        </div>
        <DetailActions
          user={u}
          roles={roles}
          self={self}
          can={{
            edit: hasPermission(ctx, "user.edit"),
            delete: hasPermission(ctx, "user.delete"),
            restore: hasPermission(ctx, "user.restore"),
            activate: hasPermission(ctx, "user.activate"),
            freeze: hasPermission(ctx, "user.freeze"),
            resetPassword: hasPermission(ctx, "user.reset_password"),
            changeRole: hasPermission(ctx, "user.change_role", "role.assign"),
          }}
        />
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
                  <dd className="flex items-center gap-2 text-sm">
                    {i.icon} {i.value}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.security")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3">
              {security.map((i) => (
                <div key={i.label} className="flex items-center justify-between gap-3 text-sm">
                  <dt className="text-muted-foreground">{i.label}</dt>
                  <dd className="font-medium">{i.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("detail.activity")}</CardTitle>
        </CardHeader>
        <CardContent>
          {u.recentAudit.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("detail.noAudit")}</p>
          ) : (
            <ol className="divide-y divide-border">
              {u.recentAudit.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="font-mono text-xs">{a.action}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("detail.by", { name: a.actorName ?? t("detail.system") })} · {f.relativeTime(a.createdAt)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
