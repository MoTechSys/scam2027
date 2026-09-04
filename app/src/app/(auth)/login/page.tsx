import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { currentTenant } from "@/lib/tenant/current";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("loginTitle") };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reason?: string }>;
}) {
  const [t, tDev, tenant, sp] = await Promise.all([
    getTranslations("auth"),
    getTranslations("developer"),
    currentTenant(),
    searchParams,
  ]);
  const name = tenant?.name ?? "scam2027";
  const logo = tenant?.branding?.logoUrl ?? null;

  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center px-4 py-8 safe-area-bottom">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          {logo ? (
            <Image
              src={logo}
              alt={name}
              width={80}
              height={80}
              className="mb-4 size-20 rounded-2xl object-contain"
              unoptimized
            />
          ) : (
            <div
              className="mb-4 flex size-20 items-center justify-center rounded-2xl bg-primary text-3xl font-black text-primary-foreground neon-glow"
              aria-hidden="true"
            >
              {name.trim().charAt(0)}
            </div>
          )}
          <h1 className="text-2xl font-bold">{name}</h1>
          {tenant?.branding?.loginMessage && (
            <p className="mt-2 text-sm text-muted-foreground">{tenant.branding.loginMessage}</p>
          )}
        </div>

        <Card className="neon-border">
          <CardHeader className="text-center">
            <h2 className="text-xl font-semibold">{t("loginTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("loginSubtitle")}</p>
          </CardHeader>
          <CardContent>
            <LoginForm next={sp.next} reason={sp.reason} />
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link href="/developer" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
            {tDev("title")}
          </Link>
        </p>
      </div>
    </main>
  );
}
