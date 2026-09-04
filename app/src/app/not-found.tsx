import { FileQuestion } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { StatusPage } from "@/components/layout/StatusPage";

export default async function NotFound() {
  const t = await getTranslations();
  return (
    <StatusPage
      icon={FileQuestion}
      code="404"
      title={t("errors.notFoundTitle")}
      body={t("errors.notFoundBody")}
      action={{ href: "/dashboard", label: t("common.backHome") }}
    />
  );
}
