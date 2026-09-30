-- P1-14 profile: persisted appearance + avatar storage key. UserProfile already has RLS (rls_p0).
ALTER TABLE "UserProfile" ADD COLUMN "avatarStorageKey" TEXT;
ALTER TABLE "UserProfile" ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'DARK';
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_theme_chk" CHECK ("theme" IN ('DARK', 'LIGHT', 'SYSTEM'));
