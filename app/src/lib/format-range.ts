/**
 * Deterministic date-range text.
 *
 * `Intl.DateTimeFormat#formatRange` (what `useFormatter().dateTimeRange` calls) is *not* stable across ICU builds:
 * Node's ICU emits `Sep 1, 2026\u2009\u2013\u2009Jan 31, 2027` (thin spaces) while Chromium emits regular spaces,
 * so the SSR text never matches the client text in `en` → React #418 hydration error on every academic page.
 * Formatting each end separately is byte-identical on both sides; the separator is ours.
 */
import type { DateTimeFormatOptions } from "next-intl";

/** Structural subset of next-intl's `useFormatter()` — keeps the helper unit-testable without the provider. */
export type DateTimeFormatter = { dateTime: (value: Date, opts?: DateTimeFormatOptions) => string };

export const RANGE_SEPARATOR = " \u2013 "; // " – " (en dash) — direction-neutral, reads correctly in RTL and LTR

export function formatDateRange(
  f: DateTimeFormatter,
  from: Date,
  to: Date,
  opts: DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  return `${f.dateTime(from, opts)}${RANGE_SEPARATOR}${f.dateTime(to, opts)}`;
}
