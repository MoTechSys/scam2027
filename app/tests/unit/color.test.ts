import { describe, expect, it } from "vitest";
import { brandingSettingsSchema } from "@/features/settings/schemas";
import { contrastRatio, mixHex, primaryContrast, relativeLuminance } from "@/lib/color";

describe("lib/color (WCAG 2.1 contrast)", () => {
  it("relative luminance and contrast match the spec reference values", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 3);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 3); // order-independent
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("mixHex reproduces color-mix(in srgb) for opaque colours", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#1e293b", "#1e90ff", 0.1)).toBe("#1e334f"); // the surface axe measured in a11y.spec
  });

  it("evaluates the tinted accent surface as the binding constraint", () => {
    const omnitrix = primaryContrast("#39ff14");
    expect(omnitrix.passesAA).toBe(true);
    expect(omnitrix.onAccent).toBeLessThan(omnitrix.onCard);
    // #1e90ff passes on the plain card (4.52) but fails on the 10 % tinted surface (3.95) — exactly the axe finding
    const dodger = primaryContrast("#1e90ff");
    expect(dodger.onCard).toBeGreaterThan(4.5);
    expect(dodger.onAccent).toBeLessThan(4.5);
    expect(dodger.passesAA).toBe(false);
    expect(primaryContrast("#38bdf8").passesAA).toBe(true);
    expect(primaryContrast("#16a34a").passesAA).toBe(false); // light-theme green is too dark for the dark theme
  });

  it("brandingSettingsSchema rejects low-contrast primaries with a readable message", () => {
    const ok = brandingSettingsSchema.safeParse({
      primaryColor: "#38bdf8",
      accentColor: "",
      loginMessage: "",
    });
    expect(ok.success).toBe(true);
    const low = brandingSettingsSchema.safeParse({
      primaryColor: "#1e90ff",
      accentColor: "",
      loginMessage: "",
    });
    expect(low.success).toBe(false);
    if (!low.success) expect(low.error.issues[0]?.message).toContain("4.5");
  });
});
