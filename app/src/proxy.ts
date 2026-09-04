/**
 * Next.js 16 proxy (formerly middleware) — docs/30-architecture/01-MULTI-TENANCY.md §4, 03-AUTH-RBAC.md §1.
 *
 * Runs on the Node runtime (Prisma is used for tenant lookup). Responsibilities:
 *  1. Resolve tenant from Host → set `x-tenant-id`, `x-tenant-slug`, `x-locale`; unknown → /tenant-not-found; suspended → /tenant-suspended
 *  2. Correlation id `x-request-id` on every request
 *  3. Rate-limit POSTs to /login and /api/auth (20 / min / IP)
 *  4. Auth gate for protected routes: no JWT → /login?next=…; JWT tenant ≠ host tenant → clear cookie + /login?reason=tenant_mismatch
 *  5. Per-request CSP nonce (`x-nonce`) with strict-dynamic
 */
import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { resolveTenant } from "@/lib/auth/tenant-resolver";
import { rateLimit } from "@/lib/ratelimit";
import { env } from "@/lib/env";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|fonts/|manifest.webmanifest|robots.txt).*)"],
};

const PUBLIC_PATHS = new Set(["/login", "/developer", "/tenant-not-found", "/tenant-suspended", "/unauthorized", "/api/health"]);
const TENANT_FREE_PATHS = new Set(["/tenant-not-found", "/tenant-suspended", "/developer", "/api/health"]);
const SESSION_COOKIE = "scam.session";

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  return false;
}

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
}

function buildCsp(nonce: string): string {
  const dev = env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'" + (dev ? " ws: wss:" : ""),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export default async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  const nonce = randomBytes(16).toString("base64");
  const ip = clientIp(req);

  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-request-id", requestId);
  reqHeaders.set("x-nonce", nonce);

  // 3. Login / auth rate limit
  if (req.method === "POST" && (pathname === "/login" || pathname.startsWith("/api/auth/"))) {
    const rl = rateLimit(`login:${ip}`, 20, 60_000);
    if (!rl.ok) {
      return new NextResponse(JSON.stringify({ ok: false, error: { code: "RATE_LIMITED" } }), {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": String(rl.retryAfterSec), "x-request-id": requestId },
      });
    }
  }

  // 1. Tenant resolution
  const host = req.headers.get("host");
  const tenant = TENANT_FREE_PATHS.has(pathname) ? null : await resolveTenant(host);
  if (!TENANT_FREE_PATHS.has(pathname)) {
    if (!tenant) {
      const url = req.nextUrl.clone();
      url.pathname = "/tenant-not-found";
      url.search = `?host=${encodeURIComponent(host ?? "")}`;
      return NextResponse.rewrite(url, { status: 404, request: { headers: reqHeaders } });
    }
    if (tenant.status !== "ACTIVE") {
      const url = req.nextUrl.clone();
      url.pathname = "/tenant-suspended";
      url.search = "";
      return NextResponse.rewrite(url, { status: 503, request: { headers: reqHeaders } });
    }
    reqHeaders.set("x-tenant-id", tenant.id);
    reqHeaders.set("x-tenant-slug", tenant.slug);
    reqHeaders.set("x-tenant-tz", tenant.timezone);
    if (!req.cookies.get("scam.locale")) reqHeaders.set("x-locale", tenant.locale);
  }

  // 4. Auth gate
  let clearSession = false;
  if (!isPublic(pathname) && !pathname.startsWith("/_next")) {
    const token = await getToken({ req, secret: env.AUTH_SECRET, cookieName: SESSION_COOKIE, salt: SESSION_COOKIE });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    if (!token?.sid) {
      url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
      return NextResponse.redirect(url, { headers: { "x-request-id": requestId } });
    }
    if (tenant && token.tid !== tenant.id) {
      url.search = "?reason=tenant_mismatch";
      const res = NextResponse.redirect(url, { headers: { "x-request-id": requestId } });
      res.cookies.delete(SESSION_COOKIE);
      return res;
    }
  } else if (pathname === "/login") {
    // Already signed in for this tenant → straight to the dashboard.
    const token = await getToken({ req, secret: env.AUTH_SECRET, cookieName: SESSION_COOKIE, salt: SESSION_COOKIE });
    if (token?.sid && tenant && token.tid === tenant.id) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      url.search = "";
      return NextResponse.redirect(url);
    }
    if (token?.sid && tenant && token.tid !== tenant.id) clearSession = true;
  }

  const res = NextResponse.next({ request: { headers: reqHeaders } });
  res.headers.set("x-request-id", requestId);
  res.headers.set("Content-Security-Policy", buildCsp(nonce));
  if (clearSession) res.cookies.delete(SESSION_COOKIE);
  return res;
}
