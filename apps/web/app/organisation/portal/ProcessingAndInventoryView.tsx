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

interface LabTestRecord {
  id: string;
  category: string;
  testType: string;
  testName: string;
  status: string;
  resultOutcome?: string | null;
  quantitativeValue?: string | null;
  units?: string | null;
  referenceRange?: string | null;
  performedAt?: string | null;
  verifiedAt?: string | null;
  performedBy?: { name: string | null; role: string } | null;
  verifiedBy?: { name: string | null; role: string } | null;
  notes?: string | null;
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

export interface ProcessingAndInventoryViewProps {
  organisationId: string;
  userRole: 'ORG_ADMIN' | 'INVENTORY_STAFF' | 'CLINICAL_STAFF' | 'COLLECTION_STAFF' | 'AUDITOR';
  isAdmin: boolean;
  isAuditor: boolean;
  refreshSignal?: number;
  initialSubTab?: 'inventory' | 'lab' | 'release' | 'storage' | 'disposition';
}

export function ProcessingAndInventoryView({
  organisationId,
  userRole,
  isAdmin,
  isAuditor,
  refreshSignal,
  initialSubTab,
}: ProcessingAndInventoryViewProps) {
  const [subTab, setSubTab] = useState<'inventory' | 'lab' | 'release' | 'storage' | 'disposition'>(initialSubTab || 'inventory');

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
  const [releaseDecision, setReleaseDecision] = useState<'RELEASED' | 'QUARANTINE_HOLD' | 'WITHHELD' | 'DISCARD_ORDERED'>('RELEASED');
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

  // RBAC Clinical Authority: STRICT SAFETY GATE
  // In accordance with NBTC and drug safety guidelines, clinical release and verification
  // strictly require CLINICAL_STAFF role. ORG_ADMIN alone cannot release blood components!
  const isDesignatedClinicalStaff = userRole === 'CLINICAL_STAFF';

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
    setShowCreateLocationModal(false);
    setShowRecordTestModal(false);
    setActionError(null);
    setActionSuccess(null);
    setComponentsError(null);
  }, [organisationId]);

  // Lock background scrolling when any modal is open
  useEffect(() => {
    const isAnyModalOpen = Boolean(
      releasingComp || showRecordTestModal || movingComponent || dispositionComp || showCreateLocationModal
    );
    if (isAnyModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [releasingComp, showRecordTestModal, movingComponent, dispositionComp, showCreateLocationModal]);

  // Close Clinical Release modal on Escape key press
  useEffect(() => {
    if (!releasingComp) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setReleasingComp(null);
        setReleaseEligibility(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [releasingComp]);

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

  useEffect(() => {
    if (organisationId) {
      loadSummary();
      loadComponents();
      loadLocations();
    }
  }, [organisationId, statusFilter, typeFilter, refreshSignal]);

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

      setActionSuccess(`Storage location "${data.data.name}" (${data.data.locationCode}) successfully configured!`);
      setShowCreateLocationModal(false);
      setNewLocCode('');
      setNewLocName('');
      loadLocations();
      loadSummary();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setCreatingLocationLoading(false);
    }
  };

  // Move Component Handler
  const handleMoveComponent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!movingComponent || !moveDestLocationId) return;

    setMovingLoading(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(
        `/api/v1/organisations/${organisationId}/components/${movingComponent.id}/storage-movement`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toLocationId: moveDestLocationId,
            reason: moveReason.trim(),
            observedTempCelsius: Number(moveObservedTemp),
            temperatureExcursionNoted: moveExcursionNoted,
            excursionNotes: moveExcursionNoted ? moveExcursionNotes.trim() : undefined,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to record component movement');

      if (moveExcursionNoted) {
        setActionSuccess(`Movement recorded! Component automatically placed under QUARANTINE HOLD due to temperature excursion.`);
      } else {
        setActionSuccess(`Component ${movingComponent.componentCode} relocated successfully!`);
      }

      setMovingComponent(null);
      loadComponents();
      loadSummary();
      loadLocations();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setMovingLoading(false);
    }
  };

  // Record Lab Test Handler
  const handleRecordLabTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testTargetComp) return;

    setRecordingTestLoading(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(`/api/v1/organisations/${organisationId}/laboratory-tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          componentUnitId: testTargetComp.id,
          category: testCategory,
          testType,
          resultOutcome: testOutcome,
          quantitativeValue: testQuantValue.trim() || undefined,
          referenceRange: testRefRange.trim() || undefined,
          notes: testNotes.trim() || undefined,
          status: 'COMPLETED',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to record laboratory test');

      if (testOutcome === 'REACTIVE' || testOutcome === 'CONFIRMED_POSITIVE') {
        setActionSuccess(`Lab test recorded! Unit automatically placed on SAFETY QUARANTINE HOLD due to reactive result.`);
      } else {
        setActionSuccess(`Laboratory test record saved: ${testType} (${testOutcome})`);
      }

      setShowRecordTestModal(false);
      setTestTargetComp(null);
      loadComponents();
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
    setReleaseReason('All mandatory laboratory test records confirmed complete and non-reactive per protocol.');
    const targetOrgId = comp.organisationId || organisationId;

    try {
      const res = await authFetch(`/api/v1/organisations/${targetOrgId}/components/${comp.id}/release-eligibility`);
      if (res.ok) {
        const data = await res.json();
        setReleaseEligibility(data.data);
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

  // Submit Clinical Release Decision Handler
  const handleSubmitClinicalRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!releasingComp || !releaseReason.trim()) return;

    setReleasingLoading(true);
    setActionError(null);
    setActionSuccess(null);
    const targetOrgId = releasingComp.organisationId || organisationId;

    try {
      const res = await authFetch(
        `/api/v1/organisations/${targetOrgId}/components/${releasingComp.id}/clinical-release`,
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

      setActionSuccess(`Clinical release decision executed: ${releaseDecision} for ${releasingComp.componentCode}`);
      setReleasingComp(null);
      setReleaseEligibility(null);
      loadComponents();
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

      setActionSuccess(data.message || `Expiry sweep complete! ${data.data.sweptCount} expired unit(s) isolated.`);
      loadComponents();
      loadSummary();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setSweepingLoading(false);
    }
  };

  // Record Disposition Handler
  const handleRecordDisposition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispositionComp || !dispositionReason.trim()) return;

    setDispositionLoading(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(
        `/api/v1/organisations/${organisationId}/components/${dispositionComp.id}/disposition`,
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

      setActionSuccess(`Authorised disposition (${dispositionType}) recorded for ${dispositionComp.componentCode}!`);
      setDispositionComp(null);
      loadComponents();
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

      {/* Sub-navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 flex-wrap">
        <button
          onClick={() => setSubTab('inventory')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            subTab === 'inventory'
              ? 'bg-[#B91C32] text-white shadow-xs'
              : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
          }`}
        >
          📊 Live Inventory & Metrics
        </button>
        <button
          onClick={() => setSubTab('release')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            subTab === 'release'
              ? 'bg-[#B91C32] text-white shadow-xs'
              : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
          }`}
        >
          ⚖ Clinical Release Queue
        </button>
        <button
          onClick={() => setSubTab('lab')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            subTab === 'lab'
              ? 'bg-[#B91C32] text-white shadow-xs'
              : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
          }`}
        >
          🔬 Laboratory Records
        </button>
        <button
          onClick={() => setSubTab('storage')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            subTab === 'storage'
              ? 'bg-[#B91C32] text-white shadow-xs'
              : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
          }`}
        >
          ❄ Storage & Cold Chain ({storageLocations.length})
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
                <span className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 font-mono text-slate-700">
                  Received awaiting processing: <strong>{summary?.collectionIntakeMetrics.receivedAwaitingProcessing ?? 0}</strong>
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

      {/* SUBTAB 2: CLINICAL RELEASE QUEUE */}
      {subTab === 'release' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="border-b border-slate-200 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Clinical Release Queue & Verification Gate</h3>
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
                      ⚖ Evaluate & Release Decision
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SUBTAB 3: LABORATORY RECORDS */}
      {subTab === 'lab' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Mandatory Screening Panel & Laboratory Records</h3>
              <p className="text-xs text-slate-500">
                NBTC Transfusion-Transmissible Infection (TTI) panel & Immunohematology blood group confirmation
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { type: 'HIV_ANTIBODY', name: 'HIV 1/2 4th Gen ELISA', desc: 'Mandatory TTI Screening' },
              { type: 'HCV_ANTIBODY', name: 'Hepatitis C Antibody ELISA', desc: 'Mandatory TTI Screening' },
              { type: 'HBSAG', name: 'Hepatitis B Surface Antigen', desc: 'Mandatory TTI Screening' },
              { type: 'SYPHILIS_RPR', name: 'Syphilis Rapid Plasma Reagin', desc: 'Mandatory TTI Screening' },
              { type: 'MALARIA_ANTIGEN', name: 'Malaria Pan/Pf Antigen', desc: 'Mandatory TTI Screening' },
              { type: 'ABO_RH_CONFIRMATION', name: 'Forward & Reverse Grouping', desc: 'Mandatory Confirmation' },
            ].map((test) => (
              <div key={test.type} className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50">
                <span className="text-[10px] font-mono font-bold text-slate-500 block uppercase">{test.type}</span>
                <h4 className="text-xs font-bold text-slate-900 mt-0.5">{test.name}</h4>
                <p className="text-[11px] text-slate-500 mt-1">{test.desc}</p>
                <div className="mt-3">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    Validated Protocol
                  </span>
                </div>
              </div>
            ))}
          </div>
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Configure Storage Location</h3>
            <p className="text-xs text-slate-500 mb-4">
              Add a calibrated refrigerator, deep freezer, or platelet agitator to the organisation roster.
            </p>

            <form onSubmit={handleCreateLocation} className="space-y-3">
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

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateLocationModal(false)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingLocationLoading}
                  className="flex-1 py-2 bg-[#B91C32] hover:bg-[#9B1324] text-white font-bold text-xs rounded-xl disabled:opacity-50"
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Record Storage Movement</h3>
            <p className="text-xs text-slate-500 mb-4">
              Relocate component <strong className="text-slate-900 font-mono">{movingComponent.componentCode}</strong> to a different equipment location.
            </p>

            <form onSubmit={handleMoveComponent} className="space-y-3">
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

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setMovingComponent(null)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={movingLoading}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl disabled:opacity-50"
                >
                  {movingLoading ? 'Saving...' : 'Record Movement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: RECORD LAB TEST */}
      {showRecordTestModal && testTargetComp && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Record Laboratory Test Result</h3>
            <p className="text-xs text-slate-500 mb-4">
              Enter screening or grouping results for <strong className="text-slate-900 font-mono">{testTargetComp.componentCode}</strong>.
            </p>

            <form onSubmit={handleRecordLabTest} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Test Category</label>
                <select
                  value={testCategory}
                  onChange={(e) => setTestCategory(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                >
                  <option value="TTI_SCREENING">TTI Screening (Infectious Diseases)</option>
                  <option value="BLOOD_GROUPING">Blood Grouping & Typing</option>
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

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowRecordTestModal(false)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={recordingTestLoading}
                  className="flex-1 py-2 bg-[#B91C32] hover:bg-[#9B1324] text-white font-bold text-xs rounded-xl disabled:opacity-50"
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
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Clinical Release Review & Decision</h3>
            <p className="text-xs text-slate-500 mb-4">
              Evaluation for component <strong className="text-slate-900 font-mono">{releasingComp.componentCode}</strong> ({releasingComp.componentType}, {releasingComp.bloodGroup}).
            </p>

            {loadingEligibility ? (
              <div className="py-8 text-center text-xs text-slate-500 font-semibold">
                Checking mandatory laboratory test completeness...
              </div>
            ) : releaseEligibility ? (
              <form onSubmit={handleSubmitClinicalRelease} className="space-y-4">
                {/* Mandatory Checklist Status */}
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                    Mandatory TTI & Grouping Panel Status
                  </h4>
                  <div className="space-y-1.5">
                    {releaseEligibility.mandatoryRequirements.allMandatoryRequired.map((test) => {
                      const passed = releaseEligibility.mandatoryRequirements.passedTests.some((p) => p.testType === test);
                      const pending = releaseEligibility.mandatoryRequirements.pendingTests.includes(test);
                      const reactive = releaseEligibility.mandatoryRequirements.reactiveOrFailedTests.some((r) => r.testType === test);
                      const missing = releaseEligibility.mandatoryRequirements.missingTests.includes(test);

                      return (
                        <div key={test} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                          <span className="font-medium text-slate-700">{test.replace(/_/g, ' ')}</span>
                          {passed && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                              ✓ NON-REACTIVE
                            </span>
                          )}
                          {pending && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                              ⏳ PENDING
                            </span>
                          )}
                          {reactive && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800">
                              ⚠ REACTIVE
                            </span>
                          )}
                          {missing && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                              ✕ MISSING
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Blocking reasons if not eligible */}
                {!releaseEligibility.isEligibleForRelease && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-900">
                    <p className="font-bold mb-1">Release to AVAILABLE is Blocked:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-red-800 font-medium">
                      {releaseEligibility.blockingReasons.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Authority warning if NOT CLINICAL_STAFF */}
                {!isDesignatedClinicalStaff && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
                    <p className="font-bold">Clinical Authority Restricted</p>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      You are signed in with role <strong>{userRole}</strong>. In accordance with NBTC and drug safety guidelines,
                      clinical release requires designated <strong>CLINICAL_STAFF</strong> authority. Organisation Administrator credentials alone cannot bypass this gate.
                    </p>
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Clinical Decision *</label>
                  <select
                    value={releaseDecision}
                    onChange={(e: any) => setReleaseDecision(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                  >
                    <option value="RELEASED" disabled={!releaseEligibility.isEligibleForRelease}>
                      RELEASED (Release to AVAILABLE stock)
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
                    value={releaseProtocolRef}
                    onChange={(e) => setReleaseProtocolRef(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Clinical Review Reason / Notes *</label>
                  <textarea
                    rows={2}
                    value={releaseReason}
                    onChange={(e) => setReleaseReason(e.target.value)}
                    required
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setReleasingComp(null);
                      setReleaseEligibility(null);
                    }}
                    className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={releasingLoading || (!isDesignatedClinicalStaff && releaseDecision === 'RELEASED') || (releaseDecision === 'RELEASED' && !releaseEligibility.isEligibleForRelease)}
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl disabled:opacity-50 cursor-pointer"
                  >
                    {releasingLoading ? 'Executing Decision...' : 'Execute Decision'}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      )}

      {/* MODAL 5: AUTHORISED DISPOSITION */}
      {dispositionComp && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">Authorised Disposition</h3>
            <p className="text-xs text-slate-500 mb-4">
              Record authorised issue or clinical disposal for component <strong className="text-slate-900 font-mono">{dispositionComp.componentCode}</strong>.
            </p>

            <form onSubmit={handleRecordDisposition} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Disposition Type *</label>
                <select
                  value={dispositionType}
                  onChange={(e) => setDispositionType(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
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
                  rows={2}
                  value={dispositionReason}
                  onChange={(e) => setDispositionReason(e.target.value)}
                  required
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 font-medium"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setDispositionComp(null)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={dispositionLoading}
                  className="flex-1 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl disabled:opacity-50"
                >
                  {dispositionLoading ? 'Saving...' : 'Record Disposition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
