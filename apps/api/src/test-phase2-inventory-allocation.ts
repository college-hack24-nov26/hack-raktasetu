/**
 * RaktaSetu Phase 2 Focused Verification:
 * Blood Bank Inventory Allocation, Shortfall Handling, Concurrency Guard, Cold-Chain Dispatch & Fulfilment.
 */

import assert from 'assert';
import { prisma } from './lib/prisma';
import { HospitalIntegrationService } from './services/hospitalIntegration';
import { RealtimeService } from './services/realtime';

async function runPhase2Verification() {
  console.log('\n================================================================');
  console.log('🧪 RaktaSetu Phase 2 Focused Verification Suite');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  function recordPass(testName: string) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  }

  function recordFail(testName: string, error: any) {
    console.error(`  ❌ FAIL: ${testName} ->`, error.message || error);
    failed++;
  }

  try {
    // -------------------------------------------------------------
    // FIXTURE SETUP
    // -------------------------------------------------------------
    const testAdmin = await prisma.user.upsert({
      where: { phoneNumber: '+919811110001' },
      update: { role: 'ADMIN', name: 'Platform Admin Test' },
      create: {
        phoneNumber: '+919811110001',
        name: 'Platform Admin Test',
        role: 'ADMIN',
      },
    });

    const testPatient = await prisma.user.upsert({
      where: { phoneNumber: '+919811110002' },
      update: { role: 'USER', name: 'Sunil Shinde' },
      create: {
        phoneNumber: '+919811110002',
        name: 'Sunil Shinde',
        role: 'USER',
      },
    });

    const testStaffUser = await prisma.user.upsert({
      where: { phoneNumber: '+919811110003' },
      update: { role: 'ADMIN', name: 'Dr. Ramesh Kulkarni' },
      create: {
        phoneNumber: '+919811110003',
        name: 'Dr. Ramesh Kulkarni',
        role: 'ADMIN',
      },
    });

    const donorUser = await prisma.user.upsert({
      where: { phoneNumber: '+919811110004' },
      update: { role: 'DONOR', name: 'P2 Volunteer Donor' },
      create: {
        phoneNumber: '+919811110004',
        name: 'P2 Volunteer Donor',
        role: 'DONOR',
      },
    });

    const donorUserB = await prisma.user.upsert({
      where: { phoneNumber: '+919811110005' },
      update: { role: 'DONOR', name: 'P2 Volunteer Donor B' },
      create: {
        phoneNumber: '+919811110005',
        name: 'P2 Volunteer Donor B',
        role: 'DONOR',
      },
    });

    // Centres
    await prisma.bloodCentre.upsert({
      where: { hospitalCode: 'BC-P2-001' },
      update: { hospitalName: 'Pune Model Blood Centre', districtCode: 521, stateCode: 27 },
      create: {
        hospitalCode: 'BC-P2-001',
        hospitalName: 'Pune Model Blood Centre',
        districtCode: 521,
        stateCode: 27,
      },
    });

    await prisma.bloodCentre.upsert({
      where: { hospitalCode: 'BC-P2-002' },
      update: { hospitalName: 'Pimpri Red Cross Blood Centre', districtCode: 521, stateCode: 27 },
      create: {
        hospitalCode: 'BC-P2-002',
        hospitalName: 'Pimpri Red Cross Blood Centre',
        districtCode: 521,
        stateCode: 27,
      },
    });

    // Organisations
    const bankOrgA = await prisma.organisation.upsert({
      where: { orgCode: 'P2-BANK-A' },
      update: { hospitalCode: 'BC-P2-001', status: 'VERIFIED', licenseNumber: 'LIC-P2-001' },
      create: {
        name: 'Pune Model Blood Centre',
        orgCode: 'P2-BANK-A',
        hospitalCode: 'BC-P2-001',
        licenseNumber: 'LIC-P2-001',
        type: 'BLOOD_BANK',
        status: 'VERIFIED',
        stateCode: 27,
        districtCode: 521,
        phone: '+912026120001',
        address: 'Camp, Pune',
      },
    });

    const bankOrgB = await prisma.organisation.upsert({
      where: { orgCode: 'P2-BANK-B' },
      update: { hospitalCode: 'BC-P2-002', status: 'VERIFIED', licenseNumber: 'LIC-P2-002' },
      create: {
        name: 'Pimpri Red Cross Blood Centre',
        orgCode: 'P2-BANK-B',
        hospitalCode: 'BC-P2-002',
        licenseNumber: 'LIC-P2-002',
        type: 'BLOOD_BANK',
        status: 'VERIFIED',
        stateCode: 27,
        districtCode: 521,
        phone: '+912027420002',
        address: 'Pimpri, Pune',
      },
    });

    // Camp and Collection Units setup for traceability
    const camp = await prisma.camp.create({
      data: {
        campCode: `CAMP-P2-${Date.now().toString().slice(-4)}`,
        title: `P2 Blood Camp ${Date.now()}`,
        organizerName: 'Pune Red Cross',
        targetDate: new Date(),
        venue: 'Pune Model Medical Hall',
        districtCode: 521,
        stateCode: 27,
        status: 'APPROVED',
      },
    });

    const attendance = await prisma.campAttendance.create({
      data: {
        campId: camp.id,
        userId: donorUser.id,
        donorName: 'P2 Volunteer Donor',
        donorPhone: donorUser.phoneNumber,
        bloodGroup: 'A_POS',
        status: 'CHECKED_IN',
        checkedInAt: new Date(),
        checkedInBy: testStaffUser.id,
      },
    });

    const donEventA = await prisma.donationEvent.create({
      data: {
        campId: camp.id,
        attendanceId: attendance.id,
        donorUserId: donorUser.id,
        outcome: 'COMPLETED',
        bloodGroup: 'A_POS',
        volumeMl: 450,
        recordedBy: testStaffUser.id,
        performedAt: new Date(),
      },
    });

    const cuA = await prisma.collectionUnit.create({
      data: {
        unitNumber: `CU-P2-A-${Date.now()}`,
        donationEventId: donEventA.id,
        organisationId: bankOrgA.id,
        bloodGroup: 'A_POS',
        status: 'PROCESSING_COMPLETED',
        collectedBy: testStaffUser.id,
      },
    });

    const attendanceB = await prisma.campAttendance.create({
      data: {
        campId: camp.id,
        userId: donorUserB.id,
        donorName: 'P2 Volunteer Donor B',
        donorPhone: donorUserB.phoneNumber,
        bloodGroup: 'A_POS',
        status: 'CHECKED_IN',
        checkedInAt: new Date(),
        checkedInBy: testStaffUser.id,
      },
    });

    const donEventB = await prisma.donationEvent.create({
      data: {
        campId: camp.id,
        attendanceId: attendanceB.id,
        donorUserId: donorUserB.id,
        outcome: 'COMPLETED',
        bloodGroup: 'A_POS',
        volumeMl: 450,
        recordedBy: testStaffUser.id,
        performedAt: new Date(),
      },
    });

    const cuB = await prisma.collectionUnit.create({
      data: {
        unitNumber: `CU-P2-B-${Date.now()}`,
        donationEventId: donEventB.id,
        organisationId: bankOrgB.id,
        bloodGroup: 'A_POS',
        status: 'PROCESSING_COMPLETED',
        collectedBy: testStaffUser.id,
      },
    });

    // -------------------------------------------------------------
    // TEST 1: Scoped Inventory Lookup & Eligibility Filter
    // -------------------------------------------------------------
    const futureDate = new Date(Date.now() + 15 * 24 * 3600 * 1000);
    const pastDate = new Date(Date.now() - 2 * 24 * 3600 * 1000);

    // 1. Eligible Unit 1 (Org A)
    const unitEligible1 = await prisma.componentUnit.create({
      data: {
        componentCode: `P2-PRBC-ELIG-01-${Date.now().toString().slice(-4)}`,
        collectionUnitId: cuA.id,
        derivedBy: testStaffUser.id,
        componentType: 'PRBC',
        bloodGroup: 'A_POS',
        volumeMl: 350,
        organisationId: bankOrgA.id,
        status: 'AVAILABLE',
        isHold: false,
        expiresAt: futureDate,
      },
    });
    await prisma.clinicalReleaseRecord.create({
      data: {
        componentUnitId: unitEligible1.id,
        organisationId: bankOrgA.id,
        decision: 'RELEASED',
        authorizedClinicalUserId: testStaffUser.id,
        reason: 'Laboratory screening negative and validated',
        reviewedTestIds: ['TEST-P2-001', 'TEST-P2-002'],
      },
    });

    // 2. Eligible Unit 2 (Org A)
    const unitEligible2 = await prisma.componentUnit.create({
      data: {
        componentCode: `P2-PRBC-ELIG-02-${Date.now().toString().slice(-4)}`,
        collectionUnitId: cuA.id,
        derivedBy: testStaffUser.id,
        componentType: 'PRBC',
        bloodGroup: 'A_POS',
        volumeMl: 350,
        organisationId: bankOrgA.id,
        status: 'AVAILABLE',
        isHold: false,
        expiresAt: futureDate,
      },
    });
    await prisma.clinicalReleaseRecord.create({
      data: {
        componentUnitId: unitEligible2.id,
        organisationId: bankOrgA.id,
        decision: 'RELEASED',
        authorizedClinicalUserId: testStaffUser.id,
        reason: 'Laboratory screening negative and validated',
        reviewedTestIds: ['TEST-P2-003', 'TEST-P2-004'],
      },
    });

    // 3. Unreleased Unit (Org A)
    const unitUnreleased = await prisma.componentUnit.create({
      data: {
        componentCode: `P2-PRBC-UNREL-${Date.now().toString().slice(-4)}`,
        collectionUnitId: cuA.id,
        derivedBy: testStaffUser.id,
        componentType: 'PRBC',
        bloodGroup: 'A_POS',
        volumeMl: 350,
        organisationId: bankOrgA.id,
        status: 'AVAILABLE',
        isHold: false,
        expiresAt: futureDate,
      },
    });

    // 4. Expired Unit (Org A)
    const unitExpired = await prisma.componentUnit.create({
      data: {
        componentCode: `P2-PRBC-EXP-${Date.now().toString().slice(-4)}`,
        collectionUnitId: cuA.id,
        derivedBy: testStaffUser.id,
        componentType: 'PRBC',
        bloodGroup: 'A_POS',
        volumeMl: 350,
        organisationId: bankOrgA.id,
        status: 'AVAILABLE',
        isHold: false,
        expiresAt: pastDate,
      },
    });
    await prisma.clinicalReleaseRecord.create({
      data: {
        componentUnitId: unitExpired.id,
        organisationId: bankOrgA.id,
        decision: 'RELEASED',
        authorizedClinicalUserId: testStaffUser.id,
        reason: 'Laboratory screening negative and validated',
        reviewedTestIds: ['TEST-P2-005'],
      },
    });

    // 5. Hold Unit (Org A)
    const unitHold = await prisma.componentUnit.create({
      data: {
        componentCode: `P2-PRBC-HOLD-${Date.now().toString().slice(-4)}`,
        collectionUnitId: cuA.id,
        derivedBy: testStaffUser.id,
        componentType: 'PRBC',
        bloodGroup: 'A_POS',
        volumeMl: 350,
        organisationId: bankOrgA.id,
        status: 'AVAILABLE',
        isHold: true,
        expiresAt: futureDate,
      },
    });
    await prisma.clinicalReleaseRecord.create({
      data: {
        componentUnitId: unitHold.id,
        organisationId: bankOrgA.id,
        decision: 'RELEASED',
        authorizedClinicalUserId: testStaffUser.id,
        reason: 'Laboratory screening negative and validated',
        reviewedTestIds: ['TEST-P2-006'],
      },
    });

    // 6. Unit belonging to Org B
    const unitOrgB = await prisma.componentUnit.create({
      data: {
        componentCode: `P2-PRBC-ORGB-${Date.now().toString().slice(-4)}`,
        collectionUnitId: cuB.id,
        derivedBy: testStaffUser.id,
        componentType: 'PRBC',
        bloodGroup: 'A_POS',
        volumeMl: 350,
        organisationId: bankOrgB.id,
        status: 'AVAILABLE',
        isHold: false,
        expiresAt: futureDate,
      },
    });
    await prisma.clinicalReleaseRecord.create({
      data: {
        componentUnitId: unitOrgB.id,
        organisationId: bankOrgB.id,
        decision: 'RELEASED',
        authorizedClinicalUserId: testStaffUser.id,
        reason: 'Laboratory screening negative and validated',
        reviewedTestIds: ['TEST-P2-007'],
      },
    });

    // Create a 4-unit blood request targeted to Org A (BC-P2-001)
    const partialTestReq = await prisma.bloodRequest.create({
      data: {
        requesterId: testPatient.id,
        patientName: 'Sunil Shinde',
        bloodGroup: 'A_POS',
        component: 'Packed Red Blood Cells',
        unitsRequested: 4, // Requests 4 units, but only 2 eligible exist in Org A!
        hospitalCode: 'BC-P2-001',
        status: 'OPEN',
        message: JSON.stringify({
          hospitalName: 'Sassoon General Hospital',
          isHospitalVerified: true,
          urgency: 'URGENT',
          assignedBankId: bankOrgA.id,
        }),
      },
    });

    // Verify incoming requests calculation for Bank A
    const incomingBankA = await HospitalIntegrationService.getIncomingBloodRequests(bankOrgA.id);
    const targetInA = incomingBankA.find((r) => r.id === partialTestReq.id);

    assert(targetInA, 'Target request must appear in Bank A incoming requests');
    assert.strictEqual(
      targetInA.availableEligibleStockCount,
      2,
      'Only the 2 eligible, clinically released, non-expired, non-held units belonging to Org A must be counted'
    );
    assert(
      !targetInA.eligibleUnitIds.includes(unitUnreleased.id),
      'Unreleased units must NOT be included in eligible units'
    );
    assert(
      !targetInA.eligibleUnitIds.includes(unitExpired.id),
      'Expired units must NOT be included in eligible units'
    );
    assert(
      !targetInA.eligibleUnitIds.includes(unitHold.id),
      'Units on hold must NOT be included in eligible units'
    );
    assert(
      !targetInA.eligibleUnitIds.includes(unitOrgB.id),
      'Units belonging to Org B must NOT be included in Org A eligible units'
    );
    recordPass('1. Scoped Inventory Eligibility Check (strictly filters by Org, Clinical Release, Expiry, Hold)');

    // -------------------------------------------------------------
    // TEST 2: Partial Allocation & Shortfall Calculation
    // -------------------------------------------------------------
    const reserveRes = await HospitalIntegrationService.acceptAndReserveRequest(
      testStaffUser.id,
      bankOrgA.id,
      partialTestReq.id
    );

    assert.strictEqual(reserveRes.success, true);
    assert.strictEqual(reserveRes.isPartial, true, 'isPartial must be true when unitsRequested > available');
    assert.strictEqual(reserveRes.allocatedUnitsCount, 2, 'Allocated count must be exactly 2');
    assert.strictEqual(reserveRes.shortfallCount, 2, 'Shortfall count must be exactly 2');
    assert.strictEqual(reserveRes.reservedUnits.length, 2);

    // Verify request in DB
    const dbReqAfterReserve = await prisma.bloodRequest.findUnique({
      where: { id: partialTestReq.id },
    });
    assert.strictEqual(dbReqAfterReserve?.status, 'OPEN', 'Partially allocated request must remain OPEN');
    assert.strictEqual(
      dbReqAfterReserve?.closureOutcome,
      'PARTIALLY_ALLOCATED',
      'closureOutcome must be PARTIALLY_ALLOCATED'
    );

    // Verify units in DB are now RESERVED
    const dbUnit1 = await prisma.componentUnit.findUnique({ where: { id: unitEligible1.id } });
    const dbUnit2 = await prisma.componentUnit.findUnique({ where: { id: unitEligible2.id } });
    assert.strictEqual(dbUnit1?.status, 'RESERVED');
    assert.strictEqual(dbUnit2?.status, 'RESERVED');
    recordPass('2. Partial Allocation & Shortfall Enforcement (Allocates 2/4, Shortfall=2, Request Remains OPEN)');

    // -------------------------------------------------------------
    // TEST 3: Optimistic Concurrency Guard (Double Reservation Prevention)
    // -------------------------------------------------------------
    let concurrencyFailed = false;
    try {
      await HospitalIntegrationService.acceptAndReserveRequest(
        testStaffUser.id,
        bankOrgA.id,
        partialTestReq.id
      );
    } catch (err: any) {
      concurrencyFailed = true;
      assert(err.message.includes('0 eligible units') || err.message.includes('Insufficient'));
    }
    assert(concurrencyFailed, 'Double reservation must be rejected when no units available');
    recordPass('3. Concurrency Guard & Zero-Eligible Stock Rejection');

    // -------------------------------------------------------------
    // TEST 4: Cold-Chain Direct Dispatch of Partially Allocated Units
    // -------------------------------------------------------------
    const dispatchRes = await HospitalIntegrationService.dispatchRequest(
      testStaffUser.id,
      bankOrgA.id,
      partialTestReq.id,
      {
        courierName: 'MH Cold Logistics Express',
        vehicleNumber: 'MH-12-CL-9901',
        driverPhone: '+919876500001',
        coldBoxTempCelsius: 3.8,
        notes: 'Calibrated data logger in box',
      }
    );

    assert.strictEqual(dispatchRes.success, true);
    assert.strictEqual(dispatchRes.data.dispatchedUnitsCount, 2);
    assert.strictEqual(dispatchRes.data.shortfallCount, 2);
    assert.strictEqual(dispatchRes.data.isPartial, true);

    const dbReqAfterDispatch = await prisma.bloodRequest.findUnique({
      where: { id: partialTestReq.id },
    });
    assert.strictEqual(dbReqAfterDispatch?.status, 'OPEN', 'Request must remain OPEN while in transit');
    assert.strictEqual(dbReqAfterDispatch?.closureOutcome, 'DISPATCHED');

    const dbUnit1Issued = await prisma.componentUnit.findUnique({ where: { id: unitEligible1.id } });
    const dbUnit2Issued = await prisma.componentUnit.findUnique({ where: { id: unitEligible2.id } });
    assert.strictEqual(dbUnit1Issued?.status, 'ISSUED', 'Dispatched unit must be marked ISSUED');
    assert.strictEqual(dbUnit2Issued?.status, 'ISSUED', 'Dispatched unit must be marked ISSUED');
    recordPass('4. Cold-Chain Dispatch (Units -> ISSUED, Shortfall=2 Preserved, Status Remains OPEN)');

    // -------------------------------------------------------------
    // TEST 5: Dual Confirmation on Partial Delivery (Request NEVER False-Fulfilled)
    // -------------------------------------------------------------
    const receiptRes = await HospitalIntegrationService.confirmReceipt(
      testPatient.id,
      partialTestReq.id,
      'Received 2 of 4 bags at ICU. Urgent shortfall of 2 units remaining.'
    );

    assert.strictEqual(receiptRes.success, true);
    assert.strictEqual(receiptRes.isFullyFulfilled, false, 'Must NOT be marked fully fulfilled');
    assert.strictEqual(receiptRes.shortfallCount, 2, 'Shortfall must remain 2');

    const dbReqAfterReceipt = await prisma.bloodRequest.findUnique({
      where: { id: partialTestReq.id },
    });
    assert.strictEqual(dbReqAfterReceipt?.status, 'OPEN', 'Partially fulfilled request MUST remain OPEN');
    assert.strictEqual(dbReqAfterReceipt?.closureOutcome, 'PARTIALLY_FULFILLED');
    assert.strictEqual(dbReqAfterReceipt?.closedAt, null, 'closedAt must be NULL for partial fulfilment');
    recordPass('5. Dual Confirmation Guard: Partial Receipt Leaves Request OPEN with Shortfall');

    // -------------------------------------------------------------
    // TEST 6: Full Quantity Lifecycle (Requested 2, Allocated 2 -> CLOSED/FULFILLED)
    // -------------------------------------------------------------
    const fullUnit1 = await prisma.componentUnit.create({
      data: {
        componentCode: `P2-PRBC-FULL-01-${Date.now().toString().slice(-4)}`,
        collectionUnitId: cuA.id,
        derivedBy: testStaffUser.id,
        componentType: 'PRBC',
        bloodGroup: 'B_POS',
        volumeMl: 350,
        organisationId: bankOrgA.id,
        status: 'AVAILABLE',
        isHold: false,
        expiresAt: futureDate,
      },
    });
    await prisma.clinicalReleaseRecord.create({
      data: {
        componentUnitId: fullUnit1.id,
        organisationId: bankOrgA.id,
        decision: 'RELEASED',
        authorizedClinicalUserId: testStaffUser.id,
        reason: 'Laboratory screening negative and validated',
        reviewedTestIds: ['TEST-P2-010'],
      },
    });

    const fullUnit2 = await prisma.componentUnit.create({
      data: {
        componentCode: `P2-PRBC-FULL-02-${Date.now().toString().slice(-4)}`,
        collectionUnitId: cuA.id,
        derivedBy: testStaffUser.id,
        componentType: 'PRBC',
        bloodGroup: 'B_POS',
        volumeMl: 350,
        organisationId: bankOrgA.id,
        status: 'AVAILABLE',
        isHold: false,
        expiresAt: futureDate,
      },
    });
    await prisma.clinicalReleaseRecord.create({
      data: {
        componentUnitId: fullUnit2.id,
        organisationId: bankOrgA.id,
        decision: 'RELEASED',
        authorizedClinicalUserId: testStaffUser.id,
        reason: 'Laboratory screening negative and validated',
        reviewedTestIds: ['TEST-P2-011'],
      },
    });

    // Create 2-unit request
    const fullTestReq = await prisma.bloodRequest.create({
      data: {
        requesterId: testPatient.id,
        patientName: 'Sunil Shinde',
        bloodGroup: 'B_POS',
        component: 'Packed Red Blood Cells',
        unitsRequested: 2,
        hospitalCode: 'BC-P2-001',
        status: 'OPEN',
        message: JSON.stringify({
          hospitalName: 'Sassoon General Hospital',
          isHospitalVerified: true,
          urgency: 'URGENT',
          assignedBankId: bankOrgA.id,
        }),
      },
    });

    // Reserve 2 units
    const fullReserve = await HospitalIntegrationService.acceptAndReserveRequest(
      testStaffUser.id,
      bankOrgA.id,
      fullTestReq.id
    );
    assert.strictEqual(fullReserve.isPartial, false);
    assert.strictEqual(fullReserve.allocatedUnitsCount, 2);
    assert.strictEqual(fullReserve.shortfallCount, 0);

    // Dispatch 2 units
    await HospitalIntegrationService.dispatchRequest(
      testStaffUser.id,
      bankOrgA.id,
      fullTestReq.id,
      { courierName: 'Express Courier' }
    );

    // Hospital staff confirms delivery
    const fullReceipt = await HospitalIntegrationService.confirmReceipt(
      testStaffUser.id,
      fullTestReq.id,
      'Bedside intake verified intact.',
      true
    );

    assert.strictEqual(fullReceipt.isFullyFulfilled, true);
    assert.strictEqual(fullReceipt.shortfallCount, 0);

    const dbFullFinal = await prisma.bloodRequest.findUnique({
      where: { id: fullTestReq.id },
    });
    assert.strictEqual(dbFullFinal?.status, 'CLOSED', 'Fully fulfilled request must transition to CLOSED');
    assert.strictEqual(dbFullFinal?.closureOutcome, 'FULFILLED');
    assert(dbFullFinal?.closedAt !== null, 'closedAt must be populated');
    recordPass('6. Full Fulfilment Lifecycle: Exact Quantity Received -> Transitions to CLOSED / FULFILLED');

    // -------------------------------------------------------------
    // TEST 7: Request Rejection & Immediate Reservation Reversal
    // -------------------------------------------------------------
    const rejectUnit = await prisma.componentUnit.create({
      data: {
        componentCode: `P2-PRBC-REJ-${Date.now().toString().slice(-4)}`,
        collectionUnitId: cuA.id,
        derivedBy: testStaffUser.id,
        componentType: 'PRBC',
        bloodGroup: 'AB_POS',
        volumeMl: 350,
        organisationId: bankOrgA.id,
        status: 'AVAILABLE',
        isHold: false,
        expiresAt: futureDate,
      },
    });
    await prisma.clinicalReleaseRecord.create({
      data: {
        componentUnitId: rejectUnit.id,
        organisationId: bankOrgA.id,
        decision: 'RELEASED',
        authorizedClinicalUserId: testStaffUser.id,
        reason: 'Laboratory screening negative and validated',
        reviewedTestIds: ['TEST-P2-012'],
      },
    });

    const rejectReq = await prisma.bloodRequest.create({
      data: {
        requesterId: testPatient.id,
        patientName: 'Kavita Patel',
        bloodGroup: 'AB_POS',
        component: 'Packed Red Blood Cells',
        unitsRequested: 1,
        hospitalCode: 'BC-P2-001',
        status: 'OPEN',
      },
    });

    await HospitalIntegrationService.acceptAndReserveRequest(
      testStaffUser.id,
      bankOrgA.id,
      rejectReq.id,
      [rejectUnit.id]
    );

    const unitReservedBefore = await prisma.componentUnit.findUnique({ where: { id: rejectUnit.id } });
    assert.strictEqual(unitReservedBefore?.status, 'RESERVED');

    // Reject request
    await HospitalIntegrationService.rejectRequest(
      testStaffUser.id,
      bankOrgA.id,
      rejectReq.id,
      'Hospital cancelled clinical transfusion order'
    );

    const unitReverted = await prisma.componentUnit.findUnique({ where: { id: rejectUnit.id } });
    assert.strictEqual(
      unitReverted?.status,
      'AVAILABLE',
      'Previously reserved unit must immediately revert to AVAILABLE stock'
    );

    const dbRejectReq = await prisma.bloodRequest.findUnique({ where: { id: rejectReq.id } });
    assert.strictEqual(dbRejectReq?.status, 'CLOSED');
    assert.strictEqual(dbRejectReq?.closureOutcome, 'REJECTED');
    recordPass('7. Rejection & Immediate Inventory Release (Reverts RESERVED -> AVAILABLE)');

    // -------------------------------------------------------------
    // TEST 8: Real-time Outbox Verification (User, Org, Admin Channels)
    // -------------------------------------------------------------
    const outboxEvents = await prisma.outboxEvent.findMany({
      where: {
        entityId: partialTestReq.id,
        eventType: 'blood_request.status_changed',
      },
      orderBy: { createdAt: 'desc' },
    });

    assert(outboxEvents.length >= 3, 'Must have recorded outbox events for reserve, dispatch, and partial receipt');
    const receiptEvent = outboxEvents[0];
    const payload = receiptEvent.payload as any;
    assert.strictEqual(payload.status, 'PARTIALLY_FULFILLED');
    assert.strictEqual(payload.shortfallCount, 2);
    assert.strictEqual(payload.isFullyFulfilled, false);
    recordPass('8. Real-Time Outbox Pipeline (Contains Status, Shortfall & Dual Confirmation Payload)');

    // -------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`🎉 Phase 2 Verification Completed: ${passed} Passed, ${failed} Failed`);
    console.log('================================================================\n');

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

runPhase2Verification();
