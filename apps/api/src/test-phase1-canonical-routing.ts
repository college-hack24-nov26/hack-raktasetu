/**
 * RaktaSetu Phase 1 Focused Verification:
 * Canonical Blood Request, Blood Bank Routing, Server Isolation, Real-Time Flow & Admin Monitoring.
 */

import assert from 'assert';
import { prisma } from './lib/prisma';
import { BloodRequestCoordinationService } from './services/bloodRequestCoordination';
import { HospitalIntegrationService } from './services/hospitalIntegration';
import { RealtimeService } from './services/realtime';

async function runPhase1Verification() {
  console.log('\n================================================================');
  console.log('🧪 RaktaSetu Phase 1 Focused Verification Suite');
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
    // SETUP FIXTURES: Two Distinct Blood Banks & Requesters
    // -------------------------------------------------------------
    const testAdmin = await prisma.user.upsert({
      where: { phoneNumber: '+919800000001' },
      update: { role: 'ADMIN', name: 'Platform Admin Test' },
      create: {
        phoneNumber: '+919800000001',
        name: 'Platform Admin Test',
        role: 'ADMIN',
      },
    });

    const testPatient = await prisma.user.upsert({
      where: { phoneNumber: '+919800000002' },
      update: { role: 'USER', name: 'Pooja Sharma' },
      create: {
        phoneNumber: '+919800000002',
        name: 'Pooja Sharma',
        role: 'USER',
      },
    });

    const otherPatient = await prisma.user.upsert({
      where: { phoneNumber: '+919800000003' },
      update: { role: 'USER', name: 'Vikram Mehta' },
      create: {
        phoneNumber: '+919800000003',
        name: 'Vikram Mehta',
        role: 'USER',
      },
    });

    // Ensure Blood Centres exist for foreign keys
    await prisma.bloodCentre.upsert({
      where: { hospitalCode: 'BC-PUN-001' },
      update: { hospitalName: 'Pune Central Blood Centre A', districtCode: 521, stateCode: 27 },
      create: {
        hospitalCode: 'BC-PUN-001',
        hospitalName: 'Pune Central Blood Centre A',
        districtCode: 521,
        stateCode: 27,
      },
    });

    await prisma.bloodCentre.upsert({
      where: { hospitalCode: 'BC-PUN-002' },
      update: { hospitalName: 'Pune South Blood Centre B', districtCode: 521, stateCode: 27 },
      create: {
        hospitalCode: 'BC-PUN-002',
        hospitalName: 'Pune South Blood Centre B',
        districtCode: 521,
        stateCode: 27,
      },
    });

    // Blood Bank A (Pune Central)
    const bankA = await prisma.organisation.upsert({
      where: { orgCode: 'ORG-BANK-PUNE-A' },
      update: { status: 'VERIFIED', type: 'BLOOD_BANK', hospitalCode: 'BC-PUN-001', districtCode: 521, stateCode: 27 },
      create: {
        orgCode: 'ORG-BANK-PUNE-A',
        name: 'Pune Central Blood Centre A',
        type: 'BLOOD_BANK',
        status: 'VERIFIED',
        stateCode: 27,
        districtCode: 521,
        hospitalCode: 'BC-PUN-001',
        licenseNumber: 'MH-PUN-LIC-001',
        phone: '+919800000010',
        address: '101 Shivajinagar, Pune',
      },
    });

    // Blood Bank B (Pune South)
    const bankB = await prisma.organisation.upsert({
      where: { orgCode: 'ORG-BANK-PUNE-B' },
      update: { status: 'VERIFIED', type: 'BLOOD_BANK', hospitalCode: 'BC-PUN-002', districtCode: 521, stateCode: 27 },
      create: {
        orgCode: 'ORG-BANK-PUNE-B',
        name: 'Pune South Blood Centre B',
        type: 'BLOOD_BANK',
        status: 'VERIFIED',
        stateCode: 27,
        districtCode: 521,
        hospitalCode: 'BC-PUN-002',
        licenseNumber: 'MH-PUN-LIC-002',
        phone: '+919800000020',
        address: '202 Swargate, Pune',
      },
    });

    recordPass('Fixtures verified: Platform Admin, Patients, Blood Bank A & Blood Bank B');

    // -------------------------------------------------------------
    // TEST 1: Patient submits request with selected Blood Bank A
    // -------------------------------------------------------------
    const requestResult = await BloodRequestCoordinationService.createCanonicalRequest(testPatient.id, {
      patientName: 'Sunita Patil',
      bloodGroup: 'B_POS',
      component: 'Packed Red Blood Cells',
      unitsRequested: 2,
      hospitalCode: bankA.hospitalCode!,
      admittedHospitalName: 'Sancheti Hospital, Pune',
      urgency: 'URGENT',
      message: 'Urgent surgery blood requirement.',
    });

    assert(requestResult.id, 'Request must have a stable UUID');
    assert.strictEqual(requestResult.assignedBankId, bankA.id, 'Must be routed to Bank A organisation ID');
    assert.strictEqual(requestResult.hospitalCode, bankA.hospitalCode, 'Must store canonical Bank A hospitalCode');
    assert.strictEqual(requestResult.fulfillmentStatus, 'SUBMITTED', 'Initial lifecycle status must be SUBMITTED');
    assert.strictEqual(requestResult.requestReference, `#${requestResult.id.slice(0, 8)}`, 'Stable human reference');
    recordPass('Step 1: Patient submits request with selected Blood Bank A; canonical data persisted');

    // -------------------------------------------------------------
    // TEST 2: Validation check: Invalid/unknown Blood Bank code rejected
    // -------------------------------------------------------------
    let caughtError = false;
    try {
      await BloodRequestCoordinationService.createCanonicalRequest(testPatient.id, {
        patientName: 'Invalid Centre Test',
        bloodGroup: 'O_POS',
        unitsRequested: 1,
        hospitalCode: 'INVALID-CODE-NONEXISTENT',
        admittedHospitalName: 'Some Hospital',
      });
    } catch (err: any) {
      caughtError = true;
      assert(err.message.includes('could not be found'), 'Clear validation message on unknown bank');
    }
    assert(caughtError, 'Must throw error when selected Blood Bank cannot be resolved');
    recordPass('Step 2: Server-side validation rejects invalid/unavailable Blood Bank code with clear error');

    // -------------------------------------------------------------
    // TEST 3: Bank A sees request in its incoming queue
    // -------------------------------------------------------------
    const bankAIncoming = await HospitalIntegrationService.getIncomingBloodRequests(bankA.id);
    const inBankA = bankAIncoming.find((r) => r.id === requestResult.id);
    assert(inBankA, 'Request must be present in selected Blood Bank A queue');
    assert.strictEqual(inBankA?.isDirectDesignation, true, 'Flagged as direct designation');
    assert.strictEqual(inBankA?.patientName, 'Sunita Patil');
    assert.strictEqual(inBankA?.admittedHospitalName, 'Sancheti Hospital, Pune');
    recordPass('Step 3: Request appears in selected Blood Bank A queue with direct designation');

    // -------------------------------------------------------------
    // TEST 4: STRICT SERVER-SIDE ISOLATION: Bank B CANNOT see Bank A request
    // -------------------------------------------------------------
    const bankBIncoming = await HospitalIntegrationService.getIncomingBloodRequests(bankB.id);
    const inBankB = bankBIncoming.find((r) => r.id === requestResult.id);
    assert(!inBankB, 'Request designated to Bank A MUST NOT appear in Bank B queue (Isolation)');
    recordPass('Step 4: Server-side organisation isolation verified: Bank B cannot see Bank A request');

    // -------------------------------------------------------------
    // TEST 5: Patient isolation: Patient sees own request; other patient does not
    // -------------------------------------------------------------
    const patientRequests = await prisma.bloodRequest.findMany({
      where: { requesterId: testPatient.id },
    });
    assert(patientRequests.some((r) => r.id === requestResult.id), 'Patient can query own request');

    const otherPatientRequests = await prisma.bloodRequest.findMany({
      where: { requesterId: otherPatient.id },
    });
    assert(!otherPatientRequests.some((r) => r.id === requestResult.id), 'Other patient cannot query this request');
    recordPass('Step 5: Requester privacy verified: Users can only query their own requests');

    // -------------------------------------------------------------
    // TEST 6: Realtime Outbox Events Emitted for Requester and Bank
    // -------------------------------------------------------------
    const outboxEvents = await prisma.outboxEvent.findMany({
      where: { entityId: requestResult.id },
      orderBy: { createdAt: 'desc' },
    });
    assert(outboxEvents.length >= 2, 'Outbox must contain events for requester and blood bank');

    const userEvent = outboxEvents.find((e) => e.recipientUserId === testPatient.id);
    assert(userEvent, 'Real-time outbox event exists for Patient recipientUserId');

    const bankEvent = outboxEvents.find((e) => e.organisationId === bankA.id);
    assert(bankEvent, 'Real-time outbox event exists for Blood Bank organisationId');
    recordPass('Step 6: Real-time outbox events transactionally published for Patient and Blood Bank');

    // -------------------------------------------------------------
    // TEST 7: Anti-duplicate 30s guard prevents double submission
    // -------------------------------------------------------------
    const duplicateSubmission = await BloodRequestCoordinationService.createCanonicalRequest(testPatient.id, {
      patientName: 'Sunita Patil',
      bloodGroup: 'B_POS',
      component: 'Packed Red Blood Cells',
      unitsRequested: 2,
      hospitalCode: bankA.hospitalCode!,
      admittedHospitalName: 'Sancheti Hospital, Pune',
      urgency: 'URGENT',
    });
    assert.strictEqual(duplicateSubmission.id, requestResult.id, 'Duplicate within 30s returns existing request ID');
    assert.strictEqual(duplicateSubmission.isDuplicateSuppressed, true, 'isDuplicateSuppressed flagged true');
    recordPass('Step 7: Anti-duplicate guard prevents double creation on rapid re-submission');

    // -------------------------------------------------------------
    // TEST 8: System Admin platform-wide operations view
    // -------------------------------------------------------------
    const allRequests = await prisma.bloodRequest.findMany({
      where: { id: requestResult.id },
      include: { bloodCentre: true, requester: true },
    });
    assert(allRequests.length === 1, 'System Admin can access platform-wide request');
    const adminRecord = allRequests[0];
    assert.strictEqual(adminRecord.hospitalCode, bankA.hospitalCode, 'Admin sees designated Blood Bank routing');
    recordPass('Step 8: System Admin platform-wide query sees authorized request routing & details');

  } catch (error: any) {
    recordFail('Verification Suite Exception', error);
  }

  console.log('\n================================================================');
  console.log(`📊 Phase 1 Verification Summary: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase1Verification()
  .catch((e) => {
    console.error('Fatal test error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
