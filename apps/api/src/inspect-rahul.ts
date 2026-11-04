import { prisma } from './lib/prisma';

async function main() {
  const users = await prisma.user.findMany({
    where: { name: { contains: 'Rahul', mode: 'insensitive' } },
    include: {
      campAttendances: {
        include: {
          camp: true,
          screening: true,
          donationEvent: {
            include: {
              collectionUnit: true,
            },
          },
        },
      },
    },
  });

  console.log('--- USERS MATCHING RAHUL ---');
  console.log(JSON.stringify(users, null, 2));

  const attendances = await prisma.campAttendance.findMany({
    where: { donorName: { contains: 'Rahul', mode: 'insensitive' } },
    include: {
      camp: true,
      screening: true,
      donationEvent: {
        include: {
          collectionUnit: true,
        },
      },
    },
  });

  console.log('--- ATTENDANCES MATCHING RAHUL ---');
  console.log(JSON.stringify(attendances, null, 2));

  try {
    const rawDonorRegs = await prisma.$queryRawUnsafe(`
      SELECT * FROM donor_registrations
      WHERE donor_details->>'fullName' ILIKE '%Rahul%'
    `);
    console.log('--- DONOR REGISTRATIONS MATCHING RAHUL ---');
    console.log(JSON.stringify(rawDonorRegs, null, 2));
  } catch (err) {
    console.error('Error querying donor_registrations:', err);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
