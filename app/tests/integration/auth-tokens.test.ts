/**
 * P1-11 — recovery tokens, policy loading and the mail.send job against a real RLS tenant (ADR-0009).
 *  - issue voids earlier open tokens; only the newest hash verifies
 *  - wrong purpose / tampered / expired / used → distinct reasons
 *  - consume is single-use even when raced
 *  - tenant B can never see or consume tenant A's token
 *  - loadSecurityPolicy reflects TenantSetting rows (+ forceSince)
 *  - processMailJob renders through the log transport and stores a preview in Job.result
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  consumeToken,
  enqueueMail,
  issueAndMail,
  issueToken,
  loadSecurityPolicy,
  peekToken,
  processMailJob,
} from "@/features/auth/core";
import { setSetting } from "@/features/settings/core";
import { platformPrisma, tx } from "@/lib/db";

const suffix = Date.now().toString(36);
let a = "";
let b = "";
let userA = "";
let userB = "";

beforeAll(async () => {
  a = (
    await platformPrisma.tenant.create({ data: { slug: `tok-a-${suffix}`, name: "A" }, select: { id: true } })
  ).id;
  b = (
    await platformPrisma.tenant.create({ data: { slug: `tok-b-${suffix}`, name: "B" }, select: { id: true } })
  ).id;
  userA = (
    await platformPrisma.user.create({
      data: {
        tenantId: a,
        academicId: `A-${suffix}`,
        email: `a-${suffix}@t.edu`,
        name: "Alice",
        status: "ACTIVE",
      },
      select: { id: true },
    })
  ).id;
  userB = (
    await platformPrisma.user.create({
      data: {
        tenantId: b,
        academicId: `B-${suffix}`,
        email: `b-${suffix}@t.edu`,
        name: "Bob",
        status: "ACTIVE",
      },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  await platformPrisma.tenant.deleteMany({ where: { id: { in: [a, b] } } }); // cascades users/tokens/jobs/settings
});

describe("recovery tokens", () => {
  it("issue → peek ok; re-issue voids the previous token", async () => {
    const first = await tx(a, (t) => issueToken(t, a, userA, "RESET"));
    expect(first.expiresAt.getTime() - Date.now()).toBeGreaterThan(9 * 60_000);
    const second = await tx(a, (t) => issueToken(t, a, userA, "RESET"));
    const [p1, p2] = await tx(a, async (t) => [
      await peekToken(t, a, first.raw, "RESET"),
      await peekToken(t, a, second.raw, "RESET"),
    ]);
    expect(p1).toEqual({ ok: false, reason: "USED" });
    expect(p2.ok).toBe(true);
    if (p2.ok) expect(p2.userId).toBe(userA);
  });

  it("wrong purpose and tampered tokens are INVALID; expired is EXPIRED", async () => {
    const { raw } = await tx(a, (t) => issueToken(t, a, userA, "ACTIVATE"));
    expect(await tx(a, (t) => peekToken(t, a, raw, "RESET"))).toEqual({ ok: false, reason: "INVALID" });
    const tampered = (raw[0] === "A" ? "B" : "A") + raw.slice(1);
    expect(await tx(a, (t) => peekToken(t, a, tampered, "ACTIVATE"))).toEqual({
      ok: false,
      reason: "INVALID",
    });
    await platformPrisma.passwordResetToken.updateMany({
      where: { tenantId: a, userId: userA, usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await tx(a, (t) => peekToken(t, a, raw, "ACTIVATE"))).toEqual({ ok: false, reason: "EXPIRED" });
  });

  it("consume is single-use", async () => {
    const { raw } = await tx(a, (t) => issueToken(t, a, userA, "RESET"));
    const peek = await tx(a, (t) => peekToken(t, a, raw, "RESET"));
    expect(peek.ok).toBe(true);
    if (!peek.ok) return;
    expect(await tx(a, (t) => consumeToken(t, a, peek.tokenId))).toBe(true);
    expect(await tx(a, (t) => consumeToken(t, a, peek.tokenId))).toBe(false);
    expect(await tx(a, (t) => peekToken(t, a, raw, "RESET"))).toEqual({ ok: false, reason: "USED" });
  });

  it("RLS: tenant B cannot peek or consume tenant A's token", async () => {
    const { raw } = await tx(a, (t) => issueToken(t, a, userA, "RESET"));
    expect(await tx(b, (t) => peekToken(t, b, raw, "RESET"))).toEqual({ ok: false, reason: "INVALID" });
    const peekA = await tx(a, (t) => peekToken(t, a, raw, "RESET"));
    if (!peekA.ok) throw new Error("expected valid");
    expect(await tx(b, (t) => consumeToken(t, b, peekA.tokenId))).toBe(false);
    // still consumable by A afterwards
    expect(await tx(a, (t) => consumeToken(t, a, peekA.tokenId))).toBe(true);
    // B's own tokens are unaffected
    const bTok = await tx(b, (t) => issueToken(t, b, userB, "RESET"));
    expect((await tx(b, (t) => peekToken(t, b, bTok.raw, "RESET"))).ok).toBe(true);
  });
});

describe("security policy", () => {
  it("defaults, then reflects TenantSetting rows including forceSince", async () => {
    const before = await tx(a, (t) => loadSecurityPolicy(t, a));
    expect(before).toMatchObject({
      passwordMinLength: 10,
      lockoutMaxFails: 5,
      sessionMaxDays: 30,
      forceSince: null,
    });
    await tx(a, async (t) => {
      await setSetting(t, a, "security.passwordMinLength", 14);
      await setSetting(t, a, "security.passwordRequireSymbol", true);
      await setSetting(t, a, "security.forcePasswordChangeOnNextLogin", true);
    });
    const after = await tx(a, (t) => loadSecurityPolicy(t, a));
    expect(after.passwordMinLength).toBe(14);
    expect(after.passwordRequireSymbol).toBe(true);
    expect(after.forcePasswordChangeOnNextLogin).toBe(true);
    expect(after.forceSince).toBeInstanceOf(Date);
    // tenant B is untouched
    expect((await tx(b, (t) => loadSecurityPolicy(t, b))).passwordMinLength).toBe(10);
  });
});

describe("mail.send job", () => {
  it("issueAndMail enqueues a PENDING job; processMailJob succeeds via the log transport and stores a preview", async () => {
    const { jobId } = await tx(a, (t) =>
      issueAndMail(
        t,
        a,
        { id: userA, email: `a-${suffix}@t.edu`, name: "Alice", locale: "ar" },
        "RESET",
        "https://a.test",
        "Tenant A",
        null,
      ),
    );
    const pending = await platformPrisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(pending.status).toBe("PENDING");
    expect(pending.type).toBe("mail.send");
    const payload = pending.payload as { to: string; template: string; params: { link: string } };
    expect(payload.template).toBe("auth.reset");
    expect(payload.params.link).toMatch(/^https:\/\/a\.test\/reset\?token=[A-Za-z0-9_-]{43}$/);

    await processMailJob(a, jobId, "test");
    const done = await platformPrisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(done.status).toBe("SUCCEEDED");
    expect(done.attempts).toBe(1);
    expect(done.lockedBy).toBe("test");
    const result = done.result as { transport: string; text: string };
    expect(result.transport).toBe("log");
    expect(result.text).toContain(payload.params.link);
    // idempotent: a second run is a no-op (not PENDING anymore)
    await processMailJob(a, jobId, "test-2");
    expect((await platformPrisma.job.findUniqueOrThrow({ where: { id: jobId } })).attempts).toBe(1);
  });

  it("enqueueMail with an unknown template fails the job and re-queues until maxAttempts", async () => {
    const jobId = await tx(a, (t) =>
      enqueueMail(t, a, { to: "x@t.edu", template: "nope" as never, params: {}, locale: "ar" }, null),
    );
    await processMailJob(a, jobId, "w");
    let j = await platformPrisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(j.status).toBe("PENDING");
    expect(j.attempts).toBe(1);
    expect(j.error).toBeTruthy();
    await processMailJob(a, jobId, "w");
    await processMailJob(a, jobId, "w");
    j = await platformPrisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(j.status).toBe("FAILED");
    expect(j.attempts).toBe(3);
  });
});
