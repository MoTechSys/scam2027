"use server";

/**
 * Profile Server Actions (P1-14). Own row only — no permission beyond a valid session (every user has a profile).
 * Pattern: safeAction → requireUserOrThrow → Zod strict → tx → audit → revalidatePath → Result<T>.
 * Password changes reuse `features/auth/actions.changePasswordAction`; notification preferences reuse
 * `features/notifications/actions.savePreferencesAction`.
 */
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireUserOrThrow } from "@/lib/auth/rbac";
import { tx } from "@/lib/db/tenant";
import type { Result } from "@/lib/result";
import { safeAction } from "@/lib/safe-action";
import { storage } from "@/lib/storage";
import { LOCALE_COOKIE } from "@/i18n/config";
import { applyAvatar, applyProfileUpdate, applyTheme } from "./core";
import { updateProfileSchema, updateThemeSchema, type Theme } from "./schemas";

export async function updateProfileAction(input: unknown): Promise<Result<{ locale: string }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      const data = updateProfileSchema.parse(input);
      await tx(ctx.tenantId, (t) => applyProfileUpdate(ctx, t, data));
      // Keep the locale cookie in step so the very next render uses the chosen language.
      (await cookies()).set(LOCALE_COOKIE, data.locale, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
        httpOnly: false,
        secure: process.env.NODE_ENV === "production",
      });
      revalidatePath("/", "layout");
      return { locale: data.locale };
    },
    { action: "profile.update" },
  );
}

export async function updateThemeAction(input: unknown): Promise<Result<{ theme: Theme }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow({ allowPasswordChangeRequired: true });
      const { theme } = updateThemeSchema.parse(input);
      await tx(ctx.tenantId, (t) => applyTheme(ctx, t, theme));
      revalidatePath("/", "layout");
      return { theme };
    },
    { action: "profile.theme" },
  );
}

export async function removeAvatarAction(): Promise<Result<{ removed: boolean }>> {
  return safeAction(
    async () => {
      const ctx = await requireUserOrThrow();
      const oldKey = await tx(ctx.tenantId, (t) => applyAvatar(ctx, t, null));
      if (oldKey)
        await storage()
          .delete(oldKey)
          .catch(() => undefined);
      revalidatePath("/", "layout");
      return { removed: !!oldKey };
    },
    { action: "profile.avatar_remove" },
  );
}
