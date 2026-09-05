/**
 * File visibility / ownership (FR-FIL-006 + FR-ENR-002 applied to files).
 *
 *  - `file.manage_all` → every file in the tenant (admins).
 *  - Otherwise a file is visible when the actor uploaded it, OR it is attached to an offering the actor teaches /
 *    is enrolled in, OR it is attached to a course that has such an offering (and to no specific offering).
 *  - Files attached to nothing are visible to their uploader only.
 *  - Mutations (`edit`/`delete`) additionally require ownership unless `file.manage_all`.
 *  - Students never see PENDING/REJECTED files unless they uploaded them (review flow arrives in P2, FR-FIL-009).
 *
 * RLS (`db(tenantId)`) is the outer fence; this is the inner one.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { hasPermission } from "@/lib/auth/has-permission";
import type { Ctx } from "@/lib/auth/rbac";
import { db, type TenantTx } from "@/lib/db/tenant";
import { offeringScopeWhere } from "@/features/offerings/scope";
import { AppError } from "@/lib/result";

export function isFileAdmin(ctx: Pick<Ctx, "user">): boolean {
  return hasPermission(ctx, "file.manage_all");
}

/** Prisma `where` fragment narrowing files to what the actor may see (empty for `file.manage_all`). */
export function fileScopeWhere(ctx: Ctx): Prisma.FileWhereInput {
  if (isFileAdmin(ctx)) return {};
  const scope = offeringScopeWhere(ctx);
  return {
    OR: [
      { uploaderId: ctx.user.id },
      {
        status: "APPROVED",
        OR: [
          { offering: { is: { deletedAt: null, ...scope } } },
          { offeringId: null, course: { is: { offerings: { some: { deletedAt: null, ...scope } } } } },
        ],
      },
    ],
  };
}

export type FileAccess = "OWNER" | "SCOPED" | "NONE";

/** Load a file and classify the actor's relationship to it. Throws NOT_FOUND when missing / out of scope. */
export async function loadFileInScope<S extends Prisma.FileSelect>(
  ctx: Ctx,
  id: string,
  select: S,
  opts: { includeDeleted?: boolean } = {},
  t?: TenantTx,
): Promise<{ file: Prisma.FileGetPayload<{ select: S }>; access: FileAccess }> {
  const client = t ?? db(ctx.tenantId);
  const file = await client.file.findFirst({
    where: {
      id,
      ...(opts.includeDeleted ? {} : { deletedAt: null }),
      ...fileScopeWhere(ctx),
    },
    select: { ...select, uploaderId: true },
  });
  if (!file) throw new AppError("NOT_FOUND", "الملف غير موجود");
  const access: FileAccess = isFileAdmin(ctx)
    ? "OWNER"
    : (file as { uploaderId: string }).uploaderId === ctx.user.id
      ? "OWNER"
      : "SCOPED";
  return { file: file as unknown as Prisma.FileGetPayload<{ select: S }>, access };
}

/** Mutations: owner or `file.manage_all`. */
export function assertFileOwner(access: FileAccess): void {
  if (access !== "OWNER") throw new AppError("FORBIDDEN", "يمكنك تعديل ملفاتك فقط");
}
