/**
 * In-memory sliding-window rate limiter (per process). Sufficient for single-instance deployments;
 * swap the store for Redis when scaling horizontally (interface kept identical).
 */
type Bucket = { hits: number[] };
const store = new Map<string, Bucket>();
let lastSweep = Date.now();

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSec: number };

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (now - lastSweep > 60_000) {
    for (const [k, b] of store) if (b.hits.every((t) => now - t > windowMs)) store.delete(k);
    lastSweep = now;
  }
  const b = store.get(key) ?? { hits: [] };
  b.hits = b.hits.filter((t) => now - t < windowMs);
  if (b.hits.length >= limit) {
    const oldest = b.hits[0] ?? now;
    store.set(key, b);
    return { ok: false, remaining: 0, retryAfterSec: Math.ceil((windowMs - (now - oldest)) / 1000) };
  }
  b.hits.push(now);
  store.set(key, b);
  return { ok: true, remaining: limit - b.hits.length, retryAfterSec: 0 };
}

export function resetRateLimit(key?: string): void {
  if (key) store.delete(key);
  else store.clear();
}
