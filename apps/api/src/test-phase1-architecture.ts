import { app } from './app';
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
  if (data && typeof data.error === 'object' && data.error !== null) {
    data.rawError = data.error;
    data.error = data.error.message || JSON.stringify(data.error);
  }
  return { status: res.status, ok: res.ok, data };
}

async function runPhase1ArchitectureTests() {
  console.log('========================================================================');
  console.log(' RaktaSetu — Phase 1 Architecture Foundation & Contract Tests');
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

  try {
    // ----------------------------------------------------
    // Section 1: Organisation Application Validation Contracts
    // ----------------------------------------------------
    console.log('--- Section 1: Onboarding Application Validation Invariants ---');

    // 1. Missing hospital name rejected with 400
    const res1 = await request('/organisations/applications', {
      method: 'POST',
      body: JSON.stringify({
        hospitalName: '',
        licenseNumber: 'MH-PUN-BB-2026-001',
        districtCode: 521,
        contactPerson: 'Dr. Coordinator',
        email: 'bloodbank@test.org',
        phone: '+919876543210',
      }),
    });
    assert(
      res1.status === 400 && res1.data?.error?.includes('Hospital or Centre name is required'),
      '1. Submission without hospital name rejected with HTTP 400',
      res1.data?.error
    );

    // 2. Missing license number rejected with 400
    const res2 = await request('/organisations/applications', {
      method: 'POST',
      body: JSON.stringify({
        hospitalName: 'Sassoon Transfusion Centre',
        licenseNumber: '   ',
        districtCode: 521,
        contactPerson: 'Dr. Coordinator',
        email: 'bloodbank@test.org',
        phone: '+919876543210',
      }),
    });
    assert(
      res2.status === 400 && res2.data?.error?.includes('license number is required'),
      '2. Submission without CDSCO/SBTC license rejected with HTTP 400',
      res2.data?.error
    );

    // 3. Missing contact person rejected with 400
    const res3 = await request('/organisations/applications', {
      method: 'POST',
      body: JSON.stringify({
        hospitalName: 'Sassoon Transfusion Centre',
        licenseNumber: 'MH-PUN-BB-2026-001',
        districtCode: 521,
        contactPerson: '',
        email: 'bloodbank@test.org',
        phone: '+919876543210',
      }),
    });
    assert(
      res3.status === 400 && res3.data?.error?.includes('Authorized contact person'),
      '3. Submission without authorized contact person rejected with HTTP 400',
      res3.data?.error
    );

    // 4. Missing district code rejected with 400
    const res4 = await request('/organisations/applications', {
      method: 'POST',
      body: JSON.stringify({
        hospitalName: 'Sassoon Transfusion Centre',
        licenseNumber: 'MH-PUN-BB-2026-001',
        contactPerson: 'Dr. Coordinator',
        email: 'bloodbank@test.org',
        phone: '+919876543210',
      }),
    });
    assert(
      res4.status === 400 && res4.data?.error?.includes('District code is required'),
      '4. Submission without district code rejected with HTTP 400',
      res4.data?.error
    );

    // ----------------------------------------------------
    // Section 2: Review Endpoint Invariants & State Machine
    // ----------------------------------------------------
    console.log('\n--- Section 2: Application Review State Machine Invariants ---');

    // 5. Invalid review status rejected
    const res5 = await request('/organisations/applications/fake-app-id/review', {
      method: 'POST',
      body: JSON.stringify({
        status: 'INVALID_STATUS',
        reviewedBy: 'admin-1',
      }),
    });
    assert(
      res5.status === 400 && res5.data?.error?.includes('Review status must be one of'),
      '5. Review with unrecognized status rejected with HTTP 400',
      res5.data?.error
    );

    // 6. Reviewing non-existent application returns error
    const res6 = await request('/organisations/applications/00000000-0000-0000-0000-000000000000/review', {
      method: 'POST',
      body: JSON.stringify({
        status: 'APPROVED',
        reviewedBy: 'admin-1',
      }),
    });
    assert(
      res6.status === 400 && (res6.data?.error?.includes('not found') || res6.data?.error?.includes('does not exist')),
      '6. Reviewing non-existent application returns clear error message',
      res6.data?.error
    );

    // ----------------------------------------------------
    // Section 3: Camp Proposal Validation Contracts
    // ----------------------------------------------------
    console.log('\n--- Section 3: Camp Proposal Validation Contracts ---');

    // 7. Missing camp title rejected with 400
    const res7 = await request('/camps', {
      method: 'POST',
      body: JSON.stringify({
        title: '',
        organizerName: 'Rotary Midtown',
        targetDate: '2026-11-15',
        venue: 'Town Hall',
        districtCode: 521,
      }),
    });
    assert(
      res7.status === 400 && res7.data?.error?.includes('Camp title or drive name is required'),
      '7. Camp proposal without title rejected with HTTP 400',
      res7.data?.error
    );

    // 8. Missing organizer name rejected with 400
    const res8 = await request('/camps', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Community Blood Drive',
        organizerName: '',
        targetDate: '2026-11-15',
        venue: 'Town Hall',
        districtCode: 521,
      }),
    });
    assert(
      res8.status === 400 && res8.data?.error?.includes('Organizer name'),
      '8. Camp proposal without organizer name rejected with HTTP 400',
      res8.data?.error
    );

    // 9. Invalid target date rejected with 400
    const res9 = await request('/camps', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Community Blood Drive',
        organizerName: 'Rotary Midtown',
        targetDate: 'not-a-valid-date',
        venue: 'Town Hall',
        districtCode: 521,
      }),
    });
    assert(
      res9.status === 400 && res9.data?.error?.includes('Invalid target camp date format'),
      '9. Camp proposal with malformed date rejected with HTTP 400',
      res9.data?.error
    );

    // 10. Missing venue rejected with 400
    const res10 = await request('/camps', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Community Blood Drive',
        organizerName: 'Rotary Midtown',
        targetDate: '2026-11-15',
        venue: '   ',
        districtCode: 521,
      }),
    });
    assert(
      res10.status === 400 && res10.data?.error?.includes('Venue location is required'),
      '10. Camp proposal without venue rejected with HTTP 400',
      res10.data?.error
    );

    // ----------------------------------------------------
    // Section 4: Public Directory vs Verified Organisation Query Separation
    // ----------------------------------------------------
    console.log('\n--- Section 4: Public Directory vs Verified Organisation Separation ---');

    // 11. GET /api/v1/blood-centres returns e-RaktKosh public directory cache
    const res11 = await request('/blood-centres?stateCode=27&districtCode=521');
    assert(
      res11.status === 200 && Array.isArray(res11.data?.data),
      '11. GET /api/v1/blood-centres continues serving public e-RaktKosh directory'
    );

    // 12. GET /api/v1/organisations/:id correctly identifies separation from public directory
    const res12 = await request('/organisations/00000000-0000-0000-0000-000000000000');
    assert(
      (res12.status === 404 && res12.data?.error?.includes('not found')) ||
      (res12.status === 500 && res12.data?.error?.includes('does not exist')),
      '12. GET /api/v1/organisations/:id correctly separates verified orgs from public directory'
    );

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

runPhase1ArchitectureTests().catch((err) => {
  console.error('Fatal test error:', err);
  if (server) server.close();
  process.exit(1);
});
