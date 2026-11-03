import { Router, Response } from 'express';
import { TraceabilityService } from '../services/traceability';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { CollectionUnitStatus, ComponentUnitStatus, BloodGroup } from '@prisma/client';

export const traceabilityRouter = Router();

/**
 * POST /api/v1/traceability/collection-units
 * Confirm and register a physical collection unit from an eligible completed donation event.
 * Protected: Requires active membership (ORG_ADMIN or COLLECTION_STAFF) in the responsible organisation.
 */
traceabilityRouter.post(
  '/traceability/collection-units',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { donationEventId, bagIdentifier, volumeMl, notes, metadata } = req.body;

      if (!donationEventId) {
        res.status(400).json({
          success: false,
          error: { message: 'donationEventId is mandatory.', code: 'MISSING_EVENT_ID' },
        });
        return;
      }

      const unit = await TraceabilityService.createCollectionUnit(req.user, {
        donationEventId,
        bagIdentifier,
        volumeMl: volumeMl ? parseInt(volumeMl, 10) : undefined,
        notes,
        metadata,
      });

      res.status(201).json({
        success: true,
        message: 'Collection unit confirmed and registered successfully.',
        data: unit,
      });
    } catch (err: any) {
      const isConflict = err.message?.includes('already been confirmed');
      const isForbidden = err.message?.includes('Permission denied');
      res.status(isConflict ? 409 : isForbidden ? 403 : 400).json({
        success: false,
        error: {
          message: err.message || 'Failed to create collection unit.',
          code: isConflict ? 'DUPLICATE_COLLECTION_UNIT' : isForbidden ? 'FORBIDDEN' : 'CREATION_FAILED',
        },
      });
    }
  }
);

/**
 * GET /api/v1/traceability/collection-units
 * List collection units for an organisation.
 * Protected: Requires active membership in the target organisation.
 */
traceabilityRouter.get(
  '/traceability/collection-units',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const organisationId = String(req.query.organisationId || '');
      if (!organisationId) {
        res.status(400).json({
          success: false,
          error: { message: 'organisationId query parameter is required.', code: 'MISSING_ORG_ID' },
        });
        return;
      }

      const status = typeof req.query.status === 'string' ? (req.query.status as CollectionUnitStatus) : undefined;
      const bloodGroup = typeof req.query.bloodGroup === 'string' ? (req.query.bloodGroup as BloodGroup) : undefined;
      const campId = typeof req.query.campId === 'string' ? req.query.campId : undefined;

      const units = await TraceabilityService.listCollectionUnits(organisationId, req.user, {
        status,
        bloodGroup,
        campId,
      });

      res.json({
        success: true,
        count: units.length,
        data: units,
      });
    } catch (err: any) {
      const isForbidden = err.message?.includes('Permission denied');
      res.status(isForbidden ? 403 : 400).json({
        success: false,
        error: { message: err.message || 'Failed to list collection units.', code: isForbidden ? 'FORBIDDEN' : 'LIST_FAILED' },
      });
    }
  }
);

/**
 * GET /api/v1/traceability/collection-units/:id
 * Retrieve complete unit-level lineage and traceability history.
 * Protected: Requires active organisation membership.
 */
traceabilityRouter.get(
  '/traceability/collection-units/:id',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const unitId = String(req.params.id);
      const traceability = await TraceabilityService.getCollectionUnitTraceability(unitId, req.user);

      res.json({
        success: true,
        data: traceability,
      });
    } catch (err: any) {
      const isNotFound = err.message?.includes('not found');
      const isForbidden = err.message?.includes('Permission denied');
      res.status(isNotFound ? 404 : isForbidden ? 403 : 400).json({
        success: false,
        error: {
          message: err.message || 'Failed to retrieve unit traceability.',
          code: isNotFound ? 'NOT_FOUND' : isForbidden ? 'FORBIDDEN' : 'FETCH_FAILED',
        },
      });
    }
  }
);

/**
 * PATCH /api/v1/traceability/collection-units/:id/status
 * Record a permitted collection unit status transition with atomic status history logging.
 * Protected: Requires unit:transition / ORG_ADMIN.
 */
traceabilityRouter.patch(
  '/traceability/collection-units/:id/status',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const unitId = String(req.params.id);
      const { status, reason, referenceNote, metadata } = req.body;

      if (!status) {
        res.status(400).json({
          success: false,
          error: { message: 'status field is required.', code: 'MISSING_STATUS' },
        });
        return;
      }

      const updated = await TraceabilityService.updateCollectionUnitStatus(unitId, req.user, {
        status: status as CollectionUnitStatus,
        reason,
        referenceNote,
        metadata,
      });

      res.json({
        success: true,
        message: `Collection unit status transitioned to ${status}.`,
        data: updated,
      });
    } catch (err: any) {
      const isForbidden = err.message?.includes('Permission denied');
      const isInvalid = err.message?.includes('Invalid collection unit status transition') || err.message?.includes('Cannot transition');
      res.status(isForbidden ? 403 : isInvalid ? 400 : 500).json({
        success: false,
        error: {
          message: err.message || 'Failed to transition collection unit status.',
          code: isForbidden ? 'FORBIDDEN' : isInvalid ? 'INVALID_TRANSITION' : 'UPDATE_FAILED',
        },
      });
    }
  }
);

/**
 * POST /api/v1/traceability/collection-units/:id/derive-components
 * Register derived blood components from source collection unit.
 * Protected: Requires component:derive (INVENTORY_STAFF, CLINICAL_STAFF, or ORG_ADMIN).
 */
traceabilityRouter.post(
  '/traceability/collection-units/:id/derive-components',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const collectionUnitId = String(req.params.id);
      const { components, reason } = req.body;

      if (!components || !Array.isArray(components) || components.length === 0) {
        res.status(400).json({
          success: false,
          error: { message: 'components array is required and must contain at least one component.', code: 'MISSING_COMPONENTS' },
        });
        return;
      }

      const derived = await TraceabilityService.deriveComponents(collectionUnitId, req.user, {
        components,
        reason,
      });

      res.status(201).json({
        success: true,
        message: `${derived.length} component(s) derived successfully.`,
        data: derived,
      });
    } catch (err: any) {
      const isForbidden = err.message?.includes('Permission denied');
      const isConflict = err.message?.includes('already been completed');
      res.status(isForbidden ? 403 : isConflict ? 400 : 400).json({
        success: false,
        error: {
          message: err.message || 'Failed to derive components.',
          code: isForbidden ? 'FORBIDDEN' : isConflict ? 'ALREADY_DERIVED' : 'DERIVATION_FAILED',
        },
      });
    }
  }
);

/**
 * GET /api/v1/traceability/components/:id
 * Retrieve component traceability and source lineage.
 * Protected: Requires active organisation membership.
 */
traceabilityRouter.get(
  '/traceability/components/:id',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const componentId = String(req.params.id);
      const comp = await TraceabilityService.getComponentTraceability(componentId, req.user);

      res.json({
        success: true,
        data: comp,
      });
    } catch (err: any) {
      const isNotFound = err.message?.includes('not found');
      const isForbidden = err.message?.includes('Permission denied');
      res.status(isNotFound ? 404 : isForbidden ? 403 : 400).json({
        success: false,
        error: {
          message: err.message || 'Failed to retrieve component traceability.',
          code: isNotFound ? 'NOT_FOUND' : isForbidden ? 'FORBIDDEN' : 'FETCH_FAILED',
        },
      });
    }
  }
);

/**
 * PATCH /api/v1/traceability/components/:id/status
 * Update component status with atomic status history logging.
 * Protected: Requires INVENTORY_STAFF, CLINICAL_STAFF, or ORG_ADMIN.
 */
traceabilityRouter.patch(
  '/traceability/components/:id/status',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const componentId = String(req.params.id);
      const { status, reason, referenceNote, metadata } = req.body;

      if (!status) {
        res.status(400).json({
          success: false,
          error: { message: 'status field is required.', code: 'MISSING_STATUS' },
        });
        return;
      }

      const updated = await TraceabilityService.updateComponentStatus(componentId, req.user, {
        status: status as ComponentUnitStatus,
        reason,
        referenceNote,
        metadata,
      });

      res.json({
        success: true,
        message: `Component status transitioned to ${status}.`,
        data: updated,
      });
    } catch (err: any) {
      const isDirectProhibited = err.message?.includes('DIRECT_RELEASE_PROHIBITED');
      const isForbidden = err.message?.includes('Permission denied');
      const isInvalid = err.message?.includes('Invalid component unit status transition') || err.message?.includes('Cannot transition');
      res.status(isForbidden ? 403 : (isInvalid || isDirectProhibited) ? 400 : 500).json({
        success: false,
        error: {
          message: err.message || 'Failed to transition component status.',
          code: isDirectProhibited ? 'DIRECT_RELEASE_PROHIBITED' : isForbidden ? 'FORBIDDEN' : isInvalid ? 'INVALID_TRANSITION' : 'UPDATE_FAILED',
        },
      });
    }
  }
);
