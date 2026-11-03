import { app } from './app';
import { prisma } from './lib/prisma';
import http from 'http';

let server: http.Server;
const PORT = 4099;
const BASE_URL = `http://127.0.0.1:${PORT}/api/v1`;

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runCoordinationLifecycleTests() {
  console.log('========================================================================');
  console.log(' RaktaSetu — Patient-to-Donor Coordination & Verified Donation Tests');
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

  // Test phone numbers (E.164 normalized with +91)
  const patientPhone = '+919999966601';
  const donor1Phone = '+919999966602'; // Will be invited and accept
  const donor2Phone = '+919999966603'; // Will be uninvited
  const donor3Phone = '+919999966604'; // Will decline
  const strangerPhone = '+919999966605'; // Unrelated user

  let patientToken = '';
  let donor1Token = '';
  let donor2Token = '';
  let donor3Token = '';
  let strangerToken = '';

  let patientUserId = '';
  let donor1Id = '';
  let donor2Id = '';
  let donor3Id = '';

  let bloodRequestId = '';

  try {
    // ----------------------------------------------------
    // Section A: Authentication and Profile Management
    // ----------------------------------------------------
    console.log('\n--- Section A: Authentication and User Profiles ---');

    // Clean/reset test donor records for repeatable test execution
    await prisma.donorProfile.updateMany({
      where: { user: { phoneNumber: { in: [donor1Phone, donor2Phone, donor3Phone] } } },
      data: {
        fullName: 'Vikram Joshi',
        verifiedLastDonationDate: null,
        lastDonationDate: null,
        isAvailable: true,
        isSearchable: true,
        consentWithdrawnAt: null,
      },
    }).catch(() => {});

    // 1. Authenticate patient
    const patientLogin = await request('/auth/demo-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: patientPhone, otp: '123456' }),
    });
    assert(patientLogin.status === 200 && Boolean(patientLogin.data?.data?.token), '1. Demo login succeeds with OTP 123456');
    patientToken = patientLogin.data.data.token;
    patientUserId = patientLogin.data.data.user.id;

    // Sign in again with same phone - verify no duplicate account created
    const patientLogin2 = await request('/auth/demo-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: patientPhone, otp: '123456' }),
    });
    assert(patientLogin2.data?.data?.user?.id === patientUserId, '2. Repeated sign in preserves account identity without duplicate records');

    // Authenticate Donor 1, Donor 2, Donor 3, and Stranger
    const [d1Login, d2Login, d3Login, strangerLogin] = await Promise.all([
      request('/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: donor1Phone, otp: '123456' }),
      }),
      request('/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: donor2Phone, otp: '123456' }),
      }),
      request('/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: donor3Phone, otp: '123456' }),
      }),
      request('/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: strangerPhone, otp: '123456' }),
      }),
    ]);

    donor1Token = d1Login.data.data.token;
    donor2Token = d2Login.data.data.token;
    donor3Token = d3Login.data.data.token;
    strangerToken = strangerLogin.data.data.token;

    // Register Donor Profiles (O_POS, Pune District 521, Centre 18061)
    const [d1Reg, d2Reg, d3Reg] = await Promise.all([
      request('/donors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${donor1Token}` },
        body: JSON.stringify({
          fullName: 'Vikram Joshi',
          dateOfBirth: '1995-05-15',
          bloodGroup: 'O_POS',
          stateCode: 27,
          districtCode: 521,
          primaryHospitalCode: '18061',
          isAvailable: true,
          consentToSearch: true,
        }),
      }),
      request('/donors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${donor2Token}` },
        body: JSON.stringify({
          fullName: 'Ananya Deshmukh',
          dateOfBirth: '1998-08-20',
          bloodGroup: 'O_POS',
          stateCode: 27,
          districtCode: 521,
          primaryHospitalCode: '18061',
          isAvailable: true,
          consentToSearch: true,
        }),
      }),
      request('/donors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${donor3Token}` },
        body: JSON.stringify({
          fullName: 'Rohan Patil',
          dateOfBirth: '1992-03-10',
          bloodGroup: 'O_POS',
          stateCode: 27,
          districtCode: 521,
          primaryHospitalCode: '18061',
          isAvailable: true,
          consentToSearch: true,
        }),
      }),
    ]);

    // Handle existing profile or newly created profile
    const getD1 = await request('/profile/me', { headers: { Authorization: `Bearer ${donor1Token}` } });
    const getD2 = await request('/profile/me', { headers: { Authorization: `Bearer ${donor2Token}` } });
    const getD3 = await request('/profile/me', { headers: { Authorization: `Bearer ${donor3Token}` } });

    donor1Id = getD1.data?.data?.donorProfile?.id;
    donor2Id = getD2.data?.data?.donorProfile?.id;
    donor3Id = getD3.data?.data?.donorProfile?.id;

    assert(Boolean(donor1Id && donor2Id && donor3Id), '3. Voluntary donor profiles registered with blood group and preferred centre');

    // 4. Test GET /profile/me
    assert(
      getD1.status === 200 &&
        Boolean(getD1.data?.data?.donorProfile?.fullName?.includes('Vikram')) &&
        getD1.data?.data?.user?.phoneNumber === donor1Phone,
      '4. GET /api/v1/profile/me returns authenticated user, donor profile, and verified contact number'
    );

    // 5. Test PUT /profile/me edits and persistence
    const updateProfile = await request('/profile/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${donor1Token}` },
      body: JSON.stringify({
        fullName: 'Vikram A. Joshi',
        cityOrLocality: 'Kothrud, Pune',
        districtCode: 521,
        isAvailable: true,
        isSearchable: true,
      }),
    });
    assert(
      updateProfile.status === 200 &&
        updateProfile.data?.data?.donorProfile?.fullName === 'Vikram A. Joshi' &&
        updateProfile.data?.data?.donorProfile?.cityOrLocality === 'Kothrud, Pune',
      '5. PUT /api/v1/profile/me updates display name and city/locality successfully'
    );

    // Verify persistence after refresh
    const refreshedProfile = await request('/profile/me', { headers: { Authorization: `Bearer ${donor1Token}` } });
    assert(
      refreshedProfile.data?.data?.donorProfile?.cityOrLocality === 'Kothrud, Pune',
      '6. Profile updates persist after subsequent fetch'
    );

    // 7. Security: Reject unverified direct contact number modification
    const tamperPhone = await request('/profile/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${donor1Token}` },
      body: JSON.stringify({ phoneNumber: '9876543210' }),
    });
    assert(
      tamperPhone.status === 400 && tamperPhone.data?.error?.code === 'UNVERIFIED_PHONE_CHANGE_DISALLOWED',
      '7. Direct unverified phone modification attempt rejected with UNVERIFIED_PHONE_CHANGE_DISALLOWED'
    );

    // 8. Security: Reject unauthorized profile access
    const unauthProfile = await request('/profile/me');
    assert(unauthProfile.status === 401, '8. Unauthorized profile request rejected with 401');

    // ----------------------------------------------------
    // Section B: Patient Request and Selective Invitations
    // ----------------------------------------------------
    console.log('\n--- Section B: Patient Request Creation & Selective Invitations ---');

    // 9. Patient creates request with patientName distinct from requester
    const createReq = await request('/blood-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${patientToken}` },
      body: JSON.stringify({
        patientName: 'Sunita Kulkarni',
        bloodGroup: 'O+',
        component: 'Packed Red Blood Cells',
        unitsRequested: 2,
        hospitalCode: '18061',
        searchScope: 'EXACT_CENTRE',
        message: 'Scheduled surgery requirement at Acharya Anandrishiji Hospital',
      }),
    });
    assert(
      createReq.status === 201 &&
        createReq.data?.data?.patientName === 'Sunita Kulkarni' &&
        createReq.data?.data?.status === 'OPEN',
      '9. Patient creates blood request successfully capturing distinct patientName and status OPEN'
    );
    bloodRequestId = createReq.data.data.id;

    // 10. Patient views matching voluntary donors
    const matchRes = await request(`/blood-requests/${bloodRequestId}/matching-donors`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    assert(
      matchRes.status === 200 && Array.isArray(matchRes.data?.data?.donors) && matchRes.data.data.donors.length >= 3,
      '10. Matching donors retrieved using real existing voluntary donor pool'
    );

    // 11. Contact Privacy: Phone numbers strictly absent from pre-acceptance donor list
    const d1InMatch = matchRes.data.data.donors.find((d: any) => d.donorId === donor1Id);
    assert(
      d1InMatch &&
        d1InMatch.contactNumber === null &&
        d1InMatch.displayName.includes('Vikram') &&
        d1InMatch.locality === 'Kothrud, Pune',
      '11. Pre-acceptance donor list strictly withholds private phone numbers and displays sanitized display names'
    );

    // 12. Selective invitation: Patient invites Donor 1 and Donor 3 (leaves Donor 2 unselected)
    const sendInvites = await request(`/blood-requests/${bloodRequestId}/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${patientToken}` },
      body: JSON.stringify({ donorIds: [donor1Id, donor3Id] }),
    });
    assert(
      sendInvites.status === 200 && sendInvites.data?.data?.invitedCount === 2,
      '12. Patient selects specific donors and sends individual invitations successfully'
    );

    // 13. Duplicate invitation prevention
    const sendDuplicates = await request(`/blood-requests/${bloodRequestId}/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${patientToken}` },
      body: JSON.stringify({ donorIds: [donor1Id] }),
    });
    assert(
      sendDuplicates.status === 200 && sendDuplicates.data?.data?.skippedCount === 1,
      '13. Duplicate active invitations for the same donor and request are prevented'
    );

    // 14. Unauthorized user cannot send invitations for another patient's request
    const unauthorizedInvite = await request(`/blood-requests/${bloodRequestId}/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${strangerToken}` },
      body: JSON.stringify({ donorIds: [donor2Id] }),
    });
    assert(
      unauthorizedInvite.status === 403,
      '14. Unauthorized user rejected when attempting to send invitations for another user\'s request'
    );

    // ----------------------------------------------------
    // Section C: Donor Dashboard, Independent Responses & Contact Privacy
    // ----------------------------------------------------
    console.log('\n--- Section C: Donor Dashboard Responses & Contact Privacy ---');

    // 15. Invited Donor 1 views direct incoming invitation
    const d1Requests = await request('/donors/me/eligible-requests', {
      headers: { Authorization: `Bearer ${donor1Token}` },
    });
    const d1Invite = d1Requests.data?.data?.requests?.find((r: any) => r.id === bloodRequestId);
    assert(
      Boolean(d1Invite && d1Invite.myResponse?.status === 'PENDING' && d1Invite.patientName === 'Sunita Kulkarni'),
      '15. Invited donor receives incoming invitation with authorized request details and PENDING status'
    );

    // 16. Unselected Donor 2 does NOT receive an invitation for this request
    const d2Requests = await request('/donors/me/eligible-requests', {
      headers: { Authorization: `Bearer ${donor2Token}` },
    });
    const d2Invite = d2Requests.data?.data?.requests?.find((r: any) => r.id === bloodRequestId);
    assert(
      !d2Invite,
      '16. Unselected donor (Donor 2) did not receive uninvited broadcast'
    );

    // 17. Pre-acceptance contact privacy: Donor cannot see requester phone before acceptance
    assert(
      d1Invite.requesterPhone === null,
      '17. Pre-acceptance: Requester contact number is protected from invited donor'
    );

    // 18. Donor 1 ACCEPTS the invitation
    const d1Accept = await request('/donors/me/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${donor1Token}` },
      body: JSON.stringify({ requestId: bloodRequestId, action: 'ACCEPT' }),
    });
    assert(
      d1Accept.status === 200 && d1Accept.data?.data?.status === 'ACCEPTED',
      '18. Donor 1 accepts invitation independently'
    );

    // 19. Donor 3 DECLINES their invitation
    const d3Decline = await request('/donors/me/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${donor3Token}` },
      body: JSON.stringify({ requestId: bloodRequestId, action: 'DECLINE' }),
    });
    assert(
      d3Decline.status === 200 && d3Decline.data?.data?.status === 'DECLINED',
      '19. Donor 3 declines invitation independently'
    );

    // 20. Independence: Donor 1's acceptance did not alter Donor 3's declined response
    const d1Refreshed = await request('/donors/me/eligible-requests', {
      headers: { Authorization: `Bearer ${donor1Token}` },
    });
    const d3Refreshed = await request('/donors/me/eligible-requests', {
      headers: { Authorization: `Bearer ${donor3Token}` },
    });
    const d1Status = d1Refreshed.data?.data?.requests?.find((r: any) => r.id === bloodRequestId)?.myResponse?.status;
    const d3Status = d3Refreshed.data?.data?.requests?.find((r: any) => r.id === bloodRequestId)?.myResponse?.status;
    assert(
      d1Status === 'ACCEPTED' && d3Status === 'DECLINED',
      '20. Independent donor responses preserved: Donor 1 is ACCEPTED while Donor 3 remains DECLINED'
    );

    // 21. Post-acceptance contact privacy unlocked for authorized pair
    const d1PostAcceptInvite = d1Refreshed.data?.data?.requests?.find((r: any) => r.id === bloodRequestId);
    assert(
      d1PostAcceptInvite?.requesterPhone === patientPhone,
      '21. Post-acceptance: Accepted donor can view authorized requester contact number'
    );

    // 22. Patient can now view accepted donor's authorized contact number
    const patientResponses = await request(`/blood-requests/${bloodRequestId}/responses`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    const acceptedResp = patientResponses.data?.data?.find((r: any) => r.donorId === donor1Id);
    const declinedResp = patientResponses.data?.data?.find((r: any) => r.donorId === donor3Id);
    assert(
      acceptedResp?.status === 'ACCEPTED' &&
        acceptedResp?.contactNumber === donor1Phone &&
        declinedResp?.status === 'DECLINED' &&
        declinedResp?.contactNumber === null,
      '22. Patient receives authorized donor contact number ONLY for accepted donor; declined donor contact withheld'
    );

    // 23. Stranger cannot access responses by guessing request ID
    const strangerAccess = await request(`/blood-requests/${bloodRequestId}/responses`, {
      headers: { Authorization: `Bearer ${strangerToken}` },
    });
    assert(strangerAccess.status === 403, '23. Unrelated user forbidden from viewing request coordination responses');

    // ----------------------------------------------------
    // Section D: Closure Outcomes & Reported vs Verified Donation Lifecycle
    // ----------------------------------------------------
    console.log('\n--- Section D: Structured Closure & Reported vs Verified Donation ---');

    // 24. Patient closes request with outcome DONATION_COMPLETED reporting Donor 1
    const closeReq = await request(`/blood-requests/${bloodRequestId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${patientToken}` },
      body: JSON.stringify({
        outcome: 'DONATION_COMPLETED',
        reportedDonorId: donor1Id,
        feedback: 'Donor Vikram attended Acharya Anandrishiji Blood Centre and completed donation.',
      }),
    });
    assert(
      closeReq.status === 200 &&
        closeReq.data?.data?.status === 'CLOSED' &&
        closeReq.data?.data?.closureOutcome === 'DONATION_COMPLETED' &&
        closeReq.data?.data?.reportedDonationStatus === 'REPORTED_UNVERIFIED',
      '24. Patient closes request with DONATION_COMPLETED recording REPORTED_UNVERIFIED status'
    );

    // 25. Data Integrity: Patient report does NOT update donor verifiedLastDonationDate
    const donor1AfterReport = await prisma.donorProfile.findUnique({
      where: { id: donor1Id },
      select: { verifiedLastDonationDate: true, lastDonationDate: true },
    });
    assert(
      donor1AfterReport?.verifiedLastDonationDate === null,
      '25. CRITICAL: Patient-reported donation did NOT set donor verifiedLastDonationDate (unverified)'
    );

    // 26. Cascade: Closed request cannot be responded to by donors
    const lateResponse = await request('/donors/me/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${donor3Token}` },
      body: JSON.stringify({ requestId: bloodRequestId, action: 'ACCEPT' }),
    });
    assert(
      lateResponse.status === 400,
      '26. Donors cannot respond to a closed or cancelled request'
    );

    // 27. Authorized personnel clinically verifies the reported donation
    const verifyDonation = await request(`/blood-requests/${bloodRequestId}/verify-donation`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${patientToken}` },
    });
    assert(
      verifyDonation.status === 200 &&
        verifyDonation.data?.data?.reportedDonationStatus === 'DONATION_VERIFIED' &&
        Boolean(verifyDonation.data?.data?.donationVerifiedAt),
      '27. Authorized clinical process verifies donation, transitioning status to DONATION_VERIFIED'
    );

    // 28. Verified donation updates donor profile verifiedLastDonationDate
    const donor1AfterVerify = await prisma.donorProfile.findUnique({
      where: { id: donor1Id },
      select: { verifiedLastDonationDate: true },
    });
    assert(
      donor1AfterVerify?.verifiedLastDonationDate !== null,
      '28. Verified donation updates donor verifiedLastDonationDate in database'
    );

    // 29. Future Matching Deferral: Verified donor is now deferred for 90 days and excluded from new matching pools
    const newRequest = await request('/blood-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${patientToken}` },
      body: JSON.stringify({
        bloodGroup: 'O+',
        component: 'Packed Red Blood Cells',
        unitsRequested: 1,
        hospitalCode: '18061',
        searchScope: 'EXACT_CENTRE',
      }),
    });
    const newReqId = newRequest.data?.data?.id;

    const newMatch = await request(`/blood-requests/${newReqId}/matching-donors`, {
      headers: { Authorization: `Bearer ${patientToken}` },
    });

    const isDonor1PresentInNewPool = newMatch.data?.data?.donors?.some((d: any) => d.donorId === donor1Id);
    assert(
      !isDonor1PresentInNewPool,
      '29. Clinical 90-day deferral enforced: Verified donor is excluded from subsequent matching pools'
    );

    // Clean up test request
    if (newReqId) {
      await request(`/blood-requests/${newReqId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${patientToken}` },
      });
    }

  } catch (err: any) {
    console.error('Unexpected test error:', err);
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
  } else {
    process.exit(0);
  }
}

runCoordinationLifecycleTests();
