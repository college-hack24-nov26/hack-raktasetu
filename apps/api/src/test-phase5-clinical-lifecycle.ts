/**
 * RaktaSetu Phase 5 Focused Verification Suite:
 * Clinical Assessment, Informed Consent, Phlebotomy Collection, Quarantine Isolation,
 * Mandatory 6-Test TTI & Immunohematology Panel, Authorized Clinical Release,
 * Shortfall-Aware Stock Allocation, Dispatch, Dual Receipt, and End-to-End Traceability.
 */

import assert from 'assert';
import { prisma } from './lib/prisma';
import { HospitalIntegrationService } from './services/hospitalIntegration';
import { AdminMatchingService } from './services/adminMatchingService';
import { ProcessingAndInventoryService, MANDATORY_TEST_TYPES } from './services/processingAndInventory';
import { BloodGroup } from '@prisma/client';

async function runPhase5Verification() {
  console.log('\n====================================================================');
  console.log('🧪 RaktaSetu Phase 5 Focused Verification: Clinical Lifecycle & Traceability');
  console.log('====================================================================');

  let passed = 0;
  let failed = 0;

  function recordPass(testName: string) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  }

  function recordFail(testName: string, error: any) {
    console.error(`  ❌ FAIL: ${testName} ->`, error.message || error);
    failed++;
  }

  try {
    // -------------------------------------------------------------
    // FIXTURE SETUP
    // -------------------------------------------------------------
    console.log('\n[Phase 5 Setup] Initializing test users, organisations, and staff roles...');

    // 1. Platform Admin
    const adminUser = await prisma.user.upsert({
      where: { phoneNumber: '+919955550001' },
      update: { role: 'ADMIN', name: 'Platform Admin P5' },
      create: {
        phoneNumber: '+919955550001',
        name: 'Platform Admin P5',
        role: 'ADMIN',
      },
    });

    // 2. Patient Requester
    const patientUser = await prisma.user.upsert({
      where: { phoneNumber: '+919955550002' },
      update: { role: 'USER', name: 'Aditi Deshmukh' },
      create: {
        phoneNumber: '+919955550002',
        name: 'Aditi Deshmukh',
        role: 'USER',
      },
    });

    // 3. Clinical Staff (Authorized Clinician)
    const clinicalStaffUser = await prisma.user.upsert({
      where: { phoneNumber: '+919955550003' },
      update: { role: 'USER', name: 'Dr. Aarav Kulkarni (Medical Officer)' },
      create: {
        phoneNumber: '+919955550003',
        name: 'Dr. Aarav Kulkarni (Medical Officer)',
        role: 'USER',
      },
    });

    // 4. Collection Staff (Phlebotomist)
    const collectionStaffUser = await prisma.user.upsert({
      where: { phoneNumber: '+919955550004' },
      update: { role: 'USER', name: 'Sunil Shinde (Phlebotomist)' },
      create: {
        phoneNumber: '+919955550004',
        name: 'Sunil Shinde (Phlebotomist)',
        role: 'USER',
      },
    });

    // 5. Lab Technician
    const labTechUser = await prisma.user.upsert({
      where: { phoneNumber: '+919955550005' },
      update: { role: 'USER', name: 'Pooja Patil (Lab Technologist)' },
      create: {
        phoneNumber: '+919955550005',
        name: 'Pooja Patil (Lab Technologist)',
        role: 'USER',
      },
    });

    // 6. Non-clinical Org Admin (Administrative Manager)
    const orgAdminUser = await prisma.user.upsert({
      where: { phoneNumber: '+919955550006' },
      update: { role: 'USER', name: 'Ramesh Patil (Admin Manager)' },
      create: {
        phoneNumber: '+919955550006',
        name: 'Ramesh Patil (Admin Manager)',
        role: 'USER',
      },
    });

    // 7. Competing Bank Staff
    const competingBankStaffUser = await prisma.user.upsert({
      where: { phoneNumber: '+919955550007' },
      update: { role: 'USER', name: 'Dr. Meera Sen' },
      create: {
        phoneNumber: '+919955550007',
        name: 'Dr. Meera Sen',
        role: 'USER',
      },
    });

    const runId = Date.now().toString().slice(-6);
    const donorPhone = `+9199555${runId}`;
    const deferredPhone = `+9199556${runId}`;

    // 8. Voluntary Donor
    const donorUser = await prisma.user.create({
      data: {
        phoneNumber: donorPhone,
        name: `Rohit Kadam P5 (${runId})`,
        role: 'USER',
        status: 'ACTIVE',
      },
    });

    // 9. Blood Bank Organisation (Designated Centre)
    const orgDesignated = await prisma.organisation.upsert({
      where: { orgCode: 'ORG-P5-APEX-CENTRE' },
      update: { name: 'Apex Regional Blood Centre', status: 'VERIFIED', districtCode: 521, stateCode: 27 },
      create: {
        orgCode: 'ORG-P5-APEX-CENTRE',
        name: 'Apex Regional Blood Centre',
        licenseNumber: 'LIC-P5-APEX',
        type: 'BLOOD_BANK',
        districtCode: 521,
        stateCode: 27,
        status: 'VERIFIED',
      },
    });

    // 10. Competing Organisation
    const orgCompeting = await prisma.organisation.upsert({
      where: { orgCode: 'ORG-P5-OTHER-CENTRE' },
      update: { name: 'Metro Regional Blood Centre', status: 'VERIFIED', districtCode: 505, stateCode: 27 },
      create: {
        orgCode: 'ORG-P5-OTHER-CENTRE',
        name: 'Metro Regional Blood Centre',
        licenseNumber: 'LIC-P5-OTHER',
        type: 'BLOOD_BANK',
        districtCode: 505,
        stateCode: 27,
        status: 'VERIFIED',
      },
    });

    // 11. Blood Centre Directory Fixture
    const bloodCentreFixture = await prisma.bloodCentre.upsert({
      where: { hospitalCode: 'HOSP-P5-APEX' },
      update: { hospitalName: 'Apex Regional Blood Centre', districtCode: 521, stateCode: 27 },
      create: {
        hospitalCode: 'HOSP-P5-APEX',
        hospitalName: 'Apex Regional Blood Centre',
        address: 'Shivajinagar, Pune',
        mobileNo: '+912025550001',
        districtCode: 521,
        stateCode: 27,
      },
    });

    await prisma.organisation.update({
      where: { id: orgDesignated.id },
      data: { hospitalCode: bloodCentreFixture.hospitalCode },
    });

    // 12. Memberships
    await prisma.organisationMembership.upsert({
      where: { userId_organisationId: { userId: clinicalStaffUser.id, organisationId: orgDesignated.id } },
      update: { role: 'CLINICAL_STAFF', isActive: true },
      create: { userId: clinicalStaffUser.id, organisationId: orgDesignated.id, role: 'CLINICAL_STAFF', isActive: true },
    });

    await prisma.organisationMembership.upsert({
      where: { userId_organisationId: { userId: collectionStaffUser.id, organisationId: orgDesignated.id } },
      update: { role: 'COLLECTION_STAFF', isActive: true },
      create: { userId: collectionStaffUser.id, organisationId: orgDesignated.id, role: 'COLLECTION_STAFF', isActive: true },
    });

    await prisma.organisationMembership.upsert({
      where: { userId_organisationId: { userId: labTechUser.id, organisationId: orgDesignated.id } },
      update: { role: 'INVENTORY_STAFF', isActive: true },
      create: { userId: labTechUser.id, organisationId: orgDesignated.id, role: 'INVENTORY_STAFF', isActive: true },
    });

    await prisma.organisationMembership.upsert({
      where: { userId_organisationId: { userId: orgAdminUser.id, organisationId: orgDesignated.id } },
      update: { role: 'ORG_ADMIN', isActive: true },
      create: { userId: orgAdminUser.id, organisationId: orgDesignated.id, role: 'ORG_ADMIN', isActive: true },
    });

    await prisma.organisationMembership.upsert({
      where: { userId_organisationId: { userId: competingBankStaffUser.id, organisationId: orgCompeting.id } },
      update: { role: 'CLINICAL_STAFF', isActive: true },
      create: { userId: competingBankStaffUser.id, organisationId: orgCompeting.id, role: 'CLINICAL_STAFF', isActive: true },
    });

    // 13. Donor Profile
    const donorProfile = await prisma.donorProfile.upsert({
      where: { userId: donorUser.id },
      update: {
        bloodGroup: 'O_POS',
        isAvailable: true,
        isSearchable: true,
        consentWithdrawnAt: null,
        districtCode: 521,
        stateCode: 27,
        lastDonationDate: null,
        verifiedLastDonationDate: null,
      },
      create: {
        userId: donorUser.id,
        bloodGroup: 'O_POS',
        isAvailable: true,
        isSearchable: true,
        districtCode: 521,
        stateCode: 27,
        primaryHospitalCode: bloodCentreFixture.hospitalCode,
      },
    });

    await prisma.donorResponse.deleteMany({ where: { donorId: donorProfile.id } });

    // 14. Canonical Blood Request with Shortfall
    console.log('[Setup 14] Creating blood request...');
    const bloodRequest = await prisma.bloodRequest.create({
      data: {
        requesterId: patientUser.id,
        patientName: 'Aditi Deshmukh',
        bloodGroup: 'O_POS',
        component: 'Packed Red Blood Cells',
        unitsRequested: 1,
        hospitalCode: bloodCentreFixture.hospitalCode,
        status: 'OPEN',
        message: JSON.stringify({
          hospitalName: 'Apex Regional Blood Centre',
          urgency: 'URGENT',
          shortfallCount: 1,
          allocatedUnitsCount: 0,
          assignedBankId: orgDesignated.id,
          assignedBankName: orgDesignated.name,
        }),
      },
    });

    // 15. Matching Request & Approved Candidate Release
    console.log('[Setup 15] Requesting donor matching...');
    await HospitalIntegrationService.requestDonorMatching(
      clinicalStaffUser.id,
      orgDesignated.id,
      bloodRequest.id
    );

    console.log('[Setup 15] Running matching search...');
    await AdminMatchingService.runMatchingSearch(
      adminUser.id,
      bloodRequest.id,
      'EXACT_CENTRE'
    );

    console.log('[Setup 15] Releasing matching candidates...');
    await AdminMatchingService.releaseMatchingCandidates(
      adminUser.id,
      bloodRequest.id,
      [donorProfile.id],
      'Clinically cleared O+ voluntary donor candidate pool approved by platform medical administration.'
    );

    // 16. Outreach & Explicit Donor Acceptance
    console.log('[Setup 16] Inviting donor candidates...');
    const inviteRes = await HospitalIntegrationService.inviteDonorCandidates(
      clinicalStaffUser.id,
      orgDesignated.id,
      bloodRequest.id,
      [donorProfile.id]
    );
    console.log('[Setup 16] Invite result:', inviteRes);

    await prisma.donorResponse.update({
      where: {
        requestId_donorId: {
          requestId: bloodRequest.id,
          donorId: donorProfile.id,
        },
      },
      data: {
        status: 'ACCEPTED',
        respondedAt: new Date(),
        disclosureAuthorized: true,
        contactDisclosedAt: new Date(),
      },
    });

    console.log('[Phase 5 Setup Complete] Prerequisites established. Beginning scenario test execution...\n');

    // -------------------------------------------------------------
    // SCENARIO 1: Donor Arrival Registration for Accepted Outreach
    // -------------------------------------------------------------
    try {
      const arrivalResult = await HospitalIntegrationService.recordDonorArrival(
        orgAdminUser.id,
        orgDesignated.id,
        bloodRequest.id,
        donorProfile.id,
        'Donor presented photo ID and verified in person at reception.'
      );

      assert.strictEqual(arrivalResult.success, true);
      assert.ok(arrivalResult.attendanceId, 'Expected attendanceId to be returned');
      assert.strictEqual(arrivalResult.donorIntake.intakeStatus, 'ARRIVED');

      const attendanceRecord = await prisma.campAttendance.findUnique({
        where: { id: arrivalResult.attendanceId },
      });
      assert.strictEqual(attendanceRecord?.status, 'CHECKED_IN');

      const updatedReq = await prisma.bloodRequest.findUniqueOrThrow({ where: { id: bloodRequest.id } });
      const meta = JSON.parse(updatedReq.message || '{}');
      assert.strictEqual(meta.donorIntake?.intakeStatus, 'ARRIVED');
      assert.strictEqual(meta.donorIntake?.attendanceId, arrivalResult.attendanceId);

      recordPass('Scenario 1: Donor Arrival & Identity Verification recorded against accepted invitation');
    } catch (err: any) {
      recordFail('Scenario 1: Donor Arrival & Identity Verification', err);
    }

    // -------------------------------------------------------------
    // SCENARIO 2: Rejection of Arrival for Unaccepted Request
    // -------------------------------------------------------------
    try {
      const otherDonor = await prisma.donorProfile.create({
        data: {
          user: {
            create: {
              phoneNumber: `+9199557${runId}`,
              name: 'Unaccepted Donor',
              role: 'USER',
            },
          },
          bloodGroup: 'O_POS',
          isAvailable: true,
          districtCode: 521,
          stateCode: 27,
        },
      });

      await assert.rejects(
        async () => {
          await HospitalIntegrationService.recordDonorArrival(
            orgAdminUser.id,
            orgDesignated.id,
            bloodRequest.id,
            otherDonor.id
          );
        },
        /No outreach invitation found|has not explicitly accepted/i
      );

      recordPass('Scenario 2: Unaccepted or uninvited donor intake correctly rejected');
    } catch (err: any) {
      recordFail('Scenario 2: Unaccepted donor intake rejection', err);
    }

    // -------------------------------------------------------------
    // SCENARIO 3: Non-Designated Blood Bank Rejection
    // -------------------------------------------------------------
    try {
      await assert.rejects(
        async () => {
          await HospitalIntegrationService.recordDonorArrival(
            competingBankStaffUser.id,
            orgCompeting.id,
            bloodRequest.id,
            donorProfile.id
          );
        },
        /Access denied/i
      );

      recordPass('Scenario 3: Non-designated competing blood centre strictly forbidden from donor intake');
    } catch (err: any) {
      recordFail('Scenario 3: Non-designated bank rejection', err);
    }

    // -------------------------------------------------------------
    // SCENARIO 4: Strict Clinical Screening Role Gate
    // -------------------------------------------------------------
    const currentReq = await prisma.bloodRequest.findUniqueOrThrow({ where: { id: bloodRequest.id } });
    const currentMeta = JSON.parse(currentReq.message || '{}');
    const attendanceId = currentMeta.donorIntake.attendanceId;

    try {
      // Non-clinical Org Admin attempts to perform clinical assessment
      await assert.rejects(
        async () => {
          await HospitalIntegrationService.recordIntakeClinicalScreening(
            orgAdminUser.id,
            orgDesignated.id,
            bloodRequest.id,
            {
              attendanceId,
              consentGiven: true,
              eligibilityDecision: 'CLEARED',
            }
          );
        },
        /Permission denied: Clinical assessment strictly requires authorized CLINICAL_STAFF role/i
      );

      recordPass('Scenario 4: Non-clinical ORG_ADMIN strictly blocked from recording medical screening');
    } catch (err: any) {
      recordFail('Scenario 4: Clinical role gate on screening', err);
    }

    // -------------------------------------------------------------
    // SCENARIO 5: Authorized Clinical Staff Records Clearance
    // -------------------------------------------------------------
    try {
      const screeningResult = await HospitalIntegrationService.recordIntakeClinicalScreening(
        clinicalStaffUser.id,
        orgDesignated.id,
        bloodRequest.id,
        {
          attendanceId,
          consentVersion: 'v2.1',
          consentGiven: true,
          eligibilityDecision: 'CLEARED',
          clinicalNotes: 'Hemoglobin 14.2 g/dL, pulse 72 bpm, BP 120/80 mmHg. Fully cleared for whole blood donation.',
        }
      );

      assert.strictEqual(screeningResult.success, true);
      assert.strictEqual(screeningResult.screening.eligibilityDecision, 'CLEARED');
      assert.strictEqual(screeningResult.intakeStatus, 'CLEARED');

      const screeningRecord = await prisma.clinicalScreening.findUnique({
        where: { id: screeningResult.screening.id },
      });
      assert.strictEqual(screeningRecord?.eligibilityDecision, 'CLEARED');
      assert.strictEqual(screeningRecord?.consentGiven, true);

      recordPass('Scenario 5: Authorized CLINICAL_STAFF records screening clearance & informed consent');
    } catch (err: any) {
      recordFail('Scenario 5: Authorized clinical clearance', err);
    }

    // -------------------------------------------------------------
    // SCENARIO 6: Deferral Safety Enforcement
    // -------------------------------------------------------------
    try {
      // Create a second donor with temporary deferral
      const deferredDonorUser = await prisma.user.create({
        data: {
          phoneNumber: deferredPhone,
          name: 'Deferred Donor',
          role: 'USER',
        },
      });

      const deferredDonor = await prisma.donorProfile.create({
        data: {
          userId: deferredDonorUser.id,
          bloodGroup: 'O_POS',
          isAvailable: true,
          districtCode: 521,
          stateCode: 27,
        },
      });

      const deferredReq = await prisma.bloodRequest.create({
        data: {
          requesterId: patientUser.id,
          bloodGroup: 'O_POS',
          component: 'Packed Red Blood Cells',
          unitsRequested: 1,
          hospitalCode: bloodCentreFixture.hospitalCode,
          message: JSON.stringify({ assignedBankId: orgDesignated.id, shortfallCount: 1 }),
        },
      });

      await prisma.donorResponse.create({
        data: {
          requestId: deferredReq.id,
          donorId: deferredDonor.id,
          status: 'ACCEPTED',
          disclosureAuthorized: true,
        },
      });

      const arrival2 = await HospitalIntegrationService.recordDonorArrival(
        orgAdminUser.id,
        orgDesignated.id,
        deferredReq.id,
        deferredDonor.id
      );

      // Record temporary deferral (e.g. low hemoglobin)
      await HospitalIntegrationService.recordIntakeClinicalScreening(
        clinicalStaffUser.id,
        orgDesignated.id,
        deferredReq.id,
        {
          attendanceId: arrival2.attendanceId,
          consentGiven: true,
          eligibilityDecision: 'TEMPORARY_DEFERRAL',
          deferralCategory: 'LOW_HEMOGLOBIN',
          deferralDurationDays: 30,
          clinicalNotes: 'Hemoglobin 11.2 g/dL below 12.5 minimum threshold. Deferred for 30 days.',
        }
      );

      // Attempting phlebotomy on deferred donor must be strictly blocked!
      await assert.rejects(
        async () => {
          await HospitalIntegrationService.recordIntakeCollectionAndComponent(
            collectionStaffUser.id,
            orgDesignated.id,
            deferredReq.id,
            {
              attendanceId: arrival2.attendanceId,
              bloodGroup: 'O_POS',
              volumeMl: 350,
            }
          );
        },
        /Donor has not been clinically screened and CLEARED/i
      );

      recordPass('Scenario 6: Medical deferral gate strictly prevents blood collection from deferred donor');
    } catch (err: any) {
      recordFail('Scenario 6: Medical deferral enforcement', err);
    }

    // -------------------------------------------------------------
    // SCENARIO 7: Collection Role Gate
    // -------------------------------------------------------------
    try {
      // Lab technician or patient attempts collection
      await assert.rejects(
        async () => {
          await HospitalIntegrationService.recordIntakeCollectionAndComponent(
            labTechUser.id,
            orgDesignated.id,
            bloodRequest.id,
            {
              attendanceId,
              bloodGroup: 'O_POS',
              volumeMl: 450,
            }
          );
        },
        /Permission denied: Phlebotomy collection requires authorized COLLECTION_STAFF role/i
      );

      recordPass('Scenario 7: Unauthorized staff strictly blocked from performing phlebotomy collection');
    } catch (err: any) {
      recordFail('Scenario 7: Collection role gate', err);
    }

    // -------------------------------------------------------------
    // SCENARIO 8: Phlebotomy Collection & Component Derivation
    // -------------------------------------------------------------
    let collectionUnitId = '';
    let componentUnitId = '';

    try {
      const collectionResult = await HospitalIntegrationService.recordIntakeCollectionAndComponent(
        collectionStaffUser.id,
        orgDesignated.id,
        bloodRequest.id,
        {
          attendanceId,
          bloodGroup: 'O_POS',
          volumeMl: 450,
          bagIdentifier: 'BAG-2026-P5-001',
          componentType: 'PRBC',
          notes: 'Standard 450ml CPD collection completed without adverse reactions.',
        }
      );

      assert.strictEqual(collectionResult.success, true);
      assert.strictEqual(collectionResult.donationEvent.outcome, 'COMPLETED');
      assert.ok(['COLLECTED', 'PROCESSING_COMPLETED'].includes(collectionResult.collectionUnit.status));
      assert.strictEqual(collectionResult.componentUnit.status, 'QUARANTINED');

      collectionUnitId = collectionResult.collectionUnit.id;
      componentUnitId = collectionResult.componentUnit.id;

      recordPass('Scenario 8: Phlebotomy collection records completed event, source bag, and QUARANTINED component');
    } catch (err: any) {
      recordFail('Scenario 8: Phlebotomy and component derivation', err);
    }

    // -------------------------------------------------------------
    // SCENARIO 9: Quarantined Inventory Isolation
    // -------------------------------------------------------------
    try {
      // Attempting to allocate or reserve the quarantined component must fail
      await assert.rejects(
        async () => {
          await HospitalIntegrationService.acceptAndReserveRequest(
            clinicalStaffUser.id,
            orgDesignated.id,
            bloodRequest.id,
            [componentUnitId]
          );
        },
        /Insufficient eligible|None of the specified units/i
      );

      recordPass('Scenario 9: Quarantined component cannot be reserved or allocated to blood request');
    } catch (err: any) {
      recordFail('Scenario 9: Quarantined inventory isolation', err);
    }

    // -------------------------------------------------------------
    // SCENARIO 10: Mandatory 6-Test TTI & Immunohematology Panel
    // -------------------------------------------------------------
    const testRecordIds: string[] = [];

    try {
      const callerLabTech = {
        id: labTechUser.id,
        role: 'STAFF',
        name: labTechUser.name,
      };

      for (const testType of MANDATORY_TEST_TYPES) {
        const category = testType === 'ABO_RH_CONFIRMATION' ? 'BLOOD_GROUPING' : 'TTI_SCREENING';
        const quantitativeValue = testType === 'ABO_RH_CONFIRMATION' ? 'O_POS' : '0.08 S/CO';

        const rec = await ProcessingAndInventoryService.recordLaboratoryTest(
          orgDesignated.id,
          callerLabTech,
          {
            componentUnitId,
            category: category as any,
            testType,
            testName: `Standard Protocol ${testType}`,
            resultOutcome: 'NON_REACTIVE',
            quantitativeValue,
            status: 'PENDING',
          }
        );

        testRecordIds.push(rec.id);
      }

      assert.strictEqual(testRecordIds.length, 6);
      recordPass('Scenario 10: Laboratory technician successfully records all 6 mandatory TTI & Immunohematology tests');
    } catch (err: any) {
      recordFail('Scenario 10: Mandatory test panel recording', err);
    }

    // -------------------------------------------------------------
    // SCENARIO 11: Unverified Tests Block Clinical Release
    // -------------------------------------------------------------
    try {
      const evaluation = await ProcessingAndInventoryService.evaluateReleaseEligibility(
        componentUnitId,
        orgDesignated.id
      );

      assert.strictEqual(evaluation.isEligibleForRelease, false);
      assert.ok(
        evaluation.blockingReasons.some((r) => r.includes('pending') || r.includes('failed') || r.includes('missing')),
        'Expected blocking reasons for unverified tests'
      );

      const callerClinical = {
        id: clinicalStaffUser.id,
        role: 'STAFF',
        name: clinicalStaffUser.name,
      };

      await assert.rejects(
        async () => {
          await ProcessingAndInventoryService.recordClinicalRelease(
            orgDesignated.id,
            componentUnitId,
            callerClinical,
            {
              decision: 'RELEASED',
              reason: 'Premature release attempt',
              clinicalProtocolRef: 'NBTC Schedule F(K)',
            }
          );
        },
        /Clinical Release Gate Blocked/i
      );

      recordPass('Scenario 11: Unverified laboratory test results strictly block clinical release');
    } catch (err: any) {
      recordFail('Scenario 11: Unverified tests block release', err);
    }

    // -------------------------------------------------------------
    // SCENARIO 12: Authorized Verification & Clinical Release
    // -------------------------------------------------------------
    try {
      const callerClinical = {
        id: clinicalStaffUser.id,
        role: 'STAFF',
        name: clinicalStaffUser.name,
      };

      // Medical Officer verifies each test
      for (const recordId of testRecordIds) {
        await ProcessingAndInventoryService.verifyLaboratoryTest(
          orgDesignated.id,
          recordId,
          callerClinical,
          { verificationNotes: 'Quality controls valid. Result verified.' }
        );
      }

      // Non-clinical staff attempting clinical release must be rejected
      const callerAdmin = {
        id: orgAdminUser.id,
        role: 'STAFF',
        name: orgAdminUser.name,
      };

      await assert.rejects(
        async () => {
          await ProcessingAndInventoryService.recordClinicalRelease(
            orgDesignated.id,
            componentUnitId,
            callerAdmin,
            {
              decision: 'RELEASED',
              reason: 'Admin trying to release',
              clinicalProtocolRef: 'NBTC Schedule F(K)',
            }
          );
        },
        /Clinical release requires authorized CLINICAL_STAFF role/i
      );

      // Authorized Clinical Staff performs clinical release
      const releaseResult = await ProcessingAndInventoryService.recordClinicalRelease(
        orgDesignated.id,
        componentUnitId,
        callerClinical,
        {
          decision: 'RELEASED',
          reason: 'All 6 mandatory TTI & ABO confirmation tests verified non-reactive. Cleared for patient use.',
          clinicalProtocolRef: 'NBTC Schedule F(K) Standard Release Protocol',
        }
      );

      assert.strictEqual(releaseResult.releaseRecord.decision, 'RELEASED');

      const releasedComp = await prisma.componentUnit.findUniqueOrThrow({
        where: { id: componentUnitId },
      });
      assert.strictEqual(releasedComp.status, 'AVAILABLE');

      recordPass('Scenario 12: CLINICAL_STAFF records release; component status transitions to AVAILABLE');
    } catch (err: any) {
      recordFail('Scenario 12: Authorized clinical release', err);
    }

    // -------------------------------------------------------------
    // SCENARIO 13: Request Allocation & Shortfall Decrement
    // -------------------------------------------------------------
    try {
      const allocResult = await HospitalIntegrationService.allocateReleasedComponentToRequest(
        clinicalStaffUser.id,
        orgDesignated.id,
        bloodRequest.id,
        componentUnitId
      );

      assert.strictEqual(allocResult.success, true);
      assert.strictEqual(allocResult.allocatedUnitsCount, 1);
      assert.strictEqual(allocResult.shortfallCount, 0);
      assert.strictEqual(allocResult.request.closureOutcome, 'STOCK_RESERVED');

      const reservedComp = await prisma.componentUnit.findUniqueOrThrow({
        where: { id: componentUnitId },
      });
      assert.strictEqual(reservedComp.status, 'RESERVED');

      recordPass('Scenario 13: Released component allocated to blood request; shortfall atomically decremented to 0');
    } catch (err: any) {
      recordFail('Scenario 13: Request allocation and shortfall decrement', err);
    }

    // -------------------------------------------------------------
    // SCENARIO 14: Dispatch & Dual Receipt Confirmation
    // -------------------------------------------------------------
    try {
      const dispatchResult = await HospitalIntegrationService.dispatchRequest(
        clinicalStaffUser.id,
        orgDesignated.id,
        bloodRequest.id,
        {
          courierName: 'Express Medical Transport',
          vehicleNumber: 'MH-12-AB-1234',
          driverPhone: '+919922001122',
          coldBoxTempCelsius: 4.2,
          notes: 'Cold chain verified',
        }
      );

      assert.strictEqual(dispatchResult.success, true);
      assert.strictEqual(dispatchResult.data.dispatchedUnitsCount, 1);

      // 1. Patient / Requester dual confirmation
      const patientConfirmResult = await HospitalIntegrationService.confirmReceipt(
        patientUser.id,
        bloodRequest.id,
        'Blood bag delivered to ward in refrigerated insulated container.',
        false // patient confirmation
      );
      assert.strictEqual(patientConfirmResult.success, true);

      // 2. Hospital medical staff dual confirmation
      const hospitalConfirmResult = await HospitalIntegrationService.confirmReceipt(
        adminUser.id,
        bloodRequest.id,
        'Crossmatch confirmed and transfusion custody verified by hospital blood bank staff.',
        true // hospital staff confirmation
      );
      assert.strictEqual(hospitalConfirmResult.success, true);
      assert.strictEqual(hospitalConfirmResult.isFullyFulfilled, true);
      assert.strictEqual(hospitalConfirmResult.shortfallCount, 0);

      const issuedComp = await prisma.componentUnit.findUniqueOrThrow({
        where: { id: componentUnitId },
      });
      assert.strictEqual(issuedComp.status, 'ISSUED');

      recordPass('Scenario 14: Cold-chain dispatch and dual receipt confirmation completes request fulfilment');
    } catch (err: any) {
      recordFail('Scenario 14: Dispatch and dual receipt confirmation', err);
    }

    // -------------------------------------------------------------
    // SCENARIO 15: End-to-End Lineage Completeness
    // -------------------------------------------------------------
    try {
      const lineage = await HospitalIntegrationService.getBloodRequestTraceability(
        clinicalStaffUser.id,
        orgDesignated.id,
        bloodRequest.id
      );

      assert.strictEqual(lineage.request.id, bloodRequest.id);
      assert.strictEqual(lineage.request.bloodGroup, 'O_POS');
      assert.strictEqual(lineage.request.shortfallCount, 0);

      assert.ok(lineage.matching, 'Expected matching section in lineage');
      assert.ok(lineage.invitations.length > 0, 'Expected invitations in lineage');
      assert.ok(lineage.donorIntake, 'Expected donorIntake in lineage');
      assert.strictEqual(lineage.donorIntake?.intakeStatus, 'COLLECTION_COMPLETED');

      assert.ok(lineage.clinicalScreening, 'Expected clinicalScreening in lineage');
      assert.strictEqual(lineage.clinicalScreening?.eligibilityDecision, 'CLEARED');
      assert.strictEqual(lineage.clinicalScreening?.consentGiven, true);

      assert.ok(lineage.collectionUnit, 'Expected collectionUnit in lineage');
      assert.strictEqual(lineage.collectionUnit?.volumeMl, 450);

      assert.strictEqual(lineage.laboratoryTests.length, 6, 'Expected all 6 mandatory laboratory tests');
      assert.ok(lineage.clinicalRelease, 'Expected clinicalRelease in lineage');
      assert.strictEqual(lineage.clinicalRelease?.decision, 'RELEASED');

      assert.ok(lineage.componentUnit, 'Expected componentUnit in lineage');
      assert.strictEqual(lineage.componentUnit?.componentType, 'PRBC');

      assert.ok(lineage.hospitalIssueOrder, 'Expected hospitalIssueOrder in lineage');
      assert.strictEqual(lineage.dualReceiptConfirmation?.isPatientAcknowledged, true);
      assert.strictEqual(lineage.dualReceiptConfirmation?.isHospitalReceived, true);

      recordPass('Scenario 15: End-to-end lineage graph returns complete, uninterrupted regulatory audit trail');
    } catch (err: any) {
      recordFail('Scenario 15: End-to-end lineage completeness', err);
    }

    // -------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------
    console.log('\n====================================================================');
    console.log(`📊 Phase 5 Verification Summary: ${passed} Passed, ${failed} Failed`);
    console.log('====================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (globalErr: any) {
    console.error('💥 Unhandled exception during Phase 5 verification:', globalErr);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase5Verification();
