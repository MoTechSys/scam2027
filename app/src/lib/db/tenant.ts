/**
 * Tenant-scoped database access — docs/30-architecture/01-MULTI-TENANCY.md §2
 *
 * `db(tenantId)` returns a Prisma client whose every operation runs inside a transaction that first sets
 * `app.current_tenant_id` (transaction-local GUC). RLS policies on every tenant table use that GUC.
 *
 * Use `tx(tenantId, fn)` when you need several statements in one transaction.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { basePrisma } from "./prisma";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function assertTenantId(tenantId: string): void {
  if (!UUID_RE.test(tenantId)) throw new Error("Invalid tenantId");
}

export type TenantTx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/** Run `fn` in a single transaction with the tenant GUC set. */
export async function tx<T>(
  tenantId: string,
  fn: (tx: TenantTx) => Promise<T>,
  options?: { maxWait?: number; timeout?: number },
): Promise<T> {
  assertTenantId(tenantId);
  return basePrisma.$transaction(async (t) => {
    await t.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;
    return fn(t as unknown as TenantTx);
  }, options);
}

const cache = new Map<string, ReturnType<typeof createTenantClient>>();

function createTenantClient(tenantId: string) {
  return basePrisma.$extends({
    name: `tenant:${tenantId}`,
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const [, result] = await basePrisma.$transaction([
            basePrisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`,
            query(args) as unknown as Prisma.PrismaPromise<unknown>,
          ]);
          return result;
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof createTenantClient>;

/** Tenant-scoped Prisma client. Cached per tenantId (extensions are cheap but not free). */
export function db(tenantId: string): TenantDb {
  assertTenantId(tenantId);
  let client = cache.get(tenantId);
  if (!client) {
    client = createTenantClient(tenantId);
    cache.set(tenantId, client);
    if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  }
  return client;
}
