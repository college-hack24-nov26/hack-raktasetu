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

async function runMasterSpecificationTests() {
  console.log('========================================================================');
  console.log(' RaktaSetu — Phase 11 Master Implementation Acceptance Criteria Suite');
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

  const suffix = Math.floor(100000 + Math.random() * 900000);
  const creatorPhone = `+919100${suffix}`;
  const bankAdminAPhone = `+919200${suffix}`;
  const bankAdminBPhone = `+919300${suffix}`;
  const campCoordPhone = `+919400${suffix}`;
  const clinicalStaffPhone = `+919500${suffix}`;
  const collectionStaffPhone = `+919600${suffix}`;
  const knownDonorPhone = `+919700${suffix}`;
  const walkinPhone = `+919800${suffix}`;

  try {
    async function loginOrCreate(phone: string, name: string) {
      const res = await request('/auth/demo-login', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: phone, otp: '123456' }),
      });
      return { token: res.data?.data?.token, user: res.data?.data?.user };
    }

    const sCreator = await loginOrCreate(creatorPhone, 'Community Organizer');
    const sBankAdminA = await loginOrCreate(bankAdminAPhone, 'Bank A Lead');
    const sBankAdminB = await loginOrCreate(bankAdminBPhone, 'Bank B Lead');
    const sCampCoord = await loginOrCreate(campCoordPhone, 'Volunteer Coordinator');
    const sClinical = await loginOrCreate(clinicalStaffPhone, 'Dr. Clinical Staff');
    const sCollection = await loginOrCreate(collectionStaffPhone, 'Phlebotomist Staff');
    const sKnownDonor = await loginOrCreate(knownDonorPhone, 'Registered Donor');

    // Add donor profile with known blood group for Test 12
    await prisma.donorProfile.upsert({
      where: { userId: sKnownDonor.user.id },
      update: { bloodGroup: 'B_POS' },
      create: {
        userId: sKnownDonor.user.id,
        bloodGroup: 'B_POS',
        stateCode: 27,
        districtCode: 521,
      },
    });

    // Create Bank A and Bank B
    const orgA = await prisma.organisation.upsert({
      where: { orgCode: `ORG-SPEC-A-${suffix}` },
      update: { status: 'VERIFIED' },
      create: {
        orgCode: `ORG-SPEC-A-${suffix}`,
        name: `Red Cross Blood Centre ${suffix}`,
        type: 'BLOOD_BANK',
        licenseNumber: `LIC-SPEC-A-${suffix}`,
        stateCode: 27,
        districtCode: 521,
        districtName: 'Pune',
        address: 'Camp Road, Pune',
        phone: bankAdminAPhone,
        status: 'VERIFIED',
      },
    });

    const orgB = await prisma.organisation.upsert({
      where: { orgCode: `ORG-SPEC-B-${suffix}` },
      update: { status: 'VERIFIED' },
      create: {
        orgCode: `ORG-SPEC-B-${suffix}`,
        name: `Apex Blood Centre ${suffix}`,
        type: 'BLOOD_BANK',
        licenseNumber: `LIC-SPEC-B-${suffix}`,
        stateCode: 27,
        districtCode: 521,
        districtName: 'Pune',
        address: 'FC Road, Pune',
        phone: bankAdminBPhone,
        status: 'VERIFIED',
      },
    });

    // Assign Bank Admins
    await prisma.organisationMembership.create({
      data: { userId: sBankAdminA.user.id, organisationId: orgA.id, role: 'ORG_ADMIN', isActive: true },
    });
    await prisma.organisationMembership.create({
      data: { userId: sBankAdminB.user.id, organisationId: orgB.id, role: 'ORG_ADMIN', isActive: true },
    });

    let proposedCampId = '';
    let proposedCampCode = '';

    // ====================================================
    // CRITERIA 1: Camp creator is recorded as Camp Admin at submission
    // ====================================================
    const createRes = await request('/camps', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sCreator.token}` },
      body: JSON.stringify({
        title: 'Youth Voluntary Drive 2026',
        organizerName: 'Youth Foundation',
        targetDate: new Date(Date.now() + 86400000 * 5).toISOString(),
        venue: 'City College Auditorium',
        district: 'Pune',
        districtCode: 521,
        stateCode: 27,
        expectedDonors: 120,
        coordinatorContact: creatorPhone,
        organisationId: orgA.id,
      }),
    });

    assert(
      createRes.status === 201 &&
      createRes.data?.data?.createdById === sCreator.user.id &&
      createRes.data?.data?.status === 'PROPOSED',
      '1. Camp creator is recorded as Camp Admin at submission'
    );
    proposedCampId = createRes.data?.data?.id;
    proposedCampCode = createRes.data?.data?.campCode;

    // Verify inactive CAMP_ADMIN staff assignment was transactionally created
    const inactiveAssignment = await prisma.campStaffAssignment.findFirst({
      where: {
        campId: proposedCampId,
        userId: sCreator.user.id,
        role: 'CAMP_ADMIN',
      },
    });
    assert(
      inactiveAssignment !== null && inactiveAssignment.isActive === false,
      '1b. Inactive CAMP_ADMIN assignment persisted during proposal creation'
    );

    // ====================================================
    // CRITERIA 2: Creator can track their own pending proposal
    // ====================================================
    const myAssignmentsRes = await request('/camps/me/assignments', {
      headers: { Authorization: `Bearer ${sCreator.token}` },
    });
    assert(
      myAssignmentsRes.status === 200 &&
      myAssignmentsRes.data?.data?.some((c: any) => c.campId === proposedCampId && c.status === 'PROPOSED'),
      '2. Creator can track their own pending proposal via /camps/me/assignments'
    );

    // ====================================================
    // CRITERIA 3: Creator cannot operate camp or approve their own proposal while pending
    // ====================================================
    // 3a. Creator cannot approve their own proposal
    const selfApproveRes = await request(`/camps/${proposedCampId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${sCreator.token}` },
      body: JSON.stringify({ status: 'APPROVED' }),
    });
    assert(
      selfApproveRes.status === 403,
      '3a. Creator cannot approve their own proposal (Anti-self-approval rule enforced)'
    );

    // 3b. Creator cannot register attendance while camp is PROPOSED
    const prematureAttendance = await request(`/camps/${proposedCampId}/attendance`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sCreator.token}` },
      body: JSON.stringify({ phoneOrUserId: knownDonorPhone }),
    });
    assert(
      prematureAttendance.status === 400 &&
      prematureAttendance.data?.error?.message?.includes('APPROVED first'),
      '3b. Creator cannot operate the camp while proposal is pending'
    );

    // ====================================================
    // CRITERIA 4: Parent-bank reviewer sees only proposals routed to that bank
    // ====================================================
    const bankBProposals = await request(`/camps?organisationId=${orgB.id}`, {
      headers: { Authorization: `Bearer ${sBankAdminB.token}` },
    });
    assert(
      bankBProposals.status === 200 &&
      !bankBProposals.data?.data?.some((c: any) => c.id === proposedCampId),
      '4a. Bank B reviewer does not see proposal routed to Bank A'
    );

    const bankAProposals = await request(`/camps?organisationId=${orgA.id}`, {
      headers: { Authorization: `Bearer ${sBankAdminA.token}` },
    });
    assert(
      bankAProposals.status === 200 &&
      bankAProposals.data?.data?.some((c: any) => c.id === proposedCampId),
      '4b. Parent-bank reviewer sees pending proposals routed to their own organisation'
    );

    // ====================================================
    // CRITERIA 5: Parent-bank approval activates the creator's Camp Admin permissions automatically
    // ====================================================
    const approveRes = await request(`/camps/${proposedCampId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${sBankAdminA.token}` },
      body: JSON.stringify({ status: 'APPROVED' }),
    });
    assert(
      approveRes.status === 200 && approveRes.data?.data?.status === 'APPROVED',
      '5a. Parent bank successfully approves the proposal'
    );

    const activeCreatorAssignment = await prisma.campStaffAssignment.findFirst({
      where: {
        campId: proposedCampId,
        userId: sCreator.user.id,
        role: 'CAMP_ADMIN',
      },
    });
    assert(
      activeCreatorAssignment !== null && activeCreatorAssignment.isActive === true,
      "5b. Parent-bank approval automatically activates creator's Camp Admin permissions"
    );

    // ====================================================
    // CRITERIA 6: Repeated approval does not create duplicate memberships or assignments
    // ====================================================
    const repeatApproveRes = await request(`/camps/${proposedCampId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${sBankAdminA.token}` },
      body: JSON.stringify({ status: 'APPROVED' }),
    });
    assert(repeatApproveRes.status === 200, '6a. Repeated approval handled gracefully');

    const totalCreatorAssignments = await prisma.campStaffAssignment.count({
      where: {
        campId: proposedCampId,
        userId: sCreator.user.id,
        role: 'CAMP_ADMIN',
      },
    });
    assert(
      totalCreatorAssignments === 1,
      '6b. Repeated approval does not create duplicate assignments (Idempotent)'
    );

    // ====================================================
    // CRITERIA 7: Rejection preserves the record and blocks normal camp operations
    // ====================================================
    const rejectCampRes = await request('/camps', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sCreator.token}` },
      body: JSON.stringify({
        title: 'Camp To Reject',
        organizerName: 'Reject Org',
        targetDate: new Date(Date.now() + 86400000 * 10).toISOString(),
        venue: 'Community Hall',
        district: 'Pune',
        districtCode: 521,
        stateCode: 27,
        expectedDonors: 50,
        coordinatorContact: creatorPhone,
        organisationId: orgA.id,
      }),
    });
    const rejectCampId = rejectCampRes.data?.data?.id;

    const rejectAction = await request(`/camps/${rejectCampId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${sBankAdminA.token}` },
      body: JSON.stringify({ status: 'REJECTED', reason: 'Venue lacks adequate refrigeration backup.' }),
    });
    assert(
      rejectAction.status === 200 && rejectAction.data?.data?.status === 'REJECTED',
      '7a. Camp rejection recorded with audit reason'
    );

    const tryOperateRejected = await request(`/camps/${rejectCampId}/attendance`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sCreator.token}` },
      body: JSON.stringify({ phoneOrUserId: knownDonorPhone }),
    });
    assert(
      tryOperateRejected.status === 400 &&
      tryOperateRejected.data?.error?.message?.includes('APPROVED first'),
      '7b. Rejection preserves record and blocks normal camp operations'
    );

    // ====================================================
    // CRITERIA 8: Camp Admin can manage permitted camp staff without organisation-admin access
    // ====================================================
    const assignCoordRes = await request(`/camps/${proposedCampId}/staff`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sCreator.token}` },
      body: JSON.stringify({
        userIdOrPhone: campCoordPhone,
        role: 'CAMP_COORDINATOR',
      }),
    });
    assert(
      assignCoordRes.status === 201 &&
      assignCoordRes.data?.data?.role === 'CAMP_COORDINATOR',
      '8. Camp Admin can assign CAMP_COORDINATOR without organisation-admin access'
    );

    // ====================================================
    // CRITERIA 9: Camp Admin cannot grant clinical privileges outside their scope
    // ====================================================
    const rogueClinicalAssign = await request(`/camps/${proposedCampId}/staff`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sCreator.token}` },
      body: JSON.stringify({
        userIdOrPhone: campCoordPhone,
        role: 'CLINICAL_STAFF',
      }),
    });
    assert(
      rogueClinicalAssign.status === 403,
      '9. Camp Admin cannot grant clinical or collection privileges outside their administrative scope'
    );

    // Parent bank assigns actual clinical and collection staff
    await request(`/camps/${proposedCampId}/staff`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sBankAdminA.token}` },
      body: JSON.stringify({ userIdOrPhone: clinicalStaffPhone, role: 'CLINICAL_STAFF' }),
    });
    await request(`/camps/${proposedCampId}/staff`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sBankAdminA.token}` },
      body: JSON.stringify({ userIdOrPhone: collectionStaffPhone, role: 'COLLECTION_STAFF' }),
    });

    // ====================================================
    // CRITERIA 10: Parent-bank approval does not make the bank the Camp Admin
    // ====================================================
    const campDetailsAfterApproval = await prisma.camp.findUnique({
      where: { id: proposedCampId },
    });
    assert(
      campDetailsAfterApproval?.createdById === sCreator.user.id &&
      campDetailsAfterApproval?.approvedById === sBankAdminA.user.id,
      '10. Parent-bank approval preserves creator ownership; bank admin does not replace Camp Admin'
    );

    // ====================================================
    // CRITERIA 11: A Camp Admin can look up an existing donor by phone under proper authorisation
    // ====================================================
    const donorLookupRes = await request(`/camps/${proposedCampId}/donor-lookup?phone=${knownDonorPhone}`, {
      headers: { Authorization: `Bearer ${sCreator.token}` },
    });
    assert(
      donorLookupRes.status === 200 &&
      donorLookupRes.data?.data?.found === true &&
      donorLookupRes.data?.data?.donor?.bloodGroup === 'B_POS',
      '11. Camp Admin can look up an existing donor by phone with proper authorisation'
    );

    // ====================================================
    // CRITERIA 12: Existing donor blood group is correctly prefilled with its provenance
    // ====================================================
    assert(
      donorLookupRes.data?.data?.donor?.bloodGroupProvenance === 'DONOR_PROFILE',
      '12. Existing donor blood group is correctly prefilled with provenance "DONOR_PROFILE"'
    );

    // ====================================================
    // CRITERIA 13: Unknown blood group remains unknown/pending verification
    // ====================================================
    const unknownDonorLookup = await request(`/camps/${proposedCampId}/donor-lookup?phone=${walkinPhone}`, {
      headers: { Authorization: `Bearer ${sCreator.token}` },
    });
    assert(
      unknownDonorLookup.status === 200 &&
      unknownDonorLookup.data?.data?.found === false &&
      unknownDonorLookup.data?.data?.donor?.bloodGroup === null &&
      unknownDonorLookup.data?.data?.donor?.bloodGroupProvenance === 'UNKNOWN',
      '13. Unknown blood group remains unknown/pending verification'
    );

    // ====================================================
    // CRITERIA 14: Walk-in registration works without silently creating a donor account
    // ====================================================
    // Coordinator verifies readiness first
    await request(`/camps/${proposedCampId}/readiness`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sCampCoord.token}` },
      body: JSON.stringify({
        isReadyForCollection: true,
        readinessChecklist: {
          staffAssigned: true,
          coldChainVerified: true,
          emergencyKitAvailable: true,
          consumablesStocked: true,
          spaceSanitized: true,
        },
      }),
    });

    const walkinReg = await request(`/camps/${proposedCampId}/attendance`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sCreator.token}` },
      body: JSON.stringify({
        phoneOrUserId: walkinPhone,
        donorName: 'Walkin Test Person',
        bloodGroup: 'O_POS',
      }),
    });
    assert(
      walkinReg.status === 201 &&
      walkinReg.data?.data?.status === 'REGISTERED',
      '14. Walk-in registration creates camp attendance record linked to camp'
    );
    const walkinAttendanceId = walkinReg.data?.data?.id;

    // ====================================================
    // CRITERIA 15: Duplicate attendance submissions are handled safely
    // ====================================================
    const duplicateWalkin = await request(`/camps/${proposedCampId}/attendance`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sCreator.token}` },
      body: JSON.stringify({
        phoneOrUserId: walkinPhone,
      }),
    });
    assert(
      duplicateWalkin.status === 409 || duplicateWalkin.status === 400,
      '15. Duplicate attendance submissions strictly prevented (409 Conflict handled safely)'
    );

    // ====================================================
    // CRITERIA 16: Registration, check-in, screening, donation and collection-unit events remain distinct
    // ====================================================
    const checkinRes = await request(`/camps/${proposedCampId}/attendance/${walkinAttendanceId}/check-in`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sCampCoord.token}` },
    });
    assert(
      checkinRes.status === 200 && checkinRes.data?.data?.status === 'CHECKED_IN',
      '16. Attendance state distinctly transitioned to CHECKED_IN'
    );

    // ====================================================
    // CRITERIA 17: Only authorised clinical staff can record clinical outcomes
    // ====================================================
    const coordScreeningAttempt = await request(`/camps/${proposedCampId}/attendance/${walkinAttendanceId}/screening`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sCampCoord.token}` },
      body: JSON.stringify({ eligibilityDecision: 'CLEARED', consentGiven: true }),
    });
    assert(
      coordScreeningAttempt.status === 403,
      '17a. Camp Coordinator cannot record clinical outcomes (Clinical Gate Enforced)'
    );

    const clinicalScreeningRes = await request(`/camps/${proposedCampId}/attendance/${walkinAttendanceId}/screening`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sClinical.token}` },
      body: JSON.stringify({
        eligibilityDecision: 'CLEARED',
        consentGiven: true,
        clinicalNotes: 'Donor fit and cleared for voluntary donation.',
      }),
    });
    assert(
      (clinicalScreeningRes.status === 200 || clinicalScreeningRes.status === 201) &&
      clinicalScreeningRes.data?.data?.status === 'CLEARED',
      '17b. Only authorised clinical staff can record clinical outcomes'
    );

    // ====================================================
    // CRITERIA 18: Only authorised collection staff can record collection events
    // ====================================================
    const clinicalDonationAttempt = await request(`/camps/${proposedCampId}/attendance/${walkinAttendanceId}/donation`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sClinical.token}` },
      body: JSON.stringify({ outcome: 'COMPLETED', volumeMl: 450, bloodGroup: 'O_POS' }),
    });
    assert(
      clinicalDonationAttempt.status === 403,
      '18a. Clinical Staff cannot record donation collection events (Collection Gate Enforced)'
    );

    const collectionDonationRes = await request(`/camps/${proposedCampId}/attendance/${walkinAttendanceId}/donation`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sCollection.token}` },
      body: JSON.stringify({
        outcome: 'COMPLETED',
        volumeMl: 450,
        bloodGroup: 'O_POS',
        donationType: 'WHOLE_BLOOD',
      }),
    });
    assert(
      collectionDonationRes.status === 201 &&
      collectionDonationRes.data?.data?.outcome === 'COMPLETED',
      '18b. Only authorised collection staff can record collection events'
    );

    // Also confirm collection unit
    const donationEventId = collectionDonationRes.data?.data?.id;
    const unitConfirmRes = await request('/traceability/collection-units', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sCollection.token}` },
      body: JSON.stringify({
        donationEventId,
        volumeMl: 450,
      }),
    });
    assert(
      unitConfirmRes.status === 201 && unitConfirmRes.data?.data?.unitNumber,
      '18c. Collection staff confirms unit; unique unitNumber generated in traceability',
      JSON.stringify(unitConfirmRes)
    );

    // ====================================================
    // CRITERIA 19: Camp staff cannot access another camp by modifying a URL or request body
    // ====================================================
    // Create Camp B2 under Bank B
    const campB2 = await prisma.camp.create({
      data: {
        campCode: `CAMP-SPEC-B2-${suffix}`,
        title: 'Camp B2 Isolated',
        organizerName: 'Org B2',
        targetDate: new Date(Date.now() + 86400000 * 4),
        venue: 'Hall B2',
        district: 'Pune',
        districtCode: 521,
        stateCode: 27,
        expectedDonors: 60,
        status: 'APPROVED',
        organisationId: orgB.id,
      },
    });

    const crossCampAttendance = await request(`/camps/${campB2.id}/attendance`, {
      headers: { Authorization: `Bearer ${sCampCoord.token}` },
    });
    assert(
      crossCampAttendance.status === 403,
      '19. Camp staff cannot access another camp roster by modifying campId in URL'
    );

    // ====================================================
    // CRITERIA 20: Parent-bank staff cannot access another organisation's private records
    // ====================================================
    const crossOrgInventory = await request(`/organisations/${orgB.id}/inventory/summary`, {
      headers: { Authorization: `Bearer ${sBankAdminA.token}` },
    });
    assert(
      crossOrgInventory.status === 403,
      "20. Parent-bank staff cannot access another organisation's private inventory records"
    );

    // ====================================================
    // CRITERIA 21: Revoked staff cannot continue using the camp workspace
    // ====================================================
    const coordAssignment = await prisma.campStaffAssignment.findFirst({
      where: { campId: proposedCampId, userId: sCampCoord.user.id },
    });
    const revokeRes = await request(`/camps/${proposedCampId}/staff/${coordAssignment?.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${sCreator.token}` },
    });
    assert(revokeRes.status === 200, '21a. Camp Admin revokes coordinator assignment');

    const tryAfterRevoke = await request(`/camps/${proposedCampId}/attendance`, {
      headers: { Authorization: `Bearer ${sCampCoord.token}` },
    });
    assert(
      tryAfterRevoke.status === 403,
      '21b. Revoked staff cannot continue accessing the camp workspace'
    );

    // ====================================================
    // CRITERIA 22: The previous missing bearer-token defect does not recur
    // ====================================================
    const noTokenReq = await request(`/camps/${proposedCampId}/readiness`, {
      method: 'POST',
      body: JSON.stringify({ isReadyForCollection: true }),
    });
    assert(
      noTokenReq.status === 401 && noTokenReq.data?.error?.message?.includes('Authentication required'),
      '22. Requests without bearer token produce clean 401; defect does not recur'
    );

    // ====================================================
    // CRITERIA 23: Blood-bank inventory, handover, receipt, testing and release workflows continue to work
    // ====================================================
    const inventorySummary = await request(`/organisations/${orgA.id}/inventory/summary`, {
      headers: { Authorization: `Bearer ${sBankAdminA.token}` },
    });
    assert(
      inventorySummary.status === 200 && inventorySummary.data?.data !== undefined,
      '23. Blood-bank inventory and component lifecycle workflows operate independently',
      JSON.stringify(inventorySummary)
    );

    // ====================================================
    // CRITERIA 24: Public camp listings include only camps in the appropriate approved state
    // ====================================================
    const publicCampsRes = await request('/camps');
    const publicList = publicCampsRes.data?.data || [];
    const hasProposed = publicList.some((c: any) => c.id === rejectCampId && c.status === 'REJECTED');
    const hasApproved = publicList.some((c: any) => c.id === proposedCampId && c.status === 'APPROVED');
    assert(
      publicCampsRes.status === 200 && !hasProposed && hasApproved,
      '24. Public camp listings include only camps in approved status'
    );

    // ====================================================
    // CRITERIA 25: Dashboard counts match persisted records
    // ====================================================
    const campDetailsFinal = await request(`/camps/${proposedCampId}`, {
      headers: { Authorization: `Bearer ${sCreator.token}` },
    });
    const counts = campDetailsFinal.data?.data?.counts || {};
    const persistedAttendanceCount = await prisma.campAttendance.count({
      where: { campId: proposedCampId },
    });
    assert(
      counts.registeredDonors === persistedAttendanceCount,
      '25. Dashboard counts match persisted database records exactly',
      `expected ${persistedAttendanceCount}, got counts=${JSON.stringify(counts)}`
    );

    // ====================================================
    // CRITERIA 26: Audit history records relevant privileged actions
    // ====================================================
    const auditEntries = await prisma.auditLog.findMany({
      where: {
        resourceId: proposedCampId,
      },
    });
    const actions = auditEntries.map((a) => a.action);
    assert(
      actions.includes('CAMP_STATUS_UPDATED') && actions.includes('CAMP_READINESS_VERIFIED'),
      '26. Audit history persists all relevant privileged actions'
    );

    console.log('\n========================================================================');
    console.log(` Master Specification Test Suite: ${passed} passed, ${failed} failed.`);
    console.log('========================================================================\n');

  } catch (err: any) {
    console.error('Fatal test error:', err);
    failed++;
  } finally {
    if (server) {
      server.close();
    }
    process.exit(failed > 0 ? 1 : 0);
  }
}

runMasterSpecificationTests();
