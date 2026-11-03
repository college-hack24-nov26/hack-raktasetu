import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { requireOrgPermission } from '../middleware/rbac';
import { ProcessingAndInventoryService } from '../services/processingAndInventory';
import { ComponentUnitStatus, ComponentType, BloodGroup } from '@prisma/client';

export const inventoryRouter = Router();

// ====================================================
// 1. CREATE STORAGE LOCATION
// ====================================================

inventoryRouter.post(
  '/organisations/:orgId/storage-locations',
  requireAuth,
  requireOrgPermission(['storage:manage']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      const location = await ProcessingAndInventoryService.createStorageLocation(
        orgId,
        req.user,
        req.body
      );

      res.status(201).json({
        success: true,
        message: 'Storage location configured successfully.',
        data: location,
      });
    } catch (err: any) {
      const status =
        err.message.includes('Permission denied') || err.message.includes('Access denied')
          ? 403
          : 400;
      res.status(status).json({
        success: false,
        error: { message: err.message, code: 'STORAGE_LOCATION_CREATION_FAILED' },
      });
    }
  }
);

// ====================================================
// 2. LIST STORAGE LOCATIONS
// ====================================================

inventoryRouter.get(
  '/organisations/:orgId/storage-locations',
  requireAuth,
  requireOrgPermission(['inventory:view']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      const locations = await ProcessingAndInventoryService.listStorageLocations(
        orgId,
        req.user
      );

      res.json({
        success: true,
        count: locations.length,
        data: locations,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { message: err.message, code: 'FETCH_STORAGE_LOCATIONS_FAILED' },
      });
    }
  }
);

// ====================================================
// 3. RECORD STORAGE MOVEMENT (WITH EXCURSION DETECTION)
// ====================================================

inventoryRouter.post(
  '/organisations/:orgId/components/:componentId/storage-movement',
  requireAuth,
  requireOrgPermission(['storage:manage']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      const componentId = req.params.componentId as string;

      const result = await ProcessingAndInventoryService.recordStorageMovement(
        orgId,
        componentId,
        req.user,
        req.body
      );

      res.status(200).json({
        success: true,
        message: 'Storage movement recorded successfully.',
        data: result,
      });
    } catch (err: any) {
      const status =
        err.message.includes('Permission denied') || err.message.includes('Access denied')
          ? 403
          : 400;
      res.status(status).json({
        success: false,
        error: { message: err.message, code: 'STORAGE_MOVEMENT_FAILED' },
      });
    }
  }
);

// ====================================================
// 4. LIST STORAGE MOVEMENTS FOR A COMPONENT
// ====================================================

inventoryRouter.get(
  '/organisations/:orgId/components/:componentId/storage-movements',
  requireAuth,
  requireOrgPermission(['inventory:view']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      const componentId = req.params.componentId as string;

      const movements = await ProcessingAndInventoryService.listStorageMovements(
        orgId,
        componentId,
        req.user
      );

      res.json({
        success: true,
        count: movements.length,
        data: movements,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { message: err.message, code: 'FETCH_STORAGE_MOVEMENTS_FAILED' },
      });
    }
  }
);

// ====================================================
// 5. TRIGGER AUTOMATED EXPIRY SWEEP
// ====================================================

inventoryRouter.post(
  '/organisations/:orgId/inventory/expiry-sweep',
  requireAuth,
  requireOrgPermission(['storage:manage']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      const result = await ProcessingAndInventoryService.sweepExpiredComponents(
        orgId,
        req.user
      );

      res.json({
        success: true,
        message: `Expiry sweep completed: ${result.sweptCount} expired unit(s) isolated from active inventory.`,
        data: result,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { message: err.message, code: 'EXPIRY_SWEEP_FAILED' },
      });
    }
  }
);

// ====================================================
// 6. GET AUTHORITATIVE INVENTORY SUMMARY
// ====================================================

inventoryRouter.get(
  '/organisations/:orgId/inventory/summary',
  requireAuth,
  requireOrgPermission(['inventory:view']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      const summary = await ProcessingAndInventoryService.getInventorySummary(
        orgId,
        req.user
      );

      res.json({
        success: true,
        data: summary,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { message: err.message, code: 'FETCH_INVENTORY_SUMMARY_FAILED' },
      });
    }
  }
);

// ====================================================
// 7. LIST FILTERABLE INVENTORY COMPONENTS (NO DONOR PII)
// ====================================================

inventoryRouter.get(
  '/organisations/:orgId/inventory/components',
  requireAuth,
  requireOrgPermission(['inventory:view']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orgId = req.params.orgId as string;
      const {
        status,
        componentType,
        bloodGroup,
        storageLocationId,
        isHold,
        search,
        page,
        limit,
      } = req.query;

      const result = await ProcessingAndInventoryService.listInventoryComponents(
        orgId,
        req.user,
        {
          status: status ? (status as ComponentUnitStatus) : undefined,
          componentType: componentType ? (componentType as ComponentType) : undefined,
          bloodGroup: bloodGroup ? (bloodGroup as BloodGroup) : undefined,
          storageLocationId: typeof storageLocationId === 'string' ? storageLocationId : undefined,
          isHold: isHold !== undefined ? isHold === 'true' : undefined,
          search: typeof search === 'string' ? search : undefined,
          page: page ? parseInt(page as string, 10) : undefined,
          limit: limit ? parseInt(limit as string, 10) : undefined,
        }
      );

      res.json({
        success: true,
        ...result,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: { message: err.message, code: 'FETCH_INVENTORY_COMPONENTS_FAILED' },
      });
    }
  }
);
