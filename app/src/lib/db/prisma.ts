/**
 * Prisma clients — docs/30-architecture/01-MULTI-TENANCY.md §2
 *
 *  - `basePrisma`     : connects as `app_user` (NO BYPASSRLS). Every tenant-scoped query MUST go through
 *                       `db(tenantId)` which sets the `app.current_tenant_id` GUC inside a transaction.
 *                       Without the GUC, RLS returns 0 rows (fail-closed).
 *  - `platformPrisma` : connects with the owner/direct URL. ONLY for platform (Super Admin) code paths,
 *                       migrations, seeds and tests. Never import from feature code.
 *
 * Both clients are process-wide singletons registered on `globalThis` in EVERY environment (not only dev/HMR):
 * Turbopack bundles this module once per entry kind (Route Handlers, RSC/SSR pages, proxy), so without the global
 * registration a production server opened three independent connection pools per client (measured in P1-10:
 * 8 `app_user` sessions idle after one request). One process = one pool.
 */
import { PrismaClient } from "@prisma/client";
import { env, isProd, isTest } from "@/lib/env";

const BASE_KEY = Symbol.for("scam2027.basePrisma");
const PLATFORM_KEY = Symbol.for("scam2027.platformPrisma");
const globalForPrisma = globalThis as unknown as {
  [BASE_KEY]?: PrismaClient;
  [PLATFORM_KEY]?: PrismaClient;
};

const logLevels: ("query" | "warn" | "error")[] = isProd ? ["error"] : ["warn", "error"];

export const basePrisma: PrismaClient = (globalForPrisma[BASE_KEY] ??= new PrismaClient({
  datasourceUrl: env.DATABASE_URL,
  log: isTest ? ["error"] : logLevels,
}));

export const platformPrisma: PrismaClient = (globalForPrisma[PLATFORM_KEY] ??= new PrismaClient({
  datasourceUrl: env.DIRECT_DATABASE_URL,
  log: isTest ? ["error"] : logLevels,
}));
