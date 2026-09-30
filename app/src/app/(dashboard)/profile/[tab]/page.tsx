import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { loadSecurityPolicy } from "@/features/auth/core";
import { preferences } from "@/features/notifications/queries";
import { loadProfile } from "@/features/profile/queries";
import { PROFILE_TABS, isProfileTab } from "@/features/profile/schemas";
import { hasPermission, requireUser } from "@/lib/auth/rbac";
import { tx } from "@/lib/db/tenant";
import { ProfileClient, type ProfileData } from "../profile-client";

type Props = { params: Promise<{ tab: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tab } = await params;
  const t = await getTranslations("profile");
  return { title: isProfileTab(tab) ? `${t("title")} — ${t(`tabs.${tab}`)}` : t("title") };
}

/**
 * `/profile/[tab]` — info / password / appearance / notifications (P1-14, FR-USR-011). Own account only: no
 * permission beyond a valid session. The notifications tab is hidden without `notification.view`.
 */
export default async function ProfileTabPage({ params }: Props) {
  const { tab } = await params;
  if (!isProfileTab(tab)) notFound();
  const ctx = await requireUser();
  const canNotify = hasPermission(ctx, "notification.view");
  const tabs = PROFILE_TABS.filter((id) => id !== "notifications" || canNotify);
  if (!tabs.includes(tab)) notFound();
  const t = await getTranslations("profile");

  let data: ProfileData;
  if (tab === "info") data = { tab, profile: await loadProfile(ctx) };
  else if (tab === "password") {
    const [policy, profile] = await Promise.all([
      tx(ctx.tenantId, (tt) => loadSecurityPolicy(tt, ctx.tenantId)),
      loadProfile(ctx),
    ]);
    data = { tab, minLength: policy.passwordMinLength, passwordChangedAt: profile.passwordChangedAt };
  } else if (tab === "appearance") data = { tab, theme: (await loadProfile(ctx)).theme };
  else data = { tab, prefs: await preferences(ctx) };

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-3 lg:gap-4">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <ProfileClient data={data} tabs={tabs} />
    </div>
  );
}
