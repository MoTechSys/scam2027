/**
 * Appearance (P1-14). The persisted preference lives in `UserProfile.theme` (DARK | LIGHT | SYSTEM) and is passed
 * from the dashboard layout to the Header; `localStorage` is only a pre-hydration cache so the first paint after a
 * reload does not flash. Client-safe (no server imports).
 */
import type { Theme } from "@/features/profile/schemas";

export const THEME_KEY = "scam.theme";
export type Resolved = "dark" | "light";

export function resolveTheme(theme: Theme): Resolved {
  if (theme === "LIGHT") return "light";
  if (theme === "DARK") return "dark";
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function readResolvedTheme(): Resolved {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Apply to <html> (class `dark` drives Tailwind tokens; `data-theme` mirrors it) and cache the preference. */
export function applyThemeToDocument(theme: Theme): Resolved {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  if (resolved === "light") {
    root.dataset.theme = "light";
    root.classList.remove("dark");
  } else {
    delete root.dataset.theme;
    root.classList.add("dark");
  }
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private mode */
  }
  return resolved;
}
