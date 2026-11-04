import { app } from './app';
import { prisma } from './lib/prisma';
import crypto from 'crypto';

const PORT = 4058;
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

async function runRoleHandoffVerificationSuite() {
  console.log('========================================================================');
  console.log('  RaktaSetu — Role-Based Donor Registration Workflow & Staff Dropdown Tests');
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
    const adminPhone = `985${Math.floor(1000000 + Math.random() * 9000000)}`;
    const unauthorizedPhone = `986${Math.floor(1000000 + Math.random() * 9000000)}`;

    async function loginOrCreate(phone: string, name: string) {
      const res = await request('/auth/demo-login', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: phone, otp: '123456' }),
      });
      if (!res.ok) {
        throw new Error(`Failed to login/create user ${phone}: ${JSON.stringify(res.data)}`);
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
    const moActor = await loginOrCreate(moPhone, 'Dr. Rajesh Deshmukh, MD');
    const collectionActor = await loginOrCreate(collectionPhone, 'Phlebotomist Collection');
    const adminActor = await loginOrCreate(adminPhone, 'Blood Centre Admin');
    const unauthActor = await loginOrCreate(unauthorizedPhone, 'External Stranger');

    // Create Organisation
    const org = await prisma.organisation.create({
      data: {
        orgCode: `ORG-WF-${testRand}`,
        name: `Test Apex Blood Centre ${testRand}`,
        licenseNumber: `LIC-WF-${testRand}`,
        districtCode: 521,
        stateCode: 27,
        status: 'VERIFIED',
      },
    });

    // Create Camp
    const camp = await prisma.camp.create({
      data: {
        campCode: `CAMP-WF-${testRand}`,
        title: `Mega Blood Drive ${testRand}`,
        organizerName: 'Apex Health Trust',
        targetDate: new Date(Date.now() + 86400000),
        venue: 'City Civic Centre',
        district: 'Pune',
        districtCode: 521,
        expectedDonors: 100,
        status: 'APPROVED',
        isReadyForCollection: true,
        organisationId: org.id,
      },
    });

    // Assign Organisation Memberships
    await prisma.organisationMembership.createMany({
      data: [
        { userId: adminActor.user.id, organisationId: org.id, role: 'ORG_ADMIN', isActive: true },
        { userId: clinicalActor.user.id, organisationId: org.id, role: 'CLINICAL_STAFF', isActive: true },
        { userId: moActor.user.id, organisationId: org.id, role: 'CLINICAL_STAFF', isActive: true },
      ],
    });

    // Assign Camp Staff Assignments
    await prisma.campStaffAssignment.createMany({
      data: [
        { campId: camp.id, userId: coordActor.user.id, role: 'CAMP_COORDINATOR', organisationId: org.id, assignedBy: adminActor.user.id },
        { campId: camp.id, userId: clinicalActor.user.id, role: 'CLINICAL_STAFF', organisationId: org.id, assignedBy: adminActor.user.id },
        { campId: camp.id, userId: moActor.user.id, role: 'CLINICAL_STAFF', organisationId: org.id, assignedBy: adminActor.user.id },
        { campId: camp.id, userId: collectionActor.user.id, role: 'COLLECTION_STAFF', organisationId: org.id, assignedBy: adminActor.user.id },
      ],
    });

    console.log('✓ Dynamic test fixtures setup complete.\n');

    // -------------------------------------------------------------------------
    // TEST 1: Clinical Staff Dropdown Loading (ISSUE 1)
    // -------------------------------------------------------------------------
    console.log('--- Test Group 1: Staff Dropdowns & Eligibility ---');

    const staffRes = await request(`/donor-registration/clinical-staff?organisationId=${org.id}&campId=${camp.id}`, {
      method: 'GET',
      token: coordActor.token,
    });

    assert(staffRes.status === 200, '1. GET /clinical-staff succeeds for authorised camp coordinator', staffRes.data);
    const staffList = staffRes.data?.data || [];
    assert(staffList.length >= 2, '2. Staff dropdown returns eligible staff members', staffList.length);

    const hasClinicalNurse = staffList.some((s: any) => s.id === clinicalActor.user.id);
    assert(hasClinicalNurse, '3. Counselled By and Screened By includes active clinical staff', clinicalActor.user.name);

    const moMember = staffList.find((s: any) => s.id === moActor.user.id);
    assert(moMember && moMember.isMedicalOfficer === true, '4. Medical Officer dropdown accurately tags certified doctor as isMedicalOfficer: true', moMember);

    const nurseMember = staffList.find((s: any) => s.id === clinicalActor.user.id);
    assert(nurseMember && nurseMember.isMedicalOfficer === false, '5. General clinical nurse is NOT tagged as a medical officer', nurseMember);

    // Empty state / parameter check
    const missingParamRes = await request('/donor-registration/clinical-staff', {
      method: 'GET',
      token: coordActor.token,
    });
    assert(missingParamRes.status === 400 && missingParamRes.data?.error?.code === 'MISSING_PARAM', '6. Missing organisationId and campId returns clean 400 error state');

    // Unauthorized caller rejection
    const unauthStaffRes = await request(`/donor-registration/clinical-staff?organisationId=${org.id}&campId=${camp.id}`, {
      method: 'GET',
      token: unauthActor.token,
    });
    assert(unauthStaffRes.status === 403, '7. Unauthorised user cannot access staff list (403 Forbidden)');

    // -------------------------------------------------------------------------
    // TEST 2: Questionnaire Defaults & Demo Mode (ISSUE 2)
    // -------------------------------------------------------------------------
    console.log('\n--- Test Group 2: Counselling Questionnaire & Demo Defaults ---');

    // Production mode questions
    const prodQRes = await request('/donor-registration/counselling-questions?gender=Male&mode=production', {
      method: 'GET',
      token: clinicalActor.token,
    });
    assert(prodQRes.status === 200 && prodQRes.data?.data?.length === 26, '8. Production questionnaire loads all 26 standard questions');
    const allProdUnanswered = prodQRes.data.data.filter((q: any) => q.type !== 'YES_NO_NA').every((q: any) => q.answer === null && q.reviewStatus === 'UNANSWERED');
    assert(allProdUnanswered, '9. Production mode does NOT silently prefill unverified answers (all start unanswered)');

    // Demo mode questions
    const demoQRes = await request('/donor-registration/counselling-questions?gender=Male&mode=demo', {
      method: 'GET',
      token: clinicalActor.token,
    });
    assert(demoQRes.status === 200 && demoQRes.data?.isDemo === true, '10. Demo mode endpoint returns valid demo questionnaire defaults');
    const demoAnswers = demoQRes.data.data;
    const hasValidDemoAnswers = demoAnswers.every((q: any) =>
      q.type === 'YES_NO_NA'
        ? q.answer === 'Not applicable' && q.reviewStatus === 'APPROVED'
        : q.answer !== null && q.reviewStatus === 'DEMO_DRAFT' && q.isDemoDefault === true
    );
    assert(hasValidDemoAnswers, '11. Demo questions are prefilled with editable healthy draft answers');

    const multiChoiceQ = demoAnswers.find((q: any) => q.code === 'Q07');
    assert(multiChoiceQ && multiChoiceQ.selectedOptions.includes('None of these'), '12. Multiple choice question Q07 has valid choice from definition ("None of these")');

    // -------------------------------------------------------------------------
    // TEST 3: Camp Coordinator Handoff After Step 1 (ISSUE 3)
    // -------------------------------------------------------------------------
    console.log('\n--- Test Group 3: Camp Coordinator Registration & Handoff ---');

    const donorPhone = `99${Math.floor(10000000 + Math.random() * 90000000)}`;
    const step1Payload = {
      campId: camp.id,
      organisationId: org.id,
      registrationSource: 'CAMP',
      donationType: 'VOLUNTARY',
      currentStep: 1,
      donorDetails: {
        fullName: 'Rohan Sharma',
        gender: 'Male',
        bloodGroup: 'B_POS',
        dateOfBirth: '1995-05-15',
        primaryMobile: donorPhone,
        address: '123 MG Road, Pune',
        pinCode: '411001',
      },
      consent: {
        consentGiven: true,
        version: 'v1.0',
      },
    };

    const coordSaveRes = await request('/donor-registration/save', {
      method: 'POST',
      token: coordActor.token,
      body: JSON.stringify(step1Payload),
    });

    assert(coordSaveRes.status === 200 && coordSaveRes.data?.success === true, '13. Coordinator successfully saves Step 1 donor details', coordSaveRes.data);
    const regId = coordSaveRes.data.data.id;
    const regNumber = coordSaveRes.data.data.registrationNumber;
    assert(Boolean(regNumber) && regNumber.startsWith('REG-'), '14. Persisted record contains authoritative registration number', regNumber);
    assert(coordSaveRes.data.data.workflowStatus === 'COUNSELLING_PENDING', '15. Initial workflow status is COUNSELLING_PENDING', coordSaveRes.data.data.workflowStatus);

    // Verify coordinator cannot submit clinical screening or collection
    const coordIllegalSave = await request('/donor-registration/save', {
      method: 'POST',
      token: coordActor.token,
      body: JSON.stringify({
        ...step1Payload,
        registrationId: regId,
        currentStep: 3,
        screening: { status: 'FIT', screenedById: clinicalActor.user.id },
      }),
    });
    assert([400, 403].includes(coordIllegalSave.status) && coordIllegalSave.data?.error?.message?.includes('Permission denied: Camp Coordinator is not authorized'), '16. Coordinator is strictly prohibited from recording clinical screening');

    // Verify record appears in Clinical Intake Queue
    const clinicalQueueRes = await request(`/donor-registration/queue?campId=${camp.id}&step=2`, {
      method: 'GET',
      token: clinicalActor.token,
    });
    assert(clinicalQueueRes.status === 200, '17. Clinical staff can fetch pending intake queue');
    const inQueue = (clinicalQueueRes.data.data?.items || []).some((item: any) => item.id === regId);
    assert(inQueue, '18. Saved registration is visible in clinical intake queue for evaluation');

    // -------------------------------------------------------------------------
    // TEST 4: Clinical Staff Step 2 & Step 3 Handoff (ISSUE 4 & ISSUE 5)
    // -------------------------------------------------------------------------
    console.log('\n--- Test Group 4: Clinical Counselling, Screening & Medical Decision ---');

    // Step 2: Save Counselling
    const step2Payload = {
      registrationId: regId,
      campId: camp.id,
      organisationId: org.id,
      currentStep: 2,
      donorDetails: step1Payload.donorDetails,
      counsellingReviewedById: clinicalActor.user.id,
      counsellingStatus: 'APPROVED',
      counsellingRemarks: 'Donor confirmed in good health, no identified concerns.',
      counsellingAnswers: demoAnswers,
    };

    const clinicalSaveStep2 = await request('/donor-registration/save', {
      method: 'POST',
      token: clinicalActor.token,
      body: JSON.stringify(step2Payload),
    });
    assert(clinicalSaveStep2.status === 200 && clinicalSaveStep2.data.data.workflowStatus === 'SCREENING_PENDING', '19. Clinical staff saves Step 2 counselling and advances status to SCREENING_PENDING');

    // Step 3: Medical Officer and Screening Save
    const step3Payload = {
      registrationId: regId,
      campId: camp.id,
      organisationId: org.id,
      currentStep: 3,
      donorDetails: step1Payload.donorDetails,
      screening: {
        screenedById: clinicalActor.user.id,
        medicalOfficerId: moActor.user.id,
        status: 'FIT',
        weightKg: 68,
        hemoglobin: 14.5,
        systolicBp: 120,
        diastolicBp: 80,
        pulseBpm: 72,
        temperatureCelsius: 36.8,
        bothArmsInspected: true,
        postDonationTipsGiven: true,
        remarks: 'Normal vitals, eligible for whole blood donation.',
      },
    };

    // Clinical staff submits Step 3 without collection fields
    const clinicalSaveStep3 = await request('/donor-registration/save', {
      method: 'POST',
      token: clinicalActor.token,
      body: JSON.stringify(step3Payload),
    });

    assert(clinicalSaveStep3.status === 200, '20. Clinical staff completes screening without collection error (Issue 5 Fixed)', clinicalSaveStep3.data);
    assert(clinicalSaveStep3.data.data.workflowStatus === 'CLEARED_FOR_COLLECTION', '21. Donor status transitioned to CLEARED_FOR_COLLECTION', clinicalSaveStep3.data.data.workflowStatus);

    // Verify clinical staff is blocked if trying to submit collection outcome
    const clinicalIllegalCollection = await request('/donor-registration/save', {
      method: 'POST',
      token: clinicalActor.token,
      body: JSON.stringify({
        ...step3Payload,
        currentStep: 4,
        collection: { status: 'COLLECTED', bagType: 'DB-CPDA-350' },
      }),
    });
    assert([400, 403].includes(clinicalIllegalCollection.status) && clinicalIllegalCollection.data?.error?.message?.includes('Permission denied: Clinical staff is not authorized to record phlebotomy or collection outcomes.'), '22. Clinical staff is rejected with 403 Forbidden if attempting to record phlebotomy collection outcomes');

    // Verify donor appears in Collection Queue
    const collectionQueueRes = await request(`/donor-registration/queue?campId=${camp.id}&step=4`, {
      method: 'GET',
      token: collectionActor.token,
    });
    assert(collectionQueueRes.status === 200, '23. Collection staff fetches collection-ready queue');
    const inCollectionQueue = (collectionQueueRes.data.data?.items || []).some((item: any) => item.id === regId);
    assert(inCollectionQueue, '24. Cleared donor is now present in collection-ready queue');

    // -------------------------------------------------------------------------
    // TEST 5: Collection Staff Submission (ISSUE 6 & ISSUE 7)
    // -------------------------------------------------------------------------
    console.log('\n--- Test Group 5: Collection Staff Submission & Invariants ---');

    const step4Payload = {
      registrationId: regId,
      campId: camp.id,
      organisationId: org.id,
      currentStep: 4,
      collection: {
        status: 'COLLECTED',
        bagType: 'DB-CPDA-350',
        manufacturer: 'Terumo Penpol',
        lotNumber: 'LOT-202610-A',
        segmentNumber: 'SEG-9912',
        volumeMl: 350,
        durationMinutes: 8,
        isLessQuantity: false,
        adverseReaction: false,
        timeRefreshmentsProvided: '10:30 AM',
        exitTime: '10:45 AM',
        remarks: 'Successful donation.',
      },
    };

    const collectionSaveRes = await request('/donor-registration/save', {
      method: 'POST',
      token: collectionActor.token,
      body: JSON.stringify(step4Payload),
    });

    assert(collectionSaveRes.status === 200, '25. Collection Staff saves collection without medical clearance error (Issue 6 Fixed)', collectionSaveRes.data);
    assert(collectionSaveRes.data.data.workflowStatus === 'COLLECTION_COMPLETED', '26. Workflow status is now COLLECTION_COMPLETED', collectionSaveRes.data.data.workflowStatus);
    assert(Boolean(collectionSaveRes.data.data.collection?.unitNumber), '27. Traceable collection unit number generated', collectionSaveRes.data.data.collection?.unitNumber);
    assert(Boolean(collectionSaveRes.data.data.collection?.barcode), '28. Traceable barcode label generated', collectionSaveRes.data.data.collection?.barcode);

    // Verify Collection Staff cannot alter medical clearance
    const collectionIllegalAlteration = await request('/donor-registration/save', {
      method: 'POST',
      token: collectionActor.token,
      body: JSON.stringify({
        registrationId: regId,
        campId: camp.id,
        organisationId: org.id,
        currentStep: 4,
        screening: { status: 'DEFERRED' },
      }),
    });
    assert([400, 403].includes(collectionIllegalAlteration.status) && collectionIllegalAlteration.data?.error?.message?.includes('Permission denied: Collection staff cannot alter medical clearance decisions.'), '29. Collection Staff is strictly forbidden from altering medical clearance decisions');

    // Verify Deferral prevents collection
    const deferredDonorPhone = `97${Math.floor(10000000 + Math.random() * 90000000)}`;
    const defRegRes = await request('/donor-registration/save', {
      method: 'POST',
      token: coordActor.token,
      body: JSON.stringify({
        campId: camp.id,
        organisationId: org.id,
        currentStep: 1,
        donorDetails: {
          fullName: 'Deferred Test Donor',
          gender: 'Female',
          dateOfBirth: '2000-01-01',
          primaryMobile: deferredDonorPhone,
        },
      }),
    });
    const defRegId = defRegRes.data.data.id;

    // Doctor defers donor in Step 3 due to low hemoglobin
    await request('/donor-registration/save', {
      method: 'POST',
      token: clinicalActor.token,
      body: JSON.stringify({
        registrationId: defRegId,
        campId: camp.id,
        organisationId: org.id,
        currentStep: 3,
        screening: {
          screenedById: clinicalActor.user.id,
          medicalOfficerId: moActor.user.id,
          status: 'DEFERRED',
          weightKg: 50,
          hemoglobin: 11.0,
          deferralCategory: 'LOW_HEMOGLOBIN',
          deferralReason: 'Hemoglobin 11.0 g/dL is below criteria',
        },
      }),
    });

    // Collection staff attempts to collect on deferred donor
    const illegalDeferredCollect = await request('/donor-registration/save', {
      method: 'POST',
      token: collectionActor.token,
      body: JSON.stringify({
        registrationId: defRegId,
        campId: camp.id,
        organisationId: org.id,
        currentStep: 4,
        collection: { status: 'COLLECTED', bagType: 'SB-350', volumeMl: 350 },
      }),
    });
    assert(illegalDeferredCollect.status === 400 && illegalDeferredCollect.data?.error?.message?.includes('Collection rejected'), '30. Deferred donor is strictly rejected from blood collection');

    console.log('\n========================================================================');
    console.log(`  SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================================================\n');
  } finally {
    server.close();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runRoleHandoffVerificationSuite().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
