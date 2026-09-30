import { describe, expect, it } from "vitest";
import { CryptoError, decryptSecret, encryptSecret, isEncryptedSecret, maskSecret } from "@/lib/crypto";

describe("lib/crypto — AES-256-GCM secrets at rest", () => {
  it("round-trips arbitrary unicode plaintext", () => {
    const plain = "p@ss•wörd 🔐 ١٢٣";
    const token = encryptSecret(plain);
    expect(token.startsWith("v1:")).toBe(true);
    expect(token).not.toContain(plain);
    expect(decryptSecret(token)).toBe(plain);
  });

  it("produces a distinct token per call (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("rejects tampered ciphertext with AUTH_FAILED", () => {
    const parts = encryptSecret("secret").split(":");
    const ct = parts[3]!;
    parts[3] = (ct[0] === "A" ? "B" : "A") + ct.slice(1);
    expect(() => decryptSecret(parts.join(":"))).toThrowError(CryptoError);
    try {
      decryptSecret(parts.join(":"));
    } catch (e) {
      expect((e as CryptoError).code).toBe("AUTH_FAILED");
    }
  });

  it("rejects malformed tokens and wrong key id", () => {
    expect(() => decryptSecret("nope")).toThrowError(CryptoError);
    const parts = encryptSecret("x").split(":");
    parts[1] = "deadbeef";
    try {
      decryptSecret(parts.join(":"));
      throw new Error("should throw");
    } catch (e) {
      expect((e as CryptoError).code).toBe("KEY_MISMATCH");
    }
  });

  it("isEncryptedSecret / maskSecret", () => {
    expect(isEncryptedSecret(encryptSecret("a"))).toBe(true);
    expect(isEncryptedSecret("plain")).toBe(false);
    expect(isEncryptedSecret(42)).toBe(false);
    expect(maskSecret("abcdefgh")).toBe("••••efgh");
    expect(maskSecret("ab")).not.toContain("ab");
  });
});
