-- P1-11 (ADR-0009): when the password was last set — feeds security.passwordMaxAgeDays and the tenant-wide
-- "force change on next login" switch (compared against the TenantSetting row's updatedAt).
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
-- Backfill: existing accounts count from creation so max-age policies do not lock everyone out at once.
UPDATE "User" SET "passwordChangedAt" = "createdAt" WHERE "passwordHash" IS NOT NULL;
