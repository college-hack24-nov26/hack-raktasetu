import { prisma } from '../lib/prisma';

export async function repairRahulDonation() {
  console.log('--- Starting Safe Data Repair for Rahul Yadav ---');

  // 1. Locate Rahul Yadav's donor registration
  const donorRegs: any[] = await prisma.$queryRawUnsafe(`
    SELECT * FROM donor_registrations
    WHERE donor_details->>'fullName' ILIKE '%Rahul Yadav%'
    LIMIT 1;
  `);

  if (!donorRegs || donorRegs.length === 0) {
    throw new Error('Rahul Yadav donor registration record not found.');
  }

  const reg = donorRegs[0];
  console.log(`Found Registration: ${reg.id} (${reg.registration_number})`);
  console.log(`Current workflow_status: ${reg.workflow_status}, collection_status: ${reg.collection_status}`);

  // 2. Validate prerequisites: Donor must be clinically CLEARED
  const attendance = await prisma.campAttendance.findFirst({
    where: {
      campId: reg.camp_id,
      userId: reg.donor_user_id,
    },
    include: {
      screening: true,
      donationEvent: {
        include: {
          collectionUnit: true,
        },
      },
    },
  });

  if (!attendance) {
    throw new Error(`Camp attendance record not found for donor ${reg.donor_user_id} in camp ${reg.camp_id}`);
  }

  if (!attendance.screening || attendance.screening.status !== 'CLEARED') {
    throw new Error(`Safety Violation: Donor has not been clinically screened and CLEARED. Current status: ${attendance.screening?.status}`);
  }

  console.log(`Clinical Screening Verified: CLEARED (Decision: ${attendance.screening.eligibilityDecision})`);

  // Verify phlebotomy details exist
  if (!reg.volume_ml || Number(reg.volume_ml) <= 0) {
    throw new Error('No collected volume recorded on phlebotomy sheet.');
  }

  const donationEvent = attendance.donationEvent;
  if (!donationEvent) {
    throw new Error('Donation event record not found for attendance.');
  }

  console.log(`Current DonationEvent ${donationEvent.id}: outcome="${donationEvent.outcome}", volume=${donationEvent.volumeMl}mL`);

  // 3. Execute transactional update
  await prisma.$transaction(async (tx) => {
    // A. Update donor_registrations: set collection_status to COLLECTED
    await tx.$executeRawUnsafe(`
      UPDATE donor_registrations
      SET
        collection_status = 'COLLECTED',
        workflow_status = 'COLLECTION_COMPLETED',
        updated_at = NOW()
      WHERE id = $1
    `, reg.id);

    // B. Update donationEvent: set outcome to COMPLETED
    await tx.donationEvent.update({
      where: { id: donationEvent.id },
      data: {
        outcome: 'COMPLETED',
        volumeMl: Number(reg.volume_ml) || 350,
      },
    });

    // C. Update donor profile verifiedLastDonationDate
    await tx.donorProfile.updateMany({
      where: { userId: reg.donor_user_id },
      data: {
        verifiedLastDonationDate: donationEvent.performedAt,
        lastDonationDate: donationEvent.performedAt,
      },
    });
  });

  console.log('--- Transaction Committed Successfully ---');
  console.log(`Rahul Yadav's donation event ${donationEvent.id} is now COMPLETED.`);
  console.log('Collection unit confirmation may now legitimately proceed through TraceabilityService.createCollectionUnit.');
}

if (require.main === module) {
  repairRahulDonation()
    .then(() => {
      console.log('Data repair completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Data repair failed:', err);
      process.exit(1);
    });
}
