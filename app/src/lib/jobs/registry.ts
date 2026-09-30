/**
 * Job processors — ONE table for every `Job.type` (ADR-0010). The worker and the inline fallback both dispatch
 * through this map, so a job behaves identically whichever runner picks it up. Every processor:
 *   - locks the row itself (PENDING → RUNNING via a conditional updateMany, so two runners can never both win),
 *   - runs the tenant work inside `tx(tenantId)` (RLS GUC set),
 *   - records SUCCEEDED / PENDING-for-retry / FAILED with attempts and error.
 * vitest-loadable (no next/* imports).
 */
import type { JobType } from "@/lib/contracts/json-columns";
import { processMailJob } from "@/features/auth/core";
import { processFanoutJob } from "@/features/notifications/core";
import { purgeExpired } from "@/features/trash/core";

export type JobProcessor = (tenantId: string, jobId: string, workerId: string) => Promise<unknown>;

export const JOB_PROCESSORS: Partial<Record<JobType, JobProcessor>> = {
  "mail.send": processMailJob,
  "notification.fanout": processFanoutJob,
  "trash.purge": purgeExpired,
  // "enrollment.import" → P2-06 (SIS import); "export.tenant" → P3-07.
};

export function processorFor(type: string): JobProcessor | null {
  return (JOB_PROCESSORS as Record<string, JobProcessor | undefined>)[type] ?? null;
}
