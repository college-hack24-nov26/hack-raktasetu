import http from 'http';
import WebSocket from 'ws';
import { app } from './app';
import { prisma } from './lib/prisma';
import { RealtimeService } from './services/realtime';
import { initDonorLocationSchema } from './lib/initDonorLocationSchema';

const PORT = 4078;
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

async function runMilestone02CTests() {
  console.log('========================================================================');
  console.log('  RaktaSetu — Milestone 02C: Live Donor Map Integration & RBAC Suite');
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
    const donorPhone = `+9197000${rand.toString().slice(0, 5)}`;
    const donorPhoneB = `+9197100${rand.toString().slice(0, 5)}`;
    const adminPhone = `+9197200${rand.toString().slice(0, 5)}`;
    const bbAdminPhone = `+9197300${rand.toString().slice(0, 5)}`;
    const clinicalStaffPhone = `+9197400${rand.toString().slice(0, 5)}`;
    const collectionStaffPhone = `+9197500${rand.toString().slice(0, 5)}`;
    const campCoordPhone = `+9197600${rand.toString().slice(0, 5)}`;

    // Helper: Authenticate user via demo OTP
    async function loginUser(phone: string, role: 'USER' | 'DONOR' | 'ADMIN', name: string) {
      const res = await request('/donor/auth/verify-otp', {
        method: 'POST',
        body: { phoneNumber: phone, otp: '123456' },
      });
      const token = res.data?.data?.token;
      const user = res.data?.data?.user;
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: { role, name },
        });
        user.role = role;
      }
      return { token, user };
    }

    const platformAdmin = await loginUser(adminPhone, 'ADMIN', 'System Platform Administrator');
    const donorA = await loginUser(donorPhone, 'DONOR', 'Transmitting Donor Pune');
    const donorB = await loginUser(donorPhoneB, 'DONOR', 'Transmitting Donor Mumbai');
    const bbAdmin = await loginUser(bbAdminPhone, 'USER', 'Blood Bank Admin');
    const clinicalStaff = await loginUser(clinicalStaffPhone, 'USER', 'Clinical Staff Dr. Patel');
    const collectionStaff = await loginUser(collectionStaffPhone, 'USER', 'Collection Nurse Shinde');
    const campCoordinator = await loginUser(campCoordPhone, 'USER', 'Camp Coordinator Joshi');

    // Create organisation & assign roles
    const org = await prisma.organisation.create({
      data: {
        orgCode: `ORG-TEST-${rand}`,
        name: `Test Blood Bank ${rand}`,
        type: 'BLOOD_BANK',
        licenseNumber: `LIC-TEST-${rand}`,
        stateCode: 27,
        districtCode: 521,
        status: 'VERIFIED',
      },
    });

    await prisma.organisationMembership.createMany({
      data: [
        { userId: bbAdmin.user.id, organisationId: org.id, role: 'ORG_ADMIN', isActive: true },
        { userId: clinicalStaff.user.id, organisationId: org.id, role: 'CLINICAL_STAFF', isActive: true },
        { userId: collectionStaff.user.id, organisationId: org.id, role: 'COLLECTION_STAFF', isActive: true },
      ],
    });

    // Profile for Donor A (Pune, MH - stateCode 27, districtCode 521)
    await prisma.donorProfile.upsert({
      where: { userId: donorA.user.id },
      create: {
        userId: donorA.user.id,
        fullName: 'Transmitting Donor Pune',
        bloodGroup: 'B_POS',
        stateCode: 27,
        districtCode: 521,
        cityOrLocality: 'Shivajinagar Pune',
      },
      update: {
        fullName: 'Transmitting Donor Pune',
        bloodGroup: 'B_POS',
        stateCode: 27,
        districtCode: 521,
      },
    });

    // Profile for Donor B (Mumbai, MH - stateCode 27, districtCode 519)
    await prisma.donorProfile.upsert({
      where: { userId: donorB.user.id },
      create: {
        userId: donorB.user.id,
        fullName: 'Transmitting Donor Mumbai',
        bloodGroup: 'O_POS',
        stateCode: 27,
        districtCode: 519,
        cityOrLocality: 'Dadar Mumbai',
      },
      update: {
        fullName: 'Transmitting Donor Mumbai',
        bloodGroup: 'O_POS',
        stateCode: 27,
        districtCode: 519,
      },
    });

    console.log('--- 1. API Security & Role-Based Access Control ---');

    // 1A. Platform Admin Access
    const adminSnapRes = await request('/admin/locations/live', { token: platformAdmin.token });
    assert(
      adminSnapRes.status === 200 && adminSnapRes.data?.success === true,
      'Platform Admin is authorized to access GET /api/v1/admin/locations/live (200 OK)'
    );

    // 1B. Unauthenticated Access Denied
    const anonRes = await request('/admin/locations/live');
    assert(
      anonRes.status === 401 && anonRes.data?.error?.code === 'UNAUTHORIZED',
      'Unauthenticated caller is denied GET /api/v1/admin/locations/live (401 UNAUTHORIZED)'
    );

    // 1C. Blood Bank Admin Access Denied
    const bbAdminRes = await request('/admin/locations/live', { token: bbAdmin.token });
    assert(
      bbAdminRes.status === 403 && bbAdminRes.data?.error?.code === 'FORBIDDEN_PLATFORM_ADMIN',
      'Blood Bank Admin is strictly denied GET /api/v1/admin/locations/live (403 FORBIDDEN_PLATFORM_ADMIN)'
    );

    // 1D. Clinical Staff Access Denied
    const clinRes = await request('/admin/locations/live', { token: clinicalStaff.token });
    assert(
      clinRes.status === 403 && clinRes.data?.error?.code === 'FORBIDDEN_PLATFORM_ADMIN',
      'Clinical Staff is strictly denied GET /api/v1/admin/locations/live (403 FORBIDDEN_PLATFORM_ADMIN)'
    );

    // 1E. Collection Staff Access Denied
    const collRes = await request('/admin/locations/live', { token: collectionStaff.token });
    assert(
      collRes.status === 403 && collRes.data?.error?.code === 'FORBIDDEN_PLATFORM_ADMIN',
      'Collection Staff is strictly denied GET /api/v1/admin/locations/live (403 FORBIDDEN_PLATFORM_ADMIN)'
    );

    // 1F. Camp Coordinator Access Denied
    const campRes = await request('/admin/locations/live', { token: campCoordinator.token });
    assert(
      campRes.status === 403 && campRes.data?.error?.code === 'FORBIDDEN_PLATFORM_ADMIN',
      'Camp Coordinator is strictly denied GET /api/v1/admin/locations/live (403 FORBIDDEN_PLATFORM_ADMIN)'
    );

    // 1G. Regular Donor Access Denied
    const donorRes = await request('/admin/locations/live', { token: donorA.token });
    assert(
      donorRes.status === 403 && donorRes.data?.error?.code === 'FORBIDDEN_PLATFORM_ADMIN',
      'Individual Donor is strictly denied GET /api/v1/admin/locations/live (403 FORBIDDEN_PLATFORM_ADMIN)'
    );

    console.log('\n--- 2. Live Session Lifecycle & Persisted Coordinates ---');

    // Start sharing session for Donor A
    const startARes = await request('/donor/location/session/start', {
      method: 'POST',
      token: donorA.token,
      body: { consentGranted: true, consentVersion: '1.0' },
    });
    assert(startARes.status === 201 && startARes.data?.data?.status === 'ACTIVE', 'Donor A starts consented location sharing session');
    const sessionAId = startARes.data?.data?.id;

    // Start sharing session for Donor B
    const startBRes = await request('/donor/location/session/start', {
      method: 'POST',
      token: donorB.token,
      body: { consentGranted: true, consentVersion: '1.0' },
    });
    assert(startBRes.status === 201 && startBRes.data?.data?.status === 'ACTIVE', 'Donor B starts consented location sharing session');
    const sessionBId = startBRes.data?.data?.id;

    // Submit valid GPS coordinates for Donor A (Pune)
    const updateARes = await request('/donor/location/update', {
      method: 'POST',
      token: donorA.token,
      body: {
        sessionId: sessionAId,
        latitude: 18.5204,
        longitude: 73.8567,
        accuracy: 8.5,
        heading: 90,
        speed: 1.2,
        batteryLevel: 0.88,
        deviceTimestamp: new Date().toISOString(),
      },
    });
    assert(updateARes.status === 200 && updateARes.data?.data?.latitude === 18.5204, 'Donor A coordinates persisted in database');

    // Submit valid GPS coordinates for Donor B (Mumbai)
    const updateBRes = await request('/donor/location/update', {
      method: 'POST',
      token: donorB.token,
      body: {
        sessionId: sessionBId,
        latitude: 19.0178,
        longitude: 72.8478,
        accuracy: 12.0,
        heading: 180,
        speed: 0.0,
        batteryLevel: 0.75,
        deviceTimestamp: new Date().toISOString(),
      },
    });
    assert(updateBRes.status === 200 && updateBRes.data?.data?.latitude === 19.0178, 'Donor B coordinates persisted in database');

    console.log('\n--- 3. State & District Filtering Invariants ---');

    // Query without filters -> returns both donors
    const allSnapshot = await request('/admin/locations/live?status=ACTIVE', { token: platformAdmin.token });
    const allDonors = allSnapshot.data?.data || [];
    const hasA = allDonors.some((d: any) => d.donorUserId === donorA.user.id);
    const hasB = allDonors.some((d: any) => d.donorUserId === donorB.user.id);
    assert(hasA && hasB, 'Unfiltered live location query returns all actively transmitting donors');

    // Query filtered to Pune District (districtCode 521)
    const puneSnapshot = await request('/admin/locations/live?stateCode=27&districtCode=521&status=ACTIVE', {
      token: platformAdmin.token,
    });
    const puneDonors = puneSnapshot.data?.data || [];
    const puneHasA = puneDonors.some((d: any) => d.donorUserId === donorA.user.id);
    const puneHasB = puneDonors.some((d: any) => d.donorUserId === donorB.user.id);
    assert(
      puneHasA && !puneHasB,
      'District filter strictly limits results to donors registered in that district (Pune has Donor A, excludes Donor B)'
    );

    // Query filtered to Mumbai District (districtCode 519)
    const mumbaiSnapshot = await request('/admin/locations/live?stateCode=27&districtCode=519&status=ACTIVE', {
      token: platformAdmin.token,
    });
    const mumbaiDonors = mumbaiSnapshot.data?.data || [];
    const mumbaiHasA = mumbaiDonors.some((d: any) => d.donorUserId === donorA.user.id);
    const mumbaiHasB = mumbaiDonors.some((d: any) => d.donorUserId === donorB.user.id);
    assert(
      !mumbaiHasA && mumbaiHasB,
      'District filter for Mumbai returns Donor B and excludes Donor A'
    );

    // Query empty district (e.g., districtCode 9999)
    const emptySnapshot = await request('/admin/locations/live?stateCode=27&districtCode=9999&status=ACTIVE', {
      token: platformAdmin.token,
    });
    assert(
      emptySnapshot.data?.data?.length === 0,
      'Empty district query returns 0 donors with clean empty array (never dummy coordinates)'
    );

    console.log('\n--- 4. Realtime WebSocket Channel Isolation ---');

    const wsUrl = `ws://127.0.0.1:${PORT}/ws`;

    // 4A. Non-Admin WebSocket Subscription Rejection
    const nonAdminWsPromise = new Promise<boolean>((resolve) => {
      const ws = new WebSocket(wsUrl, [`raktasetu-auth.${bbAdmin.token}`]);
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'authenticated') {
            ws.send(JSON.stringify({ type: 'subscribe', channel: 'admin:live-locations' }));
          } else if (msg.type === 'error' && msg.code === 'FORBIDDEN_SUBSCRIPTION') {
            ws.close();
            resolve(true);
          }
        } catch {
          resolve(false);
        }
      });
      ws.on('error', () => resolve(false));
      setTimeout(() => {
        ws.close();
        resolve(false);
      }, 4000);
    });

    const nonAdminWsRejected = await nonAdminWsPromise;
    assert(
      nonAdminWsRejected === true,
      'WebSocket rejects non-admin subscription to admin:live-locations with FORBIDDEN_SUBSCRIPTION'
    );

    // 4B. Platform Admin WebSocket Subscription & Real-Time Event Dispatch
    const adminEventsReceived: any[] = [];
    let wsAdminConnected = false;

    const adminWs = new WebSocket(wsUrl, [`raktasetu-auth.${platformAdmin.token}`]);
    const adminReadyPromise = new Promise<boolean>((resolve) => {
      adminWs.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'authenticated') {
            adminWs.send(JSON.stringify({ type: 'subscribe', channel: 'admin:live-locations' }));
          } else if (msg.type === 'subscribed' && msg.channel === 'admin:live-locations') {
            wsAdminConnected = true;
            resolve(true);
          } else if (msg.type === 'event') {
            adminEventsReceived.push(msg.event);
          }
        } catch {}
      });
      adminWs.on('error', () => resolve(false));
      setTimeout(() => resolve(false), 4000);
    });

    const isSubscribed = await adminReadyPromise;
    assert(isSubscribed === true, 'Platform Admin WebSocket successfully subscribes to admin:live-locations channel');

    // Wait cooldown before updating location again
    await new Promise((r) => setTimeout(r, 2200));

    // Submit updated location for Donor A
    await request('/donor/location/update', {
      method: 'POST',
      token: donorA.token,
      body: {
        sessionId: sessionAId,
        latitude: 18.5250,
        longitude: 73.8600,
        accuracy: 6.0,
        deviceTimestamp: new Date().toISOString(),
      },
    });

    // Wait for event to arrive
    await new Promise((r) => setTimeout(r, 600));

    const updateEvt = adminEventsReceived.find(
      (e) => e.eventType === 'donor_location.updated' && e.payload?.donorUserId === donorA.user.id
    );
    assert(
      updateEvt !== undefined && updateEvt.payload?.latitude === 18.5250,
      'donor_location.updated event received with new coordinates on admin:live-locations channel'
    );

    // Stop Donor A session
    await request('/donor/location/session/stop', {
      method: 'POST',
      token: donorA.token,
      body: { reason: 'DONOR_STOPPED' },
    });

    await new Promise((r) => setTimeout(r, 600));

    const endEvt = adminEventsReceived.find(
      (e) => e.eventType === 'donor_location.session_ended' && e.payload?.donorUserId === donorA.user.id
    );
    assert(
      endEvt !== undefined && endEvt.payload?.status === 'STOPPED',
      'donor_location.session_ended event received on admin:live-locations channel'
    );

    adminWs.close();

    console.log('\n--- 5. Freshness Semantics Verification ---');

    // Check freshness status in DB snapshot: Donor A is now STOPPED, Donor B is ACTIVE & FRESH
    const freshSnapshot = await request('/admin/locations/live?status=all', { token: platformAdmin.token });
    const snapDonorA = freshSnapshot.data?.data?.find((d: any) => d.donorUserId === donorA.user.id);
    const snapDonorB = freshSnapshot.data?.data?.find((d: any) => d.donorUserId === donorB.user.id);

    assert(
      snapDonorA?.sessionStatus === 'STOPPED',
      'Stopped donor session is identified as STOPPED in snapshot (does not remain actively sharing)'
    );

    assert(
      snapDonorB?.sessionStatus === 'ACTIVE' && snapDonorB?.freshness === 'FRESH' && snapDonorB?.isStale === false,
      'Recent transmission (<15 mins) is classified as FRESH (isStale: false)'
    );

    // Artificially age Donor B location to > 15 minutes in DB
    const sixteenMinsAgo = new Date(Date.now() - 16 * 60 * 1000);
    await prisma.donorLatestLocation.updateMany({
      where: { sessionId: sessionBId },
      data: {
        serverReceivedAt: sixteenMinsAgo,
        deviceTimestamp: sixteenMinsAgo,
      },
    });

    const staleSnapshot = await request('/admin/locations/live?status=ACTIVE', { token: platformAdmin.token });
    const staleDonorB = staleSnapshot.data?.data?.find((d: any) => d.donorUserId === donorB.user.id);
    assert(
      staleDonorB?.isStale === true && staleDonorB?.freshness === 'STALE',
      'Location received > 15 minutes ago is dynamically classified as STALE (isStale: true, freshness: STALE)'
    );
    assert(
      staleDonorB?.sessionStatus === 'ACTIVE',
      'Stale classification alone does not terminate the donor sharing session (sessionStatus: ACTIVE)'
    );

    console.log('\n========================================================================');
    console.log(`  Milestone 02C Test Summary: ${passed} passed, ${failed} failed`);
    console.log('========================================================================\n');
  } finally {
    RealtimeService.shutdown();
    server.close();
  }
}

runMilestone02CTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
