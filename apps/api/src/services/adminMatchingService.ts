import { prisma } from '../lib/prisma';
import { DirectionsService } from './directionsService';
import { RouteDirectionsDTO } from '@raktasetu/shared';
import { BloodGroup } from '@prisma/client';
import { RealtimeService } from './realtime';
import { parseRequestMessageMetadata, RequestHospitalMetadata } from './hospitalIntegration';
import {
  MatchingRequestMetadata,
  RankedDonorCandidateDTO,
  DonorMatchLevel,
  DonorProximityTier,
  DonorMatchingStatus,
} from '@raktasetu/shared';

// Maharashtra District Centroids dictionary for reliable deterministic distance fallback
export const DISTRICT_CENTROIDS: Record<number, { lat: number; lng: number; name: string }> = {
  521: { lat: 18.5204, lng: 73.8567, name: 'Pune' },
  478: { lat: 19.076, lng: 72.8777, name: 'Mumbai City' },
  479: { lat: 19.1136, lng: 72.8697, name: 'Mumbai Suburban' },
  517: { lat: 19.2183, lng: 72.9781, name: 'Thane' },
  505: { lat: 19.9975, lng: 73.7898, name: 'Nashik' },
  502: { lat: 21.1458, lng: 79.0882, name: 'Nagpur' },
  487: { lat: 19.8762, lng: 75.3433, name: 'Chhatrapati Sambhajinagar' },
  519: { lat: 16.705, lng: 74.2433, name: 'Kolhapur' },
  520: { lat: 17.6805, lng: 74.0183, name: 'Satara' },
  522: { lat: 17.6599, lng: 75.9064, name: 'Solapur' },
  488: { lat: 18.9894, lng: 75.7601, name: 'Beed' },
  489: { lat: 20.5342, lng: 76.1788, name: 'Buldhana' },
  490: { lat: 20.932, lng: 77.7523, name: 'Amravati' },
  491: { lat: 20.7002, lng: 77.0082, name: 'Akola' },
  492: { lat: 20.4639, lng: 78.4347, name: 'Wardha' },
  493: { lat: 20.9042, lng: 74.7749, name: 'Dhule' },
  494: { lat: 21.3697, lng: 74.2409, name: 'Nandurbar' },
  495: { lat: 20.998, lng: 75.5667, name: 'Jalgaon' },
  496: { lat: 19.8347, lng: 75.8816, name: 'Jalna' },
  497: { lat: 19.1383, lng: 77.321, name: 'Nanded' },
  498: { lat: 18.4088, lng: 76.5604, name: 'Latur' },
  499: { lat: 18.1856, lng: 76.0419, name: 'Dharashiv' },
  500: { lat: 19.2618, lng: 76.7767, name: 'Parbhani' },
  501: { lat: 19.7214, lng: 77.1485, name: 'Hingoli' },
  503: { lat: 21.4549, lng: 79.6467, name: 'Bhandara' },
  504: { lat: 21.4552, lng: 80.1961, name: 'Gondia' },
  506: { lat: 19.9615, lng: 79.2961, name: 'Chandrapur' },
  507: { lat: 20.1809, lng: 80.0006, name: 'Gadchiroli' },
  508: { lat: 20.3888, lng: 78.1204, name: 'Yavatmal' },
  509: { lat: 20.1065, lng: 77.1354, name: 'Washim' },
  510: { lat: 19.0948, lng: 74.748, name: 'Ahmednagar' },
  511: { lat: 18.7537, lng: 73.4058, name: 'Raigad' },
  512: { lat: 16.9902, lng: 73.312, name: 'Ratnagiri' },
  513: { lat: 16.0354, lng: 73.8173, name: 'Sindhudurg' },
  514: { lat: 16.8524, lng: 74.5815, name: 'Sangli' },
  518: { lat: 19.6936, lng: 72.7655, name: 'Palghar' },
};

/**
 * Great-circle distance calculation using the Haversine formula
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Anonymize donor display name to protect privacy in discovery results
 */
export function sanitizeDonorName(fullName?: string | null): string {
  if (!fullName || typeof fullName !== 'string') return 'Voluntary Donor';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase();
  return `${first} ${lastInitial}.`;
}

/**
 * Authoritative Component-Specific Transfusion Compatibility Matrix
 * Follows national transfusion standards (e-RaktKosh / NACO / CDSCO / AABB):
 * 1. Red Blood Cells (PRBC / Whole Blood): Universal donor is O-, universal recipient is AB+.
 * 2. Fresh Frozen Plasma (FFP / Plasma): Universal donor is AB (plasma has no anti-A or anti-B).
 *    Recipient AB can ONLY receive AB plasma! (O, A, B plasma contain antibodies that hemolyze AB RBCs).
 * 3. Platelet Concentrate: Suspended in plasma; ABO-identical preferred; O platelets strictly excluded for AB.
 * 4. Cryoprecipitate: Follows plasma compatibility.
 */
export type ComponentCategory = 'RED_CELLS' | 'PLASMA' | 'PLATELETS' | 'CRYOPRECIPITATE';

export function resolveComponentCategory(component?: string): ComponentCategory {
  if (!component || typeof component !== 'string' || !component.trim()) {
    return 'RED_CELLS';
  }
  const s = component.toUpperCase().trim();
  if (s.includes('PLASMA') || s.includes('FFP')) return 'PLASMA';
  if (s.includes('PLATELET')) return 'PLATELETS';
  if (s.includes('CRYO')) return 'CRYOPRECIPITATE';
  return 'RED_CELLS';
}

export function getComponentCompatibility(patientBloodGroup: BloodGroup, component?: string): {
  compatibleGroups: BloodGroup[];
  category: ComponentCategory;
  reason: string;
} {
  if (!patientBloodGroup) {
    throw new Error('Patient blood group is required for compatibility determination.');
  }

  const category = resolveComponentCategory(component);

  if (category === 'PLASMA' || category === 'CRYOPRECIPITATE') {
    switch (patientBloodGroup) {
      case 'AB_POS':
      case 'AB_NEG':
        return {
          compatibleGroups: ['AB_POS', 'AB_NEG'],
          category,
          reason: 'Plasma recipient AB has A and B antigens; donor plasma must contain no anti-A or anti-B antibodies (AB donor only).',
        };
      case 'A_POS':
      case 'A_NEG':
        return {
          compatibleGroups: ['A_POS', 'A_NEG', 'AB_POS', 'AB_NEG'],
          category,
          reason: 'Plasma recipient A requires donor plasma free of anti-A antibodies (A or AB donor).',
        };
      case 'B_POS':
      case 'B_NEG':
        return {
          compatibleGroups: ['B_POS', 'B_NEG', 'AB_POS', 'AB_NEG'],
          category,
          reason: 'Plasma recipient B requires donor plasma free of anti-B antibodies (B or AB donor).',
        };
      case 'O_POS':
      case 'O_NEG':
        return {
          compatibleGroups: ['O_POS', 'O_NEG', 'A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG'],
          category,
          reason: 'Plasma recipient O has neither A nor B antigens on RBCs; can receive all plasma groups.',
        };
      default:
        return {
          compatibleGroups: [patientBloodGroup],
          category,
          reason: 'Exact group compatibility applied.',
        };
    }
  }

  if (category === 'PLATELETS') {
    switch (patientBloodGroup) {
      case 'AB_POS':
        return {
          compatibleGroups: ['AB_POS', 'AB_NEG', 'A_POS', 'A_NEG', 'B_POS', 'B_NEG'],
          category,
          reason: 'Platelet recipient AB+ accepts AB, A, or B donors (O donors excluded due to plasma isohemagglutinins).',
        };
      case 'AB_NEG':
        return {
          compatibleGroups: ['AB_NEG', 'A_NEG', 'B_NEG'],
          category,
          reason: 'Platelet recipient AB- requires Rh- donor from AB, A, or B groups.',
        };
      case 'A_POS':
        return {
          compatibleGroups: ['A_POS', 'A_NEG', 'AB_POS', 'AB_NEG'],
          category,
          reason: 'Platelet recipient A+ accepts A or AB donors.',
        };
      case 'A_NEG':
        return {
          compatibleGroups: ['A_NEG', 'AB_NEG'],
          category,
          reason: 'Platelet recipient A- requires Rh- donor of group A or AB.',
        };
      case 'B_POS':
        return {
          compatibleGroups: ['B_POS', 'B_NEG', 'AB_POS', 'AB_NEG'],
          category,
          reason: 'Platelet recipient B+ accepts B or AB donors.',
        };
      case 'B_NEG':
        return {
          compatibleGroups: ['B_NEG', 'AB_NEG'],
          category,
          reason: 'Platelet recipient B- requires Rh- donor of group B or AB.',
        };
      case 'O_POS':
        return {
          compatibleGroups: ['O_POS', 'O_NEG', 'A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG'],
          category,
          reason: 'Platelet recipient O+ accepts O, A, B, or AB platelets.',
        };
      case 'O_NEG':
        return {
          compatibleGroups: ['O_NEG', 'A_NEG', 'B_NEG', 'AB_NEG'],
          category,
          reason: 'Platelet recipient O- requires Rh- donor of group O, A, B, or AB.',
        };
      default:
        return {
          compatibleGroups: [patientBloodGroup],
          category,
          reason: 'Exact group compatibility applied.',
        };
    }
  }

  // RED_CELLS (PRBC / Whole Blood)
  switch (patientBloodGroup) {
    case 'O_NEG':
      return {
        compatibleGroups: ['O_NEG'],
        category,
        reason: 'RBC recipient O- can only receive O- red cells.',
      };
    case 'O_POS':
      return {
        compatibleGroups: ['O_NEG', 'O_POS'],
        category,
        reason: 'RBC recipient O+ can receive O- or O+ red cells.',
      };
    case 'A_NEG':
      return {
        compatibleGroups: ['O_NEG', 'A_NEG'],
        category,
        reason: 'RBC recipient A- can receive O- or A- red cells.',
      };
    case 'A_POS':
      return {
        compatibleGroups: ['O_NEG', 'O_POS', 'A_NEG', 'A_POS'],
        category,
        reason: 'RBC recipient A+ can receive O-, O+, A-, or A+ red cells.',
      };
    case 'B_NEG':
      return {
        compatibleGroups: ['O_NEG', 'B_NEG'],
        category,
        reason: 'RBC recipient B- can receive O- or B- red cells.',
      };
    case 'B_POS':
      return {
        compatibleGroups: ['O_NEG', 'O_POS', 'B_NEG', 'B_POS'],
        category,
        reason: 'RBC recipient B+ can receive O-, O+, B-, or B+ red cells.',
      };
    case 'AB_NEG':
      return {
        compatibleGroups: ['O_NEG', 'A_NEG', 'B_NEG', 'AB_NEG'],
        category,
        reason: 'RBC recipient AB- can receive any Rh- red cells (O-, A-, B-, AB-).',
      };
    case 'AB_POS':
      return {
        compatibleGroups: ['O_NEG', 'O_POS', 'A_NEG', 'A_POS', 'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS'],
        category,
        reason: 'RBC recipient AB+ is universal recipient for red cells.',
      };
    default:
      return {
        compatibleGroups: [patientBloodGroup],
        category,
        reason: 'Exact group compatibility applied.',
      };
  }
}

export function getCompatibleBloodGroups(patientBloodGroup: BloodGroup, component?: string): BloodGroup[] {
  return getComponentCompatibility(patientBloodGroup, component).compatibleGroups;
}

export class AdminMatchingService {
  /**
   * Platform Admin: View all blood requests that have active matching workflows.
   */
  static async getPendingMatchingRequests() {
    const requests = await prisma.bloodRequest.findMany({
      where: {
        status: 'OPEN',
      },
      include: {
        requester: { select: { id: true, name: true, phoneNumber: true } },
        bloodCentre: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const matchingRequests: any[] = [];

    for (const req of requests) {
      const meta = parseRequestMessageMetadata(req.message, req.bloodCentre?.hospitalName);
      if (!meta.matchingRequest) continue;

      const mr = meta.matchingRequest;
      const reservedUnitsCount = meta.reservedUnitIds?.length || 0;
      const remainingShortfall =
        meta.shortfallCount !== undefined ? meta.shortfallCount : Math.max(0, req.unitsRequested - reservedUnitsCount);

      // Fetch requesting organisation details
      let requestingOrgName = meta.assignedBankName || 'Designated Blood Bank';
      if (mr.requestingOrgId) {
        const org = await prisma.organisation.findUnique({
          where: { id: mr.requestingOrgId },
          select: { name: true, orgCode: true },
        });
        if (org) requestingOrgName = org.name;
      }

      matchingRequests.push({
        requestId: req.id,
        matchingRequestId: mr.id,
        requestReference: `#${req.id.slice(0, 8)}`,
        patientName: req.patientName || null,
        bloodGroup: req.bloodGroup,
        component: req.component,
        unitsRequested: req.unitsRequested,
        reservedUnitsCount,
        requestedShortfall: mr.requestedShortfall || remainingShortfall,
        hospitalName: meta.hospitalName || req.bloodCentre?.hospitalName || 'Designated Healthcare Facility',
        requestingOrgId: mr.requestingOrgId,
        requestingOrgName,
        status: mr.status,
        searchScope: mr.searchScope || req.searchScope || 'EXACT_CENTRE',
        urgency: meta.urgency || 'NORMAL',
        requestedAt: mr.requestedAt,
        lastSearchedAt: mr.lastSearchedAt || null,
        releasedAt: mr.releasedAt || null,
        releasedById: mr.releasedById || null,
        candidatesCount: mr.candidatesCount || 0,
        releasedCount: mr.releasedCandidateIds?.length || 0,
        expansionReason: mr.expansionReason || null,
      });
    }

    return matchingRequests;
  }

  /**
   * Deterministic Donor Ranking Algorithm
   * Hard Rules:
   * 1. Hard Eligibility Gate: blood group compatibility, clinical screening deferrals,
   *    90-day recovery interval, donor active/searchable/consent status, userId !== requesterId.
   * 2. Deterministic Ranking Hierarchy:
   *    TIER A: Registered area relevance (Match Level 1 > 2 > 3)
   *    TIER B: Location proximity (Fresh GPS > Stale GPS > Registered Area > Unknown), then distanceKm ascending
   *    TIER C: Regular donor priority (completed donations >= 2)
   *    TIER D: Stable tie-breaker: donorId ascending
   */
  static async runMatchingSearch(
    adminUserId: string,
    requestId: string,
    requestedScope?: 'EXACT_CENTRE' | 'DISTRICT_EXPANDED' | 'OUT_OF_DISTRICT',
    expansionReason?: string
  ): Promise<{
    requestId: string;
    matchingRequestId: string;
    effectiveScope: 'EXACT_CENTRE' | 'DISTRICT_EXPANDED' | 'OUT_OF_DISTRICT';
    candidates: RankedDonorCandidateDTO[];
    counts: { level1: number; level2: number; level3: number; total: number };
    requestSummary: {
      patientBloodGroup: BloodGroup;
      component: string;
      componentCategory?: ComponentCategory;
      compatibilityReason?: string;
      compatibleBloodGroups?: BloodGroup[];
      requestedShortfall: number;
      targetHospitalName: string;
      requestingOrgName: string;
    };
  }> {
    const caller = await prisma.user.findUnique({
      where: { id: adminUserId },
      select: { role: true },
    });
    if (!caller || caller.role !== 'ADMIN') {
      const error: any = new Error('Access denied: Only Platform Administration can execute or modify donor matching.');
      error.code = 'FORBIDDEN_ACCESS';
      error.statusCode = 403;
      throw error;
    }

    const request = await prisma.bloodRequest.findUnique({
      where: { id: requestId },
      include: {
        bloodCentre: true,
        requester: { select: { id: true, name: true } },
      },
    });

    if (!request) {
      const error: any = new Error('Blood request not found.');
      error.code = 'REQUEST_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    // Hard Clinical Validation: blood group and component must be valid
    if (!request.bloodGroup) {
      const error: any = new Error('Blood request is missing bloodGroup required for donor matching.');
      error.code = 'INVALID_BLOOD_GROUP';
      error.statusCode = 400;
      throw error;
    }

    if (!request.component || typeof request.component !== 'string' || !request.component.trim()) {
      const error: any = new Error('Blood request is missing component required for component-specific compatibility matching.');
      error.code = 'INVALID_COMPONENT';
      error.statusCode = 400;
      throw error;
    }

    const metadata = parseRequestMessageMetadata(request.message, request.bloodCentre?.hospitalName);

    // Validate scope expansion requirement
    const effectiveScope = requestedScope || metadata.matchingRequest?.searchScope || 'EXACT_CENTRE';
    if (requestedScope && requestedScope !== 'EXACT_CENTRE' && !expansionReason) {
      const error: any = new Error('A structured expansion reason is required when expanding search scope beyond EXACT_CENTRE.');
      error.code = 'EXPANSION_REASON_REQUIRED';
      error.statusCode = 400;
      throw error;
    }
    if (!requestedScope && effectiveScope !== 'EXACT_CENTRE' && !expansionReason && !metadata.matchingRequest?.expansionReason) {
      const error: any = new Error('A structured expansion reason is required when expanding search scope beyond EXACT_CENTRE.');
      error.code = 'EXPANSION_REASON_REQUIRED';
      error.statusCode = 400;
      throw error;
    }

    // Determine reference coordinates for distance calculations
    let refCoords: { lat: number; lng: number } | null = null;
    let centreDistrict = request.bloodCentre?.districtCode || null;
    let targetOrgId = metadata.assignedBankId || (metadata as any).bloodBankId || null;

    if (targetOrgId) {
      const bankOrg = await prisma.organisation.findUnique({
        where: { id: targetOrgId },
        select: { districtCode: true, name: true, latitude: true, longitude: true, locationStatus: true },
      });
      if (bankOrg) {
        if (bankOrg.districtCode) centreDistrict = bankOrg.districtCode;
        if (bankOrg.locationStatus === 'CONFIRMED' && bankOrg.latitude !== null && bankOrg.longitude !== null) {
          refCoords = { lat: bankOrg.latitude, lng: bankOrg.longitude };
        }
      }
    } else if (request.bloodCentre?.hospitalCode) {
      const linkedOrg = await prisma.organisation.findFirst({
        where: { hospitalCode: request.bloodCentre.hospitalCode },
        select: { id: true, latitude: true, longitude: true, locationStatus: true, districtCode: true },
      });
      if (linkedOrg) {
        if (linkedOrg.districtCode) centreDistrict = linkedOrg.districtCode;
        if (linkedOrg.locationStatus === 'CONFIRMED' && linkedOrg.latitude !== null && linkedOrg.longitude !== null) {
          refCoords = { lat: linkedOrg.latitude, lng: linkedOrg.longitude };
        }
      }
    }

    // Fallback to district centroid only if Blood Bank has no confirmed location
    if (!refCoords && centreDistrict && DISTRICT_CENTROIDS[centreDistrict]) {
      refCoords = { lat: DISTRICT_CENTROIDS[centreDistrict].lat, lng: DISTRICT_CENTROIDS[centreDistrict].lng };
    }

    const targetHospitalCode = request.hospitalCode;
    const compMatch = getComponentCompatibility(request.bloodGroup, request.component);
    const compatibleGroups = compMatch.compatibleGroups;
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    // 1. Fetch eligible donor candidates matching compatibility
    const candidates = await prisma.donorProfile.findMany({
      where: {
        bloodGroup: { in: compatibleGroups },
        isAvailable: true,
        isSearchable: true,
        consentWithdrawnAt: null,
        userId: { not: request.requesterId }, // Never match requester with themselves
        user: {
          status: 'ACTIVE',
        },
      },
      include: {
        centrePreferences: true,
        user: {
          select: {
            id: true,
            phoneNumber: true,
            status: true,
            donationEvents: {
              where: { outcome: 'COMPLETED' },
              orderBy: { performedAt: 'desc' },
              select: { performedAt: true },
            },
            clinicalScreenings: {
              where: {
                status: 'DEFERRED',
                OR: [
                  { deferredUntil: { gt: new Date() } },
                  { eligibilityDecision: 'PERMANENT_DEFERRAL' },
                ],
              },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { deferredUntil: true, eligibilityDecision: true },
            },
            donorLatestLocation: true,
          },
        },
      },
    });

    const evaluatedCandidates: RankedDonorCandidateDTO[] = [];
    let level1Count = 0;
    let level2Count = 0;
    let level3Count = 0;

    for (const donor of candidates) {
      // HARD ELIGIBILITY GATE:
      // (a) Active Clinical Deferral check
      const activeDeferral = donor.user.clinicalScreenings?.[0];
      if (activeDeferral) {
        if (activeDeferral.eligibilityDecision === 'PERMANENT_DEFERRAL') continue;
        if (activeDeferral.deferredUntil && new Date(activeDeferral.deferredUntil) > new Date()) continue;
      }

      // (b) 90-day whole blood recovery interval check
      const latestDonationDate = donor.user.donationEvents?.[0]?.performedAt;
      const refDonationDate = donor.verifiedLastDonationDate || latestDonationDate || donor.lastDonationDate;
      if (refDonationDate && new Date(refDonationDate) >= ninetyDaysAgo) {
        continue;
      }

      // (c) Proximity Tier & Distance Calculation
      let proximityTier: DonorProximityTier = 'UNKNOWN';
      let distanceKm: number | null = null;
      let distanceType: 'straight_line' | 'road' = 'straight_line';
      let locationFreshness: 'FRESH' | 'STALE' | 'UNAVAILABLE' = 'UNAVAILABLE';
      let locationUpdatedAt: string | null = null;
      const loc = donor.user.donorLatestLocation;

      if (loc) {
        const ageMinutes = (Date.now() - new Date(loc.serverReceivedAt).getTime()) / (60 * 1000);
        const isFresh = !loc.isStale && ageMinutes <= 30;
        locationFreshness = isFresh ? 'FRESH' : 'STALE';
        proximityTier = isFresh ? 'FRESH_GPS' : 'STALE_GPS';
        locationUpdatedAt = loc.serverReceivedAt.toISOString();
        if (refCoords) {
          distanceKm = calculateHaversineDistanceKm(refCoords.lat, refCoords.lng, loc.latitude, loc.longitude);
        }
      } else if (donor.districtCode) {
        proximityTier = 'REGISTERED_AREA';
        locationFreshness = 'UNAVAILABLE';
        if (refCoords && DISTRICT_CENTROIDS[donor.districtCode]) {
          distanceKm = calculateHaversineDistanceKm(
            refCoords.lat,
            refCoords.lng,
            DISTRICT_CENTROIDS[donor.districtCode].lat,
            DISTRICT_CENTROIDS[donor.districtCode].lng
          );
        }
      }

      // (d) Registered Area Relevance / Match Level
      const isPreferredCentre =
        Boolean(targetHospitalCode) &&
        (donor.primaryHospitalCode === targetHospitalCode ||
          donor.centrePreferences.some((p) => p.hospitalCode === targetHospitalCode));

      const isSameDistrict = Boolean(centreDistrict) && donor.districtCode === centreDistrict;

      // Note: Registered area is a prioritization signal, NOT a hard geographic exclusion.
      // Consented donors near the requesting Blood Bank (distance <= 15km) match Level 1, <= 35km match Level 2.
      let matchLevel: DonorMatchLevel = 'LEVEL_3_EXPANDED';
      let matchReason = 'Out of District Coordination';

      if (isPreferredCentre) {
        matchLevel = 'LEVEL_1_CENTRE';
        matchReason = 'Preferred Blood Centre Match';
      } else if (distanceKm !== null && distanceKm <= 15) {
        matchLevel = 'LEVEL_1_CENTRE';
        matchReason = `Nearby Live Location (${distanceKm} km from Centre)`;
      } else if (isSameDistrict) {
        matchLevel = 'LEVEL_2_DISTRICT';
        matchReason = 'Same District Coordination';
      } else if (distanceKm !== null && distanceKm <= 35) {
        matchLevel = 'LEVEL_2_DISTRICT';
        matchReason = `Nearby Area Radius (${distanceKm} km)`;
      }

      // Count across tiers
      if (matchLevel === 'LEVEL_1_CENTRE') level1Count++;
      else if (matchLevel === 'LEVEL_2_DISTRICT') level2Count++;
      else level3Count++;

      // (e) Scope Inclusivity Filter
      let inScope = false;
      if (effectiveScope === 'EXACT_CENTRE') {
        inScope = matchLevel === 'LEVEL_1_CENTRE';
      } else if (effectiveScope === 'DISTRICT_EXPANDED') {
        inScope = matchLevel === 'LEVEL_1_CENTRE' || matchLevel === 'LEVEL_2_DISTRICT';
      } else if (effectiveScope === 'OUT_OF_DISTRICT') {
        inScope = true;
      }

      if (!inScope) continue;

      // (f) Regular Donor Priority
      const completedDonationsCount = donor.user.donationEvents.length;
      const isRegularDonor = completedDonationsCount >= 2;

      evaluatedCandidates.push({
        donorId: donor.id,
        displayName: sanitizeDonorName(donor.fullName),
        bloodGroup: donor.bloodGroup,
        isExactBloodGroupMatch: donor.bloodGroup === request.bloodGroup,
        isCompatible: true,
        matchLevel,
        matchReason,
        proximityTier,
        distanceKm,
        distanceType,
        locationFreshness,
        locationUpdatedAt,
        isRegularDonor,
        completedDonationsCount,
        lastDonationDate: refDonationDate ? new Date(refDonationDate).toISOString() : null,
        isAvailable: donor.isAvailable,
        districtCode: donor.districtCode,
        locality: donor.cityOrLocality || null,
        selectionRank: 0, // Assigned after sorting
      });
    }

    // 2. Deterministic Ranking Hierarchy:
    // TIER A: Registered Area / Match Level (Level 1 > Level 2 > Level 3)
    // TIER B: Location Proximity (Fresh GPS > Stale GPS > Registered Area > Unknown), then distanceKm ascending
    // TIER C: Regular Donor Priority (completed donations >= 2)
    // TIER D: Stable tie-breaker: donorId ascending
    const matchLevelOrder: Record<DonorMatchLevel, number> = {
      LEVEL_1_CENTRE: 1,
      LEVEL_2_DISTRICT: 2,
      LEVEL_3_EXPANDED: 3,
    };

    const proximityOrder: Record<DonorProximityTier, number> = {
      FRESH_GPS: 1,
      STALE_GPS: 2,
      REGISTERED_AREA: 3,
      UNKNOWN: 4,
    };

    evaluatedCandidates.sort((a, b) => {
      // 1. Registered Area relevance (Match Level)
      if (matchLevelOrder[a.matchLevel] !== matchLevelOrder[b.matchLevel]) {
        return matchLevelOrder[a.matchLevel] - matchLevelOrder[b.matchLevel];
      }

      // 2. Location Proximity Tier
      if (proximityOrder[a.proximityTier] !== proximityOrder[b.proximityTier]) {
        return proximityOrder[a.proximityTier] - proximityOrder[b.proximityTier];
      }

      // 2b. Distance in km (ascending)
      if (a.distanceKm !== null && b.distanceKm !== null && a.distanceKm !== b.distanceKm) {
        return a.distanceKm - b.distanceKm;
      }
      if (a.distanceKm !== null && b.distanceKm === null) return -1;
      if (a.distanceKm === null && b.distanceKm !== null) return 1;

      // 3. Regular Donor Priority
      if (a.isRegularDonor !== b.isRegularDonor) {
        return a.isRegularDonor ? -1 : 1;
      }
      if (a.completedDonationsCount !== b.completedDonationsCount) {
        return b.completedDonationsCount - a.completedDonationsCount;
      }

      // 4. Stable tie-breaker: donorId ascending
      return a.donorId.localeCompare(b.donorId);
    });

    // Assign sequential 1-based selectionRank
    evaluatedCandidates.forEach((c, idx) => {
      c.selectionRank = idx + 1;
    });

    // Update metadata on blood request
    const now = new Date();
    const matchingReq: MatchingRequestMetadata = {
      id: metadata.matchingRequest?.id || `mr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      requestedByUserId: metadata.matchingRequest?.requestedByUserId || adminUserId,
      requestingOrgId: metadata.matchingRequest?.requestingOrgId || metadata.assignedBankId || '',
      requestedShortfall: metadata.matchingRequest?.requestedShortfall || Math.max(0, request.unitsRequested - (metadata.reservedUnitIds?.length || 0)),
      status: evaluatedCandidates.length > 0 ? 'CANDIDATES_FOUND' : 'NO_CANDIDATES',
      searchScope: effectiveScope,
      requestedAt: metadata.matchingRequest?.requestedAt || now.toISOString(),
      lastSearchedAt: now.toISOString(),
      reviewedAt: now.toISOString(),
      reviewedById: adminUserId,
      candidatesCount: evaluatedCandidates.length,
      expansionReason: expansionReason || metadata.matchingRequest?.expansionReason,
      releasedCandidateIds: metadata.matchingRequest?.releasedCandidateIds || [],
    };

    metadata.matchingRequest = matchingReq;

    const normalizedScope = ((effectiveScope as any) === 'DISTRICT' ? 'DISTRICT_EXPANDED' : effectiveScope) as any;

    await prisma.bloodRequest.update({
      where: { id: requestId },
      data: {
        message: JSON.stringify(metadata),
        searchScope: normalizedScope,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'RUN_DONOR_MATCHING_SEARCH',
        resource: 'BloodRequest',
        resourceId: requestId,
        metadata: {
          scope: effectiveScope,
          candidatesCount: evaluatedCandidates.length,
          expansionReason: expansionReason || null,
        },
      },
    }).catch(() => {});

    // Publish Realtime Outbox Event
    try {
      await RealtimeService.publishOutboxEvent(prisma, {
        eventType: 'blood_request.matching_searched',
        entityType: 'BloodRequest',
        entityId: requestId,
        payload: {
          requestId,
          matchingRequestId: matchingReq.id,
          scope: effectiveScope,
          candidatesCount: evaluatedCandidates.length,
          searchedAt: now.toISOString(),
        },
      });
    } catch {}

    return {
      requestId: request.id,
      matchingRequestId: matchingReq.id,
      effectiveScope,
      candidates: evaluatedCandidates,
      counts: {
        level1: level1Count,
        level2: level2Count,
        level3: level3Count,
        total: evaluatedCandidates.length,
      },
      requestSummary: {
        patientBloodGroup: request.bloodGroup,
        component: request.component,
        componentCategory: compMatch.category,
        compatibilityReason: compMatch.reason,
        compatibleBloodGroups: compatibleGroups,
        requestedShortfall: matchingReq.requestedShortfall,
        targetHospitalName: metadata.hospitalName || request.bloodCentre?.hospitalName || 'Designated Hospital',
        requestingOrgName: metadata.assignedBankName || 'Designated Blood Bank',
      },
    };
  }

  /**
   * Platform Admin: Release approved candidate list to the requesting Blood Bank.
   * Hard Rules:
   * 1. Only Platform Admin can release candidates.
   * 2. Candidate list is recorded in matchingRequest metadata.
   * 3. Emits 'blood_request.matching_released' Outbox event for requesting Blood Bank and Admin.
   * 4. Requesting Blood Bank alone can now view these candidates.
   */
  static async releaseMatchingCandidates(
    adminUserId: string,
    requestId: string,
    candidateIds: string[],
    releaseNotes?: string
  ): Promise<{
    success: boolean;
    message: string;
    releasedCount: number;
    releasedAt: string;
    matchingRequest: MatchingRequestMetadata;
  }> {
    const caller = await prisma.user.findUnique({
      where: { id: adminUserId },
      select: { role: true },
    });
    if (!caller || caller.role !== 'ADMIN') {
      const error: any = new Error('Access denied: Only Platform Administration can release donor matching candidates.');
      error.code = 'FORBIDDEN_ACCESS';
      error.statusCode = 403;
      throw error;
    }

    if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
      const error: any = new Error('candidateIds must be a non-empty array of donor IDs.');
      error.code = 'INVALID_CANDIDATE_IDS';
      error.statusCode = 400;
      throw error;
    }

    const request = await prisma.bloodRequest.findUnique({
      where: { id: requestId },
      include: { bloodCentre: true },
    });

    if (!request) {
      const error: any = new Error('Blood request not found.');
      error.code = 'REQUEST_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    const metadata = parseRequestMessageMetadata(request.message, request.bloodCentre?.hospitalName);
    const now = new Date();

    const matchingReq: MatchingRequestMetadata = {
      ...(metadata.matchingRequest || {
        id: `mr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        requestedByUserId: adminUserId,
        requestingOrgId: metadata.assignedBankId || '',
        requestedShortfall: Math.max(0, request.unitsRequested - (metadata.reservedUnitIds?.length || 0)),
        requestedAt: now.toISOString(),
        searchScope: 'EXACT_CENTRE',
      }),
      status: 'RELEASED',
      releasedCandidateIds: candidateIds,
      releasedAt: now.toISOString(),
      releasedById: adminUserId,
      candidatesCount: candidateIds.length,
      releaseNotes: releaseNotes || undefined,
    };

    metadata.matchingRequest = matchingReq;

    await prisma.bloodRequest.update({
      where: { id: requestId },
      data: {
        message: JSON.stringify(metadata),
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'RELEASE_DONOR_MATCHING_CANDIDATES',
        resource: 'BloodRequest',
        resourceId: requestId,
        metadata: {
          matchingRequestId: matchingReq.id,
          releasedCount: candidateIds.length,
          candidateIds,
          releaseNotes: releaseNotes || null,
        },
      },
    }).catch(() => {});

    // Publish Realtime Outbox Event
    try {
      await RealtimeService.publishOutboxEvent(prisma, {
        eventType: 'blood_request.matching_released',
        entityType: 'BloodRequest',
        entityId: requestId,
        organisationId: matchingReq.requestingOrgId || undefined,
        payload: {
          requestId,
          matchingRequestId: matchingReq.id,
          requestingOrgId: matchingReq.requestingOrgId,
          releasedCandidateCount: candidateIds.length,
          releasedAt: now.toISOString(),
          releaseNotes: releaseNotes || null,
        },
      });
    } catch {}

    return {
      success: true,
      message: `Successfully released ${candidateIds.length} candidate(s) to the requesting Blood Bank.`,
      releasedCount: candidateIds.length,
      releasedAt: now.toISOString(),
      matchingRequest: matchingReq,
    };
  }

  /**
   * Blood Bank View: Retrieve candidate list ONLY if released by Admin.
   * Privacy Protection:
   * - Strips exact GPS coordinates (only shows proximityTier, distanceKm, matchLevel, locality).
   * - Contact number disclosed ONLY if consented and accepted.
   * - 403 Forbidden for patients and unauthorized Blood Banks.
   */
  static async getReleasedCandidatesForBloodBank(
    callerUserId: string,
    callerRole: string,
    organisationId: string,
    requestId: string
  ): Promise<{
    status: DonorMatchingStatus;
    isReleased: boolean;
    releasedAt?: string;
    releasedCount: number;
    candidates: RankedDonorCandidateDTO[];
    message: string;
  }> {
    // 1. Authorisation verification:
    const isPlatformAdmin = callerRole === 'ADMIN';

    if (!isPlatformAdmin) {
      const membership = await prisma.organisationMembership.findFirst({
        where: {
          organisationId,
          userId: callerUserId,
          isActive: true,
        },
        include: { organisation: true },
      });

      if (!membership) {
        const error: any = new Error('Access denied: You do not have verified membership in this organisation.');
        error.code = 'FORBIDDEN_ACCESS';
        error.statusCode = 403;
        throw error;
      }
    }

    const request = await prisma.bloodRequest.findUnique({
      where: { id: requestId },
      include: {
        bloodCentre: true,
        recipientResponses: {
          include: {
            donor: {
              include: { user: { select: { phoneNumber: true } } },
            },
          },
        },
      },
    });

    if (!request) {
      const error: any = new Error('Blood request not found.');
      error.code = 'REQUEST_NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    const metadata = parseRequestMessageMetadata(request.message, request.bloodCentre?.hospitalName);

    // Verify requesting organisation ownership
    if (!isPlatformAdmin) {
      const org = await prisma.organisation.findUnique({
        where: { id: organisationId },
        select: { id: true, orgCode: true, hospitalCode: true },
      });

      const targetCodes = [org?.hospitalCode, org?.orgCode, org?.id].filter(Boolean) as string[];
      const isDesignatedBank =
        (metadata.assignedBankId && metadata.assignedBankId === organisationId) ||
        (request.hospitalCode && targetCodes.includes(request.hospitalCode));

      if (!isDesignatedBank) {
        const error: any = new Error('Access denied: Only the designated Blood Bank handling this request can view released candidates.');
        error.code = 'FORBIDDEN_ACCESS';
        error.statusCode = 403;
        throw error;
      }
    }

    const mr = metadata.matchingRequest;
    if (!mr || mr.status !== 'RELEASED') {
      return {
        status: mr?.status || 'NOT_REQUESTED',
        isReleased: false,
        releasedCount: 0,
        candidates: [],
        message: mr
          ? `Candidates have not been released yet. Current status: ${mr.status}.`
          : 'Donor matching has not been requested for this request.',
      };
    }

    const releasedIds = mr.releasedCandidateIds || [];
    if (releasedIds.length === 0) {
      return {
        status: 'RELEASED',
        isReleased: true,
        releasedAt: mr.releasedAt,
        releasedCount: 0,
        candidates: [],
        message: 'No candidates were selected in the release.',
      };
    }

    // Fetch the released donor profiles
    const donors = await prisma.donorProfile.findMany({
      where: {
        id: { in: releasedIds },
      },
      include: {
        centrePreferences: true,
        user: {
          select: {
            id: true,
            phoneNumber: true,
            donationEvents: {
              where: { outcome: 'COMPLETED' },
            },
            donorLatestLocation: true,
          },
        },
      },
    });

    const responseMap = new Map(request.recipientResponses.map((r) => [r.donorId, r]));

    // Reference coords for distance calculation
    let refCoords: { lat: number; lng: number } | null = null;
    let centreDistrict = request.bloodCentre?.districtCode || null;
    const meta = parseRequestMessageMetadata(request.message);
    const assignedBankId = meta.assignedBankId || (meta as any).bloodBankId || null;

    if (assignedBankId) {
      const bank = await prisma.organisation.findUnique({
        where: { id: assignedBankId },
        select: { latitude: true, longitude: true, locationStatus: true, districtCode: true },
      });
      if (bank) {
        if (bank.districtCode) centreDistrict = bank.districtCode;
        if (bank.locationStatus === 'CONFIRMED' && bank.latitude !== null && bank.longitude !== null) {
          refCoords = { lat: bank.latitude, lng: bank.longitude };
        }
      }
    } else if (request.bloodCentre?.hospitalCode) {
      const linked = await prisma.organisation.findFirst({
        where: { hospitalCode: request.bloodCentre.hospitalCode },
        select: { latitude: true, longitude: true, locationStatus: true, districtCode: true },
      });
      if (linked) {
        if (linked.districtCode) centreDistrict = linked.districtCode;
        if (linked.locationStatus === 'CONFIRMED' && linked.latitude !== null && linked.longitude !== null) {
          refCoords = { lat: linked.latitude, lng: linked.longitude };
        }
      }
    }

    if (!refCoords && centreDistrict && DISTRICT_CENTROIDS[centreDistrict]) {
      refCoords = { lat: DISTRICT_CENTROIDS[centreDistrict].lat, lng: DISTRICT_CENTROIDS[centreDistrict].lng };
    }

    const projectedCandidates: RankedDonorCandidateDTO[] = [];

    for (const donor of donors) {
      const loc = donor.user.donorLatestLocation;
      let proximityTier: DonorProximityTier = 'UNKNOWN';
      let distanceKm: number | null = null;

      let distanceType: 'straight_line' | 'road' = 'straight_line';
      let locationFreshness: 'FRESH' | 'STALE' | 'UNAVAILABLE' = 'UNAVAILABLE';
      let locationUpdatedAt: string | null = null;

      if (loc) {
        const ageMinutes = (Date.now() - new Date(loc.serverReceivedAt).getTime()) / (60 * 1000);
        const isFresh = !loc.isStale && ageMinutes <= 30;
        locationFreshness = isFresh ? 'FRESH' : 'STALE';
        proximityTier = isFresh ? 'FRESH_GPS' : 'STALE_GPS';
        locationUpdatedAt = loc.serverReceivedAt.toISOString();
        if (refCoords) {
          distanceKm = calculateHaversineDistanceKm(refCoords.lat, refCoords.lng, loc.latitude, loc.longitude);
        }
      } else if (donor.districtCode) {
        proximityTier = 'REGISTERED_AREA';
        locationFreshness = 'UNAVAILABLE';
        if (refCoords && DISTRICT_CENTROIDS[donor.districtCode]) {
          distanceKm = calculateHaversineDistanceKm(
            refCoords.lat,
            refCoords.lng,
            DISTRICT_CENTROIDS[donor.districtCode].lat,
            DISTRICT_CENTROIDS[donor.districtCode].lng
          );
        }
      }

      const isPreferredCentre =
        Boolean(request.hospitalCode) &&
        (donor.primaryHospitalCode === request.hospitalCode ||
          donor.centrePreferences.some((p) => p.hospitalCode === request.hospitalCode));
      const isSameDistrict = Boolean(centreDistrict) && donor.districtCode === centreDistrict;

      let matchLevel: DonorMatchLevel = 'LEVEL_3_EXPANDED';
      let matchReason = 'Out of District Coordination';

      if (isPreferredCentre) {
        matchLevel = 'LEVEL_1_CENTRE';
        matchReason = 'Preferred Blood Centre Match';
      } else if (distanceKm !== null && distanceKm <= 15) {
        matchLevel = 'LEVEL_1_CENTRE';
        matchReason = `Nearby Live Location (${distanceKm} km)`;
      } else if (isSameDistrict) {
        matchLevel = 'LEVEL_2_DISTRICT';
        matchReason = 'Same District Coordination';
      } else if (distanceKm !== null && distanceKm <= 35) {
        matchLevel = 'LEVEL_2_DISTRICT';
        matchReason = `Nearby Area Radius (${distanceKm} km)`;
      }

      const existingResp = responseMap.get(donor.id);
      const isAccepted = existingResp?.status === 'ACCEPTED';
      const isAuthorized = existingResp?.disclosureAuthorized === true;

      // Contact disclosure gate: phone disclosed ONLY if accepted and authorized
      const disclosedPhone = isAccepted && isAuthorized && donor.user.phoneNumber ? donor.user.phoneNumber : null;

      const isCandidateArrived = metadata.donorIntake?.donorId === donor.id;
      const candidateIntakeStatus = isCandidateArrived ? metadata.donorIntake?.intakeStatus || 'ARRIVED' : null;
      const candidateAttendanceId = isCandidateArrived ? metadata.donorIntake?.attendanceId || null : null;

      projectedCandidates.push({
        donorId: donor.id,
        displayName: sanitizeDonorName(donor.fullName),
        bloodGroup: donor.bloodGroup,
        isExactBloodGroupMatch: donor.bloodGroup === request.bloodGroup,
        isCompatible: true,
        matchLevel,
        matchReason,
        proximityTier,
        distanceKm,
        distanceType,
        locationFreshness,
        locationUpdatedAt,
        isRegularDonor: donor.user.donationEvents.length >= 2,
        completedDonationsCount: donor.user.donationEvents.length,
        lastDonationDate: donor.lastDonationDate ? new Date(donor.lastDonationDate).toISOString() : null,
        isAvailable: donor.isAvailable,
        districtCode: donor.districtCode,
        locality: donor.cityOrLocality || null,
        selectionRank: releasedIds.indexOf(donor.id) + 1,
        contactNumber: disclosedPhone,
        disclosureAuthorized: isAuthorized,
        invitationId: existingResp?.id || null,
        invitationStatus: (existingResp?.status as any) || null,
        respondedAt: existingResp?.respondedAt ? existingResp.respondedAt.toISOString() : null,
        arrived: isCandidateArrived,
        intakeStatus: candidateIntakeStatus,
        attendanceId: candidateAttendanceId,
      });
    }

    // Sort in same order as releasedIds
    projectedCandidates.sort((a, b) => releasedIds.indexOf(a.donorId) - releasedIds.indexOf(b.donorId));

    return {
      status: 'RELEASED',
      isReleased: true,
      releasedAt: mr.releasedAt,
      releasedCount: projectedCandidates.length,
      candidates: projectedCandidates,
      message: `Displaying ${projectedCandidates.length} candidate(s) approved and released by System Administration.`,
    };
  }

  /**
   * Retrieves road distance and estimated driving duration for a specific donor candidate
   * on a matching request, without exposing the raw donor GPS coordinates to unauthorized parties.
   */
  static async getCandidateDirections(
    requestId: string,
    candidateDonorId: string,
    profile: 'driving' | 'walking' | 'cycling' = 'driving'
  ): Promise<RouteDirectionsDTO | null> {
    const bloodRequest = await prisma.bloodRequest.findUnique({
      where: { id: requestId },
      include: {
        bloodCentre: true,
      },
    });

    if (!bloodRequest) {
      throw new Error('Blood request not found.');
    }

    const metadata = parseRequestMessageMetadata(bloodRequest.message);
    const targetOrgId = metadata.assignedBankId || (metadata as any).bloodBankId || null;

    let bankCoords: { lat: number; lng: number } | null = null;

    if (targetOrgId) {
      const org = await prisma.organisation.findUnique({
        where: { id: targetOrgId },
        select: { latitude: true, longitude: true, locationStatus: true, districtCode: true },
      });
      if (org && org.locationStatus === 'CONFIRMED' && org.latitude !== null && org.longitude !== null) {
        bankCoords = { lat: org.latitude, lng: org.longitude };
      } else if (org?.districtCode && DISTRICT_CENTROIDS[org.districtCode]) {
        bankCoords = { lat: DISTRICT_CENTROIDS[org.districtCode].lat, lng: DISTRICT_CENTROIDS[org.districtCode].lng };
      }
    }

    if (!bankCoords && bloodRequest.bloodCentre?.hospitalCode) {
      const linkedOrg = await prisma.organisation.findFirst({
        where: { hospitalCode: bloodRequest.bloodCentre.hospitalCode },
        select: { latitude: true, longitude: true, locationStatus: true, districtCode: true },
      });
      if (linkedOrg && linkedOrg.locationStatus === 'CONFIRMED' && linkedOrg.latitude !== null && linkedOrg.longitude !== null) {
        bankCoords = { lat: linkedOrg.latitude, lng: linkedOrg.longitude };
      }
    }

    if (!bankCoords && bloodRequest.bloodCentre?.districtCode && DISTRICT_CENTROIDS[bloodRequest.bloodCentre.districtCode]) {
      bankCoords = {
        lat: DISTRICT_CENTROIDS[bloodRequest.bloodCentre.districtCode].lat,
        lng: DISTRICT_CENTROIDS[bloodRequest.bloodCentre.districtCode].lng,
      };
    }

    if (!bankCoords) {
      console.warn('[AdminMatchingService] Cannot get directions: Blood Bank has no confirmed location or district centroid.');
      return null;
    }

    const donorProfile = await prisma.donorProfile.findUnique({
      where: { id: candidateDonorId },
      include: {
        user: {
          include: {
            donorLatestLocation: true,
          },
        },
      },
    });

    if (!donorProfile) {
      throw new Error('Donor candidate profile not found.');
    }

    let donorCoords: { lat: number; lng: number } | null = null;
    const loc = donorProfile.user?.donorLatestLocation;

    if (loc) {
      donorCoords = { lat: loc.latitude, lng: loc.longitude };
    } else if (donorProfile.districtCode && DISTRICT_CENTROIDS[donorProfile.districtCode]) {
      donorCoords = {
        lat: DISTRICT_CENTROIDS[donorProfile.districtCode].lat,
        lng: DISTRICT_CENTROIDS[donorProfile.districtCode].lng,
      };
    }

    if (!donorCoords) {
      console.warn('[AdminMatchingService] Cannot get directions: Donor candidate has no GPS location or district centroid.');
      return null;
    }

    return await DirectionsService.getDirections(donorCoords, bankCoords, profile);
  }
}
