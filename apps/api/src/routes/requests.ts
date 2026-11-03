import { Router, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { findMatchingDonorsForRequest, sanitizeDonorName } from '../services/matching';
import { notifyDonorNewMatch, notifyDonorRequestCancelled } from '../services/whatsapp';
import { RealtimeService } from '../services/realtime';
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
    const {
      patientName,
      bloodGroup,
      component,
      unitsRequested,
      requiredBy,
      hospitalCode,
      searchScope,
      message,
    } = req.body;

    const parsedGroup = parseBloodGroupEnum(bloodGroup);
    if (!parsedGroup) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Valid blood group (A+, A-, B+, B-, AB+, AB-, O+, O-) is required',
          code: 'INVALID_BLOOD_GROUP',
        },
      });
    }

    if (!component || typeof component !== 'string' || component.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Blood component type is required',
          code: 'INVALID_COMPONENT',
        },
      });
    }

    const units = parseInt(unitsRequested, 10);
    if (isNaN(units) || units < 1 || units > 50 || units !== Number(unitsRequested)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Requested quantity must be a positive integer between 1 and 50 units',
          code: 'INVALID_UNITS_REQUESTED',
        },
      });
    }

    let parsedRequiredBy: Date | null = null;
    if (requiredBy) {
      parsedRequiredBy = new Date(requiredBy);
      if (isNaN(parsedRequiredBy.getTime())) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'requiredBy must be a valid ISO date timestamp',
            code: 'INVALID_REQUIRED_BY_DATE',
          },
        });
      }
    }

    // Check centre if provided
    if (hospitalCode) {
      const centre = await prisma.bloodCentre.findUnique({
        where: { hospitalCode: String(hospitalCode).trim() },
        select: { hospitalCode: true },
      });
      if (!centre) {
        return res.status(400).json({
          success: false,
          error: {
            message: `Selected blood centre with code '${hospitalCode}' was not found`,
            code: 'CENTRE_NOT_FOUND',
          },
        });
      }
    }

    let parsedScope: SearchScope = 'EXACT_CENTRE';
    if (searchScope === 'DISTRICT_EXPANDED' || searchScope === 'OUT_OF_DISTRICT' || searchScope === 'EXACT_CENTRE') {
      parsedScope = searchScope;
    }

    const newRequest = await prisma.bloodRequest.create({
      data: {
        requesterId: req.user.id,
        patientName: patientName ? String(patientName).trim().slice(0, 100) : null,
        bloodGroup: parsedGroup,
        component: component.trim(),
        unitsRequested: units,
        requiredBy: parsedRequiredBy,
        hospitalCode: hospitalCode ? String(hospitalCode).trim() : null,
        searchScope: parsedScope,
        message: message ? String(message).slice(0, 500).trim() : null,
        status: 'OPEN',
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
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'CREATE_BLOOD_REQUEST',
        resource: 'BloodRequest',
        resourceId: newRequest.id,
        metadata: {
          patientName: newRequest.patientName,
          bloodGroup: parsedGroup,
          units,
          hospitalCode,
        },
      },
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      data: newRequest,
      message: 'Blood request submitted successfully. Inventory is not guaranteed; select voluntary donors to invite for coordination.',
    });
  } catch (error) {
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
      },
    });

    // Sanitize mobileNo in bloodCentre
    const sanitized = requests.map((r: any) => ({
      ...r,
      bloodCentre: r.bloodCentre
        ? {
            ...r.bloodCentre,
            mobileNo:
              r.bloodCentre.mobileNo && r.bloodCentre.mobileNo.trim() !== '0' && r.bloodCentre.mobileNo.trim().length >= 6
                ? r.bloodCentre.mobileNo.trim()
                : null,
          }
        : null,
    }));

    res.json({
      success: true,
      data: sanitized,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/blood-requests/:id
 * Retrieve a specific blood request with strict ownership check
 */
requestsRouter.get('/blood-requests/:id', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);

    const request = await prisma.bloodRequest.findUnique({
      where: { id },
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

    // Ownership enforcement
    if (request.requesterId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied. You can only view your own blood requests.',
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

    res.json({
      success: true,
      data: {
        ...request,
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

      if (request.requesterId !== req.user.id && req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          error: {
            message: 'Access denied. You can only invite donors to your own requests.',
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
 * Requester views matching voluntary donors across 3 priority levels
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
        select: { requesterId: true, status: true },
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

      // Ownership enforcement
      if (request.requesterId !== req.user.id && req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          error: {
            message: 'Access denied. You can only view matching donors for your own requests.',
            code: 'FORBIDDEN_ACCESS',
          },
        });
      }

      const matchResults = await findMatchingDonorsForRequest(id, requestedScope);

      res.json({
        success: true,
        data: matchResults,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PATCH /api/v1/blood-requests/:id/scope
 * Requester explicitly expands or adjusts search scope for coordination
 */
requestsRouter.patch(
  '/blood-requests/:id/scope',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const { searchScope } = req.body;

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

      // Ownership enforcement
      if (request.requesterId !== req.user.id && req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          error: {
            message: 'Access denied. You can only update your own requests.',
            code: 'FORBIDDEN_ACCESS',
          },
        });
      }

      if (request.status !== 'OPEN') {
        return res.status(400).json({
          success: false,
          error: {
            message: `Cannot change scope of request in '${request.status}' status.`,
            code: 'REQUEST_NOT_OPEN',
          },
        });
      }

      const updated = await prisma.bloodRequest.update({
        where: { id },
        data: {
          searchScope,
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: req.user.id,
          action: 'UPDATE_REQUEST_SCOPE',
          resource: 'BloodRequest',
          resourceId: id,
          metadata: {
            previousScope: request.searchScope,
            newScope: searchScope,
          },
        },
      });

      res.json({
        success: true,
        data: updated,
        message: `Search scope updated to ${searchScope}.`,
      });
    } catch (error) {
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

      // Ownership enforcement
      if (request.requesterId !== req.user.id && req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          error: {
            message: 'Access denied. You can only view responses for your own requests.',
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

