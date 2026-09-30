-- P1-10 settings: keep the storage key of the tenant logo so replacing/removing it can delete the object.
ALTER TABLE "TenantBranding" ADD COLUMN "logoStorageKey" TEXT;
