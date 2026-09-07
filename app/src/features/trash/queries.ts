/**
 * Trash — read side (RSC). Gate with `trash.view`. Every kind is listed through its registry handler inside one
 * tenant transaction so the count and the page come from the same snapshot.
 */
import "server-only";
import type { Ctx } from "@/lib/auth/rbac";
import { tx } from "@/lib/db/tenant";
import { paginate, type Page } from "@/lib/result";
import { TRASH_REGISTRY, type TrashRow } from "./registry";
import { TRASH_KINDS, type TrashKind, type TrashQuery } from "./schemas";

export type { TrashRow } from "./registry";

export async function listTrash(ctx: Ctx, q: TrashQuery): Promise<Page<TrashRow>> {
  const h = TRASH_REGISTRY[q.kind];
  const skip = (q.page - 1) * q.pageSize;
  const [items, total] = await tx(ctx.tenantId, (t) =>
    Promise.all([h.list(t, q.q, skip, q.pageSize), h.count(t, q.q)]),
  );
  return paginate(items, total, q.page, q.pageSize);
}

/** Per-tab badge counts (unfiltered — the badge says how much is in the bin, not how much matches the search). */
export async function trashCounts(ctx: Ctx): Promise<Record<TrashKind, number>> {
  const counts = await tx(ctx.tenantId, (t) =>
    Promise.all(TRASH_KINDS.map((k) => TRASH_REGISTRY[k].count(t, ""))),
  );
  return Object.fromEntries(TRASH_KINDS.map((k, i) => [k, counts[i]])) as Record<TrashKind, number>;
}

export function totalTrashed(counts: Record<TrashKind, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}
