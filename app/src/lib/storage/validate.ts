/**
 * Upload validation — isomorphic (imported by the upload route AND the upload dialog for early client-side rejection).
 * No Node imports here.
 *
 * Policy (FR-FIL-002, FR-FIL-011):
 *  - extension allow-list → canonical MIME type stored on the row (never the client-declared one)
 *  - binary types must match a magic-bytes sniff (`file-type`); text types have no signature and are accepted only
 *    when nothing foreign was sniffed
 *  - size: > 0 and ≤ maxBytes (the storage meter re-enforces this on the real byte stream)
 *  - storage keys never contain the original name: `<tenant>/<course|misc>/<uuid>.<ext>`
 */

type Rule = { mime: string; sniff: readonly string[] | null };

/** ext → canonical MIME + acceptable sniffed MIME(s). `null` = text type (no signature). */
const RULES = {
  pdf: { mime: "application/pdf", sniff: ["application/pdf"] },
  docx: {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sniff: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip"],
  },
  pptx: {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    sniff: ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/zip"],
  },
  xlsx: {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    sniff: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip"],
  },
  png: { mime: "image/png", sniff: ["image/png"] },
  jpg: { mime: "image/jpeg", sniff: ["image/jpeg"] },
  jpeg: { mime: "image/jpeg", sniff: ["image/jpeg"] },
  gif: { mime: "image/gif", sniff: ["image/gif"] },
  webp: { mime: "image/webp", sniff: ["image/webp"] },
  mp4: { mime: "video/mp4", sniff: ["video/mp4", "video/quicktime", "video/x-m4v"] },
  zip: { mime: "application/zip", sniff: ["application/zip"] },
  txt: { mime: "text/plain", sniff: null },
  csv: { mime: "text/csv", sniff: null },
  md: { mime: "text/markdown", sniff: null },
} as const satisfies Record<string, Rule>;

export type AllowedExtension = keyof typeof RULES;
export const ALLOWED_EXTENSIONS = Object.keys(RULES) as readonly string[];
/** For `<input accept>` — extensions only (browsers match case-insensitively). */
export const ACCEPT_ATTRIBUTE = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const i = base.lastIndexOf(".");
  return i > 0 && i < base.length - 1 ? base.slice(i + 1).toLowerCase() : "";
}

export type UploadRejectReason = "EXTENSION_NOT_ALLOWED" | "EMPTY" | "TOO_LARGE" | "CONTENT_MISMATCH";
export type UploadVerdict =
  { ok: true; ext: AllowedExtension; mimeType: string } | { ok: false; reason: UploadRejectReason };

export function validateUpload(input: {
  originalName: string;
  size: number;
  /** MIME reported by the magic-bytes sniffer, or null when nothing was recognised. */
  sniffedMime: string | null;
  maxBytes: number;
}): UploadVerdict {
  const ext = extensionOf(input.originalName);
  if (!(ext in RULES)) return { ok: false, reason: "EXTENSION_NOT_ALLOWED" };
  const rule: Rule = RULES[ext as AllowedExtension];
  if (input.size <= 0) return { ok: false, reason: "EMPTY" };
  if (input.size > input.maxBytes) return { ok: false, reason: "TOO_LARGE" };
  if (rule.sniff === null) {
    // Text: no signature to check, but a recognised binary signature means the extension lies.
    if (input.sniffedMime !== null) return { ok: false, reason: "CONTENT_MISMATCH" };
  } else if (!input.sniffedMime || !rule.sniff.includes(input.sniffedMime)) {
    return { ok: false, reason: "CONTENT_MISMATCH" };
  }
  return { ok: true, ext: ext as AllowedExtension, mimeType: rule.mime };
}

/** `<tenantId>/<courseId|misc>/<uuid>.<ext>` — opaque, never derived from the user-supplied name. */
export function buildStorageKey(tenantId: string, courseId: string | null | undefined, ext: string): string {
  return `${tenantId}/${courseId ?? "misc"}/${crypto.randomUUID()}.${ext}`;
}

/**
 * Display-name hygiene: drop path components, control characters and surrounding whitespace; fall back to "file";
 * truncate to `max` while keeping the extension.
 */
export function sanitizeDisplayName(name: string, max = 160): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  let clean = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!clean || clean === "." || clean === "..") return "file";
  if (clean.length > max) {
    const i = clean.lastIndexOf(".");
    const ext = i > 0 ? clean.slice(i) : "";
    const stem = i > 0 ? clean.slice(0, i) : clean;
    clean = stem.slice(0, Math.max(1, max - ext.length)) + ext;
  }
  return clean;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(1)} ${units[u]}`;
}
