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

async function runPhase3CampOperationsTests() {
  console.log('========================================================================');
  console.log(' RaktaSetu — Phase 3: Camp Operations, Attendance, Screening & Donation');
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
  const orgAdminPhone = '+919999988001';
  const clinicalStaffPhone = '+919999988002';
  const collectionStaffPhone = '+919999988003';
  const auditorPhone = '+919999988004';
  const orgBStaffPhone = '+919999988005';
  const donor1Phone = '+919999988006';
  const donor2Phone = '+919999988007';

  let orgAdminToken = '';
  let clinicalStaffToken = '';
  let collectionStaffToken = '';
  let auditorToken = '';
  let orgBStaffToken = '';
  let donor1Token = '';
  let donor2Token = '';

  let orgAdminUserId = '';
  let clinicalStaffUserId = '';
  let collectionStaffUserId = '';
  let auditorUserId = '';
  let orgBStaffUserId = '';
  let donor1UserId = '';
  let donor2UserId = '';

  let organisationIdA = '';
  let organisationIdB = '';
  let campId = '';
  let proposedCampId = '';
  let attendance1Id = '';
  let attendance2Id = '';
  let screening1Id = '';
  let donation1Id = '';

  try {
    // ----------------------------------------------------
    // Setup: Establish Test Actors & Organisation Memberships
    // ----------------------------------------------------
    console.log('--- Setup: Establishing Actor Sessions & Role Allocations ---');

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

    const adminAuth = await loginUser(orgAdminPhone, 'Org Admin User');
    orgAdminToken = adminAuth.token;
    orgAdminUserId = adminAuth.userId;

    const clinicalAuth = await loginUser(clinicalStaffPhone, 'Dr. Clinical Officer');
    clinicalStaffToken = clinicalAuth.token;
    clinicalStaffUserId = clinicalAuth.userId;

    const collectionAuth = await loginUser(collectionStaffPhone, 'Collection Phlebotomist');
    collectionStaffToken = collectionAuth.token;
    collectionStaffUserId = collectionAuth.userId;

    const auditorAuth = await loginUser(auditorPhone, 'Compliance Auditor');
    auditorToken = auditorAuth.token;
    auditorUserId = auditorAuth.userId;

    const orgBAuth = await loginUser(orgBStaffPhone, 'Unrelated Org Staff');
    orgBStaffToken = orgBAuth.token;
    orgBStaffUserId = orgBAuth.userId;

    const donor1Auth = await loginUser(donor1Phone, 'Voluntary Donor 1');
    donor1Token = donor1Auth.token;
    donor1UserId = donor1Auth.userId;

    const donor2Auth = await loginUser(donor2Phone, 'Voluntary Donor 2');
    donor2Token = donor2Auth.token;
    donor2UserId = donor2Auth.userId;

    // Create Donor Profiles
    await prisma.donorProfile.upsert({
      where: { userId: donor1UserId },
      update: { bloodGroup: 'O_POS', isAvailable: true, isSearchable: true },
      create: {
        userId: donor1UserId,
        fullName: 'Voluntary Donor 1',
        bloodGroup: 'O_POS',
        districtCode: 494,
        isAvailable: true,
        isSearchable: true,
      },
    });

    await prisma.donorProfile.upsert({
      where: { userId: donor2UserId },
      update: { bloodGroup: 'A_POS', isAvailable: true, isSearchable: true },
      create: {
        userId: donor2UserId,
        fullName: 'Voluntary Donor 2',
        bloodGroup: 'A_POS',
        districtCode: 494,
        isAvailable: true,
        isSearchable: true,
      },
    });

    // Create Verified Test Organisation A
    const testOrgA = await prisma.organisation.upsert({
      where: { orgCode: 'ORG-TEST-PHASE3-A' },
      update: { status: 'VERIFIED' },
      create: {
        orgCode: 'ORG-TEST-PHASE3-A',
        name: 'Phase 3 Regional Blood Transfusion Center',
        type: 'BLOOD_BANK',
        licenseNumber: 'LIC-P3-A-2026',
        districtCode: 494,
        status: 'VERIFIED',
      },
    });
    organisationIdA = testOrgA.id;

    // Create Verified Test Organisation B
    const testOrgB = await prisma.organisation.upsert({
      where: { orgCode: 'ORG-TEST-PHASE3-B' },
      update: { status: 'VERIFIED' },
      create: {
        orgCode: 'ORG-TEST-PHASE3-B',
        name: 'Unrelated Hospital Blood Centre B',
        type: 'BLOOD_BANK',
        licenseNumber: 'LIC-P3-B-2026',
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
      where: { userId_organisationId: { userId: clinicalStaffUserId, organisationId: organisationIdA } },
      update: { role: 'CLINICAL_STAFF', isActive: true },
      create: { userId: clinicalStaffUserId, organisationId: organisationIdA, role: 'CLINICAL_STAFF', isActive: true },
    });
    await prisma.organisationMembership.upsert({
      where: { userId_organisationId: { userId: collectionStaffUserId, organisationId: organisationIdA } },
      update: { role: 'COLLECTION_STAFF', isActive: true },
      create: { userId: collectionStaffUserId, organisationId: organisationIdA, role: 'COLLECTION_STAFF', isActive: true },
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

    console.log('Setup completed successfully.\n');

    // ----------------------------------------------------
    // Section 1: Camp Management, Approval & Readiness Boundary
    // ----------------------------------------------------
    console.log('--- Section 1: Camp Creation, Approval & Readiness Boundary ---');

    // 1. Unauthenticated request to camp endpoints is rejected
    const unauthRes = await request('/camps', {
      method: 'POST',
      body: JSON.stringify({ title: 'Unauthorized Drive' }),
    });
    assert(
      unauthRes.status === 400 || unauthRes.status === 401,
      '1. Invalid/unauthorized camp proposal without required parameters rejected'
    );

    // 2. Propose a camp linked to Organisation A
    const campPropRes = await request('/camps', {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgAdminToken}` },
      body: JSON.stringify({
        title: 'Phase 3 Community Blood Drive',
        organizerName: 'Rotary Outreach Foundation',
        targetDate: '2026-11-20T09:00:00Z',
        venue: 'Town Hall Pavilion, Pune',
        districtCode: 494,
        expectedDonors: 100,
        coordinatorContact: '+919999988001',
        organisationId: organisationIdA,
      }),
    });
    assert(
      campPropRes.status === 201 && campPropRes.data?.data?.status === 'PROPOSED',
      '2. Camp proposed successfully with initial status PROPOSED'
    );
    campId = campPropRes.data?.data?.id;

    // Create a second camp that stays PROPOSED to test public visibility isolation
    const proposedCampRes = await request('/camps', {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgAdminToken}` },
      body: JSON.stringify({
        title: 'Internal Proposed Unapproved Camp',
        organizerName: 'Draft Committee',
        targetDate: '2026-11-25T09:00:00Z',
        venue: 'Draft Venue',
        districtCode: 494,
        organisationId: organisationIdA,
      }),
    });
    proposedCampId = proposedCampRes.data?.data?.id;

    // 3. Public display strictly shows ONLY approved camps (not PROPOSED)
    const publicCampsRes = await request('/camps');
    const publicList = publicCampsRes.data?.data || [];
    const hasProposedCamp = publicList.some((c: any) => c.id === proposedCampId || c.status === 'PROPOSED');
    assert(
      publicCampsRes.status === 200 && !hasProposedCamp,
      '3. Public camps endpoint strictly withholds unapproved PROPOSED camps'
    );

    // 4. Cross-organisation access denial: Org B staff cannot modify Org A camp
    const crossOrgEdit = await request(`/camps/${campId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${orgBStaffToken}` },
      body: JSON.stringify({ venue: 'Tampered Venue by Org B' }),
    });
    assert(
      crossOrgEdit.status === 403,
      '4. Cross-organisation camp modification attempt rejected with 403 Forbidden'
    );

    // 5. Readiness verification rejected while camp is still PROPOSED
    const prematureReadiness = await request(`/camps/${campId}/readiness`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgAdminToken}` },
      body: JSON.stringify({ isReadyForCollection: true }),
    });
    assert(
      prematureReadiness.status === 400 && prematureReadiness.data?.error?.message?.includes('must be APPROVED'),
      '5. Operational readiness check rejected for unapproved PROPOSED camp (Readiness Boundary Enforced)'
    );

    // 6. Org Admin approves camp
    const approveCampRes = await request(`/camps/${campId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${orgAdminToken}` },
      body: JSON.stringify({ status: 'APPROVED', reason: 'Site inspection completed' }),
    });
    assert(
      approveCampRes.status === 200 && approveCampRes.data?.data?.status === 'APPROVED',
      '6. Org Admin approves camp status to APPROVED',
      JSON.stringify(approveCampRes.data)
    );

    // 7. Verify operational readiness checklist by authorized collection team
    const readinessRes = await request(`/camps/${campId}/readiness`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${collectionStaffToken}` },
      body: JSON.stringify({
        isReadyForCollection: true,
        readinessChecklist: {
          staffAssigned: true,
          coldChainVerified: true,
          emergencyKitAvailable: true,
          consumablesStocked: true,
          spaceSanitized: true,
        },
        readinessNotes: 'Phlebotomy chairs positioned; 2-6°C transport boxes ready',
      }),
    });
    assert(
      readinessRes.status === 200 && readinessRes.data?.data?.isReadyForCollection === true,
      '7. Operational readiness checklist verified by COLLECTION_STAFF'
    );

    // 8. Public view now displays the APPROVED camp
    const publicAfterApproval = await request('/camps');
    const approvedInPublic = publicAfterApproval.data?.data?.some((c: any) => c.id === campId && c.status === 'APPROVED');
    assert(
      approvedInPublic,
      '8. Approved camp is now safely displayed in public directory'
    );

    // ----------------------------------------------------
    // Section 2: Donor Registration, Attendance & Check-In
    // ----------------------------------------------------
    console.log('\n--- Section 2: Donor Attendance Roster & Check-In ---');

    // 9. Register Donor 1 attendance
    const attend1Res = await request(`/camps/${campId}/attendance`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${donor1Token}` },
      body: JSON.stringify({
        phoneOrUserId: donor1Phone,
        donorName: 'Voluntary Donor 1',
        bloodGroup: 'O_POS',
      }),
    });
    assert(
      attend1Res.status === 201 && attend1Res.data?.data?.status === 'REGISTERED',
      '9. Donor attendance registered successfully in REGISTERED status'
    );
    attendance1Id = attend1Res.data?.data?.id;

    // 10. Duplicate attendance prevention: same donor registering twice for same camp
    const duplicateAttendRes = await request(`/camps/${campId}/attendance`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${donor1Token}` },
      body: JSON.stringify({
        phoneOrUserId: donor1Phone,
        donorName: 'Voluntary Donor 1 Duplicate',
      }),
    });
    assert(
      duplicateAttendRes.status === 409 && duplicateAttendRes.data?.error?.code === 'DUPLICATE_ATTENDANCE',
      '10. Duplicate attendance registration strictly rejected with 409 Conflict'
    );

    // 11. Staff registers Donor 2 walk-in
    const attend2Res = await request(`/camps/${campId}/attendance`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${collectionStaffToken}` },
      body: JSON.stringify({
        phoneOrUserId: donor2Phone,
        donorName: 'Voluntary Donor 2',
        bloodGroup: 'A_POS',
      }),
    });
    assert(
      attend2Res.status === 201,
      '11. Collection staff registers walk-in donor attendance successfully'
    );
    attendance2Id = attend2Res.data?.data?.id;

    // 12. Cross-organisation roster isolation: Org B cannot view Org A attendance roster
    const crossOrgRoster = await request(`/camps/${campId}/attendance`, {
      headers: { Authorization: `Bearer ${orgBStaffToken}` },
    });
    assert(
      crossOrgRoster.status === 403,
      '12. Cross-organisation roster lookup rejected with 403 Forbidden'
    );

    // 13. Donor information protection: Non-admin staff views masked phone numbers
    const rosterRes = await request(`/camps/${campId}/attendance`, {
      headers: { Authorization: `Bearer ${clinicalStaffToken}` },
    });
    const attendees = rosterRes.data?.data || [];
    assert(
      rosterRes.status === 200 && attendees.length === 2,
      '13. Authorised staff retrieves attendance roster'
    );

    // 14. Check in Donor 1 upon arrival
    const checkInRes = await request(`/camps/${campId}/attendance/${attendance1Id}/check-in`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${collectionStaffToken}` },
    });
    assert(
      checkInRes.status === 200 && checkInRes.data?.data?.status === 'CHECKED_IN',
      '14. Donor 1 checked in by collection staff (status: CHECKED_IN)'
    );

    // 15. Attendance check-in is idempotent
    const checkInIdempotent = await request(`/camps/${campId}/attendance/${attendance1Id}/check-in`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${collectionStaffToken}` },
    });
    assert(
      checkInIdempotent.status === 200 && checkInIdempotent.data?.data?.status === 'CHECKED_IN',
      '15. Repeated check-in is idempotent and succeeds without state duplication'
    );

    // 16. Attendance does NOT imply donation: Verified no donation event exists yet
    const preDonationEvents = await prisma.donationEvent.count({ where: { campId } });
    assert(
      preDonationEvents === 0,
      '16. Attendance is strictly distinct from donation: 0 donation events recorded upon check-in'
    );

    // ----------------------------------------------------
    // Section 3: Informed Consent & Clinical Screening
    // ----------------------------------------------------
    console.log('\n--- Section 3: Informed Consent & Clinical Screening Evaluation ---');

    // 17. Non-clinical staff (COLLECTION_STAFF) cannot perform clinical screening
    const collectionScreenAttempt = await request(`/camps/${campId}/attendance/${attendance1Id}/screening`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${collectionStaffToken}` },
      body: JSON.stringify({
        consentGiven: true,
        eligibilityDecision: 'CLEARED',
      }),
    });
    assert(
      collectionScreenAttempt.status === 403,
      '17. Non-clinical staff cannot perform clinical screening (Clinical Role Gate Enforced)'
    );

    // 18. Auditor cannot perform clinical screening
    const auditorScreenAttempt = await request(`/camps/${campId}/attendance/${attendance1Id}/screening`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auditorToken}` },
      body: JSON.stringify({
        consentGiven: true,
        eligibilityDecision: 'CLEARED',
      }),
    });
    assert(
      auditorScreenAttempt.status === 403,
      '18. Auditor cannot perform clinical screening (Read-only Boundary Enforced)'
    );

    // 19. Cannot clinically screen donor who is not checked in (Donor 2 is only REGISTERED)
    const unCheckedInScreenAttempt = await request(`/camps/${campId}/attendance/${attendance2Id}/screening`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clinicalStaffToken}` },
      body: JSON.stringify({
        consentGiven: true,
        eligibilityDecision: 'CLEARED',
      }),
    });
    assert(
      unCheckedInScreenAttempt.status === 400 && unCheckedInScreenAttempt.data?.error?.message?.includes('CHECKED_IN'),
      '19. Cannot clinically screen a donor before physical arrival and check-in'
    );

    // 20. Informed consent required: screening without consent is rejected
    const noConsentScreen = await request(`/camps/${campId}/attendance/${attendance1Id}/screening`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clinicalStaffToken}` },
      body: JSON.stringify({
        consentGiven: false,
        eligibilityDecision: 'CLEARED',
      }),
    });
    assert(
      noConsentScreen.status === 400 && noConsentScreen.data?.error?.message?.includes('consent'),
      '20. Clinical screening rejected if informed consent is not recorded'
    );

    // 21. Qualified CLINICAL_STAFF records informed consent and CLEARED decision for Donor 1
    const screen1Res = await request(`/camps/${campId}/attendance/${attendance1Id}/screening`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clinicalStaffToken}` },
      body: JSON.stringify({
        consentVersion: 'v1.0',
        consentGiven: true,
        eligibilityDecision: 'CLEARED',
        clinicalNotes: 'Hemoglobin 13.8 g/dL; BP 120/80; vitals normal',
      }),
    });
    assert(
      screen1Res.status === 201 && screen1Res.data?.data?.status === 'CLEARED',
      '21. CLINICAL_STAFF records informed consent and CLEARED clinical screening decision'
    );
    screening1Id = screen1Res.data?.data?.id;

    // 22. Prohibit duplicate screening: Re-submitting screening for same attendee rejected
    const duplicateScreen = await request(`/camps/${campId}/attendance/${attendance1Id}/screening`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clinicalStaffToken}` },
      body: JSON.stringify({
        consentGiven: true,
        eligibilityDecision: 'CLEARED',
      }),
    });
    assert(
      duplicateScreen.status === 400 && duplicateScreen.data?.error?.message?.includes('already been recorded'),
      '22. Duplicate screening submission rejected; amendments required for corrections'
    );

    // 23. Check in Donor 2 and record clinical DEFERRAL (e.g. low hemoglobin)
    await request(`/camps/${campId}/attendance/${attendance2Id}/check-in`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${collectionStaffToken}` },
    });
    const deferScreenRes = await request(`/camps/${campId}/attendance/${attendance2Id}/screening`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clinicalStaffToken}` },
      body: JSON.stringify({
        consentVersion: 'v1.0',
        consentGiven: true,
        eligibilityDecision: 'TEMPORARY_DEFERRAL',
        deferralCategory: 'LOW_HEMOGLOBIN',
        deferralDurationDays: 14,
        clinicalNotes: 'Hb 11.2 g/dL below standard threshold',
      }),
    });
    assert(
      deferScreenRes.status === 201 && deferScreenRes.data?.data?.status === 'DEFERRED',
      '23. CLINICAL_STAFF records temporary deferral with structured category and duration'
    );

    // 24. Auditable clinical amendment requires reason
    const unreasonedAmendment = await request(`/camps/${campId}/screenings/${screening1Id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${clinicalStaffToken}` },
      body: JSON.stringify({
        eligibilityDecision: 'CLEARED',
        amendmentReason: '',
      }),
    });
    assert(
      unreasonedAmendment.status === 400 && unreasonedAmendment.data?.error?.message?.includes('reason is mandatory'),
      '24. Clinical amendment rejected without mandatory auditable reason'
    );

    // 25. Auditable clinical amendment with reason succeeds and sets amendment audit fields
    const validAmendment = await request(`/camps/${campId}/screenings/${screening1Id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${clinicalStaffToken}` },
      body: JSON.stringify({
        eligibilityDecision: 'CLEARED',
        amendmentReason: 'Secondary hemoglobin verification confirmed at 14.1 g/dL',
      }),
    });
    assert(
      validAmendment.status === 200 && validAmendment.data?.data?.isAmended === true,
      '25. Auditable clinical amendment succeeds recording isAmended and amendmentReason'
    );

    // ----------------------------------------------------
    // Section 4: Donation Events & Clinical Clearance Invariant
    // ----------------------------------------------------
    console.log('\n--- Section 4: Donation Event Recording & Clinical Clearance Invariant ---');

    // 26. CLINICAL INVARIANT: Cannot record completed donation for DEFERRED donor (Donor 2)
    const deferredDonationAttempt = await request(`/camps/${campId}/attendance/${attendance2Id}/donation`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${collectionStaffToken}` },
      body: JSON.stringify({
        bloodGroup: 'A_POS',
        outcome: 'COMPLETED',
        volumeMl: 450,
      }),
    });
    assert(
      deferredDonationAttempt.status === 400 && deferredDonationAttempt.data?.error?.message?.includes('CLEARED'),
      '26. CRITICAL: Completed donation rejected for clinically DEFERRED donor'
    );

    // 27. Inventory staff or Auditor cannot record donation events
    const auditorDonationAttempt = await request(`/camps/${campId}/attendance/${attendance1Id}/donation`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auditorToken}` },
      body: JSON.stringify({
        bloodGroup: 'O_POS',
        outcome: 'COMPLETED',
      }),
    });
    assert(
      auditorDonationAttempt.status === 403,
      '27. Auditor rejected when attempting to record a donation event'
    );

    // 28. COLLECTION_STAFF records completed donation for CLEARED donor (Donor 1)
    const donation1Res = await request(`/camps/${campId}/attendance/${attendance1Id}/donation`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${collectionStaffToken}` },
      body: JSON.stringify({
        bloodGroup: 'O_POS',
        donationType: 'WHOLE_BLOOD',
        outcome: 'COMPLETED',
        volumeMl: 450,
        adverseReaction: false,
        notes: 'Smooth collection via standard venipuncture; no hematoma',
      }),
    });
    assert(
      donation1Res.status === 201 && donation1Res.data?.data?.outcome === 'COMPLETED',
      '28. Completed whole blood donation event recorded for clinically cleared donor'
    );
    donation1Id = donation1Res.data?.data?.id;

    // 29. Prevents duplicate donation completion on retry
    const duplicateDonationAttempt = await request(`/camps/${campId}/attendance/${attendance1Id}/donation`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${collectionStaffToken}` },
      body: JSON.stringify({
        bloodGroup: 'O_POS',
        outcome: 'COMPLETED',
      }),
    });
    assert(
      duplicateDonationAttempt.status === 400 && duplicateDonationAttempt.data?.error?.message?.includes('already been recorded'),
      '29. Duplicate donation event on same attendance record strictly rejected'
    );

    // 30. Completed donation event updates donor verifiedLastDonationDate (triggers 90-day clinical deferral)
    const donor1Profile = await prisma.donorProfile.findUnique({
      where: { userId: donor1UserId },
    });
    assert(
      donor1Profile?.verifiedLastDonationDate !== null,
      '30. Completed donation event sets donor verifiedLastDonationDate for subsequent eligibility calculations'
    );

    // 31. Cannot cancel attendance after donation has been completed
    const cancelAfterDonation = await request(`/camps/${campId}/attendance/${attendance1Id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgAdminToken}` },
      body: JSON.stringify({ reason: 'Accidental cancel' }),
    });
    assert(
      cancelAfterDonation.status === 400 && cancelAfterDonation.data?.error?.message?.includes('already been recorded'),
      '31. Attendance cancellation prohibited after completed donation event'
    );

    // 32. Cannot retroactively defer screening after donation has already completed
    const deferAfterCompletedDonation = await request(`/camps/${campId}/screenings/${screening1Id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${clinicalStaffToken}` },
      body: JSON.stringify({
        eligibilityDecision: 'TEMPORARY_DEFERRAL',
        amendmentReason: 'Retrospective deferral attempt',
      }),
    });
    assert(
      deferAfterCompletedDonation.status === 400 && deferAfterCompletedDonation.data?.error?.message?.includes('already been recorded'),
      '32. Screening retro-deferral blocked once completed blood donation is committed'
    );

    // ----------------------------------------------------
    // Section 5: Audit Trail & Security Assurance
    // ----------------------------------------------------
    console.log('\n--- Section 5: Audit Logging & Security Assurance ---');

    const auditActions = await prisma.auditLog.findMany({
      where: {
        action: {
          in: [
            'CAMP_READINESS_VERIFIED',
            'CAMP_ATTENDANCE_REGISTERED',
            'CAMP_ATTENDANCE_CHECKED_IN',
            'CLINICAL_SCREENING_RECORDED',
            'CLINICAL_SCREENING_AMENDED',
            'DONATION_EVENT_RECORDED',
          ],
        },
      },
    });

    // 33. All Phase 3 operational actions produce audit logs
    const hasReadinessAudit = auditActions.some((a) => a.action === 'CAMP_READINESS_VERIFIED');
    const hasAttendanceAudit = auditActions.some((a) => a.action === 'CAMP_ATTENDANCE_REGISTERED');
    const hasScreeningAudit = auditActions.some((a) => a.action === 'CLINICAL_SCREENING_RECORDED');
    const hasDonationAudit = auditActions.some((a) => a.action === 'DONATION_EVENT_RECORDED');
    assert(
      hasReadinessAudit && hasAttendanceAudit && hasScreeningAudit && hasDonationAudit,
      '33. Comprehensive audit entries produced for readiness, attendance, screening, and donation'
    );

    // 34. Audit logs do not contain raw medical notes, passwords, or tokens
    const auditLogsString = JSON.stringify(auditActions);
    const leaksSensitiveData =
      auditLogsString.includes('123456') ||
      auditLogsString.includes('password') ||
      auditLogsString.includes('Hemoglobin 13.8');
    assert(
      !leaksSensitiveData,
      '34. Audit logs are sanitized: No passwords, OTPs, or confidential clinical notes exposed'
    );

    // 35. Camp details endpoint returns aggregated operational counters for org members
    const campDetailsRes = await request(`/camps/${campId}`, {
      headers: { Authorization: `Bearer ${orgAdminToken}` },
    });
    const counts = campDetailsRes.data?.data?.counts;
    assert(
      counts?.registeredDonors === 2 &&
      counts?.checkedInDonors === 2 &&
      counts?.clinicallyCleared === 1 &&
      counts?.completedDonations === 1,
      '35. Detailed camp console returns verified counts (2 Registered, 2 Checked In, 1 Cleared, 1 Completed)'
    );

  } catch (err: any) {
    console.error('Unexpected test execution error:', err);
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

runPhase3CampOperationsTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
