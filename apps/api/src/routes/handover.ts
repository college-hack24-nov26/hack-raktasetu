import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { HandoverService } from '../services/handover';
import { prisma } from '../lib/prisma';

export const handoverRouter = Router();

// ====================================================
// 1. CREATE DRAFT HANDOVER MANIFEST
// ====================================================

// Standard REST endpoint: POST /manifests
handoverRouter.post(
  '/manifests',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        sourceCampId,
        campId = sourceCampId,
        sendingOrgId,
        receivingOrgId,
        receivingOrganisationId = receivingOrgId,
        collectionUnitIds,
        transportDetails,
        notes,
      } = req.body;

      const orgId = sendingOrgId || req.user.organisationId;
      if (!orgId) {
        res.status(400).json({
          success: false,
          error: { message: 'sendingOrgId is required.', code: 'MISSING_SENDING_ORG' },
        });
        return;
      }

      const manifest = await HandoverService.createDraftManifest(orgId, req.user, {
        campId,
        receivingOrganisationId,
        transportDetails,
        notes,
      });

      if (collectionUnitIds && Array.isArray(collectionUnitIds) && collectionUnitIds.length > 0) {
        await HandoverService.addItemsToManifest(manifest.id, req.user, collectionUnitIds);
      }

      const updated = await HandoverService.getManifestDetail(manifest.id, req.user);

      res.status(201).json({
        success: true,
        message: 'Handover manifest draft created successfully.',
        data: updated,
      });
    } catch (err: any) {
      const status =
        err.message.includes('Permission denied') || err.message.includes('Access denied')
          ? 403
          : 400;
      res.status(status).json({
        success: false,
        error: { message: err.message, code: 'MANIFEST_CREATION_FAILED' },
      });
    }
  }
);

// Scoped endpoint: POST /organisations/:orgId/handover-manifests
handoverRouter.post(
  '/organisations/:orgId/handover-manifests',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      const { campId, receivingOrganisationId, transportDetails, notes } = req.body;

      const manifest = await HandoverService.createDraftManifest(orgId, req.user, {
        campId,
        receivingOrganisationId,
        transportDetails,
        notes,
      });

      res.status(201).json({
        success: true,
        message: 'Handover manifest draft created successfully.',
        data: manifest,
      });
    } catch (err: any) {
      const status =
        err.message.includes('Permission denied') || err.message.includes('Access denied')
          ? 403
          : 400;
      res.status(status).json({
        success: false,
        error: { message: err.message, code: 'MANIFEST_CREATION_FAILED' },
      });
    }
  }
);

// ====================================================
// 2. LIST HANDOVER MANIFESTS FOR AN ORGANISATION
// ====================================================

// Standard REST endpoint: GET /manifests?organisationId=...
handoverRouter.get(
  '/manifests',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orgId = String(req.query.organisationId || req.query.orgId || '');
      if (!orgId) {
        res.status(400).json({
          success: false,
          error: { message: 'organisationId query parameter is required.', code: 'MISSING_ORG_ID' },
        });
        return;
      }
      const rawType = String(req.query.type || 'all').toLowerCase();
      const type = rawType === 'sent' || rawType === 'outbound' ? 'sent' :
                   rawType === 'received' || rawType === 'inbound' ? 'received' : 'all';

      const manifests = await HandoverService.listManifests(orgId, req.user, type);

      res.json({
        success: true,
        count: manifests.length,
        data: manifests,
      });
    } catch (err: any) {
      const status =
        err.message.includes('Permission denied') || err.message.includes('Access denied')
          ? 403
          : 400;
      res.status(status).json({
        success: false,
        error: { message: err.message, code: 'MANIFEST_LIST_FAILED' },
      });
    }
  }
);

// Scoped endpoint: GET /organisations/:orgId/handover-manifests
handoverRouter.get(
  '/organisations/:orgId/handover-manifests',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      const rawType = String(req.query.type || 'all').toLowerCase();
      const type = rawType === 'sent' || rawType === 'outbound' ? 'sent' :
                   rawType === 'received' || rawType === 'inbound' ? 'received' : 'all';

      const manifests = await HandoverService.listManifests(orgId, req.user, type);

      res.json({
        success: true,
        count: manifests.length,
        data: manifests,
      });
    } catch (err: any) {
      const status =
        err.message.includes('Permission denied') || err.message.includes('Access denied')
          ? 403
          : 400;
      res.status(status).json({
        success: false,
        error: { message: err.message, code: 'MANIFEST_LIST_FAILED' },
      });
    }
  }
);

// ====================================================
// 3. GET MANIFEST TRACEABILITY DETAIL & SUMMARY
// ====================================================

handoverRouter.get(
  ['/manifests/:manifestId', '/handover-manifests/:manifestId'],
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const manifestId = req.params.manifestId as string;
      const manifest = await HandoverService.getManifestDetail(manifestId, req.user);

      res.json({
        success: true,
        data: manifest,
      });
    } catch (err: any) {
      const status =
        err.message.includes('not found')
          ? 404
          : err.message.includes('Access denied')
          ? 403
          : 400;
      res.status(status).json({
        success: false,
        error: { message: err.message, code: 'MANIFEST_QUERY_FAILED' },
      });
    }
  }
);

// ====================================================
// 4. ADD UNITS TO DRAFT MANIFEST
// ====================================================

handoverRouter.post(
  ['/manifests/:manifestId/items', '/handover-manifests/:manifestId/items'],
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const manifestId = req.params.manifestId as string;
      const { collectionUnitIds } = req.body;

      const items = await HandoverService.addItemsToManifest(manifestId, req.user, collectionUnitIds);

      res.status(201).json({
        success: true,
        message: `Successfully added ${items.length} collection unit(s) to manifest.`,
        data: items,
      });
    } catch (err: any) {
      const status =
        err.message.includes('Permission denied') || err.message.includes('Access denied')
          ? 403
          : err.message.includes('already') || err.message.includes('committed')
          ? 409
          : 400;
      res.status(status).json({
        success: false,
        error: { message: err.message, code: 'ADD_ITEMS_FAILED' },
      });
    }
  }
);

// ====================================================
// 5. REMOVE UNIT FROM DRAFT MANIFEST
// ====================================================

handoverRouter.delete(
  ['/manifests/:manifestId/items/:collectionUnitId', '/handover-manifests/:manifestId/items/:collectionUnitId'],
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const manifestId = req.params.manifestId as string;
      const collectionUnitId = req.params.collectionUnitId as string;

      const result = await HandoverService.removeItemFromManifest(manifestId, collectionUnitId, req.user);

      res.json({
        success: true,
        message: result.message,
      });
    } catch (err: any) {
      const status =
        err.message.includes('Permission denied') || err.message.includes('Access denied')
          ? 403
          : 400;
      res.status(status).json({
        success: false,
        error: { message: err.message, code: 'REMOVE_ITEM_FAILED' },
      });
    }
  }
);

// ====================================================
// 6. FINALISE MANIFEST
// ====================================================

handoverRouter.post(
  ['/manifests/:manifestId/finalise', '/handover-manifests/:manifestId/finalise'],
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const manifestId = req.params.manifestId as string;
      const { notes } = req.body;

      const finalised = await HandoverService.finaliseManifest(manifestId, req.user, notes);

      res.json({
        success: true,
        message: 'Handover manifest finalised successfully. Item list is now frozen.',
        data: finalised,
      });
    } catch (err: any) {
      const status =
        err.message.includes('Permission denied') || err.message.includes('Access denied')
          ? 403
          : 400;
      res.status(status).json({
        success: false,
        error: { message: err.message, code: 'FINALISE_FAILED' },
      });
    }
  }
);

// ====================================================
// 7. RECORD DISPATCH (PHYSICAL TRANSPORT IN PROGRESS)
// ====================================================

handoverRouter.post(
  ['/manifests/:manifestId/dispatch', '/handover-manifests/:manifestId/dispatch'],
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const manifestId = req.params.manifestId as string;
      const rawDetails = req.body.transportDetails || req.body;
      const transportDetails = {
        courierName: rawDetails.courierName || rawDetails.carrierName,
        vehicleNumber: rawDetails.vehicleNumber,
        driverPhone: rawDetails.driverPhone || rawDetails.driverContact,
        coldBoxTempCelsius: rawDetails.coldBoxTempCelsius !== undefined ? rawDetails.coldBoxTempCelsius : rawDetails.departureTempCelsius,
        dispatchNotes: rawDetails.dispatchNotes,
      };

      const dispatched = await HandoverService.dispatchManifest(manifestId, req.user, {
        transportDetails,
        dispatchNotes: req.body.dispatchNotes || transportDetails.dispatchNotes,
      });

      res.json({
        success: true,
        message: 'Physical dispatch recorded. Units are now IN_TRANSIT.',
        data: dispatched,
      });
    } catch (err: any) {
      const status =
        err.message.includes('Permission denied') || err.message.includes('Access denied')
          ? 403
          : 400;
      res.status(status).json({
        success: false,
        error: { message: err.message, code: 'DISPATCH_FAILED' },
      });
    }
  }
);

// ====================================================
// 8. RECORD INDIVIDUAL UNIT RECEIPT OUTCOME
// ====================================================

// Blood Bank Portal unit intake endpoint: POST /manifests/:manifestId/items/:itemId/receive
handoverRouter.post(
  ['/manifests/:manifestId/items/:itemId/receive', '/handover-manifests/:manifestId/items/:itemId/receive'],
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const manifestId = req.params.manifestId as string;
      const itemId = req.params.itemId as string;
      const { outcome, notes, recordedTempCelsius } = req.body;

      const item = await prisma.handoverItem.findFirst({
        where: { id: itemId, manifestId },
      });

      if (!item) {
        res.status(404).json({
          success: false,
          error: { message: 'Manifest item not found.', code: 'ITEM_NOT_FOUND' },
        });
        return;
      }

      const result = await HandoverService.receiveItem(manifestId, req.user, {
        collectionUnitId: item.collectionUnitId,
        outcome,
        discrepancyNote: notes,
      });

      res.json({
        success: true,
        message: 'Unit receipt outcome recorded successfully.',
        data: result,
      });
    } catch (err: any) {
      const status =
        err.message.includes('Permission denied') || err.message.includes('Access denied')
          ? 403
          : 400;
      res.status(status).json({
        success: false,
        error: { message: err.message, code: 'RECEIPT_FAILED' },
      });
    }
  }
);

// Collection-unit based receipt endpoint: POST /handover-manifests/:manifestId/receipts
handoverRouter.post(
  ['/manifests/:manifestId/receipts', '/handover-manifests/:manifestId/receipts'],
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const manifestId = req.params.manifestId as string;
      const {
        collectionUnitId,
        outcome,
        discrepancyCategory,
        discrepancyNote,
        severity,
      } = req.body;

      const result = await HandoverService.receiveItem(manifestId, req.user, {
        collectionUnitId,
        outcome,
        discrepancyCategory,
        discrepancyNote,
        severity,
      });

      res.json({
        success: true,
        message: 'Unit receipt outcome recorded successfully.',
        data: result,
      });
    } catch (err: any) {
      const status =
        err.message.includes('Permission denied') || err.message.includes('Access denied')
          ? 403
          : 400;
      res.status(status).json({
        success: false,
        error: { message: err.message, code: 'RECEIPT_FAILED' },
      });
    }
  }
);

// ====================================================
// 9. LOG UNEXPECTED COLLECTION UNIT ARRIVAL
// ====================================================

handoverRouter.post(
  ['/manifests/:manifestId/unexpected', '/handover-manifests/:manifestId/unexpected'],
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const manifestId = req.params.manifestId as string;
      const { unitIdentifier, outcome = 'UNEXPECTED', notes } = req.body;

      if (!unitIdentifier) {
        res.status(400).json({
          success: false,
          error: { message: 'unitIdentifier is required.', code: 'MISSING_UNIT_IDENTIFIER' },
        });
        return;
      }

      const unit = await prisma.collectionUnit.findFirst({
        where: {
          OR: [{ unitNumber: unitIdentifier.trim() }, { id: unitIdentifier.trim() }],
        },
      });

      if (!unit) {
        res.status(404).json({
          success: false,
          error: {
            message: `Collection unit "${unitIdentifier}" does not exist in the national registry.`,
            code: 'UNIT_NOT_FOUND',
          },
        });
        return;
      }

      const result = await HandoverService.receiveItem(manifestId, req.user, {
        collectionUnitId: unit.id,
        outcome: 'UNEXPECTED',
        discrepancyNote: notes || `Unexpected bag ${unit.unitNumber} arrived with manifest`,
        discrepancyCategory: 'UNEXPECTED_UNIT',
      });

      res.json({
        success: true,
        message: 'Unexpected collection unit logged and quarantined.',
        data: result,
      });
    } catch (err: any) {
      const status =
        err.message.includes('Permission denied') || err.message.includes('Access denied')
          ? 403
          : 400;
      res.status(status).json({
        success: false,
        error: { message: err.message, code: 'UNEXPECTED_BAG_FAILED' },
      });
    }
  }
);

// ====================================================
// 10. RESOLVE RECONCILIATION EXCEPTION
// ====================================================

handoverRouter.post(
  [
    '/manifests/:manifestId/exceptions/:exceptionId/resolve',
    '/handover-manifests/:manifestId/exceptions/:exceptionId/resolve',
  ],
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const exceptionId = req.params.exceptionId as string;
      const { resolutionNotes, status } = req.body;

      const updated = await HandoverService.resolveException(exceptionId, req.user, {
        resolutionNotes,
        status: status === 'WAIVED' ? 'WAIVED' : 'RESOLVED',
      });

      res.json({
        success: true,
        message: 'Reconciliation exception marked as resolved.',
        data: updated,
      });
    } catch (err: any) {
      const httpStatus =
        err.message.includes('Permission denied') || err.message.includes('Access denied')
          ? 403
          : 400;
      res.status(httpStatus).json({
        success: false,
        error: { message: err.message, code: 'EXCEPTION_RESOLUTION_FAILED' },
      });
    }
  }
);

handoverRouter.patch(
  [
    '/manifests/:manifestId/exceptions/:exceptionId',
    '/handover-manifests/:manifestId/exceptions/:exceptionId',
  ],
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const exceptionId = req.params.exceptionId as string;
      const { resolutionNotes, status } = req.body;

      const updated = await HandoverService.resolveException(exceptionId, req.user, {
        resolutionNotes,
        status,
      });

      res.json({
        success: true,
        message: 'Reconciliation exception updated successfully.',
        data: updated,
      });
    } catch (err: any) {
      const httpStatus =
        err.message.includes('Permission denied') || err.message.includes('Access denied')
          ? 403
          : 400;
      res.status(httpStatus).json({
        success: false,
        error: { message: err.message, code: 'EXCEPTION_RESOLUTION_FAILED' },
      });
    }
  }
);

// ====================================================
// 11. RECONCILE MANIFEST
// ====================================================

handoverRouter.post(
  ['/manifests/:manifestId/reconcile', '/handover-manifests/:manifestId/reconcile'],
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const manifestId = req.params.manifestId as string;
      const notes = req.body.reconciliationNotes || req.body.notes;

      const reconciled = await HandoverService.reconcileManifest(manifestId, req.user, notes);

      res.json({
        success: true,
        message: 'Handover manifest officially reconciled.',
        data: reconciled,
      });
    } catch (err: any) {
      const status =
        err.message.includes('Permission denied') || err.message.includes('Access denied')
          ? 403
          : 400;
      res.status(status).json({
        success: false,
        error: { message: err.message, code: 'RECONCILIATION_FAILED' },
      });
    }
  }
);

// ====================================================
// 12. CANCEL MANIFEST (DRAFT / FINALISED ONLY)
// ====================================================

handoverRouter.post(
  ['/manifests/:manifestId/cancel', '/handover-manifests/:manifestId/cancel'],
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const manifestId = req.params.manifestId as string;
      const { reason } = req.body;

      const cancelled = await HandoverService.cancelManifest(manifestId, req.user, reason);

      res.json({
        success: true,
        message: 'Handover manifest cancelled and units reverted to available.',
        data: cancelled,
      });
    } catch (err: any) {
      const status =
        err.message.includes('Permission denied') || err.message.includes('Access denied')
          ? 403
          : 400;
      res.status(status).json({
        success: false,
        error: { message: err.message, code: 'CANCEL_FAILED' },
      });
    }
  }
);
