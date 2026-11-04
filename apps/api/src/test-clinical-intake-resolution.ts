import { app } from './app';
import { prisma } from './lib/prisma';
import crypto from 'crypto';

const PORT = 4059;
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

async function runClinicalIntakeResolutionSuite() {
  console.log('========================================================================');
  console.log('  RaktaSetu — Clinical Intake Separation & Primary Mobile Validation Tests');
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

  const server = app.listen(PORT);

  try {
    const testRand = crypto.randomBytes(3).toString('hex').toLowerCase();
    const coordPhone = `981${Math.floor(1000000 + Math.random() * 9000000)}`;
    const clinicalPhone = `982${Math.floor(1000000 + Math.random() * 9000000)}`;
    const moPhone = `983${Math.floor(1000000 + Math.random() * 9000000)}`;
    const collectionPhone = `984${Math.floor(1000000 + Math.random() * 9000000)}`;

    async function loginOrCreate(phone: string, name: string) {
      const res = await request('/auth/demo-login', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: phone, otp: '123456' }),
      });
      if (!res.ok) {
        throw new Error(`Failed to login user ${phone}: ${JSON.stringify(res.data)}`);
      }
      const user = res.data?.data?.user;
      const token = res.data?.data?.token;

      if (user?.id) {
        await prisma.user.update({
          where: { id: user.id },
          data: { name },
        });
      }

      return {
        user: { ...user, name },
        token,
      };
    }

    const coordActor = await loginOrCreate(coordPhone, 'Camp Coordinator');
    const clinicalActor = await loginOrCreate(clinicalPhone, 'Nurse Clinical Staff');
    const moActor = await loginOrCreate(moPhone, 'Dr. Sunita Kulkarni, MD');
    const collectionActor = await loginOrCreate(collectionPhone, 'Phlebotomist Collection');

    // Create Organisation
    const org = await prisma.organisation.create({
      data: {
        orgCode: `ORG-CLIN-${testRand}`,
        name: `Clinical Intake Blood Centre ${testRand}`,
        licenseNumber: `LIC-CLIN-${testRand}`,
        districtCode: 521,
        stateCode: 27,
        status: 'VERIFIED',
      },
    });

    // Create Camp
    const camp = await prisma.camp.create({
      data: {
        campCode: `CAMP-CLIN-${testRand}`,
        title: `Community Blood Camp ${testRand}`,
        organizerName: 'Red Cross Foundation',
        targetDate: new Date(Date.now() + 86400000),
        venue: 'Town Hall',
        district: 'Pune',
        districtCode: 521,
        expectedDonors: 50,
        status: 'APPROVED',
        isReadyForCollection: true,
        organisationId: org.id,
      },
    });

    // Assign Organisation Memberships
    await prisma.organisationMembership.createMany({
      data: [
        { userId: coordActor.user.id, organisationId: org.id, role: 'ORG_ADMIN', isActive: true },
        { userId: clinicalActor.user.id, organisationId: org.id, role: 'CLINICAL_STAFF', isActive: true },
        { userId: moActor.user.id, organisationId: org.id, role: 'CLINICAL_STAFF', isActive: true },
        { userId: collectionActor.user.id, organisationId: org.id, role: 'COLLECTION_STAFF', isActive: true },
      ],
    });

    // Assign Camp Staff Assignments
    await prisma.campStaffAssignment.createMany({
      data: [
        { campId: camp.id, userId: coordActor.user.id, role: 'CAMP_COORDINATOR', organisationId: org.id, assignedBy: coordActor.user.id },
        { campId: camp.id, userId: clinicalActor.user.id, role: 'CLINICAL_STAFF', organisationId: org.id, assignedBy: coordActor.user.id },
        { campId: camp.id, userId: moActor.user.id, role: 'CLINICAL_STAFF', organisationId: org.id, assignedBy: coordActor.user.id },
        { campId: camp.id, userId: collectionActor.user.id, role: 'COLLECTION_STAFF', organisationId: org.id, assignedBy: coordActor.user.id },
      ],
    });

    console.log('✓ Dynamic test fixtures setup complete.\n');

    // -------------------------------------------------------------------------
    // TEST 1: Step 1 Primary Mobile Validation
    // -------------------------------------------------------------------------
    console.log('--- Test 1: Step 1 Donor Registration & Validation Integrity ---');

    // Attempting registration without primary mobile must fail
    const invalidRegRes = await request('/donor-registration/save', {
      method: 'POST',
      token: coordActor.token,
      body: JSON.stringify({
        campId: camp.id,
        organisationId: org.id,
        currentStep: 1,
        donorDetails: {
          fullName: 'Test Donor Without Phone',
          gender: 'Male',
          bloodGroup: 'B_POS',
          dateOfBirth: '1995-04-12',
        },
      }),
    });
    assert(
      invalidRegRes.status === 400 &&
      invalidRegRes.data?.error?.message?.includes('Primary mobile number is required to register a donor.'),
      '1. Step 1 new registration strictly rejects missing primary mobile number',
      invalidRegRes.data
    );

    // Valid registration by Camp Coordinator
    const donorMobile = `992${Math.floor(1000000 + Math.random() * 9000000)}`;
    const validRegRes = await request('/donor-registration/save', {
      method: 'POST',
      token: coordActor.token,
      body: JSON.stringify({
        campId: camp.id,
        organisationId: org.id,
        registrationSource: 'CAMP',
        donationType: 'VOLUNTARY',
        currentStep: 1,
        donorDetails: {
          fullName: 'Siddharth Joshi',
          gender: 'Male',
          bloodGroup: 'O_POS',
          dateOfBirth: '1992-07-15',
          primaryMobile: donorMobile,
          city: 'Pune',
          district: 'Pune',
          districtCode: 521,
          state: 'Maharashtra',
          stateCode: 27,
          discoveryConsent: true,
        },
      }),
    });

    assert(validRegRes.status === 200, '2. Camp Coordinator successfully saves Step 1 registration', validRegRes.data);
    const regUuid = validRegRes.data.data?.id;
    const regNumber = validRegRes.data.data?.registrationNumber;
    assert(Boolean(regUuid && regNumber && regNumber.startsWith('REG-')), '3. Registration returned authoritative UUID and Registration Number', { regUuid, regNumber });
    assert(validRegRes.data.data?.workflowStatus === 'COUNSELLING_PENDING', '4. Registration placed into COUNSELLING_PENDING status', validRegRes.data.data?.workflowStatus);

    // -------------------------------------------------------------------------
    // TEST 2: Dual Identifier Retrieval (UUID & REG-Number)
    // -------------------------------------------------------------------------
    console.log('\n--- Test 2: Dual Identifier Lookup by Clinical Staff ---');

    // Retrieve via UUID
    const getByUuidRes = await request(`/donor-registration/${regUuid}`, {
      method: 'GET',
      token: clinicalActor.token,
    });
    assert(getByUuidRes.status === 200, '5. Clinical Staff retrieves registration by UUID id', getByUuidRes.data);
    assert(getByUuidRes.data.data?.donorDetails?.primaryMobile === donorMobile, '6. Persisted primary mobile is present in retrieved record', getByUuidRes.data.data?.donorDetails?.primaryMobile);

    // Retrieve via human-readable registration number (e.g. REG-202610-XXXXXX)
    const getByRegNumRes = await request(`/donor-registration/${regNumber}`, {
      method: 'GET',
      token: clinicalActor.token,
    });
    assert(getByRegNumRes.status === 200, '7. Clinical Staff retrieves registration by registrationNumber (e.g. REG-...)', getByRegNumRes.data);
    assert(getByRegNumRes.data.data?.id === regUuid, '8. Dual lookup resolves identical primary record', { expected: regUuid, actual: getByRegNumRes.data.data?.id });

    // -------------------------------------------------------------------------
    // TEST 3: Clinical Intake Queue Visibility
    // -------------------------------------------------------------------------
    console.log('\n--- Test 3: Clinical Intake Queue Visibility ---');

    const queueRes = await request(`/donor-registration/queue?campId=${camp.id}&stage=clinical`, {
      method: 'GET',
      token: clinicalActor.token,
    });
    assert(queueRes.status === 200, '9. Clinical Staff successfully queries clinical queue', queueRes.data);
    const inQueue = (queueRes.data.data?.items || []).some((item: any) => item.id === regUuid && item.registrationNumber === regNumber);
    assert(inQueue, '10. Donor record is visible in clinical intake queue for evaluation');

    // -------------------------------------------------------------------------
    // TEST 4: Clinical Counselling Submission Without Re-submitting Mobile
    // -------------------------------------------------------------------------
    console.log('\n--- Test 4: Clinical Counselling Draft & Advance (No Step 1 Re-Validation) ---');

    const counsellingPayload = {
      registrationId: regNumber, // Pass REG-... to verify saveRegistration accepts registration number
      campId: camp.id,
      organisationId: org.id,
      currentStep: 2,
      counsellingReviewedById: clinicalActor.user.id,
      counsellingStatus: 'APPROVED',
      counsellingRemarks: 'Donor evaluated and cleared for vitals screening.',
      canIssuePlasma: true,
      counsellingAnswers: [
        { code: 'Q01', question: 'Are you feeling well today?', answer: true, reviewStatus: 'REVIEWED_APPROVED', staffEdited: true },
      ],
      // Strictly OMIT donorDetails (simulates clinical staff not re-sending demographic fields)
    };

    const saveCounsellingRes = await request('/donor-registration/save', {
      method: 'POST',
      token: clinicalActor.token,
      body: JSON.stringify(counsellingPayload),
    });

    assert(
      saveCounsellingRes.status === 200,
      '11. Clinical Staff saves counselling draft without needing primaryMobile or re-submitting Step 1',
      saveCounsellingRes.data
    );
    assert(saveCounsellingRes.data.data?.workflowStatus === 'SCREENING_PENDING', '12. Workflow advances to SCREENING_PENDING', saveCounsellingRes.data.data?.workflowStatus);
    assert(saveCounsellingRes.data.data?.donorDetails?.primaryMobile === donorMobile, '13. Original donor primary mobile was preserved and not overwritten', saveCounsellingRes.data.data?.donorDetails?.primaryMobile);
    assert(saveCounsellingRes.data.data?.donorDetails?.fullName === 'Siddharth Joshi', '14. Original donor full name was preserved', saveCounsellingRes.data.data?.donorDetails?.fullName);

    // -------------------------------------------------------------------------
    // TEST 5: Medical Review Pending Transition
    // -------------------------------------------------------------------------
    console.log('\n--- Test 5: Medical Review Pending Status Workflow ---');

    // Screening with borderline vitals sets MEDICAL_REVIEW_PENDING
    const reviewPendingPayload = {
      registrationId: regUuid,
      campId: camp.id,
      organisationId: org.id,
      currentStep: 3,
      screening: {
        screenedById: clinicalActor.user.id,
        medicalOfficerId: moActor.user.id,
        status: 'PENDING', // Neither FIT nor DEFERRED yet
        weightKg: 62,
        hemoglobin: 13.5,
        systolicBp: 138,
        diastolicBp: 88,
        pulseBpm: 76,
        temperatureCelsius: 37.0,
        heightCm: 172,
        bothArmsInspected: true,
        postDonationTipsGiven: true,
        remarks: 'Borderline blood pressure, referred for Doctor / Medical Officer review.',
      },
    };

    const reviewPendingRes = await request('/donor-registration/save', {
      method: 'POST',
      token: clinicalActor.token,
      body: JSON.stringify(reviewPendingPayload),
    });

    assert(reviewPendingRes.status === 200, '15. Clinical Staff saves physical screening with status PENDING', reviewPendingRes.data);
    assert(
      reviewPendingRes.data.data?.workflowStatus === 'MEDICAL_REVIEW_PENDING',
      '16. Workflow correctly transitions to MEDICAL_REVIEW_PENDING for doctor review',
      reviewPendingRes.data.data?.workflowStatus
    );

    // Check that clinical staff can open the record in MEDICAL_REVIEW_PENDING
    const medReviewRecordRes = await request(`/donor-registration/${regNumber}`, {
      method: 'GET',
      token: moActor.token,
    });
    assert(medReviewRecordRes.status === 200, '17. Medical Officer retrieves registration in MEDICAL_REVIEW_PENDING status', medReviewRecordRes.data);
    assert(medReviewRecordRes.data.data?.workflowStatus === 'MEDICAL_REVIEW_PENDING', '18. Workflow status confirms MEDICAL_REVIEW_PENDING');

    // Medical Officer clears donor as FIT
    const fitScreeningPayload = {
      registrationId: regUuid,
      campId: camp.id,
      organisationId: org.id,
      currentStep: 3,
      screening: {
        screenedById: clinicalActor.user.id,
        medicalOfficerId: moActor.user.id,
        status: 'FIT',
        weightKg: 62,
        hemoglobin: 13.5,
        systolicBp: 125,
        diastolicBp: 82,
        pulseBpm: 72,
        temperatureCelsius: 36.8,
        heightCm: 172,
        bothArmsInspected: true,
        postDonationTipsGiven: true,
        remarks: 'Re-checked after rest: BP normal (125/82). Clinically certified FIT for donation.',
      },
    };

    const fitRes = await request('/donor-registration/save', {
      method: 'POST',
      token: moActor.token,
      body: JSON.stringify(fitScreeningPayload),
    });

    assert(fitRes.status === 200, '19. Medical Officer clears donor as FIT', fitRes.data);
    assert(fitRes.data.data?.workflowStatus === 'CLEARED_FOR_COLLECTION', '20. Workflow transitions to CLEARED_FOR_COLLECTION', fitRes.data.data?.workflowStatus);

    // -------------------------------------------------------------------------
    // TEST 6: Collection Boundaries Preserved
    // -------------------------------------------------------------------------
    console.log('\n--- Test 6: Collection Boundaries & Invariants ---');

    const illegalCollectionAlteration = await request('/donor-registration/save', {
      method: 'POST',
      token: collectionActor.token,
      body: JSON.stringify({
        registrationId: regUuid,
        campId: camp.id,
        organisationId: org.id,
        currentStep: 4,
        screening: { status: 'DEFERRED' },
      }),
    });
    assert(
      [400, 403].includes(illegalCollectionAlteration.status) &&
      illegalCollectionAlteration.data?.error?.message?.includes('Permission denied: Collection staff cannot alter medical clearance decisions.'),
      '21. Collection Staff is strictly forbidden from altering medical screening decisions'
    );

    // Summary
    console.log('\n========================================================================');
    console.log(`  Tests Completed: ${passed} Passed, ${failed} Failed`);
    console.log('========================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runClinicalIntakeResolutionSuite();
