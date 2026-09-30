/**
 * Tenant settings — Zod schemas + the settings registry (FR-SET-001, FR-SET-005, FR-TEN-004, FR-TEN-007; P1-10).
 *
 * Storage: `TenantSetting (tenantId, category, key) → value Json, isSecret` — one row per key, so adding a setting
 * is a registry entry, never a migration. Secrets are AES-256-GCM encrypted at rest (`lib/crypto`) and are never
 * returned to the client — the UI only learns whether they are set (`hasValue`) plus a masked tail.
 * Branding lives in the dedicated `TenantBranding` row (it is read on every request by the layout/login).
 */
import { z } from "zod";
import { LOCKOUT_MAX_FAILS, LOCKOUT_WINDOW_MIN, PASSWORD_MIN, SESSION_MAX_DAYS } from "@/lib/auth/password-policy";
import { DEFAULT_ACADEMIC_ID_FORMAT } from "@/features/users/academic-id";
import { AA_TEXT_CONTRAST, primaryContrast } from "@/lib/color";

export const SETTINGS_TABS = ["general", "security", "branding"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

// ───────────────────────────── general (FR-SET-001, FR-TEN-007) ─────────────────────────────

/** IANA zone names accepted by the runtime's Intl (validated with `Intl.supportedValuesOf` when available). */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(0);
    return true;
  } catch {
    return false;
  }
}

export const generalSettingsSchema = z
  .object({
    /** Tenant display name (Arabic, primary). Mirrors `Tenant.name`. */
    name: z.string().trim().min(2, "الاسم قصير").max(120),
    nameEn: z.string().trim().max(120).optional().or(z.literal("")),
    locale: z.enum(["ar", "en"]),
    timezone: z.string().trim().refine(isValidTimeZone, "منطقة زمنية غير صالحة"),
    /**
     * `users.academicIdFormat` — grammar of features/users/academic-id.ts: `YYYY`/`YY` = year, `N…` = zero-padded
     * sequence (exactly one run), every other character literal. Braces/placeholders are NOT a syntax (they would be
     * emitted verbatim), so only `A-Z 0-9 - _` are accepted.
     */
    academicIdFormat: z
      .string()
      .trim()
      .min(3)
      .max(24)
      .regex(/^[A-Z0-9_-]+$/i, "أحرف لاتينية وأرقام و- و_ فقط (YYYY أو YY للسنة، N للتسلسل)")
      .refine((v) => (v.match(/N+/g) ?? []).length === 1, "يجب أن يحوي تسلسلًا واحدًا من N"),
    /** Support contact shown to users on error pages / login (optional). */
    supportEmail: z.string().trim().email("بريد غير صالح").max(120).optional().or(z.literal("")),
  })
  .strict();
export type GeneralSettings = z.infer<typeof generalSettingsSchema>;

// ───────────────────────────── security (FR-SET-005) ─────────────────────────────

export const securitySettingsSchema = z
  .object({
    passwordMinLength: z.coerce.number().int().min(PASSWORD_MIN).max(64),
    passwordRequireSymbol: z.boolean(),
    /** Days before a password must be changed; 0 = never. */
    passwordMaxAgeDays: z.coerce.number().int().min(0).max(365),
    /** Idle session lifetime in minutes (0 = until browser close / remember-me). */
    sessionIdleMinutes: z.coerce
      .number()
      .int()
      .min(0)
      .max(24 * 60),
    /** Absolute session lifetime in days (remember-me upper bound). */
    sessionMaxDays: z.coerce.number().int().min(1).max(90),
    lockoutMaxFails: z.coerce.number().int().min(3).max(20),
    lockoutWindowMinutes: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 60),
    /** Roles (codes) that must use MFA once P3-05 ships; stored now so the policy is declared. */
    mfaRequiredRoles: z.array(z.string().trim().min(1).max(64)).max(20),
    /** Force every user to change password on next login (bumped by an admin, consumed by P1-11). */
    forcePasswordChangeOnNextLogin: z.boolean(),
  })
  .strict();
export type SecuritySettings = z.infer<typeof securitySettingsSchema>;

// ───────────────────────────── branding (FR-TEN-004) ─────────────────────────────

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * The primary is used as text on dark surfaces across the whole UI, so a low-contrast pick would fail WCAG AA
 * (e2e/a11y.spec axe gate) for every user of the tenant. Rejected server-side, previewed live in the form.
 */
export const primaryColorSchema = z
  .string()
  .regex(HEX_COLOR, "لون سداسي مثل #39ff14")
  // Zod 4 runs refinements even when the regex failed — guard so the contrast maths never sees a malformed value.
  .refine((hex) => !HEX_COLOR.test(hex) || primaryContrast(hex).passesAA, {
    message: `تباين اللون غير كافٍ للقراءة (المطلوب ${AA_TEXT_CONTRAST}:1 على الأسطح الداكنة) — اختر لونًا أفتح`,
  });

export const brandingSettingsSchema = z
  .object({
    primaryColor: primaryColorSchema,
    accentColor: z.string().regex(HEX_COLOR, "لون سداسي مثل #39ff14").optional().or(z.literal("")),
    loginMessage: z.string().trim().max(240).optional().or(z.literal("")),
  })
  .strict();
export type BrandingSettings = z.infer<typeof brandingSettingsSchema>;

/** Logo constraints (uploaded through the storage adapter; served through the signed download route). */
export const LOGO_MAX_BYTES = 512 * 1024;
export const LOGO_MIME = ["image/png", "image/svg+xml", "image/webp", "image/jpeg"] as const;

// ───────────────────────────── registry ─────────────────────────────

/**
 * Every key that lives in `TenantSetting`, with its category, JSON schema and default. `secret` keys are encrypted
 * at rest and redacted on read. The three tab schemas above are projections over this registry (+ Tenant/
 * TenantBranding columns for name/locale/timezone/colours).
 */
export const SETTINGS_REGISTRY = {
  "users.academicIdFormat": {
    category: "users",
    key: "academicIdFormat",
    schema: generalSettingsSchema.shape.academicIdFormat,
    default: DEFAULT_ACADEMIC_ID_FORMAT,
    secret: false,
  },
  "general.supportEmail": {
    category: "general",
    key: "supportEmail",
    schema: z.string().email().or(z.literal("")),
    default: "",
    secret: false,
  },
  "security.passwordMinLength": {
    category: "security",
    key: "passwordMinLength",
    schema: securitySettingsSchema.shape.passwordMinLength,
    default: PASSWORD_MIN,
    secret: false,
  },
  "security.passwordRequireSymbol": {
    category: "security",
    key: "passwordRequireSymbol",
    schema: z.boolean(),
    default: false,
    secret: false,
  },
  "security.passwordMaxAgeDays": {
    category: "security",
    key: "passwordMaxAgeDays",
    schema: securitySettingsSchema.shape.passwordMaxAgeDays,
    default: 0,
    secret: false,
  },
  "security.sessionIdleMinutes": {
    category: "security",
    key: "sessionIdleMinutes",
    schema: securitySettingsSchema.shape.sessionIdleMinutes,
    default: 0,
    secret: false,
  },
  "security.sessionMaxDays": {
    category: "security",
    key: "sessionMaxDays",
    schema: securitySettingsSchema.shape.sessionMaxDays,
    default: SESSION_MAX_DAYS,
    secret: false,
  },
  "security.lockoutMaxFails": {
    category: "security",
    key: "lockoutMaxFails",
    schema: securitySettingsSchema.shape.lockoutMaxFails,
    default: LOCKOUT_MAX_FAILS,
    secret: false,
  },
  "security.lockoutWindowMinutes": {
    category: "security",
    key: "lockoutWindowMinutes",
    schema: securitySettingsSchema.shape.lockoutWindowMinutes,
    default: LOCKOUT_WINDOW_MIN,
    secret: false,
  },
  "security.mfaRequiredRoles": {
    category: "security",
    key: "mfaRequiredRoles",
    schema: z.array(z.string()),
    default: [] as string[],
    secret: false,
  },
  "security.forcePasswordChangeOnNextLogin": {
    category: "security",
    key: "forcePasswordChangeOnNextLogin",
    schema: z.boolean(),
    default: false,
    secret: false,
  },
  /** Reserved for P2-07 (per-tenant SMTP) — declared now so the secret path is exercised and tested. */
  "email.smtpPassword": {
    category: "email",
    key: "smtpPassword",
    schema: z.string().max(512),
    default: "",
    secret: true,
  },
} as const;

export type SettingKey = keyof typeof SETTINGS_REGISTRY;
export const SETTING_KEYS = Object.keys(SETTINGS_REGISTRY) as SettingKey[];

export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS_REGISTRY)[K]["schema"]>;

/** Generic single-key write (used by the secret editor and by future modules). */
export const setSettingSchema = z
  .object({ key: z.enum(SETTING_KEYS as [SettingKey, ...SettingKey[]]), value: z.unknown() })
  .strict();

export const tabParamSchema = z.object({ tab: z.enum(SETTINGS_TABS).optional().default("general") });

/** What the client sees for a secret: never the value. */
export type SecretState = { hasValue: boolean; masked: string | null; updatedAt: Date | null };
