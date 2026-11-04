import { Router, Response } from 'express';
import { OrganisationService } from '../services/organisation';
import { CampOperationsService } from '../services/campOperations';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import {
  requirePlatformAdmin,
  requireOrgPermission,
  OrgScopedRequest,
} from '../middleware/rbac';
import { CampStatus, CampStaffRole } from '@prisma/client';

export const organisationsRouter = Router();

// ====================================================
// SECTION 1: Current User's Organisation Memberships
// ====================================================

/**
 * GET /api/v1/organisations/me/memberships
 * View the authenticated user's active organisation memberships and effective permissions.
 */
organisationsRouter.get(
  '/organisations/me/memberships',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const memberships = await OrganisationService.getUserMemberships(req.user.id);
      res.json({
        success: true,
        count: memberships.length,
        data: memberships,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { message: err.message, code: 'INTERNAL_ERROR' },
      });
    }
  }
);

/**
 * GET /api/v1/organisations/:organisationId/collection-overview
 * Retrieve organisation-level blood collection, camp receipts, and inventory reconciliation overview.
 * Protected: Requires active membership or platform admin.
 */
organisationsRouter.get(
  '/organisations/:organisationId/collection-overview',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organisationId = String(req.params.organisationId);

      if (req.user.role !== 'ADMIN') {
        const membership = await prisma.organisationMembership.findUnique({
          where: {
            userId_organisationId: {
              userId: req.user.id,
              organisationId,
            },
          },
        });
        if (!membership || !membership.isActive) {
          return res.status(403).json({
            success: false,
            error: { message: 'Permission denied: Not an active member of this organisation.', code: 'FORBIDDEN' },
          });
        }
      }

      const overview = await OrganisationService.getCollectionOverview(organisationId);
      res.json({
        success: true,
        data: overview,
      });
    } catch (err: any) {
      const isNotFound = err.message?.includes('not found');
      res.status(isNotFound ? 404 : 500).json({
        success: false,
        error: { message: err.message, code: isNotFound ? 'NOT_FOUND' : 'INTERNAL_ERROR' },
      });
    }
  }
);

// ====================================================
// SECTION 2: Institutional Onboarding Application Lifecycle
// ====================================================

/**
 * POST /api/v1/organisations/applications
 * Submit an institutional onboarding application.
 */
organisationsRouter.post(
  '/organisations/applications',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        hospitalName,
        licenseNumber,
        stateCode,
        districtCode,
        districtName,
        contactPerson,
        email,
        phone,
        componentTypes,
      } = req.body;

      // Check optional session for authenticated applicant
      let applicantUserId: string | undefined;
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: true },
        });
        if (session && !session.revokedAt && session.expiresAt > new Date()) {
          applicantUserId = session.userId;
        }
      }

      const application = await OrganisationService.submitApplication(
        {
          hospitalName,
          licenseNumber,
          stateCode,
          districtCode,
          districtName,
          contactPerson,
          email,
          phone,
          componentTypes,
        },
        applicantUserId
      );

      res.status(201).json({
        success: true,
        message: 'Onboarding application submitted successfully and queued for verification.',
        data: application,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { message: err.message || 'Failed to submit application.', code: 'INVALID_SUBMISSION' },
      });
    }
  }
);

/**
 * GET /api/v1/organisations/applications
 * List all onboarding applications.
 * Restricted strictly to Platform Administrators.
 */
organisationsRouter.get(
  '/organisations/applications',
  requireAuth,
  requirePlatformAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const statusParam = req.query.status as string | undefined;
      const filter = statusParam && statusParam !== 'ALL'
        ? { status: statusParam as any }
        : undefined;

      const applications = await OrganisationService.listApplications(req.user, filter);

      res.json({
        success: true,
        count: applications.length,
        data: applications,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { message: err.message || 'Failed to list applications.', code: 'INTERNAL_ERROR' },
      });
    }
  }
);

/**
 * GET /api/v1/organisations/me/applications
 * List all onboarding applications submitted by or associated with the authenticated user.
 */
organisationsRouter.get(
  '/organisations/me/applications',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const applications = await OrganisationService.getMyApplications(req.user);
      res.json({
        success: true,
        count: applications.length,
        data: applications,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { message: err.message || 'Failed to list user applications.', code: 'INTERNAL_ERROR' },
      });
    }
  }
);

/**
 * GET /api/v1/organisations/applications/:id
 * Retrieve details of an application.
 * Restricted to the applicant or a Platform Administrator.
 */
organisationsRouter.get(
  '/organisations/applications/:id',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const application = await OrganisationService.getApplication(id, req.user);

      res.json({
        success: true,
        data: application,
      });
    } catch (err: any) {
      const status = err.message?.includes('Access denied') ? 403 : 404;
      res.status(status).json({
        success: false,
        error: { message: err.message, code: status === 403 ? 'FORBIDDEN' : 'NOT_FOUND' },
      });
    }
  }
);

/**
 * POST /api/v1/organisations/applications/:id/review
 * Review an onboarding application (APPROVE / REJECT / RETURN_FOR_CORRECTION).
 * Requires Platform Administrator privileges. Applicants cannot approve their own application.
 */
organisationsRouter.post(
  '/organisations/applications/:id/review',
  requireAuth,
  requirePlatformAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = String(req.params.id);
      const { status, reviewNotes, orgCode } = req.body;

      if (!status || !['APPROVED', 'REJECTED', 'RETURNED_FOR_CORRECTION'].includes(status)) {
        res.status(400).json({
          success: false,
          error: {
            message: 'Review status must be one of: APPROVED, REJECTED, RETURNED_FOR_CORRECTION.',
            code: 'INVALID_STATUS',
          },
        });
        return;
      }

      const result = await OrganisationService.reviewApplication(id, req.user, {
        status,
        reviewNotes,
        reviewedBy: req.user.id,
        orgCode,
      });

      res.json({
        success: true,
        message: `Application reviewed successfully with status ${status}.`,
        data: result,
      });
    } catch (err: any) {
      const isConflict = err.message?.includes('Conflict of interest');
      res.status(isConflict ? 403 : 400).json({
        success: false,
        error: { message: err.message || 'Failed to review application.', code: isConflict ? 'CONFLICT_OF_INTEREST' : 'INVALID_REVIEW' },
      });
    }
  }
);

// ====================================================
// SECTION 3: Organisation Verification & Public Directory Separation
// ====================================================

/**
 * GET /api/v1/organisations
 * Public verified participating blood banks directory.
 * Strictly separates verified facilities from raw e-RaktKosh external listings.
 * Never exposes internal staff lists or application files.
 */
organisationsRouter.get('/organisations', async (req, res: Response) => {
  try {
    const districtCode = typeof req.query.districtCode === 'string' ? req.query.districtCode : undefined;
    const stateCode = typeof req.query.stateCode === 'string' ? req.query.stateCode : undefined;

    const where: any = { status: 'VERIFIED' };
    if (districtCode) where.districtCode = parseInt(districtCode, 10);
    if (stateCode) where.stateCode = parseInt(stateCode, 10);

    const organisations = await prisma.organisation.findMany({
      where,
      select: {
        id: true,
        orgCode: true,
        name: true,
        type: true,
        stateCode: true,
        districtCode: true,
        districtName: true,
        address: true,
        email: true,
        phone: true,
        status: true,
        verifiedAt: true,
        hospitalCode: true,
        bloodCentre: {
          select: {
            hospitalCode: true,
            hospitalName: true,
            address: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json({
      success: true,
      count: organisations.length,
      data: organisations,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { message: err.message, code: 'INTERNAL_ERROR' },
    });
  }
});

/**
 * GET /api/v1/organisations/:id
 * Retrieve verified organisation profile.
 * Protected: Requires active membership in this organisation.
 */
organisationsRouter.get(
  '/organisations/:id',
  requireAuth,
  requireOrgPermission(['org:view']),
  async (req: OrgScopedRequest, res: Response) => {
    try {
      res.json({
        success: true,
        data: {
          organisation: req.organisation,
          currentUserRole: req.orgMembership.role,
          effectivePermissions: req.orgPermissions,
        },
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { message: err.message, code: 'INTERNAL_ERROR' },
      });
    }
  }
);

/**
 * GET /api/v1/organisations/:id/permissions
 * Retrieve current user's effective permissions for this organisation (for UI presentation).
 */
organisationsRouter.get(
  '/organisations/:id/permissions',
  requireAuth,
  requireOrgPermission(['org:view']),
  async (req: OrgScopedRequest, res: Response) => {
    res.json({
      success: true,
      data: {
        organisationId: req.organisation.id,
        role: req.orgMembership.role,
        permissions: req.orgPermissions,
      },
    });
  }
);

/**
 * GET /api/v1/organisations/:id/location
 * Retrieve the organisation's confirmed GPS coordinates and setup status.
 */
organisationsRouter.get(
  '/organisations/:id/location',
  requireAuth,
  requireOrgPermission(['org:view']),
  async (req: OrgScopedRequest, res: Response) => {
    try {
      const location = await OrganisationService.getLocation(String(req.params.id));
      return res.json({
        success: true,
        data: location,
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: { message: err.message || 'Failed to retrieve location.', code: 'LOCATION_FETCH_FAILED' },
      });
    }
  }
);

/**
 * PUT /api/v1/organisations/:id/location
 * Explicitly set or update confirmed Blood Bank location.
 * Requires active ORG_ADMIN role and operational:write permission.
 */
organisationsRouter.put(
  '/organisations/:id/location',
  requireAuth,
  requireOrgPermission(['operational:write'], ['ORG_ADMIN']),
  async (req: OrgScopedRequest, res: Response) => {
    try {
      const { latitude, longitude, locationAddress } = req.body || {};

      if (typeof latitude !== 'number' || typeof longitude !== 'number') {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Both numeric latitude and longitude coordinates are required.',
            code: 'INVALID_COORDINATES',
          },
        });
      }

      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Latitude must be between -90 and 90, and longitude between -180 and 180.',
            code: 'COORDINATES_OUT_OF_BOUNDS',
          },
        });
      }

      const updated = await OrganisationService.confirmLocation(String(req.params.id), req.user.id, {
        latitude,
        longitude,
        locationAddress,
      });

      return res.json({
        success: true,
        data: updated,
        message: 'Blood Bank location confirmed successfully.',
      });
    } catch (err: any) {
      return res.status(400).json({
        success: false,
        error: { message: err.message || 'Failed to confirm location.', code: 'LOCATION_CONFIRM_FAILED' },
      });
    }
  }
);

// ====================================================
// SECTION 4: Organisation Staff Management & RBAC
// ====================================================

/**
 * GET /api/v1/organisations/:id/staff
 * List staff members of the organisation.
 * Protected: Requires membership with staff:list permission.
 * Sanitized: Never exposes private phone numbers.
 */
organisationsRouter.get(
  '/organisations/:id/staff',
  requireAuth,
  requireOrgPermission(['staff:list']),
  async (req: OrgScopedRequest, res: Response) => {
    try {
      const staff = await OrganisationService.listStaff(req.organisation.id);
      res.json({
        success: true,
        count: staff.length,
        data: staff,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { message: err.message, code: 'INTERNAL_ERROR' },
      });
    }
  }
);

/**
 * POST /api/v1/organisations/:id/staff
 * Assign an existing user to the organisation with a designated role.
 * Protected: Requires active ORG_ADMIN role.
 */
organisationsRouter.post(
  '/organisations/:id/staff',
  requireAuth,
  requireOrgPermission(['staff:invite'], ['ORG_ADMIN']),
  async (req: OrgScopedRequest, res: Response) => {
    try {
      const { phoneOrUserId, role } = req.body;

      if (!phoneOrUserId || !role) {
        res.status(400).json({
          success: false,
          error: { message: 'Both phoneOrUserId and role are required.', code: 'MISSING_FIELDS' },
        });
        return;
      }

      const membership = await OrganisationService.assignStaff(
        req.organisation.id,
        req.user.id,
        { phoneOrUserId, role }
      );

      res.status(201).json({
        success: true,
        message: 'Staff member assigned successfully.',
        data: membership,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { message: err.message || 'Failed to assign staff member.', code: 'ASSIGNMENT_FAILED' },
      });
    }
  }
);

/**
 * PATCH /api/v1/organisations/:id/staff/:membershipId
 * Update a staff member's role or status.
 * Protected: Requires active ORG_ADMIN role.
 * Invariant: Cannot demote the last active ORG_ADMIN.
 */
organisationsRouter.patch(
  '/organisations/:id/staff/:membershipId',
  requireAuth,
  requireOrgPermission(['staff:update_role'], ['ORG_ADMIN']),
  async (req: OrgScopedRequest, res: Response) => {
    try {
      const membershipId = String(req.params.membershipId);
      const { role, isActive } = req.body;

      const updated = await OrganisationService.updateStaffRole(
        req.organisation.id,
        req.user.id,
        membershipId,
        { role, isActive }
      );

      res.json({
        success: true,
        message: 'Staff member role updated successfully.',
        data: updated,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { message: err.message || 'Failed to update staff member.', code: 'UPDATE_FAILED' },
      });
    }
  }
);

/**
 * DELETE /api/v1/organisations/:id/staff/:membershipId
 * Deactivate a staff member's membership.
 * Protected: Requires active ORG_ADMIN role.
 * Invariant: Cannot remove the last active ORG_ADMIN.
 */
organisationsRouter.delete(
  '/organisations/:id/staff/:membershipId',
  requireAuth,
  requireOrgPermission(['staff:remove'], ['ORG_ADMIN']),
  async (req: OrgScopedRequest, res: Response) => {
    try {
      const membershipId = String(req.params.membershipId);

      const revoked = await OrganisationService.removeStaff(
        req.organisation.id,
        req.user.id,
        membershipId
      );

      res.json({
        success: true,
        message: 'Staff membership deactivated successfully.',
        data: revoked,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { message: err.message || 'Failed to revoke staff membership.', code: 'REVOCATION_FAILED' },
      });
    }
  }
);

// ====================================================
// SECTION 5: Camp Authorisation Boundary
// ====================================================

/**
 * POST /api/v1/camps
 * Propose/register a voluntary donation camp associated with an accredited blood bank.
 */
organisationsRouter.post('/camps', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      title,
      organizerName,
      targetDate,
      timeSlot,
      venue,
      district,
      districtCode,
      stateCode,
      expectedDonors,
      coordinatorContact,
      hospitalCode,
      organisationId,
    } = req.body;

    // Check optional authenticated user
    let callerUserId: string | undefined;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const session = await prisma.session.findUnique({
        where: { token },
      });
      if (session && !session.revokedAt && session.expiresAt > new Date()) {
        callerUserId = session.userId;
      }
    }

    const camp = await OrganisationService.registerCamp(
      {
        title,
        organizerName,
        targetDate,
        timeSlot,
        venue,
        district,
        districtCode: parseInt(districtCode, 10),
        stateCode: stateCode ? parseInt(stateCode, 10) : 27,
        expectedDonors: expectedDonors ? parseInt(expectedDonors, 10) : 50,
        coordinatorContact,
        hospitalCode,
        organisationId,
      },
      callerUserId
    );

    res.status(201).json({
      success: true,
      message: 'Voluntary blood camp proposed successfully.',
      data: camp,
    });
  } catch (err: any) {
    res.status(400).json({
      success: false,
      error: { message: err.message || 'Failed to register camp proposal.', code: 'CAMP_REGISTRATION_FAILED' },
    });
  }
});

/**
 * GET /api/v1/camps
 * List camps. Public display strictly shows ONLY APPROVED or COMPLETED camps.
 * Authenticated organisation staff can view all camps including PROPOSED.
 */
organisationsRouter.get('/camps', async (req, res: Response) => {
  try {
    const districtCode = typeof req.query.districtCode === 'string' ? req.query.districtCode : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const organisationId = typeof req.query.organisationId === 'string' ? req.query.organisationId : undefined;

    // Check optional authenticated user
    let callerUserId: string | undefined;
    let isPlatformAdmin = false;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: true },
      });
      if (session && !session.revokedAt && session.expiresAt > new Date()) {
        callerUserId = session.userId;
        isPlatformAdmin = session.user.role === 'ADMIN';
      }
    }

    const where: any = {};
    if (districtCode) where.districtCode = parseInt(districtCode, 10);
    if (organisationId) where.organisationId = organisationId;

    let isOrgMember = false;
    if (callerUserId && organisationId) {
      const membership = await prisma.organisationMembership.findUnique({
        where: {
          userId_organisationId: {
            userId: callerUserId,
            organisationId,
          },
        },
      });
      if (membership && membership.isActive) {
        isOrgMember = true;
      }
    }

    if (organisationId) {
      if (isOrgMember || isPlatformAdmin) {
        // Authorized organisation staff or platform admin: can view all camps or filter by status
        if (status) {
          where.status = status;
        }
      } else {
        // Non-member or unauthenticated caller:
        // If requesting non-public internal camp status, reject with 403 Forbidden!
        if (status && !['APPROVED', 'COMPLETED'].includes(status)) {
          return res.status(403).json({
            success: false,
            error: {
              message: 'Access denied: You are not authorized to view internal or pending camp proposals for this organisation.',
              code: 'FORBIDDEN',
            },
          });
        }
        where.status = status || 'APPROVED';
      }
    } else {
      // Global/Public listing without organisationId scope:
      if (!isPlatformAdmin) {
        if (status && ['APPROVED', 'COMPLETED'].includes(status)) {
          where.status = status;
        } else {
          where.status = 'APPROVED';
        }
      } else if (status) {
        where.status = status;
      }
    }

    const camps = await prisma.camp.findMany({
      where,
      include: {
        bloodCentre: true,
        creator: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
          },
        },
        organisation: {
          select: {
            id: true,
            orgCode: true,
            name: true,
            status: true,
          },
        },
      },
      orderBy: { targetDate: 'asc' },
    });

    res.json({
      success: true,
      count: camps.length,
      data: camps,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: { message: err.message, code: 'INTERNAL_ERROR' },
    });
  }
});

/**
 * GET /api/v1/camps/me/assignments
 * Retrieve all camps accessible to the currently authenticated user (explicit assignments or parent-bank administration).
 */
organisationsRouter.get(
  '/camps/me/assignments',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const assignments = await CampOperationsService.getMyCampAssignments(req.user);
      res.json({
        success: true,
        count: assignments.length,
        data: assignments,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: { message: err.message || 'Failed to retrieve camp assignments.', code: 'INTERNAL_ERROR' },
      });
    }
  }
);

/**
 * GET /api/v1/camps/:id
 * Retrieve detailed camp record.
 */
organisationsRouter.get('/camps/:id', async (req, res: Response) => {
  try {
    const campId = String(req.params.id);

    let callerUser: any = undefined;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: true },
      });
      if (session && !session.revokedAt && session.expiresAt > new Date()) {
        callerUser = session.user;
      }
    }

    const details = await CampOperationsService.getCampDetails(campId, callerUser);

    res.json({
      success: true,
      data: details,
    });
  } catch (err: any) {
    const isNotFound = err.message?.includes('not found');
    const isForbidden = err.message?.includes('Permission denied');
    res.status(isNotFound ? 404 : isForbidden ? 403 : 500).json({
      success: false,
      error: { message: err.message, code: isNotFound ? 'NOT_FOUND' : isForbidden ? 'FORBIDDEN' : 'INTERNAL_ERROR' },
    });
  }
});

/**
 * GET /api/v1/camps/:id/analytics
 * Authoritative blood collection overview, blood-group-wise breakdown, and unit traceability metrics.
 */
organisationsRouter.get('/camps/:id/analytics', async (req, res: Response) => {
  try {
    const { id: campId } = req.params;
    let callerUser: any = undefined;

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const session = await prisma.session.findUnique({
        where: { token },
        include: { user: true },
      });
      if (session && !session.revokedAt && session.expiresAt > new Date()) {
        callerUser = session.user;
      }
    }

    const analytics = await CampOperationsService.getCampAnalytics(campId, callerUser);

    res.json({
      success: true,
      data: analytics,
    });
  } catch (err: any) {
    const isForbidden = err.message?.includes('Permission denied');
    const isNotFound = err.message?.includes('not found');
    res.status(isForbidden ? 403 : (isNotFound ? 404 : 500)).json({
      success: false,
      error: { message: err.message, code: isForbidden ? 'FORBIDDEN' : (isNotFound ? 'NOT_FOUND' : 'INTERNAL_ERROR') },
    });
  }
});

/**
 * PATCH /api/v1/camps/:id
 * Edit camp details (venue, targetDate, etc.).
 * Protected: Requires ORG_ADMIN or COLLECTION_STAFF of parent organisation.
 */
organisationsRouter.patch(
  '/camps/:id',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const campId = String(req.params.id);
      const updated = await CampOperationsService.editCamp(campId, req.user, req.body);
      res.json({
        success: true,
        message: 'Camp details updated successfully.',
        data: updated,
      });
    } catch (err: any) {
      const isForbidden = err.message?.includes('Permission denied');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        error: { message: err.message || 'Failed to edit camp.', code: isForbidden ? 'FORBIDDEN' : 'UPDATE_FAILED' },
      });
    }
  }
);

/**
 * PATCH /api/v1/camps/:id/status
 * Update camp status (e.g. APPROVED, REJECTED, CANCELLED).
 * Protected: Requires ORG_ADMIN of parent organisation or Platform ADMIN.
 */
organisationsRouter.patch(
  '/camps/:id/status',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const campId = String(req.params.id);
      const { status, reason } = req.body;

      if (!status || !['APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'].includes(status)) {
        res.status(400).json({
          success: false,
          error: { message: 'Invalid camp status.', code: 'INVALID_STATUS' },
        });
        return;
      }

      if (status === 'COMPLETED') {
        const closeResult = await CampOperationsService.closeCamp(campId, req.user, { notes: reason });
        res.json({
          success: true,
          message: closeResult.message,
          data: closeResult.camp,
        });
        return;
      }

      const updated = await OrganisationService.updateCampStatus(
        campId,
        req.user,
        status as CampStatus,
        reason
      );

      res.json({
        success: true,
        message: `Camp status updated to ${status}.`,
        data: updated,
      });
    } catch (err: any) {
      const isForbidden = err.message?.includes('Permission denied') || err.message?.includes('Conflict of interest');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        error: { message: err.message || 'Failed to update camp status.', code: isForbidden ? 'FORBIDDEN' : 'UPDATE_FAILED' },
      });
    }
  }
);

/**
 * GET /api/v1/camps/:id/handover
 * Retrieve collection units eligible for handover and active handover manifest.
 */
organisationsRouter.get(
  '/camps/:id/handover',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const campId = String(req.params.id);
      const data = await CampOperationsService.getCampHandover(campId, req.user);
      res.json({ success: true, data });
    } catch (err: any) {
      const status = err.message?.includes('Permission denied') ? 403 : 400;
      res.status(status).json({
        success: false,
        error: { message: err.message || 'Failed to retrieve camp handover data.', code: 'HANDOVER_QUERY_FAILED' },
      });
    }
  }
);

/**
 * POST /api/v1/camps/:id/handover
 * Submit authoritative handover manifest of eligible collection units to parent blood bank.
 */
organisationsRouter.post(
  '/camps/:id/handover',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const campId = String(req.params.id);
      const { transportDetails, notes } = req.body;
      const result = await CampOperationsService.submitCampHandover(campId, req.user, {
        transportDetails,
        notes,
      });
      res.status(result.idempotent ? 200 : 201).json({
        success: true,
        message: result.message,
        data: result.manifest,
      });
    } catch (err: any) {
      const status = err.message?.includes('Permission denied') ? 403 : 400;
      res.status(status).json({
        success: false,
        error: { message: err.message || 'Failed to submit camp handover.', code: 'HANDOVER_SUBMISSION_FAILED' },
      });
    }
  }
);

/**
 * GET /api/v1/camps/:id/closure-readiness
 * Authoritative assessment of whether a camp is safe and ready for formal closure.
 */
organisationsRouter.get(
  '/camps/:id/closure-readiness',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const campId = String(req.params.id);
      const readiness = await CampOperationsService.getCampClosureReadiness(campId, req.user);
      res.json({ success: true, data: readiness });
    } catch (err: any) {
      const status = err.message?.includes('Permission denied') ? 403 : 400;
      res.status(status).json({
        success: false,
        error: { message: err.message || 'Failed to assess closure readiness.', code: 'CLOSURE_READINESS_FAILED' },
      });
    }
  }
);

/**
 * POST /api/v1/camps/:id/close
 * Formally close and archive a voluntary donation camp, revoking operational access.
 */
organisationsRouter.post(
  '/camps/:id/close',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const campId = String(req.params.id);
      const { notes } = req.body;
      const result = await CampOperationsService.closeCamp(campId, req.user, { notes });
      res.json({
        success: true,
        message: result.message,
        data: result.camp,
      });
    } catch (err: any) {
      const status = err.message?.includes('Permission denied') ? 403 : 400;
      res.status(status).json({
        success: false,
        error: { message: err.message || 'Failed to close camp.', code: 'CAMP_CLOSURE_FAILED' },
      });
    }
  }
);

/**
 * POST /api/v1/camps/:id/readiness
 * Verify or modify operational readiness boundary.
 * Protected: Requires ORG_ADMIN or COLLECTION_STAFF of parent organisation.
 */
organisationsRouter.post(
  '/camps/:id/readiness',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const campId = String(req.params.id);
      const updated = await CampOperationsService.verifyCampReadiness(campId, req.user, req.body);
      res.json({
        success: true,
        message: updated.isReadyForCollection
          ? 'Camp operational readiness verified successfully.'
          : 'Camp operational readiness updated.',
        data: updated,
      });
    } catch (err: any) {
      const isForbidden = err.message?.includes('Permission denied');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        error: { message: err.message || 'Failed to verify camp readiness.', code: isForbidden ? 'FORBIDDEN' : 'READINESS_FAILED' },
      });
    }
  }
);

/**
 * POST /api/v1/camps/:id/attendance
 * Register donor attendance for camp.
 * Duplicate attendance for the same donor at the same camp is strictly prevented.
 */
organisationsRouter.post(
  '/camps/:id/attendance',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const campId = String(req.params.id);
      const attendance = await CampOperationsService.registerAttendance(campId, req.user, req.body);
      res.status(201).json({
        success: true,
        message: 'Donor attendance registered successfully.',
        data: attendance,
      });
    } catch (err: any) {
      const isConflict = err.message?.includes('already registered');
      const isForbidden = err.message?.includes('Permission denied');
      res.status(isConflict ? 409 : isForbidden ? 403 : 400).json({
        success: false,
        error: {
          message: err.message || 'Failed to register attendance.',
          code: isConflict ? 'DUPLICATE_ATTENDANCE' : isForbidden ? 'FORBIDDEN' : 'ATTENDANCE_FAILED',
        },
      });
    }
  }
);

/**
 * GET /api/v1/camps/:id/donor-lookup
 * Search an existing donor by mobile number for camp attendance registration.
 * Protected: Requires active camp staff assignment (CAMP_ADMIN, CAMP_COORDINATOR) or parent bank staff.
 */
organisationsRouter.get(
  '/camps/:id/donor-lookup',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const campId = String(req.params.id);
      const phone = String(req.query.phone || '');
      const result = await CampOperationsService.lookupDonorForAttendance(campId, req.user, phone);
      res.json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      const isForbidden = err.message?.includes('Permission denied');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        error: {
          message: err.message || 'Failed to perform donor lookup.',
          code: isForbidden ? 'FORBIDDEN' : 'LOOKUP_FAILED',
        },
      });
    }
  }
);

/**
 * GET /api/v1/camps/:id/attendance
 * Retrieve camp attendance roster.
 * Protected: Requires active organisation membership.
 */
organisationsRouter.get(
  '/camps/:id/attendance',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const campId = String(req.params.id);
      const roster = await CampOperationsService.listAttendances(campId, req.user);
      res.json({
        success: true,
        count: roster.length,
        data: roster,
      });
    } catch (err: any) {
      const isForbidden = err.message?.includes('Permission denied');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        error: { message: err.message || 'Failed to list attendance roster.', code: isForbidden ? 'FORBIDDEN' : 'ROSTER_FAILED' },
      });
    }
  }
);

/**
 * POST /api/v1/camps/:id/attendance/:attendanceId/check-in
 * Check in donor upon arrival at the camp.
 * Protected: Requires camp:attendance permission.
 */
organisationsRouter.post(
  '/camps/:id/attendance/:attendanceId/check-in',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const campId = String(req.params.id);
      const attendanceId = String(req.params.attendanceId);
      const checkedIn = await CampOperationsService.checkInAttendance(campId, attendanceId, req.user);
      res.json({
        success: true,
        message: 'Donor checked in successfully.',
        data: checkedIn,
      });
    } catch (err: any) {
      const isForbidden = err.message?.includes('Permission denied');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        error: { message: err.message || 'Failed to check in donor.', code: isForbidden ? 'FORBIDDEN' : 'CHECKIN_FAILED' },
      });
    }
  }
);

/**
 * POST /api/v1/camps/:id/attendance/:attendanceId/cancel
 * Cancel attendance registration.
 */
organisationsRouter.post(
  '/camps/:id/attendance/:attendanceId/cancel',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const campId = String(req.params.id);
      const attendanceId = String(req.params.attendanceId);
      const cancelled = await CampOperationsService.cancelAttendance(
        campId,
        attendanceId,
        req.user,
        req.body?.reason
      );
      res.json({
        success: true,
        message: 'Attendance cancelled successfully.',
        data: cancelled,
      });
    } catch (err: any) {
      const isForbidden = err.message?.includes('Permission denied');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        error: { message: err.message || 'Failed to cancel attendance.', code: isForbidden ? 'FORBIDDEN' : 'CANCEL_FAILED' },
      });
    }
  }
);

/**
 * POST /api/v1/camps/:id/attendance/:attendanceId/screening
 * Record clinical screening evaluation and informed consent.
 * Protected: STRICTLY restricted to CLINICAL_STAFF or ORG_ADMIN.
 */
organisationsRouter.post(
  '/camps/:id/attendance/:attendanceId/screening',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const campId = String(req.params.id);
      const attendanceId = String(req.params.attendanceId);
      const screening = await CampOperationsService.recordClinicalScreening(
        campId,
        attendanceId,
        req.user,
        req.body
      );
      res.status(201).json({
        success: true,
        message: `Clinical screening recorded: ${screening.status}.`,
        data: screening,
      });
    } catch (err: any) {
      const isForbidden = err.message?.includes('Permission denied');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        error: { message: err.message || 'Failed to record clinical screening.', code: isForbidden ? 'FORBIDDEN' : 'SCREENING_FAILED' },
      });
    }
  }
);

/**
 * PATCH /api/v1/camps/:id/screenings/:screeningId
 * Amend clinical screening record with mandatory auditable reason.
 * Protected: STRICTLY restricted to CLINICAL_STAFF or ORG_ADMIN.
 */
organisationsRouter.patch(
  '/camps/:id/screenings/:screeningId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const campId = String(req.params.id);
      const screeningId = String(req.params.screeningId);
      const amended = await CampOperationsService.amendClinicalScreening(
        campId,
        screeningId,
        req.user,
        req.body
      );
      res.json({
        success: true,
        message: 'Clinical screening amended successfully.',
        data: amended,
      });
    } catch (err: any) {
      const isForbidden = err.message?.includes('Permission denied');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        error: { message: err.message || 'Failed to amend clinical screening.', code: isForbidden ? 'FORBIDDEN' : 'AMENDMENT_FAILED' },
      });
    }
  }
);

/**
 * POST /api/v1/camps/:id/attendance/:attendanceId/donation
 * Record donation event outcome.
 * Protected: Restricted to COLLECTION_STAFF, CLINICAL_STAFF, or ORG_ADMIN.
 * Invariant: Completed donations require a CLEARED clinical screening.
 */
organisationsRouter.post(
  '/camps/:id/attendance/:attendanceId/donation',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const campId = String(req.params.id);
      const attendanceId = String(req.params.attendanceId);
      const event = await CampOperationsService.recordDonationEvent(
        campId,
        attendanceId,
        req.user,
        req.body
      );
      res.status(201).json({
        success: true,
        message: `Donation event recorded: ${event.outcome}.`,
        data: event,
      });
    } catch (err: any) {
      const isForbidden = err.message?.includes('Permission denied');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        error: { message: err.message || 'Failed to record donation event.', code: isForbidden ? 'FORBIDDEN' : 'DONATION_RECORD_FAILED' },
      });
    }
  }
);

// ====================================================
// SECTION 6: Camp Staff Assignments & Management
// ====================================================

/**
 * POST /api/v1/camps/:id/staff
 * Assign a coordinator or staff to an approved camp.
 * Protected: Requires ORG_ADMIN of parent bank or Platform ADMIN.
 */
organisationsRouter.post(
  '/camps/:id/staff',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const campId = String(req.params.id);
      const { userIdOrPhone, role, notes } = req.body;

      if (!userIdOrPhone || !role) {
        res.status(400).json({
          success: false,
          error: { message: 'userIdOrPhone and role are required.', code: 'MISSING_FIELDS' },
        });
        return;
      }

      if (!['CAMP_COORDINATOR', 'CLINICAL_STAFF', 'COLLECTION_STAFF'].includes(role)) {
        res.status(400).json({
          success: false,
          error: { message: 'Invalid role. Must be CAMP_COORDINATOR, CLINICAL_STAFF, or COLLECTION_STAFF.', code: 'INVALID_ROLE' },
        });
        return;
      }

      const assignment = await CampOperationsService.assignCampStaff(campId, req.user, {
        userIdOrPhone,
        role: role as CampStaffRole,
        notes,
      });

      res.status(201).json({
        success: true,
        message: (assignment as any).message || 'Camp staff assigned successfully.',
        data: assignment,
      });
    } catch (err: any) {
      const isForbidden = err.message?.includes('Permission denied');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        error: { message: err.message || 'Failed to assign camp staff.', code: isForbidden ? 'FORBIDDEN' : 'STAFF_ASSIGNMENT_FAILED' },
      });
    }
  }
);

/**
 * GET /api/v1/camps/:id/staff
 * List assigned staff for a camp.
 * Protected: Requires parent bank member, assigned staff, or Platform ADMIN.
 */
organisationsRouter.get(
  '/camps/:id/staff',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const campId = String(req.params.id);
      const staff = await CampOperationsService.listCampStaff(campId, req.user);
      res.json({
        success: true,
        count: staff.length,
        data: staff,
      });
    } catch (err: any) {
      const isForbidden = err.message?.includes('Permission denied');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        error: { message: err.message || 'Failed to list camp staff.', code: isForbidden ? 'FORBIDDEN' : 'LIST_FAILED' },
      });
    }
  }
);

/**
 * DELETE /api/v1/camps/:id/staff/:assignmentId
 * Revoke a staff member's assignment to a camp.
 * Protected: Requires ORG_ADMIN of parent bank or Platform ADMIN.
 */
organisationsRouter.delete(
  '/camps/:id/staff/:assignmentId',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const campId = String(req.params.id);
      const assignmentId = String(req.params.assignmentId);
      const { reason } = req.body || {};

      const revoked = await CampOperationsService.revokeCampStaff(
        campId,
        assignmentId,
        req.user,
        reason
      );

      res.json({
        success: true,
        message: 'Camp staff assignment revoked successfully.',
        data: revoked,
      });
    } catch (err: any) {
      const isForbidden = err.message?.includes('Permission denied');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        error: { message: err.message || 'Failed to revoke camp staff assignment.', code: isForbidden ? 'FORBIDDEN' : 'REVOKE_FAILED' },
      });
    }
  }
);

