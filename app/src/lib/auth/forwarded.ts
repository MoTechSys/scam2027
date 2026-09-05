/**
 * Forwarded-header helpers — docs/30-architecture/03-AUTH-RBAC.md §1.4 (multi-tenant origins).
 *
 * Auth.js (`trustHost: true`) derives absolute redirect URLs from `x-forwarded-host` / `x-forwarded-proto`,
 * falling back to `host` + the socket protocol. Two real-world gaps break that in a multi-tenant deployment:
 *
 *  1. Reverse proxies / preview tunnels terminate TLS, speak plain HTTP to Next and some (e.g. the sandbox)
 *     send the scheme as `x-client-proto` instead of `x-forwarded-proto`.
 *  2. `next start` builds `request.url` for Route Handlers from the server's own `hostname:port`
 *     (`http://localhost:3000`), not from the `Host` header — so `/api/auth/*` would redirect to localhost.
 *
 * `AUTH_URL` must therefore stay UNSET (it would pin every tenant to one origin) and the origin is derived per
 * request from these headers. Pure functions — no next-auth import — so they are unit-testable.
 */

const PROTO_FALLBACKS = ["x-client-proto", "x-scheme", "cloudfront-forwarded-proto"] as const;

function firstValue(v: string | null): string | null {
  return v ? (v.split(",")[0]?.trim() ?? null) : null;
}

function isProto(v: string | null): v is "http" | "https" {
  return v === "http" || v === "https";
}

/**
 * Fill `x-forwarded-host` / `x-forwarded-proto` in place when the upstream proxy omitted them.
 * Next.js itself defaults `x-forwarded-proto` to `http` (plain socket) before middleware runs, so a default
 * `http` may be upgraded to `https` by a vendor scheme header. `https` is never downgraded.
 */
export function normalizeForwardedHeaders(h: Headers): void {
  if (!h.get("x-forwarded-host")) {
    const host = h.get("host");
    if (host) h.set("x-forwarded-host", host);
  }
  const current = firstValue(h.get("x-forwarded-proto"))?.toLowerCase() ?? null;
  if (current === "https") return;
  for (const name of PROTO_FALLBACKS) {
    const proto = firstValue(h.get(name))?.toLowerCase() ?? null;
    if (isProto(proto)) {
      if (proto === "https" || current === null) h.set("x-forwarded-proto", proto);
      return;
    }
  }
}

/**
 * Origin the browser actually used, or `null` when no host header is present.
 * Protocol precedence: `https` from any trusted header wins; then x-forwarded-proto → vendor aliases → `fallbackProto`.
 */
export function forwardedOrigin(h: Headers, fallbackProto: "http" | "https" = "http"): string | null {
  const host = firstValue(h.get("x-forwarded-host")) ?? firstValue(h.get("host"));
  if (!host || !/^[a-z0-9.:\-[\]]+$/i.test(host)) return null;
  let proto: "http" | "https" | null = null;
  const forwarded = firstValue(h.get("x-forwarded-proto"))?.toLowerCase() ?? null;
  if (isProto(forwarded)) proto = forwarded;
  if (proto !== "https") {
    for (const name of PROTO_FALLBACKS) {
      const candidate = firstValue(h.get(name))?.toLowerCase() ?? null;
      if (isProto(candidate)) {
        if (candidate === "https" || proto === null) proto = candidate;
        break;
      }
    }
  }
  return `${proto ?? fallbackProto}://${host}`;
}

/** Rebase `url` onto the forwarded origin; returns `url` unchanged when it cannot be determined. */
export function rebaseUrlToForwardedOrigin(url: string, h: Headers): string {
  const origin = forwardedOrigin(h);
  if (!origin) return url;
  try {
    const u = new URL(url);
    // Build from the origin rather than mutating `host`: WHATWG URL keeps the old port when the new host has none.
    return `${origin}${u.pathname}${u.search}${u.hash}`;
  } catch {
    return url;
  }
}
