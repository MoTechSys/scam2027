/**
 * Trash — Zod schemas (FR-SYS-001, P1-08).
 *
 * One unified bin for every soft-deletable entity (`deletedAt`). Academic catalogue rows (College/Department/
 * Major/Level) use `isActive` + dependency-guarded hard delete and are therefore NOT trash kinds.
 */
import { z } from "zod";

export const TRASH_KINDS = ["USER", "ROLE", "COURSE", "OFFERING", "FILE", "NOTIFICATION"] as const;
export type TrashKind = (typeof TRASH_KINDS)[number];

/** Rows older than this (since `deletedAt`) are purged automatically by the `trash.purge` job. */
export const TRASH_RETENTION_DAYS = 30;

const uuid = z.string().uuid();

export const trashQuerySchema = z.object({
  kind: z.enum(TRASH_KINDS).optional().default("USER"),
  q: z.string().trim().max(80).optional().default(""),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(5).max(100).optional().default(20),
});
export type TrashQuery = z.infer<typeof trashQuerySchema>;

/** Bulk restore / purge — bounded so one action can never lock the table for long. */
export const trashItemsSchema = z
  .object({ kind: z.enum(TRASH_KINDS), ids: z.array(uuid).min(1).max(200) })
  .strict();
export type TrashItemsInput = z.infer<typeof trashItemsSchema>;

/** Empty one tab (kind) or the whole bin (kind omitted). */
export const emptyTrashSchema = z.object({ kind: z.enum(TRASH_KINDS).optional() }).strict();

export const schedulePurgeSchema = z
  .object({ olderThanDays: z.coerce.number().int().min(1).max(365).optional().default(TRASH_RETENTION_DAYS) })
  .strict();

/** Date after which a trashed row becomes eligible for automatic purge. */
export function purgeAfter(deletedAt: Date, retentionDays = TRASH_RETENTION_DAYS): Date {
  return new Date(deletedAt.getTime() + retentionDays * 86_400_000);
}

/** Cut-off for `purgeCandidates`: rows with `deletedAt <= cutoff` are expired. */
export function purgeCutoff(now: Date, olderThanDays: number): Date {
  return new Date(now.getTime() - olderThanDays * 86_400_000);
}
