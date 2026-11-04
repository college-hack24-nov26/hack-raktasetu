import { app } from './app';
import { prisma } from './lib/prisma';
import crypto from 'crypto';

const PORT = 4062;
const BASE_URL = `http://localhost:${PORT}/api/v1`;

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
    body: options.body,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  return { status: res.status, ok: res.ok, data, headers: res.headers };
}

async function runRealtimeMetricsTestSuite() {
  console.log('========================================================================');
  console.log('  RaktaSetu — Real-Time Collection & Metrics Verification Suite');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(
        `[FAIL] ${testName}${
          detail !== undefined ? ` -> ${typeof detail === 'object' ? JSON.stringify(detail) : detail}` : ''
        }`
      );
      failed++;
    }
  }

  const server = app.listen(PORT);

  try {
    const testRand = Math.floor(100000 + Math.random() * 900000);

    async function loginOrCreate(phone: string, name: string) {
      const res = await request('/auth/demo-login', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber: phone, otp: '123456' }),
      });
      if (res.data?.data?.user?.id && name) {
        await prisma.user.update({
          where: { id: res.data.data.user.id },
          data: { name },
        });
        res.data.data.user.name = name;
      }
      return { token: res.data?.data?.token, user: res.data?.data?.user };
    }

    const coordPhone = `+9198${testRand}01`;
    const clinicalPhone = `+9198${testRand}02`;
    const collectionPhone = `+9198${testRand}03`;
    const orgBPhone = `+9198${testRand}11`;

    const coordinatorUser = await loginOrCreate(coordPhone, `Coordinator ${testRand}`);
    const clinicalUser = await loginOrCreate(clinicalPhone, `Dr Clinical ${testRand}`);
    const collectionUser = await loginOrCreate(collectionPhone, `Phleb Collection ${testRand}`);
    const orgBUser = await loginOrCreate(orgBPhone, `Org B User ${testRand}`);

    const org = await prisma.organisation.create({
      data: {
        orgCode: `ORG-A-${testRand}`,
        name: `Realtime Test Org ${testRand}`,
        licenseNumber: `LIC-A-${testRand}`,
        districtCode: 521,
        stateCode: 27,
        status: 'VERIFIED',
      },
    });

    const orgB = await prisma.organisation.create({
      data: {
        orgCode: `ORG-B-${testRand}`,
        name: `Realtime Test Org B ${testRand}`,
        licenseNumber: `LIC-B-${testRand}`,
        districtCode: 522,
        stateCode: 27,
        status: 'VERIFIED',
      },
    });

    await prisma.organisationMembership.createMany({
      data: [
        { userId: coordinatorUser.user.id, organisationId: org.id, role: 'CLINICAL_STAFF', isActive: true },
        { userId: clinicalUser.user.id, organisationId: org.id, role: 'CLINICAL_STAFF', isActive: true },
        { userId: collectionUser.user.id, organisationId: org.id, role: 'CLINICAL_STAFF', isActive: true },
        { userId: orgBUser.user.id, organisationId: orgB.id, role: 'CLINICAL_STAFF', isActive: true },
      ],
    });

    const camp = await prisma.camp.create({
      data: {
        campCode: `CAMP-RT-${testRand}`,
        title: `Realtime Verification Camp ${testRand}`,
        organizerName: 'Pune Medical Foundation',
        targetDate: new Date(Date.now() + 86400000),
        venue: 'Pune Medical Grounds',
        district: 'Pune',
        districtCode: 521,
        expectedDonors: 100,
        status: 'APPROVED',
        organisation: { connect: { id: org.id } },
        isReadyForCollection: true,
      },
    });

    await prisma.campStaffAssignment.createMany({
      data: [
        { campId: camp.id, userId: coordinatorUser.user.id, role: 'CAMP_COORDINATOR', organisationId: org.id, assignedBy: coordinatorUser.user.id },
        { campId: camp.id, userId: clinicalUser.user.id, role: 'CLINICAL_STAFF', organisationId: org.id, assignedBy: coordinatorUser.user.id },
        { campId: camp.id, userId: collectionUser.user.id, role: 'COLLECTION_STAFF', organisationId: org.id, assignedBy: coordinatorUser.user.id },
      ],
    });

    const coordToken = coordinatorUser.token;
    const clinicalToken = clinicalUser.token;
    const collectionToken = collectionUser.token;
    const orgBToken = orgBUser.token;

    // Initial Analytics verification
    const initialAnalyticsRes = await request(`/camps/${camp.id}/analytics`, { token: collectionToken });
    assert(initialAnalyticsRes.status === 200, 'Initial camp analytics endpoint accessible');
    const initMetrics = initialAnalyticsRes.data?.data || initialAnalyticsRes.data;
    assert(initMetrics.registeredDonors === 0, 'Initial registered donors is 0', initMetrics.registeredDonors);
    assert(initMetrics.completedDonations === 0, 'Initial completed donations is 0', initMetrics.completedDonations);
    assert(initMetrics.totalVolumeMl === 0, 'Initial volume is 0 ml', initMetrics.totalVolumeMl);
    assert(initMetrics.totalConfirmedUnits === 0, 'Initial confirmed units is 0', initMetrics.totalConfirmedUnits);

    // Step 1: Register Donor
    const regPhone = `${Math.floor(6000000000 + Math.random() * 3999999999)}`;
    const step1Res = await request('/donor-registration/save', {
      method: 'POST',
      token: coordToken,
      body: JSON.stringify({
        campId: camp.id,
        organisationId: org.id,
        currentStep: 1,
        donorDetails: {
          fullName: 'Aarav Sharma',
          gender: 'MALE',
          dob: '1995-05-15',
          bloodGroup: 'B_POSITIVE',
          primaryMobile: regPhone,
          permanentAddress: '123 Sinhagad Road',
          permanentState: 'Maharashtra',
          permanentStateCode: 'MH',
          permanentDistrict: 'Pune',
          permanentDistrictCode: '2701',
          permanentCity: 'Pune',
          permanentPinCode: '411030',
        },
      }),
    });
    assert(step1Res.status === 200, 'Step 1: Coordinator registers donor successfully');
    const registrationId = step1Res.data?.data?.registration?.id || step1Res.data?.data?.id;
    assert(Boolean(registrationId), 'Registration ID generated');

    // Check intermediate metrics after Step 1
    const postStep1Analytics = await request(`/camps/${camp.id}/analytics`, { token: collectionToken });
    const metrics1 = postStep1Analytics.data?.data || postStep1Analytics.data;
    assert(metrics1.registeredDonors === 1, 'Metrics: registeredDonors incremented to 1', metrics1.registeredDonors);
    assert(metrics1.checkedIn === 1, 'Metrics: checkedIn is 1', metrics1.checkedIn);
    assert(metrics1.clinicallyCleared === 0, 'Metrics: clinicallyCleared remains 0', metrics1.clinicallyCleared);
    assert(metrics1.completedDonations === 0, 'Metrics: completedDonations remains 0', metrics1.completedDonations);

    // Step 2: Clinical Counselling
    const step2Res = await request('/donor-registration/save', {
      method: 'POST',
      token: clinicalToken,
      body: JSON.stringify({
        registrationId,
        campId: camp.id,
        organisationId: org.id,
        currentStep: 2,
        counsellingStatus: 'REVIEWED_APPROVED',
        counsellingRemarks: 'Reviewed and eligible for screening',
        counsellingReviewedById: clinicalUser.user.id,
      }),
    });
    assert(step2Res.status === 200, 'Step 2: Clinical staff completes counselling evaluation');

    // Step 3: Screening with FIT decision
    const step3Res = await request('/donor-registration/save', {
      method: 'POST',
      token: clinicalToken,
      body: JSON.stringify({
        registrationId,
        campId: camp.id,
        organisationId: org.id,
        currentStep: 3,
        screening: {
          status: 'FIT',
          weightKg: 68,
          hemoglobin: 14.5,
          bloodGroup: 'B_POSITIVE',
          systolicBp: 120,
          diastolicBp: 80,
          pulseBpm: 72,
          temperatureCelsius: 36.8,
          screenedById: clinicalUser.user.id,
          medicalOfficerId: clinicalUser.user.id,
        },
      }),
    });
    assert(step3Res.status === 200, 'Step 3: Clinical staff records screening FIT clearance');

    // Check intermediate metrics after Step 3
    const postStep3Analytics = await request(`/camps/${camp.id}/analytics`, { token: collectionToken });
    const metrics3 = postStep3Analytics.data?.data || postStep3Analytics.data;
    assert(metrics3.clinicallyCleared === 1, 'Metrics: clinicallyCleared incremented to 1', metrics3.clinicallyCleared);
    assert(metrics3.completedDonations === 0, 'Metrics: completedDonations is still 0 before collection', metrics3.completedDonations);

    // Step 4: Collection Staff records Completed Collection
    const customUnitNumber = `CU-${testRand}-001`;
    const customBarcode = `*RSB${testRand}*`;
    const step4Res = await request('/donor-registration/save', {
      method: 'POST',
      token: collectionToken,
      body: JSON.stringify({
        registrationId,
        campId: camp.id,
        organisationId: org.id,
        currentStep: 4,
        collection: {
          status: 'COLLECTED',
          bagType: 'DB-450',
          volumeMl: 450,
          unitNumber: customUnitNumber,
          barcode: customBarcode,
          manufacturer: 'Terumo Penpol',
          lotNumber: 'LOT-9988',
          segmentNumber: 'SEG-1234',
        },
      }),
    });
    assert(step4Res.status === 200, 'Step 4: Collection staff saves collection outcome');
    const step4Data = step4Res.data?.data;
    const finalWorkflowStatus = step4Data?.workflowStatus || step4Data?.registration?.workflow_status || step4Data?.workflow_status;
    assert(finalWorkflowStatus === 'COLLECTION_COMPLETED', 'Registration workflowStatus is COLLECTION_COMPLETED', finalWorkflowStatus);
    assert(Boolean(step4Data?.campMetrics), 'Authoritative updated campMetrics returned directly in save response');
    assert(step4Data?.campMetrics?.completedDonations === 1, 'Fresh campMetrics reflects 1 completed donation', step4Data?.campMetrics?.completedDonations);
    assert(step4Data?.campMetrics?.totalVolumeMl === 450, 'Fresh campMetrics reflects 450 ml volume', step4Data?.campMetrics?.totalVolumeMl);
    assert(step4Data?.campMetrics?.totalConfirmedUnits === 1, 'Fresh campMetrics reflects 1 confirmed unit', step4Data?.campMetrics?.totalConfirmedUnits);

    // Verify Authoritative Database Records Created & Synchronized
    const dbAttendance = await prisma.campAttendance.findFirst({
      where: { campId: camp.id, donorPhone: regPhone.slice(-10) },
      include: { screening: true, donationEvent: { include: { collectionUnit: true } } },
    });
    assert(Boolean(dbAttendance), 'Authoritative CampAttendance record exists in DB');
    assert(dbAttendance?.status === 'CHECKED_IN', 'CampAttendance status is CHECKED_IN');
    assert(dbAttendance?.screening?.status === 'CLEARED', 'ClinicalScreening synchronized with status CLEARED');
    assert(Boolean(dbAttendance?.donationEvent), 'DonationEvent record created and linked');
    assert(dbAttendance?.donationEvent?.outcome === 'COMPLETED', 'DonationEvent outcome is COMPLETED', dbAttendance?.donationEvent?.outcome);
    assert(dbAttendance?.donationEvent?.volumeMl === 450, 'DonationEvent volumeMl is 450');
    assert(Boolean(dbAttendance?.donationEvent?.collectionUnit), 'CollectionUnit record created and linked');
    assert(dbAttendance?.donationEvent?.collectionUnit?.unitNumber === customUnitNumber, 'CollectionUnit unitNumber matches');
    assert(dbAttendance?.donationEvent?.collectionUnit?.bagIdentifier === customBarcode, 'CollectionUnit bagIdentifier matches barcode');

    // Verify Outbox Events Published
    const outboxEvents = await prisma.outboxEvent.findMany({
      where: { organisationId: org.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const eventTypes = outboxEvents.map((e) => e.eventType);
    assert(eventTypes.includes('camp.donation_completed'), 'Outbox event camp.donation_completed published', eventTypes);
    assert(eventTypes.includes('camp.collection_unit_confirmed'), 'Outbox event camp.collection_unit_confirmed published', eventTypes);
    assert(eventTypes.includes('donor.eligibility_updated'), 'Outbox event donor.eligibility_updated published', eventTypes);

    // Verify Dashboard Analytics Re-fetch (Authoritative Aggregations)
    const finalAnalyticsRes = await request(`/camps/${camp.id}/analytics`, { token: collectionToken });
    const finalMetrics = finalAnalyticsRes.data?.data || finalAnalyticsRes.data;
    assert(finalMetrics.completedDonations === 1, 'Final metrics: completedDonations is 1');
    assert(finalMetrics.totalVolumeMl === 450, 'Final metrics: totalVolumeMl is 450');
    assert(finalMetrics.totalVolumeLiters === 0.45, 'Final metrics: totalVolumeLiters converted to 0.45 L', finalMetrics.totalVolumeLiters);
    assert(finalMetrics.totalConfirmedUnits === 1, 'Final metrics: totalConfirmedUnits is 1');
    assert(finalMetrics.targetDonations === 100, 'Final metrics: targetDonations is 100');
    assert(finalMetrics.targetProgressPercent === 1, 'Final metrics: targetProgressPercent is 1%');
    assert(finalMetrics.bloodGroupBreakdown['B_POS'] === 1, 'Blood group breakdown contains 1 B_POS unit', finalMetrics.bloodGroupBreakdown);

    // Verify Incomplete Collection does NOT count towards completed donations
    const donor2Phone = `${Math.floor(6000000000 + Math.random() * 3999999999)}`;
    const donor2Reg = await request('/donor-registration/save', {
      method: 'POST',
      token: coordToken,
      body: JSON.stringify({
        campId: camp.id,
        organisationId: org.id,
        currentStep: 1,
        donorDetails: {
          fullName: 'Pooja Patil',
          gender: 'FEMALE',
          dob: '1998-03-22',
          bloodGroup: 'O_POSITIVE',
          primaryMobile: donor2Phone,
          permanentAddress: 'FC Road',
          permanentState: 'Maharashtra',
          permanentStateCode: 'MH',
          permanentDistrict: 'Pune',
          permanentDistrictCode: '2701',
          permanentCity: 'Pune',
          permanentPinCode: '411004',
        },
      }),
    });
    const donor2RegId = donor2Reg.data?.data?.registration?.id || donor2Reg.data?.data?.id;

    await request('/donor-registration/save', {
      method: 'POST',
      token: clinicalToken,
      body: JSON.stringify({
        registrationId: donor2RegId,
        campId: camp.id,
        organisationId: org.id,
        currentStep: 2,
        counsellingStatus: 'REVIEWED_APPROVED',
      }),
    });

    await request('/donor-registration/save', {
      method: 'POST',
      token: clinicalToken,
      body: JSON.stringify({
        registrationId: donor2RegId,
        campId: camp.id,
        organisationId: org.id,
        currentStep: 3,
        screening: {
          status: 'FIT',
          weightKg: 55,
          hemoglobin: 13.0,
          bloodGroup: 'O_POSITIVE',
          screenedById: clinicalUser.user.id,
          medicalOfficerId: clinicalUser.user.id,
        },
      }),
    });

    // Incomplete collection recorded
    const donor2Coll = await request('/donor-registration/save', {
      method: 'POST',
      token: collectionToken,
      body: JSON.stringify({
        registrationId: donor2RegId,
        campId: camp.id,
        organisationId: org.id,
        currentStep: 4,
        collection: {
          status: 'INCOMPLETE_COLLECTION',
          bagType: 'SB-350',
          volumeMl: 100,
          isLessQuantity: true,
          remarks: 'Vein collapsed after 100ml',
        },
      }),
    });
    assert(donor2Coll.status === 200, 'Step 4: Recorded incomplete collection');
    const donor2Analytics = await request(`/camps/${camp.id}/analytics`, { token: collectionToken });
    const metricsIncomplete = donor2Analytics.data?.data || donor2Analytics.data;
    assert(metricsIncomplete.completedDonations === 1, 'Incomplete collection does NOT increment completedDonations (still 1)', metricsIncomplete.completedDonations);
    assert(metricsIncomplete.totalConfirmedUnits === 1, 'Incomplete collection does NOT increment confirmedUnits (still 1)', metricsIncomplete.totalConfirmedUnits);

    // Multi-tenant isolation verification
    const orgBAnalytics = await request(`/camps/${camp.id}/analytics`, { token: orgBToken });
    assert(orgBAnalytics.status === 403 || orgBAnalytics.status === 404, 'Unauthorised Org B user cannot access Camp A analytics (403/404)', orgBAnalytics.status);

    const orgBRegAccess = await request(`/donor-registration/${registrationId}`, { token: orgBToken });
    assert(orgBRegAccess.status === 403 || orgBRegAccess.status === 404, 'Unauthorised Org B user cannot view Camp A donor registration (403/404)', orgBRegAccess.status);

    console.log('\n========================================================================');
    console.log(`  REALTIME METRICS SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================================================\n');
  } finally {
    server.close();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runRealtimeMetricsTestSuite().catch((err) => {
  console.error('Realtime metrics test execution failed:', err);
  process.exit(1);
});
