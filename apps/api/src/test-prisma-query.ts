import { prisma } from './lib/prisma';

async function main() {
  const count = await prisma.user.count();
  console.log('SUCCESS: User count is', count);
  const camps = await prisma.camp.count();
  console.log('SUCCESS: Camp count is', camps);
}

main().catch(console.error).finally(() => prisma.$disconnect());
