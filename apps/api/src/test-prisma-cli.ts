import { execSync } from 'child_process';

try {
  const out = execSync('npx prisma --version', { encoding: 'utf-8', stdio: 'pipe' });
  console.log('PRISMA VERSION:', out);
} catch (e: any) {
  console.error('Error running prisma:', e.message);
}
