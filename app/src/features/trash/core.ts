/**
 * Trash — shared server logic (not a "use server" file): bulk restore / purge over the registry and the
 * `trash.purge` retention job (FR-SYS-001).
 *
 * `purgeExpired` follows the `processFanoutJob` pattern: lock the Job row (PENDING → RUNNING), work in its own
 * transaction, record `{purged: {kind: n}}`, release on failure with attempts/maxAttempts semantics. Kinds are
 * purged leaves-first (`PURGE_ORDER`) so a parent is never blocked by a child that would have been purged in the
 * same run. Storage objects of purged files are removed AFTER the commit (an orphaned object is logged, never a
 * user-visible failure). The audit row for automatic purges has `actorId = null` (system).
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import type { PermissionCtx } from "@/lib/auth/has-permission";
import { db, tx, type TenantTx } from "@/lib/db/tenant";
import { logger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import { PURGE_ORDER, TRASH_REGISTRY, type PurgeOutcome } from "./registry";
import { TRASH_KINDS, purgeCutoff, type TrashKind } from "./schemas";

/** Max rows per kind per job run — keeps a single transaction short; the next run picks up the rest. */
export const PURGE_BATCH = 500;

export type PurgeSummary = Record<TrashKind, number>;

const emptySummary = (): PurgeSummary => Object.fromEntries(TRASH_KINDS.map((k) => [k, 0])) as PurgeSummary;

/** Delete storage objects best-effort after the DB commit. */
export async function removeObjects(keys: string[]): Promise<void> {
  if (!keys.length) return;
  const s = storage();
  const results = await Promise.allSettled(keys.map((k) => s.delete(k)));
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed) logger.warn({ failed, total: keys.length }, "trash: some storage objects could not be removed");
}

/** Purge the given trashed ids of one kind inside `t`; returns the outcome (caller handles storage + audit). */
export async function purgeKind(t: TenantTx, kind: TrashKind, ids: string[]): Promise<PurgeOutcome> {
  if (!ids.length) return { purged: [], blocked: [], storageKeys: [] };
  return TRASH_REGISTRY[kind].purge(t, ids);
}

/** Ids of rows of `kind` trashed on or before the cutoff (bounded by PURGE_BATCH). */
export async function purgeCandidates(t: TenantTx, kind: TrashKind, cutoff: Date): Promise<string[]> {
  return TRASH_REGISTRY[kind].expired(t, cutoff, PURGE_BATCH);
}

/** Restore one row through the registry; returns the audit `after` payload. */
export async function restoreOne(
  ctx: PermissionCtx,
  t: TenantTx,
  kind: TrashKind,
  id: string,
): Promise<Record<string, unknown>> {
  return TRASH_REGISTRY[kind].restore(ctx, t, id);
}

/**
 * Execute a queued `trash.purge` job for one tenant. Safe to call again after a crash (attempts < maxAttempts).
 * Returns the per-kind counts (all zero when the job was not ours to run).
 */
export async function purgeExpired(
  tenantId: string,
  jobId: string,
  workerId = "inline",
): Promise<PurgeSummary> {
  const client = db(tenantId);
  const locked = await client.job.updateMany({
    where: { id: jobId, status: "PENDING", type: "trash.purge" },
    data: {
      status: "RUNNING",
      lockedAt: new Date(),
      lockedBy: workerId,
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  });
  const summary = emptySummary();
  if (locked.count === 0) return summary;
  const job = await client.job.findFirst({
    where: { id: jobId },
    select: { payload: true, attempts: true, maxAttempts: true },
  });
  if (!job) return summary;
  const payload = job.payload as { olderThanDays?: number };
  const olderThanDays = payload.olderThanDays ?? 30;
  const cutoff = purgeCutoff(new Date(), olderThanDays);

  try {
    const keys = await tx(tenantId, async (t) => {
      const storageKeys: string[] = [];
      for (const kind of PURGE_ORDER) {
        const ids = await purgeCandidates(t, kind, cutoff);
        if (!ids.length) continue;
        const out = await purgeKind(t, kind, ids);
        summary[kind] = out.purged.length;
        storageKeys.push(...out.storageKeys);
        if (out.purged.length)
          await t.auditLog.create({
            data: {
              tenantId,
              actorId: null,
              action: "trash.purge_auto",
              entity: TRASH_REGISTRY[kind].entity,
              entityId: null,
              after: {
                kind,
                purged: out.purged.length,
                blocked: out.blocked.length,
                olderThanDays,
                jobId,
              } as Prisma.InputJsonObject,
            },
          });
      }
      return storageKeys;
    });
    await removeObjects(keys);
    await client.job.update({
      where: { id: jobId },
      data: {
        status: "SUCCEEDED",
        finishedAt: new Date(),
        result: { purged: summary } as Prisma.InputJsonObject,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ jobId, tenantId, err: message }, "trash.purge failed");
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
  return summary;
}
