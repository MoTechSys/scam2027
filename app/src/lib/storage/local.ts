/**
 * Local filesystem driver (default in development). Root MUST live outside `public/` — objects are only ever served
 * through the signed download route, never by Next's static handler.
 *
 * Safety:
 *  - `assertSafeKey` accepts only `segment/segment/name.ext` keys (no `..`, no leading `/`, no empty segments,
 *    no whitespace); the resolved path must stay inside the root.
 *  - Files are created with `wx` (fail if exists) and mode 0600; partial writes are removed on error/limit.
 *  - Bytes are metered + hashed in one pass (`meter`) so size and checksum come from what was really written.
 */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  StorageLimitError,
  StorageNotFoundError,
  type PutOptions,
  type PutResult,
  type StorageAdapter,
  type StoredObject,
} from "./types";

const KEY_RE = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)+\/[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,10}$/;

/** Reject traversal / absolute / malformed keys. Exported for unit tests and the S3 driver. */
export function assertSafeKey(key: string): void {
  if (!KEY_RE.test(key) || key.includes("..")) throw new Error("Invalid storage key");
}

/**
 * A pass-through that counts bytes and hashes them; destroys the stream with `StorageLimitError` past `maxBytes`.
 * `result()` is valid after the stream has ended.
 */
export function meter(maxBytes: number): Transform & { result(): PutResult } {
  const hash = createHash("sha256");
  let size = 0;
  const t = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      size += chunk.length;
      if (size > maxBytes) return cb(new StorageLimitError(maxBytes));
      hash.update(chunk);
      cb(null, chunk);
    },
  }) as Transform & { result(): PutResult };
  t.result = () => ({ size, checksum: hash.digest("hex") });
  return t;
}

export class LocalStorage implements StorageAdapter {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(key: string): string {
    assertSafeKey(key);
    const abs = path.resolve(this.root, key);
    if (!abs.startsWith(this.root + path.sep)) throw new Error("Invalid storage key");
    return abs;
  }

  async put(key: string, body: Readable, opts: PutOptions): Promise<PutResult> {
    const abs = this.resolve(key);
    await mkdir(path.dirname(abs), { recursive: true, mode: 0o700 });
    const m = meter(opts.maxBytes);
    const out = createWriteStream(abs, { flags: "wx", mode: 0o600 });
    try {
      await pipeline(body, m, out);
    } catch (err) {
      await rm(abs, { force: true }).catch(() => undefined);
      throw err;
    }
    return m.result();
  }

  async get(key: string): Promise<StoredObject> {
    const abs = this.resolve(key);
    let size: number;
    try {
      size = (await stat(abs)).size;
    } catch {
      throw new StorageNotFoundError(key);
    }
    return { body: createReadStream(abs), size };
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}
