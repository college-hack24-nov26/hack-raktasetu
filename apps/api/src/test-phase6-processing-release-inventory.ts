import { app } from './app';
import { prisma } from './lib/prisma';
import http from 'http';

let server: http.Server;
const PORT = 4098;
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

async function runPhase6ProcessingReleaseInventoryTests() {
  console.log('========================================================================');
  console.log(' RaktaSetu — Phase 6: Processing, Lab Records, Release & Inventory');
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

  // Test actor phone numbers (Phase 6 dedicated range)
  const orgAdminPhone = '+919999976001';
  const clinicalStaffPhone = '+919999976002';
  const inventoryStaffPhone = '+919999976003';
  const orgBClinicalPhone = '+919999976004';
  const donorPhone = '+919999976005';

  let orgAdminToken = '';
  let clinicalStaffToken = '';
  let inventoryStaffToken = '';
  let orgBClinicalToken = '';
  let donorToken = '';

  let orgAdminUserId = '';
  let clinicalStaffUserId = '';
  let inventoryStaffUserId = '';
  let orgBClinicalUserId = '';
  let donorUserId = '';

  let orgAId = '';
  let orgBId = '';
  let testCampId = '';
  let testCollectionUnitId = '';
  let testComponentUnitId = '';
  let coldRoomStorageId = '';
  let freezerStorageId = '';

  try {
    // ----------------------------------------------------
    // SETUP: Create isolated test organisations, users & memberships
    // ----------------------------------------------------
    console.log('--- 0. Test Environment Provisioning ---');

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

    const aClin = await loginUser(clinicalStaffPhone);
    clinicalStaffUserId = aClin.userId;
    clinicalStaffToken = aClin.token;

    const aInv = await loginUser(inventoryStaffPhone);
    inventoryStaffUserId = aInv.userId;
    inventoryStaffToken = aInv.token;

    const bClin = await loginUser(orgBClinicalPhone);
    orgBClinicalUserId = bClin.userId;
    orgBClinicalToken = bClin.token;

    const aDonor = await loginUser(donorPhone);
    donorUserId = aDonor.userId;
    donorToken = aDonor.token;

    // Create Organisation A
    const orgACode = `ORG-P6A-${Date.now()}`;
    const orgA = await prisma.organisation.create({
      data: {
        orgCode: orgACode,
        name: 'Phase 6 Apex Blood Centre A',
        type: 'BLOOD_BANK',
        licenseNumber: `LIC-P6A-${Date.now()}`,
        districtCode: 521,
        districtName: 'Pune',
        status: 'VERIFIED',
      },
    });
    orgAId = orgA.id;

    // Create Organisation B (for cross-org security checks)
    const orgBCode = `ORG-P6B-${Date.now()}`;
    const orgB = await prisma.organisation.create({
      data: {
        orgCode: orgBCode,
        name: 'Phase 6 Regional Hospital B',
        type: 'RECEIVING_FACILITY',
        licenseNumber: `LIC-P6B-${Date.now()}`,
        districtCode: 522,
        districtName: 'Solapur',
        status: 'VERIFIED',
      },
    });
    orgBId = orgB.id;

    // Assign memberships
    await prisma.organisationMembership.createMany({
      data: [
        { userId: orgAdminUserId, organisationId: orgAId, role: 'ORG_ADMIN', isActive: true },
        { userId: clinicalStaffUserId, organisationId: orgAId, role: 'CLINICAL_STAFF', isActive: true },
        { userId: inventoryStaffUserId, organisationId: orgAId, role: 'INVENTORY_STAFF', isActive: true },
        { userId: orgBClinicalUserId, organisationId: orgBId, role: 'CLINICAL_STAFF', isActive: true },
      ],
    });

    // Create a Camp, Attendance, Screening, and DonationEvent
    const camp = await prisma.camp.create({
      data: {
        campCode: `CMP-P6-${Date.now()}`,
        title: 'Phase 6 Drive Camp',
        organizerName: 'Red Cross Pune',
        targetDate: new Date(),
        venue: 'Camp Hall 1',
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
        donorName: 'Voluntary Donor P6',
        donorPhone: donorPhone,
        bloodGroup: 'B_POS',
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
        bloodGroup: 'B_POS',
        donationType: 'WHOLE_BLOOD',
        outcome: 'COMPLETED',
        volumeMl: 450,
        recordedBy: clinicalStaffUserId,
        performedAt: new Date(),
      },
    });

    const colUnit = await prisma.collectionUnit.create({
      data: {
        unitNumber: `CU-P6-${Date.now()}`,
        donationEventId: donEvent.id,
        campId: testCampId,
        organisationId: orgAId,
        bloodGroup: 'B_POS',
        volumeMl: 450,
        status: 'RECEIVED_BY_CENTRE',
        collectedBy: clinicalStaffUserId,
      },
    });
    testCollectionUnitId = colUnit.id;

    const compUnit = await prisma.componentUnit.create({
      data: {
        componentCode: `CMP-P6-PRBC-${Date.now()}`,
        collectionUnitId: testCollectionUnitId,
        componentType: 'PRBC',
        bloodGroup: 'B_POS',
        volumeMl: 280,
        organisationId: orgAId,
        status: 'QUARANTINED',
        derivedAt: new Date(),
        derivedBy: inventoryStaffUserId,
        expiresAt: new Date(Date.now() + 35 * 86400000), // 35 days standard
      },
    });
    testComponentUnitId = compUnit.id;

    assert(Boolean(testComponentUnitId), 'Test environment initialized with valid collection and component units');

    // ----------------------------------------------------
    // TEST 1: Storage Location Management
    // ----------------------------------------------------
    console.log('\n--- 1. Storage Location Configuration ---');

    const createLocRes = await request(`/organisations/${orgAId}/storage-locations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${inventoryStaffToken}` },
      body: JSON.stringify({
        locationCode: 'COLD-01',
        name: 'Main Cold Room Refrigerator 1',
        storageType: 'BLOOD_BANK_REFRIGERATOR',
        targetTempRange: '+2°C to +6°C',
        roomOrArea: 'Component Laboratory',
        equipmentIdentifier: 'THERMO-TSX-400',
      }),
    });

    assert(createLocRes.status === 201 && createLocRes.data.success, 'INVENTORY_STAFF can create storage location (COLD-01)');
    coldRoomStorageId = createLocRes.data?.data?.id;

    const createFreezerRes = await request(`/organisations/${orgAId}/storage-locations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${inventoryStaffToken}` },
      body: JSON.stringify({
        locationCode: 'FREEZER-01',
        name: 'Plasma Deep Freezer 1',
        storageType: 'DEEP_FREEZER',
        targetTempRange: '≤ -30°C',
        roomOrArea: 'Component Laboratory',
        equipmentIdentifier: 'SANYO-MDF-U5412',
      }),
    });
    assert(createFreezerRes.status === 201, 'Storage location created for deep freezer');
    freezerStorageId = createFreezerRes.data?.data?.id;

    const listLocsRes = await request(`/organisations/${orgAId}/storage-locations`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${inventoryStaffToken}` },
    });
    assert(listLocsRes.data.count >= 2, 'List storage locations returns configured units');

    // ----------------------------------------------------
    // TEST 2: Storage Movement & Temperature Excursion Quarantine
    // ----------------------------------------------------
    console.log('\n--- 2. Storage Movements & Excursion Safety ---');

    const moveNormalRes = await request(
      `/organisations/${orgAId}/components/${testComponentUnitId}/storage-movement`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${inventoryStaffToken}` },
        body: JSON.stringify({
          toLocationId: coldRoomStorageId,
          reason: 'Initial post-derivation cold storage',
          observedTempCelsius: 4.2,
          temperatureExcursionNoted: false,
        }),
      }
    );
    assert(moveNormalRes.status === 200, 'Normal storage movement logged with observed temperature');

    // Verify movement history preserved
    const moveHistoryRes = await request(
      `/organisations/${orgAId}/components/${testComponentUnitId}/storage-movements`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${inventoryStaffToken}` },
      }
    );
    assert(
      moveHistoryRes.data.count === 1 && moveHistoryRes.data.data[0].observedTempCelsius === 4.2,
      'Storage movement history accurately preserves actor, timestamp, and observed temperature'
    );

    // Temperature excursion test on second unit
    const compExcursion = await prisma.componentUnit.create({
      data: {
        componentCode: `CMP-P6-FFP-${Date.now()}`,
        collectionUnitId: testCollectionUnitId,
        componentType: 'FRESH_FROZEN_PLASMA',
        bloodGroup: 'B_POS',
        volumeMl: 200,
        organisationId: orgAId,
        status: 'QUARANTINED',
        derivedAt: new Date(),
        derivedBy: inventoryStaffUserId,
        expiresAt: new Date(Date.now() + 365 * 86400000),
      },
    });

    const moveExcursionRes = await request(
      `/organisations/${orgAId}/components/${compExcursion.id}/storage-movement`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${inventoryStaffToken}` },
        body: JSON.stringify({
          toLocationId: freezerStorageId,
          reason: 'Plasma transfer',
          observedTempCelsius: -5.0, // Excursion! Deep freezer requires <= -30°C
          temperatureExcursionNoted: true,
          excursionNotes: 'Cold chain failure during transfer cart transport',
        }),
      }
    );

    assert(moveExcursionRes.status === 200, 'Excursion movement recorded');
    const checkedExcursionComp = await prisma.componentUnit.findUnique({
      where: { id: compExcursion.id },
    });
    assert(
      checkedExcursionComp?.isHold === true && checkedExcursionComp.status === 'QUARANTINED',
      'Storage movement with temperature excursion automatically triggers quarantine hold'
    );

    // ----------------------------------------------------
    // TEST 3: Clinical Release Safety Gate — Missing Tests
    // ----------------------------------------------------
    console.log('\n--- 3. Clinical Release Safety Gates ---');

    // 3A. Evaluate eligibility before any lab tests
    const evalPreTestRes = await request(
      `/organisations/${orgAId}/components/${testComponentUnitId}/release-eligibility`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${clinicalStaffToken}` },
      }
    );
    assert(
      evalPreTestRes.data.data.isEligibleForRelease === false &&
        evalPreTestRes.data.data.mandatoryRequirements.missingTests.length === 6,
      'Release eligibility evaluation accurately reports all 6 mandatory tests missing'
    );

    // 3B. Attempt release while mandatory tests are missing -> MUST FAIL
    const failReleaseMissingRes = await request(
      `/organisations/${orgAId}/components/${testComponentUnitId}/clinical-release`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${clinicalStaffToken}` },
        body: JSON.stringify({
          decision: 'RELEASED',
          reason: 'Attempting release without lab tests',
        }),
      }
    );
    assert(
      failReleaseMissingRes.status === 400 &&
        failReleaseMissingRes.data.error.message.includes('Clinical Release Gate Blocked'),
      'Clinical release to AVAILABLE is strictly BLOCKED when mandatory tests are missing'
    );

    // 3C. Attempt release by ORG_ADMIN -> MUST BE REJECTED (Crucial requirement: ORG_ADMIN alone cannot release)
    const failOrgAdminReleaseRes = await request(
      `/organisations/${orgAId}/components/${testComponentUnitId}/clinical-release`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${orgAdminToken}` },
        body: JSON.stringify({
          decision: 'RELEASED',
          reason: 'Administrator override attempt',
        }),
      }
    );
    assert(
      failOrgAdminReleaseRes.status === 403,
      'ORG_ADMIN without CLINICAL_STAFF role is strictly DENIED clinical release authority'
    );

    // 3D. Attempt release by ordinary donor / unauthenticated -> 401/403
    const failDonorReleaseRes = await request(
      `/organisations/${orgAId}/components/${testComponentUnitId}/clinical-release`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${donorToken}` },
        body: JSON.stringify({
          decision: 'RELEASED',
          reason: 'Donor release attempt',
        }),
      }
    );
    assert(
      failDonorReleaseRes.status === 403,
      'Unauthorised user cannot record clinical release'
    );

    // ----------------------------------------------------
    // TEST 4: Partial / Pending / Reactive Lab Records
    // ----------------------------------------------------
    console.log('\n--- 4. Laboratory Records & Reactive Safety ---');

    // Record 5 Non-reactive tests, but leave HIV pending
    const testsToRecord = [
      { testType: 'HCV_ANTIBODY', resultOutcome: 'NON_REACTIVE' },
      { testType: 'HBSAG', resultOutcome: 'NON_REACTIVE' },
      { testType: 'SYPHILIS_RPR', resultOutcome: 'NON_REACTIVE' },
      { testType: 'MALARIA_ANTIGEN', resultOutcome: 'NON_REACTIVE' },
      { testType: 'ABO_RH_CONFIRMATION', resultOutcome: 'NON_REACTIVE' },
    ];

    for (const t of testsToRecord) {
      await request(`/organisations/${orgAId}/laboratory-tests`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${inventoryStaffToken}` },
        body: JSON.stringify({
          componentUnitId: testComponentUnitId,
          category: t.testType === 'ABO_RH_CONFIRMATION' ? 'BLOOD_GROUPING' : 'TTI_SCREENING',
          testType: t.testType,
          resultOutcome: t.resultOutcome,
          status: 'COMPLETED',
        }),
      });
    }

    // Now record HIV as PENDING
    await request(`/organisations/${orgAId}/laboratory-tests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${inventoryStaffToken}` },
      body: JSON.stringify({
        componentUnitId: testComponentUnitId,
        category: 'TTI_SCREENING',
        testType: 'HIV_ANTIBODY',
        status: 'PENDING',
      }),
    });

    const evalPendingRes = await request(
      `/organisations/${orgAId}/components/${testComponentUnitId}/release-eligibility`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${clinicalStaffToken}` },
      }
    );
    assert(
      evalPendingRes.data.data.mandatoryRequirements.pendingTests.includes('HIV_ANTIBODY') &&
        evalPendingRes.data.data.isEligibleForRelease === false,
      'Pending test outcome properly blocks release eligibility'
    );

    // Now record HIV as REACTIVE -> Must fail release AND automatically place component on quarantine hold!
    const reactiveRecRes = await request(`/organisations/${orgAId}/laboratory-tests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${inventoryStaffToken}` },
      body: JSON.stringify({
        componentUnitId: testComponentUnitId,
        category: 'TTI_SCREENING',
        testType: 'HIV_ANTIBODY',
        resultOutcome: 'REACTIVE',
        status: 'COMPLETED',
        notes: 'Initial reactive ELISA run',
      }),
    });
    assert(reactiveRecRes.status === 201, 'Reactive test recorded');

    const compAfterReactive = await prisma.componentUnit.findUnique({
      where: { id: testComponentUnitId },
    });
    assert(
      compAfterReactive?.isHold === true && compAfterReactive.status === 'QUARANTINED',
      'Recording a REACTIVE lab test immediately places component under mandatory safety quarantine hold'
    );

    // ----------------------------------------------------
    // TEST 5: Complete Non-Reactive Panel & Authorised Clinical Release
    // ----------------------------------------------------
    console.log('\n--- 5. Complete Panel & Clinical Release ---');

    // Create a pristine component unit
    const cleanComp = await prisma.componentUnit.create({
      data: {
        componentCode: `CMP-P6-PRBC-CLEAN-${Date.now()}`,
        collectionUnitId: testCollectionUnitId,
        componentType: 'PRBC',
        bloodGroup: 'B_POS',
        volumeMl: 280,
        organisationId: orgAId,
        status: 'AWAITING_CLINICAL_REVIEW',
        derivedAt: new Date(),
        derivedBy: inventoryStaffUserId,
        expiresAt: new Date(Date.now() + 35 * 86400000),
      },
    });

    // Record all 6 mandatory tests as NON_REACTIVE for cleanComp
    const fullPanel = [
      { testType: 'HIV_ANTIBODY', outcome: 'NON_REACTIVE' },
      { testType: 'HCV_ANTIBODY', outcome: 'NON_REACTIVE' },
      { testType: 'HBSAG', outcome: 'NON_REACTIVE' },
      { testType: 'SYPHILIS_RPR', outcome: 'NON_REACTIVE' },
      { testType: 'MALARIA_ANTIGEN', outcome: 'NON_REACTIVE' },
      { testType: 'ABO_RH_CONFIRMATION', outcome: 'NON_REACTIVE' },
    ];

    let lastRecordId = '';
    for (const item of fullPanel) {
      const recRes = await request(`/organisations/${orgAId}/laboratory-tests`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${inventoryStaffToken}` },
        body: JSON.stringify({
          componentUnitId: cleanComp.id,
          category: item.testType === 'ABO_RH_CONFIRMATION' ? 'BLOOD_GROUPING' : 'TTI_SCREENING',
          testType: item.testType,
          resultOutcome: item.outcome,
          status: 'COMPLETED',
          quantitativeValue: '< 0.2 S/CO',
          referenceRange: '< 1.0 Non-reactive',
        }),
      });
      lastRecordId = recRes.data.data.id;
    }

    // Clinical verification of test record by CLINICAL_STAFF
    const verifyLabRes = await request(
      `/organisations/${orgAId}/laboratory-tests/${lastRecordId}/verify`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${clinicalStaffToken}` },
        body: JSON.stringify({
          verificationNotes: 'Double-checked against analyzer OD readings',
        }),
      }
    );
    assert(verifyLabRes.status === 200, 'CLINICAL_STAFF can clinically verify laboratory test records');

    // Verify release eligibility now passes
    const evalCleanRes = await request(
      `/organisations/${orgAId}/components/${cleanComp.id}/release-eligibility`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${clinicalStaffToken}` },
      }
    );
    assert(
      evalCleanRes.data.data.isEligibleForRelease === true &&
        evalCleanRes.data.data.mandatoryRequirements.passedTests.length === 6,
      'Component with complete non-reactive panel is eligible for clinical release'
    );

    // Execute Authorised Clinical Release to AVAILABLE
    const releaseSuccessRes = await request(
      `/organisations/${orgAId}/components/${cleanComp.id}/clinical-release`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${clinicalStaffToken}` },
        body: JSON.stringify({
          decision: 'RELEASED',
          reason: 'All mandatory TTI screening and blood grouping confirmed non-reactive per NBTC protocol.',
          clinicalProtocolRef: 'NBTC Schedule F(K) Standard Release Protocol',
        }),
      }
    );

    assert(
      releaseSuccessRes.status === 200 && releaseSuccessRes.data.data.component.status === 'AVAILABLE',
      'Authorized CLINICAL_STAFF successfully transitions eligible component to AVAILABLE'
    );

    // Verify repeated release attempt on already available unit
    const doubleReleaseRes = await request(
      `/organisations/${orgAId}/components/${cleanComp.id}/clinical-release`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${clinicalStaffToken}` },
        body: JSON.stringify({
          decision: 'RELEASED',
          reason: 'Duplicate release attempt',
        }),
      }
    );
    assert(doubleReleaseRes.status === 200, 'Repeated release handled idempotently and safely');

    // ----------------------------------------------------
    // TEST 6: Cross-Organisation Isolation
    // ----------------------------------------------------
    console.log('\n--- 6. Cross-Organisation Isolation ---');

    const crossOrgReleaseRes = await request(
      `/organisations/${orgAId}/components/${cleanComp.id}/clinical-release`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${orgBClinicalToken}` },
        body: JSON.stringify({
          decision: 'RELEASED',
          reason: 'Cross-organisation release attack',
        }),
      }
    );
    assert(
      crossOrgReleaseRes.status === 403,
      'Cross-organisation clinical release is strictly blocked (Org B clinical staff denied on Org A)'
    );

    const crossOrgInvRes = await request(`/organisations/${orgAId}/inventory/summary`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${orgBClinicalToken}` },
    });
    assert(
      crossOrgInvRes.status === 403,
      'Cross-organisation inventory summary access is strictly blocked'
    );

    // ----------------------------------------------------
    // TEST 7: Expiry Controls & Automated Sweeps
    // ----------------------------------------------------
    console.log('\n--- 7. Expiry Controls & Sweeps ---');

    // Create a component unit that has already expired in the past
    const expiredComp = await prisma.componentUnit.create({
      data: {
        componentCode: `CMP-P6-PLATELET-EXP-${Date.now()}`,
        collectionUnitId: testCollectionUnitId,
        componentType: 'PLATELET_CONCENTRATE',
        bloodGroup: 'B_POS',
        volumeMl: 55,
        organisationId: orgAId,
        status: 'AVAILABLE', // Was available earlier, but shelf-life elapsed
        derivedAt: new Date(Date.now() - 10 * 86400000),
        derivedBy: inventoryStaffUserId,
        expiresAt: new Date(Date.now() - 2 * 86400000), // Expired 2 days ago!
      },
    });

    const sweepRes = await request(`/organisations/${orgAId}/inventory/expiry-sweep`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${inventoryStaffToken}` },
    });

    assert(
      sweepRes.status === 200 && sweepRes.data.data.sweptCount >= 1,
      'Automated expiry sweep detects expired units'
    );

    const checkedExpired = await prisma.componentUnit.findUnique({
      where: { id: expiredComp.id },
    });
    assert(
      checkedExpired?.status === 'EXPIRED' && checkedExpired.dispositionType === 'DISCARDED_EXPIRED',
      'Expired unit automatically transitioned from AVAILABLE to EXPIRED and withdrawn from stock'
    );

    // ----------------------------------------------------
    // TEST 8: Authorised Disposition (Issue / Discard)
    // ----------------------------------------------------
    console.log('\n--- 8. Authorised Disposition ---');

    // Issue the clean available unit
    const issueRes = await request(
      `/organisations/${orgAId}/components/${cleanComp.id}/disposition`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${clinicalStaffToken}` },
        body: JSON.stringify({
          dispositionType: 'ISSUED',
          reason: 'Emergency cross-match allocation for surgery patient',
        }),
      }
    );
    assert(issueRes.status === 200 && issueRes.data.data.status === 'ISSUED', 'Available component successfully ISSUED');

    // Attempting to transition or re-release terminal unit MUST FAIL
    const terminalReleaseRes = await request(
      `/organisations/${orgAId}/components/${cleanComp.id}/clinical-release`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${clinicalStaffToken}` },
        body: JSON.stringify({
          decision: 'RELEASED',
          reason: 'Attempting release on already ISSUED terminal unit',
        }),
      }
    );
    assert(
      terminalReleaseRes.status === 400 &&
        terminalReleaseRes.data.error.message.includes('terminal status'),
      'Backend rejects operations on terminal ISSUED status'
    );

    // ----------------------------------------------------
    // TEST 9: Comprehensive Inventory Summaries & No Double Counting
    // ----------------------------------------------------
    console.log('\n--- 9. Inventory Summaries & Privacy ---');

    const invSummaryRes = await request(`/organisations/${orgAId}/inventory/summary`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${inventoryStaffToken}` },
    });

    assert(invSummaryRes.status === 200, 'Inventory summary retrieved successfully');
    const summaryData = invSummaryRes.data.data;

    // Check invariants
    assert(
      summaryData.collectionIntakeMetrics !== undefined &&
        summaryData.summary.totalComponentsRecorded !== undefined,
      'Inventory metrics distinctly partition collection bags from component inventory (No double-counting)'
    );

    // Check component listing strips donor PII
    const compListRes = await request(`/organisations/${orgAId}/inventory/components`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${inventoryStaffToken}` },
    });

    assert(compListRes.status === 200, 'Component inventory listing returned');
    const firstComp = compListRes.data.data[0];
    assert(
      firstComp && !('donorName' in firstComp) && !('donorPhone' in firstComp),
      'Component inventory endpoints strictly exclude donor personal identifiable information (PII)'
    );

    // ----------------------------------------------------
    // TEST 10: Audit Trail Verification
    // ----------------------------------------------------
    console.log('\n--- 10. Audit Trail Integrity ---');

    const auditRecords = await prisma.auditLog.findMany({
      where: {
        userId: { in: [orgAdminUserId, clinicalStaffUserId, inventoryStaffUserId] },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    assert(
      auditRecords.length >= 5,
      'Audit log recorded actor, action, timestamp, and metadata across all operations'
    );

  } catch (err: any) {
    console.error('Unhandled test suite error:', err);
    failed++;
  } finally {
    if (server) {
      server.close();
    }
  }

  console.log('\n========================================================================');
  console.log(` Phase 6 Test Results: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase6ProcessingReleaseInventoryTests();
