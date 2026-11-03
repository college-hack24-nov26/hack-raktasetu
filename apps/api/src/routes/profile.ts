import { Router, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

export const profileRouter = Router();

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
 * GET /api/v1/profile/me
 * Retrieves full user profile including account info, donor profile, centre preferences, and request/donation statistics
 */
profileRouter.get('/profile/me', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phoneNumber: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
        donorProfile: {
          include: {
            primaryCentre: {
              select: {
                hospitalCode: true,
                hospitalName: true,
                address: true,
                districtCode: true,
                stateCode: true,
              },
            },
            centrePreferences: {
              include: {
                bloodCentre: {
                  select: {
                    hospitalCode: true,
                    hospitalName: true,
                    address: true,
                    districtCode: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User account not found.',
          code: 'USER_NOT_FOUND',
        },
      });
    }

    // Aggregate statistics and authoritative donation records
    const [createdRequestsCount, responsesCount, completedDonationsCount, latestDonation, activeDeferral] = await Promise.all([
      prisma.bloodRequest.count({
        where: { requesterId: userId },
      }),
      user.donorProfile
        ? prisma.donorResponse.count({
            where: { donorId: user.donorProfile.id },
          })
        : 0,
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
      user.donorProfile?.verifiedLastDonationDate,
      user.donorProfile?.lastDonationDate,
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

    const isEffectiveAvailable = Boolean(user.donorProfile?.isAvailable && eligibility.isEligible);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          phoneNumber: user.phoneNumber,
          name: user.name,
          role: user.role,
          status: user.status,
          createdAt: user.createdAt,
        },
        donorProfile: user.donorProfile
          ? {
              ...user.donorProfile,
              donationCount: completedDonationsCount,
              latestDonationDate: latestDonation?.performedAt ? latestDonation.performedAt.toISOString() : (verifiedDate ? new Date(verifiedDate).toISOString() : null),
              isEffectiveAvailable,
              eligibility,
            }
          : null,
        stats: {
          createdRequestsCount,
          responsesCount,
          completedDonationsCount,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/profile/me
 * Update editable profile details (Name, Blood Group, Location, Preferences, Availability)
 * Phone number changes directly without verification are explicitly prohibited.
 */
profileRouter.put('/profile/me', requireAuth, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user.id;
    const {
      name,
      fullName,
      bloodGroup,
      stateCode,
      districtCode,
      cityOrLocality,
      lastDonationDate,
      isAvailable,
      isSearchable,
      primaryHospitalCode,
      secondaryHospitalCodes,
      phoneNumber,
    } = req.body;

    // Disallow unverified phone number tampering
    if (phoneNumber !== undefined) {
      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { phoneNumber: true },
      });
      if (currentUser && phoneNumber !== currentUser.phoneNumber) {
        return res.status(400).json({
          success: false,
          error: {
            message:
              'Contact phone numbers cannot be changed directly in profile edit. Phone number updates require verification through the demo OTP verification workflow.',
            code: 'UNVERIFIED_PHONE_CHANGE_DISALLOWED',
          },
        });
      }
    }

    // Validate blood group if provided
    if (bloodGroup !== undefined && !VALID_BLOOD_GROUPS.includes(bloodGroup)) {
      return res.status(400).json({
        success: false,
        error: {
          message: `Invalid blood group '${bloodGroup}'. Must be one of: ${VALID_BLOOD_GROUPS.join(', ')}`,
          code: 'INVALID_BLOOD_GROUP',
        },
      });
    }

    const displayName = fullName || name;
    if (displayName !== undefined && (typeof displayName !== 'string' || displayName.trim().length < 2)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Full name must be at least 2 characters.',
          code: 'INVALID_NAME',
        },
      });
    }

    // Execute transactional update for user and donor profile
    const result = await prisma.$transaction(
      async (tx: any) => {
        // 1. Update User table
        const userUpdateData: any = {};
        if (displayName) userUpdateData.name = displayName.trim();
        await tx.user.update({
          where: { id: userId },
          data: userUpdateData,
        });

        // 2. Update DonorProfile if it exists
        const existingDonor = await tx.donorProfile.findUnique({
          where: { userId },
        });

        if (existingDonor) {
          const donorUpdate: any = {};
          if (displayName) donorUpdate.fullName = displayName.trim();
          if (bloodGroup) donorUpdate.bloodGroup = bloodGroup;
          if (typeof stateCode === 'number') donorUpdate.stateCode = stateCode;
          if (typeof districtCode === 'number') donorUpdate.districtCode = districtCode;
          if (cityOrLocality !== undefined) donorUpdate.cityOrLocality = cityOrLocality ? String(cityOrLocality).trim() : null;
          if (typeof isAvailable === 'boolean') donorUpdate.isAvailable = isAvailable;

          if (typeof isSearchable === 'boolean') {
            donorUpdate.isSearchable = isSearchable;
            if (isSearchable && !existingDonor.consentGrantedAt) {
              donorUpdate.consentGrantedAt = new Date();
              donorUpdate.consentWithdrawnAt = null;
            } else if (!isSearchable) {
              donorUpdate.consentWithdrawnAt = new Date();
            }
          }

          if (lastDonationDate !== undefined) {
            donorUpdate.lastDonationDate = lastDonationDate ? new Date(lastDonationDate) : null;
          }

          if (primaryHospitalCode && typeof primaryHospitalCode === 'string') {
            donorUpdate.primaryHospitalCode = primaryHospitalCode.trim();
          }

          await tx.donorProfile.update({
            where: { id: existingDonor.id },
            data: donorUpdate,
          });

          // Handle centre preferences update if provided
          if (primaryHospitalCode || secondaryHospitalCodes) {
            const prim = primaryHospitalCode ? primaryHospitalCode.trim() : existingDonor.primaryHospitalCode;
            if (prim) {
              await tx.donorCentrePreference.deleteMany({
                where: { donorId: existingDonor.id },
              });

              await tx.donorCentrePreference.create({
                data: {
                  donorId: existingDonor.id,
                  hospitalCode: prim,
                  isPrimary: true,
                },
              });

              const secondary = Array.isArray(secondaryHospitalCodes)
                ? secondaryHospitalCodes.filter((c: string) => c && c !== prim)
                : [];

              for (const code of secondary) {
                await tx.donorCentrePreference.create({
                  data: {
                    donorId: existingDonor.id,
                    hospitalCode: String(code).trim(),
                    isPrimary: false,
                  },
                });
              }
            }
          }
        }

        // 3. Audit Log
        await tx.auditLog.create({
          data: {
            userId,
            action: 'USER_PROFILE_UPDATED',
            resource: 'User',
            resourceId: userId,
            metadata: {
              updatedFields: Object.keys(req.body).filter((k) => req.body[k] !== undefined),
            },
          },
        });

        return true;
      },
      { maxWait: 10000, timeout: 20000 }
    );

    // Fetch and return the updated profile
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phoneNumber: true,
        name: true,
        role: true,
        status: true,
        donorProfile: {
          include: {
            primaryCentre: true,
            centrePreferences: {
              include: { bloodCentre: true },
            },
          },
        },
      },
    });

    res.json({
      success: true,
      data: updatedUser,
      message: 'Profile updated successfully.',
    });
  } catch (error) {
    next(error);
  }
});
