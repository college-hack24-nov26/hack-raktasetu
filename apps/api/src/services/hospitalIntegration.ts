import { prisma } from '../lib/prisma';
import { RealtimeService } from './realtime';
import {
  HospitalIssueStatus,
  HospitalItemStatus,
  HospitalItemReceiptOutcome,
  HospitalDiscrepancyCategory,
  ComponentDispositionType,
  ExceptionSeverity,
} from '@prisma/client';
import { mapComponentStringToType } from '../routes/availability';
import { MatchingRequestMetadata, DonorIntakeRecordDTO, RecordIntakeClinicalScreeningInput, RecordIntakeCollectionInput, TraceabilityLineageDTO } from '@raktasetu/shared';
import { CampOperationsService } from './campOperations';
import { TraceabilityService } from './traceability';
import { ProcessingAndInventoryService } from './processingAndInventory';
import { getComponentCompatibility } from './adminMatchingService';

export interface RequestHospitalMetadata {
  hospitalName?: string;
  receivingFacilityId?: string;
  isHospitalVerified?: boolean;
  urgency?: 'NORMAL' | 'URGENT' | 'CRITICAL';
  requesterContact?: string;
  requesterConsent?: boolean;
  userMessage?: string;
  reservedUnitIds?: string[];
  allocatedUnitsCount?: number;
  shortfallCount?: number;
  isPartialAllocation?: boolean;
  reservedUnitDetails?: Array<{
    id: string;
    componentCode: string;
    componentType?: string;
    bloodGroup?: string;
    volumeMl?: number | null;
    expiresAt?: string | null;
    status?: string;
  }>;
  patientAcknowledgedAt?: string;
  patientAcknowledgedBy?: string;
  patientAcknowledgementNotes?: string;
  hospitalReceivedAt?: string;
  hospitalReceivedBy?: string;
  hospitalReceiptNotes?: string;
  receiptNotes?: string;
  confirmedByRole?: string;
  assignedBankId?: string;
  assignedBankName?: string;
  claimedAt?: string;
  claimedById?: string;
  dispatchedUnitIds?: string[];
  dispatchedUnitsCount?: number;
  dispatchedAt?: string;
  transportDetails?: any;

  isExternalDirectory?: boolean;
  matchingRequest?: MatchingRequestMetadata;
  donorIntake?: DonorIntakeRecordDTO;
}

export function parseRequestMessageMetadata(rawMessage?: string | null, fallbackHospitalName?: string | null): RequestHospitalMetadata {
  if (!rawMessage || !rawMessage.trim()) {
    return {
      hospitalName: fallbackHospitalName || 'Registered Local Medical Facility',
      isHospitalVerified: false,
      urgency: 'NORMAL',
    };
  }

  const trimmed = rawMessage.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      return {
        hospitalName: parsed.hospitalName || fallbackHospitalName || 'Registered Local Medical Facility',
        receivingFacilityId: parsed.receivingFacilityId || undefined,
        isHospitalVerified: !!parsed.isHospitalVerified,
        urgency: parsed.urgency || 'NORMAL',
        requesterContact: parsed.requesterContact || undefined,
        requesterConsent: parsed.requesterConsent !== false,
        userMessage: parsed.userMessage || undefined,
        reservedUnitIds: Array.isArray(parsed.reservedUnitIds) ? parsed.reservedUnitIds : [],
        allocatedUnitsCount: typeof parsed.allocatedUnitsCount === 'number' ? parsed.allocatedUnitsCount : undefined,
        shortfallCount: typeof parsed.shortfallCount === 'number' ? parsed.shortfallCount : undefined,
        isPartialAllocation: Boolean(parsed.isPartialAllocation),
        reservedUnitDetails: Array.isArray(parsed.reservedUnitDetails) ? parsed.reservedUnitDetails : undefined,
        patientAcknowledgedAt: parsed.patientAcknowledgedAt || undefined,
        patientAcknowledgedBy: parsed.patientAcknowledgedBy || undefined,
        patientAcknowledgementNotes: parsed.patientAcknowledgementNotes || undefined,
        hospitalReceivedAt: parsed.hospitalReceivedAt || undefined,
        hospitalReceivedBy: parsed.hospitalReceivedBy || undefined,
        hospitalReceiptNotes: parsed.hospitalReceiptNotes || undefined,
        receiptNotes: parsed.receiptNotes || undefined,
        confirmedByRole: parsed.confirmedByRole || undefined,
        assignedBankId: parsed.assignedBankId || undefined,
        assignedBankName: parsed.assignedBankName || undefined,
        claimedAt: parsed.claimedAt || undefined,
        claimedById: parsed.claimedById || undefined,
        dispatchedUnitIds: Array.isArray(parsed.dispatchedUnitIds) ? parsed.dispatchedUnitIds : [],
        dispatchedUnitsCount: typeof parsed.dispatchedUnitsCount === 'number' ? parsed.dispatchedUnitsCount : undefined,
        dispatchedAt: parsed.dispatchedAt || undefined,
        transportDetails: parsed.transportDetails || undefined,
        isExternalDirectory: Boolean(parsed.isExternalDirectory),
        matchingRequest: parsed.matchingRequest || undefined,
        donorIntake: parsed.donorIntake || undefined,
      };
    } catch {
      // Continue to plain text fallback
    }
  }

  return {
    hospitalName: fallbackHospitalName || 'Registered Local Medical Facility',
    isHospitalVerified: false,
    urgency: 'NORMAL',
    userMessage: rawMessage,
  };
}

export interface AuthoriseIssueInput {
  receivingFacilityId: string;
  componentUnitIds: string[];
  requestId?: string;
  authorisationReason: string;
  notes?: string;
}

export interface DispatchIssueInput {
  issueOrderId: string;
  transportDetails: {
    courierName?: string;
    vehicleNumber?: string;
    driverPhone?: string;
    coldBoxTempCelsius?: number;
    notes?: string;
  };
}

export interface ItemReceiptInput {
  componentUnitId: string;
  outcome: HospitalItemReceiptOutcome;
  notes?: string;
}

export interface AcknowledgeReceiptInput {
  issueOrderId: string;
  receipts: ItemReceiptInput[];
  notes?: string;
}

export interface RecordDiscrepancyInput {
  issueOrderId: string;
  issueItemId?: string;
  componentUnitId?: string;
  category: HospitalDiscrepancyCategory;
  severity?: ExceptionSeverity;
  description: string;
}

export interface RecordDispositionInput {
  componentUnitId: string;
  dispositionType: ComponentDispositionType;
  reason: string;
  clinicalProtocolRef?: string;
  documentationRef?: string;
  recipientPatientRef?: string;
  notes?: string;
}

export class HospitalIntegrationService {
  /**
   * 1. Authorise component issue by a blood bank to a receiving facility.
   * Atomically validates component release, hold, expiry, and prevents duplicate allocations.
   */
  static async authoriseIssue(
    callerUserId: string,
    issuingOrgId: string,
    input: AuthoriseIssueInput
  ) {
    if (!input.componentUnitIds || input.componentUnitIds.length === 0) {
      throw new Error('At least one component unit must be specified for issue authorisation.');
    }
    if (!input.receivingFacilityId) {
      throw new Error('Receiving facility organisation identifier is required.');
    }
    if (!input.authorisationReason?.trim()) {
      throw new Error('Documented authorisation reason is required.');
    }

    // Verify receiving facility is verified
    const receivingFacility = await prisma.organisation.findUnique({
      where: { id: input.receivingFacilityId },
    });
    if (!receivingFacility || receivingFacility.status !== 'VERIFIED') {
      throw new Error('Target receiving facility not found or not in VERIFIED status.');
    }

    if (issuingOrgId === input.receivingFacilityId) {
      throw new Error('Issuing blood bank and receiving facility cannot be the identical organisation.');
    }

    // If linked request provided, verify it exists
    if (input.requestId) {
      const req = await prisma.bloodRequest.findUnique({
        where: { id: input.requestId },
      });
      if (!req) {
        throw new Error('Linked blood request not found.');
      }
    }

    const now = new Date();
    const count = await prisma.hospitalIssueOrder.count();
    const orderNumber = `HIO-${now.getFullYear()}-${Date.now().toString().slice(-4)}-${String(count + 1).padStart(4, '0')}`;

    return await prisma.$transaction(async (tx) => {
      // Concurrency guard: Fetch and lock components
      const components = await tx.componentUnit.findMany({
        where: {
          id: { in: input.componentUnitIds },
          organisationId: issuingOrgId,
        },
      });

      if (components.length !== input.componentUnitIds.length) {
        throw new Error('One or more component units not found or do not belong to the issuing organisation.');
      }

      for (const comp of components) {
        // Must be AVAILABLE or RESERVED for the linked request
        if (comp.status !== 'AVAILABLE' && comp.status !== 'RESERVED') {
          throw new Error(`Component ${comp.componentCode} is in '${comp.status}' status. Only AVAILABLE or RESERVED components may be authorised for issue.`);
        }

        // Cannot be on quarantine hold
        if (comp.isHold) {
          throw new Error(`Component ${comp.componentCode} is on quarantine hold and cannot be issued.`);
        }

        // Shelf-life expiry check
        if (comp.expiresAt && new Date(comp.expiresAt) <= now) {
          throw new Error(`Component ${comp.componentCode} has expired and cannot be issued.`);
        }

        // Clinical release verification
        const release = await tx.clinicalReleaseRecord.findFirst({
          where: {
            componentUnitId: comp.id,
            decision: 'RELEASED',
          },
        });
        if (!release) {
          throw new Error(`Component ${comp.componentCode} has not received clinical release verification.`);
        }

        // Check if already part of an active (non-cancelled) issue order
        const existingActiveItem = await tx.hospitalIssueItem.findFirst({
          where: {
            componentUnitId: comp.id,
            issueOrder: {
              status: { not: 'CANCELLED' },
            },
          },
        });
        if (existingActiveItem) {
          throw new Error(`Component ${comp.componentCode} is already allocated to an active issue order.`);
        }
      }

      // Create issue order
      const order = await tx.hospitalIssueOrder.create({
        data: {
          orderNumber,
          issuingOrganisationId: issuingOrgId,
          receivingFacilityId: input.receivingFacilityId,
          requestId: input.requestId || null,
          status: 'AUTHORISED',
          authorisationReason: input.authorisationReason.trim(),
          authorisedById: callerUserId,
          authorisedAt: now,
          notes: input.notes?.trim() || null,
        },
      });

      // Create issue items & transition component status
      for (const comp of components) {
        await tx.hospitalIssueItem.create({
          data: {
            issueOrderId: order.id,
            componentUnitId: comp.id,
            status: 'AUTHORISED',
          },
        });

        // Update component status in DB
        await tx.componentUnit.update({
          where: { id: comp.id },
          data: { status: 'ISSUED' },
        });

        // Append-only status history
        await tx.unitStatusHistory.create({
          data: {
            unitType: 'COMPONENT_UNIT',
            componentUnitId: comp.id,
            fromStatus: comp.status,
            toStatus: 'AUTHORISED_FOR_ISSUE',
            actorUserId: callerUserId,
            organisationId: issuingOrgId,
            reason: `Authorised for issue to facility ${receivingFacility.name} (Order: ${orderNumber})`,
            metadata: {
              issueOrderId: order.id,
              orderNumber,
              receivingFacilityId: input.receivingFacilityId,
              requestId: input.requestId,
            },
          },
        });
      }

      if (input.requestId) {
        await tx.bloodRequest.update({
          where: { id: input.requestId },
          data: {
            closureOutcome: 'PREPARING',
          },
        }).catch(() => {});
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: callerUserId,
          action: 'HOSPITAL_ISSUE_AUTHORISED',
          resource: 'HospitalIssueOrder',
          resourceId: order.id,
          metadata: {
            orderNumber,
            issuingOrgId,
            receivingFacilityId: input.receivingFacilityId,
            componentCount: components.length,
            componentCodes: components.map((c) => c.componentCode),
          },
        },
      });

      // Realtime event outbox
      try {
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'hospital_issue.authorised',
          entityType: 'HospitalIssueOrder',
          entityId: order.id,
          organisationId: input.receivingFacilityId,
          payload: {
            issueOrderId: order.id,
            orderNumber,
            issuingOrganisationId: issuingOrgId,
            componentCount: components.length,
            status: 'AUTHORISED',
            timestamp: now.toISOString(),
          },
        });
      } catch {
        /* Non-blocking outbox */
      }

      return order;
    }, { maxWait: 10000, timeout: 20000 });
  }

  /**
   * 2. Record dispatch of an authorised issue order.
   * Enforces that dispatch cannot happen without a valid prior authorisation.
   */
  static async dispatchIssueOrder(
    callerUserId: string,
    issuingOrgId: string,
    input: DispatchIssueInput
  ) {
    const order = await prisma.hospitalIssueOrder.findUnique({
      where: { id: input.issueOrderId },
      include: { items: true },
    });

    if (!order) {
      throw new Error('Hospital issue order not found.');
    }
    if (order.issuingOrganisationId !== issuingOrgId) {
      throw new Error('Access denied. Issue order belongs to a different organisation.');
    }
    if (order.status !== 'AUTHORISED') {
      throw new Error(`Cannot dispatch issue order in '${order.status}' status. Order must be AUTHORISED.`);
    }

    const now = new Date();

    return await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.hospitalIssueOrder.update({
        where: { id: order.id },
        data: {
          status: 'DISPATCHED',
          dispatchedAt: now,
          dispatchedById: callerUserId,
          transportDetails: input.transportDetails || {},
        },
      });

      // Update items
      await tx.hospitalIssueItem.updateMany({
        where: { issueOrderId: order.id },
        data: { status: 'DISPATCHED' },
      });

      // Status history for each component
      for (const item of order.items) {
        await tx.unitStatusHistory.create({
          data: {
            unitType: 'COMPONENT_UNIT',
            componentUnitId: item.componentUnitId,
            fromStatus: 'AUTHORISED_FOR_ISSUE',
            toStatus: 'DISPATCHED_IN_TRANSIT',
            actorUserId: callerUserId,
            organisationId: issuingOrgId,
            reason: `Dispatched in transit under order ${order.orderNumber}`,
            metadata: {
              issueOrderId: order.id,
              transportDetails: input.transportDetails,
            },
          },
        });
      }

      if (order.requestId) {
        await tx.bloodRequest.update({
          where: { id: order.requestId },
          data: {
            closureOutcome: 'DISPATCHED',
          },
        }).catch(() => {});
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: callerUserId,
          action: 'HOSPITAL_ISSUE_DISPATCHED',
          resource: 'HospitalIssueOrder',
          resourceId: order.id,
          metadata: {
            orderNumber: order.orderNumber,
            dispatchedAt: now.toISOString(),
            transportDetails: input.transportDetails,
          },
        },
      });

      // Realtime event
      try {
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'hospital_issue.dispatched',
          entityType: 'HospitalIssueOrder',
          entityId: order.id,
          organisationId: order.receivingFacilityId,
          payload: {
            issueOrderId: order.id,
            orderNumber: order.orderNumber,
            status: 'DISPATCHED',
            transportDetails: input.transportDetails,
            dispatchedAt: now.toISOString(),
          },
        });
      } catch {
        /* Non-blocking outbox */
      }

      return updatedOrder;
    }, { maxWait: 10000, timeout: 20000 });
  }

  /**
   * 3. Acknowledge physical receiving by authorised receiving facility personnel.
   * Enforces:
   * - Cannot acknowledge receipt before dispatch.
   * - Only the designated receiving facility can acknowledge.
   * - Cannot acknowledge components not allocated to the order.
   * - Automatic auditable discrepancy logging for damaged/missing/compromised units.
   * - Receiving does NOT mark units as transfused.
   */
  static async acknowledgeReceipt(
    callerUserId: string,
    receivingFacilityId: string,
    input: AcknowledgeReceiptInput
  ) {
    const order = await prisma.hospitalIssueOrder.findUnique({
      where: { id: input.issueOrderId },
      include: { items: true },
    });

    if (!order) {
      throw new Error('Hospital issue order not found.');
    }
    if (order.receivingFacilityId !== receivingFacilityId) {
      throw new Error('Access denied. This issue order was not allocated to your organisation.');
    }
    if (order.status !== 'DISPATCHED' && order.status !== 'PARTIALLY_RECEIVED') {
      throw new Error(`Cannot acknowledge receipt for order in '${order.status}' status. Order must be DISPATCHED.`);
    }

    if (!input.receipts || input.receipts.length === 0) {
      throw new Error('At least one item receipt outcome must be submitted.');
    }

    const orderItemMap = new Map(order.items.map((i) => [i.componentUnitId, i]));
    const now = new Date();

    return await prisma.$transaction(async (tx) => {
      let hasDiscrepancy = false;
      let allIntact = true;

      for (const rec of input.receipts) {
        const item = orderItemMap.get(rec.componentUnitId);
        if (!item) {
          throw new Error(`Component unit ${rec.componentUnitId} was not allocated to this issue order.`);
        }
        if (item.status === 'RECEIVED' || item.status === 'DISCREPANT') {
          throw new Error(`Component unit ${rec.componentUnitId} has already been acknowledged for receipt.`);
        }

        const isDiscrepantOutcome = rec.outcome !== 'VERIFIED_INTACT';
        if (isDiscrepantOutcome) {
          hasDiscrepancy = true;
          allIntact = false;
        }

        const itemStatus: HospitalItemStatus = isDiscrepantOutcome ? 'DISCREPANT' : 'RECEIVED';

        await tx.hospitalIssueItem.update({
          where: { id: item.id },
          data: {
            status: itemStatus,
            receivingOutcome: rec.outcome,
            receivingNotes: rec.notes?.trim() || null,
            receivedAt: now,
            receivedById: callerUserId,
          },
        });

        // If discrepant, create an auditable discrepancy record
        if (isDiscrepantOutcome) {
          let category: HospitalDiscrepancyCategory = 'OTHER';
          let severity: ExceptionSeverity = 'HIGH';

          if (rec.outcome === 'DAMAGED') {
            category = 'DAMAGED_CONTAINER';
            severity = 'HIGH';
          } else if (rec.outcome === 'TEMPERATURE_EXCURSION') {
            category = 'COLD_CHAIN_EXCURSION';
            severity = 'CRITICAL';
          } else if (rec.outcome === 'MISSING') {
            category = 'UNIT_MISSING';
            severity = 'CRITICAL';
          } else if (rec.outcome === 'MISMATCHED') {
            category = 'IDENTIFIER_MISMATCH';
            severity = 'HIGH';
          }

          await tx.hospitalDiscrepancy.create({
            data: {
              issueOrderId: order.id,
              issueItemId: item.id,
              componentUnitId: item.componentUnitId,
              category,
              severity,
              status: 'OPEN',
              description: `Receiving discrepancy noted: ${rec.outcome}. ${rec.notes || 'No additional notes'}`,
              reportedById: callerUserId,
            },
          });
        }

        // Status history: strictly RECEIVED_BY_FACILITY, NEVER TRANSFUSED
        await tx.unitStatusHistory.create({
          data: {
            unitType: 'COMPONENT_UNIT',
            componentUnitId: item.componentUnitId,
            fromStatus: 'DISPATCHED_IN_TRANSIT',
            toStatus: isDiscrepantOutcome ? 'RECEIVED_WITH_DISCREPANCY' : 'RECEIVED_BY_FACILITY',
            actorUserId: callerUserId,
            organisationId: receivingFacilityId,
            reason: `Receipt acknowledged at facility. Outcome: ${rec.outcome}. Note: Component is in facility custody and is NOT transfused.`,
            metadata: {
              issueOrderId: order.id,
              outcome: rec.outcome,
              notes: rec.notes,
            },
          },
        });
      }

      // Check overall order completion
      const allItems = await tx.hospitalIssueItem.findMany({
        where: { issueOrderId: order.id },
      });
      const pendingCount = allItems.filter((i) => i.status === 'AUTHORISED' || i.status === 'DISPATCHED').length;
      const anyDiscrepant = allItems.some((i) => i.status === 'DISCREPANT');

      let newOrderStatus: HospitalIssueStatus = order.status;
      if (pendingCount === 0) {
        newOrderStatus = anyDiscrepant ? 'RECEIVED_WITH_DISCREPANCIES' : 'RECEIVED';
      } else {
        newOrderStatus = 'PARTIALLY_RECEIVED';
      }

      const updatedOrder = await tx.hospitalIssueOrder.update({
        where: { id: order.id },
        data: {
          status: newOrderStatus,
          receivedAt: now,
          receivedById: callerUserId,
          notes: input.notes ? `${order.notes || ''}\n${input.notes}`.trim() : order.notes,
        },
      });

      if (order.requestId) {
        const isCompleted = newOrderStatus === 'RECEIVED';
        await tx.bloodRequest.update({
          where: { id: order.requestId },
          data: {
            closureOutcome: isCompleted
              ? 'FULFILLED'
              : anyDiscrepant
              ? 'RECEIVED_WITH_DISCREPANCIES'
              : 'RECEIVED_BY_HOSPITAL',
            status: isCompleted ? 'CLOSED' : 'OPEN',
            closedAt: isCompleted ? now : null,
          },
        }).catch(() => {});
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: callerUserId,
          action: 'HOSPITAL_ISSUE_RECEIPT_ACKNOWLEDGED',
          resource: 'HospitalIssueOrder',
          resourceId: order.id,
          metadata: {
            orderNumber: order.orderNumber,
            receivingFacilityId,
            acknowledgedCount: input.receipts.length,
            hasDiscrepancy,
            finalOrderStatus: newOrderStatus,
          },
        },
      });

      // Realtime event
      try {
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'hospital_issue.received',
          entityType: 'HospitalIssueOrder',
          entityId: order.id,
          organisationId: order.issuingOrganisationId,
          payload: {
            issueOrderId: order.id,
            orderNumber: order.orderNumber,
            status: newOrderStatus,
            hasDiscrepancy,
            receivedAt: now.toISOString(),
          },
        });
      } catch {
        /* Non-blocking outbox */
      }

      return updatedOrder;
    }, { maxWait: 10000, timeout: 20000 });
  }

  /**
   * 4. Record a discrepancy investigation or exception on an issue order.
   */
  static async recordDiscrepancy(
    callerUserId: string,
    facilityOrOrgId: string,
    input: RecordDiscrepancyInput
  ) {
    const order = await prisma.hospitalIssueOrder.findUnique({
      where: { id: input.issueOrderId },
    });

    if (!order) {
      throw new Error('Hospital issue order not found.');
    }
    if (order.issuingOrganisationId !== facilityOrOrgId && order.receivingFacilityId !== facilityOrOrgId) {
      throw new Error('Access denied. Discrepancies can only be reported by participating parties.');
    }

    return await prisma.hospitalDiscrepancy.create({
      data: {
        issueOrderId: input.issueOrderId,
        issueItemId: input.issueItemId || null,
        componentUnitId: input.componentUnitId || null,
        category: input.category,
        severity: input.severity || 'MEDIUM',
        status: 'OPEN',
        description: input.description.trim(),
        reportedById: callerUserId,
      },
    });
  }

  /**
   * 5. Record final disposition of a component unit.
   *
   * STRICT CLINICAL SAFETY INVARIANTS:
   * - Transfusion cannot be inferred; must be documented with required evidence.
   * - Only CLINICAL_STAFF may record TRANSFUSION_DOCUMENTED.
   * - Component must be in custody (RECEIVED at facility) to be transfused.
   * - Returned components NEVER become available; they enter QUARANTINED assessment.
   * - Discarded / terminal components cannot be reactivated.
   */
  static async recordDisposition(
    callerUserId: string,
    callerOrgRole: string,
    organisationId: string,
    input: RecordDispositionInput
  ) {
    if (!input.reason?.trim()) {
      throw new Error('Documented disposition reason is required.');
    }

    // Role boundary: Transfusion documentation strictly requires CLINICAL_STAFF
    if (input.dispositionType === 'TRANSFUSION_DOCUMENTED') {
      if (callerOrgRole !== 'CLINICAL_STAFF') {
        throw new Error('Clinical safety boundary: Only verified CLINICAL_STAFF may document blood component transfusion.');
      }
      if (!input.documentationRef?.trim()) {
        throw new Error('Supporting transfusion clinical documentation reference (e.g. crossmatch report / MRN) is required.');
      }
    }

    if (input.dispositionType.startsWith('DISCARDED_') && !input.documentationRef?.trim()) {
      throw new Error('Documented procedure reference or bio-hazard voucher ID is required for discarded components.');
    }

    const now = new Date();

    return await prisma.$transaction(async (tx) => {
      const comp = await tx.componentUnit.findUnique({
        where: { id: input.componentUnitId },
      });

      if (!comp) {
        throw new Error('Component unit not found.');
      }

      // Check terminal disposition: cannot reactivate or re-dispose already terminal components
      if (comp.status === 'DISCARDED') {
        throw new Error('Component is already DISCARDED and in terminal state. Cannot be reactivated or dispositioned again.');
      }

      const priorDisposition = await tx.componentDispositionRecord.findFirst({
        where: {
          componentUnitId: comp.id,
          dispositionType: { in: ['TRANSFUSION_DOCUMENTED', 'DISCARDED_DAMAGED', 'DISCARDED_EXPIRED', 'DISCARDED_CLINICAL'] },
        },
      });
      if (priorDisposition) {
        throw new Error(`Component has already undergone terminal disposition (${priorDisposition.dispositionType}). Cannot record duplicate disposition.`);
      }

      // If transfused, verify custody was received by the facility
      if (input.dispositionType === 'TRANSFUSION_DOCUMENTED') {
        const receiptItem = await tx.hospitalIssueItem.findFirst({
          where: {
            componentUnitId: comp.id,
            status: 'RECEIVED',
            issueOrder: { receivingFacilityId: organisationId },
          },
        });
        if (!receiptItem) {
          throw new Error('Component must be confirmed as RECEIVED by this facility prior to clinical transfusion documentation.');
        }
      }

      // Determine new component status
      let newComponentStatus: any = comp.status;
      let statusHistoryTo = '';

      if (input.dispositionType === 'TRANSFUSION_DOCUMENTED') {
        // Transfused components are closed in clinical disposition
        newComponentStatus = 'ISSUED'; // Keep non-available issued state
        statusHistoryTo = 'TRANSFUSION_COMPLETED';
      } else if (input.dispositionType === 'RETURNED_TO_BANK') {
        // Return invariant: returned units do NOT become available; they enter QUARANTINED hold
        newComponentStatus = 'QUARANTINED';
        statusHistoryTo = 'RETURNED_TO_QUARANTINE_ASSESSMENT';
      } else if (input.dispositionType.startsWith('DISCARDED_')) {
        newComponentStatus = 'DISCARDED';
        statusHistoryTo = 'DISCARDED';
      } else {
        statusHistoryTo = input.dispositionType;
      }

      // Update component record
      await tx.componentUnit.update({
        where: { id: comp.id },
        data: {
          status: newComponentStatus,
          isHold: input.dispositionType === 'RETURNED_TO_BANK' ? true : comp.isHold,
          holdReason: input.dispositionType === 'RETURNED_TO_BANK' ? 'Quarantine assessment following hospital return' : comp.holdReason,
          dispositionType: input.dispositionType,
          dispositionReason: input.reason.trim(),
          dispositionedAt: now,
          dispositionedById: callerUserId,
        },
      });

      // Update item status if part of an issue order
      await tx.hospitalIssueItem.updateMany({
        where: { componentUnitId: comp.id },
        data: {
          status: input.dispositionType === 'TRANSFUSION_DOCUMENTED'
            ? 'TRANSFUSED'
            : input.dispositionType === 'RETURNED_TO_BANK'
            ? 'RETURNED'
            : input.dispositionType.startsWith('DISCARDED_')
            ? 'DISCARDED'
            : undefined,
        },
      });

      // Create disposition record
      const dispositionRecord = await tx.componentDispositionRecord.create({
        data: {
          componentUnitId: comp.id,
          organisationId,
          dispositionType: input.dispositionType,
          reason: input.reason.trim(),
          clinicalProtocolRef: input.clinicalProtocolRef?.trim() || null,
          documentationRef: input.documentationRef?.trim() || null,
          recipientPatientRef: input.recipientPatientRef ? `PAT-***-${input.recipientPatientRef.slice(-4)}` : null, // Masked
          recordedById: callerUserId,
          recordedAt: now,
          notes: input.notes?.trim() || null,
        },
      });

      // Append-only unit status history
      await tx.unitStatusHistory.create({
        data: {
          unitType: 'COMPONENT_UNIT',
          componentUnitId: comp.id,
          fromStatus: comp.status,
          toStatus: statusHistoryTo,
          actorUserId: callerUserId,
          organisationId,
          reason: `Documented disposition: ${input.dispositionType}. Reason: ${input.reason}`,
          metadata: {
            dispositionRecordId: dispositionRecord.id,
            dispositionType: input.dispositionType,
            documentationRef: input.documentationRef,
          },
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: callerUserId,
          action: 'COMPONENT_DISPOSITION_RECORDED',
          resource: 'ComponentDispositionRecord',
          resourceId: dispositionRecord.id,
          metadata: {
            componentUnitId: comp.id,
            componentCode: comp.componentCode,
            dispositionType: input.dispositionType,
            organisationId,
          },
        },
      });

      // Realtime event outbox
      try {
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'component.disposition_recorded',
          entityType: 'ComponentDispositionRecord',
          entityId: dispositionRecord.id,
          organisationId,
          payload: {
            componentUnitId: comp.id,
            componentCode: comp.componentCode,
            dispositionType: input.dispositionType,
            recordedAt: now.toISOString(),
          },
        });
      } catch {
        /* Non-blocking outbox */
      }

      return dispositionRecord;
    }, { maxWait: 10000, timeout: 20000 });
  }

  /**
   * 6. Query facility requests and allocations.
   * Restricts viewing to orders associated with the caller's organisation.
   */
  static async getFacilityOrders(organisationId: string) {
    const orders = await prisma.hospitalIssueOrder.findMany({
      where: {
        OR: [
          { issuingOrganisationId: organisationId },
          { receivingFacilityId: organisationId },
        ],
      },
      include: {
        issuingOrganisation: { select: { id: true, name: true, orgCode: true } },
        receivingFacility: { select: { id: true, name: true, orgCode: true } },
        items: {
          include: {
            componentUnit: {
              select: {
                id: true,
                componentCode: true,
                componentType: true,
                bloodGroup: true,
                volumeMl: true,
                expiresAt: true,
                status: true,
              },
            },
          },
        },
        discrepancies: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders;
  }

  /**
   * 7. Full custody and disposition reconstruction for a component.
   */
  static async getComponentCustodyHistory(callerOrgId: string, componentUnitId: string) {
    const comp = await prisma.componentUnit.findUnique({
      where: { id: componentUnitId },
      include: {
        collectionUnit: {
          select: {
            id: true,
            unitNumber: true,
            bloodGroup: true,
            collectedAt: true,
            camp: { select: { id: true, title: true, venue: true } },
          },
        },
        organisation: { select: { id: true, name: true, orgCode: true } },
        hospitalIssueItems: {
          include: {
            issueOrder: {
              include: {
                issuingOrganisation: { select: { id: true, name: true } },
                receivingFacility: { select: { id: true, name: true } },
              },
            },
          },
        },
        dispositionRecords: {
          include: {
            organisation: { select: { id: true, name: true } },
            recordedBy: { select: { id: true, name: true } },
          },
        },
        statusHistory: {
          orderBy: { timestamp: 'asc' },
          include: {
            organisation: { select: { id: true, name: true } },
            actorUser: { select: { id: true, name: true, role: true } },
          },
        },
      },
    });

    if (!comp) {
      throw new Error('Component unit not found.');
    }

    // Verify caller organisation is involved in custody (issuing org, facility, or creator)
    const isOwner = comp.organisationId === callerOrgId;
    const isReceiver = comp.hospitalIssueItems.some(
      (item) => item.issueOrder.receivingFacilityId === callerOrgId || item.issueOrder.issuingOrganisationId === callerOrgId
    );

    if (!isOwner && !isReceiver) {
      throw new Error('Access denied. You do not have custody or audit permissions for this component.');
    }

    return {
      component: {
        id: comp.id,
        componentCode: comp.componentCode,
        componentType: comp.componentType,
        bloodGroup: comp.bloodGroup,
        volumeMl: comp.volumeMl,
        status: comp.status,
        expiresAt: comp.expiresAt,
        isHold: comp.isHold,
        holdReason: comp.holdReason,
        originatingCollectionUnit: comp.collectionUnit,
      },
      issueOrders: comp.hospitalIssueItems.map((item) => ({
        orderId: item.issueOrder.id,
        orderNumber: item.issueOrder.orderNumber,
        issuingOrganisation: item.issueOrder.issuingOrganisation,
        receivingFacility: item.issueOrder.receivingFacility,
        itemStatus: item.status,
        receivingOutcome: item.receivingOutcome,
        receivedAt: item.receivedAt,
        transportDetails: item.issueOrder.transportDetails,
      })),
      dispositionRecords: comp.dispositionRecords.map((d) => ({
        id: d.id,
        dispositionType: d.dispositionType,
        reason: d.reason,
        clinicalProtocolRef: d.clinicalProtocolRef,
        documentationRef: d.documentationRef,
        recipientPatientRef: d.recipientPatientRef,
        organisation: d.organisation,
        recordedAt: d.recordedAt,
      })),
      custodyTrail: comp.statusHistory.map((h) => ({
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        organisation: h.organisation.name,
        actor: h.actorUser.name,
        reason: h.reason,
        timestamp: h.timestamp,
      })),
    };
  }

  /**
   * 8. Retrieve verified hospitals directory for patient request dropdown.
   */
  static async getVerifiedHospitalsDirectory() {
    const facilities = await prisma.organisation.findMany({
      where: {
        type: 'RECEIVING_FACILITY',
        status: 'VERIFIED',
      },
      select: {
        id: true,
        name: true,
        orgCode: true,
        districtCode: true,
        districtName: true,
        stateCode: true,
        address: true,
        phone: true,
        email: true,
      },
      orderBy: { name: 'asc' },
    });

    return facilities;
  }

  /**
   * Authoritative canonical ownership check:
   * A request is designated to an organisation IF AND ONLY IF:
   * 1. metadata.assignedBankId === organisation.id, OR
   * 2. request.hospitalCode is non-null AND matches organisation.hospitalCode, organisation.orgCode, or organisation.id.
   */
  static isRequestDesignatedToOrganisation(
    request: any,
    org: { id: string; orgCode?: string | null; hospitalCode?: string | null }
  ): boolean {
    if (!request || !org) return false;
    const metadata = parseRequestMessageMetadata(request.message, request.bloodCentre?.hospitalName);
    if (metadata.assignedBankId && metadata.assignedBankId === org.id) {
      return true;
    }
    const targetCodes = [org.hospitalCode, org.orgCode, org.id].filter(Boolean) as string[];
    if (request.hospitalCode && targetCodes.includes(request.hospitalCode)) {
      return true;
    }
    return false;
  }

  /**
   * 9. Incoming blood requests designated to a blood bank centre.
   * Resolves canonical organisation codes (both orgCode and hospitalCode) and returns
   * requests strictly designated to this blood centre.
   */
  static async getIncomingBloodRequests(organisationId: string) {
    const org = await prisma.organisation.findUnique({
      where: { id: organisationId },
    });

    if (!org) {
      throw new Error('Organisation not found.');
    }

    const targetCodes = Array.from(
      new Set([org.orgCode, org.hospitalCode, organisationId].filter(Boolean))
    ) as string[];

    // Canonical server-side ownership rule:
    // A request belongs in this blood bank's incoming queue IF AND ONLY IF it is designated to this blood bank.
    const whereClauses: any[] = [
      { hospitalCode: { in: targetCodes } },
      { message: { contains: `"assignedBankId":"${organisationId}"` } },
    ];

    const requests = await prisma.bloodRequest.findMany({
      where: {
        OR: whereClauses,
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
          },
        },
        bloodCentre: true,
        hospitalIssueOrders: {
          include: {
            receivingFacility: { select: { id: true, name: true, orgCode: true } },
            items: {
              include: {
                componentUnit: {
                  select: {
                    id: true,
                    componentCode: true,
                    componentType: true,
                    bloodGroup: true,
                    status: true,
                  },
                },
              },
            },
            discrepancies: true,
          },
        },
        recipientResponses: {
          select: { id: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();

    // Strict server-side organisation isolation: exclude requests specifically assigned to another bank
    const filteredRequests = requests.filter((req) => {
      const metadata = parseRequestMessageMetadata(req.message, req.bloodCentre?.hospitalName);
      if (metadata.assignedBankId && metadata.assignedBankId !== organisationId) {
        if (!req.hospitalCode || !targetCodes.includes(req.hospitalCode)) {
          return false;
        }
      }
      return true;
    });

    // Enrich each request with authoritative stock count and hospital details
    const enriched = await Promise.all(
      filteredRequests.map(async (req) => {
        const metadata = parseRequestMessageMetadata(req.message, req.bloodCentre?.hospitalName);
        const compType = mapComponentStringToType(req.component);
        let compatibleBloodGroups: any[] = [req.bloodGroup];
        try {
          const compMatch = getComponentCompatibility(req.bloodGroup, req.component);
          compatibleBloodGroups = compMatch.compatibleGroups;
        } catch {
          compatibleBloodGroups = [req.bloodGroup];
        }

        // Authoritative eligible available units in this blood bank based on transfusion compatibility
        let eligibleUnits: any[] = [];
        if (compType) {
          const candidates = await prisma.componentUnit.findMany({
            where: {
              organisationId,
              bloodGroup: { in: compatibleBloodGroups },
              componentType: compType as any,
              status: 'AVAILABLE',
              isHold: false,
              expiresAt: { gt: now },
            },
            include: {
              clinicalReleases: {
                where: { decision: 'RELEASED' },
              },
            },
            orderBy: [{ expiresAt: 'asc' }],
          });
          const verified = candidates.filter((u) => u.clinicalReleases && u.clinicalReleases.length > 0);
          // Prioritize exact ABO/Rh match first, then by earliest expiresAt
          verified.sort((a, b) => {
            const aExact = a.bloodGroup === req.bloodGroup ? 0 : 1;
            const bExact = b.bloodGroup === req.bloodGroup ? 0 : 1;
            if (aExact !== bExact) return aExact - bExact;
            return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
          });
          eligibleUnits = verified;
        }

        // Check if any units are currently reserved for this request
        let currentlyReservedUnits: any[] = [];
        if (metadata.reservedUnitIds && metadata.reservedUnitIds.length > 0) {
          currentlyReservedUnits = await prisma.componentUnit.findMany({
            where: {
              id: { in: metadata.reservedUnitIds },
              organisationId,
            },
            select: {
              id: true,
              componentCode: true,
              componentType: true,
              bloodGroup: true,
              volumeMl: true,
              status: true,
              expiresAt: true,
            },
          });
        }

        // Current logical fulfillment status
        let fulfillmentStage = req.closureOutcome || (req.status === 'CLOSED' ? 'FULFILLED' : req.status);
        const linkedOrder = req.hospitalIssueOrders[0];
        if (linkedOrder) {
          if (linkedOrder.status === 'RECEIVED') {
            fulfillmentStage = 'FULFILLED';
          } else if (linkedOrder.status === 'RECEIVED_WITH_DISCREPANCIES') {
            fulfillmentStage = 'RECEIVED_WITH_DISCREPANCIES';
          } else if (linkedOrder.status === 'DISPATCHED' || linkedOrder.status === 'PARTIALLY_RECEIVED') {
            fulfillmentStage = 'DISPATCHED';
          } else if (linkedOrder.status === 'AUTHORISED') {
            fulfillmentStage = 'PREPARING';
          }
        }

        const isDirectDesignation = Boolean(
          (metadata.assignedBankId && metadata.assignedBankId === organisationId) ||
          (req.hospitalCode && targetCodes.includes(req.hospitalCode))
        );
        const isDistrictUnassigned = !isDirectDesignation;
        const isClaimable = isDistrictUnassigned && req.status === 'OPEN' && (!req.closureOutcome || req.closureOutcome === 'SUBMITTED' || req.closureOutcome === 'OPEN');
        const allocatedUnitsCount = currentlyReservedUnits.length;
        const shortfallCount = Math.max(0, req.unitsRequested - allocatedUnitsCount);
        const isPartialAllocation = allocatedUnitsCount > 0 && shortfallCount > 0;
        const canDispatch =
          (fulfillmentStage === 'STOCK_RESERVED' ||
            fulfillmentStage === 'PARTIALLY_ALLOCATED' ||
            fulfillmentStage === 'ACCEPTED') &&
          currentlyReservedUnits.length > 0;

        return {
          id: req.id,
          requestReference: `#${req.id.slice(0, 8)}`,
          patientName: req.patientName || 'Emergency Patient',
          bloodGroup: req.bloodGroup,
          component: req.component,
          unitsRequested: req.unitsRequested,
          allocatedUnitsCount,
          shortfallCount,
          isPartialAllocation,
          requiredBy: req.requiredBy,
          searchScope: req.searchScope,
          createdAt: req.createdAt,
          updatedAt: req.updatedAt,
          status: req.status,
          fulfillmentStatus: fulfillmentStage,
          rejectionReason: req.closureFeedback,
          patientAcknowledgedAt: metadata.patientAcknowledgedAt || null,
          patientAcknowledgementNotes: metadata.patientAcknowledgementNotes || null,
          isDirectDesignation,
          isDistrictUnassigned,
          isClaimable,
          canDispatch,
          transportDetails: metadata.transportDetails || null,
          matchingRequest: metadata.matchingRequest || null,
          matchingStatus: metadata.matchingRequest?.status || 'NOT_REQUESTED',
          hasMatchingRequest: Boolean(metadata.matchingRequest && metadata.matchingRequest.status !== 'NOT_REQUESTED'),
          matchingCandidatesCount: metadata.matchingRequest?.releasedCandidateIds?.length || 0,
          releasedCandidateCount: metadata.matchingRequest?.releasedCandidateIds?.length || 0,
          releasedCandidateIds: metadata.matchingRequest?.releasedCandidateIds || [],
          releasedAt: metadata.matchingRequest?.releasedAt || null,
          donorIntake: metadata.donorIntake || null,
          hasAcceptedDonor: (req.recipientResponses || []).some((r: any) => r.status === 'ACCEPTED'),
          canRequestMatching:
            shortfallCount > 0 &&
            (!metadata.matchingRequest ||
              metadata.matchingRequest.status === 'NOT_REQUESTED' ||
              metadata.matchingRequest.status === 'CANCELLED'),
          // Hospital Details
          admittedHospitalName: metadata.hospitalName || req.bloodCentre?.hospitalName || 'Local Medical Centre',
          receivingFacilityId: metadata.receivingFacilityId || null,
          isHospitalVerified: !!metadata.isHospitalVerified,
          urgency: metadata.urgency || 'NORMAL',
          userMessage: metadata.userMessage || null,
          requesterContact: metadata.requesterContact || req.requester.phoneNumber,
          // Inventory & Fulfillment Linkage
          availableStockCount: eligibleUnits.length,
          availableEligibleStockCount: eligibleUnits.length,
          compatibleBloodGroups,
          eligibleUnitIds: eligibleUnits.map((u) => u.id),
          reservedUnits: currentlyReservedUnits,
          linkedIssueOrder: linkedOrder
            ? {
                id: linkedOrder.id,
                orderNumber: linkedOrder.orderNumber,
                status: linkedOrder.status,
                receivingFacility: linkedOrder.receivingFacility,
                dispatchedAt: linkedOrder.dispatchedAt,
                receivedAt: linkedOrder.receivedAt,
                transportDetails: linkedOrder.transportDetails,
                itemCount: linkedOrder.items.length,
                discrepancyCount: linkedOrder.discrepancies.length,
              }
            : null,
          coordinationSummary: {
            totalInvitations: req.recipientResponses.length,
            answeredInvitations: req.recipientResponses.filter((r) => r.status === 'ACCEPTED').length,
          },
        };
      })
    );

    return enriched;
  }

  /**
   * 10. Blood bank accepts request & reserves stock.
   * Concurrency-safe server-side transaction verifies clinical release, expiry, hold,
   * prevents duplicate reservation across concurrent requests, and transitions unit to RESERVED.
   */
  static async acceptAndReserveRequest(
    callerUserId: string,
    organisationId: string,
    requestId: string,
    preferredUnitIds?: string[]
  ) {
    const org = await prisma.organisation.findUnique({
      where: { id: organisationId },
    });
    if (!org) {
      throw new Error('Organisation not found.');
    }

    const request = await prisma.bloodRequest.findUnique({
      where: { id: requestId },
      include: { bloodCentre: true },
    });

    if (!request) {
      throw new Error('Blood request not found.');
    }

    if (!HospitalIntegrationService.isRequestDesignatedToOrganisation(request, org)) {
      const error: any = new Error('Access denied. This blood request is not designated to your blood centre.');
      error.code = 'FORBIDDEN_NOT_DESIGNATED';
      error.statusCode = 403;
      throw error;
    }

    if (request.status === 'CLOSED' || request.closureOutcome === 'REJECTED') {
      throw new Error(`Cannot reserve stock for a request in '${request.closureOutcome || request.status}' status.`);
    }

    const now = new Date();
    const compType = mapComponentStringToType(request.component);
    if (!compType) {
      throw new Error(`Unsupported component type '${request.component}' for stock reservation.`);
    }

    let compatibleGroups: any[] = [request.bloodGroup];
    try {
      const compMatch = getComponentCompatibility(request.bloodGroup, request.component);
      compatibleGroups = compMatch.compatibleGroups;
    } catch {
      compatibleGroups = [request.bloodGroup];
    }

    return await prisma.$transaction(async (tx) => {
      // If specific preferred unit(s) were requested, verify their status first
      if (preferredUnitIds && preferredUnitIds.length > 0) {
        const preferredRecords = await tx.componentUnit.findMany({
          where: { id: { in: preferredUnitIds }, organisationId },
          select: { id: true, status: true, isHold: true, bloodGroup: true },
        });
        for (const unit of preferredRecords) {
          if (unit.status !== 'AVAILABLE') {
            throw new Error(`Component unit ${unit.id} is in '${unit.status}' status and cannot be allocated. Mandatory TTI testing and clinical release are required.`);
          }
          if (unit.isHold) {
            throw new Error(`Component unit ${unit.id} is on hold and cannot be allocated.`);
          }
          if (!compatibleGroups.includes(unit.bloodGroup)) {
            throw new Error(`Component unit ${unit.id} (${unit.bloodGroup}) is not compatible with recipient blood group ${request.bloodGroup}.`);
          }
        }
      }

      // Find eligible available units locked to this org and clinically released based on component compatibility
      const candidateUnits = await tx.componentUnit.findMany({
        where: {
          organisationId,
          bloodGroup: { in: compatibleGroups },
          componentType: compType as any,
          status: 'AVAILABLE',
          isHold: false,
          expiresAt: { gt: now },
        },
        include: {
          clinicalReleases: {
            where: { decision: 'RELEASED' },
          },
        },
        orderBy: [{ expiresAt: 'asc' }],
      });

      const verifiedUnits = candidateUnits.filter(
        (u) => u.clinicalReleases && u.clinicalReleases.length > 0
      );

      // Prioritize exact ABO/Rh match first, then by earliest expiresAt
      verifiedUnits.sort((a, b) => {
        const aExact = a.bloodGroup === request.bloodGroup ? 0 : 1;
        const bExact = b.bloodGroup === request.bloodGroup ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
      });

      if (verifiedUnits.length === 0) {
        throw new Error(
          `Insufficient eligible ${request.bloodGroup} (or compatible) ${request.component} inventory available. (0 eligible units in active stock)`
        );
      }

      // Select units up to unitsRequested
      let unitsToReserve = verifiedUnits;
      if (preferredUnitIds && preferredUnitIds.length > 0) {
        const preferredSet = new Set(preferredUnitIds);
        unitsToReserve = verifiedUnits.filter((u) => preferredSet.has(u.id));
        if (unitsToReserve.length === 0) {
          throw new Error('None of the specified units are currently eligible or available for reservation.');
        }
      }

      const neededCount = Math.min(request.unitsRequested, unitsToReserve.length);
      const selected = unitsToReserve.slice(0, neededCount);

      // Reserve units atomically with optimistic concurrency check
      for (const unit of selected) {
        const updateRes = await tx.componentUnit.updateMany({
          where: { id: unit.id, status: 'AVAILABLE', isHold: false },
          data: { status: 'RESERVED' },
        });

        if (updateRes.count === 0) {
          throw new Error(`Component unit ${unit.componentCode} is no longer available or was concurrently modified.`);
        }

        await tx.unitStatusHistory.create({
          data: {
            unitType: 'COMPONENT_UNIT',
            componentUnitId: unit.id,
            fromStatus: 'AVAILABLE',
            toStatus: 'RESERVED',
            actorUserId: callerUserId,
            organisationId,
            reason: `Reserved for incoming blood request #${request.id.slice(0, 8)}`,
            metadata: {
              requestId: request.id,
              patientName: request.patientName,
            },
          },
        });
      }

      // Calculate allocation counts & shortfall
      const currentMetadata = parseRequestMessageMetadata(request.message, request.bloodCentre?.hospitalName);
      const existingReserved = new Set(currentMetadata.reservedUnitIds || []);
      selected.forEach((u) => existingReserved.add(u.id));
      const totalReservedIds = Array.from(existingReserved);
      const allocatedUnitsCount = totalReservedIds.length;
      const shortfallCount = Math.max(0, request.unitsRequested - allocatedUnitsCount);
      const isPartial = shortfallCount > 0;

      currentMetadata.reservedUnitIds = totalReservedIds;
      currentMetadata.allocatedUnitsCount = allocatedUnitsCount;
      currentMetadata.shortfallCount = shortfallCount;
      currentMetadata.isPartialAllocation = isPartial;
      currentMetadata.reservedUnitDetails = selected.map((u) => ({
        id: u.id,
        componentCode: u.componentCode,
        componentType: u.componentType,
        bloodGroup: u.bloodGroup,
        volumeMl: u.volumeMl,
        expiresAt: u.expiresAt ? u.expiresAt.toISOString() : null,
        status: 'RESERVED',
      }));

      const closureOutcome = isPartial ? 'PARTIALLY_ALLOCATED' : 'STOCK_RESERVED';

      const updatedRequest = await tx.bloodRequest.update({
        where: { id: request.id },
        data: {
          closureOutcome,
          message: JSON.stringify(currentMetadata),
        },
      });

      // Transactional Audit Log
      await tx.auditLog.create({
        data: {
          userId: callerUserId,
          action: isPartial ? 'REQUEST_PARTIALLY_ALLOCATED' : 'REQUEST_STOCK_RESERVED',
          resource: 'BloodRequest',
          resourceId: request.id,
          metadata: {
            requestId: request.id,
            unitsRequested: request.unitsRequested,
            unitsReservedCount: selected.length,
            allocatedUnitsCount,
            shortfallCount,
            isPartial,
            reservedComponentCodes: selected.map((u) => u.componentCode),
            organisationId,
          },
        },
      });

      // Realtime Outbox Events: Broadcast to patient, blood centre, and inventory domain
      try {
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'blood_request.status_changed',
          entityType: 'BloodRequest',
          entityId: request.id,
          organisationId,
          recipientUserId: request.requesterId,
          payload: {
            requestId: request.id,
            requestReference: `#${request.id.slice(0, 8)}`,
            status: closureOutcome,
            unitsRequested: request.unitsRequested,
            reservedUnitsCount: selected.length,
            allocatedUnitsCount,
            shortfallCount,
            isPartial,
            reservedComponentCodes: selected.map((u) => u.componentCode),
            bloodCentreName: org.name,
            timestamp: now.toISOString(),
          },
        });

        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'blood_request.allocated',
          entityType: 'BloodRequest',
          entityId: request.id,
          organisationId,
          recipientUserId: request.requesterId,
          payload: {
            requestId: request.id,
            requestReference: `#${request.id.slice(0, 8)}`,
            status: closureOutcome,
            allocatedUnitsCount,
            shortfallCount,
            isPartial,
            reservedUnits: selected.map((u) => ({
              id: u.id,
              componentCode: u.componentCode,
              bloodGroup: u.bloodGroup,
            })),
            timestamp: now.toISOString(),
          },
        });

        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'inventory.summary_changed',
          entityType: 'Organisation',
          entityId: organisationId,
          organisationId,
          payload: {
            organisationId,
            allocatedUnitsCount: selected.length,
            componentCodes: selected.map((u) => u.componentCode),
            requestId: request.id,
            timestamp: now.toISOString(),
          },
        });

        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'component.status_changed',
          entityType: 'Organisation',
          entityId: organisationId,
          organisationId,
          payload: {
            organisationId,
            fromStatus: 'AVAILABLE',
            toStatus: 'RESERVED',
            componentIds: selected.map((u) => u.id),
            timestamp: now.toISOString(),
          },
        });
      } catch {
        /* Non-blocking outbox */
      }

      return {
        success: true,
        request: updatedRequest,
        unitsRequested: request.unitsRequested,
        allocatedUnitsCount,
        shortfallCount,
        isPartial,
        reservedUnits: selected.map((u) => ({
          id: u.id,
          componentCode: u.componentCode,
          componentType: u.componentType,
          bloodGroup: u.bloodGroup,
          volumeMl: u.volumeMl,
          expiresAt: u.expiresAt ? u.expiresAt.toISOString() : null,
        })),
      };
    }, { maxWait: 10000, timeout: 20000 });
  }

  /**
   * 11. Blood bank rejects request with mandatory documented reason.
   * Frees any previously reserved units back to AVAILABLE stock.
   */
  static async rejectRequest(
    callerUserId: string,
    organisationId: string,
    requestId: string,
    reason: string
  ) {
    if (!reason || !reason.trim()) {
      throw new Error('A documented clinical or operational rejection reason is mandatory.');
    }

    const org = await prisma.organisation.findUnique({
      where: { id: organisationId },
    });
    if (!org) {
      throw new Error('Organisation not found.');
    }

    const request = await prisma.bloodRequest.findUnique({
      where: { id: requestId },
      include: { bloodCentre: true },
    });

    if (!request) {
      throw new Error('Blood request not found.');
    }

    if (!HospitalIntegrationService.isRequestDesignatedToOrganisation(request, org)) {
      const error: any = new Error('Access denied. This blood request is not designated to your blood centre.');
      error.code = 'FORBIDDEN_NOT_DESIGNATED';
      error.statusCode = 403;
      throw error;
    }

    const metadata = parseRequestMessageMetadata(request.message, request.bloodCentre?.hospitalName);
    const now = new Date();

    return await prisma.$transaction(async (tx) => {
      // If any units were reserved, revert them back to AVAILABLE
      if (metadata.reservedUnitIds && metadata.reservedUnitIds.length > 0) {
        const reservedUnits = await tx.componentUnit.findMany({
          where: {
            id: { in: metadata.reservedUnitIds },
            status: 'RESERVED',
            organisationId,
          },
        });

        for (const u of reservedUnits) {
          await tx.componentUnit.update({
            where: { id: u.id },
            data: { status: 'AVAILABLE' },
          });

          await tx.unitStatusHistory.create({
            data: {
              unitType: 'COMPONENT_UNIT',
              componentUnitId: u.id,
              fromStatus: 'RESERVED',
              toStatus: 'AVAILABLE',
              actorUserId: callerUserId,
              organisationId,
              reason: `Released reservation due to request rejection: ${reason.trim()}`,
              metadata: { requestId: request.id },
            },
          });
        }
      }

      metadata.reservedUnitIds = [];

      const updatedRequest = await tx.bloodRequest.update({
        where: { id: request.id },
        data: {
          status: 'CLOSED',
          closureOutcome: 'REJECTED',
          closureFeedback: reason.trim(),
          closureReportedBy: callerUserId,
          closedAt: now,
          message: JSON.stringify(metadata),
        },
      });

      // Audit Log
      await prisma.auditLog.create({
        data: {
          userId: callerUserId,
          action: 'REQUEST_REJECTED',
          resource: 'BloodRequest',
          resourceId: request.id,
          metadata: {
            requestId: request.id,
            reason: reason.trim(),
            organisationId,
          },
        },
      });

      // Realtime Outbox
      try {
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'blood_request.status_changed',
          entityType: 'BloodRequest',
          entityId: request.id,
          organisationId,
          recipientUserId: request.requesterId,
          payload: {
            requestId: request.id,
            requestReference: `#${request.id.slice(0, 8)}`,
            status: 'REJECTED',
            rejectionReason: reason.trim(),
            bloodCentreName: org.name,
            timestamp: now.toISOString(),
          },
        });
      } catch {
        /* Non-blocking outbox */
      }

      return updatedRequest;
    }, { maxWait: 10000, timeout: 20000 });
  }

  /**
   * 12. Hospital Portal: Comprehensive dashboard and requests for a receiving facility.
   * Strictly isolates data to requests and deliveries associated with the authenticated hospital.
   */
  static async getHospitalDashboard(receivingFacilityId: string) {
    const facility = await prisma.organisation.findUnique({
      where: { id: receivingFacilityId },
    });

    if (!facility) {
      throw new Error('Hospital facility not found.');
    }

    // Orders dispatched or issued to this hospital
    const orders = await prisma.hospitalIssueOrder.findMany({
      where: { receivingFacilityId },
      include: {
        issuingOrganisation: {
          select: { id: true, name: true, orgCode: true, phone: true, address: true },
        },
        items: {
          include: {
            componentUnit: {
              select: {
                id: true,
                componentCode: true,
                componentType: true,
                bloodGroup: true,
                volumeMl: true,
                expiresAt: true,
                status: true,
              },
            },
          },
        },
        discrepancies: true,
        request: {
          select: {
            id: true,
            patientName: true,
            bloodGroup: true,
            component: true,
            unitsRequested: true,
            requiredBy: true,
            status: true,
            closureOutcome: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Associated patient blood requests
    const linkedRequestIds = orders.map((o) => o.requestId).filter(Boolean) as string[];

    const requests = await prisma.bloodRequest.findMany({
      where: {
        OR: [
          { id: { in: linkedRequestIds } },
          { message: { contains: receivingFacilityId } },
        ],
      },
      include: {
        bloodCentre: true,
        hospitalIssueOrders: {
          where: { receivingFacilityId },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const enrichedRequests = requests.map((r) => {
      const metadata = parseRequestMessageMetadata(r.message, facility.name);
      return {
        id: r.id,
        requestReference: `#${r.id.slice(0, 8)}`,
        patientName: r.patientName || 'Admitted Patient',
        bloodGroup: r.bloodGroup,
        component: r.component,
        unitsRequested: r.unitsRequested,
        requiredBy: r.requiredBy,
        urgency: metadata.urgency || 'NORMAL',
        status: r.status,
        fulfillmentStatus: r.closureOutcome || (r.status === 'CLOSED' ? 'FULFILLED' : r.status),
        designatedBloodBank: r.bloodCentre?.hospitalName || 'Participating Blood Bank',
        hospitalName: metadata.hospitalName || facility.name,
        isHospitalVerified: true,
        patientAcknowledgedAt: metadata.patientAcknowledgedAt || null,
        createdAt: r.createdAt,
      };
    });

    // Compute metrics
    const summary = {
      totalRequests: enrichedRequests.length,
      awaitingResponse: enrichedRequests.filter((r) => (r.fulfillmentStatus === 'OPEN')).length,
      inProgress: enrichedRequests.filter((r) =>
        ['ACCEPTED', 'STOCK_RESERVED', 'PREPARING'].includes(r.fulfillmentStatus)
      ).length,
      dispatchedInTransit: orders.filter((o) => o.status === 'DISPATCHED').length,
      receivedIntact: orders.filter((o) => o.status === 'RECEIVED').length,
      discrepantOrders: orders.filter((o) => o.status === 'RECEIVED_WITH_DISCREPANCIES').length,
    };

    return {
      facility: {
        id: facility.id,
        name: facility.name,
        orgCode: facility.orgCode,
        districtName: facility.districtName,
      },
      summary,
      orders,
      requests: enrichedRequests,
    };
  }

  /**
   * 13. Patient / Requester acknowledgement of delivery.
   * Purely for patient-facing peace-of-mind coordination; strictly does NOT replace
   * hospital receipt, bedside verification or clinical transfusion records.
   */
  static async patientAcknowledgeDelivery(
    requesterUserId: string,
    requestId: string,
    notes?: string
  ) {
    const request = await prisma.bloodRequest.findUnique({
      where: { id: requestId },
      include: { bloodCentre: true, hospitalIssueOrders: true },
    });

    if (!request) {
      throw new Error('Blood request not found.');
    }

    if (request.requesterId !== requesterUserId) {
      throw new Error('Access denied. You can only acknowledge your own blood request.');
    }

    const currentOutcome = request.closureOutcome || request.status;
    const isEligibleForAck = [
      'DISPATCHED',
      'RECEIVED_BY_HOSPITAL',
      'RECEIVED_WITH_DISCREPANCIES',
      'FULFILLED',
      'CLOSED',
    ].includes(currentOutcome);

    if (!isEligibleForAck) {
      throw new Error(
        `Cannot acknowledge delivery while request is in '${currentOutcome}' status. Delivery must be dispatched first.`
      );
    }

    const now = new Date();
    const metadata = parseRequestMessageMetadata(request.message, request.bloodCentre?.hospitalName);
    metadata.patientAcknowledgedAt = now.toISOString();
    metadata.patientAcknowledgementNotes =
      notes?.trim() || 'Requester confirmed blood unit delivery coordination.';

    const updated = await prisma.bloodRequest.update({
      where: { id: request.id },
      data: {
        message: JSON.stringify(metadata),
      },
    });

    // Audit Log
    await prisma.auditLog.create({
      data: {
        userId: requesterUserId,
        action: 'PATIENT_DELIVERY_ACKNOWLEDGED',
        resource: 'BloodRequest',
        resourceId: request.id,
        metadata: {
          requestId: request.id,
          acknowledgedAt: now.toISOString(),
          notes: notes?.trim() || null,
          clinicalNotice: 'Patient acknowledgement does not substitute for hospital clinical bedside verification.',
        },
      },
    });

    return {
      success: true,
      requestId: request.id,
      patientAcknowledgedAt: metadata.patientAcknowledgedAt,
      message: 'Delivery acknowledged successfully.',
    };
  }

  /**
   * 14. Claim an unassigned or external district request for a participating blood bank.
   */
  static async claimRequest(
    callerUserId: string,
    organisationId: string,
    requestId: string
  ) {
    const org = await prisma.organisation.findUnique({
      where: { id: organisationId },
    });
    if (!org) throw new Error('Organisation not found.');

    const request = await prisma.bloodRequest.findUnique({
      where: { id: requestId },
      include: { bloodCentre: true },
    });
    if (!request) throw new Error('Blood request not found.');

    if (request.status !== 'OPEN') {
      throw new Error(`Cannot claim request in '${request.status}' status. Requests must be OPEN.`);
    }

    const now = new Date();
    const metadata = parseRequestMessageMetadata(request.message, request.bloodCentre?.hospitalName);
    metadata.assignedBankId = org.id;
    metadata.assignedBankName = org.name;
    metadata.claimedAt = now.toISOString();
    metadata.claimedById = callerUserId;

    const canonicalCode = org.hospitalCode || org.orgCode;

    // Ensure BloodCentre directory record exists for this canonical code
    await prisma.bloodCentre.upsert({
      where: { hospitalCode: canonicalCode },
      update: {
        hospitalName: org.name,
        address: org.address,
        mobileNo: org.phone,
        stateCode: org.stateCode,
        districtCode: org.districtCode,
      },
      create: {
        hospitalCode: canonicalCode,
        hospitalName: org.name,
        address: org.address,
        mobileNo: org.phone,
        stateCode: org.stateCode,
        districtCode: org.districtCode,
      },
    });

    return await prisma.$transaction(async (tx) => {
      const updated = await tx.bloodRequest.update({
        where: { id: request.id },
        data: {
          hospitalCode: canonicalCode,
          closureOutcome: 'ACCEPTED',
          reportedDonationStatus: 'ACCEPTED',
          message: JSON.stringify(metadata),
        },
      });

      await tx.auditLog.create({
        data: {
          userId: callerUserId,
          action: 'BLOOD_REQUEST_CLAIMED',
          resource: 'BloodRequest',
          resourceId: request.id,
          metadata: {
            requestId: request.id,
            organisationId,
            orgName: org.name,
          },
        },
      });

      try {
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'blood_request.status_changed',
          entityType: 'BloodRequest',
          entityId: request.id,
          recipientUserId: request.requesterId,
          payload: {
            requestId: request.id,
            requestReference: `#${request.id.slice(0, 8)}`,
            status: 'ACCEPTED',
            assignedBankName: org.name,
            timestamp: now.toISOString(),
          },
        });
      } catch {}

      return {
        success: true,
        message: `Successfully claimed request for ${org.name}.`,
        data: updated,
      };
    }, { maxWait: 15000, timeout: 30000 });
  }

  /**
   * 15. Blood bank dispatches reserved units directly for a blood request.
   * Atomically transitions reserved units to ISSUED, records transport details, and updates request.
   */
  static async dispatchRequest(
    callerUserId: string,
    organisationId: string,
    requestId: string,
    transportDetails: {
      courierName?: string;
      vehicleNumber?: string;
      driverPhone?: string;
      coldBoxTempCelsius?: number;
      notes?: string;
    }
  ) {
    const org = await prisma.organisation.findUnique({
      where: { id: organisationId },
    });
    if (!org) throw new Error('Organisation not found.');

    const request = await prisma.bloodRequest.findUnique({
      where: { id: requestId },
      include: { bloodCentre: true },
    });
    if (!request) throw new Error('Blood request not found.');

    if (!HospitalIntegrationService.isRequestDesignatedToOrganisation(request, org)) {
      const error: any = new Error('Access denied. This blood request is not assigned to your blood centre.');
      error.code = 'FORBIDDEN_NOT_DESIGNATED';
      error.statusCode = 403;
      throw error;
    }

    if (request.status !== 'OPEN') {
      throw new Error(`Cannot dispatch request in '${request.status}' status. Requests must be OPEN.`);
    }

    const metadata = parseRequestMessageMetadata(request.message, request.bloodCentre?.hospitalName);
    const reservedIds = metadata.reservedUnitIds || [];
    if (reservedIds.length === 0) {
      throw new Error('Cannot dispatch request without reserved stock units. Please reserve stock first.');
    }

    const now = new Date();
    const finalTransport = {
      courierName: transportDetails.courierName?.trim() || 'Cold-Chain Medical Courier',
      vehicleNumber: transportDetails.vehicleNumber?.trim() || 'MH-MEDICAL-DIRECT',
      driverPhone: transportDetails.driverPhone?.trim() || null,
      coldBoxTempCelsius: transportDetails.coldBoxTempCelsius ?? 4.0,
      dispatchedAt: now.toISOString(),
      dispatchedBy: callerUserId,
      notes: transportDetails.notes?.trim() || null,
    };

    return await prisma.$transaction(async (tx) => {
      // 1. Fetch reserved units belonging to this org
      const units = await tx.componentUnit.findMany({
        where: {
          id: { in: reservedIds },
          organisationId,
        },
      });

      if (units.length === 0) {
        throw new Error('Reserved units were not found in this organisation inventory.');
      }

      // 2. Transition units to ISSUED
      for (const unit of units) {
        if (unit.status !== 'ISSUED') {
          await tx.componentUnit.update({
            where: { id: unit.id },
            data: { status: 'ISSUED' },
          });

          await tx.unitStatusHistory.create({
            data: {
              unitType: 'COMPONENT_UNIT',
              componentUnitId: unit.id,
              fromStatus: unit.status,
              toStatus: 'ISSUED',
              actorUserId: callerUserId,
              organisationId,
              reason: `Dispatched for blood request #${request.id.slice(0, 8)}`,
              metadata: {
                requestId: request.id,
                transportDetails: finalTransport,
              },
            },
          });
        }
      }

      // Ensure hospitalIssueOrder exists for this dispatch
      let issueOrder = await tx.hospitalIssueOrder.findFirst({
        where: { requestId: request.id },
      });
      if (!issueOrder) {
        const orderNumber = `HIO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        issueOrder = await tx.hospitalIssueOrder.create({
          data: {
            orderNumber,
            issuingOrganisationId: organisationId,
            receivingFacilityId: organisationId,
            requestId: request.id,
            status: 'DISPATCHED',
            authorisationReason: `Cold chain dispatch for blood request #${request.id.slice(0, 8)}`,
            authorisedById: callerUserId,
            authorisedAt: now,
            dispatchedAt: now,
            dispatchedById: callerUserId,
            notes: transportDetails.notes?.trim() || null,
          },
        });

        for (const unit of units) {
          await tx.hospitalIssueItem.create({
            data: {
              issueOrderId: issueOrder.id,
              componentUnitId: unit.id,
              status: 'DISPATCHED',
            },
          });
        }
      } else {
        await tx.hospitalIssueOrder.update({
          where: { id: issueOrder.id },
          data: {
            status: 'DISPATCHED',
            dispatchedAt: now,
            dispatchedById: callerUserId,
          },
        });
      }

      // 3. Update request metadata
      const shortfallCount = Math.max(0, request.unitsRequested - units.length);
      const isPartial = shortfallCount > 0;
      metadata.transportDetails = finalTransport;
      metadata.dispatchedUnitIds = units.map((u) => u.id);
      metadata.dispatchedUnitsCount = units.length;
      metadata.dispatchedAt = now.toISOString();
      metadata.shortfallCount = shortfallCount;
      metadata.isPartialAllocation = isPartial;

      const updated = await tx.bloodRequest.update({
        where: { id: request.id },
        data: {
          closureOutcome: 'DISPATCHED',
          reportedDonationStatus: 'DISPATCHED',
          message: JSON.stringify(metadata),
        },
      });

      // 4. Audit Log
      await tx.auditLog.create({
        data: {
          userId: callerUserId,
          action: 'REQUEST_DISPATCHED',
          resource: 'BloodRequest',
          resourceId: request.id,
          metadata: {
            requestId: request.id,
            dispatchedUnitsCount: units.length,
            unitsRequested: request.unitsRequested,
            shortfallCount,
            isPartial,
            unitCodes: units.map((u) => u.componentCode),
            transportDetails: finalTransport,
          },
        },
      });

      // 5. Realtime Notification
      try {
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'blood_request.status_changed',
          entityType: 'BloodRequest',
          entityId: request.id,
          organisationId,
          recipientUserId: request.requesterId,
          payload: {
            requestId: request.id,
            requestReference: `#${request.id.slice(0, 8)}`,
            status: 'DISPATCHED',
            transportDetails: finalTransport,
            dispatchedUnitsCount: units.length,
            unitsRequested: request.unitsRequested,
            shortfallCount,
            isPartial,
            bloodCentreName: org.name,
            timestamp: now.toISOString(),
          },
        });
      } catch {}

      return {
        success: true,
        message: isPartial
          ? `Dispatched ${units.length} unit(s) for request #${request.id.slice(0, 8)}. Remaining shortfall: ${shortfallCount} unit(s).`
          : `Successfully dispatched all ${units.length} unit(s) for request #${request.id.slice(0, 8)}.`,
        data: {
          ...updated,
          transportDetails: finalTransport,
          dispatchedUnitsCount: units.length,
          unitsRequested: request.unitsRequested,
          shortfallCount,
          isPartial,
        },
      };
    }, { maxWait: 15000, timeout: 30000 });
  }

  /**
   * 16. Dual confirmation: Requester or Hospital Staff confirms physical receipt of dispatched blood units.
   * Atomically transitions the request to FULFILLED (and CLOSED) only if all requested units are received.
   * If shortfall remains, request stays OPEN in PARTIALLY_FULFILLED state.
   * Does NOT deduct inventory a second time.
   */
  static async confirmReceipt(
    callerUserId: string,
    requestId: string,
    notes?: string,
    isHospitalStaff: boolean = false
  ) {
    const request = await prisma.bloodRequest.findUnique({
      where: { id: requestId },
      include: { bloodCentre: true },
    });
    if (!request) throw new Error('Blood request not found.');

    const metadata = parseRequestMessageMetadata(request.message, request.bloodCentre?.hospitalName);

    // Permission check: either requester or receiving hospital / bank staff
    const isRequester = request.requesterId === callerUserId;
    if (!isRequester && !isHospitalStaff) {
      throw new Error('Access denied. Only the authenticated requester or authorised hospital staff can confirm receipt.');
    }

    const currentOutcome = request.closureOutcome || request.status;
    const allowedPriorOutcomes = [
      'DISPATCHED',
      'RECEIVED_BY_HOSPITAL',
      'STOCK_RESERVED',
      'PARTIALLY_ALLOCATED',
      'PARTIALLY_FULFILLED',
      'FULFILLED',
      'CLOSED',
    ];
    if (!allowedPriorOutcomes.includes(currentOutcome)) {
      throw new Error(`Cannot confirm receipt for a request in '${currentOutcome}' status. Units must be dispatched first.`);
    }

    const now = new Date();
    const receivedUnitsCount =
      metadata.dispatchedUnitsCount ||
      metadata.dispatchedUnitIds?.length ||
      metadata.allocatedUnitsCount ||
      metadata.reservedUnitIds?.length ||
      1;
    const isFullyFulfilled = receivedUnitsCount >= request.unitsRequested;
    const remainingShortfall = Math.max(0, request.unitsRequested - receivedUnitsCount);

    if (isHospitalStaff) {
      metadata.hospitalReceivedAt = now.toISOString();
      metadata.hospitalReceivedBy = callerUserId;
      metadata.hospitalReceiptNotes = notes?.trim() || 'Hospital staff confirmed intake.';
    } else {
      metadata.patientAcknowledgedAt = now.toISOString();
      metadata.patientAcknowledgedBy = callerUserId;
      metadata.patientAcknowledgementNotes = notes?.trim() || 'Requester confirmed receipt.';
    }
    metadata.receiptNotes = notes?.trim() || (isRequester ? 'Requester confirmed receipt.' : 'Hospital staff confirmed intake.');
    metadata.confirmedByRole = isRequester ? 'REQUESTER' : 'HOSPITAL_STAFF';
    metadata.shortfallCount = remainingShortfall;
    metadata.isPartialAllocation = !isFullyFulfilled;

    return await prisma.$transaction(async (tx) => {
      const finalStatus = isFullyFulfilled ? 'CLOSED' : 'OPEN';
      const finalOutcome = isFullyFulfilled ? 'FULFILLED' : 'PARTIALLY_FULFILLED';
      const finalDonationStatus = isFullyFulfilled ? 'FULFILLED' : 'PARTIALLY_FULFILLED';

      if (isHospitalStaff) {
        await tx.hospitalIssueOrder.updateMany({
          where: { requestId: request.id },
          data: {
            status: 'RECEIVED',
            receivedAt: now,
            receivedById: callerUserId,
          },
        });
      }

      const updated = await tx.bloodRequest.update({
        where: { id: request.id },
        data: {
          status: finalStatus,
          closureOutcome: finalOutcome,
          reportedDonationStatus: finalDonationStatus,
          closureReportedBy: isFullyFulfilled ? callerUserId : null,
          closedAt: isFullyFulfilled ? now : null,
          message: JSON.stringify(metadata),
        },
      });

      // Audit Log
      await prisma.auditLog.create({
        data: {
          userId: callerUserId,
          action: isFullyFulfilled ? 'BLOOD_REQUEST_FULFILLED' : 'BLOOD_REQUEST_PARTIALLY_FULFILLED',
          resource: 'BloodRequest',
          resourceId: request.id,
          metadata: {
            requestId: request.id,
            confirmedByRole: metadata.confirmedByRole,
            receiptNotes: metadata.receiptNotes,
            unitsRequested: request.unitsRequested,
            receivedUnitsCount,
            shortfallCount: remainingShortfall,
            isFullyFulfilled,
            timestamp: now.toISOString(),
          },
        },
      });

      // Realtime Notification: Outbox delivers to user, org and platform admin
      try {
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'blood_request.status_changed',
          entityType: 'BloodRequest',
          entityId: request.id,
          organisationId: metadata.assignedBankId || undefined,
          recipientUserId: request.requesterId,
          payload: {
            requestId: request.id,
            requestReference: `#${request.id.slice(0, 8)}`,
            status: finalOutcome,
            isFullyFulfilled,
            receivedUnitsCount,
            unitsRequested: request.unitsRequested,
            shortfallCount: remainingShortfall,
            confirmedByRole: metadata.confirmedByRole,
            timestamp: now.toISOString(),
          },
        });
      } catch {}

      return {
        success: true,
        message: isFullyFulfilled
          ? 'Blood request delivery confirmed and fulfilled successfully.'
          : `Delivery confirmed. Partially fulfilled (${receivedUnitsCount}/${request.unitsRequested} unit(s) received). Remaining shortfall: ${remainingShortfall} unit(s). Request remains open for further coordination.`,
        data: updated,
        isFullyFulfilled,
        shortfallCount: remainingShortfall,
      };
    }, { maxWait: 15000, timeout: 30000 });
  }

  /**
   * Phase 3: Blood Bank requests donor matching for the remaining shortfall.
   * Hard Rules:
   * 1. Shortfall must be > 0 (if shortfallCount === 0, rejection with 400 NO_SHORTFALL).
   * 2. Only authorized staff of the designated Blood Bank can request matching.
   * 3. Blood Bank cannot run donor search, choose scope, or see candidates before Admin release.
   * 4. Matching request is recorded with status 'REQUESTED'.
   * 5. Emits Outbox event 'blood_request.matching_requested' for org and admin.
   */
  static async requestDonorMatching(
    callerUserId: string,
    organisationId: string,
    requestId: string
  ): Promise<{
    success: boolean;
    message: string;
    matchingRequest: MatchingRequestMetadata;
  }> {
    return await prisma.$transaction(async (tx) => {
      // 1. Validate caller membership in organization
      const membership = await tx.organisationMembership.findFirst({
        where: {
          organisationId,
          userId: callerUserId,
          isActive: true,
        },
        include: { organisation: true },
      });

      if (!membership) {
        const error: any = new Error('Access denied: You do not have verified active membership in this organisation.');
        error.code = 'FORBIDDEN_ACCESS';
        error.statusCode = 403;
        throw error;
      }

      // 2. Fetch blood request
      const request = await tx.bloodRequest.findUnique({
        where: { id: requestId },
        include: { bloodCentre: true },
      });

      if (!request) {
        const error: any = new Error('Blood request not found.');
        error.code = 'REQUEST_NOT_FOUND';
        error.statusCode = 404;
        throw error;
      }

      // Check request status
      if (['CLOSED', 'CANCELLED', 'EXPIRED'].includes(request.status)) {
        const error: any = new Error(`Cannot request donor matching for a request in '${request.status}' status.`);
        error.code = 'INVALID_REQUEST_STATUS';
        error.statusCode = 400;
        throw error;
      }

      // 3. Verify organization routing with canonical designation check
      const metadata = parseRequestMessageMetadata(request.message, request.bloodCentre?.hospitalName);
      if (!HospitalIntegrationService.isRequestDesignatedToOrganisation(request, membership.organisation)) {
        const error: any = new Error('Access denied: Only the designated Blood Bank handling this request can request donor matching.');
        error.code = 'FORBIDDEN_ACCESS';
        error.statusCode = 403;
        throw error;
      }

      // 4. Calculate remaining shortfall
      const reservedCount = metadata.reservedUnitIds?.length || 0;
      const shortfallCount =
        metadata.shortfallCount !== undefined ? metadata.shortfallCount : Math.max(0, request.unitsRequested - reservedCount);

      if (shortfallCount <= 0) {
        const error: any = new Error('Donor matching cannot be requested when there is no remaining shortfall (request is fully covered by inventory).');
        error.code = 'NO_SHORTFALL';
        error.statusCode = 400;
        throw error;
      }

      // 5. Prevent duplicate active matching requests
      if (
        metadata.matchingRequest &&
        (metadata.matchingRequest.status === 'REQUESTED' ||
          metadata.matchingRequest.status === 'SEARCH_RUNNING' ||
          metadata.matchingRequest.status === 'AWAITING_ADMIN_REVIEW' ||
          metadata.matchingRequest.status === 'RELEASED')
      ) {
        const error: any = new Error(
          metadata.matchingRequest.status === 'RELEASED'
            ? 'Matching candidates have already been released for this request.'
            : 'A donor matching request is already in progress for this request.'
        );
        error.code = 'MATCHING_ALREADY_IN_PROGRESS';
        error.statusCode = 400;
        throw error;
      }

      const now = new Date();
      const matchingRequestId = `mr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const matchingReq: MatchingRequestMetadata = {
        id: matchingRequestId,
        requestedByUserId: callerUserId,
        requestingOrgId: organisationId,
        requestedShortfall: shortfallCount,
        status: 'REQUESTED',
        searchScope: 'EXACT_CENTRE',
        requestedAt: now.toISOString(),
      };

      metadata.matchingRequest = matchingReq;

      // 6. Persist updated metadata in blood request
      await tx.bloodRequest.update({
        where: { id: requestId },
        data: {
          message: JSON.stringify(metadata),
        },
      });

      // 7. Audit log
      await tx.auditLog.create({
        data: {
          userId: callerUserId,
          action: 'REQUEST_DONOR_MATCHING',
          resource: 'BloodRequest',
          resourceId: requestId,
          metadata: {
            matchingRequestId,
            organisationId,
            shortfallCount,
            requestedAt: now.toISOString(),
          },
        },
      }).catch(() => {});

      // 8. Publish Realtime Outbox Event
      try {
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'blood_request.matching_requested',
          entityType: 'BloodRequest',
          entityId: requestId,
          organisationId,
          payload: {
            matchingRequestId,
            requestId,
            requestingOrgId: organisationId,
            requestingOrgName: membership.organisation.name,
            shortfallCount,
            bloodGroup: request.bloodGroup,
            component: request.component,
            urgency: metadata.urgency || 'NORMAL',
            requestedAt: now.toISOString(),
          },
        });
      } catch {}

      return {
        success: true,
        message: `Donor matching requested for shortfall of ${shortfallCount} unit(s). Request submitted to System Administration for review and candidate release.`,
        matchingRequest: matchingReq,
      };
    }, { timeout: 25000, maxWait: 15000 });
  }

  /**
   * Phase 4: Blood Bank invites donor candidates released by System Administration.
   *
   * Hard Rules:
   * 1. Only verified active staff of the designated Blood Bank handling this request can invite donors.
   * 2. The blood request must be OPEN.
   * 3. Invitations can ONLY be sent to donor candidates explicitly approved & released by Platform Admin.
   * 4. Donors with active clinical deferrals, completed donation in last 90 days, or withdrawn consent are skipped.
   * 5. Directed to the accredited Blood Bank centre (NOT direct to patient / hospital).
   * 6. Transactional Outbox event 'blood_request.donor_invited' emitted for each invited donor.
   */
  static async inviteDonorCandidates(
    callerUserId: string,
    organisationId: string,
    requestId: string,
    donorIds: string[]
  ): Promise<{
    success: boolean;
    invitedCount: number;
    skippedCount: number;
    invitedDonorIds: string[];
    skippedDonorIds: string[];
    message: string;
  }> {
    if (!Array.isArray(donorIds) || donorIds.length === 0) {
      const error: any = new Error('donorIds must be a non-empty array of donor IDs.');
      error.code = 'INVALID_DONOR_IDS';
      error.statusCode = 400;
      throw error;
    }

    return await prisma.$transaction(async (tx) => {
      // 1. Validate caller membership in organization
      const membership = await tx.organisationMembership.findFirst({
        where: {
          organisationId,
          userId: callerUserId,
          isActive: true,
        },
        include: { organisation: true },
      });

      if (!membership) {
        const error: any = new Error('Access denied: You do not have verified active membership in this organisation.');
        error.code = 'FORBIDDEN_ACCESS';
        error.statusCode = 403;
        throw error;
      }

      // 2. Fetch blood request
      const request = await tx.bloodRequest.findUnique({
        where: { id: requestId },
        include: {
          bloodCentre: true,
          requester: { select: { id: true, name: true, phoneNumber: true } },
        },
      });

      if (!request) {
        const error: any = new Error('Blood request not found.');
        error.code = 'REQUEST_NOT_FOUND';
        error.statusCode = 404;
        throw error;
      }

      if (['CLOSED', 'CANCELLED', 'EXPIRED'].includes(request.status)) {
        const error: any = new Error(`Cannot invite donors for a request in '${request.status}' status.`);
        error.code = 'INVALID_REQUEST_STATUS';
        error.statusCode = 400;
        throw error;
      }

      // 3. Verify organization routing
      const metadata = parseRequestMessageMetadata(request.message, request.bloodCentre?.hospitalName);
      const isDesignatedBank =
        metadata.assignedBankId === organisationId ||
        request.hospitalCode === membership.organisation.hospitalCode ||
        request.hospitalCode === membership.organisation.orgCode ||
        request.hospitalCode === membership.organisation.id;

      if (!isDesignatedBank) {
        const error: any = new Error('Access denied: Only the designated Blood Bank handling this request can invite donors.');
        error.code = 'FORBIDDEN_ACCESS';
        error.statusCode = 403;
        throw error;
      }

      // 4. Verify that donor matching candidates have been released by Platform Admin
      const mr = metadata.matchingRequest;
      if (!mr || mr.status !== 'RELEASED') {
        const error: any = new Error('Cannot invite donors before candidate pool has been reviewed and released by System Administration.');
        error.code = 'CANDIDATES_NOT_RELEASED';
        error.statusCode = 400;
        throw error;
      }

      const releasedCandidateIds = new Set(mr.releasedCandidateIds || []);

      // 5. Guard against unreleased donor invitation attempts
      const invalidIds = donorIds.filter((id) => !releasedCandidateIds.has(id));
      if (invalidIds.length > 0) {
        const error: any = new Error('One or more requested donor IDs are not among the approved candidates released by Platform Admin.');
        error.code = 'UNRELEASED_DONOR_INVITATION';
        error.statusCode = 400;
        throw error;
      }

      // 6. Fetch target donors and verify current clinical eligibility
      const donors = await tx.donorProfile.findMany({
        where: {
          id: { in: donorIds },
          isAvailable: true,
          isSearchable: true,
          consentWithdrawnAt: null,
          user: { status: 'ACTIVE' },
        },
        include: {
          user: { select: { id: true, phoneNumber: true } },
        },
      });

      const donorUserIds = donors.map((d) => d.userId);
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      const recentDonations = await tx.donationEvent.findMany({
        where: {
          donorUserId: { in: donorUserIds },
          outcome: 'COMPLETED',
          performedAt: { gte: ninetyDaysAgo },
        },
        select: { donorUserId: true },
      });

      const deferredScreenings = await tx.clinicalScreening.findMany({
        where: {
          donorUserId: { in: donorUserIds },
          status: 'DEFERRED',
        },
        select: { donorUserId: true },
      });

      const recentDonorUserSet = new Set(recentDonations.map((d) => d.donorUserId));
      const deferredDonorUserSet = new Set(deferredScreenings.map((s) => s.donorUserId));

      const invitedDonorIds: string[] = [];
      const skippedDonorIds: string[] = [];
      const now = new Date();

      const centreName = request.bloodCentre?.hospitalName || membership.organisation.name;
      const centreAddress = request.bloodCentre?.address || 'Designated Accredited Blood Centre';
      const centrePhone = request.bloodCentre?.mobileNo || null;

      for (const donor of donors) {
        // Clinical Recovery & Deferral Gate
        const hasRecentVerified = donor.verifiedLastDonationDate && donor.verifiedLastDonationDate >= ninetyDaysAgo;
        const hasRecentSelfReported = donor.lastDonationDate && donor.lastDonationDate >= ninetyDaysAgo;
        const hasRecentEvent = recentDonorUserSet.has(donor.userId);
        const hasActiveDeferral = deferredDonorUserSet.has(donor.userId);

        if (hasRecentVerified || hasRecentSelfReported || hasRecentEvent || hasActiveDeferral) {
          skippedDonorIds.push(donor.id);
          continue;
        }

        // Prevent duplicate active invitation
        const existing = await tx.donorResponse.findUnique({
          where: {
            requestId_donorId: {
              requestId,
              donorId: donor.id,
            },
          },
        });

        if (existing && (existing.status === 'PENDING' || existing.status === 'ACCEPTED')) {
          skippedDonorIds.push(donor.id);
          continue;
        }

        const invitation = await tx.donorResponse.upsert({
          where: {
            requestId_donorId: {
              requestId,
              donorId: donor.id,
            },
          },
          create: {
            requestId,
            donorId: donor.id,
            status: 'PENDING',
          },
          update: {
            status: 'PENDING',
            respondedAt: null,
            disclosureAuthorized: false,
            contactDisclosedAt: null,
          },
        });

        invitedDonorIds.push(donor.id);

        // Transactional Outbox Event for Invited Donor
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'blood_request.donor_invited',
          recipientUserId: donor.userId,
          organisationId,
          entityType: 'DonorResponse',
          entityId: invitation.id,
          payload: {
            requestId,
            invitationId: invitation.id,
            donorId: donor.id,
            bloodGroup: request.bloodGroup,
            component: request.component,
            unitsRequested: request.unitsRequested,
            urgency: metadata.urgency || 'NORMAL',
            recommendedCentre: {
              hospitalName: centreName,
              address: centreAddress,
              phone: centrePhone,
            },
            donationInstructions:
              `Please coordinate voluntary donation through ${centreName} (${centreAddress}). DO NOT deliver blood directly to the patient or hospital ward.`,
            invitedAt: now.toISOString(),
          },
        });
      }

      // Update matching request metadata if any donors were invited
      if (invitedDonorIds.length > 0) {
        const existingInvited = new Set((metadata.matchingRequest as any)?.invitedCandidateIds || []);
        invitedDonorIds.forEach((id) => existingInvited.add(id));
        (metadata.matchingRequest as any).invitedCandidateIds = Array.from(existingInvited);
        (metadata.matchingRequest as any).lastInvitedAt = now.toISOString();

        await tx.bloodRequest.update({
          where: { id: requestId },
          data: {
            message: JSON.stringify(metadata),
          },
        });
      }

      // Audit Log
      await prisma.auditLog.create({
        data: {
          userId: callerUserId,
          action: 'BLOOD_BANK_INVITE_DONOR',
          resource: 'BloodRequest',
          resourceId: requestId,
          metadata: {
            organisationId,
            invitedCount: invitedDonorIds.length,
            skippedCount: skippedDonorIds.length,
            invitedDonorIds,
            skippedDonorIds,
          },
        },
      }).catch(() => {});

      return {
        success: true,
        invitedCount: invitedDonorIds.length,
        skippedCount: skippedDonorIds.length,
        invitedDonorIds,
        skippedDonorIds,
        message: `Successfully dispatched donation coordination invitations to ${invitedDonorIds.length} candidate(s).`,
      };
    }, { timeout: 25000, maxWait: 15000 });
  }

  /**
   * Record Blood Bank direct donor outreach attempt and response.
   * Status options: PENDING (Contacted / Awaiting), ACCEPTED, DECLINED, CANCELLED (Unreachable).
   */
  static async recordDonorOutreachResponse(
    callerUserId: string,
    organisationId: string,
    requestId: string,
    donorId: string,
    responseStatus: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED',
    notes?: string
  ) {
    return await prisma.$transaction(async (tx) => {
      // 1. Validate caller membership in organization
      const membership = await tx.organisationMembership.findFirst({
        where: {
          organisationId,
          userId: callerUserId,
          isActive: true,
        },
        include: { organisation: true },
      });

      if (!membership) {
        const error: any = new Error('Access denied: Active organisation membership required.');
        error.code = 'FORBIDDEN_ACCESS';
        error.statusCode = 403;
        throw error;
      }

      // 2. Fetch blood request
      const request = await tx.bloodRequest.findUnique({
        where: { id: requestId },
        include: { bloodCentre: true },
      });

      if (!request) {
        const error: any = new Error('Blood request not found.');
        error.code = 'REQUEST_NOT_FOUND';
        error.statusCode = 404;
        throw error;
      }

      // 3. Upsert or update donor response
      const isAccepted = responseStatus === 'ACCEPTED';
      const isDeclined = responseStatus === 'DECLINED';
      const now = new Date();

      const donor = await tx.donorProfile.findUnique({
        where: { id: donorId },
        include: { user: { select: { id: true, name: true, phoneNumber: true } } },
      });

      if (!donor) {
        const error: any = new Error('Donor candidate not found.');
        error.code = 'DONOR_NOT_FOUND';
        error.statusCode = 404;
        throw error;
      }

      const invitation = await tx.donorResponse.upsert({
        where: {
          requestId_donorId: {
            requestId,
            donorId,
          },
        },
        create: {
          requestId,
          donorId,
          status: responseStatus as any,
          respondedAt: isAccepted || isDeclined ? now : null,
          disclosureAuthorized: isAccepted,
          contactDisclosedAt: isAccepted ? now : null,
        },
        update: {
          status: responseStatus as any,
          respondedAt: isAccepted || isDeclined ? now : undefined,
          disclosureAuthorized: isAccepted,
          contactDisclosedAt: isAccepted ? now : undefined,
        },
      });

      // 4. Publish real-time event
      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'donor_invitation.response_changed',
        organisationId,
        entityType: 'DonorResponse',
        entityId: invitation.id,
        payload: {
          requestId,
          invitationId: invitation.id,
          donorId,
          status: responseStatus,
          respondedAt: invitation.respondedAt?.toISOString() || now.toISOString(),
          contactDisclosed: isAccepted,
          donorPhone: isAccepted && donor.user.phoneNumber ? donor.user.phoneNumber : null,
          donorName: isAccepted ? (donor.fullName || donor.user.name || 'Voluntary Donor') : 'Voluntary Donor',
          notes: notes || undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: callerUserId,
          action: 'BLOOD_BANK_DONOR_OUTREACH_RECORDED',
          resource: 'DonorResponse',
          resourceId: invitation.id,
          metadata: {
            organisationId,
            requestId,
            donorId,
            responseStatus,
            notes,
          },
        },
      }).catch(() => {});

      return {
        success: true,
        data: {
          invitationId: invitation.id,
          status: responseStatus,
          donorId,
          disclosureAuthorized: isAccepted,
          donorPhone: isAccepted ? donor.user.phoneNumber : null,
        },
        message: `Donor outreach recorded as '${responseStatus}'.`,
      };
    });
  }

  // ====================================================
  // PHASE 5: CLINICAL LIFECYCLE, INTAKE & TRACEABILITY
  // ====================================================

  /**
   * Helper: Retrieve or create an in-house facility session/camp for the Blood Bank organisation.
   */
  static async getOrCreateCentreFacilityCamp(tx: any, orgId: string, callerUserId?: string) {
    let camp = await tx.camp.findFirst({
      where: {
        organisationId: orgId,
        status: 'APPROVED',
        isReadyForCollection: true,
      },
    });

    if (!camp) {
      const org = await tx.organisation.findUnique({ where: { id: orgId } });
      if (!org) {
        throw new Error('Organisation not found.');
      }
      const code = `CENTRE-${org.orgCode || org.id.slice(0, 6).toUpperCase()}`;
      camp = await tx.camp.create({
        data: {
          campCode: code,
          title: `${org.name} - In-House Donation Centre`,
          organizerName: org.name,
          venue: org.name,
          targetDate: new Date(),
          status: 'APPROVED',
          isReadyForCollection: true,
          districtCode: org.districtCode || 1,
          stateCode: org.stateCode || 27,
          organisationId: org.id,
          hospitalCode: org.hospitalCode || null,
          createdById: callerUserId || org.applicantUserId || null,
        },
      });
    }

    if (callerUserId) {
      const existingAssignment = await tx.campStaffAssignment.findFirst({
        where: { campId: camp.id, userId: callerUserId, isActive: true },
      });
      if (!existingAssignment) {
        const callerMembership = await tx.organisationMembership.findFirst({
          where: { organisationId: orgId, userId: callerUserId, isActive: true },
        });
        const assignedRole =
          callerMembership?.role === 'CLINICAL_STAFF'
            ? 'CLINICAL_STAFF'
            : callerMembership?.role === 'COLLECTION_STAFF'
            ? 'COLLECTION_STAFF'
            : 'CAMP_ADMIN';

        await tx.campStaffAssignment.create({
          data: {
            campId: camp.id,
            userId: callerUserId,
            organisationId: orgId,
            role: assignedRole as any,
            assignedBy: callerUserId,
            isActive: true,
          },
        }).catch(() => {});
      }
    }

    return camp;
  }

  /**
   * 1. Donor Arrival & Identity Verification
   * Blood bank staff records donor arrival against an accepted request invitation.
   */
  static async recordDonorArrival(
    callerUserId: string,
    organisationId: string,
    requestId: string,
    donorId: string,
    verificationNotes?: string
  ): Promise<{
    success: boolean;
    attendanceId: string;
    campId: string;
    donorIntake: DonorIntakeRecordDTO;
    message: string;
  }> {
    return await prisma.$transaction(async (tx) => {
      // 1. Verify caller membership
      const membership = await tx.organisationMembership.findFirst({
        where: {
          organisationId,
          userId: callerUserId,
          isActive: true,
        },
        include: { organisation: true },
      });

      if (!membership) {
        const err: any = new Error('Access denied: You do not have verified active membership in this organisation.');
        err.statusCode = 403;
        throw err;
      }

      // 2. Fetch blood request
      const request = await tx.bloodRequest.findUnique({
        where: { id: requestId },
        include: {
          bloodCentre: true,
          requester: { select: { id: true, name: true, phoneNumber: true } },
        },
      });

      if (!request) {
        const err: any = new Error('Blood request not found.');
        err.statusCode = 404;
        throw err;
      }

      const metadata = parseRequestMessageMetadata(request.message, request.bloodCentre?.hospitalName);
      const isDesignatedBank =
        metadata.assignedBankId === organisationId ||
        request.hospitalCode === membership.organisation.hospitalCode ||
        request.hospitalCode === membership.organisation.orgCode ||
        request.hospitalCode === membership.organisation.id;

      if (!isDesignatedBank) {
        const err: any = new Error('Access denied: Only the designated Blood Bank handling this request can record donor arrival.');
        err.statusCode = 403;
        throw err;
      }

      // Prevent duplicate arrival
      if (metadata.donorIntake && metadata.donorIntake.donorId === donorId && metadata.donorIntake.intakeStatus) {
        const err: any = new Error('Donor arrival has already been recorded for this candidate.');
        err.statusCode = 400;
        throw err;
      }

      // 3. Verify donor response or released candidate membership
      let donorProfile = await tx.donorProfile.findUnique({
        where: { id: donorId },
        include: {
          user: { select: { id: true, name: true, phoneNumber: true } },
        },
      });

      if (!donorProfile) {
        const err: any = new Error('Donor profile not found.');
        err.statusCode = 404;
        throw err;
      }

      const releasedCandidateIds = metadata.matchingRequest?.releasedCandidateIds || [];
      const isReleasedCandidate = releasedCandidateIds.includes(donorId);

      const donorResponse = await tx.donorResponse.findUnique({
        where: {
          requestId_donorId: {
            requestId,
            donorId,
          },
        },
      });

      const isAcceptedOutreach = donorResponse?.status === 'ACCEPTED';

      if (!isReleasedCandidate && !isAcceptedOutreach) {
        const err: any = new Error(
          'Cannot record arrival: Donor must be a released candidate for this request or have accepted an outreach invitation.'
        );
        err.statusCode = 400;
        throw err;
      }

      const donorUserId = donorProfile.userId;

      // 4. Ensure facility camp exists
      const camp = await this.getOrCreateCentreFacilityCamp(tx, organisationId, callerUserId);

      // 5. Create or retrieve CampAttendance
      let attendance = await tx.campAttendance.findFirst({
        where: {
          campId: camp.id,
          userId: donorUserId,
        },
      });

      const now = new Date();
      if (!attendance) {
        attendance = await tx.campAttendance.create({
          data: {
            campId: camp.id,
            userId: donorUserId,
            donorProfileId: donorId,
            donorName: donorProfile.fullName || donorProfile.user.name || 'Voluntary Donor',
            donorPhone: donorProfile.user.phoneNumber || '',
            bloodGroup: donorProfile.bloodGroup,
            status: 'CHECKED_IN',
            checkedInAt: now,
            checkedInBy: callerUserId,
          },
        });
      } else {
        attendance = await tx.campAttendance.update({
          where: { id: attendance.id },
          data: {
            status: 'CHECKED_IN',
            checkedInAt: now,
            checkedInBy: callerUserId,
          },
        });
      }

      // 6. Update BloodRequest metadata
      const intakeRecord: DonorIntakeRecordDTO = {
        donorId,
        donorUserId,
        attendanceId: attendance.id,
        campId: camp.id,
        arrivedAt: now.toISOString(),
        arrivedById: callerUserId,
        verificationNotes: verificationNotes || null,
        intakeStatus: 'ARRIVED',
      };

      metadata.donorIntake = intakeRecord;
      await tx.bloodRequest.update({
        where: { id: requestId },
        data: {
          message: JSON.stringify(metadata),
        },
      });

      // 7. Transactional Outbox Events
      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'donor_intake.arrival_recorded',
        entityType: 'BloodRequest',
        entityId: requestId,
        organisationId,
        payload: {
          requestId,
          donorId,
          attendanceId: attendance.id,
          campId: camp.id,
          arrivedAt: intakeRecord.arrivedAt,
          intakeStatus: 'ARRIVED',
        },
      });

      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'donor_intake.arrival_recorded',
        entityType: 'BloodRequest',
        entityId: requestId,
        recipientUserId: donorUserId,
        payload: {
          requestId,
          attendanceId: attendance.id,
          intakeStatus: 'ARRIVED',
          message: `Arrival verified at ${membership.organisation.name}. Proceed to clinical screening.`,
        },
      });

      return {
        success: true,
        attendanceId: attendance.id,
        campId: camp.id,
        donorIntake: intakeRecord,
        message: 'Donor arrival and identity successfully verified.',
      };
    }, { timeout: 25000, maxWait: 15000 });
  }

  /**
   * Part 3: Verify Donor Identity & Send to Authorized Clinical Staff
   * - Confirms donor identity against released candidate
   * - Checks donation interval rules (minimum 90 days between donations)
   * - Updates status to PENDING_CLINICAL_SCREENING
   * - Clinical assessment remains restricted to authorized CLINICAL_STAFF
   */
  static async verifyDonorAndHandoff(
    callerUserId: string,
    organisationId: string,
    requestId: string,
    donorId: string,
    verificationNotes?: string
  ) {
    return await prisma.$transaction(async (tx) => {
      // 1. Verify caller membership
      const membership = await tx.organisationMembership.findFirst({
        where: {
          organisationId,
          userId: callerUserId,
          isActive: true,
        },
        include: { organisation: true },
      });

      if (!membership) {
        const err: any = new Error('Access denied: You do not have verified active membership in this organisation.');
        err.statusCode = 403;
        throw err;
      }

      // 2. Fetch blood request
      const request = await tx.bloodRequest.findUnique({
        where: { id: requestId },
        include: { bloodCentre: true },
      });

      if (!request) {
        const err: any = new Error('Blood request not found.');
        err.statusCode = 404;
        throw err;
      }

      if (!HospitalIntegrationService.isRequestDesignatedToOrganisation(request, membership.organisation)) {
        const err: any = new Error('Access denied: Only the designated Blood Bank can verify and handoff donors.');
        err.statusCode = 403;
        throw err;
      }

      const metadata = parseRequestMessageMetadata(request.message, request.bloodCentre?.hospitalName);

      if (!metadata.donorIntake || metadata.donorIntake.donorId !== donorId) {
        const err: any = new Error('Donor must be marked as arrived before verification and clinical handoff.');
        err.statusCode = 400;
        throw err;
      }

      // 3. Fetch donor profile and check last donation interval
      const donor = await tx.donorProfile.findUnique({
        where: { id: donorId },
        include: {
          user: {
            include: {
              donationEvents: {
                where: { outcome: 'COMPLETED' },
                orderBy: { performedAt: 'desc' },
                take: 1,
              },
            },
          },
        },
      });

      if (!donor) {
        const err: any = new Error('Donor profile not found.');
        err.statusCode = 404;
        throw err;
      }

      const lastDonation =
        donor.user.donationEvents[0]?.performedAt ||
        donor.verifiedLastDonationDate ||
        donor.lastDonationDate;

      if (lastDonation) {
        const daysSinceLast = (Date.now() - new Date(lastDonation).getTime()) / (24 * 60 * 60 * 1000);
        if (daysSinceLast < 90) {
          const err: any = new Error(
            `Clinical Rule Violation: Minimum interval of 90 days required between whole blood donations. Last donation was ${Math.round(daysSinceLast)} days ago.`
          );
          err.statusCode = 400;
          throw err;
        }
      }

      const now = new Date();
      metadata.donorIntake.intakeStatus = 'SCREENING_IN_PROGRESS';
      (metadata.donorIntake as any).verifiedAt = now.toISOString();
      (metadata.donorIntake as any).verifiedById = callerUserId;
      metadata.donorIntake.verificationNotes =
        verificationNotes || 'Identity verified against government photo ID; forwarded to Clinical Staff.';

      await tx.bloodRequest.update({
        where: { id: requestId },
        data: {
          message: JSON.stringify(metadata),
        },
      });

      await tx.auditLog.create({
        data: {
          userId: callerUserId,
          action: 'DONOR_VERIFIED_CLINICAL_HANDOFF',
          resource: 'BloodRequest',
          resourceId: requestId,
          metadata: {
            donorId,
            donorUserId: donor.userId,
            verifiedAt: now.toISOString(),
            verificationNotes: metadata.donorIntake.verificationNotes,
          },
        },
      });

      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'camp.attendance_checked_in',
        entityType: 'BloodRequest',
        entityId: requestId,
        organisationId,
        payload: {
          requestId,
          donorId,
          intakeStatus: 'SCREENING_IN_PROGRESS',
          verifiedAt: now.toISOString(),
          handoffTo: 'CLINICAL_STAFF',
        },
      });

      return {
        success: true,
        message: 'Donor identity successfully verified and handed off to authorized Clinical Staff for medical screening.',
        donorIntake: metadata.donorIntake,
      };
    }, { timeout: 25000, maxWait: 15000 });
  }

  /**
   * 2. Authorized Clinical Assessment
   * STRICT ROLE BOUNDARY: Only CLINICAL_STAFF can record screening & eligibility decisions.
   */
  static async recordIntakeClinicalScreening(
    callerUserId: string,
    organisationId: string,
    requestId: string,
    input: RecordIntakeClinicalScreeningInput
  ) {
    // 1. Verify caller membership & STRICT CLINICAL ROLE GATE
    const membership = await prisma.organisationMembership.findFirst({
      where: {
        organisationId,
        userId: callerUserId,
        isActive: true,
      },
      include: { organisation: true },
    });

    const user = await prisma.user.findUnique({ where: { id: callerUserId } });
    const isClinicalStaff = membership?.role === 'CLINICAL_STAFF';
    const isSystemAdmin = user?.role === 'ADMIN';

    if (!isClinicalStaff && !isSystemAdmin) {
      const err: any = new Error(
        'Permission denied: Clinical assessment strictly requires authorized CLINICAL_STAFF role. Organisation administrators without designated clinical authority cannot perform clinical screenings.'
      );
      err.statusCode = 403;
      throw err;
    }

    const request = await prisma.bloodRequest.findUnique({
      where: { id: requestId },
      include: { bloodCentre: true },
    });

    if (!request) {
      const err: any = new Error('Blood request not found.');
      err.statusCode = 404;
      throw err;
    }

    const metadata = parseRequestMessageMetadata(request.message, request.bloodCentre?.hospitalName);
    if (!metadata.donorIntake || metadata.donorIntake.attendanceId !== input.attendanceId) {
      const err: any = new Error('No matching donor intake attendance record found for this request.');
      err.statusCode = 400;
      throw err;
    }

    const callerUser = {
      id: callerUserId,
      role: user?.role || 'STAFF',
      name: user?.name || null,
      phoneNumber: user?.phoneNumber,
    };

    // Ensure staff assignment for clinical role on camp
    await prisma.campStaffAssignment.upsert({
      where: {
        userId_campId_role: {
          userId: callerUserId,
          campId: metadata.donorIntake.campId,
          role: 'CLINICAL_STAFF',
        },
      },
      create: {
        userId: callerUserId,
        campId: metadata.donorIntake.campId,
        organisationId,
        role: 'CLINICAL_STAFF',
        assignedBy: callerUserId,
        isActive: true,
      },
      update: { isActive: true },
    }).catch(() => {});

    // 2. Delegate to authoritative CampOperationsService
    const screening = await CampOperationsService.recordClinicalScreening(
      metadata.donorIntake.campId,
      input.attendanceId,
      callerUser,
      {
        consentVersion: input.consentVersion || 'v1.0',
        consentGiven: input.consentGiven,
        eligibilityDecision: input.eligibilityDecision,
        deferralCategory: input.deferralCategory,
        deferralDurationDays: input.deferralDurationDays,
        clinicalNotes: input.clinicalNotes,
      }
    );

    // 3. Update request metadata
    metadata.donorIntake.screeningId = screening.id;
    metadata.donorIntake.eligibilityDecision = input.eligibilityDecision;
    metadata.donorIntake.clinicalNotes = input.clinicalNotes || undefined;
    metadata.donorIntake.intakeStatus =
      input.eligibilityDecision === 'CLEARED' ? 'CLEARED' : 'DEFERRED';

    await prisma.bloodRequest.update({
      where: { id: requestId },
      data: {
        message: JSON.stringify(metadata),
      },
    });

    // 4. Real-time updates via Outbox
    await RealtimeService.publishOutboxEvent(prisma, {
      eventType: 'clinical_assessment.completed',
      entityType: 'BloodRequest',
      entityId: requestId,
      organisationId,
      payload: {
        requestId,
        attendanceId: input.attendanceId,
        screeningId: screening.id,
        eligibilityDecision: input.eligibilityDecision,
        intakeStatus: metadata.donorIntake.intakeStatus,
        message: `Clinical assessment completed: ${input.eligibilityDecision}`,
      },
    });

    return {
      success: true,
      screening,
      intakeStatus: metadata.donorIntake.intakeStatus,
      message: `Clinical assessment recorded successfully: ${input.eligibilityDecision}`,
    };
  }

  /**
   * 3. Phlebotomy Collection & Component Derivation
   * STRICT ROLE BOUNDARY: Only COLLECTION_STAFF or ORG_ADMIN can record collection.
   * INVARIANT: Donor must have CLEARED clinical screening.
   */
  static async recordIntakeCollectionAndComponent(
    callerUserId: string,
    organisationId: string,
    requestId: string,
    input: RecordIntakeCollectionInput
  ) {
    const membership = await prisma.organisationMembership.findFirst({
      where: {
        organisationId,
        userId: callerUserId,
        isActive: true,
      },
      include: { organisation: true },
    });

    const user = await prisma.user.findUnique({ where: { id: callerUserId } });
    const isCollectionStaff = membership?.role === 'COLLECTION_STAFF' || membership?.role === 'ORG_ADMIN';
    const isSystemAdmin = user?.role === 'ADMIN';

    if (!isCollectionStaff && !isSystemAdmin) {
      const err: any = new Error(
        'Permission denied: Phlebotomy collection requires authorized COLLECTION_STAFF role.'
      );
      err.statusCode = 403;
      throw err;
    }

    const request = await prisma.bloodRequest.findUnique({
      where: { id: requestId },
      include: { bloodCentre: true },
    });

    if (!request) {
      const err: any = new Error('Blood request not found.');
      err.statusCode = 404;
      throw err;
    }

    const metadata = parseRequestMessageMetadata(request.message, request.bloodCentre?.hospitalName);
    if (!metadata.donorIntake || metadata.donorIntake.attendanceId !== input.attendanceId) {
      const err: any = new Error('No matching donor intake attendance record found for this request.');
      err.statusCode = 400;
      throw err;
    }

    // INVARIANT CHECK: Donor must be clinically screened and CLEARED
    const attendance = await prisma.campAttendance.findUnique({
      where: { id: input.attendanceId },
      include: { screening: true },
    });

    if (!attendance || !attendance.screening || attendance.screening.eligibilityDecision !== 'CLEARED') {
      const err: any = new Error(
        'Cannot collect blood: Donor has not been clinically screened and CLEARED by medical personnel.'
      );
      err.statusCode = 400;
      throw err;
    }

    const callerUser = {
      id: callerUserId,
      role: user?.role || 'STAFF',
      name: user?.name || null,
      phoneNumber: user?.phoneNumber,
    };

    // Ensure staff assignment for collection role on camp
    await prisma.campStaffAssignment.upsert({
      where: {
        userId_campId_role: {
          userId: callerUserId,
          campId: metadata.donorIntake.campId,
          role: 'COLLECTION_STAFF',
        },
      },
      create: {
        userId: callerUserId,
        campId: metadata.donorIntake.campId,
        organisationId,
        role: 'COLLECTION_STAFF',
        assignedBy: callerUserId,
        isActive: true,
      },
      update: { isActive: true },
    }).catch(() => {});

    // 1. Record completed DonationEvent
    const donationEvent = await CampOperationsService.recordDonationEvent(
      metadata.donorIntake.campId,
      input.attendanceId,
      callerUser,
      {
        bloodGroup: input.bloodGroup,
        outcome: 'COMPLETED',
        volumeMl: input.volumeMl || 350,
        notes: input.notes,
      }
    );

    // 2. Create CollectionUnit (Source Bag)
    const collectionUnit = await TraceabilityService.createCollectionUnit(callerUser, {
      donationEventId: donationEvent.id,
      bagIdentifier: input.bagIdentifier,
      volumeMl: input.volumeMl || 350,
      notes: input.notes,
    });

    // 3. Derive Component Unit (starts in QUARANTINED status)
    const compType = input.componentType || (mapComponentStringToType(request.component) as any) || 'PRBC';
    const derivedResult = await TraceabilityService.deriveComponents(
      collectionUnit.id,
      callerUser,
      {
        components: [
          {
            componentType: compType,
            volumeMl: input.volumeMl ? Math.round(input.volumeMl * 0.7) : 250,
            notes: `Derived component for patient blood request #${request.id.slice(0, 8)}`,
          },
        ],
      }
    );

    const derivedComp = derivedResult[0];

    // 4. Update request metadata
    metadata.donorIntake.collectionUnitId = collectionUnit.id;
    metadata.donorIntake.componentUnitId = derivedComp.id;
    metadata.donorIntake.unitNumber = collectionUnit.unitNumber;
    metadata.donorIntake.componentCode = derivedComp.componentCode;
    metadata.donorIntake.intakeStatus = 'COLLECTION_COMPLETED';

    await prisma.bloodRequest.update({
      where: { id: requestId },
      data: {
        message: JSON.stringify(metadata),
      },
    });

    // 5. Real-time updates via Outbox
    await RealtimeService.publishOutboxEvent(prisma, {
      eventType: 'blood_collection.completed',
      entityType: 'BloodRequest',
      entityId: requestId,
      organisationId,
      payload: {
        requestId,
        collectionUnitId: collectionUnit.id,
        unitNumber: collectionUnit.unitNumber,
        componentUnitId: derivedComp.id,
        componentCode: derivedComp.componentCode,
        status: derivedComp.status,
        message: `Phlebotomy collection completed: Unit ${collectionUnit.unitNumber} quarantined for testing.`,
      },
    });

    return {
      success: true,
      donationEvent,
      collectionUnit,
      componentUnit: derivedComp,
      message: 'Blood collection and component derivation completed successfully. Component unit is in quarantine awaiting mandatory safety testing.',
    };
  }

  /**
   * 4. Allocate Clinically Released Component to Request Shortfall
   */
  static async allocateReleasedComponentToRequest(
    callerUserId: string,
    organisationId: string,
    requestId: string,
    componentUnitId: string
  ) {
    return await this.acceptAndReserveRequest(
      callerUserId,
      organisationId,
      requestId,
      [componentUnitId]
    );
  }

  /**
   * 5. End-to-End Request Traceability Lineage
   */
  static async getBloodRequestTraceability(
    callerUserId: string,
    organisationId: string,
    requestId: string
  ): Promise<TraceabilityLineageDTO> {
    const membership = await prisma.organisationMembership.findFirst({
      where: {
        organisationId,
        userId: callerUserId,
        isActive: true,
      },
      include: { organisation: true },
    });

    const user = await prisma.user.findUnique({ where: { id: callerUserId } });
    if (!membership && user?.role !== 'ADMIN') {
      const err: any = new Error('Access denied: You do not have verified active membership in this organisation.');
      err.statusCode = 403;
      throw err;
    }

    const request = await prisma.bloodRequest.findUnique({
      where: { id: requestId },
      include: {
        bloodCentre: true,
        requester: { select: { id: true, name: true, phoneNumber: true } },
        recipientResponses: {
          select: {
            donorId: true,
            status: true,
            respondedAt: true,
            disclosureAuthorized: true,
          },
        },
        hospitalIssueOrders: {
          include: {
            items: {
              include: {
                componentUnit: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!request) {
      const err: any = new Error('Blood request not found.');
      err.statusCode = 404;
      throw err;
    }

    const metadata = parseRequestMessageMetadata(request.message, request.bloodCentre?.hospitalName);

    // Fetch clinical screening if present
    let clinicalScreening = null;
    if (metadata.donorIntake?.screeningId) {
      clinicalScreening = await prisma.clinicalScreening.findUnique({
        where: { id: metadata.donorIntake.screeningId },
      });
    }

    // Fetch collection unit if present
    let collectionUnit = null;
    if (metadata.donorIntake?.collectionUnitId) {
      collectionUnit = await prisma.collectionUnit.findUnique({
        where: { id: metadata.donorIntake.collectionUnitId },
      });
    }

    // Fetch component unit if present
    let componentUnit = null;
    if (metadata.donorIntake?.componentUnitId) {
      componentUnit = await prisma.componentUnit.findUnique({
        where: { id: metadata.donorIntake.componentUnitId },
      });
    }

    // Fetch laboratory tests
    const laboratoryTests = await prisma.laboratoryTestRecord.findMany({
      where: {
        OR: [
          ...(metadata.donorIntake?.collectionUnitId ? [{ collectionUnitId: metadata.donorIntake.collectionUnitId }] : []),
          ...(metadata.donorIntake?.componentUnitId ? [{ componentUnitId: metadata.donorIntake.componentUnitId }] : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    // Fetch clinical release record
    let clinicalRelease = null;
    if (metadata.donorIntake?.componentUnitId) {
      clinicalRelease = await prisma.clinicalReleaseRecord.findFirst({
        where: { componentUnitId: metadata.donorIntake.componentUnitId },
        orderBy: { decisionTimestamp: 'desc' },
      });
    }

    const latestIssueOrder = request.hospitalIssueOrders[0] || null;

    return {
      request: {
        id: request.id,
        bloodGroup: request.bloodGroup,
        component: request.component,
        unitsRequested: request.unitsRequested,
        allocatedUnitsCount: metadata.allocatedUnitsCount || 0,
        shortfallCount: metadata.shortfallCount ?? request.unitsRequested,
        urgency: metadata.urgency || 'NORMAL',
        status: request.status,
        hospitalName: metadata.hospitalName,
        hospitalCode: request.hospitalCode,
        createdAt: request.createdAt.toISOString(),
      },
      matching: metadata.matchingRequest
        ? {
            status: metadata.matchingRequest.status,
            searchScope: metadata.matchingRequest.searchScope,
            releasedAt: metadata.matchingRequest.releasedAt,
            releasedCandidatesCount: metadata.matchingRequest.releasedCandidateIds?.length || 0,
          }
        : undefined,
      invitations: request.recipientResponses.map((r) => ({
        donorId: r.donorId,
        status: r.status,
        respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null,
        disclosureAuthorized: r.disclosureAuthorized,
      })),
      donorIntake: metadata.donorIntake || null,
      clinicalScreening: clinicalScreening
        ? {
            id: clinicalScreening.id,
            eligibilityDecision: clinicalScreening.eligibilityDecision || clinicalScreening.status,
            consentGiven: clinicalScreening.consentGiven,
            consentVersion: clinicalScreening.consentVersion,
            screenedBy: clinicalScreening.screenedBy,
            deferralCategory: clinicalScreening.deferralCategory,
            deferralDurationDays: clinicalScreening.deferralDurationDays,
            clinicalNotes: clinicalScreening.clinicalNotes,
            createdAt: clinicalScreening.createdAt.toISOString(),
          }
        : null,
      collectionUnit: collectionUnit
        ? {
            id: collectionUnit.id,
            unitNumber: collectionUnit.unitNumber,
            bloodGroup: collectionUnit.bloodGroup,
            volumeMl: collectionUnit.volumeMl,
            status: collectionUnit.status,
            collectedAt: collectionUnit.collectedAt.toISOString(),
            collectedBy: collectionUnit.collectedBy,
          }
        : null,
      laboratoryTests: laboratoryTests.map((t) => ({
        id: t.id,
        testType: t.testType,
        category: t.category,
        resultOutcome: t.resultOutcome,
        status: t.status,
        verifiedAt: t.verifiedAt ? t.verifiedAt.toISOString() : null,
        verifiedBy: t.verifiedById,
      })),
      clinicalRelease: clinicalRelease
        ? {
            id: clinicalRelease.id,
            decision: clinicalRelease.decision,
            reason: clinicalRelease.reason,
            clinicalProtocolRef: clinicalRelease.clinicalProtocolRef,
            decisionTimestamp: clinicalRelease.decisionTimestamp.toISOString(),
            authorizedClinicalUserId: clinicalRelease.authorizedClinicalUserId,
          }
        : null,
      componentUnit: componentUnit
        ? {
            id: componentUnit.id,
            componentCode: componentUnit.componentCode,
            componentType: componentUnit.componentType,
            bloodGroup: componentUnit.bloodGroup,
            status: componentUnit.status,
            expiresAt: componentUnit.expiresAt.toISOString(),
            derivedAt: componentUnit.derivedAt.toISOString(),
          }
        : null,
      hospitalIssueOrder: latestIssueOrder
        ? {
            id: latestIssueOrder.id,
            orderNumber: latestIssueOrder.orderNumber,
            status: latestIssueOrder.status,
            authorisedAt: latestIssueOrder.authorisedAt.toISOString(),
            dispatchedAt: latestIssueOrder.dispatchedAt ? latestIssueOrder.dispatchedAt.toISOString() : null,
            receivedAt: latestIssueOrder.receivedAt ? latestIssueOrder.receivedAt.toISOString() : null,
            transportDetails: latestIssueOrder.transportDetails,
          }
        : null,
      dualReceiptConfirmation: {
        isPatientAcknowledged: Boolean(metadata.patientAcknowledgedAt),
        patientAcknowledgedAt: metadata.patientAcknowledgedAt || null,
        isHospitalReceived: Boolean(latestIssueOrder?.receivedAt),
        hospitalReceivedAt: latestIssueOrder?.receivedAt ? latestIssueOrder.receivedAt.toISOString() : null,
        receiptNotes: metadata.receiptNotes || metadata.patientAcknowledgementNotes || null,
      },
    };
  }
}

