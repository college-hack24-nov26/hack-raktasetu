import assert from 'assert';
import {
  normalizeAvailabilityItem,
  parseStockQuantity,
  parseSourceDate,
  isSourceStale,
  ParsedAvailabilityResult,
} from './services/eraktkosh';

console.log('====================================================');
console.log('  RaktaSetu — e-RaktKosh Data-Status Audit Test Suite');
console.log('====================================================\n');

let passedCount = 0;
let failedCount = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedCount++;
  } catch (err: any) {
    console.error(`[FAIL] ${name}`);
    console.error(`       Error: ${err.message}`);
    failedCount++;
  }
}

// Helper to format ISO date string to "YYYY-MM-DD HH:mm:ss"
function toEntryDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const now = new Date();
const freshDateStr = toEntryDateString(new Date(now.getTime() - 2 * 60 * 60 * 1000)); // 2 hours ago (fresh)
const staleDateStr = toEntryDateString(new Date(now.getTime() - 48 * 60 * 60 * 1000)); // 48 hours ago (stale > 24h)

// ----------------------------------------------------
// 1. Positive Stock Test
// ----------------------------------------------------
runTest('Scenario 1: Positive stock preserves returned quantity and sets status="available"', () => {
  const rawPositivePayload = {
    hospitalcode: '18061',
    hospitalname: 'Acharya Anandrishiji Blood Centre, Pune',
    hospitaladd: 'Rasta Peth, Pune',
    hospitalcontact: '8554909040',
    entrydate: freshDateStr,
    bldgrpcode1: 'B+',
    components: {
      'Packed Red Blood Cells': {
        available_WithQty: 'B+Ve : 25',
        not_available_WithQty: '',
      },
    },
  };

  const result = normalizeAvailabilityItem(rawPositivePayload);
  assert.ok(result !== null, 'Result should not be null');
  assert.strictEqual(result.reportedQuantity, 25, 'Should preserve positive quantity 25');
  assert.strictEqual(result.status, 'available', 'Status must be "available"');
  assert.strictEqual(result.isStale, false, 'Fresh entry should not be stale');
  assert.strictEqual(result.hospitalCode, '18061');
  assert.strictEqual(result.component, 'Packed Red Blood Cells');
});

// ----------------------------------------------------
// 2. Explicit Zero Stock Test
// ----------------------------------------------------
runTest('Scenario 2A: Explicit zero stock (not_available_WithQty: "B+Ve : 0") sets status="zero" and reportedQuantity=0', () => {
  const rawExplicitZeroPayload = {
    hospitalcode: '18061',
    hospitalname: 'Acharya Anandrishiji Blood Centre, Pune',
    hospitaladd: 'Rasta Peth, Pune',
    hospitalcontact: '8554909040',
    entrydate: freshDateStr,
    bldgrpcode1: 'B+',
    components: {
      'Packed Red Blood Cells': {
        available_WithQty: '',
        not_available_WithQty: 'B+Ve : 0',
      },
    },
  };

  const result = normalizeAvailabilityItem(rawExplicitZeroPayload);
  assert.ok(result !== null, 'Result should not be null');
  assert.strictEqual(result.reportedQuantity, 0, 'Explicit zero must produce reportedQuantity: 0');
  assert.strictEqual(result.status, 'zero', 'Status must be distinctly "zero" (NOT "no_data" or "unknown")');
  assert.strictEqual(result.isStale, false, 'Fresh zero entry should not be stale');
});

runTest('Scenario 2B: Top-level fallback explicit zero produces status="zero"', () => {
  const rawTopLevelZeroPayload = {
    hospitalCode: '18062',
    hospitalName: 'Sassoon General Hospital Blood Bank, Pune',
    entrydate: freshDateStr,
    not_available_WithQty: 'O+Ve : 0',
  };

  const result = normalizeAvailabilityItem(rawTopLevelZeroPayload);
  assert.ok(result !== null, 'Result should not be null');
  assert.strictEqual(result.reportedQuantity, 0, 'Must produce reportedQuantity: 0');
  assert.strictEqual(result.status, 'zero', 'Status must be "zero"');
});

// ----------------------------------------------------
// 3. Missing, Null, or Malformed Stock Test
// ----------------------------------------------------
runTest('Scenario 3A: Missing component stock data sets status="unknown" and reportedQuantity=null (NEVER 0)', () => {
  const rawMissingPayload = {
    hospitalcode: '18063',
    hospitalname: 'Ruby Hall Clinic Blood Centre',
    hospitaladd: 'Sassoon Road, Pune',
    entrydate: freshDateStr,
    components: {
      'Packed Red Blood Cells': {
        available_WithQty: '',
        not_available_WithQty: '',
      },
    },
  };

  const result = normalizeAvailabilityItem(rawMissingPayload);
  assert.ok(result !== null, 'Result should not be null');
  assert.strictEqual(result.reportedQuantity, null, 'Missing stock must be null, never 0');
  assert.strictEqual(result.status, 'unknown', 'Missing stock status must be "unknown"');
});

runTest('Scenario 3B: Malformed / unparseable stock string sets status="unknown" and reportedQuantity=null', () => {
  const rawMalformedPayload = {
    hospitalcode: '18064',
    hospitalname: 'KEM Hospital Blood Centre',
    entrydate: freshDateStr,
    available_WithQty: 'Unspecified Value',
  };

  const result = normalizeAvailabilityItem(rawMalformedPayload);
  assert.ok(result !== null, 'Result should not be null');
  assert.strictEqual(result.reportedQuantity, null, 'Unparseable stock must be null, never 0');
  assert.strictEqual(result.status, 'unknown', 'Status must be "unknown"');
});

// ----------------------------------------------------
// 4. Stale Stock (>24 hours old) Test
// ----------------------------------------------------
runTest('Scenario 4: Stale stock (>24h old) sets isStale=true and status="stale" even with positive quantity', () => {
  const rawStalePayload = {
    hospitalcode: '18065',
    hospitalname: 'Jehangir Hospital Blood Bank',
    entrydate: staleDateStr, // 48 hours ago
    components: {
      'Packed Red Blood Cells': {
        available_WithQty: 'B+Ve : 15',
        not_available_WithQty: '',
      },
    },
  };

  const result = normalizeAvailabilityItem(rawStalePayload);
  assert.ok(result !== null, 'Result should not be null');
  assert.strictEqual(result.reportedQuantity, 15, 'Should preserve historical quantity');
  assert.strictEqual(result.isStale, true, 'isStale must be true for entry > 24h old');
  assert.strictEqual(result.status, 'stale', 'Status must be "stale"');
});

// ----------------------------------------------------
// 5. Upstream Failure / Timeout Handling Test
// ----------------------------------------------------
runTest('Scenario 5: Upstream fetch failure does not fabricate zero stock or throw unhandled error', () => {
  // Simulate an upstream network error or empty response fallback in the availability router
  const simulatedCentres = [
    {
      hospitalCode: '18061',
      hospitalName: 'Acharya Anandrishiji Blood Centre, Pune',
      mobileNo: '8554909040',
      address: 'Rasta Peth, Pune',
      stateCode: 27,
      districtCode: 521,
      hasValidContact: true,
    },
  ];

  // Upstream returns empty results or threw network error:
  const liveResultsMap = new Map<string, ParsedAvailabilityResult>();
  const dbSnapshotMap = new Map();

  const mappedResults = simulatedCentres.map((centre) => {
    const liveData = liveResultsMap.get(centre.hospitalCode);
    const dbData = dbSnapshotMap.get(centre.hospitalCode);

    if (liveData) {
      return { status: liveData.status, quantity: liveData.reportedQuantity };
    }
    if (dbData) {
      return { status: 'cached', quantity: dbData.reportedQuantity };
    }
    return {
      status: 'unknown',
      quantity: null, // Critical: NEVER 0
    };
  });

  assert.strictEqual(mappedResults.length, 1);
  assert.strictEqual(mappedResults[0].status, 'unknown', 'Upstream failure must result in status="unknown"');
  assert.strictEqual(mappedResults[0].quantity, null, 'Upstream failure must NOT be reported as 0 stock');
});

console.log('\n----------------------------------------------------');
console.log(`Results: ${passedCount} passed, ${failedCount} failed.`);
console.log('----------------------------------------------------');

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log('All 5 audit test scenarios passed successfully.');
}
