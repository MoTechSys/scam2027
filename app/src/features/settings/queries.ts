/**
 * Tenant settings — read side for `/settings/[tab]` (P1-10). Gate: `settings.view`.
 * Each tab is a projection: Tenant columns + TenantBranding + registry keys, assembled in one tenant transaction.
 */
import "server-only";
import type { Ctx } from "@/lib/auth/rbac";
import { tx } from "@/lib/db/tenant";
import { readSecretState, getSettings } from "./core";
import type { BrandingSettings, GeneralSettings, SecretState, SecuritySettings } from "./schemas";

export type GeneralView = GeneralSettings & { slug: string; customDomain: string | null };
export type SecurityView = SecuritySettings & { roles: { code: string; name: string }[] };
export type BrandingView = BrandingSettings & { logoUrl: string | null; logoUpdatedAt: Date | null };
export type EmailView = { smtpPassword: SecretState };

export async function loadGeneral(ctx: Ctx): Promise<GeneralView> {
  return tx(ctx.tenantId, async (t) => {
    const [tenant, s] = await Promise.all([
      t.tenant.findUniqueOrThrow({
        where: { id: ctx.tenantId },
        select: { slug: true, name: true, nameEn: true, locale: true, timezone: true, customDomain: true },
      }),
      getSettings(t, ctx.tenantId, ["users.academicIdFormat", "general.supportEmail"] as const),
    ]);
    return {
      slug: tenant.slug,
      customDomain: tenant.customDomain,
      name: tenant.name,
      nameEn: tenant.nameEn ?? "",
      locale: tenant.locale === "en" ? "en" : "ar",
      timezone: tenant.timezone,
      academicIdFormat: s["users.academicIdFormat"],
      supportEmail: s["general.supportEmail"],
    };
  });
}

export async function loadSecurity(ctx: Ctx): Promise<SecurityView> {
  return tx(ctx.tenantId, async (t) => {
    const [s, roles] = await Promise.all([
      getSettings(t, ctx.tenantId, [
        "security.passwordMinLength",
        "security.passwordRequireSymbol",
        "security.passwordMaxAgeDays",
        "security.sessionIdleMinutes",
        "security.sessionMaxDays",
        "security.lockoutMaxFails",
        "security.lockoutWindowMinutes",
        "security.mfaRequiredRoles",
        "security.forcePasswordChangeOnNextLogin",
      ] as const),
      t.role.findMany({
        where: { tenantId: ctx.tenantId, deletedAt: null },
        select: { code: true, name: true },
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      }),
    ]);
    return {
      passwordMinLength: s["security.passwordMinLength"],
      passwordRequireSymbol: s["security.passwordRequireSymbol"],
      passwordMaxAgeDays: s["security.passwordMaxAgeDays"],
      sessionIdleMinutes: s["security.sessionIdleMinutes"],
      sessionMaxDays: s["security.sessionMaxDays"],
      lockoutMaxFails: s["security.lockoutMaxFails"],
      lockoutWindowMinutes: s["security.lockoutWindowMinutes"],
      mfaRequiredRoles: s["security.mfaRequiredRoles"],
      forcePasswordChangeOnNextLogin: s["security.forcePasswordChangeOnNextLogin"],
      roles,
    };
  });
}

export async function loadBranding(ctx: Ctx): Promise<BrandingView> {
  return tx(ctx.tenantId, async (t) => {
    const b = await t.tenantBranding.findUnique({
      where: { tenantId: ctx.tenantId },
      select: { logoUrl: true, primaryColor: true, accentColor: true, loginMessage: true, updatedAt: true },
    });
    return {
      primaryColor: b?.primaryColor ?? "#39ff14",
      accentColor: b?.accentColor ?? "",
      loginMessage: b?.loginMessage ?? "",
      logoUrl: b?.logoUrl ?? null,
      logoUpdatedAt: b?.logoUrl ? (b.updatedAt ?? null) : null,
    };
  });
}

/** Secret states for the (P2) email tab — exposed now so the secret path is real end-to-end. */
export async function loadEmail(ctx: Ctx): Promise<EmailView> {
  return tx(ctx.tenantId, async (t) => ({
    smtpPassword: await readSecretState(t, ctx.tenantId, "email.smtpPassword"),
  }));
}
