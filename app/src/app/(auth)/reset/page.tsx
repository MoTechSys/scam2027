import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TokenPage } from "../_components/token-page";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("resetTitle") };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <TokenPage purpose="RESET" token={token} />;
}
