/**
 * Storage adapter contract (FR-FIL-011, docs/30-architecture/00-ARCHITECTURE.md §5).
 *
 * One interface, two drivers (`local`, `s3`). Callers never touch the filesystem or the SDK directly; every object is
 * addressed by a *storage key* of the form `<tenantId>/<courseId|misc>/<uuid>.<ext>` (see `buildStorageKey`).
 * The adapter meters bytes while writing and aborts with `StorageLimitError` once `maxBytes` is exceeded, so a
 * malicious client can never fill the disk regardless of what the `Content-Length` header claimed.
 */
import type { Readable } from "node:stream";

export type PutOptions = {
  contentType: string;
  /** Hard cap for this object; the write is aborted and the partial object removed when exceeded. */
  maxBytes: number;
};

export type PutResult = {
  /** Bytes actually written. */
  size: number;
  /** Lower-case hex SHA-256 of the written bytes. */
  checksum: string;
};

export type StoredObject = {
  body: Readable;
  size: number;
  contentType?: string;
};

export interface StorageAdapter {
  put(key: string, body: Readable, opts: PutOptions): Promise<PutResult>;
  get(key: string): Promise<StoredObject>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

/** Thrown by `put` when the metered size passes `maxBytes`. Mapped to 413 by the upload route. */
export class StorageLimitError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`object exceeds ${maxBytes} bytes`);
    this.name = "StorageLimitError";
  }
}

/** Thrown when the requested key does not exist. Mapped to 404 by callers. */
export class StorageNotFoundError extends Error {
  constructor(public readonly key: string) {
    super(`object not found: ${key}`);
    this.name = "StorageNotFoundError";
  }
}
