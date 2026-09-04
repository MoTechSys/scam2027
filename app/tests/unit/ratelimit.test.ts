import { afterEach, describe, expect, it, vi } from "vitest";
import { rateLimit, resetRateLimit } from "@/lib/ratelimit";

afterEach(() => {
  resetRateLimit();
  vi.useRealTimers();
});

describe("rateLimit (sliding window)", () => {
  it("allows up to `limit` hits then blocks with retry-after", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 60_000).ok).toBe(true);
    const blocked = rateLimit("k", 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("keys are independent", () => {
    for (let i = 0; i < 3; i++) rateLimit("a", 3, 60_000);
    expect(rateLimit("a", 3, 60_000).ok).toBe(false);
    expect(rateLimit("b", 3, 60_000).ok).toBe(true);
  });

  it("window slides: old hits expire", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    for (let i = 0; i < 2; i++) rateLimit("w", 2, 1_000);
    expect(rateLimit("w", 2, 1_000).ok).toBe(false);
    vi.advanceTimersByTime(1_001);
    expect(rateLimit("w", 2, 1_000).ok).toBe(true);
  });
});
