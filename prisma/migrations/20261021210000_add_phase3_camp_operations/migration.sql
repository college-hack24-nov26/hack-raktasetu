-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('REGISTERED', 'CHECKED_IN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScreeningStatus" AS ENUM ('PENDING', 'CLEARED', 'DEFERRED', 'NOT_COMPLETED');

-- CreateEnum
CREATE TYPE "DonationOutcome" AS ENUM ('COMPLETED', 'DEFERRED', 'NOT_PERFORMED', 'ADVERSE_EVENT_STOPPED');

-- CreateEnum
CREATE TYPE "DonationType" AS ENUM ('WHOLE_BLOOD', 'APHERESIS_PLATELETS', 'APHERESIS_PLASMA');

-- AlterTable
ALTER TABLE "camps" ADD COLUMN     "isReadyForCollection" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "readinessChecklist" JSONB,
ADD COLUMN     "readinessNotes" TEXT,
ADD COLUMN     "readinessVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "readinessVerifiedBy" TEXT;

-- CreateTable
CREATE TABLE "camp_attendances" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "donorProfileId" TEXT,
    "donorName" TEXT NOT NULL,
    "donorPhone" TEXT NOT NULL,
    "bloodGroup" "BloodGroup",
    "status" "AttendanceStatus" NOT NULL DEFAULT 'REGISTERED',
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedInAt" TIMESTAMP(3),
    "checkedInBy" TEXT,
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "camp_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_screenings" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "donorUserId" TEXT NOT NULL,
    "screenedBy" TEXT NOT NULL,
    "status" "ScreeningStatus" NOT NULL DEFAULT 'PENDING',
    "consentVersion" TEXT NOT NULL DEFAULT 'v1.0',
    "consentGiven" BOOLEAN NOT NULL DEFAULT true,
    "consentRecordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consentRecordedBy" TEXT,
    "eligibilityDecision" TEXT,
    "deferralCategory" TEXT,
    "deferralDurationDays" INTEGER,
    "deferredUntil" TIMESTAMP(3),
    "clinicalNotes" TEXT,
    "isAmended" BOOLEAN NOT NULL DEFAULT false,
    "amendedAt" TIMESTAMP(3),
    "amendedBy" TEXT,
    "amendmentReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_screenings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donation_events" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "screeningId" TEXT,
    "donorUserId" TEXT NOT NULL,
    "bloodGroup" "BloodGroup" NOT NULL,
    "donationType" "DonationType" NOT NULL DEFAULT 'WHOLE_BLOOD',
    "outcome" "DonationOutcome" NOT NULL DEFAULT 'COMPLETED',
    "volumeMl" INTEGER,
    "adverseReaction" BOOLEAN NOT NULL DEFAULT false,
    "adverseReactionNotes" TEXT,
    "recordedBy" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "donation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "camp_attendances_campId_status_idx" ON "camp_attendances"("campId", "status");

-- CreateIndex
CREATE INDEX "camp_attendances_userId_idx" ON "camp_attendances"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "camp_attendances_campId_userId_key" ON "camp_attendances"("campId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "clinical_screenings_attendanceId_key" ON "clinical_screenings"("attendanceId");

-- CreateIndex
CREATE INDEX "clinical_screenings_campId_status_idx" ON "clinical_screenings"("campId", "status");

-- CreateIndex
CREATE INDEX "clinical_screenings_donorUserId_idx" ON "clinical_screenings"("donorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "donation_events_attendanceId_key" ON "donation_events"("attendanceId");

-- CreateIndex
CREATE UNIQUE INDEX "donation_events_screeningId_key" ON "donation_events"("screeningId");

-- CreateIndex
CREATE INDEX "donation_events_campId_outcome_idx" ON "donation_events"("campId", "outcome");

-- CreateIndex
CREATE INDEX "donation_events_donorUserId_idx" ON "donation_events"("donorUserId");

-- AddForeignKey
ALTER TABLE "camp_attendances" ADD CONSTRAINT "camp_attendances_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camp_attendances" ADD CONSTRAINT "camp_attendances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camp_attendances" ADD CONSTRAINT "camp_attendances_donorProfileId_fkey" FOREIGN KEY ("donorProfileId") REFERENCES "donor_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_screenings" ADD CONSTRAINT "clinical_screenings_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_screenings" ADD CONSTRAINT "clinical_screenings_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "camp_attendances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_screenings" ADD CONSTRAINT "clinical_screenings_donorUserId_fkey" FOREIGN KEY ("donorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_events" ADD CONSTRAINT "donation_events_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_events" ADD CONSTRAINT "donation_events_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "camp_attendances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_events" ADD CONSTRAINT "donation_events_screeningId_fkey" FOREIGN KEY ("screeningId") REFERENCES "clinical_screenings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_events" ADD CONSTRAINT "donation_events_donorUserId_fkey" FOREIGN KEY ("donorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
