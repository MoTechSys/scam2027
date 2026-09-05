import { NextRequest } from "next/server";
import { handlers } from "@/lib/auth/auth";
import { rebaseUrlToForwardedOrigin } from "@/lib/auth/forwarded";

/**
 * Auth.js route handler. `next start` builds `request.url` from the server's own hostname:port
 * (`http://localhost:3000`), so error / callback redirects would leave the tenant origin the browser is on.
 * Rebase the URL onto the forwarded host + proto (normalised in proxy.ts) before handing it to Auth.js.
 * See src/lib/auth/forwarded.ts.
 */
function withForwardedOrigin(req: NextRequest): NextRequest {
  const url = rebaseUrlToForwardedOrigin(req.url, req.headers);
  return url === req.url ? req : new NextRequest(url, req);
}

export const GET = (req: NextRequest) => handlers.GET(withForwardedOrigin(req));
export const POST = (req: NextRequest) => handlers.POST(withForwardedOrigin(req));
