import { describe, expect, it } from "vitest";
import { RANGE_SEPARATOR, formatDateRange, type DateTimeFormatter } from "@/lib/format-range";

/**
 * SSR/client determinism: Intl#formatRange differs between Node ICU (thin spaces U+2009) and Chromium — this helper
 * must never emit thin spaces and must be a pure function of the two formatted ends.
 */
describe("formatDateRange", () => {
  const f: DateTimeFormatter = {
    dateTime: (d, o) => `${d.toISOString().slice(0, 10)}:${o?.dateStyle ?? ""}`,
  };

  it("joins both ends with a plain en dash", () => {
    const out = formatDateRange(f, new Date("2026-09-01T00:00:00Z"), new Date("2027-01-31T00:00:00Z"));
    expect(out).toBe(`2026-09-01:medium${RANGE_SEPARATOR}2027-01-31:medium`);
    expect(out).not.toMatch(/\u2009|\u202f/);
    expect(RANGE_SEPARATOR).toBe(" \u2013 ");
  });

  it("forwards custom options to both ends", () => {
    expect(
      formatDateRange(f, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-02T00:00:00Z"), {
        dateStyle: "long",
      }),
    ).toBe(`2026-01-01:long${RANGE_SEPARATOR}2026-01-02:long`);
  });
});
