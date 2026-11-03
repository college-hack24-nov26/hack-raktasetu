-- CreateEnum
CREATE TYPE "CollectionUnitStatus" AS ENUM ('COLLECTED', 'PREPARED_FOR_HANDOVER', 'IN_TRANSIT', 'RECEIVED_BY_CENTRE', 'QUARANTINED', 'REJECTED', 'PROCESSING_COMPLETED');

-- CreateEnum
CREATE TYPE "ComponentUnitStatus" AS ENUM ('QUARANTINED', 'AWAITING_TESTING', 'AVAILABLE', 'RESERVED', 'ISSUED', 'EXPIRED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "ComponentType" AS ENUM ('WHOLE_BLOOD', 'PRBC', 'FRESH_FROZEN_PLASMA', 'PLATELET_CONCENTRATE', 'CRYOPRECIPITATE', 'BUFFY_COAT');

-- CreateTable
CREATE TABLE "collection_units" (
    "id" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "bagIdentifier" TEXT,
    "donationEventId" TEXT NOT NULL,
    "campId" TEXT,
    "organisationId" TEXT NOT NULL,
    "bloodGroup" "BloodGroup" NOT NULL,
    "volumeMl" INTEGER,
    "status" "CollectionUnitStatus" NOT NULL DEFAULT 'COLLECTED',
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collectedBy" TEXT NOT NULL,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_units" (
    "id" TEXT NOT NULL,
    "componentCode" TEXT NOT NULL,
    "collectionUnitId" TEXT NOT NULL,
    "componentType" "ComponentType" NOT NULL,
    "bloodGroup" "BloodGroup" NOT NULL,
    "volumeMl" INTEGER,
    "organisationId" TEXT NOT NULL,
    "status" "ComponentUnitStatus" NOT NULL DEFAULT 'QUARANTINED',
    "derivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "derivedBy" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "component_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unit_status_histories" (
    "id" TEXT NOT NULL,
    "unitType" TEXT NOT NULL,
    "collectionUnitId" TEXT,
    "componentUnitId" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "reason" TEXT,
    "referenceNote" TEXT,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unit_status_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collection_units_unitNumber_key" ON "collection_units"("unitNumber");

-- CreateIndex
CREATE UNIQUE INDEX "collection_units_donationEventId_key" ON "collection_units"("donationEventId");

-- CreateIndex
CREATE INDEX "collection_units_organisationId_status_idx" ON "collection_units"("organisationId", "status");

-- CreateIndex
CREATE INDEX "collection_units_campId_idx" ON "collection_units"("campId");

-- CreateIndex
CREATE INDEX "collection_units_unitNumber_idx" ON "collection_units"("unitNumber");

-- CreateIndex
CREATE UNIQUE INDEX "component_units_componentCode_key" ON "component_units"("componentCode");

-- CreateIndex
CREATE INDEX "component_units_organisationId_status_idx" ON "component_units"("organisationId", "status");

-- CreateIndex
CREATE INDEX "component_units_collectionUnitId_idx" ON "component_units"("collectionUnitId");

-- CreateIndex
CREATE INDEX "component_units_componentCode_idx" ON "component_units"("componentCode");

-- CreateIndex
CREATE INDEX "component_units_componentType_bloodGroup_idx" ON "component_units"("componentType", "bloodGroup");

-- CreateIndex
CREATE INDEX "unit_status_histories_collectionUnitId_timestamp_idx" ON "unit_status_histories"("collectionUnitId", "timestamp");

-- CreateIndex
CREATE INDEX "unit_status_histories_componentUnitId_timestamp_idx" ON "unit_status_histories"("componentUnitId", "timestamp");

-- CreateIndex
CREATE INDEX "unit_status_histories_organisationId_idx" ON "unit_status_histories"("organisationId");

-- AddForeignKey
ALTER TABLE "collection_units" ADD CONSTRAINT "collection_units_donationEventId_fkey" FOREIGN KEY ("donationEventId") REFERENCES "donation_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_units" ADD CONSTRAINT "collection_units_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_units" ADD CONSTRAINT "collection_units_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_units" ADD CONSTRAINT "collection_units_collectedBy_fkey" FOREIGN KEY ("collectedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_units" ADD CONSTRAINT "component_units_collectionUnitId_fkey" FOREIGN KEY ("collectionUnitId") REFERENCES "collection_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_units" ADD CONSTRAINT "component_units_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_units" ADD CONSTRAINT "component_units_derivedBy_fkey" FOREIGN KEY ("derivedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_status_histories" ADD CONSTRAINT "unit_status_histories_collectionUnitId_fkey" FOREIGN KEY ("collectionUnitId") REFERENCES "collection_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_status_histories" ADD CONSTRAINT "unit_status_histories_componentUnitId_fkey" FOREIGN KEY ("componentUnitId") REFERENCES "component_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_status_histories" ADD CONSTRAINT "unit_status_histories_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unit_status_histories" ADD CONSTRAINT "unit_status_histories_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
