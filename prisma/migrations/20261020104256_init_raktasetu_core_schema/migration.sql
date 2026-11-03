-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'DONOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DEACTIVATED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "BloodGroup" AS ENUM ('A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG');

-- CreateEnum
CREATE TYPE "SearchScope" AS ENUM ('EXACT_CENTRE', 'DISTRICT_EXPANDED', 'OUT_OF_DISTRICT');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ResponseStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blood_centres" (
    "hospitalCode" TEXT NOT NULL,
    "hospitalName" TEXT NOT NULL,
    "mobileNo" TEXT,
    "address" TEXT,
    "stateCode" INTEGER NOT NULL DEFAULT 27,
    "districtCode" INTEGER,
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blood_centres_pkey" PRIMARY KEY ("hospitalCode")
);

-- CreateTable
CREATE TABLE "blood_availability_snapshots" (
    "id" TEXT NOT NULL,
    "hospitalCode" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "bloodGroup" TEXT,
    "rawStockString" TEXT,
    "reportedQuantity" INTEGER,
    "quantityUnit" TEXT,
    "sourceEntryDate" TIMESTAMP(3),
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "rawMetadata" JSONB,

    CONSTRAINT "blood_availability_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donor_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bloodGroup" "BloodGroup" NOT NULL,
    "stateCode" INTEGER NOT NULL DEFAULT 27,
    "districtCode" INTEGER NOT NULL,
    "lastDonationDate" TIMESTAMP(3),
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isSearchable" BOOLEAN NOT NULL DEFAULT false,
    "consentVersion" TEXT,
    "consentGrantedAt" TIMESTAMP(3),
    "consentWithdrawnAt" TIMESTAMP(3),
    "primaryHospitalCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "donor_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donor_centre_preferences" (
    "id" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "hospitalCode" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donor_centre_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blood_requests" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "bloodGroup" "BloodGroup" NOT NULL,
    "component" TEXT NOT NULL,
    "unitsRequested" INTEGER NOT NULL DEFAULT 1,
    "requiredBy" TIMESTAMP(3),
    "hospitalCode" TEXT,
    "searchScope" "SearchScope" NOT NULL DEFAULT 'EXACT_CENTRE',
    "message" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blood_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donor_responses" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "donorId" TEXT NOT NULL,
    "status" "ResponseStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "disclosureAuthorized" BOOLEAN NOT NULL DEFAULT false,
    "contactDisclosedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "donor_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phoneNumber_key" ON "users"("phoneNumber");

-- CreateIndex
CREATE INDEX "users_phoneNumber_idx" ON "users"("phoneNumber");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE INDEX "blood_centres_stateCode_districtCode_idx" ON "blood_centres"("stateCode", "districtCode");

-- CreateIndex
CREATE INDEX "blood_centres_hospitalName_idx" ON "blood_centres"("hospitalName");

-- CreateIndex
CREATE INDEX "blood_availability_snapshots_hospitalCode_component_idx" ON "blood_availability_snapshots"("hospitalCode", "component");

-- CreateIndex
CREATE INDEX "blood_availability_snapshots_retrievedAt_idx" ON "blood_availability_snapshots"("retrievedAt");

-- CreateIndex
CREATE UNIQUE INDEX "donor_profiles_userId_key" ON "donor_profiles"("userId");

-- CreateIndex
CREATE INDEX "donor_profiles_isSearchable_isAvailable_bloodGroup_district_idx" ON "donor_profiles"("isSearchable", "isAvailable", "bloodGroup", "districtCode");

-- CreateIndex
CREATE INDEX "donor_profiles_primaryHospitalCode_idx" ON "donor_profiles"("primaryHospitalCode");

-- CreateIndex
CREATE INDEX "donor_centre_preferences_hospitalCode_isPrimary_idx" ON "donor_centre_preferences"("hospitalCode", "isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "donor_centre_preferences_donorId_hospitalCode_key" ON "donor_centre_preferences"("donorId", "hospitalCode");

-- CreateIndex
CREATE INDEX "blood_requests_status_bloodGroup_idx" ON "blood_requests"("status", "bloodGroup");

-- CreateIndex
CREATE INDEX "blood_requests_requesterId_idx" ON "blood_requests"("requesterId");

-- CreateIndex
CREATE INDEX "donor_responses_donorId_status_idx" ON "donor_responses"("donorId", "status");

-- CreateIndex
CREATE INDEX "donor_responses_requestId_status_idx" ON "donor_responses"("requestId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "donor_responses_requestId_donorId_key" ON "donor_responses"("requestId", "donorId");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- AddForeignKey
ALTER TABLE "blood_availability_snapshots" ADD CONSTRAINT "blood_availability_snapshots_hospitalCode_fkey" FOREIGN KEY ("hospitalCode") REFERENCES "blood_centres"("hospitalCode") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_profiles" ADD CONSTRAINT "donor_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_profiles" ADD CONSTRAINT "donor_profiles_primaryHospitalCode_fkey" FOREIGN KEY ("primaryHospitalCode") REFERENCES "blood_centres"("hospitalCode") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_centre_preferences" ADD CONSTRAINT "donor_centre_preferences_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "donor_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_centre_preferences" ADD CONSTRAINT "donor_centre_preferences_hospitalCode_fkey" FOREIGN KEY ("hospitalCode") REFERENCES "blood_centres"("hospitalCode") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blood_requests" ADD CONSTRAINT "blood_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blood_requests" ADD CONSTRAINT "blood_requests_hospitalCode_fkey" FOREIGN KEY ("hospitalCode") REFERENCES "blood_centres"("hospitalCode") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_responses" ADD CONSTRAINT "donor_responses_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "blood_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_responses" ADD CONSTRAINT "donor_responses_donorId_fkey" FOREIGN KEY ("donorId") REFERENCES "donor_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
