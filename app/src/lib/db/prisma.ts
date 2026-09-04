/**
 * Prisma clients — docs/30-architecture/01-MULTI-TENANCY.md §2
 *
 *  - `basePrisma`     : connects as `app_user` (NO BYPASSRLS). Every tenant-scoped query MUST go through
 *                       `db(tenantId)` which sets the `app.current_tenant_id` GUC inside a transaction.
 *                       Without the GUC, RLS returns 0 rows (fail-closed).
 *  - `platformPrisma` : connects with the owner/direct URL. ONLY for platform (Super Admin) code paths,
 *                       migrations, seeds and tests. Never import from feature code.
 */
import { PrismaClient } from "@prisma/client";
import { env, isProd, isTest } from "@/lib/env";

const globalForPrisma = globalThis as unknown as {
  basePrisma?: PrismaClient;
  platformPrisma?: PrismaClient;
};

const logLevels: ("query" | "warn" | "error")[] = isProd ? ["error"] : ["warn", "error"];

export const basePrisma: PrismaClient =
  globalForPrisma.basePrisma ??
  new PrismaClient({ datasourceUrl: env.DATABASE_URL, log: isTest ? ["error"] : logLevels });

export const platformPrisma: PrismaClient =
  globalForPrisma.platformPrisma ??
  new PrismaClient({ datasourceUrl: env.DIRECT_DATABASE_URL, log: isTest ? ["error"] : logLevels });

if (!isProd) {
  globalForPrisma.basePrisma = basePrisma;
  globalForPrisma.platformPrisma = platformPrisma;
}
