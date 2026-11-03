import { app } from './app';
import { prisma } from './lib/prisma';
import http from 'http';

let server: http.Server;
const PORT = Number(process.env.TEST_PORT) || 4096;
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

async function runPhase9Tests() {
  console.log('========================================================================');
  console.log(' RaktaSetu — Phase 9: Hospital Integration, Issue Tracking & Disposition');
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

  // Dedicated test phone numbers in 9100+ range
  const bankAdminPhone = '+919999991001';
  const bankClinicalPhone = '+919999991002';
  const bankInventoryPhone = '+919999991003';
  const hospStaffPhone = '+919999991004';
  const hospClinicalPhone = '+919999991005';
  const unaffiliatedPhone = '+919999991006';

  let bankAdminToken = '';
  let bankClinicalToken = '';
  let bankInventoryToken = '';
  let hospStaffToken = '';
  let hospClinicalToken = '';
  let unaffiliatedToken = '';

  let bankOrgId = '';
  let hospOrgId = '';
  let rogueOrgId = '';

  let validComponentId = '';
  let heldComponentId = '';
  let expiredComponentId = '';
  let unreleasedComponentId = '';
  let discrepancyComponentId = '';
  let returnComponentId = '';
  let discardComponentId = '';

  try {
    console.log('--- 0. Provisioning Phase 9 Actors & Fixtures ---');

    async function loginActor(phone: string, name: string) {
      const loginRes = await request('/auth/demo-login', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: phone, otp: '123456' }),
      });
      const token = loginRes.data?.data?.token;
      const userId = loginRes.data?.data?.user?.id;
      if (name && token) {
        await request('/profile', {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name }),
        });
      }
      return { token, userId };
    }

    const bA = await loginActor(bankAdminPhone, 'Dr. Bank Admin');
    bankAdminToken = bA.token;
    const bC = await loginActor(bankClinicalPhone, 'Dr. Bank Pathologist');
    bankClinicalToken = bC.token;
    const bI = await loginActor(bankInventoryPhone, 'Bank Stock Officer');
    bankInventoryToken = bI.token;
    const hS = await loginActor(hospStaffPhone, 'Nurse Hospital Intake');
    hospStaffToken = hS.token;
    const hC = await loginActor(hospClinicalPhone, 'Dr. Hospital Transfusionist');
    hospClinicalToken = hC.token;
    const uA = await loginActor(unaffiliatedPhone, 'External Staff');
    unaffiliatedToken = uA.token;

    assert(
      Boolean(bankAdminToken && bankClinicalToken && hospStaffToken && hospClinicalToken),
      'All 6 test actors authenticated with session tokens'
    );

    const bankAdminUserId = bA.userId;
    const bankClinicalUserId = bC.userId;
    const bankInventoryUserId = bI.userId;
    const hospStaffUserId = hS.userId;
    const hospClinicalUserId = hC.userId;
    const unaffiliatedUserId = uA.userId;

    // Create Verified Organisations
    const now = new Date();
    const bankOrg = await prisma.organisation.create({
      data: {
        orgCode: `BANK-P9-${Date.now()}`,
        name: 'Apex Blood Centre Pune',
        type: 'BLOOD_BANK',
        licenseNumber: `LIC-BB-P9-${Date.now()}`,
        districtCode: 521,
        status: 'VERIFIED',
        verifiedAt: now,
      },
    });
    bankOrgId = bankOrg.id;

    const hospOrg = await prisma.organisation.create({
      data: {
        orgCode: `HOSP-P9-${Date.now()}`,
        name: 'Ruby Hall Healthcare Facility',
        type: 'RECEIVING_FACILITY',
        licenseNumber: `LIC-HF-P9-${Date.now()}`,
        districtCode: 521,
        status: 'VERIFIED',
        verifiedAt: now,
      },
    });
    hospOrgId = hospOrg.id;

    const rogueOrg = await prisma.organisation.create({
      data: {
        orgCode: `HOSP-ROGUE-${Date.now()}`,
        name: 'Unauthorized Third Party Clinic',
        type: 'RECEIVING_FACILITY',
        licenseNumber: `LIC-HF-ROGUE-${Date.now()}`,
        districtCode: 522,
        status: 'VERIFIED',
        verifiedAt: now,
      },
    });
    rogueOrgId = rogueOrg.id;

    // Assign Organisation Memberships
    await prisma.organisationMembership.createMany({
      data: [
        { userId: bankAdminUserId, organisationId: bankOrgId, role: 'ORG_ADMIN', isActive: true },
        { userId: bankClinicalUserId, organisationId: bankOrgId, role: 'CLINICAL_STAFF', isActive: true },
        { userId: bankInventoryUserId, organisationId: bankOrgId, role: 'INVENTORY_STAFF', isActive: true },
        { userId: hospStaffUserId, organisationId: hospOrgId, role: 'INVENTORY_STAFF', isActive: true },
        { userId: hospClinicalUserId, organisationId: hospOrgId, role: 'CLINICAL_STAFF', isActive: true },
        { userId: unaffiliatedUserId, organisationId: rogueOrgId, role: 'ORG_ADMIN', isActive: true },
      ],
    });

    // Create Donor & Collection Unit & Components
    const donorUser = await prisma.user.create({
      data: { phoneNumber: `+919999991${Math.floor(Math.random() * 899 + 100)}`, name: 'P9 Test Donor' },
    });
    const donorProfile = await prisma.donorProfile.create({
      data: { userId: donorUser.id, bloodGroup: 'B_POS', districtCode: 521, fullName: 'P9 Donor Masked' },
    });
    // Create Camp & Attendance for valid DonationEvent lineage
    const camp = await prisma.camp.create({
      data: {
        campCode: `CAMP-P9-${Date.now()}`,
        title: 'Phase 9 Hospital Integration Drive',
        organizerName: 'Red Cross Pune',
        targetDate: new Date('2026-12-01T09:00:00Z'),
        venue: 'Pune Medical Centre',
        districtCode: 521,
        organisationId: bankOrgId,
        status: 'APPROVED',
        isReadyForCollection: true,
      },
    });

    const attendance = await prisma.campAttendance.create({
      data: {
        campId: camp.id,
        userId: donorUser.id,
        donorName: 'P9 Donor',
        donorPhone: donorUser.phoneNumber,
        bloodGroup: 'B_POS',
        status: 'CHECKED_IN',
        checkedInAt: new Date(),
        checkedInBy: bankClinicalUserId,
      },
    });

    const donEvent = await prisma.donationEvent.create({
      data: {
        campId: camp.id,
        attendanceId: attendance.id,
        donorUserId: donorUser.id,
        outcome: 'COMPLETED',
        bloodGroup: 'B_POS',
        volumeMl: 450,
        recordedBy: bankClinicalUserId,
        performedAt: new Date(),
      },
    });

    const cu = await prisma.collectionUnit.create({
      data: {
        unitNumber: `CU-P9-${Date.now()}`,
        donationEventId: donEvent.id,
        organisationId: bankOrgId,
        bloodGroup: 'B_POS',
        status: 'PROCESSING_COMPLETED',
        collectedBy: bankClinicalUserId,
      },
    });

    // 1. Valid Component (Available, Released, Not Expired, Not On Hold)
    const comp1 = await prisma.componentUnit.create({
      data: {
        componentCode: `CMP-P9-V-${Date.now()}`,
        collectionUnitId: cu.id,
        componentType: 'PRBC',
        bloodGroup: 'B_POS',
        volumeMl: 280,
        organisationId: bankOrgId,
        status: 'AVAILABLE',
        derivedBy: bankClinicalUserId,
        expiresAt: new Date(Date.now() + 35 * 86400000), // +35 days
        isHold: false,
      },
    });
    validComponentId = comp1.id;
    await prisma.clinicalReleaseRecord.create({
      data: {
        componentUnitId: comp1.id,
        organisationId: bankOrgId,
        decision: 'RELEASED',
        authorizedClinicalUserId: bankClinicalUserId,
        reason: 'All mandatory TTI non-reactive and QC passed',
        reviewedTestIds: ['test-ref-1'],
      },
    });

    // 2. Held Component (isHold: true)
    const comp2 = await prisma.componentUnit.create({
      data: {
        componentCode: `CMP-P9-HELD-${Date.now()}`,
        collectionUnitId: cu.id,
        componentType: 'PRBC',
        bloodGroup: 'B_POS',
        volumeMl: 280,
        organisationId: bankOrgId,
        status: 'AVAILABLE',
        derivedBy: bankClinicalUserId,
        expiresAt: new Date(Date.now() + 30 * 86400000),
        isHold: true,
        holdReason: 'Investigating potential donor deferral notification',
      },
    });
    heldComponentId = comp2.id;
    await prisma.clinicalReleaseRecord.create({
      data: {
        componentUnitId: comp2.id,
        organisationId: bankOrgId,
        decision: 'RELEASED',
        authorizedClinicalUserId: bankClinicalUserId,
        reason: 'Initial release',
        reviewedTestIds: ['test-ref-2'],
      },
    });

    // 3. Expired Component
    const comp3 = await prisma.componentUnit.create({
      data: {
        componentCode: `CMP-P9-EXP-${Date.now()}`,
        collectionUnitId: cu.id,
        componentType: 'PLATELET_CONCENTRATE',
        bloodGroup: 'B_POS',
        volumeMl: 55,
        organisationId: bankOrgId,
        status: 'AVAILABLE',
        derivedBy: bankClinicalUserId,
        expiresAt: new Date(Date.now() - 86400000), // Expired yesterday
        isHold: false,
      },
    });
    expiredComponentId = comp3.id;
    await prisma.clinicalReleaseRecord.create({
      data: {
        componentUnitId: comp3.id,
        organisationId: bankOrgId,
        decision: 'RELEASED',
        authorizedClinicalUserId: bankClinicalUserId,
        reason: 'Platelet release',
        reviewedTestIds: ['test-ref-3'],
      },
    });

    // 4. Unreleased Component
    const comp4 = await prisma.componentUnit.create({
      data: {
        componentCode: `CMP-P9-UNREL-${Date.now()}`,
        collectionUnitId: cu.id,
        componentType: 'FRESH_FROZEN_PLASMA',
        bloodGroup: 'B_POS',
        volumeMl: 200,
        organisationId: bankOrgId,
        status: 'AWAITING_CLINICAL_REVIEW',
        derivedBy: bankClinicalUserId,
        expiresAt: new Date(Date.now() + 180 * 86400000),
        isHold: false,
      },
    });
    unreleasedComponentId = comp4.id;

    // 5. Discrepancy test component
    const comp5 = await prisma.componentUnit.create({
      data: {
        componentCode: `CMP-P9-DISC-${Date.now()}`,
        collectionUnitId: cu.id,
        componentType: 'PRBC',
        bloodGroup: 'B_POS',
        volumeMl: 290,
        organisationId: bankOrgId,
        status: 'AVAILABLE',
        derivedBy: bankClinicalUserId,
        expiresAt: new Date(Date.now() + 30 * 86400000),
        isHold: false,
      },
    });
    discrepancyComponentId = comp5.id;
    await prisma.clinicalReleaseRecord.create({
      data: {
        componentUnitId: comp5.id,
        organisationId: bankOrgId,
        decision: 'RELEASED',
        authorizedClinicalUserId: bankClinicalUserId,
        reason: 'QC released',
        reviewedTestIds: ['test-ref-5'],
      },
    });

    // 6. Return test component
    const comp6 = await prisma.componentUnit.create({
      data: {
        componentCode: `CMP-P9-RET-${Date.now()}`,
        collectionUnitId: cu.id,
        componentType: 'PRBC',
        bloodGroup: 'B_POS',
        volumeMl: 280,
        organisationId: bankOrgId,
        status: 'AVAILABLE',
        derivedBy: bankClinicalUserId,
        expiresAt: new Date(Date.now() + 30 * 86400000),
        isHold: false,
      },
    });
    returnComponentId = comp6.id;
    await prisma.clinicalReleaseRecord.create({
      data: {
        componentUnitId: comp6.id,
        organisationId: bankOrgId,
        decision: 'RELEASED',
        authorizedClinicalUserId: bankClinicalUserId,
        reason: 'QC released',
        reviewedTestIds: ['test-ref-6'],
      },
    });

    // 7. Discard test component
    const comp7 = await prisma.componentUnit.create({
      data: {
        componentCode: `CMP-P9-DISCARD-${Date.now()}`,
        collectionUnitId: cu.id,
        componentType: 'PRBC',
        bloodGroup: 'B_POS',
        volumeMl: 280,
        organisationId: bankOrgId,
        status: 'AVAILABLE',
        derivedBy: bankClinicalUserId,
        expiresAt: new Date(Date.now() + 30 * 86400000),
        isHold: false,
      },
    });
    discardComponentId = comp7.id;
    await prisma.clinicalReleaseRecord.create({
      data: {
        componentUnitId: comp7.id,
        organisationId: bankOrgId,
        decision: 'RELEASED',
        authorizedClinicalUserId: bankClinicalUserId,
        reason: 'QC released',
        reviewedTestIds: ['test-ref-7'],
      },
    });

    console.log('Fixtures provisioned successfully.\n');

    // =========================================================================
    // SECTION 1: Facility verification and role boundaries
    // =========================================================================
    console.log('--- Section 1: Facility Verification & Access Boundaries ---');

    // Test 1: Unauthenticated issue attempt rejected
    const unauthRes = await request('/hospital/issues/authorise', {
      method: 'POST',
      body: JSON.stringify({
        organisationId: bankOrgId,
        receivingFacilityId: hospOrgId,
        componentUnitIds: [validComponentId],
        authorisationReason: 'Test',
      }),
    });
    assert(unauthRes.status === 401, '1. Unauthenticated issue authorisation rejected with 401 Unauthorized');

    // Test 2: Unaffiliated actor rejected from bank issue
    const unaffiliatedIssueRes = await request('/hospital/issues/authorise', {
      method: 'POST',
      headers: { Authorization: `Bearer ${unaffiliatedToken}` },
      body: JSON.stringify({
        organisationId: bankOrgId,
        receivingFacilityId: hospOrgId,
        componentUnitIds: [validComponentId],
        authorisationReason: 'Test',
      }),
    });
    assert(unaffiliatedIssueRes.status === 403, '2. Unaffiliated user cannot authorise issue (Cross-org access denied 403)');

    // Test 3: Issue to non-existent facility rejected
    const badFacilityRes = await request('/hospital/issues/authorise', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bankAdminToken}` },
      body: JSON.stringify({
        organisationId: bankOrgId,
        receivingFacilityId: '00000000-0000-0000-0000-000000000000',
        componentUnitIds: [validComponentId],
        authorisationReason: 'Test',
      }),
    });
    assert(badFacilityRes.status === 400 || badFacilityRes.status === 404, '3. Issue to non-verified facility rejected');

    // =========================================================================
    // SECTION 2: Concurrency & Invariant Issue Prevention
    // =========================================================================
    console.log('\n--- Section 2: Concurrency & Safety Invariant Protection ---');

    // Test 4: Issue of held component rejected
    const heldRes = await request('/hospital/issues/authorise', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bankAdminToken}` },
      body: JSON.stringify({
        organisationId: bankOrgId,
        receivingFacilityId: hospOrgId,
        componentUnitIds: [heldComponentId],
        authorisationReason: 'Routine supply',
      }),
    });
    assert(heldRes.status === 400 && heldRes.data?.error?.message?.includes('hold'), '4. Issue of component on quarantine hold strictly rejected with 400');

    // Test 5: Issue of expired component rejected
    const expRes = await request('/hospital/issues/authorise', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bankAdminToken}` },
      body: JSON.stringify({
        organisationId: bankOrgId,
        receivingFacilityId: hospOrgId,
        componentUnitIds: [expiredComponentId],
        authorisationReason: 'Routine supply',
      }),
    });
    assert(expRes.status === 400 && expRes.data?.error?.message?.includes('expired'), '5. Issue of expired component strictly rejected with 400');

    // Test 6: Issue of unreleased component rejected
    const unrelRes = await request('/hospital/issues/authorise', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bankAdminToken}` },
      body: JSON.stringify({
        organisationId: bankOrgId,
        receivingFacilityId: hospOrgId,
        componentUnitIds: [unreleasedComponentId],
        authorisationReason: 'Routine supply',
      }),
    });
    assert(unrelRes.status === 400, '6. Issue of component lacking clinical release rejected with 400');

    // Test 7: Valid issue authorisation succeeds
    let issueOrderId = '';
    const authIssueRes = await request('/hospital/issues/authorise', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bankAdminToken}` },
      body: JSON.stringify({
        organisationId: bankOrgId,
        receivingFacilityId: hospOrgId,
        componentUnitIds: [validComponentId, discrepancyComponentId],
        authorisationReason: 'Clinical emergency protocol allocation',
        notes: 'Cold shipper with tamper-evident seal #7721',
      }),
    });
    assert(authIssueRes.status === 201 && authIssueRes.data?.success, '7. Authorised issue order created with 201 Created');
    issueOrderId = authIssueRes.data?.data?.id;
    assert(Boolean(authIssueRes.data?.data?.orderNumber), '8. Issue order assigned authoritative orderNumber (e.g. HIO-YYYY-NNNN)');
    assert(authIssueRes.data?.data?.status === 'AUTHORISED', '9. Initial order status is AUTHORISED');

    // Test 10: Component status updated to ISSUED in database
    const dbComp = await prisma.componentUnit.findUnique({ where: { id: validComponentId } });
    assert(dbComp?.status === 'ISSUED', '10. Component status atomically transitioned to ISSUED');

    // Test 11: Duplicate issue attempt of already allocated component rejected
    const dupIssueRes = await request('/hospital/issues/authorise', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bankAdminToken}` },
      body: JSON.stringify({
        organisationId: bankOrgId,
        receivingFacilityId: hospOrgId,
        componentUnitIds: [validComponentId],
        authorisationReason: 'Double-issue attempt',
      }),
    });
    assert(dupIssueRes.status === 400, '11. Double-issuing an already allocated component strictly rejected with 400 Conflict');

    // =========================================================================
    // SECTION 3: Dispatch Workflow & Transport Metadata
    // =========================================================================
    console.log('\n--- Section 3: Component Dispatch & Transport Tracking ---');

    // Test 12: Dispatch without valid issue record rejected
    const fakeDispatchRes = await request('/hospital/issues/dispatch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bankInventoryToken}` },
      body: JSON.stringify({
        organisationId: bankOrgId,
        issueOrderId: '00000000-0000-0000-0000-000000000000',
        transportDetails: { courierName: 'Test' },
      }),
    });
    assert(fakeDispatchRes.status === 404, '12. Dispatching non-existent issue record rejected with 404 Not Found');

    // Test 13: Unauthorized org cannot dispatch
    const rogueDispatchRes = await request('/hospital/issues/dispatch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${unaffiliatedToken}` },
      body: JSON.stringify({
        organisationId: rogueOrgId,
        issueOrderId,
        transportDetails: { courierName: 'Rogue Courier' },
      }),
    });
    assert(rogueDispatchRes.status === 403, '13. Cross-organisation dispatch attempt rejected with 403 Forbidden');

    // Test 14: Valid dispatch succeeds
    const dispatchRes = await request('/hospital/issues/dispatch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bankInventoryToken}` },
      body: JSON.stringify({
        organisationId: bankOrgId,
        issueOrderId,
        transportDetails: {
          courierName: 'Maharashtra Cold Transport',
          vehicleNumber: 'MH-12-RS-4422',
          driverPhone: '+919822334455',
          coldBoxTempCelsius: 3.8,
          notes: 'Temperature logger #TL-902 active',
        },
      }),
    });
    assert(dispatchRes.status === 200 && dispatchRes.data?.data?.status === 'DISPATCHED', '14. Dispatch recorded successfully; status transitioned to DISPATCHED');
    assert(Boolean(dispatchRes.data?.data?.dispatchedAt), '15. Dispatch timestamp and responsible actor recorded');

    // Test 16: Re-dispatch of already dispatched order rejected
    const redispatchRes = await request('/hospital/issues/dispatch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bankInventoryToken}` },
      body: JSON.stringify({
        organisationId: bankOrgId,
        issueOrderId,
        transportDetails: { courierName: 'Duplicate' },
      }),
    });
    assert(redispatchRes.status === 400, '16. Re-dispatching an already dispatched order rejected with 400');

    // =========================================================================
    // SECTION 4: Controlled Receiving Acknowledgement & Discrepancies
    // =========================================================================
    console.log('\n--- Section 4: Receiving Facility Intake & Discrepancy Auditing ---');

    // Test 17: Create fresh order in AUTHORISED state to test receipt before dispatch
    const earlyAuthRes = await request('/hospital/issues/authorise', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bankAdminToken}` },
      body: JSON.stringify({
        organisationId: bankOrgId,
        receivingFacilityId: hospOrgId,
        componentUnitIds: [returnComponentId],
        authorisationReason: 'Early receipt test order',
      }),
    });
    const earlyOrderId = earlyAuthRes.data?.data?.id;

    // Test 18: Receipt before dispatch strictly rejected
    const earlyReceiptRes = await request('/hospital/issues/receive', {
      method: 'POST',
      headers: { Authorization: `Bearer ${hospStaffToken}` },
      body: JSON.stringify({
        organisationId: hospOrgId,
        issueOrderId: earlyOrderId,
        receipts: [{ componentUnitId: returnComponentId, outcome: 'VERIFIED_INTACT' }],
      }),
    });
    assert(earlyReceiptRes.status === 400, '17. Acknowledging receipt BEFORE dispatch is strictly rejected with 400 Bad Request');

    // Dispatch the early order so returnComponentId can be used later
    await request('/hospital/issues/dispatch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bankInventoryToken}` },
      body: JSON.stringify({
        organisationId: bankOrgId,
        issueOrderId: earlyOrderId,
        transportDetails: { courierName: 'Direct Shuttle' },
      }),
    });

    // Test 19: Wrong facility attempting receipt rejected
    const wrongFacilityReceiptRes = await request('/hospital/issues/receive', {
      method: 'POST',
      headers: { Authorization: `Bearer ${unaffiliatedToken}` },
      body: JSON.stringify({
        organisationId: rogueOrgId,
        issueOrderId,
        receipts: [{ componentUnitId: validComponentId, outcome: 'VERIFIED_INTACT' }],
      }),
    });
    assert(wrongFacilityReceiptRes.status === 403, '18. Unauthorised facility attempting to acknowledge receipt rejected with 403 Forbidden');

    // Test 20: Acknowledging unit not allocated to the order rejected
    const alienCompReceiptRes = await request('/hospital/issues/receive', {
      method: 'POST',
      headers: { Authorization: `Bearer ${hospStaffToken}` },
      body: JSON.stringify({
        organisationId: hospOrgId,
        issueOrderId,
        receipts: [{ componentUnitId: discardComponentId, outcome: 'VERIFIED_INTACT' }],
      }),
    });
    assert(alienCompReceiptRes.status === 400, '19. Acknowledging unit not allocated to the order rejected with 400');

    // Test 21: Acknowledge valid order with mixed outcomes:
    // validComponentId -> VERIFIED_INTACT
    // discrepancyComponentId -> DAMAGED
    const validReceiptRes = await request('/hospital/issues/receive', {
      method: 'POST',
      headers: { Authorization: `Bearer ${hospStaffToken}` },
      body: JSON.stringify({
        organisationId: hospOrgId,
        issueOrderId,
        receipts: [
          { componentUnitId: validComponentId, outcome: 'VERIFIED_INTACT', notes: 'Container cold and intact' },
          { componentUnitId: discrepancyComponentId, outcome: 'DAMAGED', notes: 'Port seam leaking upon bag inspection' },
        ],
        notes: 'Intake batch verification completed',
      }),
    });
    assert(validReceiptRes.status === 200 && validReceiptRes.data?.success, '20. Receiving acknowledgement recorded with 200 OK');
    assert(validReceiptRes.data?.data?.status === 'RECEIVED_WITH_DISCREPANCIES', '21. Order status reflects discrepancies: RECEIVED_WITH_DISCREPANCIES');

    // Test 22: Automatic discrepancy logged
    const discrepancyRecords = await prisma.hospitalDiscrepancy.findMany({
      where: { issueOrderId },
    });
    assert(discrepancyRecords.length === 1, '22. Auditable discrepancy record created automatically for DAMAGED container');
    assert(discrepancyRecords[0].category === 'DAMAGED_CONTAINER', '23. Discrepancy category accurately mapped to DAMAGED_CONTAINER');

    // Test 23: Clinical distinction: receiving does NOT mark unit as transfused
    const postReceiptComp = await prisma.componentUnit.findUnique({ where: { id: validComponentId } });
    assert(postReceiptComp?.status === 'ISSUED', '24. Clinical invariant: Received component remains ISSUED and is NOT marked transfused');

    // Test 25: Acknowledge early order for returnComponentId
    await request('/hospital/issues/receive', {
      method: 'POST',
      headers: { Authorization: `Bearer ${hospStaffToken}` },
      body: JSON.stringify({
        organisationId: hospOrgId,
        issueOrderId: earlyOrderId,
        receipts: [{ componentUnitId: returnComponentId, outcome: 'VERIFIED_INTACT' }],
      }),
    });

    // Test 26: Duplicate receipt acknowledgement rejected
    const dupReceiptRes = await request('/hospital/issues/receive', {
      method: 'POST',
      headers: { Authorization: `Bearer ${hospStaffToken}` },
      body: JSON.stringify({
        organisationId: hospOrgId,
        issueOrderId,
        receipts: [{ componentUnitId: validComponentId, outcome: 'VERIFIED_INTACT' }],
      }),
    });
    assert(dupReceiptRes.status === 400, '25. Duplicate receiving acknowledgement strictly rejected with 400');

    // =========================================================================
    // SECTION 5: Final Disposition & Safety Invariants
    // =========================================================================
    console.log('\n--- Section 5: Clinical Disposition & Terminal Safety Rules ---');

    // Test 26: Transfusion recording by INVENTORY_STAFF strictly rejected
    const nonClinicalTransfusionRes = await request('/hospital/disposition', {
      method: 'POST',
      headers: { Authorization: `Bearer ${hospStaffToken}` },
      body: JSON.stringify({
        organisationId: hospOrgId,
        componentUnitId: validComponentId,
        dispositionType: 'TRANSFUSION_DOCUMENTED',
        reason: 'Patient administered PRBC',
        documentationRef: 'XM-901',
      }),
    });
    assert(nonClinicalTransfusionRes.status === 403, '26. Transfusion recording by non-clinical staff strictly rejected with 403 Forbidden');

    // Test 27: Transfusion without required clinical documentation rejected
    const missingDocTransfusionRes = await request('/hospital/disposition', {
      method: 'POST',
      headers: { Authorization: `Bearer ${hospClinicalToken}` },
      body: JSON.stringify({
        organisationId: hospOrgId,
        componentUnitId: validComponentId,
        dispositionType: 'TRANSFUSION_DOCUMENTED',
        reason: 'Patient administered PRBC',
        // documentationRef omitted
      }),
    });
    assert(missingDocTransfusionRes.status === 400, '27. Transfusion recording without documentation reference rejected with 400');

    // Test 28: Valid transfusion documented by CLINICAL_STAFF succeeds
    const validTransfusionRes = await request('/hospital/disposition', {
      method: 'POST',
      headers: { Authorization: `Bearer ${hospClinicalToken}` },
      body: JSON.stringify({
        organisationId: hospOrgId,
        componentUnitId: validComponentId,
        dispositionType: 'TRANSFUSION_DOCUMENTED',
        reason: 'Emergency transfusion completed without reaction',
        clinicalProtocolRef: 'Standard Crossmatch Protocol v3',
        documentationRef: 'XM-2026-PUN-9912',
        recipientPatientRef: 'MRN-78192',
      }),
    });
    assert(validTransfusionRes.status === 201 && validTransfusionRes.data?.success, '28. Authorised clinical transfusion documented with 201 Created');
    assert(validTransfusionRes.data?.data?.recipientPatientRef === 'PAT-***-8192', '29. Recipient patient reference sanitized/masked in stored record');

    // Test 30: Return workflow — returned component does NOT become available, enters QUARANTINED assessment
    const returnRes = await request('/hospital/disposition', {
      method: 'POST',
      headers: { Authorization: `Bearer ${hospClinicalToken}` },
      body: JSON.stringify({
        organisationId: hospOrgId,
        componentUnitId: returnComponentId,
        dispositionType: 'RETURNED_TO_BANK',
        reason: 'Surgery postponed, unit unbroken cold chain return',
        documentationRef: 'RET-VOUCHER-01',
      }),
    });
    assert(returnRes.status === 201, '30. Return disposition recorded successfully');
    const returnedComp = await prisma.componentUnit.findUnique({ where: { id: returnComponentId } });
    assert(returnedComp?.status === 'QUARANTINED' && returnedComp?.isHold === true, '31. Safety invariant: Returned unit enters QUARANTINED status under hold; NEVER available');

    // Test 32: Discard workflow
    const discardRes = await request('/hospital/disposition', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bankAdminToken}` },
      body: JSON.stringify({
        organisationId: bankOrgId,
        componentUnitId: discardComponentId,
        dispositionType: 'DISCARDED_DAMAGED',
        reason: 'Leak observed during visual inspection prior to pack',
        documentationRef: 'BIO-WASTE-2026-44',
      }),
    });
    assert(discardRes.status === 201, '32. Authorized discard recorded with documented bio-waste voucher reference');
    const discardedComp = await prisma.componentUnit.findUnique({ where: { id: discardComponentId } });
    assert(discardedComp?.status === 'DISCARDED', '33. Discarded component status updated to terminal DISCARDED');

    // Test 34: Prevention of silent reactivation of terminal component
    const reactivateRes = await request('/hospital/disposition', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bankAdminToken}` },
      body: JSON.stringify({
        organisationId: bankOrgId,
        componentUnitId: discardComponentId,
        dispositionType: 'RETURNED_TO_BANK',
        reason: 'Reactivation attempt',
        documentationRef: 'ATTEMPT-01',
      }),
    });
    assert(reactivateRes.status === 400, '34. Attempt to re-dispose or reactivate a terminal DISCARDED component strictly rejected with 400');

    // =========================================================================
    // SECTION 6: Audit History, Custody Reconstruction & Outbox Events
    // =========================================================================
    console.log('\n--- Section 6: Full Custody Lineage & Outbox Verification ---');

    // Test 35: Query facility orders
    const ordersRes = await request(`/hospital/orders?organisationId=${hospOrgId}`, {
      headers: { Authorization: `Bearer ${hospStaffToken}` },
    });
    assert(ordersRes.status === 200 && Array.isArray(ordersRes.data?.data), '35. Facility orders endpoint returns 200 with associated orders');

    // Test 36: Full custody history reconstruction
    const custodyRes = await request(`/hospital/components/${validComponentId}/custody?organisationId=${bankOrgId}`, {
      headers: { Authorization: `Bearer ${bankAdminToken}` },
    });
    assert(custodyRes.status === 200 && custodyRes.data?.success, '36. Component custody history endpoint returns 200 OK');
    assert(Boolean(custodyRes.data?.data?.component?.componentCode), '37. Custody history reconstructs component metadata and code');
    assert(Array.isArray(custodyRes.data?.data?.custodyTrail) && custodyRes.data.data.custodyTrail.length >= 4, '38. Full lifecycle chronological status trail reconstructed (>= 4 transitions)');
    assert(Array.isArray(custodyRes.data?.data?.dispositionRecords) && custodyRes.data.data.dispositionRecords.length === 1, '39. Custody history accurately links verified disposition record');

    // Test 40: PII protection: donor phone and unmasked names are NOT exposed
    const custodyStr = JSON.stringify(custodyRes.data);
    assert(!custodyStr.includes(donorUser.phoneNumber), '40. Privacy guard: Traceability response does not expose donor contact numbers');

    // Test 41: Realtime outbox events generated
    const outboxEvents = await prisma.outboxEvent.findMany({
      where: {
        eventType: { in: ['hospital_issue.authorised', 'hospital_issue.dispatched', 'hospital_issue.received', 'component.disposition_recorded'] },
      },
    });
    assert(outboxEvents.length >= 4, `41. Transactional outbox events reliably published for Phase 9 lifecycle (found ${outboxEvents.length} events)`);

  } catch (err: any) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    if (server) {
      server.close();
    }
  }

  console.log('\n========================================================================');
  console.log(` Phase 9 Test Suite Completed: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase9Tests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
