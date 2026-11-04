import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { requirePlatformAdmin } from '../middleware/rbac';
import { AdminMatchingService } from '../services/adminMatchingService';

export const adminMatchingRouter = Router();

// Platform Admin authentication required for all routes
adminMatchingRouter.use('/admin/matching', requireAuth, requirePlatformAdmin);

/**
 * GET /api/v1/admin/matching/requests
 * Retrieve all blood requests with active donor matching workflows
 */
adminMatchingRouter.get(
  '/admin/matching/requests',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const data = await AdminMatchingService.getPendingMatchingRequests();
      return res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/admin/matching/requests/:requestId/run-search
 * Execute deterministic matching algorithm for a blood request
 */
adminMatchingRouter.post(
  '/admin/matching/requests/:requestId/run-search',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const requestId = String(req.params.requestId);
      const { scope, expansionReason } = req.body || {};

      const result = await AdminMatchingService.runMatchingSearch(
        req.user.id,
        requestId,
        scope,
        expansionReason
      );

      return res.json({
        success: true,
        data: result,
        message: `Matching search completed. Found ${result.counts.total} eligible candidate(s).`,
      });
    } catch (error: any) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          error: { message: error.message, code: error.code || 'SEARCH_FAILED' },
        });
      }
      next(error);
    }
  }
);

/**
 * POST /api/v1/admin/matching/requests/:requestId/release
 * Platform Admin releases approved donor candidates to the requesting Blood Bank
 */
adminMatchingRouter.post(
  '/admin/matching/requests/:requestId/release',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const requestId = String(req.params.requestId);
      const { candidateIds, notes } = req.body || {};

      const result = await AdminMatchingService.releaseMatchingCandidates(
        req.user.id,
        requestId,
        candidateIds,
        notes
      );

      return res.json({
        success: true,
        data: result,
        message: result.message,
      });
    } catch (error: any) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          error: { message: error.message, code: error.code || 'RELEASE_FAILED' },
        });
      }
      next(error);
    }
  }
);

/**
 * POST /api/v1/admin/matching/requests/:requestId/expand-scope
 * Platform Admin explicitly expands search scope with structured justification
 */
adminMatchingRouter.post(
  '/admin/matching/requests/:requestId/expand-scope',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const requestId = String(req.params.requestId);
      const { newScope, reason } = req.body || {};

      if (!newScope || !['DISTRICT_EXPANDED', 'OUT_OF_DISTRICT'].includes(newScope)) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'newScope must be either DISTRICT_EXPANDED or OUT_OF_DISTRICT.',
            code: 'INVALID_SCOPE',
          },
        });
      }

      if (!reason || typeof reason !== 'string' || !reason.trim()) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'A structured reason is required to expand matching scope.',
            code: 'EXPANSION_REASON_REQUIRED',
          },
        });
      }

      const result = await AdminMatchingService.runMatchingSearch(
        req.user.id,
        requestId,
        newScope,
        reason.trim()
      );

      return res.json({
        success: true,
        data: result,
        message: `Scope expanded to ${newScope}. Found ${result.counts.total} candidate(s).`,
      });
    } catch (error: any) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          error: { message: error.message, code: error.code || 'EXPAND_SCOPE_FAILED' },
        });
      }
      next(error);
    }
  }
);

/**
 * GET /api/v1/admin/matching/requests/:requestId/candidates/:candidateId/directions
 * Platform Admin retrieves Mapbox driving road distance and travel duration for a candidate.
 */
adminMatchingRouter.get(
  '/admin/matching/requests/:requestId/candidates/:candidateId/directions',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const requestId = String(req.params.requestId);
      const candidateId = String(req.params.candidateId);
      const profile = (req.query.profile as any) || 'driving';

      const directions = await AdminMatchingService.getCandidateDirections(
        requestId,
        candidateId,
        profile
      );

      if (!directions) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Unable to calculate road directions. Missing coordinates or route unavailable.',
            code: 'DIRECTIONS_UNAVAILABLE',
          },
        });
      }

      return res.json({
        success: true,
        data: directions,
      });
    } catch (error: any) {
      if (error.statusCode) {
        return res.status(error.statusCode).json({
          success: false,
          error: { message: error.message, code: error.code || 'DIRECTIONS_FAILED' },
        });
      }
      next(error);
    }
  }
);

