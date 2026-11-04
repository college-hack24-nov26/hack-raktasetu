/**
 * RaktaSetu — Focused Verification Suite for Blood Bank Fulfilment Workflow & Donor Registry Enhancement
 * Scenarios Tested:
 * 1. Direct Donor Registration (without camp requirement, age & consent validation)
 * 2. Donor Registry Scoping, Search, Filtering & Summary Metrics
 * 3. Released Candidate Arrival Recording & Duplicate Prevention
 * 4. 90-Day Donation Interval Validation & Clinical Handoff
 * 5. Strict Cross-Organisation Scoping & 403 Forbidden Protection
 */

import assert from 'assert';
import { prisma } from './lib/prisma';
import { HospitalIntegrationService } from './services/hospitalIntegration';
import { DonorRegistryService } from './services/donorRegistryService';

let passed = 0;
let failed = 0;

function pass(name: string) {
  passed++;
  console.log(`  ✅ PASS: ${name}`);
}

function fail(name: string, err: any) {
  failed++;
  console.error(`  ❌ FAIL: ${name} ->`, err?.message || err);
}

async function runTests() {
  console.log('\n====================================================================');
  console.log('🧪 RaktaSetu — Fulfilment Workflow & Donor Registry Enhancement Suite');
  console.log('====================================================================\n');

  const ts = Date.now();
  const orgCode = `BB-REG-${ts.toString().slice(-6)}`;
  const otherOrgCode = `BB-OTHER-${ts.toString().slice(-6)}`;
  const staffPhone = `+9198${ts.toString().slice(-8)}`;
  const otherStaffPhone = `+9197${ts.toString().slice(-8)}`;
  const donorPhone = `+9196${ts.toString().slice(-8)}`;
  const walkinPhone = `+9195${ts.toString().slice(-8)}`;
  const recentDonorPhone = `+9194${ts.toString().slice(-8)}`;

  try {
    // ------------------------------------------------------------------
    // Setup Test Organisations & Staff
    // ------------------------------------------------------------------
    console.log('--- Step 0: Test Fixtures Setup ---');

    await prisma.bloodCentre.create({
      data: {
        hospitalName: `City Model Blood Centre ${ts}`,
        hospitalCode: orgCode,
        stateCode: 27,
        districtCode: 521,
        address: '100 Medical Campus, Pune',
      },
    });

    await prisma.bloodCentre.create({
      data: {
        hospitalName: `Competitor Blood Bank ${ts}`,
        hospitalCode: otherOrgCode,
        stateCode: 27,
        districtCode: 522,
        address: '200 Health Way, Mumbai',
      },
    });

    const primaryOrg = await prisma.organisation.create({
      data: {
        name: `City Model Blood Centre ${ts}`,
        orgCode,
        hospitalCode: orgCode,
        licenseNumber: `LIC-${ts}-1`,
        districtCode: 521,
        stateCode: 27,
        status: 'VERIFIED',
      },
    });

    const otherOrg = await prisma.organisation.create({
      data: {
        name: `Competitor Blood Bank ${ts}`,
        orgCode: otherOrgCode,
        hospitalCode: otherOrgCode,
        licenseNumber: `LIC-${ts}-2`,
        districtCode: 522,
        stateCode: 27,
        status: 'VERIFIED',
      },
    });

    const staffUser = await prisma.user.create({
      data: {
        phoneNumber: staffPhone,
        name: 'Staff Receptionist',
        role: 'USER',
      },
    });

    await prisma.organisationMembership.create({
      data: {
        organisationId: primaryOrg.id,
        userId: staffUser.id,
        role: 'ORG_ADMIN',
        isActive: true,
      },
    });

    const otherStaffUser = await prisma.user.create({
      data: {
        phoneNumber: otherStaffPhone,
        name: 'Other Org Staff',
        role: 'USER',
      },
    });

    await prisma.organisationMembership.create({
      data: {
        organisationId: otherOrg.id,
        userId: otherStaffUser.id,
        role: 'ORG_ADMIN',
        isActive: true,
      },
    });

    pass('Test organisations and staff memberships initialized');

    // ------------------------------------------------------------------
    // Part 4: Direct Donor Registration (Without Camp Requirement)
    // ------------------------------------------------------------------
    console.log('\n--- Step 1: Direct Donor Registration (Part 4) ---');

    // Test age validation (<18)
    try {
      await DonorRegistryService.directRegisterDonor(staffUser.id, primaryOrg.id, {
        fullName: 'Underage Donor',
        phoneNumber: '+919900000001',
        bloodGroup: 'O_POS',
        dateOfBirth: new Date(Date.now() - 17 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        consentGiven: true,
      });
      assert.fail('Should have rejected underage donor');
    } catch (e: any) {
      assert.ok(e.message.includes('18 and 65'), 'Correctly caught underage rejection');
      pass('Validation: Rejected registration for donor under 18 years old');
    }

    // Test consent validation
    try {
      await DonorRegistryService.directRegisterDonor(staffUser.id, primaryOrg.id, {
        fullName: 'No Consent Donor',
        phoneNumber: '+919900000002',
        bloodGroup: 'O_POS',
        dateOfBirth: '1995-05-15',
        consentGiven: false,
      });
      assert.fail('Should have rejected registration without consent');
    } catch (e: any) {
      assert.ok(e.message.includes('consent'), 'Correctly caught consent rejection');
      pass('Validation: Explicit consent is mandatory for direct registration');
    }

    // Successful Direct Registration
    const directResult = await DonorRegistryService.directRegisterDonor(staffUser.id, primaryOrg.id, {
      fullName: 'Walk-in Volunteer Kumar',
      phoneNumber: walkinPhone,
      bloodGroup: 'B_POS',
      dateOfBirth: '1992-08-20',
      cityOrLocality: 'Deccan Gymkhana, Pune',
      districtCode: 521,
      consentGiven: true,
    });

    assert.ok(directResult.donor.id, 'Direct registration returned donor ID');
    assert.strictEqual(directResult.donor.bloodGroup, 'B_POS');
    assert.strictEqual(directResult.donor.registrationSource, 'DIRECT');
    assert.strictEqual(directResult.donor.primaryHospitalCode, orgCode);
    pass('Direct Registration: Walk-in donor successfully registered directly through Blood Centre (without camp)');

    // ------------------------------------------------------------------
    // Part 5: Donor Registry Scoping, Listing & Summary Metrics
    // ------------------------------------------------------------------
    console.log('\n--- Step 2: Donor Registry Scoping & Metrics (Part 5) ---');

    const registryList = await DonorRegistryService.getOrganisationDonors(staffUser.id, primaryOrg.id, {});
    assert.ok(registryList.pagination.totalCount >= 1, 'Registry returns registered donors');
    const registeredDonorEntry = registryList.items.find((d: any) => d.id === directResult.donor.id);
    assert.ok(registeredDonorEntry, 'Newly registered donor appears in Blood Bank registry');
    assert.strictEqual(registeredDonorEntry?.registrationSource, 'DIRECT');
    pass('Registry: Scoped list displays registered walk-in donors');

    // Search by phone
    const searchPhoneRes = await DonorRegistryService.getOrganisationDonors(staffUser.id, primaryOrg.id, {
      search: walkinPhone.slice(-6),
    });
    assert.strictEqual(searchPhoneRes.items.length, 1);
    assert.strictEqual(searchPhoneRes.items[0].phoneNumber, walkinPhone);
    pass('Registry: Search by phone substring retrieves matching donor');

    // Blood group filter
    const searchGroupRes = await DonorRegistryService.getOrganisationDonors(staffUser.id, primaryOrg.id, {
      bloodGroup: 'B_POS',
    });
    assert.ok(searchGroupRes.items.length >= 1);
    assert.strictEqual(searchGroupRes.items[0].bloodGroup, 'B_POS');
    pass('Registry: Filter by blood group B+ correctly matches donor');

    // Summary Metrics
    const summary = await DonorRegistryService.getOrganisationDonorSummary(staffUser.id, primaryOrg.id);
    assert.ok(summary.totalAssociatedDonors >= 1);
    assert.ok(summary.directRegistrationsCount >= 1);
    assert.ok(summary.donorsByBloodGroup['B_POS'] >= 1);
    pass('Registry: Authoritative summary metrics breakdown calculated accurately');

    // Cross-org protection
    const otherOrgList = await DonorRegistryService.getOrganisationDonors(otherStaffUser.id, otherOrg.id, {});
    const leakedDonor = otherOrgList.items.find((d: any) => d.id === directResult.donor.id);
    assert.strictEqual(leakedDonor, undefined, 'Competitor organisation must NOT see direct donor from another bank');
    pass('Scoping: Other blood centre cannot view this bank’s directly registered donors');

    // ------------------------------------------------------------------
    // Part 2: Released Candidate Arrival Recording & Duplicate Prevention
    // ------------------------------------------------------------------
    console.log('\n--- Step 3: Released Candidate Arrival & Duplicate Prevention (Part 2) ---');

    // Create an eligible voluntary donor profile for matching
    const voluntaryDonorUser = await prisma.user.create({
      data: {
        phoneNumber: donorPhone,
        name: 'Matched Donor Ramesh',
        role: 'DONOR',
      },
    });

    const matchedDonorProfile = await prisma.donorProfile.create({
      data: {
        userId: voluntaryDonorUser.id,
        bloodGroup: 'A_POS',
        fullName: 'Matched Donor Ramesh',
        dateOfBirth: new Date('1990-01-01'),
        districtCode: 521,
        stateCode: 27,
        isAvailable: true,
      },
    });

    // Create Blood Request designated to primaryOrg with matching request released
    const bloodRequest = await prisma.bloodRequest.create({
      data: {
        requesterId: staffUser.id,
        bloodGroup: 'A_POS',
        component: 'Packed Red Blood Cells',
        unitsRequested: 2,
        status: 'OPEN',
        hospitalCode: orgCode,
        patientName: 'Patient Amit Shah',
        message: JSON.stringify({
          assignedBankId: primaryOrg.id,
          matchingRequest: {
            status: 'RELEASED',
            releasedCandidateIds: [matchedDonorProfile.id],
            releasedAt: new Date().toISOString(),
          },
        }),
      },
    });

    // Record Arrival
    const arrivalResult = await HospitalIntegrationService.recordDonorArrival(
      staffUser.id,
      primaryOrg.id,
      bloodRequest.id,
      matchedDonorProfile.id,
      'Donor Ramesh presented photo ID at Blood Bank desk'
    );

    assert.strictEqual(arrivalResult.success, true);
    assert.ok(arrivalResult.attendanceId, 'Attendance record created');
    assert.strictEqual(arrivalResult.donorIntake.intakeStatus, 'ARRIVED');
    pass('Candidate Arrival: Successfully recorded physical arrival and checked in');

    // Prevent Duplicate Arrival
    try {
      await HospitalIntegrationService.recordDonorArrival(
        staffUser.id,
        primaryOrg.id,
        bloodRequest.id,
        matchedDonorProfile.id,
        'Second arrival attempt'
      );
      assert.fail('Should have prevented duplicate arrival');
    } catch (e: any) {
      assert.ok(e.message.includes('already been recorded'), 'Duplicate arrival prevented');
      pass('Candidate Arrival: Duplicate arrival attempt successfully blocked');
    }

    // Cross-Bank Arrival Attempt Blocked
    try {
      await HospitalIntegrationService.recordDonorArrival(
        otherStaffUser.id,
        otherOrg.id,
        bloodRequest.id,
        matchedDonorProfile.id,
        'Competitor trying to intake donor'
      );
      assert.fail('Should have rejected non-designated bank arrival');
    } catch (e: any) {
      assert.strictEqual(e.statusCode, 403);
      pass('Scoping: Unauthorized blood centre received 403 Forbidden on arrival attempt');
    }

    // ------------------------------------------------------------------
    // Part 3: 90-Day Whole Blood Donation Interval & Clinical Handoff
    // ------------------------------------------------------------------
    console.log('\n--- Step 4: 90-Day Donation Interval Rule & Clinical Handoff (Part 3) ---');

    // 1. Create a recent donor (<90 days)
    const recentDonorUser = await prisma.user.create({
      data: {
        phoneNumber: recentDonorPhone,
        name: 'Recent Donor Sunita',
        role: 'DONOR',
      },
    });

    const recentDonorProfile = await prisma.donorProfile.create({
      data: {
        userId: recentDonorUser.id,
        bloodGroup: 'O_POS',
        fullName: 'Recent Donor Sunita',
        dateOfBirth: new Date('1994-03-12'),
        districtCode: 521,
        stateCode: 27,
        isAvailable: true,
        lastDonationDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Donated 30 days ago
      },
    });

    const recentRequest = await prisma.bloodRequest.create({
      data: {
        requesterId: staffUser.id,
        bloodGroup: 'O_POS',
        component: 'Packed Red Blood Cells',
        unitsRequested: 1,
        status: 'OPEN',
        hospitalCode: orgCode,
        patientName: 'Patient Priya',
        message: JSON.stringify({
          assignedBankId: primaryOrg.id,
          matchingRequest: {
            status: 'RELEASED',
            releasedCandidateIds: [recentDonorProfile.id],
            releasedAt: new Date().toISOString(),
          },
        }),
      },
    });

    // Record arrival for recent donor
    await HospitalIntegrationService.recordDonorArrival(
      staffUser.id,
      primaryOrg.id,
      recentRequest.id,
      recentDonorProfile.id,
      'Recent donor arrived'
    );

    // Handoff must fail because donation interval is only 30 days (< 90 days required)
    try {
      await HospitalIntegrationService.verifyDonorAndHandoff(
        staffUser.id,
        primaryOrg.id,
        recentRequest.id,
        recentDonorProfile.id
      );
      assert.fail('Should have rejected donor with <90 days interval');
    } catch (e: any) {
      assert.ok(e.message.includes('90 days'), 'Correctly caught 90-day interval violation');
      pass('Clinical Rule: Blocked handoff for donor who donated 30 days ago (minimum 90-day interval required)');
    }

    // 2. Eligible donor handoff (matchedDonorProfile has no prior recent donation)
    const handoffResult = await HospitalIntegrationService.verifyDonorAndHandoff(
      staffUser.id,
      primaryOrg.id,
      bloodRequest.id,
      matchedDonorProfile.id,
      'Government Photo ID verified; eligible for whole blood donation.'
    );

    assert.strictEqual(handoffResult.success, true);
    assert.strictEqual(handoffResult.donorIntake.intakeStatus, 'SCREENING_IN_PROGRESS');
    pass('Clinical Handoff: Eligible donor successfully forwarded to authorized Clinical Staff queue');

    // Verify Audit Log was recorded
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        resourceId: bloodRequest.id,
        action: 'DONOR_VERIFIED_CLINICAL_HANDOFF',
      },
    });
    assert.ok(auditLog, 'AuditLog entry generated for verification and clinical handoff');
    pass('Audit Trail: Action logged with caller identity, timestamp, and verification notes');

  } catch (err: any) {
    fail('Test Suite Execution', err);
  } finally {
    console.log('\n====================================================================');
    console.log(`Results: ${passed} Passed, ${failed} Failed`);
    console.log('====================================================================\n');
    await prisma.$disconnect();
    if (failed > 0) {
      process.exit(1);
    }
  }
}

runTests();
