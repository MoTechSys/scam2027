-- CreateEnum
CREATE TYPE "SemesterTerm" AS ENUM ('FIRST', 'SECOND', 'SUMMER');

-- CreateEnum
CREATE TYPE "SemesterStatus" AS ENUM ('PLANNED', 'ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DegreeType" AS ENUM ('DIPLOMA', 'BACHELOR', 'MASTER', 'PHD');

-- CreateEnum
CREATE TYPE "OfferingStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InstructorRole" AS ENUM ('PRIMARY', 'CO_INSTRUCTOR', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'WITHDRAWN', 'COMPLETED');

-- CreateEnum
CREATE TYPE "EnrollmentSource" AS ENUM ('MANUAL', 'BULK', 'IMPORT', 'SELF');

-- CreateEnum
CREATE TYPE "FileCategory" AS ENUM ('LECTURE', 'ASSIGNMENT', 'EXAM', 'REFERENCE', 'OTHER');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DataClassification" AS ENUM ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ANNOUNCEMENT', 'SYSTEM', 'ACADEMIC', 'FILE', 'QUIZ', 'ASSIGNMENT', 'GRADE', 'ATTENDANCE', 'SECURITY');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'PUSH');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "AcademicYear" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Semester" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "term" "SemesterTerm" NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "registrationOpensAt" TIMESTAMP(3),
    "registrationClosesAt" TIMESTAMP(3),
    "status" "SemesterStatus" NOT NULL DEFAULT 'PLANNED',
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Semester_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "College" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "College_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "collegeId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Major" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "degree" "DegreeType" NOT NULL DEFAULT 'BACHELOR',
    "durationYears" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Major_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Level" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "majorId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Level_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "departmentId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "creditHours" INTEGER NOT NULL DEFAULT 3,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseMajor" (
    "tenantId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "majorId" UUID NOT NULL,
    "levelId" UUID,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseMajor_pkey" PRIMARY KEY ("tenantId","courseId","majorId")
);

-- CreateTable
CREATE TABLE "CourseOffering" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "semesterId" UUID NOT NULL,
    "section" TEXT NOT NULL DEFAULT '1',
    "status" "OfferingStatus" NOT NULL DEFAULT 'DRAFT',
    "capacity" INTEGER,
    "location" TEXT,
    "schedule" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferingInstructor" (
    "tenantId" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "InstructorRole" NOT NULL DEFAULT 'PRIMARY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferingInstructor_pkey" PRIMARY KEY ("tenantId","offeringId","userId")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "offeringId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "source" "EnrollmentSource" NOT NULL DEFAULT 'MANUAL',
    "enrolledBy" UUID,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "uploaderId" UUID NOT NULL,
    "courseId" UUID,
    "offeringId" UUID,
    "name" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "category" "FileCategory" NOT NULL DEFAULT 'OTHER',
    "classification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "status" "FileStatus" NOT NULL DEFAULT 'APPROVED',
    "reviewedBy" UUID,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "description" TEXT,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileDownloadLog" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileDownloadLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "senderId" UUID,
    "type" "NotificationType" NOT NULL DEFAULT 'ANNOUNCEMENT',
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "targetSpec" JSONB NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "tenantId" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("tenantId","notificationId","userId")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "type" "NotificationType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("tenantId","userId","channel","type")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "requestedIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcademicYear_tenantId_startDate_idx" ON "AcademicYear"("tenantId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_tenantId_id_key" ON "AcademicYear"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_tenantId_code_key" ON "AcademicYear"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Semester_tenantId_status_idx" ON "Semester"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Semester_tenantId_id_key" ON "Semester"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Semester_tenantId_academicYearId_term_key" ON "Semester"("tenantId", "academicYearId", "term");

-- CreateIndex
CREATE INDEX "College_tenantId_isActive_sortOrder_idx" ON "College"("tenantId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "College_tenantId_id_key" ON "College"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "College_tenantId_code_key" ON "College"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Department_tenantId_collegeId_sortOrder_idx" ON "Department"("tenantId", "collegeId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Department_tenantId_id_key" ON "Department"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Department_tenantId_code_key" ON "Department"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Major_tenantId_departmentId_sortOrder_idx" ON "Major"("tenantId", "departmentId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Major_tenantId_id_key" ON "Major"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Major_tenantId_code_key" ON "Major"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Level_tenantId_id_key" ON "Level"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Level_tenantId_majorId_number_key" ON "Level"("tenantId", "majorId", "number");

-- CreateIndex
CREATE INDEX "Course_tenantId_deletedAt_idx" ON "Course"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "Course_tenantId_departmentId_idx" ON "Course"("tenantId", "departmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Course_tenantId_id_key" ON "Course"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Course_tenantId_code_key" ON "Course"("tenantId", "code");

-- CreateIndex
CREATE INDEX "CourseMajor_tenantId_majorId_levelId_idx" ON "CourseMajor"("tenantId", "majorId", "levelId");

-- CreateIndex
CREATE INDEX "CourseOffering_tenantId_semesterId_status_idx" ON "CourseOffering"("tenantId", "semesterId", "status");

-- CreateIndex
CREATE INDEX "CourseOffering_tenantId_deletedAt_idx" ON "CourseOffering"("tenantId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CourseOffering_tenantId_id_key" ON "CourseOffering"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CourseOffering_tenantId_courseId_semesterId_section_key" ON "CourseOffering"("tenantId", "courseId", "semesterId", "section");

-- CreateIndex
CREATE INDEX "OfferingInstructor_tenantId_userId_idx" ON "OfferingInstructor"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "Enrollment_tenantId_studentId_status_idx" ON "Enrollment"("tenantId", "studentId", "status");

-- CreateIndex
CREATE INDEX "Enrollment_tenantId_offeringId_status_idx" ON "Enrollment"("tenantId", "offeringId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_tenantId_id_key" ON "Enrollment"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_tenantId_offeringId_studentId_key" ON "Enrollment"("tenantId", "offeringId", "studentId");

-- CreateIndex
CREATE INDEX "File_tenantId_deletedAt_status_idx" ON "File"("tenantId", "deletedAt", "status");

-- CreateIndex
CREATE INDEX "File_tenantId_offeringId_category_idx" ON "File"("tenantId", "offeringId", "category");

-- CreateIndex
CREATE INDEX "File_tenantId_courseId_idx" ON "File"("tenantId", "courseId");

-- CreateIndex
CREATE INDEX "File_tenantId_uploaderId_idx" ON "File"("tenantId", "uploaderId");

-- CreateIndex
CREATE UNIQUE INDEX "File_tenantId_id_key" ON "File"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "File_tenantId_storageKey_key" ON "File"("tenantId", "storageKey");

-- CreateIndex
CREATE INDEX "FileDownloadLog_tenantId_fileId_createdAt_idx" ON "FileDownloadLog"("tenantId", "fileId", "createdAt");

-- CreateIndex
CREATE INDEX "FileDownloadLog_tenantId_createdAt_idx" ON "FileDownloadLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_tenantId_senderId_createdAt_idx" ON "Notification"("tenantId", "senderId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_tenantId_deletedAt_createdAt_idx" ON "Notification"("tenantId", "deletedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_tenantId_id_key" ON "Notification"("tenantId", "id");

-- CreateIndex
CREATE INDEX "NotificationRecipient_tenantId_userId_readAt_archivedAt_idx" ON "NotificationRecipient"("tenantId", "userId", "readAt", "archivedAt");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE INDEX "Job_tenantId_type_createdAt_idx" ON "Job"("tenantId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_tenantId_userId_idx" ON "PasswordResetToken"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "AcademicYear" ADD CONSTRAINT "AcademicYear_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_tenantId_academicYearId_fkey" FOREIGN KEY ("tenantId", "academicYearId") REFERENCES "AcademicYear"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "College" ADD CONSTRAINT "College_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_tenantId_collegeId_fkey" FOREIGN KEY ("tenantId", "collegeId") REFERENCES "College"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Major" ADD CONSTRAINT "Major_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Major" ADD CONSTRAINT "Major_tenantId_departmentId_fkey" FOREIGN KEY ("tenantId", "departmentId") REFERENCES "Department"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Level" ADD CONSTRAINT "Level_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Level" ADD CONSTRAINT "Level_tenantId_majorId_fkey" FOREIGN KEY ("tenantId", "majorId") REFERENCES "Major"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_tenantId_departmentId_fkey" FOREIGN KEY ("tenantId", "departmentId") REFERENCES "Department"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMajor" ADD CONSTRAINT "CourseMajor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMajor" ADD CONSTRAINT "CourseMajor_tenantId_courseId_fkey" FOREIGN KEY ("tenantId", "courseId") REFERENCES "Course"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMajor" ADD CONSTRAINT "CourseMajor_tenantId_majorId_fkey" FOREIGN KEY ("tenantId", "majorId") REFERENCES "Major"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseMajor" ADD CONSTRAINT "CourseMajor_tenantId_levelId_fkey" FOREIGN KEY ("tenantId", "levelId") REFERENCES "Level"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOffering" ADD CONSTRAINT "CourseOffering_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOffering" ADD CONSTRAINT "CourseOffering_tenantId_courseId_fkey" FOREIGN KEY ("tenantId", "courseId") REFERENCES "Course"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOffering" ADD CONSTRAINT "CourseOffering_tenantId_semesterId_fkey" FOREIGN KEY ("tenantId", "semesterId") REFERENCES "Semester"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferingInstructor" ADD CONSTRAINT "OfferingInstructor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferingInstructor" ADD CONSTRAINT "OfferingInstructor_tenantId_offeringId_fkey" FOREIGN KEY ("tenantId", "offeringId") REFERENCES "CourseOffering"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferingInstructor" ADD CONSTRAINT "OfferingInstructor_tenantId_userId_fkey" FOREIGN KEY ("tenantId", "userId") REFERENCES "User"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_tenantId_offeringId_fkey" FOREIGN KEY ("tenantId", "offeringId") REFERENCES "CourseOffering"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES "User"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_tenantId_uploaderId_fkey" FOREIGN KEY ("tenantId", "uploaderId") REFERENCES "User"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_tenantId_courseId_fkey" FOREIGN KEY ("tenantId", "courseId") REFERENCES "Course"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_tenantId_offeringId_fkey" FOREIGN KEY ("tenantId", "offeringId") REFERENCES "CourseOffering"("tenantId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileDownloadLog" ADD CONSTRAINT "FileDownloadLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileDownloadLog" ADD CONSTRAINT "FileDownloadLog_tenantId_fileId_fkey" FOREIGN KEY ("tenantId", "fileId") REFERENCES "File"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileDownloadLog" ADD CONSTRAINT "FileDownloadLog_tenantId_userId_fkey" FOREIGN KEY ("tenantId", "userId") REFERENCES "User"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_tenantId_notificationId_fkey" FOREIGN KEY ("tenantId", "notificationId") REFERENCES "Notification"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_tenantId_userId_fkey" FOREIGN KEY ("tenantId", "userId") REFERENCES "User"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_tenantId_userId_fkey" FOREIGN KEY ("tenantId", "userId") REFERENCES "User"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_tenantId_userId_fkey" FOREIGN KEY ("tenantId", "userId") REFERENCES "User"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ───────────── Hand-written integrity rules (docs/30-architecture/02-DATA-MODEL.md §3, ADR-0006) ─────────────
-- Exactly one "current" academic year / semester per tenant.
CREATE UNIQUE INDEX "AcademicYear_tenantId_isCurrent_one" ON "AcademicYear" ("tenantId") WHERE "isCurrent" = true;
CREATE UNIQUE INDEX "Semester_tenantId_isCurrent_one" ON "Semester" ("tenantId") WHERE "isCurrent" = true;

-- Date sanity
ALTER TABLE "AcademicYear" ADD CONSTRAINT "AcademicYear_dates_chk" CHECK ("endDate" > "startDate");
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_dates_chk" CHECK ("endDate" > "startDate");
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_registration_chk"
  CHECK ("registrationClosesAt" IS NULL OR "registrationOpensAt" IS NULL OR "registrationClosesAt" > "registrationOpensAt");

-- Numeric sanity
ALTER TABLE "Level" ADD CONSTRAINT "Level_number_chk" CHECK ("number" BETWEEN 1 AND 20);
ALTER TABLE "Course" ADD CONSTRAINT "Course_creditHours_chk" CHECK ("creditHours" BETWEEN 0 AND 30);
ALTER TABLE "CourseOffering" ADD CONSTRAINT "CourseOffering_capacity_chk" CHECK ("capacity" IS NULL OR "capacity" > 0);
ALTER TABLE "File" ADD CONSTRAINT "File_size_chk" CHECK ("size" >= 0);
ALTER TABLE "Job" ADD CONSTRAINT "Job_attempts_chk" CHECK ("attempts" >= 0 AND "maxAttempts" >= 1);
