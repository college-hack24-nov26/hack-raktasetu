import http from 'http';
import { app } from './app';
import { prisma } from './lib/prisma';

async function runTests() {
  console.log('--- Starting RaktaSetu Phase 2 API Verification ---');
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as any;
  const port = address.port;
  const baseUrl = `http://localhost:${port}`;

  let testsPassed = 0;
  let testsFailed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
      testsPassed++;
    } catch (err: any) {
      console.error(`[FAIL] ${name}:`, err.message);
      testsFailed++;
    }
  }

  try {
    // 1. Health check endpoint test
    await test('GET /health returns 200 and reports connected Neon DB', async () => {
      const res = await fetch(`${baseUrl}/health`);
      if (res.status !== 200) throw new Error(`Expected status 200, got ${res.status}`);
      const data = await res.json();
      if (data.status !== 'ok') throw new Error(`Expected status 'ok', got ${data.status}`);
      if (!data.database?.connected) throw new Error('Database reported not connected');
      if (data.database?.provider !== 'Neon PostgreSQL') throw new Error('Incorrect provider');
    });

    // 2. GET /api/v1/blood-centres empty directory check
    await test('GET /api/v1/blood-centres returns 200 and pagination shape', async () => {
      const res = await fetch(`${baseUrl}/api/v1/blood-centres?page=1&limit=10`);
      if (res.status !== 200) throw new Error(`Expected status 200, got ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error('Expected success: true');
      if (!Array.isArray(data.data)) throw new Error('Expected data to be an array');
      if (typeof data.pagination?.total !== 'number') throw new Error('Missing pagination total');
    });

    // 3. Database Seed & Lookup Test (using verified Pune demo centre from guide)
    const testCentreCode = '18061';
    await test('Insert & Query Verified Blood Centre in Neon', async () => {
      await prisma.bloodCentre.upsert({
        where: { hospitalCode: testCentreCode },
        update: {
          hospitalName: 'Acharya Anandrishiji Blood Centre, Pune',
          stateCode: 27,
          districtCode: 521,
          mobileNo: '8554909040',
        },
        create: {
          hospitalCode: testCentreCode,
          hospitalName: 'Acharya Anandrishiji Blood Centre, Pune',
          stateCode: 27,
          districtCode: 521,
          mobileNo: '8554909040',
        },
      });

      const res = await fetch(`${baseUrl}/api/v1/blood-centres/${testCentreCode}`);
      if (res.status !== 200) throw new Error(`Expected status 200, got ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error('Expected success: true');
      if (data.data.hospitalCode !== testCentreCode) {
        throw new Error(`Expected hospitalCode ${testCentreCode}, got ${data.data.hospitalCode}`);
      }
      if (data.data.districtCode !== 521) {
        throw new Error(`Expected districtCode 521, got ${data.data.districtCode}`);
      }
    });

    // 4. Filter query test by state and district
    await test('GET /api/v1/blood-centres?stateCode=27&districtCode=521 filters correctly', async () => {
      const res = await fetch(`${baseUrl}/api/v1/blood-centres?stateCode=27&districtCode=521`);
      if (res.status !== 200) throw new Error(`Expected status 200, got ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error('Expected success: true');
      if (data.data.length === 0) throw new Error('Expected at least 1 centre');
      if (data.data[0].districtCode !== 521) throw new Error('Filtered result does not match district 521');
    });

    // 5. 404 handler test for non-existent centre
    await test('GET /api/v1/blood-centres/non-existent returns 404', async () => {
      const res = await fetch(`${baseUrl}/api/v1/blood-centres/999999999`);
      if (res.status !== 404) throw new Error(`Expected status 404, got ${res.status}`);
      const data = await res.json();
      if (data.success !== false) throw new Error('Expected success: false');
      if (data.error?.code !== 'CENTRE_NOT_FOUND') throw new Error(`Unexpected error code: ${data.error?.code}`);
    });

    // 6. Availability Snapshot entity relation check
    await test('Record & query BloodAvailabilitySnapshot decoupled from centre', async () => {
      const snapshot = await prisma.bloodAvailabilitySnapshot.create({
        data: {
          hospitalCode: testCentreCode,
          component: 'Packed Red Blood Cells',
          bloodGroup: 'B+Ve',
          rawStockString: 'B+Ve : 129',
          reportedQuantity: 129,
          quantityUnit: null,
          sourceEntryDate: new Date('2026-10-20T08:31:31Z'),
          isStale: false,
          rawMetadata: { portal: 'e-RaktKosh', verifiedExample: true },
        },
      });

      if (!snapshot.id) throw new Error('Snapshot was not created');
      if (snapshot.reportedQuantity !== 129) throw new Error('Reported quantity mismatch');

      // Clean up test snapshot
      await prisma.bloodAvailabilitySnapshot.delete({ where: { id: snapshot.id } });
    });

    console.log(`\nVerification Complete: ${testsPassed} passed, ${testsFailed} failed.`);
  } finally {
    server.close();
    await prisma.$disconnect();
    if (testsFailed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runTests();
