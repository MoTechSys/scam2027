/**
 * Tenant settings — typed read/write over `TenantSetting` (vitest-loadable: no next/* imports).
 *
 * `getSetting` returns the registry default when the row is missing or fails validation (a corrupt/legacy row can
 * never break a request; it is logged). Secret keys are transparently encrypted on write and decrypted on read;
 * `readSecretState` exposes only `hasValue` + a masked tail for the UI.
 */
import type { Prisma } from "@prisma/client";
import { decryptSecret, encryptSecret, isEncryptedSecret, maskSecret } from "@/lib/crypto";
import type { TenantTx } from "@/lib/db/tenant";
import { logger } from "@/lib/logger";
import { SETTINGS_REGISTRY, type SecretState, type SettingKey, type SettingValue } from "./schemas";

type Row = { value: Prisma.JsonValue; isSecret: boolean; updatedAt: Date };

async function readRow(t: TenantTx, tenantId: string, key: SettingKey): Promise<Row | null> {
  const def = SETTINGS_REGISTRY[key];
  return t.tenantSetting.findUnique({
    where: { tenantId_category_key: { tenantId, category: def.category, key: def.key } },
    select: { value: true, isSecret: true, updatedAt: true },
  });
}

/** Typed read with default fallback. Secrets come back decrypted — only call from server code that needs them. */
export async function getSetting<K extends SettingKey>(
  t: TenantTx,
  tenantId: string,
  key: K,
): Promise<SettingValue<K>> {
  const def = SETTINGS_REGISTRY[key];
  const row = await readRow(t, tenantId, key);
  if (!row) return def.default as SettingValue<K>;
  let raw: unknown = row.value;
  if (def.secret && isEncryptedSecret(raw)) {
    try {
      raw = decryptSecret(raw);
    } catch (err) {
      logger.error({ err, tenantId, key }, "settings.secret_decrypt_failed");
      return def.default as SettingValue<K>;
    }
  }
  const parsed = def.schema.safeParse(raw);
  if (!parsed.success) {
    logger.warn({ tenantId, key, issues: parsed.error.issues.length }, "settings.invalid_row_using_default");
    return def.default as SettingValue<K>;
  }
  return parsed.data as SettingValue<K>;
}

/** Read many keys in one round-trip (one `findMany` on the composite PK prefix). */
export async function getSettings<K extends SettingKey>(
  t: TenantTx,
  tenantId: string,
  keys: readonly K[],
): Promise<{ [P in K]: SettingValue<P> }> {
  const rows = await t.tenantSetting.findMany({
    where: {
      tenantId,
      OR: keys.map((k) => ({ category: SETTINGS_REGISTRY[k].category, key: SETTINGS_REGISTRY[k].key })),
    },
    select: { category: true, key: true, value: true, isSecret: true },
  });
  const byKey = new Map(rows.map((r) => [`${r.category}.${r.key}`, r]));
  const out = {} as { [P in K]: SettingValue<P> };
  for (const k of keys) {
    const def = SETTINGS_REGISTRY[k];
    const row = byKey.get(k);
    let value: unknown = def.default;
    if (row) {
      let raw: unknown = row.value;
      if (def.secret && isEncryptedSecret(raw)) {
        try {
          raw = decryptSecret(raw);
        } catch (err) {
          logger.error({ err, tenantId, key: k }, "settings.secret_decrypt_failed");
          raw = def.default;
        }
      }
      const parsed = def.schema.safeParse(raw);
      value = parsed.success ? parsed.data : def.default;
    }
    (out as Record<string, unknown>)[k] = value;
  }
  return out;
}

/** Validate against the registry schema, encrypt if secret, upsert. Returns the previous *non-secret* value for audit. */
export async function setSetting<K extends SettingKey>(
  t: TenantTx,
  tenantId: string,
  key: K,
  value: SettingValue<K>,
): Promise<{ before: unknown; changed: boolean }> {
  const def = SETTINGS_REGISTRY[key];
  const parsed = def.schema.parse(value);
  const before = await readRow(t, tenantId, key);
  const beforeValue = before ? (def.secret ? (before.value ? "[SECRET]" : null) : before.value) : undefined;
  const stored: Prisma.InputJsonValue = def.secret
    ? typeof parsed === "string" && parsed.length > 0
      ? encryptSecret(parsed)
      : ""
    : (parsed as Prisma.InputJsonValue);
  const changed = before === null || JSON.stringify(before.value) !== JSON.stringify(stored) || def.secret;
  await t.tenantSetting.upsert({
    where: { tenantId_category_key: { tenantId, category: def.category, key: def.key } },
    create: { tenantId, category: def.category, key: def.key, value: stored, isSecret: def.secret },
    update: { value: stored, isSecret: def.secret },
  });
  return { before: beforeValue, changed };
}

/** UI-safe view of a secret: set or not, masked tail, when. Never the value. */
export async function readSecretState(t: TenantTx, tenantId: string, key: SettingKey): Promise<SecretState> {
  const def = SETTINGS_REGISTRY[key];
  if (!def.secret) throw new Error(`${key} is not a secret setting`);
  const row = await readRow(t, tenantId, key);
  if (!row || !isEncryptedSecret(row.value))
    return { hasValue: false, masked: null, updatedAt: row?.updatedAt ?? null };
  try {
    const plain = decryptSecret(row.value);
    return { hasValue: plain.length > 0, masked: plain ? maskSecret(plain) : null, updatedAt: row.updatedAt };
  } catch {
    return { hasValue: false, masked: null, updatedAt: row.updatedAt };
  }
}
