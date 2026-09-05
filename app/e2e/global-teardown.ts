/**
 * Playwright global teardown — hard-deletes rows created by e2e specs so repeated local runs keep the demo
 * tenant pristine. Uses DIRECT_DATABASE_URL (bypasses RLS; superuser) and only touches e2e-owned patterns:
 * roles `E2E_*`, users `e2e-*@demo.edu`, academic rows and courses/offerings/enrollments whose code starts with `E2E` (levels cascade from majors).
 */
import { PrismaClient } from "@prisma/client";

export default async function globalTeardown(): Promise<void> {
  const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) return;
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    // Files (P1-06): e2e uploads are named `E2E*`; download logs cascade. Objects stay in ./storage (gitignored, tiny).
    const files = await prisma.file.deleteMany({ where: { name: { startsWith: "E2E" } } });
    if (files.count) console.log(`[e2e teardown] removed ${files.count} e2e file(s)`);
    // Academic structure (P1-04): bottom-up so Restrict FKs are satisfied; the seeded FIRST semester is re-flagged current.
    await prisma.enrollment.deleteMany({ where: { offering: { course: { code: { startsWith: "E2E" } } } } });
    await prisma.courseOffering.deleteMany({ where: { course: { code: { startsWith: "E2E" } } } });
    const courses = await prisma.course.deleteMany({ where: { code: { startsWith: "E2E" } } });
    void courses;
    const majors = await prisma.major.deleteMany({ where: { code: { startsWith: "E2E" } } });
    const departments = await prisma.department.deleteMany({ where: { code: { startsWith: "E2E" } } });
    const colleges = await prisma.college.deleteMany({ where: { code: { startsWith: "E2E" } } });
    const e2eYears = await prisma.academicYear.findMany({
      where: { code: { startsWith: "E2E" } },
      select: { id: true, tenantId: true, isCurrent: true },
    });
    if (e2eYears.length) {
      await prisma.semester.deleteMany({ where: { academicYearId: { in: e2eYears.map((y) => y.id) } } });
      await prisma.academicYear.deleteMany({ where: { id: { in: e2eYears.map((y) => y.id) } } });
      for (const y of e2eYears.filter((y) => y.isCurrent)) {
        const seeded = await prisma.academicYear.findFirst({
          where: { tenantId: y.tenantId, code: "2026/2027" },
          select: { id: true },
        });
        if (seeded) {
          await prisma.academicYear.update({ where: { id: seeded.id }, data: { isCurrent: true } });
          const first = await prisma.semester.findFirst({
            where: { academicYearId: seeded.id, term: "FIRST" },
            select: { id: true },
          });
          if (first) {
            await prisma.semester.updateMany({
              where: { tenantId: y.tenantId, isCurrent: true },
              data: { isCurrent: false },
            });
            await prisma.semester.update({ where: { id: first.id }, data: { isCurrent: true } });
          }
        }
      }
    }
    if (majors.count + departments.count + colleges.count + e2eYears.length)
      console.log(
        `[e2e teardown] removed academic rows: ${colleges.count} college(s), ${departments.count} department(s), ${majors.count} major(s), ${e2eYears.length} year(s)`,
      );

    const roles = await prisma.role.findMany({
      where: { code: { startsWith: "E2E_" } },
      select: { id: true },
    });
    if (roles.length) {
      const rids = roles.map((r) => r.id);
      await prisma.auditLog.deleteMany({ where: { entityId: { in: rids } } });
      await prisma.role.deleteMany({ where: { id: { in: rids } } });
      console.log(`[e2e teardown] removed ${rids.length} e2e role(s)`);
    }
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
