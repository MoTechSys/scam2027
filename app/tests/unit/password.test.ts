import { describe, expect, it } from "vitest";
import { hashPassword, passwordIssues, safeEqualHex, sha256, verifyPassword } from "@/lib/auth/password";

describe("password policy (FR-AUTH-002)", () => {
  it("accepts a compliant password", () => expect(passwordIssues("Admin@123456")).toEqual([]));
  it("reports every violated rule", () => {
    expect(passwordIssues("short")).toEqual(["min:10", "upper", "digit"]);
    expect(passwordIssues("alllowercase1")).toEqual(["upper"]);
    expect(passwordIssues("ALLUPPERCASE1")).toEqual(["lower"]);
    expect(passwordIssues("NoDigitsHere")).toEqual(["digit"]);
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
