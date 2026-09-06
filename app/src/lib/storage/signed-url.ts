/**
 * Short-lived, user-bound download links (FR-FIL-005, FR-FIL-007).
 *
 *   /api/files/<fileId>/download?exp=<unix s>&uid=<userId>&sig=<base64url HMAC-SHA256>
 *
 * The signature covers `fileId | uid | exp` with `AUTH_SECRET`; the route additionally requires the *current session*
 * to belong to `uid`, so a leaked link is useless to anyone else and dies after `ttlSec` (default 5 minutes).
 * Pure module (Node crypto only) — unit-tested with fixed clocks.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const DEFAULT_TTL_SEC = 5 * 60;

function hmac(secret: string, fileId: string, uid: string, exp: number): string {
  return createHmac("sha256", secret).update(`${fileId}|${uid}|${exp}`).digest("base64url");
}

export function signDownload(
  secret: string,
  fileId: string,
  userId: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  ttlSec: number = DEFAULT_TTL_SEC,
): { path: string; exp: number } {
  const exp = nowSec + ttlSec;
  const sig = hmac(secret, fileId, userId, exp);
  const q = new URLSearchParams({ exp: String(exp), uid: userId, sig });
  return { path: `/api/files/${encodeURIComponent(fileId)}/download?${q}`, exp };
}

export type DownloadVerdict = "OK" | "EXPIRED" | "INVALID";

export function verifyDownload(
  secret: string,
  fileId: string,
  params: { exp: string | null; uid: string | null; sig: string | null },
  currentUserId: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): DownloadVerdict {
  if (!params.exp || !params.uid || !params.sig) return "INVALID";
  if (params.uid !== currentUserId) return "INVALID";
  const exp = Number(params.exp);
  if (!Number.isInteger(exp)) return "INVALID";
  const expected = Buffer.from(hmac(secret, fileId, params.uid, exp));
  const given = Buffer.from(params.sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "INVALID";
  if (nowSec > exp) return "EXPIRED";
  return "OK";
}
