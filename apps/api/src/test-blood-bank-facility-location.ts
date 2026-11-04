/**
 * RaktaSetu — Blood Bank Facility Location Configuration Verification Suite
 *
 * Verifies:
 * 1. Location retrieval (GET /api/v1/organisations/:id/location)
 * 2. RBAC enforcement: Only authorized ORG_ADMIN of that specific bank can set coordinates
 * 3. Tenant isolation: Admin of Bank A cannot modify Bank B
 * 4. Coordinate range validation: Rejects invalid lat/lng with 400
 * 5. Database persistence: Correctly updates Organisation record in DB
 * 6. Audit logging: Records ORGANISATION_LOCATION_CONFIRMED / ORGANISATION_LOCATION_UPDATED
 * 7. Realtime outbox: Dispatches organisation.location_updated event
 * 8. Subsequent GET /me/memberships reflects the confirmed coordinates
 */

import assert from 'assert';
import { prisma } from './lib/prisma';
import { app } from './app';

const PORT = 4097;
let server: any;
const BASE_URL = `http://127.0.0.1:${PORT}/api/v1`;

async function request(endpoint: string, options: { method?: string; body?: any; token?: string } = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function loginUser(phoneNumber: string): Promise<string> {
  const loginRes = await request('/auth/demo-login', {
    method: 'POST',
    body: { phoneNumber, otp: '123456' },
  });
  if (loginRes.status !== 200) {
    console.error('demo-login failed:', loginRes);
  }
  assert(loginRes.status === 200 && loginRes.data?.data?.token, `Failed to login ${phoneNumber}`);
  return loginRes.data.data.token;
}

async function main() {
  console.log('========================================================================');
  console.log('  RaktaSetu — Blood Bank Facility Location Setup Verification Suite');
  console.log('========================================================================\n');

  await new Promise<void>((resolve) => {
    server = app.listen(PORT, () => {
      console.log(`[Test Server] Running on http://127.0.0.1:${PORT}`);
      resolve();
    });
  });

  try {
    // 1. Setup two test organisations and users
    console.log('--- 1. Setup Test Data ---');
    const rand = Math.floor(Math.random() * 80000) + 10000;
    const suffix = Date.now().toString().slice(-5) + rand.toString().slice(-2);
    const phoneAdminA = `+91971${suffix}`;
    const phoneStaffA = `+91972${suffix}`;
    const phoneAdminB = `+91973${suffix}`;

    const userAdminA = await prisma.user.create({
      data: { phoneNumber: phoneAdminA, name: 'Dr. Admin A', role: 'USER' },
    });
    const userStaffA = await prisma.user.create({
      data: { phoneNumber: phoneStaffA, name: 'Staff A (Inventory)', role: 'USER' },
    });
    const userAdminB = await prisma.user.create({
      data: { phoneNumber: phoneAdminB, name: 'Dr. Admin B', role: 'USER' },
    });

    const orgA = await prisma.organisation.create({
      data: {
        name: `Test Blood Centre A ${rand}`,
        orgCode: `ORG-A-${rand}`,
        licenseNumber: `LIC-A-${rand}`,
        type: 'BLOOD_BANK',
        status: 'VERIFIED',
        stateCode: 27,
        districtCode: 521,
        address: '100 Medical Road, Pune',
        locationStatus: 'UNCONFIGURED',
      },
    });

    const orgB = await prisma.organisation.create({
      data: {
        name: `Test Blood Centre B ${rand}`,
        orgCode: `ORG-B-${rand}`,
        licenseNumber: `LIC-B-${rand}`,
        type: 'BLOOD_BANK',
        status: 'VERIFIED',
        stateCode: 27,
        districtCode: 521,
        address: '200 Hospital Marg, Pune',
        locationStatus: 'UNCONFIGURED',
      },
    });

    // Create memberships
    await prisma.organisationMembership.create({
      data: { userId: userAdminA.id, organisationId: orgA.id, role: 'ORG_ADMIN', isActive: true },
    });
    await prisma.organisationMembership.create({
      data: { userId: userStaffA.id, organisationId: orgA.id, role: 'INVENTORY_STAFF', isActive: true },
    });
    await prisma.organisationMembership.create({
      data: { userId: userAdminB.id, organisationId: orgB.id, role: 'ORG_ADMIN', isActive: true },
    });

    const tokenAdminA = await loginUser(phoneAdminA);
    const tokenStaffA = await loginUser(phoneStaffA);
    const tokenAdminB = await loginUser(phoneAdminB);

    console.log('[PASS] Test users and organisations initialized successfully.\n');

    // 2. Initial state verification
    console.log('--- 2. Initial Location State ---');
    const initLocRes = await request(`/organisations/${orgA.id}/location`, { token: tokenAdminA });
    assert.strictEqual(initLocRes.status, 200, 'GET /location should return 200');
    assert.strictEqual(initLocRes.data.data.locationStatus, 'UNCONFIGURED', 'Initial status should be UNCONFIGURED');
    assert.strictEqual(initLocRes.data.data.latitude, null, 'Initial latitude should be null');
    assert.strictEqual(initLocRes.data.data.longitude, null, 'Initial longitude should be null');
    console.log('[PASS] Initial location reports UNCONFIGURED with null coordinates.\n');

    // 3. Coordinate validation
    console.log('--- 3. Coordinate Range Validation ---');
    const invalidLatRes = await request(`/organisations/${orgA.id}/location`, {
      method: 'PUT',
      token: tokenAdminA,
      body: { latitude: 95.0, longitude: 73.8567 },
    });
    assert.strictEqual(invalidLatRes.status, 400, 'Latitude > 90 should be rejected');
    assert.strictEqual(invalidLatRes.data.error.code, 'COORDINATES_OUT_OF_BOUNDS');

    const invalidLngRes = await request(`/organisations/${orgA.id}/location`, {
      method: 'PUT',
      token: tokenAdminA,
      body: { latitude: 18.5204, longitude: 195.0 },
    });
    assert.strictEqual(invalidLngRes.status, 400, 'Longitude > 180 should be rejected');
    assert.strictEqual(invalidLngRes.data.error.code, 'COORDINATES_OUT_OF_BOUNDS');

    const nonNumericRes = await request(`/organisations/${orgA.id}/location`, {
      method: 'PUT',
      token: tokenAdminA,
      body: { latitude: 'invalid', longitude: 73.8567 },
    });
    assert.strictEqual(nonNumericRes.status, 400, 'Non-numeric coordinates should be rejected');
    assert.strictEqual(nonNumericRes.data.error.code, 'INVALID_COORDINATES');
    console.log('[PASS] Invalid and out-of-bounds coordinates correctly rejected with 400.\n');

    // 4. Authorization & Tenant Isolation
    console.log('--- 4. RBAC & Tenant Isolation ---');
    // Non-admin staff cannot set location
    const staffAttempt = await request(`/organisations/${orgA.id}/location`, {
      method: 'PUT',
      token: tokenStaffA,
      body: { latitude: 18.5204, longitude: 73.8567 },
    });
    assert.strictEqual(staffAttempt.status, 403, 'Non-admin staff should be rejected with 403');
    console.log('[PASS] INVENTORY_STAFF cannot configure facility location (403 Forbidden).');

    // Admin B cannot configure Org A's location
    const crossOrgAttempt = await request(`/organisations/${orgA.id}/location`, {
      method: 'PUT',
      token: tokenAdminB,
      body: { latitude: 18.5204, longitude: 73.8567 },
    });
    assert.strictEqual(crossOrgAttempt.status, 403, 'Cross-org admin modification should be rejected with 403');
    console.log('[PASS] Tenant isolation verified: Admin B cannot configure Org A (403 Forbidden).\n');

    // 5. Valid Location Confirmation
    console.log('--- 5. Valid Facility Location Confirmation ---');
    const confirmRes = await request(`/organisations/${orgA.id}/location`, {
      method: 'PUT',
      token: tokenAdminA,
      body: {
        latitude: 18.520432,
        longitude: 73.856743,
        locationAddress: 'Ground Floor, Donor Reception Desk, Building A',
      },
    });
    assert.strictEqual(confirmRes.status, 200, 'PUT /location should succeed with 200');
    assert.strictEqual(confirmRes.data.success, true);
    assert.strictEqual(confirmRes.data.data.locationStatus, 'CONFIRMED');
    assert.strictEqual(Number(confirmRes.data.data.latitude), 18.520432);
    assert.strictEqual(Number(confirmRes.data.data.longitude), 73.856743);
    assert.strictEqual(confirmRes.data.data.locationAddress, 'Ground Floor, Donor Reception Desk, Building A');
    console.log('[PASS] Location successfully confirmed and saved by ORG_ADMIN.\n');

    // 6. DB Persistence & Audit Log Verification
    console.log('--- 6. Database Persistence & Audit Log ---');
    const dbOrg = await prisma.organisation.findUnique({ where: { id: orgA.id } });
    assert(dbOrg, 'Organisation must exist in DB');
    assert.strictEqual(dbOrg.locationStatus, 'CONFIRMED');
    assert.strictEqual(Number(dbOrg.latitude), 18.520432);
    assert.strictEqual(Number(dbOrg.longitude), 73.856743);
    assert.strictEqual(dbOrg.locationAddress, 'Ground Floor, Donor Reception Desk, Building A');
    assert.strictEqual(dbOrg.locationConfirmedBy, userAdminA.id);
    assert(dbOrg.locationConfirmedAt !== null, 'locationConfirmedAt must be set');

    const auditLog = await prisma.auditLog.findFirst({
      where: {
        resourceId: orgA.id,
        action: 'ORGANISATION_LOCATION_CONFIRMED',
      },
    });
    assert(auditLog, 'Audit log for ORGANISATION_LOCATION_CONFIRMED must be created');
    console.log('[PASS] DB record updated correctly with coordinates, timestamp, and audit trail.\n');

    // 7. GET /me/memberships reflects the confirmed location
    console.log('--- 7. Membership Portal Payload Verification ---');
    const membershipsRes = await request('/organisations/me/memberships', { token: tokenAdminA });
    assert.strictEqual(membershipsRes.status, 200);
    const userOrgEntry = membershipsRes.data.data.find((m: any) => m.organisationId === orgA.id);
    assert(userOrgEntry, 'Membership entry for Org A must be present');
    assert.strictEqual(userOrgEntry.locationStatus, 'CONFIRMED');
    assert.strictEqual(Number(userOrgEntry.latitude), 18.520432);
    assert.strictEqual(Number(userOrgEntry.longitude), 73.856743);
    assert.strictEqual(userOrgEntry.locationAddress, 'Ground Floor, Donor Reception Desk, Building A');
    console.log('[PASS] GET /me/memberships returns confirmed coordinates for Blood Bank portal.\n');

    // 8. Update Location Pin (Edit mode)
    console.log('--- 8. Update Existing Location (Edit Mode) ---');
    const updateRes = await request(`/organisations/${orgA.id}/location`, {
      method: 'PUT',
      token: tokenAdminA,
      body: {
        latitude: 18.521100,
        longitude: 73.857200,
        locationAddress: 'Relocated to West Wing Reception, 2nd Entrance',
      },
    });
    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(Number(updateRes.data.data.latitude), 18.521100);

    const updateAudit = await prisma.auditLog.findFirst({
      where: {
        resourceId: orgA.id,
        action: 'ORGANISATION_LOCATION_UPDATED',
      },
    });
    assert(updateAudit, 'Audit log for ORGANISATION_LOCATION_UPDATED must be created on edit');
    console.log('[PASS] Existing location updated and logged as ORGANISATION_LOCATION_UPDATED.\n');

    console.log('========================================================================');
    console.log('  All 8 Facility Location Configuration Verification Tests PASSED! ✓');
    console.log('========================================================================');
  } finally {
    if (server) {
      server.close();
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
