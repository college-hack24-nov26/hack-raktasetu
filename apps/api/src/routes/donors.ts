
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { revokeAllUserSessions } from '../services/auth';
import { findEligibleRequestsForDonor, sanitizeDonorName } from '../services/matching';
import { notifyRequesterDonorAccepted } from '../services/whatsapp';
import { RealtimeService } from '../services/realtime';
import { parseRequestMessageMetadata } from '../services/hospitalIntegration';

export const donorsRouter = Router();

const VALID_BLOOD_GROUPS = [
  'A_POS',
  'A_NEG',
  'B_POS',
  'B_NEG',
  'AB_POS',
  'AB_NEG',
  'O_POS',
  'O_NEG',
];

/**
 * Calculates age from Date of Birth
 */
function calculateAge(dob: Date): number {
  const diffMs = Date.now() - dob.getTime();
  const ageDt = new Date(diffMs);
  return Math.abs(ageDt.getUTCFullYear() - 1970);
}

/**
 * POST /api/v1/donors
 * Register donor profile for the authenticated user
 */
donorsRouter.post('/donors', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user.id;
    const {
      fullName,
      dateOfBirth,
      bloodGroup,
      districtCode,
      stateCode = 27,
      primaryHospitalCode,
      secondaryHospitalCodes = [],
      lastDonationDate,
      isAvailable = true,
      consentToSearch = false,
      consentVersion = 'v1.0',
    } = req.body;

    // Validate full name
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Full name is required and must be at least 2 characters.',
          code: 'INVALID_NAME',
        },
      });
    }

    // Validate blood group
    if (!VALID_BLOOD_GROUPS.includes(bloodGroup)) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Invalid blood group '${bloodGroup}'. Must be one of: ${VALID_BLOOD_GROUPS.join(', ')}`,
          code: 'INVALID_BLOOD_GROUP',
        },
      });
    }

    // Validate Date of Birth and age limits (18 - 65 standard blood donor age eligibility)
    if (!dateOfBirth) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Date of birth is required for donor registration.',
          code: 'MISSING_DOB',
        },
      });
    }

    const parsedDob = new Date(dateOfBirth);
    if (isNaN(parsedDob.getTime())) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid date of birth format. Must be an ISO date string.',
          code: 'INVALID_DOB',
        },
      });
    }

    if (parsedDob > new Date()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Date of birth cannot be in the future.',
          code: 'FUTURE_DOB',
        },
      });
    }

    const age = calculateAge(parsedDob);
    if (age < 18 || age > 65) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Standard voluntary blood donation policy requires donors to be between 18 and 65 years old. Age provided: ${age}.`,
          code: 'AGE_INELIGIBLE',
        },
      });
    }

    // Check duplicate profile
    const existing = await prisma.donorProfile.findUnique({
      where: { userId },
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: {
          message: 'A donor profile already exists for this account. Use PUT /api/v1/donors/me to update.',
          code: 'PROFILE_ALREADY_EXISTS',
        },
      });
    }

    // Validate location & primary centre
    if (!districtCode || typeof districtCode !== 'number') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Valid numeric districtCode is required.',
          code: 'MISSING_DISTRICT',
        },
      });
    }

    if (!primaryHospitalCode || typeof primaryHospitalCode !== 'string') {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Primary preferred blood centre (primaryHospitalCode) is required.',
          code: 'MISSING_PRIMARY_CENTRE',
        },
      });
    }

    // Optional last donation date check
    let parsedLastDonationDate: Date | null = null;
    if (lastDonationDate) {
      parsedLastDonationDate = new Date(lastDonationDate);
      if (isNaN(parsedLastDonationDate.getTime())) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Invalid lastDonationDate format.',
            code: 'INVALID_LAST_DONATION_DATE',
          },
        });
      }
      if (parsedLastDonationDate > new Date()) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Last donation date cannot be in the future.',
            code: 'FUTURE_LAST_DONATION_DATE',
          },
        });
      }
    }

    // Ensure blood centre records exist in DB so foreign key passes
    const centresToVerify = Array.from(
      new Set([primaryHospitalCode, ...secondaryHospitalCodes])
    ) as string[];

    for (const code of centresToVerify) {
      await prisma.bloodCentre.upsert({
        where: { hospitalCode: code },
        update: {},
        create: {
          hospitalCode: code,
          hospitalName: `Blood Centre (${code})`,
          stateCode,
          districtCode,
        },
      });
    }

    // Atomic transaction for profile and preferences
    const result = await prisma.$transaction(async (tx: any) => {
      // 1. Create donor profile
      const donor = await tx.donorProfile.create({
        data: {
          userId,
          fullName: fullName.trim(),
          dateOfBirth: parsedDob,
          bloodGroup,
          stateCode,
          districtCode,
          primaryHospitalCode,
          lastDonationDate: parsedLastDonationDate,
          isAvailable: Boolean(isAvailable),
          isSearchable: Boolean(consentToSearch), // Explicit opt-in required
          consentVersion,
          consentGrantedAt: consentToSearch ? new Date() : null,
        },
      });

      // 2. Create primary centre preference
      await tx.donorCentrePreference.create({
        data: {
          donorId: donor.id,
          hospitalCode: primaryHospitalCode,
          isPrimary: true,
        },
      });

      // 3. Create secondary centre preferences
      const uniqueSecondary = secondaryHospitalCodes.filter(
        (code: string) => code !== primaryHospitalCode
      );
      for (const secCode of uniqueSecondary) {
        await tx.donorCentrePreference.create({
          data: {
            donorId: donor.id,
            hospitalCode: secCode,
            isPrimary: false,
          },
        });
      }

      // 4. Update user role & name
      await tx.user.update({
        where: { id: userId },
        data: {
          role: 'DONOR',
          name: fullName.trim(),
        },
      });

      // 5. Audit log
      await tx.auditLog.create({
        data: {
          userId,
          action: 'DONOR_PROFILE_REGISTERED',
          resource: 'DonorProfile',
          resourceId: donor.id,
          metadata: {
            isSearchable: Boolean(consentToSearch),
            consentVersion,
            primaryHospitalCode,
          },
        },
      });

      return donor;
    }, { maxWait: 10000, timeout: 20000 });

    const fullProfile = await prisma.donorProfile.findUnique({
      where: { id: result.id },
      include: {
        primaryCentre: true,
        centrePreferences: {
          include: { bloodCentre: true },
        },
      },
    });

    res.status(201).json({
      success: true,
      data: fullProfile,
      notice:
        'Donor registered successfully. Discoverability is controlled by your search consent and availability toggles.',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/donors/me
 * Get current authenticated user's donor profile
 */
donorsRouter.get('/donors/me', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user.id;

    const profile = await prisma.donorProfile.findUnique({
      where: { userId },
      include: {
        primaryCentre: true,
        centrePreferences: {
          include: { bloodCentre: true },
        },
      },
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'No donor profile found for this user.',
          code: 'DONOR_PROFILE_NOT_FOUND',
        },
      });
    }

    // Fetch authoritative completed donations and clinical screenings
    const [completedDonationsCount, latestDonation, activeDeferral] = await Promise.all([
      prisma.donationEvent.count({
        where: { donorUserId: userId, outcome: 'COMPLETED' },
      }),
      prisma.donationEvent.findFirst({
        where: { donorUserId: userId, outcome: 'COMPLETED' },
        orderBy: { performedAt: 'desc' },
      }),
      prisma.clinicalScreening.findFirst({
        where: { donorUserId: userId, status: 'DEFERRED' },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Calculate authoritative donor eligibility status
    const verifiedDate = [
      latestDonation?.performedAt,
      profile.verifiedLastDonationDate,
      profile.lastDonationDate,
    ]
      .filter(Boolean)
      .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0] || null;

    let eligibility = {
      isEligible: true,
      status: 'ELIGIBLE' as 'ELIGIBLE' | 'TEMPORARILY_INELIGIBLE' | 'REVIEW_REQUIRED',
      nextEligibleDate: null as string | null,
      daysRemaining: 0,
      lastDonationDate: verifiedDate ? new Date(verifiedDate).toISOString() : null,
      policy: '90_DAY_WHOLE_BLOOD_INTERVAL',
    };

    if (activeDeferral) {
      eligibility = {
        isEligible: false,
        status: 'TEMPORARILY_INELIGIBLE',
        nextEligibleDate: null,
        daysRemaining: 90,
        lastDonationDate: verifiedDate ? new Date(verifiedDate).toISOString() : null,
        policy: 'CLINICAL_DEFERRAL',
      };
    } else if (verifiedDate) {
      const msSince = Date.now() - new Date(verifiedDate).getTime();
      const daysSince = Math.floor(msSince / (1000 * 60 * 60 * 24));
      const requiredWaitDays = 90;

      if (daysSince < requiredWaitDays) {
        const nextEligible = new Date(new Date(verifiedDate).getTime() + requiredWaitDays * 24 * 60 * 60 * 1000);
        eligibility = {
          isEligible: false,
          status: 'TEMPORARILY_INELIGIBLE',
          nextEligibleDate: nextEligible.toISOString(),
          daysRemaining: requiredWaitDays - daysSince,
          lastDonationDate: new Date(verifiedDate).toISOString(),
          policy: '90_DAY_WHOLE_BLOOD_INTERVAL',
        };
      }
    }

    const isEffectiveAvailable = profile.isAvailable && eligibility.isEligible;

    res.json({
      success: true,
      data: {
        ...profile,
        donationCount: completedDonationsCount,
        latestDonationDate: latestDonation?.performedAt ? latestDonation.performedAt.toISOString() : (verifiedDate ? new Date(verifiedDate).toISOString() : null),
        isEffectiveAvailable,
        eligibility,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/donors/me
 * Update availability, search participation, or preferred centres
 */
donorsRouter.put('/donors/me', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user.id;
    const { isAvailable, isSearchable, primaryHospitalCode, secondaryHospitalCodes } = req.body;

    const existing = await prisma.donorProfile.findUnique({
      where: { userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Donor profile does not exist.',
          code: 'DONOR_NOT_FOUND',
        },
      });
    }

    const updated = await prisma.$transaction(async (tx: any) => {
      const updateData: any = {};

      if (typeof isAvailable === 'boolean') {
        updateData.isAvailable = isAvailable;
      }

      if (typeof isSearchable === 'boolean') {
        updateData.isSearchable = isSearchable;
        if (isSearchable && !existing.consentGrantedAt) {
          updateData.consentGrantedAt = new Date();
          updateData.consentWithdrawnAt = null;
        } else if (!isSearchable) {
          updateData.consentWithdrawnAt = new Date();
        }
      }

      if (primaryHospitalCode && typeof primaryHospitalCode === 'string') {
        updateData.primaryHospitalCode = primaryHospitalCode;
      }

      const profile = await tx.donorProfile.update({
        where: { id: existing.id },
        data: updateData,
      });

      // Update centre preferences if provided
      if (primaryHospitalCode || secondaryHospitalCodes) {
        const prim = primaryHospitalCode || existing.primaryHospitalCode;
        if (prim) {
          await tx.donorCentrePreference.deleteMany({
            where: { donorId: existing.id },
          });

          await tx.donorCentrePreference.create({
            data: {
              donorId: existing.id,
              hospitalCode: prim,
              isPrimary: true,
            },
          });

          const secList = (secondaryHospitalCodes || []).filter((c: string) => c !== prim);
          for (const s of secList) {
            await tx.donorCentrePreference.create({
              data: {
                donorId: existing.id,
                hospitalCode: s,
                isPrimary: false,
              },
            });
          }
        }
      }

      await tx.auditLog.create({
        data: {
          userId,
          action: 'DONOR_PROFILE_UPDATED',
          resource: 'DonorProfile',
          resourceId: existing.id,
          metadata: updateData,
        },
      });

      return profile;
    }, { maxWait: 10000, timeout: 20000 });

    const fullProfile = await prisma.donorProfile.findUnique({
      where: { id: updated.id },
      include: {
        primaryCentre: true,
        centrePreferences: {
          include: { bloodCentre: true },
        },
      },
    });

    res.json({
      success: true,
      data: fullProfile,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/donors/me/withdraw-consent
 * Immediately withdraw search consent and exclude donor from all matching
 */
donorsRouter.post('/donors/me/withdraw-consent', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user.id;

    const existing = await prisma.donorProfile.findUnique({
      where: { userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Donor profile does not exist.',
          code: 'DONOR_NOT_FOUND',
        },
      });
    }

    const updated = await prisma.donorProfile.update({
      where: { id: existing.id },
      data: {
        isSearchable: false,
        consentWithdrawnAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'CONSENT_WITHDRAWN',
        resource: 'DonorProfile',
        resourceId: existing.id,
      },
    });

    res.json({
      success: true,
      data: {
        isSearchable: updated.isSearchable,
        consentWithdrawnAt: updated.consentWithdrawnAt,
        message: 'Search consent withdrawn. You have been immediately removed from all donor search pools.',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/users/me/deactivate
 * Soft deactivate user account and revoke all active sessions
 */
donorsRouter.post('/users/me/deactivate', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user.id;

    await prisma.$transaction(async (tx: any) => {
      // 1. Deactivate user
      await tx.user.update({
        where: { id: userId },
        data: {
          status: 'DEACTIVATED',
          deactivatedAt: new Date(),
        },
      });

      // 2. Disable donor profile if exists
      await tx.donorProfile.updateMany({
        where: { userId },
        data: {
          isAvailable: false,
          isSearchable: false,
          consentWithdrawnAt: new Date(),
        },
      });

      // 3. Revoke all user sessions
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // 4. Audit
      await tx.auditLog.create({
        data: {
          userId,
          action: 'ACCOUNT_DEACTIVATED',
          resource: 'User',
          resourceId: userId,
        },
      });
    }, { maxWait: 10000, timeout: 20000 });

    res.clearCookie('raktasetu_session', { path: '/' });

    res.json({
      success: true,
      data: {
        message: 'Account successfully deactivated. All sessions revoked.',
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/donors/me/eligible-requests
 * Authenticated donor views incoming blood requests they are matched with
 */
donorsRouter.get(
  '/donors/me/eligible-requests',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user.id;
      const result = await findEligibleRequestsForDonor(userId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/donors/me/responses
 * Donor accepts or declines a specific blood request independently
 */
donorsRouter.post(
  '/donors/me/responses',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user.id;
      const { requestId, action } = req.body;

      if (!requestId || typeof requestId !== 'string') {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Valid requestId is required.',
            code: 'INVALID_REQUEST_ID',
          },
        });
      }

      if (action !== 'ACCEPT' && action !== 'DECLINE') {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Action must be either ACCEPT or DECLINE.',
            code: 'INVALID_ACTION',
          },
        });
      }

      const donor = await prisma.donorProfile.findUnique({
        where: { userId },
        include: { user: { select: { phoneNumber: true } } },
      });

      if (!donor) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Donor profile not found. Please register as a donor first.',
            code: 'DONOR_PROFILE_NOT_FOUND',
          },
        });
      }

      // Check request existence and lifecycle status
      const request = await prisma.bloodRequest.findUnique({
        where: { id: requestId },
        include: { bloodCentre: true },
      });

      if (!request) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Blood request not found.',
            code: 'REQUEST_NOT_FOUND',
          },
        });
      }

      // Strict lifecycle rule: Reject new responses to cancelled or closed requests
      if (request.status !== 'OPEN') {
        return res.status(400).json({
          success: false,
          error: {
            message: `Cannot respond to blood request in '${request.status}' status. Requests must be OPEN.`,
            code: 'REQUEST_NOT_OPEN',
          },
        });
      }

      // Prevent responding to own request
      if (request.requesterId === userId) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'You cannot respond to your own blood request.',
            code: 'SELF_RESPONSE_NOT_ALLOWED',
          },
        });
      }

      // Check existing invitation status
      const existingInvitation = await prisma.donorResponse.findUnique({
        where: {
          requestId_donorId: {
            requestId,
            donorId: donor.id,
          },
        },
      });

      if (existingInvitation && existingInvitation.status === 'CANCELLED') {
        return res.status(400).json({
          success: false,
          error: {
            message: 'This invitation has been cancelled and can no longer be responded to.',
            code: 'INVITATION_CANCELLED',
          },
        });
      }

      const newStatus = action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
      const isDisclosurePermitted =
        action === 'ACCEPT' && donor.isSearchable && donor.consentWithdrawnAt === null;

      // Atomically upsert response, audit log, and publish realtime outbox event
      const response = await prisma.$transaction(async (tx) => {
        const resp = await tx.donorResponse.upsert({
          where: {
            requestId_donorId: {
              requestId,
              donorId: donor.id,
            },
          },
          create: {
            requestId,
            donorId: donor.id,
            status: newStatus,
            respondedAt: new Date(),
            disclosureAuthorized: isDisclosurePermitted,
            contactDisclosedAt: isDisclosurePermitted ? new Date() : null,
          },
          update: {
            status: newStatus,
            respondedAt: new Date(),
            disclosureAuthorized: isDisclosurePermitted,
            contactDisclosedAt: isDisclosurePermitted ? new Date() : null,
          },
        });

        // Audit log
        await tx.auditLog.create({
          data: {
            userId,
            action: action === 'ACCEPT' ? 'DONOR_ACCEPTED_REQUEST' : 'DONOR_DECLINED_REQUEST',
            resource: 'DonorResponse',
            resourceId: resp.id,
            metadata: {
              requestId,
              donorId: donor.id,
              status: newStatus,
              disclosureAuthorized: isDisclosurePermitted,
            },
          },
        });

        // Safe real-time event for requester (NO donor PII broadcasted)
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'donor_invitation.response_changed',
          recipientUserId: request.requesterId,
          entityType: 'DonorResponse',
          entityId: resp.id,
          payload: {
            requestId,
            responseId: resp.id,
            status: newStatus,
            respondedAt: resp.respondedAt,
          },
        });

        // Safe real-time event for responding donor
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'donor_invitation.response_changed',
          recipientUserId: userId,
          entityType: 'DonorResponse',
          entityId: resp.id,
          payload: {
            requestId,
            responseId: resp.id,
            status: newStatus,
            respondedAt: resp.respondedAt,
          },
        });

        // Real-time event for designated Blood Bank organisation
        const meta = parseRequestMessageMetadata(request.message, request.bloodCentre?.hospitalName);
        if (meta.assignedBankId) {
          await RealtimeService.publishOutboxEvent(tx, {
            eventType: 'donor_invitation.response_changed',
            organisationId: meta.assignedBankId,
            entityType: 'DonorResponse',
            entityId: resp.id,
            payload: {
              requestId,
              responseId: resp.id,
              donorId: donor.id,
              status: newStatus,
              respondedAt: resp.respondedAt,
              contactDisclosed: isDisclosurePermitted,
              donorPhone: isDisclosurePermitted && donor.user?.phoneNumber ? donor.user.phoneNumber : null,
              donorName: isDisclosurePermitted ? donor.fullName : 'Voluntary Donor',
            },
          });
        }

        return resp;
      });

      // Asynchronous non-blocking WhatsApp notification for requester
      if (action === 'ACCEPT') {
        (async () => {
          try {
            const fullRequest = await prisma.bloodRequest.findUnique({
              where: { id: requestId },
              include: {
                bloodCentre: { select: { hospitalName: true } },
                requester: { select: { id: true, phoneNumber: true } },
              },
            });

            if (fullRequest?.requester?.phoneNumber) {
              const hospitalName = fullRequest.bloodCentre?.hospitalName || 'Designated Hospital';
              await notifyRequesterDonorAccepted({
                recipientPhone: fullRequest.requester.phoneNumber,
                requesterUserId: fullRequest.requester.id,
                bloodGroup: fullRequest.bloodGroup,
                hospitalName,
                requestId,
              }).catch(() => {});
            }
          } catch {
            // Fail silently; never impact donor response submission
          }
        })();
      }

      res.json({
        success: true,
        data: response,
        message:
          action === 'ACCEPT'
            ? 'Thank you! You have accepted this coordination request. Hospital staff and requester can view contact coordination.'
            : 'You have declined this request. Your decision has been saved independently.',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/donors/me/responses
 * Donor views their own response history across requests
 */
donorsRouter.get(
  '/donors/me/responses',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user.id;
      const donor = await prisma.donorProfile.findUnique({
        where: { userId },
      });

      if (!donor) {
        return res.json({ success: true, data: [] });
      }

      const responses = await prisma.donorResponse.findMany({
        where: { donorId: donor.id },
        include: {
          request: {
            include: {
              bloodCentre: {
                select: {
                  hospitalName: true,
                  districtCode: true,
                  address: true,
                },
              },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
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

/**
 * GET /api/v1/donors/me/donations
 * Authenticated donor views their authoritative completed donation history
 */
donorsRouter.get(
  '/donors/me/donations',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.user.id;
      const donations = await prisma.donationEvent.findMany({
        where: {
          donorUserId: userId,
          outcome: 'COMPLETED',
        },
        select: {
          id: true,
          bloodGroup: true,
          donationType: true,
          outcome: true,
          volumeMl: true,
          performedAt: true,
          camp: {
            select: {
              id: true,
              campCode: true,
              title: true,
              organizerName: true,
              venue: true,
              district: true,
              districtCode: true,
              stateCode: true,
              bloodCentre: {
                select: {
                  hospitalName: true,
                  hospitalCode: true,
                  address: true,
                  mobileNo: true,
                },
              },
            },
          },
          collectionUnit: {
            select: {
              bagIdentifier: true,
              status: true,
            },
          },
        },
        orderBy: { performedAt: 'desc' },
      });

      res.json({
        success: true,
        data: donations,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/donors/discovery
 * Search registered donors who have opted into community search (isSearchable: true, consentWithdrawnAt: null).
 * Privacy rules:
 * - Sanitized display names (e.g. "Vikram S.")
 * - Never returns GPS coordinates
 * - Never returns private phone numbers
 * - Public or authenticated search
 */
donorsRouter.get(
  '/donors/discovery',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const bloodGroup = req.query.bloodGroup ? String(req.query.bloodGroup).trim() : undefined;
      const districtCode = req.query.districtCode ? parseInt(String(req.query.districtCode), 10) : undefined;
      const stateCode = req.query.stateCode ? parseInt(String(req.query.stateCode), 10) : 27;
      const cityOrLocality = req.query.cityOrLocality ? String(req.query.cityOrLocality).trim() : undefined;

      const where: any = {
        isAvailable: true,
        isSearchable: true,
        consentWithdrawnAt: null,
        user: { status: 'ACTIVE' },
      };

      if (bloodGroup && VALID_BLOOD_GROUPS.includes(bloodGroup)) {
        where.bloodGroup = bloodGroup;
      }
      if (districtCode && !isNaN(districtCode)) {
        where.districtCode = districtCode;
      }
      if (stateCode && !isNaN(stateCode)) {
        where.stateCode = stateCode;
      }
      if (cityOrLocality) {
        where.cityOrLocality = { contains: cityOrLocality, mode: 'insensitive' };
      }

      const donors = await prisma.donorProfile.findMany({
        where,
        select: {
          id: true,
          fullName: true,
          bloodGroup: true,
          districtCode: true,
          stateCode: true,
          cityOrLocality: true,
          isAvailable: true,
          updatedAt: true,
          primaryCentre: {
            select: {
              hospitalName: true,
              districtCode: true,
            },
          },
        },
        take: 50,
        orderBy: { updatedAt: 'desc' },
      });

      const sanitized = donors.map((d) => ({
        id: d.id,
        displayName: sanitizeDonorName(d.fullName),
        bloodGroup: d.bloodGroup,
        districtCode: d.districtCode,
        stateCode: d.stateCode,
        cityOrLocality: d.cityOrLocality,
        isAvailable: d.isAvailable,
        primaryCentreName: d.primaryCentre?.hospitalName || null,
      }));

      res.json({
        success: true,
        data: sanitized,
      });
    } catch (error) {
      next(error);
    }
  }
);


