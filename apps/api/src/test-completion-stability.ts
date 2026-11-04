import http from 'http';
import { app } from './app';
import { prisma } from './lib/prisma';
import { RealtimeService } from './services/realtime';
import WebSocket from 'ws';

const PORT = 4065;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

async function request(path: string, options: any = {}) {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  return { status: res.status, ok: res.ok, data, headers: res.headers };
}

async function runCompletionStabilitySuite() {
  console.log('========================================================================');
  console.log('  RaktaSetu — Donor Completion & System Stability Verification Suite');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(
        `[FAIL] ${testName}${
          detail !== undefined ? ` -> ${typeof detail === 'object' ? JSON.stringify(detail) : detail}` : ''
        }`
      );
      failed++;
    }
  }

  const server = http.createServer(app);
  RealtimeService.init(server);

  await new Promise<void>((resolve) => {
    server.listen(PORT, () => {
      resolve();
    });
  });

  try {
    const testRand = Math.floor(100000 + Math.random() * 900000);

    async function loginOrCreate(phone: string, name: string) {
      const res = await request('/auth/demo-login', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: phone, otp: '123456' }),
      });
      if (res.data?.data?.user?.id && name) {
        await prisma.user.update({
          where: { id: res.data.data.user.id },
          data: { name },
        });
        res.data.data.user.name = name;
      }
      return { token: res.data?.data?.token, user: res.data?.data?.user };
    }

    const coordPhone = `+9197${testRand}01`;
    const clinicalPhone = `+9197${testRand}02`;
    const collectionPhone = `+9197${testRand}03`;
    const orgBPhone = `+9197${testRand}04`;

    const coordinatorUser = await loginOrCreate(coordPhone, `Coordinator ${testRand}`);
    const clinicalUser = await loginOrCreate(clinicalPhone, `Dr Clinical ${testRand}`);
    const collectionUser = await loginOrCreate(collectionPhone, `Phleb Collection ${testRand}`);
    const orgBUser = await loginOrCreate(orgBPhone, `Org B User ${testRand}`);

    // Create Test Organisations A & B
    const orgA = await prisma.organisation.create({
      data: {
        orgCode: `ORG-CMP-A-${testRand}`,
        name: `Camp Org A ${testRand}`,
        licenseNumber: `LIC-A-${testRand}`,
        districtCode: 521,
        stateCode: 27,
        status: 'VERIFIED',
      },
    });

    const orgB = await prisma.organisation.create({
      data: {
        orgCode: `ORG-CMP-B-${testRand}`,
        name: `Camp Org B ${testRand}`,
        licenseNumber: `LIC-B-${testRand}`,
        districtCode: 522,
        stateCode: 27,
        status: 'VERIFIED',
      },
    });

    // Memberships
    await prisma.organisationMembership.createMany({
      data: [
        { userId: coordinatorUser.user.id, organisationId: orgA.id, role: 'CLINICAL_STAFF', isActive: true },
        { userId: clinicalUser.user.id, organisationId: orgA.id, role: 'CLINICAL_STAFF', isActive: true },
        { userId: collectionUser.user.id, organisationId: orgA.id, role: 'COLLECTION_STAFF', isActive: true },
        { userId: orgBUser.user.id, organisationId: orgB.id, role: 'CLINICAL_STAFF', isActive: true },
      ],
    });

    // Create Camp
    const camp = await prisma.camp.create({
      data: {
        campCode: `CAMP-CMP-${testRand}`,
        title: `Donor Completion Test Camp ${testRand}`,
        organizerName: 'Pune Red Cross',
        targetDate: new Date(Date.now() + 86400000),
        venue: 'Pune Civil Hospital Ground',
        district: 'Pune',
        districtCode: 521,
        expectedDonors: 50,
        status: 'APPROVED',
        organisation: { connect: { id: orgA.id } },
        isReadyForCollection: true,
      },
    });

    // Camp Staff Assignments
    await prisma.campStaffAssignment.createMany({
      data: [
        { campId: camp.id, userId: coordinatorUser.user.id, role: 'CAMP_COORDINATOR', organisationId: orgA.id, assignedBy: coordinatorUser.user.id },
        { campId: camp.id, userId: clinicalUser.user.id, role: 'CLINICAL_STAFF', organisationId: orgA.id, assignedBy: coordinatorUser.user.id },
        { campId: camp.id, userId: collectionUser.user.id, role: 'COLLECTION_STAFF', organisationId: orgA.id, assignedBy: coordinatorUser.user.id },
      ],
    });

    const coordToken = coordinatorUser.token;
    const clinicalToken = clinicalUser.token;
    const collectionToken = collectionUser.token;
    const orgBToken = orgBUser.token;

    // =========================================================================
    // TEST 1: Register donor via Step 1
    // =========================================================================
    const donor1Phone = `${Math.floor(6000000000 + Math.random() * 3999999999)}`;
    const regStep1Res = await request('/donor-registration/save', {
      method: 'POST',
      token: coordToken,
      body: JSON.stringify({
        campId: camp.id,
        organisationId: orgA.id,
        currentStep: 1,
        donorDetails: {
          fullName: 'Vikram Malhotra',
          gender: 'MALE',
          dob: '1992-08-20',
          bloodGroup: 'O_POSITIVE',
          primaryMobile: donor1Phone,
          permanentAddress: 'Shivajinagar',
          permanentState: 'Maharashtra',
          permanentStateCode: 'MH',
          permanentDistrict: 'Pune',
          permanentDistrictCode: '2701',
          permanentCity: 'Pune',
          permanentPinCode: '411005',
        },
      }),
    });
    assert(regStep1Res.status === 200, 'Test 1: Coordinator registers donor successfully');
    const registrationId = regStep1Res.data?.data?.registration?.id || regStep1Res.data?.data?.id;
    assert(Boolean(registrationId), 'Registration ID created', registrationId);

    // =========================================================================
    // TEST 2: Attempt completion without Screening -> Controlled 400 rejection
    // =========================================================================
    const prematureCompRes = await request(`/donor-registration/${registrationId}/complete`, {
      method: 'POST',
      token: collectionToken,
    });
    assert(prematureCompRes.status === 400, 'Test 2: Completion without screening returns 400', prematureCompRes.status);
    assert(prematureCompRes.data?.error?.code === 'COMPLETION_FAILED', 'Error code is COMPLETION_FAILED', prematureCompRes.data?.error?.code);
    assert(Boolean(prematureCompRes.data?.error?.correlationId), 'Error response includes structured correlationId');

    // Confirm API remains available
    const healthCheck1 = await request('/health');
    assert(healthCheck1.status === 200, 'API remains responsive after 400 validation rejection');

    // =========================================================================
    // TEST 3: Counselling (Step 2) & Clinical Screening FIT (Step 3)
    // =========================================================================
    const s2Res = await request('/donor-registration/save', {
      method: 'POST',
      token: clinicalToken,
      body: JSON.stringify({
        registrationId,
        campId: camp.id,
        organisationId: orgA.id,
        currentStep: 2,
        counsellingStatus: 'REVIEWED_APPROVED',
        counsellingReviewedById: clinicalUser.user.id,
      }),
    });
    assert(s2Res.status === 200, 'Test 3.1: Clinical counselling recorded successfully');

    const s3Res = await request('/donor-registration/save', {
      method: 'POST',
      token: clinicalToken,
      body: JSON.stringify({
        registrationId,
        campId: camp.id,
        organisationId: orgA.id,
        currentStep: 3,
        screening: {
          status: 'FIT',
          weightKg: 72,
          hemoglobin: 15.1,
          bloodGroup: 'O_POSITIVE',
          screenedById: clinicalUser.user.id,
          medicalOfficerId: clinicalUser.user.id,
        },
      }),
    });
    assert(s3Res.status === 200, 'Test 3.2: Clinical screening recorded with FIT clearance');

    // =========================================================================
    // TEST 4: Attempt completion before collection recorded -> Controlled 400 rejection
    // =========================================================================
    const uncollectedCompRes = await request(`/donor-registration/${registrationId}/complete`, {
      method: 'POST',
      token: collectionToken,
    });
    assert(uncollectedCompRes.status === 400, 'Test 4: Cleared donor cannot be completed without collection (400)', uncollectedCompRes.status);
    assert(uncollectedCompRes.data?.error?.message?.includes('collection outcome must be recorded'), 'Rejection mentions collection requirement');

    // =========================================================================
    // TEST 5: Role Boundary: Clinical Staff cannot complete collection workflow
    // =========================================================================
    // First record phlebotomy / collection via collection staff
    const customUnitNumber = `CU-${testRand}-A01`;
    const customBarcode = `*RSB${testRand}A*`;
    const step4Res = await request('/donor-registration/save', {
      method: 'POST',
      token: collectionToken,
      body: JSON.stringify({
        registrationId,
        campId: camp.id,
        organisationId: orgA.id,
        currentStep: 4,
        collection: {
          status: 'COLLECTED',
          bagType: 'DB-450',
          volumeMl: 450,
          unitNumber: customUnitNumber,
          barcode: customBarcode,
          phlebotomistId: collectionUser.user.id,
        },
      }),
    });
    assert(step4Res.status === 200, 'Test 5.1: Collection staff records collection');

    // Clinical staff attempts to finalize / complete collection
    const clinicalCompleteRes = await request(`/donor-registration/${registrationId}/complete`, {
      method: 'POST',
      token: clinicalToken,
    });
    assert(clinicalCompleteRes.status === 403, 'Test 5.2: Clinical staff forbidden from completing collection workflow (403)', clinicalCompleteRes.status);
    assert(clinicalCompleteRes.data?.error?.code === 'FORBIDDEN', 'Error code is FORBIDDEN', clinicalCompleteRes.data?.error?.code);

    // =========================================================================
    // TEST 6: Valid completion by Collection Staff persists atomically
    // =========================================================================
    const validCompRes = await request(`/donor-registration/${registrationId}/complete`, {
      method: 'POST',
      token: collectionToken,
    });
    assert(validCompRes.status === 200, 'Test 6: Collection staff completes registration successfully (200)', validCompRes.status);
    const completedData = validCompRes.data?.data;
    assert(completedData?.isCompleted === true, 'Registration is marked isCompleted = true');
    assert(completedData?.workflowStatus === 'COMPLETED', 'Workflow status is COMPLETED');

    // Verify Authoritative DB records
    const dbUnit = await prisma.collectionUnit.findUnique({
      where: { unitNumber: customUnitNumber },
      include: { donationEvent: true },
    });
    assert(Boolean(dbUnit), 'CollectionUnit record persisted in database');
    assert(dbUnit?.status === 'COLLECTED', 'CollectionUnit status is COLLECTED (quarantined at camp awaiting handover dispatch)');
    assert(dbUnit?.volumeMl === 450, 'CollectionUnit volumeMl is 450');
    assert(Boolean(dbUnit?.donationEvent), 'DonationEvent linked to collection unit');
    assert(dbUnit?.donationEvent?.outcome === 'COMPLETED', 'DonationEvent outcome is COMPLETED');

    // =========================================================================
    // TEST 7: Duplicate completion request handled idempotently
    // =========================================================================
    const dupCompRes = await request(`/donor-registration/${registrationId}/complete`, {
      method: 'POST',
      token: collectionToken,
    });
    assert(dupCompRes.status === 200, 'Test 7: Duplicate completion returns idempotent 200 OK', dupCompRes.status);
    assert(dupCompRes.data?.data?.isCompleted === true, 'Duplicate response returns completed state');

    // Check database unit count has not duplicated
    const unitCount = await prisma.collectionUnit.count({
      where: { unitNumber: customUnitNumber },
    });
    assert(unitCount === 1, 'Collection unit was not duplicated in database (count is 1)');

    // =========================================================================
    // TEST 8: Multi-tenant / Org isolation enforced
    // =========================================================================
    const orgBCompleteRes = await request(`/donor-registration/${registrationId}/complete`, {
      method: 'POST',
      token: orgBToken,
    });
    assert(orgBCompleteRes.status === 403 || orgBCompleteRes.status === 404, 'Test 8: Unauthorised Org B cannot complete Camp A registration (403/404)', orgBCompleteRes.status);

    // =========================================================================
    // TEST 9: Authoritative Camp Metrics & Closure Readiness Synchronised
    // =========================================================================
    const campAnalyticsRes = await request(`/camps/${camp.id}/analytics`, { token: collectionToken });
    const campMetrics = campAnalyticsRes.data?.data || campAnalyticsRes.data;
    assert(campMetrics.completedDonations === 1, 'Camp metrics: completedDonations is 1', campMetrics.completedDonations);
    assert(campMetrics.totalConfirmedUnits === 1, 'Camp metrics: totalConfirmedUnits is 1', campMetrics.totalConfirmedUnits);
    assert(campMetrics.totalVolumeMl === 450, 'Camp metrics: totalVolumeMl is 450', campMetrics.totalVolumeMl);

    // Closure readiness: unit is in camp custody (COLLECTED) awaiting handover manifest
    const readinessRes = await request(`/camps/${camp.id}/closure-readiness`, { token: coordToken });
    const readiness = readinessRes.data?.data;
    assert(readinessRes.status === 200, 'Closure readiness endpoint returns 200');
    assert(readiness?.isReady === false, 'Camp is NOT ready for closure while units remain in custody');
    assert(
      readiness?.blockers?.some((b: string) => b.includes('remain in camp custody')),
      'Closure blockers explicitly mention collection units remaining in camp custody'
    );

    // =========================================================================
    // TEST 10: WebSocket Subprotocol Handshake & Lifecycle
    // =========================================================================
    const wsUrl = `ws://localhost:${PORT}/ws`;
    const wsToken = collectionToken;
    let wsConnected = false;
    let wsNegotiatedProtocol = '';

    await new Promise<void>((resolveWs) => {
      const ws = new WebSocket(wsUrl, [`raktasetu-auth.${wsToken}`]);

      const timeout = setTimeout(() => {
        ws.terminate();
        resolveWs();
      }, 5000);

      ws.on('open', () => {
        wsConnected = true;
        wsNegotiatedProtocol = ws.protocol;
        ws.send(JSON.stringify({ type: 'subscribe', channel: `camp:${camp.id}` }));
        setTimeout(() => {
          ws.close(1000, 'Test completed');
          clearTimeout(timeout);
          resolveWs();
        }, 500);
      });

      ws.on('error', (err) => {
        console.error('WebSocket test error:', err);
        clearTimeout(timeout);
        resolveWs();
      });
    });

    assert(wsConnected, 'Test 10.1: WebSocket connected successfully to ws://localhost:4065/ws');
    assert(
      wsNegotiatedProtocol === `raktasetu-auth.${wsToken}`,
      'Test 10.2: WebSocket subprotocol negotiated correctly by server',
      wsNegotiatedProtocol
    );

    // =========================================================================
    // TEST 11: Clinical Deferral Completion Flow
    // =========================================================================
    const donor2Phone = `${Math.floor(6000000000 + Math.random() * 3999999999)}`;
    const reg2Step1Res = await request('/donor-registration/save', {
      method: 'POST',
      token: coordToken,
      body: JSON.stringify({
        campId: camp.id,
        organisationId: orgA.id,
        currentStep: 1,
        donorDetails: {
          fullName: 'Kiran Deshmukh',
          gender: 'FEMALE',
          dob: '2000-01-10',
          bloodGroup: 'A_POSITIVE',
          primaryMobile: donor2Phone,
          permanentAddress: 'Kothrud',
          permanentState: 'Maharashtra',
          permanentStateCode: 'MH',
          permanentDistrict: 'Pune',
          permanentDistrictCode: '2701',
          permanentCity: 'Pune',
          permanentPinCode: '411038',
        },
      }),
    });
    const reg2Id = reg2Step1Res.data?.data?.registration?.id || reg2Step1Res.data?.data?.id;

    // Record Clinical Deferral (Low Hemoglobin)
    await request('/donor-registration/save', {
      method: 'POST',
      token: clinicalToken,
      body: JSON.stringify({
        registrationId: reg2Id,
        campId: camp.id,
        organisationId: orgA.id,
        currentStep: 3,
        screening: {
          status: 'DEFERRED',
          weightKg: 46,
          hemoglobin: 11.2,
          bloodGroup: 'A_POSITIVE',
          deferralCategory: 'LOW_HEMOGLOBIN',
          remarks: 'Hemoglobin below required 12.5 g/dL threshold',
          screenedById: clinicalUser.user.id,
          medicalOfficerId: clinicalUser.user.id,
        },
      }),
    });

    // Collection staff forbidden from finalizing clinical deferral
    const collDeferRes = await request(`/donor-registration/${reg2Id}/complete`, {
      method: 'POST',
      token: collectionToken,
    });
    assert(collDeferRes.status === 403, 'Test 11.1: Collection staff forbidden from completing clinical deferral (403)');

    // Clinical staff completes deferral
    const clinDeferRes = await request(`/donor-registration/${reg2Id}/complete`, {
      method: 'POST',
      token: clinicalToken,
    });
    assert(clinDeferRes.status === 200, 'Test 11.2: Clinical staff completes deferral successfully (200)');
    assert(clinDeferRes.data?.data?.workflowStatus === 'DEFERRED', 'Workflow status is DEFERRED');
    assert(clinDeferRes.data?.data?.isCompleted === true, 'Deferral registration is marked completed');

    // Confirm NO collection unit exists for deferred donor
    const deferredUnit = await prisma.collectionUnit.findFirst({
      where: {
        donationEvent: {
          donorUser: { phoneNumber: `+91${donor2Phone.slice(-10)}` },
        },
      },
    });
    assert(deferredUnit === null, 'Test 11.3: No collection unit created for deferred donor');

    console.log('\n========================================================================');
    console.log(`  COMPLETION & STABILITY SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================================================\n');
  } finally {
    server.close();
  }

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runCompletionStabilitySuite().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
