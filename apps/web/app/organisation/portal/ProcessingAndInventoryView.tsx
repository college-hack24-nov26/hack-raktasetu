'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { authFetch } from '../../config/api';

interface StorageLocationItem {
  id: string;
  name: string;
  locationCode: string;
  storageType: string;
  targetTempRange: string;
  roomOrArea?: string | null;
  equipmentIdentifier?: string | null;
  shelfOrRack?: string | null;
  _count?: { components: number };
}

interface ComponentInventoryItem {
  id: string;
  componentCode: string;
  componentType: string;
  bloodGroup: string;
  volumeMl: number | null;
  status: string;
  derivedAt: string;
  expiresAt: string;
  isExpired: boolean;
  isHold: boolean;
  holdReason?: string | null;
  dispositionType?: string | null;
  dispositionReason?: string | null;
  organisationId?: string;
  storageLocation?: {
    id: string;
    name: string;
    locationCode: string;
    storageType: string;
    targetTempRange: string;
  } | null;
  latestClinicalRelease?: {
    id: string;
    decision: string;
    decisionTimestamp: string;
    reason: string;
    authorizedClinicalUser?: { name: string | null; role: string };
  } | null;
  sourceCollectionUnitNumber?: string | null;
}

interface InventorySummary {
  organisationId: string;
  calculatedAt: string;
  summary: {
    totalComponentsRecorded: number;
    releasedAndAvailable: number;
    quarantinedOrHold: number;
    awaitingTestingOrRelease: number;
    reserved: number;
    expired: number;
    discarded: number;
    issued: number;
  };
  availableBreakdown: {
    byComponentType: Record<string, number>;
    byBloodGroup: Record<string, number>;
    byLocation: Record<string, number>;
  };
  collectionIntakeMetrics: {
    note: string;
    collectedAtCamp: number;
    inTransitToFacility: number;
    receivedAwaitingProcessing: number;
  };
  externalDirectoryNote: string;
}

export interface LabTestRecord {
  id: string;
  category: string;
  testType: string;
  testName?: string | null;
  status: string;
  resultOutcome?: string | null;
  quantitativeValue?: string | null;
  units?: string | null;
  referenceRange?: string | null;
  performedAt?: string | null;
  verifiedAt?: string | null;
  notes?: string | null;
  performedBy?: { id: string; name: string | null; role: string } | null;
  verifiedBy?: { id: string; name: string | null; role: string } | null;
  collectionUnit?: { id: string; unitNumber: string; bloodGroup: string; volumeMl: number | null } | null;
  componentUnit?: { id: string; componentCode: string; componentType: string; bloodGroup: string } | null;
}

interface ReleaseEligibility {
  component: {
    id: string;
    componentCode: string;
    componentType: string;
    bloodGroup: string;
    volumeMl?: number | null;
    status: string;
    expiresAt: string;
    isExpired: boolean;
    isHold: boolean;
    holdReason?: string | null;
    sourceCollectionUnitNumber?: string | null;
    storageLocationName?: string | null;
  };
  mandatoryRequirements: {
    allMandatoryRequired: string[];
    missingTests: string[];
    pendingTests: string[];
    reactiveOrFailedTests: { testType: string; outcome: string | null }[];
    passedTests: { testType: string; outcome: string; recordId: string }[];
  };
  shelfLifeVerification?: {
    isExpired: boolean;
    remainingDays?: number;
    hoursUntilExpiry?: number;
    status: string;
  };
  isEligibleForRelease: boolean;
  blockingReasons: string[];
}

export interface IntakeCollectionUnitItem {
  id: string;
  unitNumber: string;
  bagIdentifier: string | null;
  bloodGroup: string;
  volumeMl: number | null;
  status: string;
  collectedAt: string;
  camp?: {
    id: string;
    campCode: string;
    title: string;
  } | null;
  componentCount?: number;
}

export interface ProcessingAndInventoryViewProps {
  organisationId: string;
  userRole: 'ORG_ADMIN' | 'INVENTORY_STAFF' | 'CLINICAL_STAFF' | 'COLLECTION_STAFF' | 'AUDITOR';
  isAdmin: boolean;
  isAuditor: boolean;
  refreshSignal?: number;
  initialSubTab?: 'inventory' | 'intake' | 'fractionate' | 'lab' | 'release' | 'storage' | 'disposition';
}

export function ProcessingAndInventoryView({
  organisationId,
  userRole,
  isAdmin,
  isAuditor,
  refreshSignal,
  initialSubTab,
}: ProcessingAndInventoryViewProps) {
  const [subTab, setSubTab] = useState<'inventory' | 'intake' | 'fractionate' | 'lab' | 'release' | 'storage' | 'disposition'>(
    initialSubTab || 'intake'
  );

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // Summary state
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Component inventory list state
  const [components, setComponents] = useState<ComponentInventoryItem[]>([]);
  const [loadingComponents, setLoadingComponents] = useState(false);
  const [componentsError, setComponentsError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Active org ref to sequence-guard async requests against stale responses
  const activeOrgRef = useRef(organisationId);

  // Storage locations
  const [storageLocations, setStorageLocations] = useState<StorageLocationItem[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);

  // Action messages
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modals
  const [showCreateLocationModal, setShowCreateLocationModal] = useState(false);
  const [newLocCode, setNewLocCode] = useState('');
  const [newLocName, setNewLocName] = useState('');
  const [newLocType, setNewLocType] = useState('BLOOD_BANK_REFRIGERATOR');
  const [newLocTempRange, setNewLocTempRange] = useState('+2°C to +6°C');
  const [newLocArea, setNewLocArea] = useState('Component Processing Area');
  const [creatingLocationLoading, setCreatingLocationLoading] = useState(false);

  // Move component modal
  const [movingComponent, setMovingComponent] = useState<ComponentInventoryItem | null>(null);
  const [moveDestLocationId, setMoveDestLocationId] = useState('');
  const [moveReason, setMoveReason] = useState('Relocation to designated storage');
  const [moveObservedTemp, setMoveObservedTemp] = useState(4.0);
  const [moveExcursionNoted, setMoveExcursionNoted] = useState(false);
  const [moveExcursionNotes, setMoveExcursionNotes] = useState('');
  const [movingLoading, setMovingLoading] = useState(false);

  // Record Lab Test Modal
  const [showRecordTestModal, setShowRecordTestModal] = useState(false);
  const [testTargetComp, setTestTargetComp] = useState<ComponentInventoryItem | null>(null);
  const [testCategory, setTestCategory] = useState('TTI_SCREENING');
  const [testType, setTestType] = useState('HIV_ANTIBODY');
  const [testOutcome, setTestOutcome] = useState('NON_REACTIVE');
  const [testQuantValue, setTestQuantValue] = useState('< 0.10 S/CO');
  const [testRefRange, setTestRefRange] = useState('< 1.0 Non-reactive');
  const [testNotes, setTestNotes] = useState('');
  const [recordingTestLoading, setRecordingTestLoading] = useState(false);

  // Expiry check mounted time (deferred for static prerender safety)
  const [mountedTime, setMountedTime] = useState<number | null>(null);

  useEffect(() => {
    setMountedTime(Date.now());
  }, []);

  // Clinical Release Modal
  const [releaseEligibility, setReleaseEligibility] = useState<ReleaseEligibility | null>(null);
  const [loadingEligibility, setLoadingEligibility] = useState(false);
  const [releasingComp, setReleasingComp] = useState<ComponentInventoryItem | null>(null);
  const [releaseDecision, setReleaseDecision] = useState<'RELEASED' | 'QUARANTINE_HOLD' | 'WITHHELD' | 'DISCARD_ORDERED'>('QUARANTINE_HOLD');
  const [releaseReason, setReleaseReason] = useState('');
  const [releaseProtocolRef, setReleaseProtocolRef] = useState('NBTC Schedule F(K) Standard Release Protocol');
  const [releasingLoading, setReleasingLoading] = useState(false);

  // Expiry sweep loading
  const [sweepingLoading, setSweepingLoading] = useState(false);

  // Disposition modal
  const [dispositionComp, setDispositionComp] = useState<ComponentInventoryItem | null>(null);
  const [dispositionType, setDispositionType] = useState('DISCARDED_EXPIRED');
  const [dispositionReason, setDispositionReason] = useState('Scheduled clinical disposal');
  const [dispositionLoading, setDispositionLoading] = useState(false);

  // Laboratory Records & Clinical Verification State
  const [labTests, setLabTests] = useState<LabTestRecord[]>([]);
  const [loadingLabTests, setLoadingLabTests] = useState(false);
  const [labError, setLabError] = useState<string | null>(null);
  const [labCategoryFilter, setLabCategoryFilter] = useState('');
  const [labOutcomeFilter, setLabOutcomeFilter] = useState('');
  const [labSearch, setLabSearch] = useState('');

  // Clinical verification modal
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [targetVerifyRecord, setTargetVerifyRecord] = useState<LabTestRecord | null>(null);
  const [verificationNotes, setVerificationNotes] = useState('Result confirmed against certified laboratory run log.');
  const [verifyingLoading, setVerifyingLoading] = useState(false);

  // Local action debounce guards to stop duplicate refresh loops
  const localActionTimestampRef = useRef<number>(0);
  const lastSignalRef = useRef(refreshSignal);

  // RBAC Clinical Authority: STRICT SAFETY GATE
  // In accordance with NBTC and drug safety guidelines, clinical release and verification
  // strictly require CLINICAL_STAFF role. ORG_ADMIN alone cannot release blood components!
  const isDesignatedClinicalStaff = userRole === 'CLINICAL_STAFF';
  const canDeriveComponents = ['ORG_ADMIN', 'INVENTORY_STAFF', 'CLINICAL_STAFF'].includes(userRole) || Boolean(isAdmin);
  const canRecordLab = ['ORG_ADMIN', 'CLINICAL_STAFF', 'INVENTORY_STAFF', 'COLLECTION_STAFF'].includes(userRole) || Boolean(isAdmin);

  // Intake Queue state (Whole blood collection units received at blood bank)
  const [intakeUnits, setIntakeUnits] = useState<IntakeCollectionUnitItem[]>([]);
  const [loadingIntake, setLoadingIntake] = useState(false);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [intakeSearch, setIntakeSearch] = useState('');
  const [intakeGroupFilter, setIntakeGroupFilter] = useState('');

  // Derivation modal state
  const [derivingUnit, setDerivingUnit] = useState<IntakeCollectionUnitItem | null>(null);
  const [derivationRecipe, setDerivationRecipe] = useState<'TRIPLE_BAG' | 'DOUBLE_BAG' | 'WHOLE_BLOOD' | 'CUSTOM'>('TRIPLE_BAG');
  const [customComponents, setCustomComponents] = useState<Array<{ componentType: string; volumeMl: number; notes: string }>>([
    { componentType: 'PRBC', volumeMl: 250, notes: 'Packed Red Blood Cells' },
    { componentType: 'FRESH_FROZEN_PLASMA', volumeMl: 200, notes: 'Fresh Frozen Plasma' },
    { componentType: 'PLATELET_CONCENTRATE', volumeMl: 50, notes: 'Platelet Concentrate' },
  ]);
  const [derivationReason, setDerivationReason] = useState('Standard refrigerated centrifuge fractionation');
  const [derivingLoading, setDerivingLoading] = useState(false);

  // Pilot tube lab test on collection unit
  const [testTargetCollectionUnit, setTestTargetCollectionUnit] = useState<IntakeCollectionUnitItem | null>(null);

  // Memoized filtered intake collection units
  const filteredIntakeUnits = useMemo(() => {
    return intakeUnits.filter((u) => {
      if (intakeGroupFilter && u.bloodGroup !== intakeGroupFilter) return false;
      if (intakeSearch.trim()) {
        const q = intakeSearch.toLowerCase();
        const matchesUnit = u.unitNumber.toLowerCase().includes(q);
        const matchesBag = u.bagIdentifier ? u.bagIdentifier.toLowerCase().includes(q) : false;
        const matchesCamp = u.camp ? (u.camp.title.toLowerCase().includes(q) || u.camp.campCode.toLowerCase().includes(q)) : false;
        if (!matchesUnit && !matchesBag && !matchesCamp) return false;
      }
      return true;
    });
  }, [intakeUnits, intakeGroupFilter, intakeSearch]);

  // Memoized queue components awaiting clearance
  const queueComponents = useMemo(() => {
    return components.filter(
      (c) => c.status === 'QUARANTINED' || c.status === 'AWAITING_CLINICAL_REVIEW' || c.status === 'AWAITING_TESTING'
    );
  }, [components]);

  // Reset modal state on organisation switch
  useEffect(() => {
    activeOrgRef.current = organisationId;
    setReleasingComp(null);
    setReleaseEligibility(null);
    setDispositionComp(null);
    setMovingComponent(null);
    setTestTargetComp(null);
    setTestTargetCollectionUnit(null);
    setDerivingUnit(null);
    setShowCreateLocationModal(false);
    setShowRecordTestModal(false);
    setShowVerifyModal(false);
    setTargetVerifyRecord(null);
    setActionError(null);
    setActionSuccess(null);
    setComponentsError(null);
    setIntakeError(null);
    setLabError(null);
  }, [organisationId]);

  // Lock background scrolling when any modal is open
  useEffect(() => {
    const isAnyModalOpen = Boolean(
      releasingComp || showRecordTestModal || movingComponent || dispositionComp || showCreateLocationModal || derivingUnit || showVerifyModal
    );
    if (isAnyModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [releasingComp, showRecordTestModal, movingComponent, dispositionComp, showCreateLocationModal, derivingUnit, showVerifyModal]);

  // Close modals on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setReleasingComp(null);
        setReleaseEligibility(null);
        setDerivingUnit(null);
        setShowRecordTestModal(false);
        setMovingComponent(null);
        setDispositionComp(null);
        setShowCreateLocationModal(false);
        setShowVerifyModal(false);
        setTargetVerifyRecord(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Load Inventory Summary
  const loadSummary = async () => {
    const fetchOrgId = organisationId;
    try {
      setLoadingSummary(true);
      const res = await authFetch(`/api/v1/organisations/${fetchOrgId}/inventory/summary`);
      if (activeOrgRef.current !== fetchOrgId) return;
      if (res.ok) {
        const data = await res.json();
        setSummary(data.data);
      }
    } catch {
      // ignore
    } finally {
      if (activeOrgRef.current === fetchOrgId) {
        setLoadingSummary(false);
      }
    }
  };

  // Load Components
  const loadComponents = async () => {
    const fetchOrgId = organisationId;
    try {
      setLoadingComponents(true);
      setComponentsError(null);
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (typeFilter) params.append('componentType', typeFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());

      const res = await authFetch(`/api/v1/organisations/${fetchOrgId}/inventory/components?${params.toString()}`);
      if (activeOrgRef.current !== fetchOrgId) return;
      if (res.ok) {
        const data = await res.json();
        setComponents(data.data || []);
      } else {
        const errData = await res.json().catch(() => ({}));
        setComponentsError(errData.error?.message || 'Failed to load inventory components');
      }
    } catch (err: any) {
      if (activeOrgRef.current === fetchOrgId) {
        setComponentsError(err.message || 'Error connecting to inventory service');
      }
    } finally {
      if (activeOrgRef.current === fetchOrgId) {
        setLoadingComponents(false);
      }
    }
  };

  // Load Storage Locations
  const loadLocations = async () => {
    const fetchOrgId = organisationId;
    try {
      setLoadingLocations(true);
      const res = await authFetch(`/api/v1/organisations/${fetchOrgId}/storage-locations`);
      if (activeOrgRef.current !== fetchOrgId) return;
      if (res.ok) {
        const data = await res.json();
        setStorageLocations(data.data || []);
      }
    } catch {
      // ignore
    } finally {
      if (activeOrgRef.current === fetchOrgId) {
        setLoadingLocations(false);
      }
    }
  };

  // Load Intake Collection Units (received whole blood awaiting processing)
  const loadIntakeUnits = async () => {
    const fetchOrgId = organisationId;
    try {
      setLoadingIntake(true);
      setIntakeError(null);
      const res = await authFetch(
        `/api/v1/traceability/collection-units?organisationId=${encodeURIComponent(fetchOrgId)}&status=RECEIVED_BY_CENTRE`
      );
      if (activeOrgRef.current !== fetchOrgId) return;
      if (res.ok) {
        const data = await res.json();
        setIntakeUnits(data.data || []);
      } else {
        const errData = await res.json().catch(() => ({}));
        setIntakeError(errData.error?.message || 'Failed to load intake collection units');
      }
    } catch (err: any) {
      if (activeOrgRef.current === fetchOrgId) {
        setIntakeError(err.message || 'Error connecting to traceability service');
      }
    } finally {
      if (activeOrgRef.current === fetchOrgId) {
        setLoadingIntake(false);
      }
    }
  };

  // Load Laboratory Test Records
  const loadLabTests = async () => {
    const fetchOrgId = organisationId;
    try {
      setLoadingLabTests(true);
      setLabError(null);
      const res = await authFetch(`/api/v1/organisations/${fetchOrgId}/laboratory-tests`);
      if (activeOrgRef.current !== fetchOrgId) return;
      if (res.ok) {
        const data = await res.json();
        setLabTests(data.data || []);
      } else {
        const errData = await res.json().catch(() => ({}));
        setLabError(errData.error?.message || 'Failed to load laboratory test records');
      }
    } catch (err: any) {
      if (activeOrgRef.current === fetchOrgId) {
        setLabError(err.message || 'Error connecting to laboratory test service');
      }
    } finally {
      if (activeOrgRef.current === fetchOrgId) {
        setLoadingLabTests(false);
      }
    }
  };

  // Helper for targeted, immutable component updates
  const patchComponentItem = (
    existing: ComponentInventoryItem,
    patch: Partial<ComponentInventoryItem> & Record<string, any>
  ): ComponentInventoryItem => {
    const expiresAt = patch.expiresAt || existing.expiresAt;
    const now = Date.now();
    const isExpired = expiresAt ? new Date(expiresAt).getTime() <= now : existing.isExpired;

    return {
      ...existing,
      ...patch,
      id: existing.id,
      componentCode: patch.componentCode || existing.componentCode,
      componentType: patch.componentType || existing.componentType,
      bloodGroup: patch.bloodGroup || existing.bloodGroup,
      volumeMl: patch.volumeMl !== undefined ? patch.volumeMl : existing.volumeMl,
      status: patch.status || existing.status,
      derivedAt: patch.derivedAt || existing.derivedAt,
      expiresAt,
      isExpired,
      isHold: patch.isHold !== undefined ? patch.isHold : existing.isHold,
      holdReason: patch.holdReason !== undefined ? patch.holdReason : existing.holdReason,
      dispositionType: patch.dispositionType !== undefined ? patch.dispositionType : existing.dispositionType,
      dispositionReason: patch.dispositionReason !== undefined ? patch.dispositionReason : existing.dispositionReason,
      storageLocation: patch.storageLocation !== undefined ? patch.storageLocation : existing.storageLocation,
      latestClinicalRelease: patch.latestClinicalRelease !== undefined ? patch.latestClinicalRelease : existing.latestClinicalRelease,
      sourceCollectionUnitNumber: patch.sourceCollectionUnitNumber !== undefined
        ? patch.sourceCollectionUnitNumber
        : (patch.collectionUnit?.unitNumber || existing.sourceCollectionUnitNumber),
    };
  };

  // Targeted single-record refetch fallback if needed
  const refetchSingleComponent = async (componentId: string) => {
    try {
      const res = await authFetch(`/api/v1/traceability/components/${componentId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.data) {
          setComponents((prev) =>
            prev.map((c) => (c.id === componentId ? patchComponentItem(c, data.data) : c))
          );
        }
      }
    } catch {
      // Ignored fallback
    }
  };

  // Full manual refresh for the user
  const handleManualRefresh = async () => {
    localActionTimestampRef.current = 0;
    await Promise.allSettled([
      loadSummary(),
      loadComponents(),
      loadLocations(),
      loadIntakeUnits(),
      loadLabTests(),
    ]);
  };

  // Clinical verification of a laboratory test record (Targeted State Update)
  const handleVerifyLabTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetVerifyRecord) return;
    if (!isDesignatedClinicalStaff) {
      setActionError('Permission denied: Only CLINICAL_STAFF can clinically verify laboratory test records.');
      return;
    }

    setVerifyingLoading(true);
    setActionError(null);
    setActionSuccess(null);
    localActionTimestampRef.current = Date.now();

    try {
      const res = await authFetch(
        `/api/v1/organisations/${organisationId}/laboratory-tests/${targetVerifyRecord.id}/verify`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notes: verificationNotes.trim() || undefined,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Clinical verification failed');

      setActionSuccess(`Laboratory test record for ${targetVerifyRecord.testType} clinically verified successfully.`);
      setShowVerifyModal(false);

      // TARGETED UPDATE 1: Update only the verified laboratory record in frontend state using authoritative backend response
      if (data.data && data.data.id) {
        const verifiedRec: LabTestRecord = data.data;
        setLabTests((prev) =>
          prev.map((r) =>
            r.id === verifiedRec.id
              ? {
                  ...r,
                  ...verifiedRec,
                  verifiedAt: verifiedRec.verifiedAt || new Date().toISOString(),
                  verifiedBy: verifiedRec.verifiedBy || r.verifiedBy || { id: '', name: 'Clinical Staff', role: 'CLINICAL_STAFF' },
                  status: verifiedRec.status || 'COMPLETED',
                }
              : r
          )
        );
      }

      // TARGETED UPDATE 2: If clinical release review is currently evaluating this component, refresh its eligibility
      if (
        releasingComp &&
        (releasingComp.id === targetVerifyRecord.componentUnit?.id ||
          releasingComp.sourceCollectionUnitNumber === targetVerifyRecord.collectionUnit?.unitNumber)
      ) {
        handleOpenReleaseReview(releasingComp);
      }

      setTargetVerifyRecord(null);

      // Refresh top summary metrics quietly in background without full-list table reload
      loadSummary();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setVerifyingLoading(false);
    }
  };

  useEffect(() => {
    if (!organisationId) return;

    if (refreshSignal !== undefined && refreshSignal !== lastSignalRef.current) {
      lastSignalRef.current = refreshSignal;
      const elapsed = Date.now() - localActionTimestampRef.current;
      if (elapsed < 3000) {
        // Redundant refresh signal caused by this component's own recent local mutation; skip re-fetch
        return;
      }
      // If external WebSocket event arrives from another session, refresh ONLY the top metrics summary quietly.
      // Do NOT trigger full table reloads or spinners that disrupt user interaction.
      loadSummary();
      return;
    }

    // Initial mount or explicit filter change: load data
    loadSummary();
    loadComponents();
    loadLocations();
    loadIntakeUnits();
    loadLabTests();
  }, [organisationId, statusFilter, typeFilter, refreshSignal]);

  // Fractionate / Derive Components Handler (Targeted State Update)
  const handleDeriveComponents = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!derivingUnit) return;
    if (!canDeriveComponents) {
      setActionError('Permission denied: Only ORG_ADMIN, INVENTORY_STAFF, or CLINICAL_STAFF can register component derivation.');
      return;
    }

    let componentsToDerive: Array<{ componentType: string; volumeMl?: number; notes?: string }> = [];

    if (derivationRecipe === 'TRIPLE_BAG') {
      componentsToDerive = [
        { componentType: 'PRBC', volumeMl: 250, notes: 'Packed Red Blood Cells' },
        { componentType: 'FRESH_FROZEN_PLASMA', volumeMl: 200, notes: 'Fresh Frozen Plasma' },
        { componentType: 'PLATELET_CONCENTRATE', volumeMl: 50, notes: 'Random Donor Platelets (RDP)' },
      ];
    } else if (derivationRecipe === 'DOUBLE_BAG') {
      componentsToDerive = [
        { componentType: 'PRBC', volumeMl: 250, notes: 'Packed Red Blood Cells' },
        { componentType: 'FRESH_FROZEN_PLASMA', volumeMl: 200, notes: 'Fresh Frozen Plasma' },
      ];
    } else if (derivationRecipe === 'WHOLE_BLOOD') {
      componentsToDerive = [
        { componentType: 'WHOLE_BLOOD', volumeMl: derivingUnit.volumeMl || 450, notes: 'Single Bag Whole Blood' },
      ];
    } else {
      // CUSTOM
      componentsToDerive = customComponents.filter((c) => c.componentType && c.volumeMl > 0);
    }

    if (componentsToDerive.length === 0) {
      setActionError('At least one valid component with positive volume must be specified for derivation.');
      return;
    }

    setDerivingLoading(true);
    setActionError(null);
    setActionSuccess(null);
    const sourceUnit = derivingUnit;

    try {
      const res = await authFetch(`/api/v1/traceability/collection-units/${sourceUnit.id}/derive-components`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          components: componentsToDerive,
          reason: derivationReason.trim() || 'Standard blood bank centrifuge fractionation',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to derive components');

      localActionTimestampRef.current = Date.now();
      setActionSuccess(
        `Successfully derived ${data.data?.length || componentsToDerive.length} component(s) from collection bag ${sourceUnit.unitNumber}. Components placed in QUARANTINED status awaiting laboratory clearance.`
      );

      // TARGETED UPDATE 1: Remove derived collection unit from intake queue
      setIntakeUnits((prev) => prev.filter((u) => u.id !== sourceUnit.id));

      // TARGETED UPDATE 2: Prepend newly derived components to components state
      if (Array.isArray(data.data) && data.data.length > 0) {
        const now = Date.now();
        const newComps: ComponentInventoryItem[] = data.data.map((c: any) => ({
          id: c.id,
          componentCode: c.componentCode,
          componentType: c.componentType,
          bloodGroup: c.bloodGroup,
          volumeMl: c.volumeMl,
          status: c.status || 'QUARANTINED',
          derivedAt: c.derivedAt || new Date().toISOString(),
          expiresAt: c.expiresAt || new Date(now + 35 * 86400000).toISOString(),
          isExpired: c.expiresAt ? new Date(c.expiresAt).getTime() <= now : false,
          isHold: Boolean(c.isHold),
          holdReason: c.holdReason || null,
          dispositionType: null,
          dispositionReason: null,
          storageLocation: c.storageLocation || null,
          latestClinicalRelease: null,
          sourceCollectionUnitNumber: sourceUnit.unitNumber,
        }));
        setComponents((prev) => [...newComps, ...prev]);
      }

      setDerivingUnit(null);

      // Refresh top summary metrics quietly in background without full-table reload
      loadSummary();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setDerivingLoading(false);
    }
  };

  // Create Storage Location Handler
  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocCode.trim() || !newLocName.trim()) return;

    setCreatingLocationLoading(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(`/api/v1/organisations/${organisationId}/storage-locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationCode: newLocCode.trim().toUpperCase(),
          name: newLocName.trim(),
          storageType: newLocType,
          targetTempRange: newLocTempRange.trim(),
          roomOrArea: newLocArea.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to create storage location');

      localActionTimestampRef.current = Date.now();
      setActionSuccess(`Storage location "${data.data.name}" (${data.data.locationCode}) successfully configured!`);
      setShowCreateLocationModal(false);
      setNewLocCode('');
      setNewLocName('');

      // TARGETED UPDATE: Add new storage location to storageLocations state
      if (data.data?.id) {
        setStorageLocations((prev) => [...prev, { ...data.data, _count: { components: 0 } }]);
      }

      loadSummary();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setCreatingLocationLoading(false);
    }
  };

  // Move Component Handler (Targeted State Update)
  const handleMoveComponent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movingComponent || !moveDestLocationId) return;

    setMovingLoading(true);
    setActionError(null);
    setActionSuccess(null);
    const targetCompId = movingComponent.id;
    const fromLocId = movingComponent.storageLocation?.id;
    const toLocId = moveDestLocationId;

    try {
      const res = await authFetch(
        `/api/v1/organisations/${organisationId}/components/${targetCompId}/storage-movement`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toLocationId: toLocId,
            reason: moveReason.trim(),
            observedTempCelsius: Number(moveObservedTemp),
            temperatureExcursionNoted: moveExcursionNoted,
            excursionNotes: moveExcursionNoted ? moveExcursionNotes.trim() : undefined,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to record component movement');

      localActionTimestampRef.current = Date.now();
      if (moveExcursionNoted) {
        setActionSuccess(`Movement recorded! Component automatically placed under QUARANTINE HOLD due to temperature excursion.`);
      } else {
        setActionSuccess(`Component ${movingComponent.componentCode} relocated successfully!`);
      }

      // TARGETED UPDATE 1: Update only the moved component's storage location and status
      const destLocation =
        data.data?.movement?.toLocation ||
        data.data?.component?.storageLocation ||
        storageLocations.find((l) => l.id === toLocId);

      setComponents((prev) =>
        prev.map((c) => {
          if (c.id === targetCompId) {
            return patchComponentItem(c, {
              ...(data.data?.component || {}),
              storageLocation: destLocation
                ? {
                    id: destLocation.id,
                    name: destLocation.name,
                    locationCode: destLocation.locationCode,
                    storageType: destLocation.storageType,
                    targetTempRange: destLocation.targetTempRange,
                  }
                : c.storageLocation,
            });
          }
          return c;
        })
      );

      // TARGETED UPDATE 2: Update storage location counts without reloading all locations
      setStorageLocations((prev) =>
        prev.map((loc) => {
          if (fromLocId && loc.id === fromLocId) {
            return {
              ...loc,
              _count: { components: Math.max(0, (loc._count?.components ?? 1) - 1) },
            };
          }
          if (loc.id === toLocId) {
            return {
              ...loc,
              _count: { components: (loc._count?.components ?? 0) + 1 },
            };
          }
          return loc;
        })
      );

      setMovingComponent(null);

      // Refresh top summary metrics quietly in background
      loadSummary();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setMovingLoading(false);
    }
  };

  // Record Lab Test Handler (Targeted State Update)
  const handleRecordLabTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testTargetComp && !testTargetCollectionUnit) return;

    setRecordingTestLoading(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const targetUnitId = testTargetComp ? testTargetComp.id : undefined;
      const targetCollectionId = testTargetCollectionUnit ? testTargetCollectionUnit.id : undefined;
      const targetLabel = testTargetComp ? testTargetComp.componentCode : testTargetCollectionUnit?.unitNumber;

      const bodyPayload: any = {
        category: testCategory,
        testType,
        resultOutcome: testOutcome,
        quantitativeValue: testQuantValue.trim() || undefined,
        referenceRange: testRefRange.trim() || undefined,
        notes: testNotes.trim() || undefined,
        status: 'COMPLETED',
      };

      if (targetUnitId) {
        bodyPayload.componentUnitId = targetUnitId;
      } else if (targetCollectionId) {
        bodyPayload.collectionUnitId = targetCollectionId;
      }

      const res = await authFetch(`/api/v1/organisations/${organisationId}/laboratory-tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to record laboratory test');

      localActionTimestampRef.current = Date.now();
      if (testOutcome === 'REACTIVE' || testOutcome === 'CONFIRMED_POSITIVE') {
        setActionSuccess(`Lab test recorded! Unit ${targetLabel} automatically placed on SAFETY QUARANTINE HOLD due to reactive result.`);
      } else {
        setActionSuccess(`Laboratory test record saved for ${targetLabel}: ${testType} (${testOutcome})`);
      }

      setShowRecordTestModal(false);
      const recordedComp = testTargetComp;
      const recordedCol = testTargetCollectionUnit;
      setTestTargetComp(null);
      setTestTargetCollectionUnit(null);

      // TARGETED UPDATE 1: Add new record to labTests state
      if (data.data?.id) {
        const newRecord: LabTestRecord = data.data;
        setLabTests((prev) => {
          const idx = prev.findIndex((r) => r.id === newRecord.id);
          if (idx >= 0) {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], ...newRecord };
            return updated;
          }
          return [newRecord, ...prev];
        });
      }

      // TARGETED UPDATE 2: If test was reactive or indeterminate, immediately place affected component(s) on quarantine hold
      const isReactive = testOutcome === 'REACTIVE' || testOutcome === 'CONFIRMED_POSITIVE' || testOutcome === 'INDETERMINATE';
      if (isReactive) {
        if (recordedComp) {
          setComponents((prev) =>
            prev.map((c) =>
              c.id === recordedComp.id
                ? {
                    ...c,
                    status: 'QUARANTINED',
                    isHold: true,
                    holdReason: `Mandatory safety hold: Reactive test result for ${testType} (${testOutcome})`,
                  }
                : c
            )
          );
        } else if (recordedCol) {
          setComponents((prev) =>
            prev.map((c) =>
              c.sourceCollectionUnitNumber === recordedCol.unitNumber
                ? {
                    ...c,
                    status: 'QUARANTINED',
                    isHold: true,
                    holdReason: `Mandatory safety hold: Reactive pilot test on parent bag ${recordedCol.unitNumber} (${testType})`,
                  }
                : c
            )
          );
        }
      }

      // TARGETED UPDATE 3: If release review is open for this component, recalculate eligibility
      if (releasingComp && recordedComp && releasingComp.id === recordedComp.id) {
        handleOpenReleaseReview(releasingComp);
      }

      // Refresh top summary metrics quietly in background without full-list table reload
      loadSummary();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setRecordingTestLoading(false);
    }
  };

  // Open Clinical Release Review
  const handleOpenReleaseReview = async (comp: ComponentInventoryItem) => {
    setReleasingComp(comp);
    setLoadingEligibility(true);
    setActionError(null);
    setReleaseDecision('QUARANTINE_HOLD');
    setReleaseReason('Clinical review of mandatory laboratory test records.');
    const targetOrgId = comp.organisationId || organisationId;

    try {
      const res = await authFetch(`/api/v1/organisations/${targetOrgId}/components/${comp.id}/release-eligibility`);
      if (res.ok) {
        const data = await res.json();
        setReleaseEligibility(data.data);
        if (data.data.isEligibleForRelease && isDesignatedClinicalStaff) {
          setReleaseDecision('RELEASED');
          setReleaseReason('All mandatory laboratory test records confirmed complete, non-reactive, and clinically verified per protocol.');
        } else {
          setReleaseDecision('QUARANTINE_HOLD');
          setReleaseReason('Release withheld: Mandatory laboratory testing incomplete or awaiting clinical verification.');
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || 'Failed to evaluate release eligibility');
      }
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setLoadingEligibility(false);
    }
  };

  // Submit Clinical Release Decision Handler (Targeted State Update)
  const handleSubmitClinicalRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!releasingComp || !releaseReason.trim()) return;

    if (releaseDecision === 'RELEASED') {
      if (!isDesignatedClinicalStaff) {
        setActionError('Permission denied: Only designated CLINICAL_STAFF can authorize release to AVAILABLE stock.');
        return;
      }
      if (!releaseEligibility?.isEligibleForRelease) {
        setActionError('Clinical Safety Gate: Cannot release component while mandatory laboratory tests are missing or unverified.');
        return;
      }
    }

    setReleasingLoading(true);
    setActionError(null);
    setActionSuccess(null);
    const targetOrgId = releasingComp.organisationId || organisationId;
    const targetCompId = releasingComp.id;

    try {
      const res = await authFetch(
        `/api/v1/organisations/${targetOrgId}/components/${targetCompId}/clinical-release`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            decision: releaseDecision,
            reason: releaseReason.trim(),
            clinicalProtocolRef: releaseProtocolRef.trim(),
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Clinical release decision rejected');

      localActionTimestampRef.current = Date.now();
      setActionSuccess(`Clinical release decision executed: ${releaseDecision} for ${releasingComp.componentCode}`);

      // TARGETED UPDATE: Update only the affected component in frontend state using authoritative backend response
      if (data.data?.component) {
        const compData = data.data.component;
        const relRecord = data.data.releaseRecord;

        setComponents((prev) =>
          prev.map((c) => {
            if (c.id === targetCompId) {
              return patchComponentItem(c, {
                status: compData.status,
                isHold: compData.isHold,
                holdReason: compData.holdReason,
                dispositionType: compData.dispositionType || c.dispositionType,
                dispositionReason: compData.dispositionReason || c.dispositionReason,
                storageLocation: compData.storageLocation || c.storageLocation,
                latestClinicalRelease: relRecord
                  ? {
                      id: relRecord.id,
                      decision: relRecord.decision,
                      decisionTimestamp: relRecord.decisionTimestamp,
                      reason: relRecord.reason,
                      authorizedClinicalUser: relRecord.authorizedClinicalUser,
                    }
                  : c.latestClinicalRelease,
              });
            }
            return c;
          })
        );
      } else {
        refetchSingleComponent(targetCompId);
      }

      setReleasingComp(null);
      setReleaseEligibility(null);

      // Refresh top summary metrics quietly in background without full-list table reload
      loadSummary();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setReleasingLoading(false);
    }
  };

  // Automated Expiry Sweep Handler
  const handleRunExpirySweep = async () => {
    if (!confirm('Run automated shelf-life expiry control sweep? Any units whose expiry timestamp has passed will be immediately isolated from available distribution stock.')) {
      return;
    }

    setSweepingLoading(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(`/api/v1/organisations/${organisationId}/inventory/expiry-sweep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Expiry sweep failed');

      localActionTimestampRef.current = Date.now();
      setActionSuccess(data.message || `Expiry sweep complete! ${data.data.sweptCount} expired unit(s) isolated.`);
      loadComponents();
      loadSummary();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setSweepingLoading(false);
    }
  };

  // Record Disposition Handler (Targeted State Update)
  const handleRecordDisposition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispositionComp || !dispositionReason.trim()) return;

    setDispositionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    const targetCompId = dispositionComp.id;

    try {
      const res = await authFetch(
        `/api/v1/organisations/${organisationId}/components/${targetCompId}/disposition`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dispositionType,
            reason: dispositionReason.trim(),
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to record disposition');

      localActionTimestampRef.current = Date.now();
      setActionSuccess(`Authorised disposition (${dispositionType}) recorded for ${dispositionComp.componentCode}!`);

      // TARGETED UPDATE: Update only the dispositioned component in frontend state
      if (data.data) {
        const compData = data.data;
        setComponents((prev) =>
          prev.map((c) => {
            if (c.id === targetCompId) {
              return patchComponentItem(c, {
                status: compData.status,
                dispositionType: compData.dispositionType,
                dispositionReason: compData.dispositionReason,
                dispositionedAt: compData.dispositionedAt,
              });
            }
            return c;
          })
        );
      } else {
        refetchSingleComponent(targetCompId);
      }

      setDispositionComp(null);

      // Refresh top summary metrics quietly in background without full-list table reload
      loadSummary();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setDispositionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Messages */}
      {actionSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-xs font-semibold text-emerald-900 flex items-center justify-between shadow-xs">
          <span>✓ {actionSuccess}</span>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-700 hover:text-emerald-900 font-bold ml-4">✕</button>
        </div>
      )}
      {actionError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs font-semibold text-red-900 flex items-center justify-between shadow-xs">
          <span>⚠ {actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-700 hover:text-red-900 font-bold ml-4">✕</button>
        </div>
      )}

      {/* Sub-navigation: Dedicated Workflow Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Tab A */}
          <button
            onClick={() => setSubTab('intake')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              subTab === 'intake'
                ? 'bg-[#B91C32] text-white shadow-xs'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <span>🩸 Tab A — Intake Queue</span>
            {intakeUnits.length > 0 && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  subTab === 'intake' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {intakeUnits.length}
              </span>
            )}
          </button>

          {/* Tab B */}
          <button
            onClick={() => setSubTab('fractionate')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              subTab === 'fractionate'
                ? 'bg-[#B91C32] text-white shadow-xs'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <span>⚗ Tab B — Fractionate &amp; Derive</span>
            {intakeUnits.length > 0 && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  subTab === 'fractionate' ? 'bg-white/20 text-white' : 'bg-rose-100 text-[#B91C32]'
                }`}
              >
                {intakeUnits.length}
              </span>
            )}
          </button>

          {/* Tab C */}
          <button
            onClick={() => setSubTab('lab')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              subTab === 'lab'
                ? 'bg-[#B91C32] text-white shadow-xs'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <span>🔬 Tab C — Laboratory Records</span>
            {labTests.length > 0 && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  subTab === 'lab' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {labTests.length}
              </span>
            )}
          </button>

          {/* Tab D */}
          <button
            onClick={() => setSubTab('release')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              subTab === 'release'
                ? 'bg-[#B91C32] text-white shadow-xs'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <span>⚖ Tab D — Clinical Release Queue</span>
            {queueComponents.length > 0 && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  subTab === 'release' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-800'
                }`}
              >
                {queueComponents.length}
              </span>
            )}
          </button>

          {/* Tab E */}
          <button
            onClick={() => setSubTab('storage')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              subTab === 'storage'
                ? 'bg-[#B91C32] text-white shadow-xs'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <span>❄ Tab E — Storage &amp; Cold Chain</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                subTab === 'storage' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {storageLocations.length}
            </span>
          </button>

          {/* Tab F */}
          <button
            onClick={() => setSubTab('inventory')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              subTab === 'inventory'
                ? 'bg-[#B91C32] text-white shadow-xs'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
            }`}
          >
            <span>📊 Tab F — Live Stock &amp; Dispositions</span>
            {(summary?.summary.releasedAndAvailable ?? 0) > 0 && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  subTab === 'inventory' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {summary?.summary.releasedAndAvailable}
              </span>
            )}
          </button>
        </div>

        {/* Manual Refresh Button */}
        <button
          onClick={handleManualRefresh}
          title="Force a complete data refresh from the server"
          className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs hover:text-slate-900"
        >
          <span className="text-sm">↻</span>
          <span>Refresh Data</span>
        </button>
      </div>

      {/* SUBTAB 1: LIVE INVENTORY & METRICS */}
      {subTab === 'inventory' && (
        <div className="space-y-6">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 shadow-xs">
              <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block mb-1">
                Released & Available
              </span>
              <p className="text-2xl font-black text-emerald-900">
                {summary?.summary.releasedAndAvailable ?? 0}
              </p>
              <p className="text-[10px] text-emerald-700 mt-1 font-medium">Clinically cleared stock</p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 shadow-xs">
              <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider block mb-1">
                Quarantined / Hold
              </span>
              <p className="text-2xl font-black text-amber-900">
                {summary?.summary.quarantinedOrHold ?? 0}
              </p>
              <p className="text-[10px] text-amber-700 mt-1 font-medium">Safety hold or pending review</p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 shadow-xs">
              <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider block mb-1">
                Awaiting Testing
              </span>
              <p className="text-2xl font-black text-blue-900">
                {summary?.summary.awaitingTestingOrRelease ?? 0}
              </p>
              <p className="text-[10px] text-blue-700 mt-1 font-medium">Processing / Lab pending</p>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-xl p-3.5 shadow-xs">
              <span className="text-[11px] font-bold text-purple-800 uppercase tracking-wider block mb-1">
                Reserved
              </span>
              <p className="text-2xl font-black text-purple-900">
                {summary?.summary.reserved ?? 0}
              </p>
              <p className="text-[10px] text-purple-700 mt-1 font-medium">Patient cross-matched</p>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 shadow-xs">
              <span className="text-[11px] font-bold text-red-800 uppercase tracking-wider block mb-1">
                Expired
              </span>
              <p className="text-2xl font-black text-red-900">
                {summary?.summary.expired ?? 0}
              </p>
              <p className="text-[10px] text-red-700 mt-1 font-medium">Withdrawn from supply</p>
            </div>

            <div className="bg-slate-100 border border-slate-200 rounded-xl p-3.5 shadow-xs">
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                Issued
              </span>
              <p className="text-2xl font-black text-slate-800">
                {summary?.summary.issued ?? 0}
              </p>
              <p className="text-[10px] text-slate-600 mt-1 font-medium">Transfused / Dispatched</p>
            </div>

            <div className="bg-slate-100 border border-slate-200 rounded-xl p-3.5 shadow-xs">
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                Discarded
              </span>
              <p className="text-2xl font-black text-slate-800">
                {summary?.summary.discarded ?? 0}
              </p>
              <p className="text-[10px] text-slate-600 mt-1 font-medium">Incinerated / Disposed</p>
            </div>
          </div>

          {/* Critical Inventory Governance & Anti-Double-Counting Banner */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border-l-4 border-emerald-600 pl-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Collection Intake & Anti-Double-Counting Partition
              </h4>
              <p className="text-xs text-slate-600 mt-1">
                Parent collection bags are reported distinctly from derived component inventory to prevent double-counting of volume and blood units:
              </p>
              <div className="flex gap-4 mt-2 flex-wrap">
                <span className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 font-mono text-slate-700">
                  Collected at Camp: <strong>{summary?.collectionIntakeMetrics.collectedAtCamp ?? 0}</strong>
                </span>
                <span className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 font-mono text-slate-700">
                  In Transit: <strong>{summary?.collectionIntakeMetrics.inTransitToFacility ?? 0}</strong>
                </span>
                <span className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 font-mono text-slate-700 flex items-center gap-1.5 flex-wrap">
                  Received awaiting processing: <strong>{summary?.collectionIntakeMetrics.receivedAwaitingProcessing ?? 0}</strong>
                  {(summary?.collectionIntakeMetrics.receivedAwaitingProcessing ?? 0) > 0 && (
                    <button
                      onClick={() => setSubTab('intake')}
                      className="ml-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 underline cursor-pointer"
                    >
                      Process Intake →
                    </button>
                  )}
                </span>
              </div>
            </div>

            <div className="border-l-4 border-blue-600 pl-3 flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Authoritative Internal Inventory Isolation
                </h4>
                <p className="text-xs text-slate-600 mt-1">
                  {summary?.externalDirectoryNote || 'Local inventory is calculated strictly from component-level records. External directory snapshots do not inflate internal totals.'}
                </p>
              </div>
              <div className="mt-3">
                <button
                  onClick={handleRunExpirySweep}
                  disabled={sweepingLoading || isAuditor}
                  className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-[#B91C32] border border-red-200 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                >
                  {sweepingLoading ? 'Sweeping...' : '⏱ Run Automated Expiry Sweep'}
                </button>
              </div>
            </div>
          </div>

          {/* Intake Queue Quick Alert */}
          {intakeUnits.length > 0 && (
            <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-lg shrink-0">
                  🩸
                </div>
                <div>
                  <h4 className="text-xs font-bold text-amber-900">
                    {intakeUnits.length} Received Whole-Blood Unit{intakeUnits.length === 1 ? '' : 's'} Awaiting Component Fractionation
                  </h4>
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    Source whole-blood collection bags have been reconciled and are ready for component separation (PRBC, FFP, Platelets) in the Intake Queue.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSubTab('intake')}
                className="px-3.5 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0 shadow-xs"
              >
                Open Intake Queue ({intakeUnits.length}) →
              </button>
            </div>
          )}

          {/* Component Inventory Table */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Authorised Component Inventory Units</h3>
                <p className="text-xs text-slate-500">Unit-level storage, clinical release provenance, and shelf-life tracking</p>
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-hidden"
                >
                  <option value="">All Statuses</option>
                  <option value="AVAILABLE">AVAILABLE (Released)</option>
                  <option value="QUARANTINED">QUARANTINED</option>
                  <option value="AWAITING_CLINICAL_REVIEW">AWAITING REVIEW</option>
                  <option value="AWAITING_TESTING">AWAITING TESTING</option>
                  <option value="EXPIRED">EXPIRED</option>
                  <option value="ISSUED">ISSUED</option>
                  <option value="DISCARDED">DISCARDED</option>
                </select>

                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-hidden"
                >
                  <option value="">All Component Types</option>
                  <option value="PRBC">PRBC (Red Cells)</option>
                  <option value="FRESH_FROZEN_PLASMA">FFP (Plasma)</option>
                  <option value="PLATELET_CONCENTRATE">Platelets</option>
                  <option value="CRYOPRECIPITATE">Cryoprecipitate</option>
                  <option value="WHOLE_BLOOD">Whole Blood</option>
                </select>

                <input
                  type="text"
                  placeholder="Search Component Code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadComponents()}
                  className="text-xs px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-hidden"
                />

                <button
                  onClick={loadComponents}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Filter
                </button>
              </div>
            </div>

            {loadingComponents ? (
              <div className="py-12 text-center text-xs text-slate-500 font-semibold">
                Loading component units...
              </div>
            ) : components.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 font-medium">
                No component units match the current filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-3">Component Code</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Group</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Storage Location</th>
                      <th className="py-2.5 px-3">Expiry</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                    {components.map((comp) => {
                      const isPast = mountedTime !== null ? new Date(comp.expiresAt).getTime() <= mountedTime : false;
                      return (
                        <tr key={comp.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                            {comp.componentCode}
                            {comp.isHold && (
                              <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900">
                                ⚠ HOLD
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800">
                            {comp.componentType.replace(/_/g, ' ')}
                            {comp.volumeMl && <span className="text-[10px] text-slate-500 block">{comp.volumeMl} ml</span>}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-800">
                              {comp.bloodGroup}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                comp.status === 'AVAILABLE'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : comp.status === 'QUARANTINED'
                                  ? 'bg-amber-100 text-amber-800'
                                  : comp.status === 'EXPIRED'
                                  ? 'bg-red-100 text-red-800'
                                  : comp.status === 'ISSUED'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {comp.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {comp.storageLocation ? (
                              <div>
                                <span className="font-semibold text-slate-900">{comp.storageLocation.name}</span>
                                <span className="text-[10px] text-slate-500 block">({comp.storageLocation.locationCode})</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Unassigned</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={isPast ? 'text-red-700 font-bold' : 'text-slate-700'}>
                              {new Date(comp.expiresAt).toLocaleDateString()}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Clinical Release Button */}
                              {comp.status !== 'AVAILABLE' && comp.status !== 'ISSUED' && comp.status !== 'DISCARDED' && (
                                <button
                                  onClick={() => handleOpenReleaseReview(comp)}
                                  className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold cursor-pointer"
                                  title="Review laboratory tests and authorize clinical release"
                                >
                                  ⚖ Review Release
                                </button>
                              )}

                              {/* Record Lab Test */}
                              <button
                                onClick={() => {
                                  setTestTargetComp(comp);
                                  setShowRecordTestModal(true);
                                }}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
                                title="Record laboratory test results"
                              >
                                🔬 Lab Test
                              </button>

                              {/* Move Storage */}
                              <button
                                onClick={() => {
                                  setMovingComponent(comp);
                                  setMoveDestLocationId(storageLocations[0]?.id || '');
                                }}
                                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded-lg text-xs font-bold cursor-pointer"
                                title="Relocate to different cold-room or shelf"
                              >
                                ❄ Move
                              </button>

                              {/* Disposition */}
                              {comp.status !== 'ISSUED' && comp.status !== 'DISCARDED' && (
                                <button
                                  onClick={() => {
                                    setDispositionComp(comp);
                                    setDispositionType(isPast ? 'DISCARDED_EXPIRED' : 'ISSUED');
                                  }}
                                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
                                  title="Record issuance or clinical disposal"
                                >
                                  📦 Disposition
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUBTAB: INTAKE & COMPONENT PROCESSING QUEUE */}
      {subTab === 'intake' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">Physical Whole-Blood Intake &amp; Processing Queue</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  {intakeUnits.length} Received Bag{intakeUnits.length === 1 ? '' : 's'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Physical collection units reconciled and accepted into this blood bank. Authorised staff can fractionate whole blood into traceable components (PRBC, FFP, Platelets) prior to clinical testing.
              </p>
            </div>
            {!canDeriveComponents && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5 text-xs text-amber-900 font-semibold shrink-0">
                🛡 Note: Logged in as {userRole}. Only INVENTORY_STAFF, CLINICAL_STAFF, or ORG_ADMIN can derive components.
              </div>
            )}
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="flex gap-2 w-full sm:w-auto flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search by unit number or bag barcode..."
                value={intakeSearch}
                onChange={(e) => setIntakeSearch(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50"
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={intakeGroupFilter}
                onChange={(e) => setIntakeGroupFilter(e.target.value)}
                className="text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700"
              >
                <option value="">All Blood Groups</option>
                <option value="A_POS">A+</option>
                <option value="A_NEG">A-</option>
                <option value="B_POS">B+</option>
                <option value="B_NEG">B-</option>
                <option value="AB_POS">AB+</option>
                <option value="AB_NEG">AB-</option>
                <option value="O_POS">O+</option>
                <option value="O_NEG">O-</option>
              </select>
              <button
                onClick={loadIntakeUnits}
                disabled={loadingIntake}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                title="Refresh intake queue"
              >
                {loadingIntake ? 'Refreshing...' : '↻ Refresh'}
              </button>
            </div>
          </div>

          {/* Table */}
          {loadingIntake ? (
            <div className="py-12 text-center text-xs text-slate-500 font-semibold">
              Loading received collection units...
            </div>
          ) : filteredIntakeUnits.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 font-medium bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              <span className="text-2xl block mb-2">🩸</span>
              No collection units currently awaiting processing.
              <p className="text-[11px] text-slate-400 mt-1">
                When physical handover manifests from camps or drives are reconciled, accepted blood collection bags appear here for component separation.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                    <th className="p-3">Source Unit Number</th>
                    <th className="p-3">Blood Group</th>
                    <th className="p-3">Volume</th>
                    <th className="p-3">Intake Origin / Camp</th>
                    <th className="p-3">Intake Status</th>
                    <th className="p-3">Collected Date</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredIntakeUnits.map((unit) => (
                    <tr key={unit.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3">
                        <div className="font-mono font-bold text-slate-900">{unit.unitNumber}</div>
                        {unit.bagIdentifier && (
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">Bag: {unit.bagIdentifier}</div>
                        )}
                        <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 uppercase">
                          Source Whole Blood Bag
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-bold text-[#B91C32] px-2 py-0.5 rounded-full bg-red-50 border border-red-100">
                          {unit.bloodGroup.replace('_POS', '+').replace('_NEG', '-')}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-slate-700">
                        {unit.volumeMl || 450} mL
                      </td>
                      <td className="p-3 text-slate-600">
                        {unit.camp ? (
                          <div>
                            <div className="font-medium text-slate-800">{unit.camp.title}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{unit.camp.campCode}</div>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Blood Bank Direct Intake</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          RECEIVED_BY_CENTRE
                        </span>
                        <div className="text-[9px] text-slate-400 mt-0.5">Awaiting Fractionation</div>
                      </td>
                      <td className="p-3 text-slate-500 text-[11px]">
                        {new Date(unit.collectedAt).toLocaleString([], {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canDeriveComponents ? (
                            <button
                              onClick={() => {
                                setDerivingUnit(unit);
                                setDerivationRecipe('TRIPLE_BAG');
                                setDerivationReason('Standard refrigerated centrifuge fractionation');
                                setActionError(null);
                              }}
                              className="px-3 py-1.5 bg-[#B91C32] hover:bg-[#9B1324] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs flex items-center gap-1"
                              title="Fractionate into PRBC, FFP, Platelets, etc."
                            >
                              <span>⚗ Fractionate Components</span>
                            </button>
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-400 px-2 py-1 bg-slate-100 rounded-lg">
                              Read-Only Intake
                            </span>
                          )}

                          {canRecordLab && (
                            <button
                              onClick={() => {
                                setTestTargetCollectionUnit(unit);
                                setTestTargetComp(null);
                                setShowRecordTestModal(true);
                              }}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                              title="Record pilot tube laboratory test directly on this collection unit"
                            >
                              🔬 Pilot Test
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB B: FRACTIONATE & DERIVE BLOOD COMPONENTS */}
      {subTab === 'fractionate' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">Fractionate &amp; Derive Blood Components</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-[#B91C32]">
                  {intakeUnits.length} Eligible Bag{intakeUnits.length === 1 ? '' : 's'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Centrifuge separation workspace for whole-blood collection units. Convert whole blood into sterile, traceable components (PRBC, FFP, Platelets, Cryoprecipitate) under validated NBTC protocols.
              </p>
            </div>
            {!canDeriveComponents && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5 text-xs text-amber-900 font-semibold shrink-0">
                🛡 Note: Logged in as {userRole}. Only INVENTORY_STAFF, CLINICAL_STAFF, or ORG_ADMIN can fractionate units.
              </div>
            )}
          </div>

          {/* Clinical Protocol Standards Notice */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5">
              <span>🛡</span>
              <span>Quarantine &amp; Traceability Requirements</span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              • Newly derived components are created in <strong>QUARANTINED</strong> status and cannot be released or issued until pilot-tube laboratory screening (HIV, HCV, HBsAg, Syphilis, Malaria) and ABO/Rh grouping are complete, non-reactive, and clinically verified.
              <br />
              • Component yield volumes are validated against parent bag collection volume. Component derivation maintains ISBT-128 barcode lineage from donor donation event.
            </p>
          </div>

          {/* Eligible Units Table */}
          {loadingIntake ? (
            <div className="py-12 text-center text-xs text-slate-500 font-semibold">
              Loading eligible whole-blood units...
            </div>
          ) : intakeUnits.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 font-medium bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              <span className="text-2xl block mb-2">⚗</span>
              No collection units currently eligible or awaiting component fractionation.
              <p className="text-[11px] text-slate-400 mt-1">
                Accepted whole-blood collection units from camps or centre intake appear here for centrifuge processing.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                    <th className="p-3">Source Bag Number</th>
                    <th className="p-3">Blood Group</th>
                    <th className="p-3">Nominal Volume</th>
                    <th className="p-3">Collection Source</th>
                    <th className="p-3">Processing Status</th>
                    <th className="p-3">Collection Time</th>
                    <th className="p-3 text-right">Derivation Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {intakeUnits.map((unit) => (
                    <tr key={unit.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="p-3">
                        <div className="font-mono font-bold text-slate-900">{unit.unitNumber}</div>
                        {unit.bagIdentifier && (
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">Bag: {unit.bagIdentifier}</div>
                        )}
                        <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 uppercase">
                          Whole Blood Bag
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-bold text-[#B91C32] px-2 py-0.5 rounded-full bg-red-50 border border-red-100">
                          {unit.bloodGroup.replace('_POS', '+').replace('_NEG', '-')}
                        </span>
                      </td>
                      <td className="p-3 font-mono text-slate-700">
                        {unit.volumeMl || 450} mL
                      </td>
                      <td className="p-3 text-slate-600">
                        {unit.camp ? (
                          <div>
                            <div className="font-medium text-slate-800">{unit.camp.title}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{unit.camp.campCode}</div>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Centre Direct Intake</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                          Ready for Fractionation
                        </span>
                        <div className="text-[9px] text-slate-400 mt-0.5">Within processing window</div>
                      </td>
                      <td className="p-3 text-slate-500 text-[11px]">
                        {new Date(unit.collectedAt).toLocaleString([], {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => {
                            setDerivingUnit(unit);
                            setDerivationRecipe('TRIPLE_BAG');
                            setDerivationReason('Standard refrigerated centrifuge fractionation');
                            setActionError(null);
                          }}
                          disabled={!canDeriveComponents}
                          className="px-3.5 py-1.5 bg-[#B91C32] hover:bg-[#9B1324] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                          title="Open dedicated fractionation form"
                        >
                          <span>⚗</span>
                          <span>Fractionate Unit</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB D: CLINICAL RELEASE QUEUE */}
      {subTab === 'release' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-200 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Clinical Release Queue &amp; Verification Gate</h3>
              <p className="text-xs text-slate-500">
                Components awaiting clinical authorisation. All 6 mandatory tests must be completed and non-reactive before release into available stock.
              </p>
            </div>
            {!isDesignatedClinicalStaff && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5 text-xs text-amber-900 font-semibold">
                🛡 Note: Logged in as {userRole}. Only designated CLINICAL_STAFF can execute release.
              </div>
            )}
          </div>

          <div className="divide-y divide-slate-100">
            {queueComponents.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 font-medium bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                <span className="text-2xl block mb-2">⚖</span>
                No blood components are currently in the clinical release queue.
                <p className="text-[11px] text-slate-400 mt-1">
                  Components derived from accepted donations awaiting TTI lab clearance or safety review will appear here.
                </p>
              </div>
            ) : (
              queueComponents.map((comp) => (
                <div key={comp.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900 text-xs">{comp.componentCode}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-800">
                        {comp.componentType} ({comp.bloodGroup})
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        {comp.status}
                      </span>
                      {comp.isHold && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-100 text-red-900">
                          HOLD: {comp.holdReason}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Derived on {new Date(comp.derivedAt).toLocaleDateString()} • Expires: {new Date(comp.expiresAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div>
                    <button
                      onClick={() => handleOpenReleaseReview(comp)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      ⚖ Evaluate &amp; Release Decision
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SUBTAB C: LABORATORY RECORDS */}
      {subTab === 'lab' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">Laboratory Screening &amp; Immunohematology Records</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                  {labTests.length} Recorded Test{labTests.length === 1 ? '' : 's'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Centralised laboratory screening for Whole-Blood pilot tubes and fractionated components. Verified non-reactive results are required for clinical release.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canRecordLab && (
                <button
                  onClick={() => {
                    setTestTargetComp(components[0] || null);
                    setTestTargetCollectionUnit(intakeUnits[0] || null);
                    setShowRecordTestModal(true);
                  }}
                  className="px-3.5 py-1.5 bg-[#B91C32] hover:bg-[#9B1324] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs flex items-center gap-1"
                >
                  <span>+</span>
                  <span>Record Test Result</span>
                </button>
              )}
              <button
                onClick={loadLabTests}
                disabled={loadingLabTests}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                {loadingLabTests ? 'Refreshing...' : '↻ Refresh'}
              </button>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row gap-2.5 items-center justify-between flex-wrap">
            <div className="flex gap-2 w-full sm:w-auto flex-1 max-w-md">
              <input
                type="text"
                placeholder="Search test, unit number, component barcode, or analyzer..."
                value={labSearch}
                onChange={(e) => setLabSearch(e.target.value)}
                className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/50"
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
              <select
                value={labCategoryFilter}
                onChange={(e) => setLabCategoryFilter(e.target.value)}
                className="text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700"
              >
                <option value="">All Test Categories</option>
                <option value="TTI_SCREENING">TTI Screening</option>
                <option value="BLOOD_GROUPING">Blood Grouping</option>
                <option value="ANTIBODY_SCREENING">Antibody Screening</option>
                <option value="COMPONENT_QC">Component QC</option>
              </select>

              <select
                value={labOutcomeFilter}
                onChange={(e) => setLabOutcomeFilter(e.target.value)}
                className="text-xs px-3 py-2 rounded-xl border border-slate-200 bg-white font-semibold text-slate-700"
              >
                <option value="">All Result Outcomes</option>
                <option value="NON_REACTIVE">NON_REACTIVE (Passed)</option>
                <option value="REACTIVE">REACTIVE (Positive / Alert)</option>
                <option value="INDETERMINATE">INDETERMINATE</option>
                <option value="CONFIRMED_POSITIVE">CONFIRMED_POSITIVE</option>
              </select>
            </div>
          </div>

          {/* Mandatory NBTC Panel Quick Legend */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {[
              { type: 'HIV_ANTIBODY', label: 'HIV 1/2 ELISA', desc: 'Mandatory TTI' },
              { type: 'HCV_ANTIBODY', label: 'HCV Antibody', desc: 'Mandatory TTI' },
              { type: 'HBSAG', label: 'HBsAg Antigen', desc: 'Mandatory TTI' },
              { type: 'SYPHILIS_RPR', label: 'Syphilis RPR', desc: 'Mandatory TTI' },
              { type: 'MALARIA_ANTIGEN', label: 'Malaria Pan/Pf', desc: 'Mandatory TTI' },
              { type: 'ABO_RH_CONFIRMATION', label: 'ABO/Rh Confirm', desc: 'Mandatory Typing' },
            ].map((p) => {
              const count = labTests.filter((t) => t.testType === p.type && t.resultOutcome === 'NON_REACTIVE').length;
              return (
                <div key={p.type} className="border border-slate-200 rounded-xl p-2.5 bg-slate-50/60">
                  <div className="text-[10px] font-mono font-bold text-slate-500 uppercase">{p.type}</div>
                  <div className="text-xs font-bold text-slate-800 mt-0.5">{p.label}</div>
                  <div className="text-[10px] text-emerald-700 font-semibold mt-1">
                    ✓ {count} Non-reactive
                  </div>
                </div>
              );
            })}
          </div>

          {/* Laboratory Test Records Table */}
          {loadingLabTests ? (
            <div className="py-12 text-center text-xs text-slate-500 font-semibold">
              Loading laboratory test records...
            </div>
          ) : labTests.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 font-medium bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              <span className="text-2xl block mb-2">🔬</span>
              No laboratory test records recorded yet for this blood bank.
              <p className="text-[11px] text-slate-400 mt-1">
                Record TTI screening or ABO/Rh grouping results for whole blood collection pilot tubes or fractionated components.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                    <th className="p-3">Test &amp; Category</th>
                    <th className="p-3">Target Unit / Sample Association</th>
                    <th className="p-3">Result Outcome</th>
                    <th className="p-3">Reading &amp; Range</th>
                    <th className="p-3">Performed By &amp; Date</th>
                    <th className="p-3">Clinical Verification</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {labTests
                    .filter((t) => {
                      if (labCategoryFilter && t.category !== labCategoryFilter) return false;
                      if (labOutcomeFilter && t.resultOutcome !== labOutcomeFilter) return false;
                      if (labSearch.trim()) {
                        const q = labSearch.toLowerCase();
                        const matchType = t.testType.toLowerCase().includes(q);
                        const matchCat = t.category.toLowerCase().includes(q);
                        const matchUnit = t.collectionUnit?.unitNumber.toLowerCase().includes(q);
                        const matchComp = t.componentUnit?.componentCode.toLowerCase().includes(q);
                        const matchNotes = t.notes ? t.notes.toLowerCase().includes(q) : false;
                        if (!matchType && !matchCat && !matchUnit && !matchComp && !matchNotes) return false;
                      }
                      return true;
                    })
                    .map((test) => (
                      <tr key={test.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3">
                          <div className="font-bold text-slate-900">{test.testName || test.testType.replace(/_/g, ' ')}</div>
                          <div className="text-[10px] font-mono text-slate-500 uppercase mt-0.5">{test.category}</div>
                        </td>
                        <td className="p-3">
                          {test.collectionUnit ? (
                            <div>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-100">
                                PILOT TUBE (Parent Bag)
                              </span>
                              <div className="font-mono font-bold text-slate-800 text-[11px] mt-1">
                                {test.collectionUnit.unitNumber}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {test.collectionUnit.bloodGroup} • {test.collectionUnit.volumeMl} mL
                              </div>
                            </div>
                          ) : test.componentUnit ? (
                            <div>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-100">
                                COMPONENT UNIT
                              </span>
                              <div className="font-mono font-bold text-slate-800 text-[11px] mt-1">
                                {test.componentUnit.componentCode}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {test.componentUnit.componentType} • {test.componentUnit.bloodGroup}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">General Laboratory Sample</span>
                          )}
                        </td>
                        <td className="p-3">
                          {test.resultOutcome === 'NON_REACTIVE' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              ✓ NON-REACTIVE
                            </span>
                          )}
                          {test.resultOutcome === 'REACTIVE' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                              ⚠ REACTIVE
                            </span>
                          )}
                          {test.resultOutcome === 'INDETERMINATE' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                              ? INDETERMINATE
                            </span>
                          )}
                          {test.resultOutcome === 'CONFIRMED_POSITIVE' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-900 text-white">
                              ✕ POSITIVE
                            </span>
                          )}
                          {!test.resultOutcome && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                              {test.status}
                            </span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-[11px] text-slate-700">
                          {test.quantitativeValue || '—'}
                          {test.referenceRange && (
                            <div className="text-[9px] text-slate-400 font-sans mt-0.5">Ref: {test.referenceRange}</div>
                          )}
                        </td>
                        <td className="p-3 text-[11px]">
                          <div className="font-medium text-slate-800">
                            {test.performedBy?.name || 'Authorized Technician'}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {test.performedAt ? new Date(test.performedAt).toLocaleDateString() : '—'}
                          </div>
                        </td>
                        <td className="p-3">
                          {test.verifiedAt ? (
                            <div>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1 w-max">
                                <span>✓</span>
                                <span>Verified</span>
                              </span>
                              <div className="text-[9px] text-slate-500 mt-0.5">
                                By {test.verifiedBy?.name || 'Clinical Staff'}
                              </div>
                            </div>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              ⏳ Pending Clinical Verification
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          {!test.verifiedAt && isDesignatedClinicalStaff && (
                            <button
                              onClick={() => {
                                setTargetVerifyRecord(test);
                                setVerificationNotes('Result confirmed against certified laboratory run log.');
                                setShowVerifyModal(true);
                              }}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs"
                              title="Clinically verify this laboratory record"
                            >
                              Verify
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SUBTAB 4: STORAGE & COLD CHAIN */}
      {subTab === 'storage' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Validated Storage Equipment & Cold Chain Locations</h3>
                <p className="text-xs text-slate-500">
                  Calibrated blood bank refrigerators (+2°C to +6°C), deep freezers (≤ -30°C), and platelet agitators (+20°C to +24°C)
                </p>
              </div>

              {!isAuditor && (
                <button
                  onClick={() => setShowCreateLocationModal(true)}
                  className="px-3.5 py-2 bg-[#B91C32] hover:bg-[#9B1324] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  + Add Storage Location
                </button>
              )}
            </div>

            {loadingLocations ? (
              <div className="py-8 text-center text-xs text-slate-500 font-semibold">Loading storage locations...</div>
            ) : storageLocations.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 font-medium">
                No storage locations configured yet. Add your first cold room or freezer above.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {storageLocations.map((loc) => (
                  <div key={loc.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold px-2 py-0.5 bg-slate-200 rounded-md text-slate-800">
                        {loc.locationCode}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                        {loc.targetTempRange}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-slate-900 mt-2">{loc.name}</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">{loc.storageType.replace(/_/g, ' ')}</p>
                    <div className="mt-3 pt-2 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                      <span>Stored Components:</span>
                      <span className="font-bold text-slate-900">{loc._count?.components ?? 0}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: ADD STORAGE LOCATION */}
      {showCreateLocationModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-hidden">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 flex flex-col max-h-[calc(100vh-2.5rem)] overflow-hidden">
            {/* Pinned Sticky Header */}
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white">
              <div>
                <h3 className="text-base font-bold text-slate-900">Configure Storage Location</h3>
                <p className="text-xs text-slate-500">
                  Calibrated refrigerator, deep freezer, or platelet agitator
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateLocationModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateLocation} className="flex flex-col flex-1 min-h-0">
              {/* Independently Scrollable Body */}
              <div className="p-5 overflow-y-auto flex-1 space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Location Code *</label>
                  <input
                    type="text"
                    placeholder="e.g. COLD-01, FREEZER-A"
                    value={newLocCode}
                    onChange={(e) => setNewLocCode(e.target.value)}
                    required
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Equipment / Location Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Main Cold Room Refrigerator 1"
                    value={newLocName}
                    onChange={(e) => setNewLocName(e.target.value)}
                    required
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Storage Equipment Type</label>
                  <select
                    value={newLocType}
                    onChange={(e) => setNewLocType(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                  >
                    <option value="BLOOD_BANK_REFRIGERATOR">Blood Bank Refrigerator (+2°C to +6°C)</option>
                    <option value="DEEP_FREEZER">Deep Freezer (≤ -30°C)</option>
                    <option value="PLATELET_AGITATOR">Platelet Agitator (+20°C to +24°C)</option>
                    <option value="QUARANTINE_STORAGE">Quarantine Storage</option>
                    <option value="DISPOSITION_HOLD">Disposition Hold</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Target Temperature Range *</label>
                  <input
                    type="text"
                    placeholder="e.g. +2°C to +6°C"
                    value={newLocTempRange}
                    onChange={(e) => setNewLocTempRange(e.target.value)}
                    required
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Room / Area</label>
                  <input
                    type="text"
                    placeholder="e.g. Component Laboratory Room 2"
                    value={newLocArea}
                    onChange={(e) => setNewLocArea(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                  />
                </div>
              </div>

              {/* Pinned Sticky Footer */}
              <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0 bg-slate-50/80">
                <button
                  type="button"
                  onClick={() => setShowCreateLocationModal(false)}
                  className="py-2 px-4 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingLocationLoading}
                  className="py-2 px-5 bg-[#B91C32] hover:bg-[#9B1324] text-white font-bold text-xs rounded-xl disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {creatingLocationLoading ? 'Saving...' : 'Save Location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: MOVE COMPONENT */}
      {movingComponent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-hidden">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 flex flex-col max-h-[calc(100vh-2.5rem)] overflow-hidden">
            {/* Pinned Sticky Header */}
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white">
              <div>
                <h3 className="text-base font-bold text-slate-900">Record Storage Movement</h3>
                <p className="text-xs text-slate-500">
                  Component <strong className="text-slate-900 font-mono">{movingComponent.componentCode}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMovingComponent(null)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleMoveComponent} className="flex flex-col flex-1 min-h-0">
              {/* Independently Scrollable Body */}
              <div className="p-5 overflow-y-auto flex-1 space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Destination Location *</label>
                  <select
                    value={moveDestLocationId}
                    onChange={(e) => setMoveDestLocationId(e.target.value)}
                    required
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                  >
                    {storageLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} ({loc.locationCode}) - {loc.targetTempRange}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Observed Temperature (°C) *</label>
                  <input
                    type="number"
                    step="0.1"
                    value={moveObservedTemp}
                    onChange={(e) => setMoveObservedTemp(parseFloat(e.target.value))}
                    required
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                  />
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={moveExcursionNoted}
                      onChange={(e) => setMoveExcursionNoted(e.target.checked)}
                      className="rounded text-amber-600 focus:ring-amber-500"
                    />
                    <span className="text-xs font-bold text-amber-900">
                      Flag Temperature Excursion Observed
                    </span>
                  </label>
                  {moveExcursionNoted && (
                    <p className="text-[11px] text-amber-800 mt-1 font-medium">
                      ⚠ Warning: Flagging an excursion will immediately place this component under mandatory QUARANTINE HOLD.
                    </p>
                  )}
                </div>

                {moveExcursionNoted && (
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Excursion Notes *</label>
                    <textarea
                      rows={2}
                      placeholder="Describe cold-chain breach, duration, and corrective action..."
                      value={moveExcursionNotes}
                      onChange={(e) => setMoveExcursionNotes(e.target.value)}
                      required
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Movement Reason *</label>
                  <input
                    type="text"
                    value={moveReason}
                    onChange={(e) => setMoveReason(e.target.value)}
                    required
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                  />
                </div>
              </div>

              {/* Pinned Sticky Footer */}
              <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0 bg-slate-50/80">
                <button
                  type="button"
                  onClick={() => setMovingComponent(null)}
                  className="py-2 px-4 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={movingLoading}
                  className="py-2 px-5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {movingLoading ? 'Saving...' : 'Record Movement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: RECORD LAB TEST */}
      {showRecordTestModal && (testTargetComp || testTargetCollectionUnit) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-hidden">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 flex flex-col max-h-[calc(100vh-2.5rem)] overflow-hidden">
            {/* Pinned Sticky Header */}
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Record Lab Test {testTargetCollectionUnit ? '(Collection Bag)' : '(Component)'}
                </h3>
                <p className="text-xs text-slate-500">
                  Target: <strong className="text-slate-900 font-mono">
                    {testTargetCollectionUnit ? testTargetCollectionUnit.unitNumber : testTargetComp?.componentCode}
                  </strong>
                  {testTargetCollectionUnit
                    ? ` (${testTargetCollectionUnit.bloodGroup})`
                    : ` (${testTargetComp?.componentType}, ${testTargetComp?.bloodGroup})`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowRecordTestModal(false);
                  setTestTargetComp(null);
                  setTestTargetCollectionUnit(null);
                }}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg text-lg leading-none cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordLabTest} className="flex flex-col flex-1 min-h-0">
              {/* Independently Scrollable Body */}
              <div className="p-5 overflow-y-auto flex-1 space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Test Category</label>
                  <select
                    value={testCategory}
                    onChange={(e) => setTestCategory(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                  >
                    <option value="TTI_SCREENING">TTI Screening (Infectious Diseases)</option>
                    <option value="BLOOD_GROUPING">Blood Grouping &amp; Typing</option>
                    <option value="ANTIBODY_SCREENING">Antibody Screening</option>
                    <option value="COMPONENT_QC">Component Quality Control</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Test Type *</label>
                  <select
                    value={testType}
                    onChange={(e) => setTestType(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                  >
                    <option value="HIV_ANTIBODY">HIV 1/2 Antibody / Antigen</option>
                    <option value="HCV_ANTIBODY">HCV Antibody</option>
                    <option value="HBSAG">Hepatitis B Surface Antigen (HBsAg)</option>
                    <option value="SYPHILIS_RPR">Syphilis RPR</option>
                    <option value="MALARIA_ANTIGEN">Malaria Antigen</option>
                    <option value="ABO_RH_CONFIRMATION">ABO / Rh Confirmation Grouping</option>
                    <option value="COMPONENT_VOLUME">Component Volume QC</option>
                    <option value="PLATELET_YIELD">Platelet Yield QC</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Result Outcome *</label>
                  <select
                    value={testOutcome}
                    onChange={(e) => setTestOutcome(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                  >
                    <option value="NON_REACTIVE">NON_REACTIVE (Negative / Passed)</option>
                    <option value="REACTIVE">REACTIVE (Positive / Alert)</option>
                    <option value="INDETERMINATE">INDETERMINATE</option>
                    <option value="CONFIRMED_POSITIVE">CONFIRMED_POSITIVE</option>
                    <option value="NOT_APPLICABLE">NOT_APPLICABLE</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Quantitative Reading</label>
                    <input
                      type="text"
                      placeholder="e.g. 0.12 S/CO"
                      value={testQuantValue}
                      onChange={(e) => setTestQuantValue(e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Reference Range</label>
                    <input
                      type="text"
                      placeholder="e.g. < 1.0 Non-reactive"
                      value={testRefRange}
                      onChange={(e) => setTestRefRange(e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Notes / Analyzer Reference</label>
                  <input
                    type="text"
                    placeholder="e.g. Abbott Architect run #412"
                    value={testNotes}
                    onChange={(e) => setTestNotes(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                  />
                </div>
              </div>

              {/* Pinned Sticky Footer */}
              <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0 bg-slate-50/80">
                <button
                  type="button"
                  onClick={() => {
                    setShowRecordTestModal(false);
                    setTestTargetComp(null);
                    setTestTargetCollectionUnit(null);
                  }}
                  className="py-2 px-4 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={recordingTestLoading}
                  className="py-2 px-5 bg-[#B91C32] hover:bg-[#9B1324] text-white font-bold text-xs rounded-xl disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {recordingTestLoading ? 'Saving...' : 'Save Result'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: CLINICAL RELEASE REVIEW */}
      {releasingComp && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Pinned Sticky Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between shrink-0 bg-white">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>🔬</span> Clinical Release Review & Decision
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Component <strong className="text-slate-900 font-mono">{releasingComp.componentCode}</strong> ({releasingComp.componentType}, {releasingComp.bloodGroup}).
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReleasingComp(null);
                  setReleaseEligibility(null);
                }}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors"
                title="Close modal"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
              {loadingEligibility ? (
                <div className="py-12 text-center text-xs text-slate-500 font-semibold flex flex-col items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-emerald-600 border-t-transparent"></div>
                  Checking mandatory laboratory test completeness & pilot tube records...
                </div>
              ) : releaseEligibility ? (
                <form id="clinical-release-form" onSubmit={handleSubmitClinicalRelease} className="space-y-4">
                  {/* Mandatory Checklist Status */}
                  <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/80">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        Mandatory TTI & Grouping Panel Status
                      </h4>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        releaseEligibility.isEligibleForRelease
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {releaseEligibility.isEligibleForRelease ? '✓ ALL CHECKS SATISFIED' : '⚠ CHECKS INCOMPLETE'}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {releaseEligibility.mandatoryRequirements.allMandatoryRequired.map((test) => {
                        const passed = releaseEligibility.mandatoryRequirements.passedTests.some((p) => p.testType === test);
                        const pending = releaseEligibility.mandatoryRequirements.pendingTests.includes(test);
                        const reactive = releaseEligibility.mandatoryRequirements.reactiveOrFailedTests.some((r) => r.testType === test);
                        const missing = releaseEligibility.mandatoryRequirements.missingTests.includes(test);

                        return (
                          <div key={test} className="flex items-center justify-between text-xs py-1.5 px-2 bg-white rounded-lg border border-slate-100">
                            <span className="font-semibold text-slate-700">{test.replace(/_/g, ' ')}</span>
                            {passed && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1">
                                <span>✓</span> NON-REACTIVE
                              </span>
                            )}
                            {pending && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 flex items-center gap-1">
                                <span>⏳</span> PENDING
                              </span>
                            )}
                            {reactive && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 flex items-center gap-1">
                                <span>⚠</span> REACTIVE
                              </span>
                            )}
                            {missing && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 flex items-center gap-1">
                                <span>✕</span> MISSING
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Blocking reasons if not eligible */}
                  {!releaseEligibility.isEligibleForRelease && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 text-xs text-red-900">
                      <p className="font-bold flex items-center gap-1.5 mb-1.5">
                        <span>🚫</span> Release to AVAILABLE is Blocked:
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-[11px] text-red-800 font-medium">
                        {releaseEligibility.blockingReasons.map((b, i) => (
                          <li key={i}>{b}</li>
                        ))}
                      </ul>
                      <p className="text-[10px] text-red-700 mt-2 italic font-normal">
                        Per NBTC safety rules, missing lab results are never presumed negative. Clinical clearance cannot be granted until all mandatory screening tests are verified non-reactive.
                      </p>
                    </div>
                  )}

                  {/* Authority warning if NOT CLINICAL_STAFF */}
                  {!isDesignatedClinicalStaff && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
                      <p className="font-bold flex items-center gap-1">
                        <span>🛡</span> Clinical Authority Restricted
                      </p>
                      <p className="text-[11px] text-amber-800 mt-0.5">
                        Signed in as <strong>{userRole}</strong>. In accordance with NBTC and drug safety guidelines,
                        clinical release requires designated <strong>CLINICAL_STAFF</strong> authority. Organisation Administrator credentials alone cannot bypass this gate.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Clinical Decision *</label>
                    <select
                      value={releaseDecision}
                      onChange={(e: any) => setReleaseDecision(e.target.value)}
                      className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 font-medium focus:ring-2 focus:ring-emerald-500 bg-white"
                    >
                      <option
                        value="RELEASED"
                        disabled={!releaseEligibility.isEligibleForRelease || !isDesignatedClinicalStaff}
                      >
                        {releaseEligibility.isEligibleForRelease && isDesignatedClinicalStaff
                          ? 'RELEASED (Release to AVAILABLE stock)'
                          : 'RELEASED — Blocked: Panel incomplete or unauthorized'}
                      </option>
                      <option value="QUARANTINE_HOLD">QUARANTINE_HOLD (Place under investigative hold)</option>
                      <option value="WITHHELD">WITHHELD (Withhold for repeat testing)</option>
                      <option value="DISCARD_ORDERED">DISCARD_ORDERED (Order clinical disposal)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Clinical Release Protocol Reference</label>
                    <input
                      type="text"
                      placeholder="e.g. NBTC-SOP-REL-2026/04"
                      value={releaseProtocolRef}
                      onChange={(e) => setReleaseProtocolRef(e.target.value)}
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Clinical Review Reason / Notes *</label>
                    <textarea
                      rows={2}
                      placeholder="Required clinical justification for this release or hold decision..."
                      value={releaseReason}
                      onChange={(e) => setReleaseReason(e.target.value)}
                      required
                      className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                    />
                  </div>
                </form>
              ) : null}
            </div>

            {/* Pinned Sticky Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-100 flex gap-2 shrink-0 bg-slate-50/90">
              <button
                type="button"
                onClick={() => {
                  setReleasingComp(null);
                  setReleaseEligibility(null);
                }}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="clinical-release-form"
                disabled={
                  releasingLoading ||
                  (releaseDecision === 'RELEASED' && (!releaseEligibility?.isEligibleForRelease || !isDesignatedClinicalStaff))
                }
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-xs"
              >
                {releasingLoading ? 'Executing Decision...' : 'Execute Decision'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: AUTHORISED DISPOSITION */}
      {dispositionComp && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Pinned Sticky Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between shrink-0 bg-white">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>🗑</span> Authorised Disposition
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Record authorised issue or clinical disposal for <strong className="text-slate-900 font-mono">{dispositionComp.componentCode}</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDispositionComp(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors"
                title="Close modal"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3.5">
              <form id="disposition-form" onSubmit={handleRecordDisposition} className="space-y-3.5">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Disposition Type *</label>
                  <select
                    value={dispositionType}
                    onChange={(e) => setDispositionType(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 font-medium bg-white"
                  >
                    <option value="ISSUED">ISSUED (Dispensed for patient transfusion)</option>
                    <option value="DISCARDED_EXPIRED">DISCARDED_EXPIRED (Shelf-life exceeded)</option>
                    <option value="DISCARDED_TTI_REACTIVE">DISCARDED_TTI_REACTIVE (Infectious disease positive)</option>
                    <option value="DISCARDED_DAMAGED">DISCARDED_DAMAGED (Physical damage / excursion)</option>
                    <option value="DISCARDED_CLINICALLY_REJECTED">DISCARDED_CLINICALLY_REJECTED (Doctor rejected)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Authorisation Reason *</label>
                  <textarea
                    rows={3}
                    placeholder="Enter detailed clinical or inventory justification for this disposition..."
                    value={dispositionReason}
                    onChange={(e) => setDispositionReason(e.target.value)}
                    required
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                  />
                </div>
              </form>
            </div>

            {/* Pinned Sticky Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-100 flex gap-2 shrink-0 bg-slate-50/90">
              <button
                type="button"
                onClick={() => setDispositionComp(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="disposition-form"
                disabled={dispositionLoading}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl disabled:opacity-50 transition-colors cursor-pointer shadow-xs"
              >
                {dispositionLoading ? 'Saving...' : 'Record Disposition'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: FRACTIONATE / DERIVE COMPONENTS */}
      {derivingUnit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Pinned Sticky Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between shrink-0 bg-white">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <span>⚗</span> Fractionate & Derive Blood Components
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                    Awaiting Processing
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Centrifuge separation for Whole-Blood bag{' '}
                  <strong className="text-slate-900 font-mono">{derivingUnit.unitNumber}</strong> ({derivingUnit.bloodGroup}, {derivingUnit.volumeMl || 450} mL).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDerivingUnit(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors"
                title="Close modal"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
              {/* NBTC Mandatory Safety Notice */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900">
                <div className="font-bold flex items-center gap-1.5 mb-1 text-amber-950">
                  <span>🛡</span> Mandatory Safety Gate (NBTC & Drug Standards)
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Derived component units will be created immediately in <strong>QUARANTINED</strong> status. Derivation does <strong>NOT</strong> mark components as released or safe for transfusion. Each fractionated unit requires independent mandatory TTI testing (HIV, HCV, HBsAg, Syphilis, Malaria) and ABO/Rh verification, followed by clinical review before becoming available stock.
                </p>
              </div>

              <form id="derivation-form" onSubmit={handleDeriveComponents} className="space-y-4">
                {/* Recipe Selector */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Fractionation Protocol / Recipe *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {
                        id: 'TRIPLE_BAG',
                        label: 'Triple Bag (Standard)',
                        desc: 'PRBC (250mL) + FFP (200mL) + Platelets (50mL)',
                      },
                      {
                        id: 'DOUBLE_BAG',
                        label: 'Double Bag (Packed RBC + FFP)',
                        desc: 'PRBC (250mL) + FFP (200mL)',
                      },
                      {
                        id: 'WHOLE_BLOOD',
                        label: 'Single Bag (Whole Blood)',
                        desc: 'Whole Blood unit (450mL)',
                      },
                      {
                        id: 'CUSTOM',
                        label: 'Custom Yield Fractionation',
                        desc: 'Specify custom components & volumes',
                      },
                    ].map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setDerivationRecipe(r.id as any)}
                        className={`text-left p-2.5 rounded-xl border text-xs transition-all ${
                          derivationRecipe === r.id
                            ? 'border-[#B91C32] bg-rose-50/60 ring-1 ring-[#B91C32]'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="font-bold text-slate-900">{r.label}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{r.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Components List if CUSTOM recipe selected */}
                {derivationRecipe === 'CUSTOM' && (
                  <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">Target Derived Components</span>
                      <button
                        type="button"
                        onClick={() =>
                          setCustomComponents([
                            ...customComponents,
                            { componentType: 'PRBC', volumeMl: 250, notes: '' },
                          ])
                        }
                        className="text-[10px] font-bold text-[#B91C32] hover:underline"
                      >
                        + Add Component
                      </button>
                    </div>

                    {customComponents.map((comp, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200">
                        <select
                          value={comp.componentType}
                          onChange={(e) => {
                            const updated = [...customComponents];
                            updated[idx].componentType = e.target.value;
                            setCustomComponents(updated);
                          }}
                          className="text-xs px-2 py-1 rounded border border-slate-200 font-medium bg-white"
                        >
                          <option value="PRBC">PRBC</option>
                          <option value="FRESH_FROZEN_PLASMA">FFP</option>
                          <option value="PLATELET_CONCENTRATE">Platelet Conc.</option>
                          <option value="CRYO_PRECIPITATE">Cryoprecipitate</option>
                          <option value="WHOLE_BLOOD">Whole Blood</option>
                          <option value="PLASMA">Plasma</option>
                        </select>

                        <input
                          type="number"
                          min="1"
                          max="1000"
                          value={comp.volumeMl}
                          onChange={(e) => {
                            const updated = [...customComponents];
                            updated[idx].volumeMl = Number(e.target.value) || 0;
                            setCustomComponents(updated);
                          }}
                          placeholder="mL"
                          className="w-20 text-xs px-2 py-1 rounded border border-slate-200 font-medium"
                        />
                        <span className="text-[11px] text-slate-500">mL</span>

                        <input
                          type="text"
                          value={comp.notes}
                          onChange={(e) => {
                            const updated = [...customComponents];
                            updated[idx].notes = e.target.value;
                            setCustomComponents(updated);
                          }}
                          placeholder="Notes / Barcode"
                          className="flex-1 text-xs px-2 py-1 rounded border border-slate-200 font-medium"
                        />

                        {customComponents.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setCustomComponents(customComponents.filter((_, i) => i !== idx));
                            }}
                            className="text-slate-400 hover:text-red-600 font-bold px-1"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Processing Reason / Lab reference */}
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Fractionation Run Reason / Equipment Reference *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Refrigerated Centrifuge Cryofuge 6000i run #842"
                    value={derivationReason}
                    onChange={(e) => setDerivationReason(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                  />
                </div>

                {!canDeriveComponents && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-900">
                    <p className="font-bold">Derivation Authority Restricted</p>
                    <p className="text-[11px] text-red-800 mt-0.5">
                      Your current role (<strong>{userRole}</strong>) is not authorized to register component fractionation. Requires ORG_ADMIN, INVENTORY_STAFF, or CLINICAL_STAFF authority.
                    </p>
                  </div>
                )}
              </form>
            </div>

            {/* Pinned Sticky Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-100 flex gap-2 shrink-0 bg-slate-50/90">
              <button
                type="button"
                onClick={() => setDerivingUnit(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="derivation-form"
                disabled={derivingLoading || !canDeriveComponents}
                className="flex-1 py-2.5 bg-[#B91C32] hover:bg-[#9B1324] text-white font-bold text-xs rounded-xl disabled:opacity-50 transition-colors cursor-pointer shadow-xs"
              >
                {derivingLoading ? 'Fractionating...' : 'Derive Components (Quarantined)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: CLINICAL LABORATORY TEST VERIFICATION */}
      {showVerifyModal && targetVerifyRecord && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Pinned Sticky Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between shrink-0 bg-white">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>✅</span> Clinical Laboratory Verification
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Confirm quality verification for {targetVerifyRecord.testType.replace(/_/g, ' ')}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowVerifyModal(false);
                  setTargetVerifyRecord(null);
                  setVerificationNotes('');
                }}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors"
                title="Close modal"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3.5">
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Test Type:</span>
                  <span className="font-bold text-slate-900">{targetVerifyRecord.testType.replace(/_/g, ' ')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Outcome:</span>
                  <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                    targetVerifyRecord.resultOutcome === 'NON_REACTIVE'
                      ? 'bg-emerald-100 text-emerald-800'
                      : (targetVerifyRecord.resultOutcome || '').includes('REACTIVE') || (targetVerifyRecord.resultOutcome || '').includes('POSITIVE')
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {targetVerifyRecord.resultOutcome || 'PENDING'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Unit / Sample:</span>
                  <span className="font-mono font-medium text-slate-800">
                    {targetVerifyRecord.collectionUnit?.unitNumber
                      ? `Pilot Tube (${targetVerifyRecord.collectionUnit.unitNumber})`
                      : targetVerifyRecord.componentUnit?.componentCode
                      ? `Component (${targetVerifyRecord.componentUnit.componentCode})`
                      : 'Associated Unit'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Performed By:</span>
                  <span className="text-slate-800">{targetVerifyRecord.performedBy?.name || 'Lab Tech'}</span>
                </div>
              </div>

              {/* NBTC attestation notice */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900">
                <p className="font-bold flex items-center gap-1.5 mb-1">
                  <span>🛡</span> Clinical Staff Attestation
                </p>
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  By verifying this record, you confirm as authorized clinical personnel that the test run, controls, and recorded outcome have been reviewed in accordance with drug safety standards and NBTC regulations.
                </p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Verification Notes (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Validated against bio-rad ELISA reader controls batch #2026/08"
                  value={verificationNotes}
                  onChange={(e) => setVerificationNotes(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                />
              </div>
            </div>

            {/* Pinned Sticky Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-100 flex gap-2 shrink-0 bg-slate-50/90">
              <button
                type="button"
                onClick={() => {
                  setShowVerifyModal(false);
                  setTargetVerifyRecord(null);
                  setVerificationNotes('');
                }}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={verifyingLoading}
                onClick={handleVerifyLabTest}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl disabled:opacity-50 transition-colors cursor-pointer shadow-xs"
              >
                {verifyingLoading ? 'Verifying...' : 'Confirm Verification'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

