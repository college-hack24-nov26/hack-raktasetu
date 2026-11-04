import { Router, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { findMatchingDonorsForRequest, sanitizeDonorName } from '../services/matching';
import { notifyDonorNewMatch, notifyDonorRequestCancelled } from '../services/whatsapp';
import { RealtimeService } from '../services/realtime';
import { parseRequestMessageMetadata, HospitalIntegrationService } from '../services/hospitalIntegration';
import { BloodRequestCoordinationService } from '../services/bloodRequestCoordination';
import { AdminMatchingService } from '../services/adminMatchingService';
export type BloodGroup =
  | 'A_POS'
  | 'A_NEG'
  | 'B_POS'
  | 'B_NEG'
  | 'AB_POS'
  | 'AB_NEG'
  | 'O_POS'
  | 'O_NEG';

export type RequestStatus = 'OPEN' | 'CLOSED' | 'CANCELLED' | 'EXPIRED';
export type SearchScope = 'EXACT_CENTRE' | 'DISTRICT_EXPANDED' | 'OUT_OF_DISTRICT';

export const requestsRouter = Router();

// Helper to normalize blood group to Prisma enum
function parseBloodGroupEnum(input?: string): BloodGroup | null {
  if (!input) return null;
  const cleaned = input.trim().toUpperCase().replace('VE', '');

  if (cleaned === 'A+' || cleaned === 'A_POS') return 'A_POS';
  if (cleaned === 'A-' || cleaned === 'A_NEG') return 'A_NEG';
  if (cleaned === 'B+' || cleaned === 'B_POS') return 'B_POS';
  if (cleaned === 'B-' || cleaned === 'B_NEG') return 'B_NEG';
  if (cleaned === 'AB+' || cleaned === 'AB_POS') return 'AB_POS';
  if (cleaned === 'AB-' || cleaned === 'AB_NEG') return 'AB_NEG';
  if (cleaned === 'O+' || cleaned === 'O_POS') return 'O_POS';
  if (cleaned === 'O-' || cleaned === 'O_NEG') return 'O_NEG';

  return null;
}

/**
 * POST /api/v1/blood-requests
 * Authenticated patient/requester creates a new blood request
 */
requestsRouter.post('/blood-requests', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await BloodRequestCoordinationService.createCanonicalRequest(req.user.id, {
      patientName: req.body.patientName,
      bloodGroup: req.body.bloodGroup,
      component: req.body.component,
      unitsRequested: req.body.unitsRequested,
      requiredBy: req.body.requiredBy,
      hospitalCode: req.body.hospitalCode,
      admittedHospitalName: req.body.admittedHospitalName || req.body.hospitalName,
      receivingFacilityId: req.body.receivingFacilityId,
      urgency: req.body.urgency,
      searchScope: req.body.searchScope,
      message: req.body.message,
      requesterContact: req.body.requesterContact || req.user.phoneNumber,
      requesterConsent: req.body.requesterConsent,
    });

    return res.status(result.isDuplicateSuppressed ? 200 : 201).json({
      success: true,
      data: result,
      message: result.isDuplicateSuppressed
        ? 'Recent request submission recovered.'
        : 'Blood request submitted successfully.',
      isDuplicateSuppressed: result.isDuplicateSuppressed,
    });
  } catch (error: any) {
    if (
      error?.message &&
      (error.message.includes('required') ||
        error.message.includes('must be') ||
        error.message.includes('valid') ||
        error.message.includes('Invalid'))
    ) {
      return res.status(400).json({
        success: false,
        error: {
          message: error.message,
          code: 'VALIDATION_ERROR',
        },
      });
    }
    next(error);
  }
});

/**
 * GET /api/v1/blood-requests
 * Requester history: lists requests created by the authenticated user
 */
requestsRouter.get('/blood-requests', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const requests = await prisma.bloodRequest.findMany({
      where: {
        requesterId: req.user.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        bloodCentre: {
          select: {
            hospitalCode: true,
            hospitalName: true,
            address: true,
            mobileNo: true,
            districtCode: true,
          },
        },
        hospitalIssueOrders: {
          include: {
            issuingOrganisation: { select: { id: true, name: true, orgCode: true } },
            receivingFacility: { select: { id: true, name: true, orgCode: true } },
            items: true,
          },
        },
      },
    });

    const enriched = requests.map((r: any) => {
      const meta = parseRequestMessageMetadata(r.message, r.bloodCentre?.hospitalName);
      const validContact =
        r.bloodCentre?.mobileNo && r.bloodCentre.mobileNo.trim() !== '0' && r.bloodCentre.mobileNo.trim().length >= 6
          ? r.bloodCentre.mobileNo.trim()
          : null;

      let fulfillmentStage = r.closureOutcome || (r.status === 'CLOSED' ? 'FULFILLED' : r.status);
      const linkedOrder = r.hospitalIssueOrders?.[0];
      if (linkedOrder) {
        if (linkedOrder.status === 'RECEIVED') fulfillmentStage = 'FULFILLED';
        else if (linkedOrder.status === 'RECEIVED_WITH_DISCREPANCIES') fulfillmentStage = 'RECEIVED_WITH_DISCREPANCIES';
        else if (linkedOrder.status === 'DISPATCHED' || linkedOrder.status === 'PARTIALLY_RECEIVED') fulfillmentStage = 'DISPATCHED';
        else if (linkedOrder.status === 'AUTHORISED') fulfillmentStage = 'PREPARING';
      }

      return {
        ...r,
        requestReference: `#${r.id.slice(0, 8)}`,
        admittedHospitalName: meta.hospitalName || r.bloodCentre?.hospitalName || 'Local Medical Centre',
        receivingFacilityId: meta.receivingFacilityId || null,
        isHospitalVerified: !!meta.isHospitalVerified,
        urgency: meta.urgency || 'NORMAL',
        fulfillmentStatus: fulfillmentStage,
        canConfirmReceipt: fulfillmentStage === 'DISPATCHED' && !meta.patientAcknowledgedAt,
        allocatedUnitsCount: meta.allocatedUnitsCount || meta.reservedUnitIds?.length || 0,
        shortfallCount: meta.shortfallCount !== undefined ? meta.shortfallCount : Math.max(0, r.unitsRequested - (meta.reservedUnitIds?.length || 0)),
        isPartialAllocation: Boolean(meta.isPartialAllocation || ((meta.reservedUnitIds?.length || 0) > 0 && (meta.reservedUnitIds?.length || 0) < r.unitsRequested)),
        reservedUnitDetails: meta.reservedUnitDetails || null,
        transportDetails: meta.transportDetails || null,
        assignedBankId: meta.assignedBankId || null,
        assignedBankName: meta.assignedBankName || null,
        dispatchedAt: meta.dispatchedAt || null,
        patientAcknowledgedAt: meta.patientAcknowledgedAt || null,
        bloodCentre: r.bloodCentre
          ? {
              ...r.bloodCentre,
              mobileNo: validContact,
            }
          : null,
      };
    });

    res.json({
      success: true,
      data: enriched,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/admin/blood-requests
 * Platform Admin Operational Blood Request Monitoring endpoint.
 * Returns platform-wide requests with status filters, counts, routing breakdown, and activity history.
 */
requestsRouter.get('/admin/blood-requests', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied: Platform Administrator privileges required.' },
      });
    }

    const { status, urgency, bloodGroup, limit = '50' } = req.query;
    const maxLimit = Math.min(parseInt(String(limit), 10) || 50, 100);

    const where: any = {};
    if (status && String(status) !== 'ALL') {
      const s = String(status).toUpperCase();
      if (['OPEN', 'CLOSED', 'CANCELLED', 'EXPIRED'].includes(s)) {
        where.status = s;
      } else {
        where.closureOutcome = s;
      }
    }
    if (bloodGroup && String(bloodGroup) !== 'ALL') {
      const parsed = parseBloodGroupEnum(String(bloodGroup));
      if (parsed) where.bloodGroup = parsed;
    }

    const [requests, totalCount, submittedCount, acceptedCount, reservedCount, dispatchedCount, fulfilledCount, closedCount] = await Promise.all([
      prisma.bloodRequest.findMany({
        where,
        take: maxLimit,
        orderBy: { createdAt: 'desc' },
        include: {
          requester: { select: { id: true, name: true, phoneNumber: true } },
          bloodCentre: { select: { hospitalCode: true, hospitalName: true, address: true, mobileNo: true, districtCode: true } },
          hospitalIssueOrders: {
            include: {
              issuingOrganisation: { select: { id: true, name: true, orgCode: true } },
              receivingFacility: { select: { id: true, name: true, orgCode: true } },
              items: true,
            },
          },
        },
      }),
      prisma.bloodRequest.count(),
      prisma.bloodRequest.count({ where: { status: 'OPEN', OR: [{ closureOutcome: 'SUBMITTED' }, { closureOutcome: null }, { closureOutcome: 'OPEN' }] } }),
      prisma.bloodRequest.count({ where: { closureOutcome: 'ACCEPTED' } }),
      prisma.bloodRequest.count({ where: { closureOutcome: 'STOCK_RESERVED' } }),
      prisma.bloodRequest.count({ where: { closureOutcome: 'DISPATCHED' } }),
      prisma.bloodRequest.count({ where: { closureOutcome: 'FULFILLED' } }),
      prisma.bloodRequest.count({ where: { status: 'CLOSED' } }),
    ]);

    // Fetch related audit logs for the requests
    const requestIds = requests.map((r) => r.id);
    const auditLogs = requestIds.length > 0
      ? await prisma.auditLog.findMany({
          where: { resource: 'BloodRequest', resourceId: { in: requestIds } },
          orderBy: { createdAt: 'desc' },
          take: 200,
        })
      : [];

    const auditMap = new Map<string, any[]>();
    for (const log of auditLogs) {
      if (log.resourceId) {
        if (!auditMap.has(log.resourceId)) auditMap.set(log.resourceId, []);
        auditMap.get(log.resourceId)!.push({
          id: log.id,
          action: log.action,
          userId: log.userId,
          metadata: log.metadata,
          timestamp: log.createdAt.toISOString(),
        });
      }
    }

    const enriched = requests.map((r: any) => {
      const meta = parseRequestMessageMetadata(r.message, r.bloodCentre?.hospitalName);
      let fulfillmentStage = r.closureOutcome || (r.status === 'CLOSED' ? 'FULFILLED' : r.status);
      const linkedOrder = r.hospitalIssueOrders?.[0];
      if (linkedOrder) {
        if (linkedOrder.status === 'RECEIVED') fulfillmentStage = 'FULFILLED';
        else if (linkedOrder.status === 'DISPATCHED') fulfillmentStage = 'DISPATCHED';
        else if (linkedOrder.status === 'AUTHORISED') fulfillmentStage = 'PREPARING';
      }

      let routingType = 'DISTRICT_COORDINATION';
      if (meta.assignedBankId) {
        routingType = 'DIRECT_PARTICIPATING';
      } else if (r.hospitalCode && !meta.isExternalDirectory) {
        routingType = 'DIRECT_PARTICIPATING';
      } else if (meta.isExternalDirectory || r.bloodCentre) {
        routingType = 'EXTERNAL_DIRECTORY';
      }

      return {
        id: r.id,
        requestReference: `#${r.id.slice(0, 8)}`,
        patientName: r.patientName || 'Emergency Patient',
        requester: r.requester,
        bloodGroup: r.bloodGroup,
        component: r.component,
        unitsRequested: r.unitsRequested,
        requiredBy: r.requiredBy,
        urgency: meta.urgency || 'ROUTINE',
        status: r.status,
        fulfillmentStatus: fulfillmentStage,
        closureOutcome: r.closureOutcome,
        closureFeedback: r.closureFeedback,
        allocatedUnitsCount: meta.allocatedUnitsCount || meta.reservedUnitIds?.length || 0,
        shortfallCount: meta.shortfallCount !== undefined ? meta.shortfallCount : Math.max(0, r.unitsRequested - (meta.reservedUnitIds?.length || 0)),
        isPartialAllocation: Boolean(meta.isPartialAllocation || ((meta.reservedUnitIds?.length || 0) > 0 && (meta.reservedUnitIds?.length || 0) < r.unitsRequested)),
        reservedUnitDetails: meta.reservedUnitDetails || null,
        hospitalCode: r.hospitalCode,
        admittedHospitalName: meta.hospitalName || r.bloodCentre?.hospitalName || 'Local Medical Centre',
        isHospitalVerified: Boolean(meta.isHospitalVerified),
        receivingFacilityId: meta.receivingFacilityId || null,
        assignedBankId: meta.assignedBankId || null,
        assignedBankName: meta.assignedBankName || r.bloodCentre?.hospitalName || null,
        routingType,
        transportDetails: meta.transportDetails || null,
        patientAcknowledgedAt: meta.patientAcknowledgedAt || null,
        patientAcknowledgedBy: meta.patientAcknowledgedBy || null,
        receiptNotes: meta.receiptNotes || null,
        confirmedByRole: meta.confirmedByRole || null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        activityHistory: auditMap.get(r.id) || [],
      };
    });

    res.status(200).json({
      success: true,
      data: enriched,
      metrics: {
        total: totalCount,
        submitted: submittedCount,
        accepted: acceptedCount,
        reserved: reservedCount,
        dispatched: dispatchedCount,
        fulfilled: fulfilledCount,
        closed: closedCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/blood-requests/:id
 * Retrieve a specific blood request with authorized ownership check
 * Permitted for:
 * 1. The original requester
 * 2. Platform Admin
 * 3. Authorised staff of the designated blood bank
 * 4. Authorised staff of the admitted/receiving hospital
 */
requestsRouter.get('/blood-requests/:id', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);

    const request = await prisma.bloodRequest.findUnique({
      where: { id },
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
            address: true,
            mobileNo: true,
            districtCode: true,
          },
        },
        hospitalIssueOrders: {
          include: {
            issuingOrganisation: { select: { id: true, name: true, orgCode: true } },
            receivingFacility: { select: { id: true, name: true, orgCode: true } },
            items: {
              include: {
                componentUnit: {
                  select: {
                    id: true,
                    componentCode: true,
                    componentType: true,
                    bloodGroup: true,
                    status: true,
                  },
                },
              },
            },
            discrepancies: true,
          },
        },
      },
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Blood request not found',
          code: 'REQUEST_NOT_FOUND',
        },
      });
    }

    const meta = parseRequestMessageMetadata(request.message, request.bloodCentre?.hospitalName);

    // Ownership & Authorisation enforcement
    const isRequester = request.requesterId === req.user.id;
    const isPlatformAdmin = req.user.role === 'ADMIN';

    let isAuthorizedOrgMember = false;
    if (!isRequester && !isPlatformAdmin) {
      const userMemberships = await prisma.organisationMembership.findMany({
        where: { userId: req.user.id, isActive: true },
        include: { organisation: true },
      });

      const userOrgCodes = userMemberships.map((m) => m.organisation.orgCode);
      const userOrgIds = userMemberships.map((m) => m.organisation.id);
      const userHospitalCodes = userMemberships
        .map((m) => m.organisation.hospitalCode)
        .filter(Boolean) as string[];

      const targetCode = request.hospitalCode;
      if (
        (targetCode &&
          (userOrgCodes.includes(targetCode) ||
            userOrgIds.includes(targetCode) ||
            userHospitalCodes.includes(targetCode))) ||
        (meta.assignedBankId && userOrgIds.includes(meta.assignedBankId))
      ) {
        isAuthorizedOrgMember = true;
      } else if (meta.receivingFacilityId && userOrgIds.includes(meta.receivingFacilityId)) {
        isAuthorizedOrgMember = true;
      }
    }

    if (!isRequester && !isPlatformAdmin && !isAuthorizedOrgMember) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied. You can only view blood requests associated with your account or organisation.',
          code: 'FORBIDDEN_ACCESS',
        },
      });
    }

    const validContact =
      request.bloodCentre?.mobileNo &&
      request.bloodCentre.mobileNo.trim() !== '0' &&
      request.bloodCentre.mobileNo.trim().length >= 6
        ? request.bloodCentre.mobileNo.trim()
        : null;

    let fulfillmentStage = request.closureOutcome || (request.status === 'CLOSED' ? 'FULFILLED' : request.status);
    const linkedOrder = request.hospitalIssueOrders?.[0];
    if (linkedOrder) {
      if (linkedOrder.status === 'RECEIVED') fulfillmentStage = 'FULFILLED';
      else if (linkedOrder.status === 'RECEIVED_WITH_DISCREPANCIES') fulfillmentStage = 'RECEIVED_WITH_DISCREPANCIES';
      else if (linkedOrder.status === 'DISPATCHED' || linkedOrder.status === 'PARTIALLY_RECEIVED') fulfillmentStage = 'DISPATCHED';
      else if (linkedOrder.status === 'AUTHORISED') fulfillmentStage = 'PREPARING';
    }

    res.json({
      success: true,
      data: {
        ...request,
        requestReference: `#${request.id.slice(0, 8)}`,
        admittedHospitalName: meta.hospitalName || request.bloodCentre?.hospitalName || 'Local Medical Centre',
        receivingFacilityId: meta.receivingFacilityId || null,
        isHospitalVerified: !!meta.isHospitalVerified,
        urgency: meta.urgency || 'NORMAL',
        fulfillmentStatus: fulfillmentStage,
        canConfirmReceipt: fulfillmentStage === 'DISPATCHED' && !meta.patientAcknowledgedAt,
        allocatedUnitsCount: meta.allocatedUnitsCount || meta.reservedUnitIds?.length || 0,
        shortfallCount: meta.shortfallCount !== undefined ? meta.shortfallCount : Math.max(0, request.unitsRequested - (meta.reservedUnitIds?.length || 0)),
        isPartialAllocation: Boolean(meta.isPartialAllocation || ((meta.reservedUnitIds?.length || 0) > 0 && (meta.reservedUnitIds?.length || 0) < request.unitsRequested)),
        reservedUnitDetails: meta.reservedUnitDetails || null,
        transportDetails: meta.transportDetails || null,
        assignedBankId: meta.assignedBankId || null,
        assignedBankName: meta.assignedBankName || null,
        dispatchedAt: meta.dispatchedAt || null,
        patientAcknowledgedAt: meta.patientAcknowledgedAt || null,
        patientAcknowledgementNotes: meta.patientAcknowledgementNotes || null,
        matchingStatus: meta.matchingRequest?.status || null,
        donorCoordinationStatus: meta.matchingRequest
          ? meta.matchingRequest.status === 'RELEASED'
            ? 'DONOR_COORDINATION_ACTIVE'
            : 'COORDINATING_AVAILABILITY'
          : null,
        matchingRequest: isRequester && !isPlatformAdmin
          ? meta.matchingRequest
            ? {
                status: meta.matchingRequest.status,
                requestedAt: meta.matchingRequest.requestedAt,
                isCoordinating: true,
              }
            : null
          : meta.matchingRequest || null,
        bloodCentre: request.bloodCentre
          ? {
              ...request.bloodCentre,
              mobileNo: validContact,
            }
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/blood-requests/:id/invitations
 * Requester selects specific voluntary donors to send individual invitations
 */
requestsRouter.post(
  '/blood-requests/:id/invitations',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const { donorIds } = req.body;

      if (!Array.isArray(donorIds) || donorIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'donorIds must be a non-empty array of donor IDs.',
            code: 'INVALID_DONOR_IDS',
          },
        });
      }

      const request = await prisma.bloodRequest.findUnique({
        where: { id },
        include: {
          bloodCentre: {
            select: { hospitalName: true },
          },
        },
      });

      if (!request) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Blood request not found',
            code: 'REQUEST_NOT_FOUND',
          },
        });
      }

      // Phase 3 Hard Rule: Patients/requesters are strictly forbidden from directly sending donor invitations
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          error: {
            message: 'Direct donor invitation by patients is disabled. Donor matching and coordination are handled securely by the designated Blood Bank and System Administration.',
            code: 'FORBIDDEN_ACCESS',
          },
        });
      }

      if (request.status !== 'OPEN') {
        return res.status(400).json({
          success: false,
          error: {
            message: `Cannot send invitations for a request in '${request.status}' status. Requests must be OPEN.`,
            code: 'REQUEST_NOT_OPEN',
          },
        });
      }

      // Validate each donor: must be active, searchable, not self, and consent not withdrawn
      const donors = await prisma.donorProfile.findMany({
        where: {
          id: { in: donorIds.map(String) },
          isAvailable: true,
          isSearchable: true,
          consentWithdrawnAt: null,
          userId: { not: req.user.id },
          user: { status: 'ACTIVE' },
        },
        include: {
          user: { select: { id: true, phoneNumber: true } },
        },
      });

      const donorUserIds = donors.map((d) => d.userId);
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      const [recentDonations, deferredScreenings] = await Promise.all([
        prisma.donationEvent.findMany({
          where: {
            donorUserId: { in: donorUserIds },
            outcome: 'COMPLETED',
            performedAt: { gte: ninetyDaysAgo },
          },
          select: { donorUserId: true },
        }),
        prisma.clinicalScreening.findMany({
          where: {
            donorUserId: { in: donorUserIds },
            status: 'DEFERRED',
          },
          select: { donorUserId: true },
        }),
      ]);

      const recentDonorUserSet = new Set(recentDonations.map((d) => d.donorUserId));
      const deferredDonorUserSet = new Set(deferredScreenings.map((s) => s.donorUserId));

      const invitedDonors: any[] = [];
      const skippedDonors: string[] = [];

      for (const donor of donors) {
        // Enforce 90-day recovery interval & clinical screening deferral
        const hasRecentVerified = donor.verifiedLastDonationDate && donor.verifiedLastDonationDate >= ninetyDaysAgo;
        const hasRecentSelfReported = donor.lastDonationDate && donor.lastDonationDate >= ninetyDaysAgo;
        const hasRecentEvent = recentDonorUserSet.has(donor.userId);
        const hasActiveDeferral = deferredDonorUserSet.has(donor.userId);

        if (hasRecentVerified || hasRecentSelfReported || hasRecentEvent || hasActiveDeferral) {
          skippedDonors.push(donor.id);
          continue;
        }

        // Prevent duplicate active invitations
        const existing = await prisma.donorResponse.findUnique({
          where: {
            requestId_donorId: {
              requestId: id,
              donorId: donor.id,
            },
          },
        });

        if (existing && (existing.status === 'PENDING' || existing.status === 'ACCEPTED')) {
          skippedDonors.push(donor.id);
          continue;
        }

        const invitation = await prisma.donorResponse.upsert({
          where: {
            requestId_donorId: {
              requestId: id,
              donorId: donor.id,
            },
          },
          create: {
            requestId: id,
            donorId: donor.id,
            status: 'PENDING',
          },
          update: {
            status: 'PENDING',
            respondedAt: null,
            disclosureAuthorized: false,
            contactDisclosedAt: null,
          },
        });

        invitedDonors.push({
          invitationId: invitation.id,
          donorId: donor.id,
          status: 'PENDING',
        });

        // Non-blocking WhatsApp invitation alert if phone is present
        if (donor.user?.phoneNumber) {
          notifyDonorNewMatch({
            recipientPhone: donor.user.phoneNumber,
            donorUserId: donor.userId,
            donorName: donor.fullName || 'Voluntary Donor',
            bloodGroup: request.bloodGroup,
            hospitalName: request.bloodCentre?.hospitalName || 'Designated Centre',
            requestId: request.id,
          }).catch(() => {});
        }
      }

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'SEND_DONOR_INVITATIONS',
          resource: 'BloodRequest',
          resourceId: id,
          metadata: {
            invitedCount: invitedDonors.length,
            skippedCount: skippedDonors.length,
            donorIds,
          },
        },
      }).catch(() => {});

      return res.status(200).json({
        success: true,
        data: {
          invitedCount: invitedDonors.length,
          skippedCount: skippedDonors.length,
          invitations: invitedDonors,
        },
        message: `Successfully sent invitations to ${invitedDonors.length} voluntary donor(s).`,
      });
    } catch (error) {
      next(error);
    }
  }
);

const VALID_CLOSURE_OUTCOMES = [
  'DONATION_COMPLETED',
  'ARRANGED_ELSEWHERE',
  'NO_LONGER_NEEDED',
  'DONOR_UNAVAILABLE',
  'OTHER',
];

/**
 * POST /api/v1/blood-requests/:id/close
 * Patient/Requester closes or cancels request with structured outcome feedback
 */
requestsRouter.post(
  '/blood-requests/:id/close',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const { outcome, feedback, reportedDonorId } = req.body;

      if (!outcome || !VALID_CLOSURE_OUTCOMES.includes(outcome)) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Valid outcome is required. Must be one of: ${VALID_CLOSURE_OUTCOMES.join(', ')}`,
            code: 'INVALID_CLOSURE_OUTCOME',
          },
        });
      }

      if (outcome === 'DONATION_COMPLETED' && !reportedDonorId) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'reportedDonorId is required when reporting a completed donation.',
            code: 'MISSING_REPORTED_DONOR_ID',
          },
        });
      }

      const request = await prisma.bloodRequest.findUnique({
        where: { id },
        include: {
          bloodCentre: true,
          recipientResponses: true,
        },
      });

      if (!request) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Blood request not found',
            code: 'REQUEST_NOT_FOUND',
          },
        });
      }

      if (request.requesterId !== req.user.id && req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          error: {
            message: 'Access denied. You can only close your own blood requests.',
            code: 'FORBIDDEN_ACCESS',
          },
        });
      }

      if (request.status !== 'OPEN') {
        return res.status(400).json({
          success: false,
          error: {
            message: `Cannot close request in '${request.status}' status. Only OPEN requests can be closed.`,
            code: 'INVALID_STATUS_TRANSITION',
          },
        });
      }

      // If donation completed was reported, verify donor profile exists
      if (outcome === 'DONATION_COMPLETED' && reportedDonorId) {
        const donorExists = await prisma.donorProfile.findUnique({
          where: { id: String(reportedDonorId) },
        });
        if (!donorExists) {
          return res.status(400).json({
            success: false,
            error: {
              message: 'Reported donor does not exist.',
              code: 'DONOR_NOT_FOUND',
            },
          });
        }
      }

      const isCancelledStatus = outcome === 'NO_LONGER_NEEDED' || outcome === 'DONOR_UNAVAILABLE' || outcome === 'OTHER';
      const newStatus = isCancelledStatus ? 'CANCELLED' : 'CLOSED';

      const updated = await prisma.$transaction(
        async (tx: any) => {
          const reqUpdated = await tx.bloodRequest.update({
            where: { id },
            data: {
              status: newStatus,
              closedAt: new Date(),
              closureOutcome: outcome,
              closureFeedback: feedback ? String(feedback).trim().slice(0, 500) : null,
              closureReportedBy: req.user.id,
              reportedDonationStatus: outcome === 'DONATION_COMPLETED' ? 'REPORTED_UNVERIFIED' : null,
              reportedDonorId: outcome === 'DONATION_COMPLETED' ? String(reportedDonorId) : null,
            },
            include: {
              bloodCentre: {
                select: {
                  hospitalCode: true,
                  hospitalName: true,
                  address: true,
                  mobileNo: true,
                },
              },
            },
          });

          // Cascade: Cancel pending invitations so donors cannot accept a closed request
          await tx.donorResponse.updateMany({
            where: {
              requestId: id,
              status: 'PENDING',
            },
            data: {
              status: 'CANCELLED',
            },
          });

          // Audit log
          await tx.auditLog.create({
            data: {
              userId: req.user.id,
              action: 'CLOSE_BLOOD_REQUEST',
              resource: 'BloodRequest',
              resourceId: id,
              metadata: {
                outcome,
                feedback,
                reportedDonorId,
                status: newStatus,
                reportedDonationStatus: outcome === 'DONATION_COMPLETED' ? 'REPORTED_UNVERIFIED' : null,
              },
            },
          });

          // Real-time notification for requester
          await RealtimeService.publishOutboxEvent(tx, {
            eventType: 'blood_request.status_changed',
            recipientUserId: request.requesterId,
            entityType: 'BloodRequest',
            entityId: id,
            payload: {
              requestId: id,
              previousStatus: request.status,
              newStatus,
              closureOutcome: outcome,
              closedAt: reqUpdated.closedAt,
            },
          });

          // Real-time notification for all associated responding donors
          const activeResponses = await tx.donorResponse.findMany({
            where: { requestId: id },
            include: { donor: { select: { userId: true } } },
          });

          for (const resp of activeResponses) {
            if (resp.donor?.userId && resp.donor.userId !== request.requesterId) {
              await RealtimeService.publishOutboxEvent(tx, {
                eventType: 'blood_request.status_changed',
                recipientUserId: resp.donor.userId,
                entityType: 'BloodRequest',
                entityId: id,
                payload: {
                  requestId: id,
                  previousStatus: request.status,
                  newStatus,
                  closureOutcome: outcome,
                  closedAt: reqUpdated.closedAt,
                },
              });
            }
          }

          return reqUpdated;
        },
        { maxWait: 10000, timeout: 20000 }
      );

      // Asynchronously notify accepted donors of closure
      (async () => {
        try {
          const acceptedResponses = await prisma.donorResponse.findMany({
            where: {
              requestId: id,
              status: 'ACCEPTED',
            },
            include: {
              donor: {
                include: {
                  user: { select: { id: true, phoneNumber: true } },
                },
              },
            },
          });

          const hospitalName = updated.bloodCentre?.hospitalName || 'Blood Centre';
          for (const resp of acceptedResponses) {
            if (resp.donor?.user?.phoneNumber) {
              await notifyDonorRequestCancelled({
                recipientPhone: resp.donor.user.phoneNumber,
                donorUserId: resp.donor.userId,
                bloodGroup: request.bloodGroup,
                hospitalName,
                requestId: id,
              }).catch(() => {});
            }
          }
        } catch {
          // Fail silently
        }
      })();

      res.json({
        success: true,
        data: updated,
        message:
          outcome === 'DONATION_COMPLETED'
            ? 'Request closed. Thank you! Donation has been recorded as reported (unverified pending blood bank verification).'
            : 'Request has been closed successfully.',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/blood-requests/:id/cancel
 * Backwards compatibility route for cancellation
 */
requestsRouter.post('/blood-requests/:id/cancel', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const request = await prisma.bloodRequest.findUnique({
      where: { id },
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        error: { message: 'Blood request not found', code: 'REQUEST_NOT_FOUND' },
      });
    }

    if (request.requesterId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied.', code: 'FORBIDDEN_ACCESS' },
      });
    }

    if (request.status !== 'OPEN') {
      return res.status(400).json({
        success: false,
        error: { message: `Cannot cancel request in '${request.status}' status.`, code: 'INVALID_STATUS' },
      });
    }

    const updated = await prisma.$transaction(async (tx: any) => {
      const r = await tx.bloodRequest.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          closedAt: new Date(),
          closureOutcome: 'NO_LONGER_NEEDED',
          closureReportedBy: req.user.id,
        },
      });
      await tx.donorResponse.updateMany({
        where: { requestId: id, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });

      // Real-time notification for requester
      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'blood_request.status_changed',
        recipientUserId: request.requesterId,
        entityType: 'BloodRequest',
        entityId: id,
        payload: {
          requestId: id,
          previousStatus: request.status,
          newStatus: 'CANCELLED',
          closureOutcome: 'NO_LONGER_NEEDED',
          closedAt: r.closedAt,
        },
      });

      return r;
    });

    res.json({
      success: true,
      data: updated,
      message: 'Blood request has been cancelled.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/blood-requests/:id/verify-donation
 * Verification of reported donation by authorized personnel
 * Updates donor's verifiedLastDonationDate, enforcing subsequent 90-day medical deferral
 */
requestsRouter.post(
  '/blood-requests/:id/verify-donation',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);

      const request = await prisma.bloodRequest.findUnique({
        where: { id },
      });

      if (!request) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Blood request not found',
            code: 'REQUEST_NOT_FOUND',
          },
        });
      }

      if (request.reportedDonationStatus !== 'REPORTED_UNVERIFIED' || !request.reportedDonorId) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'No reported donation is awaiting verification for this request.',
            code: 'NO_DONATION_REPORTED',
          },
        });
      }

      const verifiedAt = new Date();
      const verifierName = req.user.name || 'Blood Centre Personnel';

      const result = await prisma.$transaction(
        async (tx: any) => {
          // 1. Update blood request verification fields
          const updatedReq = await tx.bloodRequest.update({
            where: { id },
            data: {
              reportedDonationStatus: 'DONATION_VERIFIED',
              donationVerifiedAt: verifiedAt,
              verifiedBy: verifierName,
            },
          });

          // 2. Update donor profile's verifiedLastDonationDate
          // This enforces the 90-day medical deferral window in matching logic
          await tx.donorProfile.update({
            where: { id: request.reportedDonorId },
            data: {
              verifiedLastDonationDate: verifiedAt,
              lastDonationDate: verifiedAt,
            },
          });

          // 3. Audit log
          await tx.auditLog.create({
            data: {
              userId: req.user.id,
              action: 'VERIFY_DONATION',
              resource: 'BloodRequest',
              resourceId: id,
              metadata: {
                donorId: request.reportedDonorId,
                verifiedBy: verifierName,
                verifiedAt,
              },
            },
          });

          return updatedReq;
        },
        { maxWait: 10000, timeout: 20000 }
      );

      res.json({
        success: true,
        data: result,
        message: 'Donation has been verified by blood centre personnel. Donor verified donation history updated.',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/blood-requests/:id/matching-donors
 * Phase 3: Protected donor matching view.
 * HARD RULES:
 * 1. Patients / requesters are strictly forbidden from viewing candidate lists (403 Forbidden).
 * 2. Only designated Blood Bank staff (after candidate release) or Platform Admins can view candidates.
 * 3. Other blood banks receive 403 Forbidden.
 */
requestsRouter.get(
  '/blood-requests/:id/matching-donors',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const requestedScope = req.query.scope as any;

      const request = await prisma.bloodRequest.findUnique({
        where: { id },
        include: {
          bloodCentre: true,
        },
      });

      if (!request) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Blood request not found',
            code: 'REQUEST_NOT_FOUND',
          },
        });
      }

      // Hard Rule 1: Patients and requesters are NEVER permitted to directly search donors or see candidate lists
      if (request.requesterId === req.user.id && req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          error: {
            message: 'Patients and requesters are not permitted to directly search or view donor candidate lists. Fulfilment and matching are coordinated directly by the Blood Bank.',
            code: 'FORBIDDEN_ACCESS',
          },
        });
      }

      const meta = parseRequestMessageMetadata(request.message, request.bloodCentre?.hospitalName);

      // Hard Rule 2: If caller is not Platform Admin, verify they belong to the designated Blood Bank
      if (req.user.role !== 'ADMIN') {
        const userMemberships = await prisma.organisationMembership.findMany({
          where: { userId: req.user.id, isActive: true },
          include: { organisation: true },
        });

        const userOrgIds = userMemberships.map((m) => m.organisation.id);
        const userHospitalCodes = userMemberships
          .map((m) => m.organisation.hospitalCode)
          .filter(Boolean) as string[];
        const userOrgCodes = userMemberships.map((m) => m.organisation.orgCode);

        const isDesignatedBank =
          (meta.assignedBankId && userOrgIds.includes(meta.assignedBankId)) ||
          (request.hospitalCode &&
            (userOrgCodes.includes(request.hospitalCode) ||
              userOrgIds.includes(request.hospitalCode) ||
              userHospitalCodes.includes(request.hospitalCode)));

        if (!isDesignatedBank) {
          return res.status(403).json({
            success: false,
            error: {
              message: 'Access denied. Only the designated Blood Bank handling this request can access candidate information.',
              code: 'FORBIDDEN_ACCESS',
            },
          });
        }

        // Blood Bank view: only allowed if candidates have been released by Admin
        const mr = meta.matchingRequest;
        if (!mr || mr.status !== 'RELEASED') {
          return res.json({
            success: true,
            data: {
              status: mr?.status || 'NOT_REQUESTED',
              isReleased: false,
              candidates: [],
              message: mr
                ? `Candidates have not yet been released by System Administration. Current status: ${mr.status}.`
                : 'Donor matching has not been requested for this request.',
            },
          });
        }

        const orgId = meta.assignedBankId || userOrgIds[0];
        const releasedData = await AdminMatchingService.getReleasedCandidatesForBloodBank(
          req.user.id,
          req.user.role,
          orgId,
          id
        );

        return res.json({
          success: true,
          data: releasedData,
        });
      }

      // Platform Admin: full deterministic ranking search
      const matchResults = await AdminMatchingService.runMatchingSearch(
        req.user.id,
        id,
        requestedScope
      );

      res.json({
        success: true,
        data: matchResults,
      });
    } catch (error: any) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          error: { message: error.message, code: error.code || 'MATCHING_ERROR' },
        });
      }
      next(error);
    }
  }
);

/**
 * PATCH /api/v1/blood-requests/:id/scope
 * Phase 3: Only System Admin can adjust or expand search scope.
 */
requestsRouter.patch(
  '/blood-requests/:id/scope',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const { searchScope, expansionReason } = req.body;

      // Hard Rule: Only Platform Admin can modify search scope
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          error: {
            message: 'Access denied. Search scope can only be modified by System Administration.',
            code: 'FORBIDDEN_ACCESS',
          },
        });
      }

      const validScopes = ['EXACT_CENTRE', 'DISTRICT_EXPANDED', 'OUT_OF_DISTRICT'];
      if (!searchScope || !validScopes.includes(searchScope)) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Invalid searchScope. Must be EXACT_CENTRE, DISTRICT_EXPANDED, or OUT_OF_DISTRICT.',
            code: 'INVALID_SCOPE',
          },
        });
      }

      const request = await prisma.bloodRequest.findUnique({
        where: { id },
      });

      if (!request) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Blood request not found',
            code: 'REQUEST_NOT_FOUND',
          },
        });
      }

      if (['CLOSED', 'CANCELLED', 'EXPIRED'].includes(request.status)) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Cannot change scope of request in '${request.status}' status.`,
            code: 'INVALID_STATUS',
          },
        });
      }

      const result = await AdminMatchingService.runMatchingSearch(
        req.user.id,
        id,
        searchScope,
        expansionReason
      );

      res.json({
        success: true,
        data: result,
        message: `Search scope updated to ${searchScope} and candidate pool refreshed.`,
      });
    } catch (error: any) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          error: { message: error.message, code: error.code || 'SCOPE_UPDATE_ERROR' },
        });
      }
      next(error);
    }
  }
);

/**
 * GET /api/v1/blood-requests/:id/responses
 * Requester views private donor responses and unlocked contacts
 */
requestsRouter.get(
  '/blood-requests/:id/responses',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);

      const request = await prisma.bloodRequest.findUnique({
        where: { id },
        include: {
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
        return res.status(404).json({
          success: false,
          error: {
            message: 'Blood request not found',
            code: 'REQUEST_NOT_FOUND',
          },
        });
      }

      // Ownership and Role enforcement: Patients/requesters are strictly forbidden from viewing candidate identities or contacts
      if (req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          error: {
            message: 'Direct access to donor candidate contact details by patients is disabled to protect voluntary donor privacy and ensure clinical coordination through accredited Blood Banks.',
            code: 'FORBIDDEN_ACCESS',
          },
        });
      }

      const responses = request.recipientResponses.map((r) => {
        const isAccepted = r.status === 'ACCEPTED';
        const isDisclosed = r.disclosureAuthorized && r.donor.consentWithdrawnAt === null;

        return {
          id: r.id,
          requestId: r.requestId,
          donorId: r.donorId,
          donorName: sanitizeDonorName(r.donor.fullName),
          bloodGroup: r.donor.bloodGroup,
          districtCode: r.donor.districtCode,
          locality: r.donor.cityOrLocality || null,
          status: r.status,
          respondedAt: r.respondedAt,
          disclosureAuthorized: r.disclosureAuthorized,
          contactDisclosedAt: r.contactDisclosedAt,
          contactNumber: isAccepted && isDisclosed ? r.donor.user.phoneNumber : null,
        };
      });

      res.json({
        success: true,
        data: responses,
      });
    } catch (error) {
      next(error);
    }
  }
);

