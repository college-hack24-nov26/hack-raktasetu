/**
 * RaktaSetu — Blood Bank Donor Registry Service
 *
 * Implements:
 * 1. Direct donor registration through the Blood Bank without requiring a camp.
 * 2. Search, filter, and pagination for donors legitimately associated with the Blood Bank.
 * 3. Individual donor profile, donation history, and clinical safety records.
 * 4. Persisted summary metrics strictly scoped to the Blood Bank organisation.
 */

import { prisma } from '../lib/prisma';
import { BloodGroup, Prisma } from '@prisma/client';
import { RealtimeService } from './realtime';

export interface DirectRegisterDonorInput {
  fullName: string;
  phoneNumber: string;
  bloodGroup: BloodGroup;
  dateOfBirth?: string;
  districtCode?: number;
  cityOrLocality?: string;
  isSearchable?: boolean;
  consentGiven: boolean;
  consentVersion?: string;
}

export interface DonorRegistryQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  bloodGroup?: BloodGroup;
  registrationSource?: 'ALL' | 'DIRECT' | 'CAMP';
  campId?: string;
  startDate?: string;
  endDate?: string;
}

function normalizePhoneNumber(phone: string): string {
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.length === 10) return `+91${cleaned}`;
  if (cleaned.length === 12 && cleaned.startsWith('91')) return `+${cleaned}`;
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

export class DonorRegistryService {
  /**
   * 1. Direct donor registration through the Blood Bank without requiring a camp.
   */
  static async directRegisterDonor(
    callerUserId: string,
    organisationId: string,
    input: DirectRegisterDonorInput
  ) {
    if (!input.fullName || !input.fullName.trim()) {
      const err: any = new Error('Donor full name is required.');
      err.statusCode = 400;
      throw err;
    }

    if (!input.phoneNumber || !input.phoneNumber.trim()) {
      const err: any = new Error('Donor phone number is required.');
      err.statusCode = 400;
      throw err;
    }

    if (!input.bloodGroup) {
      const err: any = new Error('Donor blood group is required.');
      err.statusCode = 400;
      throw err;
    }

    if (!input.consentGiven) {
      const err: any = new Error('Explicit donor consent is mandatory for registration.');
      err.statusCode = 400;
      throw err;
    }

    const normalizedPhone = normalizePhoneNumber(input.phoneNumber.trim());
    if (!/^\+\d{10,15}$/.test(normalizedPhone)) {
      const err: any = new Error('Invalid phone number format. Must be a valid 10-digit mobile number.');
      err.statusCode = 400;
      throw err;
    }

    // Age validation (18 - 65)
    let parsedDob: Date | undefined;
    if (input.dateOfBirth) {
      parsedDob = new Date(input.dateOfBirth);
      if (isNaN(parsedDob.getTime())) {
        const err: any = new Error('Invalid date of birth.');
        err.statusCode = 400;
        throw err;
      }
      const ageYears = (Date.now() - parsedDob.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (ageYears < 18 || ageYears > 65) {
        const err: any = new Error('Donor must be between 18 and 65 years of age for clinical eligibility.');
        err.statusCode = 400;
        throw err;
      }
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Validate caller membership
      const membership = await tx.organisationMembership.findFirst({
        where: {
          organisationId,
          userId: callerUserId,
          isActive: true,
        },
        include: { organisation: true },
      });

      if (!membership) {
        const err: any = new Error('Access denied: You do not have verified active membership in this organisation.');
        err.statusCode = 403;
        throw err;
      }

      const org = membership.organisation;
      const orgHospitalCode = org.hospitalCode || org.orgCode;

      // 2. Deduplication check by phone number
      let user = await tx.user.findUnique({
        where: { phoneNumber: normalizedPhone },
        include: { donorProfile: true },
      });

      const now = new Date();
      let donorProfile;
      let isExisting = false;

      let targetUserId = '';

      if (user) {
        isExisting = true;
        targetUserId = user.id;
        // User already exists
        if (user.donorProfile) {
          donorProfile = user.donorProfile;
          // Ensure blood bank association via DonorCentrePreference
          const existingPref = await tx.donorCentrePreference.findFirst({
            where: {
              donorId: donorProfile.id,
              hospitalCode: orgHospitalCode,
            },
          });

          if (!existingPref) {
            await tx.donorCentrePreference.create({
              data: {
                donorId: donorProfile.id,
                hospitalCode: orgHospitalCode,
                isPrimary: !donorProfile.primaryHospitalCode,
              },
            });
          }

          if (!donorProfile.primaryHospitalCode) {
            donorProfile = await tx.donorProfile.update({
              where: { id: donorProfile.id },
              data: { primaryHospitalCode: orgHospitalCode },
            });
          }
        } else {
          // User exists but has no DonorProfile
          donorProfile = await tx.donorProfile.create({
            data: {
              userId: user.id,
              fullName: input.fullName.trim(),
              dateOfBirth: parsedDob,
              bloodGroup: input.bloodGroup,
              districtCode: input.districtCode || org.districtCode,
              stateCode: org.stateCode || 27,
              cityOrLocality: input.cityOrLocality?.trim() || null,
              isAvailable: true,
              isSearchable: Boolean(input.isSearchable),
              consentVersion: input.consentVersion || 'v1.0',
              consentGrantedAt: now,
              primaryHospitalCode: orgHospitalCode,
            },
          });

          await tx.donorCentrePreference.create({
            data: {
              donorId: donorProfile.id,
              hospitalCode: orgHospitalCode,
              isPrimary: true,
            },
          });
        }
      } else {
        // Create new User and DonorProfile
        const createdUser = await tx.user.create({
          data: {
            phoneNumber: normalizedPhone,
            name: input.fullName.trim(),
            role: 'DONOR',
            status: 'ACTIVE',
          },
        });
        targetUserId = createdUser.id;

        donorProfile = await tx.donorProfile.create({
          data: {
            userId: createdUser.id,
            fullName: input.fullName.trim(),
            dateOfBirth: parsedDob,
            bloodGroup: input.bloodGroup,
            districtCode: input.districtCode || org.districtCode,
            stateCode: org.stateCode || 27,
            cityOrLocality: input.cityOrLocality?.trim() || null,
            isAvailable: true,
            isSearchable: Boolean(input.isSearchable),
            consentVersion: input.consentVersion || 'v1.0',
            consentGrantedAt: now,
            primaryHospitalCode: orgHospitalCode,
          },
        });

        await tx.donorCentrePreference.create({
          data: {
            donorId: donorProfile.id,
            hospitalCode: orgHospitalCode,
            isPrimary: true,
          },
        });
      }

      // 3. Audit log
      await tx.auditLog.create({
        data: {
          userId: callerUserId,
          action: isExisting ? 'DONOR_ASSOCIATED_DIRECT' : 'DONOR_REGISTERED_DIRECT',
          resource: 'DonorProfile',
          resourceId: donorProfile.id,
          metadata: {
            organisationId,
            registeredByUserId: callerUserId,
            donorUserId: targetUserId,
            isDirectRegistration: true,
            bloodGroup: donorProfile.bloodGroup,
            timestamp: now.toISOString(),
          },
        },
      });

      // 4. Outbox event
      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'donor.eligibility_updated',
        entityType: 'DonorProfile',
        entityId: donorProfile.id,
        organisationId,
        payload: {
          donorId: donorProfile.id,
          donorUserId: targetUserId,
          fullName: donorProfile.fullName,
          bloodGroup: donorProfile.bloodGroup,
          registrationSource: 'DIRECT',
          registeredAt: now.toISOString(),
        },
      });

      return {
        success: true,
        message: isExisting
          ? 'Existing donor found and successfully associated with this Blood Bank.'
          : 'Donor registered directly with this Blood Bank successfully.',
        isExisting,
        donor: {
          id: donorProfile.id,
          donorReference: `#DNR-${donorProfile.id.slice(0, 8).toUpperCase()}`,
          fullName: donorProfile.fullName,
          phoneNumber: normalizedPhone,
          bloodGroup: donorProfile.bloodGroup,
          registrationSource: 'DIRECT',
          registrationDate: donorProfile.createdAt.toISOString(),
          isAvailable: donorProfile.isAvailable,
          isSearchable: donorProfile.isSearchable,
          primaryHospitalCode: donorProfile.primaryHospitalCode,
        },
      };
    }, { timeout: 25000, maxWait: 15000 });
  }

  /**
   * 2. View, search, filter, and paginate donors associated with this Blood Bank.
   */
  static async getOrganisationDonors(
    callerUserId: string,
    organisationId: string,
    params: DonorRegistryQueryParams
  ) {
    // 1. Verify caller membership
    const membership = await prisma.organisationMembership.findFirst({
      where: {
        organisationId,
        userId: callerUserId,
        isActive: true,
      },
      include: { organisation: true },
    });

    if (!membership) {
      const err: any = new Error('Access denied: You do not have verified active membership in this organisation.');
      err.statusCode = 403;
      throw err;
    }

    const org = membership.organisation;
    const orgHospitalCode = org.hospitalCode || org.orgCode;

    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 10));
    const skip = (page - 1) * limit;

    // Build association filter:
    // A donor is associated with this Blood Bank if:
    // - primaryHospitalCode === orgHospitalCode
    // - OR centrePreferences has orgHospitalCode
    // - OR attended a camp belonging to this organisation
    // - OR completed a donation at this organisation's camp
    const associationCondition: Prisma.DonorProfileWhereInput = {
      OR: [
        { primaryHospitalCode: orgHospitalCode },
        { centrePreferences: { some: { hospitalCode: orgHospitalCode } } },
        { campAttendances: { some: { camp: { organisationId } } } },
        { user: { donationEvents: { some: { camp: { organisationId } } } } },
      ],
    };

    const andConditions: Prisma.DonorProfileWhereInput[] = [associationCondition];

    // Filter by blood group
    if (params.bloodGroup) {
      andConditions.push({ bloodGroup: params.bloodGroup });
    }

    // Filter by search string (name, phone, donor reference)
    if (params.search && params.search.trim()) {
      const q = params.search.trim();
      andConditions.push({
        OR: [
          { fullName: { contains: q, mode: 'insensitive' } },
          { user: { phoneNumber: { contains: q } } },
          { user: { name: { contains: q, mode: 'insensitive' } } },
          { id: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    // Filter by registration date range
    if (params.startDate) {
      const start = new Date(params.startDate);
      if (!isNaN(start.getTime())) {
        andConditions.push({ createdAt: { gte: start } });
      }
    }
    if (params.endDate) {
      const end = new Date(params.endDate);
      if (!isNaN(end.getTime())) {
        andConditions.push({ createdAt: { lte: end } });
      }
    }

    // Filter by specific camp
    if (params.campId && params.campId.trim()) {
      andConditions.push({
        campAttendances: { some: { campId: params.campId.trim() } },
      });
    }

    const where: Prisma.DonorProfileWhereInput = { AND: andConditions };

    const totalCount = await prisma.donorProfile.count({ where });

    const donors = await prisma.donorProfile.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            phoneNumber: true,
            name: true,
            status: true,
            donationEvents: {
              where: {
                camp: { organisationId },
                outcome: 'COMPLETED',
              },
              orderBy: { performedAt: 'desc' },
            },
          },
        },
        campAttendances: {
          where: {
            camp: { organisationId },
          },
          include: {
            camp: { select: { id: true, title: true, campCode: true } },
          },
          orderBy: { registeredAt: 'desc' },
        },
      },
    });

    const items = donors.map((donor) => {
      const campAtt = donor.campAttendances[0] || null;
      const isDirect = !campAtt;
      const completedDonationsAtBank = donor.user.donationEvents.length;
      const latestDonation = donor.user.donationEvents[0];
      const lastDonationDate = latestDonation
        ? latestDonation.performedAt.toISOString()
        : donor.verifiedLastDonationDate
        ? donor.verifiedLastDonationDate.toISOString()
        : donor.lastDonationDate
        ? donor.lastDonationDate.toISOString()
        : null;

      // Mask phone for auditors / read-only users if needed, or provide full for active staff
      const phone = donor.user.phoneNumber;

      return {
        id: donor.id,
        donorReference: `#DNR-${donor.id.slice(0, 8).toUpperCase()}`,
        fullName: donor.fullName || donor.user.name || 'Voluntary Donor',
        bloodGroup: donor.bloodGroup,
        phoneNumber: phone,
        registrationDate: donor.createdAt.toISOString(),
        registrationSource: isDirect ? ('DIRECT' as const) : ('CAMP' as const),
        campName: campAtt ? campAtt.camp.title : null,
        campCode: campAtt ? campAtt.camp.campCode : null,
        totalCompletedDonationsAtBank: completedDonationsAtBank,
        lastDonationDateAtBank: lastDonationDate,
        isAvailable: donor.isAvailable,
        isSearchable: donor.isSearchable,
        verificationStatus: donor.verifiedLastDonationDate
          ? 'CLINICALLY_VERIFIED'
          : completedDonationsAtBank > 0
          ? 'DONATION_VERIFIED'
          : 'SELF_REPORTED',
      };
    });

    // Filter by registrationSource in-memory if requested (DIRECT vs CAMP)
    let filteredItems = items;
    if (params.registrationSource && params.registrationSource !== 'ALL') {
      filteredItems = items.filter((item) => item.registrationSource === params.registrationSource);
    }

    const totalPages = Math.ceil(totalCount / limit);

    return {
      items: filteredItems,
      pagination: {
        totalCount,
        totalPages,
        currentPage: page,
        pageSize: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * 3. View individual donor profile, donation history, and clinical records.
   */
  static async getOrganisationDonorDetail(
    callerUserId: string,
    organisationId: string,
    donorId: string
  ) {
    // 1. Verify caller membership
    const membership = await prisma.organisationMembership.findFirst({
      where: {
        organisationId,
        userId: callerUserId,
        isActive: true,
      },
      include: { organisation: true },
    });

    if (!membership) {
      const err: any = new Error('Access denied: You do not have verified active membership in this organisation.');
      err.statusCode = 403;
      throw err;
    }

    const org = membership.organisation;
    const orgHospitalCode = org.hospitalCode || org.orgCode;

    const donor = await prisma.donorProfile.findUnique({
      where: { id: donorId },
      include: {
        user: {
          select: {
            id: true,
            phoneNumber: true,
            name: true,
            status: true,
            donationEvents: {
              where: {
                camp: { organisationId },
              },
              include: {
                camp: { select: { id: true, title: true, campCode: true } },
                collectionUnit: {
                  select: {
                    id: true,
                    unitNumber: true,
                    volumeMl: true,
                    status: true,
                  },
                },
              },
              orderBy: { performedAt: 'desc' },
            },
            clinicalScreenings: {
              where: {
                camp: { organisationId },
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        campAttendances: {
          where: {
            camp: { organisationId },
          },
          include: {
            camp: { select: { id: true, title: true, campCode: true } },
          },
          orderBy: { registeredAt: 'desc' },
        },
        centrePreferences: true,
      },
    });

    if (!donor) {
      const err: any = new Error('Donor profile not found.');
      err.statusCode = 404;
      throw err;
    }

    // Verify association with this organisation
    const isAssociated =
      donor.primaryHospitalCode === orgHospitalCode ||
      donor.centrePreferences.some((p) => p.hospitalCode === orgHospitalCode) ||
      donor.campAttendances.length > 0 ||
      donor.user.donationEvents.length > 0;

    if (!isAssociated) {
      const err: any = new Error('Access denied: This donor is not associated with your Blood Bank.');
      err.statusCode = 403;
      throw err;
    }

    const isDirect = donor.campAttendances.length === 0;

    return {
      profile: {
        id: donor.id,
        donorReference: `#DNR-${donor.id.slice(0, 8).toUpperCase()}`,
        fullName: donor.fullName || donor.user.name || 'Voluntary Donor',
        bloodGroup: donor.bloodGroup,
        phoneNumber: donor.user.phoneNumber,
        dateOfBirth: donor.dateOfBirth ? donor.dateOfBirth.toISOString().split('T')[0] : null,
        cityOrLocality: donor.cityOrLocality,
        districtCode: donor.districtCode,
        stateCode: donor.stateCode,
        isAvailable: donor.isAvailable,
        isSearchable: donor.isSearchable,
        registrationDate: donor.createdAt.toISOString(),
        registrationSource: isDirect ? 'DIRECT' : 'CAMP',
        primaryHospitalCode: donor.primaryHospitalCode,
        consentVersion: donor.consentVersion,
        consentGrantedAt: donor.consentGrantedAt ? donor.consentGrantedAt.toISOString() : null,
      },
      summary: {
        totalDonationsAtBank: donor.user.donationEvents.filter((d) => d.outcome === 'COMPLETED').length,
        totalScreeningsAtBank: donor.user.clinicalScreenings.length,
        lastDonationDate: donor.user.donationEvents[0]?.performedAt?.toISOString() || null,
        isEligibleByInterval: !donor.user.donationEvents[0] ||
          (Date.now() - new Date(donor.user.donationEvents[0].performedAt).getTime()) > 90 * 24 * 60 * 60 * 1000,
      },
      donationHistory: donor.user.donationEvents.map((d) => ({
        id: d.id,
        campTitle: d.camp.title,
        campCode: d.camp.campCode,
        bloodGroup: d.bloodGroup,
        donationType: d.donationType,
        outcome: d.outcome,
        volumeMl: d.volumeMl,
        performedAt: d.performedAt.toISOString(),
        unitNumber: d.collectionUnit?.unitNumber || null,
        adverseReaction: d.adverseReaction,
        notes: d.notes,
      })),
      campAttendances: donor.campAttendances.map((a) => ({
        id: a.id,
        campTitle: a.camp.title,
        campCode: a.camp.campCode,
        registeredAt: a.registeredAt.toISOString(),
        checkedInAt: a.checkedInAt ? a.checkedInAt.toISOString() : null,
        status: a.status,
      })),
      clinicalScreenings: donor.user.clinicalScreenings.map((s) => ({
        id: s.id,
        status: s.status,
        eligibilityDecision: s.eligibilityDecision,
        deferralCategory: s.deferralCategory,
        deferralDurationDays: s.deferralDurationDays,
        clinicalNotes: s.clinicalNotes,
        screenedAt: s.createdAt.toISOString(),
      })),
    };
  }

  /**
   * 4. Concise summary cards based strictly on real persisted data.
   */
  static async getOrganisationDonorSummary(callerUserId: string, organisationId: string) {
    const membership = await prisma.organisationMembership.findFirst({
      where: {
        organisationId,
        userId: callerUserId,
        isActive: true,
      },
      include: { organisation: true },
    });

    if (!membership) {
      const err: any = new Error('Access denied: You do not have verified active membership in this organisation.');
      err.statusCode = 403;
      throw err;
    }

    const org = membership.organisation;
    const orgHospitalCode = org.hospitalCode || org.orgCode;

    const baseWhere: Prisma.DonorProfileWhereInput = {
      OR: [
        { primaryHospitalCode: orgHospitalCode },
        { centrePreferences: { some: { hospitalCode: orgHospitalCode } } },
        { campAttendances: { some: { camp: { organisationId } } } },
        { user: { donationEvents: { some: { camp: { organisationId } } } } },
      ],
    };

    const allDonors = await prisma.donorProfile.findMany({
      where: baseWhere,
      select: {
        id: true,
        bloodGroup: true,
        campAttendances: {
          where: { camp: { organisationId } },
          select: { id: true },
        },
        user: {
          select: {
            donationEvents: {
              where: {
                camp: { organisationId },
                outcome: 'COMPLETED',
              },
              select: { id: true },
            },
          },
        },
      },
    });

    const totalAssociatedDonors = allDonors.length;
    let directRegistrationsCount = 0;
    let campRegistrationsCount = 0;
    let donorsWithCompletedDonations = 0;
    const donationsByBloodGroup: Record<string, number> = {
      'A_POS': 0, 'A_NEG': 0, 'B_POS': 0, 'B_NEG': 0,
      'AB_POS': 0, 'AB_NEG': 0, 'O_POS': 0, 'O_NEG': 0,
    };

    for (const d of allDonors) {
      if (d.campAttendances.length === 0) {
        directRegistrationsCount++;
      } else {
        campRegistrationsCount++;
      }

      if (d.user.donationEvents.length > 0) {
        donorsWithCompletedDonations++;
      }

      if (donationsByBloodGroup[d.bloodGroup] !== undefined) {
        donationsByBloodGroup[d.bloodGroup]++;
      } else {
        donationsByBloodGroup[d.bloodGroup] = 1;
      }
    }

    return {
      totalAssociatedDonors,
      directRegistrationsCount,
      campRegistrationsCount,
      donorsWithCompletedDonations,
      donorsByBloodGroup: donationsByBloodGroup,
    };
  }
}
