import { prisma } from '../lib/prisma';
import crypto from 'crypto';
import { normalizePhoneNumber } from './auth';
import { RealtimeService } from './realtime';
import {
  CampStatus,
  OrgRole,
  CampStaffRole,
  AttendanceStatus,
  ScreeningStatus,
  DonationOutcome,
  DonationType,
  BloodGroup,
} from '@prisma/client';

export interface VerifyCampReadinessInput {
  isReadyForCollection: boolean;
  readinessChecklist?: {
    staffAssigned?: boolean;
    coldChainVerified?: boolean;
    emergencyKitAvailable?: boolean;
    consumablesStocked?: boolean;
    spaceSanitized?: boolean;
  };
  readinessNotes?: string;
}

export interface RegisterCampAttendanceInput {
  phoneOrUserId: string;
  donorName?: string;
  bloodGroup?: string;
}

export interface RecordClinicalScreeningInput {
  consentVersion?: string;
  consentGiven: boolean;
  eligibilityDecision: 'CLEARED' | 'TEMPORARY_DEFERRAL' | 'PERMANENT_DEFERRAL';
  deferralCategory?: 'LOW_HEMOGLOBIN' | 'RECENT_ILLNESS' | 'MEDICATION' | 'WEIGHT_CRITERIA' | 'OTHER';
  deferralDurationDays?: number;
  clinicalNotes?: string;
}

export interface AmendClinicalScreeningInput {
  eligibilityDecision: 'CLEARED' | 'TEMPORARY_DEFERRAL' | 'PERMANENT_DEFERRAL';
  deferralCategory?: 'LOW_HEMOGLOBIN' | 'RECENT_ILLNESS' | 'MEDICATION' | 'WEIGHT_CRITERIA' | 'OTHER';
  deferralDurationDays?: number;
  clinicalNotes?: string;
  amendmentReason: string;
}

export interface RecordDonationEventInput {
  bloodGroup: string;
  donationType?: DonationType;
  outcome: DonationOutcome;
  volumeMl?: number;
  adverseReaction?: boolean;
  adverseReactionNotes?: string;
  notes?: string;
}

export interface CallerUser {
  id: string;
  role: string;
  phoneNumber?: string;
  name?: string | null;
}

export class CampOperationsService {
  /**
   * Helper: check caller's membership in the organisation that owns the camp OR explicit camp staff assignment.
   */
  private static async getCampWithOrgCheck(campId: string, caller?: CallerUser) {
    const camp = await prisma.camp.findUnique({
      where: { id: campId },
      include: {
        organisation: true,
        bloodCentre: true,
      },
    });

    if (!camp) {
      throw new Error('Camp not found.');
    }

    if (!caller) {
      return { camp, membership: null, campStaffAssignment: null };
    }

    let membership = null;
    if (camp.organisationId) {
      membership = await prisma.organisationMembership.findUnique({
        where: {
          userId_organisationId: {
            userId: caller.id,
            organisationId: camp.organisationId,
          },
        },
      });
    }

    let campStaffAssignment = await prisma.campStaffAssignment.findFirst({
      where: {
        campId,
        userId: caller.id,
        OR: [
          { isActive: true },
          { camp: { status: 'COMPLETED' } },
        ],
      },
      orderBy: { assignedAt: 'desc' },
    });

    // If caller is the designated camp creator and camp is approved, automatically ensure CAMP_ADMIN assignment is active
    if (!campStaffAssignment && camp.createdById === caller.id && camp.status === 'APPROVED') {
      campStaffAssignment = await prisma.campStaffAssignment.upsert({
        where: {
          userId_campId_role: {
            userId: caller.id,
            campId,
            role: 'CAMP_ADMIN',
          },
        },
        update: { isActive: true },
        create: {
          campId,
          userId: caller.id,
          organisationId: camp.organisationId || '',
          role: 'CAMP_ADMIN',
          isActive: true,
          assignedBy: camp.approvedById || caller.id,
        },
      });
    }

    return { camp, membership, campStaffAssignment };
  }

  /**
   * Helper: check caller's authorized read access to camp details, operational metrics, and attendance.
   * Authorized viewers:
   * - Platform Admin
   * - Active member of the camp's parent organisation (ORG_ADMIN, CLINICAL_STAFF, COLLECTION_STAFF, CAMP_COORDINATOR, INVENTORY_STAFF)
   * - Assigned camp staff (active assignment, or historical assignment for COMPLETED camps)
   * - Designated camp creator
   */
  public static checkCampReadAccess(
    camp: any,
    membership: any,
    campStaffAssignment: any,
    caller?: CallerUser
  ): boolean {
    if (!caller) return false;
    if (caller.role === 'ADMIN') return true;
    if (membership && membership.isActive) return true;
    if (campStaffAssignment && (campStaffAssignment.isActive || camp.status === 'COMPLETED')) return true;
    if (camp.createdById === caller.id) return true;
    return false;
  }

  // ====================================================
  // 1. CAMP MANAGEMENT & READINESS
  // ====================================================

  /**
   * Edit camp details (venue, targetDate, timeSlot, expectedDonors, etc.).
   * Restricted to ORG_ADMIN, COLLECTION_STAFF of parent organisation or Platform ADMIN.
   */
  static async editCamp(
    campId: string,
    caller: CallerUser,
    input: {
      title?: string;
      venue?: string;
      targetDate?: string;
      timeSlot?: string;
      expectedDonors?: number;
      coordinatorContact?: string;
    }
  ) {
    const { camp, membership, campStaffAssignment } = await this.getCampWithOrgCheck(campId, caller);

    const isOrgStaff = membership && membership.isActive && ['ORG_ADMIN', 'COLLECTION_STAFF'].includes(membership.role);
    const isCampStaff = campStaffAssignment && campStaffAssignment.isActive && ['CAMP_ADMIN', 'CAMP_COORDINATOR'].includes(campStaffAssignment.role);

    if (!isOrgStaff && !isCampStaff) {
      throw new Error('Permission denied: Only Camp Admin, assigned coordinator, or parent blood bank administrator can edit camp details.');
    }

    if (camp.status === 'COMPLETED' || camp.status === 'CANCELLED') {
      throw new Error(`Cannot edit camp in ${camp.status} state.`);
    }

    const updateData: any = {};
    if (input.title) updateData.title = input.title.trim();
    if (input.venue) updateData.venue = input.venue.trim();
    if (input.timeSlot) updateData.timeSlot = input.timeSlot.trim();
    if (input.coordinatorContact) updateData.coordinatorContact = input.coordinatorContact.trim();
    if (input.expectedDonors !== undefined) {
      const donors = Number(input.expectedDonors);
      if (isNaN(donors) || donors <= 0) {
        throw new Error('Expected donors must be a positive integer.');
      }
      updateData.expectedDonors = donors;
    }
    if (input.targetDate) {
      const parsedDate = new Date(input.targetDate);
      if (isNaN(parsedDate.getTime())) {
        throw new Error('Invalid target date format.');
      }
      updateData.targetDate = parsedDate;
    }

    const updated = await prisma.camp.update({
      where: { id: campId },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'CAMP_UPDATED',
        resource: 'Camp',
        resourceId: campId,
        metadata: {
          organisationId: camp.organisationId,
          fieldsUpdated: Object.keys(updateData),
        },
      },
    });

    return updated;
  }

  /**
   * Retrieve camp details with appropriate privacy masking.
   */
  static async getCampDetails(campId: string, caller?: CallerUser) {
    const { camp, membership, campStaffAssignment } = await this.getCampWithOrgCheck(campId, caller);

    const hasReadAccess = this.checkCampReadAccess(camp, membership, campStaffAssignment, caller);

    // Public callers cannot view unapproved or rejected camps
    if (!hasReadAccess && camp.status !== 'APPROVED' && camp.status !== 'COMPLETED') {
      throw new Error('Camp not found.');
    }

    if (caller && !hasReadAccess) {
      throw new Error('Permission denied: You do not have access to this camp.');
    }

    // Include operational summary counts and blood collection analytics for members or assigned camp staff
    let counts = null;
    let analytics = null;
    if (hasReadAccess) {
      analytics = await this.getCampAnalytics(campId, caller);
      counts = {
        registeredDonors: analytics.registeredDonors,
        checkedInDonors: analytics.checkedInDonors,
        awaitingCounselling: analytics.awaitingCounselling,
        awaitingScreening: analytics.awaitingScreening,
        clinicallyCleared: analytics.clearedScreeningDonors,
        completedDonations: analytics.completedDonations,
      };
    }

    return {
      camp: {
        id: camp.id,
        campCode: camp.campCode,
        title: camp.title,
        organizerName: camp.organizerName,
        targetDate: camp.targetDate,
        timeSlot: camp.timeSlot,
        venue: camp.venue,
        district: camp.district,
        districtCode: camp.districtCode,
        stateCode: camp.stateCode,
        expectedDonors: camp.expectedDonors,
        coordinatorContact: hasReadAccess ? camp.coordinatorContact : undefined,
        status: camp.status,
        isReadyForCollection: camp.isReadyForCollection,
        readinessVerifiedAt: camp.readinessVerifiedAt,
        readinessVerifiedBy: hasReadAccess ? camp.readinessVerifiedBy : undefined,
        readinessChecklist: hasReadAccess ? camp.readinessChecklist : undefined,
        readinessNotes: hasReadAccess ? camp.readinessNotes : undefined,
        organisation: camp.organisation
          ? {
              id: camp.organisation.id,
              name: camp.organisation.name,
              orgCode: camp.organisation.orgCode,
              status: camp.organisation.status,
            }
          : null,
      },
      counts,
      analytics,
    };
  }

  /**
   * Retrieve authoritative blood collection overview and blood-group-wise metrics for a camp.
   */
  static async getCampAnalytics(campId: string, caller?: CallerUser) {
    const { camp, membership, campStaffAssignment } = await this.getCampWithOrgCheck(campId, caller);

    const hasReadAccess = this.checkCampReadAccess(camp, membership, campStaffAssignment, caller);

    if (caller && !hasReadAccess) {
      throw new Error('Permission denied: You do not have access to this camp analytics.');
    }

    if (!hasReadAccess && camp.status !== 'APPROVED' && camp.status !== 'COMPLETED') {
      throw new Error('Camp not found.');
    }

    // 1. Fetch all camp attendances with screening and completed donation events
    const attendances = await prisma.campAttendance.findMany({
      where: { campId },
      include: {
        screening: true,
        donationEvent: {
          include: {
            collectionUnit: {
              include: {
                components: true,
                handoverItems: {
                  include: {
                    manifest: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // 2. Fetch all collection units explicitly assigned to this camp
    const collectionUnits = await prisma.collectionUnit.findMany({
      where: { campId },
      include: {
        components: true,
        handoverItems: {
          include: {
            manifest: true,
          },
        },
      },
    });

    // Merge collection units by ID to ensure 1:1 uniqueness and prevent double-counting
    const unitMap = new Map<string, typeof collectionUnits[0]>();
    for (const cu of collectionUnits) {
      unitMap.set(cu.id, cu);
    }
    for (const a of attendances) {
      if (a.donationEvent?.collectionUnit) {
        unitMap.set(a.donationEvent.collectionUnit.id, a.donationEvent.collectionUnit as any);
      }
    }

    // Unresolved discrepancies for manifests originating from this camp
    const unresolvedDiscrepancies = await prisma.reconciliationException.count({
      where: {
        manifest: { campId },
        status: { not: 'RESOLVED' },
      },
    });

    // Standard blood groups
    const standardGroups = [
      { key: 'A_POS', label: 'A+' },
      { key: 'A_NEG', label: 'A-' },
      { key: 'B_POS', label: 'B+' },
      { key: 'B_NEG', label: 'B-' },
      { key: 'AB_POS', label: 'AB+' },
      { key: 'AB_NEG', label: 'AB-' },
      { key: 'O_POS', label: 'O+' },
      { key: 'O_NEG', label: 'O-' },
      { key: 'UNKNOWN', label: 'Unknown / Unverified' },
    ];

    const groupMetricsMap = new Map<string, {
      bloodGroup: string;
      label: string;
      registeredDonors: number;
      checkedInDonors: number;
      screenedDonors: number;
      completedDonations: number;
      totalVolumeMl: number;
      confirmedUnits: number;
      awaitingDispatchUnits: number;
      dispatchedUnits: number;
      receivedUnits: number;
      releasedUnits: number;
    }>();

    for (const g of standardGroups) {
      groupMetricsMap.set(g.key, {
        bloodGroup: g.key,
        label: g.label,
        registeredDonors: 0,
        checkedInDonors: 0,
        screenedDonors: 0,
        completedDonations: 0,
        totalVolumeMl: 0,
        confirmedUnits: 0,
        awaitingDispatchUnits: 0,
        dispatchedUnits: 0,
        receivedUnits: 0,
        releasedUnits: 0,
      });
    }

    const normalizeGroupKey = (bg?: string | null): string => {
      if (!bg) return 'UNKNOWN';
      const clean = bg.trim().toUpperCase();
      if (groupMetricsMap.has(clean)) return clean;
      return 'UNKNOWN';
    };

    // Fetch all donor_registrations records for this camp
    let donorRegistrations: any[] = [];
    try {
      donorRegistrations = await prisma.$queryRawUnsafe(`
        SELECT id, registration_number, donor_user_id, workflow_status, current_step,
               counselling_status, screening_status, medical_decision, collection_status,
               volume_ml, unit_number, barcode,
               donor_details->>'bloodGroup' as blood_group, created_at
        FROM donor_registrations
        WHERE camp_id = $1
      `, campId);
    } catch (regErr) {
      console.warn('[CampOperationsService] Could not query donor_registrations for analytics:', regErr);
    }

    let totalRegistered = 0;
    let totalCheckedIn = 0;
    let totalAwaitingCounselling = 0;
    let totalAwaitingScreening = 0;
    let totalScreened = 0;
    let totalCleared = 0;
    let totalDeferred = 0;
    let totalCompletedDonations = 0;
    let totalVolumeMl = 0;
    let totalConfirmedUnits = 0;

    const countedUserIds = new Set<string>();

    for (const att of attendances) {
      if (att.status === 'CANCELLED') continue;

      const groupKey = normalizeGroupKey(att.bloodGroup || att.donationEvent?.bloodGroup);
      const metrics = groupMetricsMap.get(groupKey)!;

      totalRegistered++;
      if (att.userId) countedUserIds.add(att.userId);
      metrics.registeredDonors++;

      if (att.status === 'CHECKED_IN') {
        totalCheckedIn++;
        metrics.checkedInDonors++;
      }

      if (att.screening) {
        if (att.screening.status === 'CLEARED' || att.screening.status === 'DEFERRED') {
          totalScreened++;
          metrics.screenedDonors++;
          if (att.screening.status === 'CLEARED') totalCleared++;
          if (att.screening.status === 'DEFERRED') totalDeferred++;
        }
      }

      if (att.donationEvent && att.donationEvent.outcome === 'COMPLETED') {
        totalCompletedDonations++;
        metrics.completedDonations++;
        const vol = att.donationEvent.volumeMl || 0;
        totalVolumeMl += vol;
        metrics.totalVolumeMl += vol;
      }
    }

    for (const dr of donorRegistrations) {
      const isAlreadyCounted = dr.donor_user_id && countedUserIds.has(dr.donor_user_id);
      if (!isAlreadyCounted) {
        totalRegistered++;
        if (dr.donor_user_id) countedUserIds.add(dr.donor_user_id);
        const groupKey = normalizeGroupKey(dr.blood_group);
        const metrics = groupMetricsMap.get(groupKey)!;
        metrics.registeredDonors++;
      }

      // Tally workflow stages
      if (dr.workflow_status === 'COUNSELLING_PENDING' || dr.workflow_status === 'COUNSELLING_IN_PROGRESS') {
        totalAwaitingCounselling++;
      } else if (dr.workflow_status === 'SCREENING_PENDING') {
        totalAwaitingScreening++;
      }

      // If registered via wizard and not already counted via attendance screening
      if (!isAlreadyCounted) {
        if (dr.workflow_status === 'CLEARED_FOR_COLLECTION' || dr.medical_decision === 'FIT') {
          totalCleared++;
          totalScreened++;
        } else if (dr.workflow_status === 'DEFERRED' || dr.counselling_status === 'DEFERRED' || dr.screening_status === 'DEFERRED') {
          totalDeferred++;
          totalScreened++;
        } else if (dr.workflow_status === 'COLLECTION_COMPLETED' || dr.collection_status === 'COMPLETED' || dr.collection_status === 'COLLECTED') {
          totalCompletedDonations++;
          const vol = dr.volume_ml ? Number(dr.volume_ml) : 450;
          totalVolumeMl += vol;
          const groupKey = normalizeGroupKey(dr.blood_group);
          const metrics = groupMetricsMap.get(groupKey)!;
          metrics.completedDonations++;
          metrics.totalVolumeMl += vol;
          if (dr.unit_number) {
            totalConfirmedUnits++;
            metrics.confirmedUnits++;
          }
          if (dr.medical_decision === 'FIT') {
            totalCleared++;
            totalScreened++;
          }
        }
      }
    }

    let totalAwaitingDispatch = 0;
    let totalDispatched = 0;
    let totalReceived = 0;
    let totalProcessing = 0;
    let totalReleased = 0;

    for (const unit of unitMap.values()) {
      totalConfirmedUnits++;
      const groupKey = normalizeGroupKey(unit.bloodGroup);
      const metrics = groupMetricsMap.get(groupKey)!;
      metrics.confirmedUnits++;

      if (unit.status === 'COLLECTED' || unit.status === 'PREPARED_FOR_HANDOVER') {
        totalAwaitingDispatch++;
        metrics.awaitingDispatchUnits++;
      } else if (unit.status === 'IN_TRANSIT') {
        totalDispatched++;
        metrics.dispatchedUnits++;
      } else if (unit.status === 'RECEIVED_BY_CENTRE' || unit.status === 'PROCESSING_COMPLETED') {
        totalReceived++;
        metrics.receivedUnits++;
      } else if (unit.status === 'QUARANTINED') {
        totalProcessing++;
      }

      // Check derived components authorized for release
      if (unit.components && unit.components.length > 0) {
        for (const comp of unit.components) {
          if (comp.status === 'AVAILABLE') {
            totalReleased++;
            metrics.releasedUnits++;
          }
        }
      }
    }

    const expectedDonors = camp.expectedDonors || 0;
    const targetCompletionPercentage = expectedDonors > 0
      ? Math.round((totalCompletedDonations / expectedDonors) * 100)
      : 0;

    return {
      registeredDonors: totalRegistered,
      checkedInDonors: totalCheckedIn,
      checkedIn: totalCheckedIn,
      awaitingCounselling: totalAwaitingCounselling,
      awaitingScreening: totalAwaitingScreening,
      screenedDonors: totalScreened,
      clearedScreeningDonors: totalCleared,
      clinicallyCleared: totalCleared,
      deferredScreeningDonors: totalDeferred,
      completedDonations: totalCompletedDonations,
      totalVolumeMl,
      totalVolumeLiters: Number((totalVolumeMl / 1000).toFixed(2)),
      confirmedUnits: totalConfirmedUnits,
      totalConfirmedUnits,
      awaitingDispatchUnits: totalAwaitingDispatch,
      dispatchedUnits: totalDispatched,
      receivedUnits: totalReceived,
      processingUnits: totalProcessing,
      releasedUnits: totalReleased,
      expectedDonors,
      targetDonations: expectedDonors,
      targetCompletionPercentage,
      targetProgressPercent: targetCompletionPercentage,
      handoverDiscrepancies: unresolvedDiscrepancies,
      byBloodGroup: Array.from(groupMetricsMap.values()),
      bloodGroups: Array.from(groupMetricsMap.values()),
      bloodGroupBreakdown: Object.fromEntries(
        Array.from(groupMetricsMap.entries()).map(([k, v]) => [k, v.confirmedUnits])
      ),
    };
  }

  /**
   * Verify camp operational readiness boundary.
   * Operational readiness requires explicit verification and mandatory checklist completion.
   */
  static async verifyCampReadiness(
    campId: string,
    caller: CallerUser,
    input: VerifyCampReadinessInput
  ) {
    const { camp, membership, campStaffAssignment } = await this.getCampWithOrgCheck(campId, caller);

    const isOrgStaff = membership && membership.isActive && ['ORG_ADMIN', 'COLLECTION_STAFF'].includes(membership.role);
    const isCampStaff = campStaffAssignment && campStaffAssignment.isActive && ['CAMP_ADMIN', 'CAMP_COORDINATOR', 'COLLECTION_STAFF'].includes(campStaffAssignment.role);

    if (!isOrgStaff && !isCampStaff) {
      throw new Error('Permission denied: Only authorised organisation staff or assigned camp administrator/coordinator can verify camp readiness.');
    }

    if (camp.status !== 'APPROVED') {
      throw new Error(`Cannot verify operational readiness for a camp in status "${camp.status}". Camp must be APPROVED first.`);
    }

    if (input.isReadyForCollection) {
      const cl = input.readinessChecklist;
      if (
        !cl ||
        !cl.staffAssigned ||
        !cl.coldChainVerified ||
        !cl.emergencyKitAvailable ||
        !cl.consumablesStocked ||
        !cl.spaceSanitized
      ) {
        throw new Error('All required operational readiness checklist items must be verified before declaring the camp ready for collection.');
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const campRecord = await tx.camp.update({
        where: { id: campId },
        data: {
          isReadyForCollection: input.isReadyForCollection,
          readinessVerifiedAt: input.isReadyForCollection ? new Date() : null,
          readinessVerifiedBy: input.isReadyForCollection ? caller.id : null,
          readinessChecklist: (input.readinessChecklist as any) || undefined,
          readinessNotes: input.readinessNotes || null,
        },
      });

      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'camp.readiness_verified',
        entityType: 'Camp',
        entityId: campId,
        organisationId: camp.organisationId || undefined,
        payload: {
          campId,
          isReadyForCollection: input.isReadyForCollection,
          readinessVerifiedAt: campRecord.readinessVerifiedAt?.toISOString() || null,
          readinessNotes: input.readinessNotes || null,
        },
      });

      return campRecord;
    }, { timeout: 15000, maxWait: 10000 });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: input.isReadyForCollection ? 'CAMP_READINESS_VERIFIED' : 'CAMP_READINESS_REVOKED',
        resource: 'Camp',
        resourceId: campId,
        metadata: {
          organisationId: camp.organisationId,
          isReadyForCollection: input.isReadyForCollection,
          checklist: input.readinessChecklist,
        },
      },
    });

    return updated;
  }

  // ====================================================
  // 2. DONOR REGISTRATION & ATTENDANCE
  // ====================================================

  /**
   * Register donor for camp attendance.
   * Reuses existing User and DonorProfile when available.
   * Strictly enforces duplicate attendance prevention per camp.
   */
  static async registerAttendance(
    campId: string,
    caller: CallerUser,
    input: RegisterCampAttendanceInput
  ) {
    const { camp, membership, campStaffAssignment } = await this.getCampWithOrgCheck(campId, caller);

    if (camp.status !== 'APPROVED') {
      throw new Error(`Cannot register attendance for a camp in status "${camp.status}". Camp must be APPROVED first.`);
    }

    if (!camp.isReadyForCollection) {
      throw new Error('Camp is not ready for operations: Operational readiness must be verified before attendance registration.');
    }

    const isStaff = (membership && membership.isActive) || (campStaffAssignment && campStaffAssignment.isActive);
    const isPlatformAdmin = caller.role === 'ADMIN';

    // Self-registration is allowed if caller is registering themselves, OR staff can register on donor's behalf
    const phoneOrId = input.phoneOrUserId.trim();

    // Validate phone number if provided
    if (/^\d+$/.test(phoneOrId) && phoneOrId.length !== 10) {
      throw new Error('Invalid mobile number: Must be a 10-digit phone number.');
    }

    // Validate blood group if provided (UNKNOWN / undefined allowed)
    const validBloodGroups = ['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG'];
    const bloodGroupInput = (input.bloodGroup === 'UNKNOWN' || !input.bloodGroup) ? undefined : input.bloodGroup;
    if (bloodGroupInput && !validBloodGroups.includes(bloodGroupInput)) {
      throw new Error(`Invalid blood group "${bloodGroupInput}". Must be one of: ${validBloodGroups.join(', ')}.`);
    }

    // Resolve user: normalize phone number if possible
    let normalizedPhone: string | null = null;
    try {
      normalizedPhone = normalizePhoneNumber(phoneOrId);
    } catch {
      if (/^\d{10}$/.test(phoneOrId)) {
        normalizedPhone = `+91${phoneOrId}`;
      }
    }

    let targetUser = await prisma.user.findFirst({
      where: {
        OR: [
          { id: phoneOrId },
          ...(normalizedPhone ? [{ phoneNumber: normalizedPhone }] : []),
          { phoneNumber: phoneOrId },
        ],
      },
      include: { donorProfile: true },
    });

    if (!targetUser) {
      // If staff is registering a new donor walk-in with a phone number
      const phoneToUse = normalizedPhone || (phoneOrId.startsWith('+') ? phoneOrId : `+91${phoneOrId.slice(-10)}`);
      if (phoneToUse.startsWith('+') || /^\d{10,12}$/.test(phoneToUse)) {
        try {
          targetUser = await prisma.user.create({
            data: {
              phoneNumber: phoneToUse,
              name: input.donorName || 'Voluntary Donor',
              role: 'DONOR',
            },
            include: { donorProfile: true },
          });
        } catch (err: any) {
          if (err.code === 'P2002' || err.message?.includes('Unique constraint')) {
            targetUser = await prisma.user.findFirst({
              where: {
                OR: [{ phoneNumber: phoneToUse }, { phoneNumber: phoneOrId }],
              },
              include: { donorProfile: true },
            });
          }
          if (!targetUser) {
            throw new Error('An account with this phone number already exists or could not be processed.');
          }
        }
      } else {
        throw new Error('User not found. Provide a valid user ID or 10-digit mobile number.');
      }
    }

    // Permission check: if registering someone else, caller must be staff
    if (caller.id !== targetUser.id && !isStaff && !isPlatformAdmin) {
      throw new Error('Permission denied: You can only register your own attendance.');
    }

    // Prevent duplicate attendance for the same donor at this camp
    const existing = await prisma.campAttendance.findUnique({
      where: {
        campId_userId: {
          campId,
          userId: targetUser.id,
        },
      },
    });

    if (existing) {
      if (existing.status === 'CANCELLED') {
        // Re-activate cancelled registration
        const reactivated = await prisma.campAttendance.update({
          where: { id: existing.id },
          data: {
            status: 'REGISTERED',
            cancellationReason: null,
            cancelledAt: null,
          },
        });
        return reactivated;
      }
      throw new Error('Donor is already registered for this camp.');
    }

    // Preserve existing donor's authoritative blood group rather than overwriting
    const bloodGroupValue = targetUser.donorProfile?.bloodGroup || (bloodGroupInput as BloodGroup) || null;

    const attendance = await prisma.$transaction(async (tx) => {
      const record = await tx.campAttendance.create({
        data: {
          campId,
          userId: targetUser.id,
          donorProfileId: targetUser.donorProfile?.id || null,
          donorName: input.donorName || targetUser.name || 'Anonymous Donor',
          donorPhone: targetUser.phoneNumber,
          bloodGroup: bloodGroupValue,
          status: 'REGISTERED',
        },
      });

      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'camp.attendance_registered',
        entityType: 'CampAttendance',
        entityId: record.id,
        organisationId: camp.organisationId || undefined,
        recipientUserId: targetUser.id,
        payload: {
          campId,
          attendanceId: record.id,
          userId: targetUser.id,
          donorName: record.donorName,
          donorPhone: record.donorPhone,
          bloodGroup: record.bloodGroup,
          status: record.status,
          registeredAt: record.registeredAt.toISOString(),
        },
      });

      return record;
    }, { timeout: 15000, maxWait: 10000 });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'CAMP_ATTENDANCE_REGISTERED',
        resource: 'CampAttendance',
        resourceId: attendance.id,
        metadata: {
          campId,
          donorUserId: targetUser.id,
        },
      },
    });

    return attendance;
  }

  /**
   * Check in donor upon arrival at camp.
   * Requires camp:attendance permission.
   */
  static async checkInAttendance(campId: string, attendanceId: string, caller: CallerUser) {
    const { camp, membership, campStaffAssignment } = await this.getCampWithOrgCheck(campId, caller);

    if (camp.status !== 'APPROVED') {
      throw new Error(`Cannot check in donors for a camp in status "${camp.status}". Camp must be APPROVED first.`);
    }

    if (!camp.isReadyForCollection) {
      throw new Error('Camp is not ready for operations: Operational readiness must be verified before checking in donors.');
    }

    const isOrgStaff = membership && membership.isActive && ['ORG_ADMIN', 'COLLECTION_STAFF', 'CLINICAL_STAFF', 'INVENTORY_STAFF'].includes(membership.role);
    const isCampStaff = campStaffAssignment && campStaffAssignment.isActive && ['CAMP_ADMIN', 'CAMP_COORDINATOR', 'COLLECTION_STAFF', 'CLINICAL_STAFF'].includes(campStaffAssignment.role);

    if (!isOrgStaff && !isCampStaff) {
      throw new Error('Permission denied: Only authorised organisation staff or assigned camp staff can check in donors.');
    }

    const attendance = await prisma.campAttendance.findUnique({
      where: { id: attendanceId },
    });

    if (!attendance || attendance.campId !== campId) {
      throw new Error('Attendance record not found for this camp.');
    }

    if (attendance.status === 'CHECKED_IN') {
      return attendance; // Idempotent check-in
    }

    if (attendance.status === 'CANCELLED') {
      throw new Error('Cannot check in a cancelled attendance registration.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const rec = await tx.campAttendance.update({
        where: { id: attendanceId },
        data: {
          status: 'CHECKED_IN',
          checkedInAt: new Date(),
          checkedInBy: caller.id,
        },
      });

      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'camp.attendance_checked_in',
        entityType: 'CampAttendance',
        entityId: attendanceId,
        organisationId: camp.organisationId || undefined,
        recipientUserId: attendance.userId,
        payload: {
          campId,
          attendanceId,
          userId: attendance.userId,
          status: 'CHECKED_IN',
          checkedInAt: rec.checkedInAt?.toISOString() || new Date().toISOString(),
          checkedInBy: caller.id,
        },
      });

      return rec;
    }, { timeout: 15000, maxWait: 10000 });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'CAMP_ATTENDANCE_CHECKED_IN',
        resource: 'CampAttendance',
        resourceId: attendanceId,
        metadata: {
          campId,
          donorUserId: attendance.userId,
        },
      },
    });

    return updated;
  }

  /**
   * Cancel camp attendance.
   * Cannot be cancelled if clinical screening has already cleared or donation occurred.
   */
  static async cancelAttendance(
    campId: string,
    attendanceId: string,
    caller: CallerUser,
    reason?: string
  ) {
    const { camp, membership, campStaffAssignment } = await this.getCampWithOrgCheck(campId, caller);

    const attendance = await prisma.campAttendance.findUnique({
      where: { id: attendanceId },
      include: {
        screening: true,
        donationEvent: true,
      },
    });

    if (!attendance || attendance.campId !== campId) {
      throw new Error('Attendance record not found for this camp.');
    }

    const isDonor = attendance.userId === caller.id;
    const isOrgStaff = membership && membership.isActive && ['ORG_ADMIN', 'COLLECTION_STAFF'].includes(membership.role);
    const isCampStaff = campStaffAssignment && campStaffAssignment.isActive && ['CAMP_COORDINATOR', 'COLLECTION_STAFF'].includes(campStaffAssignment.role);
    const isPlatformAdmin = caller.role === 'ADMIN';

    if (!isDonor && !isOrgStaff && !isCampStaff && !isPlatformAdmin) {
      throw new Error('Permission denied: You cannot cancel this attendance record.');
    }

    if (attendance.donationEvent && attendance.donationEvent.outcome === 'COMPLETED') {
      throw new Error('Cannot cancel attendance: A completed donation has already been recorded.');
    }

    if (attendance.screening && attendance.screening.status === 'CLEARED') {
      throw new Error('Cannot cancel attendance: Donor has already been clinically screened and cleared.');
    }

    const updated = await prisma.campAttendance.update({
      where: { id: attendanceId },
      data: {
        status: 'CANCELLED',
        cancellationReason: reason || 'Withdrawn by user or staff',
        cancelledAt: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'CAMP_ATTENDANCE_CANCELLED',
        resource: 'CampAttendance',
        resourceId: attendanceId,
        metadata: {
          campId,
          cancelledBy: caller.id,
          reason,
        },
      },
    });

    return updated;
  }

  /**
   * List camp attendance roster.
   * Censors private donor phone numbers unless authorized staff.
   */
  static async listAttendances(campId: string, caller: CallerUser) {
    const { camp, membership, campStaffAssignment } = await this.getCampWithOrgCheck(campId, caller);

    const hasReadAccess = this.checkCampReadAccess(camp, membership, campStaffAssignment, caller);

    if (!hasReadAccess) {
      throw new Error('Permission denied: Only authorised organisation members or assigned camp staff can view the attendance roster.');
    }

    const isClinicalStaff =
      caller.role === 'ADMIN' ||
      membership?.role === 'CLINICAL_STAFF' ||
      campStaffAssignment?.role === 'CLINICAL_STAFF';

    const canViewPhone =
      caller.role === 'ADMIN' ||
      membership?.role === 'ORG_ADMIN' ||
      membership?.role === 'COLLECTION_STAFF' ||
      campStaffAssignment?.role === 'CAMP_COORDINATOR' ||
      campStaffAssignment?.role === 'COLLECTION_STAFF' ||
      campStaffAssignment?.role === 'CAMP_ADMIN';

    const attendances = await prisma.campAttendance.findMany({
      where: { campId },
      include: {
        donorProfile: {
          select: {
            verifiedLastDonationDate: true,
            lastDonationDate: true,
          },
        },
        screening: {
          select: {
            id: true,
            status: true,
            consentGiven: true,
            eligibilityDecision: true,
            deferralCategory: true,
            deferralDurationDays: true,
            deferredUntil: true,
            clinicalNotes: isClinicalStaff, // Restricted to clinical personnel
            isAmended: true,
            screenedBy: true,
            createdAt: true,
          },
        },
        donationEvent: {
          select: {
            id: true,
            outcome: true,
            bloodGroup: true,
            donationType: true,
            volumeMl: true,
            adverseReaction: true,
            performedAt: true,
            collectionUnit: {
              select: {
                id: true,
                unitNumber: true,
                status: true,
                volumeMl: true,
                collectedAt: true,
                handoverItems: {
                  select: {
                    id: true,
                    outcome: true,
                    manifest: {
                      select: {
                        id: true,
                        manifestNumber: true,
                        status: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { registeredAt: 'desc' },
    });

    return attendances.map((a) => {
      // Calculate donor eligibility based on authoritative verified last donation
      const refDate = a.donorProfile?.verifiedLastDonationDate || a.donorProfile?.lastDonationDate || (a.donationEvent?.outcome === 'COMPLETED' ? a.donationEvent.performedAt : null);
      let isEligible = true;
      let eligibilityStatus = 'ELIGIBLE';
      let nextEligibleDate: string | null = null;
      let daysRemaining = 0;

      if (refDate) {
        const daysSince = (Date.now() - new Date(refDate).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 90) {
          isEligible = false;
          eligibilityStatus = 'TEMPORARILY_INELIGIBLE';
          nextEligibleDate = new Date(new Date(refDate).getTime() + 90 * 86400000).toISOString();
          daysRemaining = Math.max(1, Math.ceil(90 - daysSince));
        }
      }

      return {
        id: a.id,
        campId: a.campId,
        userId: a.userId,
        donorName: a.donorName,
        bloodGroup: a.bloodGroup,
        status: a.status,
        registeredAt: a.registeredAt,
        checkedInAt: a.checkedInAt,
        checkedInBy: a.checkedInBy,
        cancelledAt: a.cancelledAt,
        donorPhone: canViewPhone
          ? a.donorPhone
          : a.donorPhone
          ? a.donorPhone.slice(0, 4) + '******' + a.donorPhone.slice(-2)
          : '******',
        screening: a.screening,
        donationEvent: a.donationEvent
          ? {
              ...a.donationEvent,
              collectionUnit: a.donationEvent.collectionUnit
                ? {
                    id: a.donationEvent.collectionUnit.id,
                    unitNumber: a.donationEvent.collectionUnit.unitNumber,
                    status: a.donationEvent.collectionUnit.status,
                    volumeMl: a.donationEvent.collectionUnit.volumeMl,
                    collectedAt: a.donationEvent.collectionUnit.collectedAt,
                    handoverStatus: a.donationEvent.collectionUnit.handoverItems?.[0]?.manifest?.status || null,
                    manifestNumber: a.donationEvent.collectionUnit.handoverItems?.[0]?.manifest?.manifestNumber || null,
                    receiptOutcome: a.donationEvent.collectionUnit.handoverItems?.[0]?.outcome || null,
                  }
                : null,
            }
          : null,
        eligibility: {
          isEligible,
          status: a.donationEvent?.outcome === 'COMPLETED' ? 'DONATION_COMPLETED' : eligibilityStatus,
          nextEligibleDate,
          daysRemaining,
          lastDonationDate: refDate ? new Date(refDate).toISOString() : null,
          hasDonatedAtThisCamp: a.donationEvent?.outcome === 'COMPLETED',
          policy: '90_DAY_WHOLE_BLOOD_INTERVAL',
        },
      };
    });
  }

  // ====================================================
  // 3. CONSENT & CLINICAL SCREENING
  // ====================================================

  /**
   * Record clinical screening decision and informed consent.
   * Strictly gated to CLINICAL_STAFF or ORG_ADMIN.
   */
  static async recordClinicalScreening(
    campId: string,
    attendanceId: string,
    caller: CallerUser,
    input: RecordClinicalScreeningInput
  ) {
    const { camp, membership, campStaffAssignment } = await this.getCampWithOrgCheck(campId, caller);

    if (camp.status !== 'APPROVED') {
      throw new Error(`Cannot perform clinical screening for a camp in status "${camp.status}". Camp must be APPROVED first.`);
    }

    if (!camp.isReadyForCollection) {
      throw new Error('Camp is not ready for operations: Operational readiness must be verified before beginning clinical evaluations.');
    }

    const isClinicalAuthorized =
      caller.role === 'ADMIN' ||
      (membership && membership.isActive && membership.role === 'CLINICAL_STAFF') ||
      (campStaffAssignment && campStaffAssignment.isActive && campStaffAssignment.role === 'CLINICAL_STAFF');

    if (!isClinicalAuthorized) {
      throw new Error('Permission denied: Only qualified CLINICAL_STAFF can perform clinical screening and medical fitness decisions.');
    }

    const attendance = await prisma.campAttendance.findUnique({
      where: { id: attendanceId },
    });

    if (!attendance || attendance.campId !== campId) {
      throw new Error('Attendance record not found for this camp.');
    }

    if (attendance.status !== 'CHECKED_IN') {
      throw new Error(`Cannot clinically screen donor with attendance status "${attendance.status}". Donor must be CHECKED_IN.`);
    }

    if (!input.consentGiven) {
      throw new Error('Informed consent is required before clinical screening can proceed.');
    }

    const existingScreening = await prisma.clinicalScreening.findUnique({
      where: { attendanceId },
    });

    if (existingScreening) {
      throw new Error('Clinical screening has already been recorded for this attendance record. Use amendment workflow for corrections.');
    }

    const isCleared = input.eligibilityDecision === 'CLEARED';
    const status: ScreeningStatus = isCleared ? 'CLEARED' : 'DEFERRED';

    let deferredUntil: Date | null = null;
    if (!isCleared && input.deferralDurationDays) {
      deferredUntil = new Date(Date.now() + input.deferralDurationDays * 86400000);
    }

    const screening = await prisma.$transaction(async (tx) => {
      const record = await tx.clinicalScreening.create({
        data: {
          campId,
          attendanceId,
          donorUserId: attendance.userId,
          screenedBy: caller.id,
          status,
          consentVersion: input.consentVersion || 'v1.0',
          consentGiven: true,
          consentRecordedAt: new Date(),
          consentRecordedBy: caller.id,
          eligibilityDecision: input.eligibilityDecision,
          deferralCategory: isCleared ? null : input.deferralCategory || 'OTHER',
          deferralDurationDays: isCleared ? null : input.deferralDurationDays || null,
          deferredUntil,
          clinicalNotes: input.clinicalNotes || null,
        },
      });

      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'camp.screening_recorded',
        entityType: 'ClinicalScreening',
        entityId: record.id,
        organisationId: camp.organisationId || undefined,
        recipientUserId: attendance.userId,
        payload: {
          campId,
          attendanceId,
          screeningId: record.id,
          status: record.status,
          eligibilityDecision: record.eligibilityDecision,
          deferralCategory: record.deferralCategory,
          deferredUntil: record.deferredUntil?.toISOString() || null,
          screenedBy: caller.id,
        },
      });

      return record;
    }, { timeout: 15000, maxWait: 10000 });

    // Record audit trail (excluding sensitive clinical notes)
    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'CLINICAL_SCREENING_RECORDED',
        resource: 'ClinicalScreening',
        resourceId: screening.id,
        metadata: {
          campId,
          attendanceId,
          decision: input.eligibilityDecision,
          deferralCategory: screening.deferralCategory,
          deferredUntil: screening.deferredUntil,
        },
      },
    });

    return screening;
  }

  /**
   * Amend clinical screening decision with required auditable reason.
   */
  static async amendClinicalScreening(
    campId: string,
    screeningId: string,
    caller: CallerUser,
    input: AmendClinicalScreeningInput
  ) {
    const { camp, membership, campStaffAssignment } = await this.getCampWithOrgCheck(campId, caller);

    const isClinicalAuthorized =
      caller.role === 'ADMIN' ||
      (membership && membership.isActive && membership.role === 'CLINICAL_STAFF') ||
      (campStaffAssignment && campStaffAssignment.isActive && campStaffAssignment.role === 'CLINICAL_STAFF');

    if (!isClinicalAuthorized) {
      throw new Error('Permission denied: Only qualified CLINICAL_STAFF can amend clinical screening.');
    }

    if (!input.amendmentReason || !input.amendmentReason.trim()) {
      throw new Error('Auditable amendment reason is mandatory for modifying a clinical screening decision.');
    }

    const screening = await prisma.clinicalScreening.findUnique({
      where: { id: screeningId },
      include: { donationEvent: true },
    });

    if (!screening || screening.campId !== campId) {
      throw new Error('Clinical screening record not found for this camp.');
    }

    if (screening.donationEvent && screening.donationEvent.outcome === 'COMPLETED' && input.eligibilityDecision !== 'CLEARED') {
      throw new Error('Cannot retroactively defer donor: A completed blood donation has already been recorded for this screening.');
    }

    const isCleared = input.eligibilityDecision === 'CLEARED';
    const newStatus: ScreeningStatus = isCleared ? 'CLEARED' : 'DEFERRED';

    let deferredUntil: Date | null = null;
    if (!isCleared && input.deferralDurationDays) {
      deferredUntil = new Date(Date.now() + input.deferralDurationDays * 86400000);
    }

    const updated = await prisma.clinicalScreening.update({
      where: { id: screeningId },
      data: {
        status: newStatus,
        eligibilityDecision: input.eligibilityDecision,
        deferralCategory: isCleared ? null : input.deferralCategory || 'OTHER',
        deferralDurationDays: isCleared ? null : input.deferralDurationDays || null,
        deferredUntil,
        clinicalNotes: input.clinicalNotes !== undefined ? input.clinicalNotes : screening.clinicalNotes,
        isAmended: true,
        amendedAt: new Date(),
        amendedBy: caller.id,
        amendmentReason: input.amendmentReason.trim(),
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'CLINICAL_SCREENING_AMENDED',
        resource: 'ClinicalScreening',
        resourceId: screeningId,
        metadata: {
          campId,
          previousDecision: screening.eligibilityDecision,
          newDecision: input.eligibilityDecision,
          amendmentReason: input.amendmentReason.trim(),
        },
      },
    });

    return updated;
  }

  // ====================================================
  // 4. DONATION EVENTS
  // ====================================================

  /**
   * Record donation event outcome.
   * Gated to COLLECTION_STAFF, CLINICAL_STAFF, or ORG_ADMIN.
   * Invariant: Requires a verified CLEARED clinical screening for completed outcomes!
   * Distinct from physical collection unit records (no blood bags/barcodes created).
   */
  static async recordDonationEvent(
    campId: string,
    attendanceId: string,
    caller: CallerUser,
    input: RecordDonationEventInput
  ) {
    const { camp, membership, campStaffAssignment } = await this.getCampWithOrgCheck(campId, caller);

    if (camp.status !== 'APPROVED') {
      throw new Error(`Cannot record donation events for a camp in status "${camp.status}". Camp must be APPROVED first.`);
    }

    if (!camp.isReadyForCollection) {
      throw new Error('Camp is not ready for operations: Operational readiness must be verified before recording donations.');
    }

    const isDonationAuthorized =
      (membership && membership.isActive && ['COLLECTION_STAFF', 'ORG_ADMIN'].includes(membership.role)) ||
      (campStaffAssignment && campStaffAssignment.isActive && campStaffAssignment.role === 'COLLECTION_STAFF');

    if (!isDonationAuthorized) {
      throw new Error('Permission denied: Only COLLECTION_STAFF or parent bank administrators can record donation events.');
    }

    const attendance = await prisma.campAttendance.findUnique({
      where: { id: attendanceId },
      include: {
        screening: true,
        donationEvent: {
          include: {
            collectionUnit: true,
          },
        },
      },
    });

    if (!attendance || attendance.campId !== campId) {
      throw new Error('Attendance record not found for this camp.');
    }

    if (attendance.donationEvent) {
      if (attendance.donationEvent.collectionUnit) {
        throw new Error('A collection unit has already been confirmed and registered for this donation event. Duplicate recordings are prohibited.');
      }
      if (attendance.donationEvent.outcome === 'COMPLETED') {
        throw new Error('A donation event has already been recorded for this attendance record. Duplicate recordings are prohibited.');
      }
      // If the donation was previously marked NOT_PERFORMED, authorized collection staff may legitimately complete or update it
    }

    if (input.outcome === 'COMPLETED') {
      if (!attendance.screening || attendance.screening.status !== 'CLEARED') {
        throw new Error('Cannot complete donation: Donor has not been clinically screened and CLEARED by medical personnel.');
      }
    }

    const bloodGroupValue = (input.bloodGroup as BloodGroup) || attendance.bloodGroup;
    if (!bloodGroupValue) {
      throw new Error('Valid blood group is required to record a donation event.');
    }

    // Atomic creation or update of donation event, donor profile update, and real-time events
    const donationEvent = await prisma.$transaction(async (tx) => {
      const event = attendance.donationEvent
        ? await tx.donationEvent.update({
            where: { id: attendance.donationEvent.id },
            data: {
              screeningId: attendance.screening?.id || attendance.donationEvent.screeningId,
              bloodGroup: bloodGroupValue,
              donationType: input.donationType || attendance.donationEvent.donationType || 'WHOLE_BLOOD',
              outcome: input.outcome,
              volumeMl: input.volumeMl || (input.outcome === 'COMPLETED' ? 450 : null),
              adverseReaction: !!input.adverseReaction,
              adverseReactionNotes: input.adverseReactionNotes || null,
              recordedBy: caller.id,
              performedAt: new Date(),
              notes: input.notes || null,
            },
          })
        : await tx.donationEvent.create({
            data: {
              campId,
              attendanceId,
              screeningId: attendance.screening?.id || null,
              donorUserId: attendance.userId,
              bloodGroup: bloodGroupValue,
              donationType: input.donationType || 'WHOLE_BLOOD',
              outcome: input.outcome,
              volumeMl: input.volumeMl || (input.outcome === 'COMPLETED' ? 450 : null),
              adverseReaction: !!input.adverseReaction,
              adverseReactionNotes: input.adverseReactionNotes || null,
              recordedBy: caller.id,
              performedAt: new Date(),
              notes: input.notes || null,
            },
          });

      let nextEligibleDate: string | null = null;
      if (input.outcome === 'COMPLETED') {
        const donationTime = new Date();
        const nextDate = new Date(donationTime.getTime() + 90 * 86400000);
        nextEligibleDate = nextDate.toISOString();

        // Find or create donor profile and record verified donation date
        const existingProfile = await tx.donorProfile.findUnique({
          where: { userId: attendance.userId },
        });

        if (existingProfile) {
          await tx.donorProfile.update({
            where: { id: existingProfile.id },
            data: {
              verifiedLastDonationDate: donationTime,
              lastDonationDate: donationTime,
            },
          });
        } else {
          await tx.donorProfile.create({
            data: {
              userId: attendance.userId,
              bloodGroup: bloodGroupValue,
              stateCode: 27,
              districtCode: 521,
              verifiedLastDonationDate: donationTime,
              lastDonationDate: donationTime,
            },
          });
        }

        // Publish real-time donor eligibility event
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'donor.eligibility_updated',
          entityType: 'DonorProfile',
          entityId: attendance.userId,
          organisationId: camp.organisationId || undefined,
          recipientUserId: attendance.userId,
          payload: {
            userId: attendance.userId,
            campId,
            isEligible: false,
            status: 'TEMPORARILY_INELIGIBLE',
            nextEligibleDate,
            daysRemaining: 90,
            lastDonationDate: donationTime.toISOString(),
            policy: '90_DAY_WHOLE_BLOOD_INTERVAL',
            reason: 'Post-donation 90-day recovery interval',
          },
        });

        // Sync donor_registrations table if record exists
        if (attendance.userId) {
          try {
            await tx.$executeRawUnsafe(`
              UPDATE donor_registrations
              SET
                collection_status = 'COLLECTED',
                workflow_status = 'COLLECTION_COMPLETED',
                volume_ml = COALESCE($1, volume_ml, 450),
                updated_at = NOW()
              WHERE camp_id = $2 AND donor_user_id = $3
            `, input.volumeMl || 450, campId, attendance.userId);
          } catch {
            // Best-effort sync
          }
        }
      }

      // Publish camp donation completed / recorded event
      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'camp.donation_completed',
        entityType: 'DonationEvent',
        entityId: event.id,
        organisationId: camp.organisationId || undefined,
        recipientUserId: attendance.userId,
        payload: {
          campId,
          attendanceId,
          donationEventId: event.id,
          donorUserId: attendance.userId,
          bloodGroup: bloodGroupValue,
          outcome: input.outcome,
          volumeMl: event.volumeMl,
          adverseReaction: !!input.adverseReaction,
          recordedBy: caller.id,
          performedAt: event.performedAt.toISOString(),
          nextEligibleDate,
        },
      });

      return event;
    });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'DONATION_EVENT_RECORDED',
        resource: 'DonationEvent',
        resourceId: donationEvent.id,
        metadata: {
          campId,
          attendanceId,
          outcome: input.outcome,
          bloodGroup: bloodGroupValue,
          adverseReaction: !!input.adverseReaction,
        },
      },
    });

    return donationEvent;
  }

  // ====================================================
  // 5. CAMP STAFF ASSIGNMENTS (CAMP-SCOPED ACCESS)
  // ====================================================

  /**
   * Assign a user as camp coordinator or staff.
   * Gated strictly to parent bank ORG_ADMIN or platform ADMIN.
   */
  static async assignCampStaff(
    campId: string,
    caller: CallerUser,
    input: {
      userIdOrPhone: string;
      role: CampStaffRole;
      notes?: string;
    }
  ) {
    const { camp, membership, campStaffAssignment } = await this.getCampWithOrgCheck(campId, caller);

    const isOrgAdmin = membership && membership.isActive && membership.role === 'ORG_ADMIN';
    const isCampAdmin = campStaffAssignment && campStaffAssignment.isActive && campStaffAssignment.role === 'CAMP_ADMIN';

    if (!isOrgAdmin && !isCampAdmin) {
      throw new Error('Permission denied: Only parent blood-bank administrators or Camp Admin can assign camp staff.');
    }

    // Role-specific assignment constraints:
    // Camp Admin can ONLY assign CAMP_COORDINATOR.
    // CLINICAL_STAFF, COLLECTION_STAFF, and additional CAMP_ADMIN roles require parent blood bank authority.
    if (isCampAdmin && !isOrgAdmin) {
      if (input.role !== 'CAMP_COORDINATOR') {
        throw new Error('Permission denied: Camp Admins can only assign Camp Coordinators. Clinical and collection personnel must be assigned by the parent blood bank.');
      }
    }

    if (camp.status !== 'APPROVED') {
      throw new Error(`Cannot assign staff for a camp in status "${camp.status}". Camp must be APPROVED first.`);
    }

    const phoneOrId = input.userIdOrPhone.trim();
    let normalizedPhone: string | null = null;
    try {
      normalizedPhone = normalizePhoneNumber(phoneOrId);
    } catch {
      if (/^\d{10}$/.test(phoneOrId)) {
        normalizedPhone = `+91${phoneOrId}`;
      }
    }

    let targetUser = await prisma.user.findFirst({
      where: {
        OR: [
          { id: phoneOrId },
          ...(normalizedPhone ? [{ phoneNumber: normalizedPhone }] : []),
          { phoneNumber: phoneOrId },
        ],
      },
    });

    let userReused = false;
    if (targetUser) {
      userReused = true;
    } else {
      const phoneToUse = normalizedPhone || (phoneOrId.startsWith('+') ? phoneOrId : `+91${phoneOrId.slice(-10)}`);
      if (phoneToUse.startsWith('+') || /^\d{10,12}$/.test(phoneToUse)) {
        try {
          targetUser = await prisma.user.create({
            data: {
              phoneNumber: phoneToUse,
              name: input.role === 'CAMP_COORDINATOR' ? 'Camp Coordinator' : 'Camp Staff',
              role: 'DONOR',
            },
          });
          userReused = false;
        } catch (err: any) {
          // Gracefully catch unique constraint race conditions
          if (err.code === 'P2002' || err.message?.includes('Unique constraint')) {
            targetUser = await prisma.user.findFirst({
              where: {
                OR: [{ phoneNumber: phoneToUse }, { phoneNumber: phoneOrId }],
              },
            });
            userReused = true;
          }
          if (!targetUser) {
            throw new Error('An account with this phone number already exists or could not be processed. Please verify the mobile number.');
          }
        }
      } else {
        throw new Error('User not found. Provide a valid user ID or 10-digit mobile number.');
      }
    }

    // Check if assignment already exists
    const existing = await prisma.campStaffAssignment.findFirst({
      where: {
        campId,
        userId: targetUser.id,
      },
      include: {
        user: {
          select: { id: true, name: true, phoneNumber: true },
        },
      },
    });

    // If assignment already active with identical role, return it gracefully without duplicating
    if (existing && existing.isActive && existing.role === input.role) {
      return {
        ...existing,
        isExisting: true,
        userReused,
        message: 'This staff member is already assigned to this camp.',
      };
    }

    let assignment;
    if (existing) {
      assignment = await prisma.campStaffAssignment.update({
        where: { id: existing.id },
        data: {
          role: input.role,
          isActive: true,
          assignedBy: caller.id,
          assignedAt: new Date(),
          revokedAt: null,
          revokedBy: null,
        },
        include: {
          user: {
            select: { id: true, name: true, phoneNumber: true },
          },
        },
      });
    } else {
      assignment = await prisma.campStaffAssignment.create({
        data: {
          campId,
          userId: targetUser.id,
          organisationId: camp.organisationId || '',
          role: input.role,
          assignedBy: caller.id,
        },
        include: {
          user: {
            select: { id: true, name: true, phoneNumber: true },
          },
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'CAMP_STAFF_ASSIGNED',
        resource: 'CampStaffAssignment',
        resourceId: assignment.id,
        metadata: {
          campId,
          assignedUserId: targetUser.id,
          role: input.role,
          organisationId: camp.organisationId,
          userReused,
        },
      },
    });

    return {
      ...assignment,
      isExisting: false,
      userReused,
      message: userReused
        ? 'Existing account found. Staff assignment completed.'
        : 'Staff member assigned to the camp successfully.',
    };
  }

  /**
   * Revoke a staff member's camp assignment.
   * Gated to parent bank ORG_ADMIN or platform ADMIN.
   */
  static async revokeCampStaff(
    campId: string,
    assignmentId: string,
    caller: CallerUser,
    reason?: string
  ) {
    const { camp, membership, campStaffAssignment } = await this.getCampWithOrgCheck(campId, caller);

    const isOrgAdmin = membership && membership.isActive && membership.role === 'ORG_ADMIN';
    const isCampAdmin = campStaffAssignment && campStaffAssignment.isActive && campStaffAssignment.role === 'CAMP_ADMIN';

    if (!isOrgAdmin && !isCampAdmin) {
      throw new Error('Permission denied: Only parent blood-bank administrators or Camp Admin can revoke camp staff assignments.');
    }

    const assignment = await prisma.campStaffAssignment.findUnique({
      where: { id: assignmentId },
    });

    if (!assignment || assignment.campId !== campId) {
      throw new Error('Camp staff assignment not found.');
    }

    // Camp Admin cannot revoke parent-bank admin or clinical/collection staff assigned by parent bank
    if (isCampAdmin && !isOrgAdmin) {
      if (assignment.role !== 'CAMP_COORDINATOR') {
        throw new Error('Permission denied: Camp Admins can only revoke Camp Coordinator assignments.');
      }
    }

    const updated = await prisma.campStaffAssignment.update({
      where: { id: assignmentId },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokedBy: caller.id,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'CAMP_STAFF_REVOKED',
        resource: 'CampStaffAssignment',
        resourceId: assignmentId,
        metadata: {
          campId,
          revokedUserId: assignment.userId,
          reason,
        },
      },
    });

    return updated;
  }

  /**
   * List staff assigned to a camp.
   */
  static async listCampStaff(campId: string, caller: CallerUser) {
    const { camp, membership, campStaffAssignment } = await this.getCampWithOrgCheck(campId, caller);

    const hasReadAccess = this.checkCampReadAccess(camp, membership, campStaffAssignment, caller);

    if (!hasReadAccess) {
      throw new Error('Permission denied: You are not authorized to view staff for this camp.');
    }

    const staff = await prisma.campStaffAssignment.findMany({
      where: {
        campId,
        ...(camp.status === 'COMPLETED' ? {} : { isActive: true }),
      },
      include: {
        user: {
          select: { id: true, name: true, phoneNumber: true },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });

    return staff;
  }

  /**
   * Search an existing donor by mobile number for camp attendance registration.
   * Gated strictly to authorised camp staff or parent blood-bank administrators.
   * Returns minimal non-sensitive information: name, masked phone, and profile blood group with provenance.
   */
  static async lookupDonorForAttendance(
    campId: string,
    caller: CallerUser,
    phoneInput: string
  ) {
    const { camp, membership, campStaffAssignment } = await this.getCampWithOrgCheck(campId, caller);

    const hasLookupAccess = this.checkCampReadAccess(camp, membership, campStaffAssignment, caller);

    if (!hasLookupAccess) {
      throw new Error('Permission denied: Only authorised camp staff or parent blood-bank administrators can perform donor lookup.');
    }

    if (camp.status !== 'APPROVED') {
      throw new Error('Donor lookup is only permitted for APPROVED camps.');
    }

    if (!phoneInput || typeof phoneInput !== 'string') {
      throw new Error('Mobile number is required for donor lookup.');
    }

    const clean = phoneInput.replace(/[^\d+]/g, '');
    const normalizedPhone = clean.startsWith('+') ? clean : clean.length === 10 ? `+91${clean}` : clean.length === 12 && clean.startsWith('91') ? `+${clean}` : clean;

    if (!/^\+91[6-9]\d{9}$/.test(normalizedPhone)) {
      throw new Error('Please enter a valid 10-digit Indian mobile number.');
    }

    const user = await prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
      include: {
        donorProfile: {
          select: {
            id: true,
            bloodGroup: true,
            isAvailable: true,
            lastDonationDate: true,
            verifiedLastDonationDate: true,
          },
        },
      },
    });

    if (!user) {
      return {
        found: false,
        alreadyRegistered: false,
        existingAttendance: null,
        message: 'No existing donor account found. Proceed with walk-in registration.',
        normalizedPhone,
        donor: null,
      };
    }

    // 1. Check if the donor already has an attendance record for the current camp
    const existingAttendance = await prisma.campAttendance.findFirst({
      where: {
        campId,
        userId: user.id,
      },
      include: {
        screening: {
          select: {
            id: true,
            status: true,
            screenedBy: true,
            createdAt: true,
          },
        },
        donationEvent: {
          select: {
            id: true,
            outcome: true,
            performedAt: true,
            collectionUnit: {
              select: {
                id: true,
                unitNumber: true,
                status: true,
              },
            },
          },
        },
      },
    });

    // 2. Authoritative eligibility check based on previous donation intervals (90-day recovery) and clinical deferrals
    const [recentDonation, activeDeferral] = await Promise.all([
      prisma.donationEvent.findFirst({
        where: {
          donorUserId: user.id,
          outcome: 'COMPLETED',
        },
        orderBy: { performedAt: 'desc' },
      }),
      prisma.clinicalScreening.findFirst({
        where: {
          donorUserId: user.id,
          status: 'DEFERRED',
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const refDate = recentDonation?.performedAt || user.donorProfile?.verifiedLastDonationDate || user.donorProfile?.lastDonationDate;
    let isEligible = user.donorProfile?.isAvailable ?? true;
    let eligibilityWarning: string | null = null;
    let daysSinceLastDonation: number | null = null;
    let daysRemaining = 0;
    let nextEligibleDate: string | null = null;

    if (user.donorProfile && !user.donorProfile.isAvailable) {
      isEligible = false;
      eligibilityWarning = 'Donor has paused their voluntary donation availability.';
    }

    if (activeDeferral) {
      isEligible = false;
      if (!eligibilityWarning) {
        eligibilityWarning = `Donor was deferred at clinical screening on ${new Date(activeDeferral.createdAt).toLocaleDateString()}. Medical review is required.`;
      }
    }

    if (refDate) {
      const daysSince = Math.floor((Date.now() - new Date(refDate).getTime()) / (1000 * 60 * 60 * 24));
      daysSinceLastDonation = daysSince;
      if (daysSince < 90) {
        isEligible = false;
        daysRemaining = 90 - daysSince;
        nextEligibleDate = new Date(new Date(refDate).getTime() + 90 * 86400000).toISOString();
        eligibilityWarning = `Last donation was ${daysSince} days ago (${new Date(refDate).toLocaleDateString()}). Required recovery interval is 90 days. Eligible on ${new Date(nextEligibleDate).toLocaleDateString()} (${daysRemaining} days remaining).`;
      }
    }

    const maskedPhone = `${normalizedPhone.slice(0, 3)} XXXXX-${normalizedPhone.slice(-4)}`;

    return {
      found: true,
      alreadyRegistered: Boolean(existingAttendance),
      existingAttendance: existingAttendance
        ? {
            id: existingAttendance.id,
            status: existingAttendance.status,
            registeredAt: existingAttendance.registeredAt,
            checkedInAt: existingAttendance.checkedInAt,
            hasScreening: Boolean(existingAttendance.screening),
            screeningStatus: existingAttendance.screening?.status || null,
            hasDonation: Boolean(existingAttendance.donationEvent),
            donationOutcome: existingAttendance.donationEvent?.outcome || null,
            unitNumber: existingAttendance.donationEvent?.collectionUnit?.unitNumber || null,
            unitStatus: existingAttendance.donationEvent?.collectionUnit?.status || null,
          }
        : null,
      donor: {
        userId: user.id,
        name: user.name || 'Registered Donor',
        maskedPhone,
        phoneNumber: normalizedPhone,
        bloodGroup: user.donorProfile?.bloodGroup || null,
        provenance: user.donorProfile?.bloodGroup ? 'DONOR_PROFILE' : 'UNKNOWN',
        bloodGroupProvenance: user.donorProfile?.bloodGroup ? 'DONOR_PROFILE' : 'UNKNOWN',
        provenanceLabel: user.donorProfile?.bloodGroup
          ? 'Verified in Donor Profile'
          : 'Unknown / Pending Verification',
        isEligible,
        eligibilityWarning,
        lastDonationDate: refDate ? new Date(refDate).toISOString() : null,
        nextEligibleDate,
        daysRemaining,
      },
    };
  }

  /**
   * Resolve all camps accessible to the authenticated user.
   * Returns camps where user is explicitly assigned, is designated Camp Creator/Admin,
   * OR has parent-bank administration access.
   */
  static async getMyCampAssignments(caller: CallerUser) {
    // 1. Camps explicitly assigned to caller (active assignments, or historical assignments for closed camps)
    const explicitAssignments = await prisma.campStaffAssignment.findMany({
      where: {
        userId: caller.id,
        OR: [
          { isActive: true },
          { camp: { status: 'COMPLETED' } },
        ],
      },
      include: {
        camp: {
          include: {
            organisation: {
              select: { id: true, name: true, orgCode: true },
            },
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });

    // 2. Camps created by caller (both PROPOSED and APPROVED)
    const createdCamps = await prisma.camp.findMany({
      where: { createdById: caller.id },
      include: {
        organisation: {
          select: { id: true, name: true, orgCode: true },
        },
      },
      orderBy: { targetDate: 'asc' },
    });

    // 3. If user is an active organisation member, include camps belonging to their organisation
    const memberships = await prisma.organisationMembership.findMany({
      where: { userId: caller.id, isActive: true },
    });

    const orgIds = memberships.map((m) => m.organisationId);
    let orgCamps: any[] = [];
    if (orgIds.length > 0) {
      orgCamps = await prisma.camp.findMany({
        where: {
          organisationId: { in: orgIds },
          status: { in: ['PROPOSED', 'APPROVED', 'COMPLETED'] },
        },
        include: {
          organisation: {
            select: { id: true, name: true, orgCode: true },
          },
        },
        orderBy: { targetDate: 'asc' },
      });
    }

    // Merge and format results
    const campMap = new Map<string, any>();

    // Add created camps first (gives creator designated CAMP_ADMIN role)
    for (const c of createdCamps) {
      const isApproved = c.status === 'APPROVED' || c.status === 'COMPLETED';
      campMap.set(c.id, {
        campId: c.id,
        campCode: c.campCode,
        title: c.title,
        venue: c.venue,
        targetDate: c.targetDate,
        timeSlot: c.timeSlot,
        status: c.status,
        isReadyForCollection: c.isReadyForCollection,
        isOperational: isApproved,
        parentOrganisation: c.organisation,
        role: 'CAMP_ADMIN',
        assignmentSource: 'CAMP_CREATOR',
        assignedAt: c.createdAt,
      });
    }

    for (const a of explicitAssignments) {
      if (a.camp && !campMap.has(a.camp.id)) {
        const isApproved = a.camp.status === 'APPROVED' || a.camp.status === 'COMPLETED';
        campMap.set(a.camp.id, {
          campId: a.camp.id,
          campCode: a.camp.campCode,
          title: a.camp.title,
          venue: a.camp.venue,
          targetDate: a.camp.targetDate,
          timeSlot: a.camp.timeSlot,
          status: a.camp.status,
          isReadyForCollection: a.camp.isReadyForCollection,
          isOperational: isApproved,
          parentOrganisation: a.camp.organisation,
          role: a.role,
          assignmentSource: 'EXPLICIT_ASSIGNMENT',
          assignedAt: a.assignedAt,
        });
      }
    }

    for (const c of orgCamps) {
      if (!campMap.has(c.id)) {
        const mem = memberships.find((m) => m.organisationId === c.organisationId);
        const isApproved = c.status === 'APPROVED' || c.status === 'COMPLETED';
        let resolvedRole: string = 'CAMP_COORDINATOR';
        if (mem?.role === 'ORG_ADMIN') resolvedRole = 'ORG_ADMIN';
        else if (mem?.role === 'CLINICAL_STAFF') resolvedRole = 'CLINICAL_STAFF';
        else if (mem?.role === 'COLLECTION_STAFF') resolvedRole = 'COLLECTION_STAFF';
        else if (mem?.role) resolvedRole = mem.role;

        campMap.set(c.id, {
          campId: c.id,
          campCode: c.campCode,
          title: c.title,
          venue: c.venue,
          targetDate: c.targetDate,
          timeSlot: c.timeSlot,
          status: c.status,
          isReadyForCollection: c.isReadyForCollection,
          isOperational: isApproved,
          parentOrganisation: c.organisation,
          role: resolvedRole,
          assignmentSource: 'PARENT_BANK_STAFF',
          assignedAt: c.createdAt,
        });
      }
    }

    return Array.from(campMap.values());
  }

  // ====================================================
  // 6. CAMP-TO-BLOOD-BANK HANDOVER WORKFLOW
  // ====================================================

  /**
   * Retrieve authoritative collection units and active handover manifest for a camp.
   */
  static async getCampHandover(campId: string, caller?: CallerUser) {
    const { camp } = await this.getCampWithOrgCheck(campId, caller);

    // Fetch all collection units confirmed for this camp
    const units = await prisma.collectionUnit.findMany({
      where: { campId },
      include: {
        donationEvent: {
          select: {
            id: true,
            outcome: true,
            performedAt: true,
            donorUserId: true,
            bloodGroup: true,
            volumeMl: true,
          },
        },
        collector: {
          select: {
            id: true,
            name: true,
          },
        },
        handoverItems: {
          include: {
            manifest: {
              select: {
                id: true,
                manifestNumber: true,
                status: true,
                receivingOrganisation: { select: { id: true, name: true, orgCode: true } },
              },
            },
          },
        },
      },
      orderBy: { collectedAt: 'asc' },
    });

    // Fetch latest/active manifest originating from this camp
    const manifest = await prisma.handoverManifest.findFirst({
      where: { campId },
      include: {
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
          },
        },
        exceptions: true,
        receivingOrganisation: {
          select: {
            id: true,
            name: true,
            orgCode: true,
          },
        },
        dispatchedBy: {
          select: {
            id: true,
            name: true,
          },
        },
        reconciledBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const eligibleUnits = units.filter(
      (u) =>
        (u.status === 'COLLECTED' || u.status === 'PREPARED_FOR_HANDOVER') &&
        (!u.handoverItems || u.handoverItems.length === 0 || u.handoverItems.every((hi) => hi.manifest.status === 'CANCELLED'))
    );
    const inTransitUnits = units.filter((u) => u.status === 'IN_TRANSIT');
    const receivedUnits = units.filter(
      (u) => u.status === 'RECEIVED_BY_CENTRE' || u.status === 'PROCESSING_COMPLETED'
    );

    const totalVolumeMl = units.reduce((acc, u) => acc + (u.volumeMl || 450), 0);
    const eligibleVolumeMl = eligibleUnits.reduce((acc, u) => acc + (u.volumeMl || 450), 0);

    return {
      camp: {
        id: camp.id,
        campCode: camp.campCode,
        title: camp.title,
        status: camp.status,
        parentOrganisation: camp.organisation,
        organisation: camp.organisation,
      },
      units: units.map((u) => ({
        id: u.id,
        unitNumber: u.unitNumber,
        donationEventId: u.donationEventId,
        bloodGroup: u.bloodGroup,
        volumeMl: u.volumeMl || 450,
        status: u.status,
        collectedAt: u.collectedAt,
        collectedBy: u.collector?.name || u.collectedBy,
        donationOutcome: u.donationEvent?.outcome,
        activeManifest: u.handoverItems[0]?.manifest || null,
      })),
      manifest,
      activeManifest: manifest,
      summary: {
        totalUnits: units.length,
        totalVolumeMl,
        eligibleCount: eligibleUnits.length,
        eligibleUnitsCount: eligibleUnits.length,
        eligibleVolumeMl,
        inTransitCount: inTransitUnits.length,
        inTransitUnitsCount: inTransitUnits.length,
        receivedCount: receivedUnits.length,
        receivedUnitsCount: receivedUnits.length,
      },
    };
  }

  /**
   * Submit authoritative camp collection handover manifest to parent blood bank.
   * Atomically transfers custody, updates units to IN_TRANSIT, creates audit records,
   * and notifies parent blood bank in real time.
   */
  static async submitCampHandover(
    campId: string,
    caller: CallerUser,
    input: {
      transportDetails?: {
        courierName?: string;
        vehicleNumber?: string;
        driverPhone?: string;
        coldBoxTempCelsius?: number;
        dispatchNotes?: string;
      };
      notes?: string;
    }
  ) {
    const { camp, membership, campStaffAssignment } = await this.getCampWithOrgCheck(campId, caller);

    const isCampAdmin = campStaffAssignment && campStaffAssignment.isActive && campStaffAssignment.role === 'CAMP_ADMIN';
    const isOrgAdmin = membership && membership.isActive && membership.role === 'ORG_ADMIN';
    const isPlatformAdmin = caller.role === 'ADMIN';

    if (!isCampAdmin && !isOrgAdmin && !isPlatformAdmin) {
      throw new Error('Permission denied: Only camp admin or blood bank admin can create handover manifests. Final blood transfer is restricted to Camp Admin.');
    }

    if (camp.status === 'COMPLETED' || camp.status === 'CANCELLED') {
      throw new Error('This camp is closed. Operational handovers are no longer permitted.');
    }

    if (!camp.organisationId) {
      throw new Error('Camp is not linked to an accredited parent blood bank.');
    }

    // Find all units for this camp in COLLECTED or PREPARED_FOR_HANDOVER not already in an active manifest
    const eligibleUnits = await prisma.collectionUnit.findMany({
      where: {
        campId,
        status: { in: ['COLLECTED', 'PREPARED_FOR_HANDOVER'] },
        handoverItems: {
          none: {
            manifest: {
              status: { notIn: ['CANCELLED'] },
            },
          },
        },
      },
      orderBy: { collectedAt: 'asc' },
    });

    if (eligibleUnits.length === 0) {
      // Check if an active manifest already exists (idempotent submission check)
      const existingManifest = await prisma.handoverManifest.findFirst({
        where: {
          campId,
          status: { in: ['DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED_WITH_DISCREPANCIES', 'RECONCILED'] },
        },
        include: {
          items: true,
          receivingOrganisation: { select: { id: true, name: true, orgCode: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existingManifest) {
        return {
          idempotent: true,
          manifest: existingManifest,
          message: `Handover manifest "${existingManifest.manifestNumber}" has already been submitted to ${existingManifest.receivingOrganisation.name}.`,
        };
      }

      throw new Error('No confirmed collection units are currently eligible for handover. Please confirm collection units before submitting handover.');
    }

    const year = new Date().getFullYear();
    const hex = crypto.randomBytes(3).toString('hex').toUpperCase();
    const manifestNumber = `HM-${year}-${hex}`;

    const manifest = await prisma.$transaction(async (tx) => {
      // 1. Create the HandoverManifest
      const newManifest = await tx.handoverManifest.create({
        data: {
          manifestNumber,
          campId,
          sendingOrganisationId: camp.organisationId!,
          receivingOrganisationId: camp.organisationId!,
          status: 'DISPATCHED', // Camp submission transitions units to cold-chain dispatch
          transportDetails: input.transportDetails as any || {},
          createdById: caller.id,
          dispatchedById: caller.id,
          dispatchedAt: new Date(),
          notes: input.notes?.trim() || `Camp collection handover from ${camp.title} (${camp.campCode})`,
        },
        include: {
          receivingOrganisation: { select: { id: true, name: true, orgCode: true } },
          camp: { select: { id: true, campCode: true, title: true } },
        },
      });

      // 2. Link each unit as HandoverItem and transition to IN_TRANSIT
      for (const unit of eligibleUnits) {
        await tx.handoverItem.create({
          data: {
            manifestId: newManifest.id,
            collectionUnitId: unit.id,
            expectedUnitNumber: unit.unitNumber,
            outcome: 'PENDING',
          },
        });

        await tx.collectionUnit.update({
          where: { id: unit.id },
          data: { status: 'IN_TRANSIT' },
        });

        await tx.unitStatusHistory.create({
          data: {
            unitType: 'COLLECTION_UNIT',
            collectionUnitId: unit.id,
            fromStatus: unit.status,
            toStatus: 'IN_TRANSIT',
            actorUserId: caller.id,
            organisationId: camp.organisationId!,
            reason: `Handover submitted by camp staff from ${camp.title} (${camp.campCode}) to parent blood bank. Manifest ${manifestNumber}`,
          },
        });
      }

      // 3. Publish real-time events for parent blood bank and camp rooms
      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'handover.dispatched',
        organisationId: camp.organisationId!,
        entityType: 'HandoverManifest',
        entityId: newManifest.id,
        payload: {
          manifestId: newManifest.id,
          manifestNumber: newManifest.manifestNumber,
          campId,
          campCode: camp.campCode,
          campTitle: camp.title,
          sendingOrganisationId: camp.organisationId!,
          receivingOrganisationId: camp.organisationId!,
          unitCount: eligibleUnits.length,
          carrier: input.transportDetails?.courierName || 'Camp Logistics',
          status: 'DISPATCHED',
        },
      });

      return newManifest;
    }, { maxWait: 10000, timeout: 25000 });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'CAMP_HANDOVER_SUBMITTED',
        resource: 'HandoverManifest',
        resourceId: manifest.id,
        metadata: {
          campId,
          manifestNumber: manifest.manifestNumber,
          unitsHandedOver: eligibleUnits.map((u) => u.unitNumber),
          unitCount: eligibleUnits.length,
        },
      },
    });

    return {
      idempotent: false,
      manifest,
      message: `Handover manifest "${manifest.manifestNumber}" with ${eligibleUnits.length} unit(s) submitted to parent blood bank.`,
    };
  }

  // ====================================================
  // 7. SAFE CAMP CLOSURE & ACCESS REVOCATION WORKFLOW
  // ====================================================

  /**
   * Authoritative Camp Closure Readiness Assessment.
   * Checks for incomplete work, un-handed-over units, units in transit,
   * un-reconciled handovers, and open discrepancies.
   */
  static async getCampClosureReadiness(campId: string, caller?: CallerUser) {
    const { camp } = await this.getCampWithOrgCheck(campId, caller);

    const blockers: string[] = [];

    if (camp.status === 'COMPLETED') {
      return {
        isReady: false,
        isClosed: true,
        blockers: ['Camp is already closed and archived.'],
        metrics: null,
      };
    }

    if (camp.status !== 'APPROVED') {
      blockers.push(`Camp cannot be closed because it is currently in "${camp.status}" state.`);
    }

    // 1. Check for incomplete attendances
    const attendances = await prisma.campAttendance.findMany({
      where: { campId, status: { not: 'CANCELLED' } },
      include: {
        screening: true,
        donationEvent: true,
      },
    });

    let checkedInWithoutResolution = 0;
    for (const a of attendances) {
      if (a.status === 'CHECKED_IN') {
        if (!a.screening || (a.screening.status === 'CLEARED' && !a.donationEvent)) {
          checkedInWithoutResolution++;
        }
      }
    }
    if (checkedInWithoutResolution > 0) {
      blockers.push(`${checkedInWithoutResolution} donor(s) were checked in but have incomplete clinical screening or donation recording.`);
    }

    // 2. Check for units still in camp custody
    const unitsInCustody = await prisma.collectionUnit.count({
      where: {
        campId,
        status: { in: ['COLLECTED', 'PREPARED_FOR_HANDOVER'] },
      },
    });
    if (unitsInCustody > 0) {
      blockers.push(`${unitsInCustody} collection unit(s) remain in camp custody. A handover manifest must be submitted to the parent blood bank.`);
    }

    // 3. Check for units in transit (dispatched but not yet physically received)
    const unitsInTransit = await prisma.collectionUnit.count({
      where: {
        campId,
        status: 'IN_TRANSIT',
      },
    });
    if (unitsInTransit > 0) {
      blockers.push(`${unitsInTransit} collection unit(s) are currently in transit. The parent blood bank must physically verify and receive them.`);
    }

    // 4. Check for active handovers that are not yet reconciled
    const unreconciledManifests = await prisma.handoverManifest.findMany({
      where: {
        campId,
        status: { notIn: ['RECONCILED', 'CANCELLED'] },
      },
      select: { manifestNumber: true, status: true },
    });
    if (unreconciledManifests.length > 0) {
      const refs = unreconciledManifests.map((m) => `${m.manifestNumber} (${m.status})`).join(', ');
      blockers.push(`Handover manifest(s) ${refs} must be fully reconciled by the parent blood bank before camp closure.`);
    }

    // 5. Check for unresolved reconciliation exceptions
    const openExceptions = await prisma.reconciliationException.count({
      where: {
        manifest: { campId },
        status: { notIn: ['RESOLVED', 'WAIVED'] },
      },
    });
    if (openExceptions > 0) {
      blockers.push(`${openExceptions} reconciliation discrepancy exception(s) remain open. All discrepancies must be investigated and resolved.`);
    }

    // Summary counts
    const totalDonations = attendances.filter((a) => a.donationEvent?.outcome === 'COMPLETED').length;
    const totalConfirmedUnits = await prisma.collectionUnit.count({ where: { campId } });
    const totalReceivedUnits = await prisma.collectionUnit.count({
      where: {
        campId,
        status: { in: ['RECEIVED_BY_CENTRE', 'PROCESSING_COMPLETED'] },
      },
    });

    return {
      isReady: blockers.length === 0,
      isClosed: false,
      blockers,
      metrics: {
        totalDonations,
        totalConfirmedUnits,
        totalReceivedUnits,
        unitsInCustody,
        unitsInTransit,
        openExceptions,
        unreconciledManifestsCount: unreconciledManifests.length,
      },
    };
  }

  /**
   * Formally close and archive a camp drive.
   * Enforces all closure readiness prerequisites, persists closed status,
   * deactivates operational staff assignments while strictly preserving historical audit trails,
   * and broadcasts real-time closure to open client workspaces.
   */
  static async closeCamp(
    campId: string,
    caller: CallerUser,
    input?: { notes?: string }
  ) {
    const { camp, membership, campStaffAssignment } = await this.getCampWithOrgCheck(campId, caller);

    const isOrgAdmin = membership && membership.isActive && membership.role === 'ORG_ADMIN';
    const isCampAdmin = campStaffAssignment && campStaffAssignment.isActive && campStaffAssignment.role === 'CAMP_ADMIN';
    const isPlatformAdmin = caller.role === 'ADMIN';

    if (!isOrgAdmin && !isCampAdmin && !isPlatformAdmin) {
      throw new Error('Permission denied: Only parent blood bank administrators or the designated Camp Administrator can formally close a camp.');
    }

    if (camp.status === 'COMPLETED') {
      return { camp, message: 'Camp is already closed and archived.' };
    }

    const readiness = await this.getCampClosureReadiness(campId, caller);
    if (!readiness.isReady) {
      throw new Error(`Cannot close camp: Operational work remains unresolved. Blockers:\n• ${readiness.blockers.join('\n• ')}`);
    }

    const closedCamp = await prisma.$transaction(async (tx) => {
      // 1. Update camp status to COMPLETED
      const updated = await tx.camp.update({
        where: { id: campId },
        data: {
          status: 'COMPLETED',
          isReadyForCollection: false,
          readinessNotes: input?.notes?.trim()
            ? `${camp.readinessNotes ? camp.readinessNotes + ' | ' : ''}Closed: ${input.notes.trim()}`
            : camp.readinessNotes,
        },
      });

      // 2. Revoke ordinary operational staff permissions while strictly preserving historical assignments
      const now = new Date();
      await tx.campStaffAssignment.updateMany({
        where: {
          campId,
          isActive: true,
        },
        data: {
          isActive: false,
          revokedAt: now,
          revokedBy: caller.id,
        },
      });

      // 3. Publish real-time camp closure event
      await RealtimeService.publishOutboxEvent(tx, {
        eventType: 'camp.closed',
        entityType: 'Camp',
        entityId: campId,
        organisationId: camp.organisationId || undefined,
        payload: {
          campId,
          campCode: camp.campCode,
          title: camp.title,
          status: 'COMPLETED',
          closedAt: now.toISOString(),
          closedBy: caller.id,
          finalMetrics: readiness.metrics,
        },
      });

      return updated;
    }, { maxWait: 10000, timeout: 25000 });

    await prisma.auditLog.create({
      data: {
        userId: caller.id,
        action: 'CAMP_CLOSED',
        resource: 'Camp',
        resourceId: campId,
        metadata: {
          campCode: camp.campCode,
          closedAt: new Date().toISOString(),
          closedBy: caller.id,
          notes: input?.notes,
          finalMetrics: readiness.metrics,
        },
      },
    });

    return {
      camp: closedCamp,
      message: `Camp "${camp.title}" (${camp.campCode}) has been formally closed and archived. Operational access is revoked while historical records are preserved.`,
    };
  }
}
