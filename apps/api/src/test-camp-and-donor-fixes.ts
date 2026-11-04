import { PrismaClient } from '@prisma/client';
import { OrganisationService } from './services/organisation';
import { DonorRegistrationService } from './services/donorRegistrationService';
import { PdfService } from './services/pdfService';

const prisma = new PrismaClient();

async function runTests() {
  console.log('=================================================================');
  console.log('🧪 RAKTASETU: CAMP APPROVAL & DONOR REGISTRATION VERIFICATION');
  console.log('=================================================================');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, desc: string) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passedTests++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      throw new Error(`Assertion failed: ${desc}`);
    }
  }

  try {
    // 1. Identify Gupta Blood Centre and test users
    const org = await prisma.organisation.findFirst({
      where: {
        OR: [
          { name: { contains: 'Gupta', mode: 'insensitive' } },
          { orgCode: 'MH-PUN-BB-DEMO-TEST-01' }
        ]
      },
      include: {
        memberships: {
          include: { user: true }
        }
      }
    });

    assert(!!org, 'Found Gupta Life Blood Centre in database');
    console.log(`     Org: ${org?.name} (${org?.id}), License: ${org?.licenseNumber}`);

    const creatorUser = org?.memberships.find(m => m.user.name?.includes('Ramesh') || m.role === 'ORG_ADMIN')?.user;
    assert(!!creatorUser, 'Found camp creator user (Dr. Ramesh Gupta)');
    console.log(`     Creator: ${creatorUser?.name} (${creatorUser?.id})`);

    const platformAdmin = await prisma.user.findFirst({
      where: { role: 'ADMIN' }
    });
    assert(!!platformAdmin, 'Found platform admin user');
    console.log(`     Independent Admin: ${platformAdmin?.name} (${platformAdmin?.id})`);

    const clinicalMember = org?.memberships.find(m => m.role === 'CLINICAL_STAFF')?.user;
    assert(!!clinicalMember, 'Found clinical staff member (Dr. Sunita Deshpande)');
    console.log(`     Clinical Staff: ${clinicalMember?.name} (${clinicalMember?.id})`);

    // -------------------------------------------------------------
    // TEST SUITE 1: Camp Approval Conflict of Interest Enforcement
    // -------------------------------------------------------------
    console.log('\n--- 1. Testing Camp Approval & Conflict of Interest Invariant ---');

    // Create a fresh test camp proposal authored by Dr. Ramesh Gupta
    const testCampCode = `TEST-CAMP-${Date.now().toString().slice(-6)}`;
    const testCamp = await prisma.camp.create({
      data: {
        campCode: testCampCode,
        title: `Verification Camp Drive ${testCampCode}`,
        organizerName: 'Community Health Club Pune',
        targetDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        venue: 'Shivaji Nagar Community Hall, Pune',
        district: 'Pune',
        districtCode: 521,
        expectedDonors: 100,
        coordinatorContact: '9876543210',
        status: 'PROPOSED',
        createdById: creatorUser!.id,
        organisationId: org!.id,
      }
    });
    assert(testCamp.status === 'PROPOSED', 'Test camp proposal created with PROPOSED status');

    // Attempt 1: Creator attempts to APPROVE own camp proposal
    let creatorApproveBlocked = false;
    try {
      await OrganisationService.updateCampStatus(testCamp.id, {
        id: creatorUser!.id,
        role: creatorUser!.role,
      }, 'APPROVED');
    } catch (err: any) {
      if (err.message?.includes('Conflict of interest') && err.message?.includes('Camp creator cannot approve or reject')) {
        creatorApproveBlocked = true;
      } else {
        console.error('Unexpected error message on creator approve:', err.message);
      }
    }
    assert(creatorApproveBlocked, 'Camp creator is blocked from approving own camp proposal (Conflict of Interest)');

    // Attempt 2: Creator attempts to REJECT own camp proposal
    let creatorRejectBlocked = false;
    try {
      await OrganisationService.updateCampStatus(testCamp.id, {
        id: creatorUser!.id,
        role: creatorUser!.role,
      }, 'REJECTED', 'Creator trying to self-reject');
    } catch (err: any) {
      if (err.message?.includes('Conflict of interest') && err.message?.includes('Camp creator cannot approve or reject')) {
        creatorRejectBlocked = true;
      } else {
        console.error('Unexpected error message on creator reject:', err.message);
      }
    }
    assert(creatorRejectBlocked, 'Camp creator is blocked from rejecting own camp proposal (Consistent Conflict of Interest)');

    // Attempt 3: Independent Administrator approves the camp
    const approvedCamp = await OrganisationService.updateCampStatus(testCamp.id, {
      id: platformAdmin!.id,
      role: 'ADMIN',
    }, 'APPROVED');
    assert(approvedCamp.status === 'APPROVED', 'Independent parent blood bank administrator successfully approved camp proposal');
    assert(approvedCamp.approvedById === platformAdmin!.id, 'ApprovedById recorded correctly as independent administrator');

    // -------------------------------------------------------------
    // TEST SUITE 2: Clinical Staff Dropdown API
    // -------------------------------------------------------------
    console.log('\n--- 2. Testing Clinical Staff Dropdown API ---');
    const staffList = await DonorRegistrationService.getClinicalStaffForOrganisation(org!.id);
    assert(Array.isArray(staffList) && staffList.length > 0, 'Clinical staff list retrieved from organisation');
    console.log(`     Available staff count: ${staffList.length}`);
    staffList.forEach(s => console.log(`       - ${s.name} (${s.role}, ID: ${s.id})`));

    const hasClinicalOrAdmin = staffList.every(s => s.role === 'CLINICAL_STAFF' || s.role === 'ORG_ADMIN');
    assert(hasClinicalOrAdmin, 'All returned staff have eligible clinical / admin roles');

    // -------------------------------------------------------------
    // TEST SUITE 3: Staff Validation & Registration Persistence
    // -------------------------------------------------------------
    console.log('\n--- 3. Testing Staff Validation & Registration Persistence ---');

    // Cross-org staff rejection test
    let crossOrgRejected = false;
    try {
      await DonorRegistrationService.saveRegistration({
        userId: creatorUser!.id,
        role: creatorUser!.role,
      }, {
        organisationId: org!.id,
        registrationSource: 'CAMP',
        campId: approvedCamp.id,
        donationType: 'VOLUNTARY',
        donorDetails: {
          fullName: 'Test Cross-Org Donor',
          gender: 'Male',
          bloodGroup: 'B_POS',
          dateOfBirth: '1995-05-15',
          primaryMobile: '9123456780',
          address: 'Camp Road, Pune',
          city: 'Pune',
          district: 'Pune',
          state: 'Maharashtra',
        },
        counsellingReviewedById: '00000000-0000-0000-0000-000000000999', // Non-existent user
      });
    } catch (err: any) {
      if (err.message?.includes('authorized clinical staff') || err.message?.includes('not found') || err.message?.includes('does not belong')) {
        crossOrgRejected = true;
      }
    }
    assert(crossOrgRejected, 'Invalid staff attribution rejected by server-side validation');

    // Valid registration creation with clinical staff
    const savedReg = await DonorRegistrationService.saveRegistration({
      userId: creatorUser!.id,
      role: creatorUser!.role,
    }, {
      organisationId: org!.id,
      registrationSource: 'CAMP',
      campId: approvedCamp.id,
      donationType: 'VOLUNTARY',
      currentStep: 4,
      donorDetails: {
        fullName: 'Vikramaditya Shinde',
        gender: 'Male',
        bloodGroup: 'O_POS',
        dateOfBirth: '1992-08-20',
        primaryMobile: '9822012345',
        address: 'Flat 402, Shanti Vihar, FC Road, Pune',
        city: 'Pune',
        district: 'Pune',
        districtCode: 521,
        state: 'Maharashtra',
        stateCode: 27,
        pinCode: '411004',
        profession: 'Software Engineer',
        donorClub: 'Save Life',
        isRepeatDonor: true,
        lastDonationDate: '2025-11-10',
      },
      counsellingReviewedById: creatorUser!.id,
      counsellingStatus: 'APPROVED',
      counsellingRemarks: 'Pre-donation questionnaire verified fit for whole blood donation.',
      canIssuePlasma: true,
      screening: {
        screenedById: clinicalMember!.id,
        medicalOfficerId: creatorUser!.id,
        status: 'FIT',
        weightKg: 72,
        hemoglobin: 14.8,
        bloodGroup: 'O_POS',
        systolicBp: 120,
        diastolicBp: 80,
        pulseBpm: 74,
        temperatureCelsius: 36.8,
        heightCm: 175,
        bothArmsInspected: true,
        postDonationTipsGiven: true,
        remarks: 'Donor vitals normal and fit to donate.',
      },
      collection: {
        status: 'COLLECTED',
        bagType: 'DB-CPDA-350',
        manufacturer: 'Terumo Penpol',
        lotNumber: 'LOT-202610-A',
        segmentNumber: 'SEG-8821',
        volumeMl: 350,
        durationMinutes: 8,
        isLessQuantity: false,
        adverseReaction: false,
        timeRefreshmentsProvided: '10:30 AM',
        exitTime: '10:45 AM',
        remarks: 'Smooth collection without any adverse reactions.',
      },
    });

    assert(!!savedReg.id, 'Registration record saved successfully with clinical staff attribution');
    console.log(`     Registration #: ${savedReg.registrationNumber} (ID: ${savedReg.id})`);

    // Complete registration
    const completedReg = await DonorRegistrationService.completeRegistration(savedReg.id, {
      userId: creatorUser!.id,
      role: creatorUser!.role,
    });
    assert(completedReg.workflowStatus === 'COMPLETED', 'Registration successfully completed');
    assert(completedReg.isCompleted === true, 'isCompleted flag is true');

    // Retrieve registration by ID and verify staff names
    const fetchedReg = await DonorRegistrationService.getRegistrationById(savedReg.id);
    assert(!!fetchedReg, 'Registration retrieved from DB with JOINs');
    assert(fetchedReg?.counselling?.reviewedByName === creatorUser!.name, `Counselling reviewer name resolved: ${fetchedReg?.counselling?.reviewedByName}`);
    assert(fetchedReg?.screening?.screenedByName === clinicalMember!.name, `Screened by name resolved: ${fetchedReg?.screening?.screenedByName}`);
    assert(fetchedReg?.screening?.medicalOfficerName === creatorUser!.name, `Medical officer name resolved: ${fetchedReg?.screening?.medicalOfficerName}`);

    // -------------------------------------------------------------
    // TEST SUITE 4: Recreated 2-Page PDF Document Generation
    // -------------------------------------------------------------
    console.log('\n--- 4. Testing PDF Generation from Clinical Reference Structure ---');

    const pdfBuffer = await PdfService.generateRegistrationPdf(savedReg.id);
    assert(Buffer.isBuffer(pdfBuffer), 'PDF generated as binary Buffer');
    assert(pdfBuffer.length > 5000, `PDF size is substantive (${pdfBuffer.length} bytes)`);

    // Check %PDF header
    const pdfHeader = pdfBuffer.slice(0, 5).toString('ascii');
    assert(pdfHeader === '%PDF-', 'Buffer starts with valid %PDF- header');

    // Verify page count from PDF trailer / page tree
    const pdfStr = pdfBuffer.toString('binary');
    const pageMatches = pdfStr.match(/\/Type\s*\/Page\b/g);
    const pageCount = pageMatches ? pageMatches.length : 0;
    console.log(`     Generated PDF page count: ${pageCount}`);
    assert(pageCount === 2, 'Generated PDF has EXACTLY 2 pages matching reference pdf.pdf');

    // Verify absence of demo text in normal PDF output
    const hasDemoDefault = pdfStr.includes('(demo default)');
    assert(!hasDemoDefault, 'Normal PDF does NOT contain "(demo default)" markers');

    // Clean up test camp & registration records
    console.log('\n--- Cleaning up temporary test records ---');
    await prisma.$executeRawUnsafe(`DELETE FROM donor_registrations WHERE id = $1`, savedReg.id);
    await prisma.camp.deleteMany({ where: { id: testCamp.id } });
    console.log('     Cleanup complete.');

    console.log('\n=================================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
    console.log('=================================================================\n');
  } catch (error: any) {
    console.error('\n❌ Test Suite Aborted with Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
