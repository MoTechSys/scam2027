/**
 * GET /manifest.webmanifest — PWA manifest (ADR-0007 §5). Excluded from the proxy matcher so it is public.
 * Tenant-aware: name/colour/icon come from the host's tenant when it resolves; otherwise platform defaults.
 * Service worker / offline arrive in P4-05.
 */
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/auth/tenant-resolver";
import { safePrimaryColor } from "@/lib/tenant/current";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tenant = await resolveTenant(req.headers.get("host")).catch(() => null);
  const name = tenant?.name ?? "scam2027";
  const themeColor = safePrimaryColor(tenant?.branding?.primaryColor) ?? "#39ff14";
  const icon = tenant?.branding?.logoUrl ?? "/icon.svg";
  const manifest = {
    id: "/dashboard",
    name,
    short_name: name.length > 12 ? name.slice(0, 12) : name,
    description: "Smart Course & Assessment Manager",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    dir: "rtl",
    lang: "ar",
    background_color: "#0f172a",
    theme_color: themeColor,
    icons: [
      {
        src: icon,
        sizes: "any",
        type: icon.endsWith(".svg") ? "image/svg+xml" : "image/png",
        purpose: "any",
      },
    ],
  };
  return NextResponse.json(manifest, {
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
