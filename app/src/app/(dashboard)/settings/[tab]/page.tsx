import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { loadBranding, loadEmail, loadGeneral, loadSecurity } from "@/features/settings/queries";
import { SETTINGS_TABS, type SettingsTab } from "@/features/settings/schemas";
import { hasPermission, requireUser } from "@/lib/auth/rbac";
import { SettingsClient, type SettingsCan, type SettingsData } from "../settings-client";

type Props = { params: Promise<{ tab: string }> };

function isTab(v: string): v is SettingsTab {
  return (SETTINGS_TABS as readonly string[]).includes(v);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tab } = await params;
  const t = await getTranslations("settings");
  return { title: isTab(tab) ? `${t("title")} — ${t(`tabs.${tab}`)}` : t("title") };
}

/** `/settings/[tab]` — general / security / branding (P1-10). Gate: `settings.view`; each tab edits behind its own permission. */
export default async function SettingsTabPage({ params }: Props) {
  const { tab } = await params;
  if (!isTab(tab)) notFound();
  const ctx = await requireUser();
  if (!hasPermission(ctx, "settings.view")) redirect("/unauthorized");

  const can: SettingsCan = {
    general: hasPermission(ctx, "settings.edit_general"),
    security: hasPermission(ctx, "settings.edit_security"),
    branding: hasPermission(ctx, "settings.edit_branding"),
    email: hasPermission(ctx, "settings.edit_email"),
  };
  const t = await getTranslations("settings");
  const data: SettingsData =
    tab === "general"
      ? { tab, general: await loadGeneral(ctx) }
      : tab === "security"
        ? { tab, security: await loadSecurity(ctx), email: await loadEmail(ctx) }
        : { tab, branding: await loadBranding(ctx) };

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-3 lg:gap-4">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <SettingsClient data={data} can={can} />
    </div>
  );
}
