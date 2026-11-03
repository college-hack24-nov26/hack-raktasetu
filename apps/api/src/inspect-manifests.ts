import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const manifests = await prisma.handoverManifest.findMany({
    include: {
      items: {
        include: {
          collectionUnit: true,
        },
      },
      exceptions: true,
      camp: true,
    },
  });

  console.log(`Found ${manifests.length} manifests:`);
  for (const m of manifests) {
    console.log(`\n========================================`);
    console.log(`Manifest: ${m.manifestNumber} (ID: ${m.id})`);
    console.log(`Status: ${m.status}`);
    console.log(`Camp: ${m.camp?.title} (${m.campId})`);
    console.log(`Sending Org: ${m.sendingOrganisationId}, Receiving Org: ${m.receivingOrganisationId}`);
    console.log(`Items (${m.items.length}):`);
    for (const item of m.items) {
      console.log(`  - Item ID: ${item.id}, Expected Unit: ${item.expectedUnitNumber}, Outcome: ${item.outcome}`);
      console.log(`    CollectionUnit: ${item.collectionUnit?.unitNumber}, Status: ${item.collectionUnit?.status}`);
    }
    console.log(`Exceptions (${m.exceptions.length}):`);
    for (const exc of m.exceptions) {
      console.log(`  - Exception ID: ${exc.id}, Status: ${exc.status}, Category: ${exc.category}, CollectionUnitId: ${exc.collectionUnitId}`);
      console.log(`    Description: ${exc.description}`);
      console.log(`    Resolution Notes: ${exc.resolutionNotes}`);
    }
  }

  // Also check camps
  const camps = await prisma.camp.findMany({
    where: { status: { in: ['APPROVED', 'COMPLETED'] } },
    select: { id: true, campCode: true, title: true, status: true },
  });
  console.log(`\nActive Camps (${camps.length}):`, camps);
}

main().catch(console.error).finally(() => prisma.$disconnect());
