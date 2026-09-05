/**
 * Playwright global teardown — hard-deletes rows created by e2e specs so repeated local runs keep the demo
 * tenant pristine. Uses DIRECT_DATABASE_URL (bypasses RLS; superuser) and only touches the `e2e-*@demo.edu` pattern.
 */
import { PrismaClient } from "@prisma/client";

export default async function globalTeardown(): Promise<void> {
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) return;
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    const users = await prisma.user.findMany({
      where: { email: { startsWith: "e2e-", endsWith: "@demo.edu" } },
      select: { id: true },
    });
    if (users.length === 0) return;
    const ids = users.map((u) => u.id);
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    console.log(`[e2e teardown] removed ${ids.length} e2e user(s)`);
  } finally {
    await prisma.$disconnect();
  }
}
