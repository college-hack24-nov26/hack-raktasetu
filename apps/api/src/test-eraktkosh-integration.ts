import assert from 'node:assert';
import {
  fetchExternalBloodCentres,
  fetchExternalAvailability,
  parseStockQuantity,
  parseSourceDate,
  isSourceStale,
  normalizeContactPhone,
  VERIFIED_COMPONENT_IDS,
  VERIFIED_BLOOD_GROUP_IDS,
  VERIFIED_MAHARASHTRA_DISTRICTS,
} from './services/eraktkosh';

async function runLiveIntegrationTests() {
  console.log('================================================================');
  console.log('   RaktaSetu — Live e-RaktKosh Integration Verification Suite   ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    return Promise.resolve()
      .then(fn)
      .then(() => {
        console.log(`[PASS] ${name}`);
        passed++;
      })
      .catch((err: any) => {
        console.error(`[FAIL] ${name}`);
        console.error(`       Error: ${err.message}`);
        failed++;
      });
  }

  // --- SECTION 1: Parsing Unit Tests ---
  console.log('1. Parsing and Normalization Logic:');

  await test('parseStockQuantity correctly extracts positive quantity from colon string', () => {
    assert.strictEqual(parseStockQuantity('B+Ve : 25'), 25);
    assert.strictEqual(parseStockQuantity('Available : 3'), 3);
    assert.strictEqual(parseStockQuantity('46'), 46);
  });

  await test('parseStockQuantity handles zero and confirmed empty quantities honestly', () => {
    assert.strictEqual(parseStockQuantity('B+Ve : 0'), 0);
    assert.strictEqual(parseStockQuantity('0'), 0);
    assert.strictEqual(parseStockQuantity(''), null);
    assert.strictEqual(parseStockQuantity(null), null);
    assert.strictEqual(parseStockQuantity('null'), null);
  });

  await test('normalizeContactPhone strips 0 and validates format', () => {
    assert.strictEqual(normalizeContactPhone('8554909040'), '8554909040');
    assert.strictEqual(normalizeContactPhone('0'), null);
    assert.strictEqual(normalizeContactPhone(''), null);
    assert.strictEqual(normalizeContactPhone('-'), null);
    assert.strictEqual(normalizeContactPhone('123'), null); // too short
  });

  await test('isSourceStale flags entries older than 24 hours', () => {
    const freshDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
    const staleDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago
    assert.strictEqual(isSourceStale(freshDate), false);
    assert.strictEqual(isSourceStale(staleDate), true);
    assert.strictEqual(isSourceStale(null), true);
  });

  // --- SECTION 2: Live Directory Endpoint Tests ---
  console.log('\n2. Live Directory Endpoint (GET /bloodbanks?stateCode=27&districtCode={code}):');

  await test('Fetches live Pune (521) centres from e-RaktKosh', async () => {
    const res = await fetchExternalBloodCentres({ stateCode: 27, districtCode: 521 });
    assert.strictEqual(res.isLive, true, 'Directory response should be marked isLive');
    assert(res.centres.length >= 20, `Pune should have at least 20 centres (got ${res.centres.length})`);
    const anandrishi = res.centres.find((c) => c.hospitalCode === '18061');
    assert(anandrishi, 'Should contain Acharya Anandrishiji Blood Centre (code 18061)');
    assert.strictEqual(anandrishi.mobileNo, '8554909040');
    assert.strictEqual(anandrishi.hasValidContact, true);
  });

  await test('Fetches live Mumbai (519) centres from e-RaktKosh', async () => {
    const res = await fetchExternalBloodCentres({ stateCode: 27, districtCode: 519 });
    assert.strictEqual(res.isLive, true);
    assert(res.centres.length >= 30, `Mumbai should have at least 30 centres (got ${res.centres.length})`);
  });

  await test('Fetches live Amravati (503) centres from e-RaktKosh', async () => {
    const res = await fetchExternalBloodCentres({ stateCode: 27, districtCode: 503 });
    assert.strictEqual(res.isLive, true);
    assert(res.centres.length >= 5, `Amravati should have at least 5 centres (got ${res.centres.length})`);
  });

  await test('Fetches live Latur (524) centres from e-RaktKosh', async () => {
    const res = await fetchExternalBloodCentres({ stateCode: 27, districtCode: 524 });
    assert.strictEqual(res.isLive, true);
    assert(res.centres.length >= 5, `Latur should have at least 5 centres (got ${res.centres.length})`);
  });

  // --- SECTION 3: Live Availability Endpoint Tests ---
  console.log('\n3. Live Availability Endpoint (GET /blood-availability):');

  await test('Queries live Pune availability for PRBC (12) and B+ (13)', async () => {
    const res = await fetchExternalAvailability({
      stateCode: 27,
      districtId: 521,
      componentId: 12,
      bloodGroupId: 13,
    });
    assert(Array.isArray(res), 'Availability result should be an array');
    assert(res.length > 0, 'Should return availability records for Pune');

    // Verify fields
    const record = res[0];
    assert(record.hospitalCode, 'Record must include hospitalCode');
    assert(['available', 'no_data', 'unknown', 'stale'].includes(record.status), `Status must be valid enum: ${record.status}`);
  });

  await test('Distinguishes confirmed positive stock and verified status values', async () => {
    const res = await fetchExternalAvailability({
      stateCode: 27,
      districtId: 521,
      componentId: 12,
      bloodGroupId: 13,
    });

    const withStock = res.filter((r) => r.reportedQuantity !== null && r.reportedQuantity > 0);
    assert(withStock.length > 0, 'Should find at least one centre with reported stock');
    const sample = withStock[0];
    assert(sample.reportedQuantity! > 0, 'Reported quantity must be greater than 0');
    assert(sample.rawStockString?.includes(':'), 'Raw stock string should contain colon quantity');
  });

  // --- SECTION 4: Component and Blood Group Mapping Registry ---
  console.log('\n4. Component and Blood Group Identifier Verification:');

  await test('All 8 major blood group codes are defined and tested', () => {
    const expectedGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    for (const g of expectedGroups) {
      assert(VERIFIED_BLOOD_GROUP_IDS[g] !== undefined, `Group ${g} must be mapped`);
    }
  });

  await test('All 5 core blood components are defined and tested', () => {
    const expectedComponents = [
      'Packed Red Blood Cells',
      'Whole Blood',
      'Platelet Concentrate',
      'Fresh Frozen Plasma',
      'Cryoprecipitate',
    ];
    for (const c of expectedComponents) {
      assert(VERIFIED_COMPONENT_IDS[c] !== undefined, `Component ${c} must be mapped`);
    }
  });

  // --- SECTION 5: End-to-End API Routes via HTTP ---
  console.log('\n5. End-to-End API Route Invocations on http://localhost:4000:');

  const apiUrl = 'http://localhost:4000/api/v1';

  await test('GET /api/v1/blood-centres?stateCode=27&districtCode=521 returns live Pune centres', async () => {
    const response = await fetch(`${apiUrl}/blood-centres?stateCode=27&districtCode=521`);
    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.success, true);
    assert(body.data.length >= 20, `Should return at least 20 centres in page (got ${body.data.length})`);
    assert.strictEqual(body.meta.isLive, true, 'Meta should indicate live directory');
    assert.strictEqual(body.meta.source, 'e-RaktKosh Live Directory');
  });

  await test('GET /api/v1/blood-availability?stateCode=27&districtCode=521&bloodGroup=B%2B returns merged live data', async () => {
    const response = await fetch(
      `${apiUrl}/blood-availability?stateCode=27&districtCode=521&bloodGroup=B%2B&component=Packed%20Red%20Blood%20Cells`
    );
    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.success, true);
    assert(body.data.length > 0, 'Should return centre results');
    assert.strictEqual(body.meta.isLiveDirectory, true, 'isLiveDirectory should be true');
    assert.strictEqual(body.meta.mappingVerified, true, 'mappingVerified should be true');

    // Check first result has both bloodCentre and availability objects
    const first = body.data[0];
    assert(first.bloodCentre, 'Result must contain bloodCentre');
    assert(first.bloodCentre.hospitalCode, 'Must have hospitalCode');
    assert(first.availability, 'Result must contain availability');
    assert(['available', 'no_data', 'unknown', 'stale'].includes(first.availability.status));
  });

  await test('GET /api/v1/blood-availability for Mumbai (519) returns live centres and stock', async () => {
    const response = await fetch(
      `${apiUrl}/blood-availability?stateCode=27&districtCode=519&bloodGroup=O%2B&component=Packed%20Red%20Blood%20Cells`
    );
    assert.strictEqual(response.status, 200);
    const body = await response.json();
    assert.strictEqual(body.success, true);
    assert(body.data.length >= 30, `Mumbai should return at least 30 centres (got ${body.data.length})`);
    assert.strictEqual(body.meta.districtCode, 519);
  });

  // --- Summary ---
  console.log('\n================================================================');
  console.log(`Verification Complete: ${passed} passed, ${failed} failed.`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runLiveIntegrationTests();
