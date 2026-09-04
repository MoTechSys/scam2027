/**
 * Host → Tenant resolution (docs/30-architecture/01-MULTI-TENANCY.md §4)
 *  - `<slug>.<ROOT_DOMAIN>` → slug
 *  - custom domain → Tenant.customDomain
 *  - bare ROOT_DOMAIN / localhost → DEFAULT_TENANT_SLUG (dev) or platform (null tenant)
 * Cached in-memory for 60 s. Tenant table has no RLS (app_user has SELECT); branding is read via db(tenantId).
 */
import type { TenantStatus } from "@prisma/client";
import { basePrisma } from "@/lib/db/prisma";
import { db } from "@/lib/db/tenant";
import { env } from "@/lib/env";

export type ResolvedTenant = {
  id: string;
  slug: string;
  name: string;
  nameEn: string | null;
  status: TenantStatus;
  locale: string;
  timezone: string;
  branding: { logoUrl: string | null; primaryColor: string; loginMessage: string | null } | null;
};

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: ResolvedTenant | null }>();

export function hostToSlug(hostHeader: string | null | undefined): { slug: string | null; isRoot: boolean } {
  const host = (hostHeader ?? "").split(":")[0]?.toLowerCase() ?? "";
  const root = env.ROOT_DOMAIN.toLowerCase();
  if (!host) return { slug: env.DEFAULT_TENANT_SLUG ?? null, isRoot: true };
  if (host === root || host === "127.0.0.1" || host === "0.0.0.0") {
    return { slug: env.DEFAULT_TENANT_SLUG ?? null, isRoot: true };
  }
  if (host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -(root.length + 1));
    if (sub && !sub.includes(".")) return { slug: sub, isRoot: false };
  }
  // Non-root host (custom domain or sandbox preview URL): resolve by customDomain, else dev default.
  return { slug: null, isRoot: false };
}

export async function resolveTenant(hostHeader: string | null | undefined): Promise<ResolvedTenant | null> {
  const key = (hostHeader ?? "").toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const { slug } = hostToSlug(hostHeader);
  const host = key.split(":")[0] ?? "";
  const where = slug ? { slug } : { customDomain: host };

  let tenant = await basePrisma.tenant.findFirst({
    where,
    select: { id: true, slug: true, name: true, nameEn: true, status: true, locale: true, timezone: true },
  });
  if (!tenant && !slug && env.DEFAULT_TENANT_SLUG && env.NODE_ENV !== "production") {
    tenant = await basePrisma.tenant.findFirst({
      where: { slug: env.DEFAULT_TENANT_SLUG },
      select: { id: true, slug: true, name: true, nameEn: true, status: true, locale: true, timezone: true },
    });
  }

  let value: ResolvedTenant | null = null;
  if (tenant) {
    const branding = await db(tenant.id).tenantBranding.findUnique({
      where: { tenantId: tenant.id },
      select: { logoUrl: true, primaryColor: true, loginMessage: true },
    });
    value = { ...tenant, branding };
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function invalidateTenantCache(): void {
  cache.clear();
}
