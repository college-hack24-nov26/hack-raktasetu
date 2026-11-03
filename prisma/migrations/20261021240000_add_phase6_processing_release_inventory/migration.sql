-- AlterEnum
ALTER TYPE "ComponentUnitStatus" ADD VALUE 'AWAITING_CLINICAL_REVIEW';

-- CreateEnum
CREATE TYPE "TestCategory" AS ENUM ('TTI_SCREENING', 'BLOOD_GROUPING', 'ANTIBODY_SCREENING', 'COMPONENT_QC', 'OTHER');

-- CreateEnum
CREATE TYPE "TestType" AS ENUM ('HIV_ANTIBODY', 'HCV_ANTIBODY', 'HBSAG', 'SYPHILIS_RPR', 'MALARIA_ANTIGEN', 'ABO_RH_CONFIRMATION', 'IRREGULAR_ANTIBODY', 'COMPONENT_VOLUME', 'PLATELET_YIELD', 'HEMATOCRIT', 'OTHER');

-- CreateEnum
CREATE TYPE "TestResultOutcome" AS ENUM ('NON_REACTIVE', 'REACTIVE', 'INDETERMINATE', 'CONFIRMED_POSITIVE', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "TestRecordStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'INVALID', 'REPEAT_REQUIRED');

-- CreateEnum
CREATE TYPE "ClinicalReleaseDecision" AS ENUM ('RELEASED', 'WITHHELD', 'QUARANTINE_HOLD', 'DISCARD_ORDERED');

-- CreateEnum
CREATE TYPE "StorageType" AS ENUM ('BLOOD_BANK_REFRIGERATOR', 'DEEP_FREEZER', 'PLATELET_AGITATOR', 'QUARANTINE_STORAGE', 'DISPOSITION_HOLD');

-- AlterTable
ALTER TABLE "component_units" ADD COLUMN "storageLocationId" TEXT,
ADD COLUMN "expiryProvenance" JSONB,
ADD COLUMN "isHold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "holdReason" TEXT,
ADD COLUMN "holdPlacedAt" TIMESTAMP(3),
ADD COLUMN "holdPlacedById" TEXT,
ADD COLUMN "dispositionType" TEXT,
ADD COLUMN "dispositionReason" TEXT,
ADD COLUMN "dispositionedAt" TIMESTAMP(3),
ADD COLUMN "dispositionedById" TEXT;

-- CreateTable
CREATE TABLE "laboratory_test_records" (
    "id" TEXT NOT NULL,
    "collectionUnitId" TEXT,
    "componentUnitId" TEXT,
    "organisationId" TEXT NOT NULL,
    "category" "TestCategory" NOT NULL,
    "testType" "TestType" NOT NULL,
    "testName" TEXT NOT NULL,
    "sampleBarcode" TEXT,
    "status" "TestRecordStatus" NOT NULL DEFAULT 'PENDING',
    "resultOutcome" "TestResultOutcome",
    "quantitativeValue" TEXT,
    "units" TEXT,
    "referenceRange" TEXT,
    "reagentLot" TEXT,
    "reagentExpiry" TIMESTAMP(3),
    "instrumentId" TEXT,
    "performedById" TEXT,
    "performedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "isHistorical" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "laboratory_test_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_release_records" (
    "id" TEXT NOT NULL,
    "componentUnitId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "decision" "ClinicalReleaseDecision" NOT NULL,
    "authorizedClinicalUserId" TEXT NOT NULL,
    "decisionTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "reviewedTestIds" JSONB NOT NULL,
    "clinicalProtocolRef" TEXT,
    "dispositionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_release_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_locations" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "locationCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "storageType" "StorageType" NOT NULL,
    "targetTempRange" TEXT NOT NULL,
    "roomOrArea" TEXT,
    "equipmentIdentifier" TEXT,
    "shelfOrRack" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_movement_records" (
    "id" TEXT NOT NULL,
    "componentUnitId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "fromLocationId" TEXT,
    "toLocationId" TEXT NOT NULL,
    "movedById" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "observedTempCelsius" DOUBLE PRECISION,
    "temperatureExcursionNoted" BOOLEAN NOT NULL DEFAULT false,
    "excursionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_movement_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "component_units_storageLocationId_idx" ON "component_units"("storageLocationId");

-- CreateIndex
CREATE INDEX "laboratory_test_records_collectionUnitId_idx" ON "laboratory_test_records"("collectionUnitId");
CREATE INDEX "laboratory_test_records_componentUnitId_idx" ON "laboratory_test_records"("componentUnitId");
CREATE INDEX "laboratory_test_records_organisationId_status_idx" ON "laboratory_test_records"("organisationId", "status");
CREATE INDEX "laboratory_test_records_testType_resultOutcome_idx" ON "laboratory_test_records"("testType", "resultOutcome");

-- CreateIndex
CREATE INDEX "clinical_release_records_componentUnitId_idx" ON "clinical_release_records"("componentUnitId");
CREATE INDEX "clinical_release_records_organisationId_decision_idx" ON "clinical_release_records"("organisationId", "decision");

-- CreateIndex
CREATE UNIQUE INDEX "storage_locations_organisationId_locationCode_key" ON "storage_locations"("organisationId", "locationCode");
CREATE INDEX "storage_locations_organisationId_isActive_idx" ON "storage_locations"("organisationId", "isActive");

-- CreateIndex
CREATE INDEX "storage_movement_records_componentUnitId_idx" ON "storage_movement_records"("componentUnitId");
CREATE INDEX "storage_movement_records_organisationId_timestamp_idx" ON "storage_movement_records"("organisationId", "timestamp");

-- AddForeignKey
ALTER TABLE "component_units" ADD CONSTRAINT "component_units_storageLocationId_fkey" FOREIGN KEY ("storageLocationId") REFERENCES "storage_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laboratory_test_records" ADD CONSTRAINT "laboratory_test_records_collectionUnitId_fkey" FOREIGN KEY ("collectionUnitId") REFERENCES "collection_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laboratory_test_records" ADD CONSTRAINT "laboratory_test_records_componentUnitId_fkey" FOREIGN KEY ("componentUnitId") REFERENCES "component_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laboratory_test_records" ADD CONSTRAINT "laboratory_test_records_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laboratory_test_records" ADD CONSTRAINT "laboratory_test_records_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laboratory_test_records" ADD CONSTRAINT "laboratory_test_records_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_release_records" ADD CONSTRAINT "clinical_release_records_componentUnitId_fkey" FOREIGN KEY ("componentUnitId") REFERENCES "component_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_release_records" ADD CONSTRAINT "clinical_release_records_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_release_records" ADD CONSTRAINT "clinical_release_records_authorizedClinicalUserId_fkey" FOREIGN KEY ("authorizedClinicalUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_locations" ADD CONSTRAINT "storage_locations_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_movement_records" ADD CONSTRAINT "storage_movement_records_componentUnitId_fkey" FOREIGN KEY ("componentUnitId") REFERENCES "component_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_movement_records" ADD CONSTRAINT "storage_movement_records_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_movement_records" ADD CONSTRAINT "storage_movement_records_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "storage_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_movement_records" ADD CONSTRAINT "storage_movement_records_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "storage_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_movement_records" ADD CONSTRAINT "storage_movement_records_movedById_fkey" FOREIGN KEY ("movedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
