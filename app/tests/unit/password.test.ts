import { describe, expect, it } from "vitest";
import { hashPassword, safeEqualHex, sha256, verifyPassword } from "@/lib/auth/password";
import { DEFAULT_POLICY, passwordPolicyIssues } from "@/features/auth/core";

describe("password policy (FR-AUTH-002, tenant-configurable per ADR-0009 §7)", () => {
  it("accepts a compliant password under the default policy", () =>
    expect(passwordPolicyIssues("Admin@123456", DEFAULT_POLICY)).toEqual([]));
  it("reports every violated rule", () => {
    expect(passwordPolicyIssues("short", DEFAULT_POLICY)).toEqual(["min:10", "upper", "digit"]);
    expect(passwordPolicyIssues("alllowercase1", DEFAULT_POLICY)).toEqual(["upper"]);
    expect(passwordPolicyIssues("ALLUPPERCASE1", DEFAULT_POLICY)).toEqual(["lower"]);
    expect(passwordPolicyIssues("NoDigitsHere", DEFAULT_POLICY)).toEqual(["digit"]);
  });
  it("honours the tenant floor and the symbol switch", () => {
    const strict = { passwordMinLength: 14, passwordRequireSymbol: true };
    expect(passwordPolicyIssues("Admin1234567", strict)).toEqual(["min:14", "symbol"]);
    expect(passwordPolicyIssues("Admin@1234567890", strict)).toEqual([]);
  });
});

describe("Argon2id hashing", () => {
  it("round-trips and rejects wrong passwords", async () => {
    const h = await hashPassword("Correct#Horse1");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "Correct#Horse1")).toBe(true);
    expect(await verifyPassword(h, "wrong")).toBe(false);
  });
  it("missing hash → false without throwing (timing-safe path)", async () => {
    expect(await verifyPassword(null, "x")).toBe(false);
    expect(await verifyPassword("garbage", "x")).toBe(false);
  });
});

describe("token helpers", () => {
  it("sha256 hex + constant-time compare", () => {
    const a = sha256("abc");
    expect(a).toHaveLength(64);
    expect(safeEqualHex(a, sha256("abc"))).toBe(true);
    expect(safeEqualHex(a, sha256("abd"))).toBe(false);
    expect(safeEqualHex(a, "ab")).toBe(false);
  });
});
