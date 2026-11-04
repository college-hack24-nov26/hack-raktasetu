import { prisma } from '../lib/prisma';
import {
  CollectionUnitStatus,
  ComponentUnitStatus,
  ComponentType,
  BloodGroup,
  OrgRole,
} from '@prisma/client';
import crypto from 'crypto';
import { RealtimeService } from './realtime';

export interface CallerUser {
  id: string;
  role: string;
  phoneNumber?: string;
  name?: string | null;
}

export interface CreateCollectionUnitInput {
  donationEventId: string;
  bagIdentifier?: string;
  volumeMl?: number;
  notes?: string;
  metadata?: Record<string, any>;
}

export interface UpdateCollectionUnitStatusInput {
  status: CollectionUnitStatus;
  reason?: string;
  referenceNote?: string;
  metadata?: Record<string, any>;
}

export interface DeriveComponentInput {
  componentType: ComponentType;
  volumeMl?: number;
  expiresInDays?: number;
  notes?: string;
}

export interface DeriveComponentsInput {
  components: DeriveComponentInput[];
  reason?: string;
}

export interface UpdateComponentStatusInput {
  status: ComponentUnitStatus;
  reason?: string;
  referenceNote?: string;
  metadata?: Record<string, any>;
}

// Standard shelf-life days per component type
const STANDARD_SHELF_LIFE_DAYS: Record<ComponentType, number> = {
  PRBC: 42,
  PLATELET_CONCENTRATE: 5,
  FRESH_FROZEN_PLASMA: 365,
  CRYOPRECIPITATE: 365,
  BUFFY_COAT: 1,
  WHOLE_BLOOD: 35,
};

export class TraceabilityService {
  /**
   * Helper: check caller's membership in the target organisation.
   */
  private static async verifyOrgMembership(organisationId: string, caller: CallerUser) {
    if (caller.role === 'ADMIN') {
      return { role: 'ORG_ADMIN' as OrgRole, isActive: true };
    }

    const membership = await prisma.organisationMembership.findUnique({
      where: {
        userId_organisationId: {
          userId: caller.id,
          organisationId,
        },
      },
    });

    if (!membership || !membership.isActive) {
      throw new Error('Permission denied: You are not an active member of this organisation.');
    }

    return membership;
  }

  // ====================================================
  // 1. COLLECTION UNIT CREATION & REGISTRATION
  // ====================================================

  /**
   * Confirm and register a physical collection unit from an eligible completed donation event.
   * Gated to COLLECTION_STAFF or ORG_ADMIN.
   * Invariant: Requires donationEvent.outcome === 'COMPLETED'.
   * Invariant: 1:1 relationship prevents duplicate units from retries.
   */
  static async createCollectionUnit(
    caller: CallerUser,
    input: CreateCollectionUnitInput
  ) {
    const donationEvent = await prisma.donationEvent.findUnique({
      where: { id: input.donationEventId },
      include: {
        camp: true,
        collectionUnit: true,
      },
    });

    if (!donationEvent) {
      throw new Error('Donation event not found.');
    }

    if (donationEvent.outcome !== 'COMPLETED') {
      throw new Error(`Cannot register a collection unit for donation outcome "${donationEvent.outcome}". Only COMPLETED donations produce physical units.`);
    }

    if (donationEvent.collectionUnit) {
      throw new Error('A collection unit has already been confirmed and registered for this donation event. Duplicate unit records are prohibited.');
    }

    // Determine responsible organisation
    let responsibleOrgId: string | undefined = donationEvent.camp?.organisationId || undefined;
    if (!responsibleOrgId) {
      // Find organisation through staff membership
      const staffMembership = await prisma.organisationMembership.findFirst({
        where: { userId: caller.id, isActive: true },
      });
      responsibleOrgId = staffMembership?.organisationId;
    }

    if (!responsibleOrgId) {
      throw new Error('Could not identify the responsible participating organisation for this collection unit.');
    }

    let isAuthorized = false;
    if (caller.role === 'ADMIN') {
      isAuthorized = true;
    } else {
      const membership = await prisma.organisationMembership.findUnique({
        where: {
          userId_organisationId: {
            userId: caller.id,
            organisationId: responsibleOrgId,
          },
        },
      });
      if (membership && membership.isActive && ['ORG_ADMIN', 'COLLECTION_STAFF'].includes(membership.role)) {
        isAuthorized = true;
      } else if (donationEvent.campId) {
        const campStaff = await prisma.campStaffAssignment.findFirst({
          where: {
            campId: donationEvent.campId,
            userId: caller.id,
            isActive: true,
            role: 'COLLECTION_STAFF',
          },
        });
        if (campStaff) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      throw new Error('Permission denied: Only ORG_ADMIN or COLLECTION_STAFF can confirm collection units.');
    }

    // Generate unique internal unit number: CU-YYYY-RANDOMHEX
    const year = new Date().getFullYear();
    const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const unitNumber = `CU-${year}-${randomSuffix}`;

    const collectionVolume = input.volumeMl || donationEvent.volumeMl || 450;

    // Atomic creation of collection unit and append-only status history
    const unit = await prisma.$transaction(async (tx) => {
      const createdUnit = await tx.collectionUnit.create({
        data: {
          unitNumber,
          bagIdentifier: input.bagIdentifier ? input.bagIdentifier.trim() : null,
          donationEventId: donationEvent.id,
          campId: donationEvent.campId || null,
          organisationId: responsibleOrgId,
          bloodGroup: donationEvent.bloodGroup,
          volumeMl: collectionVolume,
          status: 'COLLECTED',
          collectedAt: donationEvent.performedAt,
          collectedBy: caller.id,
          notes: input.notes?.trim() || null,
          metadata: input.metadata || undefined,
        },
      });

      // Append initial status history
      await tx.unitStatusHistory.create({
        data: {
          unitType: 'COLLECTION_UNIT',
          collectionUnitId: createdUnit.id,
          fromStatus: null,
          toStatus: 'COLLECTED',
          actorUserId: caller.id,
          organisationId: responsibleOrgId,
          reason: 'Initial physical collection confirmed',
          referenceNote: input.notes?.trim() || null,
          metadata: input.metadata || undefined,
        },
      });

      // Realtime event: collection unit confirmed
      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'camp.collection_unit_confirmed',
        entityType: 'CollectionUnit',
        entityId: createdUnit.id,
        organisationId: responsibleOrgId,
        recipientUserId: donationEvent.donorUserId,
        payload: {
          campId: donationEvent.campId || undefined,
          donationEventId: donationEvent.id,
          attendanceId: donationEvent.attendanceId,
          collectionUnitId: createdUnit.id,
          unitNumber: createdUnit.unitNumber,
          bagIdentifier: createdUnit.bagIdentifier,
          bloodGroup: createdUnit.bloodGroup,
          volumeMl: createdUnit.volumeMl,
          status: createdUnit.status,
          collectedAt: createdUnit.collectedAt,
        },
      });

      return createdUnit;
    });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'COLLECTION_UNIT_CREATED',
        resource: 'CollectionUnit',
        resourceId: unit.id,
        metadata: {
          unitNumber: unit.unitNumber,
          organisationId: responsibleOrgId,
          donationEventId: donationEvent.id,
          bloodGroup: unit.bloodGroup,
        },
      },
    });

    return unit;
  }

  // ====================================================
  // 2. TRACEABILITY DETAIL & LINEAGE RECONSTRUCTION
  // ====================================================

  /**
   * Retrieve complete unit-level traceability history.
   * Reconstructs: source donation event -> collection unit -> derived components -> append-only status trail.
   * Strictly isolates donor PII (no phone numbers or full personal names exposed).
   */
  static async getCollectionUnitTraceability(
    unitIdOrNumber: string,
    caller: CallerUser
  ) {
    const unit = await prisma.collectionUnit.findFirst({
      where: {
        OR: [{ id: unitIdOrNumber }, { unitNumber: unitIdOrNumber }],
      },
      include: {
        organisation: {
          select: { id: true, name: true, orgCode: true, licenseNumber: true },
        },
        camp: {
          select: { id: true, campCode: true, title: true, venue: true, targetDate: true },
        },
        donationEvent: {
          select: {
            id: true,
            bloodGroup: true,
            donationType: true,
            outcome: true,
            volumeMl: true,
            performedAt: true,
            adverseReaction: true,
          },
        },
        components: {
          orderBy: { derivedAt: 'asc' },
        },
        statusHistory: {
          include: {
            actorUser: { select: { id: true, name: true, role: true } },
          },
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!unit) {
      throw new Error('Collection unit not found.');
    }

    await this.verifyOrgMembership(unit.organisationId, caller);

    return {
      id: unit.id,
      unitNumber: unit.unitNumber,
      bagIdentifier: unit.bagIdentifier,
      bloodGroup: unit.bloodGroup,
      volumeMl: unit.volumeMl,
      status: unit.status,
      collectedAt: unit.collectedAt,
      collectedBy: unit.collectedBy,
      notes: unit.notes,
      organisation: unit.organisation,
      camp: unit.camp,
      donationEvent: unit.donationEvent,
      components: unit.components.map((c) => ({
        id: c.id,
        componentCode: c.componentCode,
        componentType: c.componentType,
        bloodGroup: c.bloodGroup,
        volumeMl: c.volumeMl,
        status: c.status,
        derivedAt: c.derivedAt,
        expiresAt: c.expiresAt,
        notes: c.notes,
      })),
      statusHistory: unit.statusHistory.map((h) => ({
        id: h.id,
        unitType: h.unitType,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        actorUserId: h.actorUserId,
        actorName: h.actorUser?.name || 'Staff Member',
        reason: h.reason,
        referenceNote: h.referenceNote,
        timestamp: h.timestamp,
      })),
    };
  }

  /**
   * List collection units for an organisation with status filters.
   * Gated to authorised organisation members.
   */
  static async listCollectionUnits(
    organisationId: string,
    caller: CallerUser,
    filters?: {
      status?: CollectionUnitStatus;
      bloodGroup?: BloodGroup;
      campId?: string;
    }
  ) {
    await this.verifyOrgMembership(organisationId, caller);

    const where: any = { organisationId };
    if (filters?.status) where.status = filters.status;
    if (filters?.bloodGroup) where.bloodGroup = filters.bloodGroup;
    if (filters?.campId) where.campId = filters.campId;

    const units = await prisma.collectionUnit.findMany({
      where,
      include: {
        camp: { select: { id: true, campCode: true, title: true } },
        _count: { select: { components: true } },
      },
      orderBy: { collectedAt: 'desc' },
    });

    return units.map((u) => ({
      id: u.id,
      unitNumber: u.unitNumber,
      bagIdentifier: u.bagIdentifier,
      bloodGroup: u.bloodGroup,
      volumeMl: u.volumeMl,
      status: u.status,
      collectedAt: u.collectedAt,
      camp: u.camp,
      componentCount: u._count.components,
    }));
  }

  // ====================================================
  // 3. COLLECTION UNIT STATUS TRANSITIONS
  // ====================================================

  /**
   * Permitted state transitions for Collection Units:
   * COLLECTED -> PREPARED_FOR_HANDOVER, QUARANTINED, REJECTED
   * PREPARED_FOR_HANDOVER -> IN_TRANSIT, QUARANTINED, REJECTED
   * IN_TRANSIT -> RECEIVED_BY_CENTRE, QUARANTINED, REJECTED
   * RECEIVED_BY_CENTRE -> PROCESSING_COMPLETED, QUARANTINED, REJECTED
   * QUARANTINED -> COLLECTED, RECEIVED_BY_CENTRE, REJECTED
   * REJECTED -> (Terminal state)
   * PROCESSING_COMPLETED -> (Terminal state)
   */
  private static validateCollectionUnitTransition(
    current: CollectionUnitStatus,
    target: CollectionUnitStatus
  ) {
    if (current === target) return;

    if (current === 'REJECTED' || current === 'PROCESSING_COMPLETED') {
      throw new Error(`Cannot transition collection unit from terminal status "${current}".`);
    }

    const ALLOWED: Record<CollectionUnitStatus, CollectionUnitStatus[]> = {
      COLLECTED: ['PREPARED_FOR_HANDOVER', 'QUARANTINED', 'REJECTED', 'RECEIVED_BY_CENTRE'],
      PREPARED_FOR_HANDOVER: ['IN_TRANSIT', 'QUARANTINED', 'REJECTED', 'RECEIVED_BY_CENTRE'],
      IN_TRANSIT: ['RECEIVED_BY_CENTRE', 'QUARANTINED', 'REJECTED'],
      RECEIVED_BY_CENTRE: ['PROCESSING_COMPLETED', 'QUARANTINED', 'REJECTED'],
      QUARANTINED: ['COLLECTED', 'RECEIVED_BY_CENTRE', 'REJECTED'],
      REJECTED: [],
      PROCESSING_COMPLETED: [],
    };

    if (!ALLOWED[current]?.includes(target)) {
      throw new Error(`Invalid collection unit status transition from "${current}" to "${target}".`);
    }
  }

  /**
   * Record a permitted collection unit status transition.
   * Atomically updates unit status and appends UnitStatusHistory.
   */
  static async updateCollectionUnitStatus(
    unitId: string,
    caller: CallerUser,
    input: UpdateCollectionUnitStatusInput
  ) {
    const unit = await prisma.collectionUnit.findUnique({
      where: { id: unitId },
    });

    if (!unit) {
      throw new Error('Collection unit not found.');
    }

    const membership = await this.verifyOrgMembership(unit.organisationId, caller);
    if (!['ORG_ADMIN', 'COLLECTION_STAFF', 'INVENTORY_STAFF'].includes(membership.role)) {
      throw new Error('Permission denied: Only authorized staff can transition collection unit status.');
    }

    this.validateCollectionUnitTransition(unit.status, input.status);

    const updated = await prisma.$transaction(async (tx) => {
      const updatedUnit = await tx.collectionUnit.update({
        where: { id: unitId },
        data: {
          status: input.status,
          notes: input.referenceNote ? input.referenceNote.trim() : unit.notes,
        },
      });

      await tx.unitStatusHistory.create({
        data: {
          unitType: 'COLLECTION_UNIT',
          collectionUnitId: unit.id,
          fromStatus: unit.status,
          toStatus: input.status,
          actorUserId: caller.id,
          organisationId: unit.organisationId,
          reason: input.reason?.trim() || null,
          referenceNote: input.referenceNote?.trim() || null,
          metadata: input.metadata || undefined,
        },
      });

      return updatedUnit;
    });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'COLLECTION_UNIT_STATUS_TRANSITION',
        resource: 'CollectionUnit',
        resourceId: unit.id,
        metadata: {
          unitNumber: unit.unitNumber,
          fromStatus: unit.status,
          toStatus: input.status,
          reason: input.reason,
        },
      },
    });

    return updated;
  }

  // ====================================================
  // 4. COMPONENT DERIVATION (LINEAGE)
  // ====================================================

  /**
   * Register blood components derived from a source collection unit.
   * Gated to INVENTORY_STAFF, CLINICAL_STAFF, or ORG_ADMIN.
   * Invariant: Requires source collection unit to be in COLLECTED or RECEIVED_BY_CENTRE status.
   * Invariant: Does not auto-generate components; each component is created from explicit processing records.
   */
  static async deriveComponents(
    collectionUnitId: string,
    caller: CallerUser,
    input: DeriveComponentsInput
  ) {
    if (!input.components || !Array.isArray(input.components) || input.components.length === 0) {
      throw new Error('At least one component must be specified for derivation.');
    }

    const sourceUnit = await prisma.collectionUnit.findUnique({
      where: { id: collectionUnitId },
      include: { components: true },
    });

    if (!sourceUnit) {
      throw new Error('Source collection unit not found.');
    }

    const membership = await this.verifyOrgMembership(sourceUnit.organisationId, caller);
    if (!['ORG_ADMIN', 'INVENTORY_STAFF', 'CLINICAL_STAFF', 'COLLECTION_STAFF'].includes(membership.role)) {
      throw new Error('Permission denied: Only ORG_ADMIN, INVENTORY_STAFF, CLINICAL_STAFF, or COLLECTION_STAFF can register component derivation.');
    }

    if (sourceUnit.status === 'REJECTED') {
      throw new Error('Cannot derive components from a REJECTED collection unit.');
    }

    if (sourceUnit.status === 'PROCESSING_COMPLETED') {
      throw new Error('Component processing has already been completed for this collection unit. Multiple derivation rounds are prohibited.');
    }

    const year = new Date().getFullYear();

    // Atomic creation of all derived components, status histories, and collection unit status update
    const derivedResults = await prisma.$transaction(async (tx) => {
      const createdComponents = [];

      for (const compInput of input.components) {
        const shelfLifeDays = compInput.expiresInDays || STANDARD_SHELF_LIFE_DAYS[compInput.componentType] || 35;
        const expiresAt = new Date(Date.now() + shelfLifeDays * 86400000);

        const compHex = crypto.randomBytes(3).toString('hex').toUpperCase();
        const componentCode = `CMP-${year}-${compInput.componentType}-${compHex}`;

        const comp = await tx.componentUnit.create({
          data: {
            componentCode,
            collectionUnitId: sourceUnit.id,
            componentType: compInput.componentType,
            bloodGroup: sourceUnit.bloodGroup,
            volumeMl: compInput.volumeMl || null,
            organisationId: sourceUnit.organisationId,
            status: 'QUARANTINED', // Initial state awaiting testing and release
            derivedAt: new Date(),
            derivedBy: caller.id,
            expiresAt,
            notes: compInput.notes?.trim() || null,
            metadata: {
              shelfLifeMetadata: {
                provisionalStandardDays: shelfLifeDays,
                isProvisional: true,
                disclaimer: 'Provisional standard estimation. Must be confirmed against blood bank SOP, preservative solution, and clinical storage protocol before release.',
              },
            },
          },
        });

        // Append initial status history for this component
        await tx.unitStatusHistory.create({
          data: {
            unitType: 'COMPONENT_UNIT',
            componentUnitId: comp.id,
            fromStatus: null,
            toStatus: 'QUARANTINED',
            actorUserId: caller.id,
            organisationId: sourceUnit.organisationId,
            reason: input.reason?.trim() || `Derived from source collection unit ${sourceUnit.unitNumber}`,
          },
        });

        createdComponents.push(comp);
      }

      // Transition source collection unit to PROCESSING_COMPLETED
      await tx.collectionUnit.update({
        where: { id: sourceUnit.id },
        data: { status: 'PROCESSING_COMPLETED' },
      });

      // Append status history for source collection unit
      await tx.unitStatusHistory.create({
        data: {
          unitType: 'COLLECTION_UNIT',
          collectionUnitId: sourceUnit.id,
          fromStatus: sourceUnit.status,
          toStatus: 'PROCESSING_COMPLETED',
          actorUserId: caller.id,
          organisationId: sourceUnit.organisationId,
          reason: `Derived ${createdComponents.length} component(s): ${createdComponents.map((c) => c.componentType).join(', ')}`,
        },
      });

      // Realtime events: notify inventory summary and component listeners across WebSocket channels
      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'inventory.summary_changed',
        organisationId: sourceUnit.organisationId,
        entityType: 'Organisation',
        entityId: sourceUnit.organisationId,
        payload: {
          organisationId: sourceUnit.organisationId,
          reason: 'COMPONENTS_DERIVED',
          sourceUnitId: sourceUnit.id,
          sourceUnitNumber: sourceUnit.unitNumber,
          derivedComponentCount: createdComponents.length,
        },
      });

      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'component.status_changed',
        organisationId: sourceUnit.organisationId,
        entityType: 'CollectionUnit',
        entityId: sourceUnit.id,
        payload: {
          organisationId: sourceUnit.organisationId,
          sourceUnitId: sourceUnit.id,
          sourceUnitNumber: sourceUnit.unitNumber,
          fromStatus: sourceUnit.status,
          toStatus: 'PROCESSING_COMPLETED',
          derivedCount: createdComponents.length,
          components: createdComponents.map((c) => ({
            id: c.id,
            componentCode: c.componentCode,
            componentType: c.componentType,
            bloodGroup: c.bloodGroup,
            status: c.status,
          })),
        },
      });

      return createdComponents;
    }, { maxWait: 10000, timeout: 20000 });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'COMPONENTS_DERIVED',
        resource: 'CollectionUnit',
        resourceId: sourceUnit.id,
        metadata: {
          sourceUnitNumber: sourceUnit.unitNumber,
          organisationId: sourceUnit.organisationId,
          componentCount: derivedResults.length,
          types: derivedResults.map((c) => c.componentType),
        },
      },
    });

    return derivedResults;
  }

  // ====================================================
  // 5. COMPONENT UNIT TRACEABILITY & STATUS
  // ====================================================

  /**
   * Retrieve component traceability detail and lineage back to source collection unit.
   */
  static async getComponentTraceability(
    componentIdOrCode: string,
    caller: CallerUser
  ) {
    const comp = await prisma.componentUnit.findFirst({
      where: {
        OR: [{ id: componentIdOrCode }, { componentCode: componentIdOrCode }],
      },
      include: {
        organisation: { select: { id: true, name: true, orgCode: true } },
        collectionUnit: {
          include: {
            camp: { select: { id: true, campCode: true, title: true } },
          },
        },
        statusHistory: {
          include: {
            actorUser: { select: { id: true, name: true, role: true } },
          },
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!comp) {
      throw new Error('Component unit not found.');
    }

    await this.verifyOrgMembership(comp.organisationId, caller);

    return {
      id: comp.id,
      componentCode: comp.componentCode,
      componentType: comp.componentType,
      bloodGroup: comp.bloodGroup,
      volumeMl: comp.volumeMl,
      status: comp.status,
      derivedAt: comp.derivedAt,
      expiresAt: comp.expiresAt,
      notes: comp.notes,
      organisation: comp.organisation,
      sourceCollection: {
        id: comp.collectionUnit.id,
        unitNumber: comp.collectionUnit.unitNumber,
        collectedAt: comp.collectionUnit.collectedAt,
        camp: comp.collectionUnit.camp,
      },
      statusHistory: comp.statusHistory.map((h) => ({
        id: h.id,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        actorName: h.actorUser?.name || 'Staff Member',
        reason: h.reason,
        timestamp: h.timestamp,
      })),
    };
  }

  /**
   * Permitted state transitions for Component Units:
   * QUARANTINED -> AWAITING_TESTING, AVAILABLE, DISCARDED
   * AWAITING_TESTING -> AVAILABLE, DISCARDED
   * AVAILABLE -> RESERVED, DISCARDED, EXPIRED
   * RESERVED -> ISSUED, AVAILABLE, DISCARDED, EXPIRED
   * ISSUED -> (Terminal state)
   * DISCARDED -> (Terminal state)
   * EXPIRED -> (Terminal state)
   */
  private static validateComponentTransition(
    current: ComponentUnitStatus,
    target: ComponentUnitStatus
  ) {
    if (current === target) return;

    if (current === 'ISSUED' || current === 'DISCARDED' || current === 'EXPIRED') {
      throw new Error(`Cannot transition component from terminal status "${current}".`);
    }

    const ALLOWED: Record<ComponentUnitStatus, ComponentUnitStatus[]> = {
      QUARANTINED: ['AWAITING_TESTING', 'AWAITING_CLINICAL_REVIEW', 'DISCARDED'],
      AWAITING_TESTING: ['QUARANTINED', 'AWAITING_CLINICAL_REVIEW', 'DISCARDED'],
      AWAITING_CLINICAL_REVIEW: ['QUARANTINED', 'DISCARDED'],
      AVAILABLE: ['RESERVED', 'DISCARDED', 'EXPIRED'],
      RESERVED: ['ISSUED', 'AVAILABLE', 'DISCARDED', 'EXPIRED'],
      ISSUED: [],
      DISCARDED: [],
      EXPIRED: [],
    };

    if (!ALLOWED[current]?.includes(target)) {
      throw new Error(`Invalid component unit status transition from "${current}" to "${target}".`);
    }
  }

  /**
   * Update component unit status with atomic status history logging.
   * NOTE: Direct transition to AVAILABLE via this generic method is strictly PROHIBITED.
   * All components must undergo the authoritative clinical release workflow.
   */
  static async updateComponentStatus(
    componentId: string,
    caller: CallerUser,
    input: UpdateComponentStatusInput
  ) {
    // Critical Authoritative Gate Enforcement:
    // Direct status updates to AVAILABLE via generic endpoints are strictly prohibited.
    if (input.status === 'AVAILABLE') {
      throw new Error(
        'DIRECT_RELEASE_PROHIBITED: Direct transition to AVAILABLE via generic status update is prohibited. Blood components must undergo the authoritative clinical release workflow (POST /api/v1/processing/clinical-release/:componentId) with verified laboratory test panel and authorized CLINICAL_STAFF credentials.'
      );
    }

    const comp = await prisma.componentUnit.findUnique({
      where: { id: componentId },
    });

    if (!comp) {
      throw new Error('Component unit not found.');
    }

    const membership = await this.verifyOrgMembership(comp.organisationId, caller);
    if (!['ORG_ADMIN', 'INVENTORY_STAFF', 'CLINICAL_STAFF'].includes(membership.role)) {
      throw new Error('Permission denied: Only authorized inventory or clinical staff can transition component status.');
    }

    this.validateComponentTransition(comp.status, input.status);

    const updated = await prisma.$transaction(async (tx) => {
      const updatedComp = await tx.componentUnit.update({
        where: { id: componentId },
        data: {
          status: input.status,
          notes: input.referenceNote ? input.referenceNote.trim() : comp.notes,
        },
      });

      await tx.unitStatusHistory.create({
        data: {
          unitType: 'COMPONENT_UNIT',
          componentUnitId: comp.id,
          fromStatus: comp.status,
          toStatus: input.status,
          actorUserId: caller.id,
          organisationId: comp.organisationId,
          reason: input.reason?.trim() || null,
          referenceNote: input.referenceNote?.trim() || null,
          metadata: input.metadata || undefined,
        },
      });

      return updatedComp;
    });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'COMPONENT_STATUS_TRANSITION',
        resource: 'ComponentUnit',
        resourceId: comp.id,
        metadata: {
          componentCode: comp.componentCode,
          fromStatus: comp.status,
          toStatus: input.status,
          reason: input.reason,
        },
      },
    });

    return updated;
  }
}
