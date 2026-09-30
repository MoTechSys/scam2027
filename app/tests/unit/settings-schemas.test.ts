import { describe, expect, it } from "vitest";
import {
  brandingSettingsSchema,
  generalSettingsSchema,
  isValidTimeZone,
  securitySettingsSchema,
  SETTING_KEYS,
  SETTINGS_REGISTRY,
  setSettingSchema,
  tabParamSchema,
} from "@/features/settings/schemas";
import { PASSWORD_MIN } from "@/lib/auth/password-policy";

const general = {
  name: "جامعة الاختبار",
  nameEn: "Test University",
  locale: "ar",
  timezone: "Asia/Aden",
  academicIdFormat: "YYYY-NNNNN",
  supportEmail: "help@test.edu",
};
const security = {
  passwordMinLength: 12,
  passwordRequireSymbol: true,
  passwordMaxAgeDays: 0,
  sessionIdleMinutes: 30,
  sessionMaxDays: 30,
  lockoutMaxFails: 5,
  lockoutWindowMinutes: 15,
  mfaRequiredRoles: ["ADMIN"],
  forcePasswordChangeOnNextLogin: false,
};

describe("settings schemas", () => {
  it("isValidTimeZone", () => {
    expect(isValidTimeZone("Asia/Riyadh")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });

  it("general: accepts a valid payload and is strict", () => {
    expect(generalSettingsSchema.parse(general)).toEqual(general);
    expect(generalSettingsSchema.safeParse({ ...general, extra: 1 }).success).toBe(false);
    expect(generalSettingsSchema.safeParse({ ...general, timezone: "Nowhere/City" }).success).toBe(false);
    expect(generalSettingsSchema.safeParse({ ...general, locale: "fr" }).success).toBe(false);
    expect(generalSettingsSchema.safeParse({ ...general, supportEmail: "" }).success).toBe(true);
    expect(generalSettingsSchema.safeParse({ ...general, supportEmail: "nope" }).success).toBe(false);
  });

  it("general: academicIdFormat must contain an N run and only safe chars", () => {
    expect(generalSettingsSchema.safeParse({ ...general, academicIdFormat: "ABC" }).success).toBe(false);
    expect(generalSettingsSchema.safeParse({ ...general, academicIdFormat: "STU-YYNNNN" }).success).toBe(
      true,
    );
    // braces are not a placeholder syntax — they would be emitted literally into every academic id
    expect(generalSettingsSchema.safeParse({ ...general, academicIdFormat: "{YY}NNNN" }).success).toBe(false);
    expect(generalSettingsSchema.safeParse({ ...general, academicIdFormat: "NN-NN" }).success).toBe(false);
    expect(generalSettingsSchema.safeParse({ ...general, academicIdFormat: "NN;DROP" }).success).toBe(false);
  });

  it("security: coerces numbers from form strings and enforces floors/ceilings", () => {
    const r = securitySettingsSchema.parse({ ...security, passwordMinLength: "14", lockoutMaxFails: "7" });
    expect(r.passwordMinLength).toBe(14);
    expect(r.lockoutMaxFails).toBe(7);
    expect(
      securitySettingsSchema.safeParse({ ...security, passwordMinLength: PASSWORD_MIN - 1 }).success,
    ).toBe(false);
    expect(securitySettingsSchema.safeParse({ ...security, lockoutMaxFails: 2 }).success).toBe(false);
    expect(securitySettingsSchema.safeParse({ ...security, sessionMaxDays: 0 }).success).toBe(false);
    expect(securitySettingsSchema.safeParse({ ...security, sessionMaxDays: 91 }).success).toBe(false);
    expect(securitySettingsSchema.safeParse({ ...security, mfaRequiredRoles: [""] }).success).toBe(false);
    expect(securitySettingsSchema.safeParse({ ...security, hax: true }).success).toBe(false);
  });

  it("branding: HEX only, optional accent/message, strict", () => {
    expect(
      brandingSettingsSchema.parse({ primaryColor: "#39FF14", accentColor: "", loginMessage: "" }),
    ).toBeTruthy();
    expect(brandingSettingsSchema.safeParse({ primaryColor: "39ff14" }).success).toBe(false);
    expect(brandingSettingsSchema.safeParse({ primaryColor: "#fff" }).success).toBe(false);
    expect(
      brandingSettingsSchema.safeParse({ primaryColor: "#39ff14", loginMessage: "x".repeat(241) }).success,
    ).toBe(false);
    expect(brandingSettingsSchema.safeParse({ primaryColor: "#39ff14", logoUrl: "http://x" }).success).toBe(
      false,
    );
  });

  it("registry: every key has category.key naming, a default that passes its own schema, secret flag boolean", () => {
    for (const k of SETTING_KEYS) {
      const def = SETTINGS_REGISTRY[k];
      expect(k).toBe(`${def.category}.${def.key}`);
      expect(def.schema.safeParse(def.default).success).toBe(true);
      expect(typeof def.secret).toBe("boolean");
    }
    expect(SETTINGS_REGISTRY["email.smtpPassword"].secret).toBe(true);
    expect(SETTINGS_REGISTRY["security.passwordMinLength"].default).toBe(PASSWORD_MIN);
  });

  it("setSettingSchema / tabParamSchema", () => {
    expect(setSettingSchema.safeParse({ key: "email.smtpPassword", value: "x" }).success).toBe(true);
    expect(setSettingSchema.safeParse({ key: "nope.key", value: "x" }).success).toBe(false);
    expect(tabParamSchema.parse({}).tab).toBe("general");
    expect(tabParamSchema.safeParse({ tab: "email" }).success).toBe(false);
  });
});
