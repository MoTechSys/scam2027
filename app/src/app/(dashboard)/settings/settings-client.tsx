"use client";

/**
 * Settings shell (P1-10): URL tabs → one form per tab inside the ScrollRegion (ADR-0008). Each form submits plain
 * FormData to its Server Action; server `fieldErrors` are surfaced under the fields. Read-only users see the values
 * with disabled controls and no submit button (no "phantom" editing).
 */
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { PageTabs } from "@/components/ui/page-tabs";
import { ScrollRegion } from "@/components/ui/scroll-region";
import type { BrandingView, EmailView, GeneralView, SecurityView } from "@/features/settings/queries";
import { SETTINGS_TABS, type SettingsTab } from "@/features/settings/schemas";
import { BrandingForm } from "./branding-form";
import { GeneralForm } from "./general-form";
import { SecurityForm } from "./security-form";

export type SettingsCan = { general: boolean; security: boolean; branding: boolean; email: boolean };
export type SettingsData =
  | { tab: "general"; general: GeneralView }
  | { tab: "security"; security: SecurityView; email: EmailView }
  | { tab: "branding"; branding: BrandingView };

export function SettingsClient({ data, can }: { data: SettingsData; can: SettingsCan }) {
  const t = useTranslations("settings");
  const router = useRouter();
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 lg:gap-4" data-testid="page-shell">
      <PageTabs
        tabs={SETTINGS_TABS.map((id) => ({ id, label: t(`tabs.${id}`) }))}
        activeTab={data.tab}
        onTabChange={(id) => router.push(`/settings/${id as SettingsTab}`)}
      />
      <ScrollRegion label={t("title")} className="-mx-1 px-1">
        <div className="mx-auto max-w-3xl pb-6">
          {data.tab === "general" && <GeneralForm initial={data.general} canEdit={can.general} />}
          {data.tab === "security" && (
            <SecurityForm
              initial={data.security}
              email={data.email}
              canEdit={can.security}
              canEmail={can.email}
            />
          )}
          {data.tab === "branding" && <BrandingForm initial={data.branding} canEdit={can.branding} />}
        </div>
      </ScrollRegion>
    </div>
  );
}
