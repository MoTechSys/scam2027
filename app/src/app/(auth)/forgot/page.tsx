import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "../_components/auth-card";
import { ForgotForm } from "./forgot-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("forgotTitle") };
}

export default async function ForgotPage() {
  const t = await getTranslations("auth");
  return (
    <AuthCard title={t("forgotTitle")} subtitle={t("forgotSubtitle")}>
      <ForgotForm />
    </AuthCard>
  );
}
