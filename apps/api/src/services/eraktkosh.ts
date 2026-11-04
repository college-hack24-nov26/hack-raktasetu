import { prisma } from '../lib/prisma';

export interface ERaktKoshAvailabilityParams {
  stateCode: number;
  districtId: number;
  componentId?: number;
  bloodGroupId?: number;
  hospitalCodes?: string;
}

export interface ParsedAvailabilityResult {
  hospitalCode: string;
  hospitalName?: string;
  hospitalAddress?: string | null;
  hospitalContact?: string | null;
  component: string;
  bloodGroup?: string;
  rawStockString?: string;
  reportedQuantity: number | null;
  quantityUnit: string | null;
  sourceEntryDate: Date | null;
  retrievedAt: Date;
  isStale: boolean;
  status: 'available' | 'zero' | 'no_data' | 'unknown' | 'stale';
  rawMetadata?: any;
}

export interface ExternalBloodCentreResult {
  hospitalCode: string;
  hospitalName: string;
  mobileNo: string | null;
  address: string | null;
  stateCode: number;
  districtCode: number;
  hasValidContact: boolean;
}

// Verified ID mappings based on tested live e-RaktKosh portal requests
export const VERIFIED_COMPONENT_IDS: Record<string, number> = {
  'Packed Red Blood Cells': 12,
  'Packed Red Blood Cells (PRBC)': 12,
  'PRBC': 12,
  'Whole Blood': 11,
  'WHOLE_BLOOD': 11,
  'Fresh Frozen Plasma': 13,
  'Fresh Frozen Plasma (FFP)': 13,
  'FRESH_FROZEN_PLASMA': 13,
  'FFP': 13,
  'Platelet Concentrate': 14,
  'PLATELET_CONCENTRATE': 14,
  'Platelets': 14,
  'Cryoprecipitate': 15,
  'CRYOPRECIPITATE': 15,
};

// Verified Blood Group IDs based on tested live e-RaktKosh portal requests
export const VERIFIED_BLOOD_GROUP_IDS: Record<string, number> = {
  'A+': 11,
  'A_POS': 11,
  'A-': 12,
  'A_NEG': 12,
  'B+': 13,
  'B_POS': 13,
  'B-': 14,
  'B_NEG': 14,
  'AB+': 15,
  'AB_POS': 15,
  'AB-': 16,
  'AB_NEG': 16,
  'O+': 17,
  'O_POS': 17,
  'O-': 18,
  'O_NEG': 18,
};

// Candidate Maharashtra districts verified against live directory endpoint
export const VERIFIED_MAHARASHTRA_DISTRICTS: Record<number, { name: string; verifiedCount: number }> = {
  521: { name: 'Pune', verifiedCount: 56 },
  519: { name: 'Mumbai', verifiedCount: 57 },
  526: { name: 'Solapur', verifiedCount: 24 },
  516: { name: 'Nashik', verifiedCount: 20 },
  531: { name: 'Sangli', verifiedCount: 19 },
  505: { name: 'Nagpur', verifiedCount: 18 },
  522: { name: 'Ahmednagar / Ahilyanagar', verifiedCount: 17 },
  530: { name: 'Kolhapur', verifiedCount: 15 },
  527: { name: 'Satara', verifiedCount: 15 },
  515: { name: 'Chhatrapati Sambhajinagar', verifiedCount: 14 },
  503: { name: 'Amravati', verifiedCount: 10 },
  524: { name: 'Latur', verifiedCount: 10 },
  501: { name: 'Akola', verifiedCount: 6 },
};

const ERAKTKOSH_DIRECTORY_URL = 'https://eraktkosh.mohfw.gov.in/eraktkoshPortal/eraktkosh/bloodbanks';
const ERAKTKOSH_AVAILABILITY_URL = 'https://eraktkosh.mohfw.gov.in/eraktkoshPortal/eraktkosh/blood-availability';
const FETCH_TIMEOUT_MS = 8000;
const FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Safely parse availability string such as "B+Ve : 129", "B+Ve : 0", or "46"
 */
export function parseStockQuantity(raw: string | null | undefined): number | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'null') return null;

  // Check colon pattern: "B+Ve : 3" or "B+Ve : 0"
  const colonMatch = trimmed.match(/:\s*(\d+)/);
  if (colonMatch && colonMatch[1] !== undefined) {
    const num = parseInt(colonMatch[1], 10);
    return isNaN(num) ? null : num;
  }

  // Standalone number or word boundary: "25" or "Available : 25"
  const numberMatch = trimmed.match(/\b(\d+)\b/);
  if (numberMatch && numberMatch[1] !== undefined) {
    const num = parseInt(numberMatch[1], 10);
    return isNaN(num) ? null : num;
  }

  return null;
}

/**
 * Parses date string in format "YYYY-MM-DD HH:mm:ss" or ISO
 */
export function parseSourceDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  try {
    const parsed = new Date(dateStr.replace(' ', 'T'));
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

/**
 * Check if a source entry timestamp is considered stale (> 24 hours old)
 */
export function isSourceStale(sourceDate: Date | null): boolean {
  if (!sourceDate) return true;
  const ageMs = Date.now() - sourceDate.getTime();
  return ageMs > FRESHNESS_WINDOW_MS;
}

/**
 * Validates and normalizes contact telephone string.
 * Strips '0' or unformatted stubs.
 */
export function normalizeContactPhone(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== 'string') return null;
  const cleaned = phone.trim();
  if (cleaned === '' || cleaned === '0' || cleaned === '-' || cleaned.length < 6) {
    return null;
  }
  return cleaned;
}

/**
 * Fetches live blood centres for a state and district from e-RaktKosh directory endpoint:
 * GET https://eraktkosh.mohfw.gov.in/eraktkoshPortal/eraktkosh/bloodbanks?stateCode=27&districtCode={districtCode}
 */
export async function fetchExternalBloodCentres(params: {
  stateCode: number;
  districtCode: number;
}): Promise<{ centres: ExternalBloodCentreResult[]; isLive: boolean; error?: string }> {
  const url = new URL(ERAKTKOSH_DIRECTORY_URL);
  url.searchParams.set('stateCode', String(params.stateCode));
  url.searchParams.set('districtCode', String(params.districtCode));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) RaktaSetu/1.0',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[eRaktKosh Directory] Upstream returned status ${response.status}`);
      return { centres: [], isLive: false, error: `Upstream HTTP ${response.status}` };
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      console.warn('[eRaktKosh Directory] Upstream returned non-array response');
      return { centres: [], isLive: false, error: 'Malformed response from directory' };
    }

    const centresMap = new Map<string, ExternalBloodCentreResult>();

    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      const rawCode = item.hospitalCode ?? item.hospitalcode;
      if (rawCode === undefined || rawCode === null) continue;

      const hospitalCode = String(rawCode).trim();
      if (!hospitalCode) continue;

      const hospitalName = String(item.hospitalName || item.hospitalname || '').trim() || `Blood Centre #${hospitalCode}`;
      const mobileNo = normalizeContactPhone(item.mobileNo || item.mobileno);

      const existing = centresMap.get(hospitalCode);
      if (existing) {
        // Merge enriched attributes if this record has better contact info or longer name
        if (!existing.hasValidContact && mobileNo !== null) {
          existing.mobileNo = mobileNo;
          existing.hasValidContact = true;
        }
        if (hospitalName.length > existing.hospitalName.length) {
          existing.hospitalName = hospitalName;
        }
      } else {
        centresMap.set(hospitalCode, {
          hospitalCode,
          hospitalName,
          mobileNo,
          address: null, // Directory does not include full address; availability will enrich it
          stateCode: params.stateCode,
          districtCode: params.districtCode,
          hasValidContact: mobileNo !== null,
        });
      }
    }

    const centres = Array.from(centresMap.values());
    return { centres, isLive: true };
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn(`[eRaktKosh Directory] Fetch failed/timed out: ${err.message}`);
    return { centres: [], isLive: false, error: err.message };
  }
}

/**
 * Fetch availability from e-RaktKosh portal with timeout and accurate stock status parsing
 */
export async function fetchExternalAvailability(
  params: ERaktKoshAvailabilityParams
): Promise<ParsedAvailabilityResult[]> {
  const url = new URL(ERAKTKOSH_AVAILABILITY_URL);
  url.searchParams.set('stateCode', String(params.stateCode));
  url.searchParams.set('districtId', String(params.districtId));

  if (params.componentId) {
    url.searchParams.set('componentId', String(params.componentId));
  }
  if (params.bloodGroupId) {
    url.searchParams.set('bloodGroupId', String(params.bloodGroupId));
  }
  if (params.hospitalCodes) {
    url.searchParams.set('hospitalCodes', String(params.hospitalCodes));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) RaktaSetu/1.0',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[eRaktKosh Availability] Upstream returned status ${response.status}`);
      return [];
    }

    const json = await response.json();
    const items = Array.isArray(json) ? json : [json];

    const results: ParsedAvailabilityResult[] = [];
    for (const item of items) {
      const parsed = normalizeAvailabilityItem(item);
      if (parsed) {
        results.push(parsed);
      }
    }

    return results;
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.warn(`[eRaktKosh Availability] External fetch skipped or timed out: ${err.message}`);
    return [];
  }
}

/**
 * Normalizes a single raw availability object returned by e-RaktKosh.
 * Accurately parses nested component quantities, distinguishes explicit zero from missing/unreported data,
 * and detects stale records (> 24 hours old).
 */
export function normalizeAvailabilityItem(
  item: any,
  fallbackComponentName = 'Packed Red Blood Cells'
): ParsedAvailabilityResult | null {
  if (!item || typeof item !== 'object') return null;

  const rawHospitalCode = item.hospitalCode || item.hospitalcode;
  if (rawHospitalCode === undefined || rawHospitalCode === null) return null;

  const hospitalCode = String(rawHospitalCode).trim();
  if (!hospitalCode) return null;

  const sourceDate = parseSourceDate(item.entrydate || item.entryDate);
  const stale = isSourceStale(sourceDate);

  // Inspect nested component availability
  // Live format:
  // components["Packed Red Blood Cells"].available_WithQty -> e.g. "B+Ve : 3"
  // components["Packed Red Blood Cells"].not_available_WithQty -> e.g. "B+Ve : 0"
  let rawStockString: string | undefined = undefined;
  let confirmedZero = false;
  let componentName = fallbackComponentName;

  if (item.components && typeof item.components === 'object') {
    const compKeys = Object.keys(item.components);
    for (const k of compKeys) {
      const compData = item.components[k];
      if (compData && typeof compData === 'object') {
        const availWithQty = compData.available_WithQty;
        const notAvailWithQty = compData.not_available_WithQty;

        if (availWithQty && typeof availWithQty === 'string' && availWithQty.trim() !== '') {
          rawStockString = availWithQty.trim();
          componentName = k;
          break;
        } else if (notAvailWithQty && typeof notAvailWithQty === 'string' && notAvailWithQty.trim() !== '') {
          rawStockString = notAvailWithQty.trim();
          componentName = k;
          confirmedZero = true;
          break;
        }
      }
    }
  }

  // Fallback to top-level if not resolved in components dictionary
  if (!rawStockString) {
    if (item.available_WithQty && typeof item.available_WithQty === 'string' && item.available_WithQty.trim() !== '') {
      rawStockString = item.available_WithQty.trim();
    } else if (item.not_available_WithQty && typeof item.not_available_WithQty === 'string' && item.not_available_WithQty.trim() !== '') {
      rawStockString = item.not_available_WithQty.trim();
      confirmedZero = true;
    }
  }

  let reportedQty = parseStockQuantity(rawStockString);
  if (confirmedZero && reportedQty === null) {
    reportedQty = 0;
  }

  // Determine honest status:
  // - stale: reported entry date is > 24 hours old
  // - available: reported quantity > 0 and fresh (<= 24h)
  // - zero: confirmed explicit zero units available (e.g. "B+Ve : 0") and fresh (<= 24h)
  // - unknown: no stock statement returned, malformed, or missing
  let status: 'available' | 'zero' | 'no_data' | 'unknown' | 'stale' = 'unknown';
  if (stale) {
    status = 'stale';
  } else if (reportedQty !== null && reportedQty > 0) {
    status = 'available';
  } else if (reportedQty === 0 || confirmedZero) {
    status = 'zero';
  } else {
    status = 'unknown';
  }

  const hospitalAddress = item.hospitaladd ? String(item.hospitaladd).trim() : null;
  const hospitalContact = item.hospitalcontact ? String(item.hospitalcontact).trim() : null;

  return {
    hospitalCode,
    hospitalName: item.hospitalname || item.hospitalName,
    hospitalAddress,
    hospitalContact,
    component: componentName,
    bloodGroup: item.bldgrpcode1 || undefined,
    rawStockString: rawStockString || undefined,
    reportedQuantity: reportedQty,
    quantityUnit: null, // As specified in guide: never guess unit
    sourceEntryDate: sourceDate,
    retrievedAt: new Date(),
    isStale: stale,
    status,
    rawMetadata: item,
  };
}

/**
 * Synchronizes external blood centres to the database to ensure foreign key integrity
 * for requests, donor profiles, and availability snapshots.
 */
export async function syncCentresToDatabase(
  centres: ExternalBloodCentreResult[],
  stateCode: number,
  districtCode: number
) {
  if (!centres || centres.length === 0) return;

  // Deduplicate by hospitalCode to prevent concurrent database upsert conflicts
  const uniqueCentresMap = new Map<string, ExternalBloodCentreResult>();
  for (const c of centres) {
    if (c.hospitalCode && !uniqueCentresMap.has(c.hospitalCode)) {
      uniqueCentresMap.set(c.hospitalCode, c);
    }
  }

  const now = new Date();
  const operations = Array.from(uniqueCentresMap.values()).map((c) =>
    prisma.bloodCentre.upsert({
      where: { hospitalCode: c.hospitalCode },
      update: {
        hospitalName: c.hospitalName,
        ...(c.mobileNo ? { mobileNo: c.mobileNo } : {}),
        stateCode,
        districtCode,
        lastFetchedAt: now,
      },
      create: {
        hospitalCode: c.hospitalCode,
        hospitalName: c.hospitalName,
        mobileNo: c.mobileNo,
        address: c.address,
        stateCode,
        districtCode,
        lastFetchedAt: now,
      },
    }).catch((err) => {
      console.warn(`[eRaktKosh Sync] Failed to upsert centre ${c.hospitalCode}: ${err.message}`);
    })
  );

  await Promise.allSettled(operations);
}

/**
 * Persists an availability snapshot to the database with non-blocking error handling
 */
export async function persistAvailabilitySnapshot(snapshot: ParsedAvailabilityResult) {
  try {
    // Only persist if the blood centre exists in our directory
    const centreExists = await prisma.bloodCentre.findUnique({
      where: { hospitalCode: snapshot.hospitalCode },
      select: { hospitalCode: true, address: true },
    });

    if (!centreExists) return null;

    // Update centre address if snapshot has it and centre didn't
    if (snapshot.hospitalAddress && !centreExists.address) {
      prisma.bloodCentre.update({
        where: { hospitalCode: snapshot.hospitalCode },
        data: { address: snapshot.hospitalAddress },
      }).catch(() => {});
    }

    return await prisma.bloodAvailabilitySnapshot.create({
      data: {
        hospitalCode: snapshot.hospitalCode,
        component: snapshot.component,
        bloodGroup: snapshot.bloodGroup,
        rawStockString: snapshot.rawStockString,
        reportedQuantity: snapshot.reportedQuantity,
        quantityUnit: snapshot.quantityUnit,
        sourceEntryDate: snapshot.sourceEntryDate,
        retrievedAt: snapshot.retrievedAt,
        isStale: snapshot.isStale,
        rawMetadata: snapshot.rawMetadata ? JSON.parse(JSON.stringify(snapshot.rawMetadata)) : undefined,
      },
    });
  } catch (err: any) {
    console.error(`[eRaktKosh] Failed to persist snapshot: ${err.message}`);
    return null;
  }
}
