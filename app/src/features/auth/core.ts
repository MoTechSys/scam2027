/**
 * P1-11 core — vitest-loadable (no next/* imports). Everything here runs inside a caller-provided `TenantTx`.
 *
 *  - Tenant password policy (from SETTINGS_REGISTRY) → `passwordPolicyIssues`
 *  - Recovery tokens (ADR-0009 §1): issue (revoking open ones), consume once, constant-time compare
 *  - Forced-change evaluation (ADR-0009 §6)
 *  - `mail.send` job enqueue + inline processor (ADR-0009 §4)
 */
import type { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { safeEqualHex, sha256 } from "@/lib/auth/password";
import {
  LOCKOUT_MAX_FAILS,
  LOCKOUT_WINDOW_MIN,
  PASSWORD_MIN,
  SESSION_HOURS,
  SESSION_MAX_DAYS,
} from "@/lib/auth/password-policy";
import { db, tx, type TenantTx } from "@/lib/db/tenant";
import { logger } from "@/lib/logger";
import { sendTemplate, type MailTemplate, type TemplateParams } from "@/lib/mail";
import { getSettings } from "@/features/settings/core";
import { ACTIVATE_TTL_HOURS, RESET_TTL_MINUTES, type ChangeReason } from "./schemas";

// ───────────────────────────── policy ─────────────────────────────

export type SecurityPolicy = {
  passwordMinLength: number;
  passwordRequireSymbol: boolean;
  passwordMaxAgeDays: number;
  sessionIdleMinutes: number;
  sessionMaxDays: number;
  lockoutMaxFails: number;
  lockoutWindowMinutes: number;
  forcePasswordChangeOnNextLogin: boolean;
  /** updatedAt of the force switch row (null when never set) — users whose password predates it must rotate. */
  forceSince: Date | null;
};

export const DEFAULT_POLICY: SecurityPolicy = {
  passwordMinLength: PASSWORD_MIN,
  passwordRequireSymbol: false,
  passwordMaxAgeDays: 0,
  sessionIdleMinutes: 0,
  sessionMaxDays: SESSION_MAX_DAYS,
  lockoutMaxFails: LOCKOUT_MAX_FAILS,
  lockoutWindowMinutes: LOCKOUT_WINDOW_MIN,
  forcePasswordChangeOnNextLogin: false,
  forceSince: null,
};

/** One round-trip: every security.* key + the updatedAt of the force switch. */
export async function loadSecurityPolicy(t: TenantTx, tenantId: string): Promise<SecurityPolicy> {
  const [s, forceRow] = await Promise.all([
    getSettings(t, tenantId, [
      "security.passwordMinLength",
      "security.passwordRequireSymbol",
      "security.passwordMaxAgeDays",
      "security.sessionIdleMinutes",
      "security.sessionMaxDays",
      "security.lockoutMaxFails",
      "security.lockoutWindowMinutes",
      "security.forcePasswordChangeOnNextLogin",
    ] as const),
    t.tenantSetting.findUnique({
      where: {
        tenantId_category_key: { tenantId, category: "security", key: "forcePasswordChangeOnNextLogin" },
      },
      select: { updatedAt: true },
    }),
  ]);
  return {
    passwordMinLength: s["security.passwordMinLength"],
    passwordRequireSymbol: s["security.passwordRequireSymbol"],
    passwordMaxAgeDays: s["security.passwordMaxAgeDays"],
    sessionIdleMinutes: s["security.sessionIdleMinutes"],
    sessionMaxDays: s["security.sessionMaxDays"],
    lockoutMaxFails: s["security.lockoutMaxFails"],
    lockoutWindowMinutes: s["security.lockoutWindowMinutes"],
    forcePasswordChangeOnNextLogin: s["security.forcePasswordChangeOnNextLogin"],
    forceSince: forceRow?.updatedAt ?? null,
  };
}

/** Machine-readable issue codes (translated under `auth.passwordIssues.*`). */
export function passwordPolicyIssues(
  p: string,
  policy: Pick<SecurityPolicy, "passwordMinLength" | "passwordRequireSymbol">,
): string[] {
  const issues: string[] = [];
  if (p.length < policy.passwordMinLength) issues.push(`min:${policy.passwordMinLength}`);
  if (!/[a-z]/.test(p)) issues.push("lower");
  if (!/[A-Z]/.test(p)) issues.push("upper");
  if (!/\d/.test(p)) issues.push("digit");
  if (policy.passwordRequireSymbol && !/[^A-Za-z0-9]/.test(p)) issues.push("symbol");
  return issues;
}

/** Session lifetime from policy (ADR-0009 §5). `remember` → absolute max; otherwise idle window (0 → 12 h default). */
export function sessionExpiry(
  policy: Pick<SecurityPolicy, "sessionIdleMinutes" | "sessionMaxDays">,
  remember: boolean,
  now = new Date(),
): Date {
  if (remember) return new Date(now.getTime() + policy.sessionMaxDays * 86_400_000);
  const idleMs =
    policy.sessionIdleMinutes > 0 ? policy.sessionIdleMinutes * 60_000 : SESSION_HOURS * 3_600_000;
  return new Date(now.getTime() + idleMs);
}

/**
 * Why (if at all) the user must change their password now (ADR-0009 §6). Order = most specific first so the banner
 * explains the actual trigger.
 */
export function forcedChangeReason(
  user: { mustChangePassword: boolean; passwordChangedAt: Date | null },
  policy: Pick<SecurityPolicy, "forcePasswordChangeOnNextLogin" | "forceSince" | "passwordMaxAgeDays">,
  now = new Date(),
): ChangeReason | null {
  if (user.mustChangePassword) return "ADMIN_RESET";
  const changed = user.passwordChangedAt;
  if (policy.forcePasswordChangeOnNextLogin && policy.forceSince && (!changed || changed < policy.forceSince))
    return "TENANT_FORCED";
  if (policy.passwordMaxAgeDays > 0) {
    if (!changed) return "EXPIRED";
    if (now.getTime() - changed.getTime() > policy.passwordMaxAgeDays * 86_400_000) return "EXPIRED";
  }
  return null;
}

// ───────────────────────────── tokens ─────────────────────────────

export type TokenPurpose = "RESET" | "ACTIVATE";

export function ttlFor(purpose: TokenPurpose): number {
  return purpose === "RESET" ? RESET_TTL_MINUTES * 60_000 : ACTIVATE_TTL_HOURS * 3_600_000;
}

/** Generate a raw token (returned to the caller for the link) and its stored hash. Never persist the raw value. */
export function newToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: sha256(raw) };
}

/**
 * Issue a single-use token: previous open tokens of the same purpose for the user are voided (usedAt = now) so only
 * the newest link works. Purpose is encoded in the TTL and re-checked on consume via `expiresAt` window + prefix.
 */
export async function issueToken(
  t: TenantTx,
  tenantId: string,
  userId: string,
  purpose: TokenPurpose,
  requestedIp?: string,
): Promise<{ raw: string; expiresAt: Date }> {
  const now = new Date();
  await t.passwordResetToken.updateMany({
    where: { tenantId, userId, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  const { raw, hash } = newToken();
  const expiresAt = new Date(now.getTime() + ttlFor(purpose));
  await t.passwordResetToken.create({
    data: { tenantId, userId, tokenHash: `${purpose}:${hash}`, expiresAt, requestedIp: requestedIp ?? null },
  });
  return { raw, expiresAt };
}

export type ConsumeResult =
  { ok: true; userId: string; tokenId: string } | { ok: false; reason: "INVALID" | "EXPIRED" | "USED" };

/** Look the token up by hash (unique index), verify purpose + window + single use in constant time. */
export async function peekToken(
  t: TenantTx,
  tenantId: string,
  raw: string,
  purpose: TokenPurpose,
): Promise<ConsumeResult> {
  const hash = `${purpose}:${sha256(raw)}`;
  const row = await t.passwordResetToken.findFirst({
    where: { tenantId, tokenHash: hash },
    select: { id: true, userId: true, tokenHash: true, expiresAt: true, usedAt: true },
  });
  if (!row) return { ok: false, reason: "INVALID" };
  const [, storedHex] = row.tokenHash.split(":");
  if (!storedHex || !safeEqualHex(storedHex, sha256(raw))) return { ok: false, reason: "INVALID" };
  if (row.usedAt) return { ok: false, reason: "USED" };
  if (row.expiresAt <= new Date()) return { ok: false, reason: "EXPIRED" };
  return { ok: true, userId: row.userId, tokenId: row.id };
}

/** Mark consumed inside the same transaction that changes the password. Returns false if it raced. */
export async function consumeToken(t: TenantTx, tenantId: string, tokenId: string): Promise<boolean> {
  const r = await t.passwordResetToken.updateMany({
    where: { tenantId, id: tokenId, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  return r.count === 1;
}

/** Login must not count the *current* session as "other" — bump the version and re-point the current session. */
export async function revokeOtherSessions(
  t: TenantTx,
  tenantId: string,
  userId: string,
  keepSessionId: string | null,
): Promise<number> {
  const r = await t.session.updateMany({
    where: { tenantId, userId, revokedAt: null, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) },
    data: { revokedAt: new Date(), revokedBy: userId },
  });
  return r.count;
}

// ───────────────────────────── mail job ─────────────────────────────

export type MailJobPayload = {
  to: string;
  template: MailTemplate;
  /** flat string/number/boolean params (Job.payload contract) */
  params: Record<string, string | number | boolean>;
  locale: string;
};

/** Enqueue a `mail.send` job in the caller's transaction (so a failed request never leaves an orphan email). */
export async function enqueueMail(
  t: TenantTx,
  tenantId: string,
  input: MailJobPayload,
  createdBy: string | null,
): Promise<string> {
  const job = await t.job.create({
    data: {
      tenantId,
      type: "mail.send",
      payload: input as unknown as Prisma.InputJsonObject,
      createdBy,
      maxAttempts: 3,
    },
    select: { id: true },
  });
  return job.id;
}

/**
 * Process one `mail.send` job with the standard lock protocol (PENDING → RUNNING → SUCCEEDED/FAILED). Idempotent on
 * re-run after a crash (attempts < maxAttempts). The rendered preview is kept in `Job.result` (log transport) so
 * operators — and e2e — can read the link without a mailbox.
 */
export async function processMailJob(tenantId: string, jobId: string, workerId = "inline"): Promise<void> {
  const client = db(tenantId);
  const locked = await client.job.updateMany({
    where: { id: jobId, status: "PENDING", type: "mail.send" },
    data: {
      status: "RUNNING",
      lockedAt: new Date(),
      lockedBy: workerId,
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  });
  if (locked.count === 0) return;
  const job = await client.job.findFirst({
    where: { id: jobId },
    select: { payload: true, attempts: true, maxAttempts: true },
  });
  if (!job) return;
  const payload = job.payload as unknown as MailJobPayload;
  try {
    const res = await sendTemplate(
      payload.to,
      payload.template,
      payload.locale,
      payload.params as TemplateParams[typeof payload.template],
    );
    await client.job.update({
      where: { id: jobId },
      data: {
        status: "SUCCEEDED",
        finishedAt: new Date(),
        result: {
          transport: res.transport,
          messageId: res.messageId,
          ...(res.preview ? { subject: res.preview.subject, text: res.preview.text } : {}),
        } as Prisma.InputJsonObject,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ jobId, tenantId, err: message }, "mail.send failed");
    await client.job.update({
      where: { id: jobId },
      data: {
        status: job.attempts >= job.maxAttempts ? "FAILED" : "PENDING",
        error: message.slice(0, 1000),
        finishedAt: new Date(),
        lockedAt: null,
        lockedBy: null,
      },
    });
  }
}

/** Convenience for callers that already have the user row: issue token + enqueue mail in one tx step. */
export async function issueAndMail(
  t: TenantTx,
  tenantId: string,
  user: { id: string; email: string; name: string; locale: string },
  purpose: TokenPurpose,
  origin: string,
  tenantName: string,
  createdBy: string | null,
  requestedIp?: string,
): Promise<{ jobId: string; expiresAt: Date }> {
  const { raw, expiresAt } = await issueToken(t, tenantId, user.id, purpose, requestedIp);
  const path = purpose === "RESET" ? "/reset" : "/activate";
  const link = `${origin}${path}?token=${raw}`;
  const jobId =
    purpose === "RESET"
      ? await enqueueMail(
          t,
          tenantId,
          {
            to: user.email,
            template: "auth.reset",
            locale: user.locale,
            params: { name: user.name, tenantName, link, minutes: RESET_TTL_MINUTES },
          },
          createdBy,
        )
      : await enqueueMail(
          t,
          tenantId,
          {
            to: user.email,
            template: "auth.activate",
            locale: user.locale,
            params: { name: user.name, tenantName, link, hours: ACTIVATE_TTL_HOURS },
          },
          createdBy,
        );
  return { jobId, expiresAt };
}

export { tx };
