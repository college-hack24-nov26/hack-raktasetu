import { prisma } from './lib/prisma';

export async function cleanupDemoData() {
  console.log('========================================================================');
  console.log(' RaktaSetu — Safe Synthetic Demo Dataset Cleanup');
  console.log('========================================================================\n');

  // Verify database connection
  await prisma.$connect();
  console.log('[OK] Connected to PostgreSQL. Commencing dependency-safe demo deletion...\n');

  const demoUserPhones = [
    '+919999980001',
    '+919999980002',
    '+919999980003',
    '+919999980004',
    '+919999980005',
    '+919999980006',
    '+919999980007',
    '+919999980008',
    '+919999980009',
    '+919999980010',
    '+919999980011',
    '+919999980012',
    '+919999980013',
    '+919999980014',
  ];

  const demoOrgCodes = ['DEMO-ORG-PUN-001', 'DEMO-ORG-PUN-002', 'DEMO-ORG-PUN-HOSP-001'];
  const demoCampCodes = ['DEMO-CAMP-PUN-001', 'DEMO-CAMP-PUN-002', 'DEMO-CAMP-PUN-003'];

  // 1. Delete Hospital Discrepancies & Dispositions
  const deletedDisp = await prisma.componentDispositionRecord.deleteMany({
    where: { componentUnit: { componentCode: { startsWith: 'DEMO-CMP-' } } },
  });
  console.log(`  [DELETE] ${deletedDisp.count} ComponentDispositionRecords`);

  const deletedHospDisc = await prisma.hospitalDiscrepancy.deleteMany({
    where: { issueOrder: { orderNumber: { startsWith: 'DEMO-HO-' } } },
  });
  console.log(`  [DELETE] ${deletedHospDisc.count} HospitalDiscrepancies`);

  const deletedHospItems = await prisma.hospitalIssueItem.deleteMany({
    where: { issueOrder: { orderNumber: { startsWith: 'DEMO-HO-' } } },
  });
  console.log(`  [DELETE] ${deletedHospItems.count} HospitalIssueItems`);

  const deletedHospOrders = await prisma.hospitalIssueOrder.deleteMany({
    where: { orderNumber: { startsWith: 'DEMO-HO-' } },
  });
  console.log(`  [DELETE] ${deletedHospOrders.count} HospitalIssueOrders`);

  // 2. Delete Clinical Releases & Laboratory Records
  const deletedReleases = await prisma.clinicalReleaseRecord.deleteMany({
    where: { componentUnit: { componentCode: { startsWith: 'DEMO-CMP-' } } },
  });
  console.log(`  [DELETE] ${deletedReleases.count} ClinicalReleaseRecords`);

  const deletedLabTests = await prisma.laboratoryTestRecord.deleteMany({
    where: { componentUnit: { componentCode: { startsWith: 'DEMO-CMP-' } } },
  });
  console.log(`  [DELETE] ${deletedLabTests.count} LaboratoryTestRecords`);

  // 3. Delete Handover Items & Manifests
  const deletedHandoverItems = await prisma.handoverItem.deleteMany({
    where: { manifest: { manifestNumber: { startsWith: 'DEMO-HM-' } } },
  });
  console.log(`  [DELETE] ${deletedHandoverItems.count} HandoverItems`);

  const deletedManifests = await prisma.handoverManifest.deleteMany({
    where: { manifestNumber: { startsWith: 'DEMO-HM-' } },
  });
  console.log(`  [DELETE] ${deletedManifests.count} HandoverManifests`);

  // 4. Delete Component Units & Collection Units
  const deletedComponents = await prisma.componentUnit.deleteMany({
    where: { componentCode: { startsWith: 'DEMO-CMP-' } },
  });
  console.log(`  [DELETE] ${deletedComponents.count} ComponentUnits`);

  const deletedCollectionUnits = await prisma.collectionUnit.deleteMany({
    where: { unitNumber: { startsWith: 'CU-DEMO-' } },
  });
  console.log(`  [DELETE] ${deletedCollectionUnits.count} CollectionUnits`);

  // 5. Delete Donation Events & Clinical Screenings
  const deletedDonations = await prisma.donationEvent.deleteMany({
    where: { camp: { campCode: { in: demoCampCodes } } },
  });
  console.log(`  [DELETE] ${deletedDonations.count} DonationEvents`);

  const deletedScreenings = await prisma.clinicalScreening.deleteMany({
    where: { camp: { campCode: { in: demoCampCodes } } },
  });
  console.log(`  [DELETE] ${deletedScreenings.count} ClinicalScreenings`);

  // 6. Delete Camp Attendances & Camps
  const deletedAttendance = await prisma.campAttendance.deleteMany({
    where: { camp: { campCode: { in: demoCampCodes } } },
  });
  console.log(`  [DELETE] ${deletedAttendance.count} CampAttendances`);

  const deletedCamps = await prisma.camp.deleteMany({
    where: { campCode: { in: demoCampCodes } },
  });
  console.log(`  [DELETE] ${deletedCamps.count} Camps`);

  // 7. Delete Storage Locations
  const deletedStorage = await prisma.storageLocation.deleteMany({
    where: { locationCode: { startsWith: 'DEMO-LOC-' } },
  });
  console.log(`  [DELETE] ${deletedStorage.count} StorageLocations`);

  // 8. Delete Donor Responses & Requests
  const deletedResponses = await prisma.donorResponse.deleteMany({
    where: { request: { id: { startsWith: '00000000-0000-4000-4000-' } } },
  });
  console.log(`  [DELETE] ${deletedResponses.count} DonorResponses`);

  const deletedRequests = await prisma.bloodRequest.deleteMany({
    where: { id: { startsWith: '00000000-0000-4000-4000-' } },
  });
  console.log(`  [DELETE] ${deletedRequests.count} BloodRequests`);

  // 9. Delete Organisation Applications & Memberships
  const deletedApps = await prisma.organisationApplication.deleteMany({
    where: { licenseNumber: { startsWith: 'MH-PUN-BB-DEMO-' } },
  });
  console.log(`  [DELETE] ${deletedApps.count} OrganisationApplications`);

  const deletedMemberships = await prisma.organisationMembership.deleteMany({
    where: { organisation: { orgCode: { in: demoOrgCodes } } },
  });
  console.log(`  [DELETE] ${deletedMemberships.count} OrganisationMemberships`);

  // 10. Delete Organisations & External Demonstration Centres
  const deletedOrgs = await prisma.organisation.deleteMany({
    where: { orgCode: { in: demoOrgCodes } },
  });
  console.log(`  [DELETE] ${deletedOrgs.count} Organisations`);

  const deletedSnapshots = await prisma.bloodAvailabilitySnapshot.deleteMany({
    where: { hospitalCode: 'EXT-ERAKTKOSH-PUN-999' },
  });
  console.log(`  [DELETE] ${deletedSnapshots.count} External BloodAvailabilitySnapshots`);

  const deletedCentres = await prisma.bloodCentre.deleteMany({
    where: { hospitalCode: { in: ['DEMO-CENTRE-001', 'EXT-ERAKTKOSH-PUN-999'] } },
  });
  console.log(`  [DELETE] ${deletedCentres.count} Demo BloodCentres`);

  // 11. Delete Donor Profiles & Users
  const deletedProfiles = await prisma.donorProfile.deleteMany({
    where: { user: { phoneNumber: { in: demoUserPhones } } },
  });
  console.log(`  [DELETE] ${deletedProfiles.count} DonorProfiles`);

  const deletedSessions = await prisma.session.deleteMany({
    where: { user: { phoneNumber: { in: demoUserPhones } } },
  });
  console.log(`  [DELETE] ${deletedSessions.count} Sessions`);

  const deletedAudit = await prisma.auditLog.deleteMany({
    where: { user: { phoneNumber: { in: demoUserPhones } } },
  });
  console.log(`  [DELETE] ${deletedAudit.count} AuditLogs`);

  const deletedUsers = await prisma.user.deleteMany({
    where: { phoneNumber: { in: demoUserPhones } },
  });
  console.log(`  [DELETE] ${deletedUsers.count} Demo Users`);

  console.log('\n========================================================================');
  console.log(' [SUCCESS] All Synthetic Demo Dataset Records Cleaned Up Safely.');
  console.log(' Zero non-demo users, organisations, or donations were touched.');
  console.log('========================================================================\n');
}

if (require.main === module) {
  cleanupDemoData()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (e) => {
      console.error('Cleanup Error:', e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
