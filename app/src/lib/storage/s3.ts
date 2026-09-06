/**
 * S3-compatible driver (AWS S3, Cloudflare R2, MinIO via `S3_ENDPOINT` + `S3_FORCE_PATH_STYLE`).
 *
 * Upload uses `@aws-sdk/lib-storage` (multipart, streaming) behind the same `meter` as the local driver so the size
 * cap and SHA-256 are enforced identically. On a limit breach the partially uploaded object is deleted best-effort.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { Readable } from "node:stream";
import { assertSafeKey, meter } from "./local";
import {
  StorageNotFoundError,
  type PutOptions,
  type PutResult,
  type StorageAdapter,
  type StoredObject,
} from "./types";

export type S3Config = {
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
};

export class S3Storage implements StorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(cfg: S3Config) {
    this.bucket = cfg.bucket;
    const clientCfg: S3ClientConfig = {
      region: cfg.region ?? "auto",
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle ?? false,
    };
    if (cfg.accessKeyId && cfg.secretAccessKey)
      clientCfg.credentials = { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey };
    this.client = new S3Client(clientCfg);
  }

  async put(key: string, body: Readable, opts: PutOptions): Promise<PutResult> {
    assertSafeKey(key);
    const m = meter(opts.maxBytes);
    const upload = new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key: key, Body: body.pipe(m), ContentType: opts.contentType },
      leavePartsOnError: false,
    });
    try {
      await upload.done();
    } catch (err) {
      await this.delete(key).catch(() => undefined);
      throw err;
    }
    return m.result();
  }

  async get(key: string): Promise<StoredObject> {
    assertSafeKey(key);
    try {
      const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!r.Body) throw new StorageNotFoundError(key);
      return { body: r.Body as Readable, size: r.ContentLength ?? 0, contentType: r.ContentType };
    } catch (err) {
      if (isNotFound(err)) throw new StorageNotFoundError(key);
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    assertSafeKey(key);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e.name === "NoSuchKey" || e.name === "NotFound" || e.$metadata?.httpStatusCode === 404;
}
