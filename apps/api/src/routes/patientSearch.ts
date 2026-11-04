import { Router, Response, NextFunction } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import {
  PatientSearchService,
  PatientSearchFilters,
} from '../services/patientSearch';
import {
  PatientRequestService,
  CreatePatientRequestInput,
  TransitionRequestInput,
  PatientRequestStatus,
} from '../services/patientRequestCoordination';
import { BloodRequestCoordinationService } from '../services/bloodRequestCoordination';
import { parseRequestMessageMetadata } from '../services/hospitalIntegration';

export const patientSearchRouter = Router();

// ====================================================
// 1. UNIFIED PATIENT SEARCH FOR BLOOD AVAILABILITY
// ====================================================
// Public, rate-limited endpoint.
// Aggregates participating organisation authoritative inventory
// and eRaktKosh directory snapshots with clear source labels.
// NEVER implies external listing guarantees clinical suitability or stock.

patientSearchRouter.get(
  '/patient-search/availability',
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const stateCode = req.query.stateCode ? parseInt(req.query.stateCode as string, 10) : undefined;
      const districtCode = req.query.districtCode ? parseInt(req.query.districtCode as string, 10) : undefined;
      const bloodGroup = req.query.bloodGroup ? String(req.query.bloodGroup).trim() : undefined;
      const componentType = req.query.componentType ? String(req.query.componentType).trim() : undefined;
      const hospitalCode = req.query.hospitalCode ? String(req.query.hospitalCode).trim() : undefined;
      const source = req.query.source as 'all' | 'participating' | 'external' | undefined;

      const filters: PatientSearchFilters = {
        stateCode: isNaN(stateCode as number) ? undefined : stateCode,
        districtCode: isNaN(districtCode as number) ? undefined : districtCode,
        bloodGroup,
        componentType,
        hospitalCode,
        source: source && ['all', 'participating', 'external'].includes(source) ? source : 'all',
      };

      const result = await PatientSearchService.searchAvailability(filters);

      return res.json({
        success: true,
        data: result.results,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ====================================================
// 2. PARTICIPATING ORGANISATION PUBLIC AVAILABILITY
// ====================================================
// Public view of clinically released, non-expired inventory in a verified blood bank.
// Strictly no donor PII or internal barcodes.

patientSearchRouter.get(
  '/patient-search/organisations/:orgId/availability',
  async (req: any, res: Response, next: NextFunction) => {
    try {
      const orgId = req.params.orgId as string;
      const result = await PatientSearchService.getOrgPublicAvailability(orgId);

      return res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      const isNotFound = error.message?.includes('not found') || error.message?.includes('not verified');
      return res.status(isNotFound ? 404 : 400).json({
        success: false,
        error: {
          message: error.message || 'Failed to retrieve organisation availability.',
          code: isNotFound ? 'ORG_NOT_FOUND' : 'AVAILABILITY_QUERY_FAILED',
        },
      });
    }
  }
);

// ====================================================
// 3. CREATE PATIENT BLOOD REQUEST (Phase 8 Lifecycle)
// ====================================================
// Authenticated user creates a request with lifecycle state: SUBMITTED.

patientSearchRouter.post(
  '/patient-requests',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await BloodRequestCoordinationService.createCanonicalRequest(req.user.id, {
        patientName: req.body.patientName,
        bloodGroup: req.body.bloodGroup,
        component: req.body.component || req.body.componentType || 'Whole Blood',
        unitsRequested: req.body.unitsRequested,
        requiredBy: req.body.requiredBy,
        hospitalCode: req.body.hospitalCode || req.body.organisationId,
        admittedHospitalName: req.body.admittedHospitalName || req.body.hospitalName,
        receivingFacilityId: req.body.receivingFacilityId,
        urgency: req.body.urgency || 'ROUTINE',
        searchScope: req.body.searchScope,
        message: req.body.message,
        requesterContact: req.body.requesterContact || req.user.phoneNumber,
        requesterConsent: req.body.requesterConsent,
      });

      return res.status(result.isDuplicateSuppressed ? 200 : 201).json({
        success: true,
        message: result.isDuplicateSuppressed
          ? 'Recent request submission recovered.'
          : 'Patient request submitted successfully. State: SUBMITTED.',
        data: {
          ...result,
          lifecycleStatus: result.closureOutcome || 'SUBMITTED',
        },
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error: {
          message: error.message || 'Failed to create patient request.',
          code: 'PATIENT_REQUEST_CREATION_FAILED',
        },
      });
    }
  }
);

// ====================================================
// 4. LIST PATIENT'S REQUESTS
// ====================================================
// Authenticated user retrieves their requests with Phase 8 lifecycle states.

patientSearchRouter.get(
  '/patient-requests',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const where: any = req.user.role === 'ADMIN' ? {} : { requesterId: req.user.id };

      const requests = await prisma.bloodRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          bloodCentre: {
            select: {
              hospitalCode: true,
              hospitalName: true,
              address: true,
              districtCode: true,
            },
          },
        },
      });

      const formatted = requests.map((r: any) => {
        const meta = parseRequestMessageMetadata(r.message, r.bloodCentre?.hospitalName);
        const lifecycleStage = r.closureOutcome || r.reportedDonationStatus || (r.status === 'CLOSED' ? 'FULFILLED' : r.status);
        return {
          id: r.id,
          requestReference: `#${r.id.slice(0, 8)}`,
          patientName: r.patientName,
          admittedHospitalName: meta.hospitalName || r.bloodCentre?.hospitalName || 'Local Medical Centre',
          bloodGroup: r.bloodGroup,
          component: r.component,
          unitsRequested: r.unitsRequested,
          requiredBy: r.requiredBy,
          hospitalCode: r.hospitalCode,
          bloodCentre: r.bloodCentre,
          assignedBankId: meta.assignedBankId || null,
          assignedBankName: meta.assignedBankName || null,
          transportDetails: meta.transportDetails || null,
          canConfirmReceipt: lifecycleStage === 'DISPATCHED' && !meta.patientAcknowledgedAt,
          urgency: meta.urgency || 'ROUTINE',
          status: r.status,
          lifecycleStatus: lifecycleStage,
          patientAcknowledgedAt: meta.patientAcknowledgedAt || null,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        };
      });

      return res.json({
        success: true,
        data: formatted,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ====================================================
// 5. GET PATIENT REQUEST DETAILS
// ====================================================
// Authenticated requester or ADMIN view with sanitized donor info and real-time state.

patientSearchRouter.get(
  '/patient-requests/:id',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const requestId = req.params.id as string;
      const result = await PatientRequestService.getRequestDetails(
        requestId,
        req.user.id,
        req.user.role
      );

      if (!result) {
        return res.status(404).json({
          success: false,
          error: {
            message: 'Patient request not found or access denied.',
            code: 'NOT_FOUND',
          },
        });
      }

      return res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ====================================================
// 6. TRANSITION PATIENT REQUEST LIFECYCLE
// ====================================================
// Governed state machine transition.

patientSearchRouter.patch(
  '/patient-requests/:id/transition',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const requestId = req.params.id as string;
      const input: TransitionRequestInput = {
        newLifecycleStatus: req.body.newLifecycleStatus,
        reason: req.body.reason,
        feedback: req.body.feedback,
      };

      const result = await PatientRequestService.transitionRequest(
        requestId,
        req.user.id,
        req.user.role,
        input
      );

      return res.json({
        success: true,
        message: `Request status transitioned to ${result.lifecycleStatus}.`,
        data: result,
      });
    } catch (error: any) {
      const isDenied = error.message?.includes('Access denied');
      return res.status(isDenied ? 403 : 400).json({
        success: false,
        error: {
          message: error.message || 'Transition failed.',
          code: isDenied ? 'FORBIDDEN' : 'INVALID_TRANSITION',
        },
      });
    }
  }
);

// ====================================================
// 7. ATOMIC COMPONENT RESERVATION
// ====================================================
// Reserve an eligible, clinically released component unit for a request.

patientSearchRouter.post(
  '/patient-requests/:id/reserve-component',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const requestId = req.params.id as string;
      const { componentUnitId } = req.body;
      if (!componentUnitId) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'componentUnitId is required.',
            code: 'MISSING_FIELD',
          },
        });
      }

      const result = await PatientRequestService.reserveComponent(
        req.user.id,
        req.user.role,
        {
          componentUnitId,
          requestId,
        }
      );

      return res.json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error: any) {
      const isDenied = error.message?.includes('Access denied');
      return res.status(isDenied ? 403 : 400).json({
        success: false,
        error: {
          message: error.message || 'Component reservation failed.',
          code: isDenied ? 'FORBIDDEN' : 'RESERVATION_FAILED',
        },
      });
    }
  }
);
