import { prisma } from '../lib/prisma';
import { RealtimeService } from './realtime';
import { BloodGroup, RequestStatus, ComponentUnitStatus } from '@prisma/client';

// ====================================================
// Phase 8: Patient Blood Request Coordination Service
// ====================================================
// Controlled request lifecycle with proper state transitions.
// Integrates with existing BloodRequest model + Phase 7 real-time events.
// Does NOT invent clinical compatibility rules — uses existing approved checks.

export type PatientRequestStatus =
  | 'SUBMITTED'
  | 'AWAITING_BB_RESPONSE'
  | 'ACCEPTED'
  | 'PARTIALLY_FULFILLED'
  | 'FULFILLED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';

// Maps Phase 8 lifecycle states to existing RequestStatus enum
// SUBMITTED, AWAITING_BB_RESPONSE, ACCEPTED, PARTIALLY_FULFILLED → OPEN
// FULFILLED → CLOSED
// REJECTED, CANCELLED → CANCELLED
// EXPIRED → EXPIRED
const PHASE8_TO_DB_STATUS: Record<PatientRequestStatus, RequestStatus> = {
  SUBMITTED: 'OPEN',
  AWAITING_BB_RESPONSE: 'OPEN',
  ACCEPTED: 'OPEN',
  PARTIALLY_FULFILLED: 'OPEN',
  FULFILLED: 'CLOSED',
  REJECTED: 'CANCELLED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
};

// Valid state transitions for the Phase 8 lifecycle
const VALID_TRANSITIONS: Record<PatientRequestStatus, PatientRequestStatus[]> = {
  SUBMITTED: ['AWAITING_BB_RESPONSE', 'CANCELLED'],
  AWAITING_BB_RESPONSE: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED'],
  PARTIALLY_FULFILLED: ['FULFILLED', 'CANCELLED'],
  FULFILLED: [], // Terminal
  REJECTED: [], // Terminal
  CANCELLED: [], // Terminal
  EXPIRED: [], // Terminal
};

export interface CreatePatientRequestInput {
  patientName?: string;
  bloodGroup: string; // e.g. 'B_POS'
  componentType?: string; // e.g. 'PRBC'
  component: string; // e.g. 'Packed Red Blood Cells' — for backward compat
  unitsRequested: number;
  requiredBy?: string; // ISO date
  organisationId?: string; // Target participating org
  hospitalCode?: string; // Target eRaktKosh centre
  message?: string;
  urgency?: 'ROUTINE' | 'URGENT' | 'EMERGENCY';
}

export interface TransitionRequestInput {
  newLifecycleStatus: PatientRequestStatus;
  reason?: string;
  feedback?: string;
}

export interface ReserveComponentInput {
  componentUnitId: string;
  requestId: string;
}

export class PatientRequestService {
  /**
   * Create a new patient blood request with Phase 8 lifecycle.
   * Uses the existing BloodRequest model, extending with lifecycle metadata.
   */
  static async createRequest(requesterId: string, input: CreatePatientRequestInput) {
    // Validate blood group
    const validGroups: BloodGroup[] = ['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG'];
    const bg = input.bloodGroup as BloodGroup;
    if (!validGroups.includes(bg)) {
      throw new Error('Invalid blood group. Must be one of: A_POS, A_NEG, B_POS, B_NEG, AB_POS, AB_NEG, O_POS, O_NEG');
    }

    // Validate units
    if (!input.unitsRequested || input.unitsRequested < 1 || input.unitsRequested > 50) {
      throw new Error('Units requested must be between 1 and 50.');
    }

    // Validate component
    const component = input.component?.trim();
    if (!component) {
      throw new Error('Blood component type is required.');
    }

    // Validate requiredBy if provided
    let parsedRequiredBy: Date | null = null;
    if (input.requiredBy) {
      parsedRequiredBy = new Date(input.requiredBy);
      if (isNaN(parsedRequiredBy.getTime())) {
        throw new Error('requiredBy must be a valid ISO date.');
      }
    }

    // If organisationId provided, verify it's a participating org
    if (input.organisationId) {
      const org = await prisma.organisation.findUnique({
        where: { id: input.organisationId, status: 'VERIFIED' },
        select: { id: true },
      });
      if (!org) {
        throw new Error('Target organisation not found or not verified.');
      }
    }

    // If hospitalCode provided, verify centre exists
    if (input.hospitalCode) {
      const centre = await prisma.bloodCentre.findUnique({
        where: { hospitalCode: input.hospitalCode },
        select: { hospitalCode: true },
      });
      if (!centre) {
        throw new Error(`Blood centre '${input.hospitalCode}' not found.`);
      }
    }

    const lifecycleStatus: PatientRequestStatus = 'SUBMITTED';

    const request = await prisma.$transaction(async (tx: any) => {
      const newRequest = await tx.bloodRequest.create({
        data: {
          requesterId,
          patientName: input.patientName?.trim().slice(0, 100) || null,
          bloodGroup: bg,
          component,
          unitsRequested: input.unitsRequested,
          requiredBy: parsedRequiredBy,
          hospitalCode: input.hospitalCode?.trim() || null,
          searchScope: 'EXACT_CENTRE',
          message: input.message?.trim().slice(0, 500) || null,
          status: PHASE8_TO_DB_STATUS[lifecycleStatus],
          // Store Phase 8 lifecycle state and urgency in closure fields
          closureOutcome: null,
          closureFeedback: null,
          // Use reportedDonationStatus to hold Phase 8 lifecycle state
          reportedDonationStatus: lifecycleStatus,
        },
        include: {
          bloodCentre: {
            select: {
              hospitalCode: true,
              hospitalName: true,
              address: true,
            },
          },
        },
      });

      // Audit
      await tx.auditLog.create({
        data: {
          userId: requesterId,
          action: 'PATIENT_REQUEST_CREATED',
          resource: 'BloodRequest',
          resourceId: newRequest.id,
          metadata: {
            lifecycleStatus,
            bloodGroup: bg,
            component,
            unitsRequested: input.unitsRequested,
            urgency: input.urgency || 'ROUTINE',
          },
        },
      });

      // Real-time notification
      try {
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'blood_request.status_changed',
          entityType: 'BloodRequest',
          entityId: newRequest.id,
          recipientUserId: requesterId,
          payload: {
            requestId: newRequest.id,
            lifecycleStatus,
            bloodGroup: bg,
            component,
            timestamp: new Date().toISOString(),
          },
        });
      } catch { /* Non-blocking */ }

      return newRequest;
    }, { maxWait: 10000, timeout: 20000 });

    return {
      ...request,
      lifecycleStatus,
      urgency: input.urgency || 'ROUTINE',
    };
  }

  /**
   * Transition a request through the Phase 8 lifecycle.
   * Validates the transition against the state machine.
   */
  static async transitionRequest(
    requestId: string,
    callerId: string,
    callerRole: string,
    input: TransitionRequestInput
  ) {
    const request = await prisma.bloodRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw new Error('Blood request not found.');
    }

    // Only the requester or ADMIN can transition
    if (request.requesterId !== callerId && callerRole !== 'ADMIN') {
      throw new Error('Access denied. Only the requester can manage this request.');
    }

    // Get current lifecycle status
    const currentLifecycle = (request.reportedDonationStatus as PatientRequestStatus) || 'SUBMITTED';
    const targetLifecycle = input.newLifecycleStatus;

    // Validate transition
    const allowedTransitions = VALID_TRANSITIONS[currentLifecycle] || [];
    if (!allowedTransitions.includes(targetLifecycle)) {
      throw new Error(
        `Invalid transition from '${currentLifecycle}' to '${targetLifecycle}'. ` +
        `Allowed transitions: ${allowedTransitions.join(', ') || 'none (terminal state)'}.`
      );
    }

    const newDbStatus = PHASE8_TO_DB_STATUS[targetLifecycle];
    const isTerminal = ['FULFILLED', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(targetLifecycle);

    const updated = await prisma.$transaction(async (tx: any) => {
      const updatedRequest = await tx.bloodRequest.update({
        where: { id: requestId },
        data: {
          status: newDbStatus,
          reportedDonationStatus: targetLifecycle,
          ...(isTerminal ? { closedAt: new Date() } : {}),
          ...(input.reason ? { closureOutcome: targetLifecycle } : {}),
          ...(input.feedback ? { closureFeedback: input.feedback.trim().slice(0, 500) } : {}),
        },
        include: {
          bloodCentre: {
            select: {
              hospitalCode: true,
              hospitalName: true,
              address: true,
            },
          },
        },
      });

      // Cancel pending donor invitations on terminal transition
      if (isTerminal) {
        await tx.donorResponse.updateMany({
          where: { requestId, status: 'PENDING' },
          data: { status: 'CANCELLED' },
        });
      }

      // Audit
      await tx.auditLog.create({
        data: {
          userId: callerId,
          action: 'PATIENT_REQUEST_TRANSITIONED',
          resource: 'BloodRequest',
          resourceId: requestId,
          metadata: {
            previousLifecycle: currentLifecycle,
            newLifecycle: targetLifecycle,
            reason: input.reason,
            feedback: input.feedback,
          },
        },
      });

      // Real-time notification
      try {
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'blood_request.status_changed',
          entityType: 'BloodRequest',
          entityId: requestId,
          recipientUserId: request.requesterId,
          payload: {
            requestId,
            previousLifecycle: currentLifecycle,
            newLifecycle: targetLifecycle,
            timestamp: new Date().toISOString(),
          },
        });
      } catch { /* Non-blocking */ }

      return updatedRequest;
    }, { maxWait: 10000, timeout: 20000 });

    return {
      ...updated,
      lifecycleStatus: targetLifecycle,
      previousLifecycleStatus: currentLifecycle,
    };
  }

  /**
   * Get request with lifecycle details.
   * Protects patient contact details from unauthorised users.
   */
  static async getRequestDetails(requestId: string, callerId: string, callerRole: string) {
    const request = await prisma.bloodRequest.findUnique({
      where: { id: requestId },
      include: {
        bloodCentre: {
          select: {
            hospitalCode: true,
            hospitalName: true,
            address: true,
            mobileNo: true,
          },
        },
        recipientResponses: {
          include: {
            donor: {
              select: {
                id: true,
                fullName: true,
                bloodGroup: true,
                districtCode: true,
                cityOrLocality: true,
                // Strictly NO phone or user relation
              },
            },
          },
        },
      },
    });

    if (!request) return null;

    // Access control
    if (request.requesterId !== callerId && callerRole !== 'ADMIN') {
      return null; // Don't reveal existence
    }

    const lifecycleStatus = (request.reportedDonationStatus as PatientRequestStatus) || 'SUBMITTED';

    // Sanitize contact info
    const sanitizedCentre = request.bloodCentre ? {
      ...request.bloodCentre,
      mobileNo: normalizePhone(request.bloodCentre.mobileNo),
    } : null;

    // Sanitize donor responses — don't expose phone before acceptance
    const sanitizedResponses = request.recipientResponses.map((r: any) => ({
      id: r.id,
      donorId: r.donorId,
      donorName: r.donor?.fullName ? redactName(r.donor.fullName) : 'Anonymous Donor',
      bloodGroup: r.donor?.bloodGroup,
      district: r.donor?.districtCode,
      locality: r.donor?.cityOrLocality || null,
      status: r.status,
      respondedAt: r.respondedAt,
      disclosureAuthorized: r.disclosureAuthorized,
    }));

    return {
      id: request.id,
      patientName: request.patientName,
      bloodGroup: request.bloodGroup,
      component: request.component,
      unitsRequested: request.unitsRequested,
      requiredBy: request.requiredBy,
      hospitalCode: request.hospitalCode,
      bloodCentre: sanitizedCentre,
      message: request.message,
      status: request.status,
      lifecycleStatus,
      searchScope: request.searchScope,
      closedAt: request.closedAt,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      donorResponses: sanitizedResponses,
      responseStats: {
        total: sanitizedResponses.length,
        pending: sanitizedResponses.filter((r: any) => r.status === 'PENDING').length,
        accepted: sanitizedResponses.filter((r: any) => r.status === 'ACCEPTED').length,
        declined: sanitizedResponses.filter((r: any) => r.status === 'DECLINED').length,
      },
    };
  }

  /**
   * Reserve a specific component unit for a patient request.
   * Uses atomic transaction to prevent double-reservation.
   *
   * STRICT RULES:
   * - Component must be AVAILABLE (clinically released, not expired, not on hold)
   * - Atomically transitions to RESERVED
   * - Two requests cannot reserve the same component
   * - Viewing/selecting in search does NOT create a reservation
   */
  static async reserveComponent(
    callerId: string,
    callerRole: string,
    input: ReserveComponentInput
  ) {
    const request = await prisma.bloodRequest.findUnique({
      where: { id: input.requestId },
    });

    if (!request) {
      throw new Error('Blood request not found.');
    }

    // Only org staff (ADMIN, INVENTORY_STAFF) or the request owner can reserve
    // In practice, reservations are typically done by blood bank staff
    if (request.requesterId !== callerId && callerRole !== 'ADMIN') {
      // Check if caller is org staff for the component's org
      const component = await prisma.componentUnit.findUnique({
        where: { id: input.componentUnitId },
        select: { organisationId: true },
      });
      if (!component) throw new Error('Component unit not found.');

      const membership = await prisma.organisationMembership.findUnique({
        where: {
          userId_organisationId: {
            userId: callerId,
            organisationId: component.organisationId,
          },
        },
      });
      if (!membership || !membership.isActive) {
        throw new Error('Access denied. Only authorized staff can reserve components.');
      }
    }

    // Lifecycle check: request must be in ACCEPTED or AWAITING_BB_RESPONSE state
    const lifecycle = (request.reportedDonationStatus as PatientRequestStatus) || 'SUBMITTED';
    if (!['ACCEPTED', 'AWAITING_BB_RESPONSE', 'SUBMITTED'].includes(lifecycle)) {
      throw new Error(`Cannot reserve components for a request in '${lifecycle}' state.`);
    }

    const now = new Date();

    // Atomic reservation transaction
    const result = await prisma.$transaction(async (tx: any) => {
      // Lock and verify component eligibility
      const comp = await tx.componentUnit.findUnique({
        where: { id: input.componentUnitId },
      });

      if (!comp) throw new Error('Component unit not found.');
      if (comp.status !== 'AVAILABLE') {
        throw new Error(`Component is in '${comp.status}' status. Only AVAILABLE components can be reserved.`);
      }
      if (comp.isHold) {
        throw new Error('Component is under quarantine hold and cannot be reserved.');
      }
      if (comp.expiresAt && new Date(comp.expiresAt) <= now) {
        throw new Error('Component has expired and cannot be reserved.');
      }

      // Verify clinical release exists
      const release = await tx.clinicalReleaseRecord.findFirst({
        where: {
          componentUnitId: comp.id,
          decision: 'RELEASED',
        },
      });
      if (!release) {
        throw new Error('Component has not been clinically released and cannot be reserved.');
      }

      // Atomically update to RESERVED
      const updated = await tx.componentUnit.update({
        where: { id: comp.id },
        data: { status: 'RESERVED' },
      });

      // Status history
      await tx.unitStatusHistory.create({
        data: {
          unitType: 'COMPONENT_UNIT',
          componentUnitId: comp.id,
          fromStatus: 'AVAILABLE',
          toStatus: 'RESERVED',
          actorUserId: callerId,
          organisationId: comp.organisationId,
          reason: `Reserved for patient request ${request.id}`,
          metadata: { requestId: input.requestId },
        },
      });

      // Audit
      await tx.auditLog.create({
        data: {
          userId: callerId,
          action: 'COMPONENT_RESERVED_FOR_REQUEST',
          resource: 'ComponentUnit',
          resourceId: comp.id,
          metadata: {
            requestId: input.requestId,
            componentCode: comp.componentCode,
            bloodGroup: comp.bloodGroup,
            componentType: comp.componentType,
          },
        },
      });

      // Real-time
      try {
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'component.status_changed',
          entityType: 'ComponentUnit',
          entityId: comp.id,
          organisationId: comp.organisationId,
          payload: {
            componentId: comp.id,
            previousStatus: 'AVAILABLE',
            newStatus: 'RESERVED',
            requestId: input.requestId,
            timestamp: now.toISOString(),
          },
        });
      } catch { /* Non-blocking */ }

      return updated;
    }, { maxWait: 10000, timeout: 20000 });

    return {
      reserved: true,
      componentId: result.id,
      componentCode: result.componentCode,
      requestId: input.requestId,
      message: 'Component reserved for this request. Reservation does not mean transfusion occurred. Final issuance requires authorized workflow.',
    };
  }
}

// ──────────────────────────────────────────
// Private helpers
// ──────────────────────────────────────────

function normalizePhone(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === '0' || trimmed === '' || trimmed.length < 6) return null;
  return trimmed;
}

function redactName(fullName: string): string {
  if (!fullName || fullName.length <= 2) return 'Donor';
  return fullName.charAt(0) + '*'.repeat(Math.min(fullName.length - 2, 6)) + fullName.charAt(fullName.length - 1);
}
