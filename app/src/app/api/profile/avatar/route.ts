/**
 * POST /api/profile/avatar — upload/replace the signed-in user's avatar (P1-14, FR-USR-011).
 * multipart `avatar`, ≤ AVATAR_MAX_BYTES, type by magic bytes (PNG/WebP/JPEG only — never SVG for user images),
 * stored under `<tenantId>/avatars/<uuid>.<ext>` via lib/storage, persisted inside a tx with audit, old object deleted.
 */
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { Readable } from "node:stream";
import { fileTypeFromBuffer } from "file-type";
import { loadCtx } from "@/lib/auth/rbac";
import { tx } from "@/lib/db/tenant";
import { rateLimit } from "@/lib/ratelimit";
import { failure, success, type ErrorCode } from "@/lib/result";
import { storage } from "@/lib/storage";
import { applyAvatar } from "@/features/profile/core";
import { AVATAR_EXT, AVATAR_MAX_BYTES, AVATAR_MIME } from "@/features/profile/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const json = (code: ErrorCode, message: string, status: number) =>
  NextResponse.json(failure(code, message), { status });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await loadCtx();
  if (!auth.ok) return json("UNAUTHENTICATED", "يجب تسجيل الدخول", 401);
  const ctx = auth.ctx;
  if (ctx.user.passwordChangeRequired) return json("FORBIDDEN", "يجب تغيير كلمة المرور أولًا", 403);
  if (!rateLimit(`avatar:${ctx.user.id}`, 10, 60_000).ok)
    return json("RATE_LIMITED", "محاولات كثيرة، حاول لاحقًا", 429);

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > AVATAR_MAX_BYTES * 2) return json("VALIDATION", "الملف أكبر من الحد المسموح", 413);

  let file: File | null = null;
  try {
    const fd = await req.formData();
    const f = fd.get("avatar");
    file = f instanceof File ? f : null;
  } catch {
    return json("VALIDATION", "الطلب يجب أن يكون multipart/form-data", 400);
  }
  if (!file || file.size === 0) return json("VALIDATION", "لم يُرفق ملف", 400);
  if (file.size > AVATAR_MAX_BYTES) return json("VALIDATION", "الصورة يجب أن تكون أصغر من 512 كيلوبايت", 413);

  const buf = Buffer.from(await file.arrayBuffer());
  const sniffed = await fileTypeFromBuffer(buf);
  const mime =
    sniffed && (AVATAR_MIME as readonly string[]).includes(sniffed.mime)
      ? (sniffed.mime as (typeof AVATAR_MIME)[number])
      : null;
  if (!mime) return json("VALIDATION", "نوع الصورة غير مدعوم (PNG/WebP/JPEG)", 415);

  const key = `${ctx.tenantId}/avatars/${crypto.randomUUID()}.${AVATAR_EXT[mime]}`;
  await storage().put(key, Readable.from(buf), { contentType: mime, maxBytes: AVATAR_MAX_BYTES });
  const url = `/api/profile/avatar/${ctx.tenantId}/${ctx.user.id}/${Date.now().toString(36)}`;

  let oldKey: string | null = null;
  try {
    oldKey = await tx(ctx.tenantId, (t) => applyAvatar(ctx, t, { key, url, mime, size: buf.length }));
  } catch (err) {
    await storage()
      .delete(key)
      .catch(() => undefined);
    throw err;
  }
  if (oldKey && oldKey !== key)
    await storage()
      .delete(oldKey)
      .catch(() => undefined);
  revalidatePath("/", "layout");
  return NextResponse.json(success({ avatarUrl: url }), { headers: { "cache-control": "no-store" } });
}
