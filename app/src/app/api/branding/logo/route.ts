/**
 * POST /api/branding/logo — upload/replace the tenant logo (P1-10, FR-TEN-004). Gate: `settings.edit_branding`.
 *
 * Small file (≤ LOGO_MAX_BYTES) so it is read via `formData()` under a hard Content-Length + byte cap; the type is
 * decided by magic bytes (`file-type`), never the client-declared MIME. SVG is accepted only after a strict scan
 * (no <script>, no on* handlers, no foreignObject/external refs) — a logo is rendered on the login page for
 * anonymous users, so it must be inert. The object is written through the storage adapter under
 * `<tenantId>/branding/<uuid>.<ext>`; the public URL is versioned so caches are busted on replace.
 */
import { NextResponse, type NextRequest } from "next/server";
import { Readable } from "node:stream";
import { fileTypeFromBuffer } from "file-type";
import { audit } from "@/lib/audit";
import { hasPermission } from "@/lib/auth/has-permission";
import { loadCtx } from "@/lib/auth/rbac";
import { invalidateTenantCache } from "@/lib/auth/tenant-resolver";
import { tx } from "@/lib/db/tenant";
import { rateLimit } from "@/lib/ratelimit";
import { failure, success, type ErrorCode } from "@/lib/result";
import { storage } from "@/lib/storage";
import { LOGO_MAX_BYTES, LOGO_MIME } from "@/features/settings/schemas";
import { svgIsInert } from "@/lib/svg-safe";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const json = (code: ErrorCode, message: string, status: number) =>
  NextResponse.json(failure(code, message), { status });

const EXT: Record<(typeof LOGO_MIME)[number], string> = {
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "image/jpeg": "jpg",
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await loadCtx();
  if (!auth.ok) return json("UNAUTHENTICATED", "يجب تسجيل الدخول", 401);
  const ctx = auth.ctx;
  if (!hasPermission(ctx, "settings.view", "settings.edit_branding"))
    return json("FORBIDDEN", "لا تملك صلاحية تعديل العلامة التجارية", 403);
  if (!rateLimit(`logo:${ctx.user.id}`, 10, 60_000).ok)
    return json("RATE_LIMITED", "محاولات كثيرة، حاول لاحقًا", 429);

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > LOGO_MAX_BYTES * 2) return json("VALIDATION", "الملف أكبر من الحد المسموح", 413);

  let file: File | null = null;
  try {
    const fd = await req.formData();
    const f = fd.get("logo");
    file = f instanceof File ? f : null;
  } catch {
    return json("VALIDATION", "الطلب يجب أن يكون multipart/form-data", 400);
  }
  if (!file || file.size === 0) return json("VALIDATION", "لم يُرفق ملف", 400);
  if (file.size > LOGO_MAX_BYTES) return json("VALIDATION", "الشعار يجب أن يكون أصغر من 512 كيلوبايت", 413);

  const buf = Buffer.from(await file.arrayBuffer());
  let mime: (typeof LOGO_MIME)[number] | null = null;
  const sniffed = await fileTypeFromBuffer(buf);
  if (sniffed && (LOGO_MIME as readonly string[]).includes(sniffed.mime))
    mime = sniffed.mime as (typeof LOGO_MIME)[number];
  else if (!sniffed) {
    // file-type does not detect SVG (text). Accept only if it parses as an inert SVG document.
    const text = buf.toString("utf8");
    if (svgIsInert(text)) mime = "image/svg+xml";
  }
  if (!mime) return json("VALIDATION", "نوع الملف غير مدعوم أو غير آمن (PNG/SVG/WebP/JPEG)", 415);

  const ext = EXT[mime];
  const key = `${ctx.tenantId}/branding/${crypto.randomUUID()}.${ext}`;
  await storage().put(key, Readable.from(buf), { contentType: mime, maxBytes: LOGO_MAX_BYTES });

  const version = Date.now().toString(36);
  const url = `/api/branding/logo/${ctx.tenantId}/${version}`;
  let oldKey: string | null = null;
  try {
    await tx(ctx.tenantId, async (t) => {
      const prev = await t.tenantBranding.findUnique({
        where: { tenantId: ctx.tenantId },
        select: { logoUrl: true, logoStorageKey: true },
      });
      oldKey = prev?.logoStorageKey ?? null;
      await t.tenantBranding.upsert({
        where: { tenantId: ctx.tenantId },
        create: { tenantId: ctx.tenantId, logoUrl: url, faviconUrl: url, logoStorageKey: key },
        update: { logoUrl: url, faviconUrl: url, logoStorageKey: key },
      });
      await audit(
        ctx,
        {
          action: "settings.upload_logo",
          entity: "TenantBranding",
          entityId: ctx.tenantId,
          before: { logoUrl: prev?.logoUrl ?? null },
          after: { logoUrl: url, mime, size: buf.length },
        },
        t,
      );
    });
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
  invalidateTenantCache();
  revalidatePath("/", "layout");
  revalidatePath("/settings/branding");
  return NextResponse.json(success({ logoUrl: url }), { headers: { "cache-control": "no-store" } });
}
