/**
 * Inline fallback for job execution from a request (ADR-0010 §3). When `JOBS_INLINE=true` (default — dev, preview,
 * single-node deployments without a worker) the job is run right after the response via `after()`. With a worker
 * (`JOBS_INLINE=false`) requests only enqueue and the worker picks the row up within its poll interval.
 * Both paths use the same processor and the same conditional lock, so running both at once is safe.
 */
import { after } from "next/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { JobType } from "@/lib/contracts/json-columns";
import { processorFor } from "./registry";

export function kickJob(tenantId: string, jobId: string, type: JobType): void {
  if (!env.JOBS_INLINE) return;
  const run = processorFor(type);
  if (!run) {
    logger.warn({ tenantId, jobId, type }, "jobs.no_inline_processor");
    return;
  }
  after(() => run(tenantId, jobId, "inline"));
}
