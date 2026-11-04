import { prisma } from './lib/prisma';

async function main() {
  console.log('--- CHECKING USERS ---');
  const users = await prisma.user.findMany({
    where: { phoneNumber: { contains: '9420669095' } },
    include: { memberships: true, submittedApplications: true },
  });
  console.log('USERS:', JSON.stringify(users, null, 2));

  console.log('--- CHECKING APPLICATIONS FOR PHONE ---');
  const apps = await prisma.organisationApplication.findMany({
    where: { phone: { contains: '9420669095' } },
    include: { resultingOrg: true },
  });
  console.log('APPLICATIONS BY PHONE:', JSON.stringify(apps, null, 2));

  console.log('--- ALL APPROVED APPLICATIONS ---');
  const allApproved = await prisma.organisationApplication.findMany({
    where: { status: 'APPROVED' },
    select: {
      id: true,
      hospitalName: true,
      phone: true,
      applicantUserId: true,
      resultingOrgId: true,
      status: true,
      reviewedAt: true,
      reviewedBy: true,
    },
  });
  console.log('APPROVED COUNT:', allApproved.length);
  console.log('APPROVED APPS:', JSON.stringify(allApproved, null, 2));

  if (apps.length > 0 && apps[0].resultingOrgId) {
    console.log('--- RESULTING ORG MEMBERSHIPS ---');
    const orgMemberships = await prisma.organisationMembership.findMany({
      where: { organisationId: apps[0].resultingOrgId },
      include: { user: true, organisation: true },
    });
    console.log('ORG MEMBERSHIPS:', JSON.stringify(orgMemberships, null, 2));
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
