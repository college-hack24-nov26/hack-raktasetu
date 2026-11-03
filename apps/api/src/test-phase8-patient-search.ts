import { app } from './app';
import { prisma } from './lib/prisma';
import http from 'http';

let server: http.Server;
const PORT = Number(process.env.TEST_PORT) || 4098;
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

async function runPhase8PatientSearchTests() {
  console.log('========================================================================');
  console.log(' RaktaSetu — Phase 8: Patient Blood Availability & Request Coordination');
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

  // Dedicated test phone numbers for Phase 8 (78100+ range)
  const patientAPhone = '+919999978101';
  const patientBPhone = '+919999978102';
  const orgAdminPhone = '+919999978103';
  const staffPhone = '+919999978104';

  let patientAToken = '';
  let patientBToken = '';
  let orgAdminToken = '';
  let staffToken = '';

  let patientAUserId = '';
  let patientBUserId = '';
  let orgAdminUserId = '';
  let staffUserId = '';

  let testOrgId = '';
  let testHospitalCode = '';

  let eligibleComponentId = '';
  let heldComponentId = '';
  let expiredComponentId = '';
  let unreleasedComponentId = '';

  try {
    // ----------------------------------------------------
    // SETUP: Provision Test Users, Organisation & Inventory
    // ----------------------------------------------------
    console.log('--- 0. Provisioning Phase 8 Test Fixtures ---');

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

    const pA = await loginUser(patientAPhone);
    patientAToken = pA.token;
    patientAUserId = pA.userId;

    const pB = await loginUser(patientBPhone);
    patientBToken = pB.token;
    patientBUserId = pB.userId;

    const oA = await loginUser(orgAdminPhone);
    orgAdminToken = oA.token;
    orgAdminUserId = oA.userId;

    const st = await loginUser(staffPhone);
    staffToken = st.token;
    staffUserId = st.userId;

    assert(Boolean(patientAToken && patientBToken && orgAdminToken && staffToken), 'All test actors authenticated successfully');

    // Create Verified Participating Organisation in Pune (District 521, State 27)
    const orgCode = `ORG-P8-${Date.now()}`;
    const org = await prisma.organisation.create({
      data: {
        orgCode,
        name: 'Sanjeevani Blood Centre Pune (Phase 8)',
        type: 'BLOOD_BANK',
        licenseNumber: `LIC-P8-${Date.now()}`,
        districtCode: 521,
        districtName: 'Pune',
        stateCode: 27,
        address: '108 Healthcare Blvd, Pune, Maharashtra',
        phone: '+912027001000',
        status: 'VERIFIED',
      },
    });
    testOrgId = org.id;

    // Add Staff Memberships
    await prisma.organisationMembership.create({
      data: {
        userId: orgAdminUserId,
        organisationId: testOrgId,
        role: 'ORG_ADMIN',
        isActive: true,
      },
    });
    await prisma.organisationMembership.create({
      data: {
        userId: staffUserId,
        organisationId: testOrgId,
        role: 'INVENTORY_STAFF',
        isActive: true,
      },
    });

    // Create Camp & Collection Fixtures for Processing
    const camp = await prisma.camp.create({
      data: {
        campCode: `CAMP-P8-${Date.now()}`,
        title: 'Community Blood Drive Phase 8',
        organizerName: 'Lions Club Pune',
        targetDate: new Date(),
        venue: 'Town Hall',
        district: 'Pune',
        districtCode: 521,
        organisationId: testOrgId,
        status: 'APPROVED',
      },
    });

    const attendance = await prisma.campAttendance.create({
      data: {
        campId: camp.id,
        userId: patientAUserId,
        donorName: 'Test Donor P8',
        donorPhone: patientAPhone,
        bloodGroup: 'B_POS',
        status: 'CHECKED_IN',
        checkedInAt: new Date(),
        checkedInBy: staffUserId,
      },
    });

    const screening = await prisma.clinicalScreening.create({
      data: {
        campId: camp.id,
        attendanceId: attendance.id,
        donorUserId: patientAUserId,
        screenedBy: staffUserId,
        status: 'CLEARED',
        eligibilityDecision: 'CLEARED',
        consentGiven: true,
      },
    });

    const donEvent = await prisma.donationEvent.create({
      data: {
        campId: camp.id,
        attendanceId: attendance.id,
        screeningId: screening.id,
        donorUserId: patientAUserId,
        bloodGroup: 'B_POS',
        donationType: 'WHOLE_BLOOD',
        outcome: 'COMPLETED',
        volumeMl: 450,
        recordedBy: staffUserId,
        performedAt: new Date(),
      },
    });

    const colUnit = await prisma.collectionUnit.create({
      data: {
        unitNumber: `CU-P8-${Date.now()}`,
        donationEventId: donEvent.id,
        campId: camp.id,
        organisationId: testOrgId,
        bloodGroup: 'B_POS',
        volumeMl: 450,
        status: 'RECEIVED_BY_CENTRE',
        collectedBy: staffUserId,
      },
    });

    // 1. ELIGIBLE Component: AVAILABLE, RELEASED, not expired, not held
    const compEligible = await prisma.componentUnit.create({
      data: {
        componentCode: `CMP-P8-ELIG-${Date.now()}`,
        collectionUnitId: colUnit.id,
        componentType: 'PRBC',
        bloodGroup: 'B_POS',
        volumeMl: 280,
        organisationId: testOrgId,
        status: 'AVAILABLE',
        isHold: false,
        derivedAt: new Date(),
        derivedBy: staffUserId,
        expiresAt: new Date(Date.now() + 30 * 86400000), // 30 days in future
      },
    });
    eligibleComponentId = compEligible.id;

    await prisma.clinicalReleaseRecord.create({
      data: {
        componentUnitId: eligibleComponentId,
        organisationId: testOrgId,
        decision: 'RELEASED',
        authorizedClinicalUserId: orgAdminUserId,
        decisionTimestamp: new Date(),
        reason: 'Mandatory tests non-reactive and cleared',
        reviewedTestIds: [],
        clinicalProtocolRef: 'NBTC Schedule F(K)',
      },
    });

    // 2. HELD Component: AVAILABLE status but isHold: true
    const compHeld = await prisma.componentUnit.create({
      data: {
        componentCode: `CMP-P8-HELD-${Date.now()}`,
        collectionUnitId: colUnit.id,
        componentType: 'PRBC',
        bloodGroup: 'B_POS',
        volumeMl: 280,
        organisationId: testOrgId,
        status: 'AVAILABLE',
        isHold: true, // Under hold
        derivedAt: new Date(),
        derivedBy: staffUserId,
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    heldComponentId = compHeld.id;

    await prisma.clinicalReleaseRecord.create({
      data: {
        componentUnitId: heldComponentId,
        organisationId: testOrgId,
        decision: 'RELEASED',
        authorizedClinicalUserId: orgAdminUserId,
        decisionTimestamp: new Date(),
        reason: 'Clinically cleared but subsequently placed on hold',
        reviewedTestIds: [],
      },
    });

    // 3. EXPIRED Component: AVAILABLE status but expiresAt in past
    const compExpired = await prisma.componentUnit.create({
      data: {
        componentCode: `CMP-P8-EXP-${Date.now()}`,
        collectionUnitId: colUnit.id,
        componentType: 'PRBC',
        bloodGroup: 'B_POS',
        volumeMl: 280,
        organisationId: testOrgId,
        status: 'AVAILABLE',
        isHold: false,
        derivedAt: new Date(Date.now() - 40 * 86400000),
        derivedBy: staffUserId,
        expiresAt: new Date(Date.now() - 5 * 86400000), // Expired 5 days ago
      },
    });
    expiredComponentId = compExpired.id;

    await prisma.clinicalReleaseRecord.create({
      data: {
        componentUnitId: expiredComponentId,
        organisationId: testOrgId,
        decision: 'RELEASED',
        authorizedClinicalUserId: orgAdminUserId,
        decisionTimestamp: new Date(),
        reason: 'Past release before shelf-life expired',
        reviewedTestIds: [],
      },
    });

    // 4. UNRELEASED Component: QUARANTINED status, no clinical release
    const compUnreleased = await prisma.componentUnit.create({
      data: {
        componentCode: `CMP-P8-UNREL-${Date.now()}`,
        collectionUnitId: colUnit.id,
        componentType: 'PRBC',
        bloodGroup: 'B_POS',
        volumeMl: 280,
        organisationId: testOrgId,
        status: 'QUARANTINED',
        isHold: false,
        derivedAt: new Date(),
        derivedBy: staffUserId,
        expiresAt: new Date(Date.now() + 30 * 86400000),
      },
    });
    unreleasedComponentId = compUnreleased.id;

    // 5. External eRaktKosh Directory Centre & Snapshots Fixtures
    testHospitalCode = `HOSP-P8-EXT-${Date.now()}`;
    await prisma.bloodCentre.create({
      data: {
        hospitalCode: testHospitalCode,
        hospitalName: 'District Hospital Pune (External Directory)',
        address: 'Station Road, Pune',
        mobileNo: '020-26123456',
        stateCode: 27,
        districtCode: 521,
      },
    });

    // Recent snapshot (1 hour ago)
    await prisma.bloodAvailabilitySnapshot.create({
      data: {
        hospitalCode: testHospitalCode,
        bloodGroup: 'B+',
        component: 'Packed Red Blood Cells',
        reportedQuantity: 8,
        retrievedAt: new Date(Date.now() - 3600000),
        sourceEntryDate: new Date(Date.now() - 3600000),
        isStale: false,
      },
    });

    // Stale external centre fixture (sourceEntryDate 5 days ago)
    const staleHospitalCode = `HOSP-P8-STALE-${Date.now()}`;
    await prisma.bloodCentre.create({
      data: {
        hospitalCode: staleHospitalCode,
        hospitalName: 'Cantonment General Hospital Pune (External)',
        address: 'Camp Area, Pune',
        mobileNo: '020-26330000',
        stateCode: 27,
        districtCode: 521,
      },
    });

    await prisma.bloodAvailabilitySnapshot.create({
      data: {
        hospitalCode: staleHospitalCode,
        bloodGroup: 'B+',
        component: 'Packed Red Blood Cells',
        reportedQuantity: 4,
        retrievedAt: new Date(),
        sourceEntryDate: new Date(Date.now() - 5 * 86400000), // 5 days old
        isStale: true,
      },
    });

    // Corrupt / unparseable quantity snapshot fixture
    const unparseableHospitalCode = `HOSP-P8-UNPARS-${Date.now()}`;
    await prisma.bloodCentre.create({
      data: {
        hospitalCode: unparseableHospitalCode,
        hospitalName: 'Rural Health Centre Pune (External)',
        address: 'Rural Block, Pune',
        mobileNo: null,
        stateCode: 27,
        districtCode: 521,
      },
    });

    await prisma.bloodAvailabilitySnapshot.create({
      data: {
        hospitalCode: unparseableHospitalCode,
        bloodGroup: 'B+',
        component: 'Packed Red Blood Cells',
        reportedQuantity: null, // Null / unparseable quantity
        retrievedAt: new Date(),
        sourceEntryDate: null,
        isStale: true,
      },
    });

    console.log('Test fixtures created successfully.\n');

    // ----------------------------------------------------
    // TEST 1: Unified Blood Availability Search & Source Labelling
    // ----------------------------------------------------
    console.log('--- 1. Unified Blood Availability Search & Source Labelling ---');

    const searchRes = await request('/patient-search/availability?districtCode=521&bloodGroup=B_POS');
    assert(searchRes.status === 200, 'Search endpoint returns 200 OK');
    assert(Array.isArray(searchRes.data?.data), 'Search results return an array');

    const results = searchRes.data?.data || [];
    const partResults = results.filter((r: any) => r.source === 'PARTICIPATING_ORGANISATION');
    const extResults = results.filter((r: any) => r.source === 'ERAKTKOSH_SNAPSHOT');

    assert(partResults.length > 0, 'Participating organisation results present in unified search', `Count: ${partResults.length}`);
    assert(extResults.length > 0, 'External eRaktKosh snapshot results present in unified search', `Count: ${extResults.length}`);

    // Verify participating organisation result format and freshness
    const targetPartOrg = partResults.find((r: any) => r.organisation?.id === testOrgId);
    assert(Boolean(targetPartOrg), 'Test participating organisation appears in search results');
    assert(targetPartOrg?.availability?.dataFreshness === 'live', 'Participating organisation marked with live dataFreshness');
    assert(targetPartOrg?.availability?.note?.includes('Authoritative inventory'), 'Participating org has authoritative note with non-guarantee disclaimer');

    // Verify metadata and data source note
    assert(Boolean(searchRes.data?.meta?.dataSourceNote), 'Search response contains prominent data source explanatory note');
    assert(searchRes.data?.meta?.participatingOrgResults >= 1, 'Meta accurately reports participating organisation result count');

    // ----------------------------------------------------
    // TEST 2: Strict Exclusion of Ineligible Component Units
    // ----------------------------------------------------
    console.log('\n--- 2. Strict Inventory Eligibility Exclusions ---');

    // In Org A, we created:
    // - 1 eligible PRBC (AVAILABLE, RELEASED, future expiry, not held)
    // - 1 held PRBC (isHold: true) -> MUST BE EXCLUDED
    // - 1 expired PRBC (expiresAt in past) -> MUST BE EXCLUDED
    // - 1 unreleased PRBC (QUARANTINED, no release) -> MUST BE EXCLUDED
    // Therefore, availableCount for Org A MUST be exactly 1!
    assert(targetPartOrg?.availability?.availableCount === 1, `Org A reports exactly 1 eligible available unit (actual: ${targetPartOrg?.availability?.availableCount})`);

    // Verify breakdown matches
    const prbcCount = targetPartOrg?.availability?.componentBreakdown?.['Packed Red Blood Cells'];
    assert(prbcCount === 1, `PRBC component count is 1 (actual: ${prbcCount})`);

    // ----------------------------------------------------
    // TEST 3: Stale and Unparseable External Data Handling
    // ----------------------------------------------------
    console.log('\n--- 3. Stale and Unparseable External Data Handling ---');

    // Recent external centre
    const recentCentre = extResults.find((r: any) => r.externalCentre?.hospitalCode === testHospitalCode);
    assert(Boolean(recentCentre), 'Recent external centre found in results');
    assert(recentCentre?.availability?.dataFreshness === 'recent', 'Recent external snapshot labelled with dataFreshness: recent');
    assert(recentCentre?.availability?.note?.includes('not guaranteed'), 'External entry has clear non-guarantee disclaimer note');

    // Stale external centre
    const staleCentre = extResults.find((r: any) => r.externalCentre?.hospitalCode === staleHospitalCode);
    assert(Boolean(staleCentre), 'Stale external centre found in results');
    assert(staleCentre?.availability?.dataFreshness === 'stale', 'Old snapshot (>48h) labelled with dataFreshness: stale');
    assert(staleCentre?.availability?.note?.includes('stale'), 'Stale entry has warning that data is stale');

    // Unparseable / null quantity external centre
    const unparseableCentre = extResults.find((r: any) => r.externalCentre?.hospitalCode === unparseableHospitalCode);
    assert(Boolean(unparseableCentre), 'Unparseable external centre found in results');
    assert(unparseableCentre?.availability?.availableCount === 0, 'Unparseable quantity defaults to availableCount: 0');
    assert(unparseableCentre?.availability?.note?.includes('unavailable') || unparseableCentre?.availability?.note?.includes('stale'), 'Unparseable entry notes data unavailable');

    // ----------------------------------------------------
    // TEST 4: Public Search Privacy & PII Protection
    // ----------------------------------------------------
    console.log('\n--- 4. Public Search Privacy & PII Protection ---');

    const searchResponseText = JSON.stringify(searchRes.data);
    // Must NOT contain internal component unit IDs or barcodes
    assert(!searchResponseText.includes(eligibleComponentId), 'Search response does NOT expose internal componentUnit ID');
    assert(!searchResponseText.includes('CMP-P8-ELIG'), 'Search response does NOT expose internal component unit barcode/code');
    // Must NOT contain donor PII
    assert(!searchResponseText.includes('donorName'), 'Search response contains no donorName fields');
    assert(!searchResponseText.includes('+919999978101'), 'Search response contains no patient phone numbers');

    // Test specific participating organisation public view
    const orgPublicRes = await request(`/patient-search/organisations/${testOrgId}/availability`);
    assert(orgPublicRes.status === 200, 'Public org availability endpoint returns 200 OK');
    const orgPublicText = JSON.stringify(orgPublicRes.data);
    assert(!orgPublicText.includes(eligibleComponentId), 'Org public availability does NOT expose componentUnit IDs');
    assert(orgPublicRes.data?.data?.availableComponents?.length === 1, 'Org public availability shows exactly 1 aggregated category');

    // ----------------------------------------------------
    // TEST 5: Source Filtering
    // ----------------------------------------------------
    console.log('\n--- 5. Source Filtering (participating vs external) ---');

    const participatingOnlyRes = await request('/patient-search/availability?districtCode=521&source=participating');
    assert(participatingOnlyRes.status === 200, 'source=participating returns 200');
    const allParticipating = (participatingOnlyRes.data?.data || []).every((r: any) => r.source === 'PARTICIPATING_ORGANISATION');
    assert(allParticipating, 'source=participating returns ONLY participating organisations');

    const externalOnlyRes = await request('/patient-search/availability?districtCode=521&source=external');
    assert(externalOnlyRes.status === 200, 'source=external returns 200');
    const allExternal = (externalOnlyRes.data?.data || []).every((r: any) => r.source === 'ERAKTKOSH_SNAPSHOT');
    assert(allExternal, 'source=external returns ONLY external eRaktKosh snapshots');

    // ----------------------------------------------------
    // TEST 6: Patient Request Creation & Lifecycle Flow
    // ----------------------------------------------------
    console.log('\n--- 6. Patient Blood Request Lifecycle & Transitions ---');

    // Patient A creates a request
    const createReqRes = await request('/patient-requests', {
      method: 'POST',
      headers: { Authorization: `Bearer ${patientAToken}` },
      body: JSON.stringify({
        patientName: 'Sunita Sharma',
        bloodGroup: 'B_POS',
        component: 'Packed Red Blood Cells',
        componentType: 'PRBC',
        unitsRequested: 2,
        organisationId: testOrgId,
        message: 'Needed for scheduled elective surgery at Pune Hospital',
        urgency: 'ROUTINE',
      }),
    });

    assert(createReqRes.status === 201, 'Patient request created with 201 Created');
    const createdRequest = createReqRes.data?.data;
    const testRequestId = createdRequest?.id;
    assert(Boolean(testRequestId), 'Request ID returned');
    assert(createdRequest?.status === 'OPEN', 'Underlying DB status is OPEN');
    assert(createdRequest?.lifecycleStatus === 'SUBMITTED', 'Initial Phase 8 lifecycle status is SUBMITTED');

    // Patient A lists their requests
    const listReqsRes = await request('/patient-requests', {
      headers: { Authorization: `Bearer ${patientAToken}` },
    });
    assert(listReqsRes.status === 200, 'List requests returns 200');
    const foundMyReq = listReqsRes.data?.data?.find((r: any) => r.id === testRequestId);
    assert(Boolean(foundMyReq), 'Created request found in requester list');
    assert(foundMyReq?.lifecycleStatus === 'SUBMITTED', 'Listed request has lifecycleStatus: SUBMITTED');

    // Get Request Details
    const detailsRes = await request(`/patient-requests/${testRequestId}`, {
      headers: { Authorization: `Bearer ${patientAToken}` },
    });
    assert(detailsRes.status === 200, 'Get request details returns 200');
    assert(detailsRes.data?.data?.lifecycleStatus === 'SUBMITTED', 'Details return current lifecycleStatus');

    // Valid Transition 1: SUBMITTED -> AWAITING_BB_RESPONSE
    const trans1Res = await request(`/patient-requests/${testRequestId}/transition`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${patientAToken}` },
      body: JSON.stringify({
        newLifecycleStatus: 'AWAITING_BB_RESPONSE',
        reason: 'Coordinating with blood bank desk',
      }),
    });
    assert(trans1Res.status === 200, 'Transition SUBMITTED -> AWAITING_BB_RESPONSE succeeds');
    assert(trans1Res.data?.data?.lifecycleStatus === 'AWAITING_BB_RESPONSE', 'Lifecycle status updated to AWAITING_BB_RESPONSE');

    // Valid Transition 2: AWAITING_BB_RESPONSE -> ACCEPTED
    const trans2Res = await request(`/patient-requests/${testRequestId}/transition`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${patientAToken}` },
      body: JSON.stringify({
        newLifecycleStatus: 'ACCEPTED',
        reason: 'Blood bank confirmed processing of request',
      }),
    });
    assert(trans2Res.status === 200, 'Transition AWAITING_BB_RESPONSE -> ACCEPTED succeeds');
    assert(trans2Res.data?.data?.lifecycleStatus === 'ACCEPTED', 'Lifecycle status updated to ACCEPTED');

    // Valid Transition 3: ACCEPTED -> PARTIALLY_FULFILLED
    const trans3Res = await request(`/patient-requests/${testRequestId}/transition`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${patientAToken}` },
      body: JSON.stringify({
        newLifecycleStatus: 'PARTIALLY_FULFILLED',
        reason: '1 unit prepared',
      }),
    });
    assert(trans3Res.status === 200, 'Transition ACCEPTED -> PARTIALLY_FULFILLED succeeds');
    assert(trans3Res.data?.data?.lifecycleStatus === 'PARTIALLY_FULFILLED', 'Lifecycle status updated to PARTIALLY_FULFILLED');

    // Valid Transition 4: PARTIALLY_FULFILLED -> FULFILLED (terminal)
    const trans4Res = await request(`/patient-requests/${testRequestId}/transition`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${patientAToken}` },
      body: JSON.stringify({
        newLifecycleStatus: 'FULFILLED',
        reason: 'All requested units issued',
        feedback: 'Excellent response and support',
      }),
    });
    assert(trans4Res.status === 200, 'Transition PARTIALLY_FULFILLED -> FULFILLED succeeds');
    assert(trans4Res.data?.data?.lifecycleStatus === 'FULFILLED', 'Lifecycle status updated to FULFILLED');
    assert(trans4Res.data?.data?.status === 'CLOSED', 'Terminal FULFILLED updates DB status to CLOSED');

    // Invalid Transition: Transition from terminal FULFILLED state
    const invalidFromTerminalRes = await request(`/patient-requests/${testRequestId}/transition`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${patientAToken}` },
      body: JSON.stringify({
        newLifecycleStatus: 'ACCEPTED',
      }),
    });
    assert(invalidFromTerminalRes.status === 400, 'Transition from terminal FULFILLED is rejected with 400 Bad Request');

    // ----------------------------------------------------
    // TEST 7: Invalid Transitions & Cross-User Security Denial
    // ----------------------------------------------------
    console.log('\n--- 7. Invalid Transitions & Cross-User Security Denial ---');

    // Create a new request for invalid transition testing
    const req2Res = await request('/patient-requests', {
      method: 'POST',
      headers: { Authorization: `Bearer ${patientAToken}` },
      body: JSON.stringify({
        bloodGroup: 'B_POS',
        component: 'Packed Red Blood Cells',
        unitsRequested: 1,
      }),
    });
    const req2Id = req2Res.data?.data?.id;

    // Direct illegal leap: SUBMITTED -> FULFILLED (skipping acceptance)
    const illegalLeapRes = await request(`/patient-requests/${req2Id}/transition`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${patientAToken}` },
      body: JSON.stringify({
        newLifecycleStatus: 'FULFILLED',
      }),
    });
    assert(illegalLeapRes.status === 400, 'Illegal transition SUBMITTED -> FULFILLED is rejected with 400');
    assert(illegalLeapRes.data?.error?.message?.includes('Invalid transition'), 'Error indicates invalid transition');

    // Cross-User Access Denial: Patient B tries to view Patient A's request
    const crossViewRes = await request(`/patient-requests/${req2Id}`, {
      headers: { Authorization: `Bearer ${patientBToken}` },
    });
    assert(crossViewRes.status === 404, 'Unauthorized user viewing other user request receives 404 Not Found (privacy guard)');

    // Cross-User Access Denial: Patient B tries to transition Patient A's request
    const crossTransRes = await request(`/patient-requests/${req2Id}/transition`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${patientBToken}` },
      body: JSON.stringify({
        newLifecycleStatus: 'CANCELLED',
      }),
    });
    assert(crossTransRes.status === 403, 'Unauthorized user transitioning request receives 403 Forbidden');

    // ----------------------------------------------------
    // TEST 8: Atomic Component Reservation & Double-Booking Protection
    // ----------------------------------------------------
    console.log('\n--- 8. Atomic Component Reservation & Concurrency Guard ---');

    // Setup: Request 3 in ACCEPTED state
    const req3Res = await request('/patient-requests', {
      method: 'POST',
      headers: { Authorization: `Bearer ${patientAToken}` },
      body: JSON.stringify({
        bloodGroup: 'B_POS',
        component: 'Packed Red Blood Cells',
        unitsRequested: 1,
        organisationId: testOrgId,
      }),
    });
    const req3Id = req3Res.data?.data?.id;

    // Transition req3 to ACCEPTED
    await request(`/patient-requests/${req3Id}/transition`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${patientAToken}` },
      body: JSON.stringify({ newLifecycleStatus: 'AWAITING_BB_RESPONSE' }),
    });
    await request(`/patient-requests/${req3Id}/transition`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${patientAToken}` },
      body: JSON.stringify({ newLifecycleStatus: 'ACCEPTED' }),
    });

    // 1. Authorized reservation of eligible component unit
    const reserve1Res = await request(`/patient-requests/${req3Id}/reserve-component`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({
        componentUnitId: eligibleComponentId,
      }),
    });
    assert(reserve1Res.status === 200, 'Eligible component reserved successfully for request');
    assert(reserve1Res.data?.data?.reserved === true, 'Reservation response indicates reserved: true');
    assert(reserve1Res.data?.message?.includes('Reservation does not mean transfusion'), 'Disclaimer clearly states reservation is not final transfusion/issue');

    // Verify component status in DB changed to RESERVED
    const dbComp = await prisma.componentUnit.findUnique({ where: { id: eligibleComponentId } });
    assert(dbComp?.status === 'RESERVED', 'Component unit status updated to RESERVED in database');

    // 2. Double-Reservation Protection: Attempting to reserve the SAME component again for Req 2
    // Setup Req 2 to ACCEPTED
    await request(`/patient-requests/${req2Id}/transition`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${patientAToken}` },
      body: JSON.stringify({ newLifecycleStatus: 'AWAITING_BB_RESPONSE' }),
    });
    await request(`/patient-requests/${req2Id}/transition`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${patientAToken}` },
      body: JSON.stringify({ newLifecycleStatus: 'ACCEPTED' }),
    });

    const reserveDuplicateRes = await request(`/patient-requests/${req2Id}/reserve-component`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({
        componentUnitId: eligibleComponentId,
      }),
    });
    assert(reserveDuplicateRes.status === 400, 'Double-reservation of already RESERVED component rejected with 400');
    assert(reserveDuplicateRes.data?.error?.message?.includes('RESERVED'), 'Error explains component is in RESERVED status and only AVAILABLE units can be reserved');

    // 3. Attempt to reserve component on quarantine hold
    const reserveHeldRes = await request(`/patient-requests/${req2Id}/reserve-component`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({
        componentUnitId: heldComponentId,
      }),
    });
    assert(reserveHeldRes.status === 400, 'Reserving component on quarantine hold rejected with 400');
    assert(reserveHeldRes.data?.error?.message?.includes('quarantine hold'), 'Error explains component is under hold');

    // 4. Attempt to reserve expired component
    const reserveExpiredRes = await request(`/patient-requests/${req2Id}/reserve-component`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({
        componentUnitId: expiredComponentId,
      }),
    });
    assert(reserveExpiredRes.status === 400, 'Reserving expired component rejected with 400');
    assert(reserveExpiredRes.data?.error?.message?.includes('expired'), 'Error explains component has expired');

    // 5. Attempt to reserve unreleased component
    const reserveUnreleasedRes = await request(`/patient-requests/${req2Id}/reserve-component`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({
        componentUnitId: unreleasedComponentId,
      }),
    });
    assert(reserveUnreleasedRes.status === 400, 'Reserving unreleased component rejected with 400');

    // ----------------------------------------------------
    // TEST 9: Distinction between Acceptance, Reservation, Issue & Fulfilment
    // ----------------------------------------------------
    console.log('\n--- 9. Clinical Distinction: Acceptance vs Reservation vs Issue ---');

    // Verify reservation did NOT issue the unit
    assert(dbComp?.status !== 'ISSUED', 'Reserved component unit is NOT ISSUED (issuance is separate workflow)');

    // Verify request lifecycle is separate from unit physical custody
    const req3Check = await prisma.bloodRequest.findUnique({ where: { id: req3Id } });
    assert(req3Check?.reportedDonationStatus === 'ACCEPTED', 'Request remains ACCEPTED during unit reservation; fulfillment is confirmed later');

    // ----------------------------------------------------
    // TEST 10: Realtime Outbox Event Generation
    // ----------------------------------------------------
    console.log('\n--- 10. Realtime Event Outbox Integration ---');

    const outboxEvents = await prisma.outboxEvent.findMany({
      where: {
        entityType: 'BloodRequest',
        entityId: testRequestId,
      },
      orderBy: { createdAt: 'desc' },
    });
    assert(outboxEvents.length >= 2, `Outbox events generated for patient request lifecycle transitions (count: ${outboxEvents.length})`);
    assert(outboxEvents[0].eventType === 'blood_request.status_changed', 'Event type is blood_request.status_changed');

  } catch (err: any) {
    console.error('Unhandled test runner error:', err);
    failed++;
  } finally {
    if (server) {
      server.close();
    }
  }

  console.log('\n========================================================================');
  console.log(` Phase 8 Test Suite Completed: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase8PatientSearchTests();
