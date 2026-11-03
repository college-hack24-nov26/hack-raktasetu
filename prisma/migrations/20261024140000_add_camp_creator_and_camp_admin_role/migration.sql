-- AlterEnum
ALTER TYPE "CampStaffRole" ADD VALUE IF NOT EXISTS 'CAMP_ADMIN';

-- AlterTable
ALTER TABLE "camps" ADD COLUMN IF NOT EXISTS "createdById" TEXT;
ALTER TABLE "camps" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;
ALTER TABLE "camps" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "camps" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
ALTER TABLE "camps" ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3);

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'camps_createdById_fkey'
  ) THEN
    ALTER TABLE "camps" ADD CONSTRAINT "camps_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'camps_approvedById_fkey'
  ) THEN
    ALTER TABLE "camps" ADD CONSTRAINT "camps_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "camps_createdById_idx" ON "camps"("createdById");
