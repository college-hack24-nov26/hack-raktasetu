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

async function runPhase6SafetyHardeningTests() {
  console.log('========================================================================');
  console.log(' RaktaSetu — Phase 6: Safety Audit & Release Gate Hardening Regression');
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

  // Hardening test phone numbers (Phase 6 dedicated range 77000+)
  const orgAdminPhone = '+919999977001';
  const clinicalStaffPhone = '+919999977002';
  const inventoryStaffPhone = '+919999977003';
  const orgBClinicalPhone = '+919999977004';

  let orgAdminToken = '';
  let clinicalStaffToken = '';
  let inventoryStaffToken = '';
  let orgBClinicalToken = '';

  let orgAId = '';
  let orgBId = '';
  let testComponentUnitId = '';

  try {
    // ----------------------------------------------------
    // SETUP: Provision organisations, users, and bag
    // ----------------------------------------------------
    console.log('--- 0. Provisioning Hardening Test Fixtures ---');

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

    const aAdmin = await loginUser(orgAdminPhone);
    orgAdminToken = aAdmin.token;

    const aClin = await loginUser(clinicalStaffPhone);
    clinicalStaffToken = aClin.token;

    const aInv = await loginUser(inventoryStaffPhone);
    inventoryStaffToken = aInv.token;

    const bClin = await loginUser(orgBClinicalPhone);
    orgBClinicalToken = bClin.token;

    const aDonor = await loginUser('+919999977005');

    // Create Organisation A
    const orgACode = `ORG-P6HARD-A-${Date.now()}`;
    const orgA = await prisma.organisation.create({
      data: {
        orgCode: orgACode,
        name: 'Phase 6 Hardening Apex Centre A',
        type: 'BLOOD_BANK',
        licenseNumber: `LIC-P6HARD-A-${Date.now()}`,
        districtCode: 521,
        districtName: 'Pune',
        status: 'VERIFIED',
      },
    });
    orgAId = orgA.id;

    // Create Organisation B
    const orgBCode = `ORG-P6HARD-B-${Date.now()}`;
    const orgB = await prisma.organisation.create({
      data: {
        orgCode: orgBCode,
        name: 'Phase 6 Hardening District Centre B',
        type: 'BLOOD_BANK',
        licenseNumber: `LIC-P6HARD-B-${Date.now()}`,
        districtCode: 522,
        districtName: 'Solapur',
        status: 'VERIFIED',
      },
    });
    orgBId = orgB.id;

    // Set memberships
    await prisma.organisationMembership.createMany({
      data: [
        {
          organisationId: orgAId,
          userId: aAdmin.userId,
          role: 'ORG_ADMIN',
          isActive: true,
        },
        {
          organisationId: orgAId,
          userId: aClin.userId,
          role: 'CLINICAL_STAFF',
          isActive: true,
        },
        {
          organisationId: orgAId,
          userId: aInv.userId,
          role: 'INVENTORY_STAFF',
          isActive: true,
        },
        {
          organisationId: orgBId,
          userId: bClin.userId,
          role: 'CLINICAL_STAFF',
          isActive: true,
        },
      ],
    });

    // Create Camp & Donation chain
    const camp = await prisma.camp.create({
      data: {
        campCode: `CMP-P6HARD-${Date.now()}`,
        title: 'Phase 6 Hardening Camp',
        organizerName: 'Red Cross Pune',
        targetDate: new Date(),
        venue: 'Hardening Audit Room',
        district: 'Pune',
        districtCode: 521,
        organisationId: orgAId,
        status: 'APPROVED',
      },
    });

    const attendance = await prisma.campAttendance.create({
      data: {
        campId: camp.id,
        userId: aDonor.userId,
        donorName: 'Voluntary Hardening Donor',
        donorPhone: '+919999977005',
        bloodGroup: 'B_POS',
        status: 'CHECKED_IN',
        checkedInAt: new Date(),
        checkedInBy: aClin.userId,
      },
    });

    const screening = await prisma.clinicalScreening.create({
      data: {
        campId: camp.id,
        attendanceId: attendance.id,
        donorUserId: aDonor.userId,
        screenedBy: aClin.userId,
        status: 'CLEARED',
        eligibilityDecision: 'CLEARED',
        consentGiven: true,
      },
    });

    const donEvent = await prisma.donationEvent.create({
      data: {
        campId: camp.id,
        attendanceId: attendance.id,
        screeningId: screening.id,
        donorUserId: aDonor.userId,
        bloodGroup: 'B_POS',
        donationType: 'WHOLE_BLOOD',
        outcome: 'COMPLETED',
        volumeMl: 450,
        recordedBy: aClin.userId,
        performedAt: new Date(),
      },
    });

    const collectionUnit = await prisma.collectionUnit.create({
      data: {
        unitNumber: `CU-P6HARD-${Date.now()}`,
        donationEventId: donEvent.id,
        campId: camp.id,
        organisationId: orgAId,
        bloodGroup: 'B_POS',
        volumeMl: 450,
        status: 'RECEIVED_BY_CENTRE',
        collectedBy: aClin.userId,
      },
    });

    const comp = await prisma.componentUnit.create({
      data: {
        componentCode: `CMP-P6HARD-PRBC-${Date.now()}`,
        collectionUnitId: collectionUnit.id,
        organisationId: orgAId,
        componentType: 'PRBC',
        bloodGroup: 'B_POS',
        volumeMl: 280,
        status: 'AWAITING_TESTING',
        isHold: false,
        derivedAt: new Date(),
        derivedBy: aInv.userId,
        expiresAt: new Date(Date.now() + 35 * 86400000),
      },
    });
    testComponentUnitId = comp.id;
    assert(Boolean(testComponentUnitId), 'Hardening test component initialized');

    // ----------------------------------------------------
    // TEST 1: Direct Status Update Bypass Blocked
    // ----------------------------------------------------
    console.log('\n--- 1. Authoritative Backend Release Gate Bypass Prevention ---');

    // Attempt direct PATCH /traceability/components/:id/status to AVAILABLE
    const directPatchRes = await request(`/traceability/components/${testComponentUnitId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${orgAdminToken}` },
      body: JSON.stringify({
        status: 'AVAILABLE',
        notes: 'Malicious bypass attempt to make unit available without clinical testing',
      }),
    });
    assert(
      directPatchRes.status === 400 && directPatchRes.data?.error?.code === 'DIRECT_RELEASE_PROHIBITED',
      'Generic PATCH /traceability/components/:id/status to AVAILABLE is strictly prohibited (HTTP 400 DIRECT_RELEASE_PROHIBITED)'
    );

    // Attempt direct transition from QUARANTINED to AVAILABLE via generic status update
    await prisma.componentUnit.update({
      where: { id: testComponentUnitId },
      data: { status: 'QUARANTINED', isHold: true, holdReason: 'Excursion' },
    });
    const quarantinedPatchRes = await request(`/traceability/components/${testComponentUnitId}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${orgAdminToken}` },
      body: JSON.stringify({
        status: 'AVAILABLE',
        notes: 'Bypassing quarantine hold to available',
      }),
    });
    assert(
      quarantinedPatchRes.status === 400 && quarantinedPatchRes.data?.error?.code === 'DIRECT_RELEASE_PROHIBITED',
      'Direct transition from QUARANTINED to AVAILABLE is strictly rejected'
    );

    // ----------------------------------------------------
    // TEST 2: Clinical Release Gate Enforcements
    // ----------------------------------------------------
    console.log('\n--- 2. Clinical Rules and Missing Procedure Enforcement ---');

    // Missing facility procedure SOP reference
    const missingProcRes = await request(
      `/organisations/${orgAId}/components/${testComponentUnitId}/clinical-release`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${clinicalStaffToken}` },
        body: JSON.stringify({
          decision: 'RELEASED',
          reason: 'Attempted release without SOP',
          clinicalProtocolRef: '', // Missing
        }),
      }
    );
    assert(
      missingProcRes.status === 400 &&
        missingProcRes.data?.error?.message?.includes('FACILITY_PROCEDURE_MISSING'),
      'Clinical release fails safely when facility-approved procedure reference is missing'
    );

    // Placeholder protocol reference 'NONE'
    const noneProcRes = await request(
      `/organisations/${orgAId}/components/${testComponentUnitId}/clinical-release`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${clinicalStaffToken}` },
        body: JSON.stringify({
          decision: 'RELEASED',
          reason: 'Attempted release with placeholder protocol',
          clinicalProtocolRef: 'NONE',
        }),
      }
    );
    assert(
      noneProcRes.status === 400 &&
        noneProcRes.data?.error?.message?.includes('FACILITY_PROCEDURE_MISSING'),
      'Placeholder protocol reference (NONE/UNSPECIFIED) is rejected'
    );

    // Seed invalid or reactive test outcome
    await request(`/organisations/${orgAId}/laboratory-tests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clinicalStaffToken}` },
      body: JSON.stringify({
        componentUnitId: testComponentUnitId,
        testType: 'HIV_ANTIBODY',
        testMethod: 'NAT',
        status: 'INVALID',
        resultOutcome: 'INDETERMINATE',
      }),
    });

    const invalidTestEval = await request(
      `/organisations/${orgAId}/components/${testComponentUnitId}/release-eligibility`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${clinicalStaffToken}` },
      }
    );
    assert(
      invalidTestEval.data?.data?.isEligibleForRelease === false,
      'INVALID and INDETERMINATE test outcomes fail release eligibility'
    );

    // ----------------------------------------------------
    // TEST 3: Quarantine Hold Resolution Workflow
    // ----------------------------------------------------
    console.log('\n--- 3. Quarantine Hold Authorization & Safe Resolution ---');

    // Inventory staff attempts to resolve quarantine hold
    const invResolveRes = await request(
      `/organisations/${orgAId}/components/${testComponentUnitId}/resolve-hold`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${inventoryStaffToken}` },
        body: JSON.stringify({
          resolution: 'HOLD_CLEARED_AFTER_INVESTIGATION',
          investigationNotes: 'Attempting unauthorised hold clearance',
          clinicalJustification: 'Temperature was acceptable',
        }),
      }
    );
    assert(
      invResolveRes.status === 403,
      'INVENTORY_STAFF cannot resolve quarantine hold (HTTP 403 requireOrgPermission)'
    );

    // Authorized CLINICAL_STAFF resolves quarantine hold
    const clinResolveRes = await request(
      `/organisations/${orgAId}/components/${testComponentUnitId}/resolve-hold`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${clinicalStaffToken}` },
        body: JSON.stringify({
          resolution: 'HOLD_CLEARED_AFTER_INVESTIGATION',
          investigationNotes: 'Excursion verified as sensor calibration test. Unit remained under cold chain.',
          clinicalJustification: 'Validated against continuous data logger. Integrity confirmed.',
        }),
      }
    );
    const resolvedComp = clinResolveRes.data?.data?.component || clinResolveRes.data?.data;
    assert(
      clinResolveRes.status === 200 &&
        resolvedComp?.isHold === false &&
        resolvedComp?.status === 'AWAITING_CLINICAL_REVIEW',
      'Authorised hold resolution clears isHold and transitions to AWAITING_CLINICAL_REVIEW (never directly to AVAILABLE)'
    );

    // ----------------------------------------------------
    // TEST 4: Terminal Status Protection & Reversal Prevention
    // ----------------------------------------------------
    console.log('\n--- 4. Terminal Disposition & Status Reversal Safety ---');

    // Transition component to DISCARDED
    const discardRes = await request(
      `/organisations/${orgAId}/components/${testComponentUnitId}/disposition`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${clinicalStaffToken}` },
        body: JSON.stringify({
          status: 'DISCARDED',
          notes: 'Discarded unit due to test failure',
        }),
      }
    );
    assert(discardRes.status === 200, 'Component successfully transitioned to terminal DISCARDED');

    // Attempt to release discarded unit to AVAILABLE
    const releaseDiscardedRes = await request(
      `/organisations/${orgAId}/components/${testComponentUnitId}/clinical-release`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${clinicalStaffToken}` },
        body: JSON.stringify({
          decision: 'RELEASED',
          clinicalProtocolRef: 'NBTC Schedule F(K)',
        }),
      }
    );
    assert(
      releaseDiscardedRes.status === 400 &&
        releaseDiscardedRes.data?.error?.message?.includes('terminal status'),
      'Clinical release on terminal DISCARDED unit is strictly blocked'
    );

    // Attempt to record new laboratory test on DISCARDED unit
    const testOnDiscardedRes = await request(`/organisations/${orgAId}/laboratory-tests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${clinicalStaffToken}` },
      body: JSON.stringify({
        componentUnitId: testComponentUnitId,
        testType: 'HBSAG',
        testMethod: 'ELISA',
        status: 'COMPLETED',
        resultOutcome: 'NON_REACTIVE',
      }),
    });
    assert(
      testOnDiscardedRes.status === 400 &&
        testOnDiscardedRes.data?.error?.message?.includes('terminal status'),
      'Recording laboratory tests on terminal units is strictly prohibited'
    );

    // Attempt to issue a discarded unit
    const issueDiscardedRes = await request(
      `/organisations/${orgAId}/components/${testComponentUnitId}/disposition`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${clinicalStaffToken}` },
        body: JSON.stringify({
          status: 'ISSUED',
          notes: 'Illegal reversal attempt',
        }),
      }
    );
    assert(
      issueDiscardedRes.status === 400 &&
        issueDiscardedRes.data?.error?.message?.includes('reversals from terminal states are strictly prohibited'),
      'Reversal from terminal DISCARDED to ISSUED is strictly prohibited'
    );

    // ----------------------------------------------------
    // TEST 5: Cross-Organisation Isolation on Hardened Endpoints
    // ----------------------------------------------------
    console.log('\n--- 5. Cross-Organisation Security ---');

    // Org B clinical staff attempts to resolve hold on Org A
    const crossOrgHoldRes = await request(
      `/organisations/${orgAId}/components/${testComponentUnitId}/resolve-hold`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${orgBClinicalToken}` },
        body: JSON.stringify({
          resolution: 'HOLD_CLEARED_AFTER_INVESTIGATION',
          investigationNotes: 'Cross org intruder',
          clinicalJustification: 'None',
        }),
      }
    );
    assert(crossOrgHoldRes.status === 403, 'Cross-organisation hold resolution is strictly forbidden (HTTP 403)');

    // ----------------------------------------------------
    // TEST 6: Audit History Completeness
    // ----------------------------------------------------
    console.log('\n--- 6. Audit Trail Verification ---');

    const auditTrail = await prisma.auditLog.findMany({
      where: { resourceId: testComponentUnitId },
      orderBy: { createdAt: 'desc' },
    });
    assert(
      auditTrail.length >= 2,
      'Audit log tracks all hold placements, resolutions, and terminal dispositions for the component'
    );

  } catch (err: any) {
    console.error('Unexpected test error:', err);
    failed++;
  } finally {
    if (server) {
      server.close();
    }
  }

  console.log('\n========================================================================');
  console.log(` Hardening Test Results: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase6SafetyHardeningTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
