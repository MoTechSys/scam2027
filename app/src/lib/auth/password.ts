/**
 * Password hashing — Argon2id (docs/30-architecture/03-AUTH-RBAC.md §1)
 * memory 64 MiB · iterations 3 · parallelism 1 (OWASP recommendation).
 */
import { hash, verify } from "@node-rs/argon2";
import { createHash, timingSafeEqual } from "node:crypto";

// algorithm 2 = Argon2id (const enum not importable under isolatedModules)
const OPTIONS = { algorithm: 2, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(hashed: string | null | undefined, plain: string): Promise<boolean> {
  if (!hashed) {
    // Burn comparable time to avoid user-enumeration via timing.
    await hash(plain, { ...OPTIONS, memoryCost: 8192 });
    return false;
  }
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

/** Password policy — FR-AUTH-002: ≥ 10 chars, upper, lower, digit. */
export const PASSWORD_MIN = 10;
export function passwordIssues(p: string): string[] {
  const issues: string[] = [];
  if (p.length < PASSWORD_MIN) issues.push(`min:${PASSWORD_MIN}`);
  if (!/[a-z]/.test(p)) issues.push("lower");
  if (!/[A-Z]/.test(p)) issues.push("upper");
  if (!/\d/.test(p)) issues.push("digit");
  return issues;
}

/** SHA-256 for one-time codes/tokens (not for passwords). */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
