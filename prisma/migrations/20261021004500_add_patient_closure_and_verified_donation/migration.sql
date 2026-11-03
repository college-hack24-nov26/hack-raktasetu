-- AlterTable: Add backward-compatible fields to donor_profiles
ALTER TABLE "donor_profiles" 
ADD COLUMN IF NOT EXISTS "cityOrLocality" TEXT,
ADD COLUMN IF NOT EXISTS "verifiedLastDonationDate" TIMESTAMP(3);

-- AlterTable: Add backward-compatible patient, closure outcome and verified donation fields to blood_requests
ALTER TABLE "blood_requests" 
ADD COLUMN IF NOT EXISTS "patientName" TEXT,
ADD COLUMN IF NOT EXISTS "closureOutcome" TEXT,
ADD COLUMN IF NOT EXISTS "closureFeedback" TEXT,
ADD COLUMN IF NOT EXISTS "closureReportedBy" TEXT,
ADD COLUMN IF NOT EXISTS "reportedDonationStatus" TEXT,
ADD COLUMN IF NOT EXISTS "reportedDonorId" TEXT,
ADD COLUMN IF NOT EXISTS "donationVerifiedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "verifiedBy" TEXT;
