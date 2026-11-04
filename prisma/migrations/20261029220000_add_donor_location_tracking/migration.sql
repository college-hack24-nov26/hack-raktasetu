-- CreateEnum
CREATE TYPE "LocationSessionStatus" AS ENUM ('ACTIVE', 'STOPPED', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "donor_location_sessions" (
    "id" TEXT NOT NULL,
    "donorUserId" TEXT NOT NULL,
    "status" "LocationSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "consentGranted" BOOLEAN NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "consentGrantedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "donor_location_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donor_latest_locations" (
    "id" TEXT NOT NULL,
    "donorUserId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "heading" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "batteryLevel" DOUBLE PRECISION,
    "deviceTimestamp" TIMESTAMP(3) NOT NULL,
    "serverReceivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isStale" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "donor_latest_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "donor_location_sessions_donorUserId_status_idx" ON "donor_location_sessions"("donorUserId", "status");

-- CreateIndex
CREATE INDEX "donor_location_sessions_status_startedAt_idx" ON "donor_location_sessions"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "donor_latest_locations_donorUserId_key" ON "donor_latest_locations"("donorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "donor_latest_locations_sessionId_key" ON "donor_latest_locations"("sessionId");

-- CreateIndex
CREATE INDEX "donor_latest_locations_serverReceivedAt_idx" ON "donor_latest_locations"("serverReceivedAt");

-- CreateIndex
CREATE INDEX "donor_latest_locations_sessionId_idx" ON "donor_latest_locations"("sessionId");

-- AddForeignKey
ALTER TABLE "donor_location_sessions" ADD CONSTRAINT "donor_location_sessions_donorUserId_fkey" FOREIGN KEY ("donorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_latest_locations" ADD CONSTRAINT "donor_latest_locations_donorUserId_fkey" FOREIGN KEY ("donorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donor_latest_locations" ADD CONSTRAINT "donor_latest_locations_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "donor_location_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
