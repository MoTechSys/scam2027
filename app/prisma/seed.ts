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
 *  Files (P1-06): two sample files on CS101 (section 1) uploaded by dr.ahmad, written to STORAGE_LOCAL_ROOT
 *    (local driver only — skipped when STORAGE_DRIVER=s3).
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { createHash } from "node:crypto";
import {
  PERMISSIONS,
  SYSTEM_ROLE_GRANTS,
  SYSTEM_ROLES,
  type SystemRoleCode,
} from "../src/lib/auth/permissions";
import { levelName } from "../src/features/academic/schemas";
import { LocalStorage } from "../src/lib/storage/local";
import path from "node:path";
import { Readable } from "node:stream";

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });
const ARGON = { algorithm: 2, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;
const pw = (p: string) => hash(p, ARGON);

const ROLE_META: Record<SystemRoleCode, { name: string; nameEn: string; description: string }> = {
  TENANT_ADMIN: {
    name: "مدير النظام",
    nameEn: "System Administrator",
    description: "كل الصلاحيات داخل الجامعة",
  },
  ACADEMIC_ADMIN: {
    name: "مدير أكاديمي",
    nameEn: "Academic Administrator",
    description: "البنية الأكاديمية والمقررات والتقارير",
  },
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
      update: {
        name: meta.name,
        nameEn: meta.nameEn,
        description: meta.description,
        isSystem: true,
        deletedAt: null,
      },
      create: { tenantId, code, ...meta, isSystem: true },
    });
    const grants = Object.keys(SYSTEM_ROLE_GRANTS[code]);
    await prisma.rolePermission.deleteMany({
      where: { tenantId, roleId: role.id, permissionCode: { notIn: grants } },
    });
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
      branding: {
        create: { primaryColor: "#39ff14", loginMessage: "مرحباً بك في نظام إدارة المقررات والتقييم" },
      },
      subscription: {
        create: {
          plan: "PRO",
          maxUsers: 5000,
          maxStorageGB: 100,
          maxAiTokensMonthly: 5_000_000,
          endsAt: new Date("2027-12-31"),
        },
      },
    },
  });
  await ensureSystemRoles(tenant.id);

  const users: {
    email: string;
    name: string;
    academicId: string;
    password: string;
    role: SystemRoleCode;
    title?: string;
  }[] = [
    {
      email: "admin@demo.edu",
      name: "عبدالله المدير",
      academicId: "EMP-0001",
      password: "Admin@123456",
      role: "TENANT_ADMIN",
      title: "مدير النظام",
    },
    {
      email: "academic@demo.edu",
      name: "سارة الأكاديمية",
      academicId: "EMP-0002",
      password: "Academic@123456",
      role: "ACADEMIC_ADMIN",
      title: "وكيلة الشؤون الأكاديمية",
    },
    {
      email: "dr.ahmad@demo.edu",
      name: "د. أحمد الحسني",
      academicId: "EMP-0101",
      password: "Doctor@123456",
      role: "INSTRUCTOR",
      title: "أستاذ مشارك",
    },
    {
      email: "student1@demo.edu",
      name: "محمد الطالب",
      academicId: "443100001",
      password: "Student@123456",
      role: "STUDENT",
    },
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
    const role = await prisma.role.findUniqueOrThrow({
      where: { tenantId_code: { tenantId: tenant.id, code: u.role } },
    });
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
    create: {
      tenantId,
      code: "2026/2027",
      name: "العام الأكاديمي 2026/2027",
      startDate: d("2026-09-01"),
      endDate: d("2027-07-31"),
      isCurrent: true,
    },
  });
  // Exactly one current year/semester per tenant (partial unique index) — clear others before flagging.
  await prisma.academicYear.updateMany({
    where: { tenantId, id: { not: year.id }, isCurrent: true },
    data: { isCurrent: false },
  });
  await prisma.academicYear.update({ where: { id: year.id }, data: { isCurrent: true } });

  const semesters = [
    {
      term: "FIRST" as const,
      name: "الفصل الأول 2026/2027",
      start: "2026-09-01",
      end: "2027-01-31",
      regOpen: "2026-08-15",
      regClose: "2026-09-15",
      status: "ACTIVE" as const,
      current: true,
    },
    {
      term: "SECOND" as const,
      name: "الفصل الثاني 2026/2027",
      start: "2027-02-07",
      end: "2027-06-30",
      regOpen: "2027-01-20",
      regClose: "2027-02-20",
      status: "PLANNED" as const,
      current: false,
    },
  ];
  let currentSemesterId = "";
  for (const s of semesters) {
    const row = await prisma.semester.upsert({
      where: { tenantId_academicYearId_term: { tenantId, academicYearId: year.id, term: s.term } },
      update: {
        name: s.name,
        startDate: d(s.start),
        endDate: d(s.end),
        registrationOpensAt: d(s.regOpen),
        registrationClosesAt: d(s.regClose),
        status: s.status,
      },
      create: {
        tenantId,
        academicYearId: year.id,
        term: s.term,
        name: s.name,
        startDate: d(s.start),
        endDate: d(s.end),
        registrationOpensAt: d(s.regOpen),
        registrationClosesAt: d(s.regClose),
        status: s.status,
        isCurrent: false,
      },
    });
    if (s.current) currentSemesterId = row.id;
  }
  await prisma.semester.updateMany({
    where: { tenantId, id: { not: currentSemesterId }, isCurrent: true },
    data: { isCurrent: false },
  });
  await prisma.semester.update({ where: { id: currentSemesterId }, data: { isCurrent: true } });

  const college = await prisma.college.upsert({
    where: { tenantId_code: { tenantId, code: "CCIS" } },
    update: {
      name: "كلية علوم الحاسب والمعلومات",
      nameEn: "College of Computer and Information Sciences",
      isActive: true,
    },
    create: {
      tenantId,
      code: "CCIS",
      name: "كلية علوم الحاسب والمعلومات",
      nameEn: "College of Computer and Information Sciences",
      sortOrder: 1,
    },
  });
  const departments = [
    {
      code: "CS",
      name: "قسم علوم الحاسب",
      nameEn: "Computer Science",
      majors: [
        { code: "CS-BSC", name: "علوم الحاسب", nameEn: "Computer Science" },
        { code: "SE-BSC", name: "هندسة البرمجيات", nameEn: "Software Engineering" },
      ],
    },
    {
      code: "IS",
      name: "قسم نظم المعلومات",
      nameEn: "Information Systems",
      majors: [{ code: "IS-BSC", name: "نظم المعلومات", nameEn: "Information Systems" }],
    },
  ];
  let majorsN = 0;
  let levelsN = 0;
  for (const [i, dep] of departments.entries()) {
    const department = await prisma.department.upsert({
      where: { tenantId_code: { tenantId, code: dep.code } },
      update: { name: dep.name, nameEn: dep.nameEn, collegeId: college.id, isActive: true },
      create: {
        tenantId,
        collegeId: college.id,
        code: dep.code,
        name: dep.name,
        nameEn: dep.nameEn,
        sortOrder: i + 1,
      },
    });
    for (const [j, m] of dep.majors.entries()) {
      const major = await prisma.major.upsert({
        where: { tenantId_code: { tenantId, code: m.code } },
        update: {
          name: m.name,
          nameEn: m.nameEn,
          departmentId: department.id,
          degree: "BACHELOR",
          durationYears: 4,
          isActive: true,
        },
        create: {
          tenantId,
          departmentId: department.id,
          code: m.code,
          name: m.name,
          nameEn: m.nameEn,
          degree: "BACHELOR",
          durationYears: 4,
          sortOrder: j + 1,
        },
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
  console.log(
    `✓ academic: 1 year, ${semesters.length} semesters, 1 college, ${departments.length} departments, ${majorsN} majors, ${levelsN} levels`,
  );
}

/* ───────────── Courses / offerings / enrolments (P1-05) ───────────── */
const STUDENT_NAMES = [
  "محمد",
  "أحمد",
  "خالد",
  "عبدالرحمن",
  "سعود",
  "فهد",
  "عمر",
  "يوسف",
  "سلطان",
  "تركي",
  "نورة",
  "سارة",
  "ريم",
  "لمى",
  "هند",
  "منيرة",
  "دانة",
  "جود",
  "غادة",
  "أروى",
  "عبدالله",
  "ماجد",
  "ناصر",
  "بندر",
  "راكان",
  "مشاري",
  "شهد",
  "رنا",
  "لين",
  "أسماء",
];

async function seedCourses(tenantId: string) {
  const dept = async (code: string) =>
    (await prisma.department.findUniqueOrThrow({ where: { tenantId_code: { tenantId, code } } })).id;
  const major = async (code: string) =>
    (await prisma.major.findUniqueOrThrow({ where: { tenantId_code: { tenantId, code } } })).id;
  const level = async (majorId: string, number: number) =>
    (
      await prisma.level.findUniqueOrThrow({
        where: { tenantId_majorId_number: { tenantId, majorId, number } },
      })
    ).id;
  const [cs, is] = await Promise.all([dept("CS"), dept("IS")]);
  const [csb, seb, isb] = await Promise.all([major("CS-BSC"), major("SE-BSC"), major("IS-BSC")]);

  const courses: {
    code: string;
    name: string;
    nameEn: string;
    departmentId: string | null;
    creditHours: number;
    majors: { majorId: string; level: number; isRequired?: boolean }[];
  }[] = [
    {
      code: "CS101",
      name: "مقدمة في البرمجة",
      nameEn: "Introduction to Programming",
      departmentId: cs,
      creditHours: 4,
      majors: [
        { majorId: csb, level: 1 },
        { majorId: seb, level: 1 },
        { majorId: isb, level: 1 },
      ],
    },
    {
      code: "CS102",
      name: "البرمجة الكائنية",
      nameEn: "Object-Oriented Programming",
      departmentId: cs,
      creditHours: 4,
      majors: [
        { majorId: csb, level: 2 },
        { majorId: seb, level: 2 },
      ],
    },
    {
      code: "CS201",
      name: "هياكل البيانات",
      nameEn: "Data Structures",
      departmentId: cs,
      creditHours: 3,
      majors: [
        { majorId: csb, level: 3 },
        { majorId: seb, level: 3 },
        { majorId: isb, level: 3, isRequired: false },
      ],
    },
    {
      code: "SE201",
      name: "هندسة البرمجيات",
      nameEn: "Software Engineering",
      departmentId: cs,
      creditHours: 3,
      majors: [
        { majorId: seb, level: 3 },
        { majorId: csb, level: 4, isRequired: false },
      ],
    },
    {
      code: "IS101",
      name: "أساسيات نظم المعلومات",
      nameEn: "Information Systems Fundamentals",
      departmentId: is,
      creditHours: 3,
      majors: [{ majorId: isb, level: 1 }],
    },
    {
      code: "MATH101",
      name: "حساب التفاضل والتكامل 1",
      nameEn: "Calculus I",
      departmentId: null,
      creditHours: 3,
      majors: [
        { majorId: csb, level: 1 },
        { majorId: seb, level: 1 },
        { majorId: isb, level: 1 },
      ],
    },
  ];
  const courseIds = new Map<string, string>();
  for (const c of courses) {
    const row = await prisma.course.upsert({
      where: { tenantId_code: { tenantId, code: c.code } },
      update: {
        name: c.name,
        nameEn: c.nameEn,
        departmentId: c.departmentId,
        creditHours: c.creditHours,
        isActive: true,
        deletedAt: null,
      },
      create: {
        tenantId,
        code: c.code,
        name: c.name,
        nameEn: c.nameEn,
        departmentId: c.departmentId,
        creditHours: c.creditHours,
      },
    });
    courseIds.set(c.code, row.id);
    await prisma.courseMajor.deleteMany({ where: { tenantId, courseId: row.id } });
    await prisma.courseMajor.createMany({
      data: await Promise.all(
        c.majors.map(async (m) => ({
          tenantId,
          courseId: row.id,
          majorId: m.majorId,
          levelId: await level(m.majorId, m.level),
          isRequired: m.isRequired ?? true,
        })),
      ),
    });
  }

  // 30 students: student1 (443100001) already exists; add 29 more with the STUDENT role.
  const studentRole = await prisma.role.findUniqueOrThrow({
    where: { tenantId_code: { tenantId, code: "STUDENT" } },
  });
  const hash = await pw("Student@123456");
  const studentIds: string[] = [];
  for (let n = 1; n <= 30; n++) {
    const email = `student${n}@demo.edu`;
    const u = await prisma.user.upsert({
      where: { tenantId_email: { tenantId, email } },
      update: { status: "ACTIVE", deletedAt: null },
      create: {
        tenantId,
        email,
        name: n === 1 ? "محمد الطالب" : `${STUDENT_NAMES[n - 1]} الطالب${n % 2 ? "" : "ة"}`,
        academicId: `4431000${String(n).padStart(2, "0")}`,
        passwordHash: hash,
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
        profile: { create: {} },
      },
    });
    await prisma.userRole.upsert({
      where: { tenantId_userId_roleId: { tenantId, userId: u.id, roleId: studentRole.id } },
      update: {},
      create: { tenantId, userId: u.id, roleId: studentRole.id },
    });
    studentIds.push(u.id);
  }

  // 4 OPEN sections in the current semester, taught by EMP-0101.
  const semester = await prisma.semester.findFirstOrThrow({ where: { tenantId, isCurrent: true } });
  const instructor = await prisma.user.findUniqueOrThrow({
    where: { tenantId_email: { tenantId, email: "dr.ahmad@demo.edu" } },
  });
  const offerings: {
    code: string;
    section: string;
    capacity: number;
    location: string;
    schedule: unknown;
    students: number[];
  }[] = [
    {
      code: "CS101",
      section: "1",
      capacity: 40,
      location: "قاعة 101",
      schedule: [
        { day: "SUN", startTime: "08:00", endTime: "09:40", room: "101" },
        { day: "TUE", startTime: "08:00", endTime: "09:40", room: "101" },
      ],
      students: [...Array(20).keys()],
    },
    {
      code: "CS101",
      section: "2",
      capacity: 40,
      location: "قاعة 102",
      schedule: [
        { day: "MON", startTime: "10:00", endTime: "11:40", room: "102" },
        { day: "WED", startTime: "10:00", endTime: "11:40", room: "102" },
      ],
      students: [...Array(10).keys()].map((i) => i + 20),
    },
    {
      code: "MATH101",
      section: "1",
      capacity: 60,
      location: "مدرج A",
      schedule: [
        { day: "SUN", startTime: "10:00", endTime: "11:40", room: "A" },
        { day: "THU", startTime: "10:00", endTime: "11:40", room: "A" },
      ],
      students: [...Array(30).keys()],
    },
    {
      code: "IS101",
      section: "1",
      capacity: 35,
      location: "قاعة 201",
      schedule: [{ day: "MON", startTime: "13:00", endTime: "14:40", room: "201" }],
      students: [...Array(8).keys()].map((i) => i * 3),
    },
  ];
  let enrolments = 0;
  for (const o of offerings) {
    const courseId = courseIds.get(o.code)!;
    const off = await prisma.courseOffering.upsert({
      where: {
        tenantId_courseId_semesterId_section: {
          tenantId,
          courseId,
          semesterId: semester.id,
          section: o.section,
        },
      },
      update: {
        status: "OPEN",
        capacity: o.capacity,
        location: o.location,
        schedule: o.schedule as object,
        deletedAt: null,
      },
      create: {
        tenantId,
        courseId,
        semesterId: semester.id,
        section: o.section,
        status: "OPEN",
        capacity: o.capacity,
        location: o.location,
        schedule: o.schedule as object,
      },
    });
    await prisma.offeringInstructor.upsert({
      where: { tenantId_offeringId_userId: { tenantId, offeringId: off.id, userId: instructor.id } },
      update: { role: "PRIMARY" },
      create: { tenantId, offeringId: off.id, userId: instructor.id, role: "PRIMARY" },
    });
    const res = await prisma.enrollment.createMany({
      data: o.students.map((i) => ({
        tenantId,
        offeringId: off.id,
        studentId: studentIds[i]!,
        status: "ACTIVE",
        source: "IMPORT",
      })),
      skipDuplicates: true,
    });
    enrolments += res.count;
  }
  console.log(
    `✓ courses: ${courses.length} courses, ${offerings.length} offerings, 30 students, +${enrolments} enrolments`,
  );
}

/** Minimal single-page PDF (valid magic bytes + xref) so the download really opens. */
function samplePdf(title: string): Buffer {
  const text = `BT /F1 24 Tf 72 720 Td (${title.replace(/[()\\]/g, "")}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

async function seedFiles(tenantId: string) {
  if ((process.env.STORAGE_DRIVER ?? "local") !== "local") {
    console.log("✓ files: skipped (STORAGE_DRIVER != local)");
    return;
  }
  const storage = new LocalStorage(
    path.resolve(process.cwd(), process.env.STORAGE_LOCAL_ROOT ?? "./storage"),
  );
  const uploader = await prisma.user.findUniqueOrThrow({
    where: { tenantId_email: { tenantId, email: "dr.ahmad@demo.edu" } },
    select: { id: true },
  });
  const course = await prisma.course.findUniqueOrThrow({
    where: { tenantId_code: { tenantId, code: "CS101" } },
  });
  const offering = await prisma.courseOffering.findFirstOrThrow({
    where: { tenantId, courseId: course.id, section: "1", deletedAt: null },
    select: { id: true },
  });
  const samples: {
    slug: string;
    name: string;
    mimeType: string;
    category: "LECTURE" | "REFERENCE";
    classification: "INTERNAL" | "PUBLIC";
    description: string;
    body: Buffer;
    offeringId: string | null;
  }[] = [
    {
      slug: "seed-cs101-lecture-01.pdf",
      name: "المحاضرة 1 — مقدمة في البرمجة.pdf",
      mimeType: "application/pdf",
      category: "LECTURE",
      classification: "INTERNAL",
      description: "شرائح المحاضرة الأولى: ما البرمجة؟ المتغيرات والأنواع.",
      body: samplePdf("CS101 - Lecture 1"),
      offeringId: offering.id,
    },
    {
      slug: "seed-cs101-syllabus.md",
      name: "خطة المقرر CS101.md",
      mimeType: "text/markdown",
      category: "REFERENCE",
      classification: "PUBLIC",
      description: "توصيف المقرر، التقييم، والمراجع لكل شُعب CS101.",
      body: Buffer.from(
        "# CS101 — مقدمة في البرمجة\n\n- الساعات: 4\n- التقييم: واجبات 20٪، اختبار نصفي 30٪، نهائي 50٪\n- المرجع: Think Python\n",
        "utf8",
      ),
      offeringId: null,
    },
  ];
  let n = 0;
  for (const f of samples) {
    const storageKey = `${tenantId}/${course.id}/${f.slug}`;
    if (!(await storage.exists(storageKey)))
      await storage.put(storageKey, Readable.from(f.body), {
        contentType: f.mimeType,
        maxBytes: 1024 * 1024,
      });
    const checksum = createHash("sha256").update(f.body).digest("hex");
    await prisma.file.upsert({
      where: { tenantId_storageKey: { tenantId, storageKey } },
      update: { deletedAt: null, size: f.body.length, checksum },
      create: {
        tenantId,
        uploaderId: uploader.id,
        courseId: course.id,
        offeringId: f.offeringId,
        name: f.name,
        originalName: f.slug,
        storageKey,
        mimeType: f.mimeType,
        size: f.body.length,
        checksum,
        category: f.category,
        classification: f.classification,
        status: "APPROVED",
        description: f.description,
      },
    });
    n++;
  }
  console.log(`✓ files: ${n} sample files on CS101 (local storage)`);
}

/**
 * Sample notifications (P1-07): a tenant-wide announcement by the admin (everyone, ~half read), a section notice by
 * dr.ahmad to CS101 s1 (students + co-instructors), and a system notice to the admin only. Idempotent: matched by
 * (tenantId, title) and re-fanned out on every run.
 */
async function seedNotifications(tenantId: string) {
  const [admin, instructor] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { tenantId_email: { tenantId, email: "admin@demo.edu" } },
      select: { id: true },
    }),
    prisma.user.findUniqueOrThrow({
      where: { tenantId_email: { tenantId, email: "dr.ahmad@demo.edu" } },
      select: { id: true },
    }),
  ]);
  const course = await prisma.course.findUniqueOrThrow({
    where: { tenantId_code: { tenantId, code: "CS101" } },
    select: { id: true },
  });
  const offering = await prisma.courseOffering.findFirstOrThrow({
    where: { tenantId, courseId: course.id, section: "1", deletedAt: null },
    select: { id: true },
  });

  type Sample = {
    title: string;
    body: string;
    type: "ANNOUNCEMENT" | "ACADEMIC" | "SYSTEM";
    priority: "NORMAL" | "HIGH";
    link: string | null;
    senderId: string | null;
    target: Prisma.InputJsonObject;
    recipients: () => Promise<string[]>;
    readRatio: number;
  };
  const samples: Sample[] = [
    {
      title: "بدء الفصل الدراسي الأول 2026/2027",
      body: "نرحّب بكم في الفصل الجديد. يُرجى مراجعة الجداول الدراسية وتحديث بياناتكم الشخصية قبل نهاية الأسبوع الأول.",
      type: "ANNOUNCEMENT",
      priority: "NORMAL",
      link: "/dashboard",
      senderId: admin.id,
      target: { kind: "ALL" },
      recipients: async () =>
        (
          await prisma.user.findMany({
            where: { tenantId, deletedAt: null, status: "ACTIVE", id: { not: admin.id } },
            select: { id: true },
          })
        ).map((u) => u.id),
      readRatio: 0.5,
    },
    {
      title: "CS101 — رُفعت محاضرة الأسبوع الأول",
      body: "ملف المحاضرة الأولى متاح الآن في مكتبة الملفات. يُرجى قراءته قبل اللقاء القادم.",
      type: "ACADEMIC",
      priority: "HIGH",
      link: "/files",
      senderId: instructor.id,
      target: { kind: "OFFERING", ids: [offering.id] },
      recipients: async () => {
        const [students, staff] = await Promise.all([
          prisma.enrollment.findMany({
            where: { tenantId, offeringId: offering.id, status: "ACTIVE" },
            select: { studentId: true },
          }),
          prisma.offeringInstructor.findMany({
            where: { tenantId, offeringId: offering.id, userId: { not: instructor.id } },
            select: { userId: true },
          }),
        ]);
        return [...students.map((s) => s.studentId), ...staff.map((s) => s.userId)];
      },
      readRatio: 0.3,
    },
    {
      title: "تم تهيئة المستأجر بنجاح",
      body: "أُنشئت بيانات العرض (الأدوار، المستخدمون، البنية الأكاديمية، المقررات، الملفات). هذا إشعار نظامي لا يخضع لتفضيلات الاستلام.",
      type: "SYSTEM",
      priority: "NORMAL",
      link: "/developer",
      senderId: null,
      target: { kind: "USERS", ids: [admin.id] },
      recipients: async () => [admin.id],
      readRatio: 0,
    },
  ];

  let delivered = 0;
  for (const s of samples) {
    const existing = await prisma.notification.findFirst({
      where: { tenantId, title: s.title },
      select: { id: true },
    });
    const ids = await s.recipients();
    const now = new Date();
    const n = existing
      ? await prisma.notification.update({
          where: { id: existing.id },
          data: {
            body: s.body,
            type: s.type,
            priority: s.priority,
            link: s.link,
            targetSpec: s.target,
            recipientCount: ids.length,
            deletedAt: null,
          },
          select: { id: true },
        })
      : await prisma.notification.create({
          data: {
            tenantId,
            senderId: s.senderId,
            type: s.type,
            priority: s.priority,
            title: s.title,
            body: s.body,
            link: s.link,
            targetSpec: s.target,
            recipientCount: ids.length,
            sentAt: now,
          },
          select: { id: true },
        });
    const readUpTo = Math.floor(ids.length * s.readRatio);
    await prisma.notificationRecipient.createMany({
      data: ids.map((userId, i) => ({
        tenantId,
        notificationId: n.id,
        userId,
        deliveredAt: now,
        readAt: i < readUpTo ? now : null,
      })),
      skipDuplicates: true,
    });
    delivered += ids.length;
  }
  console.log(`✓ notifications: ${samples.length} samples, ${delivered} recipient rows`);
}

async function main() {
  await seedPermissions();
  await seedPlatformAdmin();
  const tenant = await seedDemoTenant();
  await seedAcademic(tenant.id);
  await seedCourses(tenant.id);
  await seedFiles(tenant.id);
  await seedNotifications(tenant.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
