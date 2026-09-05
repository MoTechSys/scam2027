/**
 * GET /api/notifications/unread-count — `{ count }` for the header bell (FR-NTF-003).
 * Session-bound, no caching; the client polls every 60 s and refetches on navigation.
 */
import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/auth/has-permission";
import { loadCtx } from "@/lib/auth/rbac";
import { failure, success } from "@/lib/result";
import { unreadCount } from "@/features/notifications/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const r = await loadCtx();
  if (!r.ok) return NextResponse.json(failure("UNAUTHENTICATED", "يجب تسجيل الدخول"), { status: 401 });
  if (!hasPermission(r.ctx, "notification.view"))
    return NextResponse.json(success({ count: 0 }), { headers: noStore });
  const count = await unreadCount(r.ctx);
  return NextResponse.json(success({ count }), { headers: noStore });
}

const noStore = { "cache-control": "private, no-store" };
