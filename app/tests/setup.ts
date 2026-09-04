/**
 * Vitest setup — loads .env.test (falls back to .env) so env.ts validates.
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";

config({ path: existsSync(".env.test") ? ".env.test" : ".env" });
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.LOG_LEVEL ??= "silent";
