import { prisma } from '../lib/prisma';
import {
  ManifestStatus,
  ItemReceiptOutcome,
  DiscrepancyCategory,
  ExceptionSeverity,
  ExceptionStatus,
  CollectionUnitStatus,
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

export interface TransportDetails {
  courierName?: string;
  vehicleNumber?: string;
  driverPhone?: string;
  coldBoxTempCelsius?: number;
  dispatchNotes?: string;
}

export interface CreateManifestInput {
  campId?: string;
  receivingOrganisationId: string;
  transportDetails?: TransportDetails;
  notes?: string;
}

export interface ReceiveItemInput {
  collectionUnitId: string;
  outcome: ItemReceiptOutcome;
  discrepancyCategory?: DiscrepancyCategory;
  discrepancyNote?: string;
  severity?: ExceptionSeverity;
}

export class HandoverService {
  /**
   * Helper: verify caller's membership in a specified organisation.
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
      throw new Error('Access denied: You do not have an active membership in this organisation.');
    }

    return membership;
  }

  // ====================================================
  // 1. CREATE DRAFT MANIFEST
  // ====================================================

  static async createDraftManifest(
    sendingOrgId: string,
    caller: CallerUser,
    input: CreateManifestInput
  ) {
    const membership = await this.verifyOrgMembership(sendingOrgId, caller);
    if (!['ORG_ADMIN', 'COLLECTION_STAFF'].includes(membership.role)) {
      throw new Error('Permission denied: Only collection staff or organisation admins can prepare handover manifests.');
    }

    // Validate receiving organisation
    if (!input.receivingOrganisationId) {
      throw new Error('Receiving organisation ID is required.');
    }

    if (input.receivingOrganisationId === sendingOrgId) {
      throw new Error('Receiving organisation must be distinct from the sending organisation.');
    }

    const receivingOrg = await prisma.organisation.findUnique({
      where: { id: input.receivingOrganisationId },
    });

    if (!receivingOrg) {
      throw new Error('Target receiving organisation does not exist.');
    }

    if (receivingOrg.status !== 'VERIFIED') {
      throw new Error('Receiving organisation must be a verified institution.');
    }

    // Validate camp if provided
    if (input.campId) {
      const camp = await prisma.camp.findUnique({
        where: { id: input.campId },
      });
      if (!camp) {
        throw new Error('Specified camp not found.');
      }
      if (camp.organisationId !== sendingOrgId) {
        throw new Error('Camp does not belong to the sending organisation.');
      }
    }

    const year = new Date().getFullYear();
    const hex = crypto.randomBytes(3).toString('hex').toUpperCase();
    const manifestNumber = `HM-${year}-${hex}`;

    const manifest = await prisma.handoverManifest.create({
      data: {
        manifestNumber,
        campId: input.campId || null,
        sendingOrganisationId: sendingOrgId,
        receivingOrganisationId: input.receivingOrganisationId,
        status: 'DRAFT',
        transportDetails: input.transportDetails ? (input.transportDetails as any) : undefined,
        createdById: caller.id,
        notes: input.notes?.trim() || null,
      },
      include: {
        sendingOrganisation: { select: { id: true, name: true, orgCode: true } },
        receivingOrganisation: { select: { id: true, name: true, orgCode: true } },
        camp: { select: { id: true, campCode: true, title: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'HANDOVER_MANIFEST_CREATED',
        resource: 'HandoverManifest',
        resourceId: manifest.id,
        metadata: {
          manifestNumber: manifest.manifestNumber,
          sendingOrganisationId: sendingOrgId,
          receivingOrganisationId: input.receivingOrganisationId,
          campId: input.campId,
        },
      },
    });

    return manifest;
  }

  // ====================================================
  // 2. MANAGE MANIFEST ITEMS (DRAFT ONLY)
  // ====================================================

  static async addItemsToManifest(
    manifestId: string,
    caller: CallerUser,
    collectionUnitIds: string[]
  ) {
    const manifest = await prisma.handoverManifest.findUnique({
      where: { id: manifestId },
      include: { items: true },
    });

    if (!manifest) {
      throw new Error('Handover manifest not found.');
    }

    if (manifest.status !== 'DRAFT') {
      throw new Error(`Cannot add units to manifest in status "${manifest.status}". Manifest unit list is frozen.`);
    }

    const membership = await this.verifyOrgMembership(manifest.sendingOrganisationId, caller);
    if (!['ORG_ADMIN', 'COLLECTION_STAFF'].includes(membership.role)) {
      throw new Error('Permission denied: Only collection staff or organisation admins can add units to this manifest.');
    }

    if (!collectionUnitIds || collectionUnitIds.length === 0) {
      throw new Error('At least one collection unit ID must be provided.');
    }

    const uniqueUnitIds = Array.from(new Set(collectionUnitIds));

    // Verify all collection units belong to sending org and are eligible
    const units = await prisma.collectionUnit.findMany({
      where: { id: { in: uniqueUnitIds } },
    });

    if (units.length !== uniqueUnitIds.length) {
      throw new Error('One or more collection units could not be found.');
    }

    for (const unit of units) {
      if (unit.organisationId !== manifest.sendingOrganisationId) {
        throw new Error(`Collection unit "${unit.unitNumber}" does not belong to the sending organisation.`);
      }

      if (!['COLLECTED', 'PREPARED_FOR_HANDOVER'].includes(unit.status)) {
        throw new Error(`Collection unit "${unit.unitNumber}" is in status "${unit.status}" and cannot be added to a handover manifest.`);
      }

      // Check if unit is already in this manifest
      const alreadyInThis = manifest.items.some((i) => i.collectionUnitId === unit.id);
      if (alreadyInThis) {
        throw new Error(`Collection unit "${unit.unitNumber}" is already included in this manifest.`);
      }

      // Check if unit is committed to another active handover manifest
      const activeHandover = await prisma.handoverItem.findFirst({
        where: {
          collectionUnitId: unit.id,
          manifestId: { not: manifestId },
          manifest: {
            status: { in: ['DRAFT', 'FINALISED', 'DISPATCHED', 'PARTIALLY_RECEIVED'] },
          },
        },
        include: { manifest: true },
      });

      if (activeHandover) {
        throw new Error(`Collection unit "${unit.unitNumber}" is already committed to active handover manifest "${activeHandover.manifest.manifestNumber}".`);
      }
    }

    // Atomically create handover items and transition units to PREPARED_FOR_HANDOVER
    const createdItems = await prisma.$transaction(async (tx) => {
      const items = [];
      for (const unit of units) {
        const item = await tx.handoverItem.create({
          data: {
            manifestId: manifest.id,
            collectionUnitId: unit.id,
            expectedUnitNumber: unit.unitNumber,
            outcome: 'PENDING',
          },
        });
        items.push(item);

        if (unit.status !== 'PREPARED_FOR_HANDOVER') {
          await tx.collectionUnit.update({
            where: { id: unit.id },
            data: { status: 'PREPARED_FOR_HANDOVER' },
          });

          await tx.unitStatusHistory.create({
            data: {
              unitType: 'COLLECTION_UNIT',
              collectionUnitId: unit.id,
              fromStatus: unit.status,
              toStatus: 'PREPARED_FOR_HANDOVER',
              actorUserId: caller.id,
              organisationId: manifest.sendingOrganisationId,
              reason: `Assigned to handover manifest ${manifest.manifestNumber}`,
            },
          });
        }
      }
      return items;
    }, { maxWait: 10000, timeout: 20000 });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'HANDOVER_ITEMS_ADDED',
        resource: 'HandoverManifest',
        resourceId: manifest.id,
        metadata: {
          manifestNumber: manifest.manifestNumber,
          unitsAdded: units.map((u) => u.unitNumber),
        },
      },
    });

    return createdItems;
  }

  static async removeItemFromManifest(
    manifestId: string,
    collectionUnitId: string,
    caller: CallerUser
  ) {
    const manifest = await prisma.handoverManifest.findUnique({
      where: { id: manifestId },
    });

    if (!manifest) {
      throw new Error('Handover manifest not found.');
    }

    if (manifest.status !== 'DRAFT') {
      throw new Error(`Cannot remove units from manifest in status "${manifest.status}". Manifest is frozen.`);
    }

    const membership = await this.verifyOrgMembership(manifest.sendingOrganisationId, caller);
    if (!['ORG_ADMIN', 'COLLECTION_STAFF'].includes(membership.role)) {
      throw new Error('Permission denied: Only collection staff or organisation admins can remove units from this manifest.');
    }

    const item = await prisma.handoverItem.findUnique({
      where: {
        manifestId_collectionUnitId: {
          manifestId,
          collectionUnitId,
        },
      },
      include: { collectionUnit: true },
    });

    if (!item) {
      throw new Error('Collection unit is not listed in this manifest.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.handoverItem.delete({
        where: { id: item.id },
      });

      // Revert status to COLLECTED
      await tx.collectionUnit.update({
        where: { id: collectionUnitId },
        data: { status: 'COLLECTED' },
      });

      await tx.unitStatusHistory.create({
        data: {
          unitType: 'COLLECTION_UNIT',
          collectionUnitId,
          fromStatus: 'PREPARED_FOR_HANDOVER',
          toStatus: 'COLLECTED',
          actorUserId: caller.id,
          organisationId: manifest.sendingOrganisationId,
          reason: `Removed from draft handover manifest ${manifest.manifestNumber}`,
        },
      });
    }, { maxWait: 10000, timeout: 20000 });

    return { success: true, message: 'Item removed and unit reverted to COLLECTED.' };
  }

  // ====================================================
  // 3. FINALISE MANIFEST
  // ====================================================

  static async finaliseManifest(
    manifestId: string,
    caller: CallerUser,
    notes?: string
  ) {
    const manifest = await prisma.handoverManifest.findUnique({
      where: { id: manifestId },
      include: { items: true },
    });

    if (!manifest) {
      throw new Error('Handover manifest not found.');
    }

    if (manifest.status !== 'DRAFT') {
      throw new Error(`Cannot finalise manifest in status "${manifest.status}". Must be in DRAFT.`);
    }

    const membership = await this.verifyOrgMembership(manifest.sendingOrganisationId, caller);
    if (!['ORG_ADMIN', 'COLLECTION_STAFF'].includes(membership.role)) {
      throw new Error('Permission denied: Only collection staff or organisation admins can finalise manifests.');
    }

    if (manifest.items.length === 0) {
      throw new Error('Cannot finalise an empty manifest. Add at least one collection unit before finalising.');
    }

    const updated = await prisma.handoverManifest.update({
      where: { id: manifestId },
      data: {
        status: 'FINALISED',
        finalisedById: caller.id,
        finalisedAt: new Date(),
        notes: notes?.trim() || manifest.notes,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'HANDOVER_MANIFEST_FINALISED',
        resource: 'HandoverManifest',
        resourceId: manifest.id,
        metadata: {
          manifestNumber: manifest.manifestNumber,
          unitCount: manifest.items.length,
        },
      },
    });

    return updated;
  }

  // ====================================================
  // 4. DISPATCH MANIFEST (RECORD PHYSICAL TRANSPORT)
  // ====================================================

  static async dispatchManifest(
    manifestId: string,
    caller: CallerUser,
    input?: { transportDetails?: TransportDetails; dispatchNotes?: string }
  ) {
    const manifest = await prisma.handoverManifest.findUnique({
      where: { id: manifestId },
      include: { items: { include: { collectionUnit: true } } },
    });

    if (!manifest) {
      throw new Error('Handover manifest not found.');
    }

    if (manifest.status !== 'FINALISED') {
      throw new Error(`Cannot dispatch manifest in status "${manifest.status}". Manifest must be FINALISED before dispatch.`);
    }

    const membership = await this.verifyOrgMembership(manifest.sendingOrganisationId, caller);
    if (!['ORG_ADMIN', 'COLLECTION_STAFF'].includes(membership.role)) {
      throw new Error('Permission denied: Only authorised collection staff or organisation admins can record dispatch.');
    }

    if (manifest.items.length === 0) {
      throw new Error('Cannot dispatch an empty manifest.');
    }

    const mergedTransport = {
      ...(manifest.transportDetails as any || {}),
      ...(input?.transportDetails || {}),
    };

    const updated = await prisma.$transaction(async (tx) => {
      const dispatchedManifest = await tx.handoverManifest.update({
        where: { id: manifestId },
        data: {
          status: 'DISPATCHED',
          dispatchedById: caller.id,
          dispatchedAt: new Date(),
          transportDetails: mergedTransport,
          notes: input?.dispatchNotes?.trim() || manifest.notes,
        },
      });

      // Atomically transition all collection units to IN_TRANSIT with audit history
      for (const item of manifest.items) {
        await tx.collectionUnit.update({
          where: { id: item.collectionUnitId },
          data: { status: 'IN_TRANSIT' },
        });

        await tx.unitStatusHistory.create({
          data: {
            unitType: 'COLLECTION_UNIT',
            collectionUnitId: item.collectionUnitId,
            fromStatus: item.collectionUnit.status,
            toStatus: 'IN_TRANSIT',
            actorUserId: caller.id,
            organisationId: manifest.sendingOrganisationId,
            reason: `Dispatched in handover manifest ${manifest.manifestNumber}. Transport carrier: ${mergedTransport.courierName || 'Courier/Van'}`,
          },
        });
      }

      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'handover.dispatched',
        organisationId: manifest.sendingOrganisationId,
        entityType: 'HandoverManifest',
        entityId: manifest.id,
        payload: {
          manifestId: manifest.id,
          manifestNumber: manifest.manifestNumber,
          sendingOrganisationId: manifest.sendingOrganisationId,
          receivingOrganisationId: manifest.receivingOrganisationId,
          unitCount: manifest.items.length,
          carrier: mergedTransport.courierName || 'Courier',
          status: 'DISPATCHED',
        },
      });

      if (manifest.receivingOrganisationId !== manifest.sendingOrganisationId) {
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'handover.dispatched',
          organisationId: manifest.receivingOrganisationId,
          entityType: 'HandoverManifest',
          entityId: manifest.id,
          payload: {
            manifestId: manifest.id,
            manifestNumber: manifest.manifestNumber,
            sendingOrganisationId: manifest.sendingOrganisationId,
            receivingOrganisationId: manifest.receivingOrganisationId,
            unitCount: manifest.items.length,
            carrier: mergedTransport.courierName || 'Courier',
            status: 'DISPATCHED',
          },
        });
      }

      return dispatchedManifest;
    }, { maxWait: 10000, timeout: 20000 });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'HANDOVER_MANIFEST_DISPATCHED',
        resource: 'HandoverManifest',
        resourceId: manifest.id,
        metadata: {
          manifestNumber: manifest.manifestNumber,
          unitCount: manifest.items.length,
          carrier: mergedTransport.courierName,
          vehicleNumber: mergedTransport.vehicleNumber,
        },
      },
    });

    return updated;
  }

  // ====================================================
  // 5. RECEIVE INDIVIDUAL UNITS & RECORD EXCEPTIONS
  // ====================================================

  static async receiveItem(
    manifestId: string,
    caller: CallerUser,
    input: ReceiveItemInput
  ) {
    const manifest = await prisma.handoverManifest.findUnique({
      where: { id: manifestId },
      include: {
        items: { include: { collectionUnit: true } },
        exceptions: true,
      },
    });

    if (!manifest) {
      throw new Error('Handover manifest not found.');
    }

    // Handover receipt can ONLY be acknowledged by the intended receiving organisation!
    const membership = await this.verifyOrgMembership(manifest.receivingOrganisationId, caller);
    if (!['ORG_ADMIN', 'INVENTORY_STAFF'].includes(membership.role)) {
      throw new Error('Permission denied: Only authorised inventory staff or administrators of the receiving organisation can acknowledge receipt.');
    }

    if (!['DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED_WITH_DISCREPANCIES'].includes(manifest.status)) {
      throw new Error(`Cannot record unit receipt for manifest in status "${manifest.status}". Manifest must be DISPATCHED.`);
    }

    const handoverItem = manifest.items.find((i) => i.collectionUnitId === input.collectionUnitId);

    // Case 1: Unexpected unit presented (not in expected manifest item list)
    if (!handoverItem) {
      // Find collection unit in database
      const presentedUnit = await prisma.collectionUnit.findUnique({
        where: { id: input.collectionUnitId },
      });

      if (!presentedUnit) {
        throw new Error('Presented unit does not exist in the system.');
      }

      // Create ReconciliationException for UNEXPECTED_UNIT
      const exception = await prisma.$transaction(async (tx) => {
        const exc = await tx.reconciliationException.create({
          data: {
            manifestId: manifest.id,
            collectionUnitId: presentedUnit.id,
            category: 'UNEXPECTED_UNIT',
            severity: 'HIGH',
            status: 'OPEN',
            description: input.discrepancyNote?.trim() || `Unexpected unit ${presentedUnit.unitNumber} arrived with manifest ${manifest.manifestNumber} but was not listed.`,
          },
        });

        // Place unit into QUARANTINED (do NOT mark as safely received by centre)
        await tx.collectionUnit.update({
          where: { id: presentedUnit.id },
          data: { status: 'QUARANTINED' },
        });

        await tx.unitStatusHistory.create({
          data: {
            unitType: 'COLLECTION_UNIT',
            collectionUnitId: presentedUnit.id,
            fromStatus: presentedUnit.status,
            toStatus: 'QUARANTINED',
            actorUserId: caller.id,
            organisationId: manifest.receivingOrganisationId,
            reason: `Unexpected arrival in manifest ${manifest.manifestNumber}. Quarantined pending discrepancy resolution.`,
          },
        });

        await tx.handoverManifest.update({
          where: { id: manifestId },
          data: { status: 'RECEIVED_WITH_DISCREPANCIES' },
        });

        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'handover.receipt_updated',
          organisationId: manifest.receivingOrganisationId,
          entityType: 'HandoverManifest',
          entityId: manifest.id,
          payload: {
            manifestId: manifest.id,
            manifestNumber: manifest.manifestNumber,
            campId: manifest.campId || undefined,
            collectionUnitId: presentedUnit.id,
            outcome: 'UNEXPECTED',
            isDiscrepancy: true,
            manifestStatus: 'RECEIVED_WITH_DISCREPANCIES',
          },
        });

        if (manifest.sendingOrganisationId !== manifest.receivingOrganisationId) {
          await RealtimeService.publishOutboxEvent(tx, {
            eventType: 'handover.receipt_updated',
            organisationId: manifest.sendingOrganisationId,
            entityType: 'HandoverManifest',
            entityId: manifest.id,
            payload: {
              manifestId: manifest.id,
              manifestNumber: manifest.manifestNumber,
              campId: manifest.campId || undefined,
              collectionUnitId: presentedUnit.id,
              outcome: 'UNEXPECTED',
              isDiscrepancy: true,
              manifestStatus: 'RECEIVED_WITH_DISCREPANCIES',
            },
          });
        }

        return exc;
      }, { maxWait: 10000, timeout: 20000 });

      return {
        isDiscrepancy: true,
        type: 'UNEXPECTED_UNIT',
        exception,
      };
    }

    // Case 2: Expected unit receipt evaluation
    const targetOutcome = input.outcome;
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      // Update handover item record
      const updatedItem = await tx.handoverItem.update({
        where: { id: handoverItem.id },
        data: {
          outcome: targetOutcome,
          receivedAt: now,
          verifiedById: caller.id,
          discrepancyNote: input.discrepancyNote?.trim() || null,
        },
      });

      let createdException = null;

      // Check if an open discrepancy exception exists on this item or collection unit
      const openExceptionsOnItem = await tx.reconciliationException.findMany({
        where: {
          manifestId: manifest.id,
          OR: [
            { handoverItemId: handoverItem.id },
            { collectionUnitId: handoverItem.collectionUnitId },
          ],
          status: { in: ['OPEN', 'INVESTIGATING'] },
        },
      });

      if (targetOutcome === 'VERIFIED_INTACT') {
        if (openExceptionsOnItem.length > 0) {
          // Critical safety gate: Unit has unresolved discrepancy exception(s).
          // It CANNOT enter clean RECEIVED_BY_CENTRE status while an exception remains open.
          // It must remain QUARANTINED pending discrepancy resolution or waiver.
          await tx.collectionUnit.update({
            where: { id: handoverItem.collectionUnitId },
            data: { status: 'QUARANTINED' },
          });

          await tx.unitStatusHistory.create({
            data: {
              unitType: 'COLLECTION_UNIT',
              collectionUnitId: handoverItem.collectionUnitId,
              fromStatus: handoverItem.collectionUnit.status,
              toStatus: 'QUARANTINED',
              actorUserId: caller.id,
              organisationId: manifest.receivingOrganisationId,
              reason: `Unit verified intact but held in quarantine: ${openExceptionsOnItem.length} unresolved discrepancy exception(s) pending formal investigation/waiver. Manifest ${manifest.manifestNumber}`,
            },
          });
        } else {
          // Safe physical receipt: transition to RECEIVED_BY_CENTRE
          await tx.collectionUnit.update({
            where: { id: handoverItem.collectionUnitId },
            data: { status: 'RECEIVED_BY_CENTRE' },
          });

          await tx.unitStatusHistory.create({
            data: {
              unitType: 'COLLECTION_UNIT',
              collectionUnitId: handoverItem.collectionUnitId,
              fromStatus: handoverItem.collectionUnit.status,
              toStatus: 'RECEIVED_BY_CENTRE',
              actorUserId: caller.id,
              organisationId: manifest.receivingOrganisationId,
              reason: `Physically verified intact at receiving blood bank. Manifest ${manifest.manifestNumber}`,
            },
          });
        }
      } else if (['DAMAGED', 'TEMPERATURE_EXCURSION', 'MISMATCHED'].includes(targetOutcome)) {
        // Discrepant unit: transition to QUARANTINE_HOLD or REJECTED; NEVER RECEIVED_BY_CENTRE!
        const newUnitStatus: CollectionUnitStatus = targetOutcome === 'DAMAGED' ? 'REJECTED' : 'QUARANTINED';

        await tx.collectionUnit.update({
          where: { id: handoverItem.collectionUnitId },
          data: { status: newUnitStatus },
        });

        await tx.unitStatusHistory.create({
          data: {
            unitType: 'COLLECTION_UNIT',
            collectionUnitId: handoverItem.collectionUnitId,
            fromStatus: handoverItem.collectionUnit.status,
            toStatus: newUnitStatus,
            actorUserId: caller.id,
            organisationId: manifest.receivingOrganisationId,
            reason: `Receipt discrepancy (${targetOutcome}): ${input.discrepancyNote || 'Physical anomaly reported'}. Manifest ${manifest.manifestNumber}`,
          },
        });

        const category: DiscrepancyCategory =
          targetOutcome === 'DAMAGED'
            ? 'DAMAGED_BAG'
            : targetOutcome === 'TEMPERATURE_EXCURSION'
            ? 'COLD_CHAIN_BREACH'
            : 'IDENTIFIER_MISMATCH';

        createdException = await tx.reconciliationException.create({
          data: {
            manifestId: manifest.id,
            handoverItemId: handoverItem.id,
            collectionUnitId: handoverItem.collectionUnitId,
            category,
            severity: input.severity || 'HIGH',
            status: 'OPEN',
            description: input.discrepancyNote?.trim() || `Discrepancy recorded for unit ${handoverItem.expectedUnitNumber}: ${targetOutcome}`,
          },
        });
      } else if (targetOutcome === 'MISSING') {
        // Unit missing at receipt
        createdException = await tx.reconciliationException.create({
          data: {
            manifestId: manifest.id,
            handoverItemId: handoverItem.id,
            collectionUnitId: handoverItem.collectionUnitId,
            category: 'UNIT_MISSING',
            severity: 'HIGH',
            status: 'OPEN',
            description: input.discrepancyNote?.trim() || `Unit ${handoverItem.expectedUnitNumber} expected in manifest ${manifest.manifestNumber} was not physically presented at receiving station.`,
          },
        });

        // Unit remains in IN_TRANSIT with audit record noting reported missing
        await tx.unitStatusHistory.create({
          data: {
            unitType: 'COLLECTION_UNIT',
            collectionUnitId: handoverItem.collectionUnitId,
            fromStatus: handoverItem.collectionUnit.status,
            toStatus: handoverItem.collectionUnit.status,
            actorUserId: caller.id,
            organisationId: manifest.receivingOrganisationId,
            reason: `Reported MISSING during physical receiving reconciliation for manifest ${manifest.manifestNumber}`,
          },
        });
      }

      // Re-evaluate overall manifest status
      const allItems = await tx.handoverItem.findMany({
        where: { manifestId: manifest.id },
      });

      const openExceptionsCount = await tx.reconciliationException.count({
        where: {
          manifestId: manifest.id,
          status: { in: ['OPEN', 'INVESTIGATING'] },
        },
      });

      const hasDiscrepantOutcomes = allItems.some((i) =>
        ['DAMAGED', 'TEMPERATURE_EXCURSION', 'MISSING', 'MISMATCHED', 'UNEXPECTED'].includes(i.outcome)
      );
      const hasDiscrepancies = hasDiscrepantOutcomes || Boolean(createdException) || openExceptionsCount > 0;

      const hasPending = allItems.some((i) => i.outcome === 'PENDING');

      let newManifestStatus: ManifestStatus;
      if (hasDiscrepancies) {
        newManifestStatus = 'RECEIVED_WITH_DISCREPANCIES';
      } else if (hasPending) {
        newManifestStatus = 'PARTIALLY_RECEIVED';
      } else {
        // All items received with no discrepancies
        newManifestStatus = 'PARTIALLY_RECEIVED'; // Awaiting explicit reconciliation sign-off
      }

      await tx.handoverManifest.update({
        where: { id: manifest.id },
        data: { status: newManifestStatus },
      });

      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'handover.receipt_updated',
        organisationId: manifest.receivingOrganisationId,
        entityType: 'HandoverManifest',
        entityId: manifest.id,
        payload: {
          manifestId: manifest.id,
          manifestNumber: manifest.manifestNumber,
          campId: manifest.campId || undefined,
          collectionUnitId: handoverItem.collectionUnitId,
          outcome: targetOutcome,
          isDiscrepancy: hasDiscrepancies,
          manifestStatus: newManifestStatus,
        },
      });

      if (manifest.sendingOrganisationId !== manifest.receivingOrganisationId) {
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'handover.receipt_updated',
          organisationId: manifest.sendingOrganisationId,
          entityType: 'HandoverManifest',
          entityId: manifest.id,
          payload: {
            manifestId: manifest.id,
            manifestNumber: manifest.manifestNumber,
            campId: manifest.campId || undefined,
            collectionUnitId: handoverItem.collectionUnitId,
            outcome: targetOutcome,
            isDiscrepancy: hasDiscrepancies,
            manifestStatus: newManifestStatus,
          },
        });
      }

      return {
        updatedItem,
        createdException,
        manifestStatus: newManifestStatus,
      };
    }, { maxWait: 10000, timeout: 20000 });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'HANDOVER_UNIT_RECEIVED',
        resource: 'HandoverItem',
        resourceId: handoverItem.id,
        metadata: {
          manifestNumber: manifest.manifestNumber,
          unitNumber: handoverItem.expectedUnitNumber,
          outcome: targetOutcome,
          discrepancyNote: input.discrepancyNote,
        },
      },
    });

    return result;
  }

  // ====================================================
  // 6. RESOLVE RECONCILIATION EXCEPTION
  // ====================================================

  static async resolveException(
    exceptionId: string,
    caller: CallerUser,
    input: { resolutionNotes: string; status?: 'RESOLVED' | 'WAIVED' }
  ) {
    const exception = await prisma.reconciliationException.findUnique({
      where: { id: exceptionId },
      include: {
        manifest: true,
        collectionUnit: true,
        handoverItem: true,
      },
    });

    if (!exception) {
      throw new Error('Reconciliation exception not found.');
    }

    if (!input.resolutionNotes || input.resolutionNotes.trim().length === 0) {
      throw new Error('Auditable resolution notes are required to resolve an exception.');
    }

    // Either receiving org or sending org can participate in resolving discrepancies
    const isReceiving = await prisma.organisationMembership.findUnique({
      where: {
        userId_organisationId: {
          userId: caller.id,
          organisationId: exception.manifest.receivingOrganisationId,
        },
      },
    });

    const isSending = await prisma.organisationMembership.findUnique({
      where: {
        userId_organisationId: {
          userId: caller.id,
          organisationId: exception.manifest.sendingOrganisationId,
        },
      },
    });

    if (caller.role !== 'ADMIN' && (!isReceiving || !isReceiving.isActive) && (!isSending || !isSending.isActive)) {
      throw new Error('Permission denied: You must be an authorised staff member of a participating organisation to resolve this discrepancy.');
    }

    const targetStatus = input.status === 'WAIVED' ? 'WAIVED' : 'RESOLVED';

    // If waiving: must be ORG_ADMIN or INVENTORY_STAFF of receiving organisation, or Platform ADMIN
    if (targetStatus === 'WAIVED') {
      const canWaive = caller.role === 'ADMIN' || (isReceiving && ['ORG_ADMIN', 'INVENTORY_STAFF'].includes(isReceiving.role));
      if (!canWaive) {
        throw new Error('Permission denied: Only authorised inventory staff or administrators of the receiving organisation can formally waive a discrepancy exception.');
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const exc = await tx.reconciliationException.update({
        where: { id: exceptionId },
        data: {
          status: targetStatus,
          resolutionNotes: input.resolutionNotes.trim(),
          resolvedById: caller.id,
          resolvedAt: new Date(),
        },
      });

      // If this exception is linked to a collection unit, check if other open exceptions exist for it
      if (exception.collectionUnitId) {
        const remainingOpenOnUnit = await tx.reconciliationException.count({
          where: {
            manifestId: exception.manifestId,
            collectionUnitId: exception.collectionUnitId,
            id: { not: exceptionId },
            status: { in: ['OPEN', 'INVESTIGATING'] },
          },
        });

        if (remainingOpenOnUnit === 0) {
          // Find handover item
          const item = await tx.handoverItem.findFirst({
            where: {
              manifestId: exception.manifestId,
              collectionUnitId: exception.collectionUnitId,
            },
          });

          // If the item was verified intact (or exception was waived/resolved to intact):
          if (item && item.outcome === 'VERIFIED_INTACT') {
            await tx.collectionUnit.update({
              where: { id: exception.collectionUnitId },
              data: { status: 'RECEIVED_BY_CENTRE' },
            });

            await tx.unitStatusHistory.create({
              data: {
                unitType: 'COLLECTION_UNIT',
                collectionUnitId: exception.collectionUnitId,
                fromStatus: exception.collectionUnit?.status || 'QUARANTINED',
                toStatus: 'RECEIVED_BY_CENTRE',
                actorUserId: caller.id,
                organisationId: exception.manifest.receivingOrganisationId,
                reason: `Discrepancy exception ${exception.category} ${targetStatus.toLowerCase()}: ${input.resolutionNotes.trim()}. Unit cleared for intake.`,
              },
            });
          }
        }
      }

      // Re-evaluate manifest status
      const allItems = await tx.handoverItem.findMany({
        where: { manifestId: exception.manifestId },
      });

      const openExceptionsCount = await tx.reconciliationException.count({
        where: {
          manifestId: exception.manifestId,
          status: { in: ['OPEN', 'INVESTIGATING'] },
        },
      });

      const hasDiscrepantOutcomes = allItems.some((i) =>
        ['DAMAGED', 'TEMPERATURE_EXCURSION', 'MISSING', 'MISMATCHED', 'UNEXPECTED'].includes(i.outcome)
      );
      const hasDiscrepancies = hasDiscrepantOutcomes || openExceptionsCount > 0;
      const hasPending = allItems.some((i) => i.outcome === 'PENDING');

      let newManifestStatus: ManifestStatus;
      if (hasDiscrepancies) {
        newManifestStatus = 'RECEIVED_WITH_DISCREPANCIES';
      } else if (hasPending) {
        newManifestStatus = 'PARTIALLY_RECEIVED';
      } else {
        newManifestStatus = 'PARTIALLY_RECEIVED'; // All items accounted for, awaiting reconciliation sign-off
      }

      await tx.handoverManifest.update({
        where: { id: exception.manifestId },
        data: { status: newManifestStatus },
      });

      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'handover.receipt_updated',
        organisationId: exception.manifest.receivingOrganisationId,
        entityType: 'ReconciliationException',
        entityId: exception.id,
        payload: {
          manifestId: exception.manifestId,
          manifestNumber: exception.manifest.manifestNumber,
          campId: exception.manifest.campId || undefined,
          exceptionId: exception.id,
          status: exc.status,
          manifestStatus: newManifestStatus,
        },
      });

      if (exception.manifest.sendingOrganisationId !== exception.manifest.receivingOrganisationId) {
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'handover.receipt_updated',
          organisationId: exception.manifest.sendingOrganisationId,
          entityType: 'ReconciliationException',
          entityId: exception.id,
          payload: {
            manifestId: exception.manifestId,
            manifestNumber: exception.manifest.manifestNumber,
            campId: exception.manifest.campId || undefined,
            exceptionId: exception.id,
            status: exc.status,
            manifestStatus: newManifestStatus,
          },
        });
      }

      return exc;
    }, { maxWait: 10000, timeout: 20000 });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: targetStatus === 'WAIVED' ? 'RECONCILIATION_EXCEPTION_WAIVED' : 'RECONCILIATION_EXCEPTION_RESOLVED',
        resource: 'ReconciliationException',
        resourceId: exception.id,
        metadata: {
          manifestNumber: exception.manifest.manifestNumber,
          category: exception.category,
          status: updated.status,
          resolutionNotes: input.resolutionNotes,
        },
      },
    });

    return updated;
  }

  // ====================================================
  // 7. FORMAL RECONCILIATION SIGN-OFF & INVENTORY INTAKE
  // ====================================================

  static async reconcileManifest(
    manifestId: string,
    caller: CallerUser,
    notes?: string
  ) {
    const manifest = await prisma.handoverManifest.findUnique({
      where: { id: manifestId },
      include: {
        items: {
          include: {
            collectionUnit: true,
          },
        },
        exceptions: true,
        camp: true,
      },
    });

    if (!manifest) {
      throw new Error('Handover manifest not found.');
    }

    const membership = await this.verifyOrgMembership(manifest.receivingOrganisationId, caller);
    if (!['ORG_ADMIN', 'INVENTORY_STAFF'].includes(membership.role)) {
      throw new Error('Permission denied: Only authorised inventory staff or administrators of the receiving organisation can sign off on reconciliation.');
    }

    if (manifest.status === 'RECONCILED') {
      throw new Error('Manifest is already reconciled.');
    }

    if (!['DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED_WITH_DISCREPANCIES'].includes(manifest.status)) {
      throw new Error(`Cannot reconcile manifest in status "${manifest.status}". Manifest must be received.`);
    }

    // Invariant 1: All items must have a recorded physical outcome (cannot have PENDING items)
    const pendingItems = manifest.items.filter((i) => i.outcome === 'PENDING');
    if (pendingItems.length > 0) {
      throw new Error(
        `Cannot reconcile manifest: ${pendingItems.length} expected unit(s) are still PENDING verification. All units must be accounted for.`
      );
    }

    // Invariant 2: Cannot claim reconciled while unresolved discrepancies remain
    const openExceptions = manifest.exceptions.filter(
      (e) => e.status === 'OPEN' || e.status === 'INVESTIGATING'
    );
    if (openExceptions.length > 0) {
      throw new Error(
        `Cannot reconcile manifest: ${openExceptions.length} discrepancy exception(s) remain UNRESOLVED. All exceptions must be investigated and resolved or waived before reconciliation.`
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update manifest status to RECONCILED
      const rec = await tx.handoverManifest.update({
        where: { id: manifestId },
        data: {
          status: 'RECONCILED',
          reconciledById: caller.id,
          reconciledAt: new Date(),
          notes: notes?.trim() || manifest.notes,
        },
      });

      // 2. Post accepted physical units into parent blood bank received-awaiting-processing inventory
      let acceptedUnitsCount = 0;
      for (const item of manifest.items) {
        if (item.outcome === 'VERIFIED_INTACT') {
          acceptedUnitsCount++;

          // Transfer custody atomically to receivingOrganisationId and commit to RECEIVED_BY_CENTRE
          await tx.collectionUnit.update({
            where: { id: item.collectionUnitId },
            data: {
              status: 'RECEIVED_BY_CENTRE',
              organisationId: manifest.receivingOrganisationId,
            },
          });

          await tx.unitStatusHistory.create({
            data: {
              unitType: 'COLLECTION_UNIT',
              collectionUnitId: item.collectionUnitId,
              fromStatus: item.collectionUnit.status,
              toStatus: 'RECEIVED_BY_CENTRE',
              actorUserId: caller.id,
              organisationId: manifest.receivingOrganisationId,
              reason: `Manifest ${manifest.manifestNumber} reconciled. Unit accepted into blood bank inventory (received awaiting processing). Camp: ${manifest.camp?.title || manifest.campId || 'N/A'}.`,
            },
          });
        }
      }

      // 3. Publish handover.reconciled event to receiving org, sending org, and camp
      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'handover.reconciled',
        organisationId: manifest.receivingOrganisationId,
        entityType: 'HandoverManifest',
        entityId: manifest.id,
        payload: {
          manifestId: manifest.id,
          manifestNumber: manifest.manifestNumber,
          campId: manifest.campId || undefined,
          reconciledById: caller.id,
          status: 'RECONCILED',
          acceptedUnitsCount,
        },
      });

      if (manifest.sendingOrganisationId !== manifest.receivingOrganisationId) {
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'handover.reconciled',
          organisationId: manifest.sendingOrganisationId,
          entityType: 'HandoverManifest',
          entityId: manifest.id,
          payload: {
            manifestId: manifest.id,
            manifestNumber: manifest.manifestNumber,
            campId: manifest.campId || undefined,
            reconciledById: caller.id,
            status: 'RECONCILED',
            acceptedUnitsCount,
          },
        });
      }

      // 4. Publish inventory.summary_changed to update blood bank stock & collection intake metrics
      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'inventory.summary_changed',
        organisationId: manifest.receivingOrganisationId,
        entityType: 'Organisation',
        entityId: manifest.receivingOrganisationId,
        payload: {
          organisationId: manifest.receivingOrganisationId,
          reason: 'HANDOVER_MANIFEST_RECONCILED',
          manifestId: manifest.id,
          manifestNumber: manifest.manifestNumber,
          acceptedUnitsCount,
        },
      });

      // 5. Publish camp.readiness_verified to recalculate closure readiness immediately
      if (manifest.campId) {
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'camp.readiness_verified',
          entityType: 'Camp',
          entityId: manifest.campId,
          organisationId: manifest.receivingOrganisationId,
          payload: {
            campId: manifest.campId,
            reason: 'HANDOVER_MANIFEST_RECONCILED',
            manifestNumber: manifest.manifestNumber,
          },
        });
      }

      return rec;
    }, { maxWait: 10000, timeout: 25000 });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'HANDOVER_MANIFEST_RECONCILED',
        resource: 'HandoverManifest',
        resourceId: manifest.id,
        metadata: {
          manifestNumber: manifest.manifestNumber,
          totalItems: manifest.items.length,
          reconciledBy: caller.id,
          receivingOrganisationId: manifest.receivingOrganisationId,
        },
      },
    });

    return updated;
  }

  // ====================================================
  // 8. QUERY & RETRIEVAL
  // ====================================================

  static async getManifestDetail(manifestId: string, caller: CallerUser) {
    const manifest = await prisma.handoverManifest.findUnique({
      where: { id: manifestId },
      include: {
        sendingOrganisation: { select: { id: true, name: true, orgCode: true } },
        receivingOrganisation: { select: { id: true, name: true, orgCode: true } },
        camp: { select: { id: true, campCode: true, title: true } },
        createdBy: { select: { id: true, name: true, role: true } },
        finalisedBy: { select: { id: true, name: true, role: true } },
        dispatchedBy: { select: { id: true, name: true, role: true } },
        reconciledBy: { select: { id: true, name: true, role: true } },
        items: {
          include: {
            collectionUnit: {
              select: {
                id: true,
                unitNumber: true,
                bloodGroup: true,
                volumeMl: true,
                status: true,
              },
            },
            verifiedBy: { select: { id: true, name: true, role: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        exceptions: {
          include: {
            resolvedBy: { select: { id: true, name: true, role: true } },
            collectionUnit: { select: { id: true, unitNumber: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!manifest) {
      throw new Error('Handover manifest not found.');
    }

    // Check caller belongs to sending org OR receiving org
    if (caller.role !== 'ADMIN') {
      const isSender = await prisma.organisationMembership.findUnique({
        where: {
          userId_organisationId: {
            userId: caller.id,
            organisationId: manifest.sendingOrganisationId,
          },
        },
      });

      const isReceiver = await prisma.organisationMembership.findUnique({
        where: {
          userId_organisationId: {
            userId: caller.id,
            organisationId: manifest.receivingOrganisationId,
          },
        },
      });

      if ((!isSender || !isSender.isActive) && (!isReceiver || !isReceiver.isActive)) {
        throw new Error('Access denied: You do not belong to the sending or receiving organisation for this manifest.');
      }
    }

    // Compute reconciliation summary statistics
    const totalExpected = manifest.items.length;
    let totalVerifiedIntact = 0;
    let totalDamaged = 0;
    let totalMissing = 0;
    let totalTemperatureExcursion = 0;
    let totalMismatched = 0;
    let totalUnexpected = 0;
    let totalPending = 0;

    for (const item of manifest.items) {
      switch (item.outcome) {
        case 'VERIFIED_INTACT':
          totalVerifiedIntact++;
          break;
        case 'DAMAGED':
          totalDamaged++;
          break;
        case 'MISSING':
          totalMissing++;
          break;
        case 'TEMPERATURE_EXCURSION':
          totalTemperatureExcursion++;
          break;
        case 'MISMATCHED':
          totalMismatched++;
          break;
        case 'UNEXPECTED':
          totalUnexpected++;
          break;
        default:
          totalPending++;
          break;
      }
    }

    const openExceptionsCount = manifest.exceptions.filter(
      (e) => e.status === 'OPEN' || e.status === 'INVESTIGATING'
    ).length;

    return {
      id: manifest.id,
      manifestNumber: manifest.manifestNumber,
      campId: manifest.campId,
      sourceCampId: manifest.campId,
      campTitle: manifest.camp?.title || null,
      sourceCamp: manifest.camp ? {
        id: manifest.camp.id,
        title: manifest.camp.title,
        campCode: manifest.camp.campCode,
      } : null,
      camp: manifest.camp,
      sendingOrganisationId: manifest.sendingOrganisationId,
      sendingOrgId: manifest.sendingOrganisationId,
      sendingOrganisation: manifest.sendingOrganisation,
      sendingOrg: manifest.sendingOrganisation,
      sendingOrganisationName: manifest.sendingOrganisation.name,
      receivingOrganisationId: manifest.receivingOrganisationId,
      receivingOrgId: manifest.receivingOrganisationId,
      receivingOrganisation: manifest.receivingOrganisation,
      receivingOrg: manifest.receivingOrganisation,
      receivingOrganisationName: manifest.receivingOrganisation.name,
      status: manifest.status,
      transportDetails: manifest.transportDetails as TransportDetails | null,
      createdAt: manifest.createdAt.toISOString(),
      creatorName: manifest.createdBy?.name || 'Staff Member',
      createdByName: manifest.createdBy?.name || 'Staff Member',
      finalisedAt: manifest.finalisedAt?.toISOString() || null,
      finalisedByName: manifest.finalisedBy?.name || null,
      dispatchedAt: manifest.dispatchedAt?.toISOString() || null,
      dispatcherName: manifest.dispatchedBy?.name || null,
      dispatchedByName: manifest.dispatchedBy?.name || null,
      reconciledAt: manifest.reconciledAt?.toISOString() || null,
      reconcilerName: manifest.reconciledBy?.name || null,
      reconciledByName: manifest.reconciledBy?.name || null,
      reconciliationNotes: manifest.notes,
      notes: manifest.notes,
      items: manifest.items.map((i) => ({
        id: i.id,
        manifestId: i.manifestId,
        collectionUnitId: i.collectionUnitId,
        expectedUnitNumber: i.expectedUnitNumber,
        unitNumber: i.collectionUnit.unitNumber,
        bloodGroup: i.collectionUnit.bloodGroup,
        volumeMl: i.collectionUnit.volumeMl,
        currentUnitStatus: i.collectionUnit.status,
        expectedOutcome: 'VERIFIED_INTACT',
        outcome: i.outcome,
        actualOutcome: i.outcome,
        receivedAt: i.receivedAt?.toISOString() || null,
        verifiedByName: i.verifiedBy?.name || null,
        discrepancyNote: i.discrepancyNote,
        collectionUnit: {
          id: i.collectionUnit.id,
          unitNumber: i.collectionUnit.unitNumber,
          bloodGroup: i.collectionUnit.bloodGroup,
          volumeMl: i.collectionUnit.volumeMl,
          status: i.collectionUnit.status,
        },
      })),
      exceptions: manifest.exceptions.map((e) => ({
        id: e.id,
        manifestId: e.manifestId,
        handoverItemId: e.handoverItemId,
        collectionUnitId: e.collectionUnitId,
        unitIdentifier: e.collectionUnit?.unitNumber || null,
        category: e.category,
        severity: e.severity,
        status: e.status,
        description: e.description,
        details: e.description,
        resolutionNotes: e.resolutionNotes,
        resolvedByName: e.resolvedBy?.name || null,
        resolverName: e.resolvedBy?.name || null,
        resolvedAt: e.resolvedAt?.toISOString() || null,
        createdAt: e.createdAt.toISOString(),
      })),
      summary: {
        totalExpected,
        totalVerifiedIntact,
        totalDamaged,
        totalMissing,
        totalTemperatureExcursion,
        totalMismatched,
        totalUnexpected,
        totalPending,
        openExceptionsCount,
      },
      reconciliationSummary: {
        totalExpected,
        verifiedIntact: totalVerifiedIntact,
        damagedOrCompromised: totalDamaged + totalTemperatureExcursion,
        missing: totalMissing,
        unexpected: totalUnexpected,
      },
    };
  }

  static async listManifests(
    organisationId: string,
    caller: CallerUser,
    type: 'sent' | 'received' | 'all' = 'all'
  ) {
    await this.verifyOrgMembership(organisationId, caller);

    let whereClause: any = {};
    if (type === 'sent') {
      whereClause = { sendingOrganisationId: organisationId };
    } else if (type === 'received') {
      whereClause = { receivingOrganisationId: organisationId };
    } else {
      whereClause = {
        OR: [
          { sendingOrganisationId: organisationId },
          { receivingOrganisationId: organisationId },
        ],
      };
    }

    const manifests = await prisma.handoverManifest.findMany({
      where: whereClause,
      include: {
        sendingOrganisation: { select: { id: true, name: true, orgCode: true } },
        receivingOrganisation: { select: { id: true, name: true, orgCode: true } },
        camp: { select: { id: true, campCode: true, title: true } },
        _count: { select: { items: true, exceptions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return manifests.map((m) => ({
      id: m.id,
      manifestNumber: m.manifestNumber,
      status: m.status,
      campId: m.campId,
      sourceCampId: m.campId,
      campTitle: m.camp?.title || null,
      sourceCamp: m.camp ? { id: m.camp.id, title: m.camp.title, campCode: m.camp.campCode } : null,
      camp: m.camp,
      sendingOrganisationId: m.sendingOrganisationId,
      sendingOrgId: m.sendingOrganisationId,
      sendingOrganisation: m.sendingOrganisation,
      sendingOrg: m.sendingOrganisation,
      receivingOrganisationId: m.receivingOrganisationId,
      receivingOrgId: m.receivingOrganisationId,
      receivingOrganisation: m.receivingOrganisation,
      receivingOrg: m.receivingOrganisation,
      itemCount: m._count.items,
      exceptionCount: m._count.exceptions,
      createdAt: m.createdAt.toISOString(),
      dispatchedAt: m.dispatchedAt?.toISOString() || null,
      reconciledAt: m.reconciledAt?.toISOString() || null,
    }));
  }

  // ====================================================
  // 9. CANCEL MANIFEST (DRAFT / FINALISED ONLY)
  // ====================================================

  static async cancelManifest(
    manifestId: string,
    caller: CallerUser,
    reason?: string
  ) {
    const manifest = await prisma.handoverManifest.findUnique({
      where: { id: manifestId },
      include: { items: { include: { collectionUnit: true } } },
    });

    if (!manifest) {
      throw new Error('Handover manifest not found.');
    }

    if (!['DRAFT', 'FINALISED'].includes(manifest.status)) {
      throw new Error(`Cannot cancel manifest in status "${manifest.status}". Only DRAFT or FINALISED manifests can be cancelled.`);
    }

    const membership = await this.verifyOrgMembership(manifest.sendingOrganisationId, caller);
    if (!['ORG_ADMIN'].includes(membership.role)) {
      throw new Error('Permission denied: Only organisation administrators can cancel handover manifests.');
    }

    const cancelled = await prisma.$transaction(async (tx) => {
      const updated = await tx.handoverManifest.update({
        where: { id: manifestId },
        data: {
          status: 'CANCELLED',
          notes: reason?.trim() ? `Cancelled: ${reason.trim()}` : manifest.notes,
        },
      });

      // Revert units back to COLLECTED
      for (const item of manifest.items) {
        if (item.collectionUnit.status === 'PREPARED_FOR_HANDOVER') {
          await tx.collectionUnit.update({
            where: { id: item.collectionUnitId },
            data: { status: 'COLLECTED' },
          });

          await tx.unitStatusHistory.create({
            data: {
              unitType: 'COLLECTION_UNIT',
              collectionUnitId: item.collectionUnitId,
              fromStatus: 'PREPARED_FOR_HANDOVER',
              toStatus: 'COLLECTED',
              actorUserId: caller.id,
              organisationId: manifest.sendingOrganisationId,
              reason: `Handover manifest ${manifest.manifestNumber} was cancelled. ${reason || ''}`.trim(),
            },
          });
        }
      }

      return updated;
    }, { maxWait: 10000, timeout: 20000 });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'HANDOVER_MANIFEST_CANCELLED',
        resource: 'HandoverManifest',
        resourceId: manifest.id,
        metadata: {
          manifestNumber: manifest.manifestNumber,
          reason,
        },
      },
    });

    return cancelled;
  }
}
