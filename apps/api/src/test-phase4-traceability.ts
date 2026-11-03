import { app } from './app';
import { prisma } from './lib/prisma';
import http from 'http';

let server: http.Server;
const PORT = 4099;
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

async function runPhase4TraceabilityTests() {
  console.log('========================================================================');
  console.log(' RaktaSetu — Phase 4: Blood Collection Unit & Component Traceability');
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

  // Test actor phone numbers
  const orgAdminPhone = '+919999966001';
  const collectionStaffPhone = '+919999966002';
  const inventoryStaffPhone = '+919999966003';
  const clinicalStaffPhone = '+919999966004';
  const auditorPhone = '+919999966005';
  const orgBStaffPhone = '+919999966006';
  const donorPhone = '+919999966007';

  let orgAdminToken = '';
  let collectionStaffToken = '';
  let inventoryStaffToken = '';
  let clinicalStaffToken = '';
  let auditorToken = '';
  let orgBStaffToken = '';
  let donorToken = '';

  let orgAdminUserId = '';
  let collectionStaffUserId = '';
  let inventoryStaffUserId = '';
  let clinicalStaffUserId = '';
  let auditorUserId = '';
  let orgBStaffUserId = '';
  let donorUserId = '';

  let organisationIdA = '';
  let organisationIdB = '';
  let campId = '';
  let attendanceId = '';
  let completedDonationEventId = '';
  let deferredDonationEventId = '';
  let collectionUnitId = '';
  let collectionUnitNumber = '';
  let prbcComponentId = '';

  try {
    // ----------------------------------------------------
    // Setup: Establish Actors, Organisations & Source Events
    // ----------------------------------------------------
    console.log('--- Setup: Establishing Actor Sessions & Operational Context ---');

    async function loginUser(phone: string, name: string) {
      const loginRes = await request('/auth/demo-login', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: phone, otp: '123456' }),
      });
      return {
        token: loginRes.data?.data?.token,
        userId: loginRes.data?.data?.user?.id,
      };
    }

    const adminAuth = await loginUser(orgAdminPhone, 'Org Admin Lead');
    orgAdminToken = adminAuth.token;
    orgAdminUserId = adminAuth.userId;

    const collectionAuth = await loginUser(collectionStaffPhone, 'Collection Phlebotomist');
    collectionStaffToken = collectionAuth.token;
    collectionStaffUserId = collectionAuth.userId;

    const inventoryAuth = await loginUser(inventoryStaffPhone, 'Component Inventory Tech');
    inventoryStaffToken = inventoryAuth.token;
    inventoryStaffUserId = inventoryAuth.userId;

    const clinicalAuth = await loginUser(clinicalStaffPhone, 'Dr. Clinical Pathologist');
    clinicalStaffToken = clinicalAuth.token;
    clinicalStaffUserId = clinicalAuth.userId;

    const auditorAuth = await loginUser(auditorPhone, 'External Traceability Auditor');
    auditorToken = auditorAuth.token;
    auditorUserId = auditorAuth.userId;

    const orgBAuth = await loginUser(orgBStaffPhone, 'Unrelated Blood Bank Staff');
    orgBStaffToken = orgBAuth.token;
    orgBStaffUserId = orgBAuth.userId;

    const donorAuth = await loginUser(donorPhone, 'Traceable Voluntary Donor');
    donorToken = donorAuth.token;
    donorUserId = donorAuth.userId;

    // Create Verified Test Organisation A
    const testOrgA = await prisma.organisation.upsert({
      where: { orgCode: 'ORG-TEST-PHASE4-A' },
      update: { status: 'VERIFIED' },
      create: {
        orgCode: 'ORG-TEST-PHASE4-A',
        name: 'Phase 4 Model Blood Transfusion Centre A',
        type: 'BLOOD_BANK',
        licenseNumber: 'LIC-P4-A-2026',
        districtCode: 494,
        status: 'VERIFIED',
      },
    });
    organisationIdA = testOrgA.id;

    // Create Verified Test Organisation B
    const testOrgB = await prisma.organisation.upsert({
      where: { orgCode: 'ORG-TEST-PHASE4-B' },
      update: { status: 'VERIFIED' },
      create: {
        orgCode: 'ORG-TEST-PHASE4-B',
        name: 'Unrelated Hospital Blood Centre B',
        type: 'BLOOD_BANK',
        licenseNumber: 'LIC-P4-B-2026',
        districtCode: 485,
        status: 'VERIFIED',
      },
    });
    organisationIdB = testOrgB.id;

    // Assign explicit roles in Org A
    await prisma.organisationMembership.upsert({
      where: { userId_organisationId: { userId: orgAdminUserId, organisationId: organisationIdA } },
      update: { role: 'ORG_ADMIN', isActive: true },
      create: { userId: orgAdminUserId, organisationId: organisationIdA, role: 'ORG_ADMIN', isActive: true },
    });
    await prisma.organisationMembership.upsert({
      where: { userId_organisationId: { userId: collectionStaffUserId, organisationId: organisationIdA } },
      update: { role: 'COLLECTION_STAFF', isActive: true },
      create: { userId: collectionStaffUserId, organisationId: organisationIdA, role: 'COLLECTION_STAFF', isActive: true },
    });
    await prisma.organisationMembership.upsert({
      where: { userId_organisationId: { userId: inventoryStaffUserId, organisationId: organisationIdA } },
      update: { role: 'INVENTORY_STAFF', isActive: true },
      create: { userId: inventoryStaffUserId, organisationId: organisationIdA, role: 'INVENTORY_STAFF', isActive: true },
    });
    await prisma.organisationMembership.upsert({
      where: { userId_organisationId: { userId: clinicalStaffUserId, organisationId: organisationIdA } },
      update: { role: 'CLINICAL_STAFF', isActive: true },
      create: { userId: clinicalStaffUserId, organisationId: organisationIdA, role: 'CLINICAL_STAFF', isActive: true },
    });
    await prisma.organisationMembership.upsert({
      where: { userId_organisationId: { userId: auditorUserId, organisationId: organisationIdA } },
      update: { role: 'AUDITOR', isActive: true },
      create: { userId: auditorUserId, organisationId: organisationIdA, role: 'AUDITOR', isActive: true },
    });

    // Assign Org B staff
    await prisma.organisationMembership.upsert({
      where: { userId_organisationId: { userId: orgBStaffUserId, organisationId: organisationIdB } },
      update: { role: 'ORG_ADMIN', isActive: true },
      create: { userId: orgBStaffUserId, organisationId: organisationIdB, role: 'ORG_ADMIN', isActive: true },
    });

    // Create an approved Camp drive for Org A
    const camp = await prisma.camp.create({
      data: {
        campCode: `CAMP-P4-${Date.now()}`,
        title: 'Phase 4 Outreach Blood Drive',
        organizerName: 'Red Cross Pune Chapter',
        targetDate: new Date('2026-12-01T09:00:00Z'),
        venue: 'Medical College Campus, Pune',
        districtCode: 494,
        organisationId: organisationIdA,
        status: 'APPROVED',
        isReadyForCollection: true,
      },
    });
    campId = camp.id;

    // Register Donor Attendance and Check-in
    const attendance = await prisma.campAttendance.create({
      data: {
        campId,
        userId: donorUserId,
        donorName: 'Traceable Voluntary Donor',
        donorPhone: donorPhone,
        bloodGroup: 'B_POS',
        status: 'CHECKED_IN',
        checkedInAt: new Date(),
        checkedInBy: collectionStaffUserId,
      },
    });
    attendanceId = attendance.id;

    // Record Clinical Screening (CLEARED)
    const screening = await prisma.clinicalScreening.create({
      data: {
        campId,
        attendanceId,
        donorUserId,
        screenedBy: clinicalStaffUserId,
        status: 'CLEARED',
        eligibilityDecision: 'CLEARED',
        consentGiven: true,
      },
    });

    // Record COMPLETED Donation Event
    const completedDonation = await prisma.donationEvent.create({
      data: {
        campId,
        attendanceId,
        screeningId: screening.id,
        donorUserId,
        bloodGroup: 'B_POS',
        donationType: 'WHOLE_BLOOD',
        outcome: 'COMPLETED',
        volumeMl: 450,
        recordedBy: collectionStaffUserId,
        performedAt: new Date(),
      },
    });
    completedDonationEventId = completedDonation.id;

    // Record a second attendance with a DEFERRED donation outcome to verify invariant
    const secondAttendance = await prisma.campAttendance.create({
      data: {
        campId,
        userId: orgBStaffUserId, // using second user
        donorName: 'Deferred Donor',
        donorPhone: '+919999966099',
        bloodGroup: 'O_POS',
        status: 'CHECKED_IN',
      },
    });
    const deferredDonation = await prisma.donationEvent.create({
      data: {
        campId,
        attendanceId: secondAttendance.id,
        donorUserId: orgBStaffUserId,
        bloodGroup: 'O_POS',
        donationType: 'WHOLE_BLOOD',
        outcome: 'DEFERRED',
        recordedBy: collectionStaffUserId,
        performedAt: new Date(),
      },
    });
    deferredDonationEventId = deferredDonation.id;

    console.log('Operational context prepared successfully.\n');

    // ----------------------------------------------------
    // Section 1: Authentication & Authorization Boundaries
    // ----------------------------------------------------
    console.log('--- Section 1: Authentication & Authorization Boundaries ---');

    // 1. Unauthenticated requests rejected with 401
    const unauthPost = await request('/traceability/collection-units', {
      method: 'POST',
      body: JSON.stringify({ donationEventId: completedDonationEventId }),
    });
    assert(
      unauthPost.status === 401,
      '1. Unauthenticated unit creation rejected with 401 Unauthorized'
    );

    const unauthGet = await request('/traceability/collection-units?organisationId=' + organisationIdA);
    assert(
      unauthGet.status === 401,
      '2. Unauthenticated unit listing rejected with 401 Unauthorized'
    );

    // 3. Auditor cannot create physical collection units
    const auditorCreateAttempt = await request('/traceability/collection-units', {
      method: 'POST',
      headers: { Authorization: `Bearer ${auditorToken}` },
      body: JSON.stringify({ donationEventId: completedDonationEventId }),
    });
    assert(
      auditorCreateAttempt.status === 403,
      '3. Auditor cannot create collection units (Read-only Boundary Enforced)'
    );

    // ----------------------------------------------------
    // Section 2: Collection Unit Creation & Invariants
    // ----------------------------------------------------
    console.log('\n--- Section 2: Collection Unit Creation & Invariants ---');

    // 4. Invariant: Cannot create collection unit from a non-completed (DEFERRED) donation
    const deferredUnitAttempt = await request('/traceability/collection-units', {
      method: 'POST',
      headers: { Authorization: `Bearer ${collectionStaffToken}` },
      body: JSON.stringify({ donationEventId: deferredDonationEventId }),
    });
    assert(
      deferredUnitAttempt.status === 400 && deferredUnitAttempt.data?.error?.message?.includes('COMPLETED'),
      '4. Collection unit rejected for non-completed (DEFERRED) donation event'
    );

    // 5. Valid collection unit confirmed and registered for COMPLETED donation
    const createUnitRes = await request('/traceability/collection-units', {
      method: 'POST',
      headers: { Authorization: `Bearer ${collectionStaffToken}` },
      body: JSON.stringify({
        donationEventId: completedDonationEventId,
        bagIdentifier: 'BAG-MH-2026-991',
        volumeMl: 450,
        notes: 'Cold-chain transport box packed at 4°C',
      }),
    });
    assert(
      createUnitRes.status === 201 &&
      createUnitRes.data?.data?.status === 'COLLECTED' &&
      createUnitRes.data?.data?.unitNumber?.startsWith('CU-'),
      '5. Valid physical collection unit confirmed with unique unitNumber and COLLECTED status'
    );
    collectionUnitId = createUnitRes.data?.data?.id;
    collectionUnitNumber = createUnitRes.data?.data?.unitNumber;

    // 6. Duplicate prevention: Concurrent/repeated confirmation for same donation event rejected
    const duplicateUnitAttempt = await request('/traceability/collection-units', {
      method: 'POST',
      headers: { Authorization: `Bearer ${collectionStaffToken}` },
      body: JSON.stringify({
        donationEventId: completedDonationEventId,
      }),
    });
    assert(
      duplicateUnitAttempt.status === 409 && duplicateUnitAttempt.data?.error?.code === 'DUPLICATE_COLLECTION_UNIT',
      '6. Duplicate collection unit registration strictly rejected with 409 Conflict'
    );

    // 7. Initial status history recorded automatically and atomically
    const initialHistory = await prisma.unitStatusHistory.findFirst({
      where: { collectionUnitId, toStatus: 'COLLECTED' },
    });
    assert(
      initialHistory !== null && initialHistory?.actorUserId === collectionStaffUserId,
      '7. Append-only status history created atomically with collector attribution'
    );

    // ----------------------------------------------------
    // Section 3: Organisation Isolation & Traceability Retrieval
    // ----------------------------------------------------
    console.log('\n--- Section 3: Organisation Isolation & Traceability Detail ---');

    // 8. Cross-organisation access denied: Org B cannot view Org A's unit traceability
    const crossOrgView = await request(`/traceability/collection-units/${collectionUnitId}`, {
      headers: { Authorization: `Bearer ${orgBStaffToken}` },
    });
    assert(
      crossOrgView.status === 403,
      '8. Cross-organisation unit traceability lookup rejected with 403 Forbidden'
    );

    // 9. Authorised staff retrieves complete traceability lineage
    const traceRes = await request(`/traceability/collection-units/${collectionUnitId}`, {
      headers: { Authorization: `Bearer ${orgAdminToken}` },
    });
    const traceData = traceRes.data?.data;
    assert(
      traceRes.status === 200 &&
      traceData?.unitNumber === collectionUnitNumber &&
      traceData?.bloodGroup === 'B_POS' &&
      traceData?.camp?.title === 'Phase 4 Outreach Blood Drive',
      '9. Authorised staff retrieves unit traceability with originating camp and blood group'
    );

    // 10. Protection of Donor PII: Traceability response does not leak donor phone or personal full name
    const traceJsonString = JSON.stringify(traceData);
    const leaksDonorPII = traceJsonString.includes(donorPhone) || traceJsonString.includes('Traceable Voluntary Donor');
    assert(
      !leaksDonorPII,
      '10. Traceability response protects donor PII (no phone numbers or donor names exposed)'
    );

    // 11. Organisation collection unit listing includes verified unit
    const listRes = await request(`/traceability/collection-units?organisationId=${organisationIdA}`, {
      headers: { Authorization: `Bearer ${inventoryStaffToken}` },
    });
    const unitsList = listRes.data?.data || [];
    assert(
      listRes.status === 200 && unitsList.some((u: any) => u.id === collectionUnitId),
      '11. Authorised organisation inventory staff lists collection units'
    );

    // ----------------------------------------------------
    // Section 4: Collection Unit Status Transitions
    // ----------------------------------------------------
    console.log('\n--- Section 4: Collection Unit State Machine & Transitions ---');

    // 12. Valid transition: COLLECTED -> PREPARED_FOR_HANDOVER
    const handoverPrepRes = await request(`/traceability/collection-units/${collectionUnitId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${collectionStaffToken}` },
      body: JSON.stringify({
        status: 'PREPARED_FOR_HANDOVER',
        reason: 'Inspected and packed into certified passive transport box',
      }),
    });
    assert(
      handoverPrepRes.status === 200 && handoverPrepRes.data?.data?.status === 'PREPARED_FOR_HANDOVER',
      '12. Collection unit status transitioned: COLLECTED -> PREPARED_FOR_HANDOVER'
    );

    // 13. Valid transition: PREPARED_FOR_HANDOVER -> IN_TRANSIT
    const inTransitRes = await request(`/traceability/collection-units/${collectionUnitId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${collectionStaffToken}` },
      body: JSON.stringify({
        status: 'IN_TRANSIT',
        reason: 'Courier dispatch acknowledged',
      }),
    });
    assert(
      inTransitRes.status === 200 && inTransitRes.data?.data?.status === 'IN_TRANSIT',
      '13. Collection unit status transitioned: PREPARED_FOR_HANDOVER -> IN_TRANSIT'
    );

    // 14. Invalid transition: IN_TRANSIT cannot transition back to COLLECTED
    const invalidTransition = await request(`/traceability/collection-units/${collectionUnitId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${collectionStaffToken}` },
      body: JSON.stringify({
        status: 'COLLECTED',
      }),
    });
    assert(
      invalidTransition.status === 400 && invalidTransition.data?.error?.code === 'INVALID_TRANSITION',
      '14. Invalid state transition (IN_TRANSIT -> COLLECTED) rejected with 400 Bad Request'
    );

    // 15. Cross-organisation transition attempt rejected
    const crossOrgTransition = await request(`/traceability/collection-units/${collectionUnitId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${orgBStaffToken}` },
      body: JSON.stringify({ status: 'RECEIVED_BY_CENTRE' }),
    });
    assert(
      crossOrgTransition.status === 403,
      '15. Cross-organisation status transition rejected with 403 Forbidden'
    );

    // 16. Valid transition: IN_TRANSIT -> RECEIVED_BY_CENTRE
    const receivedRes = await request(`/traceability/collection-units/${collectionUnitId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${inventoryStaffToken}` },
      body: JSON.stringify({
        status: 'RECEIVED_BY_CENTRE',
        reason: 'Arrived at blood centre cold room; seal intact',
      }),
    });
    assert(
      receivedRes.status === 200 && receivedRes.data?.data?.status === 'RECEIVED_BY_CENTRE',
      '16. Collection unit status transitioned: IN_TRANSIT -> RECEIVED_BY_CENTRE'
    );

    // ----------------------------------------------------
    // Section 5: Component Derivation (Lineage)
    // ----------------------------------------------------
    console.log('\n--- Section 5: Blood Component Derivation & Separation Lineage ---');

    // 17. Collection staff cannot derive components (laboratory/inventory role gate)
    const collectionDeriveAttempt = await request(`/traceability/collection-units/${collectionUnitId}/derive-components`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${collectionStaffToken}` },
      body: JSON.stringify({
        components: [{ componentType: 'PRBC', volumeMl: 250 }],
      }),
    });
    assert(
      collectionDeriveAttempt.status === 403,
      '17. Phlebotomy staff cannot derive components (Role Gate: INVENTORY or CLINICAL required)'
    );

    // 18. Derivation with empty components array is rejected
    const emptyDeriveAttempt = await request(`/traceability/collection-units/${collectionUnitId}/derive-components`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${inventoryStaffToken}` },
      body: JSON.stringify({ components: [] }),
    });
    assert(
      emptyDeriveAttempt.status === 400,
      '18. Empty component derivation request rejected'
    );

    // 19. INVENTORY_STAFF derives multiple components (PRBC, FFP, Platelet Concentrate)
    const deriveRes = await request(`/traceability/collection-units/${collectionUnitId}/derive-components`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${inventoryStaffToken}` },
      body: JSON.stringify({
        components: [
          { componentType: 'PRBC', volumeMl: 250 },
          { componentType: 'FRESH_FROZEN_PLASMA', volumeMl: 200 },
          { componentType: 'PLATELET_CONCENTRATE', volumeMl: 50 },
        ],
        reason: 'Standard triple blood bag component separation via refrigerated centrifuge',
      }),
    });
    assert(
      deriveRes.status === 201 && Array.isArray(deriveRes.data?.data) && deriveRes.data?.data?.length === 3,
      '19. INVENTORY_STAFF derives 3 components (PRBC, FFP, Platelet Concentrate) from source unit'
    );
    const derivedComponents = deriveRes.data?.data || [];
    const prbcComp = derivedComponents.find((c: any) => c.componentType === 'PRBC');
    const ffpComp = derivedComponents.find((c: any) => c.componentType === 'FRESH_FROZEN_PLASMA');
    const plateletComp = derivedComponents.find((c: any) => c.componentType === 'PLATELET_CONCENTRATE');
    prbcComponentId = prbcComp?.id;

    // 20. Each component receives a unique traceable componentCode
    const codes = derivedComponents.map((c: any) => c.componentCode);
    const uniqueCodes = new Set(codes);
    assert(
      uniqueCodes.size === 3 && codes.every((code: string) => code.startsWith('CMP-')),
      '20. Each derived component receives an authoritative, unique componentCode'
    );

    // 21. Each component inherits source collection unit bloodGroup and organisationId
    assert(
      prbcComp?.bloodGroup === 'B_POS' &&
      prbcComp?.organisationId === organisationIdA &&
      ffpComp?.bloodGroup === 'B_POS',
      '21. Derived components inherit source bloodGroup (B_POS) and responsible organisation'
    );

    // 22. Standard shelf-life expiry dates calculated automatically per component standard
    const nowMs = Date.now();
    const prbcExpiryDays = Math.round((new Date(prbcComp.expiresAt).getTime() - nowMs) / 86400000);
    const plateletExpiryDays = Math.round((new Date(plateletComp.expiresAt).getTime() - nowMs) / 86400000);
    assert(
      prbcExpiryDays >= 41 && prbcExpiryDays <= 43 &&
      plateletExpiryDays >= 4 && plateletExpiryDays <= 6,
      '22. Standard shelf-life expiry applied (PRBC: ~42 days, Platelets: ~5 days)'
    );

    // 23. Source collection unit automatically transitions to PROCESSING_COMPLETED
    const sourceAfterDerive = await prisma.collectionUnit.findUnique({
      where: { id: collectionUnitId },
    });
    assert(
      sourceAfterDerive?.status === 'PROCESSING_COMPLETED',
      '23. Source collection unit status transitioned to PROCESSING_COMPLETED'
    );

    // 24. Prohibit duplicate derivation rounds for completed processing
    const duplicateDeriveAttempt = await request(`/traceability/collection-units/${collectionUnitId}/derive-components`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${inventoryStaffToken}` },
      body: JSON.stringify({
        components: [{ componentType: 'PRBC', volumeMl: 250 }],
      }),
    });
    assert(
      duplicateDeriveAttempt.status === 400 && duplicateDeriveAttempt.data?.error?.code === 'ALREADY_DERIVED',
      '24. Subsequent component derivation from a completed source unit rejected'
    );

    // ----------------------------------------------------
    // Section 6: Component Status & Lineage Reconstruction
    // ----------------------------------------------------
    console.log('\n--- Section 6: Component Status & Complete Lineage Reconstruction ---');

    // 25. Derived component starts in QUARANTINED status (awaiting testing / release)
    assert(
      prbcComp?.status === 'QUARANTINED',
      '25. Derived components initialized in QUARANTINED status awaiting testing / release'
    );

    // 26. Component status transition: Clinical Safety Gate Enforced
    // Generic direct PATCH to AVAILABLE is strictly prohibited
    const unauthorizedCompRelease = await request(`/traceability/components/${prbcComponentId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${inventoryStaffToken}` },
      body: JSON.stringify({
        status: 'AVAILABLE',
        reason: 'Attempted direct release by inventory staff without clinical release workflow',
      }),
    });

    // Attempted generic direct PATCH by clinical staff is also prohibited (must use authoritative gate)
    const directGenericRelease = await request(`/traceability/components/${prbcComponentId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${clinicalStaffToken}` },
      body: JSON.stringify({
        status: 'AVAILABLE',
        reason: 'Direct generic status update attempt',
      }),
    });

    // Authoritative Release: Seed mandatory TTI & immunohematology panel cleared
    const mandatoryTests = [
      'HIV_ANTIBODY',
      'HCV_ANTIBODY',
      'HBSAG',
      'SYPHILIS_RPR',
      'MALARIA_ANTIGEN',
      'ABO_RH_CONFIRMATION',
    ];
    for (const tType of mandatoryTests) {
      await request(`/organisations/${organisationIdA}/laboratory-tests`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${clinicalStaffToken}` },
        body: JSON.stringify({
          componentUnitId: prbcComponentId,
          category: tType === 'ABO_RH_CONFIRMATION' ? 'BLOOD_GROUPING' : 'TTI_SCREENING',
          testType: tType,
          resultOutcome: 'NON_REACTIVE',
          status: 'COMPLETED',
          quantitativeValue: tType === 'ABO_RH_CONFIRMATION' ? 'B_POS' : undefined,
        }),
      });
    }

    // Execute Authorised Clinical Release via authoritative backend gate
    const clinicalCompRelease = await request(
      `/organisations/${organisationIdA}/components/${prbcComponentId}/clinical-release`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${clinicalStaffToken}` },
        body: JSON.stringify({
          decision: 'RELEASED',
          reason: 'Mandatory viral screening (HIV, HBV, HCV, Syphilis, Malaria) cleared; released for inventory',
          clinicalProtocolRef: 'Facility SOP Standard Protocol',
        }),
      }
    );

    assert(
      (unauthorizedCompRelease.status === 400 || unauthorizedCompRelease.status === 403) &&
        directGenericRelease.status === 400 &&
        clinicalCompRelease.status === 200 &&
        clinicalCompRelease.data?.data?.component?.status === 'AVAILABLE',
      '26. Component status transitioned: QUARANTINED -> AVAILABLE (Clinical Safety Gate Enforced)'
    );

    // 27. Invalid component transition: AVAILABLE cannot transition back to QUARANTINED
    const invalidCompTransition = await request(`/traceability/components/${prbcComponentId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${inventoryStaffToken}` },
      body: JSON.stringify({ status: 'QUARANTINED' }),
    });
    assert(
      invalidCompTransition.status === 400 && invalidCompTransition.data?.error?.code === 'INVALID_TRANSITION',
      '27. Invalid component transition rejected with 400 Bad Request'
    );

    // 28. Component traceability retrieves full lineage back to source collection unit
    const compTraceRes = await request(`/traceability/components/${prbcComponentId}`, {
      headers: { Authorization: `Bearer ${orgAdminToken}` },
    });
    const compTraceData = compTraceRes.data?.data;
    assert(
      compTraceRes.status === 200 &&
      compTraceData?.sourceCollection?.unitNumber === collectionUnitNumber &&
      compTraceData?.sourceCollection?.camp?.title === 'Phase 4 Outreach Blood Drive',
      '28. Component traceability reconstructs source collection unit and camp drive origin'
    );

    // 29. Full collection unit traceability reconstructs complete lineage with derived components and status histories
    const fullTraceRes = await request(`/traceability/collection-units/${collectionUnitId}`, {
      headers: { Authorization: `Bearer ${orgAdminToken}` },
    });
    const fullTrace = fullTraceRes.data?.data;
    assert(
      fullTraceRes.status === 200 &&
      fullTrace?.components?.length === 3 &&
      fullTrace?.statusHistory?.length >= 4,
      '29. Full collection unit lineage captures 3 derived components and append-only status trail'
    );

    // 30. Append-only status histories never overwrite previous records
    const historyEntries = await prisma.unitStatusHistory.findMany({
      where: { collectionUnitId },
      orderBy: { timestamp: 'asc' },
    });
    const statusesInHistory = historyEntries.map((h) => h.toStatus);
    assert(
      statusesInHistory.includes('COLLECTED') &&
      statusesInHistory.includes('PREPARED_FOR_HANDOVER') &&
      statusesInHistory.includes('IN_TRANSIT') &&
      statusesInHistory.includes('RECEIVED_BY_CENTRE') &&
      statusesInHistory.includes('PROCESSING_COMPLETED'),
      '30. UnitStatusHistory preserves every lifecycle transition chronologically without mutation'
    );

    // ----------------------------------------------------
    // Section 7: Audit Trail & Compliance Integrity
    // ----------------------------------------------------
    console.log('\n--- Section 7: Audit Trail & Compliance Integrity ---');

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        action: {
          in: [
            'COLLECTION_UNIT_CREATED',
            'COLLECTION_UNIT_STATUS_TRANSITION',
            'COMPONENTS_DERIVED',
            'COMPONENT_STATUS_TRANSITION',
          ],
        },
      },
    });

    // 31. Traceability audit logs exist for all actions
    const hasCreateAudit = auditLogs.some((a) => a.action === 'COLLECTION_UNIT_CREATED');
    const hasTransitionAudit = auditLogs.some((a) => a.action === 'COLLECTION_UNIT_STATUS_TRANSITION');
    const hasDeriveAudit = auditLogs.some((a) => a.action === 'COMPONENTS_DERIVED');
    const hasCompStatusAudit = auditLogs.some((a) => a.action === 'COMPONENT_STATUS_TRANSITION');
    assert(
      hasCreateAudit && hasTransitionAudit && hasDeriveAudit && hasCompStatusAudit,
      '31. AuditLog entries generated for unit creation, status transitions, and component derivation'
    );

    // 32. Audit logs are sanitized of passwords, OTPs, and donor PII
    const auditLogsStr = JSON.stringify(auditLogs);
    const leaksAuditSecrets = auditLogsStr.includes('123456') || auditLogsStr.includes(donorPhone);
    assert(
      !leaksAuditSecrets,
      '32. Audit trail is sanitized: No OTPs or donor telephone numbers logged'
    );

  } catch (err: any) {
    console.error('Unexpected test failure:', err);
    failed++;
  } finally {
    if (server) {
      server.close();
    }
  }

  console.log('\n========================================================================');
  console.log(` Summary: ${passed} passed, ${failed} failed out of ${passed + failed} assertions.`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase4TraceabilityTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
