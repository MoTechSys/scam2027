/** P1-06 — upload validation, signed links and the local storage adapter (pure / tmp-dir). */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterAll, describe, expect, it } from "vitest";
import { LocalStorage, assertSafeKey, meter } from "@/lib/storage/local";
import { signDownload, verifyDownload } from "@/lib/storage/signed-url";
import { StorageLimitError } from "@/lib/storage/types";
import { buildStorageKey, formatBytes, sanitizeDisplayName, validateUpload } from "@/lib/storage/validate";

const MAX = 1024;
describe("validateUpload", () => {
  it("accepts a PDF whose magic bytes match", () => {
    const r = validateUpload({
      originalName: "a.pdf",
      size: 10,
      sniffedMime: "application/pdf",
      maxBytes: MAX,
    });
    expect(r).toEqual({ ok: true, ext: "pdf", mimeType: "application/pdf" });
  });
  it("rejects extension/content mismatch (exe renamed to pdf)", () => {
    const r = validateUpload({
      originalName: "x.pdf",
      size: 10,
      sniffedMime: "application/x-msdownload",
      maxBytes: MAX,
    });
    expect(r).toEqual({ ok: false, reason: "CONTENT_MISMATCH" });
  });
  it("rejects disallowed extensions, empty and oversized files", () => {
    expect(
      validateUpload({ originalName: "a.exe", size: 1, sniffedMime: null, maxBytes: MAX }),
    ).toMatchObject({ reason: "EXTENSION_NOT_ALLOWED" });
    expect(
      validateUpload({ originalName: "a.pdf", size: 0, sniffedMime: null, maxBytes: MAX }),
    ).toMatchObject({ reason: "EMPTY" });
    expect(
      validateUpload({ originalName: "a.pdf", size: MAX + 1, sniffedMime: "application/pdf", maxBytes: MAX }),
    ).toMatchObject({ reason: "TOO_LARGE" });
  });
  it("accepts text types without a signature but not with a foreign one", () => {
    expect(
      validateUpload({ originalName: "notes.txt", size: 5, sniffedMime: null, maxBytes: MAX }),
    ).toMatchObject({ ok: true, mimeType: "text/plain" });
    expect(
      validateUpload({ originalName: "notes.txt", size: 5, sniffedMime: "application/pdf", maxBytes: MAX }),
    ).toMatchObject({ reason: "CONTENT_MISMATCH" });
  });
  it("buildStorageKey never contains the original name and passes assertSafeKey", () => {
    const k = buildStorageKey("t1", "c1", "pdf");
    expect(k).toMatch(/^t1\/c1\/[0-9a-f-]{36}\.pdf$/);
    expect(() => assertSafeKey(k)).not.toThrow();
    expect(buildStorageKey("t1", null, "md")).toMatch(/^t1\/misc\//);
  });
  it("sanitizeDisplayName strips paths/control chars and keeps the extension when truncating", () => {
    expect(sanitizeDisplayName("..\\..\\evil\u0000.pdf")).toBe("evil.pdf");
    expect(sanitizeDisplayName(`${"a".repeat(200)}.pdf`, 20)).toBe(`${"a".repeat(16)}.pdf`);
    expect(sanitizeDisplayName("   ")).toBe("file");
  });
  it("formatBytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(50 * 1024 * 1024)).toBe("50.0 MB");
  });
});

describe("signed download links", () => {
  const S = "secret-1";
  it("round-trips for the same user before expiry", () => {
    const { path: p, exp } = signDownload(S, "f1", "u1", 1000, 300);
    const u = new URL(p, "http://x");
    expect(u.pathname).toBe("/api/files/f1/download");
    const params = {
      exp: u.searchParams.get("exp"),
      uid: u.searchParams.get("uid"),
      sig: u.searchParams.get("sig"),
    };
    expect(exp).toBe(1300);
    expect(verifyDownload(S, "f1", params, "u1", 1200)).toBe("OK");
    expect(verifyDownload(S, "f1", params, "u1", 1301)).toBe("EXPIRED");
    expect(verifyDownload(S, "f1", params, "u2", 1200)).toBe("INVALID");
    expect(verifyDownload(S, "f2", params, "u1", 1200)).toBe("INVALID");
    expect(verifyDownload("other", "f1", params, "u1", 1200)).toBe("INVALID");
    expect(verifyDownload(S, "f1", { ...params, sig: "AAAA" }, "u1", 1200)).toBe("INVALID");
    expect(verifyDownload(S, "f1", { exp: null, uid: null, sig: null }, "u1", 1200)).toBe("INVALID");
  });
});

describe("LocalStorage", () => {
  let root = "";
  afterAll(async () => root && (await rm(root, { recursive: true, force: true })));
  it("put/get/exists/delete with metering", async () => {
    root = await mkdtemp(path.join(tmpdir(), "scam-storage-"));
    const s = new LocalStorage(root);
    const key = "t/c/abc.txt";
    const r = await s.put(key, Readable.from(Buffer.from("hello")), {
      contentType: "text/plain",
      maxBytes: 100,
    });
    expect(r.size).toBe(5);
    expect(r.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(await s.exists(key)).toBe(true);
    const g = await s.get(key);
    const chunks: Buffer[] = [];
    for await (const c of g.body) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe("hello");
    await s.delete(key);
    expect(await s.exists(key)).toBe(false);
  });
  it("aborts past maxBytes and removes the partial file", async () => {
    const s = new LocalStorage(root);
    await expect(
      s.put("t/c/big.bin", Readable.from(Buffer.alloc(200)), {
        contentType: "application/octet-stream",
        maxBytes: 100,
      }),
    ).rejects.toBeInstanceOf(StorageLimitError);
    expect(await s.exists("t/c/big.bin")).toBe(false);
  });
  it("rejects traversal / unsafe keys", async () => {
    const s = new LocalStorage(root);
    for (const k of ["../x.txt", "a/../../x.txt", "/etc/passwd", "a//b.txt", "noext", "a b.txt"])
      await expect(s.get(k)).rejects.toThrow("Invalid storage key");
    const m = meter(10);
    expect(m.result().size).toBe(0);
  });
});
