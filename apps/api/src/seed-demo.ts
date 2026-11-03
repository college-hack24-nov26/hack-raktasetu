import { prisma } from './lib/prisma';
import {
  Role,
  UserStatus,
  BloodGroup,
  OrgType,
  OrgStatus,
  OrgRole,
  ApplicationStatus,
  CampStatus,
  AttendanceStatus,
  ScreeningStatus,
  DonationOutcome,
  DonationType,
  CollectionUnitStatus,
  ComponentUnitStatus,
  ComponentType,
  ManifestStatus,
  ItemReceiptOutcome,
  TestCategory,
  TestType,
  TestResultOutcome,
  TestRecordStatus,
  ClinicalReleaseDecision,
  StorageType,
  HospitalIssueStatus,
  HospitalItemStatus,
  HospitalItemReceiptOutcome,
  HospitalDiscrepancyCategory,
  ExceptionSeverity,
  ExceptionStatus,
  ComponentDispositionType,
} from '@prisma/client';

export const DEMO_TAG = 'RAKTASETU_DEMO_DATASET_V1';

export async function seedDemoData() {
  console.log('========================================================================');
  console.log(' RaktaSetu — Deterministic Synthetic Demo Dataset Seeder');
  console.log('========================================================================\n');

  // Verify database connection
  await prisma.$connect();
  console.log('[OK] Connected to PostgreSQL via Prisma.');

  const now = new Date();
  const futureDays = (days: number) => new Date(now.getTime() + days * 86400000);
  const pastDays = (days: number) => new Date(now.getTime() - days * 86400000);

  // ----------------------------------------------------
  // 1. Synthetic Users
  // ----------------------------------------------------
  console.log('\n--- 1. Seeding Synthetic Users ---');

  const usersData = [
    {
      id: '00000000-0000-4000-a000-000000000001',
      phoneNumber: '+919999980001',
      name: 'Platform Admin Vikramaditya',
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
    },
    {
      id: '00000000-0000-4000-a000-000000000002',
      phoneNumber: '+919999980002',
      name: 'Dr. Anand Joshi',
      role: Role.USER,
      status: UserStatus.ACTIVE,
    },
    {
      id: '00000000-0000-4000-a000-000000000003',
      phoneNumber: '+919999980003',
      name: 'Suresh More',
      role: Role.USER,
      status: UserStatus.ACTIVE,
    },
    {
      id: '00000000-0000-4000-a000-000000000004',
      phoneNumber: '+919999980004',
      name: 'Dr. Sunita Deshpande',
      role: Role.USER,
      status: UserStatus.ACTIVE,
    },
    {
      id: '00000000-0000-4000-a000-000000000005',
      phoneNumber: '+919999980005',
      name: 'Rahul Kulkarni',
      role: Role.USER,
      status: UserStatus.ACTIVE,
    },
    {
      id: '00000000-0000-4000-a000-000000000006',
      phoneNumber: '+919999980006',
      name: 'Auditor Meera Nair',
      role: Role.USER,
      status: UserStatus.ACTIVE,
    },
    {
      id: '00000000-0000-4000-a000-000000000007',
      phoneNumber: '+919999980007',
      name: 'Dr. Robert D\'Souza',
      role: Role.USER,
      status: UserStatus.ACTIVE,
    },
    {
      id: '00000000-0000-4000-a000-000000000008',
      phoneNumber: '+919999980008',
      name: 'Nurse Preeti Sharma',
      role: Role.USER,
      status: UserStatus.ACTIVE,
    },
    {
      id: '00000000-0000-4000-a000-000000000009',
      phoneNumber: '+919999980009',
      name: 'Amitabh Sen',
      role: Role.USER,
      status: UserStatus.ACTIVE,
    },
    {
      id: '00000000-0000-4000-a000-000000000010',
      phoneNumber: '+919999980010',
      name: 'Kavita Patel',
      role: Role.USER,
      status: UserStatus.ACTIVE,
    },
    {
      id: '00000000-0000-4000-a000-000000000011',
      phoneNumber: '+919999980011',
      name: 'Aditya Verma',
      role: Role.DONOR,
      status: UserStatus.ACTIVE,
    },
    {
      id: '00000000-0000-4000-a000-000000000012',
      phoneNumber: '+919999980012',
      name: 'Pooja Iyer',
      role: Role.DONOR,
      status: UserStatus.ACTIVE,
    },
    {
      id: '00000000-0000-4000-a000-000000000013',
      phoneNumber: '+919999980013',
      name: 'Nikhil Shinde',
      role: Role.DONOR,
      status: UserStatus.ACTIVE,
    },
    {
      id: '00000000-0000-4000-a000-000000000014',
      phoneNumber: '+919999980014',
      name: 'Dr. Ramesh Gupta',
      role: Role.USER,
      status: UserStatus.ACTIVE,
    },
  ];

  for (const u of usersData) {
    await prisma.user.upsert({
      where: { phoneNumber: u.phoneNumber },
      update: { name: u.name, role: u.role, status: u.status },
      create: u,
    });
    console.log(`  [UPSERT] User ${u.name} (${u.phoneNumber}) -> Role: ${u.role}`);
  }

  // ----------------------------------------------------
  // 2. Synthetic Donor Profiles
  // ----------------------------------------------------
  console.log('\n--- 2. Seeding Synthetic Donor Profiles ---');

  const donorsData = [
    {
      id: '00000000-0000-4000-a100-000000000011',
      userId: '00000000-0000-4000-a000-000000000011',
      fullName: 'Aditya Verma',
      bloodGroup: BloodGroup.O_POS,
      stateCode: 27,
      districtCode: 521,
      cityOrLocality: 'Shivajinagar, Pune',
      isAvailable: true,
      isSearchable: true,
      consentVersion: 'v1.0',
      consentGrantedAt: pastDays(30),
      lastDonationDate: pastDays(120),
    },
    {
      id: '00000000-0000-4000-a100-000000000012',
      userId: '00000000-0000-4000-a000-000000000012',
      fullName: 'Pooja Iyer',
      bloodGroup: BloodGroup.O_POS,
      stateCode: 27,
      districtCode: 521,
      cityOrLocality: 'Kothrud, Pune',
      isAvailable: true,
      isSearchable: true,
      consentVersion: 'v1.0',
      consentGrantedAt: pastDays(45),
      lastDonationDate: pastDays(180),
    },
    {
      id: '00000000-0000-4000-a100-000000000013',
      userId: '00000000-0000-4000-a000-000000000013',
      fullName: 'Nikhil Shinde',
      bloodGroup: BloodGroup.B_POS,
      stateCode: 27,
      districtCode: 521,
      cityOrLocality: 'Hadapsar, Pune',
      isAvailable: false, // Ineligible / deferred
      isSearchable: false,
      consentVersion: 'v1.0',
      consentGrantedAt: pastDays(10),
      lastDonationDate: pastDays(10), // Too recent
    },
  ];

  for (const d of donorsData) {
    await prisma.donorProfile.upsert({
      where: { userId: d.userId },
      update: {
        fullName: d.fullName,
        bloodGroup: d.bloodGroup,
        isAvailable: d.isAvailable,
        isSearchable: d.isSearchable,
        districtCode: d.districtCode,
      },
      create: d,
    });
    console.log(`  [UPSERT] DonorProfile ${d.fullName} (${d.bloodGroup}) -> Available: ${d.isAvailable}`);
  }

  // ----------------------------------------------------
  // 3. Synthetic Blood Centre & Organisations
  // ----------------------------------------------------
  console.log('\n--- 3. Seeding Synthetic Organisations & Centres ---');

  const bloodCentre = await prisma.bloodCentre.upsert({
    where: { hospitalCode: 'DEMO-CENTRE-001' },
    update: { hospitalName: 'Pune Metro Regional Blood Centre (Demo Centre)' },
    create: {
      hospitalCode: 'DEMO-CENTRE-001',
      hospitalName: 'Pune Metro Regional Blood Centre (Demo Centre)',
      mobileNo: '+919999980002',
      address: '101 Deccan Gymkhana, Pune, Maharashtra 411004',
      stateCode: 27,
      districtCode: 521,
    },
  });
  console.log(`  [UPSERT] BloodCentre ${bloodCentre.hospitalName} (${bloodCentre.hospitalCode})`);

  // Verified Blood Bank 1 (Primary Organisation)
  const org1 = await prisma.organisation.upsert({
    where: { orgCode: 'DEMO-ORG-PUN-001' },
    update: {
      name: 'Pune Metro Regional Blood Centre',
      status: OrgStatus.VERIFIED,
      licenseNumber: 'MH-PUN-BB-DEMO-001',
    },
    create: {
      id: '00000000-0000-4000-b000-000000000001',
      orgCode: 'DEMO-ORG-PUN-001',
      name: 'Pune Metro Regional Blood Centre',
      type: OrgType.BLOOD_BANK,
      licenseNumber: 'MH-PUN-BB-DEMO-001',
      stateCode: 27,
      districtCode: 521,
      districtName: 'Pune',
      address: '101 Deccan Gymkhana, Pune, Maharashtra 411004',
      email: 'contact@punemetroblood.demo',
      phone: '+919999980002',
      status: OrgStatus.VERIFIED,
      hospitalCode: 'DEMO-CENTRE-001',
      verifiedAt: pastDays(60),
      verifiedBy: '00000000-0000-4000-a000-000000000001',
    },
  });
  console.log(`  [UPSERT] Organisation ${org1.name} (${org1.orgCode})`);

  // Verified Blood Bank 2 (Isolated Centre)
  const org2 = await prisma.organisation.upsert({
    where: { orgCode: 'DEMO-ORG-PUN-002' },
    update: {
      name: 'Sahyadri Community Blood Bank',
      status: OrgStatus.VERIFIED,
      licenseNumber: 'MH-PUN-BB-DEMO-002',
    },
    create: {
      id: '00000000-0000-4000-b000-000000000002',
      orgCode: 'DEMO-ORG-PUN-002',
      name: 'Sahyadri Community Blood Bank',
      type: OrgType.BLOOD_BANK,
      licenseNumber: 'MH-PUN-BB-DEMO-002',
      stateCode: 27,
      districtCode: 521,
      districtName: 'Pune',
      address: 'Plot 44 Karve Road, Pune, Maharashtra 411038',
      email: 'admin@sahyadriblood.demo',
      phone: '+919999980007',
      status: OrgStatus.VERIFIED,
      verifiedAt: pastDays(45),
      verifiedBy: '00000000-0000-4000-a000-000000000001',
    },
  });
  console.log(`  [UPSERT] Organisation ${org2.name} (${org2.orgCode})`);

  // Receiving Facility (Hospital)
  const hospOrg = await prisma.organisation.upsert({
    where: { orgCode: 'DEMO-ORG-PUN-HOSP-001' },
    update: {
      name: 'Deenanath Mangeshkar Memorial Hospital',
      status: OrgStatus.VERIFIED,
      licenseNumber: 'MH-PUN-HOSP-DEMO-001',
    },
    create: {
      id: '00000000-0000-4000-b000-000000000003',
      orgCode: 'DEMO-ORG-PUN-HOSP-001',
      name: 'Deenanath Mangeshkar Memorial Hospital',
      type: OrgType.RECEIVING_FACILITY,
      licenseNumber: 'MH-PUN-HOSP-DEMO-001',
      stateCode: 27,
      districtCode: 521,
      districtName: 'Pune',
      address: 'Erandwane, Pune, Maharashtra 411004',
      email: 'bloodtransfusion@dmmh.demo',
      phone: '+919999980008',
      status: OrgStatus.VERIFIED,
      verifiedAt: pastDays(30),
      verifiedBy: '00000000-0000-4000-a000-000000000001',
    },
  });
  console.log(`  [UPSERT] Hospital Organisation ${hospOrg.name} (${hospOrg.orgCode})`);

  // ----------------------------------------------------
  // 4. Organisation Memberships
  // ----------------------------------------------------
  console.log('\n--- 4. Seeding Organisation Memberships ---');

  const membershipsData = [
    // Blood Bank 1 Staff
    { userId: '00000000-0000-4000-a000-000000000002', orgId: org1.id, role: OrgRole.ORG_ADMIN },
    { userId: '00000000-0000-4000-a000-000000000003', orgId: org1.id, role: OrgRole.INVENTORY_STAFF },
    { userId: '00000000-0000-4000-a000-000000000004', orgId: org1.id, role: OrgRole.CLINICAL_STAFF },
    { userId: '00000000-0000-4000-a000-000000000005', orgId: org1.id, role: OrgRole.COLLECTION_STAFF },
    { userId: '00000000-0000-4000-a000-000000000006', orgId: org1.id, role: OrgRole.AUDITOR },
    // Platform Admin secondary membership in BB1
    { userId: '00000000-0000-4000-a000-000000000001', orgId: org1.id, role: OrgRole.ORG_ADMIN },
    // Blood Bank 2 Staff
    { userId: '00000000-0000-4000-a000-000000000007', orgId: org2.id, role: OrgRole.ORG_ADMIN },
    // Hospital Staff
    { userId: '00000000-0000-4000-a000-000000000008', orgId: hospOrg.id, role: OrgRole.ORG_ADMIN },
  ];

  for (const m of membershipsData) {
    await prisma.organisationMembership.upsert({
      where: {
        userId_organisationId: {
          userId: m.userId,
          organisationId: m.orgId,
        },
      },
      update: { role: m.role, isActive: true },
      create: {
        userId: m.userId,
        organisationId: m.orgId,
        role: m.role,
        isActive: true,
        assignedBy: '00000000-0000-4000-a000-000000000001',
      },
    });
    console.log(`  [UPSERT] Membership: User ${m.userId.slice(-4)} -> Org ${m.orgId.slice(-4)} as ${m.role}`);
  }

  // ----------------------------------------------------
  // 5. Organisation Applications
  // ----------------------------------------------------
  console.log('\n--- 5. Seeding Organisation Applications ---');

  // Application 1: Approved
  await prisma.organisationApplication.upsert({
    where: { id: '00000000-0000-4000-c000-000000000001' },
    update: { status: ApplicationStatus.APPROVED },
    create: {
      id: '00000000-0000-4000-c000-000000000001',
      applicantUserId: '00000000-0000-4000-a000-000000000002',
      hospitalName: 'Pune Metro Regional Blood Centre',
      licenseNumber: 'MH-PUN-BB-DEMO-001',
      stateCode: 27,
      districtCode: 521,
      districtName: 'Pune',
      contactPerson: 'Dr. Anand Joshi',
      email: 'contact@punemetroblood.demo',
      phone: '+919999980002',
      componentTypes: ['PRBC', 'FFP', 'Platelets', 'Whole Blood'],
      status: ApplicationStatus.APPROVED,
      reviewedBy: '00000000-0000-4000-a000-000000000001',
      reviewedAt: pastDays(60),
      reviewNotes: 'CDSCO license verified compliant. Approved for voluntary processing.',
      resultingOrgId: org1.id,
    },
  });
  console.log('  [UPSERT] Application 1 -> APPROVED (Resulting Org: DEMO-ORG-PUN-001)');

  // Application 2: Submitted / Pending Review
  await prisma.organisationApplication.upsert({
    where: { id: '00000000-0000-4000-c000-000000000002' },
    update: { status: ApplicationStatus.SUBMITTED },
    create: {
      id: '00000000-0000-4000-c000-000000000002',
      applicantUserId: '00000000-0000-4000-a000-000000000014',
      hospitalName: 'Gupta Charitable Blood Centre',
      licenseNumber: 'MH-PUN-BB-DEMO-PENDING',
      stateCode: 27,
      districtCode: 521,
      districtName: 'Pune',
      contactPerson: 'Dr. Ramesh Gupta',
      email: 'dr.gupta@charityblood.demo',
      phone: '+919999980014',
      componentTypes: ['PRBC', 'Whole Blood'],
      status: ApplicationStatus.SUBMITTED,
    },
  });
  console.log('  [UPSERT] Application 2 -> SUBMITTED (Applicant: Dr. Ramesh Gupta)');

  // Application 3: Rejected
  await prisma.organisationApplication.upsert({
    where: { id: '00000000-0000-4000-c000-000000000003' },
    update: { status: ApplicationStatus.REJECTED },
    create: {
      id: '00000000-0000-4000-c000-000000000003',
      hospitalName: 'Unlicensed City Clinic Blood Storage Unit',
      licenseNumber: 'MH-PUN-BB-DEMO-REJECTED',
      stateCode: 27,
      districtCode: 521,
      districtName: 'Pune',
      contactPerson: 'Manager Fake',
      email: 'fake@clinic.demo',
      phone: '+919999980099',
      componentTypes: ['Whole Blood'],
      status: ApplicationStatus.REJECTED,
      reviewedBy: '00000000-0000-4000-a000-000000000001',
      reviewedAt: pastDays(15),
      reviewNotes: 'Rejected: No valid CDSCO Form 28-C blood bank license provided.',
    },
  });
  console.log('  [UPSERT] Application 3 -> REJECTED');

  // ----------------------------------------------------
  // 6. Synthetic Voluntary Donation Camps
  // ----------------------------------------------------
  console.log('\n--- 6. Seeding Synthetic Camps ---');

  const camp1 = await prisma.camp.upsert({
    where: { campCode: 'DEMO-CAMP-PUN-001' },
    update: { status: CampStatus.APPROVED, isReadyForCollection: true },
    create: {
      id: '00000000-0000-4000-d000-000000000001',
      campCode: 'DEMO-CAMP-PUN-001',
      title: 'Rotary Club Deccan Mega Blood Drive',
      organizerName: 'Rotary Club Pune Central',
      targetDate: futureDays(3),
      timeSlot: '09:00 AM - 04:00 PM',
      venue: 'Deccan Gymkhana Community Hall, Pune',
      district: 'Pune',
      districtCode: 521,
      stateCode: 27,
      expectedDonors: 120,
      coordinatorContact: '+919999980009',
      status: CampStatus.APPROVED,
      organisationId: org1.id,
      isReadyForCollection: true,
      readinessVerifiedAt: pastDays(1),
      readinessVerifiedBy: '00000000-0000-4000-a000-000000000005',
      readinessChecklist: {
        staffAssigned: true,
        equipmentCalibrated: true,
        consumablesStocked: true,
        coldChainReady: true,
        emergencyProtocolReady: true,
      },
    },
  });
  console.log(`  [UPSERT] Camp 1: ${camp1.title} (${camp1.campCode}) -> APPROVED & READY`);

  const camp2 = await prisma.camp.upsert({
    where: { campCode: 'DEMO-CAMP-PUN-002' },
    update: { status: CampStatus.APPROVED, isReadyForCollection: false },
    create: {
      id: '00000000-0000-4000-d000-000000000002',
      campCode: 'DEMO-CAMP-PUN-002',
      title: 'COEP Tech University Voluntary Camp',
      organizerName: 'COEP Student Welfare Association',
      targetDate: futureDays(10),
      timeSlot: '10:00 AM - 05:00 PM',
      venue: 'COEP Main Auditorium, Shivajinagar, Pune',
      district: 'Pune',
      districtCode: 521,
      stateCode: 27,
      expectedDonors: 200,
      coordinatorContact: '+919999980009',
      status: CampStatus.APPROVED,
      organisationId: org1.id,
      isReadyForCollection: false,
    },
  });
  console.log(`  [UPSERT] Camp 2: ${camp2.title} (${camp2.campCode}) -> APPROVED`);

  const camp3 = await prisma.camp.upsert({
    where: { campCode: 'DEMO-CAMP-PUN-003' },
    update: { status: CampStatus.PROPOSED },
    create: {
      id: '00000000-0000-4000-d000-000000000003',
      campCode: 'DEMO-CAMP-PUN-003',
      title: 'Kothrud Youth Festival Blood Drive',
      organizerName: 'Kothrud Citizens Forum',
      targetDate: futureDays(18),
      timeSlot: '09:00 AM - 02:00 PM',
      venue: 'Yashwantrao Chavan Hall, Kothrud, Pune',
      district: 'Pune',
      districtCode: 521,
      stateCode: 27,
      expectedDonors: 75,
      coordinatorContact: '+919999980009',
      status: CampStatus.PROPOSED,
      organisationId: org1.id,
      isReadyForCollection: false,
    },
  });
  console.log(`  [UPSERT] Camp 3: ${camp3.title} (${camp3.campCode}) -> PROPOSED (Pending Org Admin review)`);

  // ----------------------------------------------------
  // 7. Camp Attendance, Screening, Donation & Collection Units
  // ----------------------------------------------------
  console.log('\n--- 7. Seeding Camp Operations & Traceable Collection Units ---');

  const attendance1 = await prisma.campAttendance.upsert({
    where: {
      campId_userId: {
        campId: camp1.id,
        userId: '00000000-0000-4000-a000-000000000011',
      },
    },
    update: { status: AttendanceStatus.CHECKED_IN },
    create: {
      id: '00000000-0000-4000-e000-000000000001',
      campId: camp1.id,
      userId: '00000000-0000-4000-a000-000000000011',
      donorName: 'Aditya Verma',
      donorPhone: '+919999980011',
      bloodGroup: BloodGroup.O_POS,
      status: AttendanceStatus.CHECKED_IN,
      checkedInAt: pastDays(1),
      checkedInBy: '00000000-0000-4000-a000-000000000005',
    },
  });
  console.log(`  [UPSERT] Camp Attendance: Aditya Verma -> CHECKED_IN`);

  const screening1 = await prisma.clinicalScreening.upsert({
    where: { attendanceId: attendance1.id },
    update: { status: ScreeningStatus.CLEARED, eligibilityDecision: 'CLEARED' },
    create: {
      id: '00000000-0000-4000-e000-000000000002',
      campId: camp1.id,
      attendanceId: attendance1.id,
      donorUserId: '00000000-0000-4000-a000-000000000011',
      screenedBy: '00000000-0000-4000-a000-000000000004',
      status: ScreeningStatus.CLEARED,
      consentVersion: 'v1.0',
      consentGiven: true,
      eligibilityDecision: 'CLEARED',
      clinicalNotes: 'Hb: 14.2 g/dL, BP: 120/80 mmHg, Pulse: 72 bpm, Weight: 68 kg. Cleared for whole blood collection.',
    },
  });
  console.log(`  [UPSERT] Clinical Screening: Aditya Verma -> CLEARED`);

  const donationEvent1 = await prisma.donationEvent.upsert({
    where: { attendanceId: attendance1.id },
    update: { outcome: DonationOutcome.COMPLETED },
    create: {
      id: '00000000-0000-4000-e000-000000000003',
      campId: camp1.id,
      attendanceId: attendance1.id,
      screeningId: screening1.id,
      donorUserId: '00000000-0000-4000-a000-000000000011',
      bloodGroup: BloodGroup.O_POS,
      donationType: DonationType.WHOLE_BLOOD,
      outcome: DonationOutcome.COMPLETED,
      volumeMl: 450,
      recordedBy: '00000000-0000-4000-a000-000000000005',
      performedAt: pastDays(1),
    },
  });
  console.log(`  [UPSERT] Donation Event: Aditya Verma -> COMPLETED (450ml Whole Blood)`);

  // Source Collection Unit 1 (Processed into components)
  const cu1 = await prisma.collectionUnit.upsert({
    where: { unitNumber: 'CU-DEMO-PUN-001' },
    update: { status: CollectionUnitStatus.PROCESSING_COMPLETED },
    create: {
      id: '00000000-0000-4000-f000-000000000001',
      unitNumber: 'CU-DEMO-PUN-001',
      bagIdentifier: 'BAG-DEMO-001',
      donationEventId: donationEvent1.id,
      campId: camp1.id,
      organisationId: org1.id,
      bloodGroup: BloodGroup.O_POS,
      volumeMl: 450,
      status: CollectionUnitStatus.PROCESSING_COMPLETED,
      collectedAt: pastDays(1),
      collectedBy: '00000000-0000-4000-a000-000000000005',
      notes: 'Standard 450ml CPD-A1 collection without adverse events.',
    },
  });
  console.log(`  [UPSERT] Collection Unit 1: ${cu1.unitNumber} -> PROCESSING_COMPLETED`);

  // Source Collection Unit 2 (In Handover Manifest)
  // Create a second completed attendance for Pooja Iyer
  const attendance2 = await prisma.campAttendance.upsert({
    where: {
      campId_userId: {
        campId: camp1.id,
        userId: '00000000-0000-4000-a000-000000000012',
      },
    },
    update: { status: AttendanceStatus.CHECKED_IN },
    create: {
      id: '00000000-0000-4000-e000-000000000012',
      campId: camp1.id,
      userId: '00000000-0000-4000-a000-000000000012',
      donorName: 'Pooja Iyer',
      donorPhone: '+919999980012',
      bloodGroup: BloodGroup.O_POS,
      status: AttendanceStatus.CHECKED_IN,
      checkedInAt: pastDays(1),
      checkedInBy: '00000000-0000-4000-a000-000000000005',
    },
  });

  const screening2 = await prisma.clinicalScreening.upsert({
    where: { attendanceId: attendance2.id },
    update: { status: ScreeningStatus.CLEARED },
    create: {
      id: '00000000-0000-4000-e000-000000000013',
      campId: camp1.id,
      attendanceId: attendance2.id,
      donorUserId: '00000000-0000-4000-a000-000000000012',
      screenedBy: '00000000-0000-4000-a000-000000000004',
      status: ScreeningStatus.CLEARED,
      consentVersion: 'v1.0',
      consentGiven: true,
      eligibilityDecision: 'CLEARED',
    },
  });

  const donationEvent2 = await prisma.donationEvent.upsert({
    where: { attendanceId: attendance2.id },
    update: { outcome: DonationOutcome.COMPLETED },
    create: {
      id: '00000000-0000-4000-e000-000000000014',
      campId: camp1.id,
      attendanceId: attendance2.id,
      screeningId: screening2.id,
      donorUserId: '00000000-0000-4000-a000-000000000012',
      bloodGroup: BloodGroup.O_POS,
      donationType: DonationType.WHOLE_BLOOD,
      outcome: DonationOutcome.COMPLETED,
      volumeMl: 450,
      recordedBy: '00000000-0000-4000-a000-000000000005',
      performedAt: pastDays(1),
    },
  });

  const cu2 = await prisma.collectionUnit.upsert({
    where: { unitNumber: 'CU-DEMO-PUN-002' },
    update: { status: CollectionUnitStatus.COLLECTED },
    create: {
      id: '00000000-0000-4000-f000-000000000002',
      unitNumber: 'CU-DEMO-PUN-002',
      bagIdentifier: 'BAG-DEMO-002',
      donationEventId: donationEvent2.id,
      campId: camp1.id,
      organisationId: org1.id,
      bloodGroup: BloodGroup.O_POS,
      volumeMl: 450,
      status: CollectionUnitStatus.COLLECTED,
      collectedAt: pastDays(1),
      collectedBy: '00000000-0000-4000-a000-000000000005',
    },
  });
  console.log(`  [UPSERT] Collection Unit 2: ${cu2.unitNumber} -> COLLECTED (Ready for Handover)`);

  // ----------------------------------------------------
  // 8. Storage Locations
  // ----------------------------------------------------
  console.log('\n--- 8. Seeding Structured Storage Locations ---');

  const locCold = await prisma.storageLocation.upsert({
    where: {
      organisationId_locationCode: {
        organisationId: org1.id,
        locationCode: 'DEMO-LOC-COLD-01',
      },
    },
    update: { isActive: true },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      organisationId: org1.id,
      locationCode: 'DEMO-LOC-COLD-01',
      name: 'Main Cold Room Refrigerator 1',
      storageType: StorageType.BLOOD_BANK_REFRIGERATOR,
      targetTempRange: '+2°C to +6°C',
      roomOrArea: 'Component Processing Lab',
      equipmentIdentifier: 'THERMO-TSX-400',
      isActive: true,
    },
  });

  const locFreezer = await prisma.storageLocation.upsert({
    where: {
      organisationId_locationCode: {
        organisationId: org1.id,
        locationCode: 'DEMO-LOC-FREEZER-01',
      },
    },
    update: { isActive: true },
    create: {
      id: '00000000-0000-4000-8000-000000000002',
      organisationId: org1.id,
      locationCode: 'DEMO-LOC-FREEZER-01',
      name: 'Deep Plasma Freezer A',
      storageType: StorageType.DEEP_FREEZER,
      targetTempRange: '≤ -30°C',
      roomOrArea: 'Cold Storage Room 2',
      equipmentIdentifier: 'PANASONIC-MDF-U5412',
      isActive: true,
    },
  });

  const locAgitator = await prisma.storageLocation.upsert({
    where: {
      organisationId_locationCode: {
        organisationId: org1.id,
        locationCode: 'DEMO-LOC-AGITATOR-01',
      },
    },
    update: { isActive: true },
    create: {
      id: '00000000-0000-4000-8000-000000000003',
      organisationId: org1.id,
      locationCode: 'DEMO-LOC-AGITATOR-01',
      name: 'Platelet Agitator Incubator',
      storageType: StorageType.PLATELET_AGITATOR,
      targetTempRange: '+20°C to +24°C',
      roomOrArea: 'Component Laboratory',
      equipmentIdentifier: 'HELMER-PC100',
      isActive: true,
    },
  });

  const locQuarantine = await prisma.storageLocation.upsert({
    where: {
      organisationId_locationCode: {
        organisationId: org1.id,
        locationCode: 'DEMO-LOC-QUARANTINE',
      },
    },
    update: { isActive: true },
    create: {
      id: '00000000-0000-4000-8000-000000000004',
      organisationId: org1.id,
      locationCode: 'DEMO-LOC-QUARANTINE',
      name: 'Quarantine Holding Refrigerator',
      storageType: StorageType.QUARANTINE_STORAGE,
      targetTempRange: '+2°C to +6°C',
      roomOrArea: 'Receiving Dock Quarantine',
      equipmentIdentifier: 'HAER-HXC-358',
      isActive: true,
    },
  });
  console.log(`  [UPSERT] Storage Locations: Cold Room (${locCold.locationCode}), Freezer (${locFreezer.locationCode}), Agitator (${locAgitator.locationCode}), Quarantine (${locQuarantine.locationCode})`);

  // ----------------------------------------------------
  // 9. Derived Blood Component Units & Complete Lifecycle States
  // ----------------------------------------------------
  console.log('\n--- 9. Seeding Derived Component Units Across All Lifecycle States ---');

  // Component 1: PRBC, O+, AVAILABLE (Clinically Released)
  const cmp1 = await prisma.componentUnit.upsert({
    where: { componentCode: 'DEMO-CMP-PRBC-001' },
    update: { status: ComponentUnitStatus.AVAILABLE, isHold: false },
    create: {
      id: '00000000-0000-4000-1000-000000000001',
      componentCode: 'DEMO-CMP-PRBC-001',
      collectionUnitId: cu1.id,
      componentType: ComponentType.PRBC,
      bloodGroup: BloodGroup.O_POS,
      volumeMl: 280,
      organisationId: org1.id,
      status: ComponentUnitStatus.AVAILABLE,
      derivedAt: pastDays(1),
      derivedBy: '00000000-0000-4000-a000-000000000003',
      expiresAt: futureDays(35),
      storageLocationId: locCold.id,
      isHold: false,
    },
  });

  // Component 2: FFP, O+, AVAILABLE (Clinically Released)
  const cmp2 = await prisma.componentUnit.upsert({
    where: { componentCode: 'DEMO-CMP-FFP-001' },
    update: { status: ComponentUnitStatus.AVAILABLE, isHold: false },
    create: {
      id: '00000000-0000-4000-1000-000000000002',
      componentCode: 'DEMO-CMP-FFP-001',
      collectionUnitId: cu1.id,
      componentType: ComponentType.FRESH_FROZEN_PLASMA,
      bloodGroup: BloodGroup.O_POS,
      volumeMl: 200,
      organisationId: org1.id,
      status: ComponentUnitStatus.AVAILABLE,
      derivedAt: pastDays(1),
      derivedBy: '00000000-0000-4000-a000-000000000003',
      expiresAt: futureDays(365),
      storageLocationId: locFreezer.id,
      isHold: false,
    },
  });

  // Component 3: PRBC, O+, QUARANTINED (Awaiting TTI Testing)
  const cmp3 = await prisma.componentUnit.upsert({
    where: { componentCode: 'DEMO-CMP-PRBC-002' },
    update: { status: ComponentUnitStatus.QUARANTINED },
    create: {
      id: '00000000-0000-4000-1000-000000000003',
      componentCode: 'DEMO-CMP-PRBC-002',
      collectionUnitId: cu1.id,
      componentType: ComponentType.PRBC,
      bloodGroup: BloodGroup.O_POS,
      volumeMl: 275,
      organisationId: org1.id,
      status: ComponentUnitStatus.QUARANTINED,
      derivedAt: pastDays(1),
      derivedBy: '00000000-0000-4000-a000-000000000003',
      expiresAt: futureDays(35),
      storageLocationId: locQuarantine.id,
      isHold: false,
    },
  });

  // Component 4: PRBC, B+, AWAITING_CLINICAL_REVIEW with SAFETY HOLD
  const cmp4 = await prisma.componentUnit.upsert({
    where: { componentCode: 'DEMO-CMP-PRBC-003' },
    update: { status: ComponentUnitStatus.AWAITING_CLINICAL_REVIEW, isHold: true },
    create: {
      id: '00000000-0000-4000-1000-000000000004',
      componentCode: 'DEMO-CMP-PRBC-003',
      collectionUnitId: cu1.id,
      componentType: ComponentType.PRBC,
      bloodGroup: BloodGroup.B_POS,
      volumeMl: 260,
      organisationId: org1.id,
      status: ComponentUnitStatus.AWAITING_CLINICAL_REVIEW,
      derivedAt: pastDays(2),
      derivedBy: '00000000-0000-4000-a000-000000000003',
      expiresAt: futureDays(30),
      storageLocationId: locQuarantine.id,
      isHold: true,
      holdReason: 'Suspicious lipemic plasma appearance; pathologist review required.',
      holdPlacedAt: pastDays(1),
      holdPlacedById: '00000000-0000-4000-a000-000000000004',
    },
  });

  // Component 5: Platelets, A+, EXPIRED
  const cmp5 = await prisma.componentUnit.upsert({
    where: { componentCode: 'DEMO-CMP-PLT-001' },
    update: { status: ComponentUnitStatus.EXPIRED },
    create: {
      id: '00000000-0000-4000-1000-000000000005',
      componentCode: 'DEMO-CMP-PLT-001',
      collectionUnitId: cu1.id,
      componentType: ComponentType.PLATELET_CONCENTRATE,
      bloodGroup: BloodGroup.A_POS,
      volumeMl: 55,
      organisationId: org1.id,
      status: ComponentUnitStatus.EXPIRED,
      derivedAt: pastDays(6),
      derivedBy: '00000000-0000-4000-a000-000000000003',
      expiresAt: pastDays(1), // Expired yesterday
      storageLocationId: locAgitator.id,
      isHold: false,
    },
  });

  // Component 6: PRBC, O+, ISSUED & TRANSFUSED
  const cmp6 = await prisma.componentUnit.upsert({
    where: { componentCode: 'DEMO-CMP-PRBC-004' },
    update: { status: ComponentUnitStatus.ISSUED },
    create: {
      id: '00000000-0000-4000-1000-000000000006',
      componentCode: 'DEMO-CMP-PRBC-004',
      collectionUnitId: cu1.id,
      componentType: ComponentType.PRBC,
      bloodGroup: BloodGroup.O_POS,
      volumeMl: 290,
      organisationId: org1.id,
      status: ComponentUnitStatus.ISSUED,
      derivedAt: pastDays(3),
      derivedBy: '00000000-0000-4000-a000-000000000003',
      expiresAt: futureDays(30),
      storageLocationId: locCold.id,
      isHold: false,
      dispositionType: 'TRANSFUSION_DOCUMENTED',
      dispositionReason: 'Successfully transfused to emergency surgical patient',
      dispositionedAt: pastDays(1),
      dispositionedById: '00000000-0000-4000-a000-000000000008',
    },
  });

  // Component 7: PRBC, O+, ISSUED with Discrepancy (Damaged bag on hospital arrival)
  const cmp7 = await prisma.componentUnit.upsert({
    where: { componentCode: 'DEMO-CMP-PRBC-005' },
    update: { status: ComponentUnitStatus.ISSUED },
    create: {
      id: '00000000-0000-4000-1000-000000000007',
      componentCode: 'DEMO-CMP-PRBC-005',
      collectionUnitId: cu1.id,
      componentType: ComponentType.PRBC,
      bloodGroup: BloodGroup.O_POS,
      volumeMl: 285,
      organisationId: org1.id,
      status: ComponentUnitStatus.ISSUED,
      derivedAt: pastDays(3),
      derivedBy: '00000000-0000-4000-a000-000000000003',
      expiresAt: futureDays(30),
      storageLocationId: locCold.id,
      isHold: false,
    },
  });

  console.log(`  [UPSERT] Components Seeded:
    - ${cmp1.componentCode} (${cmp1.componentType}, ${cmp1.bloodGroup}) -> AVAILABLE
    - ${cmp2.componentCode} (${cmp2.componentType}, ${cmp2.bloodGroup}) -> AVAILABLE
    - ${cmp3.componentCode} (${cmp3.componentType}, ${cmp3.bloodGroup}) -> QUARANTINED
    - ${cmp4.componentCode} (${cmp4.componentType}, ${cmp4.bloodGroup}) -> SAFETY HOLD
    - ${cmp5.componentCode} (${cmp5.componentType}, ${cmp5.bloodGroup}) -> EXPIRED
    - ${cmp6.componentCode} (${cmp6.componentType}, ${cmp6.bloodGroup}) -> ISSUED & TRANSFUSED
    - ${cmp7.componentCode} (${cmp7.componentType}, ${cmp7.bloodGroup}) -> ISSUED (DISCREPANCY)`);

  // ----------------------------------------------------
  // 10. Mandatory TTI Laboratory Tests & Clinical Releases
  // ----------------------------------------------------
  console.log('\n--- 10. Seeding Laboratory Records & Clinical Release Records ---');

  const testTypes = [
    { type: TestType.HIV_ANTIBODY, name: 'HIV-1/2 4th Gen Ag/Ab ELISA' },
    { type: TestType.HCV_ANTIBODY, name: 'HCV Antibody ELISA' },
    { type: TestType.HBSAG, name: 'HBsAg Chemiluminescence Assay' },
    { type: TestType.SYPHILIS_RPR, name: 'Syphilis Treponemal Rapid Plasma Reagin' },
    { type: TestType.MALARIA_ANTIGEN, name: 'Malaria Pan-LDH/Pf Antigen' },
  ];

  const verifiedTestIds: string[] = [];

  for (const t of testTypes) {
    const testRecord = await prisma.laboratoryTestRecord.upsert({
      where: { id: `00000000-4000-7000-0000-${t.type.slice(0, 12)}` },
      update: { status: TestRecordStatus.COMPLETED, resultOutcome: TestResultOutcome.NON_REACTIVE },
      create: {
        id: `00000000-4000-7000-0000-${t.type.slice(0, 12)}`,
        componentUnitId: cmp1.id,
        organisationId: org1.id,
        category: TestCategory.TTI_SCREENING,
        testType: t.type,
        testName: t.name,
        status: TestRecordStatus.COMPLETED,
        resultOutcome: TestResultOutcome.NON_REACTIVE,
        quantitativeValue: '0.08 S/CO',
        referenceRange: '< 1.0 Non-Reactive',
        performedById: '00000000-0000-4000-a000-000000000003',
        performedAt: pastDays(1),
        verifiedById: '00000000-0000-4000-a000-000000000004',
        verifiedAt: pastDays(1),
      },
    });
    verifiedTestIds.push(testRecord.id);
  }
  console.log(`  [UPSERT] 5 Mandatory TTI Laboratory Tests -> All NON_REACTIVE & Verified`);

  // Clinical Release Record by Authorised Pathologist (Dr. Sunita Deshpande)
  await prisma.clinicalReleaseRecord.upsert({
    where: { id: '00000000-0000-4000-7100-000000000001' },
    update: { decision: ClinicalReleaseDecision.RELEASED },
    create: {
      id: '00000000-0000-4000-7100-000000000001',
      componentUnitId: cmp1.id,
      organisationId: org1.id,
      decision: ClinicalReleaseDecision.RELEASED,
      authorizedClinicalUserId: '00000000-0000-4000-a000-000000000004',
      decisionTimestamp: pastDays(1),
      reason: 'All 5 NBTC mandated TTI screening assays verified non-reactive; ABO/Rh confirmed O+; volume 280ml acceptable. Released for clinical transfusion.',
      reviewedTestIds: verifiedTestIds,
      clinicalProtocolRef: 'NBTC Schedule F(K) Clinical Release Standard Protocol',
    },
  });

  await prisma.clinicalReleaseRecord.upsert({
    where: { id: '00000000-0000-4000-7100-000000000002' },
    update: { decision: ClinicalReleaseDecision.RELEASED },
    create: {
      id: '00000000-0000-4000-7100-000000000002',
      componentUnitId: cmp2.id,
      organisationId: org1.id,
      decision: ClinicalReleaseDecision.RELEASED,
      authorizedClinicalUserId: '00000000-0000-4000-a000-000000000004',
      decisionTimestamp: pastDays(1),
      reason: 'Companion FFP component verified clear. Frozen within 8 hours. Released.',
      reviewedTestIds: verifiedTestIds,
      clinicalProtocolRef: 'NBTC Schedule F(K) FFP Release Protocol',
    },
  });
  console.log(`  [UPSERT] Clinical Releases Recorded: ${cmp1.componentCode} and ${cmp2.componentCode} -> RELEASED`);

  // ----------------------------------------------------
  // 11. Handover Manifest
  // ----------------------------------------------------
  console.log('\n--- 11. Seeding Camp Handover Manifest ---');

  const manifest = await prisma.handoverManifest.upsert({
    where: { manifestNumber: 'DEMO-HM-2026-001' },
    update: { status: ManifestStatus.DISPATCHED },
    create: {
      id: '00000000-0000-4000-2000-000000000001',
      manifestNumber: 'DEMO-HM-2026-001',
      campId: camp1.id,
      sendingOrganisationId: org1.id,
      receivingOrganisationId: org1.id,
      status: ManifestStatus.DISPATCHED,
      transportDetails: {
        carrierName: 'ColdChain Express Logistics',
        vehicleNumber: 'MH-12-RS-9901',
        driverName: 'Sanjay Deshmukh',
        driverContact: '+919822001122',
        departureTempCelsius: 4.2,
        sealsVerified: true,
        notes: 'Cold shipper boxes pre-conditioned; tamper-evident security seal intact.',
      },
      createdById: '00000000-0000-4000-a000-000000000005',
      finalisedById: '00000000-0000-4000-a000-000000000005',
      finalisedAt: pastDays(1),
      dispatchedById: '00000000-0000-4000-a000-000000000005',
      dispatchedAt: pastDays(1),
    },
  });

  await prisma.handoverItem.upsert({
    where: {
      manifestId_collectionUnitId: {
        manifestId: manifest.id,
        collectionUnitId: cu2.id,
      },
    },
    update: { outcome: ItemReceiptOutcome.PENDING },
    create: {
      manifestId: manifest.id,
      collectionUnitId: cu2.id,
      expectedUnitNumber: cu2.unitNumber,
      outcome: ItemReceiptOutcome.PENDING,
    },
  });
  console.log(`  [UPSERT] Handover Manifest: ${manifest.manifestNumber} -> DISPATCHED (Contains ${cu2.unitNumber})`);

  // ----------------------------------------------------
  // 12. Hospital Issue Orders & Discrepancy Records
  // ----------------------------------------------------
  console.log('\n--- 12. Seeding Hospital Issue Orders & Traceable Hospital Dispositions ---');

  // Order 1: Successfully Transfused
  const order1 = await prisma.hospitalIssueOrder.upsert({
    where: { orderNumber: 'DEMO-HO-2026-001' },
    update: { status: HospitalIssueStatus.RECEIVED },
    create: {
      id: '00000000-0000-4000-3000-000000000001',
      orderNumber: 'DEMO-HO-2026-001',
      issuingOrganisationId: org1.id,
      receivingFacilityId: hospOrg.id,
      status: HospitalIssueStatus.RECEIVED,
      authorisationReason: 'Emergency transfusion for trauma surgery patient.',
      authorisedById: '00000000-0000-4000-a000-000000000002',
      authorisedAt: pastDays(1),
      dispatchedById: '00000000-0000-4000-a000-000000000003',
      dispatchedAt: pastDays(1),
      receivedById: '00000000-0000-4000-a000-000000000008',
      receivedAt: pastDays(1),
      transportDetails: {
        courier: 'Hospital Emergency Courier Van',
        vehicle: 'MH-12-EM-1122',
        coolerBoxTemp: 4.5,
      },
    },
  });

  await prisma.hospitalIssueItem.upsert({
    where: {
      issueOrderId_componentUnitId: {
        issueOrderId: order1.id,
        componentUnitId: cmp6.id,
      },
    },
    update: { status: HospitalItemStatus.TRANSFUSED },
    create: {
      issueOrderId: order1.id,
      componentUnitId: cmp6.id,
      status: HospitalItemStatus.TRANSFUSED,
      receivingOutcome: HospitalItemReceiptOutcome.VERIFIED_INTACT,
      receivedById: '00000000-0000-4000-a000-000000000008',
      receivedAt: pastDays(1),
      receivingNotes: 'Verified intact; cold chain maintained at 4.5°C. Transfused in OT-2.',
    },
  });

  await prisma.componentDispositionRecord.upsert({
    where: { id: '00000000-0000-4000-3100-000000000001' },
    update: { dispositionType: ComponentDispositionType.TRANSFUSION_DOCUMENTED },
    create: {
      id: '00000000-0000-4000-3100-000000000001',
      componentUnitId: cmp6.id,
      organisationId: hospOrg.id,
      dispositionType: ComponentDispositionType.TRANSFUSION_DOCUMENTED,
      reason: 'Routine whole-blood derived PRBC transfusion for acute blood loss.',
      clinicalProtocolRef: 'DMMH Transfusion Committee Guideline 2026',
      documentationRef: 'MRN-2026-90412 / OT-2 Log',
      recipientPatientRef: 'Patient Anon-12',
      recordedById: '00000000-0000-4000-a000-000000000008',
      recordedAt: pastDays(1),
    },
  });

  // Order 2: Received with Discrepancy (Damaged Bag)
  const order2 = await prisma.hospitalIssueOrder.upsert({
    where: { orderNumber: 'DEMO-HO-2026-002' },
    update: { status: HospitalIssueStatus.RECEIVED_WITH_DISCREPANCIES },
    create: {
      id: '00000000-0000-4000-3000-000000000002',
      orderNumber: 'DEMO-HO-2026-002',
      issuingOrganisationId: org1.id,
      receivingFacilityId: hospOrg.id,
      status: HospitalIssueStatus.RECEIVED_WITH_DISCREPANCIES,
      authorisationReason: 'ICU stock replenishment.',
      authorisedById: '00000000-0000-4000-a000-000000000002',
      authorisedAt: pastDays(2),
      dispatchedById: '00000000-0000-4000-a000-000000000003',
      dispatchedAt: pastDays(2),
      receivedById: '00000000-0000-4000-a000-000000000008',
      receivedAt: pastDays(2),
    },
  });

  const issueItem2 = await prisma.hospitalIssueItem.upsert({
    where: {
      issueOrderId_componentUnitId: {
        issueOrderId: order2.id,
        componentUnitId: cmp7.id,
      },
    },
    update: { status: HospitalItemStatus.DISCREPANT },
    create: {
      issueOrderId: order2.id,
      componentUnitId: cmp7.id,
      status: HospitalItemStatus.DISCREPANT,
      receivingOutcome: HospitalItemReceiptOutcome.DAMAGED,
      receivedById: '00000000-0000-4000-a000-000000000008',
      receivedAt: pastDays(2),
      receivingNotes: 'Container port seal ruptured during transport. Unit compromised.',
    },
  });

  await prisma.hospitalDiscrepancy.upsert({
    where: { id: '00000000-0000-4000-3200-000000000001' },
    update: { status: ExceptionStatus.OPEN },
    create: {
      id: '00000000-0000-4000-3200-000000000001',
      issueOrderId: order2.id,
      issueItemId: issueItem2.id,
      componentUnitId: cmp7.id,
      category: HospitalDiscrepancyCategory.DAMAGED_CONTAINER,
      severity: ExceptionSeverity.HIGH,
      status: ExceptionStatus.OPEN,
      description: 'Primary bag port seam punctured with slight leakage inside secondary biohazard pouch.',
      reportedById: '00000000-0000-4000-a000-000000000008',
    },
  });
  console.log(`  [UPSERT] Hospital Orders Seeded:
    - ${order1.orderNumber} -> RECEIVED & TRANSFUSION_DOCUMENTED
    - ${order2.orderNumber} -> RECEIVED_WITH_DISCREPANCIES (Damaged Container Exception)`);

  // ----------------------------------------------------
  // 13. Patient Blood Requests & Donor Recipient Responses
  // ----------------------------------------------------
  console.log('\n--- 13. Seeding Patient Requests & Donor Coordination Lifecycle ---');

  // Request 1: OPEN (Seeking O+ blood)
  const req1 = await prisma.bloodRequest.upsert({
    where: { id: '00000000-0000-4000-4000-000000000001' },
    update: { status: 'OPEN' as any },
    create: {
      id: '00000000-0000-4000-4000-000000000001',
      requesterId: '00000000-0000-4000-a000-000000000010',
      patientName: 'Rohan Patel',
      bloodGroup: BloodGroup.O_POS,
      component: 'Packed Red Blood Cells',
      unitsRequested: 2,
      requiredBy: futureDays(2),
      hospitalCode: 'DEMO-CENTRE-001',
      message: 'Urgent surgery scheduled at Sassoon General Hospital, Pune.',
      status: 'OPEN' as any,
    },
  });

  // Donor Responses for Request 1
  // Donor 1: ACCEPTED
  await prisma.donorResponse.upsert({
    where: {
      requestId_donorId: {
        requestId: req1.id,
        donorId: '00000000-0000-4000-a100-000000000011',
      },
    },
    update: { status: 'ACCEPTED' as any, disclosureAuthorized: true },
    create: {
      requestId: req1.id,
      donorId: '00000000-0000-4000-a100-000000000011',
      status: 'ACCEPTED' as any,
      respondedAt: pastDays(1),
      disclosureAuthorized: true,
      contactDisclosedAt: pastDays(1),
    },
  });

  // Donor 2: DECLINED (Can be toggled back to ACCEPTED by Pooja in Scenario 9!)
  await prisma.donorResponse.upsert({
    where: {
      requestId_donorId: {
        requestId: req1.id,
        donorId: '00000000-0000-4000-a100-000000000012',
      },
    },
    update: { status: 'DECLINED' as any, disclosureAuthorized: false },
    create: {
      requestId: req1.id,
      donorId: '00000000-0000-4000-a100-000000000012',
      status: 'DECLINED' as any,
      respondedAt: pastDays(1),
      disclosureAuthorized: false,
    },
  });
  console.log(`  [UPSERT] Request 1 (${req1.id}): OPEN -> 1 Accepted (Aditya), 1 Declined (Pooja)`);

  // Request 2: CLOSED with DONATION_COMPLETED
  await prisma.bloodRequest.upsert({
    where: { id: '00000000-0000-4000-4000-000000000002' },
    update: { status: 'CLOSED' as any, closureOutcome: 'DONATION_COMPLETED' },
    create: {
      id: '00000000-0000-4000-4000-000000000002',
      requesterId: '00000000-0000-4000-a000-000000000010',
      patientName: 'Geeta Kulkarni',
      bloodGroup: BloodGroup.O_POS,
      component: 'Packed Red Blood Cells',
      unitsRequested: 1,
      hospitalCode: 'DEMO-CENTRE-001',
      status: 'CLOSED' as any,
      closureOutcome: 'DONATION_COMPLETED',
      closureFeedback: 'Donor Aditya Verma attended promptly and completed whole blood donation.',
      closureReportedBy: '00000000-0000-4000-a000-000000000010',
      reportedDonationStatus: 'VERIFIED',
      reportedDonorId: '00000000-0000-4000-a100-000000000011',
      donationVerifiedAt: pastDays(5),
      verifiedBy: '00000000-0000-4000-a000-000000000002',
      closedAt: pastDays(5),
    },
  });

  // Request 3: CLOSED with ARRANGED_ELSEWHERE
  await prisma.bloodRequest.upsert({
    where: { id: '00000000-0000-4000-4000-000000000003' },
    update: { status: 'CLOSED' as any, closureOutcome: 'ARRANGED_ELSEWHERE' },
    create: {
      id: '00000000-0000-4000-4000-000000000003',
      requesterId: '00000000-0000-4000-a000-000000000010',
      patientName: 'Sanjay Shirodkar',
      bloodGroup: BloodGroup.B_POS,
      component: 'Whole Blood',
      unitsRequested: 1,
      status: 'CLOSED' as any,
      closureOutcome: 'ARRANGED_ELSEWHERE',
      closureFeedback: 'Arranged via blood bank existing reserve.',
      closedAt: pastDays(7),
    },
  });

  // Request 4: CANCELLED
  await prisma.bloodRequest.upsert({
    where: { id: '00000000-0000-4000-4000-000000000004' },
    update: { status: 'CANCELLED' as any, closureOutcome: 'NO_LONGER_NEEDED' },
    create: {
      id: '00000000-0000-4000-4000-000000000004',
      requesterId: '00000000-0000-4000-a000-000000000010',
      patientName: 'Ashok Deshmukh',
      bloodGroup: BloodGroup.A_POS,
      component: 'Platelets',
      unitsRequested: 2,
      status: 'CANCELLED' as any,
      closureOutcome: 'NO_LONGER_NEEDED',
      closureFeedback: 'Patient discharged without transfusion requirement.',
      closedAt: pastDays(10),
    },
  });
  console.log('  [UPSERT] Closed Requests Seeded (DONATION_COMPLETED, ARRANGED_ELSEWHERE, CANCELLED)');

  // ----------------------------------------------------
  // 14. External e-RaktKosh Demo Snapshot
  // ----------------------------------------------------
  console.log('\n--- 14. Seeding External Directory Demo Snapshot ---');

  const extCentre = await prisma.bloodCentre.upsert({
    where: { hospitalCode: 'EXT-ERAKTKOSH-PUN-999' },
    update: { hospitalName: 'District Hospital Aundh Blood Bank (e-RaktKosh Mock Directory)' },
    create: {
      hospitalCode: 'EXT-ERAKTKOSH-PUN-999',
      hospitalName: 'District Hospital Aundh Blood Bank (e-RaktKosh Mock Directory)',
      mobileNo: '+912027280001',
      address: 'Aundh Chest Hospital Campus, Pune, Maharashtra 411027',
      stateCode: 27,
      districtCode: 521,
    },
  });

  await prisma.bloodAvailabilitySnapshot.upsert({
    where: { id: '00000000-0000-4000-9000-000000000001' },
    update: { reportedQuantity: 15 },
    create: {
      id: '00000000-0000-4000-9000-000000000001',
      hospitalCode: extCentre.hospitalCode,
      component: 'Packed Red Blood Cells',
      bloodGroup: 'B+Ve',
      rawStockString: 'B+Ve : 15 (External Demo Cache)',
      reportedQuantity: 15,
      quantityUnit: 'Units',
      sourceEntryDate: pastDays(1),
      isStale: false,
    },
  });
  console.log(`  [UPSERT] External Directory Snapshot Seeded: ${extCentre.hospitalName} (15 Units PRBC B+Ve)`);

  console.log('\n========================================================================');
  console.log(' [SUCCESS] RaktaSetu Synthetic Demo Dataset Seeded Successfully!');
  console.log('========================================================================\n');
}

if (require.main === module) {
  seedDemoData()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (e) => {
      console.error('Seed Error:', e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
