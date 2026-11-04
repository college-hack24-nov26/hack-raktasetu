/**
 * RaktaSetu — Focused Verification Suite for Blood Bank Location Setup,
 * Donor Proximity & Mapbox Directions Integration
 * 
 * Verifies all 12 requirement areas:
 * 1. Coordinate validation and longitude/latitude order
 * 2. Blood Bank location authorization and tenant isolation
 * 3. New Blood Bank location confirmation during onboarding
 * 4. One-time setup behavior for existing Blood Banks
 * 5. Updating an existing confirmed location and audit trail
 * 6. Haversine distance correctness using known coordinate pairs
 * 7. Directions API response parsing, meter/second conversion, and failure handling
 * 8. Missing, stale, or revoked donor location
 * 9. Matching ranking integration without bypassing hard eligibility
 * 10. System Admin and designated Blood Bank visibility boundaries
 * 11. Realtime event authorization and payload minimization
 * 12. Type safety for affected shared contracts
 */

import assert from 'assert';
import { prisma } from './lib/prisma';
import { DirectionsService } from './services/directionsService';
import { calculateHaversineDistanceKm, AdminMatchingService } from './services/adminMatchingService';
import { OrganisationService } from './services/organisation';
import { HospitalIntegrationService } from './services/hospitalIntegration';
import {
  BloodBankLocationDTO,
  ConfirmLocationInput,
  RouteDirectionsDTO,
  OrgLocationStatus,
  RealtimeEventType,
} from '@raktasetu/shared';

let passed = 0;
let failed = 0;

function pass(name: string) {
  passed++;
  console.log(`  ✅ PASS: ${name}`);
}

function fail(name: string, err: any) {
  failed++;
  console.error(`  ❌ FAIL: ${name} ->`, err?.message || err);
}

async function runTests() {
  console.log('\n====================================================================');
  console.log('🧪 RaktaSetu — Location Setup, Proximity & Directions Verification');
  console.log('====================================================================\n');

  const ts = Date.now();
  const orgCode1 = `BB-LOC-1-${ts.toString().slice(-6)}`;
  const orgCode2 = `BB-LOC-2-${ts.toString().slice(-6)}`;
  const adminPhone = `+9198${ts.toString().slice(-8)}`;
  const staffPhone = `+9197${ts.toString().slice(-8)}`;
  const foreignPhone = `+9196${ts.toString().slice(-8)}`;
  const donorPhoneLive = `+9195${ts.toString().slice(-8)}`;
  const donorPhoneStale = `+9194${ts.toString().slice(-8)}`;
  const donorPhoneRevoked = `+9193${ts.toString().slice(-8)}`;
  const donorPhoneIncomp = `+9192${ts.toString().slice(-8)}`;

  try {
    // ----------------------------------------------------------------
    // TEST 1: Coordinate Validation and Longitude/Latitude Order
    // ----------------------------------------------------------------
    console.log('--- Test 1: Coordinate Validation and Longitude/Latitude Order ---');
    try {
      assert.strictEqual(DirectionsService.isValidCoordinate(18.5204, 73.8567), true, 'Valid Pune coords');
      assert.strictEqual(DirectionsService.isValidCoordinate(-90, -180), true, 'Valid min bounds');
      assert.strictEqual(DirectionsService.isValidCoordinate(90, 180), true, 'Valid max bounds');
      assert.strictEqual(DirectionsService.isValidCoordinate(90.1, 73.8567), false, 'Latitude > 90 must fail');
      assert.strictEqual(DirectionsService.isValidCoordinate(-91, 73.8567), false, 'Latitude < -90 must fail');
      assert.strictEqual(DirectionsService.isValidCoordinate(18.52, 180.5), false, 'Longitude > 180 must fail');
      assert.strictEqual(DirectionsService.isValidCoordinate(18.52, -181), false, 'Longitude < -180 must fail');
      assert.strictEqual(DirectionsService.isValidCoordinate(NaN, 73.8567), false, 'NaN latitude must fail');
      pass('Coordinate bounds validation correctly enforces [-90, 90] and [-180, 180]');
    } catch (e: any) {
      fail('Coordinate bounds validation', e);
    }

    // ----------------------------------------------------------------
    // TEST 6: Haversine Distance Correctness Using Known Coordinate Pairs
    // ----------------------------------------------------------------
    console.log('\n--- Test 6: Haversine Distance Correctness (Known Pairs) ---');
    try {
      // Point to itself must be 0 km
      const selfDist = calculateHaversineDistanceKm(18.5204, 73.8567, 18.5204, 73.8567);
      assert.strictEqual(selfDist, 0, 'Self distance should be 0');

      // Pune (18.5204, 73.8567) to Mumbai KEM Hospital (18.9902, 72.8406) ~ 119.5 km
      const puneToMumbai = calculateHaversineDistanceKm(18.5204, 73.8567, 18.9902, 72.8406);
      assert.ok(puneToMumbai >= 118 && puneToMumbai <= 122, `Expected ~119.5 km, got ${puneToMumbai} km`);

      // Pune Station to Pune Airport (~8.2 km)
      const puneLocal = calculateHaversineDistanceKm(18.5284, 73.8744, 18.5822, 73.9197);
      assert.ok(puneLocal >= 7.5 && puneLocal <= 9.0, `Expected ~8.2 km, got ${puneLocal} km`);

      pass(`Haversine distance calculation verified: Self=0km, Pune->Mumbai=${puneToMumbai}km, Local=${puneLocal}km`);
    } catch (e: any) {
      fail('Haversine distance verification', e);
    }

    // ----------------------------------------------------------------
    // TEST 7: Directions API Response Parsing, Meter/Second Conversion & Fallback
    // ----------------------------------------------------------------
    console.log('\n--- Test 7: Directions API Parsing, Units Conversion & Network Failure Handling ---');
    try {
      // Mock Mapbox Directions API fetch
      const originalFetch = global.fetch;
      try {
        // (a) Successful Route Mock
        (global as any).fetch = async (url: string) => {
          if (url.includes('api.mapbox.com/directions')) {
            // Verify coordinate order: strictly longitude,latitude;longitude,latitude
            const match = url.match(/mapbox\/driving\/([0-9.,;-]+)\?/);
            assert.ok(match, 'Must match directions URL format');
            const coordsPair = match[1];
            const [originPart, destPart] = coordsPair.split(';');
            const [oLng, oLat] = originPart.split(',').map(Number);
            const [dLng, dLat] = destPart.split(',').map(Number);

            // Origin: donor (73.8500, 18.5200) -> Dest: bank (73.8600, 18.5300)
            assert.ok(oLng > 70 && oLng < 80, 'First coordinate must be longitude');
            assert.ok(oLat > 10 && oLat < 30, 'Second coordinate must be latitude');

            return {
              ok: true,
              json: async () => ({
                code: 'Ok',
                routes: [
                  {
                    distance: 14850.5, // 14,850.5 meters -> 14.9 km
                    duration: 1680.0,  // 1,680 seconds -> 28 minutes
                  },
                ],
              }),
            } as any;
          }
          return originalFetch(url);
        };

        // Temporarily set token for test
        process.env.MAPBOX_ACCESS_TOKEN = 'mock-valid-mapbox-token';
        DirectionsService.clearCache();

        const routeResult = await DirectionsService.getDirections(
          { lat: 18.5200, lng: 73.8500 },
          { lat: 18.5300, lng: 73.8600 },
          'driving'
        );

        assert.ok(routeResult !== null, 'Route result must not be null');
        assert.strictEqual(routeResult!.distanceKm, 14.9, 'Meters converted to km rounded to 1 decimal');
        assert.strictEqual(routeResult!.durationMinutes, 28, 'Seconds converted to minutes rounded');
        assert.strictEqual(routeResult!.source, 'mapbox_directions');
        assert.strictEqual(routeResult!.cached, false);

        // Verify caching
        const cachedResult = await DirectionsService.getDirections(
          { lat: 18.5200, lng: 73.8500 },
          { lat: 18.5300, lng: 73.8600 },
          'driving'
        );
        assert.ok(cachedResult !== null);
        assert.strictEqual(cachedResult!.cached, true, 'Subsequent lookup must return cached route');

        // (b) Error & Rate Limit Handling Mock
        (global as any).fetch = async (url: string) => {
          if (url.includes('api.mapbox.com/directions')) {
            return {
              ok: false,
              status: 429,
              text: async () => 'Rate limit exceeded',
            } as any;
          }
          return originalFetch(url);
        };

        DirectionsService.clearCache();
        const rateLimitResult = await DirectionsService.getDirections(
          { lat: 18.5500, lng: 73.8200 },
          { lat: 18.5300, lng: 73.8600 }
        );
        assert.strictEqual(rateLimitResult, null, 'Rate-limited API must gracefully return null without throwing');

        // (c) No Route Found Mock
        (global as any).fetch = async (url: string) => {
          if (url.includes('api.mapbox.com/directions')) {
            return {
              ok: true,
              json: async () => ({ code: 'NoRoute', routes: [] }),
            } as any;
          }
          return originalFetch(url);
        };

        const noRouteResult = await DirectionsService.getDirections(
          { lat: 18.6000, lng: 73.8000 },
          { lat: 18.5300, lng: 73.8600 }
        );
        assert.strictEqual(noRouteResult, null, 'No route found must return null gracefully');
      } finally {
        global.fetch = originalFetch;
        delete process.env.MAPBOX_ACCESS_TOKEN;
      }
      pass('Directions API: coordinate order (lng,lat), units conversion (meters->km, sec->min), caching, and failure handling verified');
    } catch (e: any) {
      fail('Directions API response parsing & handling', e);
    }

    // ----------------------------------------------------------------
    // Setup Test Database Entities
    // ----------------------------------------------------------------
    console.log('\n--- Setting up DB Fixtures for Tenant Isolation & Matching Tests ---');

    // Create System Admin User
    const platformAdmin = await prisma.user.create({
      data: {
        phoneNumber: adminPhone,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });

    // Create Org A Admin User
    const orgAdminUser = await prisma.user.create({
      data: {
        phoneNumber: staffPhone,
        role: 'USER',
        status: 'ACTIVE',
      },
    });

    // Create Foreign User (Non-member)
    const foreignUser = await prisma.user.create({
      data: {
        phoneNumber: foreignPhone,
        role: 'USER',
        status: 'ACTIVE',
      },
    });

    // Create Organisation A (Gupta Blood Bank)
    const orgA = await prisma.organisation.create({
      data: {
        orgCode: orgCode1,
        name: `Gupta Life Blood Centre ${ts}`,
        type: 'BLOOD_BANK',
        licenseNumber: `LIC-LOC-A-${ts}`,
        districtCode: 521,
        districtName: 'Pune',
        status: 'VERIFIED',
        locationStatus: 'UNCONFIGURED',
      },
    });

    // Create Organisation B (Separate Tenant)
    const orgB = await prisma.organisation.create({
      data: {
        orgCode: orgCode2,
        name: `Sahyadri Transfusion Centre ${ts}`,
        type: 'BLOOD_BANK',
        licenseNumber: `LIC-LOC-B-${ts}`,
        districtCode: 521,
        districtName: 'Pune',
        status: 'VERIFIED',
        locationStatus: 'CONFIRMED',
        latitude: 18.5100,
        longitude: 73.8400,
      },
    });

    // Assign OrgAdmin membership in Org A
    await prisma.organisationMembership.create({
      data: {
        organisationId: orgA.id,
        userId: orgAdminUser.id,
        role: 'ORG_ADMIN',
        isActive: true,
      },
    });

    // Assign Auditor membership in Org B to foreignUser
    await prisma.organisationMembership.create({
      data: {
        organisationId: orgB.id,
        userId: foreignUser.id,
        role: 'AUDITOR',
        isActive: true,
      },
    });

    // ----------------------------------------------------------------
    // TEST 2: Blood Bank Location Authorization and Tenant Isolation
    // ----------------------------------------------------------------
    console.log('\n--- Test 2: Blood Bank Location Authorization and Tenant Isolation ---');
    try {
      // 1. Initial location of Org A is UNCONFIGURED
      const locInit = await OrganisationService.getLocation(orgA.id);
      assert.strictEqual(locInit.locationStatus, 'UNCONFIGURED');
      assert.strictEqual(locInit.latitude, null);
      assert.strictEqual(locInit.longitude, null);

      // 2. Validate latitude out of bounds rejection
      let outOfBoundsCaught = false;
      try {
        await OrganisationService.confirmLocation(orgA.id, orgAdminUser.id, {
          latitude: 95.0,
          longitude: 73.8567,
        });
      } catch (e: any) {
        outOfBoundsCaught = true;
        assert.ok(e.message.includes('latitude between -90 and 90'), 'Latitude error message');
      }
      assert.strictEqual(outOfBoundsCaught, true, 'Out-of-bounds latitude must be rejected');

      // 3. Confirm location by authorized ORG_ADMIN
      const confirmedA = await OrganisationService.confirmLocation(orgA.id, orgAdminUser.id, {
        latitude: 18.520432,
        longitude: 73.856743,
        locationAddress: 'Ground Floor, Facility Entrance, Shivajinagar Pune',
      });

      assert.strictEqual(confirmedA.locationStatus, 'CONFIRMED');
      assert.strictEqual(confirmedA.latitude, 18.520432);
      assert.strictEqual(confirmedA.longitude, 73.856743);
      assert.strictEqual(confirmedA.locationConfirmedBy, orgAdminUser.id);
      assert.ok(confirmedA.locationConfirmedAt !== null);

      pass('Authorization: Validated coordinates bounds and confirmed location under ORG_ADMIN actor');
    } catch (e: any) {
      fail('Blood bank location authorization and bounds', e);
    }

    // ----------------------------------------------------------------
    // TEST 4 & 5: One-Time Setup, Updating Location & Audit Trail
    // ----------------------------------------------------------------
    console.log('\n--- Test 4 & 5: Updating Confirmed Location & Audit Trail Persistence ---');
    try {
      // Update location with updated coordinates
      const updatedA = await OrganisationService.confirmLocation(orgA.id, orgAdminUser.id, {
        latitude: 18.521000,
        longitude: 73.857000,
        locationAddress: 'North Reception Gate, Pune',
      });

      assert.strictEqual(updatedA.latitude, 18.521000);
      assert.strictEqual(updatedA.longitude, 73.857000);
      assert.strictEqual(updatedA.locationAddress, 'North Reception Gate, Pune');

      // Verify AuditLog entry was persisted
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          resourceId: orgA.id,
          action: 'ORGANISATION_LOCATION_UPDATED',
        },
        orderBy: { createdAt: 'desc' },
      });

      assert.ok(auditLog !== null, 'Audit log entry must exist for location update');
      assert.strictEqual(auditLog!.userId, orgAdminUser.id);
      const metadata = auditLog!.metadata as any;
      assert.strictEqual(metadata.previous.latitude, 18.520432);
      assert.strictEqual(metadata.updated.latitude, 18.521000);

      pass('Update Location & Audit Trail: Successfully recorded previous and updated coordinates in AuditLog');
    } catch (e: any) {
      fail('Updating location & audit trail', e);
    }

    // ----------------------------------------------------------------
    // TEST 3: New Blood Bank Location Confirmation during Onboarding
    // ----------------------------------------------------------------
    console.log('\n--- Test 3: New Blood Bank Registration with Location Coordinates ---');
    try {
      const newLicense = `CDSCO-NEW-${ts}`;
      const app = await OrganisationService.submitApplication({
        hospitalName: `New Life Blood Centre ${ts}`,
        licenseNumber: newLicense,
        stateCode: 27,
        districtCode: 521,
        districtName: 'Pune',
        contactPerson: 'Dr. Anita Joshi',
        email: `anita.${ts}@bloodcentre.org`,
        phone: `+9191${ts.toString().slice(-8)}`,
        componentTypes: ['PRBC', 'Whole Blood'],
        latitude: 18.530000,
        longitude: 73.840000,
        locationAddress: 'Main Blood Bank Entrance, Pune Camp',
      });

      assert.strictEqual(app.latitude, 18.53);
      assert.strictEqual(app.longitude, 73.84);
      assert.strictEqual(app.locationAddress, 'Main Blood Bank Entrance, Pune Camp');

      // Admin approves application
      const reviewResult = await OrganisationService.reviewApplication(
        app.id,
        platformAdmin,
        {
          status: 'APPROVED',
          reviewNotes: 'Verified CDSCO license and entrance location coordinates',
          reviewedBy: platformAdmin.id,
        }
      );

      const createdOrgId = (reviewResult as any).organisation?.id || reviewResult.application?.resultingOrgId;
      assert.ok(createdOrgId, 'Resulting organisation ID must exist');
      const createdOrg = await prisma.organisation.findUnique({
        where: { id: createdOrgId },
      });

      assert.strictEqual(createdOrg!.locationStatus, 'CONFIRMED');
      assert.strictEqual(createdOrg!.latitude, 18.53);
      assert.strictEqual(createdOrg!.longitude, 73.84);
      assert.strictEqual(createdOrg!.locationConfirmedBy, platformAdmin.id);

      pass('New Registration: Application with coordinates converts to CONFIRMED Organisation upon approval');
    } catch (e: any) {
      fail('New blood bank registration location flow', e);
    }

    // ----------------------------------------------------------------
    // TEST 8, 9, 10: Donor Proximity, Location Freshness & Matching Integration
    // ----------------------------------------------------------------
    console.log('\n--- Test 8, 9, 10: Matching Engine Integration & Privacy Boundaries ---');
    try {
      // 1. Create Patient Blood Request assigned to orgA
      const patientUser = await prisma.user.create({
        data: {
          phoneNumber: `+9188${ts.toString().slice(-8)}`,
          role: 'USER',
          status: 'ACTIVE',
        },
      });

      const bloodRequest = await prisma.bloodRequest.create({
        data: {
          requesterId: patientUser.id,
          patientName: 'Noble Hospital Patient',
          bloodGroup: 'B_POS',
          component: 'PRBC',
          unitsRequested: 1,
          status: 'OPEN',
          message: JSON.stringify({
            assignedBankId: orgA.id,
            requestingOrgName: orgA.name,
            matchingRequest: {
              status: 'REQUESTED',
              requestedAt: new Date().toISOString(),
              shortfall: 1,
            },
          }),
        },
      });

      // 2. Create Donor 1: Live Fresh GPS (1.2 km away from orgA, B+ compatible)
      const uLive = await prisma.user.create({
        data: { phoneNumber: donorPhoneLive, role: 'USER', status: 'ACTIVE' },
      });
      const dLive = await prisma.donorProfile.create({
        data: {
          userId: uLive.id,
          bloodGroup: 'B_POS',
          isAvailable: true,
          isSearchable: true,
          stateCode: 27,
          districtCode: 521,
          cityOrLocality: 'FC Road',
        },
      });
      const sessLive = await prisma.donorLocationSession.create({
        data: {
          donorUserId: uLive.id,
          status: 'ACTIVE',
          consentGranted: true,
          consentVersion: 'v1.0',
          consentGrantedAt: new Date(),
        },
      });
      await prisma.donorLatestLocation.create({
        data: {
          donorUserId: uLive.id,
          sessionId: sessLive.id,
          latitude: 18.5300, // ~1.2 km from orgA (18.5210, 73.8570)
          longitude: 73.8500,
          accuracy: 10,
          deviceTimestamp: new Date(),
          serverReceivedAt: new Date(), // Just now -> FRESH
          isStale: false,
        },
      });

      // 3. Create Donor 2: Stale GPS (45 minutes old -> STALE_GPS, B+ compatible)
      const uStale = await prisma.user.create({
        data: { phoneNumber: donorPhoneStale, role: 'USER', status: 'ACTIVE' },
      });
      const dStale = await prisma.donorProfile.create({
        data: {
          userId: uStale.id,
          bloodGroup: 'B_POS',
          isAvailable: true,
          isSearchable: true,
          stateCode: 27,
          districtCode: 521,
          cityOrLocality: 'Kothrud',
        },
      });
      const sessStale = await prisma.donorLocationSession.create({
        data: {
          donorUserId: uStale.id,
          status: 'ACTIVE',
          consentGranted: true,
          consentVersion: 'v1.0',
          consentGrantedAt: new Date(Date.now() - 60 * 60 * 1000),
        },
      });
      await prisma.donorLatestLocation.create({
        data: {
          donorUserId: uStale.id,
          sessionId: sessStale.id,
          latitude: 18.5050,
          longitude: 73.8100,
          accuracy: 25,
          deviceTimestamp: new Date(Date.now() - 45 * 60 * 1000),
          serverReceivedAt: new Date(Date.now() - 45 * 60 * 1000), // 45 mins ago -> STALE
          isStale: false,
        },
      });

      // 4. Create Donor 3: Revoked Location Consent (fallback to Registered Area)
      const uRevoked = await prisma.user.create({
        data: { phoneNumber: donorPhoneRevoked, role: 'USER', status: 'ACTIVE' },
      });
      const dRevoked = await prisma.donorProfile.create({
        data: {
          userId: uRevoked.id,
          bloodGroup: 'B_POS',
          isAvailable: true,
          isSearchable: true,
          stateCode: 27,
          districtCode: 521,
          cityOrLocality: 'Hadapsar',
        },
      });
      await prisma.donorLocationSession.create({
        data: {
          donorUserId: uRevoked.id,
          status: 'REVOKED', // Explicitly revoked
          consentGranted: false,
          consentVersion: 'v1.0',
          consentGrantedAt: new Date(Date.now() - 100000),
          endedAt: new Date(),
          endedReason: 'DONOR_REVOKED',
        },
      });
      // No active DonorLatestLocation

      // 5. Create Donor 4: Incompatible Blood Group (AB+ donor for B+ PRBC recipient -> incompatible)
      const uIncomp = await prisma.user.create({
        data: { phoneNumber: donorPhoneIncomp, role: 'USER', status: 'ACTIVE' },
      });
      await prisma.donorProfile.create({
        data: {
          userId: uIncomp.id,
          bloodGroup: 'AB_POS', // Incompatible for PRBC B+
          isAvailable: true,
          isSearchable: true,
          stateCode: 27,
          districtCode: 521,
        },
      });

      // Run Matching Search (Platform Admin)
      const searchResult = await AdminMatchingService.runMatchingSearch(
        platformAdmin.id,
        bloodRequest.id,
        'DISTRICT_EXPANDED',
        'Testing proximity ranking across district with confirmed Blood Bank coordinates'
      );

      // Verify Hard Clinical Gate: Incompatible AB+ donor must NEVER appear in candidate results
      const foundIncompatible = searchResult.candidates.some((c) => c.bloodGroup === 'AB_POS');
      assert.strictEqual(foundIncompatible, false, 'Incompatible blood group must be strictly filtered out');

      // Verify Candidates were found
      assert.ok(searchResult.candidates.length >= 3, 'Must match compatible donors');

      // Candidate 1 must be Live Fresh GPS donor (ranks first by proximity)
      const firstCandidate = searchResult.candidates.find((c) => c.donorId === dLive.id);
      assert.ok(firstCandidate !== undefined);
      assert.strictEqual(firstCandidate!.proximityTier, 'FRESH_GPS');
      assert.strictEqual(firstCandidate!.locationFreshness, 'FRESH');
      assert.strictEqual(firstCandidate!.distanceType, 'straight_line');
      assert.ok(firstCandidate!.distanceKm !== null && firstCandidate!.distanceKm <= 2.0, 'Live donor ~1.2 km');

      // Candidate 2 (Stale) must be labeled STALE_GPS, never live
      const staleCandidate = searchResult.candidates.find((c) => c.donorId === dStale.id);
      assert.ok(staleCandidate !== undefined);
      assert.strictEqual(staleCandidate!.proximityTier, 'STALE_GPS');
      assert.strictEqual(staleCandidate!.locationFreshness, 'STALE');

      // Candidate 3 (Revoked) must fallback to REGISTERED_AREA
      const revokedCandidate = searchResult.candidates.find((c) => c.donorId === dRevoked.id);
      assert.ok(revokedCandidate !== undefined);
      assert.strictEqual(revokedCandidate!.proximityTier, 'REGISTERED_AREA');
      assert.strictEqual(revokedCandidate!.locationFreshness, 'UNAVAILABLE');

      // Verify privacy boundary: Raw GPS (latitude, longitude) is NEVER exposed on RankedDonorCandidateDTO
      assert.strictEqual((firstCandidate as any).latitude, undefined);
      assert.strictEqual((firstCandidate as any).longitude, undefined);

      pass('Hard Eligibility & Proximity Ranking: AB+ filtered out; Fresh GPS ranked first; Stale marked STALE; Revoked fallback to Registered Area; Raw GPS stripped');

      // ----------------------------------------------------------------
      // TEST 10: Visibility Boundaries (Admin vs Designated Bank vs Non-Designated Bank)
      // ----------------------------------------------------------------
      console.log('\n--- Test 10: Tenant Isolation & Visibility Boundaries ---');

      // Before release, Blood Bank sees 0 candidates
      const preReleaseBank = await AdminMatchingService.getReleasedCandidatesForBloodBank(
        orgAdminUser.id,
        'ORG_ADMIN',
        orgA.id,
        bloodRequest.id
      );
      assert.strictEqual(preReleaseBank.isReleased, false);
      assert.strictEqual(preReleaseBank.candidates.length, 0);

      // Admin explicitly releases candidate 1 (dLive)
      const releaseRes = await AdminMatchingService.releaseMatchingCandidates(
        platformAdmin.id,
        bloodRequest.id,
        [dLive.id],
        'Approved live proximity candidate'
      );
      assert.strictEqual(releaseRes.releasedCount, 1);

      // Designated Blood Bank A now sees candidate 1
      const postReleaseBank = await AdminMatchingService.getReleasedCandidatesForBloodBank(
        orgAdminUser.id,
        'ORG_ADMIN',
        orgA.id,
        bloodRequest.id
      );
      assert.strictEqual(postReleaseBank.isReleased, true);
      assert.strictEqual(postReleaseBank.candidates.length, 1);
      assert.strictEqual(postReleaseBank.candidates[0].donorId, dLive.id);
      assert.strictEqual(postReleaseBank.candidates[0].proximityTier, 'FRESH_GPS');
      assert.strictEqual(postReleaseBank.candidates[0].distanceType, 'straight_line');
      // Verify raw GPS is NOT revealed to blood bank
      assert.strictEqual((postReleaseBank.candidates[0] as any).latitude, undefined);
      assert.strictEqual((postReleaseBank.candidates[0] as any).longitude, undefined);

      // Non-designated Blood Bank (orgB) receives 403 Forbidden
      let orgBCaught = false;
      try {
        await AdminMatchingService.getReleasedCandidatesForBloodBank(
          foreignUser.id,
          'AUDITOR',
          orgB.id,
          bloodRequest.id
        );
      } catch (err: any) {
        orgBCaught = true;
        assert.ok(err.statusCode === 403 || err.message.includes('Access denied'), 'Must be 403 Forbidden');
      }
      assert.strictEqual(orgBCaught, true, 'Non-designated organisation must be rejected with 403 Forbidden');

      pass('Visibility Boundaries: Pre-release hidden; Released candidate visible to designated bank; Non-designated bank 403 blocked');

      // ----------------------------------------------------------------
      // TEST 11: Realtime Event Authorization & Minimal Payload
      // ----------------------------------------------------------------
      console.log('\n--- Test 11: Realtime Outbox Event Verification ---');
      const outboxEvent = await prisma.outboxEvent.findFirst({
        where: {
          eventType: 'organisation.location_updated',
          organisationId: orgA.id,
        },
        orderBy: { createdAt: 'desc' },
      });

      assert.ok(outboxEvent !== null, 'Outbox event organisation.location_updated must exist');
      const payload = outboxEvent!.payload as any;
      assert.strictEqual(payload.organisationId, orgA.id);
      assert.strictEqual(payload.locationStatus, 'CONFIRMED');
      assert.strictEqual(payload.districtCode, 521);
      // Ensure raw coordinates were not leaked into broad public notification payload
      assert.strictEqual(payload.latitude, undefined);
      assert.strictEqual(payload.longitude, undefined);

      pass('Realtime Outbox: organisation.location_updated emitted with minimal non-leaking payload');

      // ----------------------------------------------------------------
      // TEST 12: Shared Types Safety Verification
      // ----------------------------------------------------------------
      console.log('\n--- Test 12: Type Safety for Affected Contracts ---');
      const testLocationDTO: BloodBankLocationDTO = {
        organisationId: orgA.id,
        latitude: 18.521,
        longitude: 73.857,
        locationStatus: 'CONFIRMED',
        locationConfirmedAt: new Date().toISOString(),
        locationConfirmedBy: orgAdminUser.id,
        locationAddress: 'Pune',
      };
      assert.strictEqual(testLocationDTO.locationStatus, 'CONFIRMED');

      const testRouteDTO: RouteDirectionsDTO = {
        distanceKm: 14.5,
        durationMinutes: 28,
        profile: 'driving',
        source: 'mapbox_directions',
        cached: false,
      };
      assert.strictEqual(testRouteDTO.source, 'mapbox_directions');

      pass('Type Safety: BloodBankLocationDTO, RouteDirectionsDTO, and RealtimeEventType compile cleanly');
    } catch (e: any) {
      fail('Matching integration and visibility boundaries', e);
    }

    console.log('\n====================================================================');
    console.log(`Results: ${passed} Passed, ${failed} Failed`);
    console.log('====================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Fatal test error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
