"use server";

/**
 * Trash — Server Actions (FR-SYS-001, P1-08). Every action:
 *  requireUserOrThrow → assertPermission → Zod .strict() → tx(tenantId) → audit → revalidatePath → Result<T>.
 *
 * Permissions: `trash.restore` to restore, `trash.permanent_delete` to purge / empty / schedule the retention job.
 * Restore additionally re-applies the owning module's guard through the registry (no privilege escalation via the bin).
 * Bulk actions are partial-success: rows that could not be processed are returned in `failed`/`blocked` with the
 * reason, everything else is committed. Purge is atomic per call (one tx), storage objects are removed after commit.
 */
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { audit } from "@/lib/audit";
import { assertPermission, requireUserOrThrow } from "@/lib/auth/rbac";
import { tx } from "@/lib/db/tenant";
import { AppError, type Result } from "@/lib/result";
import { safeAction } from "@/lib/safe-action";
import { purgeCandidates, purgeExpired, purgeKind, removeObjects, restoreOne } from "./core";
import { TRASH_REGISTRY } from "./registry";
import {
  emptyTrashSchema,
  schedulePurgeSchema,
  TRASH_KINDS,
  trashItemsSchema,
  type TrashKind,
} from "./schemas";

function revalidateTrash(kind: TrashKind, ids: string[]) {
  revalidatePath("/trash");
  revalidatePath("/dashboard");
  const paths = new Set<string>();
  for (const id of ids) for (const p of TRASH_REGISTRY[kind].paths(id)) paths.add(p);
  for (const p of paths) revalidatePath(p);
}

export type RestoreResult = { restored: number; failed: { id: string; message: string }[] };

export async function restoreItemsAction(input: unknown): Promise<Result<RestoreResult>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "trash.restore");
      const { kind, ids } = trashItemsSchema.parse(input);
      const failed: RestoreResult["failed"] = [];
      const restored: string[] = [];
      // One tx per row: a guard failure on one item must not roll back the others (partial success by design).
      for (const id of ids) {
        try {
          await tx(ctx.tenantId, async (t) => {
            const after_ = await restoreOne(ctx, t, kind, id);
            await audit(
              ctx,
              { action: "trash.restore", entity: TRASH_REGISTRY[kind].entity, entityId: id, after: after_ },
              t,
            );
          });
          restored.push(id);
        } catch (err) {
          failed.push({ id, message: err instanceof AppError ? err.message : "تعذّر الاسترجاع" });
        }
      }
      if (restored.length) revalidateTrash(kind, restored);
      if (!restored.length && failed.length === 1) throw new AppError("CONFLICT", failed[0]!.message);
      return { restored: restored.length, failed };
    },
    { action: "trash.restore" },
  );
}

export type PurgeResult = { purged: number; blocked: number };

async function purgeIds(
  ctx: Awaited<ReturnType<typeof requireUserOrThrow>>,
  kind: TrashKind,
  ids: string[],
): Promise<PurgeResult> {
  const out = await tx(ctx.tenantId, async (t) => {
    const o = await purgeKind(t, kind, ids);
    for (const id of o.purged)
      await audit(ctx, { action: "trash.purge", entity: TRASH_REGISTRY[kind].entity, entityId: id }, t);
    return o;
  });
  await removeObjects(out.storageKeys);
  if (out.purged.length) revalidateTrash(kind, out.purged);
  return { purged: out.purged.length, blocked: out.blocked.length };
}

/** Hard delete selected rows of one kind. Rows still referenced by live children are reported as `blocked`. */
export async function purgeItemsAction(input: unknown): Promise<Result<PurgeResult>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "trash.permanent_delete");
      const { kind, ids } = trashItemsSchema.parse(input);
      const r = await purgeIds(ctx, kind, ids);
      if (!r.purged && r.blocked)
        throw new AppError(
          "CONFLICT",
          "لا يمكن الحذف النهائي: عناصر أخرى ما زالت مرتبطة بهذه السجلات (شُعب/ملفات). احذفها أولًا",
        );
      return r;
    },
    { action: "trash.purge" },
  );
}

/** Empty one tab (or the whole bin) in retention order — batches of 500 per kind, repeated until nothing is left. */
export async function emptyTrashAction(input: unknown): Promise<Result<Record<TrashKind, PurgeResult>>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "trash.permanent_delete");
      const { kind } = emptyTrashSchema.parse(input);
      const kinds: TrashKind[] = kind
        ? [kind]
        : ["FILE", "NOTIFICATION", "OFFERING", "COURSE", "ROLE", "USER"];
      const result = Object.fromEntries(TRASH_KINDS.map((k) => [k, { purged: 0, blocked: 0 }])) as Record<
        TrashKind,
        PurgeResult
      >;
      const now = new Date();
      for (const k of kinds) {
        for (let guard = 0; guard < 50; guard++) {
          const ids = await tx(ctx.tenantId, (t) => purgeCandidates(t, k, now));
          if (!ids.length) break;
          const r = await purgeIds(ctx, k, ids);
          result[k].purged += r.purged;
          result[k].blocked += r.blocked;
          if (!r.purged) break; // everything left is blocked → stop looping
        }
      }
      await audit(ctx, { action: "trash.empty", entity: "Trash", after: { kind: kind ?? "ALL", result } });
      revalidatePath("/trash");
      return result;
    },
    { action: "trash.empty" },
  );
}

/** Create a `trash.purge` Job and run it right away via `after()` (the P1-12 worker will also pick up PENDING jobs). */
export async function schedulePurgeJobAction(input: unknown): Promise<Result<{ jobId: string }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "trash.permanent_delete");
      const { olderThanDays } = schedulePurgeSchema.parse(input ?? {});
      const job = await tx(ctx.tenantId, async (t) => {
        const j = await t.job.create({
          data: {
            tenantId: ctx.tenantId,
            type: "trash.purge",
            payload: { olderThanDays },
            createdBy: ctx.user.id,
          },
          select: { id: true },
        });
        await audit(
          ctx,
          { action: "trash.schedule_purge", entity: "Job", entityId: j.id, after: { olderThanDays } },
          t,
        );
        return j;
      });
      // `/trash` is dynamic (RSC re-fetches on navigation) — no revalidate inside after() (not allowed there).
      after(() => purgeExpired(ctx.tenantId, job.id, "after"));
      return { jobId: job.id };
    },
    { action: "trash.schedule_purge" },
  );
}
