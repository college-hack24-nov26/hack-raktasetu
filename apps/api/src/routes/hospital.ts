import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { requireOrgPermission, OrgScopedRequest } from '../middleware/rbac';
import { HospitalIntegrationService } from '../services/hospitalIntegration';
import { AdminMatchingService } from '../services/adminMatchingService';
import { DonorRegistryService } from '../services/donorRegistryService';

export const hospitalRouter = Router();

// Apply auth to all hospital and organisation routes (except public /hospitals/directory)
hospitalRouter.use('/hospital', requireAuth);
hospitalRouter.use('/organisation', requireAuth);
hospitalRouter.use('/organisations', requireAuth);

/**
 * GET /api/v1/hospital/orders
 * List orders and allocations associated with the caller's organisation (issuing bank or receiving facility)
 */
hospitalRouter.get(
  '/hospital/orders',
  requireOrgPermission(['operational:read']),
  async (req: OrgScopedRequest, res: Response) => {
    try {
      const orgId = req.orgMembership?.organisationId;
      if (!orgId) {
        return res.status(400).json({
          success: false,
          error: { message: 'Organisation membership is required.', code: 'MISSING_ORG' },
        });
      }

      const orders = await HospitalIntegrationService.getFacilityOrders(orgId);
      return res.json({ success: true, data: orders });
    } catch (err: any) {
      return res.status(400).json({
        success: false,
        error: { message: err.message || 'Failed to retrieve hospital orders.', code: 'QUERY_FAILED' },
      });
    }
  }
);

/**
 * POST /api/v1/hospital/issues/authorise
 * Blood bank authorises component issue to a receiving facility
 */
hospitalRouter.post(
  '/hospital/issues/authorise',
  requireOrgPermission(['issue:authorise']),
  async (req: OrgScopedRequest, res: Response) => {
    try {
      const callerUserId = req.user!.id;
      const issuingOrgId = req.orgMembership!.organisationId;

      const order = await HospitalIntegrationService.authoriseIssue(
        callerUserId,
        issuingOrgId,
        req.body
      );

      return res.status(201).json({
        success: true,
        data: order,
        message: 'Component issue order authorised successfully.',
      });
    } catch (err: any) {
      const status = err.message.includes('not found') ? 404 : 400;
      return res.status(status).json({
        success: false,
        error: { message: err.message, code: 'AUTHORISATION_FAILED' },
      });
    }
  }
);

/**
 * POST /api/v1/hospital/issues/dispatch
 * Blood bank records physical dispatch of an authorised order
 */
hospitalRouter.post(
  '/hospital/issues/dispatch',
  requireOrgPermission(['issue:dispatch']),
  async (req: OrgScopedRequest, res: Response) => {
    try {
      const callerUserId = req.user!.id;
      const issuingOrgId = req.orgMembership!.organisationId;

      const order = await HospitalIntegrationService.dispatchIssueOrder(
        callerUserId,
        issuingOrgId,
        req.body
      );

      return res.json({
        success: true,
        data: order,
        message: 'Hospital issue order dispatched successfully.',
      });
    } catch (err: any) {
      const status = err.message.includes('not found') ? 404 : err.message.includes('Access denied') ? 403 : 400;
      return res.status(status).json({
        success: false,
        error: { message: err.message, code: 'DISPATCH_FAILED' },
      });
    }
  }
);

/**
 * POST /api/v1/hospital/issues/receive
 * Receiving facility acknowledges receipt and verifies each component
 */
hospitalRouter.post(
  '/hospital/issues/receive',
  requireOrgPermission(['facility:receive']),
  async (req: OrgScopedRequest, res: Response) => {
    try {
      const callerUserId = req.user!.id;
      const receivingFacilityId = req.orgMembership!.organisationId;

      const order = await HospitalIntegrationService.acknowledgeReceipt(
        callerUserId,
        receivingFacilityId,
        req.body
      );

      return res.json({
        success: true,
        data: order,
        message: 'Hospital issue order receiving acknowledged successfully.',
      });
    } catch (err: any) {
      const status = err.message.includes('not found') ? 404 : err.message.includes('Access denied') ? 403 : 400;
      return res.status(status).json({
        success: false,
        error: { message: err.message, code: 'RECEIPT_FAILED' },
      });
    }
  }
);

/**
 * POST /api/v1/hospital/issues/discrepancy
 * Record a discrepancy or exception on an issue order
 */
hospitalRouter.post(
  '/hospital/issues/discrepancy',
  requireOrgPermission(['facility:discrepancy']),
  async (req: OrgScopedRequest, res: Response) => {
    try {
      const callerUserId = req.user!.id;
      const orgId = req.orgMembership!.organisationId;

      const discrepancy = await HospitalIntegrationService.recordDiscrepancy(
        callerUserId,
        orgId,
        req.body
      );

      return res.status(201).json({
        success: true,
        data: discrepancy,
        message: 'Hospital delivery discrepancy recorded successfully.',
      });
    } catch (err: any) {
      const status = err.message.includes('not found') ? 404 : err.message.includes('Access denied') ? 403 : 400;
      return res.status(status).json({
        success: false,
        error: { message: err.message, code: 'DISCREPANCY_FAILED' },
      });
    }
  }
);

/**
 * POST /api/v1/hospital/disposition
 * Record final disposition (Transfusion documented, return, discard)
 * Strict clinical safety rules enforced:
 * - Transfusion documented requires CLINICAL_STAFF role
 * - Supporting documentation reference is mandatory
 */
hospitalRouter.post(
  '/hospital/disposition',
  requireOrgPermission(['disposition:record']),
  async (req: OrgScopedRequest, res: Response) => {
    try {
      const callerUserId = req.user!.id;
      const callerOrgRole = req.orgMembership!.role;
      const organisationId = req.orgMembership!.organisationId;

      const disposition = await HospitalIntegrationService.recordDisposition(
        callerUserId,
        callerOrgRole,
        organisationId,
        req.body
      );

      return res.status(201).json({
        success: true,
        data: disposition,
        message: 'Component disposition recorded successfully.',
      });
    } catch (err: any) {
      const status = err.message.includes('not found')
        ? 404
        : err.message.includes('Clinical safety boundary') || err.message.includes('Access denied')
        ? 403
        : 400;
      return res.status(status).json({
        success: false,
        error: { message: err.message, code: 'DISPOSITION_FAILED' },
      });
    }
  }
);

/**
 * GET /api/v1/hospital/components/:id/custody
 * Retrieve full custody, delivery, and disposition reconstruction for a component
 */
hospitalRouter.get(
  '/hospital/components/:componentId/custody',
  requireOrgPermission(['operational:read']),
  async (req: OrgScopedRequest, res: Response) => {
    try {
      const callerOrgId = req.orgMembership!.organisationId;
      const componentUnitId = (req.params.componentId || req.params.id) as string;

      const history = await HospitalIntegrationService.getComponentCustodyHistory(
        callerOrgId,
        componentUnitId
      );

      return res.json({ success: true, data: history });
    } catch (err: any) {
      const status = err.message.includes('not found') ? 404 : err.message.includes('Access denied') ? 403 : 400;
      return res.status(status).json({
        success: false,
        error: { message: err.message, code: 'CUSTODY_HISTORY_FAILED' },
      });
    }
  }
);

/**
 * GET /api/v1/hospitals/directory
 * Public/authenticated directory of verified hospitals for request creation dropdown
 */
hospitalRouter.get('/hospitals/directory', async (req, res: Response) => {
  try {
    const facilities = await HospitalIntegrationService.getVerifiedHospitalsDirectory();
    return res.json({ success: true, data: facilities });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: { message: err.message || 'Failed to retrieve hospitals directory.', code: 'DIRECTORY_FAILED' },
    });
  }
});

/**
 * GET /api/v1/organisation/:orgId/incoming-requests
 * Blood-bank view: lists incoming blood requests designated to the centre with live inventory stock counts
 */
hospitalRouter.get(
  '/organisation/:orgId/incoming-requests',
  requireOrgPermission(['operational:read']),
  async (req: OrgScopedRequest, res: Response) => {
    try {
      const orgId = req.orgMembership!.organisationId;
      const incoming = await HospitalIntegrationService.getIncomingBloodRequests(orgId);
      return res.json({ success: true, data: incoming });
    } catch (err: any) {
      return res.status(400).json({
        success: false,
        error: { message: err.message || 'Failed to retrieve incoming blood requests.', code: 'QUERY_FAILED' },
      });
    }
  }
);

/**
 * POST /api/v1/organisation/:orgId/requests/:requestId/accept-reserve
 * Blood bank accepts incoming request and atomically reserves eligible available stock
 */
const handleAcceptReserve = async (req: OrgScopedRequest, res: Response) => {
  try {
    const callerUserId = req.user!.id;
    const orgId = req.orgMembership!.organisationId;
    const requestId = String(req.params.requestId);
    const preferredUnitIds = req.body?.preferredUnitIds;

    const result = await HospitalIntegrationService.acceptAndReserveRequest(
      callerUserId,
      orgId,
      requestId,
      preferredUnitIds
    );

    return res.json({
      success: true,
      data: result,
      message: result.isPartial
        ? `Partially reserved ${result.reservedUnits.length} unit(s) for request.`
        : `Successfully reserved ${result.reservedUnits.length} unit(s) for request.`,
    });
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('not found') ? 404 : err.message.includes('Access denied') ? 403 : 400);
    return res.status(status).json({
      success: false,
      error: { message: err.message, code: err.code || 'RESERVATION_FAILED' },
    });
  }
};

hospitalRouter.post(
  '/organisation/:orgId/requests/:requestId/accept-reserve',
  requireOrgPermission(['issue:authorise']),
  handleAcceptReserve
);

hospitalRouter.post(
  '/organisations/:orgId/requests/:requestId/accept-reserve',
  requireOrgPermission(['issue:authorise']),
  handleAcceptReserve
);

/**
 * POST /api/v1/organisation/:orgId/requests/:requestId/reject
 * Blood bank rejects request with mandatory documented reason and releases reservations
 */
hospitalRouter.post(
  '/organisation/:orgId/requests/:requestId/reject',
  requireOrgPermission(['issue:authorise']),
  async (req: OrgScopedRequest, res: Response) => {
    try {
      const callerUserId = req.user!.id;
      const orgId = req.orgMembership!.organisationId;
      const requestId = String(req.params.requestId);
      const reason = req.body?.reason;

      const updated = await HospitalIntegrationService.rejectRequest(
        callerUserId,
        orgId,
        requestId,
        reason
      );

      return res.json({
        success: true,
        data: updated,
        message: 'Blood request rejected and documented successfully.',
      });
    } catch (err: any) {
      const status = err.message.includes('not found') ? 404 : err.message.includes('Access denied') ? 403 : 400;
      return res.status(status).json({
        success: false,
        error: { message: err.message, code: 'REJECTION_FAILED' },
      });
    }
  }
);

/**
 * POST /api/v1/organisation/:orgId/requests/:requestId/claim
 * Blood bank claims an unassigned or external district request
 */
hospitalRouter.post(
  '/organisation/:orgId/requests/:requestId/claim',
  requireOrgPermission(['issue:authorise']),
  async (req: OrgScopedRequest, res: Response) => {
    try {
      const callerUserId = req.user!.id;
      const orgId = req.orgMembership!.organisationId;
      const requestId = String(req.params.requestId);

      const result = await HospitalIntegrationService.claimRequest(
        callerUserId,
        orgId,
        requestId
      );

      return res.json(result);
    } catch (err: any) {
      const status = err.message.includes('not found') ? 404 : err.message.includes('Access denied') ? 403 : 400;
      return res.status(status).json({
        success: false,
        error: { message: err.message, code: 'CLAIM_FAILED' },
      });
    }
  }
);

/**
 * POST /api/v1/organisation/:orgId/requests/:requestId/dispatch
 * Blood bank dispatches reserved units directly for a blood request
 */
hospitalRouter.post(
  '/organisation/:orgId/requests/:requestId/dispatch',
  requireOrgPermission(['issue:authorise']),
  async (req: OrgScopedRequest, res: Response) => {
    try {
      const callerUserId = req.user!.id;
      const orgId = req.orgMembership!.organisationId;
      const requestId = String(req.params.requestId);
      const transportDetails = req.body?.transportDetails || req.body || {};

      const result = await HospitalIntegrationService.dispatchRequest(
        callerUserId,
        orgId,
        requestId,
        transportDetails
      );

      return res.json(result);
    } catch (err: any) {
      const status = err.message.includes('not found') ? 404 : err.message.includes('Access denied') ? 403 : 400;
      return res.status(status).json({
        success: false,
        error: { message: err.message, code: 'DISPATCH_FAILED' },
      });
    }
  }
);

/**
 * POST /api/v1/organisation/:orgId/requests/:requestId/request-matching
 * Blood Bank requests donor matching for remaining shortfall.
 * Restricted to designated Blood Bank staff; cannot choose scope or filters.
 */
const handleRequestDonorMatching = async (req: OrgScopedRequest, res: Response) => {
  try {
    const callerUserId = req.user!.id;
    const orgId = req.orgMembership!.organisationId;
    const requestId = String(req.params.requestId);

    const result = await HospitalIntegrationService.requestDonorMatching(
      callerUserId,
      orgId,
      requestId
    );

    return res.json(result);
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('not found') ? 404 : err.message.includes('Access denied') ? 403 : 400);
    return res.status(status).json({
      success: false,
      error: { message: err.message, code: err.code || 'MATCHING_REQUEST_FAILED' },
    });
  }
};

hospitalRouter.post(
  '/organisation/:orgId/requests/:requestId/request-matching',
  requireOrgPermission(['operational:write', 'issue:authorise']),
  handleRequestDonorMatching
);

hospitalRouter.post(
  '/organisations/:orgId/requests/:requestId/request-matching',
  requireOrgPermission(['operational:write', 'issue:authorise']),
  handleRequestDonorMatching
);

/**
 * GET /api/v1/organisation/:orgId/requests/:requestId/matching-candidates
 * Blood Bank retrieves released candidates. Candidates visible ONLY if released by Platform Admin.
 */
const handleGetReleasedCandidates = async (req: OrgScopedRequest, res: Response) => {
  try {
    const callerUserId = req.user!.id;
    const callerRole = req.user!.role;
    const orgId = req.orgMembership!.organisationId;
    const requestId = String(req.params.requestId);

    const result = await AdminMatchingService.getReleasedCandidatesForBloodBank(
      callerUserId,
      callerRole,
      orgId,
      requestId
    );

    return res.json({ success: true, data: result });
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('not found') ? 404 : err.message.includes('Access denied') ? 403 : 400);
    return res.status(status).json({
      success: false,
      error: { message: err.message, code: err.code || 'GET_CANDIDATES_FAILED' },
    });
  }
};

hospitalRouter.get(
  '/organisation/:orgId/requests/:requestId/matching-candidates',
  requireOrgPermission(['operational:read']),
  handleGetReleasedCandidates
);

hospitalRouter.get(
  '/organisations/:orgId/requests/:requestId/matching-candidates',
  requireOrgPermission(['operational:read']),
  handleGetReleasedCandidates
);

/**
 * POST /api/v1/organisation/:orgId/requests/:requestId/invite-donors
 * Blood Bank dispatches official donation invitations to approved & released donor candidates.
 */
const handleInviteDonorCandidates = async (req: OrgScopedRequest, res: Response) => {
  try {
    const callerUserId = req.user!.id;
    const orgId = req.orgMembership!.organisationId;
    const requestId = String(req.params.requestId);
    const donorIds = req.body?.donorIds || (req.body?.donorId ? [req.body.donorId] : []);

    const result = await HospitalIntegrationService.inviteDonorCandidates(
      callerUserId,
      orgId,
      requestId,
      donorIds
    );

    return res.status(200).json(result);
  } catch (err: any) {
    const status =
      err.statusCode ||
      (err.message.includes('not found') ? 404 : err.message.includes('Access denied') ? 403 : 400);
    return res.status(status).json({
      success: false,
      error: { message: err.message, code: err.code || 'INVITE_DONORS_FAILED' },
    });
  }
};

hospitalRouter.post(
  '/organisation/:orgId/requests/:requestId/invite-donors',
  requireOrgPermission(['operational:write', 'issue:authorise']),
  handleInviteDonorCandidates
);

hospitalRouter.post(
  '/organisations/:orgId/requests/:requestId/invite-donors',
  requireOrgPermission(['operational:write', 'issue:authorise']),
  handleInviteDonorCandidates
);

/**
 * POST /api/v1/organisation/:orgId/requests/:requestId/donor-outreach
 * Record Blood Bank direct donor outreach attempt and response
 */
const handleDonorOutreachResponse = async (req: OrgScopedRequest, res: Response) => {
  try {
    const callerUserId = req.user!.id;
    const orgId = req.orgMembership!.organisationId;
    const requestId = String(req.params.requestId);
    const { donorId, status, notes } = req.body;

    if (!donorId || !status) {
      return res.status(400).json({
        success: false,
        error: { message: 'donorId and status (PENDING, ACCEPTED, DECLINED, CANCELLED) are required.', code: 'MISSING_FIELDS' },
      });
    }

    const result = await HospitalIntegrationService.recordDonorOutreachResponse(
      callerUserId,
      orgId,
      requestId,
      donorId,
      status,
      notes
    );

    return res.status(200).json(result);
  } catch (err: any) {
    const statusCode = err.statusCode || 400;
    return res.status(statusCode).json({
      success: false,
      error: { message: err.message, code: err.code || 'OUTREACH_RECORD_FAILED' },
    });
  }
};

hospitalRouter.post(
  '/organisation/:orgId/requests/:requestId/donor-outreach',
  requireOrgPermission(['operational:write']),
  handleDonorOutreachResponse
);

hospitalRouter.post(
  '/organisations/:orgId/requests/:requestId/donor-outreach',
  requireOrgPermission(['operational:write']),
  handleDonorOutreachResponse
);

/**
 * POST /api/v1/organisation/:orgId/requests/:requestId/donor-intake
 * Record donor arrival and identity verification against accepted request invitation
 */
const handleDonorArrivalIntake = async (req: OrgScopedRequest, res: Response) => {
  try {
    const callerUserId = req.user!.id;
    const orgId = req.orgMembership!.organisationId;
    const requestId = String(req.params.requestId);
    const donorId = String(req.body?.donorId || '');
    const verificationNotes = req.body?.verificationNotes;

    if (!donorId) {
      return res.status(400).json({
        success: false,
        error: { message: 'donorId is required for intake verification.', code: 'MISSING_DONOR_ID' },
      });
    }

    const result = await HospitalIntegrationService.recordDonorArrival(
      callerUserId,
      orgId,
      requestId,
      donorId,
      verificationNotes
    );

    return res.status(200).json(result);
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('not found') ? 404 : err.message.includes('Access denied') ? 403 : 400);
    return res.status(status).json({
      success: false,
      error: { message: err.message, code: err.code || 'DONOR_INTAKE_FAILED' },
    });
  }
};

hospitalRouter.post(
  '/organisation/:orgId/requests/:requestId/donor-intake',
  requireOrgPermission(['operational:write', 'issue:authorise']),
  handleDonorArrivalIntake
);

hospitalRouter.post(
  '/organisations/:orgId/requests/:requestId/donor-intake',
  requireOrgPermission(['operational:write', 'issue:authorise']),
  handleDonorArrivalIntake
);

/**
 * POST /api/v1/organisation/:orgId/requests/:requestId/clinical-screening
 * Authorized Clinical Staff screens donor and records eligibility decision
 */
const handleIntakeClinicalScreening = async (req: OrgScopedRequest, res: Response) => {
  try {
    const callerUserId = req.user!.id;
    const orgId = req.orgMembership!.organisationId;
    const requestId = String(req.params.requestId);

    const result = await HospitalIntegrationService.recordIntakeClinicalScreening(
      callerUserId,
      orgId,
      requestId,
      req.body
    );

    return res.status(200).json(result);
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('not found') ? 404 : err.message.includes('Permission denied') || err.message.includes('Access denied') ? 403 : 400);
    return res.status(status).json({
      success: false,
      error: { message: err.message, code: err.code || 'CLINICAL_SCREENING_FAILED' },
    });
  }
};

hospitalRouter.post(
  '/organisation/:orgId/requests/:requestId/clinical-screening',
  requireOrgPermission(['operational:write', 'clinical:screen']),
  handleIntakeClinicalScreening
);

hospitalRouter.post(
  '/organisations/:orgId/requests/:requestId/clinical-screening',
  requireOrgPermission(['operational:write', 'clinical:screen']),
  handleIntakeClinicalScreening
);

/**
 * POST /api/v1/organisation/:orgId/requests/:requestId/collection
 * Authorized Collection Staff records donation event and derives quarantined component
 */
const handleIntakeCollection = async (req: OrgScopedRequest, res: Response) => {
  try {
    const callerUserId = req.user!.id;
    const orgId = req.orgMembership!.organisationId;
    const requestId = String(req.params.requestId);

    const result = await HospitalIntegrationService.recordIntakeCollectionAndComponent(
      callerUserId,
      orgId,
      requestId,
      req.body
    );

    return res.status(200).json(result);
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('not found') ? 404 : err.message.includes('Permission denied') || err.message.includes('Access denied') ? 403 : 400);
    return res.status(status).json({
      success: false,
      error: { message: err.message, code: err.code || 'COLLECTION_FAILED' },
    });
  }
};

hospitalRouter.post(
  '/organisation/:orgId/requests/:requestId/collection',
  requireOrgPermission(['operational:write', 'donation:record']),
  handleIntakeCollection
);

hospitalRouter.post(
  '/organisations/:orgId/requests/:requestId/collection',
  requireOrgPermission(['operational:write', 'donation:record']),
  handleIntakeCollection
);

/**
 * POST /api/v1/organisation/:orgId/requests/:requestId/allocate-component
 * Allocate newly released component unit to decrement blood request shortfall
 */
const handleAllocateComponent = async (req: OrgScopedRequest, res: Response) => {
  try {
    const callerUserId = req.user!.id;
    const orgId = req.orgMembership!.organisationId;
    const requestId = String(req.params.requestId);
    const componentUnitId = String(req.body?.componentUnitId || '');

    if (!componentUnitId) {
      return res.status(400).json({
        success: false,
        error: { message: 'componentUnitId is required.', code: 'MISSING_COMPONENT_ID' },
      });
    }

    const result = await HospitalIntegrationService.allocateReleasedComponentToRequest(
      callerUserId,
      orgId,
      requestId,
      componentUnitId
    );

    return res.status(200).json(result);
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('not found') ? 404 : err.message.includes('Access denied') ? 403 : 400);
    return res.status(status).json({
      success: false,
      error: { message: err.message, code: err.code || 'ALLOCATION_FAILED' },
    });
  }
};

hospitalRouter.post(
  '/organisation/:orgId/requests/:requestId/allocate-component',
  requireOrgPermission(['issue:authorise']),
  handleAllocateComponent
);

hospitalRouter.post(
  '/organisations/:orgId/requests/:requestId/allocate-component',
  requireOrgPermission(['issue:authorise']),
  handleAllocateComponent
);

/**
 * GET /api/v1/organisation/:orgId/requests/:requestId/traceability
 * Comprehensive End-to-End Traceability Lineage Graph
 */
const handleGetRequestTraceability = async (req: OrgScopedRequest, res: Response) => {
  try {
    const callerUserId = req.user!.id;
    const orgId = req.orgMembership!.organisationId;
    const requestId = String(req.params.requestId);

    const result = await HospitalIntegrationService.getBloodRequestTraceability(
      callerUserId,
      orgId,
      requestId
    );

    return res.status(200).json({ success: true, data: result });
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('not found') ? 404 : err.message.includes('Access denied') ? 403 : 400);
    return res.status(status).json({
      success: false,
      error: { message: err.message, code: err.code || 'TRACEABILITY_FAILED' },
    });
  }
};

hospitalRouter.get(
  '/organisation/:orgId/requests/:requestId/traceability',
  requireOrgPermission(['operational:read', 'issue:authorise']),
  handleGetRequestTraceability
);

hospitalRouter.get(
  '/organisations/:orgId/requests/:requestId/traceability',
  requireOrgPermission(['operational:read', 'issue:authorise']),
  handleGetRequestTraceability
);

/**
 * POST /api/v1/blood-requests/:id/confirm-receipt
 * Dual confirmation: Requester or Hospital staff confirms physical receipt of dispatched units
 */
hospitalRouter.post(
  '/blood-requests/:id/confirm-receipt',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const callerUserId = req.user.id;
      const requestId = String(req.params.id);
      const notes = req.body?.notes;
      const isHospitalStaff = req.user.role === 'STAFF' || req.user.role === 'ADMIN';

      const result = await HospitalIntegrationService.confirmReceipt(
        callerUserId,
        requestId,
        notes,
        isHospitalStaff
      );

      return res.json(result);
    } catch (err: any) {
      const status = err.message.includes('not found') ? 404 : err.message.includes('Access denied') ? 403 : 400;
      return res.status(status).json({
        success: false,
        error: { message: err.message, code: 'RECEIPT_CONFIRMATION_FAILED' },
      });
    }
  }
);

/**
 * GET /api/v1/hospital/dashboard
 * Hospital Portal: Comprehensive operational dashboard for an authenticated receiving facility
 */
hospitalRouter.get(
  '/hospital/dashboard',
  requireOrgPermission(['operational:read']),
  async (req: OrgScopedRequest, res: Response) => {
    try {
      const receivingFacilityId = req.orgMembership!.organisationId;
      const data = await HospitalIntegrationService.getHospitalDashboard(receivingFacilityId);
      return res.json({ success: true, data });
    } catch (err: any) {
      return res.status(400).json({
        success: false,
        error: { message: err.message || 'Failed to load hospital dashboard.', code: 'DASHBOARD_FAILED' },
      });
    }
  }
);

/**
 * POST /api/v1/blood-requests/:id/patient-acknowledge
 * POST /api/v1/blood-requests/:id/acknowledge-delivery
 * Patient / Requester acknowledges blood unit delivery (dual confirmation)
 */
const handlePatientAcknowledge = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const callerUserId = req.user.id;
    const requestId = String(req.params.id);
    const notes = req.body?.notes;

    const result = await HospitalIntegrationService.confirmReceipt(
      callerUserId,
      requestId,
      notes,
      false
    );

    return res.json(result);
  } catch (err: any) {
    const status = err.message.includes('not found') ? 404 : err.message.includes('Access denied') ? 403 : 400;
    return res.status(status).json({
      success: false,
      error: { message: err.message, code: 'ACKNOWLEDGEMENT_FAILED' },
    });
  }
};

hospitalRouter.post('/blood-requests/:id/patient-acknowledge', requireAuth, handlePatientAcknowledge);
hospitalRouter.post('/blood-requests/:id/acknowledge-delivery', requireAuth, handlePatientAcknowledge);

/**
 * POST /api/v1/organisation/:orgId/requests/:requestId/candidates/:donorId/arrival
 * Blood Bank records physical arrival of released candidate
 */
const handleCandidateArrival = async (req: OrgScopedRequest, res: Response) => {
  try {
    const callerUserId = req.user!.id;
    const orgId = req.orgMembership!.organisationId;
    const requestId = String(req.params.requestId);
    const donorId = String(req.params.donorId || req.body?.donorId || '');
    const verificationNotes = req.body?.verificationNotes;

    if (!donorId) {
      return res.status(400).json({
        success: false,
        error: { message: 'donorId is required.', code: 'MISSING_DONOR_ID' },
      });
    }

    const result = await HospitalIntegrationService.recordDonorArrival(
      callerUserId,
      orgId,
      requestId,
      donorId,
      verificationNotes
    );

    return res.status(200).json(result);
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('not found') ? 404 : err.message.includes('Access denied') ? 403 : 400);
    return res.status(status).json({
      success: false,
      error: { message: err.message, code: err.code || 'ARRIVAL_RECORD_FAILED' },
    });
  }
};

hospitalRouter.post(
  '/organisation/:orgId/requests/:requestId/candidates/:donorId/arrival',
  requireOrgPermission(['operational:write', 'issue:authorise']),
  handleCandidateArrival
);
hospitalRouter.post(
  '/organisations/:orgId/requests/:requestId/candidates/:donorId/arrival',
  requireOrgPermission(['operational:write', 'issue:authorise']),
  handleCandidateArrival
);

/**
 * POST /api/v1/organisation/:orgId/requests/:requestId/candidates/:donorId/verify-handoff
 * Blood Bank reception verifies donor identity and hands off to Clinical Staff
 */
const handleVerifyDonorHandoff = async (req: OrgScopedRequest, res: Response) => {
  try {
    const callerUserId = req.user!.id;
    const orgId = req.orgMembership!.organisationId;
    const requestId = String(req.params.requestId);
    const donorId = String(req.params.donorId || req.body?.donorId || '');
    const verificationNotes = req.body?.verificationNotes;

    if (!donorId) {
      return res.status(400).json({
        success: false,
        error: { message: 'donorId is required.', code: 'MISSING_DONOR_ID' },
      });
    }

    const result = await HospitalIntegrationService.verifyDonorAndHandoff(
      callerUserId,
      orgId,
      requestId,
      donorId,
      verificationNotes
    );

    return res.status(200).json(result);
  } catch (err: any) {
    const status = err.statusCode || (err.message.includes('not found') ? 404 : err.message.includes('Access denied') ? 403 : 400);
    return res.status(status).json({
      success: false,
      error: { message: err.message, code: err.code || 'VERIFY_HANDOFF_FAILED' },
    });
  }
};

hospitalRouter.post(
  '/organisation/:orgId/requests/:requestId/candidates/:donorId/verify-handoff',
  requireOrgPermission(['operational:write', 'issue:authorise']),
  handleVerifyDonorHandoff
);
hospitalRouter.post(
  '/organisations/:orgId/requests/:requestId/candidates/:donorId/verify-handoff',
  requireOrgPermission(['operational:write', 'issue:authorise']),
  handleVerifyDonorHandoff
);

/**
 * ====================================================================
 * Blood Bank Donor Registry Endpoints
 * ====================================================================
 */

/**
 * POST /api/v1/organisation/:orgId/donors/direct-register
 * Direct voluntary donor registration at Blood Bank without camp requirement
 */
const handleDirectRegister = async (req: OrgScopedRequest, res: Response) => {
  try {
    const callerUserId = req.user!.id;
    const orgId = req.orgMembership!.organisationId;

    const result = await DonorRegistryService.directRegisterDonor(
      callerUserId,
      orgId,
      req.body
    );

    return res.status(201).json(result);
  } catch (err: any) {
    const status = err.statusCode || 400;
    return res.status(status).json({
      success: false,
      error: { message: err.message || 'Direct donor registration failed.', code: err.code || 'REGISTRATION_FAILED' },
    });
  }
};

hospitalRouter.post(
  '/organisation/:orgId/donors/direct-register',
  requireOrgPermission(['operational:write', 'issue:authorise']),
  handleDirectRegister
);
hospitalRouter.post(
  '/organisations/:orgId/donors/direct-register',
  requireOrgPermission(['operational:write', 'issue:authorise']),
  handleDirectRegister
);

/**
 * GET /api/v1/organisation/:orgId/donors
 * View, search, filter, and paginate donors associated with this Blood Bank
 */
const handleGetOrgDonors = async (req: OrgScopedRequest, res: Response) => {
  try {
    const callerUserId = req.user!.id;
    const orgId = req.orgMembership!.organisationId;

    const result = await DonorRegistryService.getOrganisationDonors(
      callerUserId,
      orgId,
      req.query as any
    );

    return res.json({ success: true, data: result });
  } catch (err: any) {
    const status = err.statusCode || 400;
    return res.status(status).json({
      success: false,
      error: { message: err.message || 'Failed to fetch donor registry.', code: 'DONOR_REGISTRY_FAILED' },
    });
  }
};

hospitalRouter.get(
  '/organisation/:orgId/donors',
  requireOrgPermission(['operational:read']),
  handleGetOrgDonors
);
hospitalRouter.get(
  '/organisations/:orgId/donors',
  requireOrgPermission(['operational:read']),
  handleGetOrgDonors
);

/**
 * GET /api/v1/organisation/:orgId/donors/summary
 * Summary cards based on real persisted data
 */
const handleGetOrgDonorSummary = async (req: OrgScopedRequest, res: Response) => {
  try {
    const callerUserId = req.user!.id;
    const orgId = req.orgMembership!.organisationId;

    const result = await DonorRegistryService.getOrganisationDonorSummary(
      callerUserId,
      orgId
    );

    return res.json({ success: true, data: result });
  } catch (err: any) {
    const status = err.statusCode || 400;
    return res.status(status).json({
      success: false,
      error: { message: err.message || 'Failed to fetch donor summary.', code: 'DONOR_SUMMARY_FAILED' },
    });
  }
};

hospitalRouter.get(
  '/organisation/:orgId/donors/summary',
  requireOrgPermission(['operational:read']),
  handleGetOrgDonorSummary
);
hospitalRouter.get(
  '/organisations/:orgId/donors/summary',
  requireOrgPermission(['operational:read']),
  handleGetOrgDonorSummary
);

/**
 * GET /api/v1/organisation/:orgId/donors/:donorId
 * Detailed profile and donation history
 */
const handleGetOrgDonorDetail = async (req: OrgScopedRequest, res: Response) => {
  try {
    const callerUserId = req.user!.id;
    const orgId = req.orgMembership!.organisationId;
    const donorId = String(req.params.donorId);

    const result = await DonorRegistryService.getOrganisationDonorDetail(
      callerUserId,
      orgId,
      donorId
    );

    return res.json({ success: true, data: result });
  } catch (err: any) {
    const status = err.statusCode || 400;
    return res.status(status).json({
      success: false,
      error: { message: err.message || 'Failed to fetch donor details.', code: 'DONOR_DETAIL_FAILED' },
    });
  }
};

hospitalRouter.get(
  '/organisation/:orgId/donors/:donorId',
  requireOrgPermission(['operational:read']),
  handleGetOrgDonorDetail
);
hospitalRouter.get(
  '/organisations/:orgId/donors/:donorId',
  requireOrgPermission(['operational:read']),
  handleGetOrgDonorDetail
);

/**
 * GET /api/v1/organisation/:orgId/requests/:requestId/candidates/:candidateId/directions
 * Designated Blood Bank retrieves driving road distance and travel duration for a released candidate.
 * Strictly verifies the request is assigned to this organisation and candidate has been released.
 * Never reveals raw GPS coordinates to the caller.
 */
const handleGetCandidateDirections = async (req: OrgScopedRequest, res: Response) => {
  try {
    const callerUserId = req.user!.id;
    const callerRole = req.user!.role;
    const orgId = req.orgMembership!.organisationId;
    const requestId = String(req.params.requestId);
    const candidateId = String(req.params.candidateId);
    const profile = (req.query.profile as any) || 'driving';

    // Verify candidate is released to this Blood Bank
    const releasedInfo = await AdminMatchingService.getReleasedCandidatesForBloodBank(
      callerUserId,
      callerRole,
      orgId,
      requestId
    );

    const isReleasedCandidate = releasedInfo.candidates.some((c) => c.donorId === candidateId);
    if (!isReleasedCandidate) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied. You can only request directions for candidates released to your Blood Bank.',
          code: 'FORBIDDEN_CANDIDATE_ACCESS',
        },
      });
    }

    const directions = await AdminMatchingService.getCandidateDirections(
      requestId,
      candidateId,
      profile
    );

    if (!directions) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Road directions are unavailable for this candidate (missing coordinates or route not found).',
          code: 'DIRECTIONS_UNAVAILABLE',
        },
      });
    }

    return res.json({
      success: true,
      data: directions,
    });
  } catch (err: any) {
    const status = err.statusCode || 400;
    return res.status(status).json({
      success: false,
      error: { message: err.message || 'Failed to get directions.', code: 'DIRECTIONS_FAILED' },
    });
  }
};

hospitalRouter.get(
  '/organisation/:orgId/requests/:requestId/candidates/:candidateId/directions',
  requireOrgPermission(['operational:read']),
  handleGetCandidateDirections
);
hospitalRouter.get(
  '/organisations/:orgId/requests/:requestId/candidates/:candidateId/directions',
  requireOrgPermission(['operational:read']),
  handleGetCandidateDirections
);

