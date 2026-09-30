/**
 * P1-11 — account activation, password recovery, forced change (FR-AUTH-003/004/005/010/011; ADR-0009).
 * Client-safe: no Node imports. Password *strength* is checked server-side against the tenant policy
 * (features/auth/core.passwordPolicyIssues) — these schemas only enforce shape.
 */
import { z } from "zod";
import { PASSWORD_MIN } from "@/lib/auth/password-policy";

/** 32 random bytes, base64url → 43 chars. Anything else is rejected before touching the DB. */
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
export const tokenSchema = z.string().regex(TOKEN_RE, "رابط غير صالح");

export const RESET_TTL_MINUTES = 10;
export const ACTIVATE_TTL_HOURS = 72;

export const forgotPasswordSchema = z
  .object({
    /** email or academic id — same identifier the login form accepts */
    identifier: z.string().trim().min(1).max(254),
  })
  .strict();

const newPasswordFields = {
  password: z.string().min(PASSWORD_MIN, `الحد الأدنى ${PASSWORD_MIN} أحرف`).max(256),
  confirm: z.string().min(1).max(256),
};
const mustMatch = (d: { password: string; confirm: string }) => d.password === d.confirm;
const mismatch = { message: "كلمتا المرور غير متطابقتين", path: ["confirm"] };

export const resetPasswordSchema = z
  .object({ token: tokenSchema, ...newPasswordFields })
  .strict()
  .refine(mustMatch, mismatch);

export const activateAccountSchema = z
  .object({ token: tokenSchema, ...newPasswordFields })
  .strict()
  .refine(mustMatch, mismatch);

export const changePasswordSchema = z
  .object({ current: z.string().min(1).max(256), ...newPasswordFields })
  .strict()
  .refine(mustMatch, mismatch)
  .refine((d) => d.current !== d.password, {
    message: "كلمة المرور الجديدة تطابق الحالية",
    path: ["password"],
  });

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Why a user is being sent to /change-password (rendered as an explanatory banner). */
export const CHANGE_REASONS = ["ADMIN_RESET", "TENANT_FORCED", "EXPIRED"] as const;
export type ChangeReason = (typeof CHANGE_REASONS)[number];
