/**
 * Password policy constants — FR-AUTH-002. Kept free of Node-only imports so Zod schemas that reference the floor can
 * be bundled into client components (settings forms) without dragging argon2 into the browser build.
 */
export const PASSWORD_MIN = 10;

/** Registry defaults for `security.*` (SETTINGS_REGISTRY). Live values come from the tenant's settings. */
export const LOCKOUT_MAX_FAILS = 5;
export const LOCKOUT_WINDOW_MIN = 15;
/** Default idle session when `security.sessionIdleMinutes` = 0. */
export const SESSION_HOURS = 12;
/** Registry default for `security.sessionMaxDays` (remember-me lifetime). */
export const SESSION_MAX_DAYS = 30;
/** Cookie max-age ceiling; the binding lifetime is the Session row (`security.sessionMaxDays` ≤ 90). */
export const SESSION_COOKIE_MAX_DAYS = 90;
