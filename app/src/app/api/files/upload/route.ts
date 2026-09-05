/**
 * POST /api/files/upload — multipart streaming upload (FR-FIL-001, 002, 004, 011).
 *
 * Fields (in this order — metadata BEFORE the file part so it is known when the stream starts):
 *   category, classification, courseId?, offeringId?, description?, file (exactly one)
 *
 * Pipeline: busboy → peek first 4 KB → magic-bytes sniff (file-type) + extension allow-list → storage.put()
 * (meters bytes, aborts past the cap) → DB row inside tx → audit. Any failure removes the stored object.
 * Limits: per-file cap = min(MAX_UPLOAD_BYTES, subscription), tenant quota = Subscription.maxStorageGB.
 * Auth: session cookie (same as pages) — requireUser semantics without redirect; 401/403 JSON otherwise.
 */
import Busboy from "busboy";
import { fileTypeFromBuffer } from "file-type";
import { NextResponse, type NextRequest } from "next/server";
import { PassThrough, Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { audit } from "@/lib/audit";
import { hasPermission } from "@/lib/auth/has-permission";
import { loadCtx } from "@/lib/auth/rbac";
import { db, tx } from "@/lib/db/tenant";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/ratelimit";
import { AppError, failure, success, type ErrorCode } from "@/lib/result";
import { storage, StorageLimitError } from "@/lib/storage";
import { buildStorageKey, sanitizeDisplayName, validateUpload } from "@/lib/storage/validate";
import { resolveAttachment } from "@/features/files/core";
import { uploadMetaSchema } from "@/features/files/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SNIFF_BYTES = 4100;

function json(code: ErrorCode, message: string, status: number, fieldErrors?: Record<string, string[]>) {
  return NextResponse.json(failure(code, message, fieldErrors), { status });
}

/** Buffer the first `n` bytes for sniffing, then re-emit everything (peeked bytes + rest) downstream. */
async function peek(src: Readable, n: number): Promise<{ head: Buffer; stream: Readable }> {
  const chunks: Buffer[] = [];
  let got = 0;
  const out = new PassThrough();
  return new Promise((resolve, reject) => {
    let resolved = false;
    const flush = () => {
      if (resolved) return;
      resolved = true;
      const head = Buffer.concat(chunks);
      for (const c of chunks) out.write(c);
      src.pipe(out);
      resolve({ head, stream: out });
    };
    src.on("data", (chunk: Buffer) => {
      if (resolved) return;
      chunks.push(chunk);
      got += chunk.length;
      if (got >= n) {
        src.pause();
        src.removeAllListeners("data");
        flush();
        src.resume();
      }
    });
    src.once("end", () => {
      if (!resolved) {
        resolved = true;
        const head = Buffer.concat(chunks);
        for (const c of chunks) out.write(c);
        out.end();
        resolve({ head, stream: out });
      }
    });
    src.once("error", reject);
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await loadCtx();
  if (!auth.ok) return json("UNAUTHENTICATED", "يجب تسجيل الدخول", 401);
  const ctx = auth.ctx;
  if (!hasPermission(ctx, "file.upload")) return json("FORBIDDEN", "لا تملك صلاحية الرفع", 403);

  const rl = rateLimit(`upload:${ctx.user.id}`, 60, 60_000);
  if (!rl.ok) return json("RATE_LIMITED", "محاولات كثيرة، حاول لاحقًا", 429);

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data") || !req.body)
    return json("VALIDATION", "الطلب يجب أن يكون multipart/form-data", 400);

  // Per-file cap and tenant quota.
  const prisma = db(ctx.tenantId);
  const [sub, agg] = await Promise.all([
    prisma.subscription.findUnique({ where: { tenantId: ctx.tenantId }, select: { maxStorageGB: true } }),
    prisma.file.aggregate({ where: { deletedAt: null }, _sum: { size: true } }),
  ]);
  const quotaBytes = (sub?.maxStorageGB ?? 20) * 1024 ** 3;
  const usedBytes = agg._sum.size ?? 0;
  const maxBytes = Math.min(env.MAX_UPLOAD_BYTES, Math.max(0, quotaBytes - usedBytes));
  if (maxBytes <= 0)
    return json("CONFLICT", "تم استهلاك سعة التخزين المتاحة للجامعة", 409, { file: ["QUOTA"] });

  const fields: Record<string, string> = {};
  let storedKey: string | null = null;
  const s = storage();

  try {
    const result = await new Promise<{ id: string; name: string; size: number }>((resolve, reject) => {
      const bb = Busboy({
        headers: { "content-type": contentType },
        limits: { files: 1, fields: 10, fieldSize: 4 * 1024, fileSize: maxBytes + 1 },
      });
      let fileSeen = false;
      let settled = false;
      const fail = (e: unknown) => {
        if (settled) return;
        settled = true;
        reject(e);
      };

      bb.on("field", (name, value) => {
        fields[name] = value;
      });

      bb.on("file", (_name, fileStream, info) => {
        if (fileSeen) {
          fileStream.resume();
          return;
        }
        fileSeen = true;
        void (async () => {
          try {
            const meta = uploadMetaSchema.parse(fields);
            const originalName = sanitizeDisplayName(info.filename || "file");
            const { head, stream } = await peek(fileStream, SNIFF_BYTES);
            const sniffed = (await fileTypeFromBuffer(head))?.mime ?? null;
            // Size is validated by the meter; pass 1 here so only type/extension are checked up front.
            const v = validateUpload({
              originalName,
              size: head.length || 1,
              sniffedMime: sniffed,
              maxBytes,
            });
            if (!v.ok) {
              stream.resume();
              throw new AppError("VALIDATION", "نوع الملف غير مسموح أو محتواه لا يطابق امتداده", {
                file: [v.reason],
              });
            }
            // Attachment scope must be checked before we write bytes.
            const att = await tx(ctx.tenantId, (t) =>
              resolveAttachment(ctx, t, { courseId: meta.courseId, offeringId: meta.offeringId }),
            );
            const key = buildStorageKey(ctx.tenantId, att.courseId, v.ext);
            const put = await s.put(key, stream, { contentType: v.mimeType, maxBytes });
            storedKey = key;
            if (put.size === 0) throw new AppError("VALIDATION", "الملف فارغ", { file: ["EMPTY"] });

            const row = await tx(ctx.tenantId, async (t) => {
              const created = await t.file.create({
                data: {
                  tenantId: ctx.tenantId,
                  uploaderId: ctx.user.id,
                  courseId: att.courseId,
                  offeringId: att.offeringId,
                  name: originalName,
                  originalName,
                  storageKey: key,
                  mimeType: v.mimeType,
                  size: put.size,
                  checksum: put.checksum,
                  category: meta.category,
                  classification: meta.classification,
                  description: meta.description ? meta.description : null,
                  status: "APPROVED",
                },
                select: {
                  id: true,
                  name: true,
                  size: true,
                  category: true,
                  courseId: true,
                  offeringId: true,
                },
              });
              await audit(
                ctx,
                { action: "file.upload", entity: "File", entityId: created.id, after: created },
                t,
              );
              return created;
            });
            storedKey = null; // committed — do not clean up
            if (!settled) {
              settled = true;
              resolve({ id: row.id, name: row.name, size: row.size });
            }
          } catch (e) {
            fileStream.resume();
            fail(e);
          }
        })();
      });

      bb.on("error", fail);
      bb.on("finish", () => {
        if (!fileSeen) fail(new AppError("VALIDATION", "لم يُرسل أي ملف", { file: ["MISSING"] }));
      });

      Readable.fromWeb(req.body as unknown as NodeReadableStream).pipe(bb);
    });

    return NextResponse.json(success(result), { status: 201 });
  } catch (err) {
    if (storedKey) await s.delete(storedKey).catch(() => undefined);
    if (err instanceof StorageLimitError)
      return json("VALIDATION", "الملف أكبر من الحد المسموح", 413, { file: ["TOO_LARGE"] });
    if (err instanceof AppError) {
      const status =
        err.code === "FORBIDDEN" ? 403 : err.code === "NOT_FOUND" ? 404 : err.code === "CONFLICT" ? 409 : 400;
      return json(err.code, err.message, status, err.fieldErrors);
    }
    if (err && typeof err === "object" && "issues" in err) return json("VALIDATION", "بيانات غير صالحة", 400);
    logger.error({ err }, "files.upload.unexpected");
    return json("INTERNAL", "حدث خطأ غير متوقع، حاول لاحقاً", 500);
  }
}
