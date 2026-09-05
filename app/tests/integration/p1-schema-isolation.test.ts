/**
 * P1-01 schema — tenant isolation + integrity rules for every new model
 * (docs/30-architecture/01-MULTI-TENANCY.md §8, 02-DATA-MODEL.md §3, ADR-0006).
 *  - every new table has RLS enabled + forced + `tenant_isolation` policy
 *  - rows of tenant A are invisible to tenant B
 *  - composite FKs refuse cross-tenant links
 *  - one current AcademicYear / Semester per tenant (partial unique index)
 *  - CHECK constraints (dates, level number)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, platformPrisma } from "@/lib/db";
import { basePrisma } from "@/lib/db/prisma";

const NEW_TABLES = [
  "AcademicYear",
  "Semester",
  "College",
  "Department",
  "Major",
  "Level",
  "Course",
  "CourseMajor",
  "CourseOffering",
  "OfferingInstructor",
  "Enrollment",
  "File",
  "FileDownloadLog",
  "Notification",
  "NotificationRecipient",
  "NotificationPreference",
  "Job",
  "PasswordResetToken",
] as const;

const suffix = Date.now().toString(36);
let A = "";
let B = "";

beforeAll(async () => {
  A = (await platformPrisma.tenant.create({ data: { slug: `p1a-${suffix}`, name: "P1 A" } })).id;
  B = (await platformPrisma.tenant.create({ data: { slug: `p1b-${suffix}`, name: "P1 B" } })).id;
});

afterAll(async () => {
  await platformPrisma.tenant.deleteMany({ where: { id: { in: [A, B] } } });
  await platformPrisma.$disconnect();
  await basePrisma.$disconnect();
});

describe("P1-01 tables are RLS-protected", () => {
  it("every new table has RLS enabled, forced, and the tenant_isolation policy", async () => {
    const rows = await platformPrisma.$queryRaw<
      { relname: string; rls: boolean; forced: boolean; policies: bigint }[]
    >`
      SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
             (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY(${[...NEW_TABLES]})`;
    expect(rows.map((r) => r.relname).sort()).toEqual([...NEW_TABLES].sort());
    for (const r of rows) {
      expect(r.rls, `${r.relname} rls`).toBe(true);
      expect(r.forced, `${r.relname} forced`).toBe(true);
      expect(Number(r.policies), `${r.relname} policy`).toBe(1);
    }
  });
});

describe("P1-01 academic structure", () => {
  it("full chain college→department→major→level→course→offering→enrollment is isolated per tenant", async () => {
    const a = db(A);
    const year = await a.academicYear.create({
      data: {
        tenantId: A,
        code: "2026/2027",
        name: "2026/2027",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-06-30"),
        isCurrent: true,
      },
    });
    const sem = await a.semester.create({
      data: {
        tenantId: A,
        academicYearId: year.id,
        term: "FIRST",
        name: "الفصل الأول",
        startDate: new Date("2026-09-01"),
        endDate: new Date("2027-01-15"),
        isCurrent: true,
      },
    });
    const college = await a.college.create({ data: { tenantId: A, code: "ENG", name: "الهندسة" } });
    const dept = await a.department.create({
      data: { tenantId: A, collegeId: college.id, code: "CS", name: "علوم الحاسب" },
    });
    const major = await a.major.create({
      data: { tenantId: A, departmentId: dept.id, code: "CS-BSC", name: "بكالوريوس علوم الحاسب" },
    });
    const level = await a.level.create({
      data: { tenantId: A, majorId: major.id, number: 1, name: "المستوى الأول" },
    });
    const course = await a.course.create({
      data: { tenantId: A, departmentId: dept.id, code: "CS101", name: "مقدمة في البرمجة" },
    });
    await a.courseMajor.create({
      data: { tenantId: A, courseId: course.id, majorId: major.id, levelId: level.id },
    });
    const offering = await a.courseOffering.create({
      data: { tenantId: A, courseId: course.id, semesterId: sem.id, status: "OPEN" },
    });
    const student = await a.user.create({
      data: { tenantId: A, academicId: "S-1", email: `s1-${suffix}@a.test`, name: "Student" },
    });
    const enr = await a.enrollment.create({
      data: { tenantId: A, offeringId: offering.id, studentId: student.id },
    });

    const b = db(B);
    expect(await b.academicYear.count()).toBe(0);
    expect(await b.college.count()).toBe(0);
    expect(await b.course.count()).toBe(0);
    expect(await b.courseOffering.count()).toBe(0);
    expect(await b.enrollment.findUnique({ where: { id: enr.id } })).toBeNull();
    expect(await basePrisma.enrollment.count()).toBe(0); // no GUC → fail closed

    // cross-tenant composite FK: tenant B cannot enrol into A's offering
    const sb = await b.user.create({
      data: { tenantId: B, academicId: "S-1", email: `s1-${suffix}@b.test`, name: "B Student" },
    });
    await expect(
      b.enrollment.create({ data: { tenantId: B, offeringId: offering.id, studentId: sb.id } }),
    ).rejects.toThrow();
  });

  it("only one current academic year and one current semester per tenant", async () => {
    const a = db(A);
    await expect(
      a.academicYear.create({
        data: {
          tenantId: A,
          code: "2027/2028",
          name: "2027/2028",
          startDate: new Date("2027-09-01"),
          endDate: new Date("2028-06-30"),
          isCurrent: true,
        },
      }),
    ).rejects.toThrow(/unique/i);
    // a second tenant may have its own current year
    await expect(
      db(B).academicYear.create({
        data: {
          tenantId: B,
          code: "2026/2027",
          name: "2026/2027",
          startDate: new Date("2026-09-01"),
          endDate: new Date("2027-06-30"),
          isCurrent: true,
        },
      }),
    ).resolves.toBeTruthy();
  });

  it("CHECK constraints reject inverted dates and invalid level numbers", async () => {
    const a = db(A);
    await expect(
      a.academicYear.create({
        data: {
          tenantId: A,
          code: "BAD",
          name: "bad",
          startDate: new Date("2027-06-30"),
          endDate: new Date("2026-09-01"),
        },
      }),
    ).rejects.toThrow();
    const major = await a.major.findFirstOrThrow();
    await expect(
      a.level.create({ data: { tenantId: A, majorId: major.id, number: 0, name: "x" } }),
    ).rejects.toThrow();
  });

  it("Restrict: a college with departments cannot be deleted", async () => {
    const a = db(A);
    const college = await a.college.findFirstOrThrow();
    await expect(a.college.delete({ where: { id: college.id } })).rejects.toThrow();
  });
});

describe("P1-01 content, communication, system", () => {
  it("files, notifications and jobs are tenant-scoped; recipients are per user", async () => {
    const a = db(A);
    const uploader = await a.user.findFirstOrThrow();
    const offering = await a.courseOffering.findFirstOrThrow();
    const file = await a.file.create({
      data: {
        tenantId: A,
        uploaderId: uploader.id,
        offeringId: offering.id,
        name: "lecture1.pdf",
        originalName: "lecture1.pdf",
        storageKey: `${A}/${offering.courseId}/${suffix}.pdf`,
        mimeType: "application/pdf",
        size: 1024,
        checksum: "a".repeat(64),
        category: "LECTURE",
      },
    });
    await a.fileDownloadLog.create({ data: { tenantId: A, fileId: file.id, userId: uploader.id } });
    const n = await a.notification.create({
      data: {
        tenantId: A,
        senderId: uploader.id,
        title: "T",
        body: "B",
        targetSpec: { kind: "USERS", ids: [uploader.id] },
        recipientCount: 1,
        sentAt: new Date(),
      },
    });
    await a.notificationRecipient.create({
      data: { tenantId: A, notificationId: n.id, userId: uploader.id },
    });
    await a.notificationPreference.create({
      data: { tenantId: A, userId: uploader.id, channel: "IN_APP", type: "ANNOUNCEMENT", enabled: false },
    });
    await a.job.create({ data: { tenantId: A, type: "trash.purge", payload: {} } });
    await a.passwordResetToken.create({
      data: {
        tenantId: A,
        userId: uploader.id,
        tokenHash: `h-${suffix}`,
        expiresAt: new Date(Date.now() + 600_000),
      },
    });

    const b = db(B);
    expect(await b.file.count()).toBe(0);
    expect(await b.fileDownloadLog.count()).toBe(0);
    expect(await b.notification.count()).toBe(0);
    expect(await b.notificationRecipient.count()).toBe(0);
    expect(await b.notificationPreference.count()).toBe(0);
    expect(await b.job.count()).toBe(0);
    expect(await b.passwordResetToken.count()).toBe(0);
    expect(await basePrisma.file.count()).toBe(0);

    // deleting a notification cascades to its recipients, not to users
    await a.notification.delete({ where: { id: n.id } });
    expect(await a.notificationRecipient.count()).toBe(0);
    expect(await a.user.count()).toBeGreaterThan(0);
  });
});
