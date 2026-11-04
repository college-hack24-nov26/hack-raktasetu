import http from 'http';
import { app } from './app';
import { prisma } from './lib/prisma';
import { DonorRegistrationService } from './services/donorRegistrationService';

const PORT = 4099;
let server: http.Server;

async function request(
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: any;
  } = {}
): Promise<{ status: number; body: any }> {
  const res = await fetch(`http://127.0.0.1:${PORT}/api/v1${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n======================================================');
  console.log('  RaktaSetu — Bag Confirmation & Outcome Transition Tests');
  console.log('======================================================\n');

  server = app.listen(PORT);

  try {
    async function loginUser(phone: string) {
      const res = await request('/auth/demo-login', {
        method: 'POST',
        body: { phoneNumber: phone, otp: '123456' },
      });
      return {
        token: res.body?.data?.token,
        userId: res.body?.data?.user?.id,
      };
    }

    const orgAdminAuth = await loginUser('+919988770000');
    const colStaffAuth = await loginUser('+919988770001');
    const orgBStaffAuth = await loginUser('+919988770002');
    const donor1Auth = await loginUser('+919988770003');
    const donor2Auth = await loginUser('+919988770004');
    const donor3Auth = await loginUser('+919988770005');

    const testOrgA = await prisma.organisation.upsert({
      where: { orgCode: 'ORG-BAGCONF-A' },
      update: { status: 'VERIFIED' },
      create: {
        orgCode: 'ORG-BAGCONF-A',
        name: 'Bag Confirmation Blood Bank A',
        type: 'BLOOD_BANK',
        licenseNumber: 'LIC-BAGCONF-A',
        districtCode: 521,
        status: 'VERIFIED',
      },
    });

    const testOrgB = await prisma.organisation.upsert({
      where: { orgCode: 'ORG-BAGCONF-B' },
      update: { status: 'VERIFIED' },
      create: {
        orgCode: 'ORG-BAGCONF-B',
        name: 'Unrelated Hospital Bank B',
        type: 'BLOOD_BANK',
        licenseNumber: 'LIC-BAGCONF-B',
        districtCode: 521,
        status: 'VERIFIED',
      },
    });

    await prisma.organisationMembership.upsert({
      where: { userId_organisationId: { userId: orgAdminAuth.userId, organisationId: testOrgA.id } },
      update: { role: 'ORG_ADMIN', isActive: true },
      create: { userId: orgAdminAuth.userId, organisationId: testOrgA.id, role: 'ORG_ADMIN', isActive: true },
    });

    await prisma.organisationMembership.upsert({
      where: { userId_organisationId: { userId: colStaffAuth.userId, organisationId: testOrgA.id } },
      update: { role: 'COLLECTION_STAFF', isActive: true },
      create: { userId: colStaffAuth.userId, organisationId: testOrgA.id, role: 'COLLECTION_STAFF', isActive: true },
    });

    await prisma.organisationMembership.upsert({
      where: { userId_organisationId: { userId: orgBStaffAuth.userId, organisationId: testOrgB.id } },
      update: { role: 'COLLECTION_STAFF', isActive: true },
      create: { userId: orgBStaffAuth.userId, organisationId: testOrgB.id, role: 'COLLECTION_STAFF', isActive: true },
    });

    const camp = await prisma.camp.create({
      data: {
        campCode: `CAMP-CONF-${Date.now()}`,
        title: 'Collection Confirmation Drive',
        organizerName: 'RaktaSetu Blood Drive',
        targetDate: new Date('2026-12-01T09:00:00Z'),
        venue: 'Pune Camp Site',
        districtCode: 521,
        organisationId: testOrgA.id,
        status: 'APPROVED',
        isReadyForCollection: true,
      },
    });

    // Attendances and clinical screenings
    const att1 = await prisma.campAttendance.create({
      data: {
        campId: camp.id,
        userId: donor1Auth.userId,
        donorName: 'Donor Completed Event',
        donorPhone: '+919988770003',
        bloodGroup: 'O_POS',
        status: 'CHECKED_IN',
        checkedInAt: new Date(),
      },
    });

    const scr1 = await prisma.clinicalScreening.create({
      data: {
        campId: camp.id,
        attendanceId: att1.id,
        donorUserId: donor1Auth.userId,
        screenedBy: colStaffAuth.userId,
        status: 'CLEARED',
        eligibilityDecision: 'CLEARED',
        consentGiven: true,
      },
    });

    const att2 = await prisma.campAttendance.create({
      data: {
        campId: camp.id,
        userId: donor2Auth.userId,
        donorName: 'Donor Not Performed',
        donorPhone: '+919988770004',
        bloodGroup: 'A_POS',
        status: 'CHECKED_IN',
        checkedInAt: new Date(),
      },
    });

    const scr2 = await prisma.clinicalScreening.create({
      data: {
        campId: camp.id,
        attendanceId: att2.id,
        donorUserId: donor2Auth.userId,
        screenedBy: colStaffAuth.userId,
        status: 'CLEARED',
        eligibilityDecision: 'CLEARED',
        consentGiven: true,
      },
    });

    const att3 = await prisma.campAttendance.create({
      data: {
        campId: camp.id,
        userId: donor3Auth.userId,
        donorName: 'Donor Transition Test',
        donorPhone: '+919988770005',
        bloodGroup: 'B_POS',
        status: 'CHECKED_IN',
        checkedInAt: new Date(),
      },
    });

    const scr3 = await prisma.clinicalScreening.create({
      data: {
        campId: camp.id,
        attendanceId: att3.id,
        donorUserId: donor3Auth.userId,
        screenedBy: colStaffAuth.userId,
        status: 'CLEARED',
        eligibilityDecision: 'CLEARED',
        consentGiven: true,
      },
    });

    // Events
    const completedEvent = await prisma.donationEvent.create({
      data: {
        campId: camp.id,
        attendanceId: att1.id,
        screeningId: scr1.id,
        donorUserId: donor1Auth.userId,
        bloodGroup: 'O_POS',
        donationType: 'WHOLE_BLOOD',
        outcome: 'COMPLETED',
        volumeMl: 450,
        recordedBy: colStaffAuth.userId,
      },
    });

    const notPerformedEvent = await prisma.donationEvent.create({
      data: {
        campId: camp.id,
        attendanceId: att2.id,
        screeningId: scr2.id,
        donorUserId: donor2Auth.userId,
        bloodGroup: 'A_POS',
        donationType: 'WHOLE_BLOOD',
        outcome: 'NOT_PERFORMED',
        volumeMl: 0,
        recordedBy: colStaffAuth.userId,
      },
    });

    const transitionEvent = await prisma.donationEvent.create({
      data: {
        campId: camp.id,
        attendanceId: att3.id,
        screeningId: scr3.id,
        donorUserId: donor3Auth.userId,
        bloodGroup: 'B_POS',
        donationType: 'WHOLE_BLOOD',
        outcome: 'NOT_PERFORMED',
        volumeMl: 0,
        recordedBy: colStaffAuth.userId,
      },
    });

    console.log('--- TEST GROUP 1: Physical Unit Confirmation Safety & Rejections ---');

    // TEST 1: NOT_PERFORMED donation rejection
    const notPerfRes = await request('/traceability/collection-units', {
      method: 'POST',
      token: colStaffAuth.token,
      body: {
        donationEventId: notPerformedEvent.id,
        volumeMl: 450,
      },
    });
    assert(notPerfRes.status === 400, 'NOT_PERFORMED confirmation is rejected with HTTP 400');
    assert(
      notPerfRes.body.error?.message?.includes('NOT_PERFORMED') &&
      notPerfRes.body.error?.message?.includes('Only COMPLETED donations produce physical units'),
      'Rejection specifies only COMPLETED donations produce physical units'
    );
    const unitsForNotPerf = await prisma.collectionUnit.findMany({
      where: { donationEventId: notPerformedEvent.id },
    });
    assert(unitsForNotPerf.length === 0, 'No physical unit created for NOT_PERFORMED donation');

    // TEST 2: Missing donationEventId
    const missingIdRes = await request('/traceability/collection-units', {
      method: 'POST',
      token: colStaffAuth.token,
      body: {
        volumeMl: 450,
      },
    });
    assert(missingIdRes.status === 400, 'Missing donationEventId fails safely with HTTP 400');
    assert(missingIdRes.body.error?.code === 'MISSING_EVENT_ID', 'Error code is MISSING_EVENT_ID');

    // TEST 3: Non-existent donationEventId
    const fakeIdRes = await request('/traceability/collection-units', {
      method: 'POST',
      token: colStaffAuth.token,
      body: {
        donationEventId: '00000000-0000-0000-0000-000000000000',
        volumeMl: 450,
      },
    });
    assert(fakeIdRes.status === 400, 'Non-existent donationEventId rejected with HTTP 400');

    // TEST 4: Unauthorized cross-organisation staff access
    const crossOrgRes = await request('/traceability/collection-units', {
      method: 'POST',
      token: orgBStaffAuth.token,
      body: {
        donationEventId: completedEvent.id,
        volumeMl: 450,
      },
    });
    assert(crossOrgRes.status === 403, 'Cross-organisation staff access is forbidden with HTTP 403');
    assert(crossOrgRes.body.error?.code === 'FORBIDDEN', 'Error code is FORBIDDEN');

    console.log('\n--- TEST GROUP 2: COMPLETED Donation Lifecycle & Idempotency ---');

    // TEST 5: COMPLETED donation with valid prerequisites registers collection unit
    const confirmRes = await request('/traceability/collection-units', {
      method: 'POST',
      token: colStaffAuth.token,
      body: {
        donationEventId: completedEvent.id,
        volumeMl: 450,
        notes: 'Camp collection standard whole blood bag',
      },
    });
    assert(confirmRes.status === 201, 'COMPLETED donation bag confirmation returns HTTP 201');
    assert(confirmRes.body.data?.unitNumber?.startsWith('CU-'), 'Collection unit number generated with CU- prefix');
    assert(confirmRes.body.data?.status === 'COLLECTED', 'Collection unit initial status is COLLECTED');

    // TEST 6: Idempotent duplicate confirmation rejection
    const dupRes = await request('/traceability/collection-units', {
      method: 'POST',
      token: colStaffAuth.token,
      body: {
        donationEventId: completedEvent.id,
        volumeMl: 450,
      },
    });
    assert(dupRes.status === 409, 'Duplicate bag confirmation is rejected with HTTP 409 Conflict');
    assert(dupRes.body.error?.code === 'DUPLICATE_COLLECTION_UNIT', 'Rejection code is DUPLICATE_COLLECTION_UNIT');
    const unitsForCompleted = await prisma.collectionUnit.findMany({
      where: { donationEventId: completedEvent.id },
    });
    assert(unitsForCompleted.length === 1, 'Strict 1:1 invariant preserved: exactly one physical unit exists');

    console.log('\n--- TEST GROUP 3: Legitimate Outcome Transition Workflow ---');

    // TEST 7: Transitioning NOT_PERFORMED donation to COMPLETED by authorized collection staff
    const recordDonationRes = await request(`/camps/${camp.id}/attendance/${att3.id}/donation`, {
      method: 'POST',
      token: colStaffAuth.token,
      body: {
        bloodGroup: 'B_POS',
        outcome: 'COMPLETED',
        volumeMl: 450,
        adverseReaction: false,
        notes: 'Phlebotomy completed uneventfully after initial delay',
      },
    });
    assert(recordDonationRes.status === 201, 'Legitimate transition of NOT_PERFORMED to COMPLETED succeeds with HTTP 201');

    const updatedEvent = await prisma.donationEvent.findUnique({
      where: { id: transitionEvent.id },
    });
    assert(updatedEvent?.outcome === 'COMPLETED', 'DonationEvent outcome transitioned to COMPLETED in database');

    // TEST 8: Newly COMPLETED donation can now legitimately confirm collection unit
    const confirmTransitionedRes = await request('/traceability/collection-units', {
      method: 'POST',
      token: colStaffAuth.token,
      body: {
        donationEventId: transitionEvent.id,
        volumeMl: 450,
      },
    });
    assert(confirmTransitionedRes.status === 201, 'Transitioned donation unit confirmed with HTTP 201');
    assert(confirmTransitionedRes.body.data?.unitNumber?.startsWith('CU-'), 'Unit number assigned to transitioned donation');

    // TEST 9: Duplicate recording on donation with confirmed unit is rejected
    const reOverwriteRes = await request(`/camps/${camp.id}/attendance/${att3.id}/donation`, {
      method: 'POST',
      token: colStaffAuth.token,
      body: {
        bloodGroup: 'B_POS',
        outcome: 'COMPLETED',
        volumeMl: 450,
      },
    });
    assert(reOverwriteRes.status === 400, 'Duplicate recording on donation with confirmed unit is rejected with HTTP 400');

    console.log('\n--- TEST GROUP 4: Registration Sync & Premature Unit Prevention ---');

    // TEST 10: Saving registration with NOT_COLLECTED does not create premature barcode or collection unit
    const draftStep3Res = await request('/donor-registration/save', {
      method: 'POST',
      token: orgAdminAuth.token,
      body: {
        donorDetails: {
          fullName: 'Uncollected Draft Donor',
          primaryMobile: '9123456780',
          gender: 'Male',
          dateOfBirth: '2000-01-01',
          bloodGroup: 'O_POS',
        },
        currentStep: 3,
        campId: camp.id,
        organisationId: testOrgA.id,
        screening: {
          status: 'FIT',
          weightKg: 70,
          hemoglobin: 14.5,
          bloodGroup: 'O_POS',
        },
      },
    });
    const draftRegId = draftStep3Res.body?.data?.id;
    assert(draftStep3Res.status === 200, 'Screening clearance saved for draft donor');

    const draftStep4Res = await request('/donor-registration/save', {
      method: 'POST',
      token: colStaffAuth.token,
      body: {
        registrationId: draftRegId,
        campId: camp.id,
        organisationId: testOrgA.id,
        currentStep: 4,
        collection: {
          status: 'NOT_COLLECTED',
          bagType: 'SB-350',
          volumeMl: 350,
        },
      },
    });
    assert(draftStep4Res.status === 200, 'Step 4 collection draft saved with NOT_COLLECTED');
    const savedDraft = draftStep4Res.body?.data;
    assert(savedDraft?.collection?.status === 'NOT_COLLECTED', 'Draft collection status is NOT_COLLECTED');
    assert(!savedDraft?.collection?.unitNumber, 'No premature unit number generated for NOT_COLLECTED donation');
    assert(!savedDraft?.collection?.barcode, 'No premature barcode generated for NOT_COLLECTED donation');

    console.log('\n--- TEST GROUP 5: Rahul Yadav Repaired State & Bag Confirmation ---');

    // TEST 11: Rahul Yadav record verification in DB
    const rahulAttendance = await prisma.campAttendance.findFirst({
      where: { donorName: { contains: 'Rahul Yadav', mode: 'insensitive' } },
      include: {
        donationEvent: {
          include: {
            collectionUnit: true,
          },
        },
      },
    });
    assert(rahulAttendance !== null, 'Rahul Yadav attendance record verified in database');
    assert(rahulAttendance?.donationEvent?.outcome === 'COMPLETED', 'Rahul Yadav donation event outcome is COMPLETED');

    // TEST 12: Bag confirmation for Rahul Yadav now proceeds legitimately
    if (rahulAttendance?.donationEvent && !rahulAttendance.donationEvent.collectionUnit) {
      const campRecord = await prisma.camp.findUnique({
        where: { id: rahulAttendance.campId },
      });
      if (campRecord && campRecord.organisationId) {
        await prisma.organisationMembership.upsert({
          where: { userId_organisationId: { userId: colStaffAuth.userId, organisationId: campRecord.organisationId } },
          update: { role: 'COLLECTION_STAFF', isActive: true },
          create: { userId: colStaffAuth.userId, organisationId: campRecord.organisationId, role: 'COLLECTION_STAFF', isActive: true },
        });
      }

      const rahulConfirmRes = await request('/traceability/collection-units', {
        method: 'POST',
        token: colStaffAuth.token,
        body: {
          donationEventId: rahulAttendance.donationEvent.id,
          volumeMl: rahulAttendance.donationEvent.volumeMl || 350,
          notes: 'Standard collection unit confirmed on camp site',
        },
      });
      assert(rahulConfirmRes.status === 201, 'Rahul Yadav collection unit confirmed successfully with HTTP 201');
      assert(rahulConfirmRes.body.data?.unitNumber?.startsWith('CU-'), `Rahul Yadav collection unit registered with unit number: ${rahulConfirmRes.body.data?.unitNumber}`);
    } else {
      assert(rahulAttendance?.donationEvent?.collectionUnit !== null, 'Rahul Yadav collection unit is already confirmed');
    }

    console.log('\n======================================================');
    console.log(`  Tests Completed: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  } finally {
    if (server) {
      server.close();
    }
    await prisma.$disconnect();
  }
}

runTests();
