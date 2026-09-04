/** Login error codes surfaced to the UI (translated under `auth.errors.*`). Shared by the action and tests. */
export const LOGIN_ERROR_CODES = [
  "INVALID_CREDENTIALS",
  "LOCKED",
  "FROZEN",
  "DISABLED",
  "PENDING",
  "RATE_LIMITED",
  "VALIDATION",
  "UNKNOWN",
] as const;
export type LoginErrorCode = (typeof LOGIN_ERROR_CODES)[number];

export type LoginState = { error: LoginErrorCode | null; identifier?: string };

export function toLoginErrorCode(reason: string | undefined | null): LoginErrorCode {
  return (LOGIN_ERROR_CODES as readonly string[]).includes(reason ?? "")
    ? (reason as LoginErrorCode)
    : "INVALID_CREDENTIALS";
}

/** Only same-origin relative paths are accepted as post-login targets (open-redirect guard). */
export function safeNext(next: string | undefined | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || /^\/login(\?|$)/.test(next)) return "/dashboard";
  if (/[\r\n\\]/.test(next)) return "/dashboard";
  return next;
}
