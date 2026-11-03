import { app } from './app';
import { prisma } from './lib/prisma';
import http from 'http';

let server: http.Server;
const PORT = 4099;
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

async function runCampLoginAndDashboardRegressionTests() {
  console.log('========================================================================');
  console.log(' RaktaSetu — Camp Login, Camp Dashboard & Multi-Tenant Access Test Suite');
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

  // Phone numbers for isolated test actors
  const adminAPhone = '+919988110001';
  const adminBPhone = '+919988110002';
  const coordAPhone = '+919988110003';
  const clinicalAPhone = '+919988110004';
  const collectAPhone = '+919988110005';
  const unassignedPhone = '+919988110006';
  const donorPhone = '+9199' + Math.floor(10000000 + Math.random() * 90000000);

  let adminAToken = '';
  let adminBToken = '';
  let coordAToken = '';
  let clinicalAToken = '';
  let collectAToken = '';
  let unassignedToken = '';
  let donorToken = '';

  let adminAUser: any;
  let adminBUser: any;
  let coordAUser: any;
  let clinicalAUser: any;
  let collectAUser: any;
  let unassignedUser: any;

  let orgA: any;
  let orgB: any;
  let campA1: any;
  let campB1: any;

  let assignmentCoordAId = '';
  let attendanceDonorId = '';

  try {
    // ----------------------------------------------------
    // SETUP: Multi-Organisation & Multi-User Fixtures
    // ----------------------------------------------------
    console.log('--- Setup: Establishing Test Organizations, Users & Initial Camps ---');

    async function loginOrCreate(phone: string, name: string) {
      const res = await request('/auth/demo-login', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: phone, otp: '123456' }),
      });
      return { token: res.data?.data?.token, user: res.data?.data?.user };
    }

    const sAdminA = await loginOrCreate(adminAPhone, 'Admin Bank A');
    adminAToken = sAdminA.token;
    adminAUser = sAdminA.user;

    const sAdminB = await loginOrCreate(adminBPhone, 'Admin Bank B');
    adminBToken = sAdminB.token;
    adminBUser = sAdminB.user;

    const sCoordA = await loginOrCreate(coordAPhone, 'Coordinator A');
    coordAToken = sCoordA.token;
    coordAUser = sCoordA.user;

    const sClinicalA = await loginOrCreate(clinicalAPhone, 'Clinical Staff A');
    clinicalAToken = sClinicalA.token;
    clinicalAUser = sClinicalA.user;

    const sCollectA = await loginOrCreate(collectAPhone, 'Collection Staff A');
    collectAToken = sCollectA.token;
    collectAUser = sCollectA.user;

    const sUnassigned = await loginOrCreate(unassignedPhone, 'Unassigned User');
    unassignedToken = sUnassigned.token;
    unassignedUser = sUnassigned.user;

    const sDonor = await loginOrCreate(donorPhone, 'Voluntary Donor');
    donorToken = sDonor.token;

    // Create Organisation A (Bank A)
    orgA = await prisma.organisation.upsert({
      where: { orgCode: 'ORG-TEST-BNK-A' },
      update: { status: 'VERIFIED' },
      create: {
        orgCode: 'ORG-TEST-BNK-A',
        name: 'Apex Central Blood Centre',
        type: 'BLOOD_BANK',
        licenseNumber: 'LIC-TEST-BNK-A',
        stateCode: 27,
        districtCode: 521,
        districtName: 'Pune',
        address: '101 Shivajinagar, Pune',
        email: 'apex@raktasetu-test.org',
        phone: adminAPhone,
        status: 'VERIFIED',
      },
    });

    // Create Organisation B (Bank B)
    orgB = await prisma.organisation.upsert({
      where: { orgCode: 'ORG-TEST-BNK-B' },
      update: { status: 'VERIFIED' },
      create: {
        orgCode: 'ORG-TEST-BNK-B',
        name: 'Sahyadri Voluntary Blood Bank',
        type: 'BLOOD_BANK',
        licenseNumber: 'LIC-TEST-BNK-B',
        stateCode: 27,
        districtCode: 521,
        districtName: 'Pune',
        address: '202 Deccan Gymkhana, Pune',
        email: 'sahyadri@raktasetu-test.org',
        phone: adminBPhone,
        status: 'VERIFIED',
      },
    });

    // Assign ORG_ADMIN memberships
    await prisma.organisationMembership.upsert({
      where: { userId_organisationId: { userId: adminAUser.id, organisationId: orgA.id } },
      update: { role: 'ORG_ADMIN', isActive: true },
      create: { userId: adminAUser.id, organisationId: orgA.id, role: 'ORG_ADMIN', isActive: true },
    });

    await prisma.organisationMembership.upsert({
      where: { userId_organisationId: { userId: adminBUser.id, organisationId: orgB.id } },
      update: { role: 'ORG_ADMIN', isActive: true },
      create: { userId: adminBUser.id, organisationId: orgB.id, role: 'ORG_ADMIN', isActive: true },
    });

    // Create Approved Camp under Bank A
    campA1 = await prisma.camp.upsert({
      where: { campCode: 'CAMP-TEST-A1' },
      update: { status: 'APPROVED', organisationId: orgA.id },
      create: {
        campCode: 'CAMP-TEST-A1',
        title: 'Rotary Club Camp A1 Pune',
        organizerName: 'Rotary Club of Pune Central',
        targetDate: new Date(Date.now() + 86400000 * 2),
        venue: 'Rotary Bhavan, Shivajinagar',
        district: 'Pune',
        districtCode: 521,
        stateCode: 27,
        expectedDonors: 75,
        status: 'APPROVED',
        organisationId: orgA.id,
      },
    });

    // Create Approved Camp under Bank B
    campB1 = await prisma.camp.upsert({
      where: { campCode: 'CAMP-TEST-B1' },
      update: { status: 'APPROVED', organisationId: orgB.id },
      create: {
        campCode: 'CAMP-TEST-B1',
        title: 'Lions Club Camp B1 Deccan',
        organizerName: 'Lions Club Pune Deccan',
        targetDate: new Date(Date.now() + 86400000 * 3),
        venue: 'Deccan Gymkhana Hall, Pune',
        district: 'Pune',
        districtCode: 521,
        stateCode: 27,
        expectedDonors: 100,
        status: 'APPROVED',
        organisationId: orgB.id,
      },
    });

    console.log('Setup completed successfully.\n');

    // ----------------------------------------------------
    // Section 1: Staff Assignment & Authorization Bounds
    // ----------------------------------------------------
    console.log('--- Section 1: Camp Staff Assignment & Role Allocation ---');

    // Test 1: Bank A Admin assigns Coordinator A to Camp A1
    const assignRes1 = await request(`/camps/${campA1.id}/staff`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminAToken}` },
      body: JSON.stringify({
        userIdOrPhone: coordAPhone,
        role: 'CAMP_COORDINATOR',
        notes: 'Assigned as Lead Coordinator for Camp A1',
      }),
    });
    assert(assignRes1.status === 201 && assignRes1.data?.data?.role === 'CAMP_COORDINATOR',
      '1. Parent-bank administrator assigns CAMP_COORDINATOR successfully'
    );
    assignmentCoordAId = assignRes1.data?.data?.id;

    // Test 2: Bank A Admin assigns Clinical Staff and Collection Staff to Camp A1
    const assignClinical = await request(`/camps/${campA1.id}/staff`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminAToken}` },
      body: JSON.stringify({ userIdOrPhone: clinicalAPhone, role: 'CLINICAL_STAFF' }),
    });
    assert(assignClinical.status === 201 && assignClinical.data?.data?.role === 'CLINICAL_STAFF',
      '2. Parent-bank administrator assigns CLINICAL_STAFF successfully'
    );

    const assignCollect = await request(`/camps/${campA1.id}/staff`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminAToken}` },
      body: JSON.stringify({ userIdOrPhone: collectAPhone, role: 'COLLECTION_STAFF' }),
    });
    assert(assignCollect.status === 201 && assignCollect.data?.data?.role === 'COLLECTION_STAFF',
      '3. Parent-bank administrator assigns COLLECTION_STAFF successfully'
    );

    // Test 3: Cross-organisation staff assignment blocked
    // Bank B Admin attempts to assign staff to Bank A's Camp A1
    const crossAssign = await request(`/camps/${campA1.id}/staff`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminBToken}` },
      body: JSON.stringify({ userIdOrPhone: adminBPhone, role: 'CAMP_COORDINATOR' }),
    });
    assert(crossAssign.status === 403,
      '4. Cross-organisation staff assignment strictly rejected (Bank B Admin cannot assign to Bank A Camp)'
    );

    // Test 4: List camp staff
    const listStaff = await request(`/camps/${campA1.id}/staff`, {
      headers: { Authorization: `Bearer ${adminAToken}` },
    });
    assert(listStaff.status === 200 && listStaff.data?.data?.length === 3,
      '5. Parent-bank administrator retrieves active camp staff list (3 assigned)'
    );

    // ----------------------------------------------------
    // Section 2: Camp Login & Assignment Resolution
    // ----------------------------------------------------
    console.log('\n--- Section 2: Camp Login & Scope Resolution ---');

    // Test 5: Assigned Coordinator resolves their assigned camp workspace
    const myAssignmentsRes = await request('/camps/me/assignments', {
      headers: { Authorization: `Bearer ${coordAToken}` },
    });
    assert(
      myAssignmentsRes.status === 200 &&
      myAssignmentsRes.data?.data?.some((c: any) => c.campId === campA1.id && c.role === 'CAMP_COORDINATOR'),
      '6. Camp login resolves assigned camp workspace with role CAMP_COORDINATOR'
    );

    // Test 6: Unassigned user retrieves empty camp assignments array
    const unassignedRes = await request('/camps/me/assignments', {
      headers: { Authorization: `Bearer ${unassignedToken}` },
    });
    assert(unassignedRes.status === 200 && unassignedRes.data?.data?.length === 0,
      '7. Unassigned user retrieves 0 camp assignments (graceful no-camp handling)'
    );

    // Test 7: Coordinator cannot access Bank B's Camp B1
    const crossCampView = await request(`/camps/${campB1.id}`, {
      headers: { Authorization: `Bearer ${coordAToken}` },
    });
    // Public details of approved camp are visible, but roster is strictly gated
    const crossRoster = await request(`/camps/${campB1.id}/attendance`, {
      headers: { Authorization: `Bearer ${coordAToken}` },
    });
    assert(crossRoster.status === 403,
      '8. Coordinator A rejected when attempting to access Bank B Camp B1 roster (Cross-Camp Isolation)'
    );

    // ----------------------------------------------------
    // Section 3: Operational Readiness Boundary
    // ----------------------------------------------------
    console.log('\n--- Section 3: Operational Readiness Verification & Checklist Invariant ---');

    // Test 8: Missing checklist items rejected
    const badReadiness = await request(`/camps/${campA1.id}/readiness`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${coordAToken}` },
      body: JSON.stringify({
        isReadyForCollection: true,
        readinessChecklist: {
          staffAssigned: true,
          coldChainVerified: true,
          emergencyKitAvailable: false, // Incomplete!
          consumablesStocked: true,
          spaceSanitized: true,
        },
      }),
    });
    assert(badReadiness.status === 400 && badReadiness.data?.error?.message?.includes('checklist items must be verified'),
      '9. Readiness verification rejects incomplete checklist (Server-side validation enforced)'
    );

    // Test 9: Complete checklist verified and persisted by Coordinator A
    const goodReadiness = await request(`/camps/${campA1.id}/readiness`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${coordAToken}` },
      body: JSON.stringify({
        isReadyForCollection: true,
        readinessChecklist: {
          staffAssigned: true,
          coldChainVerified: true,
          emergencyKitAvailable: true,
          consumablesStocked: true,
          spaceSanitized: true,
        },
        readinessNotes: 'All clinical and phlebotomy teams physically verified on-site.',
      }),
    });
    assert(goodReadiness.status === 200 && goodReadiness.data?.data?.isReadyForCollection === true,
      '10. Coordinator A verifies complete operational readiness; collection authorized'
    );

    // ----------------------------------------------------
    // Section 4: Shared Authentication & Attendance Operations
    // ----------------------------------------------------
    console.log('\n--- Section 4: Shared Authentication & Attendance Registration ---');

    // Test 10: Missing authentication token returns 401 Authentication required
    const unauthReq = await request(`/camps/${campA1.id}/attendance`, {
      method: 'POST',
      body: JSON.stringify({ phoneOrUserId: donorPhone }),
    });
    assert(unauthReq.status === 401 && unauthReq.data?.error?.message?.includes('Authentication required'),
      '11. Missing authorization header produces distinct 401: "Authentication required. Please sign in."'
    );

    // Test 11: Valid walk-in registration with auth header succeeds (Fix for regression)
    const walkinReq = await request(`/camps/${campA1.id}/attendance`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${coordAToken}` },
      body: JSON.stringify({
        phoneOrUserId: donorPhone,
        donorName: 'Ajay Kulkarni',
        bloodGroup: 'O_POS',
      }),
    });
    assert(walkinReq.status === 201 && walkinReq.data?.data?.status === 'REGISTERED',
      '12. Valid walk-in registration succeeds with auth header (Shared authentication fix verified)'
    );
    attendanceDonorId = walkinReq.data?.data?.id;

    // Test 12: Duplicate attendance on same camp rejected
    const dupReq = await request(`/camps/${campA1.id}/attendance`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${coordAToken}` },
      body: JSON.stringify({ phoneOrUserId: donorPhone }),
    });
    assert((dupReq.status === 409 || dupReq.status === 400) && dupReq.data?.error?.message?.includes('already registered'),
      '13. Duplicate donor attendance registration on same camp strictly rejected'
    );

    // Test 13: Invalid blood group value rejected
    const badBgReq = await request(`/camps/${campA1.id}/attendance`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${coordAToken}` },
      body: JSON.stringify({
        phoneOrUserId: '+919988119999',
        bloodGroup: 'INVALID_GROUP',
      }),
    });
    assert(badBgReq.status === 400 && badBgReq.data?.error?.message?.includes('Invalid blood group'),
      '14. Invalid blood group value rejected'
    );

    // Test 14: Check in attendee
    const checkInReq = await request(`/camps/${campA1.id}/attendance/${attendanceDonorId}/check-in`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${coordAToken}` },
    });
    assert(checkInReq.status === 200 && checkInReq.data?.data?.status === 'CHECKED_IN',
      '15. Donor attendance checked in on arrival (status: CHECKED_IN)'
    );

    // ----------------------------------------------------
    // Section 5: Clinical Screening & Donation Role Gates
    // ----------------------------------------------------
    console.log('\n--- Section 5: Role-Scoped Clinical Screening & Donation Outcomes ---');

    // Test 15: Coordinator CANNOT perform clinical screening (Clinical Role Gate)
    const coordScreen = await request(`/camps/${campA1.id}/attendance/${attendanceDonorId}/screening`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${coordAToken}` },
      body: JSON.stringify({
        consentGiven: true,
        eligibilityDecision: 'CLEARED',
      }),
    });
    assert(coordScreen.status === 403,
      '16. Camp Coordinator cannot perform clinical screening (Clinical Staff Gate Enforced)'
    );

    // Test 16: Clinical Staff A CAN perform clinical screening
    const clinicalScreen = await request(`/camps/${campA1.id}/attendance/${attendanceDonorId}/screening`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clinicalAToken}` },
      body: JSON.stringify({
        consentGiven: true,
        eligibilityDecision: 'CLEARED',
        clinicalNotes: 'Hemoglobin 13.8 g/dL, BP 120/80 mmHg, fit for donation.',
      }),
    });
    assert(clinicalScreen.status === 201 && clinicalScreen.data?.data?.eligibilityDecision === 'CLEARED',
      '17. Clinical Staff records informed consent and CLEARED clinical screening decision'
    );

    // Test 17: Coordinator CANNOT record donation events
    const coordDonate = await request(`/camps/${campA1.id}/attendance/${attendanceDonorId}/donation`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${coordAToken}` },
      body: JSON.stringify({
        bloodGroup: 'O_POS',
        outcome: 'COMPLETED',
      }),
    });
    assert(coordDonate.status === 403,
      '18. Camp Coordinator cannot record donation events (Collection Staff Gate Enforced)'
    );

    // Test 18: Collection Staff A records completed donation event
    const collectDonate = await request(`/camps/${campA1.id}/attendance/${attendanceDonorId}/donation`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${collectAToken}` },
      body: JSON.stringify({
        bloodGroup: 'O_POS',
        outcome: 'COMPLETED',
        volumeMl: 450,
      }),
    });
    assert(collectDonate.status === 201 && collectDonate.data?.data?.outcome === 'COMPLETED',
      '19. Collection Staff records COMPLETED donation event outcome (450ml)'
    );
    const donationEventId = collectDonate.data?.data?.id;

    // Test 19: Collection Staff confirms collection unit into traceability
    const confirmUnit = await request('/traceability/collection-units', {
      method: 'POST',
      headers: { Authorization: `Bearer ${collectAToken}` },
      body: JSON.stringify({
        donationEventId,
        volumeMl: 450,
        notes: 'Standard CPDA-1 triple-bag confirmed',
      }),
    });
    assert(confirmUnit.status === 201 && confirmUnit.data?.data?.unitNumber?.startsWith('CU-'),
      '20. Collection Staff confirms collection unit; unique unitNumber created in traceability'
    );

    // Test 20: Duplicate unit confirmation prevented
    const dupUnit = await request('/traceability/collection-units', {
      method: 'POST',
      headers: { Authorization: `Bearer ${collectAToken}` },
      body: JSON.stringify({ donationEventId }),
    });
    assert((dupUnit.status === 409 || dupUnit.status === 400) && dupUnit.data?.error?.message?.includes('already been confirmed'),
      '21. Duplicate collection unit confirmation strictly prohibited'
    );

    // ----------------------------------------------------
    // Section 6: Staff Revocation & Access Termination
    // ----------------------------------------------------
    console.log('\n--- Section 6: Staff Revocation & Access Enforcement ---');

    // Test 21: Bank A Admin revokes Coordinator A assignment
    const revokeRes = await request(`/camps/${campA1.id}/staff/${assignmentCoordAId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminAToken}` },
      body: JSON.stringify({ reason: 'Drive shift concluded' }),
    });
    assert(revokeRes.status === 200 && revokeRes.data?.data?.isActive === false,
      '22. Parent-bank administrator revokes camp staff assignment successfully'
    );

    // Test 22: Revoked coordinator can no longer view roster
    const revokedRoster = await request(`/camps/${campA1.id}/attendance`, {
      headers: { Authorization: `Bearer ${coordAToken}` },
    });
    assert(revokedRoster.status === 403,
      '23. Revoked coordinator is immediately blocked from accessing camp roster (Revocation Enforced)'
    );

    // ----------------------------------------------------
    // Section 7: Existing Regression Case Verification
    // ----------------------------------------------------
    console.log('\n--- Section 7: Regression Case Verification (Gupta Life Blood Centre & Lions Club Camp) ---');

    // Find regression camp CAMP-MH-521-7453
    const regressionCamp = await prisma.camp.findUnique({
      where: { campCode: 'CAMP-MH-521-7453' },
      include: { organisation: true },
    });

    if (regressionCamp) {
      // Find or assign admin to Gupta Life Blood Centre
      let guptaAdminUser = await prisma.user.findFirst({
        where: {
          memberships: {
            some: {
              organisationId: regressionCamp.organisationId!,
              role: 'ORG_ADMIN',
              isActive: true,
            },
          },
        },
      });

      if (!guptaAdminUser) {
        guptaAdminUser = await prisma.user.create({
          data: {
            phoneNumber: '+919988119955',
            name: 'Gupta Centre Admin',
            role: 'USER',
          },
        });
        await prisma.organisationMembership.create({
          data: {
            userId: guptaAdminUser.id,
            organisationId: regressionCamp.organisationId!,
            role: 'ORG_ADMIN',
            isActive: true,
          },
        });
      }

      const sGupta = await loginOrCreate(guptaAdminUser.phoneNumber, 'Gupta Admin');

      // Assign Coordinator to Lions Club Camp
      const regAssign = await request(`/camps/${regressionCamp.id}/staff`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sGupta.token}` },
        body: JSON.stringify({
          userIdOrPhone: '+919988117766',
          role: 'CAMP_COORDINATOR',
          notes: 'Lions Club Camp Coordinator',
        }),
      });

      assert(regAssign.status === 201,
        '24. Regression Camp: Coordinator assigned to CAMP-MH-521-7453 under Gupta Life Blood Centre'
      );

      const sRegCoord = await loginOrCreate('+919988117766', 'Lions Coordinator');

      // Test readiness with auth header
      const regReadiness = await request(`/camps/${regressionCamp.id}/readiness`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sRegCoord.token}` },
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
      assert(regReadiness.status === 200,
        '25. Regression Camp: Operational readiness verified with auth header without authentication error'
      );

      // Test walk-in attendance registration with auth header
      const regWalkin = await request(`/camps/${regressionCamp.id}/attendance`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sRegCoord.token}` },
        body: JSON.stringify({
          phoneOrUserId: '+9198' + Math.floor(10000000 + Math.random() * 90000000),
          donorName: 'Rohan Sharma',
          bloodGroup: 'B_POS',
        }),
      });
      assert(regWalkin.status === 201,
        '26. Regression Camp: Walk-in registration succeeds with auth header without authentication error'
      );
    } else {
      console.log('[SKIP] CAMP-MH-521-7453 not present in current test environment database.');
    }

    console.log('\n========================================================================');
    console.log(` Summary: ${passed} passed, ${failed} failed.`);
    console.log('========================================================================\n');

  } catch (error: any) {
    console.error('Unexpected test execution failure:', error);
    failed++;
  } finally {
    server?.close();
    await prisma.$disconnect();
    if (failed > 0) {
      process.exit(1);
    }
  }
}

runCampLoginAndDashboardRegressionTests();
