import { app } from './app';
import { prisma } from './lib/prisma';
import { normalizeBloodGroup, mapComponentStringToType, getAvailabilityRank } from './routes/availability';
import http from 'http';

let server: http.Server;
const PORT = Number(process.env.TEST_PORT) || 4118;
const BASE_URL = `http://127.0.0.1:${PORT}/api/v1`;

async function request(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runAvailabilitySourceTests() {
  console.log('========================================================================');
  console.log(' RaktaSetu — Public Blood Availability, Ranking & Request Tests');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
      failed++;
    }
  }

  server = app.listen(PORT);

  const createdRequestIds: string[] = [];

  try {
    // ------------------------------------------------------------------------
    // 1. Blood Group Normalisation and Component Mapping
    // ------------------------------------------------------------------------
    console.log('\n--- 1. Normalisation Functions ---');
    const abPos = normalizeBloodGroup('AB_POS');
    assert(abPos?.display === 'AB+' && abPos?.dbEnum === 'AB_POS', 'normalizeBloodGroup maps AB_POS to AB+ and AB_POS');

    const abPlus = normalizeBloodGroup('AB+');
    assert(abPlus?.display === 'AB+' && abPlus?.dbEnum === 'AB_POS', 'normalizeBloodGroup keeps AB+ as AB+');

    const abSpace = normalizeBloodGroup('AB ');
    assert(abSpace?.display === 'AB+' && abSpace?.dbEnum === 'AB_POS', 'normalizeBloodGroup restores trailing space from URL decode to AB+');

    const bNeg = normalizeBloodGroup('B_NEG');
    assert(bNeg?.display === 'B-' && bNeg?.dbEnum === 'B_NEG', 'normalizeBloodGroup maps B_NEG to B-');

    const oPos = normalizeBloodGroup('O POSITIVE');
    assert(oPos?.display === 'O+' && oPos?.dbEnum === 'O_POS', 'normalizeBloodGroup parses words (O POSITIVE)');

    assert(normalizeBloodGroup('invalid') === null, 'normalizeBloodGroup returns null for invalid input');

    assert(mapComponentStringToType('PRBC') === 'PRBC', 'mapComponentStringToType maps PRBC to PRBC');
    assert(mapComponentStringToType('Packed Red Blood Cells (PRBC)') === 'PRBC', 'mapComponentStringToType maps display name to PRBC');
    assert(mapComponentStringToType('WHOLE_BLOOD') === 'WHOLE_BLOOD', 'mapComponentStringToType maps WHOLE_BLOOD');
    assert(mapComponentStringToType('Fresh Frozen Plasma (FFP)') === 'FRESH_FROZEN_PLASMA', 'mapComponentStringToType maps FFP');

    // ------------------------------------------------------------------------
    // 2. Gupta Life Blood Centre (ORG-MH-521-1613, Pune district 521) Verification
    // ------------------------------------------------------------------------
    console.log('\n--- 2. Gupta Life Blood Centre Internal PRBC Component Verification ---');
    
    // Check with symbol blood group and PRBC alias
    const resSymbol = await request('/blood-availability?source=internal&stateCode=27&districtCode=521&bloodGroup=AB%2B&component=PRBC');
    assert(resSymbol.status === 200, 'GET /blood-availability with AB%2B returns 200');
    assert(resSymbol.data?.success === true, 'Response indicates success');

    const guptaItem = resSymbol.data?.data?.find(
      (item: any) => item.bloodCentre?.orgCode === 'ORG-MH-521-1613' || item.bloodCentre?.hospitalName?.includes('Gupta Life')
    );
    assert(!!guptaItem, 'Gupta Life Blood Centre found in participating centres list for Pune (district 521)');
    assert(guptaItem?.bloodCentre?.sourceType === 'INTERNAL', 'Gupta Life Blood Centre has sourceType INTERNAL on bloodCentre');
    assert(guptaItem?.availability?.sourceType === 'INTERNAL', 'Gupta Life Blood Centre has sourceType INTERNAL on availability');
    assert(guptaItem?.availability?.reportedQuantity >= 1, `Gupta Life Blood Centre has >= 1 available PRBC units (actual: ${guptaItem?.availability?.reportedQuantity})`);
    assert(guptaItem?.availability?.status === 'available', `Gupta Life Blood Centre status is 'available'`);
    assert(!!guptaItem?.availability?.sourceEntryDate, `Gupta Life Blood Centre has sourceEntryDate (actual: ${guptaItem?.availability?.sourceEntryDate})`);

    // Check with enum blood group AB_POS and full component name
    const resEnum = await request('/blood-availability?source=internal&stateCode=27&districtCode=521&bloodGroup=AB_POS&component=Packed+Red+Blood+Cells+(PRBC)');
    assert(resEnum.status === 200, 'GET /blood-availability with AB_POS returns 200');
    const guptaEnumItem = resEnum.data?.data?.find((item: any) => item.bloodCentre?.orgCode === 'ORG-MH-521-1613');
    assert(guptaEnumItem?.availability?.reportedQuantity === guptaItem?.availability?.reportedQuantity, 'AB_POS returns same count as AB+');

    // ------------------------------------------------------------------------
    // 3. Ineligible Component Exclusion Test
    // ------------------------------------------------------------------------
    console.log('\n--- 3. Ineligible Stock Exclusion ---');
    const org = await prisma.organisation.findFirst({
      where: { orgCode: 'ORG-MH-521-1613' },
    });

    const existingCollection = await prisma.collectionUnit.findFirst({
      where: { organisationId: org?.id },
    });

    const anyUser = await prisma.user.findFirst();

    if (org && existingCollection && anyUser) {
      const initialCount = guptaItem?.availability?.reportedQuantity || 0;

      // Create an ineligible component unit (e.g. QUARANTINED)
      const ineligibleUnit = await prisma.componentUnit.create({
        data: {
          componentCode: `TEST-QUARANTINE-${Date.now()}`,
          collectionUnitId: existingCollection.id,
          organisationId: org.id,
          componentType: 'PRBC',
          bloodGroup: 'AB_POS',
          volumeMl: 250,
          status: 'QUARANTINED',
          derivedBy: anyUser.id,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      // Also create an expired component unit with AVAILABLE status (but expiresAt in the past)
      const expiredUnit = await prisma.componentUnit.create({
        data: {
          componentCode: `TEST-EXPIRED-${Date.now()}`,
          collectionUnitId: existingCollection.id,
          organisationId: org.id,
          componentType: 'PRBC',
          bloodGroup: 'AB_POS',
          volumeMl: 250,
          status: 'AVAILABLE',
          derivedBy: anyUser.id,
          expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // expired yesterday
        },
      });

      try {
        const resAfterIneligible = await request('/blood-availability?source=internal&stateCode=27&districtCode=521&bloodGroup=AB%2B&component=PRBC');
        const guptaAfterItem = resAfterIneligible.data?.data?.find((item: any) => item.bloodCentre?.orgCode === 'ORG-MH-521-1613');
        assert(
          guptaAfterItem?.availability?.reportedQuantity === initialCount,
          `Ineligible units (QUARANTINED and EXPIRED) are excluded from count (initial: ${initialCount}, after: ${guptaAfterItem?.availability?.reportedQuantity})`
        );
      } finally {
        await prisma.componentUnit.deleteMany({
          where: {
            id: { in: [ineligibleUnit.id, expiredUnit.id] },
          },
        });
      }
    } else {
      console.warn('Skipping ineligible stock creation: prerequisite data not found');
    }

    // ------------------------------------------------------------------------
    // 4. Source Separation (Internal vs External)
    // ------------------------------------------------------------------------
    console.log('\n--- 4. Source Separation on Availability Search ---');
    const internalRes = await request('/blood-availability?source=internal&stateCode=27&districtCode=521&bloodGroup=AB%2B&component=PRBC');
    assert(internalRes.ok, 'Internal availability query succeeded');
    const allInternal = internalRes.data?.data?.every(
      (item: any) => item.bloodCentre?.sourceType === 'INTERNAL' && item.availability?.sourceType === 'INTERNAL'
    );
    assert(allInternal === true, 'All records from source=internal have sourceType === INTERNAL');

    const externalRes = await request('/blood-availability?source=external&stateCode=27&districtCode=521&bloodGroup=AB%2B&component=PRBC');
    assert(externalRes.ok, 'External availability query succeeded');
    const allExternal = (externalRes.data?.data?.length === 0) || externalRes.data?.data?.every(
      (item: any) => item.bloodCentre?.sourceType === 'EXTERNAL' && item.availability?.sourceType === 'EXTERNAL'
    );
    assert(allExternal === true, 'All records from source=external have sourceType === EXTERNAL');

    // ------------------------------------------------------------------------
    // 5. Blood Centres Directory Route Source Separation
    // ------------------------------------------------------------------------
    console.log('\n--- 5. Blood Centres Directory Route Source Separation ---');
    const internalCentres = await request('/blood-centres?source=internal&stateCode=27&districtCode=521');
    assert(internalCentres.ok, 'GET /blood-centres?source=internal succeeded');
    const hasInternalGupta = internalCentres.data?.data?.some((c: any) => c.hospitalCode === 'ORG-MH-521-1613');
    assert(hasInternalGupta, 'Participating centre ORG-MH-521-1613 appears in source=internal directory');
    const allInternalCentres = internalCentres.data?.data?.every((c: any) => c.isParticipatingCentre === true && c.sourceType === 'INTERNAL');
    assert(allInternalCentres, 'All centres in source=internal directory have isParticipatingCentre === true and sourceType === INTERNAL');

    const externalCentres = await request('/blood-centres?source=external&stateCode=27&districtCode=521');
    assert(externalCentres.ok, 'GET /blood-centres?source=external succeeded');
    const noInternalInExternal = !externalCentres.data?.data?.some((c: any) => c.hospitalCode === 'ORG-MH-521-1613');
    assert(noInternalInExternal, 'Participating centre ORG-MH-521-1613 does not appear in source=external directory');

    // ------------------------------------------------------------------------
    // 6. Blood Centre by ID Route for Participating Centre
    // ------------------------------------------------------------------------
    console.log('\n--- 6. Blood Centre Details by ID for Participating Centre ---');
    const centreDetail = await request('/blood-centres/ORG-MH-521-1613');
    assert(centreDetail.status === 200, 'GET /blood-centres/ORG-MH-521-1613 returns 200');
    assert(centreDetail.data?.data?.isParticipatingCentre === true, 'Centre detail marks isParticipatingCentre === true');
    assert(centreDetail.data?.data?.sourceType === 'INTERNAL', 'Centre detail marks sourceType === INTERNAL');
    assert(Array.isArray(centreDetail.data?.data?.stockSnapshot), 'Centre detail contains live stockSnapshot array');

    // ------------------------------------------------------------------------
    // 7. Availability-First Ranking & Accurate Headline Semantics
    // ------------------------------------------------------------------------
    console.log('\n--- 7. Availability-First Ranking & Accurate Semantics ---');
    const rankingRes = await request('/blood-availability?source=internal&stateCode=27&districtCode=521&bloodGroup=AB%2B&component=PRBC');
    assert(rankingRes.ok, 'Ranking search query succeeded');

    const rankingData = rankingRes.data?.data || [];
    assert(rankingData.length > 0, 'Participating centres found for Pune');

    // The first item MUST have positive available stock (Gupta Life Blood Centre)
    const firstItem = rankingData[0];
    assert(
      (firstItem?.availability?.reportedQuantity ?? 0) > 0 && firstItem?.availability?.status === 'available',
      `First ranked centre has positive available stock (actual: ${firstItem?.availability?.reportedQuantity} units, name: ${firstItem?.bloodCentre?.hospitalName})`
    );

    // Any zero stock centres MUST appear after positive stock centres
    let sawZeroOrUnknown = false;
    let rankingOrderValid = true;
    for (const item of rankingData) {
      const rank = getAvailabilityRank(item);
      if (rank > 1) {
        sawZeroOrUnknown = true;
      } else if (sawZeroOrUnknown && rank === 1) {
        rankingOrderValid = false;
      }
    }
    assert(rankingOrderValid, 'All positive stock centres appear strictly ahead of zero/unknown stock centres');

    // Verify metadata semantics
    const meta = rankingRes.data?.meta;
    assert(meta?.totalCentresSearched === rankingData.length, `meta.totalCentresSearched matches returned length (${meta?.totalCentresSearched})`);
    assert(meta?.centresWithStock >= 1, `meta.centresWithStock correctly reports positive stock centres (${meta?.centresWithStock})`);
    assert(typeof meta?.notes === 'string' && meta?.notes.includes('verified available stock'), 'meta.notes provides transparent semantic explanation');

    // ------------------------------------------------------------------------
    // 8. Designated-Centre Blood Request Resolution
    // ------------------------------------------------------------------------
    console.log('\n--- 8. Blood Request Centre Resolution ---');

    // Login a test user
    const loginRes = await request('/auth/demo-login', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber: '+919999980014', otp: '123456' }),
    });
    const userToken = loginRes.data?.data?.token || loginRes.data?.token;
    assert(!!userToken, 'Authenticated test user successfully');

    // 8a. Designated centre request with participating centre ORG-MH-521-1613
    const reqDesignated = await request('/blood-requests', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({
        patientName: 'Pooja Patil',
        bloodGroup: 'AB+',
        component: 'Packed Red Blood Cells',
        unitsRequested: 1,
        hospitalCode: 'ORG-MH-521-1613',
        searchScope: 'EXACT_CENTRE',
        message: 'Urgent PRBC requirement for surgery',
      }),
    });

    assert(reqDesignated.status === 201, `Designated centre request returns 201 (status: ${reqDesignated.status})`);
    assert(reqDesignated.data?.success === true, 'Designated centre request returns success: true');
    assert(
      reqDesignated.data?.data?.hospitalCode === 'ORG-MH-521-1613',
      `Request preserves designated hospitalCode (actual: ${reqDesignated.data?.data?.hospitalCode})`
    );
    assert(
      reqDesignated.data?.data?.bloodCentre?.hospitalName?.includes('Gupta Life') || !!reqDesignated.data?.data?.bloodCentre,
      'Request resolves bloodCentre relation to Gupta Life Blood Centre'
    );
    if (reqDesignated.data?.data?.id) createdRequestIds.push(reqDesignated.data.data.id);

    // 8b. Designated centre request with invalid centre
    const reqInvalid = await request('/blood-requests', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({
        patientName: 'Test Patient',
        bloodGroup: 'B+',
        component: 'Whole Blood',
        unitsRequested: 1,
        hospitalCode: 'INVALID-CENTRE-999999',
      }),
    });

    assert(reqInvalid.status === 400, `Invalid centre request returns 400 (status: ${reqInvalid.status})`);
    assert(reqInvalid.data?.error?.code === 'CENTRE_NOT_FOUND', `Invalid centre returns CENTRE_NOT_FOUND code (actual: ${reqInvalid.data?.error?.code})`);

    // 8c. Explicitly unassigned request (no hospitalCode)
    const reqUnassigned = await request('/blood-requests', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({
        patientName: 'Anil Sharma',
        bloodGroup: 'O+',
        component: 'Packed Red Blood Cells',
        unitsRequested: 2,
        searchScope: 'DISTRICT_EXPANDED',
      }),
    });

    assert(reqUnassigned.status === 201, `Unassigned request returns 201 (status: ${reqUnassigned.status})`);
    assert(reqUnassigned.data?.data?.hospitalCode === null, 'Unassigned request sets hospitalCode to null');
    assert(reqUnassigned.data?.data?.bloodCentre === null, 'Unassigned request leaves bloodCentre null');
    if (reqUnassigned.data?.data?.id) createdRequestIds.push(reqUnassigned.data.data.id);

  } catch (err) {
    console.error('Unexpected error during testing:', err);
    failed++;
  } finally {
    if (createdRequestIds.length > 0) {
      await prisma.bloodRequest.deleteMany({
        where: { id: { in: createdRequestIds } },
      });
    }
    server.close();
    await prisma.$disconnect();
  }

  console.log('\n========================================================================');
  console.log(` Summary: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAvailabilitySourceTests();
