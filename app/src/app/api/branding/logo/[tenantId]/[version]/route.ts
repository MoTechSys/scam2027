/**
 * GET /api/branding/logo/:tenantId/:version — public, cacheable tenant logo (rendered on /login for anonymous
 * visitors). Public by design: a logo is not tenant-confidential. The version segment is only a cache-buster;
 * the current object is always served. Non-image content can never be reached (only keys under
 * `<tenantId>/branding/` written by the upload route). Served `inline` with a strict CSP so an SVG cannot script.
 */
import { NextResponse, type NextRequest } from "next/server";
import { platformPrisma } from "@/lib/db/prisma";
import { storage } from "@/lib/storage";
import { StorageNotFoundError } from "@/lib/storage/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIME: Record<string, string> = {
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
  jpg: "image/jpeg",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tenantId: string; version: string }> },
): Promise<Response> {
  const { tenantId } = await params;
  if (!UUID.test(tenantId)) return new NextResponse(null, { status: 404 });
  // No session → no tenant GUC; TenantBranding is RLS-protected, so the owner client is required to read the key.
  // The only data exposed is the storage key of a public asset, guarded below by the `<tenantId>/branding/` prefix.
  const b = await platformPrisma.tenantBranding.findUnique({
    where: { tenantId },
    select: { logoStorageKey: true },
  });
  const key = b?.logoStorageKey;
  if (!key || !key.startsWith(`${tenantId}/branding/`)) return new NextResponse(null, { status: 404 });
  try {
    const obj = await storage().get(key);
    const ext = key.split(".").pop() ?? "";
    const chunks: Buffer[] = [];
    for await (const c of obj.body) chunks.push(Buffer.from(c));
    return new NextResponse(new Uint8Array(Buffer.concat(chunks)), {
      status: 200,
      headers: {
        "content-type": MIME[ext] ?? "application/octet-stream",
        "content-length": String(obj.size),
        "cache-control": "public, max-age=31536000, immutable",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof StorageNotFoundError) return new NextResponse(null, { status: 404 });
    throw err;
  }
}
