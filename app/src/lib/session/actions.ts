"use server";

/**
 * Session-scoped Server Actions available to every signed-in user:
 *  - logoutAction: revoke the server Session row, audit, then clear the JWT cookie.
 *  - revokeSessionAction: end one of *my own* other sessions (device management).
 *  - setLocaleAction: persist UI language preference (cookie + User.locale).
 */
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { signOut } from "@/lib/auth/auth";
import { requireUserOrThrow } from "@/lib/auth/rbac";
import { db } from "@/lib/db/tenant";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { safeAction } from "@/lib/safe-action";
import { AppError, type Result } from "@/lib/result";

export async function logoutAction(): Promise<void> {
  const r = await (async () => {
    try {
      return await requireUserOrThrow();
    } catch {
      return null;
    }
  })();
  if (r) {
    const prisma = db(r.tenantId);
    await prisma.session.updateMany({
      where: { id: r.sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: r.user.id },
    });
    await audit(r, { action: "auth.logout", entity: "Session", entityId: r.sessionId });
  }
  await signOut({ redirectTo: "/login?reason=signed_out" });
}

export async function revokeSessionAction(sessionId: string): Promise<Result<{ id: string }>> {
  return safeAction(async () => {
    const ctx = await requireUserOrThrow();
    const id = z.string().uuid().parse(sessionId);
    if (id === ctx.sessionId) throw new AppError("VALIDATION", "استخدم تسجيل الخروج لإنهاء الجلسة الحالية");
    const prisma = db(ctx.tenantId);
    const res = await prisma.session.updateMany({
      where: { id, userId: ctx.user.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: ctx.user.id },
    });
    if (res.count === 0) throw new AppError("NOT_FOUND", "الجلسة غير موجودة");
    await audit(ctx, { action: "auth.session.revoke", entity: "Session", entityId: id });
    revalidatePath("/dashboard");
    return { id };
  }, { action: "revokeSession" });
}

export async function setLocaleAction(locale: string): Promise<Result<{ locale: string }>> {
  return safeAction(async () => {
    if (!isLocale(locale)) throw new AppError("VALIDATION", "لغة غير مدعومة");
    (await cookies()).set(LOCALE_COOKIE, locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
    });
    try {
      const ctx = await requireUserOrThrow();
      await db(ctx.tenantId).user.update({ where: { id: ctx.user.id }, data: { locale } });
    } catch {
      // Anonymous visitors (login page) can still switch language via the cookie.
    }
    revalidatePath("/", "layout");
    return { locale };
  }, { action: "setLocale" });
}
