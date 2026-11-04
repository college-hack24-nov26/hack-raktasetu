import { prisma } from '../lib/prisma';
import crypto from 'crypto';
import { normalizePhoneNumber } from './auth';
import { getInitialCounsellingAnswers } from '../config/counsellingQuestions';
import { RealtimeService } from './realtime';
import { CampOperationsService } from './campOperations';

export interface CallerUser {
  id?: string;
  userId?: string;
  role: string;
  phoneNumber?: string;
  name?: string | null;
}

export type CampRole = 'ADMIN' | 'CAMP_ADMIN' | 'CAMP_COORDINATOR' | 'CLINICAL_STAFF' | 'COLLECTION_STAFF';

export class DonorRegistrationService {
  /**
   * Helper: verify caller staff permissions and resolve effective camp role
   */
  public static async verifyStaffAccessAndGetRole(
    caller: CallerUser,
    organisationId?: string | null,
    campId?: string | null
  ): Promise<CampRole> {
    if (caller.role === 'ADMIN') {
      return 'ADMIN';
    }

    const callerUserId = (caller as any)?.id || (caller as any)?.userId;
    const cleanCampId = campId && campId !== 'undefined' && campId !== 'null' ? campId : undefined;
    const cleanOrgId = organisationId && organisationId !== 'undefined' && organisationId !== 'null' ? organisationId : undefined;

    if (cleanCampId) {
      const campAssignment = await prisma.campStaffAssignment.findFirst({
        where: {
          campId: cleanCampId,
          userId: callerUserId,
          OR: [
            { isActive: true },
            { camp: { status: 'COMPLETED' } },
          ],
        },
      });
      if (campAssignment) {
        return campAssignment.role as CampRole;
      }

      const camp = await prisma.camp.findUnique({
        where: { id: cleanCampId },
        select: { organisationId: true, createdById: true },
      });
      if (camp?.createdById === callerUserId) {
        return 'CAMP_ADMIN';
      }
      if (camp?.organisationId) {
        const orgMember = await prisma.organisationMembership.findUnique({
          where: {
            userId_organisationId: {
              userId: callerUserId,
              organisationId: camp.organisationId,
            },
          },
        });
        if (orgMember?.isActive) {
          if (orgMember.role === 'ORG_ADMIN') return 'CAMP_ADMIN';
          if (orgMember.role === 'CLINICAL_STAFF') return 'CLINICAL_STAFF';
          if (orgMember.role === 'COLLECTION_STAFF') return 'COLLECTION_STAFF';
          return 'CAMP_COORDINATOR';
        }

        // Also check if user has ANY camp staff assignment within this camp's organisation
        const orgCampStaff = await prisma.campStaffAssignment.findFirst({
          where: {
            organisationId: camp.organisationId,
            userId: callerUserId,
            OR: [
              { isActive: true },
              { camp: { status: 'COMPLETED' } },
            ],
          },
        });
        if (orgCampStaff) {
          return orgCampStaff.role as CampRole;
        }
      }
    }

    if (cleanOrgId) {
      const orgMember = await prisma.organisationMembership.findUnique({
        where: {
          userId_organisationId: {
            userId: callerUserId,
            organisationId: cleanOrgId,
          },
        },
      });
      if (orgMember?.isActive) {
        if (orgMember.role === 'ORG_ADMIN') return 'CAMP_ADMIN';
        if (orgMember.role === 'CLINICAL_STAFF') return 'CLINICAL_STAFF';
        if (orgMember.role === 'COLLECTION_STAFF') return 'COLLECTION_STAFF';
        return 'CAMP_COORDINATOR';
      }

      // Check if user has an active or completed camp staff assignment within this organisation
      const orgCampStaff = await prisma.campStaffAssignment.findFirst({
        where: {
          organisationId: cleanOrgId,
          userId: callerUserId,
          OR: [
            { isActive: true },
            { camp: { status: 'COMPLETED' } },
          ],
        },
      });
      if (orgCampStaff) {
        return orgCampStaff.role as CampRole;
      }

      // Check if user is the creator of any camp belonging to this organisation
      const orgCampCreator = await prisma.camp.findFirst({
        where: {
          organisationId: cleanOrgId,
          createdById: callerUserId,
        },
      });
      if (orgCampCreator) {
        return 'CAMP_ADMIN';
      }
    }

    // Fallback: only if NEITHER organisationId NOR campId was requested, check if caller is an active staff member anywhere
    if (!cleanOrgId && !cleanCampId) {
      const anyOrgMember = await prisma.organisationMembership.findFirst({
        where: {
          userId: callerUserId,
          isActive: true,
        },
      });
      if (anyOrgMember) {
        if (anyOrgMember.role === 'ORG_ADMIN') return 'CAMP_ADMIN';
        if (anyOrgMember.role === 'CLINICAL_STAFF') return 'CLINICAL_STAFF';
        if (anyOrgMember.role === 'COLLECTION_STAFF') return 'COLLECTION_STAFF';
        return 'CAMP_COORDINATOR';
      }

      const anyCampStaff = await prisma.campStaffAssignment.findFirst({
        where: {
          userId: callerUserId,
          OR: [
            { isActive: true },
            { camp: { status: 'COMPLETED' } },
          ],
        },
      });
      if (anyCampStaff) {
        return anyCampStaff.role as CampRole;
      }
    }

    throw new Error('Permission denied: You do not have authorised staff access to this organisation or camp.');
  }

  /**
   * Helper: verify caller staff permissions for organisation or camp
   */
  public static async verifyStaffAccess(
    caller: CallerUser,
    organisationId?: string | null,
    campId?: string | null
  ) {
    await this.verifyStaffAccessAndGetRole(caller, organisationId, campId);
    return true;
  }

  /**
   * Safe phone number lookup for existing donor profile
   */
  public static async lookupDonorByPhone(phoneNumber: string, caller: CallerUser) {
    const normalized = normalizePhoneNumber(phoneNumber);

    const user = await prisma.user.findUnique({
      where: { phoneNumber: normalized },
      include: {
        donorProfile: true,
      },
    });

    if (!user) {
      return {
        exists: false,
        normalizedPhone: normalized,
      };
    }

    // Retrieve registration count and past donation dates
    const registrations: any[] = await prisma.$queryRaw`
      SELECT id, registration_number, workflow_status, completed_at, created_at,
             screening_status, collection_status, (donor_details->>'fullName') as full_name
      FROM donor_registrations
      WHERE donor_user_id = ${user.id}
      ORDER BY created_at DESC
      LIMIT 10;
    `;

    const donorProfile = user.donorProfile;
    const isRepeatDonor = registrations.length > 0 || Boolean(donorProfile?.lastDonationDate);
    const lastDonationDate = donorProfile?.verifiedLastDonationDate || donorProfile?.lastDonationDate || null;

    return {
      exists: true,
      userId: user.id,
      normalizedPhone: normalized,
      fullName: donorProfile?.fullName || user.name || '',
      dateOfBirth: donorProfile?.dateOfBirth ? donorProfile.dateOfBirth.toISOString().split('T')[0] : null,
      bloodGroup: donorProfile?.bloodGroup || null,
      stateCode: donorProfile?.stateCode || 27,
      districtCode: donorProfile?.districtCode || 521,
      cityOrLocality: donorProfile?.cityOrLocality || '',
      isRepeatDonor,
      lastDonationDate: lastDonationDate ? lastDonationDate.toISOString().split('T')[0] : null,
      totalRegistrationsCount: registrations.length,
      pastRegistrations: registrations.map((r) => ({
        id: r.id,
        registrationNumber: r.registration_number,
        status: r.workflow_status,
        createdAt: r.created_at,
        completedAt: r.completed_at,
      })),
    };
  }

  /**
   * List authorized camps and organisations for registration
   */
  public static async listAuthorizedCampsAndCentres(caller: CallerUser) {
    const isPlatformAdmin = caller.role === 'ADMIN';

    // Organisations where caller is active member
    const orgMemberships = await prisma.organisationMembership.findMany({
      where: isPlatformAdmin ? {} : { userId: caller.id, isActive: true },
      include: {
        organisation: {
          include: {
            bloodCentre: true,
          },
        },
      },
    });

    const authorisedOrgIds = orgMemberships.map((m) => m.organisationId);

    // Active camp staff assignments (e.g. CAMP_COORDINATOR, CLINICAL_STAFF, COLLECTION_STAFF, CAMP_ADMIN)
    const campAssignments = await prisma.campStaffAssignment.findMany({
      where: isPlatformAdmin ? {} : { userId: caller.id, isActive: true },
      include: {
        camp: {
          include: {
            bloodCentre: true,
            organisation: true,
          },
        },
      },
    });

    // Determine if the caller is coordinator only (no internal blood bank org membership)
    const isCoordinatorOnly = !isPlatformAdmin && orgMemberships.length === 0;

    // Non-coordinators (e.g. blood bank staff / admin) can also access their org's camps
    const additionalCamps = isCoordinatorOnly
      ? []
      : await prisma.camp.findMany({
          where: isPlatformAdmin
            ? {}
            : {
                OR: [
                  { createdById: caller.id },
                  { organisationId: { in: authorisedOrgIds } },
                ],
              },
          include: {
            bloodCentre: true,
            organisation: true,
          },
        });

    const campsMap = new Map<string, any>();
    for (const a of campAssignments) {
      if (a.camp) campsMap.set(a.camp.id, a.camp);
    }
    for (const c of additionalCamps) {
      campsMap.set(c.id, c);
    }

    // Build comprehensive organisations map from memberships AND assigned camps
    const orgsMap = new Map<string, any>();
    for (const m of orgMemberships) {
      orgsMap.set(m.organisation.id, {
        id: m.organisation.id,
        orgCode: m.organisation.orgCode,
        name: m.organisation.name,
        licenseNumber: m.organisation.licenseNumber,
        hospitalCode: m.organisation.hospitalCode,
        role: m.role,
      });
    }

    // Crucial: Auto-include organisations associated with the user's assigned camps
    for (const c of campsMap.values()) {
      if (c.organisation && !orgsMap.has(c.organisation.id)) {
        orgsMap.set(c.organisation.id, {
          id: c.organisation.id,
          orgCode: c.organisation.orgCode,
          name: c.organisation.name,
          licenseNumber: c.organisation.licenseNumber,
          hospitalCode: c.organisation.hospitalCode,
          role: 'CAMP_STAFF',
        });
      }
    }

    const assignmentMap = new Map(campAssignments.map((a) => [a.campId, a.role]));

    const organisations = Array.from(orgsMap.values());

    const camps = Array.from(campsMap.values()).map((c) => ({
      id: c.id,
      campCode: c.campCode,
      title: c.title,
      targetDate: c.targetDate,
      venue: c.venue,
      status: c.status,
      organisationId: c.organisationId,
      hospitalCode: c.hospitalCode,
      bloodCentreName: c.bloodCentre?.hospitalName || c.organisation?.name || 'Authorized Centre',
      isReadyForCollection: Boolean(c.isReadyForCollection),
      readinessVerifiedAt: c.readinessVerifiedAt,
      userRole:
        assignmentMap.get(c.id) ||
        (isPlatformAdmin
          ? 'ADMIN'
          : orgMemberships.find((m) => m.organisationId === c.organisationId)?.role === 'ORG_ADMIN'
          ? 'CAMP_ADMIN'
          : 'CAMP_COORDINATOR'),
      organisation: c.organisation
        ? {
            id: c.organisation.id,
            orgCode: c.organisation.orgCode,
            name: c.organisation.name,
          }
        : null,
    }));

    let userRole = 'CAMP_COORDINATOR';
    if (isPlatformAdmin) {
      userRole = 'ADMIN';
    } else if (orgMemberships.some((m) => m.role === 'ORG_ADMIN') || campAssignments.some((a) => a.role === 'CAMP_ADMIN')) {
      userRole = 'CAMP_ADMIN';
    } else if (orgMemberships.some((m) => m.role === 'CLINICAL_STAFF') || campAssignments.some((a) => a.role === 'CLINICAL_STAFF')) {
      userRole = 'CLINICAL_STAFF';
    } else if (orgMemberships.some((m) => m.role === 'COLLECTION_STAFF') || campAssignments.some((a) => a.role === 'COLLECTION_STAFF')) {
      userRole = 'COLLECTION_STAFF';
    }

    return { organisations, camps, userRole };
  }

  /**
   * Get eligible clinical and counselling staff for an organisation or camp
   */
  public static async getClinicalStaffForOrganisation(
    organisationId?: string,
    caller?: CallerUser,
    campId?: string
  ) {
    let targetOrgId = organisationId && organisationId !== 'undefined' && organisationId !== 'null' ? organisationId : undefined;
    const cleanCampId = campId && campId !== 'undefined' && campId !== 'null' ? campId : undefined;
    let camp: any = null;

    if (cleanCampId) {
      camp = await prisma.camp.findUnique({
        where: { id: cleanCampId },
        select: { id: true, organisationId: true, createdById: true, status: true },
      });
      if (camp?.organisationId) {
        targetOrgId = camp.organisationId;
      }
    }

    if (caller) {
      await this.verifyStaffAccess(caller, targetOrgId, cleanCampId);
    }

    // 1. Fetch active clinical staff & admins from parent organisation memberships
    const orgMembers = targetOrgId
      ? await prisma.organisationMembership.findMany({
          where: {
            organisationId: targetOrgId,
            isActive: true,
            user: { status: 'ACTIVE' },
            role: { in: ['CLINICAL_STAFF', 'ORG_ADMIN'] },
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                role: true,
                phoneNumber: true,
              },
            },
          },
          orderBy: { assignedAt: 'asc' },
        })
      : [];

    // 2. Fetch active clinical staff & admins assigned specifically to this camp
    const campMembers = cleanCampId
      ? await prisma.campStaffAssignment.findMany({
          where: {
            campId: cleanCampId,
            ...(camp?.status === 'COMPLETED' ? {} : { isActive: true }),
            user: { status: 'ACTIVE' },
            role: { in: ['CLINICAL_STAFF', 'CAMP_ADMIN'] },
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                role: true,
                phoneNumber: true,
              },
            },
          },
          orderBy: { assignedAt: 'asc' },
        })
      : [];

    // 3. Deduplicate staff by userId and assign verified Medical Officer authority
    const staffMap = new Map<string, any>();

    for (const m of orgMembers) {
      const name = m.user.name || 'Medical Staff';
      // Identify medical qualification / doctor title
      const isDoc = /(\bdr\.|\bdr\b|\bdoctor\b|\bmedical officer\b|\bmo\b|\bmbbs\b|\bmd\b|\bdnb\b)/i.test(name);
      staffMap.set(m.userId, {
        id: m.userId,
        userId: m.userId,
        name,
        role: m.role,
        orgRole: m.role,
        isMedicalOfficer: isDoc,
        assignedVia: 'ORGANISATION',
      });
    }

    for (const c of campMembers) {
      const name = c.user.name || 'Medical Staff';
      const isDoc = /(\bdr\.|\bdr\b|\bdoctor\b|\bmedical officer\b|\bmo\b|\bmbbs\b|\bmd\b|\bdnb\b)/i.test(name);
      if (!staffMap.has(c.userId)) {
        staffMap.set(c.userId, {
          id: c.userId,
          userId: c.userId,
          name,
          role: c.role,
          orgRole: c.role,
          isMedicalOfficer: isDoc,
          assignedVia: 'CAMP',
        });
      } else {
        const existing = staffMap.get(c.userId);
        if (isDoc) {
          existing.isMedicalOfficer = true;
        }
      }
    }

    return Array.from(staffMap.values());
  }

  /**
   * Save registration draft or advance step
   */
  public static async saveRegistration(caller: CallerUser, payload: any) {
    let {
      registrationId,
      campId,
      organisationId,
      bloodCentreId,
      registrationSource = 'CAMP',
      donationType = 'VOLUNTARY',
      currentStep = 1,
      donorDetails = {},
      counsellingAnswers,
      counsellingRemarks,
      counsellingStatus,
      counsellingReviewedById,
      canIssuePlasma,
      counsellingDeferralType,
      counsellingDeferralReason,
      screening = {},
      collection = {},
      consent = {},
    } = payload;

    let existingReg: any = null;
    if (registrationId) {
      const found: any[] = await prisma.$queryRaw`
        SELECT * FROM donor_registrations WHERE id = ${registrationId} OR registration_number = ${registrationId} LIMIT 1;
      `;
      if (found.length > 0) {
        existingReg = found[0];
        registrationId = existingReg.id;
      }
    }

    const targetCampId = campId || existingReg?.camp_id;
    let authoritativeOrgId = organisationId || existingReg?.organisation_id;
    let authoritativeBloodCentreId = bloodCentreId || existingReg?.blood_centre_id;

    // Requirement: Authoritative camp-to-blood-centre association
    if (targetCampId) {
      const camp = await prisma.camp.findUnique({
        where: { id: targetCampId },
        include: {
          organisation: true,
          bloodCentre: true,
        },
      });

      if (!camp) {
        throw new Error(`Specified camp with ID '${targetCampId}' was not found.`);
      }

      // Validate camp status (must be APPROVED or COMPLETED)
      if (!['APPROVED', 'COMPLETED'].includes(camp.status)) {
        throw new Error(
          `Camp '${camp.title}' is in status '${camp.status}'. Donor registration is permitted only for APPROVED or COMPLETED camps.`
        );
      }

      // Validate parent blood centre exists and is verified
      if (!camp.organisationId || !camp.organisation) {
        throw new Error(
          `Camp '${camp.title}' does not have an active parent blood centre / organisation associated in the system.`
        );
      }

      // Check cross-organisation conflict
      if (organisationId && organisationId !== camp.organisationId) {
        throw new Error(
          `Mismatched organisation: Camp belongs to organisation '${camp.organisation.name}' (${camp.organisationId}), but request specified '${organisationId}'.`
        );
      }

      // Enforce operational readiness boundary before registration or workflow progression
      if (camp.status === 'APPROVED' && !camp.isReadyForCollection) {
        if (!existingReg) {
          throw new Error(
            `Camp '${camp.title}' is not ready for operations. Operational readiness must be verified by the authorised blood centre before starting new donor registrations.`
          );
        }
        if (currentStep > 1 || (screening && screening.status) || (collection && collection.status)) {
          throw new Error(
            `Camp '${camp.title}' is not ready for operations. Operational readiness must be verified before advancing registrations.`
          );
        }
      }

      authoritativeOrgId = camp.organisationId;
      authoritativeBloodCentreId = camp.hospitalCode || camp.organisation.hospitalCode || null;
    }

    if (!authoritativeOrgId) {
      throw new Error('An authoritative parent organisation / blood centre is required for donor registration.');
    }

    // Verify caller staff permissions and role for this camp/organisation
    const callerStaffRole = await this.verifyStaffAccessAndGetRole(caller, authoritativeOrgId, targetCampId);

    // Enforce role-based step access:
    // CAMP_COORDINATOR can only register donor details (Step 1) and drafts; cannot do clinical or collection.
    if (callerStaffRole === 'CAMP_COORDINATOR') {
      // 1. Coordinator cannot save clinical counselling answers on behalf of clinical staff
      if (counsellingAnswers && counsellingAnswers.length > 0) {
        const hasStaffAnswers = counsellingAnswers.some(
          (a: any) =>
            a.staffEdited ||
            a.reviewStatus === 'REVIEWED_APPROVED' ||
            (a.answer !== null && a.answer !== undefined)
        );
        if (hasStaffAnswers || counsellingReviewedById || (counsellingStatus && counsellingStatus !== 'PENDING')) {
          throw new Error('Permission denied: Camp Coordinator is not authorized to record clinical counselling assessments.');
        }
      }

      // 2. Coordinator cannot record physical screening measurements or medical decisions
      if (screening && Object.keys(screening).length > 0) {
        const hasScreeningMeasurements =
          screening.weightKg ||
          screening.hemoglobin ||
          screening.systolicBp ||
          screening.diastolicBp ||
          screening.pulseBpm ||
          screening.pulse ||
          screening.temperatureCelsius ||
          screening.temperatureF ||
          screening.bloodGroup ||
          screening.bothArmsInspected ||
          screening.heightCm;
        const hasScreeningDecision = screening.status && screening.status !== 'PENDING';
        const hasClinicalStaffAssigned = screening.medicalOfficerId || screening.screenedById;

        if (hasScreeningMeasurements || hasScreeningDecision || hasClinicalStaffAssigned) {
          throw new Error('Permission denied: Camp Coordinator is not authorized to record clinical screening or medical decisions.');
        }
      }

      // 3. Coordinator cannot record blood collection
      if (collection && Object.keys(collection).length > 0) {
        const hasCollectionData =
          collection.status === 'COLLECTED' ||
          collection.bagType ||
          collection.volumeMl ||
          collection.unitNumber ||
          collection.barcode ||
          collection.phlebotomistId;
        if (hasCollectionData) {
          throw new Error('Permission denied: Camp Coordinator is not authorized to record phlebotomy / collection.');
        }
      }

      // Coordinator is submitting Step 1: sanitize clinical and collection payloads
      currentStep = 1;
      screening = {};
      collection = {};
      counsellingReviewedById = undefined;
      counsellingStatus = 'PENDING';
      counsellingRemarks = null;
      counsellingAnswers = undefined;
    }

    // CLINICAL_STAFF cannot perform collection
    if (callerStaffRole === 'CLINICAL_STAFF') {
      if (collection && Object.keys(collection).length > 0 && (collection.status === 'COLLECTED' || collection.bagType)) {
        throw new Error('Permission denied: Clinical staff is not authorized to record phlebotomy or collection outcomes.');
      }
      // Sanitize: Clinical staff cannot submit collection payloads
      collection = {};
    }

    // COLLECTION_STAFF cannot alter medical screening decisions
    if (callerStaffRole === 'COLLECTION_STAFF') {
      if (screening && Object.keys(screening).length > 0) {
        if (existingReg?.screening_status) {
          if (screening.status && screening.status !== existingReg.screening_status) {
            throw new Error('Permission denied: Collection staff cannot alter medical clearance decisions.');
          }
          if (screening.medicalOfficerId && screening.medicalOfficerId !== existingReg.medical_officer_id) {
            throw new Error('Permission denied: Collection staff cannot alter medical clearance decisions.');
          }
        } else if (screening.status || screening.medicalOfficerId) {
          throw new Error('Permission denied: Collection staff cannot alter medical clearance decisions.');
        }
      }
      // Sanitize: Collection staff does NOT update screening or counselling
      screening = {};
      counsellingAnswers = undefined;
      counsellingReviewedById = undefined;
    }

    // Validate assigned staff IDs against effective organisation or camp assignments
    if (counsellingReviewedById) {
      const staffMem = await prisma.organisationMembership.findFirst({
        where: {
          organisationId: authoritativeOrgId,
          userId: counsellingReviewedById,
          isActive: true,
          role: { in: ['CLINICAL_STAFF', 'ORG_ADMIN'] },
        },
      });
      const campStaffMem = targetCampId
        ? await prisma.campStaffAssignment.findFirst({
            where: {
              campId: targetCampId,
              userId: counsellingReviewedById,
              isActive: true,
              role: { in: ['CLINICAL_STAFF', 'CAMP_ADMIN'] },
            },
          })
        : null;

      if (!staffMem && !campStaffMem) {
        throw new Error('Selected counselling staff member is not an active, authorized clinical staff member of this organisation or camp.');
      }
    }

    if (screening.screenedById) {
      const staffMem = await prisma.organisationMembership.findFirst({
        where: {
          organisationId: authoritativeOrgId,
          userId: screening.screenedById,
          isActive: true,
          role: { in: ['CLINICAL_STAFF', 'ORG_ADMIN'] },
        },
      });
      const campStaffMem = targetCampId
        ? await prisma.campStaffAssignment.findFirst({
            where: {
              campId: targetCampId,
              userId: screening.screenedById,
              isActive: true,
              role: { in: ['CLINICAL_STAFF', 'CAMP_ADMIN'] },
            },
          })
        : null;

      if (!staffMem && !campStaffMem) {
        throw new Error('Selected screening staff member is not an active, authorized clinical staff member of this organisation or camp.');
      }
    }

    if (screening.medicalOfficerId) {
      const staffMem = await prisma.organisationMembership.findFirst({
        where: {
          organisationId: authoritativeOrgId,
          userId: screening.medicalOfficerId,
          isActive: true,
          role: { in: ['CLINICAL_STAFF', 'ORG_ADMIN'] },
        },
        include: { user: true },
      });
      const campStaffMem = targetCampId
        ? await prisma.campStaffAssignment.findFirst({
            where: {
              campId: targetCampId,
              userId: screening.medicalOfficerId,
              isActive: true,
              role: { in: ['CLINICAL_STAFF', 'CAMP_ADMIN'] },
            },
            include: { user: true },
          })
        : null;

      if (!staffMem && !campStaffMem) {
        throw new Error('Selected medical officer is not an active, authorized medical officer of this organisation or camp.');
      }

      const moUser = staffMem?.user || campStaffMem?.user;
      const moName = moUser?.name || '';
      const isDoc = /(\bdr\.|\bdr\b|\bdoctor\b|\bmedical officer\b|\bmo\b|\bmbbs\b|\bmd\b|\bdnb\b)/i.test(moName);
      if (!isDoc && staffMem?.role !== 'ORG_ADMIN' && campStaffMem?.role !== 'CAMP_ADMIN') {
        throw new Error('Selected staff member is not an authorised medical officer. A qualified Medical Officer (Doctor / MO) is required to certify donor medical fitness.');
      }
    }

    // Medical clearance invariant before collection
    if (collection && Object.keys(collection).length > 0 && (collection.status === 'COLLECTED' || collection.bagType)) {
      const effectiveScreenStatus = screening.status || existingReg?.screening_status || existingReg?.medical_decision;
      if (effectiveScreenStatus !== 'FIT') {
        throw new Error('Collection rejected: Donor must have an authorized medical clearance decision of FIT before phlebotomy can proceed.');
      }
      if (existingReg?.workflow_status === 'DEFERRED') {
        throw new Error('Collection rejected: Donor is deferred and cannot proceed to blood collection.');
      }
    }

    // Calculate age if DOB provided
    let calculatedAge: number | null = null;
    if (donorDetails.dateOfBirth) {
      const dob = new Date(donorDetails.dateOfBirth);
      if (!isNaN(dob.getTime())) {
        const diffMs = Date.now() - dob.getTime();
        calculatedAge = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000));
        donorDetails.calculatedAge = calculatedAge;
      }
    }

    // Mask Aadhaar if provided
    if (donorDetails.nationalIdAadhaar) {
      const raw = String(donorDetails.nationalIdAadhaar).replace(/\D/g, '');
      if (raw.length === 12) {
        donorDetails.nationalIdAadhaarMasked = `XXXX-XXXX-${raw.slice(8)}`;
        delete donorDetails.nationalIdAadhaar;
      }
    }

    // Working address synchronization
    const workingSameAsPermanent = Boolean(donorDetails.workingSameAsPermanent);
    let finalWorkingAddress = donorDetails.workingAddress || null;
    let finalWorkingState = donorDetails.workingState || null;
    let finalWorkingStateCode = donorDetails.workingStateCode ? Number(donorDetails.workingStateCode) : null;
    let finalWorkingDistrict = donorDetails.workingDistrict || null;
    let finalWorkingDistrictCode = donorDetails.workingDistrictCode ? Number(donorDetails.workingDistrictCode) : null;
    let finalWorkingCity = donorDetails.workingCity || null;
    let finalWorkingPinCode = donorDetails.workingPinCode || null;

    if (workingSameAsPermanent) {
      finalWorkingAddress = donorDetails.address || donorDetails.permanentAddress || donorDetails.addressLine || null;
      finalWorkingState = donorDetails.state || donorDetails.permanentState || null;
      finalWorkingStateCode = donorDetails.stateCode ? Number(donorDetails.stateCode) : 27;
      finalWorkingDistrict = donorDetails.district || donorDetails.permanentDistrict || null;
      finalWorkingDistrictCode = donorDetails.districtCode ? Number(donorDetails.districtCode) : 521;
      finalWorkingCity = donorDetails.city || null;
      finalWorkingPinCode = donorDetails.pinCode || null;

      donorDetails.workingAddress = finalWorkingAddress;
      donorDetails.workingState = finalWorkingState;
      donorDetails.workingStateCode = finalWorkingStateCode;
      donorDetails.workingDistrict = finalWorkingDistrict;
      donorDetails.workingDistrictCode = finalWorkingDistrictCode;
      donorDetails.workingCity = finalWorkingCity;
      donorDetails.workingPinCode = finalWorkingPinCode;
    }

    // Discovery consent
    const discoveryConsent = typeof donorDetails.discoveryConsent === 'boolean' ? donorDetails.discoveryConsent : false;
    const discoveryConsentSource = donorDetails.discoveryConsentSource || 'CAMP_REGISTRATION';
    const discoveryConsentVersion = donorDetails.discoveryConsentVersion || 'v1.0';

    // Validate primary mobile number format (exactly 10 Indian digits)
    if (donorDetails.primaryMobile) {
      let digits = String(donorDetails.primaryMobile).replace(/\D/g, '');
      if (digits.startsWith('91') && digits.length === 12) {
        digits = digits.slice(2);
      } else if (digits.startsWith('0') && digits.length === 11) {
        digits = digits.slice(1);
      }
      if (digits.length !== 10) {
        throw new Error(`Primary mobile number must be exactly 10 digits (received ${digits.length} digits).`);
      }
      donorDetails.primaryMobile = digits;
    }

    let donorUserId: string;
    let donorProfileId: string | null = null;

    if (existingReg) {
      donorUserId = existingReg.donor_user_id;
      donorProfileId = existingReg.donor_profile_id;
    } else {
      if (!donorDetails.primaryMobile) {
        throw new Error('Primary mobile number is required to register a donor.');
      }
      const normalizedPhone = normalizePhoneNumber(donorDetails.primaryMobile);

      let user = await prisma.user.findUnique({
        where: { phoneNumber: normalizedPhone },
        include: { donorProfile: true },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            phoneNumber: normalizedPhone,
            name: donorDetails.fullName || 'Anonymous Donor',
            role: 'DONOR',
            status: 'ACTIVE',
          },
          include: { donorProfile: true },
        });
      }

      donorUserId = user.id;

      let bloodGroupVal = donorDetails.bloodGroup;
      const validEnumGroups = ['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG'];
      const mappedEnumGroup = validEnumGroups.includes(bloodGroupVal) ? bloodGroupVal : 'O_POS';

      if (!user.donorProfile) {
        const newProfile = await prisma.donorProfile.create({
          data: {
            userId: user.id,
            fullName: donorDetails.fullName || user.name || 'Anonymous Donor',
            bloodGroup: mappedEnumGroup as any,
            stateCode: donorDetails.stateCode ? Number(donorDetails.stateCode) : 27,
            districtCode: donorDetails.districtCode ? Number(donorDetails.districtCode) : 521,
            cityOrLocality: donorDetails.city || donorDetails.cityOrLocality || null,
            dateOfBirth: donorDetails.dateOfBirth ? new Date(donorDetails.dateOfBirth) : null,
            lastDonationDate: donorDetails.lastDonationDate ? new Date(donorDetails.lastDonationDate) : null,
          },
        });
        donorProfileId = newProfile.id;
      } else {
        donorProfileId = user.donorProfile.id;
        await prisma.donorProfile.update({
          where: { id: user.donorProfile.id },
          data: {
            fullName: donorDetails.fullName || user.donorProfile.fullName,
            dateOfBirth: donorDetails.dateOfBirth ? new Date(donorDetails.dateOfBirth) : user.donorProfile.dateOfBirth,
            cityOrLocality: donorDetails.city || user.donorProfile.cityOrLocality,
          },
        });
      }
    }

    const normalizeBloodGroup = (bg?: string | null): string => {
      if (!bg) return 'O_POS';
      const clean = bg.toUpperCase().replace(/\s+/g, '').replace('POSITIVE', 'POS').replace('NEGATIVE', 'NEG').replace('+', '_POS').replace('-', '_NEG');
      const valid = ['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG'];
      if (valid.includes(clean)) return clean;
      if (clean === 'BPOS') return 'B_POS';
      if (clean === 'APOS') return 'A_POS';
      if (clean === 'ABPOS') return 'AB_POS';
      if (clean === 'OPOS') return 'O_POS';
      if (clean === 'BNEG') return 'B_NEG';
      if (clean === 'ANEG') return 'A_NEG';
      if (clean === 'ABNEG') return 'AB_NEG';
      if (clean === 'ONEG') return 'O_NEG';
      return 'O_POS';
    };
    const rawBloodGroup = donorDetails.bloodGroup || screening?.bloodGroup || existingReg?.blood_group_screening || (existingReg?.donor_details as any)?.bloodGroup || 'O_POS';
    const mappedEnumGroup = normalizeBloodGroup(rawBloodGroup);

    const isFemale = donorDetails.gender?.toLowerCase() === 'female';
    let mergedCounsellingAnswers: any[] = [];
    let auditLogEntries: any[] = existingReg?.counselling_audit_history || [];

    if (!existingReg || !existingReg.counselling_answers || (Array.isArray(existingReg.counselling_answers) && existingReg.counselling_answers.length === 0)) {
      mergedCounsellingAnswers = counsellingAnswers || getInitialCounsellingAnswers(isFemale);
    } else {
      const currentAnswers = existingReg.counselling_answers as any[];
      if (counsellingAnswers && Array.isArray(counsellingAnswers)) {
        const answersMap = new Map(counsellingAnswers.map((a: any) => [a.code, a]));
        mergedCounsellingAnswers = currentAnswers.map((curr) => {
          const updated = answersMap.get(curr.code);
          if (!updated) return curr;

          if (updated.answer !== curr.answer || updated.remarks !== curr.remarks || JSON.stringify(updated.selectedOptions) !== JSON.stringify(curr.selectedOptions)) {
            auditLogEntries.push({
              changedBy: caller.id,
              changedByName: caller.name || 'Staff',
              timestamp: new Date().toISOString(),
              questionCode: curr.code,
              previous: { answer: curr.answer, remarks: curr.remarks, selectedOptions: curr.selectedOptions },
              updated: { answer: updated.answer, remarks: updated.remarks, selectedOptions: updated.selectedOptions },
            });
            return {
              ...curr,
              ...updated,
              staffEdited: true,
              isDemoDefault: false,
              reviewStatus: 'REVIEWED_APPROVED',
            };
          }
          return curr;
        });
      } else {
        mergedCounsellingAnswers = currentAnswers;
      }
    }

    const regNumber = existingReg
      ? existingReg.registration_number
      : `REG-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    // Workflow state progression
    let workflowStatus = existingReg?.workflow_status || 'DRAFT';
    if (currentStep === 1 || callerStaffRole === 'CAMP_COORDINATOR') {
      workflowStatus = 'COUNSELLING_PENDING';
    } else if (currentStep === 2) {
      workflowStatus = 'SCREENING_PENDING';
    } else if (currentStep === 3) {
      if (screening.status === 'FIT') {
        workflowStatus = 'CLEARED_FOR_COLLECTION';
      } else if (screening.status === 'DEFERRED') {
        workflowStatus = 'DEFERRED';
      } else {
        workflowStatus = 'MEDICAL_REVIEW_PENDING';
      }
    } else if (currentStep === 4) {
      if (collection.status === 'COLLECTED' || collection.status === 'COMPLETED') {
        workflowStatus = 'COLLECTION_COMPLETED';
      } else if (collection.status === 'NOT_COLLECTED') {
        workflowStatus = 'NOT_COLLECTED';
      } else if (collection.status === 'INCOMPLETE_COLLECTION' || collection.status === 'INCOMPLETE') {
        workflowStatus = 'INCOMPLETE_COLLECTION';
      } else if (collection.status === 'ADVERSE_EVENT_STOPPED') {
        workflowStatus = 'ADVERSE_EVENT_STOPPED';
      } else {
        workflowStatus = 'COLLECTION_IN_PROGRESS';
      }
    } else if (currentStep === 5) {
      workflowStatus = 'SUMMARY_READY';
    }

    let mergedDonorDetails = existingReg?.donor_details || {};
    if (currentStep === 1 || !existingReg) {
      mergedDonorDetails = {
        ...mergedDonorDetails,
        ...donorDetails,
      };
    } else if (donorDetails && Object.keys(donorDetails).length > 0) {
      const cleanedDetails: Record<string, any> = {};
      for (const [k, v] of Object.entries(donorDetails)) {
        if (v !== undefined && v !== null && v !== '') {
          cleanedDetails[k] = v;
        }
      }
      mergedDonorDetails = {
        ...mergedDonorDetails,
        ...cleanedDetails,
      };
    }

    const newRegId = existingReg?.id || crypto.randomUUID();

    await prisma.$transaction(async (tx) => {
      if (!existingReg) {
        await tx.$executeRawUnsafe(`
          INSERT INTO donor_registrations (
            id, registration_number, donor_user_id, donor_profile_id, organisation_id,
            blood_centre_id, camp_id, registered_by_id, registration_source, donation_type,
            current_step, workflow_status, donor_details, counselling_status,
            counselling_reviewed_by_id, counselling_reviewed_at,
            counselling_answers, counselling_audit_history, counselling_remarks,
            can_issue_plasma, working_address, working_state, working_state_code,
            working_district, working_district_code, working_city, working_pin_code,
            working_same_as_permanent, discovery_consent, discovery_consent_recorded_at,
            discovery_consent_source, discovery_consent_version, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14,
            $15::text, CASE WHEN $15::text IS NOT NULL THEN NOW() ELSE NULL END,
            $16::jsonb, $17::jsonb, $18, $19, $20, $21, $22, $23, $24, $25, $26,
            $27, $28::boolean, CASE WHEN $28::boolean THEN NOW() ELSE NULL END, $29, $30, NOW(), NOW()
          )
        `,
          newRegId,
          regNumber,
          donorUserId,
          donorProfileId,
          authoritativeOrgId,
          authoritativeBloodCentreId || null,
          targetCampId || null,
          (caller as any)?.id || (caller as any)?.userId,
          registrationSource,
          donationType,
          currentStep,
          workflowStatus,
          JSON.stringify(mergedDonorDetails),
          counsellingStatus || 'PENDING',
          counsellingReviewedById || null,
          JSON.stringify(mergedCounsellingAnswers),
          JSON.stringify(auditLogEntries),
          counsellingRemarks || null,
          canIssuePlasma ?? true,
          finalWorkingAddress,
          finalWorkingState,
          finalWorkingStateCode,
          finalWorkingDistrict,
          finalWorkingDistrictCode,
          finalWorkingCity,
          finalWorkingPinCode,
          workingSameAsPermanent,
          discoveryConsent,
          discoveryConsentSource,
          discoveryConsentVersion
        );
      } else {
        await tx.$executeRawUnsafe(`
          UPDATE donor_registrations
          SET
            current_step = GREATEST(current_step, $1),
            workflow_status = $2,
            donor_details = $3::jsonb,
            counselling_status = COALESCE($4, counselling_status),
            counselling_reviewed_by_id = COALESCE($5, counselling_reviewed_by_id),
            counselling_reviewed_at = CASE WHEN $5::text IS NOT NULL THEN NOW() ELSE counselling_reviewed_at END,
            counselling_answers = $6::jsonb,
            counselling_audit_history = $7::jsonb,
            counselling_remarks = COALESCE($8, counselling_remarks),
            can_issue_plasma = COALESCE($9, can_issue_plasma),
            counselling_deferral_type = COALESCE($10, counselling_deferral_type),
            counselling_deferral_reason = COALESCE($11, counselling_deferral_reason),
            working_address = COALESCE($12, working_address),
            working_state = COALESCE($13, working_state),
            working_state_code = COALESCE($14, working_state_code),
            working_district = COALESCE($15, working_district),
            working_district_code = COALESCE($16, working_district_code),
            working_city = COALESCE($17, working_city),
            working_pin_code = COALESCE($18, working_pin_code),
            working_same_as_permanent = COALESCE($19, working_same_as_permanent),
            discovery_consent = COALESCE($20, discovery_consent),
            discovery_consent_recorded_at = CASE WHEN $20::boolean THEN COALESCE(discovery_consent_recorded_at, NOW()) ELSE discovery_consent_recorded_at END,
            updated_at = NOW()
          WHERE id = $21
        `,
          currentStep,
          workflowStatus,
          JSON.stringify(mergedDonorDetails),
          counsellingStatus || null,
          counsellingReviewedById || null,
          JSON.stringify(mergedCounsellingAnswers),
          JSON.stringify(auditLogEntries),
          counsellingRemarks || null,
          canIssuePlasma ?? null,
          counsellingDeferralType || null,
          counsellingDeferralReason || null,
          finalWorkingAddress,
          finalWorkingState,
          finalWorkingStateCode,
          finalWorkingDistrict,
          finalWorkingDistrictCode,
          finalWorkingCity,
          finalWorkingPinCode,
          workingSameAsPermanent,
          discoveryConsent,
          newRegId
        );
      }

      // Step 3 Screening & Medical Decision updates
      if (screening && Object.keys(screening).length > 0) {
        const screeningStat = screening.status || null;
        const isFitOrDeferred = screeningStat === 'FIT' || screeningStat === 'DEFERRED';

        await tx.$executeRawUnsafe(`
          UPDATE donor_registrations
          SET
            screening_status = COALESCE($1, screening_status),
            weight_kg = COALESCE($2, weight_kg),
            hemoglobin_g_dl = COALESCE($3, hemoglobin_g_dl),
            blood_group_screening = COALESCE($4, blood_group_screening),
            systolic_bp = COALESCE($5, systolic_bp),
            diastolic_bp = COALESCE($6, diastolic_bp),
            pulse_bpm = COALESCE($7, pulse_bpm),
            temperature_celsius = COALESCE($8, temperature_celsius),
            height_cm = COALESCE($9, height_cm),
            both_arms_inspected = COALESCE($10, both_arms_inspected),
            post_donation_tips_given = COALESCE($11, post_donation_tips_given),
            screened_by_id = COALESCE($12, screened_by_id),
            medical_officer_id = COALESCE($13, medical_officer_id),
            registration_process_type = COALESCE($14, registration_process_type),
            screening_remarks = COALESCE($15, screening_remarks),
            screening_deferral_category = COALESCE($16, screening_deferral_category),
            screening_deferral_reason = COALESCE($17, screening_deferral_reason),
            screening_performed_at = COALESCE($18, screening_performed_at, NOW()),
            medical_decision = COALESCE($19, medical_decision),
            medical_decision_by_id = COALESCE($20, medical_decision_by_id),
            medical_decision_at = CASE WHEN $19::text IS NOT NULL THEN NOW() ELSE medical_decision_at END,
            medical_decision_remarks = COALESCE($15, medical_decision_remarks),
            medical_deferral_category = COALESCE($16, medical_deferral_category),
            medical_deferral_reason = COALESCE($17, medical_deferral_reason),
            updated_at = NOW()
          WHERE id = $21
        `,
          screeningStat,
          screening.weightKg ? Number(screening.weightKg) : null,
          screening.hemoglobin ? Number(screening.hemoglobin) : null,
          screening.bloodGroup || null,
          screening.systolicBp ? Number(screening.systolicBp) : null,
          screening.diastolicBp ? Number(screening.diastolicBp) : null,
          screening.pulseBpm ? Number(screening.pulseBpm) : null,
          screening.temperatureCelsius ? Number(screening.temperatureCelsius) : null,
          screening.heightCm ? Number(screening.heightCm) : null,
          typeof screening.bothArmsInspected === 'boolean' ? screening.bothArmsInspected : null,
          typeof screening.postDonationTipsGiven === 'boolean' ? screening.postDonationTipsGiven : null,
          screening.screenedById || caller.id,
          screening.medicalOfficerId || null,
          screening.processType || 'DONOR',
          screening.remarks || null,
          screening.deferralCategory || null,
          screening.deferralReason || null,
          screening.performedAt ? new Date(screening.performedAt) : null,
          isFitOrDeferred ? screeningStat : null,
          screening.medicalOfficerId || (caller as any)?.id || null,
          newRegId
        );
      }

      // Step 4 Collection updates
      let unitNumber = collection.unitNumber || existingReg?.unit_number;
      let barcode = collection.barcode || existingReg?.barcode;

      if (collection && Object.keys(collection).length > 0) {
        const isCollectedStatus = collection.status === 'COLLECTED' || collection.status === 'COMPLETED';
        if (!unitNumber && isCollectedStatus) {
          unitNumber = `CU-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        }
        if (!barcode && isCollectedStatus) {
          barcode = `*RSB${new Date().getFullYear()}${crypto.randomBytes(4).toString('hex').toUpperCase()}*`;
        }

        await tx.$executeRawUnsafe(`
          UPDATE donor_registrations
          SET
            collection_status = COALESCE($1, collection_status),
            phlebotomy_date_time = COALESCE($2, phlebotomy_date_time, NOW()),
            bag_type = COALESCE($3, bag_type),
            manufacturer = COALESCE($4, manufacturer),
            lot_number = COALESCE($5, lot_number),
            segment_number = COALESCE($6, segment_number),
            unit_number = COALESCE(unit_number, $7),
            barcode = COALESCE(barcode, $8),
            is_less_quantity = COALESCE($9, is_less_quantity),
            volume_ml = COALESCE($10, volume_ml),
            phlebotomy_duration_minutes = COALESCE($11, phlebotomy_duration_minutes),
            phlebotomist_id = COALESCE($12, phlebotomist_id, $13),
            doctor_staff_id = COALESCE($14, doctor_staff_id),
            collection_observations = COALESCE($15, collection_observations),
            adverse_reaction = COALESCE($16, adverse_reaction),
            adverse_reaction_details = COALESCE($17, adverse_reaction_details),
            time_refreshments_provided = COALESCE($18, time_refreshments_provided),
            exit_time = COALESCE($19, exit_time),
            collection_remarks = COALESCE($20, collection_remarks),
            updated_at = NOW()
          WHERE id = $21
        `,
          collection.status || 'COLLECTED',
          collection.phlebotomyDateTime ? new Date(collection.phlebotomyDateTime) : null,
          collection.bagType || null,
          collection.manufacturer || null,
          collection.lotNumber || null,
          collection.segmentNumber || null,
          unitNumber,
          barcode,
          typeof collection.isLessQuantity === 'boolean' ? collection.isLessQuantity : null,
          collection.volumeMl ? Number(collection.volumeMl) : null,
          collection.durationMinutes ? Number(collection.durationMinutes) : null,
          collection.phlebotomistId || null,
          (caller as any)?.id || (caller as any)?.userId,
          collection.doctorStaffId || null,
          collection.observations || null,
          typeof collection.adverseReaction === 'boolean' ? collection.adverseReaction : null,
          collection.adverseReactionDetails || null,
          collection.timeRefreshmentsProvided || null,
          collection.exitTime || null,
          collection.remarks || null,
          newRegId
        );
      }

      // Step 5 Consent updates
      if (consent && Object.keys(consent).length > 0) {
        await tx.$executeRawUnsafe(`
          UPDATE donor_registrations
          SET
            consent_given = COALESCE($1, consent_given),
            consent_recorded_at = COALESCE($2, consent_recorded_at, NOW()),
            consent_version = COALESCE($3, consent_version),
            updated_at = NOW()
          WHERE id = $4
        `,
          typeof consent.consentGiven === 'boolean' ? consent.consentGiven : true,
          consent.recordedAt ? new Date(consent.recordedAt) : null,
          consent.version || 'v1.0',
          newRegId
        );
      }

      // Authoritative camp attendance and operations synchronisation
      if (targetCampId) {
        const attendance = await tx.campAttendance.upsert({
          where: {
            campId_userId: {
              campId: targetCampId,
              userId: donorUserId,
            },
          },
          update: {
            donorName: mergedDonorDetails.fullName,
            donorPhone: mergedDonorDetails.primaryMobile ? mergedDonorDetails.primaryMobile.replace(/\D/g, '').slice(-10) : '0000000000',
            bloodGroup: mappedEnumGroup as any,
            donorProfileId: donorProfileId || null,
            status: 'CHECKED_IN',
            checkedInAt: new Date(),
          },
          create: {
            campId: targetCampId,
            userId: donorUserId,
            donorProfileId: donorProfileId || null,
            donorName: mergedDonorDetails.fullName,
            donorPhone: mergedDonorDetails.primaryMobile ? mergedDonorDetails.primaryMobile.replace(/\D/g, '').slice(-10) : '0000000000',
            bloodGroup: mappedEnumGroup as any,
            status: 'CHECKED_IN',
            registeredAt: new Date(),
            checkedInAt: new Date(),
          },
        });

        // Sync Clinical Screening
        let clinicalScreeningRecord: any = null;
        if (screening && Object.keys(screening).length > 0 && screening.status) {
          const isFit = screening.status === 'FIT';
          const isDef = screening.status === 'DEFERRED';
          clinicalScreeningRecord = await tx.clinicalScreening.upsert({
            where: { attendanceId: attendance.id },
            update: {
              screenedBy: screening.screenedById || caller.id,
              status: isFit ? 'CLEARED' : (isDef ? 'DEFERRED' : 'PENDING'),
              consentGiven: true,
              eligibilityDecision: isFit ? 'CLEARED' : (isDef ? 'TEMPORARY_DEFERRAL' : 'PENDING'),
              deferralCategory: screening.deferralCategory || null,
              clinicalNotes: screening.remarks || null,
            },
            create: {
              campId: targetCampId,
              attendanceId: attendance.id,
              donorUserId: donorUserId,
              screenedBy: screening.screenedById || caller.id,
              status: isFit ? 'CLEARED' : (isDef ? 'DEFERRED' : 'PENDING'),
              consentGiven: true,
              eligibilityDecision: isFit ? 'CLEARED' : (isDef ? 'TEMPORARY_DEFERRAL' : 'PENDING'),
              deferralCategory: screening.deferralCategory || null,
              clinicalNotes: screening.remarks || null,
            },
          });
        }

        // Sync Donation Event and Collection Unit
        if (collection && Object.keys(collection).length > 0) {
          const isCollected = collection.status === 'COLLECTED' || collection.status === 'COMPLETED';
          const isAdverse = collection.status === 'ADVERSE_EVENT_STOPPED' || Boolean(collection.adverseReaction);
          const isIncomplete = collection.status === 'INCOMPLETE_COLLECTION' || collection.status === 'INCOMPLETE';
          const outcome = isCollected ? 'COMPLETED' :
                          isAdverse ? 'ADVERSE_EVENT_STOPPED' :
                          isIncomplete ? 'DEFERRED' : 'NOT_PERFORMED';
          const volMl = collection.volumeMl ? Number(collection.volumeMl) : (isCollected ? 450 : 0);

          const validDonationTypes = ['WHOLE_BLOOD', 'APHERESIS_PLATELETS', 'APHERESIS_PLASMA'];
          const resolvedDonationType = validDonationTypes.includes(donationType) ? donationType : 'WHOLE_BLOOD';

          const donationEvent = await tx.donationEvent.upsert({
            where: { attendanceId: attendance.id },
            update: {
              outcome,
              bloodGroup: mappedEnumGroup as any,
              volumeMl: volMl,
              adverseReaction: isAdverse,
              adverseReactionNotes: collection.adverseReactionDetails || null,
              recordedBy: (caller as any)?.id || (caller as any)?.userId || 'STAFF',
              performedAt: collection.phlebotomyDateTime ? new Date(collection.phlebotomyDateTime) : new Date(),
              notes: collection.remarks || null,
            },
            create: {
              campId: targetCampId,
              attendanceId: attendance.id,
              screeningId: clinicalScreeningRecord?.id || null,
              donorUserId: donorUserId,
              bloodGroup: mappedEnumGroup as any,
              donationType: resolvedDonationType as any,
              outcome,
              volumeMl: volMl,
              adverseReaction: isAdverse,
              adverseReactionNotes: collection.adverseReactionDetails || null,
              recordedBy: (caller as any)?.id || (caller as any)?.userId || 'STAFF',
              performedAt: collection.phlebotomyDateTime ? new Date(collection.phlebotomyDateTime) : new Date(),
              notes: collection.remarks || null,
            },
          });

          if (isCollected && unitNumber) {
            await tx.collectionUnit.upsert({
              where: { unitNumber },
              update: {
                bagIdentifier: barcode || null,
                bloodGroup: mappedEnumGroup as any,
                volumeMl: volMl || 450,
                status: 'COLLECTED',
              },
              create: {
                campId: targetCampId,
                organisationId: authoritativeOrgId,
                donationEventId: donationEvent.id,
                unitNumber,
                bagIdentifier: barcode || null,
                bloodGroup: mappedEnumGroup as any,
                volumeMl: volMl || 450,
                status: 'COLLECTED',
                collectedAt: new Date(),
                collectedBy: (caller as any)?.id || (caller as any)?.userId || 'STAFF',
              },
            });

            await tx.donorProfile.updateMany({
              where: { userId: donorUserId },
              data: {
                verifiedLastDonationDate: new Date(),
                lastDonationDate: new Date(),
              },
            });
          }
        }

        // Transactional outbox events
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'camp.donor_registration_updated',
          entityType: 'DonorRegistration',
          entityId: newRegId,
          organisationId: authoritativeOrgId,
          payload: {
            registrationId: newRegId,
            campId: targetCampId,
            organisationId: authoritativeOrgId,
            workflowStatus,
            currentStep,
            donorName: mergedDonorDetails.fullName,
            medicalDecision: screening.status || existingReg?.medical_decision || 'PENDING',
            collectionStatus: collection.status || existingReg?.collection_status || 'NOT_COLLECTED',
            unitNumber: collection.status ? unitNumber : undefined,
            barcode: collection.status ? barcode : undefined,
            volumeMl: collection.volumeMl ? Number(collection.volumeMl) : undefined,
            timestamp: new Date().toISOString(),
          },
        });

        if (currentStep === 1) {
          await RealtimeService.publishOutboxEvent(tx, {
            eventType: 'camp.attendance_registered',
            entityType: 'CampAttendance',
            entityId: attendance.id,
            organisationId: authoritativeOrgId,
            payload: {
              campId: targetCampId,
              attendanceId: attendance.id,
              donorName: mergedDonorDetails.fullName,
              status: 'CHECKED_IN',
              timestamp: new Date().toISOString(),
            },
          });
        }

        if (screening && Object.keys(screening).length > 0 && screening.status) {
          await RealtimeService.publishOutboxEvent(tx, {
            eventType: 'camp.screening_recorded',
            entityType: 'ClinicalScreening',
            entityId: attendance.id,
            organisationId: authoritativeOrgId,
            payload: {
              campId: targetCampId,
              attendanceId: attendance.id,
              status: screening.status,
              donorName: mergedDonorDetails.fullName,
              timestamp: new Date().toISOString(),
            },
          });
        }

        if (collection && Object.keys(collection).length > 0) {
          const isCollected = collection.status === 'COLLECTED' || collection.status === 'COMPLETED';
          await RealtimeService.publishOutboxEvent(tx, {
            eventType: 'camp.donation_completed',
            entityType: 'DonationEvent',
            entityId: newRegId,
            organisationId: authoritativeOrgId,
            payload: {
              campId: targetCampId,
              organisationId: authoritativeOrgId,
              registrationId: newRegId,
              donorUserId,
              outcome: isCollected ? 'COMPLETED' : (collection.status || 'COLLECTED'),
              volumeMl: collection.volumeMl ? Number(collection.volumeMl) : (isCollected ? 450 : 0),
              unitNumber,
              barcode,
              timestamp: new Date().toISOString(),
            },
          });

          if (isCollected && unitNumber) {
            await RealtimeService.publishOutboxEvent(tx, {
              eventType: 'camp.collection_unit_confirmed',
              entityType: 'CollectionUnit',
              entityId: unitNumber,
              organisationId: authoritativeOrgId,
              payload: {
                campId: targetCampId,
                organisationId: authoritativeOrgId,
                unitNumber,
                barcode,
                volumeMl: collection.volumeMl ? Number(collection.volumeMl) : 450,
                bloodGroup: mappedEnumGroup,
                status: 'COLLECTED',
                timestamp: new Date().toISOString(),
              },
            });

            await RealtimeService.publishOutboxEvent(tx, {
              eventType: 'donor.eligibility_updated',
              entityType: 'DonorProfile',
              entityId: donorUserId,
              organisationId: authoritativeOrgId,
              recipientUserId: donorUserId,
              payload: {
                userId: donorUserId,
                campId: targetCampId,
                isEligible: false,
                status: 'TEMPORARILY_INELIGIBLE',
                lastDonationDate: new Date().toISOString(),
              },
            });
          }
        }
      }
    }, {
      maxWait: 10000,
      timeout: 30000,
    });

    // Flush transactional outbox events now that the database transaction has safely committed
    RealtimeService.processPendingOutbox().catch((err) => {
      console.error('[DonorRegistrationService] Outbox flush error:', err);
    });

    let campMetrics = null;
    if (targetCampId) {
      try {
        campMetrics = await CampOperationsService.getCampAnalytics(targetCampId, caller as any);
      } catch (mErr) {
        console.warn('[DonorRegistrationService] Failed to retrieve fresh camp metrics:', mErr);
      }
    }

    const savedRecord = await this.getRegistrationById(newRegId, caller);
    return {
      ...savedRecord,
      campMetrics,
    };
  }

  /**
   * Retrieve registration by ID with access control
   */
  public static async getRegistrationById(id: string, caller?: CallerUser) {
    const rows: any[] = await prisma.$queryRaw`
      SELECT dr.*,
             org.name as organisation_name, org."orgCode" as organisation_code, org."licenseNumber" as organisation_license,
             c.title as camp_title, c."campCode" as camp_code, c.venue as camp_venue,
             bc."hospitalName" as blood_centre_name, bc.address as blood_centre_address, bc."mobileNo" as blood_centre_phone,
             u."phoneNumber" as donor_phone,
             counsel_staff.name as counselled_by_name,
             screen_staff.name as screened_by_name,
             mo_staff.name as medical_officer_name,
             phleb_staff.name as phlebotomist_name,
             doc_staff.name as doctor_name
      FROM donor_registrations dr
      LEFT JOIN organisations org ON dr.organisation_id = org.id
      LEFT JOIN camps c ON dr.camp_id = c.id
      LEFT JOIN blood_centres bc ON dr.blood_centre_id = bc."hospitalCode"
      LEFT JOIN users u ON dr.donor_user_id = u.id
      LEFT JOIN users counsel_staff ON dr.counselling_reviewed_by_id = counsel_staff.id
      LEFT JOIN users screen_staff ON dr.screened_by_id = screen_staff.id
      LEFT JOIN users mo_staff ON dr.medical_officer_id = mo_staff.id
      LEFT JOIN users phleb_staff ON dr.phlebotomist_id = phleb_staff.id
      LEFT JOIN users doc_staff ON dr.doctor_staff_id = doc_staff.id
      WHERE dr.id = ${id} OR dr.registration_number = ${id}
      LIMIT 1;
    `;

    if (rows.length === 0) {
      throw new Error('Registration record not found.');
    }

    const reg = rows[0];

    // Access check: caller must be authorised staff OR the donor themselves
    if (caller) {
      const callerUserId = (caller as any).id || (caller as any).userId;
      const isDonorOwner = callerUserId && callerUserId === reg.donor_user_id;
      if (!isDonorOwner) {
        await this.verifyStaffAccess(caller, reg.organisation_id, reg.camp_id);
      }
    }

    return {
      id: reg.id,
      registrationNumber: reg.registration_number,
      donorUserId: reg.donor_user_id,
      donorProfileId: reg.donor_profile_id,
      organisationId: reg.organisation_id,
      organisationName: reg.organisation_name,
      organisationCode: reg.organisation_code,
      organisationLicense: reg.organisation_license,
      campId: reg.camp_id,
      campTitle: reg.camp_title,
      campCode: reg.camp_code,
      campVenue: reg.camp_venue,
      bloodCentreId: reg.blood_centre_id,
      bloodCentreName: reg.blood_centre_name,
      bloodCentreAddress: reg.blood_centre_address,
      bloodCentrePhone: reg.blood_centre_phone,
      registeredById: reg.registered_by_id,
      registrationSource: reg.registration_source,
      donationType: reg.donation_type,
      currentStep: reg.current_step,
      workflowStatus: reg.workflow_status,
      isCompleted: reg.is_completed,
      completedAt: reg.completed_at,

      donorDetails: {
        ...(reg.donor_details || {}),
        primaryMobile: reg.donor_details?.primaryMobile || (reg.donor_phone ? String(reg.donor_phone).replace(/^\+91/, '').replace(/\D/g, '') : '') || undefined,
      },

      workingAddress: reg.working_address,
      workingState: reg.working_state,
      workingStateCode: reg.working_state_code,
      workingDistrict: reg.working_district,
      workingDistrictCode: reg.working_district_code,
      workingCity: reg.working_city,
      workingPinCode: reg.working_pin_code,
      workingSameAsPermanent: reg.working_same_as_permanent,

      discoveryConsent: {
        consentGiven: reg.discovery_consent,
        recordedAt: reg.discovery_consent_recorded_at,
        source: reg.discovery_consent_source,
        version: reg.discovery_consent_version,
      },

      counselling: {
        status: reg.counselling_status,
        remarks: reg.counselling_remarks,
        canIssuePlasma: reg.can_issue_plasma,
        deferralType: reg.counselling_deferral_type,
        deferralReason: reg.counselling_deferral_reason,
        reviewedById: reg.counselling_reviewed_by_id,
        reviewedByName: reg.counselled_by_name || null,
        reviewedAt: reg.counselling_reviewed_at,
        answers: reg.counselling_answers || [],
        auditHistory: reg.counselling_audit_history || [],
      },

      screening: {
        status: reg.screening_status,
        weightKg: reg.weight_kg ? Number(reg.weight_kg) : null,
        hemoglobin: reg.hemoglobin_g_dl ? Number(reg.hemoglobin_g_dl) : null,
        bloodGroup: reg.blood_group_screening,
        systolicBp: reg.systolic_bp,
        diastolicBp: reg.diastolic_bp,
        pulseBpm: reg.pulse_bpm,
        temperatureCelsius: reg.temperature_celsius ? Number(reg.temperature_celsius) : null,
        heightCm: reg.height_cm ? Number(reg.height_cm) : null,
        bothArmsInspected: reg.both_arms_inspected,
        postDonationTipsGiven: reg.post_donation_tips_given,
        screenedById: reg.screened_by_id,
        screenedByName: reg.screened_by_name || null,
        medicalOfficerId: reg.medical_officer_id,
        medicalOfficerName: reg.medical_officer_name || null,
        processType: reg.registration_process_type,
        remarks: reg.screening_remarks,
        deferralCategory: reg.screening_deferral_category,
        deferralReason: reg.screening_deferral_reason,
        performedAt: reg.screening_performed_at,
      },

      medicalDecision: {
        decision: reg.medical_decision,
        decidedById: reg.medical_decision_by_id,
        decidedByName: reg.medical_officer_name || null,
        decidedAt: reg.medical_decision_at,
        remarks: reg.medical_decision_remarks,
        deferralCategory: reg.medical_deferral_category,
        deferralReason: reg.medical_deferral_reason,
      },

      collection: {
        status: reg.collection_status,
        phlebotomyDateTime: reg.phlebotomy_date_time,
        bagType: reg.bag_type,
        manufacturer: reg.manufacturer,
        lotNumber: reg.lot_number,
        segmentNumber: reg.segment_number,
        unitNumber: reg.unit_number,
        barcode: reg.barcode,
        isLessQuantity: reg.is_less_quantity,
        volumeMl: reg.volume_ml,
        durationMinutes: reg.phlebotomy_duration_minutes,
        phlebotomistId: reg.phlebotomist_id,
        phlebotomistName: reg.phlebotomist_name || null,
        doctorStaffId: reg.doctor_staff_id,
        doctorName: reg.doctor_name || null,
        observations: reg.collection_observations,
        adverseReaction: reg.adverse_reaction,
        adverseReactionDetails: reg.adverse_reaction_details,
        timeRefreshmentsProvided: reg.time_refreshments_provided,
        exitTime: reg.exit_time,
        remarks: reg.collection_remarks,
      },

      consent: {
        consentGiven: reg.consent_given,
        recordedAt: reg.consent_recorded_at,
        version: reg.consent_version,
      },

      createdAt: reg.created_at,
      updatedAt: reg.updated_at,
    };
  }

  /**
   * Finalize and complete registration
   */
  /**
   * Finalize and complete registration
   * Atomically synchronizes CampAttendance, ClinicalScreening, DonationEvent, and CollectionUnit.
   * Guarantees idempotency, role boundaries, prerequisite validation, and transactional outbox event dispatch.
   */
  public static async completeRegistration(id: string, caller: CallerUser) {
    const callerUserId = (caller as any)?.id || (caller as any)?.userId;
    const reg = await this.getRegistrationById(id, caller);

    // 1. Idempotency Check
    if (reg.isCompleted) {
      // If already completed, return existing completed record without duplicating units or events
      return reg;
    }

    // 2. Role Boundary & Access Verification
    const callerStaffRole = await this.verifyStaffAccessAndGetRole(caller, reg.organisationId, reg.campId);

    // 3. Workflow Prerequisites Validation
    // A. Clinical medical screening decision must be explicitly recorded
    if (!reg.screening.status || reg.screening.status === 'PENDING') {
      throw new Error('Cannot complete registration: Screening medical decision must be recorded as FIT or DEFERRED.');
    }

    const isFit = reg.screening.status === 'FIT';
    const isDeferred = reg.screening.status === 'DEFERRED' || reg.counselling.status === 'DEFERRED';

    // Role boundary: Clinical staff cannot complete phlebotomy/collection workflows
    if (isFit && callerStaffRole === 'CLINICAL_STAFF') {
      throw new Error('Permission denied: Clinical staff is not authorized to complete collection or phlebotomy workflows.');
    }

    // Role boundary: Collection staff cannot alter clinical decisions or bypass clearance
    if (!isFit && callerStaffRole === 'COLLECTION_STAFF') {
      throw new Error('Permission denied: Collection staff cannot alter or finalize medical deferral decisions.');
    }

    // B. If donor is FIT, collection must have been recorded
    const isCollected = reg.collection.status === 'COLLECTED' || reg.collection.status === 'COMPLETED';
    if (isFit && !isCollected) {
      throw new Error('Cannot complete registration: Blood collection outcome must be recorded for clinically cleared donor.');
    }

    const finalStatus = isFit ? 'COMPLETED' : 'DEFERRED';

    // Ensure barcode and unit number exist if collected
    let unitNumber = reg.collection.unitNumber;
    let barcode = reg.collection.barcode;

    if (isFit && (!unitNumber || !barcode)) {
      unitNumber = unitNumber || `CU-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      barcode = barcode || `*RSB${new Date().getFullYear()}${crypto.randomBytes(4).toString('hex').toUpperCase()}*`;
    }

    const validEnumGroups = ['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG'];
    const bgCandidate = reg.screening?.bloodGroup || reg.donorDetails?.bloodGroup;
    const mappedEnumGroup = validEnumGroups.includes(bgCandidate) ? bgCandidate : 'O_POS';
    const volMl = reg.collection.volumeMl ? Number(reg.collection.volumeMl) : 450;

    // Resolve phlebotomist/collector user ID
    let collectorUserId = callerUserId;
    if (reg.collection.phlebotomistId) {
      const phlebUser = await prisma.user.findUnique({
        where: { id: reg.collection.phlebotomistId },
        select: { id: true },
      });
      if (phlebUser) {
        collectorUserId = phlebUser.id;
      }
    }

    // 4. Atomic Database Transaction
    await prisma.$transaction(async (tx) => {
      // A. Update donor_registrations record
      await tx.$executeRawUnsafe(`
        UPDATE donor_registrations
        SET
          workflow_status = $1,
          is_completed = true,
          completed_at = NOW(),
          unit_number = COALESCE(unit_number, $2),
          barcode = COALESCE(barcode, $3),
          updated_at = NOW()
        WHERE id = $4
      `,
        finalStatus,
        unitNumber || null,
        barcode || null,
        reg.id
      );

      // B. Authoritative Camp Attendance, Clinical Screening, Donation Event & Collection Unit
      if (reg.campId && reg.donorUserId) {
        const attendance = await tx.campAttendance.upsert({
          where: {
            campId_userId: {
              campId: reg.campId,
              userId: reg.donorUserId,
            },
          },
          update: {
            status: 'CHECKED_IN',
            checkedInAt: new Date(),
            donorProfileId: reg.donorProfileId || null,
          },
          create: {
            campId: reg.campId,
            userId: reg.donorUserId,
            donorProfileId: reg.donorProfileId || null,
            donorName: reg.donorDetails?.fullName || 'Donor',
            donorPhone: reg.donorDetails?.primaryMobile ? String(reg.donorDetails.primaryMobile).replace(/\D/g, '').slice(-10) : '0000000000',
            bloodGroup: mappedEnumGroup as any,
            status: 'CHECKED_IN',
            registeredAt: new Date(),
            checkedInAt: new Date(),
          },
        });

        // Sync Clinical Screening
        const screeningRecord = await tx.clinicalScreening.upsert({
          where: { attendanceId: attendance.id },
          update: {
            status: isFit ? 'CLEARED' : 'DEFERRED',
            eligibilityDecision: isFit ? 'CLEARED' : 'TEMPORARY_DEFERRAL',
          },
          create: {
            campId: reg.campId,
            attendanceId: attendance.id,
            donorUserId: reg.donorUserId,
            screenedBy: reg.screening.screenedById || callerUserId,
            status: isFit ? 'CLEARED' : 'DEFERRED',
            consentGiven: true,
            eligibilityDecision: isFit ? 'CLEARED' : 'TEMPORARY_DEFERRAL',
            deferralCategory: reg.screening.deferralCategory || null,
            clinicalNotes: reg.screening.remarks || null,
          },
        });

        // If completed collection: sync DonationEvent and CollectionUnit
        if (isFit && isCollected && unitNumber) {
          const donationEvent = await tx.donationEvent.upsert({
            where: { attendanceId: attendance.id },
            update: {
              outcome: 'COMPLETED',
              volumeMl: volMl,
              bloodGroup: mappedEnumGroup as any,
              performedAt: reg.collection.phlebotomyDateTime ? new Date(reg.collection.phlebotomyDateTime) : new Date(),
              recordedBy: collectorUserId,
              notes: reg.collection.remarks || null,
            },
            create: {
              campId: reg.campId,
              attendanceId: attendance.id,
              screeningId: screeningRecord.id,
              donorUserId: reg.donorUserId,
              bloodGroup: mappedEnumGroup as any,
              donationType: 'WHOLE_BLOOD',
              outcome: 'COMPLETED',
              volumeMl: volMl,
              recordedBy: collectorUserId,
              performedAt: reg.collection.phlebotomyDateTime ? new Date(reg.collection.phlebotomyDateTime) : new Date(),
              notes: reg.collection.remarks || null,
            },
          });

          // Ensure unit remains in COLLECTED status (quarantined at camp awaiting handover dispatch; NOT hospital released)
          await tx.collectionUnit.upsert({
            where: { unitNumber },
            update: {
              bagIdentifier: barcode || null,
              bloodGroup: mappedEnumGroup as any,
              volumeMl: volMl,
              status: 'COLLECTED',
            },
            create: {
              campId: reg.campId,
              organisationId: reg.organisationId,
              donationEventId: donationEvent.id,
              unitNumber,
              bagIdentifier: barcode || null,
              bloodGroup: mappedEnumGroup as any,
              volumeMl: volMl,
              status: 'COLLECTED',
              collectedAt: new Date(),
              collectedBy: collectorUserId,
            },
          });
        }
      }

      // C. Update Donor Profile last donation date if completed and collected
      if (isFit && isCollected && reg.donorProfileId) {
        await tx.donorProfile.update({
          where: { id: reg.donorProfileId },
          data: {
            verifiedLastDonationDate: new Date(),
            lastDonationDate: new Date(),
          },
        });
      }

      // D. Transactional Outbox Events (guaranteed atomic dispatch only upon commit)
      if (reg.campId) {
        await RealtimeService.publishOutboxEvent(tx, {
          eventType: 'camp.donor_registration_updated',
          entityType: 'DonorRegistration',
          entityId: id,
          organisationId: reg.organisationId,
          payload: {
            registrationId: id,
            campId: reg.campId,
            organisationId: reg.organisationId,
            workflowStatus: finalStatus,
            isCompleted: true,
            unitNumber,
            barcode,
            timestamp: new Date().toISOString(),
          },
        });

        if (isFit && isCollected && unitNumber) {
          await RealtimeService.publishOutboxEvent(tx, {
            eventType: 'camp.donation_completed',
            entityType: 'DonationEvent',
            entityId: id,
            organisationId: reg.organisationId,
            payload: {
              campId: reg.campId,
              organisationId: reg.organisationId,
              registrationId: id,
              donorUserId: reg.donorUserId,
              outcome: 'COMPLETED',
              volumeMl: volMl,
              unitNumber,
              barcode,
              timestamp: new Date().toISOString(),
            },
          });

          await RealtimeService.publishOutboxEvent(tx, {
            eventType: 'camp.collection_unit_confirmed',
            entityType: 'CollectionUnit',
            entityId: unitNumber,
            organisationId: reg.organisationId,
            payload: {
              campId: reg.campId,
              organisationId: reg.organisationId,
              unitNumber,
              bagIdentifier: barcode,
              bloodGroup: mappedEnumGroup,
              volumeMl: volMl,
              status: 'COLLECTED',
              timestamp: new Date().toISOString(),
            },
          });
        }
      }
    });

    return this.getRegistrationById(id, caller);
  }

  /**
   * Camp & Staff Queues: Query registrations filtered by camp, stage, and role
   */
  public static async getQueue(
    caller: CallerUser,
    params: { campId?: string; organisationId?: string; stage?: string; page?: number; limit?: number }
  ) {
    const { campId, organisationId, stage = 'all', page = 1, limit = 50 } = params;

    if (!campId && !organisationId) {
      throw new Error('Camp ID or Organisation ID is required to fetch registration queue.');
    }

    await this.verifyStaffAccess(caller, organisationId, campId);

    const conditions: string[] = [];
    if (campId) {
      conditions.push(`dr.camp_id = '${campId}'`);
    }
    if (organisationId) {
      conditions.push(`dr.organisation_id = '${organisationId}'`);
    }

    if (stage === 'clinical') {
      conditions.push(`dr.workflow_status IN ('COUNSELLING_PENDING', 'COUNSELLING_IN_PROGRESS', 'SCREENING_PENDING', 'MEDICAL_REVIEW_PENDING')`);
    } else if (stage === 'collection') {
      conditions.push(`dr.workflow_status IN ('CLEARED_FOR_COLLECTION', 'COLLECTION_IN_PROGRESS', 'COLLECTION_COMPLETED')`);
    } else if (stage === 'deferred') {
      conditions.push(`dr.workflow_status = 'DEFERRED'`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = Math.max(0, (page - 1) * limit);

    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT dr.id, dr.registration_number, dr.workflow_status, dr.current_step,
             dr.is_completed, dr.created_at, dr.updated_at,
             dr.donor_details->>'fullName' as full_name,
             dr.donor_details->>'gender' as gender,
             dr.donor_details->>'bloodGroup' as blood_group,
             dr.donor_details->>'primaryMobile' as phone,
             dr.donor_details->>'calculatedAge' as age,
             dr.counselling_status, dr.screening_status, dr.medical_decision,
             dr.collection_status, dr.barcode, dr.unit_number,
             dr.working_city, dr.working_same_as_permanent, dr.discovery_consent,
             dr.camp_id, dr.organisation_id,
             c.title as camp_title,
             org.name as org_name, org."orgCode" as org_code,
             screen_staff.name as screened_by_name,
             mo_staff.name as medical_officer_name,
             phleb_staff.name as phlebotomist_name
      FROM donor_registrations dr
      LEFT JOIN camps c ON dr.camp_id = c.id
      LEFT JOIN organisations org ON dr.organisation_id = org.id
      LEFT JOIN users screen_staff ON dr.screened_by_id = screen_staff.id
      LEFT JOIN users mo_staff ON dr.medical_officer_id = mo_staff.id
      LEFT JOIN users phleb_staff ON dr.phlebotomist_id = phleb_staff.id
      ${whereClause}
      ORDER BY dr.updated_at DESC
      LIMIT ${limit} OFFSET ${offset};
    `);

    const countResult: any[] = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int as total
      FROM donor_registrations dr
      ${whereClause};
    `);

    const total = countResult[0]?.total || 0;

    const items = rows.map((r) => ({
      id: r.id,
      registrationNumber: r.registration_number,
      workflowStatus: r.workflow_status,
      currentStep: r.current_step,
      isCompleted: r.is_completed,
      fullName: r.full_name,
      donorName: r.full_name,
      gender: r.gender,
      bloodGroup: r.blood_group,
      phone: r.phone,
      primaryMobile: r.phone,
      campTitle: r.camp_title,
      organisationName: r.org_name,
      organisationCode: r.org_code,
      age: r.age,
      counsellingStatus: r.counselling_status,
      screeningStatus: r.screening_status,
      medicalDecision: r.medical_decision,
      collectionStatus: r.collection_status,
      barcode: r.barcode,
      unitNumber: r.unit_number,
      workingCity: r.working_city,
      discoveryConsent: r.discovery_consent,
      screenedByName: r.screened_by_name,
      medicalOfficerName: r.medical_officer_name,
      phlebotomistName: r.phlebotomist_name,
      createdAt: r.created_at,
      registrationTime: r.created_at,
      updatedAt: r.updated_at,
    }));

    return {
      items,
      registrations: items,
      total,
      page,
      limit,
    };
  }

  /**
   * List all registrations for a donor (for donor portal)
   */
  public static async listDonorRegistrations(donorUserId: string) {
    const rows: any[] = await prisma.$queryRaw`
      SELECT dr.id, dr.registration_number, dr.workflow_status, dr.is_completed, dr.completed_at,
             dr.created_at, dr.donation_type, dr.registration_source,
             org.name as organisation_name, c.title as camp_title,
             dr.screening_status, dr.collection_status, dr.barcode, dr.unit_number
      FROM donor_registrations dr
      LEFT JOIN organisations org ON dr.organisation_id = org.id
      LEFT JOIN camps c ON dr.camp_id = c.id
      WHERE dr.donor_user_id = ${donorUserId}
      ORDER BY dr.created_at DESC;
    `;

    return rows.map((r) => ({
      id: r.id,
      registrationNumber: r.registration_number,
      workflowStatus: r.workflow_status,
      isCompleted: r.is_completed,
      completedAt: r.completed_at,
      createdAt: r.created_at,
      donationType: r.donation_type,
      registrationSource: r.registration_source,
      organisationName: r.organisation_name,
      campTitle: r.camp_title,
      screeningStatus: r.screening_status,
      collectionStatus: r.collection_status,
      barcode: r.barcode,
      unitNumber: r.unit_number,
    }));
  }
}
