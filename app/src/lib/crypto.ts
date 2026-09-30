/**
 * Application-level encryption for secrets at rest (docs/30-architecture/02-DATA-MODEL.md §4, ASVS V6):
 * `TenantSetting.isSecret`, `AIProviderConfig.encryptedKey` (P2), SMTP passwords (P2).
 *
 * AES-256-GCM with a random 96-bit IV per value and the key id as AAD, serialised as
 *   `v1:<keyId>:<iv b64url>:<ciphertext b64url>:<tag b64url>`
 * The key comes from APP_ENCRYPTION_KEY (`base64:<32 bytes>`). `keyId` is the first 8 hex chars of SHA-256(key),
 * so a rotated key is detected (decrypt fails with KEY_MISMATCH instead of garbage) and future multi-key rotation
 * can look the key up by id. Never log plaintext or ciphertext.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export class CryptoError extends Error {
  constructor(public readonly code: "MALFORMED" | "KEY_MISMATCH" | "AUTH_FAILED") {
    super(`crypto:${code}`);
  }
}

let cached: { key: Buffer; id: string } | null = null;

function material(): { key: Buffer; id: string } {
  if (cached) return cached;
  const raw = Buffer.from(env.APP_ENCRYPTION_KEY.slice("base64:".length), "base64");
  if (raw.length !== 32) throw new Error("APP_ENCRYPTION_KEY must decode to exactly 32 bytes");
  cached = { key: raw, id: createHash("sha256").update(raw).digest("hex").slice(0, 8) };
  return cached;
}

const b64u = (b: Buffer) => b.toString("base64url");
const unb64u = (s: string) => Buffer.from(s, "base64url");

export function encryptSecret(plain: string): string {
  const { key, id } = material();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(id));
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, id, b64u(iv), b64u(ct), b64u(cipher.getAuthTag())].join(":");
}

export function decryptSecret(token: string): string {
  const parts = token.split(":");
  if (parts.length !== 5 || parts[0] !== VERSION) throw new CryptoError("MALFORMED");
  const [, keyId, ivS, ctS, tagS] = parts as [string, string, string, string, string];
  const { key, id } = material();
  if (keyId.length !== id.length || !timingSafeEqual(Buffer.from(keyId), Buffer.from(id)))
    throw new CryptoError("KEY_MISMATCH");
  const iv = unb64u(ivS);
  const tag = unb64u(tagS);
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new CryptoError("MALFORMED");
  try {
    const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(id));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(unb64u(ctS)), decipher.final()]).toString("utf8");
  } catch {
    throw new CryptoError("AUTH_FAILED");
  }
}

export function isEncryptedSecret(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(`${VERSION}:`) && value.split(":").length === 5;
}

/** `sk-live-…abcd` → `••••abcd` — for showing that a secret is set without revealing it. */
export function maskSecret(plain: string, keep = 4): string {
  if (!plain) return "";
  // Never reveal more than half of a short secret; below 2×keep show only the mask.
  if (plain.length < keep * 2) return "••••••••";
  return `••••${plain.slice(-keep)}`;
}
