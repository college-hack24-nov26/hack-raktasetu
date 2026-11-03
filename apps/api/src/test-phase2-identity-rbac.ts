import { app } from './app';
import { prisma } from './lib/prisma';
import http from 'http';

let server: http.Server;
const PORT = 4097;
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

async function runPhase2IdentityAndRBACTests() {
  console.log('========================================================================');
  console.log(' RaktaSetu — Phase 2: Identity, Organisation Onboarding & RBAC Tests');
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

  // Phone numbers for test actors
  const adminPhone = '+919999977001';
  const applicantPhone = '+919999977002';
  const secondAdminPhone = '+919999977003';
  const inventoryPhone = '+919999977004';
  const auditorPhone = '+919999977005';
  const orgBAdminPhone = '+919999977006';
  const strangerPhone = '+919999977007';

  let adminToken = '';
  let applicantToken = '';
  let secondAdminToken = '';
  let inventoryToken = '';
  let auditorToken = '';
  let orgBAdminToken = '';
  let strangerToken = '';

  let adminUserId = '';
  let applicantUserId = '';
  let secondAdminUserId = '';
  let inventoryUserId = '';
  let auditorUserId = '';
  let strangerUserId = '';

  let applicationIdA = '';
  let organisationIdA = '';
  let organisationIdB = '';
  let secondAdminMembershipId = '';
  let campId = '';

  try {
    // ----------------------------------------------------
    // Setup: Login Test Actors & Prepare User Identities
    // ----------------------------------------------------
    console.log('--- Setup: Establishing Verified User Identities ---');

    // Helper to log in or create session
    async function loginUser(phone: string, name: string, role: 'USER' | 'ADMIN' = 'USER') {
      const loginRes = await request('/auth/demo-login', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: phone, otp: '123456' }),
      });
      assert(loginRes.status === 200, `Demo login for ${name}`);

      const user = loginRes.data.data.user;
      const token = loginRes.data.data.token;

      // Update role/name if needed
      await prisma.user.update({
        where: { id: user.id },
        data: { role, name },
      });

      return { user, token };
    }

    const admin = await loginUser(adminPhone, 'Platform Admin', 'ADMIN');
    adminToken = admin.token;
    adminUserId = admin.user.id;

    const applicant = await loginUser(applicantPhone, 'Dr. Applicant Sharma');
    applicantToken = applicant.token;
    applicantUserId = applicant.user.id;

    const secondAdmin = await loginUser(secondAdminPhone, 'Dr. Co-Admin Patil');
    secondAdminToken = secondAdmin.token;
    secondAdminUserId = secondAdmin.user.id;

    const inventory = await loginUser(inventoryPhone, 'Inventory Officer Deshmukh');
    inventoryToken = inventory.token;
    inventoryUserId = inventory.user.id;

    const auditor = await loginUser(auditorPhone, 'Compliance Auditor Kulkarni');
    auditorToken = auditor.token;
    auditorUserId = auditor.user.id;

    const orgBAdmin = await loginUser(orgBAdminPhone, 'Dr. Org B Director');
    orgBAdminToken = orgBAdmin.token;

    const stranger = await loginUser(strangerPhone, 'Unrelated Stranger');
    strangerToken = stranger.token;
    strangerUserId = stranger.user.id;

    // ----------------------------------------------------
    // Section 1: Organisation Application Lifecycle & Integrity
    // ----------------------------------------------------
    console.log('\n--- Section 1: Application Lifecycle & Conflict-of-Interest Checks ---');

    // 1. Unauthenticated request to submit application succeeds (queued for review)
    const licenseA = `CDSCO-MH-PUN-${Date.now()}`;
    const submitRes = await request('/organisations/applications', {
      method: 'POST',
      headers: { Authorization: `Bearer ${applicantToken}` },
      body: JSON.stringify({
        hospitalName: 'Pune Metropolis Blood Centre',
        licenseNumber: licenseA,
        stateCode: 27,
        districtCode: 521,
        districtName: 'Pune',
        contactPerson: 'Dr. Applicant Sharma',
        email: 'applicant@pune-blood.org',
        phone: applicantPhone,
        componentTypes: ['Packed Red Blood Cells', 'Platelets'],
      }),
    });
    assert(submitRes.status === 201, '1. Application submitted successfully by applicant');
    applicationIdA = submitRes.data.data.id;
    assert(submitRes.data.data.status === 'SUBMITTED', '1b. Application initial status is SUBMITTED');

    // 2. Unauthenticated request cannot view application details
    const unauthView = await request(`/organisations/applications/${applicationIdA}`);
    assert(unauthView.status === 401, '2. Unauthenticated request to view application rejected with HTTP 401');

    // 3. Unrelated user cannot view another applicant's application
    const strangerView = await request(`/organisations/applications/${applicationIdA}`, {
      headers: { Authorization: `Bearer ${strangerToken}` },
    });
    assert(strangerView.status === 403, '3. Unauthorized user viewing another application rejected with HTTP 403');

    // 4. Applicant CAN view their own application
    const applicantView = await request(`/organisations/applications/${applicationIdA}`, {
      headers: { Authorization: `Bearer ${applicantToken}` },
    });
    assert(applicantView.status === 200, '4. Applicant successfully views their own application');

    // 5. Conflict of interest: Applicant CANNOT review or approve their own application
    const selfApprove = await request(`/organisations/applications/${applicationIdA}/review`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${applicantToken}` },
      body: JSON.stringify({ status: 'APPROVED' }),
    });
    assert(
      selfApprove.status === 403,
      '5. Applicant self-approval rejected with HTTP 403 (Conflict of Interest)',
      selfApprove.data?.error?.message
    );

    // 6. Ordinary non-admin user cannot review applications
    const nonAdminReview = await request(`/organisations/applications/${applicationIdA}/review`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${strangerToken}` },
      body: JSON.stringify({ status: 'APPROVED' }),
    });
    assert(nonAdminReview.status === 403, '6. Non-platform-admin review attempt rejected with HTTP 403');

    // 7. Invalid review status rejected
    const invalidStatusReview = await request(`/organisations/applications/${applicationIdA}/review`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'UNSUPPORTED_STATUS' }),
    });
    assert(invalidStatusReview.status === 400, '7. Review with unsupported status rejected with HTTP 400');

    // 8. Authorized Platform Administrator approves application
    const approveRes = await request(`/organisations/applications/${applicationIdA}/review`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        status: 'APPROVED',
        reviewNotes: 'CDSCO license and inspection verified with State Council.',
      }),
    });
    assert(approveRes.status === 200, '8. Platform Admin approves application successfully');
    organisationIdA = approveRes.data.data.organisation.id;
    assert(approveRes.data.data.organisation.status === 'VERIFIED', '8b. Organisation provisioned with status VERIFIED');
    assert(approveRes.data.data.application.status === 'APPROVED', '8c. Application status transitioned to APPROVED');

    // 9. Initial ORG_ADMIN membership atomically provisioned for applicant
    const membershipsRes = await request('/organisations/me/memberships', {
      headers: { Authorization: `Bearer ${applicantToken}` },
    });
    assert(
      membershipsRes.status === 200 &&
        membershipsRes.data.data.some((m: any) => m.organisationId === organisationIdA && m.role === 'ORG_ADMIN'),
      '9. Applicant atomically receives ORG_ADMIN membership on approval'
    );

    // 10. Repeated approval on already approved application rejected
    const doubleApprove = await request(`/organisations/applications/${applicationIdA}/review`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'APPROVED' }),
    });
    assert(doubleApprove.status === 400, '10. Repeated approval on already approved application rejected');

    // 11. Duplicate active application with same license number rejected
    const duplicateApp = await request('/organisations/applications', {
      method: 'POST',
      body: JSON.stringify({
        hospitalName: 'Another Centre',
        licenseNumber: licenseA,
        districtCode: 521,
        contactPerson: 'Dr. Test',
        email: 'test@blood.org',
        phone: '+919876543219',
      }),
    });
    assert(duplicateApp.status === 400, '11. Duplicate application with already registered license rejected');

    // ----------------------------------------------------
    // Section 2: Organisation Isolation & Anti-Tampering
    // ----------------------------------------------------
    console.log('\n--- Section 2: Cross-Organisation Isolation & Boundary Checks ---');

    // Setup Organisation B for orgBAdmin
    const licenseB = `CDSCO-MH-MUM-${Date.now()}`;
    const submitB = await request('/organisations/applications', {
      method: 'POST',
      headers: { Authorization: `Bearer ${orgBAdminToken}` },
      body: JSON.stringify({
        hospitalName: 'Mumbai Central Blood Bank',
        licenseNumber: licenseB,
        districtCode: 519,
        contactPerson: 'Dr. Org B Director',
        email: 'mumbai@blood.org',
        phone: orgBAdminPhone,
      }),
    });
    const appBId = submitB.data.data.id;
    const approveB = await request(`/organisations/applications/${appBId}/review`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status: 'APPROVED' }),
    });
    organisationIdB = approveB.data.data.organisation.id;

    // 12. Org A member attempts to view Org B profile -> REJECTED with 403
    const crossOrgView = await request(`/organisations/${organisationIdB}`, {
      headers: { Authorization: `Bearer ${applicantToken}` },
    });
    assert(crossOrgView.status === 403, '12. Cross-organisation profile access rejected with HTTP 403 (Boundary Enforced)');

    // 13. Org A member attempts to view Org B staff -> REJECTED with 403
    const crossOrgStaff = await request(`/organisations/${organisationIdB}/staff`, {
      headers: { Authorization: `Bearer ${applicantToken}` },
    });
    assert(crossOrgStaff.status === 403, '13. Cross-organisation staff list access rejected with HTTP 403');

    // 14. Stranger user with no memberships attempts to access Org A -> REJECTED with 403
    const strangerOrgA = await request(`/organisations/${organisationIdA}`, {
      headers: { Authorization: `Bearer ${strangerToken}` },
    });
    assert(strangerOrgA.status === 403, '14. Unaffiliated user access to private organisation rejected with HTTP 403');

    // ----------------------------------------------------
    // Section 3: Staff Management & RBAC Permissions
    // ----------------------------------------------------
    console.log('\n--- Section 3: Staff Management & Explicit Role Permissions ---');

    // 15. ORG_ADMIN assigns a second ORG_ADMIN
    const assignAdminRes = await request(`/organisations/${organisationIdA}/staff`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${applicantToken}` },
      body: JSON.stringify({
        phoneOrUserId: secondAdminPhone,
        role: 'ORG_ADMIN',
      }),
    });
    assert(assignAdminRes.status === 201, '15. ORG_ADMIN assigns second ORG_ADMIN successfully');
    secondAdminMembershipId = assignAdminRes.data.data.id;

    // 16. ORG_ADMIN assigns INVENTORY_STAFF
    const assignInvRes = await request(`/organisations/${organisationIdA}/staff`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${applicantToken}` },
      body: JSON.stringify({
        phoneOrUserId: inventoryPhone,
        role: 'INVENTORY_STAFF',
      }),
    });
    assert(assignInvRes.status === 201, '16. ORG_ADMIN assigns INVENTORY_STAFF successfully');

    // 17. ORG_ADMIN assigns AUDITOR
    const assignAuditorRes = await request(`/organisations/${organisationIdA}/staff`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${applicantToken}` },
      body: JSON.stringify({
        phoneOrUserId: auditorPhone,
        role: 'AUDITOR',
      }),
    });
    assert(assignAuditorRes.status === 201, '17. ORG_ADMIN assigns AUDITOR successfully');

    // 18. Sanitized staff listing: Private phone numbers are strictly withheld
    const staffListRes = await request(`/organisations/${organisationIdA}/staff`, {
      headers: { Authorization: `Bearer ${applicantToken}` },
    });
    assert(
      staffListRes.status === 200 &&
        staffListRes.data.data.length >= 4 &&
        staffListRes.data.data.every((s: any) => !s.phoneNumber && !s.phone),
      '18. Staff list strictly withholds private phone numbers and sensitive fields'
    );

    // 19. Non-admin staff (INVENTORY_STAFF) attempting to assign staff is rejected with 403
    const unauthorizedAssign = await request(`/organisations/${organisationIdA}/staff`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${inventoryToken}` },
      body: JSON.stringify({
        phoneOrUserId: strangerPhone,
        role: 'CLINICAL_STAFF',
      }),
    });
    assert(unauthorizedAssign.status === 403, '19. Non-admin (INVENTORY_STAFF) assigning staff rejected with HTTP 403');

    // 20. Read-only Auditor cannot assign staff or perform modifications
    const auditorAssign = await request(`/organisations/${organisationIdA}/staff`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auditorToken}` },
      body: JSON.stringify({
        phoneOrUserId: strangerPhone,
        role: 'CLINICAL_STAFF',
      }),
    });
    assert(auditorAssign.status === 403, '20. Auditor write attempt rejected with HTTP 403 (Read-only Enforced)');

    // 21. Self-promotion prevention: INVENTORY_STAFF cannot elevate themselves to ORG_ADMIN
    const inventoryMembership = staffListRes.data.data.find((s: any) => s.userId === inventoryUserId);
    const selfPromote = await request(
      `/organisations/${organisationIdA}/staff/${inventoryMembership.membershipId}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${inventoryToken}` },
        body: JSON.stringify({ role: 'ORG_ADMIN' }),
      }
    );
    assert(selfPromote.status === 403, '21. Unauthorized self-promotion to ORG_ADMIN rejected with HTTP 403');

    // 22. Effective permissions endpoint reflects correct granted capabilities for AUDITOR
    const auditorPerms = await request(`/organisations/${organisationIdA}/permissions`, {
      headers: { Authorization: `Bearer ${auditorToken}` },
    });
    assert(
      auditorPerms.status === 200 &&
        auditorPerms.data.data.role === 'AUDITOR' &&
        !auditorPerms.data.data.permissions.includes('operational:write'),
      '22. Auditor role possesses audit:read and operational:read but lacks operational:write'
    );

    // ----------------------------------------------------
    // Section 4: Last Active Admin Protection
    // ----------------------------------------------------
    console.log('\n--- Section 4: Last Active Administrator Safety Guard ---');

    // 23. Deactivating one of two admins succeeds
    const removeSecondAdmin = await request(
      `/organisations/${organisationIdA}/staff/${secondAdminMembershipId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${applicantToken}` },
      }
    );
    assert(removeSecondAdmin.status === 200, '23. Removing second admin succeeds when another admin remains');

    // 24. Attempting to deactivate or demote the LAST remaining ORG_ADMIN is rejected
    const applicantMembership = staffListRes.data.data.find((s: any) => s.userId === applicantUserId);
    const removeLastAdmin = await request(
      `/organisations/${organisationIdA}/staff/${applicantMembership.membershipId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${applicantToken}` },
      }
    );
    assert(
      removeLastAdmin.status === 400 &&
        removeLastAdmin.data?.error?.message?.includes('last active organisation administrator'),
      '24. CRITICAL: Attempt to remove last active ORG_ADMIN rejected by safety guard',
      removeLastAdmin.data?.error?.message
    );

    // ----------------------------------------------------
    // Section 5: Camp Authorisation Boundary
    // ----------------------------------------------------
    console.log('\n--- Section 5: Camp Authorisation Boundary ---');

    // 25. Proposing a camp associates it with organisation and sets status PROPOSED
    const campRes = await request('/camps', {
      method: 'POST',
      headers: { Authorization: `Bearer ${applicantToken}` },
      body: JSON.stringify({
        title: 'Pune Midtown Blood Drive',
        organizerName: 'Rotary Club of Pune Midtown',
        targetDate: '2026-11-20',
        venue: 'Rotary Hall, Pune',
        districtCode: 521,
        organisationId: organisationIdA,
      }),
    });
    assert(campRes.status === 201, '25. Voluntary camp proposed successfully');
    campId = campRes.data.data.id;
    assert(campRes.data.data.status === 'PROPOSED', '25b. Proposed camp is NOT represented as approved');

    // 26. Stranger/unauthorized user cannot approve camp
    const strangerApproveCamp = await request(`/camps/${campId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${strangerToken}` },
      body: JSON.stringify({ status: 'APPROVED' }),
    });
    assert(strangerApproveCamp.status === 403, '26. Unauthorized caller approving camp rejected with HTTP 403');

    // 27. ORG_ADMIN of parent organisation approves camp
    const adminApproveCamp = await request(`/camps/${campId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${applicantToken}` },
      body: JSON.stringify({ status: 'APPROVED', reason: 'Mobile medical team clearance confirmed' }),
    });
    assert(
      adminApproveCamp.status === 200 && adminApproveCamp.data.data.status === 'APPROVED',
      '27. Parent ORG_ADMIN approves camp successfully'
    );

    // ----------------------------------------------------
    // Section 6: Audit Logging Integrity
    // ----------------------------------------------------
    console.log('\n--- Section 6: Audit Trail Integrity Verification ---');

    // 28. Verify audit log captures sensitive actions
    const auditCount = await prisma.auditLog.count({
      where: {
        action: {
          in: [
            'ORGANISATION_APPLICATION_SUBMITTED',
            'ORGANISATION_APPLICATION_APPROVED',
            'STAFF_MEMBERSHIP_ASSIGNED',
            'CAMP_PROPOSED',
            'CAMP_STATUS_UPDATED',
          ],
        },
      },
    });
    assert(auditCount >= 5, `28. Audit logs recorded for sensitive lifecycle events (found ${auditCount} records)`);

    // 29. Verify no secret tokens or passwords in audit metadata
    const sensitiveLogs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { action: { contains: 'TOKEN' } },
          { action: { contains: 'PASSWORD' } },
          { action: { contains: 'OTP' } },
        ],
      },
    });
    assert(sensitiveLogs.length === 0, '29. Strictly zero password, OTP, or session token leaks in audit log');

    // ----------------------------------------------------
    // Summary
    // ----------------------------------------------------
    console.log('\n========================================================================');
    console.log(` Summary: ${passed} passed, ${failed} failed out of ${passed + failed} assertions.`);
    console.log('========================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    server.close();
  }
}

runPhase2IdentityAndRBACTests().catch((err) => {
  console.error('Fatal test error:', err);
  if (server) server.close();
  process.exit(1);
});
