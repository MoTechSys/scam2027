/**
 * Current tenant for RSC/layouts — resolved from the Host header (same cached lookup as proxy.ts).
 * Returns null on tenant-free routes (/developer, /tenant-not-found …).
 */
import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { resolveTenant, type ResolvedTenant } from "@/lib/auth/tenant-resolver";

export const currentTenant = cache(async (): Promise<ResolvedTenant | null> => {
  const h = await headers();
  if (!h.get("x-tenant-id")) return null;
  return resolveTenant(h.get("host"));
});

const HEX = /^#[0-9a-fA-F]{6}$/;
/** Only a strict 6-digit hex is accepted for CSS injection (defends against style injection via branding). */
export function safePrimaryColor(color: string | null | undefined): string | null {
  return color && HEX.test(color) ? color : null;
}
