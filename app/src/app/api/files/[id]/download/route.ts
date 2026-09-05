/**
 * GET /api/files/:id/download?exp&uid&sig — signed, session-bound download (FR-FIL-005, FR-FIL-007).
 *
 * Checks, in order: session (401) → signature bound to this user + expiry (403/410) → `file.download`
 * permission (403) → file in scope and not trashed (404) → stream from storage. Every successful download is
 * logged (FileDownloadLog) and the counter is incremented, in one transaction, before the body is streamed.
 * Response is `attachment` with an RFC 5987 UTF-8 filename, `no-store`, and never inline (no HTML/SVG rendering).
 */
import { NextResponse, type NextRequest } from "next/server";
import { Readable } from "node:stream";
import { hasPermission } from "@/lib/auth/has-permission";
import { loadCtx } from "@/lib/auth/rbac";
import { tx } from "@/lib/db/tenant";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError, failure, type ErrorCode } from "@/lib/result";
import { storage } from "@/lib/storage";
import { verifyDownload } from "@/lib/storage/signed-url";
import { loadFileInScope } from "@/features/files/scope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(code: ErrorCode, message: string, status: number) {
  return NextResponse.json(failure(code, message), { status });
}

/** `attachment; filename="ascii"; filename*=UTF-8''pct-encoded` */
function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const auth = await loadCtx();
  if (!auth.ok) return json("UNAUTHENTICATED", "يجب تسجيل الدخول", 401);
  const ctx = auth.ctx;

  const sp = req.nextUrl.searchParams;
  const verdict = verifyDownload(
    env.AUTH_SECRET,
    id,
    { exp: sp.get("exp"), uid: sp.get("uid"), sig: sp.get("sig") },
    ctx.user.id,
  );
  if (verdict === "EXPIRED") return json("FORBIDDEN", "انتهت صلاحية رابط التنزيل، أعد المحاولة", 410);
  if (verdict !== "OK") return json("FORBIDDEN", "رابط التنزيل غير صالح", 403);
  if (!hasPermission(ctx, "file.download")) return json("FORBIDDEN", "لا تملك صلاحية التنزيل", 403);

  try {
    const file = await tx(ctx.tenantId, async (t) => {
      const { file } = await loadFileInScope(
        ctx,
        id,
        { id: true, name: true, mimeType: true, size: true, storageKey: true },
        {},
        t,
      );
      const ip =
        req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      await t.fileDownloadLog.create({
        data: {
          tenantId: ctx.tenantId,
          fileId: file.id,
          userId: ctx.user.id,
          ip,
          userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
        },
      });
      await t.file.update({ where: { id: file.id }, data: { downloads: { increment: 1 } } });
      return file;
    });

    const obj = await storage().get(file.storageKey);
    const body = Readable.toWeb(obj.body) as unknown as ReadableStream<Uint8Array>;
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": file.mimeType,
        "content-length": String(obj.size),
        "content-disposition": contentDisposition(file.name),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof AppError) {
      const status = err.code === "NOT_FOUND" ? 404 : err.code === "FORBIDDEN" ? 403 : 400;
      return json(err.code, err.message, status);
    }
    logger.error({ err, fileId: id }, "files.download.unexpected");
    return json("INTERNAL", "حدث خطأ غير متوقع، حاول لاحقاً", 500);
  }
}
