import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getNow, getTimeZone, getTranslations } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import { dirOf } from "@/i18n/config";
import { resolveLocale } from "@/i18n/request";
import { currentTenant, safePrimaryColor } from "@/lib/tenant/current";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cairo",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  const tenant = await currentTenant();
  const name = tenant?.name ?? t("name");
  return {
    title: { default: name, template: `%s · ${name}` },
    description: t("tagline"),
    applicationName: name,
    icons: tenant?.branding?.logoUrl
      ? [{ url: tenant.branding.logoUrl }]
      : [{ url: "/icon.svg", type: "image/svg+xml" }],
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, messages, tenant, t, now, timeZone] = await Promise.all([
    resolveLocale(),
    getMessages(),
    currentTenant(),
    getTranslations("app"),
    getNow(),
    getTimeZone(),
  ]);
  const primary = safePrimaryColor(tenant?.branding?.primaryColor);
  const style = primary ? ({ "--primary": primary } as React.CSSProperties) : undefined;

  return (
    <html
      lang={locale}
      dir={dirOf(locale)}
      className={`dark ${cairo.variable}`}
      style={style}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider locale={locale} messages={messages} now={now} timeZone={timeZone}>
          {children}
          <Toaster
            position={dirOf(locale) === "rtl" ? "bottom-left" : "bottom-right"}
            richColors
            closeButton
          />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
