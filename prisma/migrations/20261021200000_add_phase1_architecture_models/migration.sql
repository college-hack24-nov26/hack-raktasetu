-- Additive Phase 1 Architecture Foundation Migration: Organisations, Memberships, Applications, and Camps
-- Fully backward-compatible; does NOT alter or delete any existing columns or tables.

-- CreateEnums if not exists
DO $$ BEGIN
    CREATE TYPE "OrgType" AS ENUM ('BLOOD_BANK', 'RECEIVING_FACILITY', 'STORAGE_CENTRE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "OrgStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'SUSPENDED', 'DEACTIVATED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "OrgRole" AS ENUM ('ORG_ADMIN', 'INVENTORY_STAFF', 'CLINICAL_STAFF', 'COLLECTION_STAFF', 'AUDITOR');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "ApplicationStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RETURNED_FOR_CORRECTION');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "CampStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable: organisations
CREATE TABLE IF NOT EXISTS "organisations" (
    "id" TEXT NOT NULL,
    "orgCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OrgType" NOT NULL DEFAULT 'BLOOD_BANK',
    "licenseNumber" TEXT NOT NULL,
    "stateCode" INTEGER NOT NULL DEFAULT 27,
    "districtCode" INTEGER NOT NULL,
    "districtName" TEXT,
    "address" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "status" "OrgStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "hospitalCode" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organisations_pkey" PRIMARY KEY ("id")
);

-- CreateTable: organisation_memberships
CREATE TABLE IF NOT EXISTS "organisation_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "role" "OrgRole" NOT NULL DEFAULT 'INVENTORY_STAFF',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,

    CONSTRAINT "organisation_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable: organisation_applications
CREATE TABLE IF NOT EXISTS "organisation_applications" (
    "id" TEXT NOT NULL,
    "applicantUserId" TEXT,
    "hospitalName" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "stateCode" INTEGER NOT NULL DEFAULT 27,
    "districtCode" INTEGER NOT NULL,
    "districtName" TEXT,
    "contactPerson" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "componentTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "ApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewNotes" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resultingOrgId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organisation_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable: camps
CREATE TABLE IF NOT EXISTS "camps" (
    "id" TEXT NOT NULL,
    "campCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "organizerName" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "timeSlot" TEXT,
    "venue" TEXT NOT NULL,
    "district" TEXT,
    "districtCode" INTEGER NOT NULL,
    "stateCode" INTEGER NOT NULL DEFAULT 27,
    "expectedDonors" INTEGER NOT NULL DEFAULT 50,
    "coordinatorContact" TEXT,
    "status" "CampStatus" NOT NULL DEFAULT 'PROPOSED',
    "hospitalCode" TEXT,
    "organisationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "camps_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX IF NOT EXISTS "organisations_orgCode_key" ON "organisations"("orgCode");
CREATE UNIQUE INDEX IF NOT EXISTS "organisations_licenseNumber_key" ON "organisations"("licenseNumber");
CREATE INDEX IF NOT EXISTS "organisations_stateCode_districtCode_idx" ON "organisations"("stateCode", "districtCode");
CREATE INDEX IF NOT EXISTS "organisations_licenseNumber_idx" ON "organisations"("licenseNumber");
CREATE INDEX IF NOT EXISTS "organisations_status_idx" ON "organisations"("status");

CREATE UNIQUE INDEX IF NOT EXISTS "organisation_memberships_userId_organisationId_key" ON "organisation_memberships"("userId", "organisationId");
CREATE INDEX IF NOT EXISTS "organisation_memberships_organisationId_role_idx" ON "organisation_memberships"("organisationId", "role");
CREATE INDEX IF NOT EXISTS "organisation_memberships_userId_idx" ON "organisation_memberships"("userId");

CREATE INDEX IF NOT EXISTS "organisation_applications_status_createdAt_idx" ON "organisation_applications"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "organisation_applications_licenseNumber_idx" ON "organisation_applications"("licenseNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "camps_campCode_key" ON "camps"("campCode");
CREATE INDEX IF NOT EXISTS "camps_status_targetDate_idx" ON "camps"("status", "targetDate");
CREATE INDEX IF NOT EXISTS "camps_districtCode_idx" ON "camps"("districtCode");

-- AddForeignKeys (using DO block to avoid duplicate constraint errors)
DO $$ BEGIN
    ALTER TABLE "organisations" ADD CONSTRAINT "organisations_hospitalCode_fkey" FOREIGN KEY ("hospitalCode") REFERENCES "blood_centres"("hospitalCode") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "organisation_memberships" ADD CONSTRAINT "organisation_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "organisation_memberships" ADD CONSTRAINT "organisation_memberships_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "organisation_applications" ADD CONSTRAINT "organisation_applications_applicantUserId_fkey" FOREIGN KEY ("applicantUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "organisation_applications" ADD CONSTRAINT "organisation_applications_resultingOrgId_fkey" FOREIGN KEY ("resultingOrgId") REFERENCES "organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "camps" ADD CONSTRAINT "camps_hospitalCode_fkey" FOREIGN KEY ("hospitalCode") REFERENCES "blood_centres"("hospitalCode") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "camps" ADD CONSTRAINT "camps_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
