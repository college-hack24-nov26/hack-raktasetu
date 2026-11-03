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
}
