/**
 * P1-10 — settings core against a real tenant with RLS on:
 *  - getSetting returns the registry default when no row exists
 *  - setSetting upserts, reports before/changed, getSettings batches
 *  - a corrupt row falls back to the default (never throws)
 *  - secrets are AES-GCM ciphertext at rest (owner-client read), decrypt on getSetting, masked in readSecretState
 *  - clearing a secret → hasValue=false
 *  - cross-tenant invisibility (RLS): tenant B never sees tenant A's rows
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSetting, getSettings, readSecretState, setSetting } from "@/features/settings/core";
import { SETTINGS_REGISTRY } from "@/features/settings/schemas";
import { isEncryptedSecret } from "@/lib/crypto";
import { platformPrisma, tx } from "@/lib/db";

const suffix = Date.now().toString(36);
let a = "";
let b = "";

beforeAll(async () => {
  a = (
    await platformPrisma.tenant.create({ data: { slug: `set-a-${suffix}`, name: "A" }, select: { id: true } })
  ).id;
  b = (
    await platformPrisma.tenant.create({ data: { slug: `set-b-${suffix}`, name: "B" }, select: { id: true } })
  ).id;
});

afterAll(async () => {
  await platformPrisma.tenantSetting.deleteMany({ where: { tenantId: { in: [a, b] } } });
  await platformPrisma.tenant.deleteMany({ where: { id: { in: [a, b] } } });
});

describe("settings core", () => {
  it("returns registry defaults when unset", async () => {
    await tx(a, async (t) => {
      expect(await getSetting(t, a, "security.passwordMinLength")).toBe(
        SETTINGS_REGISTRY["security.passwordMinLength"].default,
      );
      expect(await getSetting(t, a, "users.academicIdFormat")).toBe(
        SETTINGS_REGISTRY["users.academicIdFormat"].default,
      );
      expect(await getSetting(t, a, "email.smtpPassword")).toBe("");
    });
  });

  it("setSetting upserts and reports before/changed; getSettings batches", async () => {
    await tx(a, async (t) => {
      const first = await setSetting(t, a, "security.passwordMinLength", 14);
      expect(first.before).toBeUndefined();
      expect(first.changed).toBe(true);
      const same = await setSetting(t, a, "security.passwordMinLength", 14);
      expect(same.before).toBe(14);
      expect(same.changed).toBe(false);
      const next = await setSetting(t, a, "security.passwordMinLength", 16);
      expect(next.before).toBe(14);
      expect(next.changed).toBe(true);
      await setSetting(t, a, "users.academicIdFormat", "STU-YYNNNN");
      const many = await getSettings(t, a, [
        "security.passwordMinLength",
        "users.academicIdFormat",
        "general.supportEmail",
      ]);
      expect(many).toEqual({
        "security.passwordMinLength": 16,
        "users.academicIdFormat": "STU-YYNNNN",
        "general.supportEmail": "",
      });
    });
  });

  it("rejects values that fail the registry schema", async () => {
    await tx(a, async (t) => {
      await expect(setSetting(t, a, "security.passwordMinLength", 3 as never)).rejects.toThrow();
      await expect(setSetting(t, a, "general.supportEmail", "not-an-email" as never)).rejects.toThrow();
    });
  });

  it("a corrupt row falls back to the default instead of throwing", async () => {
    const def = SETTINGS_REGISTRY["security.lockoutMaxFails"];
    await platformPrisma.tenantSetting.upsert({
      where: { tenantId_category_key: { tenantId: a, category: def.category, key: def.key } },
      create: { tenantId: a, category: def.category, key: def.key, value: "garbage", isSecret: false },
      update: { value: "garbage" },
    });
    await tx(a, async (t) => {
      expect(await getSetting(t, a, "security.lockoutMaxFails")).toBe(def.default);
    });
  });

  it("secrets: ciphertext at rest, decrypted on read, masked state, clearable", async () => {
    const def = SETTINGS_REGISTRY["email.smtpPassword"];
    await tx(a, async (t) => {
      const r = await setSetting(t, a, "email.smtpPassword", "super-secret-1234");
      expect(r.changed).toBe(true);
      expect(await getSetting(t, a, "email.smtpPassword")).toBe("super-secret-1234");
      const state = await readSecretState(t, a, "email.smtpPassword");
      expect(state).toMatchObject({ hasValue: true, masked: "••••1234" });
      expect(state.updatedAt).toBeInstanceOf(Date);
    });
    const raw = await platformPrisma.tenantSetting.findUniqueOrThrow({
      where: { tenantId_category_key: { tenantId: a, category: def.category, key: def.key } },
    });
    expect(raw.isSecret).toBe(true);
    expect(isEncryptedSecret(raw.value)).toBe(true);
    expect(JSON.stringify(raw.value)).not.toContain("super-secret");
    await tx(a, async (t) => {
      const cleared = await setSetting(t, a, "email.smtpPassword", "");
      expect(cleared.before).toBe("[SECRET]");
      expect(await readSecretState(t, a, "email.smtpPassword")).toMatchObject({
        hasValue: false,
        masked: null,
      });
      expect(await getSetting(t, a, "email.smtpPassword")).toBe("");
    });
  });

  it("readSecretState refuses non-secret keys", async () => {
    await tx(a, async (t) => {
      await expect(readSecretState(t, a, "security.passwordMinLength")).rejects.toThrow(/not a secret/);
    });
  });

  it("RLS: tenant B sees its own defaults, not tenant A's values", async () => {
    await tx(b, async (t) => {
      expect(await getSetting(t, b, "security.passwordMinLength")).toBe(
        SETTINGS_REGISTRY["security.passwordMinLength"].default,
      );
      // Even when asked about A's id, the RLS-bound tx cannot read A's row → default.
      expect(await getSetting(t, a, "security.passwordMinLength")).toBe(
        SETTINGS_REGISTRY["security.passwordMinLength"].default,
      );
      expect(await t.tenantSetting.count({ where: { tenantId: a } })).toBe(0);
    });
    const owner = await platformPrisma.tenantSetting.count({ where: { tenantId: a } });
    expect(owner).toBeGreaterThan(0);
  });
});
