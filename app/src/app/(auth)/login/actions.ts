"use server";

/**
 * Login Server Action — docs/30-architecture/03-AUTH-RBAC.md §1.
 * tenantId comes from the resolved host (x-tenant-id), never from the form body.
 * Auth.js throws CallbackRouteError wrapping our AuthFailure reason; we map it to a translated code.
 */
import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { z } from "zod";
import { signIn } from "@/lib/auth/auth";
import { logger } from "@/lib/logger";
import { safeNext, toLoginErrorCode, type LoginState } from "@/lib/auth/login-errors";

const schema = z.object({
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(256),
  remember: z.enum(["on"]).optional(),
  next: z.string().optional(),
});

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = schema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
    remember: formData.get("remember") ?? undefined,
    next: formData.get("next") ?? undefined,
  });
  const identifier = typeof formData.get("identifier") === "string" ? String(formData.get("identifier")) : "";
  if (!parsed.success) return { error: "VALIDATION", identifier };

  const tenantId = (await headers()).get("x-tenant-id");
  if (!tenantId) return { error: "UNKNOWN", identifier };

  try {
    await signIn("credentials", {
      identifier: parsed.data.identifier,
      password: parsed.data.password,
      tenantId,
      remember: parsed.data.remember === "on" ? "true" : "false",
      redirectTo: safeNext(parsed.data.next),
    });
    return { error: null };
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: toLoginErrorCode(err.cause?.err?.message), identifier };
    }
    // Next.js redirect() is implemented as a thrown error — it must propagate untouched.
    if (err && typeof err === "object" && "digest" in err) throw err;
    logger.error({ err }, "auth.login.unexpected");
    return { error: "UNKNOWN", identifier };
  }
}
