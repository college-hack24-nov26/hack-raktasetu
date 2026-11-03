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
 * Normalizes blood group string (e.g., 'B+' or 'B_POS' or 'B+Ve')
 */
function normalizeBloodGroup(input?: string): { display: string; dbEnum: string; eRaktKoshCode?: number } | null {
  if (!input) return null;
  const cleaned = input.trim().toUpperCase().replace('VE', '');

  if (cleaned === 'A+' || cleaned === 'A_POS') return { display: 'A+', dbEnum: 'A_POS', eRaktKoshCode: 11 };
  if (cleaned === 'A-' || cleaned === 'A_NEG') return { display: 'A-', dbEnum: 'A_NEG', eRaktKoshCode: 12 };
  if (cleaned === 'B+' || cleaned === 'B_POS') return { display: 'B+', dbEnum: 'B_POS', eRaktKoshCode: 13 };
  if (cleaned === 'B-' || cleaned === 'B_NEG') return { display: 'B-', dbEnum: 'B_NEG', eRaktKoshCode: 14 };
  if (cleaned === 'AB+' || cleaned === 'AB_POS') return { display: 'AB+', dbEnum: 'AB_POS', eRaktKoshCode: 15 };
  if (cleaned === 'AB-' || cleaned === 'AB_NEG') return { display: 'AB-', dbEnum: 'AB_NEG', eRaktKoshCode: 16 };
  if (cleaned === 'O+' || cleaned === 'O_POS') return { display: 'O+', dbEnum: 'O_POS', eRaktKoshCode: 17 };
  if (cleaned === 'O-' || cleaned === 'O_NEG') return { display: 'O-', dbEnum: 'O_NEG', eRaktKoshCode: 18 };

  return null;
}

function mapComponentStringToType(input?: string): string | null {
  if (!input) return null;
  const s = input.toLowerCase();
  if (s.includes('prbc') || s.includes('packed red')) return 'PRBC';
  if (s.includes('whole blood')) return 'WHOLE_BLOOD';
  if (s.includes('fresh frozen') || s.includes('ffp')) return 'FRESH_FROZEN_PLASMA';
  if (s.includes('platelet')) return 'PLATELET_CONCENTRATE';
  if (s.includes('cryoprecipitate')) return 'CRYOPRECIPITATE';
  if (s.includes('buffy')) return 'BUFFY_COAT';
  return null;
}

/**
 * GET /api/v1/blood-availability
 * Query: stateCode, districtCode, bloodGroup, component, hospitalCode
 */
availabilityRouter.get('/blood-availability', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stateCode = parseInt(req.query.stateCode as string, 10) || 27; // Default Maharashtra (27)
    const districtCode = req.query.districtCode ? parseInt(req.query.districtCode as string, 10) : undefined;
    const rawBloodGroup = req.query.bloodGroup ? String(req.query.bloodGroup).trim() : undefined;
    const rawComponent = req.query.component ? String(req.query.component).trim() : 'Packed Red Blood Cells';
    const hospitalCode = req.query.hospitalCode ? String(req.query.hospitalCode).trim() : undefined;

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
      },
      orderBy: { name: 'asc' },
    });

    const mappedComponentType = mapComponentStringToType(rawComponent);
    const dbBloodGroupEnum = bloodGroupInfo?.dbEnum as any;

    const participatingResults = await Promise.all(
      participatingOrgs.map(async (org) => {
        // Authoritative stock: clinically released, non-expired, unheld component units
        const count = await prisma.componentUnit.count({
          where: {
            organisationId: org.id,
            status: 'AVAILABLE',
            isHold: false,
            expiresAt: { gt: new Date() },
            ...(dbBloodGroupEnum ? { bloodGroup: dbBloodGroupEnum } : {}),
            ...(mappedComponentType ? { componentType: mappedComponentType as any } : {}),
          },
        });

        const validContact = normalizeContactPhone(org.phone);
        const code = org.hospitalCode || org.orgCode;

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
          },
          availability: {
            status: count > 0 ? ('available' as const) : ('zero' as const),
            rawStockString: `${count} Units`,
            reportedQuantity: count,
            quantityUnit: 'Units',
            sourceEntryDate: new Date().toISOString(),
            retrievedAt: new Date().toISOString(),
            isStale: false,
            source: 'RaktaSetu Participating Centre — Live Verified Inventory',
          },
        };
      })
    );

    const participatingHospitalCodes = new Set(
      participatingOrgs.map((o) => o.hospitalCode).filter(Boolean) as string[]
    );

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
        },
      };
    });

    const combinedRaw = [...participatingResults, ...results];
    const seenHospitalCodes = new Set<string>();
    const combinedResults: typeof combinedRaw = [];

    for (const item of combinedRaw) {
      const code = item.bloodCentre?.hospitalCode;
      if (!code || seenHospitalCodes.has(code)) continue;
      seenHospitalCodes.add(code);
      combinedResults.push(item);
    }

    const verifiedDistrictInfo = VERIFIED_MAHARASHTRA_DISTRICTS[districtCode];

    res.json({
      success: true,
      data: combinedResults,
      meta: {
        totalCentres: combinedResults.length,
        participatingCentresCount: participatingResults.length,
        externalCentresCount: combinedResults.length - participatingResults.length,
        stateCode,
        districtCode,
        districtName: verifiedDistrictInfo?.name || `District ${districtCode}`,
        component: rawComponent,
        bloodGroup: bloodGroupInfo?.display || rawBloodGroup || null,
        mappingVerified: isMappingVerified,
        isLiveDirectory,
        isLiveAvailability,
        notes:
          participatingResults.length > 0
            ? `${participatingResults.length} RaktaSetu participating centre(s) with live verified inventory, alongside ${results.length} e-RaktKosh directory listings.`
            : isLiveAvailability
            ? 'Live portal availability retrieved from e-RaktKosh. Units are not reserved online; always contact centre staff before travel.'
            : isLiveDirectory
            ? 'Live blood centres retrieved from e-RaktKosh directory. Direct telephone contact available for verified centres.'
            : 'Directory retrieved from RaktaSetu cache. Direct contact available for verified centres.',
      },
    });
  } catch (error) {
    next(error);
  }
});
