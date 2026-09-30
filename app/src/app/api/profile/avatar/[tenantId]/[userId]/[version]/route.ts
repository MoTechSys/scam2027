/**
 * GET /api/profile/avatar/[tenantId]/[userId]/[version] — serve a user's avatar (P1-14).
 * Requires a session of the SAME tenant (avatars are shown to colleagues inside the app, never publicly).
 * `version` is a cache buster only. Immutable cache + sandboxed CSP + nosniff, like the tenant logo route.
 */
import { NextResponse, type NextRequest } from "next/server";
import { loadCtx } from "@/lib/auth/rbac";
import { db } from "@/lib/db/tenant";
import { storage } from "@/lib/storage";
import { StorageNotFoundError } from "@/lib/storage/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIME: Record<string, string> = { png: "image/png", webp: "image/webp", jpg: "image/jpeg" };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tenantId: string; userId: string; version: string }> },
): Promise<Response> {
  const { tenantId, userId } = await params;
  if (!UUID.test(tenantId) || !UUID.test(userId)) return new NextResponse(null, { status: 404 });
  const auth = await loadCtx();
  if (!auth.ok) return new NextResponse(null, { status: 401 });
  if (auth.ctx.tenantId !== tenantId) return new NextResponse(null, { status: 404 });
  const p = await db(tenantId).userProfile.findUnique({
    where: { userId },
    select: { avatarStorageKey: true },
  });
  const key = p?.avatarStorageKey;
  if (!key || !key.startsWith(`${tenantId}/avatars/`)) return new NextResponse(null, { status: 404 });
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
        "cache-control": "private, max-age=31536000, immutable",
        "content-security-policy": "default-src 'none'; sandbox",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof StorageNotFoundError) return new NextResponse(null, { status: 404 });
    throw err;
  }
}
