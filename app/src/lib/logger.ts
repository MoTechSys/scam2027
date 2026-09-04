/**
 * Structured JSON logging (pino). Never log secrets, tokens, passwords or full PII.
 * docs/30-architecture/00-ARCHITECTURE.md §7 — fields: requestId, tenantId, userId (hashed).
 */
import pino from "pino";
import { env, isProd } from "@/lib/env";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "scam2027" },
  redact: {
    paths: [
      "password",
      "*.password",
      "passwordHash",
      "*.passwordHash",
      "token",
      "*.token",
      "authorization",
      "cookie",
      "*.cookie",
    ],
    censor: "[REDACTED]",
  },
  ...(isProd
    ? {}
    : { transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } } }),
});

export type Logger = typeof logger;
