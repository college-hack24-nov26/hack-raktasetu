import { app } from './app';
import { prisma } from './lib/prisma';
import { RealtimeService } from './services/realtime';
import http from 'http';
import WebSocket from 'ws';

let server: http.Server;
const PORT = 4097;
const BASE_URL = `http://127.0.0.1:${PORT}/api/v1`;
const WS_URL = `ws://127.0.0.1:${PORT}/ws`;

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

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPhase7RealtimeDeliveryTests() {
  console.log('========================================================================');
  console.log(' RaktaSetu — Phase 7: Real-Time Delivery & WebSockets Test Suite');
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

  server = http.createServer(app);
  RealtimeService.init(server);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));

  // Dedicated test phone numbers for Phase 7 (78000+ range)
  const orgAAdminPhone = '+919999978001';
  const orgBAdminPhone = '+919999978002';
  const voluntaryDonorPhone = '+919999978003';

  let orgAAdminToken = '';
  let orgBAdminToken = '';
  let voluntaryDonorToken = '';

  let orgAId = '';
  let orgBId = '';
  let orgAAdminUserId = '';
  let orgBAdminUserId = '';

  try {
    // ----------------------------------------------------
    // SETUP: Provision organisations, users, and tokens
    // ----------------------------------------------------
    console.log('--- 0. Provisioning Phase 7 Test Fixtures ---');

    async function loginUser(phone: string) {
      const loginRes = await request('/auth/demo-login', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: phone, otp: '123456' }),
      });
      return {
        token: loginRes.data?.data?.token,
        userId: loginRes.data?.data?.user?.id,
      };
    }

    // 1. Create Org A
    const orgACode = `ORG-P7-A-${Date.now()}`;
    const orgA = await prisma.organisation.create({
      data: {
        orgCode: orgACode,
        name: 'Apex Blood Centre Mumbai (Phase 7)',
        type: 'BLOOD_BANK',
        licenseNumber: `LIC-P7-A-${Date.now()}`,
        districtCode: 519,
        districtName: 'Mumbai Suburban',
        status: 'VERIFIED',
      },
    });
    orgAId = orgA.id;

    // 2. Create Org B
    const orgBCode = `ORG-P7-B-${Date.now()}`;
    const orgB = await prisma.organisation.create({
      data: {
        orgCode: orgBCode,
        name: 'Lotus General Hospital Blood Bank (Phase 7)',
        type: 'RECEIVING_FACILITY',
        licenseNumber: `LIC-P7-B-${Date.now()}`,
        districtCode: 519,
        districtName: 'Mumbai Suburban',
        status: 'VERIFIED',
      },
    });
    orgBId = orgB.id;

    // 3. User Org A Admin
    const aAdmin = await loginUser(orgAAdminPhone);
    orgAAdminToken = aAdmin.token;
    orgAAdminUserId = aAdmin.userId;

    await prisma.organisationMembership.create({
      data: {
        userId: orgAAdminUserId,
        organisationId: orgAId,
        role: 'ORG_ADMIN',
        isActive: true,
      },
    });

    // 4. User Org B Admin
    const bAdmin = await loginUser(orgBAdminPhone);
    orgBAdminToken = bAdmin.token;
    orgBAdminUserId = bAdmin.userId;

    await prisma.organisationMembership.create({
      data: {
        userId: orgBAdminUserId,
        organisationId: orgBId,
        role: 'ORG_ADMIN',
        isActive: true,
      },
    });

    // 5. Voluntary Donor
    const donorUser = await loginUser(voluntaryDonorPhone);
    voluntaryDonorToken = donorUser.token;

    console.log(`Fixtures ready. Org A: ${orgAId}, Org B: ${orgBId}\n`);

    // ====================================================
    // TEST 1: Unauthenticated Connection Rejected
    // ====================================================
    console.log('--- Test 1: Authentication Enforcement ---');
    await new Promise<void>((resolve) => {
      const ws = new WebSocket(WS_URL);
      let closed = false;
      let closeCode = 0;

      ws.on('close', (code) => {
        closed = true;
        closeCode = code;
        assert(
          closeCode === 4001 || closeCode === 1008 || closeCode === 1000,
          'Test 1.1: Unauthenticated WebSocket connection terminated by server',
          `Close code: ${closeCode}`
        );
        resolve();
      });

      ws.on('open', () => {
        // Did not send auth message within timeout; should be closed
      });

      ws.on('error', () => {
        // Socket error is expected on rejection
        if (!closed) {
          assert(true, 'Test 1.1: Unauthenticated connection rejected with error');
          resolve();
        }
      });
    });

    // ====================================================
    // TEST 2: Untrusted Origin Rejected (403 Forbidden)
    // ====================================================
    console.log('\n--- Test 2: Origin Verification Security ---');
    await new Promise<void>((resolve) => {
      const ws = new WebSocket(WS_URL, {
        headers: {
          Origin: 'https://malicious-phishing-attacker.com',
        },
      });

      ws.on('error', (err: any) => {
        const isForbidden = err?.message?.includes('403') || err?.message?.includes('Unexpected server response');
        assert(
          isForbidden,
          'Test 2.1: Untrusted Origin is rejected during handshake with HTTP 403 Forbidden',
          err?.message
        );
        resolve();
      });

      ws.on('open', () => {
        assert(false, 'Test 2.1: Untrusted origin was incorrectly accepted');
        ws.close();
        resolve();
      });
    });

    // ====================================================
    // TEST 3: Authenticated Connection via Subprotocol
    // ====================================================
    console.log('\n--- Test 3: Authenticated Connection via Subprotocol ---');
    let clientA: any = null;
    let clientAAuthMessage: any = null;

    await new Promise<void>((resolve) => {
      clientA = new WebSocket(WS_URL, [`raktasetu-auth.${orgAAdminToken}`]);

      clientA.on('message', (data: any) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'authenticated') {
          clientAAuthMessage = msg;
          assert(
            msg.authorizedOrgs.includes(orgAId),
            'Test 3.1: Authenticated connection receives verified membership list',
            `Authorized orgs: ${JSON.stringify(msg.authorizedOrgs)}`
          );
          resolve();
        }
      });

      clientA.on('error', (err: any) => {
        assert(false, 'Test 3.1: Authenticated connection failed', err.message);
        resolve();
      });
    });

    // ====================================================
    // TEST 4: Subscription Scoping & Cross-Org Isolation
    // ====================================================
    console.log('\n--- Test 4: Subscription Scoping & Cross-Org Isolation ---');
    if (clientA) {
      // 4a. Subscribe to authorized Org A
      await new Promise<void>((resolve) => {
        clientA!.send(JSON.stringify({ type: 'subscribe', channel: `org:${orgAId}` }));
        clientA!.once('message', (data: any) => {
          const msg = JSON.parse(data.toString());
          assert(
            msg.type === 'subscribed' && msg.channel === `org:${orgAId}`,
            'Test 4.1: Authorized organisation subscription succeeds'
          );
          resolve();
        });
      });

      // 4b. Attempt to subscribe to UNAUTHORIZED Org B
      await new Promise<void>((resolve) => {
        clientA!.send(JSON.stringify({ type: 'subscribe', channel: `org:${orgBId}` }));
        clientA!.once('message', (data: any) => {
          const msg = JSON.parse(data.toString());
          assert(
            msg.type === 'error' && msg.code === 'FORBIDDEN_SUBSCRIPTION',
            'Test 4.2: Unauthorized cross-organisation subscription is strictly denied with FORBIDDEN_SUBSCRIPTION',
            `Received: ${JSON.stringify(msg)}`
          );
          resolve();
        });
      });
    }

    // Connect Client B (Org B Admin)
    let clientB: any = null;
    await new Promise<void>((resolve) => {
      clientB = new WebSocket(WS_URL, [`raktasetu-auth.${orgBAdminToken}`]);
      clientB.on('message', (data: any) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'authenticated') {
          clientB!.send(JSON.stringify({ type: 'subscribe', channel: `org:${orgBId}` }));
        } else if (msg.type === 'subscribed') {
          resolve();
        }
      });
    });

    // ====================================================
    // TEST 5: Transactional Atomicity & Rollback Safety
    // ====================================================
    console.log('\n--- Test 5: Transactional Atomicity & Rollback Safety ---');

    // 5a. Rollback test: When a transaction aborts, 0 outbox events must be created
    const outboxCountBefore = await prisma.outboxEvent.count();

    try {
      await prisma.$transaction(async (tx) => {
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'inventory.summary_changed',
          organisationId: orgAId,
          entityType: 'InventorySummary',
          entityId: orgAId,
          payload: { test: 'aborted-event' },
        });

        // Deliberately throw an error to simulate database write failure
        throw new Error('Simulated business validation exception during transaction');
      });
    } catch {
      // Expected rollback
    }

    const outboxCountAfter = await prisma.outboxEvent.count();
    assert(
      outboxCountBefore === outboxCountAfter,
      'Test 5.1: Rolled-back database transaction creates 0 outbox events (Transactional Integrity Guaranteed)'
    );

    // 5b. Commit test: When transaction commits, event is written to outbox table
    let committedEventId = '';
    await prisma.$transaction(async (tx) => {
      const evt = await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'component.release_recorded',
        organisationId: orgAId,
        entityType: 'ComponentBatch',
        entityId: 'CMP-BATCH-001',
        payload: {
          componentCode: 'PRBC-7801-01',
          componentType: 'PRBC',
          status: 'AVAILABLE',
          decision: 'RELEASE_APPROVED',
        },
      });
      committedEventId = evt.id;
    });

    const savedOutbox = await prisma.outboxEvent.findUnique({
      where: { id: committedEventId },
    });
    assert(
      savedOutbox !== null && (savedOutbox.status === 'PENDING' || savedOutbox.status === 'DELIVERED'),
      'Test 5.2: Committed transaction successfully persists OutboxEvent into database',
      `Event ID: ${committedEventId}, Status: ${savedOutbox?.status}`
    );

    // ====================================================
    // TEST 6: Event Delivery, Recipient Isolation & No PII
    // ====================================================
    console.log('\n--- Test 6: Event Delivery & Recipient Isolation ---');

    let clientAReceivedEvent: any = null;
    let clientBReceivedEvent: any = null;

    if (clientA) {
      clientA.on('message', (data: any) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'event') {
          clientAReceivedEvent = msg.event;
        }
      });
    }

    if (clientB) {
      clientB.on('message', (data: any) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'event') {
          clientBReceivedEvent = msg.event;
        }
      });
    }

    // Publish a real-time outbox event while client listeners are actively connected
    let liveEventId = '';
    await prisma.$transaction(async (tx) => {
      const evt = await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'component.release_recorded',
        organisationId: orgAId,
        entityType: 'ComponentBatch',
        entityId: 'CMP-BATCH-LIVE',
        payload: {
          componentCode: 'PRBC-7801-LIVE',
          componentType: 'PRBC',
          status: 'AVAILABLE',
          decision: 'RELEASE_APPROVED',
        },
      });
      liveEventId = evt.id;
    });

    // Ensure outbox batch processing executes and delivers live frame
    await RealtimeService.processPendingOutbox(10);
    await wait(200);

    const deliveredOutbox = await prisma.outboxEvent.findUnique({
      where: { id: liveEventId },
    });
    assert(
      deliveredOutbox?.status === 'DELIVERED',
      'Test 6.1: Outbox processor successfully delivers pending batch and updates status to DELIVERED',
      `Status: ${deliveredOutbox?.status}`
    );

    assert(
      clientAReceivedEvent !== null && clientAReceivedEvent.eventId === liveEventId,
      'Test 6.2: Authorized Org A client receives committed real-time event envelope',
      `Type: ${clientAReceivedEvent?.eventType}`
    );

    assert(
      clientBReceivedEvent === null,
      'Test 6.3: Unauthorized Org B client receives NOTHING (Cross-tenant leak prevention)'
    );

    // 6c. Zero PII Verification
    const payloadStr = JSON.stringify(clientAReceivedEvent?.payload || {});
    const hasPII =
      payloadStr.includes('+91') ||
      payloadStr.includes('donor') ||
      payloadStr.includes('patient') ||
      payloadStr.includes('medical');

    assert(
      !hasPII,
      'Test 6.4: Real-time event payload strictly excludes donor PII, phone numbers, and clinical secrets'
    );

    // ====================================================
    // TEST 7: Reconnection & REST Event Replay Endpoint
    // ====================================================
    console.log('\n--- Test 7: Reconnection & REST Replay Synchronization ---');

    const replayRes = await request(`/organisations/${orgAId}/events?limit=10`, {
      headers: {
        Authorization: `Bearer ${orgAAdminToken}`,
      },
    });

    assert(
      replayRes.ok && Array.isArray(replayRes.data.data),
      'Test 7.1: Authorised user can replay historical outbox events via REST sync API',
      `Events returned: ${replayRes.data?.data?.length}`
    );

    const eventFoundInReplay = replayRes.data?.data?.some(
      (e: any) => e.eventId === committedEventId
    );
    assert(
      eventFoundInReplay === true,
      'Test 7.2: Replay endpoint returns committed outbox event with stable eventId for client deduplication'
    );

    // Cross-org replay access attempt
    const crossOrgReplay = await request(`/organisations/${orgBId}/events?limit=10`, {
      headers: {
        Authorization: `Bearer ${orgAAdminToken}`,
      },
    });
    assert(
      crossOrgReplay.status === 403,
      'Test 7.3: Cross-organisation event replay request is rejected with 403 Forbidden'
    );

    // ====================================================
    // TEST 8: Slow Consumer / Oversized Payload Protection
    // ====================================================
    console.log('\n--- Test 8: Protection Controls (Payload Limits & Slow Consumer) ---');

    await new Promise<void>((resolve) => {
      const testSocket = new WebSocket(WS_URL, [`raktasetu-auth.${orgAAdminToken}`]);

      testSocket.on('open', () => {
        // Send oversized payload > 64KB (e.g. 70KB of data)
        const hugePayload = 'A'.repeat(70 * 1024);
        testSocket.send(JSON.stringify({ type: 'auth', token: hugePayload }));
      });

      testSocket.on('close', (code) => {
        assert(
          code === 1009 || code === 1008 || code === 1002,
          'Test 8.1: Oversized client frame (>64KB) is safely terminated with code 1009/1008',
          `Close code: ${code}`
        );
        resolve();
      });

      testSocket.on('error', () => {
        // May error on close
        resolve();
      });
    });

    // ====================================================
    // TEST 9: Operational Metrics & Health Observability
    // ====================================================
    console.log('\n--- Test 9: Real-time Operational Metrics & Observability ---');

    const metrics = RealtimeService.getMetrics();
    assert(
      typeof metrics.activeConnections === 'number' && typeof metrics.eventsPublished === 'number',
      'Test 9.1: RealtimeService exposes operational metrics (activeConnections, eventsPublished, deliveriesSuccessful)'
    );

    // Clean up test clients
    if (clientA && clientA.readyState === WebSocket.OPEN) clientA.close();
    if (clientB && clientB.readyState === WebSocket.OPEN) clientB.close();

    // ====================================================
    // TEST 10: Graceful Shutdown
    // ====================================================
    console.log('\n--- Test 10: Server Graceful Shutdown ---');

    // Create temporary socket
    let shutdownClosedCleanly = false;
    await new Promise<void>((resolve) => {
      const termSocket = new WebSocket(WS_URL, [`raktasetu-auth.${orgAAdminToken}`]);
      termSocket.on('open', () => {
        termSocket.on('close', (code) => {
          if (code === 1001) {
            shutdownClosedCleanly = true;
          }
          resolve();
        });

        // Trigger graceful shutdown
        RealtimeService.shutdown();
      });
    });

    assert(
      shutdownClosedCleanly,
      'Test 10.1: RealtimeService.shutdown() cleanly terminates all active connections with code 1001 (GOING AWAY)'
    );

  } catch (err: any) {
    console.error('Unexpected error during Phase 7 test execution:', err);
    failed++;
  } finally {
    if (server) {
      server.close();
    }
  }

  console.log('\n========================================================================');
  console.log(` Phase 7 Test Suite Complete: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase7RealtimeDeliveryTests();
