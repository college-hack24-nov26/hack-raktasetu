/**
 * Canonical Blood Request Coordination Service
 *
 * Provides a single unified workflow across Web and Mobile for creating,
 * validating, routing, and tracking blood requests.
 *
 * Guarantees:
 * 1. Resolves participating Blood Banks vs external e-RaktKosh listings.
 * 2. Enforces anti-double-click 30-second deduplication.
 * 3. Structured metadata serialization for complete lifecycle tracking.
 * 4. Transactional persistence with audit logging and realtime outbox emission.
 */

import { prisma } from '../lib/prisma';
import { BloodGroup, ComponentType, SearchScope } from '@prisma/client';
import { RealtimeService } from './realtime';
import { parseRequestMessageMetadata } from './hospitalIntegration';

export interface CreateBloodRequestInput {
  patientName?: string;
  bloodGroup: string;
  component?: string;
  unitsRequested?: number;
  requiredBy?: string | Date;
  hospitalCode?: string;
  admittedHospitalName?: string;
  receivingFacilityId?: string;
  urgency?: 'ROUTINE' | 'URGENT' | 'CRITICAL' | string;
  searchScope?: SearchScope;
  message?: string;
  requesterContact?: string;
  requesterConsent?: boolean;
}

export interface CanonicalBloodRequestResult {
  id: string;
  requesterId: string;
  patientName: string | null;
  bloodGroup: BloodGroup;
  component: string;
  unitsRequested: number;
  requiredBy: Date | null;
  hospitalCode: string | null;
  searchScope: SearchScope;
  message: string | null;
  status: string;
  closureOutcome: string | null;
  closureFeedback: string | null;
  reportedDonationStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
  requestReference: string;
  admittedHospitalName: string;
  isHospitalVerified: boolean;
  assignedBankId: string | null;
  assignedBankName: string | null;
  urgency: 'ROUTINE' | 'URGENT' | 'CRITICAL';
  fulfillmentStatus: string;
  isDuplicateSuppressed: boolean;
  bloodCentre?: any;
}

function parseBloodGroupEnum(raw: string): BloodGroup {
  const normalized = raw.trim().toUpperCase().replace(/\s+/g, '');
  const map: Record<string, BloodGroup> = {
    'A+': BloodGroup.A_POS,
    'A_POS': BloodGroup.A_POS,
    'A_POSITIVE': BloodGroup.A_POS,
    'A-': BloodGroup.A_NEG,
    'A_NEG': BloodGroup.A_NEG,
    'A_NEGATIVE': BloodGroup.A_NEG,
    'B+': BloodGroup.B_POS,
    'B_POS': BloodGroup.B_POS,
    'B_POSITIVE': BloodGroup.B_POS,
    'B-': BloodGroup.B_NEG,
    'B_NEG': BloodGroup.B_NEG,
    'B_NEGATIVE': BloodGroup.B_NEG,
    'AB+': BloodGroup.AB_POS,
    'AB_POS': BloodGroup.AB_POS,
    'AB_POSITIVE': BloodGroup.AB_POS,
    'AB-': BloodGroup.AB_NEG,
    'AB_NEG': BloodGroup.AB_NEG,
    'AB_NEGATIVE': BloodGroup.AB_NEG,
    'O+': BloodGroup.O_POS,
    'O_POS': BloodGroup.O_POS,
    'O_POSITIVE': BloodGroup.O_POS,
    'O-': BloodGroup.O_NEG,
    'O_NEG': BloodGroup.O_NEG,
    'O_NEGATIVE': BloodGroup.O_NEG,
  };
  const result = map[normalized];
  if (!result) {
    throw new Error(`Invalid blood group: '${raw}'. Valid values: A+, A-, B+, B-, AB+, AB-, O+, O-`);
  }
  return result;
}

export class BloodRequestCoordinationService {
  /**
   * Creates a canonical blood request with atomic guarantees.
   */
  static async createCanonicalRequest(
    requesterId: string,
    input: CreateBloodRequestInput
  ): Promise<CanonicalBloodRequestResult> {
    // 1. Validate Blood Group
    const parsedGroup = parseBloodGroupEnum(input.bloodGroup);

    // 2. Validate Units
    const units = Math.max(1, Math.min(10, Number(input.unitsRequested) || 1));

    // 3. Component String
    const component = input.component?.trim() || 'Whole Blood';

    // 4. Validate Required By date
    let parsedRequiredBy: Date | null = null;
    if (input.requiredBy) {
      const d = new Date(input.requiredBy);
      if (!isNaN(d.getTime())) {
        parsedRequiredBy = d;
      }
    }

    // 5. Admitted Hospital Name
    const admittedHospital = input.admittedHospitalName || input.hospitalCode || 'Direct/Unassigned Facility';

    // 6. Anti-duplicate guard: 30-second window
    const thirtySecAgo = new Date(Date.now() - 30 * 1000);
    const recentDuplicate = await prisma.bloodRequest.findFirst({
      where: {
        requesterId,
        bloodGroup: parsedGroup,
        component,
        createdAt: { gte: thirtySecAgo },
      },
      include: {
        bloodCentre: true,
      },
    });

    if (recentDuplicate) {
      const duplicateMeta = parseRequestMessageMetadata(recentDuplicate.message, recentDuplicate.bloodCentre?.hospitalName);
      return {
        ...recentDuplicate,
        requestReference: `#${recentDuplicate.id.slice(0, 8)}`,
        admittedHospitalName: duplicateMeta.hospitalName || recentDuplicate.bloodCentre?.hospitalName || 'Direct/Unassigned Facility',
        isHospitalVerified: Boolean(duplicateMeta.isHospitalVerified),
        assignedBankId: duplicateMeta.assignedBankId || null,
        assignedBankName: duplicateMeta.assignedBankName || null,
        urgency: (duplicateMeta.urgency === 'NORMAL' ? 'ROUTINE' : duplicateMeta.urgency) || 'ROUTINE',
        fulfillmentStatus: recentDuplicate.closureOutcome || recentDuplicate.status,
        isDuplicateSuppressed: true,
      };
    }

    // 7. Verify receiving hospital facility if registered ID provided
    let isHospitalVerified = false;
    let verifiedReceivingFacilityId: string | null = null;
    if (input.receivingFacilityId) {
      const facility = await prisma.organisation.findFirst({
        where: { id: String(input.receivingFacilityId), type: 'RECEIVING_FACILITY' },
      });
      if (facility) {
        isHospitalVerified = true;
        verifiedReceivingFacilityId = facility.id;
      }
    }

    // 8. Resolve target Blood Bank / Centre
    let resolvedHospitalCode: string | null = null;
    let assignedBankId: string | null = null;
    let assignedBankName: string | null = null;
    let isExternalDirectory = false;

    if (input.hospitalCode && String(input.hospitalCode).trim() !== '') {
      const trimmedCode = String(input.hospitalCode).trim();

      // Check participating Organisation directory first (Blood Bank portal user)
      const participatingOrg = await prisma.organisation.findFirst({
        where: {
          OR: [
            { orgCode: trimmedCode },
            { hospitalCode: trimmedCode },
            { id: trimmedCode },
          ],
          type: 'BLOOD_BANK',
          status: 'VERIFIED',
        },
      });

      if (participatingOrg) {
        assignedBankId = participatingOrg.id;
        assignedBankName = participatingOrg.name;
        const canonicalCode = participatingOrg.hospitalCode || participatingOrg.orgCode;

        // Ensure BloodCentre directory record exists so foreign keys are satisfied
        await prisma.bloodCentre.upsert({
          where: { hospitalCode: canonicalCode },
          update: {
            hospitalName: participatingOrg.name,
            address: participatingOrg.address,
            mobileNo: participatingOrg.phone,
            stateCode: participatingOrg.stateCode,
            districtCode: participatingOrg.districtCode,
          },
          create: {
            hospitalCode: canonicalCode,
            hospitalName: participatingOrg.name,
            address: participatingOrg.address,
            mobileNo: participatingOrg.phone,
            stateCode: participatingOrg.stateCode,
            districtCode: participatingOrg.districtCode,
          },
        });

        if (!participatingOrg.hospitalCode) {
          await prisma.organisation.update({
            where: { id: participatingOrg.id },
            data: { hospitalCode: canonicalCode },
          });
        }

        resolvedHospitalCode = canonicalCode;
      } else {
        // Fallback: check BloodCentre table (external e-RaktKosh listing)
        const centre = await prisma.bloodCentre.findUnique({
          where: { hospitalCode: trimmedCode },
        });

        if (centre) {
          resolvedHospitalCode = centre.hospitalCode;
          isExternalDirectory = true;
        } else {
          throw new Error(`Selected Blood Bank or Centre '${trimmedCode}' could not be found or is not available.`);
        }
      }
    }

    // 9. Normalize urgency & search scope
    const normalizedUrgency = ['ROUTINE', 'URGENT', 'CRITICAL'].includes(String(input.urgency).toUpperCase())
      ? (String(input.urgency).toUpperCase() as 'ROUTINE' | 'URGENT' | 'CRITICAL')
      : input.urgency === 'NORMAL'
      ? 'ROUTINE'
      : 'ROUTINE';

    let parsedScope: SearchScope = 'EXACT_CENTRE';
    if (input.searchScope && ['DISTRICT_EXPANDED', 'OUT_OF_DISTRICT', 'EXACT_CENTRE'].includes(input.searchScope)) {
      parsedScope = input.searchScope;
    } else if (!resolvedHospitalCode) {
      parsedScope = 'DISTRICT_EXPANDED';
    }

    // 10. Construct structured message payload
    const messagePayload = JSON.stringify({
      hospitalName: admittedHospital.trim(),
      receivingFacilityId: verifiedReceivingFacilityId || undefined,
      isHospitalVerified,
      assignedBankId: assignedBankId || undefined,
      assignedBankName: assignedBankName || undefined,
      isExternalDirectory,
      urgency: normalizedUrgency,
      userMessage: input.message ? String(input.message).slice(0, 500).trim() : undefined,
      requesterContact: input.requesterContact || undefined,
      requesterConsent: input.requesterConsent !== false,
      reservedUnitIds: [],
      dispatchedUnitIds: [],
      patientAcknowledgedAt: null,
      patientAcknowledgedBy: null,
    });

    // 11. Transactionally persist BloodRequest and audit log
    return await prisma.$transaction(async (tx) => {
      const newRequest = await tx.bloodRequest.create({
        data: {
          requesterId,
          patientName: input.patientName ? String(input.patientName).trim().slice(0, 100) : null,
          bloodGroup: parsedGroup,
          component,
          unitsRequested: units,
          requiredBy: parsedRequiredBy,
          hospitalCode: resolvedHospitalCode,
          searchScope: parsedScope,
          message: messagePayload,
          status: 'OPEN',
          closureOutcome: 'SUBMITTED',
          reportedDonationStatus: 'SUBMITTED',
        },
        include: {
          bloodCentre: {
            select: {
              hospitalCode: true,
              hospitalName: true,
              address: true,
              mobileNo: true,
              districtCode: true,
            },
          },
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          userId: requesterId,
          action: 'CREATE_BLOOD_REQUEST',
          resource: 'BloodRequest',
          resourceId: newRequest.id,
          metadata: {
            requestId: newRequest.id,
            patientName: newRequest.patientName,
            bloodGroup: parsedGroup,
            component,
            units,
            hospitalCode: resolvedHospitalCode,
            assignedBankId,
            urgency: normalizedUrgency,
          },
        },
      });

      // Realtime Notification Event for Patient
      try {
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'blood_request.status_changed',
          entityType: 'BloodRequest',
          entityId: newRequest.id,
          recipientUserId: requesterId,
          payload: {
            requestId: newRequest.id,
            requestReference: `#${newRequest.id.slice(0, 8)}`,
            status: 'SUBMITTED',
            bloodGroup: newRequest.bloodGroup,
            component: newRequest.component,
            unitsRequested: newRequest.unitsRequested,
            hospitalName: admittedHospital.trim(),
            assignedBankName: assignedBankName || null,
            urgency: normalizedUrgency,
            timestamp: new Date().toISOString(),
          },
        });

        // Realtime Event for Designated Blood Bank (if participating)
        if (assignedBankId) {
          await RealtimeService.publishOutboxEvent(tx, {
            eventType: 'blood_request.status_changed',
            entityType: 'BloodRequest',
            entityId: newRequest.id,
            organisationId: assignedBankId,
            payload: {
              requestId: newRequest.id,
              requestReference: `#${newRequest.id.slice(0, 8)}`,
              status: 'SUBMITTED',
              bloodGroup: newRequest.bloodGroup,
              component: newRequest.component,
              unitsRequested: newRequest.unitsRequested,
              hospitalName: admittedHospital.trim(),
              urgency: normalizedUrgency,
              timestamp: new Date().toISOString(),
            },
          });
        }
      } catch {
        /* Non-blocking outbox */
      }

      return {
        ...newRequest,
        requestReference: `#${newRequest.id.slice(0, 8)}`,
        admittedHospitalName: admittedHospital.trim(),
        isHospitalVerified,
        assignedBankId,
        assignedBankName,
        urgency: normalizedUrgency,
        fulfillmentStatus: 'SUBMITTED',
        isDuplicateSuppressed: false,
      };
    }, { maxWait: 15000, timeout: 30000 });
  }
}
