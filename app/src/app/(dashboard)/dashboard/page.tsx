import {
  Activity,
  Clock,
  GraduationCap,
  KeyRound,
  Lock,
  LogIn,
  Presentation,
  Shield,
  ShieldAlert,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { requireUser } from "@/lib/auth/rbac";
import { loadDashboard } from "@/lib/dashboard/queries";
import { currentTenant } from "@/lib/tenant/current";
import { MySessions } from "./my-sessions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
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

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground">
          {t("welcome", { name: ctx.user.name })}
          <span className="mx-2 text-border" aria-hidden="true">
            |
          </span>
          <span className="text-sm">
            {t("roleLabel")}: <span className="font-medium text-primary">{roleNames}</span>
          </span>
        </p>
      </header>

      {data.system ? (
        <section aria-labelledby="sys-stats" className="space-y-4">
          <h2 id="sys-stats" className="sr-only">
            {t("title")}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title={t("stats.users")} value={f.number(data.system.users)} icon={Users} />
            <StatCard title={t("stats.activeUsers")} value={f.number(data.system.activeUsers)} icon={UserCheck} />
            <StatCard title={t("stats.instructors")} value={f.number(data.system.instructors)} icon={Presentation} />
            <StatCard title={t("stats.students")} value={f.number(data.system.students)} icon={GraduationCap} />
            <StatCard title={t("stats.roles")} value={f.number(data.system.roles)} icon={Shield} />
            <StatCard title={t("stats.sessions")} value={f.number(data.system.sessions)} icon={Activity} />
            <StatCard title={t("stats.loginsToday")} value={f.number(data.system.loginsToday)} icon={LogIn} />
            <StatCard
              title={t("stats.failedLogins24h")}
              value={f.number(data.system.failedLogins24h)}
              icon={ShieldAlert}
              className={data.system.failedLogins24h > 0 ? "border-warning/40" : undefined}
            />
            <StatCard title={t("stats.lockedAccounts")} value={f.number(data.system.lockedAccounts)} icon={Lock} />
            <StatCard
              title={t("stats.pendingActivation")}
              value={f.number(data.system.pendingActivation)}
              icon={UserPlus}
            />
          </div>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard title={t("stats.permissions")} value={f.number(ctx.user.permissions.size)} icon={KeyRound} />
          <StatCard
            title={t("stats.lastLogin")}
            value={data.lastLoginAt ? f.dateTime(data.lastLoginAt, { dateStyle: "medium", timeStyle: "short" }) : "—"}
            icon={Clock}
            valueClassName="text-xl leading-snug"
          />
          <StatCard title={t("stats.mySessions")} value={f.number(data.mySessions.length)} icon={Activity} />
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("mySessionsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <MySessions
              sessions={data.mySessions.map((s) => ({
                ...s,
                createdAt: s.createdAt.toISOString(),
                lastSeenAt: s.lastSeenAt.toISOString(),
              }))}
            />
          </CardContent>
        </Card>

        {data.audit !== null ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("recentAudit")}</CardTitle>
            </CardHeader>
            <CardContent>
              {data.audit.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("noAudit")}</p>
              ) : (
                <ol className="divide-y divide-border">
                  {data.audit.map((a) => (
                    <li key={a.id} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p dir="ltr" className="truncate font-mono text-sm text-start">
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
            </CardContent>
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

      {data.system && (
        <p className="text-center text-xs text-muted-foreground">{t("comingSoon")}</p>
      )}
    </div>
  );
}
