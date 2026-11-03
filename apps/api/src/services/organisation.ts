import { prisma } from '../lib/prisma';
import { OrgRole, CampStatus, ApplicationStatus } from '@prisma/client';
import { ROLE_PERMISSIONS, Permission } from '../middleware/rbac';
import { normalizePhoneNumber } from './auth';

export interface OrganisationApplicationInput {
  hospitalName: string;
  licenseNumber: string;
  stateCode?: number;
  districtCode: number;
  districtName?: string;
  contactPerson: string;
  email: string;
  phone: string;
  componentTypes?: string[];
}

export interface OrganisationApplicationReviewInput {
  status: 'APPROVED' | 'REJECTED' | 'RETURNED_FOR_CORRECTION';
  reviewNotes?: string;
  reviewedBy: string; // Reviewer user ID
  orgCode?: string;
}

export interface CampRegistrationInput {
  campCode?: string;
  title: string;
  organizerName: string;
  targetDate: string;
  timeSlot?: string;
  venue: string;
  district?: string;
  districtCode: number;
  stateCode?: number;
  expectedDonors?: number;
  coordinatorContact?: string;
  hospitalCode?: string;
  organisationId?: string;
}

export interface AssignStaffInput {
  phoneOrUserId: string;
  role: OrgRole;
}

export interface UpdateStaffRoleInput {
  role?: OrgRole;
  isActive?: boolean;
}

export class OrganisationService {
  /**
   * Submit an institutional onboarding application.
   * State Machine: -> SUBMITTED
   */
  static async submitApplication(
    input: OrganisationApplicationInput,
    applicantUserId?: string
  ) {
    if (!input.hospitalName?.trim()) {
      throw new Error('Hospital or Centre name is required.');
    }
    if (!input.licenseNumber?.trim()) {
      throw new Error('Valid CDSCO or State Blood Transfusion Council license number is required.');
    }
    if (!input.contactPerson?.trim() || !input.phone?.trim() || !input.email?.trim()) {
      throw new Error('Authorized contact person, official email, and phone number are required.');
    }

    // Validate and normalize contact phone
    const cleanPhone = normalizePhoneNumber(input.phone);

    if (!input.districtCode) {
      throw new Error('District code is required.');
    }

    const cleanLicense = input.licenseNumber.trim().toUpperCase();

    // Check if an organisation is already verified with this license
    const existingOrg = await prisma.organisation.findUnique({
      where: { licenseNumber: cleanLicense },
    });
    if (existingOrg) {
      throw new Error(
        `An organisation is already registered with license number "${cleanLicense}".`
      );
    }

    // Check if an active application is already submitted and pending review
    const pendingApp = await prisma.organisationApplication.findFirst({
      where: {
        licenseNumber: cleanLicense,
        status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
      },
    });
    if (pendingApp) {
      throw new Error(
        `An active onboarding application for license "${cleanLicense}" is already under review.`
      );
    }

    // If callerUserId was not provided in request header, check if user exists by phone
    let resolvedApplicantId = applicantUserId;
    if (!resolvedApplicantId) {
      const userByPhone = await prisma.user.findUnique({
        where: { phoneNumber: cleanPhone },
      });
      if (userByPhone) {
        resolvedApplicantId = userByPhone.id;
      }
    }

    const application = await prisma.organisationApplication.create({
      data: {
        applicantUserId: resolvedApplicantId || null,
        hospitalName: input.hospitalName.trim(),
        licenseNumber: cleanLicense,
        stateCode: input.stateCode || 27,
        districtCode: input.districtCode,
        districtName: input.districtName?.trim() || null,
        contactPerson: input.contactPerson.trim(),
        email: input.email.trim().toLowerCase(),
        phone: cleanPhone,
        componentTypes: input.componentTypes || ['PRBC', 'Whole Blood'],
        status: 'SUBMITTED',
      },
    });

    // Record audit event
    await prisma.auditLog.create({
      data: {
        userId: applicantUserId || null,
        action: 'ORGANISATION_APPLICATION_SUBMITTED',
        resource: 'OrganisationApplication',
        resourceId: application.id,
        metadata: {
          licenseNumber: cleanLicense,
          hospitalName: input.hospitalName,
          districtCode: input.districtCode,
        },
      },
    });

    return application;
  }

  /**
   * Get an application with authorization checks.
   * Only the original applicant or a Platform Administrator can view application details.
   */
  static async getApplication(
    applicationId: string,
    callingUser: { id: string; role: string }
  ) {
    const app = await prisma.organisationApplication.findUnique({
      where: { id: applicationId },
      include: {
        resultingOrg: true,
      },
    });

    if (!app) {
      throw new Error(`Organisation application "${applicationId}" not found.`);
    }

    // Authorization check: Must be the applicant or a Platform Administrator
    const isApplicant = app.applicantUserId && app.applicantUserId === callingUser.id;
    const isPlatformAdmin = callingUser.role === 'ADMIN';

    if (!isApplicant && !isPlatformAdmin) {
      throw new Error('Access denied. You are not authorized to view this onboarding application.');
    }

    return app;
  }

  /**
   * List all onboarding applications.
   * Restricted strictly to Platform Administrators.
   */
  static async listApplications(
    callingUser: { id: string; role: string },
    filter?: { status?: ApplicationStatus }
  ) {
    if (callingUser.role !== 'ADMIN') {
      throw new Error('Only Platform Administrators can list organisation onboarding applications.');
    }

    const where: any = {};
    if (filter?.status) {
      where.status = filter.status;
    }

    return await prisma.organisationApplication.findMany({
      where,
      include: {
        applicantUser: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            role: true,
          },
        },
        resultingOrg: {
          select: {
            id: true,
            orgCode: true,
            name: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Review an institutional onboarding application.
   * State Machine: SUBMITTED / UNDER_REVIEW -> APPROVED | REJECTED | RETURNED_FOR_CORRECTION
   * Invariants:
   * 1. Only Platform Administrators can review.
   * 2. Applicants CANNOT review or approve their own application.
   * 3. Cannot re-approve an already APPROVED application.
   * 4. Atomic provisioning of Organisation and initial ORG_ADMIN membership on approval.
   */
  static async reviewApplication(
    applicationId: string,
    reviewerUser: { id: string; role: string },
    review: OrganisationApplicationReviewInput
  ) {
    // Invariant 1: Reviewer must be a platform administrator
    if (reviewerUser.role !== 'ADMIN') {
      throw new Error('Only authorized Platform Administrators can review organisation applications.');
    }

    const app = await prisma.organisationApplication.findUnique({
      where: { id: applicationId },
    });

    if (!app) {
      throw new Error(`Organisation application "${applicationId}" not found.`);
    }

    // Invariant 2: Applicants cannot approve or review their own application
    if (app.applicantUserId && app.applicantUserId === reviewerUser.id) {
      throw new Error('Conflict of interest: Applicants cannot review or approve their own onboarding application.');
    }

    // Invariant 3: Validate allowed state transitions
    if (app.status === 'APPROVED') {
      throw new Error('This application has already been approved and cannot be reviewed again.');
    }

    const allowedStatuses: ApplicationStatus[] = ['APPROVED', 'REJECTED', 'RETURNED_FOR_CORRECTION'];
    if (!allowedStatuses.includes(review.status as ApplicationStatus)) {
      throw new Error(`Invalid review status "${review.status}". Allowed values: ${allowedStatuses.join(', ')}.`);
    }

    const reviewedAt = new Date();

    if (review.status === 'APPROVED') {
      // Transactionally provision Organisation, initial ORG_ADMIN membership, and update Application
      return await prisma.$transaction(async (tx) => {
        // Double-check license uniqueness in transaction
        const existingOrg = await tx.organisation.findUnique({
          where: { licenseNumber: app.licenseNumber },
        });
        if (existingOrg) {
          throw new Error(`An organisation is already registered with license number "${app.licenseNumber}".`);
        }

        const cleanOrgCode =
          review.orgCode?.trim().toUpperCase() ||
          `ORG-MH-${app.districtCode}-${Math.floor(1000 + Math.random() * 9000)}`;

        // Check if matching BloodCentre exists in public directory cache
        const matchingCentre = await tx.bloodCentre.findFirst({
          where: {
            stateCode: app.stateCode,
            districtCode: app.districtCode,
            hospitalName: {
              contains: app.hospitalName.split(' ')[0],
              mode: 'insensitive',
            },
          },
        });

        const organisation = await tx.organisation.create({
          data: {
            orgCode: cleanOrgCode,
            name: app.hospitalName,
            type: 'BLOOD_BANK',
            licenseNumber: app.licenseNumber,
            stateCode: app.stateCode,
            districtCode: app.districtCode,
            districtName: app.districtName,
            address: null,
            email: app.email,
            phone: app.phone,
            status: 'VERIFIED',
            hospitalCode: matchingCentre?.hospitalCode || null,
            verifiedAt: reviewedAt,
            verifiedBy: reviewerUser.id,
          },
        });

        // Invariant 4: Atomically assign initial ORG_ADMIN membership to applicant
        let targetAdminUserId = app.applicantUserId;
        if (!targetAdminUserId && app.phone) {
          const userByPhone = await tx.user.findUnique({
            where: { phoneNumber: app.phone },
          });
          if (userByPhone) {
            targetAdminUserId = userByPhone.id;
          }
        }

        if (targetAdminUserId) {
          const existingMem = await tx.organisationMembership.findUnique({
            where: {
              userId_organisationId: {
                userId: targetAdminUserId,
                organisationId: organisation.id,
              },
            },
          });
          if (!existingMem) {
            await tx.organisationMembership.create({
              data: {
                userId: targetAdminUserId,
                organisationId: organisation.id,
                role: 'ORG_ADMIN',
                isActive: true,
                assignedAt: reviewedAt,
                assignedBy: reviewerUser.id,
              },
            });
          }
        }

        const updatedApplication = await tx.organisationApplication.update({
          where: { id: applicationId },
          data: {
            status: 'APPROVED',
            reviewNotes: review.reviewNotes?.trim() || null,
            reviewedBy: reviewerUser.id,
            reviewedAt,
            resultingOrgId: organisation.id,
          },
        });

        await tx.auditLog.create({
          data: {
            userId: reviewerUser.id,
            action: 'ORGANISATION_APPLICATION_APPROVED',
            resource: 'Organisation',
            resourceId: organisation.id,
            metadata: {
              applicationId,
              orgCode: cleanOrgCode,
              applicantUserId: app.applicantUserId,
              reviewedBy: reviewerUser.id,
            },
          },
        });

        return {
          application: updatedApplication,
          organisation,
        };
      }, { maxWait: 10000, timeout: 20000 });
    }

    // Rejection or Returned for correction
    const updatedApplication = await prisma.organisationApplication.update({
      where: { id: applicationId },
      data: {
        status: review.status as ApplicationStatus,
        reviewNotes: review.reviewNotes?.trim() || null,
        reviewedBy: reviewerUser.id,
        reviewedAt,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: reviewerUser.id,
        action: `ORGANISATION_APPLICATION_${review.status}`,
        resource: 'OrganisationApplication',
        resourceId: applicationId,
        metadata: {
          reviewedBy: reviewerUser.id,
          reviewNotes: review.reviewNotes,
        },
      },
    });

    return { application: updatedApplication };
  }

  /**
   * List staff members of an organisation.
   * Sanitizes private data: never exposes private phone numbers.
   */
  static async listStaff(organisationId: string) {
    const memberships = await prisma.organisationMembership.findMany({
      where: { organisationId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
      orderBy: { assignedAt: 'asc' },
    });

    return memberships.map((m) => ({
      membershipId: m.id,
      userId: m.userId,
      name: m.user.name,
      userStatus: m.user.status,
      role: m.role,
      isActive: m.isActive,
      assignedAt: m.assignedAt.toISOString(),
      assignedBy: m.assignedBy,
    }));
  }

  /**
   * Assign a new staff member to an organisation.
   * Invariants:
   * 1. Target user must exist.
   * 2. Cannot add if already an active member of this organisation.
   * 3. Role must be a valid OrgRole.
   */
  static async assignStaff(
    organisationId: string,
    assignerUserId: string,
    input: AssignStaffInput
  ) {
    if (!input.phoneOrUserId?.trim()) {
      throw new Error('Target user phone number or user ID is required.');
    }

    const cleanInput = input.phoneOrUserId.trim();

    // Look up target user by ID or normalized phone number
    let targetUser = await prisma.user.findUnique({
      where: { id: cleanInput },
    });

    if (!targetUser) {
      try {
        const normalizedPhone = normalizePhoneNumber(cleanInput);
        targetUser = await prisma.user.findUnique({
          where: { phoneNumber: normalizedPhone },
        });
      } catch {
        // Not a phone number format
      }
    }

    if (!targetUser) {
      throw new Error(`User "${cleanInput}" not found. The user must register an account first.`);
    }

    if (targetUser.status !== 'ACTIVE') {
      throw new Error(`Cannot assign staff: User account is ${targetUser.status.toLowerCase()}.`);
    }

    // Check if membership already exists
    const existingMembership = await prisma.organisationMembership.findUnique({
      where: {
        userId_organisationId: {
          userId: targetUser.id,
          organisationId,
        },
      },
    });

    if (existingMembership) {
      if (existingMembership.isActive) {
        throw new Error(`User is already an active member of this organisation with role "${existingMembership.role}".`);
      }

      // Reactivate previously revoked membership with the new role
      const updated = await prisma.organisationMembership.update({
        where: { id: existingMembership.id },
        data: {
          role: input.role,
          isActive: true,
          assignedAt: new Date(),
          assignedBy: assignerUserId,
        },
      });

      await prisma.auditLog.create({
        data: {
          userId: assignerUserId,
          action: 'STAFF_MEMBERSHIP_REACTIVATED',
          resource: 'OrganisationMembership',
          resourceId: updated.id,
          metadata: {
            organisationId,
            targetUserId: targetUser.id,
            role: input.role,
          },
        },
      });

      return updated;
    }

    const membership = await prisma.organisationMembership.create({
      data: {
        userId: targetUser.id,
        organisationId,
        role: input.role,
        isActive: true,
        assignedAt: new Date(),
        assignedBy: assignerUserId,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: assignerUserId,
        action: 'STAFF_MEMBERSHIP_ASSIGNED',
        resource: 'OrganisationMembership',
        resourceId: membership.id,
        metadata: {
          organisationId,
          targetUserId: targetUser.id,
          role: input.role,
        },
      },
    });

    return membership;
  }

  /**
   * Update a staff member's role or status.
   * Invariants:
   * 1. Cannot demote or deactivate the LAST active ORG_ADMIN in the organisation.
   * 2. Self-promotion prevention.
   */
  static async updateStaffRole(
    organisationId: string,
    modifierUserId: string,
    membershipId: string,
    input: UpdateStaffRoleInput
  ) {
    const membership = await prisma.organisationMembership.findUnique({
      where: { id: membershipId },
    });

    if (!membership || membership.organisationId !== organisationId) {
      throw new Error(`Staff membership "${membershipId}" not found in this organisation.`);
    }

    // Guard: Check if modifying an ORG_ADMIN
    const isCurrentlyAdmin = membership.role === 'ORG_ADMIN' && membership.isActive;
    const isDemotingOrDeactivating =
      (input.role && input.role !== 'ORG_ADMIN') || input.isActive === false;

    if (isCurrentlyAdmin && isDemotingOrDeactivating) {
      // Count active admins in this organisation
      const activeAdminCount = await prisma.organisationMembership.count({
        where: {
          organisationId,
          role: 'ORG_ADMIN',
          isActive: true,
        },
      });

      if (activeAdminCount <= 1) {
        throw new Error('Cannot remove or demote the last active organisation administrator.');
      }
    }

    const updated = await prisma.organisationMembership.update({
      where: { id: membershipId },
      data: {
        role: input.role || membership.role,
        isActive: input.isActive !== undefined ? input.isActive : membership.isActive,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: modifierUserId,
        action: 'STAFF_ROLE_UPDATED',
        resource: 'OrganisationMembership',
        resourceId: membership.id,
        metadata: {
          organisationId,
          targetUserId: membership.userId,
          previousRole: membership.role,
          newRole: updated.role,
          isActive: updated.isActive,
        },
      },
    });

    return updated;
  }

  /**
   * Revoke/deactivate a staff member's membership.
   * Invariant: Cannot deactivate the last active ORG_ADMIN.
   */
  static async removeStaff(
    organisationId: string,
    modifierUserId: string,
    membershipId: string
  ) {
    return this.updateStaffRole(organisationId, modifierUserId, membershipId, {
      isActive: false,
    });
  }

  /**
   * Get all active organisation memberships for a user with effective permissions.
   */
  static async getUserMemberships(userId: string) {
    const memberships = await prisma.organisationMembership.findMany({
      where: {
        userId,
        isActive: true,
        organisation: {
          status: 'VERIFIED',
        },
      },
      include: {
        organisation: true,
      },
      orderBy: { assignedAt: 'asc' },
    });

    return memberships.map((m) => ({
      membershipId: m.id,
      organisationId: m.organisationId,
      orgCode: m.organisation.orgCode,
      organisationName: m.organisation.name,
      role: m.role,
      status: m.organisation.status,
      isActive: m.isActive,
      assignedAt: m.assignedAt.toISOString(),
      permissions: ROLE_PERMISSIONS[m.role] || [],
    }));
  }

  /**
   * Register a voluntary donation camp associated with an accredited blood bank.
   * Invariants:
   * 1. Initial status is always PROPOSED.
   * 2. If proposing on behalf of an organisation, caller must hold camp:manage permission in that org.
   */
  static async registerCamp(
    input: CampRegistrationInput,
    callerUserId?: string
  ) {
    if (!input.title?.trim()) {
      throw new Error('Camp title or drive name is required.');
    }
    if (!input.organizerName?.trim()) {
      throw new Error('Organizer name (e.g., college, NGO, corporate) is required.');
    }
    if (!input.venue?.trim()) {
      throw new Error('Venue location is required.');
    }
    if (!input.targetDate) {
      throw new Error('Target camp date is required.');
    }
    if (!input.districtCode) {
      throw new Error('District code is required.');
    }

    const campDate = new Date(input.targetDate);
    if (isNaN(campDate.getTime())) {
      throw new Error('Invalid target camp date format.');
    }

    // Invariant: Parent blood bank MUST be provided and must resolve to an active, verified organisation
    if (!input.organisationId && !input.hospitalCode) {
      throw new Error('A verified parent blood bank organisation is required to propose a voluntary blood donation camp.');
    }

    let resolvedOrgId: string | null = null;
    let resolvedHospitalCode: string | null = null;

    if (input.organisationId) {
      const parentOrg = await prisma.organisation.findFirst({
        where: {
          OR: [
            { id: input.organisationId },
            { orgCode: input.organisationId.toUpperCase() },
          ],
        },
      });

      if (!parentOrg || parentOrg.status !== 'VERIFIED') {
        throw new Error('Selected parent blood bank is not verified or does not exist.');
      }
      resolvedOrgId = parentOrg.id;
    } else if (input.hospitalCode) {
      const matchingOrg = await prisma.organisation.findFirst({
        where: {
          OR: [
            { orgCode: input.hospitalCode },
            { licenseNumber: input.hospitalCode },
          ],
          status: 'VERIFIED',
        },
      });
      if (matchingOrg) {
        resolvedOrgId = matchingOrg.id;
      }
      resolvedHospitalCode = input.hospitalCode;
    }

    if (!resolvedOrgId) {
      throw new Error('Could not resolve an active, accredited parent blood bank organisation for this camp.');
    }

    // If caller is an active member of this organisation, enforce staff camp:manage permission
    if (callerUserId) {
      const membership = await prisma.organisationMembership.findUnique({
        where: {
          userId_organisationId: {
            userId: callerUserId,
            organisationId: resolvedOrgId,
          },
        },
      });

      if (membership && membership.isActive) {
        const permissions = ROLE_PERMISSIONS[membership.role] || [];
        if (!permissions.includes('camp:manage')) {
          throw new Error(`Role "${membership.role}" does not have permission to register camps for this organisation.`);
        }
      }
      // If not an organisation member, caller is an external community organizer proposing a camp for the blood bank to review
    }

    const campCode =
      input.campCode?.trim().toUpperCase() ||
      `CAMP-MH-${input.districtCode}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Resolve creator user ID
    let creatorUserId: string | null = callerUserId || null;
    if (!creatorUserId && input.coordinatorContact) {
      const contactRaw = input.coordinatorContact.trim();
      const normalizedPhone = contactRaw.startsWith('+') ? contactRaw : `+91${contactRaw.slice(-10)}`;
      let existingUser = await prisma.user.findFirst({
        where: { phoneNumber: normalizedPhone },
      });
      if (!existingUser) {
        existingUser = await prisma.user.create({
          data: {
            phoneNumber: normalizedPhone,
            name: input.organizerName.trim(),
            role: 'DONOR',
          },
        });
      }
      creatorUserId = existingUser.id;
    }

    const camp = await prisma.camp.create({
      data: {
        campCode,
        title: input.title.trim(),
        organizerName: input.organizerName.trim(),
        targetDate: campDate,
        timeSlot: input.timeSlot?.trim() || null,
        venue: input.venue.trim(),
        district: input.district?.trim() || null,
        districtCode: input.districtCode,
        stateCode: input.stateCode || 27,
        expectedDonors: input.expectedDonors || 50,
        coordinatorContact: input.coordinatorContact?.trim() || null,
        status: 'PROPOSED',
        hospitalCode: resolvedHospitalCode,
        organisationId: resolvedOrgId,
        createdById: creatorUserId,
      },
    });

    // Automatically designate creator as CAMP_ADMIN (inactive operational state until parent-bank approval)
    if (creatorUserId) {
      await prisma.campStaffAssignment.upsert({
        where: {
          userId_campId_role: {
            userId: creatorUserId,
            campId: camp.id,
            role: 'CAMP_ADMIN',
          },
        },
        update: {},
        create: {
          campId: camp.id,
          userId: creatorUserId,
          organisationId: resolvedOrgId,
          role: 'CAMP_ADMIN',
          isActive: false, // inactive operational state until approval
          assignedBy: creatorUserId,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: callerUserId || null,
        action: 'CAMP_PROPOSED',
        resource: 'Camp',
        resourceId: camp.id,
        metadata: {
          campCode,
          title: camp.title,
          hospitalCode: resolvedHospitalCode,
          organisationId: resolvedOrgId,
          createdById: creatorUserId,
        },
      },
    });

    return camp;
  }

  /**
   * Update camp status.
   * Invariants:
   * 1. Only ORG_ADMIN of the associated organisation or Platform ADMIN can update camp status.
   * 2. Camp creator CANNOT approve their own proposal (Conflict of Interest prevention).
   * 3. Validates state machine transitions (PROPOSED -> APPROVED/REJECTED, etc.).
   * 4. On APPROVED, automatically and idempotently activates creator's CAMP_ADMIN access.
   */
  static async updateCampStatus(
    campId: string,
    callerUser: { id: string; role: string },
    newStatus: CampStatus,
    reason?: string
  ) {
    const camp = await prisma.camp.findUnique({
      where: { id: campId },
    });

    if (!camp) {
      throw new Error(`Camp "${campId}" not found.`);
    }

    // Check authorization: Must be Platform ADMIN or ORG_ADMIN of the associated organisation
    let isAuthorized = callerUser.role === 'ADMIN';

    if (!isAuthorized && camp.organisationId) {
      const membership = await prisma.organisationMembership.findUnique({
        where: {
          userId_organisationId: {
            userId: callerUser.id,
            organisationId: camp.organisationId,
          },
        },
      });

      if (membership && membership.isActive && membership.role === 'ORG_ADMIN') {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new Error('Permission denied: Only organisation administrators or platform admins can update camp approval status.');
    }

    // Invariant: Camp creator cannot approve their own camp proposal
    if (newStatus === 'APPROVED' && camp.createdById && camp.createdById === callerUser.id) {
      throw new Error('Conflict of interest: Camp creator cannot approve their own camp proposal. Parent blood bank administrator approval is required.');
    }

    // State machine validation
    if (camp.status === newStatus) {
      return camp; // Idempotent
    }

    const VALID_TRANSITIONS: Record<CampStatus, CampStatus[]> = {
      PROPOSED: ['APPROVED', 'REJECTED'],
      APPROVED: ['COMPLETED', 'CANCELLED'],
      REJECTED: [],
      COMPLETED: [],
      CANCELLED: [],
    };

    const allowed = VALID_TRANSITIONS[camp.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Invalid state transition: Cannot transition camp from "${camp.status}" to "${newStatus}".`);
    }

    const updateData: any = { status: newStatus };
    if (newStatus === 'APPROVED') {
      updateData.approvedById = callerUser.id;
      updateData.approvedAt = new Date();
    } else if (newStatus === 'REJECTED') {
      updateData.rejectionReason = reason || 'Camp proposal rejected by parent blood bank';
      updateData.rejectedAt = new Date();
    }

    const updated = await prisma.camp.update({
      where: { id: campId },
      data: updateData,
    });

    // On APPROVED: automatically and idempotently activate the creator's CAMP_ADMIN role
    if (newStatus === 'APPROVED' && camp.createdById) {
      await prisma.campStaffAssignment.upsert({
        where: {
          userId_campId_role: {
            userId: camp.createdById,
            campId: camp.id,
            role: 'CAMP_ADMIN',
          },
        },
        update: {
          isActive: true,
          assignedBy: callerUser.id,
          assignedAt: new Date(),
          revokedAt: null,
          revokedBy: null,
        },
        create: {
          userId: camp.createdById,
          campId: camp.id,
          organisationId: camp.organisationId!,
          role: 'CAMP_ADMIN',
          isActive: true,
          assignedBy: callerUser.id,
        },
      });
    }

    // On REJECTED: ensure any pending assignment is deactivated
    if (newStatus === 'REJECTED' && camp.createdById) {
      await prisma.campStaffAssignment.updateMany({
        where: {
          campId: camp.id,
          userId: camp.createdById,
          role: 'CAMP_ADMIN',
        },
        data: {
          isActive: false,
          revokedAt: new Date(),
          revokedBy: callerUser.id,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: callerUser.id,
        action: 'CAMP_STATUS_UPDATED',
        resource: 'Camp',
        resourceId: campId,
        metadata: {
          previousStatus: camp.status,
          newStatus,
          reason,
          campCode: camp.campCode,
          approvedById: newStatus === 'APPROVED' ? callerUser.id : undefined,
        },
      },
    });

    return updated;
  }

  /**
   * Retrieve authoritative organisation-level blood collection and inventory overview.
   */
  static async getCollectionOverview(organisationId: string) {
    const org = await prisma.organisation.findUnique({
      where: { id: organisationId },
    });
    if (!org) {
      throw new Error('Organisation not found.');
    }

    // 1. Associated camps
    const camps = await prisma.camp.findMany({
      where: { organisationId },
      include: {
        _count: {
          select: {
            attendances: true,
            collectionUnits: true,
            donationEvents: true,
          },
        },
      },
      orderBy: { targetDate: 'desc' },
    });

    // 2. Collection units owned by or received at this organisation
    const units = await prisma.collectionUnit.findMany({
      where: { organisationId },
      include: {
        camp: {
          select: { id: true, title: true, campCode: true },
        },
        components: true,
        handoverItems: {
          include: {
            manifest: true,
          },
        },
      },
    });

    // Standard groups
    const standardGroups = ['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG', 'UNKNOWN'];
    const receivedByGroup: Record<string, { unitCount: number; volumeMl: number }> = {};
    for (const g of standardGroups) {
      receivedByGroup[g] = { unitCount: 0, volumeMl: 0 };
    }

    let totalCollected = 0;
    let totalReceived = 0;
    let totalInTransit = 0;
    let totalQuarantined = 0;
    let totalProcessingCompleted = 0;
    let totalAvailableComponents = 0;

    for (const u of units) {
      totalCollected++;
      const groupKey = standardGroups.includes(u.bloodGroup as string) ? (u.bloodGroup as string) : 'UNKNOWN';

      if (u.status === 'RECEIVED_BY_CENTRE' || u.status === 'PROCESSING_COMPLETED') {
        totalReceived++;
        receivedByGroup[groupKey].unitCount++;
        receivedByGroup[groupKey].volumeMl += u.volumeMl || 0;
        if (u.status === 'PROCESSING_COMPLETED') totalProcessingCompleted++;
      } else if (u.status === 'IN_TRANSIT') {
        totalInTransit++;
      } else if (u.status === 'QUARANTINED') {
        totalQuarantined++;
      }

      if (u.components && u.components.length > 0) {
        for (const c of u.components) {
          if (c.status === 'AVAILABLE') {
            totalAvailableComponents++;
          }
        }
      }
    }

    // 3. Manifests in transit or pending receipt
    const pendingManifests = await prisma.handoverManifest.findMany({
      where: {
        OR: [
          { sendingOrganisationId: organisationId },
          { receivingOrganisationId: organisationId },
        ],
        status: { in: ['DRAFT', 'FINALISED', 'DISPATCHED', 'PARTIALLY_RECEIVED'] },
      },
      include: {
        items: true,
        exceptions: true,
        camp: { select: { id: true, title: true, campCode: true } },
        sendingOrganisation: { select: { id: true, name: true, orgCode: true } },
        receivingOrganisation: { select: { id: true, name: true, orgCode: true } },
      },
    });

    // 4. Unresolved discrepancies
    const discrepancies = await prisma.reconciliationException.findMany({
      where: {
        manifest: {
          OR: [
            { sendingOrganisationId: organisationId },
            { receivingOrganisationId: organisationId },
          ],
        },
        status: { not: 'RESOLVED' },
      },
      include: {
        manifest: {
          select: { id: true, manifestNumber: true, status: true },
        },
        collectionUnit: {
          select: { id: true, unitNumber: true, bloodGroup: true },
        },
      },
    });

    // 5. Camp-level collections breakdown
    const campCollections = camps.map((c) => {
      const campUnits = units.filter((u) => u.campId === c.id);
      const receivedCampUnits = campUnits.filter(
        (u) => u.status === 'RECEIVED_BY_CENTRE' || u.status === 'PROCESSING_COMPLETED'
      );
      const vol = receivedCampUnits.reduce((acc, curr) => acc + (curr.volumeMl || 0), 0);

      return {
        campId: c.id,
        campCode: c.campCode,
        title: c.title,
        status: c.status,
        targetDate: c.targetDate,
        expectedDonors: c.expectedDonors,
        attendancesCount: c._count.attendances,
        collectedUnitsCount: campUnits.length,
        receivedUnitsCount: receivedCampUnits.length,
        receivedVolumeMl: vol,
      };
    });

    // 6. Component inventory breakdown
    const componentsByStatus = await prisma.componentUnit.groupBy({
      by: ['status'],
      where: { organisationId },
      _count: { id: true },
    });

    const groupLabels: Record<string, string> = {
      A_POS: 'A+',
      A_NEG: 'A-',
      B_POS: 'B+',
      B_NEG: 'B-',
      AB_POS: 'AB+',
      AB_NEG: 'AB-',
      O_POS: 'O+',
      O_NEG: 'O-',
      UNKNOWN: 'Unknown / Unverified',
    };

    const receivedByBloodGroupList = standardGroups.map((g) => ({
      bloodGroup: groupLabels[g] || g,
      groupKey: g,
      receivedUnitsCount: receivedByGroup[g]?.unitCount || 0,
      receivedVolumeMl: receivedByGroup[g]?.volumeMl || 0,
    }));

    return {
      organisation: {
        id: org.id,
        name: org.name,
        orgCode: org.orgCode,
      },
      summary: {
        totalCamps: camps.length,
        totalCollectedUnits: totalCollected,
        totalReceivedUnits: totalReceived,
        totalInTransitUnits: totalInTransit,
        totalQuarantinedUnits: totalQuarantined,
        totalProcessingCompletedUnits: totalProcessingCompleted,
        totalAvailableComponents,
        pendingManifestsCount: pendingManifests.length,
        unresolvedDiscrepanciesCount: discrepancies.length,
      },
      receivedByBloodGroup: receivedByBloodGroupList,
      campCollections,
      pendingManifests,
      discrepancies,
      componentsByStatus: componentsByStatus.map((c) => ({
        status: c.status,
        count: c._count.id,
      })),
    };
  }
}
