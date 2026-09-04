/**
 * next-intl request config (docs/20-product FR-I18N-001).
 * Locale precedence: cookie `scam.locale` → `x-locale` header set by proxy (tenant default) → "ar".
 * No locale URL prefix: the tenant is the host, the locale is a preference.
 */
import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";

export async function resolveLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  const h = (await headers()).get("x-locale");
  if (isLocale(h)) return h;
  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const messages = (await import(`../../messages/${locale}.json`)).default;
  const timeZone = (await headers()).get("x-tenant-tz") ?? "Asia/Riyadh";
  return { locale, messages, timeZone, now: new Date() };
});
