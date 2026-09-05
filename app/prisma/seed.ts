/**
 * Seed — docs/50-quality/01-TESTING-STRATEGY.md (demo credentials) & docs/40-plan/01-ROADMAP.md P0-11
 *
 * Idempotent: safe to run repeatedly. Uses the owner connection (DIRECT_DATABASE_URL) because it writes
 * platform tables and bootstraps tenants; tenant rows are still written with the GUC set for symmetry.
 *
 *  Platform : super@scam.local / Super@123456
 *  Tenant   : demo (localhost) — "جامعة النموذج"
 *    admin@demo.edu       / Admin@123456      TENANT_ADMIN
 *    academic@demo.edu    / Academic@123456   ACADEMIC_ADMIN
 *    dr.ahmad@demo.edu    / Doctor@123456     INSTRUCTOR
 *    student1@demo.edu    / Student@123456    STUDENT
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { PERMISSIONS, SYSTEM_ROLE_GRANTS, SYSTEM_ROLES, type SystemRoleCode } from "../src/lib/auth/permissions";

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });
const ARGON = { algorithm: 2, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;
const pw = (p: string) => hash(p, ARGON);

const ROLE_META: Record<SystemRoleCode, { name: string; nameEn: string; description: string }> = {
  TENANT_ADMIN: { name: "مدير النظام", nameEn: "System Administrator", description: "كل الصلاحيات داخل الجامعة" },
  ACADEMIC_ADMIN: { name: "مدير أكاديمي", nameEn: "Academic Administrator", description: "البنية الأكاديمية والمقررات والتقارير" },
  INSTRUCTOR: { name: "مدرس", nameEn: "Instructor", description: "إدارة شُعبه: ملفات، اختبارات، درجات" },
  STUDENT: { name: "طالب", nameEn: "Student", description: "الوصول إلى مقرراته واختباراته ودرجاته" },
};

async function seedPermissions() {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { group: p.group, description: p.description },
      create: { code: p.code, group: p.group, description: p.description },
    });
  }
  // Remove codes no longer in the catalogue (cascades RolePermission).
  const codes = PERMISSIONS.map((p) => p.code);
  const removed = await prisma.permission.deleteMany({ where: { code: { notIn: codes } } });
  console.log(`✓ permissions: ${codes.length} upserted, ${removed.count} stale removed`);
}

async function seedPlatformAdmin() {
  await prisma.platformUser.upsert({
    where: { email: "super@scam.local" },
    update: {},
    create: { email: "super@scam.local", name: "مدير المنصة", passwordHash: await pw("Super@123456") },
  });
  console.log("✓ platform super admin");
}

export async function ensureSystemRoles(tenantId: string) {
  for (const code of SYSTEM_ROLES) {
    const meta = ROLE_META[code];
    const role = await prisma.role.upsert({
      where: { tenantId_code: { tenantId, code } },
      update: { name: meta.name, nameEn: meta.nameEn, description: meta.description, isSystem: true, deletedAt: null },
      create: { tenantId, code, ...meta, isSystem: true },
    });
    const grants = Object.keys(SYSTEM_ROLE_GRANTS[code]);
    await prisma.rolePermission.deleteMany({ where: { tenantId, roleId: role.id, permissionCode: { notIn: grants } } });
    await prisma.rolePermission.createMany({
      data: grants.map((permissionCode) => ({ tenantId, roleId: role.id, permissionCode })),
      skipDuplicates: true,
    });
  }
}

async function seedDemoTenant() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      slug: "demo",
      name: "جامعة النموذج",
      nameEn: "Demo University",
      locale: "ar",
      timezone: "Asia/Riyadh",
      branding: { create: { primaryColor: "#39ff14", loginMessage: "مرحباً بك في نظام إدارة المقررات والتقييم" } },
      subscription: {
        create: { plan: "PRO", maxUsers: 5000, maxStorageGB: 100, maxAiTokensMonthly: 5_000_000, endsAt: new Date("2027-12-31") },
      },
    },
  });
  await ensureSystemRoles(tenant.id);

  const users: { email: string; name: string; academicId: string; password: string; role: SystemRoleCode; title?: string }[] = [
    { email: "admin@demo.edu", name: "عبدالله المدير", academicId: "EMP-0001", password: "Admin@123456", role: "TENANT_ADMIN", title: "مدير النظام" },
    { email: "academic@demo.edu", name: "سارة الأكاديمية", academicId: "EMP-0002", password: "Academic@123456", role: "ACADEMIC_ADMIN", title: "وكيلة الشؤون الأكاديمية" },
    { email: "dr.ahmad@demo.edu", name: "د. أحمد الحسني", academicId: "EMP-0101", password: "Doctor@123456", role: "INSTRUCTOR", title: "أستاذ مشارك" },
    { email: "student1@demo.edu", name: "محمد الطالب", academicId: "443100001", password: "Student@123456", role: "STUDENT" },
  ];
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: u.email } },
      update: { name: u.name, status: "ACTIVE", deletedAt: null },
      create: {
        tenantId: tenant.id,
        email: u.email,
        name: u.name,
        academicId: u.academicId,
        passwordHash: await pw(u.password),
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
        profile: { create: { title: u.title } },
      },
    });
    const role = await prisma.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: tenant.id, code: u.role } } });
    await prisma.userRole.upsert({
      where: { tenantId_userId_roleId: { tenantId: tenant.id, userId: user.id, roleId: role.id } },
      update: {},
      create: { tenantId: tenant.id, userId: user.id, roleId: role.id },
    });
  }
  console.log(`✓ tenant demo (${tenant.id}) with ${users.length} users`);
  return tenant;
}

async function main() {
  await seedPermissions();
  await seedPlatformAdmin();
  await seedDemoTenant();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
