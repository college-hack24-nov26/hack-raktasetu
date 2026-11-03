/**
 * RaktaSetu Shared Types and Constants
 */

export interface HealthCheckResponse {
  status: 'ok' | 'error';
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
  database: {
    connected: boolean;
    provider: string;
  };
}

export type BloodGroup =
  | 'A+'
  | 'A-'
  | 'B+'
  | 'B-'
  | 'AB+'
  | 'AB-'
  | 'O+'
  | 'O-';

export type RequestStatus =
  | 'OPEN'
  | 'CLOSED'
  | 'CANCELLED'
  | 'EXPIRED';

export type RecipientResponseStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface DistrictConfig {
  district: string;
  stateCode: number;
  districtCode: number;
  status: 'verified' | 'candidate';
}

// ----------------------------------------------------
// Phase 1 Architecture Foundation Types
// ----------------------------------------------------

export type OrgType = 'BLOOD_BANK' | 'RECEIVING_FACILITY' | 'STORAGE_CENTRE';

export type OrgStatus =
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'SUSPENDED'
  | 'DEACTIVATED';

export type OrgRole =
  | 'ORG_ADMIN'
  | 'INVENTORY_STAFF'
  | 'CLINICAL_STAFF'
  | 'COLLECTION_STAFF'
  | 'AUDITOR';

export type ApplicationStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'RETURNED_FOR_CORRECTION';

export type CampStatus =
  | 'PROPOSED'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface OrganisationApplicationInput {
  hospitalName: string;
  licenseNumber: string;
  stateCode?: number;
  districtCode: number;
  districtName?: string;
  contactPerson: string;
  email: string;
  phone: string;
  componentTypes?: string[];
}

export interface OrganisationApplicationReviewInput {
  status: 'APPROVED' | 'REJECTED' | 'RETURNED_FOR_CORRECTION';
  reviewNotes?: string;
  reviewedBy: string;
  orgCode?: string; // If approving, optional custom org code or auto-generated
}

export interface CampRegistrationInput {
  campCode?: string;
  title: string;
  organizerName: string;
  targetDate: string;
  timeSlot?: string;
  venue: string;
  district?: string;
  districtCode: number;
  stateCode?: number;
  expectedDonors?: number;
  coordinatorContact?: string;
  hospitalCode?: string;
  organisationId?: string;
}

// ----------------------------------------------------
// Phase 2, 3 & 4: Role-Based Access Control (RBAC) Permissions
// ----------------------------------------------------

export type Permission =
  | 'org:view'
  | 'staff:list'
  | 'staff:invite'
  | 'staff:update_role'
  | 'staff:remove'
  | 'camp:manage'
  | 'camp:attendance'
  | 'clinical:screen'
  | 'donation:record'
  | 'collection:manage'
  | 'component:derive'
  | 'unit:view'
  | 'unit:transition'
  | 'handover:create'
  | 'handover:dispatch'
  | 'handover:receive'
  | 'handover:reconcile'
  | 'handover:view'
  | 'lab:record'
  | 'lab:verify'
  | 'clinical:release'
  | 'storage:manage'
  | 'inventory:view'
  | 'disposition:record'
  | 'audit:read'
  | 'operational:read'
  | 'operational:write';

export const ROLE_PERMISSIONS: Record<OrgRole, Permission[]> = {
  ORG_ADMIN: [
    'org:view',
    'staff:list',
    'staff:invite',
    'staff:update_role',
    'staff:remove',
    'camp:manage',
    'camp:attendance',
    'clinical:screen',
    'donation:record',
    'collection:manage',
    'component:derive',
    'unit:view',
    'unit:transition',
    'handover:create',
    'handover:dispatch',
    'handover:receive',
    'handover:reconcile',
    'handover:view',
    'lab:record',
    'storage:manage',
    'inventory:view',
    'disposition:record',
    'audit:read',
    'operational:read',
    'operational:write',
  ],
  INVENTORY_STAFF: [
    'org:view',
    'staff:list',
    'camp:attendance',
    'component:derive',
    'unit:view',
    'unit:transition',
    'handover:receive',
    'handover:reconcile',
    'handover:view',
    'lab:record',
    'storage:manage',
    'inventory:view',
    'disposition:record',
    'operational:read',
    'operational:write',
  ],
  CLINICAL_STAFF: [
    'org:view',
    'staff:list',
    'camp:attendance',
    'clinical:screen',
    'donation:record',
    'component:derive',
    'unit:view',
    'handover:view',
    'lab:record',
    'lab:verify',
    'clinical:release',
    'storage:manage',
    'inventory:view',
    'disposition:record',
    'operational:read',
    'operational:write',
  ],
  COLLECTION_STAFF: [
    'org:view',
    'camp:manage',
    'camp:attendance',
    'donation:record',
    'collection:manage',
    'unit:view',
    'unit:transition',
    'handover:create',
    'handover:dispatch',
    'handover:view',
    'operational:read',
    'operational:write',
  ],
  AUDITOR: [
    'org:view',
    'staff:list',
    'unit:view',
    'handover:view',
    'inventory:view',
    'audit:read',
    'operational:read',
  ],
};

export interface AssignStaffInput {
  phoneOrUserId: string; // Indian mobile number or User UUID
  role: OrgRole;
}

export interface UpdateStaffRoleInput {
  role: OrgRole;
  isActive?: boolean;
}

export interface StaffMemberSummary {
  membershipId: string;
  userId: string;
  name: string | null;
  role: OrgRole;
  isActive: boolean;
  assignedAt: string;
  assignedBy: string | null;
}

export interface UserOrgMembershipSummary {
  membershipId: string;
  organisationId: string;
  orgCode: string;
  organisationName: string;
  role: OrgRole;
  status: OrgStatus;
  isActive: boolean;
  assignedAt: string;
  permissions: Permission[];
}

// ----------------------------------------------------
// Phase 3: Camp Operations, Attendance, Screening & Donation Types
// ----------------------------------------------------

export type AttendanceStatus = 'REGISTERED' | 'CHECKED_IN' | 'CANCELLED';

export type ScreeningStatus = 'PENDING' | 'CLEARED' | 'DEFERRED' | 'NOT_COMPLETED';

export type DonationOutcome = 'COMPLETED' | 'DEFERRED' | 'NOT_PERFORMED' | 'ADVERSE_EVENT_STOPPED';

export type DonationType = 'WHOLE_BLOOD' | 'APHERESIS_PLATELETS' | 'APHERESIS_PLASMA';

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
  phoneOrUserId: string; // Registered donor phone or user UUID
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

// ----------------------------------------------------
// Phase 4: Blood Collection Unit & Component Traceability Types
// ----------------------------------------------------

export type CollectionUnitStatus =
  | 'COLLECTED'
  | 'PREPARED_FOR_HANDOVER'
  | 'IN_TRANSIT'
  | 'RECEIVED_BY_CENTRE'
  | 'QUARANTINED'
  | 'REJECTED'
  | 'PROCESSING_COMPLETED';

export type ComponentUnitStatus =
  | 'QUARANTINED'
  | 'AWAITING_TESTING'
  | 'AVAILABLE'
  | 'RESERVED'
  | 'ISSUED'
  | 'EXPIRED'
  | 'DISCARDED';

export type ComponentType =
  | 'WHOLE_BLOOD'
  | 'PRBC'
  | 'FRESH_FROZEN_PLASMA'
  | 'PLATELET_CONCENTRATE'
  | 'CRYOPRECIPITATE'
  | 'BUFFY_COAT';

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
  expiresInDays?: number; // Optional override; defaults to clinical standards (e.g. PRBC 42d, Platelets 5d, FFP 365d)
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

export interface UnitStatusHistoryEntry {
  id: string;
  unitType: 'COLLECTION_UNIT' | 'COMPONENT_UNIT';
  fromStatus: string | null;
  toStatus: string;
  actorUserId: string;
  actorName?: string | null;
  organisationId: string;
  reason: string | null;
  referenceNote: string | null;
  timestamp: string;
}

export interface ComponentUnitSummary {
  id: string;
  componentCode: string;
  collectionUnitId: string;
  componentType: ComponentType;
  bloodGroup: string;
  volumeMl: number | null;
  status: ComponentUnitStatus;
  derivedAt: string;
  derivedBy: string;
  expiresAt: string;
}

export interface CollectionUnitTraceability {
  id: string;
  unitNumber: string;
  bagIdentifier: string | null;
  donationEventId: string;
  campId: string | null;
  campTitle?: string | null;
  organisationId: string;
  organisationName?: string | null;
  bloodGroup: string;
  volumeMl: number | null;
  status: CollectionUnitStatus;
  collectedAt: string;
  collectedBy: string;
  components: ComponentUnitSummary[];
  statusHistory: UnitStatusHistoryEntry[];
}

// ----------------------------------------------------
// Phase 5: Handover, Transport & Reconciliation DTOs
// ----------------------------------------------------

export type ManifestStatus =
  | 'DRAFT'
  | 'FINALISED'
  | 'DISPATCHED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED_WITH_DISCREPANCIES'
  | 'RECONCILED'
  | 'CANCELLED';

export type ItemReceiptOutcome =
  | 'PENDING'
  | 'VERIFIED_INTACT'
  | 'DAMAGED'
  | 'TEMPERATURE_EXCURSION'
  | 'MISSING'
  | 'MISMATCHED'
  | 'UNEXPECTED';

export type DiscrepancyCategory =
  | 'UNIT_MISSING'
  | 'UNEXPECTED_UNIT'
  | 'IDENTIFIER_MISMATCH'
  | 'DAMAGED_BAG'
  | 'COLD_CHAIN_BREACH'
  | 'QUANTITY_MISMATCH'
  | 'OTHER';

export type ExceptionSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ExceptionStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'WAIVED';

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

export interface AddManifestItemInput {
  collectionUnitId: string;
}

export interface FinaliseManifestInput {
  notes?: string;
}

export interface DispatchManifestInput {
  transportDetails?: TransportDetails;
  dispatchNotes?: string;
}

export interface ReceiveItemInput {
  collectionUnitId: string;
  outcome: ItemReceiptOutcome;
  discrepancyCategory?: DiscrepancyCategory;
  discrepancyNote?: string;
  severity?: ExceptionSeverity;
}

export interface BatchReceiveItemsInput {
  receipts: ReceiveItemInput[];
}

export interface ResolveExceptionInput {
  resolutionNotes: string;
  status?: 'RESOLVED' | 'WAIVED';
}

export interface ReconcileManifestInput {
  reconciliationNotes?: string;
}

export interface HandoverItemSummary {
  id: string;
  collectionUnitId: string;
  unitNumber: string;
  bloodGroup: string;
  volumeMl: number | null;
  outcome: ItemReceiptOutcome;
  receivedAt: string | null;
  verifiedByName: string | null;
  discrepancyNote: string | null;
}

export interface ReconciliationExceptionSummary {
  id: string;
  manifestId: string;
  handoverItemId: string | null;
  collectionUnitId: string | null;
  category: DiscrepancyCategory;
  severity: ExceptionSeverity;
  status: ExceptionStatus;
  description: string;
  resolutionNotes: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface HandoverManifestDetail {
  id: string;
  manifestNumber: string;
  campId: string | null;
  campTitle: string | null;
  sendingOrganisationId: string;
  sendingOrganisationName: string;
  receivingOrganisationId: string;
  receivingOrganisationName: string;
  status: ManifestStatus;
  transportDetails: TransportDetails | null;
  createdAt: string;
  createdByName: string;
  finalisedAt: string | null;
  finalisedByName: string | null;
  dispatchedAt: string | null;
  dispatchedByName: string | null;
  reconciledAt: string | null;
  reconciledByName: string | null;
  notes: string | null;
  items: HandoverItemSummary[];
  exceptions: ReconciliationExceptionSummary[];
  summary: {
    totalExpected: number;
    totalVerifiedIntact: number;
    totalDamaged: number;
    totalMissing: number;
    totalTemperatureExcursion: number;
    totalMismatched: number;
    totalUnexpected: number;
    totalPending: number;
    openExceptionsCount: number;
  };
}

// ====================================================
// Phase 6: Processing, Laboratory Records & Clinical Release Types
// ====================================================

export type TestCategory =
  | 'TTI_SCREENING'
  | 'BLOOD_GROUPING'
  | 'ANTIBODY_SCREENING'
  | 'COMPONENT_QC'
  | 'OTHER';

export type TestType =
  | 'HIV_ANTIBODY'
  | 'HCV_ANTIBODY'
  | 'HBSAG'
  | 'SYPHILIS_RPR'
  | 'MALARIA_ANTIGEN'
  | 'ABO_RH_CONFIRMATION'
  | 'IRREGULAR_ANTIBODY'
  | 'COMPONENT_VOLUME'
  | 'PLATELET_YIELD'
  | 'HEMATOCRIT'
  | 'OTHER';

export type TestResultOutcome =
  | 'NON_REACTIVE'
  | 'REACTIVE'
  | 'INDETERMINATE'
  | 'CONFIRMED_POSITIVE'
  | 'NOT_APPLICABLE';

export type TestRecordStatus =
  | 'PENDING'
  | 'COMPLETED'
  | 'FAILED'
  | 'INVALID'
  | 'REPEAT_REQUIRED';

export type ClinicalReleaseDecision =
  | 'RELEASED'
  | 'WITHHELD'
  | 'QUARANTINE_HOLD'
  | 'DISCARD_ORDERED';

export type StorageType =
  | 'BLOOD_BANK_REFRIGERATOR'
  | 'DEEP_FREEZER'
  | 'PLATELET_AGITATOR'
  | 'QUARANTINE_STORAGE'
  | 'DISPOSITION_HOLD';

export interface RecordLaboratoryTestInput {
  collectionUnitId?: string;
  componentUnitId?: string;
  category: TestCategory;
  testType: TestType;
  testName: string;
  sampleBarcode?: string;
  status?: TestRecordStatus;
  resultOutcome?: TestResultOutcome;
  quantitativeValue?: string;
  units?: string;
  referenceRange?: string;
  reagentLot?: string;
  reagentExpiry?: string;
  instrumentId?: string;
  performedAt?: string;
  notes?: string;
}

export interface VerifyLaboratoryTestInput {
  verifiedOutcome?: TestResultOutcome;
  status?: TestRecordStatus;
  notes?: string;
}

export interface RecordClinicalReleaseInput {
  decision: ClinicalReleaseDecision;
  reason: string;
  reviewedTestIds?: string[];
  clinicalProtocolRef?: string;
  dispositionNotes?: string;
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
  dispositionType: string;
  reason: string;
  dispositionNotes?: string;
}

export interface InventoryCategorySummary {
  componentType: string;
  bloodGroup: string;
  status: string;
  count: number;
  totalVolumeMl: number;
}

export interface ComprehensiveInventorySummary {
  inTransit: number;
  quarantinedOrHold: number;
  awaitingTestingOrReview: number;
  releasedAndAvailable: number;
  reserved: number;
  issued: number;
  expired: number;
  discarded: number;
  totalComponents: number;
  byTypeAndGroup: InventoryCategorySummary[];
  byStorageLocation: Array<{
    locationId: string;
    locationCode: string;
    locationName: string;
    storageType: StorageType;
    count: number;
  }>;
}

// ----------------------------------------------------
// Phase 7 Real-Time Delivery & WebSocket Contracts
// ----------------------------------------------------

export type RealtimeEventType =
  | 'component.status_changed'
  | 'component.release_recorded'
  | 'component.quarantine_hold'
  | 'inventory.summary_changed'
  | 'storage.movement_recorded'
  | 'handover.dispatched'
  | 'handover.receipt_updated'
  | 'handover.reconciled'
  | 'camp.readiness_verified'
  | 'camp.attendance_registered'
  | 'camp.attendance_checked_in'
  | 'camp.screening_recorded'
  | 'camp.donation_completed'
  | 'camp.collection_unit_confirmed'
  | 'camp.closed'
  | 'donor.eligibility_updated'
  | 'blood_request.status_changed'
  | 'donor_invitation.response_changed'
  | 'hospital_issue.authorised'
  | 'hospital_issue.dispatched'
  | 'hospital_issue.received'
  | 'component.disposition_recorded';

export interface RealtimeEventEnvelope<T = any> {
  eventId: string;
  eventType: RealtimeEventType;
  schemaVersion: '1.0';
  timestamp: string; // ISO-8601
  organisationId?: string;
  recipientUserId?: string;
  entityType: string;
  entityId: string;
  payload: T;
}

export type WebSocketClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'subscribe'; channel: string }
  | { type: 'unsubscribe'; channel: string }
  | { type: 'ping' }
  | { type: 'replay'; lastEventId?: string; sinceTimestamp?: string };

export type WebSocketServerMessage =
  | { type: 'authenticated'; user: { id: string; name: string | null }; authorizedOrgs: string[] }
  | { type: 'subscribed'; channel: string }
  | { type: 'unsubscribed'; channel: string }
  | { type: 'event'; event: RealtimeEventEnvelope }
  | { type: 'pong' }
  | { type: 'error'; code: string; message: string };
