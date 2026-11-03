-- CreateEnum
CREATE TYPE "ManifestStatus" AS ENUM ('DRAFT', 'FINALISED', 'DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED_WITH_DISCREPANCIES', 'RECONCILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ItemReceiptOutcome" AS ENUM ('PENDING', 'VERIFIED_INTACT', 'DAMAGED', 'TEMPERATURE_EXCURSION', 'MISSING', 'MISMATCHED', 'UNEXPECTED');

-- CreateEnum
CREATE TYPE "DiscrepancyCategory" AS ENUM ('UNIT_MISSING', 'UNEXPECTED_UNIT', 'IDENTIFIER_MISMATCH', 'DAMAGED_BAG', 'COLD_CHAIN_BREACH', 'QUANTITY_MISMATCH', 'OTHER');

-- CreateEnum
CREATE TYPE "ExceptionSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'WAIVED');

-- CreateTable
CREATE TABLE "handover_manifests" (
    "id" TEXT NOT NULL,
    "manifestNumber" TEXT NOT NULL,
    "campId" TEXT,
    "sendingOrganisationId" TEXT NOT NULL,
    "receivingOrganisationId" TEXT NOT NULL,
    "status" "ManifestStatus" NOT NULL DEFAULT 'DRAFT',
    "transportDetails" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalisedById" TEXT,
    "finalisedAt" TIMESTAMP(3),
    "dispatchedById" TEXT,
    "dispatchedAt" TIMESTAMP(3),
    "reconciledById" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "handover_manifests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handover_items" (
    "id" TEXT NOT NULL,
    "manifestId" TEXT NOT NULL,
    "collectionUnitId" TEXT NOT NULL,
    "expectedUnitNumber" TEXT NOT NULL,
    "outcome" "ItemReceiptOutcome" NOT NULL DEFAULT 'PENDING',
    "receivedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "discrepancyNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "handover_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_exceptions" (
    "id" TEXT NOT NULL,
    "manifestId" TEXT NOT NULL,
    "handoverItemId" TEXT,
    "collectionUnitId" TEXT,
    "category" "DiscrepancyCategory" NOT NULL,
    "severity" "ExceptionSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "ExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "resolutionNotes" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reconciliation_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "handover_manifests_manifestNumber_key" ON "handover_manifests"("manifestNumber");

-- CreateIndex
CREATE INDEX "handover_manifests_sendingOrganisationId_status_idx" ON "handover_manifests"("sendingOrganisationId", "status");

-- CreateIndex
CREATE INDEX "handover_manifests_receivingOrganisationId_status_idx" ON "handover_manifests"("receivingOrganisationId", "status");

-- CreateIndex
CREATE INDEX "handover_manifests_campId_idx" ON "handover_manifests"("campId");

-- CreateIndex
CREATE INDEX "handover_manifests_manifestNumber_idx" ON "handover_manifests"("manifestNumber");

-- CreateIndex
CREATE UNIQUE INDEX "handover_items_manifestId_collectionUnitId_key" ON "handover_items"("manifestId", "collectionUnitId");

-- CreateIndex
CREATE INDEX "handover_items_collectionUnitId_idx" ON "handover_items"("collectionUnitId");

-- CreateIndex
CREATE INDEX "handover_items_manifestId_outcome_idx" ON "handover_items"("manifestId", "outcome");

-- CreateIndex
CREATE INDEX "reconciliation_exceptions_manifestId_status_idx" ON "reconciliation_exceptions"("manifestId", "status");

-- CreateIndex
CREATE INDEX "reconciliation_exceptions_category_idx" ON "reconciliation_exceptions"("category");

-- AddForeignKey
ALTER TABLE "handover_manifests" ADD CONSTRAINT "handover_manifests_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_manifests" ADD CONSTRAINT "handover_manifests_sendingOrganisationId_fkey" FOREIGN KEY ("sendingOrganisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_manifests" ADD CONSTRAINT "handover_manifests_receivingOrganisationId_fkey" FOREIGN KEY ("receivingOrganisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_manifests" ADD CONSTRAINT "handover_manifests_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_manifests" ADD CONSTRAINT "handover_manifests_finalisedById_fkey" FOREIGN KEY ("finalisedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_manifests" ADD CONSTRAINT "handover_manifests_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_manifests" ADD CONSTRAINT "handover_manifests_reconciledById_fkey" FOREIGN KEY ("reconciledById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_items" ADD CONSTRAINT "handover_items_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "handover_manifests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_items" ADD CONSTRAINT "handover_items_collectionUnitId_fkey" FOREIGN KEY ("collectionUnitId") REFERENCES "collection_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_items" ADD CONSTRAINT "handover_items_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_exceptions" ADD CONSTRAINT "reconciliation_exceptions_manifestId_fkey" FOREIGN KEY ("manifestId") REFERENCES "handover_manifests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_exceptions" ADD CONSTRAINT "reconciliation_exceptions_handoverItemId_fkey" FOREIGN KEY ("handoverItemId") REFERENCES "handover_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_exceptions" ADD CONSTRAINT "reconciliation_exceptions_collectionUnitId_fkey" FOREIGN KEY ("collectionUnitId") REFERENCES "collection_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_exceptions" ADD CONSTRAINT "reconciliation_exceptions_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
