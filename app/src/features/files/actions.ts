"use server";

/**
 * Files — Server Actions (FR-FIL-003/004/005/006). Every action:
 *  requireUserOrThrow → assertPermission → scope check → tx(tenantId) → audit → revalidate.
 *
 * Upload itself is a Route Handler (streams), see app/api/files/upload/route.ts; it calls `registerUpload`.
 * Invariants
 *  - Course/offering attachment must be consistent (offering.courseId wins) and within the actor's scope.
 *  - Delete is soft (trash); `purge` (hard delete + object removal) needs `file.manage_all`.
 *  - Download links are HMAC-signed for the requesting user and expire after 5 minutes.
 */
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { assertPermission, requireUserOrThrow } from "@/lib/auth/rbac";
import { env } from "@/lib/env";
import { tx } from "@/lib/db/tenant";
import { AppError, type Result } from "@/lib/result";
import { safeAction } from "@/lib/safe-action";
import { storage } from "@/lib/storage";
import { signDownload } from "@/lib/storage/signed-url";
import { resolveAttachment } from "./core";
import { assertFileOwner, loadFileInScope } from "./scope";
import { idSchema, idsSchema, updateFileSchema } from "./schemas";

function revalidateFiles(courseId?: string | null, offeringId?: string | null) {
  revalidatePath("/files");
  if (courseId) revalidatePath(`/courses/${courseId}`);
  if (offeringId) revalidatePath(`/offerings/${offeringId}`);
  revalidatePath("/dashboard");
}

const orNull = (s: string | undefined | null) => (s ? s : null);

const fileSelect = {
  id: true,
  name: true,
  category: true,
  classification: true,
  courseId: true,
  offeringId: true,
  description: true,
  storageKey: true,
  size: true,
  deletedAt: true,
} as const;

export async function updateFileAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "file.edit");
      const data = updateFileSchema.parse(input);
      const updated = await tx(ctx.tenantId, async (t) => {
        const { file: before, access } = await loadFileInScope(ctx, data.id, fileSelect, {}, t);
        assertFileOwner(access);
        const att = await resolveAttachment(ctx, t, { courseId: data.courseId, offeringId: data.offeringId });
        const after = await t.file.update({
          where: { id: data.id },
          data: {
            name: data.name,
            category: data.category,
            classification: data.classification,
            courseId: att.courseId,
            offeringId: att.offeringId,
            description: orNull(data.description),
          },
          select: fileSelect,
        });
        await audit(ctx, { action: "file.update", entity: "File", entityId: after.id, before, after }, t);
        return { after, before };
      });
      revalidateFiles(updated.after.courseId, updated.after.offeringId);
      if (updated.before.courseId !== updated.after.courseId)
        revalidateFiles(updated.before.courseId, updated.before.offeringId);
      return { id: updated.after.id };
    },
    { action: "file.update" },
  );
}

export async function deleteFileAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "file.delete");
      const { id } = idSchema.parse(input);
      const f = await tx(ctx.tenantId, async (t) => {
        const { file, access } = await loadFileInScope(ctx, id, fileSelect, {}, t);
        assertFileOwner(access);
        const after = await t.file.update({
          where: { id },
          data: { deletedAt: new Date() },
          select: fileSelect,
        });
        await audit(ctx, { action: "file.delete", entity: "File", entityId: id, before: file, after }, t);
        return after;
      });
      revalidateFiles(f.courseId, f.offeringId);
      return { id };
    },
    { action: "file.delete" },
  );
}

export async function restoreFileAction(input: unknown): Promise<Result<{ id: string }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "file.delete");
      const { id } = idSchema.parse(input);
      const f = await tx(ctx.tenantId, async (t) => {
        const { file, access } = await loadFileInScope(ctx, id, fileSelect, { includeDeleted: true }, t);
        assertFileOwner(access);
        if (!file.deletedAt) throw new AppError("CONFLICT", "الملف ليس في سلة المحذوفات");
        const after = await t.file.update({ where: { id }, data: { deletedAt: null }, select: fileSelect });
        await audit(ctx, { action: "file.restore", entity: "File", entityId: id, before: file, after }, t);
        return after;
      });
      revalidateFiles(f.courseId, f.offeringId);
      return { id };
    },
    { action: "file.restore" },
  );
}

/** Hard delete (object + row). Admin-only; the row must already be in trash. */
export async function purgeFilesAction(input: unknown): Promise<Result<{ purged: number }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "file.manage_all");
      const { ids } = idsSchema.parse(input);
      const rows = await tx(ctx.tenantId, async (t) => {
        const files = await t.file.findMany({
          where: { id: { in: ids }, deletedAt: { not: null } },
          select: fileSelect,
        });
        if (!files.length) return files;
        await t.file.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
        for (const f of files)
          await audit(ctx, { action: "file.purge", entity: "File", entityId: f.id, before: f }, t);
        return files;
      });
      // Object removal after the DB commit; a failure here leaves an orphan object (logged, no user impact).
      const s = storage();
      await Promise.allSettled(rows.map((f) => s.delete(f.storageKey)));
      revalidateFiles();
      return { purged: rows.length };
    },
    { action: "file.purge" },
  );
}

/** Mint a 5-minute signed link for the current user (FR-FIL-005). Scope is re-checked by the Route Handler. */
export async function signedDownloadAction(input: unknown): Promise<Result<{ url: string; exp: number }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      assertPermission(ctx, "file.download");
      const { id } = idSchema.parse(input);
      await loadFileInScope(ctx, id, { id: true });
      const { path, exp } = signDownload(env.AUTH_SECRET, id, ctx.user.id);
      return { url: path, exp };
    },
    { action: "file.sign" },
  );
}
