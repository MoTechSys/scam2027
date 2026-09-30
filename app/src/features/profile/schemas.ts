/**
 * Profile (P1-14, FR-USR-011) — the signed-in user's own account. Client-safe (no server-only imports).
 * Tabs are URL-addressable like /settings; each mutation has a strict Zod schema.
 */
import { z } from "zod";

export const PROFILE_TABS = ["info", "password", "appearance", "notifications"] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];
export function isProfileTab(v: string): v is ProfileTab {
  return (PROFILE_TABS as readonly string[]).includes(v);
}

export const THEMES = ["DARK", "LIGHT", "SYSTEM"] as const;
export type Theme = (typeof THEMES)[number];
export function isTheme(v: unknown): v is Theme {
  return typeof v === "string" && (THEMES as readonly string[]).includes(v);
}

const trimmed = (max: number) => z.string().trim().min(1, "مطلوب").max(max);

/** Editable identity fields. Email and academicId are admin-owned (users module) and stay read-only here. */
export const updateProfileSchema = z
  .object({
    name: trimmed(120),
    phone: z
      .string()
      .trim()
      .max(30)
      .regex(/^[+\d][\d\s-]*$/, "رقم هاتف غير صالح")
      .optional()
      .or(z.literal("")),
    title: z.string().trim().max(80).optional().or(z.literal("")),
    bio: z.string().trim().max(500).optional().or(z.literal("")),
    locale: z.enum(["ar", "en"]),
  })
  .strict();
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const updateThemeSchema = z.object({ theme: z.enum(THEMES) }).strict();

/** Avatar upload constraints (route handler): raster only — no SVG for user-supplied images. */
export const AVATAR_MAX_BYTES = 512 * 1024;
export const AVATAR_MIME = ["image/png", "image/webp", "image/jpeg"] as const;
export const AVATAR_EXT: Record<(typeof AVATAR_MIME)[number], string> = {
  "image/png": "png",
  "image/webp": "webp",
  "image/jpeg": "jpg",
};

/** Convert the stored theme to the <html> class/data attributes the layout renders (SYSTEM = let CSS media decide). */
export function htmlThemeAttrs(theme: Theme): { className: string; dataTheme: string | undefined } {
  if (theme === "LIGHT") return { className: "", dataTheme: "light" };
  if (theme === "SYSTEM") return { className: "", dataTheme: "system" };
  return { className: "dark", dataTheme: undefined };
}
