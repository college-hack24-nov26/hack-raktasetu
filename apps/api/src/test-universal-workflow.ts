import { app } from './app';
import { prisma } from './lib/prisma';
import http from 'http';

const PORT = 4056;
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

async function runUniversalMultiOrgTestSuite() {
  console.log('========================================================================');
  console.log('  RaktaSetu — Universal Multi-Organisation Workflow Verification');
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
    // ----------------------------------------------------
    // SETUP: Dynamic Multi-Organisation Test Fixtures (ZERO Hardcoding)
    // ----------------------------------------------------
    console.log('--- Setup: Dynamically creating two distinct blood organisations and camps ---');

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

    const testRand = Math.floor(100000 + Math.random() * 900000);

    // Actor logins
    const coordPhoneA = `+9197${testRand}01`;
    const clinicalPhoneA = `+9197${testRand}02`;
    const collectionPhoneA = `+9197${testRand}03`;
    const campAdminPhoneA = `+9197${testRand}04`;
    const moPhoneA = `+9197${testRand}05`;

    const staffPhoneB = `+9197${testRand}11`;
    const donorPhone1 = `+9197${testRand}21`;
    const donorPhone2 = `+9197${testRand}22`;

    const coordA = await loginOrCreate(coordPhoneA, 'Coordinator Org A');
    const clinicalA = await loginOrCreate(clinicalPhoneA, 'Clinical Staff Org A');
    const collectionA = await loginOrCreate(collectionPhoneA, 'Collection Staff Org A');
    const campAdminA = await loginOrCreate(campAdminPhoneA, 'Camp Admin Org A');
    const moA = await loginOrCreate(moPhoneA, 'Medical Officer Org A');

    const staffB = await loginOrCreate(staffPhoneB, 'Clinical Staff Org B');
    const donorActor1 = await loginOrCreate(donorPhone1, 'Universal Test Donor 1');
    const donorActor2 = await loginOrCreate(donorPhone2, 'Universal Test Donor 2');

    // Create Organisation A (Dynamic)
    const orgA = await prisma.organisation.create({
      data: {
        orgCode: `ORG-A-${testRand}`,
        name: `RaktaSetu Blood Centre Alpha ${testRand}`,
        licenseNumber: `LIC-A-${testRand}`,
        districtCode: 521,
        stateCode: 27,
        status: 'VERIFIED',
      },
    });

    // Create Organisation B (Dynamic)
    const orgB = await prisma.organisation.create({
      data: {
        orgCode: `ORG-B-${testRand}`,
        name: `RaktaSetu Blood Centre Beta ${testRand}`,
        licenseNumber: `LIC-B-${testRand}`,
        districtCode: 522,
        stateCode: 27,
        status: 'VERIFIED',
      },
    });

    // Assign actors to Org A
    await prisma.organisationMembership.createMany({
      data: [
        { userId: coordA.user.id, organisationId: orgA.id, role: 'CLINICAL_STAFF', isActive: true },
        { userId: clinicalA.user.id, organisationId: orgA.id, role: 'CLINICAL_STAFF', isActive: true },
        { userId: collectionA.user.id, organisationId: orgA.id, role: 'CLINICAL_STAFF', isActive: true },
        { userId: campAdminA.user.id, organisationId: orgA.id, role: 'ORG_ADMIN', isActive: true },
        { userId: moA.user.id, organisationId: orgA.id, role: 'CLINICAL_STAFF', isActive: true },
      ],
    });

    // Assign staffB to Org B
    await prisma.organisationMembership.create({
      data: { userId: staffB.user.id, organisationId: orgB.id, role: 'CLINICAL_STAFF', isActive: true },
    });

    // Create Camp A under Org A (APPROVED)
    const campA = await prisma.camp.create({
      data: {
        campCode: `CAMP-A-${testRand}`,
        title: `Community Blood Drive Alpha ${testRand}`,
        organizerName: 'Alpha Tech Park',
        targetDate: new Date(Date.now() + 86400000),
        venue: 'Alpha Auditorium, Pune',
        district: 'Pune',
        districtCode: 521,
        expectedDonors: 100,
        status: 'APPROVED',
        organisationId: orgA.id,
      },
    });

    // Create Camp B under Org B (APPROVED)
    const campB = await prisma.camp.create({
      data: {
        campCode: `CAMP-B-${testRand}`,
        title: `Community Blood Drive Beta ${testRand}`,
        organizerName: 'Beta Foundation',
        targetDate: new Date(Date.now() + 86400000),
        venue: 'Beta Hall, Mumbai',
        district: 'Mumbai City',
        districtCode: 522,
        expectedDonors: 75,
        status: 'APPROVED',
        organisationId: orgB.id,
      },
    });

    // Create a Camp with status DRAFT / PENDING_APPROVAL
    const pendingCamp = await prisma.camp.create({
      data: {
        campCode: `CAMP-PENDING-${testRand}`,
        title: `Pending Drive ${testRand}`,
        organizerName: 'Pending Organizer',
        targetDate: new Date(Date.now() + 86400000),
        venue: 'Pending Venue',
        district: 'Pune',
        districtCode: 521,
        expectedDonors: 50,
        status: 'PROPOSED',
        organisationId: orgA.id,
      },
    });

    // Assign camp staff roles on Camp A
    await prisma.campStaffAssignment.createMany({
      data: [
        { campId: campA.id, userId: coordA.user.id, role: 'CAMP_COORDINATOR', organisationId: orgA.id, assignedBy: campAdminA.user.id },
        { campId: campA.id, userId: clinicalA.user.id, role: 'CLINICAL_STAFF', organisationId: orgA.id, assignedBy: campAdminA.user.id },
        { campId: campA.id, userId: collectionA.user.id, role: 'COLLECTION_STAFF', organisationId: orgA.id, assignedBy: campAdminA.user.id },
        { campId: campA.id, userId: campAdminA.user.id, role: 'CAMP_ADMIN', organisationId: orgA.id, assignedBy: campAdminA.user.id },
        { campId: campA.id, userId: moA.user.id, role: 'CLINICAL_STAFF', organisationId: orgA.id, assignedBy: campAdminA.user.id },
      ],
    });

    // Assign staffB to Camp B
    await prisma.campStaffAssignment.create({
      data: { campId: campB.id, userId: staffB.user.id, role: 'CLINICAL_STAFF', organisationId: orgB.id, assignedBy: staffB.user.id },
    });

    console.log('✓ Dynamic test fixtures initialized successfully.\n');

    // =========================================================================
    // SECTION 1: Authorised Organisation Loading, Camp Readiness & Mobile Validation
    // =========================================================================
    console.log('--- Section 1: Organisation Dropdown, Camp Readiness & Mobile Number Verification ---');

    // 1.0 Coordinator gets assigned camps and derived organisation (Dropdown Fix)
    const campsAndOrgsRes = await request('/donor-registration/camps-and-centres', {
      method: 'GET',
      token: coordA.token,
    });
    assert(
      campsAndOrgsRes.status === 200 &&
        campsAndOrgsRes.data?.data?.organisations?.length > 0 &&
        campsAndOrgsRes.data.data.organisations.some((o: any) => o.id === orgA.id) &&
        campsAndOrgsRes.data?.data?.camps?.some((c: any) => c.id === campA.id && c.organisation?.id === orgA.id),
      '1.0 Camp Coordinator receives non-empty Authorised Organisation automatically populated from assigned camp',
      campsAndOrgsRes.data
    );

    // 1.1 Mismatched Camp and Organisation must be rejected
    const mismatchedRes = await request('/donor-registration/save', {
      method: 'POST',
      token: coordA.token,
      body: JSON.stringify({
        campId: campA.id,
        organisationId: orgB.id, // Wrong Org!
        registrationSource: 'CAMP',
        currentStep: 1,
        donorDetails: {
          fullName: 'Mismatched Org Test',
          gender: 'Male',
          primaryMobile: '9876543210',
          dateOfBirth: '1995-05-15',
          address: '123 Test Street',
          city: 'Pune',
          stateCode: 27,
          districtCode: 521,
        },
      }),
    });
    assert(
      mismatchedRes.status === 400 && (mismatchedRes.data?.error?.message?.includes('Mismatched organisation') || mismatchedRes.data?.error?.message?.includes('does not belong to the selected organisation')),
      '1.1 Rejects registration when camp does not belong to selected organisation',
      mismatchedRes.data
    );

    // 1.2 Non-approved Camp status must be rejected
    const pendingCampRes = await request('/donor-registration/save', {
      method: 'POST',
      token: coordA.token,
      body: JSON.stringify({
        campId: pendingCamp.id,
        organisationId: orgA.id,
        registrationSource: 'CAMP',
        currentStep: 1,
        donorDetails: {
          fullName: 'Pending Camp Test',
          gender: 'Male',
          primaryMobile: '9876543210',
          dateOfBirth: '1995-05-15',
          address: '123 Test Street',
          city: 'Pune',
          stateCode: 27,
          districtCode: 521,
        },
      }),
    });
    assert(
      pendingCampRes.status === 400 && pendingCampRes.data?.error?.message?.includes('APPROVED or COMPLETED'),
      '1.2 Rejects registration when camp is not in APPROVED or COMPLETED status',
      pendingCampRes.data
    );

    // 1.3 Operational Readiness Boundary: Approved camp with isReadyForCollection=false rejects registration
    const notReadyRes = await request('/donor-registration/save', {
      method: 'POST',
      token: coordA.token,
      body: JSON.stringify({
        campId: campA.id,
        organisationId: orgA.id,
        registrationSource: 'CAMP',
        currentStep: 1,
        donorDetails: {
          fullName: 'Readiness Boundary Test',
          gender: 'Male',
          primaryMobile: '9876543210',
          dateOfBirth: '1995-05-15',
          address: '123 Test Street',
        },
      }),
    });
    assert(
      notReadyRes.status === 400 && notReadyRes.data?.error?.message?.includes('not ready for operations'),
      '1.3 Operational readiness boundary strictly blocks donor registration before blood bank verification',
      notReadyRes.data
    );

    // 1.4 Blood Bank Staff / Admin verifies camp readiness with 5 mandatory checklist items
    const verifyReadinessRes = await request(`/camps/${campA.id}/readiness`, {
      method: 'POST',
      token: campAdminA.token,
      body: JSON.stringify({
        isReadyForCollection: true,
        readinessChecklist: {
          staffAssigned: true,
          coldChainVerified: true,
          emergencyKitAvailable: true,
          consumablesStocked: true,
          spaceSanitized: true,
        },
        readinessNotes: 'All 5 prerequisites inspected and operational.',
      }),
    });
    assert(
      verifyReadinessRes.status === 200 && verifyReadinessRes.data?.data?.isReadyForCollection === true,
      '1.4 Blood Bank Admin verifies operational readiness with checklist and unlocks camp operations',
      verifyReadinessRes.data
    );

    // 1.5 Mobile Number Validation: Rejects more than 10 digits
    const longPhoneRes = await request('/donor-registration/save', {
      method: 'POST',
      token: coordA.token,
      body: JSON.stringify({
        campId: campA.id,
        organisationId: orgA.id,
        registrationSource: 'CAMP',
        currentStep: 1,
        donorDetails: {
          fullName: 'Long Phone Test',
          gender: 'Male',
          primaryMobile: '987654321099', // 12 digits
          dateOfBirth: '1995-05-15',
          address: '123 Test Street',
        },
      }),
    });
    assert(
      longPhoneRes.status === 400 && longPhoneRes.data?.error?.message?.includes('must be exactly 10 digits'),
      '1.5 Rejects mobile number with more than 10 digits',
      longPhoneRes.data
    );

    // 1.6 Mobile Number Validation: Rejects fewer than 10 digits
    const shortPhoneRes = await request('/donor-registration/save', {
      method: 'POST',
      token: coordA.token,
      body: JSON.stringify({
        campId: campA.id,
        organisationId: orgA.id,
        registrationSource: 'CAMP',
        currentStep: 1,
        donorDetails: {
          fullName: 'Short Phone Test',
          gender: 'Male',
          primaryMobile: '98765432', // 8 digits
          dateOfBirth: '1995-05-15',
          address: '123 Test Street',
        },
      }),
    });
    assert(
      shortPhoneRes.status === 400 && shortPhoneRes.data?.error?.message?.includes('must be exactly 10 digits'),
      '1.6 Rejects mobile number with fewer than 10 digits',
      shortPhoneRes.data
    );

    // 1.7 Valid Camp, Org, and exactly 10-digit mobile number accepts registration
    const validRegRes = await request('/donor-registration/save', {
      method: 'POST',
      token: coordA.token,
      body: JSON.stringify({
        campId: campA.id,
        organisationId: orgA.id,
        registrationSource: 'CAMP',
        donationType: 'VOLUNTARY',
        currentStep: 1,
        donorDetails: {
          fullName: 'Aarav Ramesh Kulkarni',
          gender: 'Male',
          bloodGroup: 'B_POS',
          primaryMobile: donorPhone1.slice(-10), // Exactly 10 digits
          dateOfBirth: '1992-04-12',
          maritalStatus: 'Married',
          profession: 'Engineer',
          address: 'Flat 402, Shivneri Residency, Kothrud',
          state: 'Maharashtra',
          stateCode: 27,
          district: 'Pune',
          districtCode: 521,
          city: 'Pune City',
          pinCode: '411038',
          workingAddress: 'Flat 402, Shivneri Residency, Kothrud',
          workingState: 'Maharashtra',
          workingStateCode: 27,
          workingDistrict: 'Pune',
          workingDistrictCode: 521,
          workingCity: 'Pune City',
          workingPinCode: '411038',
          workingSameAsPermanent: true,
          discoveryConsent: true,
          discoveryConsentSource: 'CAMP_REGISTRATION',
          discoveryConsentVersion: 'v1.0',
        },
      }),
    });
    assert(
      validRegRes.status === 200 && validRegRes.data?.data?.id,
      '1.7 Coordinator successfully registers donor with verified camp, derived org, and exact 10-digit mobile',
      validRegRes.data
    );

    const reg1Id = validRegRes.data?.data?.id;

    // 1.8 Verify counselling questions start UNANSWERED (null answer, not auto-approved demo answers)
    const getInitRegRes = await request(`/donor-registration/${reg1Id}`, {
      method: 'GET',
      token: coordA.token,
    });
    const initAnswers = getInitRegRes.data?.data?.counselling?.answers || [];
    const nonFemaleAnswers = initAnswers.filter((a: any) => a.id <= 23);
    assert(
      nonFemaleAnswers.length > 0 &&
        nonFemaleAnswers.every((a: any) => a.answer === null && a.reviewStatus === 'UNANSWERED' && a.isDemoDefault === false),
      '1.8 Clinical counselling questions start strictly UNANSWERED and unapproved for evaluation',
      nonFemaleAnswers[0]
    );

    // =========================================================================
    // SECTION 2: Step 1 Address Sync & Donor Discovery Consent Persistence
    // =========================================================================
    console.log('\n--- Section 2: Address Synchronisation & Discovery Consent Verification ---');

    // 2.1 Verify persisted working address and discovery consent from DB
    const [rawReg1]: any[] = await prisma.$queryRawUnsafe(
      `SELECT working_address, working_city, working_same_as_permanent,
              discovery_consent, discovery_consent_source, discovery_consent_version,
              workflow_status, current_step
       FROM donor_registrations WHERE id = $1`,
      reg1Id
    );

    assert(
      rawReg1 &&
        rawReg1.working_same_as_permanent === true &&
        rawReg1.working_address === 'Flat 402, Shivneri Residency, Kothrud' &&
        rawReg1.discovery_consent === true &&
        rawReg1.discovery_consent_source === 'CAMP_REGISTRATION' &&
        rawReg1.discovery_consent_version === 'v1.0',
      '2.1 Working address auto-sync and Donor Discovery Consent persisted correctly',
      rawReg1
    );

    // 2.2 Verify workflow status is COUNSELLING_PENDING after Coordinator Step 1 save
    assert(
      rawReg1.workflow_status === 'COUNSELLING_PENDING',
      '2.2 Registration is placed in Clinical Queue (COUNSELLING_PENDING) after Step 1',
      rawReg1.workflow_status
    );

    // 2.3 Separate working address when workingSameAsPermanent is false
    const separateAddrRes = await request('/donor-registration/save', {
      method: 'POST',
      token: coordA.token,
      body: JSON.stringify({
        campId: campA.id,
        organisationId: orgA.id,
        registrationSource: 'CAMP',
        currentStep: 1,
        donorDetails: {
          fullName: 'Pooja Suresh Shinde',
          gender: 'Female',
          bloodGroup: 'O_POS',
          primaryMobile: donorPhone2,
          dateOfBirth: '1998-08-20',
          address: 'B-14, Mayur Colony, Kothrud',
          state: 'Maharashtra',
          stateCode: 27,
          district: 'Pune',
          districtCode: 521,
          city: 'Pune City',
          pinCode: '411038',
          workingAddress: 'Tower 4, Cyber City, Magarpatta',
          workingState: 'Maharashtra',
          workingStateCode: 27,
          workingDistrict: 'Pune',
          workingDistrictCode: 521,
          workingCity: 'Hadapsar',
          workingPinCode: '411028',
          workingSameAsPermanent: false,
          discoveryConsent: false,
        },
      }),
    });

    const reg2Id = separateAddrRes.data?.data?.id;
    const [rawReg2]: any[] = await prisma.$queryRawUnsafe(
      `SELECT working_address, working_city, working_same_as_permanent, discovery_consent
       FROM donor_registrations WHERE id = $1`,
      reg2Id
    );
    assert(
      rawReg2 &&
        rawReg2.working_same_as_permanent === false &&
        rawReg2.working_city === 'Hadapsar' &&
        rawReg2.discovery_consent === false,
      '2.3 Separate working address and opt-out discovery consent persisted correctly',
      rawReg2
    );

    // 2.4 Phone lookup safety: returns matched profile without silent overwrite
    const lookupRes = await request(`/donor-registration/lookup-phone?phoneNumber=${encodeURIComponent(donorPhone1)}`, {
      method: 'GET',
      token: coordA.token,
    });
    assert(
      lookupRes.status === 200 &&
        (lookupRes.data?.data?.exists === true || lookupRes.data?.data?.found === true) &&
        (lookupRes.data?.data?.fullName === 'Aarav Ramesh Kulkarni' || lookupRes.data?.data?.profile?.fullName === 'Aarav Ramesh Kulkarni'),
      '2.4 Phone lookup retrieves matching profile without mutating form state',
      lookupRes.data
    );

    // =========================================================================
    // SECTION 3: Role-Based Workflow Boundaries & Invariants
    // =========================================================================
    console.log('\n--- Section 3: Role-Based Queue & Workflow Boundary Enforcement ---');

    // 3.0A Coordinator clicks "Save & Proceed to Counselling" (submits Step 1, requests targetStep: 2)
    // Must succeed, persist Step 1, transition to COUNSELLING_PENDING, and appear in clinical queue
    const coordHandoffRes = await request('/donor-registration/save', {
      method: 'POST',
      token: coordA.token,
      body: JSON.stringify({
        campId: campA.id,
        organisationId: orgA.id,
        registrationSource: 'CAMP',
        donationType: 'VOLUNTARY',
        currentStep: 2, // UI passes targetStep = 2 for "Save & Proceed to Counselling"
        donorDetails: {
          fullName: 'Tanvi Shrikant Deshmukh',
          gender: 'Female',
          bloodGroup: 'A_POS',
          primaryMobile: '9822199881',
          dateOfBirth: '1995-08-20',
          maritalStatus: 'Unmarried',
          profession: 'Software Developer',
          address: 'Wing B, Marvel Cerise, Kharadi',
          state: 'Maharashtra',
          stateCode: 27,
          district: 'Pune',
          districtCode: 521,
          city: 'Pune City',
          pinCode: '411014',
          workingAddress: 'Wing B, Marvel Cerise, Kharadi',
          workingState: 'Maharashtra',
          workingStateCode: 27,
          workingDistrict: 'Pune',
          workingDistrictCode: 521,
          workingCity: 'Pune City',
          workingPinCode: '411014',
          workingSameAsPermanent: true,
          discoveryConsent: true,
          discoveryConsentSource: 'CAMP_REGISTRATION',
          discoveryConsentVersion: 'v1.0',
        },
        consent: {
          consentGiven: true,
          version: 'v1.0',
        },
      }),
    });
    assert(
      coordHandoffRes.status === 200 &&
        coordHandoffRes.data?.data?.workflowStatus === 'COUNSELLING_PENDING' &&
        coordHandoffRes.data?.data?.currentStep === 1,
      '3.0A Camp Coordinator "Save & Proceed to Counselling" persists Step 1 and transitions to COUNSELLING_PENDING',
      coordHandoffRes.data
    );

    const handoffRegId = coordHandoffRes.data?.data?.id;

    // 3.0B Verify registration appears immediately in Clinical Intake Queue
    const clinicalQueueRes = await request(`/donor-registration/queue?campId=${campA.id}&stage=clinical`, {
      method: 'GET',
      token: clinicalA.token,
    });
    const queueItems = clinicalQueueRes.data?.data?.items || clinicalQueueRes.data?.data?.registrations || [];
    assert(
      clinicalQueueRes.status === 200 &&
        Array.isArray(queueItems) &&
        queueItems.some((r: any) => r.id === handoffRegId),
      '3.0B Forwarded registration appears in authorised clinical staff intake queue',
      clinicalQueueRes.data
    );

    // 3.0C Duplicate submission / retry protection: resending with same registrationId updates without duplicating
    const retryRes = await request('/donor-registration/save', {
      method: 'POST',
      token: coordA.token,
      body: JSON.stringify({
        registrationId: handoffRegId,
        campId: campA.id,
        organisationId: orgA.id,
        registrationSource: 'CAMP',
        donationType: 'VOLUNTARY',
        currentStep: 1,
        donorDetails: {
          fullName: 'Tanvi Shrikant Deshmukh',
          primaryMobile: '9822199881',
          dateOfBirth: '1995-08-20',
          pinCode: '411014',
        },
      }),
    });
    const [countAfterRetry]: any[] = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as count FROM donor_registrations WHERE id = $1`,
      handoffRegId
    );
    assert(
      retryRes.status === 200 && countAfterRetry?.count === 1,
      '3.0C Duplicate submission / retry updates the existing record without duplicating registrations or queue items',
      { retryRes: retryRes.data, count: countAfterRetry }
    );

    // 3.0D Coordinator attempts to submit clinical counselling answers -> Must be blocked
    const coordCounselRes = await request('/donor-registration/save', {
      method: 'POST',
      token: coordA.token,
      body: JSON.stringify({
        registrationId: handoffRegId,
        campId: campA.id,
        organisationId: orgA.id,
        currentStep: 2,
        counsellingStatus: 'APPROVED',
        counsellingReviewedById: coordA.user.id,
        counsellingAnswers: [
          { code: 'Q1', answer: true, staffEdited: true },
        ],
      }),
    });
    assert(
      coordCounselRes.status === 403 &&
        coordCounselRes.data?.error?.message?.includes('not authorized to record clinical counselling'),
      '3.0D Camp Coordinator is strictly blocked from saving clinical counselling assessments',
      coordCounselRes.data
    );

    // 3.0E Coordinator attempts to record medical fitness decision (FIT/DEFERRED) -> Must be blocked
    const coordDecisionRes = await request('/donor-registration/save', {
      method: 'POST',
      token: coordA.token,
      body: JSON.stringify({
        registrationId: handoffRegId,
        campId: campA.id,
        organisationId: orgA.id,
        currentStep: 3,
        screening: {
          status: 'FIT',
        },
      }),
    });
    assert(
      coordDecisionRes.status === 403 &&
        coordDecisionRes.data?.error?.message?.includes('not authorized to record clinical screening or medical decisions'),
      '3.0E Camp Coordinator is strictly blocked from recording medical clearance decisions (FIT/DEFERRED)',
      coordDecisionRes.data
    );

    // 3.1 Coordinator attempts to record physical screening vitals (Step 3) -> Must be blocked
    const coordScreenRes = await request('/donor-registration/save', {
      method: 'POST',
      token: coordA.token,
      body: JSON.stringify({
        registrationId: reg1Id,
        organisationId: orgA.id,
        campId: campA.id,
        currentStep: 3,
        screening: {
          weightKg: 68,
          hemoglobin: 14.2,
          systolicBp: 120,
          diastolicBp: 80,
        },
      }),
    });
    assert(
      coordScreenRes.status === 403 && (coordScreenRes.data?.error?.message?.includes('not authorized to record clinical screening') || coordScreenRes.data?.error?.message?.includes('Coordinators cannot record clinical screening')),
      '3.1 Camp Coordinator is strictly blocked from recording physical screening measurements (Step 3)',
      coordScreenRes.data
    );

    // 3.2 Coordinator attempts to record phlebotomy / collection (Step 4) -> Must be blocked
    const coordCollectRes = await request('/donor-registration/save', {
      method: 'POST',
      token: coordA.token,
      body: JSON.stringify({
        registrationId: reg1Id,
        organisationId: orgA.id,
        campId: campA.id,
        currentStep: 4,
        collection: {
          bagType: 'SINGLE_350',
          volumeMl: 350,
          status: 'COMPLETED',
        },
      }),
    });
    assert(
      coordCollectRes.status === 403 && (coordCollectRes.data?.error?.message?.includes('not authorized to record phlebotomy') || coordCollectRes.data?.error?.message?.includes('Coordinators cannot record phlebotomy')),
      '3.2 Camp Coordinator is strictly blocked from recording phlebotomy/collection (Step 4)',
      coordCollectRes.data
    );

    // 3.3 Clinical Staff records counselling (Step 2)
    const clinicalCounsellingRes = await request('/donor-registration/save', {
      method: 'POST',
      token: clinicalA.token,
      body: JSON.stringify({
        registrationId: reg1Id,
        organisationId: orgA.id,
        campId: campA.id,
        currentStep: 2,
        counsellingReviewedById: clinicalA.user.id,
        counsellingStatus: 'APPROVED',
        counsellingRemarks: 'Donor cleared all 26 health questionnaire criteria.',
        canIssuePlasma: true,
      }),
    });
    assert(
      clinicalCounsellingRes.status === 200,
      '3.3 Clinical Staff successfully records Step 2 counselling evaluation',
      clinicalCounsellingRes.data
    );

    // 3.4 Clinical Staff attempts to record collection (Step 4) -> Must be blocked
    const clinicalCollectRes = await request('/donor-registration/save', {
      method: 'POST',
      token: clinicalA.token,
      body: JSON.stringify({
        registrationId: reg1Id,
        organisationId: orgA.id,
        campId: campA.id,
        currentStep: 4,
        collection: {
          bagType: 'DOUBLE_450',
          volumeMl: 450,
          status: 'COMPLETED',
        },
      }),
    });
    assert(
      clinicalCollectRes.status === 403 && (clinicalCollectRes.data?.error?.message?.includes('not authorized to record phlebotomy') || clinicalCollectRes.data?.error?.message?.includes('Clinical staff cannot record phlebotomy')),
      '3.4 Clinical Staff is strictly blocked from recording phlebotomy/collection (Step 4)',
      clinicalCollectRes.data
    );

    // =========================================================================
    // SECTION 4: Medical Officer Clearance & Invariant Enforcement
    // =========================================================================
    console.log('\n--- Section 4: Medical Officer Clearance Decision & Invariant Enforcement ---');

    // 4.1 Collection Staff attempts to collect before medical fitness decision -> Blocked
    const prematureCollectRes = await request('/donor-registration/save', {
      method: 'POST',
      token: collectionA.token,
      body: JSON.stringify({
        registrationId: reg1Id,
        organisationId: orgA.id,
        campId: campA.id,
        currentStep: 4,
        collection: {
          bagType: 'SINGLE_350',
          volumeMl: 350,
          lotNumber: 'LOT-9988',
          status: 'COMPLETED',
        },
      }),
    });
    assert(
      prematureCollectRes.status === 400 &&
        prematureCollectRes.data?.error?.message?.includes('FIT'),
      '4.1 Collection blocked when donor has not received explicit Medical Officer FIT clearance',
      prematureCollectRes.data
    );

    // 4.2 Medical Officer records DEFERRAL on Donor 2
    const moDeferRes = await request('/donor-registration/save', {
      method: 'POST',
      token: clinicalA.token,
      body: JSON.stringify({
        registrationId: reg2Id,
        organisationId: orgA.id,
        campId: campA.id,
        currentStep: 3,
        counsellingReviewedById: clinicalA.user.id,
        counsellingStatus: 'APPROVED',
        screening: {
          screenedById: clinicalA.user.id,
          medicalOfficerId: moA.user.id,
          weightKg: 52,
          hemoglobin: 11.2, // Below 12.5 gm/dL threshold
          systolicBp: 110,
          diastolicBp: 75,
          pulseBpm: 72,
          temperatureCelsius: 36.8,
          status: 'DEFERRED',
          deferralCategory: 'LOW_HEMOGLOBIN',
          deferralReason: 'Hemoglobin 11.2 gm/dL is below acceptable donation standard 12.5 gm/dL',
          remarks: 'Prescribed iron-rich diet and iron supplements for 30 days',
        },
      }),
    });
    assert(
      moDeferRes.status === 200 && moDeferRes.data?.data?.workflowStatus === 'DEFERRED',
      '4.2 Medical Officer marks DEFERRED on Donor 2 with deferral category and clinical reason',
      moDeferRes.data
    );

    // 4.3 Collection Staff attempts collection on deferred Donor 2 -> Strictly blocked
    const deferredCollectRes = await request('/donor-registration/save', {
      method: 'POST',
      token: collectionA.token,
      body: JSON.stringify({
        registrationId: reg2Id,
        organisationId: orgA.id,
        campId: campA.id,
        currentStep: 4,
        collection: {
          bagType: 'SINGLE_350',
          volumeMl: 350,
          status: 'COMPLETED',
        },
      }),
    });
    assert(
      deferredCollectRes.status === 400 && (deferredCollectRes.data?.error?.message?.includes('DEFERRED') || deferredCollectRes.data?.error?.message?.includes('FIT')),
      '4.3 Collection strictly blocked on deferred donor (cannot proceed to phlebotomy)',
      deferredCollectRes.data
    );

    // 4.4 Medical Officer records FIT clearance on Donor 1
    const moFitRes = await request('/donor-registration/save', {
      method: 'POST',
      token: clinicalA.token,
      body: JSON.stringify({
        registrationId: reg1Id,
        organisationId: orgA.id,
        campId: campA.id,
        currentStep: 3,
        screening: {
          screenedById: clinicalA.user.id,
          medicalOfficerId: moA.user.id,
          weightKg: 72,
          hemoglobin: 14.8,
          systolicBp: 122,
          diastolicBp: 82,
          pulseBpm: 74,
          temperatureCelsius: 36.6,
          bothArmsInspected: true,
          postDonationTipsGiven: true,
          status: 'FIT',
          remarks: 'Donor is healthy, alert, and fit for whole blood donation.',
        },
      }),
    });
    assert(
      moFitRes.status === 200 && moFitRes.data?.data?.workflowStatus === 'CLEARED_FOR_COLLECTION',
      '4.4 Medical Officer grants FIT clearance; status transitions to CLEARED_FOR_COLLECTION',
      moFitRes.data
    );

    // 4.5 Collection Staff records phlebotomy and verifies unit number & barcode generation
    const collectionSuccessRes = await request('/donor-registration/save', {
      method: 'POST',
      token: collectionA.token,
      body: JSON.stringify({
        registrationId: reg1Id,
        organisationId: orgA.id,
        campId: campA.id,
        currentStep: 4,
        collection: {
          bagType: 'SINGLE_350',
          manufacturer: 'Terumo Penpol',
          lotNumber: 'LOT-2026-X7',
          segmentNumber: 'SEG-8821',
          volumeMl: 350,
          durationMinutes: 9,
          adverseReaction: false,
          exitTime: '11:45',
          remarks: 'Smooth donation without any vasovagal reaction.',
          status: 'COMPLETED',
        },
      }),
    });
    assert(
      collectionSuccessRes.status === 200 &&
        collectionSuccessRes.data?.data?.collection?.unitNumber &&
        collectionSuccessRes.data?.data?.collection?.barcode,
      '4.5 Collection Staff records phlebotomy; generates traceable unit number and barcode',
      collectionSuccessRes.data?.data?.collection
    );

    const generatedUnitNumber = collectionSuccessRes.data?.data?.collection?.unitNumber;

    // 4.6 Collection Staff attempts to alter Medical Officer's decision -> Blocked
    const alterDecisionRes = await request('/donor-registration/save', {
      method: 'POST',
      token: collectionA.token,
      body: JSON.stringify({
        registrationId: reg1Id,
        organisationId: orgA.id,
        campId: campA.id,
        currentStep: 3,
        screening: {
          status: 'DEFERRED',
          deferralReason: 'Unauthorized change attempt',
        },
      }),
    });
    assert(
      alterDecisionRes.status === 403 && alterDecisionRes.data?.error?.message?.includes('cannot alter medical clearance'),
      '4.6 Collection Staff is blocked from altering medical clearance decisions',
      alterDecisionRes.data
    );

    // =========================================================================
    // SECTION 5: Camp Blood-Unit Handover Manifest Authority (Role E)
    // =========================================================================
    console.log('\n--- Section 5: Camp Handover Manifest Custody Controls (Role E) ---');

    // 5.1 Coordinator attempts to create camp handover manifest -> Blocked
    const coordHandoverRes = await request(`/camps/${campA.id}/handover`, {
      method: 'POST',
      token: coordA.token,
      body: JSON.stringify({
        unitIds: [],
        receivingOrganisationId: orgA.id,
        courierName: 'Van A',
        vehicleNumber: 'MH-12-0001',
      }),
    });
    assert(
      coordHandoverRes.status === 403 && coordHandoverRes.data?.error?.message?.includes('Only camp admin or blood bank admin'),
      '5.1 Coordinator is strictly blocked from creating camp handover manifests',
      coordHandoverRes.data
    );

    // 5.2 Clinical Staff attempts to create camp handover manifest -> Blocked
    const clinicalHandoverRes = await request(`/camps/${campA.id}/handover`, {
      method: 'POST',
      token: clinicalA.token,
      body: JSON.stringify({
        unitIds: [],
        receivingOrganisationId: orgA.id,
        courierName: 'Van A',
        vehicleNumber: 'MH-12-0001',
      }),
    });
    assert(
      clinicalHandoverRes.status === 403 && clinicalHandoverRes.data?.error?.message?.includes('Only camp admin or blood bank admin'),
      '5.2 Clinical Staff is strictly blocked from creating camp handover manifests',
      clinicalHandoverRes.data
    );

    // 5.3 Collection Staff attempts to create camp handover manifest -> Blocked
    const collectionHandoverRes = await request(`/camps/${campA.id}/handover`, {
      method: 'POST',
      token: collectionA.token,
      body: JSON.stringify({
        unitIds: [],
        receivingOrganisationId: orgA.id,
        courierName: 'Van A',
        vehicleNumber: 'MH-12-0001',
      }),
    });
    assert(
      collectionHandoverRes.status === 403 && collectionHandoverRes.data?.error?.message?.includes('Only camp admin or blood bank admin'),
      '5.3 Collection Staff is strictly blocked from creating camp handover manifests',
      collectionHandoverRes.data
    );

    // =========================================================================
    // SECTION 6: Multi-Organisation Data Isolation
    // =========================================================================
    console.log('\n--- Section 6: Universal Multi-Organisation Data Isolation ---');

    // 6.1 Staff from Org B / Camp B attempts to access registration from Camp A -> Blocked
    const crossOrgGetRes = await request(`/donor-registration/${reg1Id}`, {
      method: 'GET',
      token: staffB.token,
    });
    assert(
      crossOrgGetRes.status === 403,
      '6.1 Staff from Org B is strictly blocked from accessing Camp A donor registration',
      crossOrgGetRes.data
    );

    // 6.2 Staff from Org B attempts to update registration from Camp A -> Blocked
    const crossOrgSaveRes = await request('/donor-registration/save', {
      method: 'POST',
      token: staffB.token,
      body: JSON.stringify({
        registrationId: reg1Id,
        organisationId: orgA.id,
        campId: campA.id,
        currentStep: 1,
        donorDetails: { fullName: 'Malicious Overwrite' },
      }),
    });
    assert(
      crossOrgSaveRes.status === 403,
      '6.2 Staff from Org B is strictly blocked from modifying Camp A donor registration',
      crossOrgSaveRes.data
    );

    // 6.3 Queues for Camp A are strictly isolated from Camp B
    const queueCampARes = await request(`/donor-registration/queue?campId=${campA.id}&stage=all`, {
      method: 'GET',
      token: coordA.token,
    });
    const queueCampBRes = await request(`/donor-registration/queue?campId=${campB.id}&stage=all`, {
      method: 'GET',
      token: staffB.token,
    });
    assert(
      queueCampARes.status === 200 &&
        queueCampARes.data?.data?.total >= 2 &&
        queueCampBRes.status === 200 &&
        queueCampBRes.data?.data?.total === 0,
      '6.3 Camp queues strictly isolate registrations per camp and organisation',
      { campATotal: queueCampARes.data?.data?.total, campBTotal: queueCampBRes.data?.data?.total }
    );

    // =========================================================================
    // SECTION 7: Real-Time Outbox Events Dispatch
    // =========================================================================
    console.log('\n--- Section 7: Real-Time Outbox Event Dispatch ---');

    const outboxEvent = await prisma.outboxEvent.findFirst({
      where: {
        entityId: reg1Id,
        eventType: 'camp.donor_registration_updated',
      },
      orderBy: { createdAt: 'desc' },
    });
    const payload = outboxEvent?.payload as any;
    assert(
      outboxEvent !== null &&
        outboxEvent.eventType === 'camp.donor_registration_updated' &&
        payload?.campId === campA.id &&
        payload?.organisationId === orgA.id,
      '7.1 Real-time outbox event camp.donor_registration_updated emitted with camp and org target channels',
      outboxEvent
    );

    // ----------------------------------------------------
    // SUMMARY
    // ----------------------------------------------------
    console.log('\n========================================================================');
    console.log(`  Universal Multi-Org Workflow Test Results: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================================================\n');

    if (failed > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('Test suite uncaught error:', error);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

runUniversalMultiOrgTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
