/**
 * Job worker — `pnpm worker` (P1-12, ADR-0010). Long-running Node process, same codebase as the app.
 *
 *  poll loop ──► claim up to WORKER_CONCURRENCY PENDING jobs (runAt <= now) with one atomic UPDATE … SKIP LOCKED
 *            ──► dispatch each to JOB_PROCESSORS[type](tenantId, jobId, workerId)
 *            ──► processors run the tenant work under RLS via tx(tenantId) and record SUCCEEDED / PENDING(retry) / FAILED
 *  reaper    ──► every loop: RUNNING rows whose lockedAt is older than WORKER_STALE_LOCK_MINUTES (crashed runner) go
 *                back to PENDING (attempts already counted) or FAILED when attempts >= maxAttempts
 *  shutdown  ──► SIGINT/SIGTERM: stop claiming, wait for in-flight jobs (≤ 30 s), disconnect
 *
 * Cross-tenant polling needs the owner connection (platformPrisma) — the only place outside seeds/tests/platform code
 * that uses it, and it never reads tenant *data*: only Job rows by (status, runAt), which carry tenantId.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { platformPrisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { processorFor } from "@/lib/jobs/registry";

export type ClaimedJob = { id: string; tenantId: string; type: string };

export const WORKER_ID = `${hostname()}#${process.pid}#${randomUUID().slice(0, 8)}`;

/**
 * Reserve a batch for this worker: PENDING rows with no reservation get `lockedBy = workerId` (status untouched).
 * `FOR UPDATE SKIP LOCKED` keeps concurrent workers disjoint. The processor then performs the real
 * PENDING → RUNNING flip with its conditional updateMany — the same lock every runner (worker or inline) uses, so a
 * row can never be executed twice even when both runners see it.
 */
export async function claimJobs(limit: number, workerId = WORKER_ID): Promise<ClaimedJob[]> {
  // Reserve rows: only unreserved PENDING jobs whose runAt has passed. SKIP LOCKED makes concurrent workers disjoint.
  const rows = await platformPrisma.$queryRaw<ClaimedJob[]>`
    WITH picked AS (
      SELECT id FROM "Job"
      WHERE status = 'PENDING' AND "runAt" <= now() AND "lockedBy" IS NULL
      ORDER BY "runAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "Job" j SET "lockedBy" = ${workerId}, "lockedAt" = now(), "updatedAt" = now()
    FROM picked WHERE j.id = picked.id
    RETURNING j.id, j."tenantId", j.type
  `;
  return rows;
}

/** Give crashed runners' jobs back to the queue (or fail them when out of attempts). */
export async function reapStaleLocks(staleMinutes = env.WORKER_STALE_LOCK_MINUTES): Promise<number> {
  const cutoff = new Date(Date.now() - staleMinutes * 60_000);
  const requeued = await platformPrisma.job.updateMany({
    where: { status: "RUNNING", lockedAt: { lt: cutoff } },
    data: { status: "PENDING", lockedAt: null, lockedBy: null, error: "requeued: stale lock" },
  });
  // Reservations (lockedBy set, still PENDING) that never started — e.g. worker died between claim and dispatch.
  const released = await platformPrisma.job.updateMany({
    where: { status: "PENDING", lockedBy: { not: null }, lockedAt: { lt: cutoff } },
    data: { lockedAt: null, lockedBy: null },
  });
  const exhausted = await platformPrisma.job.updateMany({
    where: { status: "PENDING", attempts: { gte: platformPrisma.job.fields.maxAttempts } },
    data: { status: "FAILED", finishedAt: new Date(), error: "failed: attempts exhausted" },
  });
  const n = requeued.count + released.count + exhausted.count;
  if (n)
    logger.warn(
      { requeued: requeued.count, released: released.count, exhausted: exhausted.count },
      "worker.reaped",
    );
  return n;
}

/** Run one claimed job through its processor. Unknown types are FAILED immediately (never retried). */
export async function runClaimed(job: ClaimedJob, workerId = WORKER_ID): Promise<void> {
  const run = processorFor(job.type);
  if (!run) {
    await platformPrisma.job.update({
      where: { id: job.id },
      data: { status: "FAILED", finishedAt: new Date(), error: `no processor for type ${job.type}` },
    });
    logger.error({ jobId: job.id, type: job.type }, "worker.unknown_job_type");
    return;
  }
  const started = Date.now();
  try {
    await run(job.tenantId, job.id, workerId);
    logger.info(
      { jobId: job.id, type: job.type, tenantId: job.tenantId, ms: Date.now() - started },
      "worker.job_done",
    );
  } catch (err) {
    // Processors catch their own errors; this is the last resort (e.g. DB unreachable mid-run).
    logger.error(
      { jobId: job.id, type: job.type, err: err instanceof Error ? err.message : String(err) },
      "worker.job_crashed",
    );
  }
}

export type WorkerOptions = {
  pollMs?: number;
  concurrency?: number;
  workerId?: string;
  signal?: AbortSignal;
};

/** Main loop. Resolves when `signal` aborts and in-flight jobs have finished. */
export async function runWorker(opts: WorkerOptions = {}): Promise<void> {
  const pollMs = opts.pollMs ?? env.WORKER_POLL_MS;
  const concurrency = opts.concurrency ?? env.WORKER_CONCURRENCY;
  const workerId = opts.workerId ?? WORKER_ID;
  const inflight = new Set<Promise<void>>();
  logger.info({ workerId, pollMs, concurrency, mail: env.MAIL_TRANSPORT }, "worker.start");

  while (!opts.signal?.aborted) {
    try {
      await reapStaleLocks();
      const free = concurrency - inflight.size;
      if (free > 0) {
        const jobs = await claimJobs(free, workerId);
        for (const job of jobs) {
          const p = runClaimed(job, workerId).finally(() => inflight.delete(p));
          inflight.add(p);
        }
        if (jobs.length === free) continue; // queue not drained — poll again immediately
      }
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "worker.loop_error");
    }
    await sleep(pollMs, opts.signal);
  }
  logger.info({ workerId, inflight: inflight.size }, "worker.draining");
  await Promise.race([Promise.allSettled([...inflight]), sleep(30_000)]);
  logger.info({ workerId }, "worker.stopped");
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener("abort", done);
      clearTimeout(t);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

// ───────────────────────────── CLI entry ─────────────────────────────
const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("src/worker/index.ts");
if (isMain) {
  const ac = new AbortController();
  const stop = (sig: string) => {
    logger.info({ sig }, "worker.signal");
    ac.abort();
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
  runWorker({ signal: ac.signal })
    .then(() => platformPrisma.$disconnect())
    .then(() => process.exit(0))
    .catch((err) => {
      logger.fatal({ err }, "worker.fatal");
      process.exit(1);
    });
}
