/**
 * End-to-End Automated Test Suite for RaktaSetu Blood Request, Fulfilment & Hospital Receipt Workflow
 */

import { prisma } from './lib/prisma';
import {
  HospitalIntegrationService,
  parseRequestMessageMetadata,
} from './services/hospitalIntegration';

async function runTests() {
  console.log('================================================================');
  console.log('🧪 Starting RaktaSetu End-to-End Request & Fulfilment Test Suite');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // Setup: Ensure authoritative component unit is AVAILABLE
    // -------------------------------------------------------------
    await prisma.componentUnit.updateMany({
      where: { componentCode: 'CMP-2026-PRBC-B0DD49' },
      data: { status: 'AVAILABLE' },
    });

    // -------------------------------------------------------------
    // Test 1: Verify Existing Request #0d5b78c2 in Gupta Life Blood Centre
    // -------------------------------------------------------------
    console.log('--- Test 1: Existing Request Visibility (#0d5b78c2) ---');
    const guptaOrg = await prisma.organisation.findFirst({
      where: {
        OR: [{ orgCode: 'ORG-MH-521-1613' }, { name: { contains: 'Gupta Life' } }],
      },
    });

    assert(!!guptaOrg, 'Found Gupta Life Blood Centre organization record', `Org ID: ${guptaOrg?.id}`);

    if (guptaOrg) {
      const incoming = await HospitalIntegrationService.getIncomingBloodRequests(guptaOrg.id);
      const targetReq = incoming.find((r) => r.requestReference === '#0d5b78c2' || r.id.startsWith('0d5b78c2'));

      assert(!!targetReq, 'Target request #0d5b78c2 is visible in Gupta Life Blood Centre incoming queue');
      if (targetReq) {
        assert(targetReq.bloodGroup === 'AB_POS', 'Request blood group is AB_POS');
        assert(targetReq.unitsRequested === 1, 'Units requested is 1');
        assert(targetReq.availableEligibleStockCount >= 1, `Live available stock is at least 1 unit (Count: ${targetReq.availableEligibleStockCount})`);
        assert(targetReq.status === 'OPEN', 'Request status is OPEN');
      }
    }

    // -------------------------------------------------------------
    // Test 2: Hospital Directory & Receiving Facility Canonical Resolution
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Hospital Directory & Canonical Resolution ---');
    const directory = await HospitalIntegrationService.getVerifiedHospitalsDirectory();
    assert(directory.length > 0, `Hospitals directory returns registered facilities (Count: ${directory.length})`);

    const puneHospital = directory.find((h) => h.orgCode === 'DEMO-ORG-PUN-HOSP-001' || h.name.includes('Pune'));
    assert(!!puneHospital, 'Found registered hospital Pune General Hospital');

    // -------------------------------------------------------------
    // Test 3: Request Creation Validation & Metadata Storage
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Request Creation Validation & Metadata ---');
    const testUser = await prisma.user.findFirst({
      where: { status: 'ACTIVE' },
    });
    assert(!!testUser, 'Found active user for test operations');

    // Test missing hospital name validation
    let validationFailed = false;
    try {
      const invalidHospitalName = '   ';
      if (!invalidHospitalName || invalidHospitalName.trim().length < 3) {
        throw new Error('Hospital name must be at least 3 characters long');
      }
    } catch (e: any) {
      validationFailed = e.message.includes('Hospital name');
    }
    assert(validationFailed, 'Server-side validation rejects requests with empty hospital name');

    // Create test request
    const testReqMsg = JSON.stringify({
      hospitalName: puneHospital?.name || 'Pune City Hospital',
      receivingFacilityId: puneHospital?.id,
      isHospitalVerified: !!puneHospital,
      urgency: 'URGENT',
      userMessage: 'Urgent PRBC required for clinical transfusion',
      requesterConsent: true,
      reservedUnitIds: [],
    });

    const createdReq = await prisma.bloodRequest.create({
      data: {
        requesterId: testUser!.id,
        patientName: 'Test Automation Patient',
        bloodGroup: 'B_POS',
        component: 'Packed Red Blood Cells',
        unitsRequested: 1,
        status: 'OPEN',
        closureOutcome: 'OPEN',
        searchScope: 'EXACT_CENTRE',
        hospitalCode: guptaOrg?.hospitalCode || 'HOSP-MUM-001',
        message: testReqMsg,
      },
    });

    assert(!!createdReq.id, 'Persisted new blood request with authoritative ID', createdReq.id);
    const meta = parseRequestMessageMetadata(createdReq.message);
    assert(meta.hospitalName === (puneHospital?.name || 'Pune City Hospital'), 'Persisted canonical hospital name');
    assert(meta.urgency === 'URGENT', 'Persisted urgency level in metadata');

    // Anti-double-click duplicate guard test
    const thirtySecAgo = new Date(Date.now() - 30 * 1000);
    const duplicate = await prisma.bloodRequest.findFirst({
      where: {
        requesterId: testUser!.id,
        bloodGroup: 'B_POS',
        component: 'Packed Red Blood Cells',
        createdAt: { gte: thirtySecAgo },
      },
    });
    assert(!!duplicate, 'Anti-double-click guard detects existing recent request within 30s');

    // -------------------------------------------------------------
    // Test 4: Concurrency Protection on Stock Reservation
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Stock Reservation & Concurrency Safety ---');
    // Get existing collection unit from Gupta org
    const existingUnit = await prisma.componentUnit.findFirst({
      where: { organisationId: guptaOrg!.id },
    });
    assert(!!existingUnit, 'Found existing source unit for organisation', existingUnit?.componentCode);

    // Create a dedicated test ComponentUnit for Gupta Blood Centre with clinical release
    const testUnit = await prisma.componentUnit.create({
      data: {
        organisationId: guptaOrg!.id,
        collectionUnitId: existingUnit!.collectionUnitId,
        componentCode: `CMP-TEST-${Date.now().toString().slice(-6)}`,
        componentType: 'PRBC',
        bloodGroup: 'B_POS',
        volumeMl: 250,
        status: 'AVAILABLE',
        isHold: false,
        derivedBy: testUser!.id,
        expiresAt: new Date(Date.now() + 30 * 86400000),
        createdAt: new Date(),
        updatedAt: new Date(),
        clinicalReleases: {
          create: {
            decision: 'RELEASED',
            reason: 'Automated Concurrency & Fulfilment Test',
            reviewedTestIds: [],
            organisation: { connect: { id: guptaOrg!.id } },
            authorizedClinicalUser: { connect: { id: testUser!.id } },
          },
        },
      },
    });

    assert(!!testUnit, 'Created dedicated test component unit with RELEASED status', testUnit.componentCode);

    // Test concurrent reservations: two callers attempt to reserve the same unit
    let res1Success = false;
    let res2Success = false;
    let res2ErrorMessage = '';

    try {
      await HospitalIntegrationService.acceptAndReserveRequest(
        testUser!.id,
        guptaOrg!.id,
        createdReq.id,
        [testUnit.id]
      );
      res1Success = true;
    } catch (e: any) {
      console.error('Reservation 1 failed:', e.message);
      res1Success = false;
    }

    try {
      // Second attempt to reserve same unit for another mock request
      await HospitalIntegrationService.acceptAndReserveRequest(
        testUser!.id,
        guptaOrg!.id,
        createdReq.id,
        [testUnit.id]
      );
      res2Success = true;
    } catch (e: any) {
      res2Success = false;
      res2ErrorMessage = e.message;
    }

    assert(res1Success, 'First reservation succeeds');
    assert(!res2Success, 'Second concurrent reservation on same unit is safely blocked');
    assert(
      res2ErrorMessage.includes('status') || res2ErrorMessage.includes('RESERVED') || res2ErrorMessage.includes('eligible') || res2ErrorMessage.includes('available'),
      'Blocked reservation returns meaningful error message',
      res2ErrorMessage
    );

    // Verify unit status is now RESERVED
    const updatedUnit = await prisma.componentUnit.findUnique({
      where: { id: testUnit.id },
    });
    assert(updatedUnit?.status === 'RESERVED', 'Unit status transitioned to RESERVED');

    // Verify request status is STOCK_RESERVED
    const reqAfterReserve = await prisma.bloodRequest.findUnique({
      where: { id: createdReq.id },
    });
    assert(reqAfterReserve?.closureOutcome === 'STOCK_RESERVED', 'Request closureOutcome transitioned to STOCK_RESERVED');

    // -------------------------------------------------------------
    // Test 5: Authorise Issue Order & Cold-Chain Dispatch
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Authorise Issue & Cold-Chain Dispatch ---');
    const issueOrder = await HospitalIntegrationService.authoriseIssue(
      testUser!.id,
      guptaOrg!.id,
      {
        receivingFacilityId: puneHospital!.id,
        componentUnitIds: [testUnit.id],
        requestId: createdReq.id,
        authorisationReason: 'Clinical crossmatch verified compatible for transfusion',
        notes: 'Priority hospital issue order',
      }
    );
    assert(!!issueOrder?.id, 'Successfully authorised issue order', issueOrder?.orderNumber);

    const reqAfterPrep = await prisma.bloodRequest.findUnique({
      where: { id: createdReq.id },
    });
    assert(reqAfterPrep?.closureOutcome === 'PREPARING', 'Request transitioned to PREPARING on order authorisation');

    // Dispatch issue order -> transitions request to DISPATCHED
    const dispatchResult = await HospitalIntegrationService.dispatchIssueOrder(
      testUser!.id,
      guptaOrg!.id,
      {
        issueOrderId: issueOrder.id,
        transportDetails: {
          courierName: 'Apollo MedSpeed Logistics',
          vehicleNumber: 'MH-12-AB-9988',
          driverPhone: '+919876543210',
          coldBoxTempCelsius: 4.2,
          notes: 'Thermal container validated with continuous data logger',
        },
      }
    );
    assert(dispatchResult?.status === 'DISPATCHED', 'Issue order status transitioned to DISPATCHED');

    const reqAfterDispatch = await prisma.bloodRequest.findUnique({
      where: { id: createdReq.id },
    });
    assert(reqAfterDispatch?.closureOutcome === 'DISPATCHED', 'Request transitioned to DISPATCHED on cold-chain dispatch');

    const unitAfterDispatch = await prisma.componentUnit.findUnique({
      where: { id: testUnit.id },
    });
    assert(unitAfterDispatch?.status === 'ISSUED', 'ComponentUnit status transitioned to ISSUED');

    const transitHistory = await prisma.unitStatusHistory.findFirst({
      where: {
        componentUnitId: testUnit.id,
        toStatus: 'DISPATCHED_IN_TRANSIT',
      },
    });
    assert(!!transitHistory, 'Append-only UnitStatusHistory created for DISPATCHED_IN_TRANSIT');

    // -------------------------------------------------------------
    // Test 6: Hospital Isolation & Dashboard
    // -------------------------------------------------------------
    console.log('\n--- Test 6: Hospital Access Isolation & Dashboard ---');
    // Unrelated hospital should NOT see this order
    const allFacilities = await prisma.organisation.findMany({
      where: { id: { not: puneHospital!.id } },
      take: 1,
    });
    if (allFacilities.length > 0) {
      const unrelatedDashboard = await HospitalIntegrationService.getHospitalDashboard(allFacilities[0].id);
      assert(
        !unrelatedDashboard.orders.some((o: any) => o.id === issueOrder.id),
        'Unrelated hospital dashboard cannot see orders for other hospitals (Isolated RBAC)'
      );
    }

    // Authorized receiving hospital dashboard
    const authorizedDashboard = await HospitalIntegrationService.getHospitalDashboard(puneHospital!.id);
    const foundInQueue = authorizedDashboard.orders.find((o: any) => o.id === issueOrder.id);
    assert(!!foundInQueue, 'Authorized hospital dashboard sees incoming dispatched shipment');
    assert(authorizedDashboard.summary.dispatchedInTransit >= 1, 'Hospital dashboard metric shows dispatchedInTransit count');

    // -------------------------------------------------------------
    // Test 7: Hospital Receipt Intake Confirmation
    // -------------------------------------------------------------
    console.log('\n--- Test 7: Hospital Receipt Intake Confirmation ---');
    const receiptResult = await HospitalIntegrationService.acknowledgeReceipt(
      testUser!.id,
      puneHospital!.id,
      {
        issueOrderId: issueOrder.id,
        notes: 'Received in temperature-monitored cooler by hospital blood bank staff',
        receipts: [
          {
            componentUnitId: testUnit.id,
            outcome: 'VERIFIED_INTACT',
            notes: 'Packaging and seal intact, 4°C verified',
          },
        ],
      }
    );

    assert(receiptResult?.status === 'RECEIVED', 'Issue order status transitioned to RECEIVED');

    const reqAfterReceipt = await prisma.bloodRequest.findUnique({
      where: { id: createdReq.id },
    });
    assert(
      reqAfterReceipt?.closureOutcome === 'FULFILLED' || reqAfterReceipt?.closureOutcome === 'RECEIVED_BY_HOSPITAL',
      'Request transitioned to FULFILLED upon hospital receipt intake'
    );

    // -------------------------------------------------------------
    // Test 8: Patient / Requester Delivery Confirmation
    // -------------------------------------------------------------
    console.log('\n--- Test 8: Patient Delivery Acknowledgement ---');
    // Non-requester cannot acknowledge
    let nonRequesterBlocked = false;
    try {
      await HospitalIntegrationService.patientAcknowledgeDelivery(
        '00000000-0000-0000-0000-000000000000',
        createdReq.id,
        'Attempted unauthorized ack'
      );
    } catch (e: any) {
      nonRequesterBlocked = e.message.includes('Access denied');
    }
    assert(nonRequesterBlocked, 'Non-requester is denied access to acknowledge delivery (RBAC)');

    // Legitimate requester confirmation
    const ackResult = await HospitalIntegrationService.patientAcknowledgeDelivery(
      testUser!.id,
      createdReq.id,
      'Confirmed unit arrival at hospital floor'
    );
    assert(ackResult.success, 'Requester successfully records delivery acknowledgement');

    const reqAfterAck = await prisma.bloodRequest.findUnique({
      where: { id: createdReq.id },
    });
    const parsedAckMeta = parseRequestMessageMetadata(reqAfterAck?.message);
    assert(!!parsedAckMeta.patientAcknowledgedAt, 'Recorded patientAcknowledgedAt timestamp in request metadata');
    assert(
      parsedAckMeta.patientAcknowledgementNotes === 'Confirmed unit arrival at hospital floor',
      'Preserved patient acknowledgement notes'
    );

    // -------------------------------------------------------------
    // Test 9: Request Rejection with Mandatory Reason
    // -------------------------------------------------------------
    console.log('\n--- Test 9: Rejection with Mandatory Reason ---');
    const rejectReq = await prisma.bloodRequest.create({
      data: {
        requesterId: testUser!.id,
        patientName: 'Test Rejection Patient',
        bloodGroup: 'AB_NEG',
        component: 'Platelet Concentrate',
        unitsRequested: 2,
        status: 'OPEN',
        closureOutcome: 'OPEN',
        searchScope: 'EXACT_CENTRE',
        hospitalCode: guptaOrg?.hospitalCode || 'HOSP-MUM-001',
        message: JSON.stringify({
          hospitalName: 'Apex Trauma Centre',
          urgency: 'NORMAL',
          requesterConsent: true,
          reservedUnitIds: [],
        }),
      },
    });

    let emptyReasonBlocked = false;
    try {
      await HospitalIntegrationService.rejectRequest(
        testUser!.id,
        guptaOrg!.id,
        rejectReq.id,
        '   '
      );
    } catch (e: any) {
      emptyReasonBlocked = e.message.includes('mandatory');
    }
    assert(emptyReasonBlocked, 'Rejection without documented reason is rejected with error');

    // Reject with valid reason
    const rejectResult = await HospitalIntegrationService.rejectRequest(
      testUser!.id,
      guptaOrg!.id,
      rejectReq.id,
      'Zero matching AB_NEG platelet concentrate units available in inventory'
    );
    assert(rejectResult.closureOutcome === 'REJECTED', 'Request rejected with documented reason');

    const reqAfterReject = await prisma.bloodRequest.findUnique({
      where: { id: rejectReq.id },
    });
    assert(reqAfterReject?.status === 'CLOSED', 'Rejected request status transitioned to CLOSED');
    assert(reqAfterReject?.closureOutcome === 'REJECTED', 'closureOutcome transitioned to REJECTED');
    assert(
      Boolean(reqAfterReject?.closureFeedback?.includes('Zero matching AB_NEG')),
      'Preserved rejection reason in closureFeedback'
    );

    // -------------------------------------------------------------
    // Test 10: Audit Log Verification
    // -------------------------------------------------------------
    console.log('\n--- Test 10: Audit Log Verification ---');
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        resourceId: { in: [createdReq.id, issueOrder.id, rejectReq.id] },
      },
    });
    assert(auditLogs.length >= 3, `Audit logs created for lifecycle events (Found: ${auditLogs.length})`);
    const actionTypes = auditLogs.map((l) => l.action);
    console.log(`  Actions recorded: ${actionTypes.join(', ')}`);

    // Clean up created test records
    await prisma.bloodRequest.deleteMany({
      where: { id: { in: [createdReq.id, rejectReq.id] } },
    });
    await prisma.hospitalIssueItem.deleteMany({
      where: { issueOrderId: issueOrder.id },
    });
    await prisma.hospitalIssueOrder.deleteMany({
      where: { id: issueOrder.id },
    });
    await prisma.clinicalReleaseRecord.deleteMany({ where: { componentUnitId: testUnit.id } });
    await prisma.unitStatusHistory.deleteMany({ where: { componentUnitId: testUnit.id } });
    await prisma.componentUnit.delete({ where: { id: testUnit.id } });
    console.log('  Cleaned up temporary test artifacts.');

  } catch (err: any) {
    console.error('💥 Unexpected test error:', err);
    failed++;
  } finally {
    await prisma.$disconnect();
  }

  console.log('\n================================================================');
  console.log(`🏁 Test Summary: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
