-- CreateEnum
CREATE TYPE "HospitalIssueStatus" AS ENUM ('AUTHORISED', 'DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'RECEIVED_WITH_DISCREPANCIES', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HospitalItemStatus" AS ENUM ('AUTHORISED', 'DISPATCHED', 'RECEIVED', 'DISCREPANT', 'TRANSFUSED', 'RETURNED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "HospitalItemReceiptOutcome" AS ENUM ('VERIFIED_INTACT', 'DAMAGED', 'TEMPERATURE_EXCURSION', 'MISMATCHED', 'MISSING', 'OTHER');

-- CreateEnum
CREATE TYPE "HospitalDiscrepancyCategory" AS ENUM ('DAMAGED_CONTAINER', 'COLD_CHAIN_EXCURSION', 'UNIT_MISSING', 'UNEXPECTED_UNIT', 'IDENTIFIER_MISMATCH', 'OTHER');

-- CreateEnum
CREATE TYPE "ComponentDispositionType" AS ENUM ('TRANSFUSION_DOCUMENTED', 'RETURNED_TO_BANK', 'DISCARDED_DAMAGED', 'DISCARDED_EXPIRED', 'DISCARDED_CLINICAL', 'OTHER');

-- CreateTable
CREATE TABLE "hospital_issue_orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "issuingOrganisationId" TEXT NOT NULL,
    "receivingFacilityId" TEXT NOT NULL,
    "requestId" TEXT,
    "status" "HospitalIssueStatus" NOT NULL DEFAULT 'AUTHORISED',
    "authorisationReason" TEXT NOT NULL,
    "authorisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorisedById" TEXT NOT NULL,
    "dispatchedAt" TIMESTAMP(3),
    "dispatchedById" TEXT,
    "transportDetails" JSONB,
    "receivedAt" TIMESTAMP(3),
    "receivedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospital_issue_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospital_issue_items" (
    "id" TEXT NOT NULL,
    "issueOrderId" TEXT NOT NULL,
    "componentUnitId" TEXT NOT NULL,
    "status" "HospitalItemStatus" NOT NULL DEFAULT 'AUTHORISED',
    "receivingOutcome" "HospitalItemReceiptOutcome",
    "receivingNotes" TEXT,
    "receivedAt" TIMESTAMP(3),
    "receivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospital_issue_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospital_discrepancies" (
    "id" TEXT NOT NULL,
    "issueOrderId" TEXT NOT NULL,
    "issueItemId" TEXT,
    "componentUnitId" TEXT,
    "category" "HospitalDiscrepancyCategory" NOT NULL,
    "severity" "ExceptionSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "ExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "resolutionNotes" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospital_discrepancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_disposition_records" (
    "id" TEXT NOT NULL,
    "componentUnitId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "dispositionType" "ComponentDispositionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "clinicalProtocolRef" TEXT,
    "documentationRef" TEXT,
    "recipientPatientRef" TEXT,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auditCorrelationId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "component_disposition_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hospital_issue_orders_orderNumber_key" ON "hospital_issue_orders"("orderNumber");
CREATE INDEX "hospital_issue_orders_issuingOrganisationId_status_idx" ON "hospital_issue_orders"("issuingOrganisationId", "status");
CREATE INDEX "hospital_issue_orders_receivingFacilityId_status_idx" ON "hospital_issue_orders"("receivingFacilityId", "status");
CREATE INDEX "hospital_issue_orders_orderNumber_idx" ON "hospital_issue_orders"("orderNumber");
CREATE INDEX "hospital_issue_orders_requestId_idx" ON "hospital_issue_orders"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "hospital_issue_items_issueOrderId_componentUnitId_key" ON "hospital_issue_items"("issueOrderId", "componentUnitId");
CREATE INDEX "hospital_issue_items_componentUnitId_idx" ON "hospital_issue_items"("componentUnitId");
CREATE INDEX "hospital_issue_items_issueOrderId_status_idx" ON "hospital_issue_items"("issueOrderId", "status");

-- CreateIndex
CREATE INDEX "hospital_discrepancies_issueOrderId_status_idx" ON "hospital_discrepancies"("issueOrderId", "status");
CREATE INDEX "hospital_discrepancies_category_idx" ON "hospital_discrepancies"("category");

-- CreateIndex
CREATE INDEX "component_disposition_records_componentUnitId_idx" ON "component_disposition_records"("componentUnitId");
CREATE INDEX "component_disposition_records_organisationId_dispositionType_idx" ON "component_disposition_records"("organisationId", "dispositionType");

-- AddForeignKey
ALTER TABLE "hospital_issue_orders" ADD CONSTRAINT "hospital_issue_orders_issuingOrganisationId_fkey" FOREIGN KEY ("issuingOrganisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hospital_issue_orders" ADD CONSTRAINT "hospital_issue_orders_receivingFacilityId_fkey" FOREIGN KEY ("receivingFacilityId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hospital_issue_orders" ADD CONSTRAINT "hospital_issue_orders_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "blood_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "hospital_issue_orders" ADD CONSTRAINT "hospital_issue_orders_authorisedById_fkey" FOREIGN KEY ("authorisedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hospital_issue_orders" ADD CONSTRAINT "hospital_issue_orders_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hospital_issue_orders" ADD CONSTRAINT "hospital_issue_orders_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_issue_items" ADD CONSTRAINT "hospital_issue_items_issueOrderId_fkey" FOREIGN KEY ("issueOrderId") REFERENCES "hospital_issue_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hospital_issue_items" ADD CONSTRAINT "hospital_issue_items_componentUnitId_fkey" FOREIGN KEY ("componentUnitId") REFERENCES "component_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hospital_issue_items" ADD CONSTRAINT "hospital_issue_items_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_discrepancies" ADD CONSTRAINT "hospital_discrepancies_issueOrderId_fkey" FOREIGN KEY ("issueOrderId") REFERENCES "hospital_issue_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hospital_discrepancies" ADD CONSTRAINT "hospital_discrepancies_issueItemId_fkey" FOREIGN KEY ("issueItemId") REFERENCES "hospital_issue_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "hospital_discrepancies" ADD CONSTRAINT "hospital_discrepancies_componentUnitId_fkey" FOREIGN KEY ("componentUnitId") REFERENCES "component_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "hospital_discrepancies" ADD CONSTRAINT "hospital_discrepancies_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "hospital_discrepancies" ADD CONSTRAINT "hospital_discrepancies_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_disposition_records" ADD CONSTRAINT "component_disposition_records_componentUnitId_fkey" FOREIGN KEY ("componentUnitId") REFERENCES "component_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "component_disposition_records" ADD CONSTRAINT "component_disposition_records_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "component_disposition_records" ADD CONSTRAINT "component_disposition_records_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
