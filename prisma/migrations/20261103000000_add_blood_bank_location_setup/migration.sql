-- AlterTable
ALTER TABLE "organisations" ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION,
ADD COLUMN "locationStatus" TEXT NOT NULL DEFAULT 'UNCONFIGURED',
ADD COLUMN "locationConfirmedAt" TIMESTAMP(3),
ADD COLUMN "locationConfirmedBy" TEXT,
ADD COLUMN "locationAddress" TEXT;

-- AlterTable
ALTER TABLE "organisation_applications" ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION,
ADD COLUMN "locationAddress" TEXT;

-- CreateIndex
CREATE INDEX "organisations_locationStatus_idx" ON "organisations"("locationStatus");

