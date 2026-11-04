import { prisma } from '../lib/prisma';
import { parseRequestMessageMetadata } from './hospitalIntegration';

export type MatchLevel = 'LEVEL_1_CENTRE' | 'LEVEL_2_DISTRICT' | 'LEVEL_3_EXPANDED';

export interface MatchedDonorDTO {
  donorId: string;
  displayName: string;
  bloodGroup: string;
  districtCode: number;
  locality?: string | null;
  matchLevel: MatchLevel;
  matchReason: string;
  responseStatus: string | null;
  invitationStatus: string | null;
  disclosureAuthorized: boolean;
  contactNumber: string | null; // Disclosed ONLY if response is ACCEPTED + authorized + consented
}

/**
 * Anonymize donor display name to protect privacy in discovery results
 * e.g. "Rahul Sharma" -> "Rahul S."
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
 * Find matching voluntary donors for an existing blood request
 * Enforces matching levels:
 * Level 1: Exact preferred centre
 * Level 2: Same district (only when expanded to DISTRICT_EXPANDED or OUT_OF_DISTRICT)
 * Level 3: Other districts (only when expanded to OUT_OF_DISTRICT)
 */
export async function findMatchingDonorsForRequest(
  requestId: string,
  requestedScope?: 'EXACT_CENTRE' | 'DISTRICT_EXPANDED' | 'OUT_OF_DISTRICT'
): Promise<{
  request: any;
  effectiveScope: string;
  donors: MatchedDonorDTO[];
  counts: { level1: number; level2: number; level3: number; total: number };
}> {
  const request = await prisma.bloodRequest.findUnique({
    where: { id: requestId },
    include: {
      bloodCentre: {
        select: {
          hospitalCode: true,
          hospitalName: true,
          districtCode: true,
          stateCode: true,
        },
      },
      recipientResponses: {
        include: {
          donor: {
            include: {
              user: {
                select: { phoneNumber: true },
              },
            },
          },
        },
      },
    },
  });

  if (!request) {
    throw new Error('Blood request not found');
  }

  const effectiveScope = requestedScope || request.searchScope || 'EXACT_CENTRE';

  // Find all active, available, searchable, consent-holding donors matching blood group
  const candidates = await prisma.donorProfile.findMany({
    where: {
      bloodGroup: request.bloodGroup,
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
            take: 1,
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
        },
      },
    },
  });

  // Map existing responses for fast lookup
  const responseMap = new Map(
    request.recipientResponses.map((r) => [r.donorId, r])
  );

  const centreDistrict = request.bloodCentre?.districtCode;
  const targetHospitalCode = request.hospitalCode;

  const matchedList: MatchedDonorDTO[] = [];
  let level1Count = 0;
  let level2Count = 0;
  let level3Count = 0;

  for (const candidate of candidates) {
    // Authoritative Eligibility Check (Phase 6.3 + Universal Ineligibility Gate):
    // 1. Clinical Screening Deferrals:
    const activeDeferral = candidate.user.clinicalScreenings?.[0];
    if (activeDeferral) {
      if (activeDeferral.eligibilityDecision === 'PERMANENT_DEFERRAL') {
        continue;
      }
      if (activeDeferral.deferredUntil && new Date(activeDeferral.deferredUntil) > new Date()) {
        continue;
      }
    }

    // 2. 90-day whole blood recovery interval:
    const latestDonationEventDate = candidate.user.donationEvents?.[0]?.performedAt;
    const refDonationDate =
      candidate.verifiedLastDonationDate ||
      latestDonationEventDate ||
      candidate.lastDonationDate;

    if (refDonationDate) {
      const daysSince = (Date.now() - new Date(refDonationDate).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 90) {
        // Within 90-day medical deferral window; excluded from matching candidate pool
        continue;
      }
    }

    // Check Level 1: Exact preferred centre
    const isPreferredCentre =
      Boolean(targetHospitalCode) &&
      (candidate.primaryHospitalCode === targetHospitalCode ||
        candidate.centrePreferences.some((p) => p.hospitalCode === targetHospitalCode));

    // Check Level 2: Same district
    const isSameDistrict =
      Boolean(centreDistrict) && candidate.districtCode === centreDistrict;

    let matchLevel: MatchLevel | null = null;
    let matchReason = '';

    if (isPreferredCentre) {
      matchLevel = 'LEVEL_1_CENTRE';
      matchReason = 'Preferred Blood Centre Match';
      level1Count++;
    } else if (isSameDistrict) {
      matchLevel = 'LEVEL_2_DISTRICT';
      matchReason = 'Same District Coordination';
      level2Count++;
    } else {
      matchLevel = 'LEVEL_3_EXPANDED';
      matchReason = 'Out of District Coordination';
      level3Count++;
    }

    // Filter by effective search scope
    let inScope = false;
    if (effectiveScope === 'EXACT_CENTRE') {
      inScope = matchLevel === 'LEVEL_1_CENTRE';
    } else if (effectiveScope === 'DISTRICT_EXPANDED') {
      inScope = matchLevel === 'LEVEL_1_CENTRE' || matchLevel === 'LEVEL_2_DISTRICT';
    } else if (effectiveScope === 'OUT_OF_DISTRICT') {
      inScope = true; // All levels included
    }

    if (!inScope) {
      continue;
    }

    const existingResponse = responseMap.get(candidate.id);
    const isAccepted = existingResponse?.status === 'ACCEPTED';
    const isAuthorized = existingResponse?.disclosureAuthorized === true;

    // Contact privacy: Disclose phone ONLY when ACCEPTED and disclosure authorized
    const disclosedPhone =
      isAccepted && isAuthorized && candidate.user?.phoneNumber
        ? candidate.user.phoneNumber
        : null;

    matchedList.push({
      donorId: candidate.id,
      displayName: sanitizeDonorName(candidate.fullName),
      bloodGroup: candidate.bloodGroup,
      districtCode: candidate.districtCode,
      locality: candidate.cityOrLocality || null,
      matchLevel,
      matchReason,
      responseStatus: existingResponse?.status || null,
      invitationStatus: existingResponse?.status || null,
      disclosureAuthorized: isAuthorized,
      contactNumber: disclosedPhone,
    });
  }

  // Sort: Level 1 first, then Level 2, then Level 3
  const levelOrder: Record<MatchLevel, number> = {
    LEVEL_1_CENTRE: 1,
    LEVEL_2_DISTRICT: 2,
    LEVEL_3_EXPANDED: 3,
  };

  matchedList.sort((a, b) => levelOrder[a.matchLevel] - levelOrder[b.matchLevel]);

  return {
    request: {
      id: request.id,
      patientName: request.patientName || null,
      bloodGroup: request.bloodGroup,
      component: request.component,
      unitsRequested: request.unitsRequested,
      status: request.status,
      closureOutcome: request.closureOutcome || null,
      reportedDonationStatus: request.reportedDonationStatus || null,
      hospitalCode: request.hospitalCode,
      hospitalName: request.bloodCentre?.hospitalName || null,
      districtCode: centreDistrict,
      searchScope: request.searchScope,
    },
    effectiveScope,
    donors: matchedList,
    counts: {
      level1: level1Count,
      level2: level2Count,
      level3: level3Count,
      total: matchedList.length,
    },
  };
}

/**
 * Find blood requests that a donor has received invitations for
 * Phase 3.1: Displays invitations specifically sent to that donor.
 */
export async function findEligibleRequestsForDonor(donorUserId: string) {
  const donor = await prisma.donorProfile.findUnique({
    where: { userId: donorUserId },
    include: {
      centrePreferences: true,
      receivedResponses: true,
    },
  });

  if (!donor || !donor.isAvailable || !donor.isSearchable || donor.consentWithdrawnAt) {
    return {
      eligible: false,
      reason: !donor
        ? 'Donor profile not registered'
        : donor.consentWithdrawnAt
        ? 'Search consent has been withdrawn'
        : 'Donor profile is marked unavailable or unsearchable',
      requests: [],
    };
  }

  // Phase 3.1: Invitations sent to this specific donor
  const requests = await prisma.bloodRequest.findMany({
    where: {
      recipientResponses: {
        some: { donorId: donor.id },
      },
    },
    include: {
      requester: {
        select: {
          id: true,
          name: true,
          phoneNumber: true,
        },
      },
      bloodCentre: {
        select: {
          hospitalCode: true,
          hospitalName: true,
          districtCode: true,
          address: true,
          mobileNo: true,
        },
      },
      recipientResponses: {
        where: { donorId: donor.id },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const matchingRequests: any[] = [];

  for (const req of requests) {
    const isPreferredCentre =
      Boolean(req.hospitalCode) &&
      (donor.primaryHospitalCode === req.hospitalCode ||
        donor.centrePreferences.some((p) => p.hospitalCode === req.hospitalCode));

    const isSameDistrict = Boolean(
      req.bloodCentre?.districtCode && donor.districtCode === req.bloodCentre.districtCode
    );

    const matchTier = isPreferredCentre
      ? 'Exact Preferred Centre'
      : isSameDistrict
      ? 'Same District'
      : 'Out of District Request';

    const myResponse = req.recipientResponses[0] || null;
    const isAccepted = myResponse?.status === 'ACCEPTED';
    const meta = parseRequestMessageMetadata(req.message, req.bloodCentre?.hospitalName);

    // Phase 4: Authorized requester contact only revealed after acceptance on active request
    const disclosedRequesterPhone =
      isAccepted && req.status !== 'CANCELLED' && req.status !== 'CLOSED'
        ? req.requester?.phoneNumber
        : null;

    const recommendedCentre = req.bloodCentre
      ? {
          hospitalCode: req.bloodCentre.hospitalCode,
          hospitalName: req.bloodCentre.hospitalName,
          address: req.bloodCentre.address,
          phone: req.bloodCentre.mobileNo && req.bloodCentre.mobileNo !== '0' ? req.bloodCentre.mobileNo : null,
          districtCode: req.bloodCentre.districtCode,
        }
      : meta.assignedBankName
      ? {
          hospitalCode: req.hospitalCode || 'ASSIGNED_BANK',
          hospitalName: meta.assignedBankName,
          address: 'Designated Participating Blood Centre',
          phone: null,
          districtCode: donor.districtCode,
        }
      : null;

    matchingRequests.push({
      id: req.id,
      requestReference: `#${req.id.slice(0, 8)}`,
      patientName: req.patientName || null,
      admittedHospitalName: meta.hospitalName || 'Designated Healthcare Facility',
      requesterName: isAccepted ? req.requester?.name : 'Authorized Requester',
      requesterPhone: disclosedRequesterPhone,
      bloodGroup: req.bloodGroup,
      component: req.component,
      unitsRequested: req.unitsRequested,
      requiredBy: req.requiredBy,
      hospitalName: recommendedCentre?.hospitalName || req.bloodCentre?.hospitalName || 'Designated Centre',
      hospitalAddress: recommendedCentre?.address || req.bloodCentre?.address || null,
      hospitalPhone: recommendedCentre?.phone || req.bloodCentre?.mobileNo || null,
      districtCode: req.bloodCentre?.districtCode || donor.districtCode,
      searchScope: req.searchScope,
      message: req.message,
      requestStatus: req.status,
      closureOutcome: req.closureOutcome || null,
      reportedDonationStatus: req.reportedDonationStatus || null,
      recommendedCentre,
      donationInstructions:
        'Please coordinate voluntary donation at the recommended accredited blood bank above. Under strict medical safety guidelines, never attempt to deliver blood directly to the patient or hospital ward.',
      createdAt: req.createdAt,
      matchTier,
      myResponse: myResponse
        ? {
            id: myResponse.id,
            status: myResponse.status,
            respondedAt: myResponse.respondedAt,
            disclosureAuthorized: myResponse.disclosureAuthorized,
          }
        : null,
    });
  }

  return {
    eligible: true,
    requests: matchingRequests,
  };
}
