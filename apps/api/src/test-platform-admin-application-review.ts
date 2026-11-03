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

async function runPlatformAdminApplicationReviewTests() {
  console.log('========================================================================');
  console.log(' RaktaSetu — Scenario 3: Platform Admin Application Review Regression Tests');
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

  // Test actor phone numbers (using unique prefix to avoid collision)
  const platformAdminPhone = '9999980001'; // seeded global admin
  const ordinaryUserPhone = '9999979001';
  const newApplicantPhone = '9999979002';

  let adminToken = '';
  let ordinaryToken = '';
  let applicantToken = '';

  let applicantUserId = '';

  try {
    // 1. Authenticate platform admin (seeded 9999980001)
    console.log('--- Step 1: Authenticate Actors ---');
    const adminVerify = await request('/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: platformAdminPhone, otp: '123456' }),
    });
    assert(adminVerify.ok && adminVerify.data?.data?.token, 'Platform admin authenticates via OTP');
    adminToken = adminVerify.data?.data?.token;
    const adminUser = adminVerify.data?.data?.user;
    assert(adminUser?.role === 'ADMIN', 'Platform admin has global role ADMIN in session');

    // Verify platform admin has NO active organisation memberships
    const adminMembershipsRes = await request('/organisations/me/memberships', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(
      adminMembershipsRes.ok && Array.isArray(adminMembershipsRes.data?.data),
      'Platform admin can query /organisations/me/memberships'
    );
    console.log(`   Platform admin active memberships count: ${adminMembershipsRes.data?.data?.length}`);

    // Authenticate ordinary user (no role, no memberships)
    const ordinaryVerify = await request('/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: ordinaryUserPhone, otp: '123456' }),
    });
    ordinaryToken = ordinaryVerify.data?.data?.token;
    assert(ordinaryToken !== '', 'Ordinary user authenticates via OTP');

    // Authenticate new applicant
    const applicantVerify = await request('/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: newApplicantPhone, otp: '123456' }),
    });
    applicantToken = applicantVerify.data?.data?.token;
    applicantUserId = applicantVerify.data?.data?.user?.id;
    assert(applicantToken !== '', 'Applicant authenticates via OTP');

    // 2. Test Condition 1: Platform admin with no active organisation membership can access application review
    console.log('\n--- Step 2: Platform Admin Application List Access ---');
    const adminListRes = await request('/organisations/applications', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(
      adminListRes.status === 200 && adminListRes.data?.success === true,
      'Platform admin with no active organisation membership can access GET /organisations/applications',
      JSON.stringify(adminListRes.data)
    );
    assert(
      Array.isArray(adminListRes.data?.data) && adminListRes.data?.data.length > 0,
      `Platform admin discovers existing applications (Found: ${adminListRes.data?.data?.length})`
    );

    // 3. Test Condition 3: Ordinary user with no membership cannot access admin review list
    console.log('\n--- Step 3: Authorization Boundary - Ordinary User Access Denied ---');
    const ordinaryListRes = await request('/organisations/applications', {
      headers: { Authorization: `Bearer ${ordinaryToken}` },
    });
    assert(
      ordinaryListRes.status === 403,
      'Ordinary user cannot access GET /organisations/applications (HTTP 403 Forbidden)',
      `Status was ${ordinaryListRes.status}`
    );

    const unauthListRes = await request('/organisations/applications');
    assert(
      unauthListRes.status === 401,
      'Unauthenticated request to GET /organisations/applications is rejected (HTTP 401)',
      `Status was ${unauthListRes.status}`
    );

    // 4. Test Condition 4: Pending applicant cannot access blood-bank portal before approval
    console.log('\n--- Step 4: Applicant Submits Application & Tenant Boundary Checked ---');
    const uniqueLicense = `TEST-LIC-${Date.now()}`;
    const submitAppRes = await request('/organisations/applications', {
      method: 'POST',
      headers: { Authorization: `Bearer ${applicantToken}` },
      body: JSON.stringify({
        hospitalName: 'Scenario 3 Test Blood Centre',
        licenseNumber: uniqueLicense,
        stateCode: 27,
        districtCode: 478,
        districtName: 'Pune',
        contactPerson: 'Dr. Test Reviewer',
        email: 'test-reviewer@raktasetu.org',
        phone: newApplicantPhone,
        componentTypes: ['PRBC', 'Whole Blood', 'Platelets'],
      }),
    });
    assert(
      submitAppRes.ok && submitAppRes.data?.data?.id,
      'Applicant successfully submits institutional onboarding application'
    );
    const testAppId = submitAppRes.data?.data?.id;

    // Verify applicant has NO active organisation memberships prior to approval
    const preApprovalMemberships = await request('/organisations/me/memberships', {
      headers: { Authorization: `Bearer ${applicantToken}` },
    });
    assert(
      preApprovalMemberships.ok && preApprovalMemberships.data?.data?.length === 0,
      'Pending applicant has NO active organisation memberships before approval'
    );

    // 5. Test Condition 6: Unauthorised users cannot approve or provision an application
    console.log('\n--- Step 5: Unauthorized Review & Conflict of Interest Prevention ---');
    // Ordinary user tries to approve
    const ordinaryApproveRes = await request(`/organisations/applications/${testAppId}/review`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ordinaryToken}` },
      body: JSON.stringify({ status: 'APPROVED' }),
    });
    assert(
      ordinaryApproveRes.status === 403,
      'Ordinary user cannot approve or provision application (HTTP 403 Forbidden)'
    );

    // Applicant tries to approve their own application (conflict of interest)
    const selfApproveRes = await request(`/organisations/applications/${testAppId}/review`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${applicantToken}` },
      body: JSON.stringify({ status: 'APPROVED' }),
    });
    assert(
      selfApproveRes.status === 403,
      'Applicant cannot approve their own application (Conflict of interest blocked)'
    );

    // 6. Test Condition 2 & 5: Platform admin discovers pending application and performs review & provision
    console.log('\n--- Step 6: Platform Admin Discovers & Approves Application ---');
    // Discover the submitted application in the list
    const updatedListRes = await request('/organisations/applications?status=SUBMITTED', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const foundApp = updatedListRes.data?.data?.find((a: any) => a.id === testAppId);
    assert(
      Boolean(foundApp),
      `Platform admin discovers newly submitted pending application "${testAppId}" in review queue`
    );

    // Platform admin approves and provisions the application
    const uniqueOrgCode = `ORG-TEST-${Math.floor(1000 + Math.random() * 9000)}`;
    const approveRes = await request(`/organisations/applications/${testAppId}/review`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        status: 'APPROVED',
        reviewNotes: 'Verified compliant with CDSCO biological manufacturing standards by Platform Administrator.',
        orgCode: uniqueOrgCode,
      }),
    });
    assert(
      approveRes.ok && approveRes.data?.success === true,
      'Platform admin successfully approves and provisions application',
      JSON.stringify(approveRes.data)
    );
    assert(
      approveRes.data?.data?.organisation?.orgCode === uniqueOrgCode,
      `Provisioned organisation assigned org code ${uniqueOrgCode}`
    );

    // 7. Verify applicant receives intended membership and appropriate access after approval
    console.log('\n--- Step 7: Verify Post-Approval Applicant Membership & Access ---');
    const postApprovalMemberships = await request('/organisations/me/memberships', {
      headers: { Authorization: `Bearer ${applicantToken}` },
    });
    assert(
      postApprovalMemberships.ok && postApprovalMemberships.data?.data?.length === 1,
      'Approved applicant now has exactly 1 active organisation membership'
    );
    const membership = postApprovalMemberships.data?.data?.[0];
    assert(
      membership?.role === 'ORG_ADMIN',
      'Applicant received intended ORG_ADMIN role for the provisioned blood bank'
    );
    assert(
      membership?.orgCode === uniqueOrgCode,
      `Membership is bound to provisioned organisation ${uniqueOrgCode}`
    );

  } catch (err: any) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    // Clean up created test application and organisation
    try {
      const createdApp = await prisma.organisationApplication.findFirst({
        where: { hospitalName: 'Scenario 3 Test Blood Centre' },
        include: { resultingOrg: true },
      });
      if (createdApp) {
        if (createdApp.resultingOrgId) {
          await prisma.organisationMembership.deleteMany({
            where: { organisationId: createdApp.resultingOrgId },
          });
          await prisma.auditLog.deleteMany({
            where: { resourceId: createdApp.resultingOrgId },
          });
          await prisma.organisation.delete({
            where: { id: createdApp.resultingOrgId },
          });
        }
        await prisma.auditLog.deleteMany({
          where: { resourceId: createdApp.id },
        });
        await prisma.organisationApplication.delete({
          where: { id: createdApp.id },
        });
      }
      await prisma.user.deleteMany({
        where: { phoneNumber: { in: ['9999979001', '9999979002'] } },
      });
    } catch (cleanupErr) {
      console.warn('Test cleanup warning:', cleanupErr);
    }

    server.close();
  }

  console.log('\n========================================================================');
  console.log(` Test Results: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPlatformAdminApplicationReviewTests();
