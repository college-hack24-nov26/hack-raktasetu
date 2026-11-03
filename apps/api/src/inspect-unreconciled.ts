import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const openExceptions = await prisma.reconciliationException.findMany({
    where: { status: { in: ['OPEN', 'INVESTIGATING'] } },
    include: {
      manifest: {
        include: {
          camp: true,
          items: { include: { collectionUnit: true } },
        },
      },
      collectionUnit: true,
      handoverItem: true,
    },
  });

  console.log(`Open/Investigating Exceptions count: ${openExceptions.length}`);
  for (const exc of openExceptions) {
    console.log(`\nException ID: ${exc.id}`);
    console.log(`Manifest: ${exc.manifest?.manifestNumber} (${exc.manifestId}) Status: ${exc.manifest?.status}`);
    console.log(`Camp: ${exc.manifest?.camp?.title} (${exc.manifest?.campId})`);
    console.log(`Category: ${exc.category}, Severity: ${exc.severity}`);
    console.log(`CollectionUnit: ${exc.collectionUnit?.unitNumber} (${exc.collectionUnitId}) Status: ${exc.collectionUnit?.status}`);
    console.log(`Description: ${exc.description}`);
    console.log(`HandoverItem outcome: ${exc.handoverItem?.outcome}`);
  }

  const unfinalizedManifests = await prisma.handoverManifest.findMany({
    where: { status: { in: ['PARTIALLY_RECEIVED', 'RECEIVED_WITH_DISCREPANCIES', 'DISPATCHED'] } },
    include: {
      items: { include: { collectionUnit: true } },
      exceptions: true,
      camp: true,
    },
  });

  console.log(`\nUnreconciled Manifests (PARTIALLY_RECEIVED / RECEIVED_WITH_DISCREPANCIES / DISPATCHED): ${unfinalizedManifests.length}`);
  for (const m of unfinalizedManifests) {
    console.log(`\nManifest: ${m.manifestNumber} (${m.id})`);
    console.log(`Status: ${m.status}`);
    console.log(`Camp: ${m.camp?.title} (${m.campId})`);
    console.log(`Items count: ${m.items.length}`);
    for (const item of m.items) {
      console.log(`  - Unit: ${item.collectionUnit?.unitNumber}, Outcome: ${item.outcome}, Unit Status: ${item.collectionUnit?.status}`);
    }
    console.log(`Exceptions count: ${m.exceptions.length}`);
    for (const exc of m.exceptions) {
      console.log(`  - Exc ID: ${exc.id}, Status: ${exc.status}, Category: ${exc.category}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
