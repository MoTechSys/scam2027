/**
 * Typed, validated environment (docs/10-research/02-SECURITY-ASVS.md V14 — configuration).
 * Import `env` instead of touching `process.env` anywhere else.
 */
import { z } from "zod";

const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  DIRECT_DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_URL: z.string().url().optional(),
  AUTH_TRUST_HOST: z.coerce.boolean().default(true),
  ROOT_DOMAIN: z.string().min(1).default("localhost"),
  DEFAULT_TENANT_SLUG: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  APP_ENCRYPTION_KEY: z
    .string()
    .regex(/^base64:[A-Za-z0-9+/=]{40,}$/, "APP_ENCRYPTION_KEY must be `base64:<32 random bytes>`"),
  /* ---- Files (FR-FIL-011) ---- */
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  /** Local driver root — MUST be outside `public/`. Relative paths resolve from the app cwd. */
  STORAGE_LOCAL_ROOT: z.string().min(1).default("./storage"),
  /** Hard per-file cap (bytes); the subscription may lower it, never raise it. */
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(50 * 1024 * 1024),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().optional(),
});

export type Env = z.infer<typeof serverSchema>;

function load(): Env {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`❌ Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}

export const env: Env = load();
export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
