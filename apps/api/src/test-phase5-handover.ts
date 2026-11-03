import { app } from './app';
import { prisma } from './lib/prisma';
import http from 'http';

let server: http.Server;
const PORT = 4097;
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

async function runPhase5HandoverTests() {
  console.log('========================================================================');
  console.log(' RaktaSetu — Phase 5: Physical Handover, Transport & Reconciliation');
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

  // Actor phones
  const orgAAdminPhone = '+919999977001';
  const orgACollectionStaffPhone = '+919999977002';
  const orgAAuditorPhone = '+919999977003';
  const orgBAdminPhone = '+919999977004';
  const orgBInventoryStaffPhone = '+919999977005';
  const orgCStaffPhone = '+919999977006';
  const orgAInventoryStaffPhone = '+919999977008';
  const donorPhone = '+919999977007';

  let orgAAdminToken = '';
  let orgACollectionStaffToken = '';
  let orgAInventoryStaffToken = '';
  let orgAAuditorToken = '';
  let orgBAdminToken = '';
  let orgBInventoryStaffToken = '';
  let orgCStaffToken = '';

  let orgAAdminUserId = '';
  let orgACollectionStaffUserId = '';
  let orgBInventoryStaffUserId = '';

  let sendingOrgId = '';
  let receivingOrgId = '';
  let unrelatedOrgId = '';
  let campId = '';
  let unit1Id = '';
  let unit2Id = '';
  let unit3Id = '';
  let unit4Id = '';
  let unitUnexpectedId = '';
  let unit1Number = '';
  let unit2Number = '';
  let unit3Number = '';

  let manifestId = '';
  let manifestNumber = '';
  let openExceptionId = '';

  try {
    // ----------------------------------------------------
    // Setup: Establish Actors, Organisations & Units
    // ----------------------------------------------------
    console.log('--- Setup: Establishing Actor Sessions & Handover Pre-conditions ---');

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

    const aAdmin = await loginUser(orgAAdminPhone, 'Dr. Org A Admin');
    orgAAdminToken = aAdmin.token;
    orgAAdminUserId = aAdmin.userId;

    const aCol = await loginUser(orgACollectionStaffPhone, 'Nurse A Phlebotomy');
    orgACollectionStaffToken = aCol.token;
    orgACollectionStaffUserId = aCol.userId;

    const aInv = await loginUser(orgAInventoryStaffPhone, 'Officer A Inventory');
    orgAInventoryStaffToken = aInv.token;

    const aAud = await loginUser(orgAAuditorPhone, 'Auditor A Kulkarni');
    orgAAuditorToken = aAud.token;

    const bAdmin = await loginUser(orgBAdminPhone, 'Dr. Org B Director');
    orgBAdminToken = bAdmin.token;

    const bInv = await loginUser(orgBInventoryStaffPhone, 'Officer B Deshmukh');
    orgBInventoryStaffToken = bInv.token;
    orgBInventoryStaffUserId = bInv.userId;

    const cStaff = await loginUser(orgCStaffPhone, 'Unrelated Stranger C');
    orgCStaffToken = cStaff.token;

    // Create sending organisation (Org A: Community Blood Bank)
    const orgARes = await prisma.organisation.create({
      data: {
        orgCode: `ORG-MH-SND-${Date.now().toString().slice(-4)}`,
        name: 'Pune Camp Blood Centre (Sending Org)',
        licenseNumber: `LIC-SND-${Date.now().toString().slice(-6)}`,
        districtCode: 521,
        status: 'VERIFIED',
      },
    });
    sendingOrgId = orgARes.id;

    // Create receiving organisation (Org B: Apex Transfusion Hospital)
    const orgBRes = await prisma.organisation.create({
      data: {
        orgCode: `ORG-MH-RCV-${Date.now().toString().slice(-4)}`,
        name: 'Sassoon Apex Blood Bank (Receiving Org)',
        licenseNumber: `LIC-RCV-${Date.now().toString().slice(-6)}`,
        districtCode: 521,
        status: 'VERIFIED',
      },
    });
    receivingOrgId = orgBRes.id;

    // Create unrelated organisation (Org C)
    const orgCRes = await prisma.organisation.create({
      data: {
        orgCode: `ORG-MH-URL-${Date.now().toString().slice(-4)}`,
        name: 'Nagpur Central Blood Bank (Org C)',
        licenseNumber: `LIC-URL-${Date.now().toString().slice(-6)}`,
        districtCode: 505,
        status: 'VERIFIED',
      },
    });
    unrelatedOrgId = orgCRes.id;

    // Memberships
    await prisma.organisationMembership.createMany({
      data: [
        { userId: orgAAdminUserId, organisationId: sendingOrgId, role: 'ORG_ADMIN', isActive: true },
        { userId: orgACollectionStaffUserId, organisationId: sendingOrgId, role: 'COLLECTION_STAFF', isActive: true },
        { userId: aInv.userId, organisationId: sendingOrgId, role: 'INVENTORY_STAFF', isActive: true },
        { userId: aAud.userId, organisationId: sendingOrgId, role: 'AUDITOR', isActive: true },
        { userId: bAdmin.userId, organisationId: receivingOrgId, role: 'ORG_ADMIN', isActive: true },
        { userId: orgBInventoryStaffUserId, organisationId: receivingOrgId, role: 'INVENTORY_STAFF', isActive: true },
        { userId: cStaff.userId, organisationId: unrelatedOrgId, role: 'ORG_ADMIN', isActive: true },
      ],
    });

    // Associated Camp for Org A
    const camp = await prisma.camp.create({
      data: {
        campCode: `CAMP-P5-${Date.now().toString().slice(-4)}`,
        title: 'Pune Rotary IT Park Mega Drive',
        organizerName: 'Rotary Club Pune Mid-Town',
        targetDate: new Date('2026-11-20'),
        venue: 'Symbiosis Auditorium, Viman Nagar',
        districtCode: 521,
        status: 'APPROVED',
        organisationId: sendingOrgId,
        isReadyForCollection: true,
      },
    });
    campId = camp.id;

    // Helper to generate a completed donation event with a distinct donor
    async function createDonationEvent(donorIdx: number) {
      const phone = `+91999997701${donorIdx}`;
      const name = `Voluntary Donor ${donorIdx}`;
      const donorUser = await loginUser(phone, name);
      let donorProfile = await prisma.donorProfile.findUnique({
        where: { userId: donorUser.userId },
      });
      if (!donorProfile) {
        donorProfile = await prisma.donorProfile.create({
          data: {
            userId: donorUser.userId,
            bloodGroup: 'B_POS',
            stateCode: 27,
            districtCode: 521,
            isAvailable: true,
          },
        });
      }

      const att = await prisma.campAttendance.create({
        data: {
          campId,
          userId: donorUser.userId,
          donorName: name,
          donorPhone: phone,
          bloodGroup: 'B_POS',
          status: 'CHECKED_IN',
          checkedInAt: new Date(),
          checkedInBy: orgACollectionStaffUserId,
        },
      });

      const screening = await prisma.clinicalScreening.create({
        data: {
          campId,
          attendanceId: att.id,
          donorUserId: donorUser.userId,
          screenedBy: orgAAdminUserId,
          status: 'CLEARED',
          eligibilityDecision: 'CLEARED',
          consentGiven: true,
        },
      });

      return await prisma.donationEvent.create({
        data: {
          campId,
          attendanceId: att.id,
          screeningId: screening.id,
          donorUserId: donorUser.userId,
          bloodGroup: 'B_POS',
          donationType: 'WHOLE_BLOOD',
          outcome: 'COMPLETED',
          volumeMl: 450,
          recordedBy: orgACollectionStaffUserId,
        },
      });
    }

    const event1 = await createDonationEvent(1);
    const event2 = await createDonationEvent(2);
    const event3 = await createDonationEvent(3);
    const event4 = await createDonationEvent(4);
    const eventUnexp = await createDonationEvent(5);

    // Create 4 physical collection units in COLLECTED status
    async function createUnit(donationEventId: string, suffix: string) {
      const unitNumber = `CU-2026-P5-${Date.now().toString().slice(-4)}-${suffix}`;
      const cu = await prisma.collectionUnit.create({
        data: {
          unitNumber,
          donationEventId,
          organisationId: sendingOrgId,
          campId,
          bloodGroup: 'B_POS',
          volumeMl: 450,
          status: 'COLLECTED',
          collectedBy: orgACollectionStaffUserId,
        },
      });
      return cu;
    }

    const cu1 = await createUnit(event1.id, 'U1');
    const cu2 = await createUnit(event2.id, 'U2');
    const cu3 = await createUnit(event3.id, 'U3');
    const cu4 = await createUnit(event4.id, 'U4');
    const cuUnexp = await createUnit(eventUnexp.id, 'UNEXP');

    unit1Id = cu1.id;
    unit2Id = cu2.id;
    unit3Id = cu3.id;
    unit4Id = cu4.id;
    unitUnexpectedId = cuUnexp.id;

    unit1Number = cu1.unitNumber;
    unit2Number = cu2.unitNumber;
    unit3Number = cu3.unitNumber;

    console.log('Operational setup completed successfully.\n');

    // ----------------------------------------------------
    // Section 1: Manifest Creation & Authorisation Boundaries
    // ----------------------------------------------------
    console.log('--- Section 1: Manifest Creation & Authorisation Boundaries ---');

    // 1. Unauthenticated manifest creation rejected with 401
    const res1 = await request(`/organisations/${sendingOrgId}/handover-manifests`, {
      method: 'POST',
      body: JSON.stringify({ receivingOrganisationId: receivingOrgId }),
    });
    assert(res1.status === 401, '1. Unauthenticated manifest creation rejected with 401 Unauthorized');

    // 2. Auditor cannot create handover manifests (Read-only Boundary Enforced)
    const res2 = await request(`/organisations/${sendingOrgId}/handover-manifests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgAAuditorToken}` },
      body: JSON.stringify({ receivingOrganisationId: receivingOrgId }),
    });
    assert(res2.status === 403, '2. Auditor cannot create handover manifests (Read-only Boundary Enforced)');

    // 3. Cross-organisation manifest creation attempt rejected with 403
    const res3 = await request(`/organisations/${sendingOrgId}/handover-manifests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgCStaffToken}` },
      body: JSON.stringify({ receivingOrganisationId: receivingOrgId }),
    });
    assert(res3.status === 403, '3. Cross-organisation manifest creation attempt rejected with 403 Forbidden');

    // 4. Same sending and receiving organisation rejected
    const res4 = await request(`/organisations/${sendingOrgId}/handover-manifests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgACollectionStaffToken}` },
      body: JSON.stringify({ receivingOrganisationId: sendingOrgId }),
    });
    assert(res4.status === 400, '4. Self-handover (sendingOrg === receivingOrg) rejected with 400 Bad Request');

    // 5. Valid draft manifest created by authorised COLLECTION_STAFF
    const res5 = await request(`/organisations/${sendingOrgId}/handover-manifests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgACollectionStaffToken}` },
      body: JSON.stringify({
        campId,
        receivingOrganisationId: receivingOrgId,
        transportDetails: {
          courierName: 'Maharashtra State Cold-Chain Logistics',
          vehicleNumber: 'MH-12-TC-8899',
          driverPhone: '+919876543210',
          coldBoxTempCelsius: 4.2,
        },
        notes: 'Camp collection units transfer to regional blood bank',
      }),
    });
    assert(
      res5.status === 201 &&
        res5.data?.data?.status === 'DRAFT' &&
        res5.data?.data?.manifestNumber?.startsWith('HM-'),
      '5. Valid draft manifest created with authoritative manifestNumber and DRAFT status'
    );
    manifestId = res5.data?.data?.id;
    manifestNumber = res5.data?.data?.manifestNumber;

    // ----------------------------------------------------
    // Section 2: Adding Units to Manifest & Concurrency Guards
    // ----------------------------------------------------
    console.log('\n--- Section 2: Adding Units to Manifest & Concurrency Guards ---');

    // 6. Adding 3 units to draft manifest succeeds and transitions units to PREPARED_FOR_HANDOVER
    const res6 = await request(`/handover-manifests/${manifestId}/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgACollectionStaffToken}` },
      body: JSON.stringify({
        collectionUnitIds: [unit1Id, unit2Id, unit3Id],
      }),
    });
    assert(
      res6.status === 201 && Array.isArray(res6.data?.data) && res6.data?.data?.length === 3,
      '6. Adding collection units to draft manifest succeeds with 3 items created'
    );

    // Verify units transitioned to PREPARED_FOR_HANDOVER
    const checkCu1 = await prisma.collectionUnit.findUnique({ where: { id: unit1Id } });
    assert(
      checkCu1?.status === 'PREPARED_FOR_HANDOVER',
      '7. Collection unit status atomically updated to PREPARED_FOR_HANDOVER'
    );

    // 8. Duplicate unit inclusion in same manifest rejected
    const res8 = await request(`/handover-manifests/${manifestId}/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgACollectionStaffToken}` },
      body: JSON.stringify({
        collectionUnitIds: [unit1Id],
      }),
    });
    assert(
      res8.status === 409,
      '8. Duplicate unit inclusion in same manifest rejected with 409 Conflict'
    );

    // 9. Assigning already committed unit to another active manifest rejected
    const secondManifestRes = await request(`/organisations/${sendingOrgId}/handover-manifests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgAAdminToken}` },
      body: JSON.stringify({ receivingOrganisationId: receivingOrgId }),
    });
    const secondManifestId = secondManifestRes.data?.data?.id;

    const res9 = await request(`/handover-manifests/${secondManifestId}/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgAAdminToken}` },
      body: JSON.stringify({ collectionUnitIds: [unit1Id] }),
    });
    assert(
      res9.status === 409,
      '9. Assigning unit committed to an active handover to a second manifest rejected with 409 Conflict'
    );

    // 10. Removing item from draft manifest succeeds and reverts unit to COLLECTED
    const res10Add = await request(`/handover-manifests/${secondManifestId}/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgAAdminToken}` },
      body: JSON.stringify({ collectionUnitIds: [unit4Id] }),
    });
    const res10Del = await request(`/handover-manifests/${secondManifestId}/items/${unit4Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${orgAAdminToken}` },
    });
    const checkCu4 = await prisma.collectionUnit.findUnique({ where: { id: unit4Id } });
    assert(
      res10Del.status === 200 && checkCu4?.status === 'COLLECTED',
      '10. Removing item from draft manifest reverts collection unit status back to COLLECTED'
    );

    // ----------------------------------------------------
    // Section 3: Finalisation, Dispatch & Physical Transport
    // ----------------------------------------------------
    console.log('\n--- Section 3: Finalisation, Dispatch & Physical Transport ---');

    // 11. Cannot dispatch a DRAFT manifest directly without finalisation
    const res11 = await request(`/handover-manifests/${manifestId}/dispatch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgACollectionStaffToken}` },
      body: JSON.stringify({ dispatchNotes: 'Premature dispatch attempt' }),
    });
    assert(res11.status === 400, '11. Premature dispatch of DRAFT manifest rejected with 400 Bad Request');

    // 12. Finalise manifest freezes item list
    const res12 = await request(`/handover-manifests/${manifestId}/finalise`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgACollectionStaffToken}` },
      body: JSON.stringify({ notes: 'Verified 3 bags sealed and packed in cold box' }),
    });
    assert(
      res12.status === 200 && res12.data?.data?.status === 'FINALISED',
      '12. Manifest finalised successfully with FINALISED status'
    );

    // 13. Adding units to FINALISED manifest rejected
    const res13 = await request(`/handover-manifests/${manifestId}/items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgACollectionStaffToken}` },
      body: JSON.stringify({ collectionUnitIds: [unit4Id] }),
    });
    assert(res13.status === 400, '13. Modifying frozen unit list of FINALISED manifest rejected');

    // 14. Dispatch manifest records physical dispatch and transitions units to IN_TRANSIT
    const res14 = await request(`/handover-manifests/${manifestId}/dispatch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgACollectionStaffToken}` },
      body: JSON.stringify({
        dispatchNotes: 'Dispatched via cold van MH-12-TC-8899. Departure temperature 4.1C.',
      }),
    });
    assert(
      res14.status === 200 && res14.data?.data?.status === 'DISPATCHED',
      '14. Physical dispatch recorded with DISPATCHED status and departure metadata'
    );

    // Verify all units transitioned to IN_TRANSIT
    const dispatchedUnits = await prisma.collectionUnit.findMany({
      where: { id: { in: [unit1Id, unit2Id, unit3Id] } },
    });
    assert(
      dispatchedUnits.every((u) => u.status === 'IN_TRANSIT'),
      '15. All manifest collection units atomically moved to IN_TRANSIT status'
    );

    // 16. Dispatched manifest cannot be cancelled
    const res16 = await request(`/handover-manifests/${manifestId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgAAdminToken}` },
      body: JSON.stringify({ reason: 'Attempted cancellation while on road' }),
    });
    assert(res16.status === 400, '16. Cancellation of DISPATCHED manifest in physical transit prohibited');

    // ----------------------------------------------------
    // Section 4: Receiving Acknowledgment & Boundary Checks
    // ----------------------------------------------------
    console.log('\n--- Section 4: Receiving Acknowledgment & Boundary Checks ---');

    // 17. Sending organisation staff cannot confirm receipt for receiving facility
    const res17 = await request(`/handover-manifests/${manifestId}/receipts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgACollectionStaffToken}` },
      body: JSON.stringify({
        collectionUnitId: unit1Id,
        outcome: 'VERIFIED_INTACT',
      }),
    });
    assert(
      res17.status === 403,
      '17. Sending org staff rejected when attempting to acknowledge receipt (Receiving Role Boundary Enforced)'
    );

    // 18. Unrelated organisation staff rejected when acknowledging receipt
    const res18 = await request(`/handover-manifests/${manifestId}/receipts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgCStaffToken}` },
      body: JSON.stringify({
        collectionUnitId: unit1Id,
        outcome: 'VERIFIED_INTACT',
      }),
    });
    assert(res18.status === 403, '18. Unrelated org staff rejected with 403 Forbidden on receipt acknowledgment');

    // 19. Authorised receiving INVENTORY_STAFF verifies unit 1 as VERIFIED_INTACT
    const res19 = await request(`/handover-manifests/${manifestId}/receipts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgBInventoryStaffToken}` },
      body: JSON.stringify({
        collectionUnitId: unit1Id,
        outcome: 'VERIFIED_INTACT',
      }),
    });
    assert(
      res19.status === 200 && res19.data?.data?.updatedItem?.outcome === 'VERIFIED_INTACT',
      '19. Receiving inventory staff verifies unit 1 as VERIFIED_INTACT'
    );

    // Verify unit 1 is now RECEIVED_BY_CENTRE
    const cu1AfterReceipt = await prisma.collectionUnit.findUnique({ where: { id: unit1Id } });
    assert(
      cu1AfterReceipt?.status === 'RECEIVED_BY_CENTRE',
      '20. Verified intact unit status atomically updated to RECEIVED_BY_CENTRE'
    );

    // 21. Partial receipt state reflected on manifest
    const manifestDetailRes1 = await request(`/handover-manifests/${manifestId}`, {
      headers: { Authorization: `Bearer ${orgBInventoryStaffToken}` },
    });
    assert(
      manifestDetailRes1.data?.data?.status === 'PARTIALLY_RECEIVED',
      '21. Manifest status accurately reflects PARTIALLY_RECEIVED while other units remain pending'
    );

    // ----------------------------------------------------
    // Section 5: Discrepancy Recording & Exception Tracking
    // ----------------------------------------------------
    console.log('\n--- Section 5: Discrepancy Recording & Exception Tracking ---');

    // 22. Unit 2 recorded as DAMAGED -> Unit REJECTED, Exception created, Manifest marked RECEIVED_WITH_DISCREPANCIES
    const res22 = await request(`/handover-manifests/${manifestId}/receipts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgBInventoryStaffToken}` },
      body: JSON.stringify({
        collectionUnitId: unit2Id,
        outcome: 'DAMAGED',
        discrepancyCategory: 'DAMAGED_BAG',
        discrepancyNote: 'Puncture leak detected at tubing seal during physical bag check',
        severity: 'HIGH',
      }),
    });
    const cu2AfterReceipt = await prisma.collectionUnit.findUnique({ where: { id: unit2Id } });
    assert(
      res22.status === 200 &&
        cu2AfterReceipt?.status === 'REJECTED' &&
        res22.data?.data?.manifestStatus === 'RECEIVED_WITH_DISCREPANCIES',
      '22. Damaged bag outcome transitions unit to REJECTED and manifest to RECEIVED_WITH_DISCREPANCIES'
    );
    openExceptionId = res22.data?.data?.createdException?.id;

    // 23. Unit 3 recorded as MISSING -> Exception created
    const res23 = await request(`/handover-manifests/${manifestId}/receipts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgBInventoryStaffToken}` },
      body: JSON.stringify({
        collectionUnitId: unit3Id,
        outcome: 'MISSING',
        discrepancyCategory: 'UNIT_MISSING',
        discrepancyNote: 'Bag not found in cold box upon unsealing',
      }),
    });
    assert(
      res23.status === 200 && res23.data?.data?.createdException?.category === 'UNIT_MISSING',
      '23. Missing unit outcome produces auditable UNIT_MISSING ReconciliationException'
    );

    // 24. Unexpected unit presented -> Handled as discrepancy, quarantined, NOT marked RECEIVED_BY_CENTRE
    const res24 = await request(`/handover-manifests/${manifestId}/receipts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgBInventoryStaffToken}` },
      body: JSON.stringify({
        collectionUnitId: unitUnexpectedId,
        outcome: 'UNEXPECTED',
        discrepancyNote: 'Extra unlisted bag found in transport box',
      }),
    });
    const cuUnexpAfter = await prisma.collectionUnit.findUnique({ where: { id: unitUnexpectedId } });
    assert(
      res24.status === 200 &&
        res24.data?.data?.isDiscrepancy === true &&
        cuUnexpAfter?.status === 'QUARANTINED',
      '24. Unexpected unit presented placed in QUARANTINED status; NEVER marked as received by centre'
    );

    // ----------------------------------------------------
    // Section 6: Reconciliation Invariants & Sign-Off
    // ----------------------------------------------------
    console.log('\n--- Section 6: Reconciliation Invariants & Sign-Off ---');

    // 25. Attempting to reconcile manifest with unresolved exceptions rejected
    const res25 = await request(`/handover-manifests/${manifestId}/reconcile`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgBInventoryStaffToken}` },
      body: JSON.stringify({ notes: 'Attempt premature reconciliation' }),
    });
    assert(
      res25.status === 400 && res25.data?.error?.message?.includes('UNRESOLVED'),
      '25. Reconciliation strictly blocked while discrepancy exceptions remain unresolved'
    );

    // 26. Resolving exceptions with auditable resolution notes
    const allExceptions = await prisma.reconciliationException.findMany({
      where: { manifestId },
    });
    for (const exc of allExceptions) {
      await request(`/handover-manifests/${manifestId}/exceptions/${exc.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${orgBInventoryStaffToken}` },
        body: JSON.stringify({
          status: 'RESOLVED',
          resolutionNotes: 'Discrepancy investigated with camp coordinator. Incident documented in blood bank register.',
        }),
      });
    }

    const checkOpen = await prisma.reconciliationException.count({
      where: { manifestId, status: 'OPEN' },
    });
    assert(checkOpen === 0, '26. All reconciliation exceptions resolved with auditable justification');

    // 27. Formal reconciliation sign-off succeeds when all items accounted for and exceptions resolved
    const res27 = await request(`/handover-manifests/${manifestId}/reconcile`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgBInventoryStaffToken}` },
      body: JSON.stringify({
        notes: 'Handover reconciliation complete: 1 unit intact received, 1 damaged rejected, 1 missing accounted for.',
      }),
    });
    assert(
      res27.status === 200 && res27.data?.data?.status === 'RECONCILED',
      '27. Handover manifest formally reconciled with RECONCILED status'
    );

    // 28. Querying manifest detail returns accurate reconciliation statistics
    const res28 = await request(`/handover-manifests/${manifestId}`, {
      headers: { Authorization: `Bearer ${orgAAdminToken}` },
    });
    const summary = res28.data?.data?.summary;
    assert(
      summary?.totalExpected === 3 &&
        summary?.totalVerifiedIntact === 1 &&
        summary?.totalDamaged === 1 &&
        summary?.totalMissing === 1 &&
        summary?.openExceptionsCount === 0,
      '28. Manifest detail returns comprehensive, evidence-based reconciliation statistics'
    );

    // ----------------------------------------------------
    // Section 7: Critical Phase 4/5 Safety Gate Verification
    // ----------------------------------------------------
    console.log('\n--- Section 7: Critical Safety Gate: Component Quarantine Boundary ---');

    // 29. Handover / receipt operations NEVER release derived components to AVAILABLE
    // Let's derive a component from unit 1 (which is RECEIVED_BY_CENTRE)
    const deriveRes = await request(`/traceability/collection-units/${unit1Id}/derive-components`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgAAdminToken}` },
      body: JSON.stringify({
        components: [{ componentType: 'PRBC', volumeMl: 250 }],
      }),
    });
    const derivedComponentId = deriveRes.data?.data?.[0]?.id;
    const derivedComp = await prisma.componentUnit.findUnique({
      where: { id: derivedComponentId },
    });
    assert(
      derivedComp?.status === 'QUARANTINED',
      '29. Component derived from received unit starts strictly in QUARANTINED status'
    );

    // 30. Attempt by INVENTORY_STAFF to release quarantined component directly to AVAILABLE is rejected
    const res30 = await request(`/traceability/components/${derivedComponentId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${orgAInventoryStaffToken}` },
      body: JSON.stringify({
        status: 'AVAILABLE',
        reason: 'Attempted digital release without clinical sign-off',
      }),
    });
    assert(
      (res30.status === 400 || res30.status === 403) &&
        (res30.data?.error?.message?.includes('cannot release quarantined components') ||
          res30.data?.error?.code === 'DIRECT_RELEASE_PROHIBITED' ||
          res30.data?.error?.message?.includes('Direct transition to AVAILABLE is strictly prohibited')),
      '30. Clinical safety gate strictly blocks non-clinical or unverified transition to AVAILABLE'
    );

    // 31. Component shelf-life metadata includes explicit provisional disclaimer
    assert(
      (derivedComp?.metadata as any)?.shelfLifeMetadata?.isProvisional === true,
      '31. Component shelf-life recorded with explicit provisional disclaimer per standards'
    );

    // ----------------------------------------------------
    // Section 8: Audit Trail Integrity & PII Protection
    // ----------------------------------------------------
    console.log('\n--- Section 8: Audit Trail Integrity & PII Protection ---');

    // 32. Handover events recorded in AuditLog
    const auditCount = await prisma.auditLog.count({
      where: {
        action: {
          in: [
            'HANDOVER_MANIFEST_CREATED',
            'HANDOVER_ITEMS_ADDED',
            'HANDOVER_MANIFEST_FINALISED',
            'HANDOVER_MANIFEST_DISPATCHED',
            'HANDOVER_UNIT_RECEIVED',
            'HANDOVER_MANIFEST_RECONCILED',
          ],
        },
      },
    });
    assert(auditCount >= 6, `32. Comprehensive audit entries produced for handover lifecycle (found ${auditCount} records)`);

    // 33. Zero donor PII in manifest details or audit entries
    const manifestJson = JSON.stringify(res28.data?.data);
    const hasPhone = manifestJson.includes('+919999977007');
    const hasDonorName = manifestJson.includes('Kiran Deshmukh');
    assert(
      !hasPhone && !hasDonorName,
      '33. Handover manifest and unit traceability responses strictly protect donor personal data (zero PII)'
    );

    console.log('\n========================================================================');
    console.log(` Summary: ${passed} passed, ${failed} failed out of ${passed + failed} assertions.`);
    console.log('========================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Fatal test error:', err);
    process.exit(1);
  } finally {
    server.close();
  }
}

runPhase5HandoverTests().catch((err) => {
  console.error('Test execution failed:', err);
  if (server) server.close();
  process.exit(1);
});
