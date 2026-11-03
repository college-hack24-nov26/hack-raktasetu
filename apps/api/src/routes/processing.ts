import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { requireOrgPermission } from '../middleware/rbac';
import { ProcessingAndInventoryService } from '../services/processingAndInventory';

export const processingRouter = Router();

// ====================================================
// 1. RECORD LABORATORY TEST
// ====================================================

processingRouter.post(
  '/organisations/:orgId/laboratory-tests',
  requireAuth,
  requireOrgPermission(['lab:record']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      const result = await ProcessingAndInventoryService.recordLaboratoryTest(
        orgId,
        req.user,
        req.body
      );

      res.status(201).json({
        success: true,
        message: 'Laboratory test record saved successfully.',
        data: result,
      });
    } catch (err: any) {
      const status =
        err.message.includes('Permission denied') || err.message.includes('Access denied')
          ? 403
          : 400;
      res.status(status).json({
        success: false,
        error: { message: err.message, code: 'LAB_RECORD_FAILED' },
      });
    }
  }
);

// ====================================================
// 2. VERIFY LABORATORY TEST (CLINICAL_STAFF ONLY)
// ====================================================

processingRouter.post(
  '/organisations/:orgId/laboratory-tests/:testRecordId/verify',
  requireAuth,
  requireOrgPermission(['lab:verify']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      const testRecordId = req.params.testRecordId as string;

      const result = await ProcessingAndInventoryService.verifyLaboratoryTest(
        orgId,
        testRecordId,
        req.user,
        req.body
      );

      res.json({
        success: true,
        message: 'Laboratory test record clinically verified.',
        data: result,
      });
    } catch (err: any) {
      const status =
        err.message.includes('Permission denied') || err.message.includes('Access denied')
          ? 403
          : 400;
      res.status(status).json({
        success: false,
        error: { message: err.message, code: 'LAB_VERIFICATION_FAILED' },
      });
    }
  }
);

// ====================================================
// 3. LIST LABORATORY TESTS
// ====================================================

processingRouter.get(
  '/organisations/:orgId/laboratory-tests',
  requireAuth,
  requireOrgPermission(['unit:view']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      const { collectionUnitId, componentUnitId } = req.query;

      const records = await ProcessingAndInventoryService.listLaboratoryTests(
        orgId,
        req.user,
        {
          collectionUnitId: typeof collectionUnitId === 'string' ? collectionUnitId : undefined,
          componentUnitId: typeof componentUnitId === 'string' ? componentUnitId : undefined,
        }
      );

      res.json({
        success: true,
        count: records.length,
        data: records,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { message: err.message, code: 'FETCH_LAB_TESTS_FAILED' },
      });
    }
  }
);

// ====================================================
// 4. EVALUATE CLINICAL RELEASE ELIGIBILITY
// ====================================================

processingRouter.get(
  '/organisations/:orgId/components/:componentId/release-eligibility',
  requireAuth,
  requireOrgPermission(['unit:view']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      const componentId = req.params.componentId as string;

      const evaluation = await ProcessingAndInventoryService.evaluateReleaseEligibility(
        componentId,
        orgId
      );

      res.json({
        success: true,
        data: evaluation,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { message: err.message, code: 'EVALUATE_RELEASE_FAILED' },
      });
    }
  }
);

// ====================================================
// 5. RECORD CLINICAL RELEASE DECISION (CLINICAL_STAFF ONLY)
// ====================================================

processingRouter.post(
  '/organisations/:orgId/components/:componentId/clinical-release',
  requireAuth,
  requireOrgPermission(['clinical:release']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      const componentId = req.params.componentId as string;

      const result = await ProcessingAndInventoryService.recordClinicalRelease(
        orgId,
        componentId,
        req.user,
        req.body
      );

      res.status(200).json({
        success: true,
        message: `Clinical release decision recorded: ${result.releaseRecord.decision}`,
        data: result,
      });
    } catch (err: any) {
      const status =
        err.message.includes('Permission denied') || err.message.includes('Access denied')
          ? 403
          : 400;
      res.status(status).json({
        success: false,
        error: { message: err.message, code: 'CLINICAL_RELEASE_FAILED' },
      });
    }
  }
);

// ====================================================
// 5b. RESOLVE QUARANTINE HOLD (CLINICAL_STAFF ONLY)
// ====================================================

processingRouter.post(
  '/organisations/:orgId/components/:componentId/resolve-hold',
  requireAuth,
  requireOrgPermission(['clinical:release']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      const componentId = req.params.componentId as string;

      const result = await ProcessingAndInventoryService.resolveQuarantineHold(
        orgId,
        componentId,
        req.user,
        req.body
      );

      res.status(200).json({
        success: true,
        message: 'Quarantine hold resolution recorded successfully.',
        data: { component: result },
      });
    } catch (err: any) {
      const isForbidden =
        err.message?.includes('Permission denied') || err.message?.includes('Access denied');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        error: { message: err.message, code: isForbidden ? 'FORBIDDEN' : 'HOLD_RESOLUTION_FAILED' },
      });
    }
  }
);

// ====================================================
// 6. RECORD AUTHORISED DISPOSITION (DISCARD / ISSUE)
// ====================================================

processingRouter.post(
  '/organisations/:orgId/components/:componentId/disposition',
  requireAuth,
  requireOrgPermission(['disposition:record']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      const componentId = req.params.componentId as string;

      const result = await ProcessingAndInventoryService.recordDisposition(
        orgId,
        componentId,
        req.user,
        req.body
      );

      res.json({
        success: true,
        message: 'Authorised disposition recorded successfully.',
        data: result,
      });
    } catch (err: any) {
      const status =
        err.message.includes('Permission denied') || err.message.includes('Access denied')
          ? 403
          : 400;
      res.status(status).json({
        success: false,
        error: { message: err.message, code: 'DISPOSITION_RECORD_FAILED' },
      });
    }
  }
);
