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
 *  Academic structure (P1-04, TESTING-STRATEGY §4): year 2026/2027 (current) with FIRST (current) + SECOND semesters,
 *    college CCIS → departments CS, IS → majors CS-BSC, SE-BSC, IS-BSC → 4 levels each.
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { PERMISSIONS, SYSTEM_ROLE_GRANTS, SYSTEM_ROLES, type SystemRoleCode } from "../src/lib/auth/permissions";
import { levelName } from "../src/features/academic/schemas";

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

/* ───────────── Academic structure (P1-04) ───────────── */
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function seedAcademic(tenantId: string) {
  const year = await prisma.academicYear.upsert({
    where: { tenantId_code: { tenantId, code: "2026/2027" } },
    update: { name: "العام الأكاديمي 2026/2027", startDate: d("2026-09-01"), endDate: d("2027-07-31") },
    create: { tenantId, code: "2026/2027", name: "العام الأكاديمي 2026/2027", startDate: d("2026-09-01"), endDate: d("2027-07-31"), isCurrent: true },
  });
  // Exactly one current year/semester per tenant (partial unique index) — clear others before flagging.
  await prisma.academicYear.updateMany({ where: { tenantId, id: { not: year.id }, isCurrent: true }, data: { isCurrent: false } });
  await prisma.academicYear.update({ where: { id: year.id }, data: { isCurrent: true } });

  const semesters = [
    { term: "FIRST" as const, name: "الفصل الأول 2026/2027", start: "2026-09-01", end: "2027-01-31", regOpen: "2026-08-15", regClose: "2026-09-15", status: "ACTIVE" as const, current: true },
    { term: "SECOND" as const, name: "الفصل الثاني 2026/2027", start: "2027-02-07", end: "2027-06-30", regOpen: "2027-01-20", regClose: "2027-02-20", status: "PLANNED" as const, current: false },
  ];
  let currentSemesterId = "";
  for (const s of semesters) {
    const row = await prisma.semester.upsert({
      where: { tenantId_academicYearId_term: { tenantId, academicYearId: year.id, term: s.term } },
      update: { name: s.name, startDate: d(s.start), endDate: d(s.end), registrationOpensAt: d(s.regOpen), registrationClosesAt: d(s.regClose), status: s.status },
      create: {
        tenantId, academicYearId: year.id, term: s.term, name: s.name, startDate: d(s.start), endDate: d(s.end),
        registrationOpensAt: d(s.regOpen), registrationClosesAt: d(s.regClose), status: s.status, isCurrent: false,
      },
    });
    if (s.current) currentSemesterId = row.id;
  }
  await prisma.semester.updateMany({ where: { tenantId, id: { not: currentSemesterId }, isCurrent: true }, data: { isCurrent: false } });
  await prisma.semester.update({ where: { id: currentSemesterId }, data: { isCurrent: true } });

  const college = await prisma.college.upsert({
    where: { tenantId_code: { tenantId, code: "CCIS" } },
    update: { name: "كلية علوم الحاسب والمعلومات", nameEn: "College of Computer and Information Sciences", isActive: true },
    create: { tenantId, code: "CCIS", name: "كلية علوم الحاسب والمعلومات", nameEn: "College of Computer and Information Sciences", sortOrder: 1 },
  });
  const departments = [
    { code: "CS", name: "قسم علوم الحاسب", nameEn: "Computer Science", majors: [
      { code: "CS-BSC", name: "علوم الحاسب", nameEn: "Computer Science" },
      { code: "SE-BSC", name: "هندسة البرمجيات", nameEn: "Software Engineering" },
    ] },
    { code: "IS", name: "قسم نظم المعلومات", nameEn: "Information Systems", majors: [{ code: "IS-BSC", name: "نظم المعلومات", nameEn: "Information Systems" }] },
  ];
  let majorsN = 0;
  let levelsN = 0;
  for (const [i, dep] of departments.entries()) {
    const department = await prisma.department.upsert({
      where: { tenantId_code: { tenantId, code: dep.code } },
      update: { name: dep.name, nameEn: dep.nameEn, collegeId: college.id, isActive: true },
      create: { tenantId, collegeId: college.id, code: dep.code, name: dep.name, nameEn: dep.nameEn, sortOrder: i + 1 },
    });
    for (const [j, m] of dep.majors.entries()) {
      const major = await prisma.major.upsert({
        where: { tenantId_code: { tenantId, code: m.code } },
        update: { name: m.name, nameEn: m.nameEn, departmentId: department.id, degree: "BACHELOR", durationYears: 4, isActive: true },
        create: { tenantId, departmentId: department.id, code: m.code, name: m.name, nameEn: m.nameEn, degree: "BACHELOR", durationYears: 4, sortOrder: j + 1 },
      });
      majorsN++;
      for (let n = 1; n <= 4; n++) {
        const { name, nameEn } = levelName(n);
        await prisma.level.upsert({
          where: { tenantId_majorId_number: { tenantId, majorId: major.id, number: n } },
          update: { name, nameEn, isActive: true },
          create: { tenantId, majorId: major.id, number: n, name, nameEn },
        });
        levelsN++;
      }
    }
  }
  console.log(`✓ academic: 1 year, ${semesters.length} semesters, 1 college, ${departments.length} departments, ${majorsN} majors, ${levelsN} levels`);
}

async function main() {
  await seedPermissions();
  await seedPlatformAdmin();
  const tenant = await seedDemoTenant();
  await seedAcademic(tenant.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
