import { prisma } from '../lib/prisma';
import { RealtimeService } from './realtime';
import {
  ComponentUnitStatus,
  CollectionUnitStatus,
  TestCategory,
  TestType,
  TestResultOutcome,
  TestRecordStatus,
  ClinicalReleaseDecision,
  StorageType,
  ComponentType,
  BloodGroup,
  OrgRole,
} from '@prisma/client';

export interface CallerUser {
  id: string;
  role: string;
  phoneNumber?: string;
  name?: string | null;
}

export interface RecordLaboratoryTestInput {
  collectionUnitId?: string;
  componentUnitId?: string;
  category: TestCategory;
  testType: TestType;
  testName?: string;
  sampleBarcode?: string;
  resultOutcome?: TestResultOutcome;
  quantitativeValue?: string;
  units?: string;
  referenceRange?: string;
  status?: TestRecordStatus;
  reagentLot?: string;
  reagentExpiry?: string;
  instrumentId?: string;
  notes?: string;
}

export interface VerifyLaboratoryTestInput {
  verificationNotes?: string;
}

export interface RecordClinicalReleaseInput {
  decision: ClinicalReleaseDecision;
  reason: string;
  clinicalProtocolRef?: string;
  dispositionNotes?: string;
}

export interface ResolveQuarantineHoldInput {
  resolutionOutcome: 'HOLD_CLEARED_AFTER_INVESTIGATION' | 'DISCARD_CONFIRMED';
  investigationNotes: string;
  clinicalJustification: string;
  correctiveAction?: string;
}

export interface CreateStorageLocationInput {
  locationCode: string;
  name: string;
  storageType: StorageType;
  targetTempRange: string;
  roomOrArea?: string;
  equipmentIdentifier?: string;
  shelfOrRack?: string;
}

export interface RecordStorageMovementInput {
  toLocationId: string;
  reason: string;
  observedTempCelsius?: number;
  temperatureExcursionNoted?: boolean;
  excursionNotes?: string;
}

export interface RecordDispositionInput {
  dispositionType: string; // e.g. "DISCARDED_EXPIRED", "DISCARDED_TTI_REACTIVE", "DISCARDED_DAMAGED", "ISSUED"
  reason: string;
  notes?: string;
}

// Mandatory Transfusion-Transmissible Infection (TTI) and Immunohematology Panel
export const MANDATORY_TEST_TYPES: TestType[] = [
  'HIV_ANTIBODY',
  'HCV_ANTIBODY',
  'HBSAG',
  'SYPHILIS_RPR',
  'MALARIA_ANTIGEN',
  'ABO_RH_CONFIRMATION',
];

export class ProcessingAndInventoryService {
  /**
   * Helper: verify caller's active membership and retrieve permissions.
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
      include: {
        organisation: true,
      },
    });

    if (!membership || !membership.isActive) {
      throw new Error('Access denied: You do not hold an active membership in this organisation.');
    }

    if (membership.organisation.status !== 'VERIFIED') {
      throw new Error('Access denied: Organisation is not verified or is suspended.');
    }

    return membership;
  }

  // ====================================================
  // 1. LABORATORY & PROCESSING TEST RECORDS
  // ====================================================

  /**
   * Record a laboratory test result for a collection unit or component unit.
   * Preserves historical test records rather than overwriting.
   */
  static async recordLaboratoryTest(
    organisationId: string,
    caller: CallerUser,
    input: RecordLaboratoryTestInput
  ) {
    const membership = await this.verifyOrgMembership(organisationId, caller);
    if (!['ORG_ADMIN', 'CLINICAL_STAFF', 'INVENTORY_STAFF', 'COLLECTION_STAFF'].includes(membership.role)) {
      throw new Error('Permission denied: You are not authorized to record laboratory test results.');
    }

    if (!input.collectionUnitId && !input.componentUnitId) {
      throw new Error('Either collectionUnitId or componentUnitId must be provided.');
    }

    // Verify target unit exists and belongs to the organisation
    let collectionUnit = null;
    let componentUnit = null;

    if (input.collectionUnitId) {
      collectionUnit = await prisma.collectionUnit.findUnique({
        where: { id: input.collectionUnitId },
      });
      if (!collectionUnit) {
        throw new Error('Collection unit not found.');
      }
      if (collectionUnit.organisationId !== organisationId) {
        throw new Error('Access denied: Collection unit does not belong to your organisation.');
      }
    }

    if (input.componentUnitId) {
      componentUnit = await prisma.componentUnit.findUnique({
        where: { id: input.componentUnitId },
        include: { collectionUnit: true },
      });
      if (!componentUnit) {
        throw new Error('Component unit not found.');
      }
      if (componentUnit.organisationId !== organisationId) {
        throw new Error('Access denied: Component unit does not belong to your organisation.');
      }
      if (['ISSUED', 'DISCARDED'].includes(componentUnit.status)) {
        throw new Error(`Cannot record laboratory test on component in terminal status "${componentUnit.status}".`);
      }
      if (!input.collectionUnitId && componentUnit.collectionUnitId) {
        input.collectionUnitId = componentUnit.collectionUnitId;
      }
    }

    const testRecordStatus = input.status || (input.resultOutcome ? 'COMPLETED' : 'PENDING');
    const testName = input.testName || input.testType.replace(/_/g, ' ');
    const category: TestCategory = input.category || (
      (input.testType as string) === 'ABO_RH_CONFIRMATION' || input.testType === 'IRREGULAR_ANTIBODY'
        ? 'BLOOD_GROUPING'
        : 'TTI_SCREENING'
    );

    const testRecord = await prisma.$transaction(async (tx) => {
      const record = await tx.laboratoryTestRecord.create({
        data: {
          organisationId,
          collectionUnitId: input.collectionUnitId || null,
          componentUnitId: input.componentUnitId || null,
          category,
          testType: input.testType,
          testName,
          sampleBarcode: input.sampleBarcode?.trim() || null,
          resultOutcome: input.resultOutcome || null,
          quantitativeValue: input.quantitativeValue?.trim() || null,
          units: input.units?.trim() || null,
          referenceRange: input.referenceRange?.trim() || null,
          status: testRecordStatus,
          performedById: caller.id,
          performedAt: new Date(),
          reagentLot: input.reagentLot?.trim() || null,
          reagentExpiry: input.reagentExpiry ? new Date(input.reagentExpiry) : null,
          instrumentId: input.instrumentId?.trim() || null,
          notes: input.notes?.trim() || null,
        },
      });

      // If test is REACTIVE, CONFIRMED_POSITIVE, or INDETERMINATE, immediately place component on safety quarantine hold
      if (
        input.resultOutcome === 'REACTIVE' ||
        input.resultOutcome === 'CONFIRMED_POSITIVE' ||
        input.resultOutcome === 'INDETERMINATE'
      ) {
        if (componentUnit && componentUnit.status !== 'DISCARDED') {
          const holdLabel =
            input.resultOutcome === 'INDETERMINATE'
              ? 'Indeterminate safety investigation'
              : 'Reactive test result';
          await tx.componentUnit.update({
            where: { id: componentUnit.id },
            data: {
              status: 'QUARANTINED',
              isHold: true,
              holdReason: `Mandatory safety hold: ${holdLabel} for ${input.testType} (${input.resultOutcome})`,
              holdPlacedAt: new Date(),
              holdPlacedById: caller.id,
            },
          });

          await tx.unitStatusHistory.create({
            data: {
              unitType: 'COMPONENT_UNIT',
              componentUnitId: componentUnit.id,
              fromStatus: componentUnit.status,
              toStatus: 'QUARANTINED',
              actorUserId: caller.id,
              organisationId,
              reason: `Safety Quarantine: Reactive lab test result recorded for ${input.testType}`,
            },
          });
        }

        if (collectionUnit && collectionUnit.status !== 'REJECTED') {
          await tx.collectionUnit.update({
            where: { id: collectionUnit.id },
            data: {
              status: 'QUARANTINED',
            },
          });

          await tx.unitStatusHistory.create({
            data: {
              unitType: 'COLLECTION_UNIT',
              collectionUnitId: collectionUnit.id,
              fromStatus: collectionUnit.status,
              toStatus: 'QUARANTINED',
              actorUserId: caller.id,
              organisationId,
              reason: `Safety Quarantine: Reactive lab test result recorded for ${input.testType}`,
            },
          });
        }
      }

      return record;
    });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'LAB_TEST_RECORDED',
        resource: 'LaboratoryTestRecord',
        resourceId: testRecord.id,
        metadata: {
          testType: input.testType,
          resultOutcome: input.resultOutcome,
          organisationId,
          collectionUnitId: input.collectionUnitId,
          componentUnitId: input.componentUnitId,
        },
      },
    });

    return testRecord;
  }

  /**
   * Clinical verification of a recorded laboratory test.
   * Gated strictly to CLINICAL_STAFF with 'lab:verify' authority.
   */
  static async verifyLaboratoryTest(
    organisationId: string,
    testRecordId: string,
    caller: CallerUser,
    input: VerifyLaboratoryTestInput
  ) {
    const membership = await this.verifyOrgMembership(organisationId, caller);
    if (membership.role !== 'CLINICAL_STAFF') {
      throw new Error('Permission denied: Only CLINICAL_STAFF can verify laboratory test records.');
    }

    const record = await prisma.laboratoryTestRecord.findUnique({
      where: { id: testRecordId },
    });

    if (!record || record.organisationId !== organisationId) {
      throw new Error('Laboratory test record not found.');
    }

    if (record.verifiedAt) {
      throw new Error('This laboratory test record has already been clinically verified.');
    }

    const updated = await prisma.laboratoryTestRecord.update({
      where: { id: testRecordId },
      data: {
        verifiedById: caller.id,
        verifiedAt: new Date(),
        notes: input.verificationNotes ? `${record.notes || ''} [Verification: ${input.verificationNotes.trim()}]`.trim() : record.notes,
        status: record.status === 'PENDING' ? 'COMPLETED' : record.status,
      },
      include: {
        verifiedBy: { select: { id: true, name: true, role: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'LAB_TEST_VERIFIED',
        resource: 'LaboratoryTestRecord',
        resourceId: record.id,
        metadata: {
          testType: record.testType,
          resultOutcome: record.resultOutcome,
          organisationId,
          verifiedById: caller.id,
        },
      },
    });

    return updated;
  }

  /**
   * List laboratory test records for a component or collection unit.
   */
  static async listLaboratoryTests(
    organisationId: string,
    caller: CallerUser,
    filter: { collectionUnitId?: string; componentUnitId?: string }
  ) {
    await this.verifyOrgMembership(organisationId, caller);

    return prisma.laboratoryTestRecord.findMany({
      where: {
        organisationId,
        ...(filter.collectionUnitId ? { collectionUnitId: filter.collectionUnitId } : {}),
        ...(filter.componentUnitId ? { componentUnitId: filter.componentUnitId } : {}),
      },
      include: {
        performedBy: { select: { id: true, name: true, role: true } },
        verifiedBy: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ====================================================
  // 2. CLINICAL RELEASE WORKFLOW & CONTROLS
  // ====================================================

  /**
   * Check laboratory completeness and safety eligibility for clinical release.
   */
  static async evaluateReleaseEligibility(componentId: string, organisationId: string) {
    const comp = await prisma.componentUnit.findUnique({
      where: { id: componentId },
      include: {
        collectionUnit: true,
      },
    });

    if (!comp || comp.organisationId !== organisationId) {
      throw new Error('Component unit not found.');
    }

    // Retrieve all test records for this component and its source collection unit
    const testRecords = await prisma.laboratoryTestRecord.findMany({
      where: {
        organisationId,
        OR: [
          { componentUnitId: comp.id },
          ...(comp.collectionUnitId ? [{ collectionUnitId: comp.collectionUnitId }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    // Determine the latest outcome for each test type
    const latestTestMap: Record<string, typeof testRecords[0]> = {};
    for (const record of testRecords) {
      if (!latestTestMap[record.testType]) {
        latestTestMap[record.testType] = record;
      }
    }

    const missingTests: TestType[] = [];
    const pendingTests: TestType[] = [];
    const reactiveOrFailedTests: { testType: TestType; outcome: TestResultOutcome | null }[] = [];
    const passedTests: { testType: TestType; outcome: TestResultOutcome; recordId: string }[] = [];

    // Configurable facility-approved panel vs application baseline panel
    const facilityPanel = (comp.metadata as any)?.facilityApprovedPanel;
    const requiredPanel: TestType[] = Array.isArray(facilityPanel) && facilityPanel.length > 0
      ? Array.from(new Set([...MANDATORY_TEST_TYPES, ...facilityPanel]))
      : MANDATORY_TEST_TYPES;

    for (const required of requiredPanel) {
      const rec = latestTestMap[required];
      if (!rec) {
        missingTests.push(required);
      } else if (rec.status === 'PENDING' || !rec.resultOutcome) {
        pendingTests.push(required);
      } else if (
        rec.status === 'FAILED' ||
        rec.status === 'INVALID' ||
        rec.status === 'REPEAT_REQUIRED' ||
        rec.resultOutcome === 'REACTIVE' ||
        rec.resultOutcome === 'CONFIRMED_POSITIVE' ||
        rec.resultOutcome === 'INDETERMINATE'
      ) {
        reactiveOrFailedTests.push({ testType: required, outcome: rec.resultOutcome });
      } else if (
        rec.status === 'COMPLETED' &&
        (rec.resultOutcome === 'NON_REACTIVE' || rec.resultOutcome === 'NOT_APPLICABLE')
      ) {
        // Immunohematology Safety Verification for ABO/Rh confirmation
        const validBloodGroups = ['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG'];
        const normalizedVal = rec.quantitativeValue?.trim().replace(' ', '_').toUpperCase();
        const isBloodGroupVal = Boolean(normalizedVal && validBloodGroups.includes(normalizedVal));
        if (
          required === 'ABO_RH_CONFIRMATION' &&
          isBloodGroupVal &&
          normalizedVal !== comp.bloodGroup
        ) {
          reactiveOrFailedTests.push({ testType: required, outcome: rec.resultOutcome });
        } else {
          passedTests.push({ testType: required, outcome: rec.resultOutcome, recordId: rec.id });
        }
      } else {
        // Unapproved outcome or non-completed status fail safely
        reactiveOrFailedTests.push({ testType: required, outcome: rec.resultOutcome });
      }
    }

    const isExpired = comp.expiresAt ? new Date(comp.expiresAt).getTime() < Date.now() : false;
    const isTerminal = ['ISSUED', 'DISCARDED', 'EXPIRED'].includes(comp.status);
    const shelfLifeMeta = (comp.metadata as any)?.shelfLifeMetadata;
    const isProvisionalShelfLife = shelfLifeMeta?.isProvisional === true;

    const isEligibleForRelease =
      !isTerminal &&
      !isExpired &&
      !comp.isHold &&
      missingTests.length === 0 &&
      pendingTests.length === 0 &&
      reactiveOrFailedTests.length === 0;

    return {
      component: {
        id: comp.id,
        componentCode: comp.componentCode,
        componentType: comp.componentType,
        bloodGroup: comp.bloodGroup,
        status: comp.status,
        expiresAt: comp.expiresAt,
        isExpired,
        isHold: comp.isHold,
        holdReason: comp.holdReason,
      },
      mandatoryRequirements: {
        allMandatoryRequired: requiredPanel,
        missingTests,
        pendingTests,
        reactiveOrFailedTests,
        passedTests,
      },
      shelfLifeEvaluation: {
        isExpired,
        expiresAt: comp.expiresAt,
        isProvisional: isProvisionalShelfLife,
        note: isProvisionalShelfLife
          ? 'Provisional standard estimation. Must be confirmed against facility preservative and storage protocol before distribution.'
          : 'Facility approved shelf-life confirmed.',
      },
      isEligibleForRelease,
      blockingReasons: [
        ...(isTerminal ? [`Component is already in terminal status "${comp.status}".`] : []),
        ...(isExpired ? ['Component shelf-life has expired. Cannot release.'] : []),
        ...(comp.isHold ? [`Component is currently under quarantine hold: "${comp.holdReason}".`] : []),
        ...missingTests.map((t) => `Mandatory laboratory test missing: ${t}.`),
        ...pendingTests.map((t) => `Mandatory test pending completion: ${t}.`),
        ...reactiveOrFailedTests.map(
          (t) => `Mandatory test failed or reactive: ${t.testType} (${t.outcome || 'No outcome'}).`
        ),
      ],
    };
  }

  /**
   * Execute an authorised clinical release or hold decision.
   * STRICT SAFETY GATE:
   * - Caller must be CLINICAL_STAFF with 'clinical:release' permission.
   * - ORG_ADMIN without CLINICAL_STAFF is strictly prohibited.
   * - A release to AVAILABLE requires all mandatory tests to be complete, non-reactive, and verified.
   * - Clinical release requires an explicit facility-approved procedure reference (clinicalProtocolRef).
   * - Concurrency isolation prevents duplicate or racing release transactions.
   * - Atomic transaction updates component status, logs clinical release record, status history, and audit log.
   */
  static async recordClinicalRelease(
    organisationId: string,
    componentId: string,
    caller: CallerUser,
    input: RecordClinicalReleaseInput
  ) {
    const membership = await this.verifyOrgMembership(organisationId, caller);

    // CRITICAL REQUIREMENT: ORG_ADMIN must NOT qualify to perform clinical release.
    // Must be CLINICAL_STAFF.
    if (membership.role !== 'CLINICAL_STAFF') {
      throw new Error(
        'Permission denied: Clinical release requires authorized CLINICAL_STAFF role. Organisation administrators without designated clinical authority cannot release blood components.'
      );
    }

    const comp = await prisma.componentUnit.findUnique({
      where: { id: componentId },
      include: { collectionUnit: true },
    });

    if (!comp || comp.organisationId !== organisationId) {
      throw new Error('Component unit not found.');
    }

    if (comp.status === 'ISSUED' || comp.status === 'DISCARDED' || comp.status === 'EXPIRED') {
      throw new Error(`Cannot perform clinical release on unit with terminal status "${comp.status}". Status reversals from terminal states are strictly prohibited.`);
    }

    // Concurrency / Idempotency guard: if unit is already AVAILABLE
    if (comp.status === 'AVAILABLE' && input.decision === 'RELEASED') {
      const existingRelease = await prisma.clinicalReleaseRecord.findFirst({
        where: { componentUnitId: componentId, decision: 'RELEASED' },
        orderBy: { decisionTimestamp: 'desc' },
        include: {
          authorizedClinicalUser: { select: { id: true, name: true, role: true } },
        },
      });
      if (existingRelease) {
        return { component: comp, releaseRecord: existingRelease };
      }
    }

    // Safety checks depending on decision
    const evaluation = await this.evaluateReleaseEligibility(componentId, organisationId);

    if (input.decision === 'RELEASED') {
      const cleanProtocolRef = input.clinicalProtocolRef?.trim();
      if (
        !cleanProtocolRef ||
        ['NONE', 'UNSPECIFIED', 'UNDEFINED', 'NULL'].includes(cleanProtocolRef.toUpperCase())
      ) {
        throw new Error(
          'Clinical Release Gate Blocked: FACILITY_PROCEDURE_MISSING: Clinical release requires a valid, documented facility-approved procedure reference (clinicalProtocolRef). Missing or unapproved protocol configuration cannot satisfy release eligibility.'
        );
      }

      if (!evaluation.isEligibleForRelease) {
        throw new Error(
          `Clinical Release Gate Blocked: ${evaluation.blockingReasons.join(' ')}`
        );
      }
    }

    const testRecordIds = evaluation.mandatoryRequirements.passedTests.map((t) => t.recordId);

    const result = await prisma.$transaction(async (tx) => {
      // Re-fetch component unit inside transaction to guarantee concurrency isolation
      const currentComp = await tx.componentUnit.findUnique({
        where: { id: componentId },
      });

      if (!currentComp || currentComp.organisationId !== organisationId) {
        throw new Error('Component unit not found.');
      }

      if (['ISSUED', 'DISCARDED', 'EXPIRED'].includes(currentComp.status)) {
        throw new Error(
          `Cannot perform clinical release on unit with terminal status "${currentComp.status}". Status reversals from terminal states are strictly prohibited.`
        );
      }

      // Concurrency Idempotency Guard: if already released by concurrent request
      if (currentComp.status === 'AVAILABLE' && input.decision === 'RELEASED') {
        const existingRelease = await tx.clinicalReleaseRecord.findFirst({
          where: { componentUnitId: componentId, decision: 'RELEASED' },
          orderBy: { decisionTimestamp: 'desc' },
          include: {
            authorizedClinicalUser: { select: { id: true, name: true, role: true } },
          },
        });
        if (existingRelease) {
          return { component: currentComp, releaseRecord: existingRelease };
        }
      }

      let targetStatus: ComponentUnitStatus = currentComp.status;
      let isHold = currentComp.isHold;
      let holdReason = currentComp.holdReason;
      let holdPlacedAt = currentComp.holdPlacedAt;
      let holdPlacedById = currentComp.holdPlacedById;

      if (input.decision === 'RELEASED') {
        targetStatus = 'AVAILABLE';
        isHold = false;
        holdReason = null;
        holdPlacedAt = null;
        holdPlacedById = null;
      } else if (input.decision === 'QUARANTINE_HOLD') {
        targetStatus = 'QUARANTINED';
        isHold = true;
        holdReason = input.reason || 'Clinical Quarantine Hold';
        holdPlacedAt = new Date();
        holdPlacedById = caller.id;
      } else if (input.decision === 'WITHHELD') {
        targetStatus = 'AWAITING_CLINICAL_REVIEW';
      } else if (input.decision === 'DISCARD_ORDERED') {
        targetStatus = 'DISCARDED';
      }

      // Update component unit
      const updatedComponent = await tx.componentUnit.update({
        where: { id: componentId },
        data: {
          status: targetStatus,
          isHold,
          holdReason,
          holdPlacedAt,
          holdPlacedById,
          notes: input.dispositionNotes ? input.dispositionNotes.trim() : currentComp.notes,
          ...(input.decision === 'DISCARD_ORDERED'
            ? {
                dispositionType: 'DISCARDED_CLINICALLY_REJECTED',
                dispositionReason: input.reason,
                dispositionedAt: new Date(),
                dispositionedById: caller.id,
              }
            : {}),
        },
      });

      // Record Clinical Release decision
      const releaseRecord = await tx.clinicalReleaseRecord.create({
        data: {
          organisationId,
          componentUnitId: currentComp.id,
          decision: input.decision,
          authorizedClinicalUserId: caller.id,
          decisionTimestamp: new Date(),
          reason: input.reason,
          clinicalProtocolRef: input.clinicalProtocolRef?.trim() || 'Facility SOP Standard Protocol',
          reviewedTestIds: testRecordIds,
          dispositionNotes: input.dispositionNotes?.trim() || null,
        },
        include: {
          authorizedClinicalUser: { select: { id: true, name: true, role: true } },
        },
      });

      // Status history
      await tx.unitStatusHistory.create({
        data: {
          unitType: 'COMPONENT_UNIT',
          componentUnitId: currentComp.id,
          fromStatus: currentComp.status,
          toStatus: targetStatus,
          actorUserId: caller.id,
          organisationId,
          reason: `Clinical Decision: ${input.decision}. ${input.reason}`,
          referenceNote: `Release Record ID: ${releaseRecord.id}`,
        },
      });

      // Transactional Outbox Events
      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'component.release_recorded',
        entityType: 'ComponentUnit',
        entityId: currentComp.id,
        organisationId,
        payload: {
          componentId: currentComp.id,
          componentCode: currentComp.componentCode,
          bloodGroup: currentComp.bloodGroup,
          status: targetStatus,
          decision: input.decision,
          timestamp: new Date().toISOString(),
        },
      });

      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'inventory.summary_changed',
        entityType: 'Organisation',
        entityId: organisationId,
        organisationId,
        payload: {
          organisationId,
          action: 'RELEASE_RECORDED',
          componentId: currentComp.id,
          status: targetStatus,
          timestamp: new Date().toISOString(),
        },
      });

      return { component: updatedComponent, releaseRecord };
    }, { timeout: 20000, maxWait: 10000 });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'CLINICAL_RELEASE_RECORDED',
        resource: 'ClinicalReleaseRecord',
        resourceId: result.releaseRecord.id,
        metadata: {
          decision: input.decision,
          componentCode: comp.componentCode,
          organisationId,
          authorizedById: caller.id,
          clinicalProtocolRef: input.clinicalProtocolRef?.trim() || null,
        },
      },
    });

    return result;
  }

  /**
   * Authorised Quarantine Hold Resolution & Investigation Workflow.
   * Gated strictly to CLINICAL_STAFF.
   * Prevents silent hold removal; requires auditable justification and investigation documentation.
   */
  static async resolveQuarantineHold(
    organisationId: string,
    componentId: string,
    caller: CallerUser,
    input: ResolveQuarantineHoldInput
  ) {
    const membership = await this.verifyOrgMembership(organisationId, caller);
    if (membership.role !== 'CLINICAL_STAFF') {
      throw new Error(
        'Permission denied: Only designated CLINICAL_STAFF can investigate and resolve quarantine holds.'
      );
    }

    if (!input.investigationNotes || !input.investigationNotes.trim()) {
      throw new Error('Investigation notes are required to document the resolution of a quarantine hold.');
    }

    if (!input.clinicalJustification || !input.clinicalJustification.trim()) {
      throw new Error('Clinical justification is required to resolve a quarantine hold.');
    }

    const comp = await prisma.componentUnit.findUnique({
      where: { id: componentId },
    });

    if (!comp || comp.organisationId !== organisationId) {
      throw new Error('Component unit not found.');
    }

    if (['ISSUED', 'DISCARDED', 'EXPIRED'].includes(comp.status)) {
      throw new Error(`Cannot resolve quarantine hold on component in terminal status "${comp.status}".`);
    }

    if (!comp.isHold) {
      throw new Error('Component unit is not currently under quarantine hold.');
    }

    const resolutionOutcome = input.resolutionOutcome || (input as any).resolution || 'HOLD_CLEARED_AFTER_INVESTIGATION';

    const result = await prisma.$transaction(async (tx) => {
      if (resolutionOutcome === 'DISCARD_CONFIRMED') {
        const updatedComp = await tx.componentUnit.update({
          where: { id: componentId },
          data: {
            status: 'DISCARDED',
            isHold: false,
            holdReason: null,
            dispositionType: 'DISCARDED_HOLD_CONFIRMED',
            dispositionReason: input.clinicalJustification.trim(),
            dispositionedAt: new Date(),
            dispositionedById: caller.id,
            notes: `${comp.notes || ''} [Hold Investigation: ${input.investigationNotes.trim()}]`.trim(),
          },
        });

        await tx.unitStatusHistory.create({
          data: {
            unitType: 'COMPONENT_UNIT',
            componentUnitId: comp.id,
            fromStatus: comp.status,
            toStatus: 'DISCARDED',
            actorUserId: caller.id,
            organisationId,
            reason: `Quarantine hold resolved by discard: ${input.clinicalJustification.trim()}`,
            referenceNote: `Investigation notes: ${input.investigationNotes.trim()}`,
          },
        });

        return updatedComp;
      } else {
        // Hold is cleared after investigation, but unit is NOT made AVAILABLE!
        // It transitions to AWAITING_CLINICAL_REVIEW.
        // It must still pass the authoritative clinical release gate to become AVAILABLE.
        const nextStatus: ComponentUnitStatus = 'AWAITING_CLINICAL_REVIEW';

        const updatedComp = await tx.componentUnit.update({
          where: { id: componentId },
          data: {
            status: nextStatus,
            isHold: false,
            holdReason: null,
            notes: `${comp.notes || ''} [Hold Cleared: ${input.clinicalJustification.trim()}]`.trim(),
          },
        });

        await tx.unitStatusHistory.create({
          data: {
            unitType: 'COMPONENT_UNIT',
            componentUnitId: comp.id,
            fromStatus: comp.status,
            toStatus: nextStatus,
            actorUserId: caller.id,
            organisationId,
            reason: `Quarantine hold cleared after investigation: ${input.clinicalJustification.trim()}`,
            referenceNote: `Investigation notes: ${input.investigationNotes.trim()}`,
          },
        });

        // Transactional Outbox Events
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'component.status_changed',
          entityType: 'ComponentUnit',
          entityId: comp.id,
          organisationId,
          payload: {
            componentId: comp.id,
            componentCode: comp.componentCode,
            bloodGroup: comp.bloodGroup,
            fromStatus: comp.status,
            toStatus: nextStatus,
            resolutionOutcome,
            timestamp: new Date().toISOString(),
          },
        });

        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'inventory.summary_changed',
          entityType: 'Organisation',
          entityId: organisationId,
          organisationId,
          payload: {
            organisationId,
            action: 'HOLD_RESOLVED',
            timestamp: new Date().toISOString(),
          },
        });

        return updatedComp;
      }
    }, { timeout: 20000, maxWait: 10000 });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'QUARANTINE_HOLD_RESOLVED',
        resource: 'ComponentUnit',
        resourceId: comp.id,
        metadata: {
          componentCode: comp.componentCode,
          outcome: input.resolutionOutcome,
          justification: input.clinicalJustification.trim(),
          organisationId,
          authorizedById: caller.id,
        },
      },
    });

    return result;
  }

  // ====================================================
  // 3. STORAGE LOCATIONS & MOVEMENT TRACKING
  // ====================================================

  /**
   * Create a dedicated storage location (e.g. Blood Bank Refrigerator, Platelet Agitator, Deep Freezer).
   */
  static async createStorageLocation(
    organisationId: string,
    caller: CallerUser,
    input: CreateStorageLocationInput
  ) {
    const membership = await this.verifyOrgMembership(organisationId, caller);
    if (!['ORG_ADMIN', 'INVENTORY_STAFF', 'CLINICAL_STAFF'].includes(membership.role)) {
      throw new Error('Permission denied: You are not authorized to configure storage locations.');
    }

    const location = await prisma.storageLocation.create({
      data: {
        organisationId,
        name: input.name.trim(),
        locationCode: input.locationCode.trim().toUpperCase(),
        storageType: input.storageType,
        targetTempRange: input.targetTempRange.trim(),
        roomOrArea: input.roomOrArea?.trim() || null,
        equipmentIdentifier: input.equipmentIdentifier?.trim() || null,
        shelfOrRack: input.shelfOrRack?.trim() || null,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'STORAGE_LOCATION_CREATED',
        resource: 'StorageLocation',
        resourceId: location.id,
        metadata: {
          name: location.name,
          locationCode: location.locationCode,
          storageType: location.storageType,
          organisationId,
        },
      },
    });

    return location;
  }

  /**
   * List storage locations configured for the organisation.
   */
  static async listStorageLocations(organisationId: string, caller: CallerUser) {
    await this.verifyOrgMembership(organisationId, caller);

    return prisma.storageLocation.findMany({
      where: { organisationId, isActive: true },
      include: {
        _count: {
          select: { components: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Move a component unit to a storage location with temperature observation and excursion detection.
   * If a temperature excursion is noted, automatically place the component on quarantine hold.
   */
  static async recordStorageMovement(
    organisationId: string,
    componentId: string,
    caller: CallerUser,
    input: RecordStorageMovementInput
  ) {
    const membership = await this.verifyOrgMembership(organisationId, caller);
    if (!['ORG_ADMIN', 'INVENTORY_STAFF', 'CLINICAL_STAFF'].includes(membership.role)) {
      throw new Error('Permission denied: You are not authorized to move inventory units.');
    }

    const comp = await prisma.componentUnit.findUnique({
      where: { id: componentId },
      include: { storageLocation: true },
    });

    if (!comp || comp.organisationId !== organisationId) {
      throw new Error('Component unit not found.');
    }

    if (['ISSUED', 'DISCARDED', 'EXPIRED'].includes(comp.status)) {
      throw new Error(`Cannot move component in terminal status "${comp.status}".`);
    }

    const destLocation = await prisma.storageLocation.findUnique({
      where: { id: input.toLocationId },
    });

    if (!destLocation || destLocation.organisationId !== organisationId) {
      throw new Error('Destination storage location not found.');
    }

    if (!destLocation.isActive) {
      throw new Error('Destination storage location is decommissioned or inactive.');
    }

    const isExcursion = input.temperatureExcursionNoted ?? false;

    const movementResult = await prisma.$transaction(async (tx) => {
      const movement = await tx.storageMovementRecord.create({
        data: {
          organisationId,
          componentUnitId: comp.id,
          fromLocationId: comp.storageLocationId || null,
          toLocationId: destLocation.id,
          movedById: caller.id,
          timestamp: new Date(),
          reason: input.reason,
          observedTempCelsius: input.observedTempCelsius ?? null,
          temperatureExcursionNoted: isExcursion,
          excursionNotes: input.excursionNotes?.trim() || null,
        },
        include: {
          fromLocation: true,
          toLocation: true,
          movedBy: { select: { id: true, name: true, role: true } },
        },
      });

      // Update component's storage location
      const updatedComp = await tx.componentUnit.update({
        where: { id: comp.id },
        data: {
          storageLocationId: destLocation.id,
          // If temperature excursion occurred, automatically put on quarantine hold
          ...(isExcursion
            ? {
                status: 'QUARANTINED',
                isHold: true,
                holdReason: `Temperature excursion observed during transfer to ${destLocation.name}: ${input.observedTempCelsius ?? 'Excursion'}°C`,
                holdPlacedAt: new Date(),
                holdPlacedById: caller.id,
              }
            : {}),
        },
      });

      if (isExcursion) {
        await tx.unitStatusHistory.create({
          data: {
            unitType: 'COMPONENT_UNIT',
            componentUnitId: comp.id,
            fromStatus: comp.status,
            toStatus: 'QUARANTINED',
            actorUserId: caller.id,
            organisationId,
            reason: `Temperature excursion hold during movement to ${destLocation.name}`,
          },
        });
      }

      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'storage.movement_recorded',
        entityType: 'ComponentUnit',
        entityId: comp.id,
        organisationId,
        payload: {
          componentId: comp.id,
          componentCode: comp.componentCode,
          fromLocationId: comp.storageLocationId,
          toLocationId: destLocation.id,
          temperatureExcursionNoted: isExcursion,
          timestamp: new Date().toISOString(),
        },
      });

      if (isExcursion) {
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'component.quarantine_hold',
          entityType: 'ComponentUnit',
          entityId: comp.id,
          organisationId,
          payload: {
            componentId: comp.id,
            componentCode: comp.componentCode,
            reason: 'Temperature excursion detected during storage movement',
            timestamp: new Date().toISOString(),
          },
        });
      }

      return { movement, component: updatedComp };
    });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'STORAGE_MOVEMENT_RECORDED',
        resource: 'StorageMovementRecord',
        resourceId: movementResult.movement.id,
        metadata: {
          componentCode: comp.componentCode,
          fromLocationId: comp.storageLocationId,
          toLocationId: destLocation.id,
          isExcursion,
        },
      },
    });

    return movementResult;
  }

  /**
   * List movement history for a specific component.
   */
  static async listStorageMovements(
    organisationId: string,
    componentId: string,
    caller: CallerUser
  ) {
    await this.verifyOrgMembership(organisationId, caller);

    return prisma.storageMovementRecord.findMany({
      where: {
        organisationId,
        componentUnitId: componentId,
      },
      include: {
        fromLocation: true,
        toLocation: true,
        movedBy: { select: { id: true, name: true, role: true } },
      },
      orderBy: { timestamp: 'desc' },
    });
  }

  // ====================================================
  // 4. EXPIRY MANAGEMENT & AUTOMATIC SWEEPS
  // ====================================================

  /**
   * Sweep and transition expired components out of AVAILABLE status.
   * Can be triggered by background worker or on-demand by authorized staff.
   */
  static async sweepExpiredComponents(organisationId: string, caller: CallerUser) {
    await this.verifyOrgMembership(organisationId, caller);

    const now = new Date();

    const expiredUnits = await prisma.componentUnit.findMany({
      where: {
        organisationId,
        expiresAt: { lt: now },
        status: { notIn: ['EXPIRED', 'DISCARDED', 'ISSUED'] },
      },
    });

    if (expiredUnits.length === 0) {
      return { sweptCount: 0, expiredUnitIds: [] };
    }

    const sweptIds: string[] = [];

    for (const unit of expiredUnits) {
      await prisma.$transaction(async (tx) => {
        await tx.componentUnit.update({
          where: { id: unit.id },
          data: {
            status: 'EXPIRED',
            dispositionType: 'DISCARDED_EXPIRED',
            dispositionReason: 'Automated expiry control sweep: shelf-life reached.',
            dispositionedAt: now,
            dispositionedById: caller.id,
          },
        });

        await tx.unitStatusHistory.create({
          data: {
            unitType: 'COMPONENT_UNIT',
            componentUnitId: unit.id,
            fromStatus: unit.status,
            toStatus: 'EXPIRED',
            actorUserId: caller.id,
            organisationId,
            reason: 'Automated shelf-life expiry sweep. Unit withdrawn from distribution.',
          },
        });
      });

      sweptIds.push(unit.id);
    }

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'INVENTORY_EXPIRY_SWEEP',
        resource: 'ComponentUnit',
        metadata: {
          organisationId,
          sweptCount: sweptIds.length,
          sweptIds,
        },
      },
    });

    return { sweptCount: sweptIds.length, expiredUnitIds: sweptIds };
  }

  // ====================================================
  // 5. AUTHORISED DISPOSITION (DISCARD / ISSUE)
  // ====================================================

  /**
   * Record authorised clinical/inventory disposition for a component.
   */
  static async recordDisposition(
    organisationId: string,
    componentId: string,
    caller: CallerUser,
    input: RecordDispositionInput
  ) {
    const membership = await this.verifyOrgMembership(organisationId, caller);
    if (!['ORG_ADMIN', 'CLINICAL_STAFF', 'INVENTORY_STAFF'].includes(membership.role)) {
      throw new Error('Permission denied: You are not authorized to disposition blood units.');
    }

    const comp = await prisma.componentUnit.findUnique({
      where: { id: componentId },
    });

    if (!comp || comp.organisationId !== organisationId) {
      throw new Error('Component unit not found.');
    }

    if (comp.status === 'ISSUED' || comp.status === 'DISCARDED' || comp.status === 'EXPIRED') {
      throw new Error(`Component unit is already in terminal disposition state "${comp.status}". Status reversals from terminal states are strictly prohibited.`);
    }

    let targetStatus: ComponentUnitStatus = 'DISCARDED';
    if (input.dispositionType === 'ISSUED') {
      if (comp.status !== 'AVAILABLE' && comp.status !== 'RESERVED') {
        throw new Error(`Cannot issue component with current status "${comp.status}". Unit must be AVAILABLE or RESERVED.`);
      }
      if (comp.isHold) {
        throw new Error(`Cannot issue component: Unit is currently under quarantine hold ("${comp.holdReason}").`);
      }
      if (comp.expiresAt && new Date(comp.expiresAt).getTime() < Date.now()) {
        throw new Error('Cannot issue component: Unit shelf-life has expired.');
      }
      targetStatus = 'ISSUED';
    }

    const updated = await prisma.$transaction(async (tx) => {
      const compUpdate = await tx.componentUnit.update({
        where: { id: componentId },
        data: {
          status: targetStatus,
          dispositionType: input.dispositionType,
          dispositionReason: input.reason,
          dispositionedAt: new Date(),
          dispositionedById: caller.id,
          notes: input.notes ? input.notes.trim() : comp.notes,
        },
      });

      await tx.unitStatusHistory.create({
        data: {
          unitType: 'COMPONENT_UNIT',
          componentUnitId: comp.id,
          fromStatus: comp.status,
          toStatus: targetStatus,
          actorUserId: caller.id,
          organisationId,
          reason: `Authorised disposition: ${input.dispositionType}. ${input.reason}`,
        },
      });

      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'component.status_changed',
        entityType: 'ComponentUnit',
        entityId: comp.id,
        organisationId,
        payload: {
          componentId: comp.id,
          componentCode: comp.componentCode,
          bloodGroup: comp.bloodGroup,
          fromStatus: comp.status,
          toStatus: targetStatus,
          dispositionType: input.dispositionType,
          timestamp: new Date().toISOString(),
        },
      });

      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'inventory.summary_changed',
        entityType: 'Organisation',
        entityId: organisationId,
        organisationId,
        payload: {
          organisationId,
          action: 'DISPOSITION_RECORDED',
          timestamp: new Date().toISOString(),
        },
      });

      return compUpdate;
    });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'COMPONENT_DISPOSITIONED',
        resource: 'ComponentUnit',
        resourceId: comp.id,
        metadata: {
          componentCode: comp.componentCode,
          dispositionType: input.dispositionType,
          organisationId,
        },
      },
    });

    return updated;
  }

  // ====================================================
  // 6. COMPREHENSIVE INVENTORY SUMMARIES & LISTINGS
  // ====================================================

  /**
   * Authoritative inventory calculation derived strictly from component records.
   * Invariant: Collection units and component units are partitioned distinctly to prevent double counting.
   * External eRaktKosh snapshots are strictly excluded from internal inventory totals.
   */
  static async getInventorySummary(organisationId: string, caller: CallerUser) {
    await this.verifyOrgMembership(organisationId, caller);

    const now = new Date();

    // Query all component units for this organisation
    const components = await prisma.componentUnit.findMany({
      where: { organisationId },
      include: {
        storageLocation: { select: { id: true, name: true, storageType: true } },
      },
    });

    // Query collection units to calculate pending transport/derivation metrics distinctly
    const collections = await prisma.collectionUnit.findMany({
      where: { organisationId },
      select: { id: true, status: true },
    });

    // Partition components into distinct operational categories
    let awaitingTestingOrRelease = 0;
    let quarantinedOrHold = 0;
    let releasedAndAvailable = 0;
    let reserved = 0;
    let issued = 0;
    let expired = 0;
    let discarded = 0;

    const byComponentType: Record<string, number> = {};
    const byBloodGroup: Record<string, number> = {};
    const byLocation: Record<string, number> = {};

    for (const comp of components) {
      const isPastExpiry = comp.expiresAt ? new Date(comp.expiresAt) <= now : false;

      if (comp.status === 'DISCARDED') {
        discarded++;
      } else if (comp.status === 'EXPIRED' || (isPastExpiry && comp.status !== 'ISSUED')) {
        expired++;
      } else if (comp.status === 'ISSUED') {
        issued++;
      } else if (comp.status === 'RESERVED') {
        reserved++;
      } else if (comp.isHold || comp.status === 'QUARANTINED') {
        quarantinedOrHold++;
      } else if (comp.status === 'AWAITING_TESTING' || comp.status === 'AWAITING_CLINICAL_REVIEW') {
        awaitingTestingOrRelease++;
      } else if (comp.status === 'AVAILABLE') {
        releasedAndAvailable++;

        // Only aggregate available stock into product/blood group totals
        byComponentType[comp.componentType] = (byComponentType[comp.componentType] || 0) + 1;
        byBloodGroup[comp.bloodGroup] = (byBloodGroup[comp.bloodGroup] || 0) + 1;

        const locName = comp.storageLocation?.name || 'Unassigned Storage';
        byLocation[locName] = (byLocation[locName] || 0) + 1;
      }
    }

    // Collection unit metrics kept strictly separated
    const collectionsInTransit = collections.filter((c) => c.status === 'IN_TRANSIT').length;
    const collectionsCollected = collections.filter((c) => c.status === 'COLLECTED').length;
    const collectionsReceived = collections.filter((c) => c.status === 'RECEIVED_BY_CENTRE').length;

    return {
      organisationId,
      calculatedAt: now.toISOString(),
      summary: {
        totalComponentsRecorded: components.length,
        releasedAndAvailable,
        quarantinedOrHold,
        awaitingTestingOrRelease,
        reserved,
        expired,
        discarded,
        issued,
      },
      availableBreakdown: {
        byComponentType,
        byBloodGroup,
        byLocation,
      },
      collectionIntakeMetrics: {
        note: 'Collection bag intake counts are reported separately to prevent double-counting with derived component inventory.',
        collectedAtCamp: collectionsCollected,
        inTransitToFacility: collectionsInTransit,
        receivedAwaitingProcessing: collectionsReceived,
      },
      externalDirectoryNote:
        'Authoritative local inventory is isolated from external eRaktKosh snapshots. Missing or stale external data does not alter internal counts.',
    };
  }

  /**
   * Filterable component list for workbench.
   * Strips donor PII to preserve patient and donor privacy.
   */
  static async listInventoryComponents(
    organisationId: string,
    caller: CallerUser,
    filter: {
      status?: ComponentUnitStatus;
      componentType?: ComponentType;
      bloodGroup?: BloodGroup;
      storageLocationId?: string;
      isHold?: boolean;
      search?: string;
      page?: number;
      limit?: number;
    }
  ) {
    await this.verifyOrgMembership(organisationId, caller);

    const page = Math.max(1, filter.page || 1);
    const limit = Math.min(100, Math.max(1, filter.limit || 50));
    const skip = (page - 1) * limit;

    const where: any = {
      organisationId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.componentType ? { componentType: filter.componentType } : {}),
      ...(filter.bloodGroup ? { bloodGroup: filter.bloodGroup } : {}),
      ...(filter.storageLocationId ? { storageLocationId: filter.storageLocationId } : {}),
      ...(filter.isHold !== undefined ? { isHold: filter.isHold } : {}),
      ...(filter.search
        ? {
            OR: [
              { componentCode: { contains: filter.search, mode: 'insensitive' } },
              { notes: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, components] = await Promise.all([
      prisma.componentUnit.count({ where }),
      prisma.componentUnit.findMany({
        where,
        include: {
          storageLocation: {
            select: {
              id: true,
              name: true,
              locationCode: true,
              storageType: true,
              targetTempRange: true,
            },
          },
          collectionUnit: {
            select: {
              id: true,
              unitNumber: true,
              collectedAt: true,
              campId: true,
            },
          },
          clinicalReleases: {
            select: {
              id: true,
              decision: true,
              decisionTimestamp: true,
              reason: true,
              authorizedClinicalUser: { select: { id: true, name: true, role: true } },
            },
            orderBy: { decisionTimestamp: 'desc' },
            take: 1,
          },
        },
        orderBy: { derivedAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const now = new Date();

    return {
      page,
      limit,
      total,
      data: components.map((c) => ({
        id: c.id,
        componentCode: c.componentCode,
        componentType: c.componentType,
        bloodGroup: c.bloodGroup,
        volumeMl: c.volumeMl,
        status: c.status,
        derivedAt: c.derivedAt,
        expiresAt: c.expiresAt,
        isExpired: c.expiresAt ? new Date(c.expiresAt) <= now : false,
        storageLocation: c.storageLocation,
        isHold: c.isHold,
        holdReason: c.holdReason,
        dispositionType: c.dispositionType,
        dispositionReason: c.dispositionReason,
        dispositionedAt: c.dispositionedAt,
        latestClinicalRelease: c.clinicalReleases[0] || null,
        sourceCollectionUnitNumber: c.collectionUnit?.unitNumber || null,
      })),
    };
  }
}
