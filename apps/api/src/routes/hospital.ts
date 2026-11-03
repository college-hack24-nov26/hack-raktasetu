import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireOrgPermission, OrgScopedRequest } from '../middleware/rbac';
import { HospitalIntegrationService } from '../services/hospitalIntegration';

export const hospitalRouter = Router();

// Apply auth to all hospital routes
hospitalRouter.use(requireAuth);

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
