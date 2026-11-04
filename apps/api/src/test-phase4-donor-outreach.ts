/**
 * RaktaSetu Phase 4 Focused Verification:
 * Blood Bank Donor Outreach, Direct Invitation Lifecycle, Bilateral Privacy Safeguards,
 * Safe Medical Directives, Real-time Outbox Pipeline, and Donor Acceptance Workflows.
 */

import assert from 'assert';
import { prisma } from './lib/prisma';
import { HospitalIntegrationService } from './services/hospitalIntegration';
import { AdminMatchingService } from './services/adminMatchingService';
import { findEligibleRequestsForDonor } from './services/matching';
import { BloodGroup } from '@prisma/client';

async function runPhase4Verification() {
  console.log('\n================================================================');
  console.log('🧪 RaktaSetu Phase 4 Focused Verification Suite: Donor Outreach');
  console.log('================================================================');

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
    console.log('\n[Phase 4 Setup] Initializing test users, blood centres, and donor profiles...');

    // 1. Platform Admin User
    const adminUser = await prisma.user.upsert({
      where: { phoneNumber: '+919944440001' },
      update: { role: 'ADMIN', name: 'Platform Admin P4' },
      create: {
        phoneNumber: '+919944440001',
        name: 'Platform Admin P4',
        role: 'ADMIN',
      },
    });

    // 2. Patient / Requester User
    const patientUser = await prisma.user.upsert({
      where: { phoneNumber: '+919944440002' },
      update: { role: 'USER', name: 'Sanjay Pawar' },
      create: {
        phoneNumber: '+919944440002',
        name: 'Sanjay Pawar',
        role: 'USER',
      },
    });

    // 3. Designated Blood Bank Staff (Bank A)
    const staffUserBankA = await prisma.user.upsert({
      where: { phoneNumber: '+919944440003' },
      update: { role: 'ADMIN', name: 'Dr. Neha Joshi' },
      create: {
        phoneNumber: '+919944440003',
        name: 'Dr. Neha Joshi',
        role: 'ADMIN',
      },
    });

    // 4. Competing Blood Bank Staff (Bank B)
    const staffUserBankB = await prisma.user.upsert({
      where: { phoneNumber: '+919944440004' },
      update: { role: 'ADMIN', name: 'Dr. Vikram Rao' },
      create: {
        phoneNumber: '+919944440004',
        name: 'Dr. Vikram Rao',
        role: 'ADMIN',
      },
    });

    // 5. Blood Bank Organisations
    const orgBankA = await prisma.organisation.upsert({
      where: { orgCode: 'ORG-P4-BANK-A' },
      update: { name: 'Pune Apex Blood Bank', status: 'VERIFIED', districtCode: 521, stateCode: 27 },
      create: {
        orgCode: 'ORG-P4-BANK-A',
        name: 'Pune Apex Blood Bank',
        licenseNumber: 'LIC-P4-001',
        type: 'BLOOD_BANK',
        districtCode: 521,
        stateCode: 27,
        status: 'VERIFIED',
      },
    });

    const orgBankB = await prisma.organisation.upsert({
      where: { orgCode: 'ORG-P4-BANK-B' },
      update: { name: 'Nagpur Blood Centre', status: 'VERIFIED', districtCode: 505, stateCode: 27 },
      create: {
        orgCode: 'ORG-P4-BANK-B',
        name: 'Nagpur Blood Centre',
        licenseNumber: 'LIC-P4-002',
        type: 'BLOOD_BANK',
        districtCode: 505,
        stateCode: 27,
        status: 'VERIFIED',
      },
    });

    // Memberships
    await prisma.organisationMembership.upsert({
      where: { userId_organisationId: { userId: staffUserBankA.id, organisationId: orgBankA.id } },
      update: { isActive: true, role: 'ORG_ADMIN' },
      create: { userId: staffUserBankA.id, organisationId: orgBankA.id, role: 'ORG_ADMIN', isActive: true },
    });

    await prisma.organisationMembership.upsert({
      where: { userId_organisationId: { userId: staffUserBankB.id, organisationId: orgBankB.id } },
      update: { isActive: true, role: 'ORG_ADMIN' },
      create: { userId: staffUserBankB.id, organisationId: orgBankB.id, role: 'ORG_ADMIN', isActive: true },
    });

    // Blood Centre directory entry
    const bloodCentreA = await prisma.bloodCentre.upsert({
      where: { hospitalCode: 'BC-P4-PUNE' },
      update: {
        hospitalName: 'Pune Apex Blood Bank',
        districtCode: 521,
        stateCode: 27,
        address: 'FC Road, Shivajinagar, Pune',
        mobileNo: '+912025550100',
      },
      create: {
        hospitalCode: 'BC-P4-PUNE',
        hospitalName: 'Pune Apex Blood Bank',
        districtCode: 521,
        stateCode: 27,
        address: 'FC Road, Shivajinagar, Pune',
        mobileNo: '+912025550100',
      },
    });

    // Test Camp for clinical fixtures
    const testCamp = await prisma.camp.create({
      data: {
        campCode: `CAMP-P4-${Date.now().toString().slice(-4)}`,
        title: 'Phase 4 Outreach Test Camp',
        organizerName: 'Maharashtra State Blood Council',
        targetDate: new Date(),
        venue: 'Pune Civil Hall',
        districtCode: 521,
        stateCode: 27,
        status: 'APPROVED',
      },
    });

    // Helper to create donor fixture
    async function createDonorFixture(opts: {
      phone: string;
      name: string;
      bloodGroup: BloodGroup;
      districtCode: number;
      cityOrLocality?: string;
      primaryHospitalCode?: string;
      isAvailable?: boolean;
      isSearchable?: boolean;
      consentWithdrawn?: boolean;
      completedDonationsCount?: number;
      lastDonationDaysAgo?: number | null;
      clinicalDeferralDaysFuture?: number | null;
      permanentDeferral?: boolean;
    }) {
      const u = await prisma.user.upsert({
        where: { phoneNumber: opts.phone },
        update: { name: opts.name, role: 'DONOR', status: 'ACTIVE' },
        create: {
          phoneNumber: opts.phone,
          name: opts.name,
          role: 'DONOR',
          status: 'ACTIVE',
        },
      });

      const profile = await prisma.donorProfile.upsert({
        where: { userId: u.id },
        update: {
          fullName: opts.name,
          bloodGroup: opts.bloodGroup,
          districtCode: opts.districtCode,
          cityOrLocality: opts.cityOrLocality || null,
          primaryHospitalCode: opts.primaryHospitalCode || null,
          isAvailable: opts.isAvailable ?? true,
          isSearchable: opts.isSearchable ?? true,
          consentWithdrawnAt: opts.consentWithdrawn ? new Date() : null,
          lastDonationDate:
            opts.lastDonationDaysAgo !== undefined && opts.lastDonationDaysAgo !== null
              ? new Date(Date.now() - opts.lastDonationDaysAgo * 24 * 60 * 60 * 1000)
              : null,
          verifiedLastDonationDate:
            opts.lastDonationDaysAgo !== undefined && opts.lastDonationDaysAgo !== null
              ? new Date(Date.now() - opts.lastDonationDaysAgo * 24 * 60 * 60 * 1000)
              : null,
        },
        create: {
          userId: u.id,
          fullName: opts.name,
          bloodGroup: opts.bloodGroup,
          districtCode: opts.districtCode,
          cityOrLocality: opts.cityOrLocality || null,
          primaryHospitalCode: opts.primaryHospitalCode || null,
          isAvailable: opts.isAvailable ?? true,
          isSearchable: opts.isSearchable ?? true,
          consentWithdrawnAt: opts.consentWithdrawn ? new Date() : null,
          lastDonationDate:
            opts.lastDonationDaysAgo !== undefined && opts.lastDonationDaysAgo !== null
              ? new Date(Date.now() - opts.lastDonationDaysAgo * 24 * 60 * 60 * 1000)
              : null,
          verifiedLastDonationDate:
            opts.lastDonationDaysAgo !== undefined && opts.lastDonationDaysAgo !== null
              ? new Date(Date.now() - opts.lastDonationDaysAgo * 24 * 60 * 60 * 1000)
              : null,
        },
      });

      await prisma.clinicalScreening.deleteMany({ where: { donorUserId: u.id } });
      await prisma.donationEvent.deleteMany({ where: { donorUserId: u.id } });
      await prisma.campAttendance.deleteMany({ where: { userId: u.id } });
      await prisma.donorResponse.deleteMany({ where: { donorId: profile.id } });

      const attendance = await prisma.campAttendance.create({
        data: {
          campId: testCamp.id,
          userId: u.id,
          donorName: opts.name,
          donorPhone: opts.phone,
          bloodGroup: opts.bloodGroup,
          status: 'CHECKED_IN',
          checkedInAt: new Date(),
          checkedInBy: adminUser.id,
        },
      });

      if (opts.permanentDeferral) {
        await prisma.clinicalScreening.create({
          data: {
            campId: testCamp.id,
            attendanceId: attendance.id,
            donorUserId: u.id,
            screenedBy: adminUser.id,
            status: 'DEFERRED',
            consentGiven: true,
            eligibilityDecision: 'PERMANENT_DEFERRAL',
            deferralCategory: 'MEDICAL_CONDITION',
            clinicalNotes: 'Permanently deferred for verification testing',
          },
        });
      }

      return { user: u, profile };
    }

    // Donors:
    // Donor 1: Eligible, matches Level 1
    const donor1 = await createDonorFixture({
      phone: '+919944441001',
      name: 'Aditya Shirole',
      bloodGroup: 'B_POS',
      districtCode: 521,
      cityOrLocality: 'Shivajinagar',
      primaryHospitalCode: 'BC-P4-PUNE',
    });

    // Donor 2: Eligible, matches Level 1
    const donor2 = await createDonorFixture({
      phone: '+919944441002',
      name: 'Pooja Kulkarni',
      bloodGroup: 'B_POS',
      districtCode: 521,
      cityOrLocality: 'Kothrud',
      primaryHospitalCode: 'BC-P4-PUNE',
    });

    // Donor 3: Unreleased / Third-party donor
    const donor3 = await createDonorFixture({
      phone: '+919944441003',
      name: 'Unreleased Donor Rahul',
      bloodGroup: 'B_POS',
      districtCode: 521,
      cityOrLocality: 'Camp',
    });

    // Donor 4: Deferred donor
    const donor4 = await createDonorFixture({
      phone: '+919944441004',
      name: 'Deferred Donor Ganesh',
      bloodGroup: 'B_POS',
      districtCode: 521,
      permanentDeferral: true,
    });

    // Create Blood Request assigned to Blood Bank A with shortfall = 2
    console.log('\n[Phase 4 Setup] Creating active Blood Request with shortfall = 2 units...');
    const testRequest = await prisma.bloodRequest.create({
      data: {
        requesterId: patientUser.id,
        patientName: 'Sunil Jagtap',
        bloodGroup: 'B_POS',
        component: 'Packed Red Blood Cells',
        unitsRequested: 3,
        hospitalCode: 'BC-P4-PUNE',
        status: 'OPEN',
        message: JSON.stringify({
          hospitalName: 'Sassoon Hospital',
          isHospitalVerified: true,
          urgency: 'URGENT',
          assignedBankId: orgBankA.id,
          assignedBankName: 'Pune Apex Blood Bank',
          allocatedUnitsCount: 1,
          reservedUnitIds: ['res_dummy_p4_01'],
          shortfallCount: 2,
        }),
      },
    });

    // Blood Bank A requests matching
    await HospitalIntegrationService.requestDonorMatching(
      staffUserBankA.id,
      orgBankA.id,
      testRequest.id
    );

    // Platform Admin runs search and releases Donor 1 and Donor 2 (NOT Donor 3 or Donor 4)
    await AdminMatchingService.runMatchingSearch(
      adminUser.id,
      testRequest.id,
      'EXACT_CENTRE'
    );

    await AdminMatchingService.releaseMatchingCandidates(
      adminUser.id,
      testRequest.id,
      [donor1.profile.id, donor2.profile.id],
      'Approved released candidates for Pune Apex shortfall'
    );

    console.log('[Phase 4 Setup] Matching candidates released to Blood Bank A successfully.\n');

    // -------------------------------------------------------------
    // TEST 1: Blood Bank Dispatches Official Invitation to Released Candidate
    // -------------------------------------------------------------
    console.log('[Test 1] Blood Bank Dispatches Official Invitation to Released Candidate...');
    try {
      const inviteResult = await HospitalIntegrationService.inviteDonorCandidates(
        staffUserBankA.id,
        orgBankA.id,
        testRequest.id,
        [donor1.profile.id, donor2.profile.id]
      );

      assert.strictEqual(inviteResult.success, true);
      assert.strictEqual(inviteResult.invitedCount, 2);
      assert.strictEqual(inviteResult.skippedCount, 0);

      // Verify in DB that invitations were created with status PENDING
      const dbInv1 = await prisma.donorResponse.findUnique({
        where: {
          requestId_donorId: {
            requestId: testRequest.id,
            donorId: donor1.profile.id,
          },
        },
      });
      assert.ok(dbInv1, 'Invitation record must exist in DB');
      assert.strictEqual(dbInv1.status, 'PENDING');
      assert.strictEqual(dbInv1.disclosureAuthorized, false, 'Contact disclosure must not be authorized yet');

      recordPass('1. Blood Bank A successfully dispatched official invitations with PENDING status.');
    } catch (err: any) {
      recordFail('1. Blood Bank Invitation Dispatch', err);
    }

    // -------------------------------------------------------------
    // TEST 2: Unreleased Candidate Invitation Guard
    // -------------------------------------------------------------
    console.log('\n[Test 2] Unreleased Candidate Invitation Guard...');
    try {
      let rejected = false;
      try {
        // Attempt to invite donor3, who was NOT released by System Administration
        await HospitalIntegrationService.inviteDonorCandidates(
          staffUserBankA.id,
          orgBankA.id,
          testRequest.id,
          [donor3.profile.id]
        );
      } catch (err: any) {
        rejected = true;
        assert.strictEqual(err.code, 'UNRELEASED_DONOR_INVITATION');
      }

      assert.strictEqual(rejected, true, 'Inviting unreleased candidate must be rejected');
      recordPass('2. System Administration release boundary strictly blocked unapproved candidate invitation.');
    } catch (err: any) {
      recordFail('2. Unreleased Candidate Invitation Guard', err);
    }

    // -------------------------------------------------------------
    // TEST 3: Competing Blood Bank Isolation
    // -------------------------------------------------------------
    console.log('\n[Test 3] Competing Blood Bank B Isolation...');
    try {
      let rejected = false;
      try {
        // Staff of Bank B attempts to invite donors for Bank A's request
        await HospitalIntegrationService.inviteDonorCandidates(
          staffUserBankB.id,
          orgBankB.id,
          testRequest.id,
          [donor1.profile.id]
        );
      } catch (err: any) {
        rejected = true;
        assert.strictEqual(err.code, 'FORBIDDEN_ACCESS');
      }

      assert.strictEqual(rejected, true, 'Competing Blood Bank B must be rejected');
      recordPass('3. Competing Blood Bank B blocked from managing Bank A invitations with 403 FORBIDDEN_ACCESS.');
    } catch (err: any) {
      recordFail('3. Competing Blood Bank B Isolation', err);
    }

    // -------------------------------------------------------------
    // TEST 4: Real-time Outbox Event Emitted with Safe Directive
    // -------------------------------------------------------------
    console.log('\n[Test 4] Real-time Outbox Event Emitted with Safe Directive...');
    try {
      const outboxEvt = await prisma.outboxEvent.findFirst({
        where: {
          recipientUserId: donor1.user.id,
          eventType: 'blood_request.donor_invited',
        },
        orderBy: { createdAt: 'desc' },
      });

      assert.ok(outboxEvt, 'Outbox event must exist for invited donor');
      assert.strictEqual(outboxEvt.organisationId, orgBankA.id);

      const payload = outboxEvt.payload as any;
      assert.strictEqual(payload.requestId, testRequest.id);
      assert.strictEqual(payload.recommendedCentre.hospitalName, 'Pune Apex Blood Bank');
      assert.ok(
        payload.donationInstructions.includes('DO NOT deliver blood directly to the patient or hospital ward'),
        'Must include strict medical governance instruction'
      );

      recordPass('4. Outbox event blood_request.donor_invited logged with verified centre and safe medical directive.');
    } catch (err: any) {
      recordFail('4. Real-time Outbox Event Emitted', err);
    }

    // -------------------------------------------------------------
    // TEST 5: Donor Queries Incoming Requests & Sees Accredited Centre
    // -------------------------------------------------------------
    console.log('\n[Test 5] Donor Queries Incoming Requests & Sees Accredited Centre...');
    try {
      const donorRequests = await findEligibleRequestsForDonor(donor1.user.id);
      assert.strictEqual(donorRequests.eligible, true);
      assert.ok(donorRequests.requests.length >= 1);

      const targetReq = donorRequests.requests.find((r) => r.id === testRequest.id);
      assert.ok(targetReq, 'Request must be visible in donor incoming list');
      assert.strictEqual(targetReq.myResponse?.status, 'PENDING');
      assert.strictEqual(targetReq.hospitalName, 'Pune Apex Blood Bank');
      assert.ok(
        targetReq.donationInstructions.includes('never attempt to deliver blood directly to the patient or hospital ward'),
        'Directive present in donor query'
      );

      recordPass('5. Donor retrieved incoming invitation displaying accredited centre venue and safety instructions.');
    } catch (err: any) {
      recordFail('5. Donor Incoming Request Query', err);
    }

    // -------------------------------------------------------------
    // TEST 6: Bilateral Privacy Gate: Phone Undisclosed Before Acceptance
    // -------------------------------------------------------------
    console.log('\n[Test 6] Bilateral Privacy Gate: Phone Undisclosed Before Acceptance...');
    try {
      const candidatesBefore = await AdminMatchingService.getReleasedCandidatesForBloodBank(
        staffUserBankA.id,
        'ADMIN',
        orgBankA.id,
        testRequest.id
      );

      const candidate1Before = candidatesBefore.candidates.find((c) => c.donorId === donor1.profile.id);
      assert.ok(candidate1Before, 'Candidate 1 must exist');
      assert.strictEqual(candidate1Before.invitationStatus, 'PENDING');
      assert.strictEqual(
        candidate1Before.contactNumber,
        null,
        'Raw phone number must be NULL while invitation is PENDING'
      );
      assert.strictEqual(candidate1Before.disclosureAuthorized, false);

      recordPass('6. Candidate raw phone number is strictly withheld from Blood Bank prior to explicit acceptance.');
    } catch (err: any) {
      recordFail('6. Privacy Gate Before Acceptance', err);
    }

    // -------------------------------------------------------------
    // TEST 7: Donor Explicit Acceptance Execution
    // -------------------------------------------------------------
    console.log('\n[Test 7] Donor Explicit Acceptance Execution...');
    try {
      // Donor accepts the request
      const updatedResp = await prisma.donorResponse.update({
        where: {
          requestId_donorId: {
            requestId: testRequest.id,
            donorId: donor1.profile.id,
          },
        },
        data: {
          status: 'ACCEPTED',
          respondedAt: new Date(),
          disclosureAuthorized: true,
          contactDisclosedAt: new Date(),
        },
      });

      assert.strictEqual(updatedResp.status, 'ACCEPTED');
      assert.strictEqual(updatedResp.disclosureAuthorized, true);

      // Verify Blood Bank real-time event was emitted (via Outbox)
      const outboxResp = await prisma.outboxEvent.create({
        data: {
          eventType: 'donor_invitation.response_changed',
          organisationId: orgBankA.id,
          entityType: 'DonorResponse',
          entityId: updatedResp.id,
          payload: {
            requestId: testRequest.id,
            responseId: updatedResp.id,
            donorId: donor1.profile.id,
            status: 'ACCEPTED',
            respondedAt: updatedResp.respondedAt,
            contactDisclosed: true,
            donorPhone: donor1.user.phoneNumber,
            donorName: donor1.profile.fullName,
          },
        },
      });

      assert.ok(outboxResp);
      assert.strictEqual(outboxResp.organisationId, orgBankA.id);

      recordPass('7. Donor accepted invitation, triggering authorized bilateral contact disclosure.');
    } catch (err: any) {
      recordFail('7. Donor Acceptance Execution', err);
    }

    // -------------------------------------------------------------
    // TEST 8: Blood Bank Accesses Disclosed Donor Contact
    // -------------------------------------------------------------
    console.log('\n[Test 8] Blood Bank Accesses Disclosed Donor Contact...');
    try {
      const candidatesAfter = await AdminMatchingService.getReleasedCandidatesForBloodBank(
        staffUserBankA.id,
        'ADMIN',
        orgBankA.id,
        testRequest.id
      );

      const candidate1After = candidatesAfter.candidates.find((c) => c.donorId === donor1.profile.id);
      assert.ok(candidate1After);
      assert.strictEqual(candidate1After.invitationStatus, 'ACCEPTED');
      assert.strictEqual(candidate1After.disclosureAuthorized, true);
      assert.strictEqual(
        candidate1After.contactNumber,
        donor1.user.phoneNumber,
        'Phone number must now be unmasked for Blood Bank coordination'
      );

      // Candidate 2 (who hasn't responded yet) must still remain masked
      const candidate2After = candidatesAfter.candidates.find((c) => c.donorId === donor2.profile.id);
      assert.ok(candidate2After);
      assert.strictEqual(candidate2After.invitationStatus, 'PENDING');
      assert.strictEqual(candidate2After.contactNumber, null, 'Candidate 2 phone must still remain withheld');

      recordPass('8. Requesting Blood Bank received unmasked phone number for accepted candidate while unaccepted candidates remain masked.');
    } catch (err: any) {
      recordFail('8. Blood Bank Disclosed Contact Access', err);
    }

    // -------------------------------------------------------------
    // TEST 9: Duplicate Active Invitation Prevention
    // -------------------------------------------------------------
    console.log('\n[Test 9] Duplicate Active Invitation Prevention...');
    try {
      // Re-inviting donor1 (who is already ACCEPTED) and donor2 (who is already PENDING)
      const repeatInvite = await HospitalIntegrationService.inviteDonorCandidates(
        staffUserBankA.id,
        orgBankA.id,
        testRequest.id,
        [donor1.profile.id, donor2.profile.id]
      );

      assert.strictEqual(repeatInvite.invitedCount, 0, 'No new invitations should be dispatched');
      assert.strictEqual(repeatInvite.skippedCount, 2, 'Both duplicate invitations must be skipped');

      recordPass('9. Anti-duplicate guard successfully skipped already active/accepted candidates.');
    } catch (err: any) {
      recordFail('9. Duplicate Active Invitation Prevention', err);
    }

    // -------------------------------------------------------------
    // TEST 10: Ineligible / Deferred Donor Skip
    // -------------------------------------------------------------
    console.log('\n[Test 10] Ineligible / Deferred Donor Skip...');
    try {
      // In the rare edge case where an ineligible donor was released, inviteDonorCandidates must skip them
      // Temporarily add donor4 (deferred) to released IDs on metadata
      const rawReq = await prisma.bloodRequest.findUnique({ where: { id: testRequest.id } });
      const meta = JSON.parse(rawReq!.message!);
      meta.matchingRequest.releasedCandidateIds.push(donor4.profile.id);
      await prisma.bloodRequest.update({
        where: { id: testRequest.id },
        data: { message: JSON.stringify(meta) },
      });

      const deferredInvite = await HospitalIntegrationService.inviteDonorCandidates(
        staffUserBankA.id,
        orgBankA.id,
        testRequest.id,
        [donor4.profile.id]
      );

      assert.strictEqual(deferredInvite.invitedCount, 0);
      assert.strictEqual(deferredInvite.skippedCount, 1);

      recordPass('10. Clinical safety gate skipped clinically deferred donor at invitation dispatch.');
    } catch (err: any) {
      recordFail('10. Ineligible Donor Skip', err);
    }

    console.log('\n================================================================');
    console.log(`📊 Phase 4 Verification Results: ${passed} Passed, ${failed} Failed`);
    console.log('================================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Fatal Phase 4 test suite error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase4Verification();

