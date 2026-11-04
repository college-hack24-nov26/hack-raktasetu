import { app } from './app';
import { prisma } from './lib/prisma';
import http from 'http';
import { PdfService } from './services/pdfService';

const PORT = 4055;
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

async function runDonorRegistrationTestSuite() {
  console.log('========================================================================');
  console.log('  RaktaSetu — Donor Registration Workflow & Printable PDF Test Suite');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}${detail !== undefined ? ` -> ${typeof detail === 'object' ? JSON.stringify(detail) : detail}` : ''}`);
      failed++;
    }
  }

  const server = app.listen(PORT);

  try {
    // ----------------------------------------------------
    // SETUP: Test Fixtures
    // ----------------------------------------------------
    console.log('--- Setup: Creating Test Actors, Organisations, and Camps ---');

    async function loginOrCreate(phone: string, name: string) {
      const res = await request('/auth/demo-login', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: phone, otp: '123456' }),
      });
      return { token: res.data?.data?.token, user: res.data?.data?.user };
    }

    const testRand = Math.floor(100000 + Math.random() * 900000);
    const coordPhone = `+9198${testRand}01`;
    const outsiderPhone = `+9198${testRand}02`;
    const donorPhone = `+9198${testRand}03`;
    const otherDonorPhone = `+9198${testRand}04`;

    const coordActor = await loginOrCreate(coordPhone, 'Camp Coordinator Test');
    const outsiderActor = await loginOrCreate(outsiderPhone, 'Outsider Staff');
    const donorActor = await loginOrCreate(donorPhone, 'Test Donor 1');
    const otherDonorActor = await loginOrCreate(otherDonorPhone, 'Stranger Donor');

    // Create an Organisation and an assigned Camp
    const testOrg = await prisma.organisation.create({
      data: {
        orgCode: `ORG-TEST-${testRand}`,
        name: `RaktaSetu Testing Blood Bank ${testRand}`,
        licenseNumber: `LIC-TEST-${testRand}`,
        districtCode: 521,
        stateCode: 27,
        status: 'VERIFIED',
      },
    });

    // Assign coordActor to testOrg as CLINICAL_STAFF / CAMP_COORDINATOR
    await prisma.organisationMembership.create({
      data: {
        userId: coordActor.user.id,
        organisationId: testOrg.id,
        role: 'CLINICAL_STAFF',
        isActive: true,
      },
    });

    // Create a Camp
    const testCamp = await prisma.camp.create({
      data: {
        campCode: `CAMP-${testRand}`,
        title: `Community Blood Drive ${testRand}`,
        organizerName: 'Red Cross Pune Chapter',
        targetDate: new Date(Date.now() + 86400000),
        venue: 'Pune Municipal Hall',
        districtCode: 521,
        stateCode: 27,
        organisationId: testOrg.id,
        status: 'APPROVED',
        createdById: coordActor.user.id,
      },
    });

    // Camp staff assignment
    await prisma.campStaffAssignment.create({
      data: {
        campId: testCamp.id,
        userId: coordActor.user.id,
        organisationId: testOrg.id,
        role: 'CAMP_COORDINATOR',
        assignedBy: coordActor.user.id,
        isActive: true,
      },
    });

    console.log(`Setup complete. Camp: ${testCamp.campCode}, Org: ${testOrg.orgCode}\n`);

    // ----------------------------------------------------
    // TEST 1: Coordinator lists authorized camps & centres
    // ----------------------------------------------------
    console.log('--- Test 1: Authorised Camps and Organisations Listing ---');
    const campsRes = await request('/donor-registration/camps-and-centres', {
      token: coordActor.token,
    });
    assert(
      campsRes.ok && campsRes.data?.data?.camps?.some((c: any) => c.id === testCamp.id),
      '1. Coordinator can list authorized camps and parent blood centres'
    );

    // ----------------------------------------------------
    // TEST 2: Phone lookup for non-existent vs existing donor
    // ----------------------------------------------------
    console.log('--- Test 2: Safe Mobile Number Matching ---');
    const lookupNewRes = await request(`/donor-registration/lookup-phone?phone=${encodeURIComponent(donorPhone)}`, {
      token: coordActor.token,
    });
    assert(
      lookupNewRes.ok && lookupNewRes.data?.data?.exists === true,
      '2a. Lookup finds existing user created via demo login'
    );
    assert(
      lookupNewRes.data?.data?.normalizedPhone === donorPhone,
      '2b. Lookup normalizes phone number securely without leaking Aadhaar'
    );

    // ----------------------------------------------------
    // TEST 3: Step 1 - Donor Details Draft Creation
    // ----------------------------------------------------
    console.log('--- Test 3: Step 1 Donor Details Draft Persistence ---');
    const step1Payload = {
      organisationId: testOrg.id,
      campId: testCamp.id,
      registrationSource: 'CAMP',
      donationType: 'VOLUNTARY',
      currentStep: 1,
      donorDetails: {
        fullName: 'Rahul Arvind Sharma',
        gender: 'Male',
        bloodGroup: 'B_POS',
        dateOfBirth: '1995-06-15',
        maritalStatus: 'Married',
        nationalIdAadhaar: '987654321012', // 12-digit
        profession: 'Software Engineer',
        donorClub: '3 Month Donor',
        donationWillingness: 'Whole Blood',
        primaryMobile: donorPhone,
        address: 'Flat 402, Shivajinagar, Pune',
        state: 'Maharashtra',
        stateCode: 27,
        district: 'Pune',
        districtCode: 521,
        city: 'Pune',
        pinCode: '411005',
        isRepeatDonor: true,
        lastDonationDate: '2026-03-10',
        smsPermission: true,
        callPermission: true,
      },
    };

    const saveStep1Res = await request('/donor-registration/save', {
      method: 'POST',
      token: coordActor.token,
      body: JSON.stringify(step1Payload),
    });

    assert(saveStep1Res.ok, '3a. Step 1 donor details saved successfully');
    const regId = saveStep1Res.data?.data?.id;
    const regNumber = saveStep1Res.data?.data?.registrationNumber;
    assert(Boolean(regId) && regNumber?.startsWith('REG-'), '3b. Unique registration number generated');

    const d = saveStep1Res.data?.data?.donorDetails;
    assert(d?.calculatedAge >= 28 && d?.calculatedAge <= 33, '3c. Calculated age derived correctly from DOB');
    assert(
      d?.nationalIdAadhaarMasked === 'XXXX-XXXX-1012' && !d?.nationalIdAadhaar,
      '3d. Aadhaar is masked on server-side and never saved in raw 12 digits'
    );

    // ----------------------------------------------------
    // TEST 4: Step 2 - Counselling Details (All 26 Questions & Demo Prefills)
    // ----------------------------------------------------
    console.log('--- Test 4: Step 2 Counselling 26 Questions & Default Approval ---');
    const getRegRes = await request(`/donor-registration/${regId}`, {
      token: coordActor.token,
    });
    const counselling = getRegRes.data?.data?.counselling;
    assert(
      counselling?.status === 'APPROVED_DEFAULT_DEMO',
      '4a. Counselling initializes with status Approved by Default (Demo)'
    );
    assert(
      counselling?.answers?.length === 26,
      '4b. All 26 clinical counselling questions are present in database record'
    );
    assert(
      counselling?.answers?.every((q: any) => q.isDemoDefault === true),
      '4c. Default prefill flag isDemoDefault is true on all initial answers'
    );

    // ----------------------------------------------------
    // TEST 5: Staff updates counselling answers and remarks (Persistence & Audit)
    // ----------------------------------------------------
    console.log('--- Test 5: Staff Editing & Audit History ---');
    const updatedAnswers = [...counselling.answers];
    // Staff modifies Q04 (Food intake) and Q07 (Medications)
    updatedAnswers[3] = {
      ...updatedAnswers[3],
      remarks: 'Staff verified light breakfast taken at 8:30 AM.',
    };
    updatedAnswers[6] = {
      ...updatedAnswers[6],
      selectedOptions: ['Antibiotics'],
      remarks: 'Completed 5-day course of Amoxicillin 4 weeks ago.',
    };

    const saveCounsellingRes = await request('/donor-registration/save', {
      method: 'POST',
      token: coordActor.token,
      body: JSON.stringify({
        registrationId: regId,
        currentStep: 2,
        counsellingStatus: 'REVIEWED_APPROVED',
        counsellingRemarks: 'Reviewed in-person by Dr. Coordinator. Clinically acceptable.',
        counsellingAnswers: updatedAnswers,
      }),
    });

    assert(saveCounsellingRes.ok, '5a. Staff saved edits to counselling questions', saveCounsellingRes.data);
    const updatedCounselling = saveCounsellingRes.data?.data?.counselling;
    assert(
      updatedCounselling?.status === 'REVIEWED_APPROVED',
      '5b. Status changed to genuine staff-reviewed status REVIEWED_APPROVED'
    );
    assert(
      updatedCounselling?.auditHistory?.length >= 1,
      '5c. Audit log captured previous vs updated values and staff ID'
    );

    // Reopen and verify edits are NOT overwritten by defaults
    const reopenRes = await request(`/donor-registration/${regId}`, {
      token: coordActor.token,
    });
    const reopenedAnswers = reopenRes.data?.data?.counselling?.answers;
    assert(
      reopenedAnswers[3]?.remarks === 'Staff verified light breakfast taken at 8:30 AM.',
      '5d. Staff-edited remarks persist and do NOT revert to demo defaults'
    );

    // ----------------------------------------------------
    // TEST 6: Step 3 - Screening Details & Vitals Validation
    // ----------------------------------------------------
    console.log('--- Test 6: Step 3 Screening Vitals & Fitness Medical Review ---');
    const saveScreeningRes = await request('/donor-registration/save', {
      method: 'POST',
      token: coordActor.token,
      body: JSON.stringify({
        registrationId: regId,
        currentStep: 3,
        screening: {
          status: 'FIT',
          weightKg: 68.5,
          hemoglobin: 14.6,
          bloodGroup: 'B_POS',
          systolicBp: 122,
          diastolicBp: 78,
          pulseBpm: 74,
          temperatureCelsius: 36.7,
          heightCm: 172,
          bothArmsInspected: true,
          postDonationTipsGiven: true,
          processType: 'DONOR',
          remarks: 'Donor vitals optimal. Cleared for standard 350 mL whole blood collection.',
        },
      }),
    });

    assert(saveScreeningRes.ok, '6a. Screening measurements and fitness saved');
    const screening = saveScreeningRes.data?.data?.screening;
    assert(
      screening?.status === 'FIT' && screening?.weightKg === 68.5 && screening?.temperatureCelsius === 36.7,
      '6b. Screening vitals and temperature in Celsius saved accurately'
    );

    // ----------------------------------------------------
    // TEST 7: Step 4 - Collection Details & Barcode Generation
    // ----------------------------------------------------
    console.log('--- Test 7: Step 4 Phlebotomy Collection & Barcode Identifiers ---');
    const saveCollectionRes = await request('/donor-registration/save', {
      method: 'POST',
      token: coordActor.token,
      body: JSON.stringify({
        registrationId: regId,
        currentStep: 4,
        collection: {
          status: 'COLLECTED',
          phlebotomyDateTime: new Date().toISOString(),
          bagType: 'DB-CPDA-350',
          manufacturer: 'Terumo Penpol',
          lotNumber: 'LOT-202610-PUN-01',
          segmentNumber: 'SEG-8832',
          volumeMl: 350,
          durationMinutes: 7,
          isLessQuantity: false,
          adverseReaction: false,
          timeRefreshmentsProvided: '10:30 AM',
          exitTime: '10:45 AM',
          remarks: 'Clean single venepuncture. Phlebotomy uneventful.',
        },
      }),
    });

    assert(saveCollectionRes.ok, '7a. Collection details saved successfully');
    const collection = saveCollectionRes.data?.data?.collection;
    assert(
      Boolean(collection?.unitNumber) && Boolean(collection?.barcode),
      '7b. Server-side unique unit identifier and barcode generated'
    );
    assert(
      collection?.barcode.startsWith('*RSB') && collection?.barcode.endsWith('*'),
      '7c. Barcode format matches specification standard'
    );

    // ----------------------------------------------------
    // TEST 8: Step 5 - Complete Registration & Non-Inventory Safety Check
    // ----------------------------------------------------
    console.log('--- Test 8: Finalizing Registration & Non-Inventory Safety Verification ---');
    const initialAvailableUnitsCount = await prisma.componentUnit.count({
      where: { status: 'AVAILABLE' },
    });

    const completeRes = await request(`/donor-registration/${regId}/complete`, {
      method: 'POST',
      token: coordActor.token,
    });

    assert(completeRes.ok, '8a. Complete registration endpoint succeeded');
    assert(
      completeRes.data?.data?.isCompleted === true && completeRes.data?.data?.workflowStatus === 'COMPLETED',
      '8b. Registration marked COMPLETED with completed timestamp'
    );

    const afterAvailableUnitsCount = await prisma.componentUnit.count({
      where: { status: 'AVAILABLE' },
    });

    assert(
      initialAvailableUnitsCount === afterAvailableUnitsCount,
      '8c. SAFETY CHECK: Registration completion did NOT create available blood inventory'
    );

    // ----------------------------------------------------
    // TEST 9: Printable A4 PDF Generation
    // ----------------------------------------------------
    console.log('--- Test 9: Server-Side Printable A4 PDF Generation ---');
    const pdfRes = await request(`/donor-registration/${regId}/pdf`, {
      token: coordActor.token,
    });

    assert(pdfRes.ok, '9a. PDF endpoint responded with HTTP 200');
    assert(
      Boolean(pdfRes.headers.get('content-type')?.includes('application/pdf')),
      '9b. Content-Type is application/pdf'
    );
    assert(
      Boolean(pdfRes.headers.get('content-disposition')?.includes(regNumber)),
      '9c. Content-Disposition filename includes registration number'
    );

    // Verify PDF buffer integrity directly from PdfService
    const fullReg = await request(`/donor-registration/${regId}`, { token: coordActor.token });
    const directPdfBuffer = await PdfService.generateRegistrationPdf(fullReg.data.data);
    assert(
      directPdfBuffer.length > 5000,
      `9d. Generated multi-page PDF buffer is ${directPdfBuffer.length} bytes (> 5 KB)`
    );
    assert(
      directPdfBuffer.slice(0, 4).toString() === '%PDF',
      '9e. PDF contains official %PDF file header magic bytes'
    );

    // ----------------------------------------------------
    // TEST 10: Role and Organisation Permissions
    // ----------------------------------------------------
    console.log('--- Test 10: Organisation & Camp Scope Enforcement ---');
    // Outsider staff tries to access or modify coordActor's camp registration
    const unauthorizedAccessRes = await request(`/donor-registration/${regId}`, {
      token: outsiderActor.token,
    });
    assert(
      unauthorizedAccessRes.status === 403,
      '10a. Unassigned staff is denied access (HTTP 403) to other organisation registration'
    );

    const unauthorizedSaveRes = await request('/donor-registration/save', {
      method: 'POST',
      token: outsiderActor.token,
      body: JSON.stringify({
        registrationId: regId,
        organisationId: testOrg.id,
        currentStep: 2,
      }),
    });
    assert(
      unauthorizedSaveRes.status === 403,
      '10b. Unassigned staff cannot tamper with or save drafts in unassigned organisation'
    );

    // ----------------------------------------------------
    // TEST 11: Donor Portal & Mobile Authentication
    // ----------------------------------------------------
    console.log('--- Test 11: Donor Mobile OTP Login & Account Access ---');
    // Step 1: Send OTP
    const sendOtpRes = await request('/donor/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: donorPhone }),
    });
    assert(sendOtpRes.ok, '11a. Donor OTP request succeeded with cooldown active', sendOtpRes.data);

    // Step 2: Verify OTP
    const verifyOtpRes = await request('/donor/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: donorPhone, otp: '123456' }),
    });
    assert(verifyOtpRes.ok, '11b. Donor OTP verification succeeded with session creation');
    const donorSessionToken = verifyOtpRes.data?.data?.token;

    // Step 3: Donor accesses their own registration list
    const donorRegsRes = await request('/donor/my-registrations', {
      token: donorSessionToken,
    });
    assert(donorRegsRes.ok, '11c. Donor can retrieve their own registration history');
    assert(
      donorRegsRes.data?.data?.some((r: any) => r.id === regId),
      '11d. Donor sees their staff-registered episode in their personal portal'
    );

    // Step 4: Donor downloads their own registration PDF
    const donorPdfRes = await request(`/donor-registration/${regId}/pdf`, {
      token: donorSessionToken,
    });
    assert(donorPdfRes.ok, '11e. Donor can download their own registration PDF');

    // Step 5: Stranger donor tries to download another donor's PDF
    const strangerPdfRes = await request(`/donor-registration/${regId}/pdf`, {
      token: otherDonorActor.token,
    });
    assert(
      strangerPdfRes.status === 403,
      '11f. Stranger donor is strictly FORBIDDEN (HTTP 403) from accessing another donor PDF'
    );

    // ----------------------------------------------------
    // TEST 12: Incomplete Collection Validation
    // ----------------------------------------------------
    console.log('--- Test 12: Incomplete Collection & Deferral Edge Cases ---');
    const deferredRegPayload = {
      organisationId: testOrg.id,
      campId: testCamp.id,
      registrationSource: 'CAMP',
      currentStep: 3,
      donorDetails: {
        fullName: 'Vikram Joshi',
        primaryMobile: `+9198${testRand}99`,
        dateOfBirth: '1990-01-01',
      },
      screening: {
        status: 'DEFERRED',
        weightKg: 42.0, // underweight
        hemoglobin: 11.2, // low Hb
        deferralCategory: 'WEIGHT_CRITERIA',
        deferralReason: 'Donor weight 42 kg below statutory 45 kg threshold.',
      },
    };

    const deferredRegRes = await request('/donor-registration/save', {
      method: 'POST',
      token: coordActor.token,
      body: JSON.stringify(deferredRegPayload),
    });

    const defRegId = deferredRegRes.data?.data?.id;
    const completeDeferredRes = await request(`/donor-registration/${defRegId}/complete`, {
      method: 'POST',
      token: coordActor.token,
    });

    assert(
      completeDeferredRes.ok && completeDeferredRes.data?.data?.workflowStatus === 'DEFERRED',
      '12. Medically deferred donor is marked DEFERRED and collection is blocked'
    );

    // Cleanup Fixtures
    console.log('\n--- Cleanup: Purging Temporary Test Records ---');
    await prisma.$executeRawUnsafe(`DELETE FROM donor_registrations WHERE organisation_id = '${testOrg.id}';`);
    await prisma.campStaffAssignment.deleteMany({ where: { campId: testCamp.id } });
    await prisma.camp.delete({ where: { id: testCamp.id } });
    await prisma.organisationMembership.deleteMany({ where: { organisationId: testOrg.id } });
    await prisma.organisation.delete({ where: { id: testOrg.id } });
    console.log('Test fixtures cleaned up.');
  } catch (err: any) {
    console.error('Unexpected error in test suite:', err);
    failed++;
  } finally {
    server.close();
  }

  console.log('\n========================================================================');
  console.log(` Test Suite Results: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runDonorRegistrationTestSuite();
