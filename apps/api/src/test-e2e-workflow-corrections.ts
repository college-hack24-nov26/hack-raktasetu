/**
 * RaktaSetu End-to-End Blood Request Workflow Correction & Verification Suite
 *
 * Verifies the connected, multi-role lifecycle according to the Source of Truth:
 * 1. Patient creates request -> routed to designated Blood Bank
 * 2. Patient access restrictions: blocked from matching search, responses, invitations, scope
 * 3. Inventory allocation & remaining shortfall calculation
 * 4. Blood Bank requests donor matching for shortfall only (blocked if shortfall=0)
 * 5. System Admin review, hard eligibility gates, area scope, deterministic ranking
 * 6. Explicit candidate release & cross-organisation privacy isolation
 * 7. Blood Bank outreach, bilateral privacy gate, explicit donor acceptance
 * 8. Donor arrival & identity verification
 * 9. Clinical Staff medical assessment & informed consent (non-clinical blocked)
 * 10. Collection Staff phlebotomy -> QUARANTINED component
 * 11. Laboratory testing (6 mandatory tests) & clinical release gate
 * 12. Allocation to request shortfall & shortfall decrement to 0
 * 13. Cold-chain dispatch & dual receipt confirmation -> FULFILLED
 * 14. Full end-to-end regulatory traceability graph
 */

import assert from 'assert';
import { prisma } from './lib/prisma';
import { HospitalIntegrationService } from './services/hospitalIntegration';
import { AdminMatchingService } from './services/adminMatchingService';
import { ProcessingAndInventoryService, MANDATORY_TEST_TYPES } from './services/processingAndInventory';

let passed = 0;
let failed = 0;

function recordPass(testName: string) {
  passed++;
  console.log(`  ✅ PASS: ${testName}`);
}

function recordFail(testName: string, error: any) {
  failed++;
  console.error(`  ❌ FAIL: ${testName} ->`, error.message || error);
}

async function runWorkflowVerification() {
  console.log('\n====================================================================');
  console.log('🧪 RaktaSetu E2E Workflow Correction & UI Integration Test');
  console.log('====================================================================\n');

  const timestamp = Date.now();
  const testPatientPhone = `+9198${String(timestamp).slice(-8)}`;
  const testDonorPhone = `+9197${String(timestamp).slice(-8)}`;
  const testAdminPhone = `+9196${String(timestamp).slice(-8)}`;
  const testClinicalPhone = `+9195${String(timestamp).slice(-8)}`;
  const testCollectionPhone = `+9194${String(timestamp).slice(-8)}`;
  const testLabPhone = `+9193${String(timestamp).slice(-8)}`;
  const testCompetingStaffPhone = `+9192${String(timestamp).slice(-8)}`;

  let compId = '';
  let arrivalRes: any = null;

  try {
    // -------------------------------------------------------------
    // SETUP: Create Users, Blood Centres, and Organizations
    // -------------------------------------------------------------
    const patientUser = await prisma.user.create({ data: { phoneNumber: testPatientPhone, name: 'Patient Sharma', role: 'USER' } });
    const donorUser = await prisma.user.create({ data: { phoneNumber: testDonorPhone, name: 'Donor Patil', role: 'DONOR' } });
    const adminUser = await prisma.user.create({ data: { phoneNumber: testAdminPhone, name: 'SysAdmin Deshmukh', role: 'ADMIN' } });
    const clinicalUser = await prisma.user.create({ data: { phoneNumber: testClinicalPhone, name: 'Dr. Kulkarni (MO)', role: 'USER' } });
    const phlebUser = await prisma.user.create({ data: { phoneNumber: testCollectionPhone, name: 'Phleb Jadhav', role: 'USER' } });
    const labUser = await prisma.user.create({ data: { phoneNumber: testLabPhone, name: 'Tech Shinde', role: 'USER' } });
    const competingUser = await prisma.user.create({ data: { phoneNumber: testCompetingStaffPhone, name: 'Staff Rival', role: 'USER' } });

    const bloodCentreFixture = await prisma.bloodCentre.create({
      data: {
        hospitalName: 'Pune Civil Blood Centre',
        hospitalCode: `HOSP-PCBC-${timestamp.toString(36).toUpperCase()}`,
        stateCode: 27,
        districtCode: 521,
        address: '100 Station Road, Pune',
        mobileNo: '+912025550001',
      },
    });

    const orgDesignated = await prisma.organisation.create({
      data: {
        name: 'Pune Civil Blood Centre',
        orgCode: `PCBC-${timestamp.toString(36).toUpperCase()}`,
        hospitalCode: bloodCentreFixture.hospitalCode,
        licenseNumber: `LIC-PCBC-${timestamp.toString(36).toUpperCase()}`,
        type: 'BLOOD_BANK',
        status: 'VERIFIED',
        stateCode: 27,
        districtCode: 521,
      },
    });

    const orgCompeting = await prisma.organisation.create({
      data: {
        name: 'Private Metro Blood Bank',
        orgCode: `PMBB-${timestamp.toString(36).toUpperCase()}`,
        licenseNumber: `LIC-PMBB-${timestamp.toString(36).toUpperCase()}`,
        type: 'BLOOD_BANK',
        status: 'VERIFIED',
        stateCode: 27,
        districtCode: 521,
      },
    });

    // Assign memberships
    await prisma.organisationMembership.create({
      data: { userId: clinicalUser.id, organisationId: orgDesignated.id, role: 'CLINICAL_STAFF', isActive: true },
    });
    await prisma.organisationMembership.create({
      data: { userId: phlebUser.id, organisationId: orgDesignated.id, role: 'COLLECTION_STAFF', isActive: true },
    });
    await prisma.organisationMembership.create({
      data: { userId: labUser.id, organisationId: orgDesignated.id, role: 'INVENTORY_STAFF', isActive: true },
    });
    await prisma.organisationMembership.create({
      data: { userId: competingUser.id, organisationId: orgCompeting.id, role: 'CLINICAL_STAFF', isActive: true },
    });

    // Create Donor Profile
    const donorProfile = await prisma.donorProfile.create({
      data: {
        userId: donorUser.id,
        bloodGroup: 'B_POS',
        isAvailable: true,
        isSearchable: true,
        stateCode: 27,
        districtCode: 521,
        primaryHospitalCode: bloodCentreFixture.hospitalCode,
      },
    });

    // -------------------------------------------------------------
    // TEST 1: Patient Creates Blood Request Routed to Designated Bank
    // -------------------------------------------------------------
    const bloodRequest = await prisma.bloodRequest.create({
      data: {
        requesterId: patientUser.id,
        patientName: 'Aarav Sharma',
        bloodGroup: 'B_POS',
        component: 'Packed Red Blood Cells',
        unitsRequested: 1,
        hospitalCode: bloodCentreFixture.hospitalCode,
        status: 'OPEN',
        message: JSON.stringify({
          hospitalName: bloodCentreFixture.hospitalName,
          assignedBankId: orgDesignated.id,
          urgency: 'URGENT',
          shortfallCount: 1,
        }),
      },
    });

    assert.strictEqual(bloodRequest.hospitalCode, bloodCentreFixture.hospitalCode);
    assert.strictEqual(bloodRequest.status, 'OPEN');
    recordPass('1. Patient request successfully created and routed to designated Blood Centre');

    // -------------------------------------------------------------
    // TEST 2: Patient Strictly Blocked from Donor Matching Operations
    // -------------------------------------------------------------
    try {
      // 2a: Patient cannot run matching search
      await assert.rejects(
        async () => {
          await AdminMatchingService.runMatchingSearch(patientUser.id, bloodRequest.id, 'EXACT_CENTRE');
        },
        /Access denied|Only Platform Administration/i
      );

      // 2b: Patient cannot modify search scope
      await assert.rejects(
        async () => {
          await AdminMatchingService.runMatchingSearch(patientUser.id, bloodRequest.id, 'DISTRICT_EXPANDED', 'Patient expanded');
        },
        /Access denied|Only Platform Administration/i
      );

      // 2c: Patient cannot release matching candidates
      await assert.rejects(
        async () => {
          await AdminMatchingService.releaseMatchingCandidates(patientUser.id, bloodRequest.id, [donorProfile.id]);
        },
        /Access denied|Only Platform Administration/i
      );

      recordPass('2. Patient role strictly blocked from all donor matching, search, and release APIs');
    } catch (err: any) {
      recordFail('2. Patient matching barrier enforcement', err);
    }

    // -------------------------------------------------------------
    // TEST 3: Zero Shortfall Prevents Donor Matching Request
    // -------------------------------------------------------------
    try {
      const zeroShortfallReq = await prisma.bloodRequest.create({
        data: {
          requesterId: patientUser.id,
          patientName: 'Zero Shortfall Case',
          bloodGroup: 'B_POS',
          component: 'Packed Red Blood Cells',
          unitsRequested: 1,
          hospitalCode: bloodCentreFixture.hospitalCode,
          status: 'OPEN',
          message: JSON.stringify({
            hospitalName: bloodCentreFixture.hospitalName,
            assignedBankId: orgDesignated.id,
            shortfallCount: 0,
            allocatedUnitsCount: 1,
          }),
        },
      });

      await assert.rejects(
        async () => {
          await HospitalIntegrationService.requestDonorMatching(
            clinicalUser.id,
            orgDesignated.id,
            zeroShortfallReq.id
          );
        },
        /Donor matching cannot be requested when there is no remaining shortfall/i
      );

      recordPass('3. Zero shortfall strictly blocks matching requests (inventory-first rule)');
    } catch (err: any) {
      recordFail('3. Zero shortfall guard', err);
    }

    // -------------------------------------------------------------
    // TEST 4: Blood Bank Requests Matching for Remaining Shortfall
    // -------------------------------------------------------------
    try {
      const matchReqRes = await HospitalIntegrationService.requestDonorMatching(
        clinicalUser.id,
        orgDesignated.id,
        bloodRequest.id
      );

      assert.strictEqual(matchReqRes.success, true);
      assert.strictEqual(matchReqRes.matchingRequest.status, 'REQUESTED');
      assert.strictEqual(matchReqRes.matchingRequest.requestedShortfall, 1);
      recordPass('4. Designated Blood Bank requests matching for active shortfall; System Admin notified');
    } catch (err: any) {
      recordFail('4. Request donor matching for shortfall', err);
    }

    // -------------------------------------------------------------
    // TEST 5: System Admin Matching, Hard Eligibility Gate & Ranking
    // -------------------------------------------------------------
    try {
      const searchResults = await AdminMatchingService.runMatchingSearch(
        adminUser.id,
        bloodRequest.id,
        'EXACT_CENTRE'
      );

      assert.ok(searchResults.candidates, 'Expected candidates list');
      assert.ok(searchResults.candidates.length >= 1, 'Expected at least 1 candidate');
      const foundCandidate = searchResults.candidates.find((c) => c.donorId === donorProfile.id);
      assert.ok(foundCandidate, 'Expected test donor to be among ranked candidates');
      assert.strictEqual(foundCandidate.bloodGroup, 'B_POS');
      recordPass('5. System Admin runs matching search with mandatory clinical eligibility and area filters');
    } catch (err: any) {
      recordFail('5. System Admin matching search', err);
    }

    // -------------------------------------------------------------
    // TEST 6: Candidate Visibility Boundary Before Release
    // -------------------------------------------------------------
    try {
      // Prior to explicit release, Blood Bank cannot see candidate list
      const preReleaseCandidates = await AdminMatchingService.getReleasedCandidatesForBloodBank(
        clinicalUser.id,
        'STAFF',
        orgDesignated.id,
        bloodRequest.id
      );

      assert.strictEqual(preReleaseCandidates.isReleased, false);
      assert.strictEqual(preReleaseCandidates.candidates.length, 0);

      // Competing Blood Bank is rejected
      await assert.rejects(
        async () => {
          await AdminMatchingService.getReleasedCandidatesForBloodBank(
            competingUser.id,
            'STAFF',
            orgCompeting.id,
            bloodRequest.id
          );
        },
        /Access denied/i
      );

      recordPass('6. Candidate privacy barrier: Candidates hidden before explicit System Admin release');
    } catch (err: any) {
      recordFail('6. Pre-release candidate boundary', err);
    }

    // -------------------------------------------------------------
    // TEST 7: Explicit System Admin Release & Scoped Access
    // -------------------------------------------------------------
    try {
      const releaseRes = await AdminMatchingService.releaseMatchingCandidates(
        adminUser.id,
        bloodRequest.id,
        [donorProfile.id]
      );

      assert.strictEqual(releaseRes.success, true);
      assert.strictEqual(releaseRes.matchingRequest.status, 'RELEASED');

      // Requesting Blood Bank now receives released candidates (phone masked prior to acceptance)
      const postRelease = await AdminMatchingService.getReleasedCandidatesForBloodBank(
        clinicalUser.id,
        'STAFF',
        orgDesignated.id,
        bloodRequest.id
      );

      assert.strictEqual(postRelease.isReleased, true);
      assert.strictEqual(postRelease.candidates.length, 1);
      assert.strictEqual(postRelease.candidates[0].contactNumber, null, 'Phone must remain masked before acceptance');

      recordPass('7. System Admin explicitly releases candidate list; phone masked under bilateral privacy');
    } catch (err: any) {
      recordFail('7. Candidate release and privacy scoping', err);
    }

    // -------------------------------------------------------------
    // TEST 8: Blood Bank Dispatches Official Invitation
    // -------------------------------------------------------------
    try {
      const inviteRes = await HospitalIntegrationService.inviteDonorCandidates(
        clinicalUser.id,
        orgDesignated.id,
        bloodRequest.id,
        [donorProfile.id]
      );

      assert.strictEqual(inviteRes.success, true);
      assert.strictEqual(inviteRes.invitedCount, 1);
      recordPass('8. Blood Bank dispatches official invitation directing donor to accredited blood centre');
    } catch (err: any) {
      recordFail('8. Invitation dispatch', err);
    }

    // -------------------------------------------------------------
    // TEST 9: Donor Explicit Acceptance Unlocks Bilateral Contact
    // -------------------------------------------------------------
    try {
      const response = await prisma.donorResponse.update({
        where: { requestId_donorId: { requestId: bloodRequest.id, donorId: donorProfile.id } },
        data: { status: 'ACCEPTED', disclosureAuthorized: true, respondedAt: new Date() },
      });

      assert.strictEqual(response.status, 'ACCEPTED');

      // Now blood bank query discloses donor phone
      const postAcceptCandidates = await AdminMatchingService.getReleasedCandidatesForBloodBank(
        clinicalUser.id,
        'STAFF',
        orgDesignated.id,
        bloodRequest.id
      );
      assert.strictEqual(postAcceptCandidates.candidates[0].contactNumber, testDonorPhone);

      recordPass('9. Donor explicit acceptance unmasks contact number to designated blood centre only');
    } catch (err: any) {
      recordFail('9. Donor acceptance and bilateral disclosure', err);
    }

    // -------------------------------------------------------------
    // TEST 10: Donor Arrival & Identity Verification
    // -------------------------------------------------------------
    try {
      arrivalRes = await HospitalIntegrationService.recordDonorArrival(
        clinicalUser.id,
        orgDesignated.id,
        bloodRequest.id,
        donorProfile.id
      );

      assert.strictEqual(arrivalRes.success, true);
      assert.strictEqual(arrivalRes.donorIntake.intakeStatus, 'ARRIVED');
      recordPass('10. Donor arrival and identity verified at designated centre session');
    } catch (err: any) {
      recordFail('10. Donor arrival check-in', err);
    }

    // -------------------------------------------------------------
    // TEST 11: Clinical Assessment Role Gate (Non-clinical blocked)
    // -------------------------------------------------------------
    try {
      // Phlebotomy staff cannot perform medical assessment
      await assert.rejects(
        async () => {
          await HospitalIntegrationService.recordIntakeClinicalScreening(
            phlebUser.id,
            orgDesignated.id,
            bloodRequest.id,
            { attendanceId: arrivalRes.attendanceId, consentGiven: true, eligibilityDecision: 'CLEARED' }
          );
        },
        /Clinical assessment strictly requires authorized CLINICAL_STAFF role/i
      );

      // Authorized CLINICAL_STAFF records clearance
      const screeningRes = await HospitalIntegrationService.recordIntakeClinicalScreening(
        clinicalUser.id,
        orgDesignated.id,
        bloodRequest.id,
        {
          attendanceId: arrivalRes.attendanceId,
          consentGiven: true,
          consentVersion: 'v2026.1',
          eligibilityDecision: 'CLEARED',
          clinicalNotes: 'Hb 13.8 g/dL, pulse 76, BP 118/78. Cleared.',
        }
      );

      assert.strictEqual(screeningRes.success, true);
      assert.strictEqual(screeningRes.intakeStatus, 'CLEARED');
      recordPass('11. Clinical role gate enforced: Only CLINICAL_STAFF can record assessment and consent');
    } catch (err: any) {
      recordFail('11. Clinical assessment role gate', err);
    }

    // -------------------------------------------------------------
    // TEST 12: Phlebotomy Collection Creates QUARANTINED Component
    // -------------------------------------------------------------
    try {
      const collectionRes = await HospitalIntegrationService.recordIntakeCollectionAndComponent(
        phlebUser.id,
        orgDesignated.id,
        bloodRequest.id,
        {
          attendanceId: arrivalRes.attendanceId,
          bloodGroup: 'B_POS',
          volumeMl: 450,
          bagIdentifier: `BAG-${timestamp}-001`,
          componentType: 'PRBC',
          notes: 'Standard 450ml CPD collection completed.',
        }
      );

      assert.strictEqual(collectionRes.success, true);
      assert.strictEqual(collectionRes.componentUnit.status, 'QUARANTINED');
      compId = collectionRes.componentUnit.id;

      // Ensure quarantined unit cannot be allocated
      await assert.rejects(
        async () => {
          await HospitalIntegrationService.allocateReleasedComponentToRequest(
            clinicalUser.id,
            orgDesignated.id,
            bloodRequest.id,
            compId
          );
        },
        /Component .* is in 'QUARANTINED' status/i
      );

      recordPass('12. Phlebotomy collection creates QUARANTINED unit; allocation blocked during quarantine');
    } catch (err: any) {
      recordFail('12. Phlebotomy collection and quarantine gate', err);
    }

    // -------------------------------------------------------------
    // TEST 13: Laboratory Testing Panel & Authorized Clinical Release
    // -------------------------------------------------------------
    try {
      const callerLab = { id: labUser.id, role: 'STAFF', name: labUser.name };
      const callerClinical = { id: clinicalUser.id, role: 'STAFF', name: clinicalUser.name };

      // Record 6 mandatory tests
      const testIds: string[] = [];
      for (const t of MANDATORY_TEST_TYPES) {
        const cat = t === 'ABO_RH_CONFIRMATION' ? 'BLOOD_GROUPING' : 'TTI_SCREENING';
        const rec = await ProcessingAndInventoryService.recordLaboratoryTest(
          orgDesignated.id,
          callerLab,
          {
            componentUnitId: compId,
            category: cat as any,
            testType: t,
            testName: `Protocol ${t}`,
            resultOutcome: 'NON_REACTIVE',
            status: 'PENDING',
          }
        );
        testIds.push(rec.id);
      }

      // Verify each test
      for (const tid of testIds) {
        await ProcessingAndInventoryService.verifyLaboratoryTest(
          orgDesignated.id,
          tid,
          callerClinical,
          { verificationNotes: 'QC passed' }
        );
      }

      // Record Clinical Release
      const releaseRes = await ProcessingAndInventoryService.recordClinicalRelease(
        orgDesignated.id,
        compId,
        callerClinical,
        {
          decision: 'RELEASED',
          reason: 'Complete mandatory TTI panel non-reactive, ABO/Rh confirmed B+',
          clinicalProtocolRef: 'NBTC Schedule F(K) Standards',
        }
      );

      assert.strictEqual(releaseRes.component.status, 'AVAILABLE');
      recordPass('13. 6 mandatory TTI & ABO tests verified; CLINICAL_STAFF releases unit to AVAILABLE stock');
    } catch (err: any) {
      recordFail('13. Laboratory testing and clinical release', err);
    }

    // -------------------------------------------------------------
    // TEST 14: Allocation to Shortfall, Dispatch & Dual Receipt
    // -------------------------------------------------------------
    try {
      // Allocate released unit to request
      const allocRes = await HospitalIntegrationService.allocateReleasedComponentToRequest(
        clinicalUser.id,
        orgDesignated.id,
        bloodRequest.id,
        compId
      );

      assert.strictEqual(allocRes.success, true);
      assert.strictEqual(allocRes.shortfallCount, 0);

      // Dispatch request
      const dispatchRes = await HospitalIntegrationService.dispatchRequest(
        clinicalUser.id,
        orgDesignated.id,
        bloodRequest.id,
        {
          courierName: 'Pune Cold Courier Services',
          vehicleNumber: 'MH-12-CD-5050',
          coldBoxTempCelsius: 3.9,
          notes: 'Pre-conditioned insulated box with temp monitor',
        }
      );
      assert.strictEqual(dispatchRes.success, true);

      // Dual confirmations: Patient and Hospital Bedside staff
      const patientAck = await HospitalIntegrationService.confirmReceipt(
        patientUser.id,
        bloodRequest.id,
        'Blood unit delivered to hospital ward.',
        false // patient confirmation
      );
      assert.strictEqual(patientAck.success, true);

      const hospitalAck = await HospitalIntegrationService.confirmReceipt(
        clinicalUser.id,
        bloodRequest.id,
        'Crossmatch and bedside verification complete.',
        true // hospital staff confirmation
      );
      assert.strictEqual(hospitalAck.success, true);
      assert.strictEqual(hospitalAck.isFullyFulfilled, true);

      const finalReq = await prisma.bloodRequest.findUniqueOrThrow({ where: { id: bloodRequest.id } });
      assert.strictEqual(finalReq.status, 'CLOSED');
      assert.strictEqual(finalReq.closureOutcome, 'FULFILLED');

      recordPass('14. Component allocated to shortfall, dispatched in cold chain, dual receipt completed');
    } catch (err: any) {
      recordFail('14. Shortfall allocation, dispatch, and dual receipt', err);
    }

    // -------------------------------------------------------------
    // TEST 15: Regulatory End-to-End Traceability Lineage
    // -------------------------------------------------------------
    try {
      const lineage = await HospitalIntegrationService.getBloodRequestTraceability(
        clinicalUser.id,
        orgDesignated.id,
        bloodRequest.id
      );

      assert.strictEqual(lineage.request.id, bloodRequest.id);
      assert.strictEqual(lineage.request.shortfallCount, 0);
      assert.ok(lineage.matching, 'Expected matching section');
      assert.ok(lineage.invitations.length > 0, 'Expected invitations');
      assert.ok(lineage.donorIntake, 'Expected donor intake');
      assert.ok(lineage.clinicalScreening, 'Expected clinical screening');
      assert.ok(lineage.collectionUnit, 'Expected collection unit');
      assert.strictEqual(lineage.laboratoryTests.length, 6, 'Expected 6 verified tests');
      assert.ok(lineage.clinicalRelease, 'Expected clinical release');
      assert.ok(lineage.componentUnit, 'Expected component unit');
      assert.ok(lineage.hospitalIssueOrder, 'Expected issue order');
      assert.strictEqual(lineage.dualReceiptConfirmation?.isPatientAcknowledged, true);
      assert.strictEqual(lineage.dualReceiptConfirmation?.isHospitalReceived, true);

      recordPass('15. 10-stage regulatory traceability lineage returns uninterrupted audit trail');
    } catch (err: any) {
      recordFail('15. End-to-end traceability lineage', err);
    }

    console.log('\n====================================================================');
    console.log(`📊 E2E Workflow Verification Summary: ${passed} Passed, ${failed} Failed`);
    console.log('====================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Unhandled failure during E2E verification:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runWorkflowVerification();
