import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY, forcedChangeReason, newToken, sessionExpiry, ttlFor } from "@/features/auth/core";
import {
  activateAccountSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  TOKEN_RE,
} from "@/features/auth/schemas";
import { escapeHtml, renderMail } from "@/lib/mail/templates";

const DAY = 86_400_000;

describe("auth schemas (P1-11)", () => {
  const token = "A".repeat(43);
  it("token must be 43 base64url chars", () => {
    expect(TOKEN_RE.test(token)).toBe(true);
    expect(TOKEN_RE.test("A".repeat(42))).toBe(false);
    expect(TOKEN_RE.test(`${"A".repeat(42)}+`)).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ token: "short", password: "Abcdef12345", confirm: "Abcdef12345" })
        .success,
    ).toBe(false);
  });
  it("reset/activate require matching confirmation and are strict", () => {
    expect(
      resetPasswordSchema.safeParse({ token, password: "Abcdef12345", confirm: "Abcdef12345" }).success,
    ).toBe(true);
    const r = resetPasswordSchema.safeParse({ token, password: "Abcdef12345", confirm: "different12" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["confirm"]);
    expect(
      activateAccountSchema.safeParse({ token, password: "Abcdef12345", confirm: "Abcdef12345", extra: 1 })
        .success,
    ).toBe(false);
  });
  it("change requires current ≠ new", () => {
    expect(
      changePasswordSchema.safeParse({
        current: "Old#123456",
        password: "New#1234567",
        confirm: "New#1234567",
      }).success,
    ).toBe(true);
    expect(
      changePasswordSchema.safeParse({ current: "Same#12345", password: "Same#12345", confirm: "Same#12345" })
        .success,
    ).toBe(false);
  });
  it("forgot accepts email or academic id, trimmed", () => {
    expect(forgotPasswordSchema.parse({ identifier: "  443100001 " }).identifier).toBe("443100001");
    expect(forgotPasswordSchema.safeParse({ identifier: "" }).success).toBe(false);
  });
});

describe("tokens", () => {
  it("newToken is 43 chars base64url with a 64-hex sha256", () => {
    const { raw, hash } = newToken();
    expect(TOKEN_RE.test(raw)).toBe(true);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(newToken().raw).not.toBe(raw);
  });
  it("TTL per purpose (ADR-0009 §1)", () => {
    expect(ttlFor("RESET")).toBe(10 * 60_000);
    expect(ttlFor("ACTIVATE")).toBe(72 * 3_600_000);
  });
});

describe("session expiry (ADR-0009 §5)", () => {
  const now = new Date("2026-09-30T10:00:00Z");
  it("remember → sessionMaxDays; otherwise idle window or 12 h default", () => {
    expect(sessionExpiry(DEFAULT_POLICY, true, now).getTime()).toBe(now.getTime() + 30 * DAY);
    expect(sessionExpiry(DEFAULT_POLICY, false, now).getTime()).toBe(now.getTime() + 12 * 3_600_000);
    expect(sessionExpiry({ sessionIdleMinutes: 30, sessionMaxDays: 7 }, false, now).getTime()).toBe(
      now.getTime() + 30 * 60_000,
    );
    expect(sessionExpiry({ sessionIdleMinutes: 30, sessionMaxDays: 7 }, true, now).getTime()).toBe(
      now.getTime() + 7 * DAY,
    );
  });
});

describe("forcedChangeReason (ADR-0009 §6)", () => {
  const now = new Date("2026-09-30T10:00:00Z");
  const fresh = { mustChangePassword: false, passwordChangedAt: new Date(now.getTime() - 5 * DAY) };
  it("null when nothing applies", () => {
    expect(forcedChangeReason(fresh, DEFAULT_POLICY, now)).toBeNull();
  });
  it("admin reset wins", () => {
    expect(forcedChangeReason({ ...fresh, mustChangePassword: true }, DEFAULT_POLICY, now)).toBe(
      "ADMIN_RESET",
    );
  });
  it("tenant-wide force applies only to passwords older than the switch", () => {
    const policy = {
      ...DEFAULT_POLICY,
      forcePasswordChangeOnNextLogin: true,
      forceSince: new Date(now.getTime() - DAY),
    };
    expect(forcedChangeReason(fresh, policy, now)).toBe("TENANT_FORCED");
    expect(forcedChangeReason({ ...fresh, passwordChangedAt: now }, policy, now)).toBeNull();
    expect(forcedChangeReason({ ...fresh, passwordChangedAt: null }, policy, now)).toBe("TENANT_FORCED");
  });
  it("max age", () => {
    const policy = { ...DEFAULT_POLICY, passwordMaxAgeDays: 3 };
    expect(forcedChangeReason(fresh, policy, now)).toBe("EXPIRED");
    expect(
      forcedChangeReason({ ...fresh, passwordChangedAt: new Date(now.getTime() - 2 * DAY) }, policy, now),
    ).toBeNull();
    expect(forcedChangeReason({ ...fresh, passwordChangedAt: null }, policy, now)).toBe("EXPIRED");
  });
});

describe("mail templates", () => {
  it("escapes params and embeds the link in text + html, both locales", () => {
    const link = "https://demo.localhost/reset?token=abc";
    const ar = renderMail("auth.reset", "ar", {
      name: "<b>x</b>",
      tenantName: "جامعة & كلية",
      link,
      minutes: 10,
    });
    expect(ar.text).toContain(link);
    expect(ar.html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(ar.html).toContain("جامعة &amp; كلية");
    expect(ar.html).toContain('dir="rtl"');
    const en = renderMail("auth.activate", "en", { name: "Ali", tenantName: "Demo", link, hours: 72 });
    expect(en.subject).toContain("Activate");
    expect(en.html).toContain('dir="ltr"');
    expect(renderMail("auth.reset", "fr", { name: "A", tenantName: "B", link, minutes: 10 }).html).toContain(
      'lang="ar"',
    );
  });
  it("escapeHtml covers the five specials", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});
