import http from 'http';
import WebSocket from 'ws';
import { app } from './app';
import { prisma } from './lib/prisma';
import { RealtimeService } from './services/realtime';
import { initDonorLocationSchema } from './lib/initDonorLocationSchema';

const PORT = 4075;
const BASE_URL = `http://127.0.0.1:${PORT}/api/v1`;

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
    body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  return { status: res.status, ok: res.ok, data };
}

async function runTestSuite() {
  console.log('========================================================================');
  console.log('  RaktaSetu — Phase 10 Donor Live-Location Verification Suite');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(
        `[FAIL] ${testName}${detail !== undefined ? ` -> ${typeof detail === 'object' ? JSON.stringify(detail) : detail}` : ''}`
      );
      failed++;
    }
  }

  await initDonorLocationSchema();

  const server = http.createServer(app);
  RealtimeService.init(server);

  await new Promise<void>((resolve) => {
    server.listen(PORT, () => resolve());
  });

  try {
    const rand = Math.floor(100000 + Math.random() * 900000);
    const donorPhoneA = `+9198000${rand.toString().slice(0, 5)}`;
    const donorPhoneB = `+9198100${rand.toString().slice(0, 5)}`;
    const adminPhone = `+9198200${rand.toString().slice(0, 5)}`;

    // Helper: Authenticate donor via demo OTP
    async function loginDonor(phone: string, name: string) {
      const res = await request('/donor/auth/verify-otp', {
        method: 'POST',
        body: { phoneNumber: phone, otp: '123456' },
      });
      const token = res.data?.data?.token;
      const user = res.data?.data?.user;
      if (user && name) {
        await prisma.user.update({
          where: { id: user.id },
          data: { name },
        });
      }
      return { token, user };
    }

    // Helper: Authenticate platform admin
    async function loginAdmin(phone: string, name: string) {
      const res = await request('/donor/auth/verify-otp', {
        method: 'POST',
        body: { phoneNumber: phone, otp: '123456' },
      });
      const token = res.data?.data?.token;
      const user = res.data?.data?.user;
      await prisma.user.update({
        where: { id: user.id },
        data: { role: 'ADMIN', name },
      });
      user.role = 'ADMIN';
      return { token, user };
    }

    const donorA = await loginDonor(donorPhoneA, 'Donor Location Tester A');
    const donorB = await loginDonor(donorPhoneB, 'Donor Location Tester B');
    const admin = await loginAdmin(adminPhone, 'Platform Admin Tester');

    // Attach donor profile to Donor A for metadata verification
    await prisma.donorProfile.upsert({
      where: { userId: donorA.user.id },
      create: {
        userId: donorA.user.id,
        fullName: 'Donor Location Tester A',
        bloodGroup: 'O_POS',
        stateCode: 27,
        districtCode: 521,
        cityOrLocality: 'Pune Camp',
      },
      update: {
        fullName: 'Donor Location Tester A',
        bloodGroup: 'O_POS',
        stateCode: 27,
        districtCode: 521,
      },
    });

    console.log('\n--- 1. Consent Enforcement Tests ---');

    // 1. Starting a session without consent is rejected
    const noConsentRes = await request('/donor/location/session/start', {
      method: 'POST',
      token: donorA.token,
      body: { consentGranted: false, consentVersion: '1.0' },
    });
    assert(
      noConsentRes.status === 400 && noConsentRes.data?.error?.code === 'CONSENT_REQUIRED',
      'Starting session without consent is rejected with 400 CONSENT_REQUIRED',
      noConsentRes.data
    );

    const missingVersionRes = await request('/donor/location/session/start', {
      method: 'POST',
      token: donorA.token,
      body: { consentGranted: true, consentVersion: '' },
    });
    assert(
      missingVersionRes.status === 400 && missingVersionRes.data?.error?.code === 'INVALID_CONSENT_VERSION',
      'Starting session without consentVersion is rejected with 400 INVALID_CONSENT_VERSION',
      missingVersionRes.data
    );

    console.log('\n--- 2. Consented Session Lifecycle Tests ---');

    // 2. An authenticated donor can start a consented session
    const startRes = await request('/donor/location/session/start', {
      method: 'POST',
      token: donorA.token,
      body: { consentGranted: true, consentVersion: '1.0' },
    });
    assert(
      startRes.status === 201 &&
        startRes.data?.data?.status === 'ACTIVE' &&
        startRes.data?.data?.consentGranted === true &&
        startRes.data?.data?.consentVersion === '1.0',
      'Authenticated donor can start consented session (status: ACTIVE)',
      startRes.data
    );
    const sessionAId = startRes.data?.data?.id;

    console.log('\n--- 3. Location Submission & Coordinate Validation Tests ---');

    // 4. Invalid coordinates and invalid timestamps are rejected
    const invalidLatRes = await request('/donor/location/update', {
      method: 'POST',
      token: donorA.token,
      body: {
        sessionId: sessionAId,
        latitude: 95.5,
        longitude: 73.8567,
        accuracy: 10,
        deviceTimestamp: new Date().toISOString(),
      },
    });
    assert(
      invalidLatRes.status === 400 && invalidLatRes.data?.error?.code === 'INVALID_COORDINATES',
      'Latitude > 90 is rejected with 400 INVALID_COORDINATES'
    );

    const invalidLngRes = await request('/donor/location/update', {
      method: 'POST',
      token: donorA.token,
      body: {
        sessionId: sessionAId,
        latitude: 18.5204,
        longitude: -195.0,
        accuracy: 10,
        deviceTimestamp: new Date().toISOString(),
      },
    });
    assert(
      invalidLngRes.status === 400 && invalidLngRes.data?.error?.code === 'INVALID_COORDINATES',
      'Longitude < -180 is rejected with 400 INVALID_COORDINATES'
    );

    const invalidAccRes = await request('/donor/location/update', {
      method: 'POST',
      token: donorA.token,
      body: {
        sessionId: sessionAId,
        latitude: 18.5204,
        longitude: 73.8567,
        accuracy: -5,
        deviceTimestamp: new Date().toISOString(),
      },
    });
    assert(
      invalidAccRes.status === 400 && invalidAccRes.data?.error?.code === 'INVALID_ACCURACY',
      'Negative accuracy is rejected with 400 INVALID_ACCURACY'
    );

    const futureTime = new Date(Date.now() + 120000).toISOString(); // 2 minutes in future
    const futureRes = await request('/donor/location/update', {
      method: 'POST',
      token: donorA.token,
      body: {
        sessionId: sessionAId,
        latitude: 18.5204,
        longitude: 73.8567,
        accuracy: 15,
        deviceTimestamp: futureTime,
      },
    });
    assert(
      futureRes.status === 400 && futureRes.data?.error?.code === 'FUTURE_TIMESTAMP',
      'Future timestamp (> 60s) is rejected with 400 FUTURE_TIMESTAMP'
    );

    // Valid location submission
    const validTime1 = new Date(Date.now() - 5000);
    const validUpdate1 = await request('/donor/location/update', {
      method: 'POST',
      token: donorA.token,
      body: {
        sessionId: sessionAId,
        latitude: 18.5204,
        longitude: 73.8567,
        accuracy: 12.5,
        heading: 180,
        speed: 1.2,
        batteryLevel: 0.85,
        deviceTimestamp: validTime1.toISOString(),
      },
    });
    assert(
      validUpdate1.status === 200 &&
        validUpdate1.data?.data?.latitude === 18.5204 &&
        validUpdate1.data?.data?.longitude === 73.8567,
      'Valid location update is accepted and stored',
      validUpdate1.data
    );

    console.log('\n--- 4. Cross-Donor Ownership & Session Isolation Tests ---');

    // 3. One donor cannot update another donor's location / session
    const crossUpdateRes = await request('/donor/location/update', {
      method: 'POST',
      token: donorB.token, // Donor B
      body: {
        sessionId: sessionAId, // Donor A's session ID
        latitude: 19.076,
        longitude: 72.8777,
        accuracy: 10,
        deviceTimestamp: new Date().toISOString(),
      },
    });
    assert(
      crossUpdateRes.status === 409 || crossUpdateRes.status === 400,
      'Donor B cannot submit updates using Donor A session (rejected with 409 NO_ACTIVE_SESSION or 400 SESSION_MISMATCH)',
      crossUpdateRes.data
    );

    // Verify in database that Donor A location was NOT modified by Donor B
    const donorALocInDb = await prisma.donorLatestLocation.findUnique({
      where: { donorUserId: donorA.user.id },
    });
    assert(
      donorALocInDb?.latitude === 18.5204 && donorALocInDb?.longitude === 73.8567,
      'Database verifies Donor A coordinates remain unmodified by unauthorized caller'
    );

    console.log('\n--- 5. Sequencing & Rate Limiting Tests ---');

    // 5. An older update cannot overwrite a newer location
    // Wait for rate limit window to pass (> 2000ms)
    await new Promise((r) => setTimeout(r, 2100));

    // Try submitting update older than validTime1
    const olderTime = new Date(validTime1.getTime() - 10000).toISOString();
    const olderUpdateRes = await request('/donor/location/update', {
      method: 'POST',
      token: donorA.token,
      body: {
        sessionId: sessionAId,
        latitude: 18.5000,
        longitude: 73.8000,
        accuracy: 10,
        deviceTimestamp: olderTime,
      },
    });
    assert(
      olderUpdateRes.status === 409 && olderUpdateRes.data?.error?.code === 'OUT_OF_ORDER_UPDATE',
      'Older update is rejected with 409 OUT_OF_ORDER_UPDATE and does not overwrite latest location'
    );

    console.log('\n--- 6. Session Termination & Update Rejection Tests ---');

    // 6. Stopped or revoked sessions reject new updates
    const stopRes = await request('/donor/location/session/stop', {
      method: 'POST',
      token: donorA.token,
      body: { reason: 'DONOR_STOPPED' },
    });
    assert(
      stopRes.status === 200 && stopRes.data?.data?.status === 'STOPPED',
      'Active session stopped successfully (status: STOPPED)',
      stopRes.data
    );

    // Attempting location update on stopped session
    await new Promise((r) => setTimeout(r, 2100));
    const updateAfterStopRes = await request('/donor/location/update', {
      method: 'POST',
      token: donorA.token,
      body: {
        sessionId: sessionAId,
        latitude: 18.5300,
        longitude: 73.8600,
        accuracy: 10,
        deviceTimestamp: new Date().toISOString(),
      },
    });
    assert(
      updateAfterStopRes.status === 409 && updateAfterStopRes.data?.error?.code === 'NO_ACTIVE_SESSION',
      'Update after session stopped is rejected with 409 NO_ACTIVE_SESSION'
    );

    console.log('\n--- 7. Idempotency & Duplicate Session Prevention Tests ---');

    // 7. Repeated requests do not create duplicate sessions or corrupt state
    // Repeated stop
    const repeatedStopRes = await request('/donor/location/session/stop', {
      method: 'POST',
      token: donorA.token,
      body: { reason: 'DONOR_STOPPED' },
    });
    assert(
      repeatedStopRes.status === 200 && repeatedStopRes.data?.success === true,
      'Repeated stop request is safe, idempotent and returns 200 without error'
    );

    // Start session twice consecutively
    const startFirst = await request('/donor/location/session/start', {
      method: 'POST',
      token: donorA.token,
      body: { consentGranted: true, consentVersion: '1.0' },
    });
    const startSecond = await request('/donor/location/session/start', {
      method: 'POST',
      token: donorA.token,
      body: { consentGranted: true, consentVersion: '1.0' },
    });

    const activeSessionsCount = await prisma.donorLocationSession.count({
      where: { donorUserId: donorA.user.id, status: 'ACTIVE' },
    });
    assert(
      activeSessionsCount === 1,
      'Repeated session start safely supersedes prior session; exactly 1 active session in DB'
    );

    console.log('\n--- 8. Admin Authorization & Precise Location Gating Tests ---');

    // 8. Only Platform/System Admins can retrieve precise locations
    const donorAdminAccessRes = await request('/admin/locations/live', {
      token: donorA.token, // Regular donor token
    });
    assert(
      donorAdminAccessRes.status === 403 &&
        donorAdminAccessRes.data?.error?.code === 'FORBIDDEN_PLATFORM_ADMIN',
      'Non-admin donor is forbidden from accessing /admin/locations/live (403 FORBIDDEN_PLATFORM_ADMIN)'
    );

    const anonAdminAccessRes = await request('/admin/locations/live');
    assert(
      anonAdminAccessRes.status === 401 && anonAdminAccessRes.data?.error?.code === 'UNAUTHORIZED',
      'Unauthenticated caller is rejected from /admin/locations/live (401 UNAUTHORIZED)'
    );

    const platformAdminAccessRes = await request('/admin/locations/live', {
      token: admin.token,
    });
    assert(
      platformAdminAccessRes.status === 200 &&
        Array.isArray(platformAdminAccessRes.data?.data),
      'Platform Admin can successfully retrieve live donor locations snapshot',
      platformAdminAccessRes.data
    );

    console.log('\n--- 9. WebSocket Channel Gating & Security Tests ---');

    // 9. Non-admin users cannot subscribe to admin:live-locations
    const wsUrl = `ws://127.0.0.1:${PORT}/ws`;

    // A. Connect non-admin donor WebSocket and attempt subscription
    const donorWsSubPromise = new Promise<{ forbidden: boolean; errorMsg?: string; received?: any }>((resolve) => {
      const ws = new WebSocket(wsUrl, [`raktasetu-auth.${donorA.token}`]);
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'authenticated') {
            ws.send(JSON.stringify({ type: 'subscribe', channel: 'admin:live-locations' }));
          } else if (msg.type === 'error') {
            ws.close();
            resolve({ forbidden: msg.code === 'FORBIDDEN_SUBSCRIPTION', errorMsg: msg.message, received: msg });
          }
        } catch (err: any) {
          resolve({ forbidden: false, errorMsg: err.message });
        }
      });
      ws.on('error', (err) => resolve({ forbidden: false, errorMsg: err.message }));
      setTimeout(() => {
        ws.close();
        resolve({ forbidden: false, errorMsg: 'timeout' });
      }, 5000);
    });

    const donorSubResult = await donorWsSubPromise;
    assert(
      donorSubResult.forbidden === true,
      'WebSocket rejects non-admin subscription to admin:live-locations with FORBIDDEN_SUBSCRIPTION',
      donorSubResult
    );

    // B. Connect Platform Admin WebSocket and verify subscription succeeds
    const adminWsSubPromise = new Promise<{ subscribed: boolean; received?: any }>((resolve) => {
      const ws = new WebSocket(wsUrl, [`raktasetu-auth.${admin.token}`]);
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'authenticated') {
            ws.send(JSON.stringify({ type: 'subscribe', channel: 'admin:live-locations' }));
          } else if (msg.type === 'subscribed' && msg.channel === 'admin:live-locations') {
            ws.close();
            resolve({ subscribed: true, received: msg });
          }
        } catch {}
      });
      ws.on('error', (err) => resolve({ subscribed: false, received: err.message }));
      setTimeout(() => {
        ws.close();
        resolve({ subscribed: false, received: 'timeout' });
      }, 5000);
    });

    const adminSubResult = await adminWsSubPromise;
    assert(
      adminSubResult.subscribed === true,
      'WebSocket allows Platform Admin to subscribe to admin:live-locations',
      adminSubResult
    );

    console.log('\n--- 10. Stale Location Semantics Tests ---');

    // 10. A location older than 15 minutes is returned as stale, not live
    // Submit update for donorA to ensure latestLocation exists
    const activeSessionA = await prisma.donorLocationSession.findFirst({
      where: { donorUserId: donorA.user.id, status: 'ACTIVE' },
    });
    if (activeSessionA) {
      await prisma.donorLatestLocation.upsert({
        where: { donorUserId: donorA.user.id },
        create: {
          donorUserId: donorA.user.id,
          sessionId: activeSessionA.id,
          latitude: 18.5204,
          longitude: 73.8567,
          accuracy: 10,
          deviceTimestamp: new Date(Date.now() - 25 * 60 * 1000), // 25 mins ago
          serverReceivedAt: new Date(Date.now() - 20 * 60 * 1000), // 20 mins ago (> 15m)
          isStale: true,
        },
        update: {
          sessionId: activeSessionA.id,
          latitude: 18.5204,
          longitude: 73.8567,
          accuracy: 10,
          deviceTimestamp: new Date(Date.now() - 25 * 60 * 1000),
          serverReceivedAt: new Date(Date.now() - 20 * 60 * 1000), // 20 mins ago (> 15m)
          isStale: true,
        },
      });
    }

    const staleCheckRes = await request('/admin/locations/live', {
      token: admin.token,
    });
    const donorASnapshot = staleCheckRes.data?.data?.find(
      (item: any) => item.donorUserId === donorA.user.id
    );

    assert(
      donorASnapshot !== undefined &&
        donorASnapshot.isStale === true &&
        donorASnapshot.freshness === 'STALE' &&
        donorASnapshot.sessionStatus === 'ACTIVE',
      'Location older than 15 minutes is dynamically returned as STALE (isStale: true), while session remains ACTIVE',
      donorASnapshot
    );

    console.log('\n========================================================================');
    console.log(`  Phase 10 Test Summary: ${passed} passed, ${failed} failed`);
    console.log('========================================================================\n');

    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await RealtimeService.shutdown();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    await prisma.$disconnect();
  }
}

runTestSuite().catch((err) => {
  console.error('[FATAL] Phase 10 test suite execution failed:', err);
  process.exit(1);
});
