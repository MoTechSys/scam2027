import { Code2, Globe, Phone, Package, Layers } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import pkg from "../../../package.json";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Developer" };

const DEVELOPER = {
  name: "معين العباسي",
  phone: "+967770941666",
  website: "https://alabbasi.uk",
} as const;

const STACK = [
  `Next.js ${pkg.dependencies.next.replace(/^[^\d]*/, "")}`,
  `React ${pkg.dependencies.react.replace(/^[^\d]*/, "")}`,
  `Prisma ${pkg.dependencies["@prisma/client"].replace(/^[^\d]*/, "")}`,
  "PostgreSQL 17 (RLS)",
  "Auth.js v5 · Argon2id",
  "Tailwind CSS v4 · Radix UI",
  `next-intl ${pkg.dependencies["next-intl"].replace(/^[^\d]*/, "")}`,
];

export default async function DeveloperPage() {
  const t = await getTranslations("developer");
  const tAuth = await getTranslations("auth");
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-6 px-4 py-12">
      <header className="text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary/10 neon-glow-sm">
          <Code2 className="size-8 text-primary" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{DEVELOPER.name}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("role")}</p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <a
            href={`tel:${DEVELOPER.phone}`}
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "min-h-11 justify-start gap-3")}
          >
            <Phone className="size-4 text-primary" aria-hidden="true" />
            <span className="flex flex-col items-start leading-tight">
              <span className="text-xs text-muted-foreground">{t("phone")}</span>
              <span dir="ltr" className="font-mono">
                {DEVELOPER.phone}
              </span>
            </span>
          </a>
          <a
            href={DEVELOPER.website}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "min-h-11 justify-start gap-3")}
          >
            <Globe className="size-4 text-primary" aria-hidden="true" />
            <span className="flex flex-col items-start leading-tight">
              <span className="text-xs text-muted-foreground">{t("website")}</span>
              <span dir="ltr">alabbasi.uk</span>
            </span>
          </a>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <Package className="size-4 text-primary" aria-hidden="true" />
            <CardTitle className="text-base">{t("version")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p dir="ltr" className="font-mono text-2xl font-bold text-primary">
              v{pkg.version}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center gap-2">
            <Layers className="size-4 text-primary" aria-hidden="true" />
            <CardTitle className="text-base">{t("stack")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul dir="ltr" className="space-y-1 text-sm text-muted-foreground">
              {STACK.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <p className="text-center text-sm text-muted-foreground">{t("contact")}</p>
      <div className="text-center">
        <Link href="/login" className={cn(buttonVariants({ variant: "ghost" }), "min-h-11")}>
          {tAuth("loginTitle")}
        </Link>
      </div>
    </main>
  );
}
