import { ShieldOff } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { StatusPage } from "@/components/layout/StatusPage";

export default async function UnauthorizedPage() {
  const t = await getTranslations();
  return (
    <StatusPage
      icon={ShieldOff}
      code="403"
      title={t("errors.unauthorizedTitle")}
      body={t("errors.unauthorizedBody")}
      action={{ href: "/dashboard", label: t("common.backHome") }}
    />
  );
}
