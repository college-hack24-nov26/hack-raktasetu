/**
 * RaktaSetu Comprehensive End-to-End Blood Fulfilment & Privacy Verification Suite
 */

import { prisma } from './lib/prisma';
import { BloodRequestCoordinationService } from './services/bloodRequestCoordination';
import { HospitalIntegrationService, parseRequestMessageMetadata } from './services/hospitalIntegration';
import { findMatchingDonorsForRequest, findEligibleRequestsForDonor } from './services/matching';

async function runVerification() {
  console.log('================================================================');
  console.log('🧪 RaktaSetu Master Product-Wide Blood Fulfilment Verification');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // Setup Test Data
    // -------------------------------------------------------------
    console.log('--- Phase 0: Test Fixtures & Organization Resolution ---');
    
    // 1. Find or create a test verified participating blood bank organisation
    const testOrgCode = 'ORG-TEST-FULFILL-01';
    const testHospitalCode = 'HOSP-TEST-FULFILL-01';
    
    // Ensure BloodCentre exists for foreign keys
    await prisma.bloodCentre.upsert({
      where: { hospitalCode: testHospitalCode },
      update: {
        hospitalName: 'Pune Model Blood Centre',
        address: '100 Swargate Road, Pune',
        mobileNo: '+912024445555',
        districtCode: 521,
        stateCode: 27,
      },
      create: {
        hospitalCode: testHospitalCode,
        hospitalName: 'Pune Model Blood Centre',
        address: '100 Swargate Road, Pune',
        mobileNo: '+912024445555',
        districtCode: 521,
        stateCode: 27,
      },
    });

    const testBloodBank = await prisma.organisation.upsert({
      where: { orgCode: testOrgCode },
      update: {
        hospitalCode: testHospitalCode,
        status: 'VERIFIED',
        districtCode: 521,
      },
      create: {
        orgCode: testOrgCode,
        hospitalCode: testHospitalCode,
        name: 'Pune Model Blood Centre',
        type: 'BLOOD_BANK',
        licenseNumber: 'MH-LIC-2026-9999',
        status: 'VERIFIED',
        stateCode: 27,
        districtCode: 521,
        address: '100 Swargate Road, Pune',
        phone: '+912024445555',
      },
    });

    assert(!!testBloodBank, 'Verified participating Blood Bank exists in DB');

    // 2. Test Patient/Requester Users
    const testRequester = await prisma.user.upsert({
      where: { phoneNumber: '+919999000001' },
      update: { status: 'ACTIVE', role: 'DONOR' },
      create: {
        phoneNumber: '+919999000001',
        name: 'Suresh Patil (Requester)',
        role: 'DONOR',
        status: 'ACTIVE',
      },
    });

    const testRequester2 = await prisma.user.upsert({
      where: { phoneNumber: '+919999000004' },
      update: { status: 'ACTIVE', role: 'DONOR' },
      create: {
        phoneNumber: '+919999000004',
        name: 'Mahesh Ghorpade (Requester 2)',
        role: 'DONOR',
        status: 'ACTIVE',
      },
    });

    // 3. Test Staff User for the Blood Bank
    const testStaff = await prisma.user.upsert({
      where: { phoneNumber: '+919999000002' },
      update: { status: 'ACTIVE', role: 'USER' },
      create: {
        phoneNumber: '+919999000002',
        name: 'Dr. Ramesh Kulkarni (Staff)',
        role: 'USER',
        status: 'ACTIVE',
      },
    });

    await prisma.organisationMembership.upsert({
      where: {
        userId_organisationId: {
          userId: testStaff.id,
          organisationId: testBloodBank.id,
        },
      },
      update: { role: 'INVENTORY_STAFF', isActive: true },
      create: {
        organisationId: testBloodBank.id,
        userId: testStaff.id,
        role: 'INVENTORY_STAFF',
        isActive: true,
      },
    });

    // 4. Test Voluntary Donor User & Profile
    const testDonorUser = await prisma.user.upsert({
      where: { phoneNumber: '+919999000003' },
      update: { status: 'ACTIVE', role: 'DONOR' },
      create: {
        phoneNumber: '+919999000003',
        name: 'Amit Deshmukh',
        role: 'DONOR',
        status: 'ACTIVE',
      },
    });

    const testDonorProfile = await prisma.donorProfile.upsert({
      where: { userId: testDonorUser.id },
      update: {
        fullName: 'Amit Deshmukh',
        bloodGroup: 'B_POS',
        districtCode: 521,
        isAvailable: true,
        isSearchable: true,
        consentWithdrawnAt: null,
      },
      create: {
        userId: testDonorUser.id,
        fullName: 'Amit Deshmukh',
        bloodGroup: 'B_POS',
        districtCode: 521,
        isAvailable: true,
        isSearchable: true,
        consentWithdrawnAt: null,
      },
    });

    assert(!!testDonorProfile, 'Active Voluntary Donor profile ready in District 521');

    // 5. Ensure Test Component Units exist in Blood Bank inventory with Clinical Release
    let cu = await prisma.collectionUnit.findFirst();
    if (!cu) {
      let camp = await prisma.camp.findFirst();
      if (!camp) {
        camp = await prisma.camp.create({
          data: {
            campCode: `CAMP-TEST-${Date.now()}`,
            title: 'Pune Community Blood Drive',
            venue: 'Pune Municipal Hall',
            organizerName: 'Red Cross Pune',
            district: 'Pune',
            districtCode: 521,
            targetDate: new Date(),
            organisationId: testBloodBank.id,
            status: 'APPROVED',
          },
        });
      }

      const att = await prisma.campAttendance.create({
        data: {
          campId: camp.id,
          userId: testDonorUser.id,
          donorName: 'Amit Deshmukh',
          donorPhone: '+919999000003',
          bloodGroup: 'B_POS',
          status: 'CHECKED_IN',
          checkedInAt: new Date(),
          checkedInBy: testStaff.id,
        },
      });

      const donEvent = await prisma.donationEvent.create({
        data: {
          campId: camp.id,
          attendanceId: att.id,
          donorUserId: testDonorUser.id,
          recordedBy: testStaff.id,
          outcome: 'COMPLETED',
          bloodGroup: 'B_POS',
          volumeMl: 450,
          donationType: 'WHOLE_BLOOD',
          notes: 'Test donation for inventory setup',
        },
      });

      cu = await prisma.collectionUnit.create({
        data: {
          unitNumber: `CU-TEST-${Date.now()}`,
          donationEventId: donEvent.id,
          organisationId: testBloodBank.id,
          campId: camp.id,
          bloodGroup: 'B_POS',
          volumeMl: 450,
          status: 'PROCESSING_COMPLETED',
          collectedBy: testStaff.id,
        },
      });
    }

    const testComponentCode = 'CMP-TEST-BPOS-001';
    let testUnit = await prisma.componentUnit.findUnique({
      where: { componentCode: testComponentCode },
    });

    if (!testUnit) {
      testUnit = await prisma.componentUnit.create({
        data: {
          componentCode: testComponentCode,
          collectionUnit: { connect: { id: cu.id } },
          organisation: { connect: { id: testBloodBank.id } },
          deriver: { connect: { id: testStaff.id } },
          componentType: 'PRBC',
          bloodGroup: 'B_POS',
          volumeMl: 350,
          expiresAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000), // 20 days future
          status: 'AVAILABLE',
          isHold: false,
        },
      });
    } else {
      await prisma.componentUnit.update({
        where: { id: testUnit.id },
        data: {
          organisationId: testBloodBank.id,
          status: 'AVAILABLE',
          isHold: false,
          expiresAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        },
      });
    }

    // Ensure clinical release record
    const existingRelease = await prisma.clinicalReleaseRecord.findFirst({
      where: { componentUnitId: testUnit.id },
    });
    if (!existingRelease) {
      await prisma.clinicalReleaseRecord.create({
        data: {
          componentUnitId: testUnit.id,
          organisationId: testBloodBank.id,
          decision: 'RELEASED',
          authorizedClinicalUserId: testStaff.id,
          reason: 'Standard quality release passed',
          reviewedTestIds: [],
        },
      });
    }

    console.log('\n--- Phase 1: Canonical Request Creation & Routing ---');

    // Test 1: Create request directly designating the participating Blood Bank
    const req1 = await BloodRequestCoordinationService.createCanonicalRequest(testRequester.id, {
      patientName: 'Sunita Patil',
      bloodGroup: 'B_POS',
      component: 'Packed Red Blood Cells',
      unitsRequested: 1,
      hospitalCode: testHospitalCode,
      admittedHospitalName: 'Sancheti Hospital, Pune',
      urgency: 'URGENT',
      message: 'Urgent orthopaedic surgery requirement.',
    });

    assert(!!req1.id, 'Canonical request created successfully with ID');
    assert(req1.hospitalCode === testHospitalCode, 'hospitalCode correctly resolved to participating blood centre code');
    assert(req1.assignedBankId === testBloodBank.id, 'assignedBankId correctly resolved to participating organisation');
    assert(req1.fulfillmentStatus === 'SUBMITTED', 'Initial lifecycle status is SUBMITTED');

    // Test 2: Verify request appears in the Blood Bank queue
    const queue = await HospitalIntegrationService.getIncomingBloodRequests(testBloodBank.id);
    const inQueue = queue.find((q) => q.id === req1.id);
    assert(!!inQueue, 'Directly designated request reaches Blood Bank queue');
    assert(inQueue?.isDirectDesignation === true, 'Request correctly identified as isDirectDesignation = true');
    assert((inQueue?.availableEligibleStockCount ?? 0) >= 1, 'Live inventory calculation indicates available stock');

    console.log('\n--- Phase 2: District Unassigned Request & Claim Workflow ---');

    // Test 3: Create district-unassigned request (no hospitalCode specified)
    const reqUnassigned = await BloodRequestCoordinationService.createCanonicalRequest(testRequester2.id, {
      patientName: 'Kishore Ghorpade',
      bloodGroup: 'B_POS',
      component: 'Packed Red Blood Cells',
      unitsRequested: 1,
      hospitalCode: '', // No specific blood bank designated
      admittedHospitalName: 'Ruby Hall Clinic, Pune',
      urgency: 'CRITICAL',
    });

    assert(reqUnassigned.hospitalCode === null, 'Unassigned request has hospitalCode = null');

    // Query queue again: Blood bank in District 521 should see the unassigned request
    const queueWithUnassigned = await HospitalIntegrationService.getIncomingBloodRequests(testBloodBank.id);
    const unassignedInQueue = queueWithUnassigned.find((q) => q.id === reqUnassigned.id);
    assert(!!unassignedInQueue, 'Unassigned district request appears in district Blood Bank queue');
    assert(unassignedInQueue?.isDistrictUnassigned === true, 'Flagged as isDistrictUnassigned = true');
    assert(unassignedInQueue?.isClaimable === true, 'Flagged as isClaimable = true');

    // Test 4: Blood bank claims the unassigned request
    const claimResult = await HospitalIntegrationService.claimRequest(testStaff.id, testBloodBank.id, reqUnassigned.id);
    assert(claimResult.success === true, 'Blood bank claims district unassigned request');
    assert(claimResult.data.hospitalCode === testHospitalCode, 'hospitalCode updated to claiming Blood Bank code');

    console.log('\n--- Phase 3: Transactional Inventory Reservation & Audit ---');

    // Test 5: Accept and reserve stock for req1
    const reserveResult = await HospitalIntegrationService.acceptAndReserveRequest(
      testStaff.id,
      testBloodBank.id,
      req1.id
    );

    assert(reserveResult.success === true, 'Stock reservation transaction completed successfully');
    assert(reserveResult.reservedUnits.length === 1, 'Exactly 1 unit reserved');
    assert(reserveResult.request.closureOutcome === 'STOCK_RESERVED', 'Request transitioned to STOCK_RESERVED');

    // Verify inventory unit status changed to RESERVED
    const unitAfterReserve = await prisma.componentUnit.findUnique({
      where: { id: testUnit.id },
    });
    assert(unitAfterReserve?.status === 'RESERVED', 'Inventory component unit status transitioned to RESERVED in DB');

    // Verify unit history audit record
    const statusHistory = await prisma.unitStatusHistory.findFirst({
      where: { componentUnitId: testUnit.id, toStatus: 'RESERVED' },
      orderBy: { timestamp: 'desc' },
    });
    assert(!!statusHistory, 'Unit status history audit log created for RESERVED transition');

    console.log('\n--- Phase 4: Cold-Chain Dispatch Workflow ---');

    // Test 6: Dispatch blood units with transport telemetry
    const transportDetails = {
      courierName: 'Maharashtra Cold-Chain Logistics',
      vehicleNumber: 'MH-12-RS-9988',
      driverPhone: '+919876501234',
      coldBoxTempCelsius: 4.2,
      notes: 'Calibrated Bluetooth data logger included in shipping container',
    };

    const dispatchResult = await HospitalIntegrationService.dispatchRequest(
      testStaff.id,
      testBloodBank.id,
      req1.id,
      transportDetails
    );

    assert(dispatchResult.success === true, 'Request dispatch executed successfully');
    assert(dispatchResult.data.closureOutcome === 'DISPATCHED', 'Request closureOutcome set to DISPATCHED');
    assert(dispatchResult.data.reportedDonationStatus === 'DISPATCHED', 'reportedDonationStatus set to DISPATCHED');

    // Verify unit transitioned to ISSUED (deducted from active stock)
    const unitAfterDispatch = await prisma.componentUnit.findUnique({
      where: { id: testUnit.id },
    });
    assert(unitAfterDispatch?.status === 'ISSUED', 'Inventory component unit status transitioned to ISSUED');

    console.log('\n--- Phase 5: Dual Confirmation & Terminal Fulfilment ---');

    // Test 7: Patient/Requester confirms receipt of the dispatched units
    const confirmResult = await HospitalIntegrationService.confirmReceipt(
      testRequester.id,
      req1.id,
      'Received at Sancheti Hospital blood bank counter in good condition.'
    );

    assert(confirmResult.success === true, 'Patient receipt confirmed successfully');
    assert(confirmResult.data.status === 'CLOSED', 'Request status transitioned to CLOSED');
    assert(confirmResult.data.closureOutcome === 'FULFILLED', 'closureOutcome transitioned to FULFILLED');

    // Verify unit remains ISSUED (no double deduction)
    const unitAfterConfirm = await prisma.componentUnit.findUnique({
      where: { id: testUnit.id },
    });
    assert(unitAfterConfirm?.status === 'ISSUED', 'Inventory unit remains ISSUED without secondary deduction');

    // Verify metadata stores patient receipt acknowledgement
    const finalMeta = parseRequestMessageMetadata(confirmResult.data.message);
    assert(!!finalMeta.patientAcknowledgedAt, 'patientAcknowledgedAt timestamp persisted');
    assert(finalMeta.confirmedByRole === 'REQUESTER', 'confirmedByRole recorded as REQUESTER');

    console.log('\n--- Phase 6: Voluntary Donor Privacy Gate & Recommended Blood Bank ---');

    // Test 8: Create an open request for donor matching
    const reqForDonors = await BloodRequestCoordinationService.createCanonicalRequest(testRequester.id, {
      patientName: 'Radha Joshi',
      bloodGroup: 'B_POS',
      component: 'Packed Red Blood Cells',
      unitsRequested: 1,
      hospitalCode: testHospitalCode,
      admittedHospitalName: 'KEM Hospital, Pune',
      urgency: 'ROUTINE',
      searchScope: 'DISTRICT_EXPANDED',
    });

    // Test 9: Match donors
    const matchResult = await findMatchingDonorsForRequest(reqForDonors.id);
    const matchedDonor = matchResult.donors.find((d) => d.donorId === testDonorProfile.id);
    assert(!!matchedDonor, 'Test donor discovered in matching candidates');
    assert(Boolean(matchedDonor?.displayName && matchedDonor.displayName.includes('.')), 'Donor display name is sanitized/anonymized');
    assert(matchedDonor?.contactNumber === null, 'Pre-acceptance PRIVACY GATE: Phone number is strictly NULL');
    assert(matchedDonor?.disclosureAuthorized === false, 'disclosureAuthorized is FALSE before acceptance');

    // Test 10: Donor queries their pending requests
    const donorView = await findEligibleRequestsForDonor(testDonorUser.id);
    assert(donorView.eligible === true, 'Donor profile is recognized as eligible');

    // Verify recommended centre and safety instructions are returned
    // Send invitation first
    await prisma.donorResponse.create({
      data: {
        requestId: reqForDonors.id,
        donorId: testDonorProfile.id,
        status: 'PENDING',
      },
    });

    const donorRequests = await findEligibleRequestsForDonor(testDonorUser.id);
    const receivedInvite = donorRequests.requests.find((r) => r.id === reqForDonors.id);
    assert(!!receivedInvite, 'Donor receives invitation for the request');
    assert(!!receivedInvite?.recommendedCentre, 'Invitation contains structured recommendedCentre');
    assert(
      receivedInvite?.recommendedCentre.hospitalName === 'Pune Model Blood Centre',
      'Recommended centre matches accredited blood bank'
    );
    assert(
      receivedInvite?.donationInstructions !== undefined &&
        receivedInvite.donationInstructions.includes('never attempt to deliver blood directly to the patient'),
      'Mandatory donation instructions explicitly forbid delivering blood directly to patient'
    );

    // Test 11: Donor accepts invitation -> bilateral phone unlock
    await prisma.donorResponse.update({
      where: {
        requestId_donorId: {
          requestId: reqForDonors.id,
          donorId: testDonorProfile.id,
        },
      },
      data: {
        status: 'ACCEPTED',
        disclosureAuthorized: true,
        contactDisclosedAt: new Date(),
      },
    });

    // Requester queries matching donors again
    const postAcceptMatch = await findMatchingDonorsForRequest(reqForDonors.id);
    const acceptedDonor = postAcceptMatch.donors.find((d) => d.donorId === testDonorProfile.id);
    assert(acceptedDonor?.responseStatus === 'ACCEPTED', 'Donor status is now ACCEPTED');
    assert(acceptedDonor?.disclosureAuthorized === true, 'disclosureAuthorized is now TRUE');
    assert(
      acceptedDonor?.contactNumber === testDonorUser.phoneNumber,
      'Post-acceptance PRIVACY GATE: Donor phone number is now legitimately disclosed'
    );

    // Test 12: Rejection releases reserved inventory back to AVAILABLE
    console.log('\n--- Phase 7: Rejection Reservation Release ---');
    
    // Put test unit back to AVAILABLE
    await prisma.componentUnit.update({
      where: { id: testUnit.id },
      data: { status: 'AVAILABLE' },
    });

    const reqReject = await BloodRequestCoordinationService.createCanonicalRequest(testRequester.id, {
      patientName: 'Test Reject Patient',
      bloodGroup: 'B_POS',
      component: 'Packed Red Blood Cells',
      unitsRequested: 1,
      hospitalCode: testHospitalCode,
      admittedHospitalName: 'City Clinic',
    });

    await HospitalIntegrationService.acceptAndReserveRequest(testStaff.id, testBloodBank.id, reqReject.id);
    const unitReservedForReject = await prisma.componentUnit.findUnique({ where: { id: testUnit.id } });
    assert(unitReservedForReject?.status === 'RESERVED', 'Unit reserved prior to rejection');

    await HospitalIntegrationService.rejectRequest(
      testStaff.id,
      testBloodBank.id,
      reqReject.id,
      'Insufficient documentation provided by receiving clinic.'
    );

    const unitAfterReject = await prisma.componentUnit.findUnique({ where: { id: testUnit.id } });
    assert(unitAfterReject?.status === 'AVAILABLE', 'Rejection atomically releases reserved stock back to AVAILABLE');

  } catch (error: any) {
    console.error('❌ Exception during verification:', error);
    failed++;
  } finally {
    console.log('\n================================================================');
    console.log(`📊 Test Summary: ${passed} Passed, ${failed} Failed`);
    console.log('================================================================\n');
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runVerification();
