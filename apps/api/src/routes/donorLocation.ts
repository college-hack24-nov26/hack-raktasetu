import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { requirePlatformAdmin } from '../middleware/rbac';
import { DonorLocationService } from '../services/donorLocationService';

export const donorLocationRouter = Router();

/**
 * POST /api/v1/donor/location/session/start
 * Start a revocable, consented live-location sharing session.
 * Requires explicit consent and authenticated donor session.
 */
donorLocationRouter.post(
  '/donor/location/session/start',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { consentGranted, consentVersion } = req.body;

      const session = await DonorLocationService.startSession(req.user, {
        consentGranted,
        consentVersion,
      });

      res.status(201).json({
        success: true,
        message: 'Location sharing session started successfully.',
        data: session,
      });
    } catch (err: any) {
      const status = err.statusCode || (err.code === 'CONSENT_REQUIRED' || err.code === 'INVALID_CONSENT_VERSION' ? 400 : 500);
      res.status(status).json({
        success: false,
        error: {
          message: err.message || 'Failed to start location sharing session.',
          code: err.code || 'SESSION_START_FAILED',
        },
      });
    }
  }
);

/**
 * POST /api/v1/donor/location/update
 * Submit an authenticated location update for the donor's active session.
 */
donorLocationRouter.post(
  '/donor/location/update',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await DonorLocationService.updateLocation(req.user, req.body);

      res.status(200).json({
        success: true,
        message: 'Location update recorded successfully.',
        data: result,
      });
    } catch (err: any) {
      const status =
        err.statusCode ||
        (err.code === 'NO_ACTIVE_SESSION' || err.code === 'OUT_OF_ORDER_UPDATE'
          ? 409
          : err.code === 'UPDATE_RATE_LIMITED'
          ? 429
          : 400);

      res.status(status).json({
        success: false,
        error: {
          message: err.message || 'Failed to record location update.',
          code: err.code || 'LOCATION_UPDATE_FAILED',
        },
      });
    }
  }
);

/**
 * POST /api/v1/donor/location/session/stop
 * Stop or revoke an active location sharing session.
 * Idempotent and safe for repeated calls.
 */
donorLocationRouter.post(
  '/donor/location/session/stop',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await DonorLocationService.stopSession(req.user, req.body);

      res.status(200).json({
        success: true,
        message: result
          ? 'Location sharing session stopped successfully.'
          : 'No active session was found to stop.',
        data: result,
      });
    } catch (err: any) {
      res.status(err.statusCode || 400).json({
        success: false,
        error: {
          message: err.message || 'Failed to stop location sharing session.',
          code: err.code || 'SESSION_STOP_FAILED',
        },
      });
    }
  }
);

/**
 * GET /api/v1/admin/locations/live
 * Retrieve current live donor locations for Platform / System Administrators only.
 * Restricted strictly by requireAuth and requirePlatformAdmin.
 */
donorLocationRouter.get(
  '/admin/locations/live',
  requireAuth,
  requirePlatformAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const stateCode = req.query.stateCode ? parseInt(String(req.query.stateCode), 10) : undefined;
      const districtCode = req.query.districtCode ? parseInt(String(req.query.districtCode), 10) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;

      const locations = await DonorLocationService.getLiveLocationsForAdmin({
        stateCode: isNaN(stateCode as any) ? undefined : stateCode,
        districtCode: isNaN(districtCode as any) ? undefined : districtCode,
        status,
      });

      res.status(200).json({
        success: true,
        count: locations.length,
        data: locations,
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        success: false,
        error: {
          message: err.message || 'Failed to retrieve live donor locations.',
          code: err.code || 'LOCATION_FETCH_FAILED',
        },
      });
    }
  }
);
