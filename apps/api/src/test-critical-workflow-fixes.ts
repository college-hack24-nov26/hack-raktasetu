/**
 * RaktaSetu — Focused Verification Suite for 7 Critical Blood Request Workflow Fixes
 */

import assert from 'assert';
import { prisma } from './lib/prisma';
import { HospitalIntegrationService } from './services/hospitalIntegration';
import { getComponentCompatibility, ComponentCategory } from './services/adminMatchingService';
import { BloodGroup } from '@prisma/client';

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
  console.log('🧪 RaktaSetu — Critical Blood Request Workflow Fixes Verification');
  console.log('====================================================================\n');

  const ts = Date.now();
  const patientPhone = `+9191${String(ts).slice(-8)}`;
  const orgAdminPhone = `+9192${String(ts).slice(-8)}`;
  const competitorPhone = `+9193${String(ts).slice(-8)}`;
  const adminPhone = `+9194${String(ts).slice(-8)}`;

  try {
    // -------------------------------------------------------------
    // Test 1: Component Compatibility Logic (Problem 4)
    // -------------------------------------------------------------
    console.log('--- Step 1: Transfusion Medicine Component Compatibility (Problem 4) ---');
    
    // RBC: AB_POS is universal recipient
    const rbcComp = getComponentCompatibility('AB_POS', 'Packed Red Blood Cells (PRBC)');
    assert.strictEqual(rbcComp.category, 'RED_CELLS');
    assert.strictEqual(rbcComp.compatibleGroups.length, 8, 'AB+ recipient receives all 8 groups for RBC');
    pass('PRBC: AB+ recipient receives all 8 blood groups (universal recipient)');

    // Plasma / FFP: AB_POS can receive AB ONLY (Donor O, A, B plasma contain isohemagglutinins anti-A/B)
    const plasmaComp = getComponentCompatibility('AB_POS', 'Fresh Frozen Plasma (FFP)');
    assert.strictEqual(plasmaComp.category, 'PLASMA');
    assert.deepStrictEqual(
      plasmaComp.compatibleGroups.slice().sort(),
      ['AB_NEG', 'AB_POS'].sort(),
      'Plasma: AB+ recipient must receive AB plasma ONLY'
    );
    assert.ok(
      !plasmaComp.compatibleGroups.includes('O_POS' as BloodGroup) && !plasmaComp.compatibleGroups.includes('O_NEG' as BloodGroup),
      'Plasma: AB+ recipient must NEVER match group O donor'
    );
    pass('Plasma (FFP): AB+ recipient strictly limited to AB donors (Group O, A, B excluded)');

    // Platelets: AB_POS must NOT include O
    const plateletComp = getComponentCompatibility('AB_POS', 'Platelet Concentrate');
    assert.strictEqual(plateletComp.category, 'PLATELETS');
    assert.ok(
      !plateletComp.compatibleGroups.includes('O_POS' as BloodGroup) && !plateletComp.compatibleGroups.includes('O_NEG' as BloodGroup),
      'Platelets: AB+ recipient must NOT receive Group O platelets'
    );
    pass('Platelets: AB+ recipient excludes Group O donors to prevent hemolysis from donor plasma');

    // Cryoprecipitate: Compatible category
    const cryoComp = getComponentCompatibility('AB_POS', 'Cryoprecipitate');
    assert.strictEqual(cryoComp.category, 'CRYOPRECIPITATE');
    pass('Cryoprecipitate category correctly resolved');

    // -------------------------------------------------------------
    // Setup Organizations and Users for Database Flow Tests
    // -------------------------------------------------------------
    console.log('\n--- Step 2: Database Entities & Multi-Bank Setup ---');

    const bloodCentreDBC = await prisma.bloodCentre.create({
      data: {
        hospitalName: `Pune Civil Blood Centre ${ts}`,
        hospitalCode: `HOSP-DBC-${ts}`,
        stateCode: 27,
        districtCode: 521,
        address: '100 Medical Campus, Pune',
        mobileNo: '+912025551122',
      },
    });

    const designatedOrg = await prisma.organisation.create({
      data: {
        name: `Designated Blood Centre ${ts}`,
        orgCode: `DBC-${ts}`,
        hospitalCode: bloodCentreDBC.hospitalCode,
        licenseNumber: `LIC-DBC-${ts}`,
        type: 'BLOOD_BANK',
        stateCode: 27,
        districtCode: 521,
        status: 'VERIFIED',
      },
    });

    const externalOrg = await prisma.organisation.create({
      data: {
        name: `External Blood Centre ${ts}`,
        orgCode: `EBC-${ts}`,
        licenseNumber: `LIC-EBC-${ts}`,
        type: 'BLOOD_BANK',
        stateCode: 27,
        districtCode: 521,
        status: 'VERIFIED',
      },
    });

    const patientUser = await prisma.user.create({
      data: {
        phoneNumber: patientPhone,
        name: 'Patient Test Recipient',
        role: 'USER',
      },
    });

    const designatedStaff = await prisma.user.create({
      data: {
        phoneNumber: orgAdminPhone,
        name: 'Designated Bank Staff',
        role: 'USER',
      },
    });

    const externalStaff = await prisma.user.create({
      data: {
        phoneNumber: competitorPhone,
        name: 'External Bank Staff',
        role: 'USER',
      },
    });

    // Assign memberships
    await prisma.organisationMembership.create({
      data: {
        organisationId: designatedOrg.id,
        userId: designatedStaff.id,
        role: 'INVENTORY_STAFF',
        isActive: true,
      },
    });

    await prisma.organisationMembership.create({
      data: {
        organisationId: externalOrg.id,
        userId: externalStaff.id,
        role: 'INVENTORY_STAFF',
        isActive: true,
      },
    });

    pass('Database organizations DBC and EBC created with distinct memberships');

    // -------------------------------------------------------------
    // Test 2: Request Creation & Canonical Routing (Problem 3)
    // -------------------------------------------------------------
    console.log('\n--- Step 3: Request Designation & Cross-Bank Access Control (Problem 3) ---');

    const bloodRequest = await prisma.bloodRequest.create({
      data: {
        requesterId: patientUser.id,
        patientName: 'Admitted Patient A',
        bloodGroup: 'AB_POS',
        component: 'Fresh Frozen Plasma (FFP)',
        unitsRequested: 2,
        status: 'OPEN',
        hospitalCode: bloodCentreDBC.hospitalCode,
        message: JSON.stringify({
          hospitalName: designatedOrg.name,
          assignedBankId: designatedOrg.id,
          assignedBankName: designatedOrg.name,
          urgency: 'URGENT',
          requesterConsent: true,
        }),
      },
    });

    // Check designation check method
    assert.strictEqual(
      HospitalIntegrationService.isRequestDesignatedToOrganisation(bloodRequest, designatedOrg),
      true,
      'Request must be designated to DBC'
    );
    assert.strictEqual(
      HospitalIntegrationService.isRequestDesignatedToOrganisation(bloodRequest, externalOrg),
      false,
      'Request must NOT be designated to EBC'
    );
    pass('Canonical designation check correctly identifies designated vs external bank');

    // Verify incoming requests for external bank excludes this request
    const externalIncoming = await HospitalIntegrationService.getIncomingBloodRequests(externalOrg.id);
    const inExternalList = externalIncoming.some((r) => r.id === bloodRequest.id);
    assert.strictEqual(inExternalList, false, 'External bank queue does NOT include DBC designated request');
    pass('External Blood Bank incoming queue strictly isolates cross-centre requests (Problem 3 fixed)');

    // Verify incoming requests for designated bank includes this request
    const designatedIncoming = await HospitalIntegrationService.getIncomingBloodRequests(designatedOrg.id);
    const inDesignatedList = designatedIncoming.some((r) => r.id === bloodRequest.id);
    assert.strictEqual(inDesignatedList, true, 'Designated bank queue includes designated request');
    pass('Designated Blood Bank incoming queue contains designated request');

    // -------------------------------------------------------------
    // Test 3: Request Donor Matching Permissions & Shortfall (Problem 2)
    // -------------------------------------------------------------
    console.log('\n--- Step 4: Donor Matching Request & Shortfall (Problem 2) ---');

    // External bank staff attempting to request matching must be rejected with 403
    let crossOrgRejected = false;
    try {
      await HospitalIntegrationService.requestDonorMatching(
        externalStaff.id,
        externalOrg.id,
        bloodRequest.id
      );
    } catch (err: any) {
      if (err.statusCode === 403 || err.code === 'FORBIDDEN_NOT_DESIGNATED') {
        crossOrgRejected = true;
      }
    }
    assert.strictEqual(crossOrgRejected, true, 'External bank staff mutation rejected with 403 FORBIDDEN_NOT_DESIGNATED');
    pass('External bank staff blocked from requesting matching on unassigned request');

    // Designated bank staff successfully requests matching for shortfall units
    const matchingRes = await HospitalIntegrationService.requestDonorMatching(
      designatedStaff.id,
      designatedOrg.id,
      bloodRequest.id
    );
    assert.strictEqual(matchingRes.success, true);
    assert.strictEqual(matchingRes.matchingRequest.requestedShortfall, 2);
    assert.strictEqual(matchingRes.matchingRequest.status, 'REQUESTED');
    pass('Designated bank staff successfully creates donor matching request for shortfall (Problem 2 fixed)');

    // Attempting duplicate matching request while active must be safely handled
    let duplicateHandled = false;
    try {
      await HospitalIntegrationService.requestDonorMatching(
        designatedStaff.id,
        designatedOrg.id,
        bloodRequest.id
      );
    } catch (err: any) {
      if (err.message.includes('in progress') || err.code === 'MATCHING_ALREADY_IN_PROGRESS') {
        duplicateHandled = true;
      }
    }
    assert.strictEqual(duplicateHandled, true, 'Duplicate active matching request prevented');
    pass('Duplicate matching request guard functions as expected');

    // -------------------------------------------------------------
    // Test 4: Inventory Allocation & Outbox Event Emission (Problems 5 & 6)
    // -------------------------------------------------------------
    console.log('\n--- Step 5: Inventory Allocation, Queues & Outbox Events (Problems 5 & 6) ---');

    // Create a CollectionUnit & ComponentUnit in DBC inventory
    const camp = await prisma.camp.create({
      data: {
        campCode: `CAMP-${ts}`,
        title: `Community Camp ${ts}`,
        organizerName: 'Red Cross Pune',
        targetDate: new Date(),
        venue: 'Civic Hall, Pune',
        districtCode: 521,
        status: 'COMPLETED',
        expectedDonors: 50,
      },
    });

    const att = await prisma.campAttendance.create({
      data: {
        campId: camp.id,
        userId: patientUser.id,
        donorName: 'Test Camp Donor',
        donorPhone: patientPhone,
        bloodGroup: 'AB_POS',
        status: 'CHECKED_IN',
        checkedInAt: new Date(),
        checkedInBy: designatedStaff.id,
      },
    });

    const donEvent = await prisma.donationEvent.create({
      data: {
        campId: camp.id,
        attendanceId: att.id,
        donorUserId: patientUser.id,
        recordedBy: designatedStaff.id,
        outcome: 'COMPLETED',
        bloodGroup: 'AB_POS',
        volumeMl: 450,
        donationType: 'WHOLE_BLOOD',
      },
    });

    const collectionUnit = await prisma.collectionUnit.create({
      data: {
        unitNumber: `COL-${ts}-01`,
        donationEventId: donEvent.id,
        campId: camp.id,
        organisationId: designatedOrg.id,
        bloodGroup: 'AB_POS',
        volumeMl: 450,
        status: 'PROCESSING_COMPLETED',
        collectedBy: designatedStaff.id,
      },
    });

    const compUnit = await prisma.componentUnit.create({
      data: {
        componentCode: `CU-${ts}-FFP-01`,
        collectionUnitId: collectionUnit.id,
        organisationId: designatedOrg.id,
        derivedBy: designatedStaff.id,
        bloodGroup: 'AB_POS',
        componentType: 'FRESH_FROZEN_PLASMA',
        volumeMl: 200,
        status: 'AVAILABLE',
        isHold: false,
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
    });

    await prisma.clinicalReleaseRecord.create({
      data: {
        componentUnit: { connect: { id: compUnit.id } },
        organisation: { connect: { id: designatedOrg.id } },
        authorizedClinicalUser: { connect: { id: designatedStaff.id } },
        decision: 'RELEASED',
        reason: 'Laboratory screening negative, clinically released for transfusion',
        clinicalProtocolRef: 'SOP-CLIN-REL-01',
        reviewedTestIds: [],
      },
    });

    // Accept and reserve partial allocation (1 of 2 units)
    const reserveResult = await HospitalIntegrationService.acceptAndReserveRequest(
      designatedStaff.id,
      designatedOrg.id,
      bloodRequest.id,
      [compUnit.id]
    );

    assert.strictEqual(reserveResult.allocatedUnitsCount, 1);
    assert.strictEqual(reserveResult.shortfallCount, 1);
    assert.strictEqual(reserveResult.isPartial, true);
    pass('Partial allocation recorded: 1 unit reserved, 1 shortfall remaining (Problem 5 fixed)');

    // Verify ComponentUnit updated to RESERVED in database
    const updatedCompUnit = await prisma.componentUnit.findUnique({
      where: { id: compUnit.id },
    });
    assert.strictEqual(updatedCompUnit?.status, 'RESERVED');
    pass('ComponentUnit status immediately transitioned to RESERVED (Problem 6 fixed)');

    // Verify Outbox events emitted
    const outboxEvents = await prisma.outboxEvent.findMany({
      where: {
        organisationId: designatedOrg.id,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    const eventTypes = outboxEvents.map((e: any) => e.eventType);
    assert.ok(eventTypes.includes('blood_request.status_changed'), 'Outbox contains blood_request.status_changed');
    assert.ok(eventTypes.includes('inventory.summary_changed'), 'Outbox contains inventory.summary_changed');
    assert.ok(eventTypes.includes('component.status_changed'), 'Outbox contains component.status_changed');
    pass('Transactional outbox recorded blood_request.status_changed, inventory.summary_changed, and component.status_changed');

    // -------------------------------------------------------------
    // Test 5: Safe Delivery Receipt Acknowledgment (Problem 1)
    // -------------------------------------------------------------
    console.log('\n--- Step 6: Dispatch & Dual Delivery Receipt Confirmation (Problem 1) ---');

    // Blood bank dispatches reserved unit
    const dispatchResult = await HospitalIntegrationService.dispatchRequest(
      designatedStaff.id,
      designatedOrg.id,
      bloodRequest.id,
      {
        courierName: 'ColdChain Express',
        vehicleNumber: 'MH-12-AB-1234',
        coldBoxTempCelsius: 3.5,
        notes: 'Handed to cold-box transport',
      }
    );
    assert.strictEqual(dispatchResult.success, true);
    pass('Blood bank cold-chain dispatch recorded successfully');

    // Confirm delivery arrival via patient acknowledge
    const ackResult = await HospitalIntegrationService.patientAcknowledgeDelivery(
      patientUser.id,
      bloodRequest.id,
      'Units safely received in good temperature at bedside'
    );
    assert.strictEqual(ackResult.success, true);
    assert.ok(ackResult.patientAcknowledgedAt);
    pass('patientAcknowledgeDelivery completed with valid JSON payload (Problem 1 fixed)');

    // Dual confirmReceipt call
    const receiptResult = await HospitalIntegrationService.confirmReceipt(
      patientUser.id,
      bloodRequest.id,
      'Requester confirms delivery arrival',
      false
    );
    assert.strictEqual(receiptResult.success, true);
    assert.ok(receiptResult.data);
    pass('confirmReceipt dual confirmation completed cleanly');

    // -------------------------------------------------------------
    // Test 6: Traceability & Queue Coherence (Problem 7)
    // -------------------------------------------------------------
    console.log('\n--- Step 7: Clear Queue & End-to-End Coherence (Problem 7) ---');

    const updatedRequest = await prisma.bloodRequest.findUnique({
      where: { id: bloodRequest.id },
    });
    const reqMeta = JSON.parse(updatedRequest?.message || '{}');
    assert.strictEqual(reqMeta.shortfallCount, 1, 'Shortfall preserved as 1');
    assert.strictEqual(reqMeta.allocatedUnitsCount, 1, 'Allocated units preserved as 1');
    assert.ok(reqMeta.patientAcknowledgedAt, 'Patient acknowledged timestamp recorded');
    pass('Request end-to-end metadata and state transitions are fully coherent and conflict-free (Problem 7 fixed)');

    console.log('\n====================================================================');
    console.log(`🎉 ALL 7 WORKFLOW CHECKS PASSED: ${passed}/${passed + failed}`);
    console.log('====================================================================\n');
  } catch (error: any) {
    fail('Execution error', error);
  } finally {
    await prisma.$disconnect();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
