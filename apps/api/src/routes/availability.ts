import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import {
  fetchExternalBloodCentres,
  fetchExternalAvailability,
  syncCentresToDatabase,
  persistAvailabilitySnapshot,
  normalizeContactPhone,
  VERIFIED_COMPONENT_IDS,
  VERIFIED_BLOOD_GROUP_IDS,
  VERIFIED_MAHARASHTRA_DISTRICTS,
  isSourceStale,
} from '../services/eraktkosh';

export const availabilityRouter = Router();

/**
 * Normalizes blood group string (e.g., 'B+', 'B_POS', 'AB+', 'AB_POS', 'AB+Ve', 'B Positive')
 */
export function normalizeBloodGroup(input?: string): { display: string; dbEnum: string; eRaktKoshCode?: number } | null {
  if (!input) return null;
  let raw = input.toUpperCase().trim();

  // If query string had unencoded '+' that Express decoded to a space ' ' (e.g., "AB " or "B ")
  if (input.endsWith(' ') && !raw.includes('+') && !raw.includes('-')) {
    raw = raw + '+';
  }

  // Strip +VE or -VE suffixes safely without corrupting words like POSITIVE
  let cleaned = raw.replace(/([+-])VE$/i, '$1').trim();

  // Handle _POS / _NEG / POSITIVE / NEGATIVE / POS / NEG
  cleaned = cleaned
    .replace(/[_\s]+POS(ITIVE)?$/i, '+')
    .replace(/[_\s]+NEG(ATIVE)?$/i, '-')
    .replace(/\s+/g, '+');

  if (cleaned === 'A+') return { display: 'A+', dbEnum: 'A_POS', eRaktKoshCode: 11 };
  if (cleaned === 'A-') return { display: 'A-', dbEnum: 'A_NEG', eRaktKoshCode: 12 };
  if (cleaned === 'B+') return { display: 'B+', dbEnum: 'B_POS', eRaktKoshCode: 13 };
  if (cleaned === 'B-') return { display: 'B-', dbEnum: 'B_NEG', eRaktKoshCode: 14 };
  if (cleaned === 'AB+') return { display: 'AB+', dbEnum: 'AB_POS', eRaktKoshCode: 15 };
  if (cleaned === 'AB-') return { display: 'AB-', dbEnum: 'AB_NEG', eRaktKoshCode: 16 };
  if (cleaned === 'O+') return { display: 'O+', dbEnum: 'O_POS', eRaktKoshCode: 17 };
  if (cleaned === 'O-') return { display: 'O-', dbEnum: 'O_NEG', eRaktKoshCode: 18 };

  return null;
}

/**
 * Normalizes component query string to database ComponentType enum
 */
export function mapComponentStringToType(input?: string): string | null {
  if (!input) return null;
  const s = input.toLowerCase().replace(/[\-_]/g, ' ');
  if (s.includes('prbc') || s.includes('packed red')) return 'PRBC';
  if (s.includes('whole blood')) return 'WHOLE_BLOOD';
  if (s.includes('fresh frozen') || s.includes('ffp') || s.includes('plasma')) return 'FRESH_FROZEN_PLASMA';
  if (s.includes('platelet')) return 'PLATELET_CONCENTRATE';
  if (s.includes('cryoprecipitate')) return 'CRYOPRECIPITATE';
  if (s.includes('buffy')) return 'BUFFY_COAT';
  return null;
}

/**
 * Determines availability ranking tier for availability-first sorting:
 * Rank 1: Centres with verified, eligible positive stock (status === 'available', not stale, reportedQuantity > 0)
 * Rank 2: Centres whose stock is unknown, stale, or cannot currently be verified
 * Rank 3: Centres with confirmed zero eligible units (status === 'zero' or reportedQuantity === 0)
 */
export function getAvailabilityRank(item: any): number {
  const isStale = item.availability?.isStale || item.availability?.status === 'stale';
  const qty = item.availability?.reportedQuantity;
  const status = item.availability?.status;

  // Rank 1: Verified positive stock
  if (!isStale && status === 'available' && qty !== null && qty !== undefined && qty > 0) {
    return 1;
  }
  // Rank 3: Confirmed zero stock
  if (!isStale && (status === 'zero' || qty === 0)) {
    return 3;
  }
  // Rank 2: Unknown, stale, or unverified
  return 2;
}

/**
 * Sorts blood availability search results availability-first:
 * 1. Positive eligible stock (highest units first)
 * 2. Unknown / stale / unverified stock
 * 3. Confirmed zero stock
 * Secondary tiebreaker: Centre name ascending, then hospitalCode
 */
export function sortAvailabilityResults<T extends { bloodCentre?: any; availability?: any }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const rankA = getAvailabilityRank(a);
    const rankB = getAvailabilityRank(b);

    if (rankA !== rankB) {
      return rankA - rankB;
    }

    // Inside Rank 1 (positive stock): highest available units first
    if (rankA === 1) {
      const qtyA = a.availability?.reportedQuantity ?? 0;
      const qtyB = b.availability?.reportedQuantity ?? 0;
      if (qtyA !== qtyB) return qtyB - qtyA;
    }

    // Secondary stable ordering: centre name ascending
    const nameA = a.bloodCentre?.hospitalName || '';
    const nameB = b.bloodCentre?.hospitalName || '';
    const nameComp = nameA.localeCompare(nameB);
    if (nameComp !== 0) return nameComp;

    const codeA = a.bloodCentre?.hospitalCode || '';
    const codeB = b.bloodCentre?.hospitalCode || '';
    return codeA.localeCompare(codeB);
  });
}

function computeAvailabilityMeta(
  items: any[],
  extra: {
    selectedSource: 'internal' | 'external' | 'all';
    participatingCount: number;
    externalCount: number;
    stateCode: number;
    districtCode: number;
    districtName: string;
    component: string;
    bloodGroup: string | null;
    isMappingVerified?: boolean;
    isLiveDirectory?: boolean;
    isLiveAvailability?: boolean;
  }
) {
  const totalCentresSearched = items.length;
  const centresWithStock = items.filter((r) => getAvailabilityRank(r) === 1).length;
  const centresWithZeroStock = items.filter((r) => getAvailabilityRank(r) === 3).length;
  const centresUnknownOrStale = items.filter((r) => getAvailabilityRank(r) === 2).length;

  let notes = '';
  if (extra.selectedSource === 'internal') {
    notes = centresWithStock > 0
      ? `${centresWithStock} of ${totalCentresSearched} RaktaSetu participating centre(s) have verified available stock for ${extra.bloodGroup || 'all groups'} ${extra.component}. (${centresWithZeroStock} confirmed zero stock)`
      : `${totalCentresSearched} RaktaSetu participating centre(s) searched in ${extra.districtName}. Currently 0 centres report available stock for ${extra.bloodGroup || ''} ${extra.component}.`;
  } else if (extra.selectedSource === 'external') {
    notes = `${totalCentresSearched} external e-RaktKosh blood bank(s) searched in ${extra.districtName} (${centresWithStock} reporting stock, ${centresWithZeroStock} reporting zero, ${centresUnknownOrStale} unverified/stale). External figures are subject to direct verification.`;
  } else {
    notes = `${centresWithStock} of ${totalCentresSearched} centre(s) have available stock (${extra.participatingCount} participating, ${extra.externalCount} external).`;
  }

  return {
    selectedSource: extra.selectedSource,
    totalCentres: totalCentresSearched,
    totalCentresSearched,
    centresWithStock,
    centresWithZeroStock,
    centresUnknownOrStale,
    participatingCentresCount: extra.participatingCount,
    externalCentresCount: extra.externalCount,
    stateCode: extra.stateCode,
    districtCode: extra.districtCode,
    districtName: extra.districtName,
    component: extra.component,
    bloodGroup: extra.bloodGroup,
    mappingVerified: extra.isMappingVerified ?? true,
    isLiveDirectory: extra.isLiveDirectory ?? true,
    isLiveAvailability: extra.isLiveAvailability ?? true,
    notes,
  };
}

/**
 * GET /api/v1/blood-availability
 * Query: stateCode, districtCode, bloodGroup, component, hospitalCode, source ('internal' | 'external' | 'all')
 */
availabilityRouter.get('/blood-availability', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stateCode = parseInt(req.query.stateCode as string, 10) || 27; // Default Maharashtra (27)
    const districtCode = req.query.districtCode ? parseInt(req.query.districtCode as string, 10) : undefined;
    const rawBloodGroup = req.query.bloodGroup ? String(req.query.bloodGroup).trim() : undefined;
    const rawComponent = req.query.component ? String(req.query.component).trim() : 'Packed Red Blood Cells';
    const hospitalCode = req.query.hospitalCode ? String(req.query.hospitalCode).trim() : undefined;
    const requestedSource = (req.query.source ? String(req.query.source).toLowerCase().trim() : 'all') as
      | 'internal'
      | 'external'
      | 'all';

    if (!districtCode || isNaN(districtCode)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'A valid districtCode is required for blood availability search',
          code: 'INVALID_DISTRICT_CODE',
        },
      });
    }

    const bloodGroupInfo = normalizeBloodGroup(rawBloodGroup);
    const componentId = VERIFIED_COMPONENT_IDS[rawComponent];
    const bloodGroupId = bloodGroupInfo?.eRaktKoshCode;

    const isMappingVerified = componentId !== undefined && bloodGroupId !== undefined;

    // 0. Query approved participating RaktaSetu institutions in this district
    const participatingOrgs = await prisma.organisation.findMany({
      where: {
        status: 'VERIFIED',
        stateCode,
        ...(districtCode ? { districtCode } : {}),
        ...(hospitalCode ? { OR: [{ hospitalCode }, { orgCode: hospitalCode }] } : {}),
      },
      select: {
        id: true,
        orgCode: true,
        name: true,
        hospitalCode: true,
        address: true,
        phone: true,
        stateCode: true,
        districtCode: true,
        districtName: true,
        updatedAt: true,
      },
      orderBy: { name: 'asc' },
    });

    const mappedComponentType = mapComponentStringToType(rawComponent);
    const dbBloodGroupEnum = bloodGroupInfo?.dbEnum as any;

    const orgIds = participatingOrgs.map((o) => o.id);
    const stockStats = orgIds.length > 0
      ? await prisma.componentUnit.groupBy({
          by: ['organisationId'],
          where: {
            organisationId: { in: orgIds },
            status: 'AVAILABLE',
            isHold: false,
            expiresAt: { gt: new Date() },
            ...(dbBloodGroupEnum ? { bloodGroup: dbBloodGroupEnum } : {}),
            ...(mappedComponentType ? { componentType: mappedComponentType as any } : {}),
          },
          _count: { id: true },
          _max: { updatedAt: true },
        })
      : [];

    const stockMap = new Map<string, { count: number; latestUpdate: Date | null }>();
    for (const stat of (stockStats as any[])) {
      stockMap.set(stat.organisationId, {
        count: stat._count?.id ?? 0,
        latestUpdate: stat._max?.updatedAt ?? null,
      });
    }

    const participatingResults = participatingOrgs.map((org) => {
      const stat = stockMap.get(org.id);
      const count = stat?.count || 0;
      const validContact = normalizeContactPhone(org.phone);
      const code = org.hospitalCode || org.orgCode;
      const sourceEntryDate = (stat?.latestUpdate || org.updatedAt || new Date()).toISOString();

      return {
        bloodCentre: {
          hospitalCode: code,
          hospitalName: org.name,
          address: org.address,
          mobileNo: validContact,
          hasValidContact: validContact !== null,
          stateCode: org.stateCode,
          districtCode: org.districtCode,
          isParticipatingCentre: true,
          orgCode: org.orgCode,
          sourceType: 'INTERNAL' as const,
          sourceLabel: 'RaktaSetu Participating Centre',
        },
        availability: {
          status: count > 0 ? ('available' as const) : ('zero' as const),
          rawStockString: `${count} Units`,
          reportedQuantity: count,
          quantityUnit: 'Units',
          sourceEntryDate,
          retrievedAt: new Date().toISOString(),
          isStale: false,
          source: 'RaktaSetu Participating Centre — Live Verified Inventory',
          sourceType: 'INTERNAL' as const,
          sourceLabel: 'RaktaSetu Participating Centre',
        },
      };
    });

    const participatingHospitalCodes = new Set(
      participatingOrgs.flatMap((o) => [o.hospitalCode, o.orgCode]).filter(Boolean) as string[]
    );

    // If only internal participating centres were requested, return directly
    if (requestedSource === 'internal') {
      const verifiedDistrictInfo = VERIFIED_MAHARASHTRA_DISTRICTS[districtCode];
      const sortedInternal = sortAvailabilityResults(participatingResults);
      return res.json({
        success: true,
        data: sortedInternal,
        meta: computeAvailabilityMeta(sortedInternal, {
          selectedSource: 'internal',
          participatingCount: participatingResults.length,
          externalCount: 0,
          stateCode,
          districtCode,
          districtName: verifiedDistrictInfo?.name || `District ${districtCode}`,
          component: rawComponent,
          bloodGroup: bloodGroupInfo?.display || rawBloodGroup || null,
        }),
      });
    }

    // 1. Fetch live centres for the district from e-RaktKosh directory
    let centres: Array<{
      hospitalCode: string;
      hospitalName: string;
      mobileNo: string | null;
      address: string | null;
      stateCode: number;
      districtCode: number;
      hasValidContact: boolean;
    }> = [];
    let isLiveDirectory = false;

    const liveDirectoryResult = await fetchExternalBloodCentres({ stateCode, districtCode });
    if (liveDirectoryResult.isLive && liveDirectoryResult.centres.length > 0) {
      centres = liveDirectoryResult.centres;
      isLiveDirectory = true;
      // Synchronize in background to maintain DB relational integrity
      syncCentresToDatabase(centres, stateCode, districtCode).catch(() => {});
    } else {
      // Fallback to local DB if e-RaktKosh directory endpoint is temporarily unavailable
      const dbCentres = await prisma.bloodCentre.findMany({
        where: {
          stateCode,
          districtCode,
          ...(hospitalCode ? { hospitalCode } : {}),
        },
        orderBy: { hospitalName: 'asc' },
        select: {
          hospitalCode: true,
          hospitalName: true,
          mobileNo: true,
          address: true,
          stateCode: true,
          districtCode: true,
        },
      });

      centres = dbCentres.map((c) => {
        const contact = normalizeContactPhone(c.mobileNo);
        return {
          hospitalCode: c.hospitalCode,
          hospitalName: c.hospitalName,
          mobileNo: contact,
          address: c.address,
          stateCode: c.stateCode,
          districtCode: c.districtCode || districtCode,
          hasValidContact: contact !== null,
        };
      });
    }

    if (hospitalCode) {
      centres = centres.filter((c) => c.hospitalCode === hospitalCode);
    }

    // Deduplicate centres by hospitalCode and exclude if already represented by participating blood bank
    const uniqueCentresMap = new Map<string, typeof centres[0]>();
    for (const c of centres) {
      if (c.hospitalCode && !participatingHospitalCodes.has(c.hospitalCode) && !uniqueCentresMap.has(c.hospitalCode)) {
        uniqueCentresMap.set(c.hospitalCode, c);
      }
    }
    centres = Array.from(uniqueCentresMap.values());

    // 2. Fetch live external availability from e-RaktKosh if parameters are mapped
    const liveResultsMap = new Map<string, any>();
    let isLiveAvailability = false;

    if (isMappingVerified) {
      try {
        const externalResults = await fetchExternalAvailability({
          stateCode,
          districtId: districtCode, // e-RaktKosh uses districtId
          componentId,
          bloodGroupId,
          hospitalCodes: hospitalCode,
        });

        if (externalResults.length > 0) {
          isLiveAvailability = true;
          for (const item of externalResults) {
            liveResultsMap.set(item.hospitalCode, item);
            // Persist snapshot to database asynchronously
            persistAvailabilitySnapshot(item).catch(() => {});
          }
        }
      } catch (err: any) {
        console.warn(`[availabilityRouter] External availability fetch warning: ${err.message}`);
      }
    }

    // 3. For any centres that didn't get live results, check existing DB snapshots
    const centreCodes = centres.map((c) => c.hospitalCode);
    const recentSnapshots = await prisma.bloodAvailabilitySnapshot.findMany({
      where: {
        hospitalCode: { in: centreCodes },
        component: { contains: rawComponent, mode: 'insensitive' },
        ...(bloodGroupInfo ? { bloodGroup: { contains: bloodGroupInfo.display, mode: 'insensitive' } } : {}),
      },
      orderBy: { retrievedAt: 'desc' },
      distinct: ['hospitalCode'],
    });

    const dbSnapshotMap = new Map(recentSnapshots.map((s) => [s.hospitalCode, s]));

    // 4. Combine directory centres with live and cached availability data
    const results = centres.map((centre) => {
      const liveData = liveResultsMap.get(centre.hospitalCode);
      const dbData = dbSnapshotMap.get(centre.hospitalCode);

      // Contact phone validation: Treat "0" or empty as null
      const validContact = normalizeContactPhone(centre.mobileNo || liveData?.hospitalContact);
      const displayAddress = liveData?.hospitalAddress || centre.address;

      if (liveData) {
        return {
          bloodCentre: {
            hospitalCode: centre.hospitalCode,
            hospitalName: centre.hospitalName,
            address: displayAddress,
            mobileNo: validContact,
            hasValidContact: validContact !== null,
            stateCode: centre.stateCode,
            districtCode: centre.districtCode,
            isParticipatingCentre: false,
            sourceType: 'EXTERNAL' as const,
            sourceLabel: 'e-RaktKosh Blood Bank',
          },
          availability: {
            status: liveData.status, // 'available' | 'no_data' | 'unknown' | 'stale'
            rawStockString: liveData.rawStockString || null,
            reportedQuantity: liveData.reportedQuantity, // null if unknown, 0 if confirmed 0
            quantityUnit: liveData.quantityUnit,
            sourceEntryDate: liveData.sourceEntryDate,
            retrievedAt: liveData.retrievedAt,
            isStale: liveData.isStale,
            source: 'e-RaktKosh Live Query',
            sourceType: 'EXTERNAL' as const,
            sourceLabel: 'e-RaktKosh Blood Bank',
          },
        };
      }

      if (dbData) {
        const isStale = dbData.isStale || isSourceStale(dbData.sourceEntryDate);
        let status: 'available' | 'zero' | 'unknown' | 'stale' = 'unknown';
        if (isStale) {
          status = 'stale';
        } else if (dbData.reportedQuantity !== null && dbData.reportedQuantity > 0) {
          status = 'available';
        } else if (dbData.reportedQuantity === 0) {
          status = 'zero';
        } else {
          status = 'unknown';
        }

        return {
          bloodCentre: {
            hospitalCode: centre.hospitalCode,
            hospitalName: centre.hospitalName,
            address: displayAddress,
            mobileNo: validContact,
            hasValidContact: validContact !== null,
            stateCode: centre.stateCode,
            districtCode: centre.districtCode,
            isParticipatingCentre: false,
            sourceType: 'EXTERNAL' as const,
            sourceLabel: 'e-RaktKosh Blood Bank',
          },
          availability: {
            status,
            rawStockString: dbData.rawStockString,
            reportedQuantity: dbData.reportedQuantity,
            quantityUnit: dbData.quantityUnit,
            sourceEntryDate: dbData.sourceEntryDate,
            retrievedAt: dbData.retrievedAt,
            isStale,
            source: 'RaktaSetu Snapshot Cache',
            sourceType: 'EXTERNAL' as const,
            sourceLabel: 'e-RaktKosh Blood Bank',
          },
        };
      }

      // No live or cached availability data returned
      return {
        bloodCentre: {
          hospitalCode: centre.hospitalCode,
          hospitalName: centre.hospitalName,
          address: displayAddress,
          mobileNo: validContact,
          hasValidContact: validContact !== null,
          stateCode: centre.stateCode,
          districtCode: centre.districtCode,
          isParticipatingCentre: false,
          sourceType: 'EXTERNAL' as const,
          sourceLabel: 'e-RaktKosh Blood Bank',
        },
        availability: {
          status: isMappingVerified ? 'unknown' : 'unknown',
          rawStockString: null,
          reportedQuantity: null, // Truthful null: NEVER shown as 0
          quantityUnit: null,
          sourceEntryDate: null,
          retrievedAt: new Date(),
          isStale: false,
          source: isMappingVerified ? 'e-RaktKosh Directory (Stock unverified online)' : 'Mapping Unverified',
          sourceType: 'EXTERNAL' as const,
          sourceLabel: 'e-RaktKosh Blood Bank',
        },
      };
    });

    const verifiedDistrictInfo = VERIFIED_MAHARASHTRA_DISTRICTS[districtCode];

    if (requestedSource === 'external') {
      const sortedExternal = sortAvailabilityResults(results);
      return res.json({
        success: true,
        data: sortedExternal,
        meta: computeAvailabilityMeta(sortedExternal, {
          selectedSource: 'external',
          participatingCount: participatingResults.length,
          externalCount: results.length,
          stateCode,
          districtCode,
          districtName: verifiedDistrictInfo?.name || `District ${districtCode}`,
          component: rawComponent,
          bloodGroup: bloodGroupInfo?.display || rawBloodGroup || null,
          isMappingVerified,
          isLiveDirectory,
          isLiveAvailability,
        }),
      });
    }

    const combinedRaw = [...participatingResults, ...results];
    const seenHospitalCodes = new Set<string>();
    const combinedResults: typeof combinedRaw = [];

    for (const item of combinedRaw) {
      const code = item.bloodCentre?.hospitalCode;
      if (!code || seenHospitalCodes.has(code)) continue;
      seenHospitalCodes.add(code);
      combinedResults.push(item);
    }

    const sortedCombined = sortAvailabilityResults(combinedResults);

    res.json({
      success: true,
      data: sortedCombined,
      meta: computeAvailabilityMeta(sortedCombined, {
        selectedSource: 'all',
        participatingCount: participatingResults.length,
        externalCount: results.length,
        stateCode,
        districtCode,
        districtName: verifiedDistrictInfo?.name || `District ${districtCode}`,
        component: rawComponent,
        bloodGroup: bloodGroupInfo?.display || rawBloodGroup || null,
        isMappingVerified,
        isLiveDirectory,
        isLiveAvailability,
      }),
    });
  } catch (error) {
    next(error);
  }
});
