/**
 * Colour maths for tenant branding (FR-TEN-004) — pure, isomorphic (used by Zod on the server and by the
 * branding form on the client). WCAG 2.1 relative luminance / contrast ratio (§1.4.3, AA text = 4.5:1).
 *
 * The brand primary is injected as `--primary` on <html> and is used BOTH as text (`text-primary`, sidebar active
 * item, links) on dark surfaces AND as a background under `--primary-foreground`. A colour that passes as text on
 * the card but fails on the 10 % tinted accent surface (`color-mix(primary 10%, card)`) still breaks AA, so the
 * gate below checks the tinted surface (the tighter bound) and the foreground-on-primary pair.
 */

/** Omnitrix dark palette surfaces the primary is rendered against (globals.css :root). */
export const DARK_CARD = "#1e293b";
export const DARK_PRIMARY_FOREGROUND = "#0f172a";
/** `--accent` / `--sidebar-accent` = color-mix(in srgb, var(--primary) 10%, transparent) over the card. */
export const ACCENT_MIX = 0.1;
export const AA_TEXT_CONTRAST = 4.5;

const HEX6 = /^#[0-9a-fA-F]{6}$/;

export function isHex6(value: string): boolean {
  return HEX6.test(value);
}

export function hexToRgb(hex: string): [number, number, number] {
  if (!HEX6.test(hex)) throw new Error(`Invalid hex colour: ${hex}`);
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** WCAG relative luminance of an sRGB colour. */
export function relativeLuminance(hex: string): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio (1..21), order-independent. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** sRGB linear mix — matches `color-mix(in srgb, top <amount>, base)` for opaque colours. */
export function mixHex(base: string, top: string, amount: number): string {
  const b = hexToRgb(base);
  const t = hexToRgb(top);
  return rgbToHex([
    b[0] * (1 - amount) + t[0] * amount,
    b[1] * (1 - amount) + t[1] * amount,
    b[2] * (1 - amount) + t[2] * amount,
  ]);
}

export type PrimaryContrast = {
  /** primary as text on the 10 % tinted accent surface (sidebar active item, chips) — the binding constraint. */
  onAccent: number;
  /** primary as text on the plain card. */
  onCard: number;
  /** `--primary-foreground` text on a primary button. */
  foregroundOnPrimary: number;
  /** min of the three, compared against AA_TEXT_CONTRAST. */
  min: number;
  passesAA: boolean;
};

/** Evaluate a candidate brand primary against every surface it is rendered on in the dark theme. */
export function primaryContrast(primary: string): PrimaryContrast {
  const onCard = contrastRatio(primary, DARK_CARD);
  const onAccent = contrastRatio(primary, mixHex(DARK_CARD, primary, ACCENT_MIX));
  const foregroundOnPrimary = contrastRatio(DARK_PRIMARY_FOREGROUND, primary);
  const min = Math.min(onCard, onAccent, foregroundOnPrimary);
  return { onCard, onAccent, foregroundOnPrimary, min, passesAA: min >= AA_TEXT_CONTRAST };
}
