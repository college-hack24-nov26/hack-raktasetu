/**
 * RaktaSetu — Focused Verification Suite for Blood Stock Allocation & Released Candidate Visibility
 * 
 * Scenarios Tested:
 * 1. Transfusion Medicine Compatibility in Stock Availability (AB+ recipient with O+ PRBC unit)
 * 2. Atomic Stock Allocation & Outbox Event Emission
 * 3. Shortfall Calculation & Server-Side Duplicate Matching Request Prevention
 * 4. Platform Admin Release & Requesting Blood Bank Candidate Visibility
 * 5. Strict Multi-Tenancy Isolation & 403 Forbidden Authorization
 * 6. Released Candidate Arrival Intake & Duplicate Arrival Prevention
 */

import assert from 'assert';
import { prisma } from './lib/prisma';
import { HospitalIntegrationService } from './services/hospitalIntegration';
import { AdminMatchingService } from './services/adminMatchingService';

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
  console.log('🧪 RaktaSetu — Stock Allocation & Candidate Visibility Verification');
  console.log('====================================================================\n');

  const ts = Date.now();
  const orgCodeA = `BB-ALLOC-A-${ts.toString().slice(-6)}`;
  const orgCodeB = `BB-ALLOC-B-${ts.toString().slice(-6)}`;
  const staffPhoneA = `+9198${ts.toString().slice(-8)}`;
  const staffPhoneB = `+9197${ts.toString().slice(-8)}`;
  const patientPhone = `+9196${ts.toString().slice(-8)}`;
  const donorPhone1 = `+9195${ts.toString().slice(-8)}`;
  const donorPhone2 = `+9194${ts.toString().slice(-8)}`;

  try {
    console.log('--- Step 0: Test Fixtures Setup ---');

    // Create BloodCentres
    await prisma.bloodCentre.create({
      data: {
        hospitalName: `Gupta Life Blood Centre ${ts}`,
        hospitalCode: orgCodeA,
        stateCode: 27,
        districtCode: 521,
        address: '100 Health Way, Pune',
      },
    });

    await prisma.bloodCentre.create({
      data: {
        hospitalName: `Other Blood Centre ${ts}`,
        hospitalCode: orgCodeB,
        stateCode: 27,
        districtCode: 522,
        address: '200 Medical Way, Mumbai',
      },
    });

    // Create Organisations
    const orgA = await prisma.organisation.create({
      data: {
        name: `Gupta Life Blood Centre ${ts}`,
        orgCode: orgCodeA,
        hospitalCode: orgCodeA,
        licenseNumber: `LIC-${ts}-1`,
        districtCode: 521,
        stateCode: 27,
        status: 'VERIFIED',
      },
    });

    const orgB = await prisma.organisation.create({
      data: {
        name: `Other Blood Centre ${ts}`,
        orgCode: orgCodeB,
        hospitalCode: orgCodeB,
        licenseNumber: `LIC-${ts}-2`,
        districtCode: 522,
        stateCode: 27,
        status: 'VERIFIED',
      },
    });

    // Create Staff Users & Memberships
    const staffUserA = await prisma.user.create({
      data: {
        phoneNumber: staffPhoneA,
        name: 'Bank A Operational Staff',
        role: 'USER',
        status: 'ACTIVE',
      },
    });

    await prisma.organisationMembership.create({
      data: {
        organisationId: orgA.id,
        userId: staffUserA.id,
        role: 'ORG_ADMIN',
        isActive: true,
      },
    });

    const staffUserB = await prisma.user.create({
      data: {
        phoneNumber: staffPhoneB,
        name: 'Bank B Staff',
        role: 'USER',
        status: 'ACTIVE',
      },
    });

    await prisma.organisationMembership.create({
      data: {
        organisationId: orgB.id,
        userId: staffUserB.id,
        role: 'ORG_ADMIN',
        isActive: true,
      },
    });

    // Create Admin User
    const adminUser = await prisma.user.create({
      data: {
        phoneNumber: `+9199${ts.toString().slice(-8)}`,
        name: 'Platform Admin',
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    });

    // Create Patient User
    const patientUser = await prisma.user.create({
      data: {
        phoneNumber: patientPhone,
        name: 'Sachin Patient',
        role: 'USER',
        status: 'ACTIVE',
      },
    });

    // Create Donors
    const donorUser1 = await prisma.user.create({
      data: {
        phoneNumber: donorPhone1,
        name: 'Candidate Donor One',
        role: 'USER',
        status: 'ACTIVE',
      },
    });
    const donorProfile1 = await prisma.donorProfile.create({
      data: {
        userId: donorUser1.id,
        bloodGroup: 'B_NEG',
        fullName: 'Candidate Donor One',
        isAvailable: true,
        isSearchable: true,
        districtCode: 521,
        cityOrLocality: 'Pune Camp',
        primaryHospitalCode: orgCodeA,
      },
    });

    const donorUser2 = await prisma.user.create({
      data: {
        phoneNumber: donorPhone2,
        name: 'Candidate Donor Two',
        role: 'USER',
        status: 'ACTIVE',
      },
    });
    const donorProfile2 = await prisma.donorProfile.create({
      data: {
        userId: donorUser2.id,
        bloodGroup: 'B_NEG',
        fullName: 'Candidate Donor Two',
        isAvailable: true,
        isSearchable: true,
        districtCode: 521,
        cityOrLocality: 'Shivajinagar',
        primaryHospitalCode: orgCodeA,
      },
    });

    // Obtain or create a source collection unit
    let cu = await prisma.collectionUnit.findFirst({ select: { id: true } });
    if (!cu) {
      const facilityCamp = await HospitalIntegrationService.getOrCreateCentreFacilityCamp(
        prisma as any,
        orgA.id,
        staffUserA.id
      );
      const att = await prisma.campAttendance.create({
        data: {
          campId: facilityCamp.id,
          userId: donorUser1.id,
          donorProfileId: donorProfile1.id,
          donorName: 'Test Donor',
          donorPhone: donorPhone1,
          bloodGroup: 'O_POS',
          status: 'CHECKED_IN',
        },
      });
      const de = await prisma.donationEvent.create({
        data: {
          campId: facilityCamp.id,
          attendanceId: att.id,
          donorUserId: donorUser1.id,
          bloodGroup: 'O_POS',
          outcome: 'COMPLETED',
          volumeMl: 450,
          recordedBy: staffUserA.id,
        },
      });
      cu = await prisma.collectionUnit.create({
        data: {
          unitNumber: `CU-TEST-${ts}`,
          donationEventId: de.id,
          campId: facilityCamp.id,
          organisationId: orgA.id,
          bloodGroup: 'O_POS',
          collectedBy: staffUserA.id,
        },
      });
    }

    // Setup an O+ PRBC unit in Bank A (clinically released, expires in 30 days)
    const futureExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const prbcUnit = await prisma.componentUnit.create({
      data: {
        organisationId: orgA.id,
        collectionUnitId: cu.id,
        derivedBy: staffUserA.id,
        componentCode: `CMP-${ts.toString().slice(-6)}-PRBC-O`,
        componentType: 'PRBC',
        bloodGroup: 'O_POS',
        volumeMl: 350,
        status: 'AVAILABLE',
        isHold: false,
        expiresAt: futureExpiry,
      },
    });

    await prisma.clinicalReleaseRecord.create({
      data: {
        componentUnitId: prbcUnit.id,
        organisationId: orgA.id,
        decision: 'RELEASED',
        authorizedClinicalUserId: staffUserA.id,
        decisionTimestamp: new Date(),
        reason: 'Passed all mandatory TTI screening tests',
        reviewedTestIds: [],
      },
    });

    pass('Step 0: Test fixtures setup (Organisations, Staff, Donors, Inventory)');

    // ------------------------------------------------------------------
    // Scenario 1: Transfusion Medicine Compatibility in Stock Availability
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 1: Transfusion Medicine Component Compatibility ---');

    // Create Blood Request for AB+ recipient, 1 unit PRBC, designated to Bank A
    const req1 = await prisma.bloodRequest.create({
      data: {
        requesterId: patientUser.id,
        patientName: 'Sachin Emergency',
        bloodGroup: 'AB_POS',
        component: 'Packed Red Blood Cells',
        unitsRequested: 1,
        hospitalCode: orgCodeA,
        status: 'OPEN',
        message: JSON.stringify({
          hospitalName: 'Noble Hospital Pune',
          assignedBankId: orgA.id,
          assignedBankName: 'Gupta Life Blood Centre',
          urgency: 'URGENT',
        }),
      },
    });

    const bankARequests = await HospitalIntegrationService.getIncomingBloodRequests(orgA.id);
    const enrichedReq1 = bankARequests.find((r) => r.id === req1.id);

    assert(enrichedReq1, 'Request 1 should appear in Bank A incoming requests');
    assert.strictEqual(enrichedReq1.availableStockCount, 1, 'AB+ recipient should have 1 compatible O+ PRBC unit available');
    assert.strictEqual(enrichedReq1.availableEligibleStockCount, 1, 'availableEligibleStockCount should be 1');
    assert(enrichedReq1.compatibleBloodGroups.includes('O_POS'), 'compatibleBloodGroups should include O_POS');
    assert(enrichedReq1.compatibleBloodGroups.includes('AB_POS'), 'compatibleBloodGroups should include AB_POS');
    assert.strictEqual(enrichedReq1.shortfallCount, 1, 'Initial shortfall count should be 1 before reservation');
    pass('Scenario 1: AB+ recipient correctly detects compatible O+ PRBC inventory in stock');

    // ------------------------------------------------------------------
    // Scenario 2: Direct Atomic Stock Allocation
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 2: Direct Atomic Stock Allocation ---');

    const allocResult = await HospitalIntegrationService.acceptAndReserveRequest(
      staffUserA.id,
      orgA.id,
      req1.id
    );

    assert.strictEqual(allocResult.success, true, 'acceptAndReserveRequest should succeed');
    assert.strictEqual(allocResult.isPartial, false, '1 unit requested and 1 allocated -> isPartial false');
    assert.strictEqual(allocResult.reservedUnits.length, 1, 'Should allocate exactly 1 unit');
    assert.strictEqual(allocResult.reservedUnits[0].id, prbcUnit.id, 'Allocated unit should be the compatible PRBC unit');

    // Check DB unit status
    const dbUnit = await prisma.componentUnit.findUnique({ where: { id: prbcUnit.id } });
    assert.strictEqual(dbUnit?.status, 'RESERVED', 'Unit status must transition to RESERVED');

    // Check DB request status & outcome
    const dbReq1 = await prisma.bloodRequest.findUnique({ where: { id: req1.id } });
    assert.strictEqual(dbReq1?.closureOutcome, 'STOCK_RESERVED', 'Request closureOutcome must be STOCK_RESERVED');

    // Verify outbox events
    const outboxEvents = await prisma.outboxEvent.findMany({
      where: { entityId: req1.id },
      orderBy: { createdAt: 'desc' },
    });
    const eventTypes = outboxEvents.map((e) => e.eventType);
    assert(eventTypes.includes('blood_request.allocated'), 'Outbox must contain blood_request.allocated');
    assert(eventTypes.includes('blood_request.status_changed'), 'Outbox must contain blood_request.status_changed');

    // Verify refreshed queue state
    const bankARefreshed = await HospitalIntegrationService.getIncomingBloodRequests(orgA.id);
    const enrichedRefreshed = bankARefreshed.find((r) => r.id === req1.id);
    assert.strictEqual(enrichedRefreshed?.allocatedUnitsCount, 1, 'Allocated count must be 1');
    assert.strictEqual(enrichedRefreshed?.shortfallCount, 0, 'Shortfall count must be 0 after full allocation');
    assert.strictEqual(enrichedRefreshed?.availableStockCount, 0, 'No remaining stock after allocation');
    pass('Scenario 2: Direct atomic stock allocation, unit reservation, and outbox emission verified');

    // ------------------------------------------------------------------
    // Scenario 3: Shortfall Calculation & Duplicate Matching Request Prevention
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 3: Shortfall Calculation & Matching Request Lifecycle ---');

    // Create Blood Request for B- recipient, 2 units PRBC, 0 in stock
    const req2 = await prisma.bloodRequest.create({
      data: {
        requesterId: patientUser.id,
        patientName: 'Sachin Shortfall Case',
        bloodGroup: 'B_NEG',
        component: 'Packed Red Blood Cells',
        unitsRequested: 2,
        hospitalCode: orgCodeA,
        status: 'OPEN',
        message: JSON.stringify({
          hospitalName: 'Noble Hospital Pune',
          assignedBankId: orgA.id,
          assignedBankName: 'Gupta Life Blood Centre',
          urgency: 'URGENT',
        }),
      },
    });

    const queueBeforeMatching = await HospitalIntegrationService.getIncomingBloodRequests(orgA.id);
    const req2Enriched = queueBeforeMatching.find((r) => r.id === req2.id);
    assert.strictEqual(req2Enriched?.availableStockCount, 0, '0 stock available for B- PRBC');
    assert.strictEqual(req2Enriched?.shortfallCount, 2, 'Shortfall should be 2 units');
    assert.strictEqual(req2Enriched?.canRequestMatching, true, 'canRequestMatching should be true');
    assert.strictEqual(req2Enriched?.matchingStatus, 'NOT_REQUESTED', 'Initial matchingStatus should be NOT_REQUESTED');

    // Request Donor Matching
    const mrResult = await HospitalIntegrationService.requestDonorMatching(
      staffUserA.id,
      orgA.id,
      req2.id
    );
    assert.strictEqual(mrResult.success, true, 'Donor matching request should succeed');
    assert.strictEqual(mrResult.matchingRequest.status, 'REQUESTED', 'Matching status should be REQUESTED');
    assert.strictEqual(mrResult.matchingRequest.requestedShortfall, 2, 'Requested shortfall should be 2');

    // Attempt Duplicate Matching Request -> Must fail
    try {
      await HospitalIntegrationService.requestDonorMatching(
        staffUserA.id,
        orgA.id,
        req2.id
      );
      assert.fail('Duplicate matching request should throw error');
    } catch (err: any) {
      assert(
        err.message.includes('already in progress') || err.code === 'MATCHING_ALREADY_IN_PROGRESS',
        `Should reject duplicate matching request, got: ${err.message}`
      );
    }

    const queueAfterMatching = await HospitalIntegrationService.getIncomingBloodRequests(orgA.id);
    const req2After = queueAfterMatching.find((r) => r.id === req2.id);
    assert.strictEqual(req2After?.matchingStatus, 'REQUESTED', 'Refreshed matchingStatus should be REQUESTED');
    assert.strictEqual(req2After?.hasMatchingRequest, true, 'hasMatchingRequest should be true');
    assert.strictEqual(req2After?.canRequestMatching, false, 'canRequestMatching must be false when already requested');
    pass('Scenario 3: Shortfall calculation and duplicate matching request prevention verified');

    // ------------------------------------------------------------------
    // Scenario 4: Platform Admin Release & Requesting Bank Candidate Visibility
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 4: Platform Admin Release & Blood Bank Visibility ---');

    // Platform Admin releases donorProfile1 and donorProfile2 to Bank A
    const releaseRes = await AdminMatchingService.releaseMatchingCandidates(
      adminUser.id,
      req2.id,
      [donorProfile1.id, donorProfile2.id]
    );
    assert.strictEqual(releaseRes.success, true, 'Admin candidate release should succeed');
    assert.strictEqual(releaseRes.releasedCount, 2, 'Should release 2 candidates');

    // Bank A retrieves released candidates via authoritative service
    const candidatesRes = await AdminMatchingService.getReleasedCandidatesForBloodBank(
      staffUserA.id,
      'ORG_STAFF',
      orgA.id,
      req2.id
    );

    assert.strictEqual(candidatesRes.isReleased, true, 'isReleased should be true');
    assert.strictEqual(candidatesRes.releasedCount, 2, 'releasedCount should be 2');
    assert.strictEqual(candidatesRes.candidates.length, 2, 'Candidates array length should be 2');

    const c1 = candidatesRes.candidates[0];
    assert.strictEqual(c1.donorId, donorProfile1.id, 'Candidate 1 ID must match');
    assert.strictEqual(c1.bloodGroup, 'B_NEG', 'Candidate blood group must be B_NEG');
    assert.strictEqual(c1.isCompatible, true, 'Candidate must be clinically compatible');
    assert(c1.proximityTier === 'FRESH_GPS' || c1.proximityTier === 'STALE_GPS' || c1.proximityTier === 'REGISTERED_AREA', 'Proximity tier must be valid');
    assert.strictEqual(c1.contactNumber, null, 'Contact phone must be withheld prior to outreach acceptance');
    assert.strictEqual(c1.arrived, false, 'Candidate should not be arrived initially');

    // Also verify getIncomingBloodRequests reflects released candidates
    const queueAfterRelease = await HospitalIntegrationService.getIncomingBloodRequests(orgA.id);
    const req2Released = queueAfterRelease.find((r) => r.id === req2.id);
    assert.strictEqual(req2Released?.matchingStatus, 'RELEASED', 'matchingStatus must be RELEASED');
    assert.strictEqual(req2Released?.releasedCandidateCount, 2, 'releasedCandidateCount must be 2');
    assert.strictEqual(req2Released?.canRequestMatching, false, 'Cannot request matching when candidates released');
    pass('Scenario 4: Platform Admin candidate release and Bank A candidate visibility verified');

    // ------------------------------------------------------------------
    // Scenario 5: Strict Multi-Tenancy Isolation & 403 Forbidden Authorization
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 5: Multi-Tenancy Isolation & 403 Forbidden Protection ---');

    // Non-designated Bank B attempts to view Bank A's released candidates
    try {
      await AdminMatchingService.getReleasedCandidatesForBloodBank(
        staffUserB.id,
        'ORG_STAFF',
        orgB.id,
        req2.id
      );
      assert.fail('Bank B should be denied access to Bank A candidates');
    } catch (err: any) {
      assert(
        err.message.includes('Access denied') || err.statusCode === 403 || err.code === 'FORBIDDEN_ACCESS',
        `Expected 403 Access Denied, got: ${err.message}`
      );
    }

    // Non-designated Bank B attempts to reserve stock on Bank A request
    try {
      await HospitalIntegrationService.acceptAndReserveRequest(
        staffUserB.id,
        orgB.id,
        req2.id
      );
      assert.fail('Bank B should be denied reservation on Bank A request');
    } catch (err: any) {
      assert(
        err.message.includes('Access denied') || err.statusCode === 403 || err.code === 'FORBIDDEN_NOT_DESIGNATED',
        `Expected 403 Access Denied, got: ${err.message}`
      );
    }
    pass('Scenario 5: Multi-tenancy isolation and 403 Forbidden access denial verified');

    // ------------------------------------------------------------------
    // Scenario 6: Candidate Arrival Intake & Duplicate Arrival Prevention
    // ------------------------------------------------------------------
    console.log('\n--- Scenario 6: Candidate Arrival Intake & Duplicate Prevention ---');

    const arrivalRes = await HospitalIntegrationService.recordDonorArrival(
      staffUserA.id,
      orgA.id,
      req2.id,
      donorProfile1.id,
      'Candidate donor 1 arrived at Gupta Life reception'
    );

    assert.strictEqual(arrivalRes.success, true, 'recordDonorArrival should succeed');
    assert.strictEqual(arrivalRes.donorIntake.intakeStatus, 'ARRIVED', 'intakeStatus should be ARRIVED');
    assert.strictEqual(arrivalRes.donorIntake.donorId, donorProfile1.id, 'donorId must match candidate');

    // Attempt Duplicate Arrival for Candidate 1 -> Must fail
    try {
      await HospitalIntegrationService.recordDonorArrival(
        staffUserA.id,
        orgA.id,
        req2.id,
        donorProfile1.id,
        'Duplicate arrival attempt'
      );
      assert.fail('Duplicate arrival should throw error');
    } catch (err: any) {
      assert(
        err.message.includes('already been recorded') || err.statusCode === 400,
        `Expected duplicate arrival error, got: ${err.message}`
      );
    }

    // Verify released candidate query now reports arrival status
    const candidatesAfterArrival = await AdminMatchingService.getReleasedCandidatesForBloodBank(
      staffUserA.id,
      'ORG_STAFF',
      orgA.id,
      req2.id
    );

    const c1Arrived = candidatesAfterArrival.candidates.find((c) => c.donorId === donorProfile1.id);
    const c2NotArrived = candidatesAfterArrival.candidates.find((c) => c.donorId === donorProfile2.id);

    assert.strictEqual(c1Arrived?.arrived, true, 'Candidate 1 must have arrived === true');
    assert.strictEqual(c1Arrived?.intakeStatus, 'ARRIVED', 'Candidate 1 intakeStatus must be ARRIVED');
    assert.strictEqual(c2NotArrived?.arrived, false, 'Candidate 2 must have arrived === false');
    assert.strictEqual(c2NotArrived?.intakeStatus, null, 'Candidate 2 intakeStatus must be null');
    pass('Scenario 6: Candidate arrival intake and duplicate arrival prevention verified');

  } catch (err: any) {
    fail('Unhandled test suite failure', err);
  } finally {
    console.log('\n====================================================================');
    console.log(`📊 Verification Results: ${passed} Passed, ${failed} Failed`);
    console.log('====================================================================\n');
    await prisma.$disconnect();
    if (failed > 0) process.exit(1);
  }
}

runTests();
