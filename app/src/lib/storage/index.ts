/**
 * Storage entry point — picks the driver from `env.STORAGE_DRIVER` once per process.
 *
 *   import { storage } from "@/lib/storage";
 *   await storage().put(key, stream, { contentType, maxBytes });
 *
 * Server-only (reads env). Client code imports `@/lib/storage/validate` directly.
 */
import "server-only";
import path from "node:path";
import { env } from "@/lib/env";
import { LocalStorage } from "./local";
import { S3Storage } from "./s3";
import type { StorageAdapter } from "./types";

export { StorageLimitError, StorageNotFoundError } from "./types";
export type { PutOptions, PutResult, StorageAdapter, StoredObject } from "./types";

let instance: StorageAdapter | null = null;

function create(): StorageAdapter {
  if (env.STORAGE_DRIVER === "s3") {
    if (!env.S3_BUCKET) throw new Error("STORAGE_DRIVER=s3 requires S3_BUCKET");
    return new S3Storage({
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
  }
  return new LocalStorage(path.resolve(process.cwd(), env.STORAGE_LOCAL_ROOT));
}

export function storage(): StorageAdapter {
  return (instance ??= create());
}
