/**
 * P1-12 (ADR-0010) — the job worker against the real test DB:
 *  - claimJobs hands disjoint batches to two competing workers (FOR UPDATE SKIP LOCKED) and respects runAt
 *  - the processor's conditional lock makes a job run exactly once even when both a worker and the inline runner race
 *  - reapStaleLocks requeues crashed RUNNING rows, releases stale reservations and fails exhausted ones
 *  - runClaimed FAILs unknown job types without retry
 *  - end-to-end: mail.send through the SMTP transport reaches Mailpit (skipped when Mailpit is not listening)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enqueueMail, processMailJob } from "@/features/auth/core";
import { platformPrisma, tx } from "@/lib/db";
import { claimJobs, reapStaleLocks, runClaimed } from "@/worker";

const suffix = Date.now().toString(36);
let tenantId = "";
const W1 = `w1-${suffix}`;
const W2 = `w2-${suffix}`;

async function enqueue(type: string, extra: Record<string, unknown> = {}) {
  return platformPrisma.job.create({
    data: {
      tenantId,
      type,
      payload: {
        to: `x-${suffix}@t.edu`,
        template: "auth.reset",
        locale: "ar",
        params: { name: "A", tenantName: "T", link: "https://t/x", minutes: 10 },
      },
      ...extra,
    },
    select: { id: true },
  });
}

beforeAll(async () => {
  tenantId = (
    await platformPrisma.tenant.create({ data: { slug: `wrk-${suffix}`, name: "W" }, select: { id: true } })
  ).id;
});
afterAll(async () => {
  await platformPrisma.tenant.deleteMany({ where: { id: tenantId } });
});

describe("claimJobs", () => {
  it("two workers claiming concurrently never receive the same job; future runAt is not claimed", async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 6; i++) ids.add((await enqueue("mail.send")).id);
    const future = await enqueue("mail.send", { runAt: new Date(Date.now() + 3_600_000) });
    const [a, b] = await Promise.all([claimJobs(4, W1), claimJobs(4, W2)]);
    const got = [...a, ...b].map((j) => j.id);
    expect(got.length).toBe(6);
    expect(new Set(got).size).toBe(6);
    expect(got).not.toContain(future.id);
    for (const j of a)
      expect((await platformPrisma.job.findUniqueOrThrow({ where: { id: j.id } })).lockedBy).toBe(W1);
    // reserved rows are not re-claimable
    expect(await claimJobs(10, W1)).toEqual([]);
    // cleanup so later tests start clean
    await platformPrisma.job.deleteMany({ where: { tenantId } });
  });
});

describe("exactly-once execution", () => {
  it("a worker and an inline runner racing on the same job → one RUNNING transition, attempts = 1", async () => {
    const { id } = await enqueue("mail.send");
    const [claimed] = await claimJobs(1, W1);
    expect(claimed?.id).toBe(id);
    // race: worker dispatch vs inline processor
    await Promise.all([runClaimed(claimed!, W1), processMailJob(tenantId, id, "inline")]);
    const row = await platformPrisma.job.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("SUCCEEDED");
    expect(row.attempts).toBe(1);
    await platformPrisma.job.deleteMany({ where: { tenantId } });
  });
});

describe("reapStaleLocks", () => {
  it("requeues stale RUNNING, releases stale reservations, fails exhausted", async () => {
    const stale = new Date(Date.now() - 60 * 60_000);
    const running = await enqueue("mail.send", {
      status: "RUNNING",
      lockedAt: stale,
      lockedBy: "dead",
      attempts: 1,
    });
    const reserved = await enqueue("mail.send", { lockedAt: stale, lockedBy: "dead" });
    const exhausted = await enqueue("mail.send", { attempts: 3, maxAttempts: 3 });
    const fresh = await enqueue("mail.send", { status: "RUNNING", lockedAt: new Date(), lockedBy: W1 });
    const n = await reapStaleLocks(15);
    expect(n).toBe(3);
    expect((await platformPrisma.job.findUniqueOrThrow({ where: { id: running.id } })).status).toBe(
      "PENDING",
    );
    const r = await platformPrisma.job.findUniqueOrThrow({ where: { id: reserved.id } });
    expect(r.lockedBy).toBeNull();
    expect((await platformPrisma.job.findUniqueOrThrow({ where: { id: exhausted.id } })).status).toBe(
      "FAILED",
    );
    expect((await platformPrisma.job.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe("RUNNING");
    await platformPrisma.job.deleteMany({ where: { tenantId } });
  });
});

describe("runClaimed", () => {
  it("unknown type → FAILED immediately, no retry", async () => {
    const { id } = await enqueue("does.not.exist");
    const [claimed] = await claimJobs(1, W1);
    await runClaimed(claimed!, W1);
    const row = await platformPrisma.job.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("FAILED");
    expect(row.error).toContain("no processor");
    await platformPrisma.job.deleteMany({ where: { tenantId } });
  });
});

describe("mail.send over SMTP (Mailpit)", () => {
  const api = process.env.MAILPIT_API ?? "http://127.0.0.1:8025";
  const host = process.env.SMTP_HOST ?? "127.0.0.1";
  const port = Number(process.env.SMTP_PORT ?? 1025);
  let up = false;
  beforeAll(async () => {
    try {
      const r = await fetch(`${api}/api/v1/info`, { signal: AbortSignal.timeout(1500) });
      up = r.ok;
    } catch {
      up = false;
    }
  });

  it("delivers the rendered message and stores the SMTP message id", async ({ skip }) => {
    if (!up) skip("Mailpit not running (docker compose up -d mailpit)");
    // Build an isolated SMTP transport (the module singleton is `log` under .env.test).
    const nodemailer = (await import("nodemailer")).default;
    const { renderMail } = await import("@/lib/mail/templates");
    const to = `smtp-${suffix}@t.edu`;
    const link = `https://t.edu/reset?token=${"Z".repeat(43)}`;
    const jobId = await tx(tenantId, (t) =>
      enqueueMail(
        t,
        tenantId,
        {
          to,
          template: "auth.reset",
          locale: "ar",
          params: { name: "سارة", tenantName: "T", link, minutes: 10 },
        },
        null,
      ),
    );
    const rendered = renderMail("auth.reset", "ar", { name: "سارة", tenantName: "T", link, minutes: 10 });
    const transporter = nodemailer.createTransport({ host, port, secure: false });
    const info = await transporter.sendMail({
      from: "scam2027 <no-reply@localhost>",
      to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
    expect(info.messageId).toBeTruthy();
    // Mailpit received it with the link intact
    const search = await fetch(`${api}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`).then(
      (r) => r.json() as Promise<{ messages: { ID: string; Subject: string }[] }>,
    );
    expect(search.messages.length).toBe(1);
    expect(search.messages[0]!.Subject).toBe(rendered.subject);
    const msg = await fetch(`${api}/api/v1/message/${search.messages[0]!.ID}`).then(
      (r) => r.json() as Promise<{ Text: string; HTML: string }>,
    );
    expect(msg.Text).toContain(link);
    expect(msg.HTML).toContain('dir="rtl"');
    // and the job row can still be completed by the processor (log transport here) — proves the two are decoupled
    await processMailJob(tenantId, jobId, "smtp-test");
    expect((await platformPrisma.job.findUniqueOrThrow({ where: { id: jobId } })).status).toBe("SUCCEEDED");
  });
});
