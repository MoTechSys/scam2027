import {
  Activity,
  Bell,
  BookOpen,
  Clock,
  FolderOpen,
  GraduationCap,
  KeyRound,
  Layers,
  Lock,
  LogIn,
  Presentation,
  Shield,
  ShieldAlert,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MiniStatCard } from "@/components/ui/mini-stat-card";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { StatCard } from "@/components/ui/stat-card";
import type { PermissionCode } from "@/lib/auth/permissions";
import { hasPermission, requireUser } from "@/lib/auth/rbac";
import { loadDashboard, type DashboardData } from "@/lib/dashboard/queries";
import { currentTenant } from "@/lib/tenant/current";
import { GrowthChart } from "./growth-chart";
import { MySessions } from "./my-sessions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

type T = Awaited<ReturnType<typeof getTranslations<"dashboard">>>;
type F = Awaited<ReturnType<typeof getFormatter>>;
type QuickLink = { key: string; href: string; icon: LucideIcon; tone: string; label: string };

/** Mobile overview (< lg) — mirrors the reference "app-like" dashboard (ADR-0007 §3). */
function MobileOverview({
  data,
  quick,
  permissions,
  t,
  f,
}: {
  data: DashboardData;
  quick: QuickLink[];
  permissions: number;
  t: T;
  f: F;
}) {
  const o = data.overview;
  const s = data.system;
  const growth = o.growth?.map((g) => ({ month: g.month.toISOString(), users: g.users })) ?? null;
  const trend = (() => {
    if (!o.growth || o.growth.length < 2) return undefined;
    const last = o.growth[o.growth.length - 1]!.users;
    const prev = o.growth[o.growth.length - 2]!.users;
    if (prev === 0) return undefined;
    const pct = Math.round(((last - prev) / prev) * 100);
    return pct === 0 ? undefined : { value: pct, isPositive: pct > 0 };
  })();

  const stats: { key: string; title: string; value: number; icon: LucideIcon; trend?: typeof trend }[] = [];
  if (s) {
    stats.push({ key: "users", title: t("stats.users"), value: s.users, icon: Users, trend });
    stats.push({ key: "active", title: t("stats_extra.active"), value: s.activeUsers, icon: UserCheck });
  } else {
    stats.push({ key: "perms", title: t("stats.permissions"), value: permissions, icon: KeyRound });
  }
  if (o.courses !== null)
    stats.push({ key: "courses", title: t("stats_extra.courses"), value: o.courses, icon: BookOpen });
  if (o.files !== null)
    stats.push({ key: "files", title: t("stats_extra.files"), value: o.files, icon: FolderOpen });
  if (o.unreadNotifications !== null)
    stats.push({ key: "unread", title: t("stats_extra.unread"), value: o.unreadNotifications, icon: Bell });
  if (o.openOfferings !== null)
    stats.push({
      key: "offerings",
      title: t("stats_extra.openOfferings"),
      value: o.openOfferings,
      icon: Layers,
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 lg:hidden" data-testid="mobile-overview">
      <div className="grid grid-cols-3 gap-1.5" data-testid="mobile-stats">
        {stats.slice(0, 6).map((st) => (
          <MiniStatCard
            key={st.key}
            title={st.title}
            value={f.number(st.value)}
            icon={st.icon}
            trend={st.trend}
          />
        ))}
      </div>

      {growth && (
        <Card className="gap-0 rounded-xl py-0">
          <CardHeader className="px-2 pt-2 pb-1">
            <CardTitle className="flex items-center gap-1 text-xs">
              <TrendingUp className="size-3 text-primary" aria-hidden="true" />
              {t("growth.title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-1 pb-2">
            <div className="h-20" role="img" aria-label={t("growth.series")}>
              <GrowthChart data={growth} compact />
            </div>
          </CardContent>
        </Card>
      )}

      {quick.length > 0 && (
        <nav className="grid grid-cols-4 gap-1.5" aria-label={t("quick.title")} data-testid="quick-links">
          {quick.slice(0, 4).map((q) => {
            const Icon = q.icon;
            return (
              <Link
                key={q.key}
                href={q.href}
                className="rounded-xl border border-border bg-card p-2 text-center transition-transform active:scale-95"
              >
                <Icon className={`mx-auto mb-1 size-4 ${q.tone}`} aria-hidden="true" />
                <span className="block truncate text-[10px] text-muted-foreground">{q.label}</span>
              </Link>
            );
          })}
        </nav>
      )}

      {/* Remaining height: two fixed cards whose bodies scroll internally (ADR-0008 §4). */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2">
        {data.audit !== null && (
          <Card className="flex min-h-0 flex-col gap-0 rounded-xl py-0">
            <CardHeader className="shrink-0 px-2 pt-2 pb-1">
              <CardTitle className="flex items-center gap-1 text-xs">
                <Clock className="size-3 text-primary" aria-hidden="true" />
                {t("recent.title")}
              </CardTitle>
            </CardHeader>
            <ScrollRegion label={t("recent.title")} className="px-2 pb-2">
              {data.audit.length === 0 ? (
                <p className="py-3 text-center text-[11px] text-muted-foreground">{t("noAudit")}</p>
              ) : (
                <ol className="space-y-0.5">
                  {data.audit.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center gap-1.5 border-b border-border/30 py-1 last:border-0"
                    >
                      <span className="size-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                      <p className="min-w-0 flex-1 truncate text-[10px]">
                        <span dir="ltr" className="font-mono">
                          {a.action}
                        </span>
                        <span className="text-muted-foreground"> · {a.actorName ?? "system"}</span>
                      </p>
                      <time
                        dateTime={a.createdAt.toISOString()}
                        className="shrink-0 text-[9px] text-muted-foreground"
                      >
                        {f.relativeTime(a.createdAt)}
                      </time>
                    </li>
                  ))}
                </ol>
              )}
            </ScrollRegion>
          </Card>
        )}
        <Card className="flex min-h-0 flex-col gap-0 rounded-xl py-0">
          <CardHeader className="shrink-0 px-2 pt-2 pb-1">
            <CardTitle className="text-xs">{t("mySessionsTitle")}</CardTitle>
          </CardHeader>
          <ScrollRegion label={t("mySessionsTitle")} className="px-2 pb-2">
            <MySessions
              compact
              sessions={data.mySessions.map((x) => ({
                ...x,
                createdAt: x.createdAt.toISOString(),
                lastSeenAt: x.lastSeenAt.toISOString(),
              }))}
            />
          </ScrollRegion>
        </Card>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const ctx = await requireUser();
  const [t, tNav, f, tenant] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("nav"),
    getFormatter(),
    currentTenant(),
  ]);
  const data = await loadDashboard(ctx, tenant?.timezone ?? "Asia/Riyadh");
  const roleNames = ctx.user.roles.join(" · ");

  const candidates: (QuickLink & { perm: PermissionCode })[] = [
    {
      key: "courses",
      href: "/courses",
      icon: BookOpen,
      tone: "text-primary",
      label: tNav("courses"),
      perm: "course.view",
    },
    {
      key: "files",
      href: "/files",
      icon: FolderOpen,
      tone: "text-cyan-400",
      label: tNav("files"),
      perm: "file.view",
    },
    {
      key: "offerings",
      href: "/offerings",
      icon: Layers,
      tone: "text-purple-400",
      label: tNav("offerings"),
      perm: "offering.view",
    },
    {
      key: "users",
      href: "/users",
      icon: Users,
      tone: "text-amber-400",
      label: tNav("users"),
      perm: "user.view",
    },
    {
      key: "notifications",
      href: "/notifications",
      icon: Bell,
      tone: "text-primary",
      label: tNav("notifications"),
      perm: "notification.view",
    },
  ];
  const quick: QuickLink[] = candidates
    .filter((q) => hasPermission(ctx, q.perm))
    .map(({ perm: _perm, ...q }) => q);

  const growthDesktop =
    data.overview.growth?.map((g) => ({ month: g.month.toISOString(), users: g.users })) ?? null;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col gap-2 lg:gap-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <MobileOverview data={data} quick={quick} permissions={ctx.user.permissions.size} t={t} f={f} />

      {/* Desktop (lg+) */}
      <div className="hidden min-h-0 flex-1 flex-col gap-6 lg:flex">
        <p className="text-muted-foreground">
          {t("welcome", { name: ctx.user.name })}
          <span className="mx-2 text-border" aria-hidden="true">
            |
          </span>
          <span className="text-sm">
            {t("roleLabel")}: <span className="font-medium text-primary">{roleNames}</span>
          </span>
        </p>

        {data.system ? (
          <section aria-labelledby="sys-stats" className="space-y-4">
            <h2 id="sys-stats" className="sr-only">
              {t("title")}
            </h2>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <StatCard title={t("stats.users")} value={f.number(data.system.users)} icon={Users} />
              <StatCard
                title={t("stats.activeUsers")}
                value={f.number(data.system.activeUsers)}
                icon={UserCheck}
              />
              <StatCard
                title={t("stats.instructors")}
                value={f.number(data.system.instructors)}
                icon={Presentation}
              />
              <StatCard
                title={t("stats.students")}
                value={f.number(data.system.students)}
                icon={GraduationCap}
              />
              <StatCard title={t("stats.roles")} value={f.number(data.system.roles)} icon={Shield} />
              <StatCard title={t("stats.sessions")} value={f.number(data.system.sessions)} icon={Activity} />
              <StatCard
                title={t("stats.loginsToday")}
                value={f.number(data.system.loginsToday)}
                icon={LogIn}
              />
              <StatCard
                title={t("stats.failedLogins24h")}
                value={f.number(data.system.failedLogins24h)}
                icon={ShieldAlert}
                className={data.system.failedLogins24h > 0 ? "border-warning/40" : undefined}
              />
              <StatCard
                title={t("stats.lockedAccounts")}
                value={f.number(data.system.lockedAccounts)}
                icon={Lock}
              />
              <StatCard
                title={t("stats.pendingActivation")}
                value={f.number(data.system.pendingActivation)}
                icon={UserPlus}
              />
            </div>
          </section>
        ) : (
          <section className="grid grid-cols-3 gap-4">
            <StatCard
              title={t("stats.permissions")}
              value={f.number(ctx.user.permissions.size)}
              icon={KeyRound}
            />
            <StatCard
              title={t("stats.lastLogin")}
              value={
                data.lastLoginAt
                  ? f.dateTime(data.lastLoginAt, { dateStyle: "medium", timeStyle: "short" })
                  : "—"
              }
              icon={Clock}
              valueClassName="text-xl leading-snug"
            />
            <StatCard
              title={t("stats.mySessions")}
              value={f.number(data.mySessions.length)}
              icon={Activity}
            />
          </section>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-2 gap-6">
          {growthDesktop && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="size-4 text-primary" aria-hidden="true" />
                  {t("growth.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-60" role="img" aria-label={t("growth.series")}>
                  <GrowthChart data={growthDesktop} />
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="flex min-h-0 flex-col">
            <CardHeader className="shrink-0">
              <CardTitle className="text-base">{t("mySessionsTitle")}</CardTitle>
            </CardHeader>
            <ScrollRegion label={t("mySessionsTitle")} className="px-6 pb-6">
              <MySessions
                sessions={data.mySessions.map((s) => ({
                  ...s,
                  createdAt: s.createdAt.toISOString(),
                  lastSeenAt: s.lastSeenAt.toISOString(),
                }))}
              />
            </ScrollRegion>
          </Card>

          {data.audit !== null ? (
            <Card className={`flex min-h-0 flex-col ${growthDesktop ? "col-span-2" : ""}`}>
              <CardHeader className="shrink-0">
                <CardTitle className="text-base">{t("recentAudit")}</CardTitle>
              </CardHeader>
              <ScrollRegion label={t("recentAudit")} className="px-6 pb-6">
                {data.audit.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">{t("noAudit")}</p>
                ) : (
                  <ol className="divide-y divide-border">
                    {data.audit.map((a) => (
                      <li key={a.id} className="flex items-start justify-between gap-3 py-3">
                        <div className="min-w-0">
                          <p dir="ltr" className="truncate text-start font-mono text-sm">
                            {a.action}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {a.actorName ?? "system"} · {a.entity}
                          </p>
                        </div>
                        <time
                          dateTime={a.createdAt.toISOString()}
                          className="shrink-0 text-xs text-muted-foreground"
                          title={f.dateTime(a.createdAt, { dateStyle: "medium", timeStyle: "short" })}
                        >
                          {f.relativeTime(a.createdAt)}
                        </time>
                      </li>
                    ))}
                  </ol>
                )}
              </ScrollRegion>
            </Card>
          ) : (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-base">
                  {tNav("courses")} · {tNav("quizzes")} · {tNav("grades")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{t("comingSoon")}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
