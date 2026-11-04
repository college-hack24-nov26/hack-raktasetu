import { prisma } from './prisma';

export async function initDonorLocationSchema() {
  // 1. Enum
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LocationSessionStatus') THEN
        CREATE TYPE "LocationSessionStatus" AS ENUM ('ACTIVE', 'STOPPED', 'REVOKED', 'EXPIRED');
      END IF;
    END $$;
  `);

  // 2. Table: donor_location_sessions
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "donor_location_sessions" (
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
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "donor_location_sessions_pkey" PRIMARY KEY ("id")
    );
  `);

  // 3. Table: donor_latest_locations
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "donor_latest_locations" (
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
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "donor_latest_locations_pkey" PRIMARY KEY ("id")
    );
  `);

  // 4. Indexes
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "donor_location_sessions_donorUserId_status_idx" 
      ON "donor_location_sessions"("donorUserId", "status");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "donor_location_sessions_status_startedAt_idx" 
      ON "donor_location_sessions"("status", "startedAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "donor_latest_locations_donorUserId_key" 
      ON "donor_latest_locations"("donorUserId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "donor_latest_locations_sessionId_key" 
      ON "donor_latest_locations"("sessionId");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "donor_latest_locations_serverReceivedAt_idx" 
      ON "donor_latest_locations"("serverReceivedAt");
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "donor_latest_locations_sessionId_idx" 
      ON "donor_latest_locations"("sessionId");
  `);

  // 5. Foreign keys
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'donor_location_sessions_donorUserId_fkey') THEN
        ALTER TABLE "donor_location_sessions" 
          ADD CONSTRAINT "donor_location_sessions_donorUserId_fkey" 
          FOREIGN KEY ("donorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'donor_latest_locations_donorUserId_fkey') THEN
        ALTER TABLE "donor_latest_locations" 
          ADD CONSTRAINT "donor_latest_locations_donorUserId_fkey" 
          FOREIGN KEY ("donorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'donor_latest_locations_sessionId_fkey') THEN
        ALTER TABLE "donor_latest_locations" 
          ADD CONSTRAINT "donor_latest_locations_sessionId_fkey" 
          FOREIGN KEY ("sessionId") REFERENCES "donor_location_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
  `);

  console.log('[Migration] Phase 10 Donor Location Tracking schema verified.');
}
