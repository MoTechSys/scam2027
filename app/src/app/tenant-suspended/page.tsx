import { PauseCircle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { StatusPage } from "@/components/layout/StatusPage";

export default async function TenantSuspendedPage() {
  const t = await getTranslations();
  return (
    <StatusPage
      icon={PauseCircle}
      code="503"
      title={t("errors.tenantSuspendedTitle")}
      body={t("errors.tenantSuspendedBody")}
      action={{ href: "/developer", label: t("developer.contact") }}
    />
  );
}
