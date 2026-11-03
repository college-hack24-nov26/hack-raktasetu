-- CreateEnum
CREATE TYPE "CampStaffRole" AS ENUM ('CAMP_COORDINATOR', 'CLINICAL_STAFF', 'COLLECTION_STAFF');

-- CreateTable
CREATE TABLE "camp_staff_assignments" (
    "id" TEXT NOT NULL,
    "campId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "role" "CampStaffRole" NOT NULL DEFAULT 'CAMP_COORDINATOR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,

    CONSTRAINT "camp_staff_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "camp_staff_assignments_userId_campId_role_key" ON "camp_staff_assignments"("userId", "campId", "role");

-- CreateIndex
CREATE INDEX "camp_staff_assignments_campId_isActive_idx" ON "camp_staff_assignments"("campId", "isActive");

-- CreateIndex
CREATE INDEX "camp_staff_assignments_userId_isActive_idx" ON "camp_staff_assignments"("userId", "isActive");

-- CreateIndex
CREATE INDEX "camp_staff_assignments_organisationId_idx" ON "camp_staff_assignments"("organisationId");

-- AddForeignKey
ALTER TABLE "camp_staff_assignments" ADD CONSTRAINT "camp_staff_assignments_campId_fkey" FOREIGN KEY ("campId") REFERENCES "camps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camp_staff_assignments" ADD CONSTRAINT "camp_staff_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camp_staff_assignments" ADD CONSTRAINT "camp_staff_assignments_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
