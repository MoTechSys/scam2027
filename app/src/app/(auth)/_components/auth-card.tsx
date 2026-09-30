import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { currentTenant } from "@/lib/tenant/current";

/**
 * Standalone auth page shell (login / forgot / reset / activate / change-password): tenant branding header +
 * one Card. Owns its scroll (`h-dvh overflow-y-auto`, ADR-0008) and renders exactly one h1 (crawl/a11y gates).
 */
export async function AuthCard({
  title,
  subtitle,
  children,
  backToLogin = true,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  backToLogin?: boolean;
}) {
  const [t, tDev, tenant] = await Promise.all([
    getTranslations("auth"),
    getTranslations("developer"),
    currentTenant(),
  ]);
  const name = tenant?.name ?? "scam2027";
  const logo = tenant?.branding?.logoUrl ?? null;
  return (
    <main id="main" className="safe-area-bottom flex h-dvh flex-col items-center overflow-y-auto px-4 py-8">
      <div className="my-auto w-full max-w-md">
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
              className="neon-glow mb-4 flex size-20 items-center justify-center rounded-2xl bg-primary text-3xl font-black text-primary-foreground"
              aria-hidden="true"
            >
              {name.trim().charAt(0)}
            </div>
          )}
          <h1 className="text-2xl font-bold">{name}</h1>
        </div>
        <Card className="neon-border">
          <CardHeader className="text-center">
            <h2 className="text-xl font-semibold">{title}</h2>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
        <p className="mt-6 flex items-center justify-center gap-4 text-center text-xs text-muted-foreground">
          {backToLogin && (
            <Link
              href="/login"
              className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
            >
              {t("backToLogin")}
            </Link>
          )}
          <Link
            href="/developer"
            className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
          >
            {tDev("title")}
          </Link>
        </p>
      </div>
    </main>
  );
}
