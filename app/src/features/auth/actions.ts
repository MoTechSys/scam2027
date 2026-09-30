"use server";

/**
 * P1-11 Server Actions — FR-AUTH-003/004/010/011 (ADR-0009).
 *
 * Anonymous actions (`forgotPasswordAction`, `resetPasswordAction`, `activateAccountAction`) resolve the tenant from
 * the request host (x-tenant-id), never from the body, and answer identically whether or not the account exists.
 * `changePasswordAction` is the only authenticated action allowed while `passwordChangeRequired` is set.
 * Every mutation: Zod strict → tx(tenantId) → audit → Result<T>. Mail leaves as `Job mail.send` (kicked inline with
 * `after()` until the P1-12 worker), never as a blocking SMTP call.
 */
import { headers } from "next/headers";
import { kickJob } from "@/lib/jobs/kick";
import { audit } from "@/lib/audit";
import { forwardedOrigin } from "@/lib/auth/forwarded";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { assertPermission, requireUserOrThrow } from "@/lib/auth/rbac";
import { tx } from "@/lib/db/tenant";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/ratelimit";
import { AppError, type Result } from "@/lib/result";
import { safeAction } from "@/lib/safe-action";
import { currentTenant } from "@/lib/tenant/current";
import {
  consumeToken,
  issueAndMail,
  loadSecurityPolicy,
  passwordPolicyIssues,
  peekToken,
  revokeOtherSessions,
  type TokenPurpose,
} from "./core";
import {
  activateAccountSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  tokenSchema,
} from "./schemas";

async function requestMeta(): Promise<{ tenantId: string; origin: string; ip?: string; userAgent?: string }> {
  const h = await headers();
  const tenantId = h.get("x-tenant-id");
  if (!tenantId) throw new AppError("NOT_FOUND", "المستأجر غير معروف");
  const origin = forwardedOrigin(h) ?? "";
  return {
    tenantId,
    origin,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? undefined,
    userAgent: h.get("user-agent") ?? undefined,
  };
}

// ───────────────────────────── forgot ─────────────────────────────

/**
 * Always returns `{ queued: true }` (ADR-0009 §3) — the response must not reveal whether the identifier exists.
 * Rate-limited per identifier (3 / 15 min) and per IP (10 / 15 min); over-limit is also indistinguishable.
 */
export async function forgotPasswordAction(input: unknown): Promise<Result<{ queued: true }>> {
  return safeAction(
    async () => {
      const data = forgotPasswordSchema.parse(input);
      const { tenantId, origin, ip, userAgent } = await requestMeta();
      const ident = data.identifier.toLowerCase();
      const okIdent = rateLimit(`forgot:${tenantId}:${ident}`, 3, 15 * 60_000).ok;
      const okIp = rateLimit(`forgot-ip:${ip ?? "unknown"}`, 10, 15 * 60_000).ok;
      if (!okIdent || !okIp) {
        logger.warn({ tenantId, ip }, "auth.forgot.rate_limited");
        return { queued: true as const };
      }
      const tenant = await currentTenant();
      const jobId = await tx(tenantId, async (t) => {
        const user = await t.user.findFirst({
          where: {
            tenantId,
            deletedAt: null,
            status: "ACTIVE",
            OR: [{ email: ident }, { academicId: data.identifier }],
          },
          select: { id: true, email: true, name: true, locale: true },
        });
        await t.auditLog.create({
          data: {
            tenantId,
            actorId: user?.id ?? null,
            action: "auth.reset.request",
            entity: "User",
            entityId: user?.id ?? null,
            after: { identifier: ident, found: !!user },
            ip: ip ?? null,
            userAgent: userAgent ?? null,
          },
        });
        if (!user) return null;
        const r = await issueAndMail(
          t,
          tenantId,
          user,
          "RESET",
          origin,
          tenant?.name ?? "scam2027",
          null,
          ip,
        );
        return r.jobId;
      });
      if (jobId) kickJob(tenantId, jobId, "mail.send");
      return { queued: true as const };
    },
    { action: "auth.reset.request" },
  );
}

// ───────────────────────────── token peek (page load) ─────────────────────────────

export type TokenState =
  { valid: true; name: string } | { valid: false; reason: "INVALID" | "EXPIRED" | "USED" };

/** Used by /reset and /activate pages to render a clear state before the user types anything. */
export async function inspectTokenAction(raw: unknown, purpose: TokenPurpose): Promise<TokenState> {
  const parsed = tokenSchema.safeParse(raw);
  if (!parsed.success) return { valid: false, reason: "INVALID" };
  const h = await headers();
  const tenantId = h.get("x-tenant-id");
  if (!tenantId) return { valid: false, reason: "INVALID" };
  return tx(tenantId, async (t) => {
    const r = await peekToken(t, tenantId, parsed.data, purpose);
    if (!r.ok) return { valid: false as const, reason: r.reason };
    const u = await t.user.findFirst({ where: { id: r.userId, deletedAt: null }, select: { name: true } });
    return u ? { valid: true as const, name: u.name } : { valid: false as const, reason: "INVALID" as const };
  });
}

// ───────────────────────────── reset / activate ─────────────────────────────

async function setPasswordWithToken(input: unknown, purpose: TokenPurpose): Promise<{ email: string }> {
  const data = (purpose === "RESET" ? resetPasswordSchema : activateAccountSchema).parse(input);
  const { tenantId, ip, userAgent } = await requestMeta();
  if (!rateLimit(`token-use:${ip ?? "unknown"}`, 20, 15 * 60_000).ok)
    throw new AppError("RATE_LIMITED", "محاولات كثيرة، حاول لاحقًا");

  return tx(tenantId, async (t) => {
    const policy = await loadSecurityPolicy(t, tenantId);
    const issues = passwordPolicyIssues(data.password, policy);
    if (issues.length) throw new AppError("VALIDATION", "كلمة مرور ضعيفة", { password: issues });

    const peek = await peekToken(t, tenantId, data.token, purpose);
    if (!peek.ok)
      throw new AppError(
        "NOT_FOUND",
        peek.reason === "EXPIRED" ? "انتهت صلاحية الرابط" : "الرابط غير صالح أو مستخدم",
      );
    const user = await t.user.findFirst({
      where: { id: peek.userId, deletedAt: null },
      select: { id: true, email: true, status: true },
    });
    if (!user) throw new AppError("NOT_FOUND", "الرابط غير صالح");
    if (purpose === "RESET" && user.status !== "ACTIVE") throw new AppError("LOCKED", "الحساب غير نشط");
    if (purpose === "ACTIVATE" && user.status !== "PENDING_ACTIVATION" && user.status !== "ACTIVE")
      throw new AppError("LOCKED", "الحساب غير قابل للتفعيل");

    if (!(await consumeToken(t, tenantId, peek.tokenId)))
      throw new AppError("CONFLICT", "الرابط استُخدم للتو");
    const passwordHash = await hashPassword(data.password);
    await t.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
        sessionVersion: { increment: 1 },
        ...(purpose === "ACTIVATE" ? { status: "ACTIVE", emailVerifiedAt: new Date() } : {}),
      },
    });
    await revokeOtherSessions(t, tenantId, user.id, null);
    await t.auditLog.create({
      data: {
        tenantId,
        actorId: user.id,
        action: purpose === "RESET" ? "auth.reset.complete" : "auth.activate",
        entity: "User",
        entityId: user.id,
        ip: ip ?? null,
        userAgent: userAgent ?? null,
      },
    });
    return { email: user.email };
  });
}

export async function resetPasswordAction(input: unknown): Promise<Result<{ email: string }>> {
  return safeAction(() => setPasswordWithToken(input, "RESET"), { action: "auth.reset.complete" });
}

export async function activateAccountAction(input: unknown): Promise<Result<{ email: string }>> {
  return safeAction(() => setPasswordWithToken(input, "ACTIVATE"), { action: "auth.activate" });
}

// ───────────────────────────── change (authenticated) ─────────────────────────────

/** FR-AUTH-011 + FR-AUTH-010: verifies the current password, applies the tenant policy, keeps the current session. */
export async function changePasswordAction(input: unknown): Promise<Result<{ revokedSessions: number }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow({ allowPasswordChangeRequired: true });
      const data = changePasswordSchema.parse(input);
      if (!rateLimit(`chpw:${ctx.user.id}`, 10, 15 * 60_000).ok)
        throw new AppError("RATE_LIMITED", "محاولات كثيرة، حاول لاحقًا");
      return tx(ctx.tenantId, async (t) => {
        const policy = await loadSecurityPolicy(t, ctx.tenantId);
        const issues = passwordPolicyIssues(data.password, policy);
        if (issues.length) throw new AppError("VALIDATION", "كلمة مرور ضعيفة", { password: issues });
        const u = await t.user.findFirst({ where: { id: ctx.user.id }, select: { passwordHash: true } });
        if (!u || !(await verifyPassword(u.passwordHash, data.current)))
          throw new AppError("INVALID_CREDENTIALS", "كلمة المرور الحالية غير صحيحة", {
            current: ["غير صحيحة"],
          });
        const passwordHash = await hashPassword(data.password);
        await t.user.update({
          where: { id: ctx.user.id },
          data: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false },
        });
        // Other devices must re-authenticate; this session stays valid (sessionVersion is not bumped — the row check
        // in requireUser is enough, and bumping would also kick the caller out).
        const revokedSessions = await revokeOtherSessions(t, ctx.tenantId, ctx.user.id, ctx.sessionId);
        await audit(
          ctx,
          {
            action: "auth.password.change",
            entity: "User",
            entityId: ctx.user.id,
            after: { revokedSessions },
          },
          t,
        );
        return { revokedSessions };
      });
    },
    { action: "auth.password.change" },
  );
}

// ───────────────────────────── admin: (re)send activation ─────────────────────────────

/** Used by users/actions after creating a PENDING_ACTIVATION account and by the user detail page ("resend"). */
export async function sendActivationAction(input: unknown): Promise<Result<{ jobId: string }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "user.edit", "user.create");
      const id = (input as { id?: unknown })?.id;
      if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))
        throw new AppError("VALIDATION", "معرّف غير صالح");
      const { origin } = await requestMeta();
      const tenant = await currentTenant();
      const jobId = await tx(ctx.tenantId, async (t) => {
        const user = await t.user.findFirst({
          where: { id, deletedAt: null, status: "PENDING_ACTIVATION" },
          select: { id: true, email: true, name: true, locale: true },
        });
        if (!user) throw new AppError("NOT_FOUND", "المستخدم غير موجود أو مفعَّل بالفعل");
        const r = await issueAndMail(
          t,
          ctx.tenantId,
          user,
          "ACTIVATE",
          origin,
          tenant?.name ?? "scam2027",
          ctx.user.id,
          ctx.ip,
        );
        await audit(
          ctx,
          { action: "auth.activation.send", entity: "User", entityId: user.id, after: { jobId: r.jobId } },
          t,
        );
        return r.jobId;
      });
      kickJob(ctx.tenantId, jobId, "mail.send");
      return { jobId };
    },
    { action: "auth.activation.send" },
  );
}
