import { Building2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { StatusPage } from "@/components/layout/StatusPage";

export default async function TenantNotFoundPage({
  searchParams,
}: {
  searchParams: Promise<{ host?: string }>;
}) {
  const t = await getTranslations();
  const { host } = await searchParams;
  // Host is rendered as text (React escapes); cap length to avoid layout abuse.
  const safeHost = (host ?? "").slice(0, 120) || "—";
  return (
    <StatusPage
      icon={Building2}
      code="404"
      title={t("errors.tenantNotFoundTitle")}
      body={t("errors.tenantNotFoundBody", { host: safeHost })}
      action={{ href: "/developer", label: t("developer.contact") }}
    />
  );
}
