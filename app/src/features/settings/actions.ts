"use server";

/**
 * Tenant settings — Server Actions (P1-10; FR-SET-001/005, FR-TEN-004/007). Every action:
 *  safeAction → requireUserOrThrow → assertPermission(settings.view + tab-specific edit) → Zod .strict()
 *  → tx(tenantId) → audit(before/after) → invalidate tenant cache → revalidatePath → Result<T>.
 *
 * Branding writes clear the in-memory tenant cache (resolver caches 60 s) so the new colour/logo applies at once.
 * Secrets are written through `setSetting` (encrypted) and never echoed back; the audit row records `[SECRET]`.
 */
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { assertPermission, requireUserOrThrow } from "@/lib/auth/rbac";
import { invalidateTenantCache } from "@/lib/auth/tenant-resolver";
import { tx } from "@/lib/db/tenant";
import { AppError, type Result } from "@/lib/result";
import { safeAction } from "@/lib/safe-action";
import { storage } from "@/lib/storage";
import { setSetting } from "./core";
import {
  brandingSettingsSchema,
  generalSettingsSchema,
  securitySettingsSchema,
  setSettingSchema,
  SETTINGS_REGISTRY,
  type SettingKey,
  type SettingValue,
} from "./schemas";

function revalidateSettings(tab: string) {
  invalidateTenantCache();
  revalidatePath(`/settings/${tab}`);
  revalidatePath("/settings");
  revalidatePath("/", "layout"); // branding/name/locale are read by the root layout and /login
}

export async function updateGeneralAction(input: unknown): Promise<Result<null>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "settings.view", "settings.edit_general");
      const data = generalSettingsSchema.parse(input);
      await tx(ctx.tenantId, async (t) => {
        const before = await t.tenant.findUniqueOrThrow({
          where: { id: ctx.tenantId },
          select: { name: true, nameEn: true, locale: true, timezone: true },
        });
        await t.tenant.update({
          where: { id: ctx.tenantId },
          data: {
            name: data.name,
            nameEn: data.nameEn || null,
            locale: data.locale,
            timezone: data.timezone,
          },
        });
        const fmt = await setSetting(t, ctx.tenantId, "users.academicIdFormat", data.academicIdFormat);
        const sup = await setSetting(t, ctx.tenantId, "general.supportEmail", data.supportEmail ?? "");
        await audit(
          ctx,
          {
            action: "settings.update_general",
            entity: "Tenant",
            entityId: ctx.tenantId,
            before: { ...before, academicIdFormat: fmt.before, supportEmail: sup.before },
            after: {
              name: data.name,
              nameEn: data.nameEn || null,
              locale: data.locale,
              timezone: data.timezone,
              academicIdFormat: data.academicIdFormat,
              supportEmail: data.supportEmail ?? "",
            },
          },
          t,
        );
      });
      revalidateSettings("general");
      return null;
    },
    { action: "settings.update_general" },
  );
}

export async function updateSecurityAction(input: unknown): Promise<Result<null>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "settings.view", "settings.edit_security");
      const data = securitySettingsSchema.parse(input);
      await tx(ctx.tenantId, async (t) => {
        // Only roles that exist in this tenant may be listed (no dangling codes).
        if (data.mfaRequiredRoles.length) {
          const known = new Set(
            (
              await t.role.findMany({
                where: { tenantId: ctx.tenantId, deletedAt: null },
                select: { code: true },
              })
            ).map((r) => r.code),
          );
          const unknown = data.mfaRequiredRoles.filter((c) => !known.has(c));
          if (unknown.length) throw new AppError("VALIDATION", `أدوار غير معروفة: ${unknown.join(", ")}`);
        }
        const before: Record<string, unknown> = {};
        const entries: [SettingKey, unknown][] = [
          ["security.passwordMinLength", data.passwordMinLength],
          ["security.passwordRequireSymbol", data.passwordRequireSymbol],
          ["security.passwordMaxAgeDays", data.passwordMaxAgeDays],
          ["security.sessionIdleMinutes", data.sessionIdleMinutes],
          ["security.sessionMaxDays", data.sessionMaxDays],
          ["security.lockoutMaxFails", data.lockoutMaxFails],
          ["security.lockoutWindowMinutes", data.lockoutWindowMinutes],
          ["security.mfaRequiredRoles", data.mfaRequiredRoles],
          ["security.forcePasswordChangeOnNextLogin", data.forcePasswordChangeOnNextLogin],
        ];
        for (const [k, v] of entries) before[k] = (await setSetting(t, ctx.tenantId, k, v as never)).before;
        await audit(
          ctx,
          {
            action: "settings.update_security",
            entity: "Tenant",
            entityId: ctx.tenantId,
            before,
            after: data,
          },
          t,
        );
      });
      revalidateSettings("security");
      return null;
    },
    { action: "settings.update_security" },
  );
}

export async function updateBrandingAction(input: unknown): Promise<Result<null>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "settings.view", "settings.edit_branding");
      const data = brandingSettingsSchema.parse(input);
      await tx(ctx.tenantId, async (t) => {
        const before = await t.tenantBranding.findUnique({
          where: { tenantId: ctx.tenantId },
          select: { primaryColor: true, accentColor: true, loginMessage: true },
        });
        const after = {
          primaryColor: data.primaryColor,
          accentColor: data.accentColor || null,
          loginMessage: data.loginMessage || null,
        };
        await t.tenantBranding.upsert({
          where: { tenantId: ctx.tenantId },
          create: { tenantId: ctx.tenantId, ...after },
          update: after,
        });
        await audit(
          ctx,
          {
            action: "settings.update_branding",
            entity: "TenantBranding",
            entityId: ctx.tenantId,
            before,
            after,
          },
          t,
        );
      });
      revalidateSettings("branding");
      return null;
    },
    { action: "settings.update_branding" },
  );
}

/** Remove the logo (the object is deleted after commit; the public URL 404s immediately). */
export async function removeLogoAction(): Promise<Result<null>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "settings.view", "settings.edit_branding");
      const key = await tx(ctx.tenantId, async (t) => {
        const b = await t.tenantBranding.findUnique({
          where: { tenantId: ctx.tenantId },
          select: { logoUrl: true, logoStorageKey: true },
        });
        if (!b?.logoUrl) return null;
        await t.tenantBranding.update({
          where: { tenantId: ctx.tenantId },
          data: { logoUrl: null, faviconUrl: null, logoStorageKey: null },
        });
        await audit(
          ctx,
          {
            action: "settings.remove_logo",
            entity: "TenantBranding",
            entityId: ctx.tenantId,
            before: { logoUrl: b.logoUrl },
          },
          t,
        );
        return b.logoStorageKey;
      });
      if (key)
        await storage()
          .delete(key)
          .catch(() => undefined);
      revalidateSettings("branding");
      return null;
    },
    { action: "settings.remove_logo" },
  );
}

/**
 * Generic single-key write for secret settings (and future module keys). Non-secret tab keys go through the tab
 * actions above so they are validated as a set; this one exists so the UI can set/clear a secret independently.
 */
export async function setSecretSettingAction(input: unknown): Promise<Result<{ hasValue: boolean }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      const { key, value } = setSettingSchema.parse(input);
      const def = SETTINGS_REGISTRY[key];
      if (!def.secret) throw new AppError("VALIDATION", "هذا المفتاح ليس سرًّا — استخدم نموذج التبويب");
      // Category → permission: email secrets need edit_email; everything else falls back to edit_security.
      assertPermission(
        ctx,
        "settings.view",
        def.category === "email" ? "settings.edit_email" : "settings.edit_security",
      );
      const plain = typeof value === "string" ? value : "";
      await tx(ctx.tenantId, async (t) => {
        await setSetting(t, ctx.tenantId, key, plain as SettingValue<typeof key>);
        await audit(
          ctx,
          {
            action: "settings.set_secret",
            entity: "TenantSetting",
            entityId: `${def.category}.${def.key}`,
            after: { key, set: plain.length > 0 },
          },
          t,
        );
      });
      revalidateSettings(def.category === "email" ? "email" : "security");
      return { hasValue: plain.length > 0 };
    },
    { action: "settings.set_secret" },
  );
}
