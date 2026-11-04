import { app } from './app';
import { prisma } from './lib/prisma';
import http from 'http';

let server: http.Server;
const PORT = 4108;
const BASE_URL = `http://127.0.0.1:${PORT}/api/v1`;

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runIntakeToProcessingTests() {
  console.log('========================================================================');
  console.log(' RaktaSetu — Blood Bank Intake-to-Processing & Derivation Integration Test');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
      failed++;
    }
  }

  server = app.listen(PORT);

  // Dedicated test actor phones
  const orgAdminPhone = '+919999981001';
  const inventoryStaffPhone = '+919999981002';
  const clinicalStaffPhone = '+919999981003';
  const collectionStaffPhone = '+919999981004';
  const auditorPhone = '+919999981005';
  const orgBStaffPhone = '+919999981006';
  const donorPhone = '+919999981007';
  const donor2Phone = '+919999981008';

  let orgAdminToken = '';
  let inventoryStaffToken = '';
  let clinicalStaffToken = '';
  let collectionStaffToken = '';
  let auditorToken = '';
  let orgBStaffToken = '';

  let orgAdminUserId = '';
  let inventoryStaffUserId = '';
  let clinicalStaffUserId = '';
  let collectionStaffUserId = '';
  let auditorUserId = '';
  let orgBStaffUserId = '';
  let donorUserId = '';
  let donor2UserId = '';

  let orgAId = '';
  let orgBId = '';
  let testCampId = '';
  let testCollectionUnitId = '';
  let testCollectionUnitNumber = '';
  let secondCollectionUnitId = '';

  try {
    // ----------------------------------------------------
    // SETUP: Provision isolated test organisations, users & memberships
    // ----------------------------------------------------
    console.log('--- 0. Provision Isolated Test Environment ---');

    async function loginUser(phone: string) {
      const loginRes = await request('/auth/demo-login', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: phone, otp: '123456' }),
      });
      return {
        token: loginRes.data?.data?.token,
        userId: loginRes.data?.data?.user?.id,
      };
    }

    const aAdmin = await loginUser(orgAdminPhone);
    orgAdminUserId = aAdmin.userId;
    orgAdminToken = aAdmin.token;

    const aInv = await loginUser(inventoryStaffPhone);
    inventoryStaffUserId = aInv.userId;
    inventoryStaffToken = aInv.token;

    const aClin = await loginUser(clinicalStaffPhone);
    clinicalStaffUserId = aClin.userId;
    clinicalStaffToken = aClin.token;

    const aCol = await loginUser(collectionStaffPhone);
    collectionStaffUserId = aCol.userId;
    collectionStaffToken = aCol.token;

    const aAud = await loginUser(auditorPhone);
    auditorUserId = aAud.userId;
    auditorToken = aAud.token;

    const bStaff = await loginUser(orgBStaffPhone);
    orgBStaffUserId = bStaff.userId;
    orgBStaffToken = bStaff.token;

    const aDonor = await loginUser(donorPhone);
    donorUserId = aDonor.userId;

    const aDonor2 = await loginUser(donor2Phone);
    donor2UserId = aDonor2.userId;

    // Create Blood Bank Org A
    const orgACode = `ORG-ITP-A-${Date.now()}`;
    const orgA = await prisma.organisation.create({
      data: {
        orgCode: orgACode,
        name: 'Intake Processing Test Blood Centre A',
        type: 'BLOOD_BANK',
        licenseNumber: `LIC-ITPA-${Date.now()}`,
        districtCode: 521,
        districtName: 'Pune',
        status: 'VERIFIED',
      },
    });
    orgAId = orgA.id;

    // Create Blood Bank Org B (for multi-tenant isolation verification)
    const orgBCode = `ORG-ITP-B-${Date.now()}`;
    const orgB = await prisma.organisation.create({
      data: {
        orgCode: orgBCode,
        name: 'Intake Processing Test Blood Centre B',
        type: 'BLOOD_BANK',
        licenseNumber: `LIC-ITPB-${Date.now()}`,
        districtCode: 522,
        districtName: 'Solapur',
        status: 'VERIFIED',
      },
    });
    orgBId = orgB.id;

    // Assign memberships with varied roles
    await prisma.organisationMembership.createMany({
      data: [
        { userId: orgAdminUserId, organisationId: orgAId, role: 'ORG_ADMIN', isActive: true },
        { userId: inventoryStaffUserId, organisationId: orgAId, role: 'INVENTORY_STAFF', isActive: true },
        { userId: clinicalStaffUserId, organisationId: orgAId, role: 'CLINICAL_STAFF', isActive: true },
        { userId: collectionStaffUserId, organisationId: orgAId, role: 'COLLECTION_STAFF', isActive: true },
        { userId: auditorUserId, organisationId: orgAId, role: 'AUDITOR', isActive: true },
        { userId: orgBStaffUserId, organisationId: orgBId, role: 'INVENTORY_STAFF', isActive: true },
      ],
    });

    // Create a Camp, Attendance, Screening, and DonationEvent under Org A
    const camp = await prisma.camp.create({
      data: {
        campCode: `CMP-ITP-${Date.now()}`,
        title: 'Intake-to-Processing Test Camp',
        organizerName: 'Red Cross Pune',
        targetDate: new Date(),
        venue: 'Camp Center',
        district: 'Pune',
        districtCode: 521,
        organisationId: orgAId,
        status: 'APPROVED',
      },
    });
    testCampId = camp.id;

    const attendance = await prisma.campAttendance.create({
      data: {
        campId: testCampId,
        userId: donorUserId,
        donorName: 'Test Voluntary Donor',
        donorPhone: donorPhone,
        bloodGroup: 'O_POS',
        status: 'CHECKED_IN',
        checkedInAt: new Date(),
        checkedInBy: clinicalStaffUserId,
      },
    });

    const screening = await prisma.clinicalScreening.create({
      data: {
        campId: testCampId,
        attendanceId: attendance.id,
        donorUserId,
        screenedBy: clinicalStaffUserId,
        status: 'CLEARED',
        eligibilityDecision: 'CLEARED',
        consentGiven: true,
      },
    });

    const donEvent = await prisma.donationEvent.create({
      data: {
        campId: testCampId,
        attendanceId: attendance.id,
        screeningId: screening.id,
        donorUserId,
        bloodGroup: 'O_POS',
        donationType: 'WHOLE_BLOOD',
        outcome: 'COMPLETED',
        volumeMl: 450,
        recordedBy: clinicalStaffUserId,
        performedAt: new Date(),
      },
    });

    // Create Collection Unit 1 in RECEIVED_BY_CENTRE status (reconciled and awaiting processing)
    testCollectionUnitNumber = `CU-ITP-${Date.now()}`;
    const colUnit1 = await prisma.collectionUnit.create({
      data: {
        unitNumber: testCollectionUnitNumber,
        donationEventId: donEvent.id,
        campId: testCampId,
        organisationId: orgAId,
        bloodGroup: 'O_POS',
        volumeMl: 450,
        status: 'RECEIVED_BY_CENTRE',
        collectedBy: clinicalStaffUserId,
        collectedAt: new Date(),
      },
    });
    testCollectionUnitId = colUnit1.id;

    // Create attendance, screening, donationEvent and Collection Unit 2 in RECEIVED_BY_CENTRE status
    const attendance2 = await prisma.campAttendance.create({
      data: {
        campId: testCampId,
        userId: donor2UserId,
        donorName: 'Test Voluntary Donor 2',
        donorPhone: donor2Phone,
        bloodGroup: 'A_POS',
        status: 'CHECKED_IN',
        checkedInAt: new Date(),
        checkedInBy: clinicalStaffUserId,
      },
    });

    const screening2 = await prisma.clinicalScreening.create({
      data: {
        campId: testCampId,
        attendanceId: attendance2.id,
        donorUserId: donor2UserId,
        screenedBy: clinicalStaffUserId,
        status: 'CLEARED',
        eligibilityDecision: 'CLEARED',
        consentGiven: true,
      },
    });

    const donEvent2 = await prisma.donationEvent.create({
      data: {
        campId: testCampId,
        attendanceId: attendance2.id,
        screeningId: screening2.id,
        donorUserId: donor2UserId,
        bloodGroup: 'A_POS',
        donationType: 'WHOLE_BLOOD',
        outcome: 'COMPLETED',
        volumeMl: 450,
        recordedBy: clinicalStaffUserId,
        performedAt: new Date(),
      },
    });

    const colUnit2 = await prisma.collectionUnit.create({
      data: {
        unitNumber: `CU-ITP2-${Date.now()}`,
        donationEventId: donEvent2.id,
        campId: testCampId,
        organisationId: orgAId,
        bloodGroup: 'A_POS',
        volumeMl: 450,
        status: 'RECEIVED_BY_CENTRE',
        collectedBy: clinicalStaffUserId,
        collectedAt: new Date(),
      },
    });
    secondCollectionUnitId = colUnit2.id;

    assert(Boolean(testCollectionUnitId && secondCollectionUnitId), 'Test collection units provisioned in RECEIVED_BY_CENTRE status');

    // ----------------------------------------------------
    // TEST 1: Intake Queue Query Visibility
    // ----------------------------------------------------
    console.log('\n--- 1. Intake Queue Query Visibility & Filtering ---');

    const intakeRes = await request(`/traceability/collection-units?organisationId=${orgAId}&status=RECEIVED_BY_CENTRE`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${inventoryStaffToken}` },
    });

    assert(intakeRes.status === 200, 'Intake queue returns 200 OK for authorized staff');
    const returnedUnits = intakeRes.data?.data || [];
    assert(
      returnedUnits.some((u: any) => u.id === testCollectionUnitId && u.unitNumber === testCollectionUnitNumber),
      'Intake queue returns collection unit awaiting processing'
    );
    assert(
      returnedUnits.every((u: any) => u.status === 'RECEIVED_BY_CENTRE'),
      'Intake queue strictly filters units to RECEIVED_BY_CENTRE'
    );

    // Cross-tenant access check
    const crossTenantRes = await request(`/traceability/collection-units?organisationId=${orgAId}&status=RECEIVED_BY_CENTRE`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${orgBStaffToken}` },
    });
    assert(
      crossTenantRes.status === 403,
      'Cross-tenant user from Org B is rejected with 403 Forbidden when querying Org A intake queue'
    );

    // ----------------------------------------------------
    // TEST 2: RBAC Gates on Component Derivation Action
    // ----------------------------------------------------
    console.log('\n--- 2. Role-Based Access Control on Component Derivation ---');

    const standardDerivationPayload = {
      components: [
        { componentType: 'PRBC', volumeMl: 250, notes: 'Packed Red Blood Cells' },
        { componentType: 'FRESH_FROZEN_PLASMA', volumeMl: 200, notes: 'Fresh Frozen Plasma' },
        { componentType: 'PLATELET_CONCENTRATE', volumeMl: 50, notes: 'Random Donor Platelet' },
      ],
      reason: 'Centrifuge fractionation test run',
    };

    // 2a: COLLECTION_STAFF attempt -> must fail with 403
    const colStaffDeriveRes = await request(`/traceability/collection-units/${testCollectionUnitId}/derive-components`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${collectionStaffToken}` },
      body: JSON.stringify(standardDerivationPayload),
    });
    assert(
      colStaffDeriveRes.status === 403,
      'COLLECTION_STAFF is blocked with 403 Forbidden from deriving components'
    );

    // 2b: AUDITOR attempt -> must fail with 403
    const auditorDeriveRes = await request(`/traceability/collection-units/${testCollectionUnitId}/derive-components`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auditorToken}` },
      body: JSON.stringify(standardDerivationPayload),
    });
    assert(
      auditorDeriveRes.status === 403,
      'AUDITOR role is blocked with 403 Forbidden from deriving components'
    );

    // 2c: Cross-tenant Org B staff attempt -> must fail with 403 or 404
    const crossTenantDeriveRes = await request(`/traceability/collection-units/${testCollectionUnitId}/derive-components`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgBStaffToken}` },
      body: JSON.stringify(standardDerivationPayload),
    });
    assert(
      crossTenantDeriveRes.status === 403 || crossTenantDeriveRes.status === 404,
      'Cross-tenant Org B staff cannot derive components from Org A collection unit'
    );

    // ----------------------------------------------------
    // TEST 3: Validation Gates on Derivation Payload
    // ----------------------------------------------------
    console.log('\n--- 3. Validation Gates on Derivation Request ---');

    // 3a: Empty components array
    const emptyCompRes = await request(`/traceability/collection-units/${testCollectionUnitId}/derive-components`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${inventoryStaffToken}` },
      body: JSON.stringify({ components: [], reason: 'Invalid empty derivation' }),
    });
    assert(
      emptyCompRes.status === 400,
      'Derivation with empty components array is rejected with 400 Bad Request'
    );

    // 3b: Invalid component type
    const invalidTypeRes = await request(`/traceability/collection-units/${testCollectionUnitId}/derive-components`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${inventoryStaffToken}` },
      body: JSON.stringify({
        components: [{ componentType: 'INVALID_PLASMA_XYZ', volumeMl: 250 }],
        reason: 'Invalid type test',
      }),
    });
    assert(
      invalidTypeRes.status === 400,
      'Derivation with invalid component type is rejected with 400 Bad Request'
    );

    // ----------------------------------------------------
    // TEST 4: Successful Component Derivation by INVENTORY_STAFF
    // ----------------------------------------------------
    console.log('\n--- 4. Authorized Component Derivation Execution ---');

    const deriveSuccessRes = await request(`/traceability/collection-units/${testCollectionUnitId}/derive-components`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${inventoryStaffToken}` },
      body: JSON.stringify(standardDerivationPayload),
    });

    assert(deriveSuccessRes.status === 201, 'Authorized derivation returns 201 Created');
    const derivedComponents = deriveSuccessRes.data?.data || [];
    assert(derivedComponents.length === 3, 'Exactly 3 fractionated component units created');

    // Check parent collection unit status in database
    const updatedParentUnit = await prisma.collectionUnit.findUnique({
      where: { id: testCollectionUnitId },
    });
    assert(
      updatedParentUnit?.status === 'PROCESSING_COMPLETED',
      'Parent collection unit transitioned to PROCESSING_COMPLETED status'
    );

    // Check newly created component units
    const createdComps = await prisma.componentUnit.findMany({
      where: { collectionUnitId: testCollectionUnitId },
    });
    assert(createdComps.length === 3, 'Found 3 child ComponentUnit records in DB linked to parent collection unit');
    assert(
      createdComps.every((c) => c.status === 'QUARANTINED'),
      'All derived component units immediately enter QUARANTINED status'
    );
    assert(
      createdComps.every((c) => c.bloodGroup === 'O_POS'),
      'All derived component units inherit blood group O_POS from collection bag'
    );
    assert(
      createdComps.every((c) => c.componentCode.startsWith('CMP-')),
      'All derived components have distinct CMP-... code format, distinct from CU-... parent collection unit'
    );

    const prbcComp = createdComps.find((c) => c.componentType === 'PRBC');
    assert(Boolean(prbcComp), 'PRBC component unit successfully created');

    // ----------------------------------------------------
    // TEST 5: Intake Queue Live Update
    // ----------------------------------------------------
    console.log('\n--- 5. Intake Queue State After Processing ---');

    const updatedIntakeRes = await request(`/traceability/collection-units?organisationId=${orgAId}&status=RECEIVED_BY_CENTRE`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${inventoryStaffToken}` },
    });

    const remainingUnits = updatedIntakeRes.data?.data || [];
    assert(
      !remainingUnits.some((u: any) => u.id === testCollectionUnitId),
      'Processed unit CU-ITP is no longer visible in intake queue (no double processing)'
    );
    assert(
      remainingUnits.some((u: any) => u.id === secondCollectionUnitId),
      'Unprocessed unit 2 remains visible in intake queue'
    );

    // ----------------------------------------------------
    // TEST 6: Prevent Duplicate Derivation (Invalid Transition)
    // ----------------------------------------------------
    console.log('\n--- 6. Duplicate Derivation Prevention ---');

    const duplicateDeriveRes = await request(`/traceability/collection-units/${testCollectionUnitId}/derive-components`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clinicalStaffToken}` },
      body: JSON.stringify(standardDerivationPayload),
    });
    assert(
      duplicateDeriveRes.status === 400,
      'Subsequent derivation on already-processed unit is rejected with 400 Bad Request'
    );

    // ----------------------------------------------------
    // TEST 7: Safety Gate Verification — Block Clinical Release Without Mandatory Tests
    // ----------------------------------------------------
    console.log('\n--- 7. Mandatory Laboratory Safety Gate Before Clinical Release ---');

    if (prbcComp) {
      // 7a: Check release eligibility
      const eligibilityRes = await request(
        `/organisations/${orgAId}/components/${prbcComp.id}/release-eligibility`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${clinicalStaffToken}` },
        }
      );

      assert(eligibilityRes.status === 200, 'Release eligibility endpoint returns 200 OK');
      assert(
        eligibilityRes.data?.data?.isEligibleForRelease === false,
        'Derived component is NOT eligible for release without mandatory laboratory screening'
      );
      assert(
        eligibilityRes.data?.data?.blockingReasons?.length > 0,
        'Eligibility report lists blocking reasons identifying missing TTI tests'
      );

      // 7b: Attempt unauthorized release bypass -> MUST BE BLOCKED
      const releaseAttemptRes = await request(
        `/organisations/${orgAId}/components/${prbcComp.id}/clinical-release`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${clinicalStaffToken}` },
          body: JSON.stringify({
            decision: 'RELEASED',
            reason: 'Attempting to release without lab tests',
          }),
        }
      );

      assert(
        releaseAttemptRes.status === 400,
        'Clinical release of quarantined component without mandatory tests is strictly rejected (400 Bad Request)'
      );

      // Verify status in DB remains QUARANTINED
      const unchangedComp = await prisma.componentUnit.findUnique({
        where: { id: prbcComp.id },
      });
      assert(
        unchangedComp?.status === 'QUARANTINED',
        'ComponentUnit status remains strictly QUARANTINED in database'
      );
    }

    // ----------------------------------------------------
    // TEST 8: Real-Time WebSocket Outbox Event Verification
    // ----------------------------------------------------
    console.log('\n--- 8. Real-Time Outbox Event Verification ---');

    const outboxEvents = await prisma.outboxEvent.findMany({
      where: {
        eventType: { in: ['inventory.summary_changed', 'component.status_changed'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const summaryChangedEvent = outboxEvents.find(
      (e) => e.eventType === 'inventory.summary_changed' && (e.payload as any)?.organisationId === orgAId
    );
    assert(
      Boolean(summaryChangedEvent),
      'Realtime outbox event "inventory.summary_changed" recorded in database for WebSocket distribution'
    );

    const componentStatusEvent = outboxEvents.find(
      (e) => e.eventType === 'component.status_changed' && (e.organisationId === orgAId || (e.payload as any)?.organisationId === orgAId)
    );
    assert(
      Boolean(componentStatusEvent),
      'Realtime outbox event "component.status_changed" recorded in database for WebSocket distribution'
    );

    // ----------------------------------------------------
    // TEST 9: Derivation by CLINICAL_STAFF on Second Unit
    // ----------------------------------------------------
    console.log('\n--- 9. Derivation Authority for CLINICAL_STAFF ---');

    const clinicalDeriveRes = await request(`/traceability/collection-units/${secondCollectionUnitId}/derive-components`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clinicalStaffToken}` },
      body: JSON.stringify({
        components: [
          { componentType: 'WHOLE_BLOOD', volumeMl: 450, notes: 'Single Bag Whole Blood derivation' },
        ],
        reason: 'Single whole blood unit registration',
      }),
    });

    assert(
      clinicalDeriveRes.status === 201,
      'CLINICAL_STAFF role can also authorize component derivation (201 Created)'
    );

  } catch (err: any) {
    console.error('Unhandled test error:', err);
    failed++;
  } finally {
    if (server) {
      server.close();
    }
  }

  console.log('\n========================================================================');
  console.log(` Intake-to-Processing Test Results: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runIntakeToProcessingTests();
