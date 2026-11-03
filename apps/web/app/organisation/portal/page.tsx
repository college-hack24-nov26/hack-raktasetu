'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ProcessingAndInventoryView } from './ProcessingAndInventoryView';
import { HospitalIntegrationView } from './HospitalIntegrationView';
import { useRealtime } from '../../hooks/useRealtime';
import { authFetch } from '../../config/api';
import { notifyAuthChange } from '../../components/Header';
import {
  IconDashboard,
  IconProposals,
  IconCamps,
  IconInventory,
  IconLab,
  IconHandover,
  IconHospital,
  IconReports,
  IconStaff,
  IconSettings,
  IconApplications,
  IconLogOut,
  IconMenu,
} from '../../components/ui/Icons';

export type OrgPortalTab =
  | 'overview'
  | 'proposals'
  | 'camps'
  | 'inventory'
  | 'lab'
  | 'handover'
  | 'requests'
  | 'reports'
  | 'staff'
  | 'settings'
  | 'applications';

interface OrgMembership {
  membershipId: string;
  organisationId: string;
  orgCode: string;
  organisationName: string;
  role: 'ORG_ADMIN' | 'INVENTORY_STAFF' | 'CLINICAL_STAFF' | 'COLLECTION_STAFF' | 'AUDITOR';
  status: string;
  isActive: boolean;
  assignedAt: string;
  permissions: string[];
}

interface StaffMember {
  membershipId: string;
  userId: string;
  name: string | null;
  userStatus: string;
  role: 'ORG_ADMIN' | 'INVENTORY_STAFF' | 'CLINICAL_STAFF' | 'COLLECTION_STAFF' | 'AUDITOR';
  isActive: boolean;
  assignedAt: string;
  assignedBy: string | null;
}

interface CampItem {
  id: string;
  campCode: string;
  title: string;
  organizerName: string;
  targetDate: string;
  timeSlot?: string | null;
  venue: string;
  district?: string | null;
  districtCode?: number;
  expectedDonors: number;
  coordinatorContact?: string | null;
  status: string;
  isReadyForCollection: boolean;
  readinessVerifiedAt?: string | null;
  readinessChecklist?: any;
  createdAt?: string;
  organisation?: {
    id: string;
    orgCode: string;
    name: string;
    status: string;
  };
}

interface AttendanceItem {
  id: string;
  campId: string;
  userId: string;
  donorName: string;
  donorPhone: string;
  bloodGroup: string | null;
  status: 'REGISTERED' | 'CHECKED_IN' | 'CANCELLED';
  registeredAt: string;
  checkedInAt?: string | null;
  screening?: {
    id: string;
    status: 'PENDING' | 'CLEARED' | 'DEFERRED' | 'NOT_COMPLETED';
    consentGiven: boolean;
    eligibilityDecision: string;
    deferralCategory?: string | null;
    clinicalNotes?: string | null;
    isAmended?: boolean;
  } | null;
  donationEvent?: {
    id: string;
    outcome: string;
    bloodGroup: string;
    volumeMl?: number | null;
    adverseReaction: boolean;
    performedAt: string;
    collectionUnit?: {
      id: string;
      unitNumber: string;
      status: string;
    } | null;
  } | null;
}

interface CollectionUnitItem {
  id: string;
  unitNumber: string;
  bagIdentifier: string | null;
  bloodGroup: string;
  volumeMl: number | null;
  status: string;
  collectedAt: string;
  camp?: { id: string; campCode: string; title: string } | null;
  componentCount: number;
}

interface HandoverManifestItem {
  id: string;
  manifestId: string;
  collectionUnitId: string;
  expectedOutcome: string;
  actualOutcome: string;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  verifierName?: string | null;
  notes?: string | null;
  collectionUnit: {
    id: string;
    unitNumber: string;
    bloodGroup: string;
    volumeMl: number | null;
    status: string;
  };
}

interface ReconciliationExceptionItem {
  id: string;
  manifestId: string;
  category: string;
  severity: string;
  status: string;
  details: string;
  unitIdentifier?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  resolverName?: string | null;
  resolutionNotes?: string | null;
}

interface HandoverManifestDetail {
  id: string;
  manifestNumber: string;
  sourceCampId: string;
  sourceCamp: { id: string; title: string; campCode: string; venue?: string };
  sendingOrgId: string;
  sendingOrg: { id: string; name: string; orgCode: string };
  receivingOrgId: string;
  receivingOrg: { id: string; name: string; orgCode: string };
  status: 'DRAFT' | 'FINALISED' | 'DISPATCHED' | 'PARTIALLY_RECEIVED' | 'RECEIVED_WITH_DISCREPANCIES' | 'RECONCILED' | 'CANCELLED';
  transportDetails: {
    carrierName?: string;
    vehicleNumber?: string;
    driverName?: string;
    driverContact?: string;
    departureTempCelsius?: number;
    sealsVerified?: boolean;
    dispatchNotes?: string;
  } | null;
  createdAt: string;
  creatorName: string;
  dispatchedAt?: string | null;
  dispatcherName?: string | null;
  reconciledAt?: string | null;
  reconcilerName?: string | null;
  reconciliationNotes?: string | null;
  items: HandoverManifestItem[];
  exceptions: ReconciliationExceptionItem[];
  reconciliationSummary: {
    totalExpected: number;
    verifiedIntact: number;
    damagedOrCompromised: number;
    missing: number;
    unexpected: number;
    discrepancyCount: number;
    openExceptionsCount: number;
    isFullyReconciled: boolean;
  };
}

interface VerifiedCentreItem {
  id: string;
  orgCode: string;
  name: string;
  districtName?: string;
}

function OrganisationPortalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<OrgPortalTab>('overview');
  const [showMobileMore, setShowMobileMore] = useState(false);

  const [collectionOverview, setCollectionOverview] = useState<any | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<OrgMembership[]>([]);
  const [activeOrgIndex, setActiveOrgIndex] = useState(0);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  // Proposal filter & detail states
  const [proposalFilter, setProposalFilter] = useState<'ALL' | 'PROPOSED' | 'APPROVED' | 'REJECTED'>('PROPOSED');
  const [reviewingProposal, setReviewingProposal] = useState<CampItem | null>(null);
  const [proposalToReject, setProposalToReject] = useState<CampItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Camp filter state
  const [campSearchTerm, setCampSearchTerm] = useState('');
  const [campStatusFilter, setCampStatusFilter] = useState<string>('APPROVED');

  // Platform Admin Application Review states
  const [applications, setApplications] = useState<any[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [appFilterStatus, setAppFilterStatus] = useState<string>('ALL');
  const [appSearchTerm, setAppSearchTerm] = useState('');
  const [selectedAppForReview, setSelectedAppForReview] = useState<any>(null);
  const [reviewAction, setReviewAction] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [customOrgCode, setCustomOrgCode] = useState('');
  const [reviewNotesInput, setReviewNotesInput] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewSuccessMessage, setReviewSuccessMessage] = useState<string | null>(null);
  const [reviewErrorMessage, setReviewErrorMessage] = useState<string | null>(null);

  // Phase 7 Realtime state
  const [inventoryRefreshSignal, setInventoryRefreshSignal] = useState(0);
  const [realtimeNotice, setRealtimeNotice] = useState<{ message: string; timestamp: string } | null>(null);

  // Form states for adding staff
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<'INVENTORY_STAFF' | 'CLINICAL_STAFF' | 'COLLECTION_STAFF' | 'AUDITOR' | 'ORG_ADMIN'>('INVENTORY_STAFF');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);

  // Application lookup state
  const [lookupAppId, setLookupAppId] = useState('');
  const [lookedUpApp, setLookedUpApp] = useState<any>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Camp Operations States
  const [camps, setCamps] = useState<CampItem[]>([]);
  const [loadingCamps, setLoadingCamps] = useState(false);
  const [campsError, setCampsError] = useState<string | null>(null);
  const [selectedCampId, setSelectedCampId] = useState<string | null>(null);
  const [selectedCampDetails, setSelectedCampDetails] = useState<any>(null);
  const [attendanceRoster, setAttendanceRoster] = useState<AttendanceItem[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [campActionMessage, setCampActionMessage] = useState<string | null>(null);
  const [campActionError, setCampActionError] = useState<string | null>(null);
  const [statusUpdatingCampId, setStatusUpdatingCampId] = useState<string | null>(null);

  // Camp Staff Management States (Camp-Scoped Access)
  const [showCampStaffModal, setShowCampStaffModal] = useState(false);
  const [campStaffList, setCampStaffList] = useState<any[]>([]);
  const [loadingCampStaff, setLoadingCampStaff] = useState(false);
  const [assigningCampStaff, setAssigningCampStaff] = useState(false);
  const [campStaffPhone, setCampStaffPhone] = useState('');
  const [campStaffRole, setCampStaffRole] = useState<'CAMP_COORDINATOR' | 'CLINICAL_STAFF' | 'COLLECTION_STAFF'>('CAMP_COORDINATOR');
  const [campStaffNotes, setCampStaffNotes] = useState('');
  const [campStaffError, setCampStaffError] = useState<string | null>(null);
  const [campStaffSuccess, setCampStaffSuccess] = useState<string | null>(null);

  // Traceability States
  const [collectionUnits, setCollectionUnits] = useState<CollectionUnitItem[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [traceabilityDetails, setTraceabilityDetails] = useState<any>(null);
  const [loadingTraceability, setLoadingTraceability] = useState(false);
  const [derivingUnit, setDerivingUnit] = useState<CollectionUnitItem | null>(null);
  const [deriveComponentsList, setDeriveComponentsList] = useState<Array<{ componentType: string; volumeMl: number }>>([
    { componentType: 'PRBC', volumeMl: 250 },
    { componentType: 'FRESH_FROZEN_PLASMA', volumeMl: 200 },
  ]);
  const [derivingLoading, setDerivingLoading] = useState(false);
  const [statusModalUnit, setStatusModalUnit] = useState<CollectionUnitItem | null>(null);
  const [targetStatus, setTargetStatus] = useState<string>('RECEIVED_BY_CENTRE');
  const [transitionReason, setTransitionReason] = useState<string>('');
  const [transitioningLoading, setTransitioningLoading] = useState(false);

  // Handover & Physical Reconciliation States
  const [manifests, setManifests] = useState<any[]>([]);
  const [loadingManifests, setLoadingManifests] = useState(false);
  const [selectedManifestId, setSelectedManifestId] = useState<string | null>(null);
  const [selectedManifest, setSelectedManifest] = useState<HandoverManifestDetail | null>(null);
  const [loadingManifestDetail, setLoadingManifestDetail] = useState(false);
  const [verifiedCentres, setVerifiedCentres] = useState<VerifiedCentreItem[]>([]);
  const [handoverDirection, setHandoverDirection] = useState<'all' | 'outbound' | 'inbound'>('all');

  // Handover Modals
  const [showCreateManifestModal, setShowCreateManifestModal] = useState(false);
  const [newManifestCampId, setNewManifestCampId] = useState('');
  const [newManifestReceivingOrgId, setNewManifestReceivingOrgId] = useState('');
  const [selectedUnitIdsForManifest, setSelectedUnitIdsForManifest] = useState<string[]>([]);
  const [creatingManifestLoading, setCreatingManifestLoading] = useState(false);

  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchCarrier, setDispatchCarrier] = useState('ColdChain Express Logistics');
  const [dispatchVehicle, setDispatchVehicle] = useState('MH-12-RS-9901');
  const [dispatchDriver, setDispatchDriver] = useState('Sanjay Deshmukh');
  const [dispatchContact, setDispatchContact] = useState('+919822001122');
  const [dispatchTemp, setDispatchTemp] = useState(4.0);
  const [dispatchSealsVerified, setDispatchSealsVerified] = useState(true);
  const [dispatchNotes, setDispatchNotes] = useState('Primary collection shipper boxes sealed with tamper-evident security tape');
  const [dispatchingLoading, setDispatchingLoading] = useState(false);

  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receivingItem, setReceivingItem] = useState<HandoverManifestItem | null>(null);
  const [receiveOutcome, setReceiveOutcome] = useState<'VERIFIED_INTACT' | 'DAMAGED' | 'TEMPERATURE_EXCURSION' | 'MISSING' | 'MISMATCHED'>('VERIFIED_INTACT');
  const [receiveNotes, setReceiveNotes] = useState('');
  const [recordedTempCelsius, setRecordedTempCelsius] = useState(4.2);
  const [receivingLoading, setReceivingLoading] = useState(false);

  const [showUnexpectedModal, setShowUnexpectedModal] = useState(false);
  const [unexpectedUnitNumber, setUnexpectedUnitNumber] = useState('');
  const [unexpectedOutcome, setUnexpectedOutcome] = useState<'UNEXPECTED' | 'DAMAGED' | 'TEMPERATURE_EXCURSION'>('UNEXPECTED');
  const [unexpectedNotes, setUnexpectedNotes] = useState('');
  const [unexpectedLoading, setUnexpectedLoading] = useState(false);

  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolvingException, setResolvingException] = useState<ReconciliationExceptionItem | null>(null);
  const [resolutionTargetStatus, setResolutionTargetStatus] = useState<'RESOLVED' | 'WAIVED'>('RESOLVED');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [resolvingLoading, setResolvingLoading] = useState(false);

  const [reconcileNotes, setReconcileNotes] = useState('');
  const [reconcilingLoading, setReconcilingLoading] = useState(false);
  const [handoverActionError, setHandoverActionError] = useState<string | null>(null);
  const [handoverActionSuccess, setHandoverActionSuccess] = useState<string | null>(null);

  const activeOrg = memberships[activeOrgIndex] || null;
  const isAdmin = activeOrg?.role === 'ORG_ADMIN';
  const isAuditor = activeOrg?.role === 'AUDITOR';
  const isClinicalStaff = activeOrg?.role === 'CLINICAL_STAFF' || isAdmin;
  const isCollectionStaff = activeOrg?.role === 'COLLECTION_STAFF' || isAdmin;
  const isInventoryStaff = activeOrg?.role === 'INVENTORY_STAFF' || isAdmin;

  const canCreateManifest = (isCollectionStaff || isAdmin) && !isAuditor;
  const canDispatchManifest = (isCollectionStaff || isInventoryStaff || isAdmin) && !isAuditor;
  const canReceiveItem = (isInventoryStaff || isAdmin) && !isAuditor;
  const canReconcile = (isInventoryStaff || isAdmin) && !isAuditor;

  // Initialize query param tab
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('raktasetu_user') || 'null');
      if (u?.role === 'ADMIN') {
        setIsPlatformAdmin(true);
      }
    } catch {}

    const tabParam = searchParams.get('tab') as OrgPortalTab;
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  const handleSignOut = () => {
    localStorage.removeItem('raktasetu_token');
    localStorage.removeItem('raktasetu_user');
    notifyAuthChange();
    router.push('/organisation/login');
  };

  // Load Collection & Inventory Overview
  const loadCollectionOverview = async () => {
    if (!activeOrg) return;
    try {
      setLoadingOverview(true);
      setOverviewError(null);
      const res = await authFetch(`/api/v1/organisations/${activeOrg.organisationId}/collection-overview`);
      if (res.ok) {
        const data = await res.json();
        setCollectionOverview(data.data);
      } else {
        const errData = await res.json().catch(() => ({}));
        setOverviewError(errData.error?.message || 'Failed to load collection overview.');
      }
    } catch (err: any) {
      setOverviewError(err.message || 'Error loading collection overview.');
    } finally {
      setLoadingOverview(false);
    }
  };

  useEffect(() => {
    if (activeOrg) {
      loadCollectionOverview();
    }
  }, [activeOrg]);

  // Real-time WebSocket hook
  const { status: wsStatus, isLive, isPollingFallback } = useRealtime({
    organisationId: activeOrg?.organisationId,
    campId: selectedCampId || undefined,
    enabled: Boolean(activeOrg?.organisationId),
    onEvent: (event) => {
      loadCollectionOverview();
      if (
        event.eventType.startsWith('component.') ||
        event.eventType.startsWith('inventory.') ||
        event.eventType.startsWith('storage.')
      ) {
        setInventoryRefreshSignal((prev) => prev + 1);
        loadCollectionUnits();
      } else if (event.eventType.startsWith('handover.')) {
        loadManifests();
        if (selectedManifestId) loadManifestDetail(selectedManifestId);
        loadCollectionUnits();
      } else if (event.eventType.startsWith('camp.')) {
        loadCamps();
        loadRoster();
        if (event.eventType === 'camp.collection_unit_confirmed') {
          loadCollectionUnits();
        }
      }

      setRealtimeNotice({
        message: `Real-time: ${event.eventType.replace('.', ' → ')}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      });

      setTimeout(() => {
        setRealtimeNotice((curr) => (curr?.message.includes(event.eventType) ? null : curr));
      }, 6000);
    },
  });

  // Load user memberships
  useEffect(() => {
    async function loadMemberships() {
      try {
        setLoading(true);
        const res = await authFetch('/api/v1/organisations/me/memberships');
        if (!res.ok) {
          let isAdminUser = false;
          try {
            const u = JSON.parse(localStorage.getItem('raktasetu_user') || 'null');
            if (u?.role === 'ADMIN') isAdminUser = true;
          } catch {}

          if (res.status === 401 && !isAdminUser) {
            setError('Please sign in to access the Organisation Portal.');
            return;
          }
          if (!isAdminUser) {
            throw new Error('Failed to load organisation memberships');
          }
        } else {
          const data = await res.json();
          setMemberships(data.data || []);
        }
      } catch (err: any) {
        let isAdminUser = false;
        try {
          const u = JSON.parse(localStorage.getItem('raktasetu_user') || 'null');
          if (u?.role === 'ADMIN') isAdminUser = true;
        } catch {}
        if (!isAdminUser) {
          setError(err.message || 'Error loading memberships');
        }
      } finally {
        setLoading(false);
      }
    }
    loadMemberships();
  }, []);

  useEffect(() => {
    if (isPlatformAdmin && memberships.length === 0) {
      setActiveTab('applications');
    }
  }, [isPlatformAdmin, memberships]);

  // Load applications for Platform Admin
  const loadApplications = async (statusFilter?: string) => {
    try {
      setLoadingApps(true);
      const url = statusFilter && statusFilter !== 'ALL'
        ? `/api/v1/organisations/applications?status=${statusFilter}`
        : `/api/v1/organisations/applications`;
      const res = await authFetch(url);
      if (res.ok) {
        const data = await res.json();
        setApplications(data.data || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingApps(false);
    }
  };

  useEffect(() => {
    if (isPlatformAdmin && activeTab === 'applications') {
      loadApplications(appFilterStatus);
    }
  }, [isPlatformAdmin, activeTab, appFilterStatus]);

  // Load staff
  useEffect(() => {
    if (!activeOrg) return;

    async function loadStaff() {
      try {
        const res = await authFetch(`/api/v1/organisations/${activeOrg.organisationId}/staff`);
        if (res.ok) {
          const data = await res.json();
          setStaff(data.data || []);
        }
      } catch {
        // ignore
      }
    }
    loadStaff();
  }, [activeOrg]);

  // Load camps
  const loadCamps = async () => {
    if (!activeOrg) return;
    try {
      setLoadingCamps(true);
      setCampsError(null);
      const res = await authFetch(`/api/v1/camps?organisationId=${activeOrg.organisationId}`);
      if (res.ok) {
        const data = await res.json();
        const list: CampItem[] = data.data || [];
        setCamps(list);
        const approved = list.filter((c) => c.status === 'APPROVED');
        if (approved.length > 0) {
          if (!selectedCampId || !list.some((c) => c.id === selectedCampId && c.status === 'APPROVED')) {
            setSelectedCampId(approved[0].id);
          }
        } else {
          setSelectedCampId(null);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setCampsError(errData.error?.message || 'Failed to load camps for this organisation.');
      }
    } catch (err: any) {
      setCampsError(err.message || 'Network error loading organisation camps.');
    } finally {
      setLoadingCamps(false);
    }
  };

  useEffect(() => {
    loadCamps();
  }, [activeOrg]);

  // Load collection units
  const loadCollectionUnits = async () => {
    if (!activeOrg) return;
    try {
      setLoadingUnits(true);
      const res = await authFetch(`/api/v1/traceability/collection-units?organisationId=${activeOrg.organisationId}`);
      if (res.ok) {
        const data = await res.json();
        setCollectionUnits(data.data || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingUnits(false);
    }
  };

  useEffect(() => {
    if (activeOrg) {
      loadCollectionUnits();
    }
  }, [activeOrg]);

  // Load Handover Manifests
  const loadManifests = async () => {
    if (!activeOrg) return;
    try {
      setLoadingManifests(true);
      const res = await authFetch(`/api/v1/manifests?organisationId=${activeOrg.organisationId}`);
      if (res.ok) {
        const data = await res.json();
        setManifests(data.data || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingManifests(false);
    }
  };

  const loadManifestDetail = async (manifestId: string) => {
    try {
      setLoadingManifestDetail(true);
      const res = await authFetch(`/api/v1/manifests/${manifestId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedManifest(data.data);
      }
    } catch {
      // ignore
    } finally {
      setLoadingManifestDetail(false);
    }
  };

  const loadVerifiedCentres = async () => {
    try {
      const res = await authFetch('/api/v1/organisations');
      if (res.ok) {
        const data = await res.json();
        setVerifiedCentres(data.data || []);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (activeOrg) {
      loadManifests();
      loadVerifiedCentres();
    }
  }, [activeOrg]);

  useEffect(() => {
    if (selectedManifestId) {
      loadManifestDetail(selectedManifestId);
    }
  }, [selectedManifestId]);

  // Load selected camp roster
  const loadRoster = async () => {
    if (!selectedCampId) return;
    try {
      setLoadingRoster(true);
      const [campRes, rosterRes] = await Promise.all([
        authFetch(`/api/v1/camps/${selectedCampId}`),
        authFetch(`/api/v1/camps/${selectedCampId}/attendance`),
      ]);

      if (campRes.ok) {
        const campData = await campRes.json();
        setSelectedCampDetails(campData.data);
      }
      if (rosterRes.ok) {
        const rosterData = await rosterRes.json();
        setAttendanceRoster(rosterData.data || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingRoster(false);
    }
  };

  useEffect(() => {
    if (selectedCampId) {
      loadRoster();
    }
  }, [selectedCampId]);

  // Camp Status (Approval / Rejection)
  const handleUpdateCampStatus = async (campId: string, status: 'APPROVED' | 'REJECTED', reasonText?: string) => {
    setCampActionError(null);
    setCampActionMessage(null);
    setStatusUpdatingCampId(campId);
    try {
      const res = await authFetch(`/api/v1/camps/${campId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          reason: reasonText?.trim() || `Camp proposal ${status.toLowerCase()} by Parent Blood Bank Administrator`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || `Failed to update camp status to ${status}`);

      setCampActionMessage(`Camp proposal ${data.data?.campCode || ''} successfully ${status === 'APPROVED' ? 'approved and activated' : 'rejected'}!`);
      setProposalToReject(null);
      setRejectReason('');
      if (reviewingProposal?.id === campId) {
        setReviewingProposal(null);
      }
      await loadCamps();
    } catch (err: any) {
      setCampActionError(err.message);
    } finally {
      setStatusUpdatingCampId(null);
    }
  };

  // Camp Staff Handlers
  const loadCampStaff = async (campId: string) => {
    try {
      setLoadingCampStaff(true);
      setCampStaffError(null);
      const res = await authFetch(`/api/v1/camps/${campId}/staff`);
      if (res.ok) {
        const data = await res.json();
        setCampStaffList(data.data || []);
      } else {
        const err = await res.json().catch(() => ({}));
        setCampStaffError(err.error?.message || 'Failed to load camp staff');
      }
    } catch (e: any) {
      setCampStaffError(e.message || 'Error loading camp staff');
    } finally {
      setLoadingCampStaff(false);
    }
  };

  const handleAssignCampStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampId || !campStaffPhone.trim()) return;

    setAssigningCampStaff(true);
    setCampStaffError(null);
    setCampStaffSuccess(null);

    try {
      const res = await authFetch(`/api/v1/camps/${selectedCampId}/staff`, {
        method: 'POST',
        body: JSON.stringify({
          userIdOrPhone: campStaffPhone.trim(),
          role: campStaffRole,
          notes: campStaffNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to assign camp staff');

      setCampStaffSuccess(`Staff member assigned successfully as ${campStaffRole}!`);
      setCampStaffPhone('');
      setCampStaffNotes('');
      loadCampStaff(selectedCampId);
    } catch (err: any) {
      setCampStaffError(err.message);
    } finally {
      setAssigningCampStaff(false);
    }
  };

  const handleRevokeCampStaff = async (assignmentId: string) => {
    if (!selectedCampId || !confirm("Are you sure you want to revoke this staff member's camp assignment?")) return;

    try {
      const res = await authFetch(`/api/v1/camps/${selectedCampId}/staff/${assignmentId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to revoke assignment');

      setCampStaffSuccess('Camp staff assignment revoked.');
      loadCampStaff(selectedCampId);
    } catch (err: any) {
      setCampStaffError(err.message);
    }
  };

  // Staff Assignment & Deactivation
  const handleAssignStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg || !newStaffPhone.trim()) return;

    setAssigning(true);
    setAssignError(null);
    setAssignSuccess(null);

    try {
      const res = await authFetch(`/api/v1/organisations/${activeOrg.organisationId}/staff`, {
        method: 'POST',
        body: JSON.stringify({
          phoneOrUserId: newStaffPhone.trim(),
          role: newStaffRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to assign staff');

      setAssignSuccess(`Staff member assigned successfully as ${newStaffRole}.`);
      setNewStaffPhone('');

      const staffRes = await authFetch(`/api/v1/organisations/${activeOrg.organisationId}/staff`);
      if (staffRes.ok) {
        const staffData = await staffRes.json();
        setStaff(staffData.data || []);
      }
    } catch (err: any) {
      setAssignError(err.message || 'Error assigning staff');
    } finally {
      setAssigning(false);
    }
  };

  const handleDeactivateStaff = async (membershipId: string) => {
    if (!activeOrg || !window.confirm('Are you sure you want to deactivate this staff member?')) return;

    try {
      const target = staff.find((s) => s.membershipId === membershipId);
      if (!target) return;

      const res = await authFetch(`/api/v1/organisations/${activeOrg.organisationId}/staff/${target.userId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error?.message || 'Failed to deactivate staff member');
        return;
      }

      setStaff((prev) =>
        prev.map((s) => (s.membershipId === membershipId ? { ...s, isActive: false } : s))
      );
    } catch (err: any) {
      alert(err.message || 'Error deactivating staff');
    }
  };

  // Handover manifest actions
  const handleCreateDraftManifest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg || !newManifestCampId || !newManifestReceivingOrgId) return;

    setCreatingManifestLoading(true);
    setHandoverActionError(null);
    setHandoverActionSuccess(null);

    try {
      const res = await authFetch('/api/v1/manifests', {
        method: 'POST',
        body: JSON.stringify({
          sourceCampId: newManifestCampId,
          sendingOrgId: activeOrg.organisationId,
          receivingOrgId: newManifestReceivingOrgId,
          collectionUnitIds: selectedUnitIdsForManifest.length > 0 ? selectedUnitIdsForManifest : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to create handover manifest');

      setHandoverActionSuccess(`Draft manifest ${data.data.manifestNumber} created with ${data.data.itemCount || 0} unit(s)!`);
      setShowCreateManifestModal(false);
      setSelectedUnitIdsForManifest([]);
      loadManifests();
      loadCollectionUnits();
      setSelectedManifestId(data.data.id);
    } catch (err: any) {
      setHandoverActionError(err.message);
    } finally {
      setCreatingManifestLoading(false);
    }
  };

  const handleFinaliseManifest = async (manifestId: string) => {
    if (!confirm('Are you sure you want to finalise this manifest? The unit list will be locked.')) return;

    setHandoverActionError(null);
    setHandoverActionSuccess(null);

    try {
      const res = await authFetch(`/api/v1/manifests/${manifestId}/finalise`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to finalise manifest');

      setHandoverActionSuccess(`Manifest ${data.data.manifestNumber} finalised! Ready for physical dispatch.`);
      loadManifests();
      loadManifestDetail(manifestId);
    } catch (err: any) {
      setHandoverActionError(err.message);
    }
  };

  const handleDispatchManifest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedManifest) return;

    setDispatchingLoading(true);
    setHandoverActionError(null);
    setHandoverActionSuccess(null);

    try {
      const res = await authFetch(`/api/v1/manifests/${selectedManifest.id}/dispatch`, {
        method: 'POST',
        body: JSON.stringify({
          carrierName: dispatchCarrier,
          vehicleNumber: dispatchVehicle,
          driverName: dispatchDriver,
          driverContact: dispatchContact,
          departureTempCelsius: Number(dispatchTemp),
          sealsVerified: dispatchSealsVerified,
          dispatchNotes: dispatchNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to record physical dispatch');

      setHandoverActionSuccess(`Manifest ${data.data.manifestNumber} is now IN TRANSIT.`);
      setShowDispatchModal(false);
      loadManifests();
      loadManifestDetail(selectedManifest.id);
      loadCollectionUnits();
    } catch (err: any) {
      setHandoverActionError(err.message);
    } finally {
      setDispatchingLoading(false);
    }
  };

  const handleReceiveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedManifest || !receivingItem) return;

    setReceivingLoading(true);
    setHandoverActionError(null);
    setHandoverActionSuccess(null);

    try {
      const res = await authFetch(`/api/v1/manifests/${selectedManifest.id}/items/${receivingItem.id}/receive`, {
        method: 'POST',
        body: JSON.stringify({
          outcome: receiveOutcome,
          notes: receiveNotes.trim() || undefined,
          recordedTempCelsius: Number(recordedTempCelsius),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to record item verification');

      setHandoverActionSuccess(`Unit ${receivingItem.collectionUnit?.unitNumber || ''} verified as ${receiveOutcome}.`);
      setShowReceiveModal(false);
      setReceivingItem(null);
      setReceiveNotes('');
      loadManifestDetail(selectedManifest.id);
      loadManifests();
      loadCollectionUnits();
    } catch (err: any) {
      setHandoverActionError(err.message);
    } finally {
      setReceivingLoading(false);
    }
  };

  const handleReceiveUnexpectedBag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedManifest || !unexpectedUnitNumber.trim()) return;

    setUnexpectedLoading(true);
    setHandoverActionError(null);
    setHandoverActionSuccess(null);

    try {
      const res = await authFetch(`/api/v1/manifests/${selectedManifest.id}/unexpected`, {
        method: 'POST',
        body: JSON.stringify({
          unitIdentifier: unexpectedUnitNumber.trim(),
          outcome: unexpectedOutcome,
          notes: unexpectedNotes.trim() || 'Unexpected collection bag physically identified at receiving centre',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to record unexpected bag');

      setHandoverActionSuccess(`Unexpected unit ${unexpectedUnitNumber} logged and placed in quarantine.`);
      setShowUnexpectedModal(false);
      setUnexpectedUnitNumber('');
      setUnexpectedNotes('');
      loadManifestDetail(selectedManifest.id);
      loadManifests();
    } catch (err: any) {
      setHandoverActionError(err.message);
    } finally {
      setUnexpectedLoading(false);
    }
  };

  const handleResolveException = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedManifest || !resolvingException || !resolutionNotes.trim()) return;

    setResolvingLoading(true);
    setHandoverActionError(null);
    setHandoverActionSuccess(null);

    try {
      const res = await authFetch(`/api/v1/manifests/${selectedManifest.id}/exceptions/${resolvingException.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          resolutionNotes: resolutionNotes.trim(),
          status: resolutionTargetStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to resolve discrepancy');

      setHandoverActionSuccess(
        resolutionTargetStatus === 'WAIVED'
          ? 'Discrepancy exception formally waived with regulatory audit justification.'
          : 'Reconciliation exception marked as resolved.'
      );
      setShowResolveModal(false);
      setResolvingException(null);
      setResolutionNotes('');
      loadManifestDetail(selectedManifest.id);
      loadManifests();
      loadCollectionUnits();
      loadCollectionOverview();
    } catch (err: any) {
      setHandoverActionError(err.message);
    } finally {
      setResolvingLoading(false);
    }
  };

  const handleReconcileManifest = async (manifestId: string) => {
    if (!confirm('Reconcile this manifest? If all units are verified and exceptions resolved, accepted units will be posted to blood bank inventory.')) return;

    setReconcilingLoading(true);
    setHandoverActionError(null);
    setHandoverActionSuccess(null);

    try {
      const res = await authFetch(`/api/v1/manifests/${manifestId}/reconcile`, {
        method: 'POST',
        body: JSON.stringify({
          reconciliationNotes: reconcileNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to reconcile manifest');

      setHandoverActionSuccess(`Manifest ${data.data.manifestNumber} reconciled successfully! Status: ${data.data.status}. Accepted units posted to received-awaiting-processing inventory.`);
      setReconcileNotes('');
      loadManifests();
      loadManifestDetail(manifestId);
      loadCollectionUnits();
      loadCollectionOverview();
    } catch (err: any) {
      setHandoverActionError(err.message);
    } finally {
      setReconcilingLoading(false);
    }
  };

  // Platform Admin review
  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppForReview) return;

    setSubmittingReview(true);
    setReviewSuccessMessage(null);
    setReviewErrorMessage(null);

    try {
      const res = await authFetch(`/api/v1/organisations/applications/${selectedAppForReview.id}/review`, {
        method: 'POST',
        body: JSON.stringify({
          status: reviewAction,
          orgCode: reviewAction === 'APPROVED' ? customOrgCode.trim() || undefined : undefined,
          reviewNotes: reviewNotesInput.trim() || (reviewAction === 'APPROVED' ? 'Approved by Platform Administrator' : 'Rejected by Platform Administrator'),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Review submission failed');

      setReviewSuccessMessage(`Application ${reviewAction.toLowerCase()} successfully!`);
      setSelectedAppForReview(null);
      setReviewNotesInput('');
      setCustomOrgCode('');
      loadApplications(appFilterStatus);
    } catch (err: any) {
      setReviewErrorMessage(err.message);
    } finally {
      setSubmittingReview(false);
    }
  };

  // Derived counts for navigation badges
  const pendingProposalsCount = useMemo(() => camps.filter((c) => c.status === 'PROPOSED').length, [camps]);
  const approvedCampsCount = useMemo(() => camps.filter((c) => c.status === 'APPROVED').length, [camps]);
  const activeDiscrepanciesCount = useMemo(() => collectionOverview?.discrepancies?.length || 0, [collectionOverview]);

  // Sidebar navigation destinations
  const navItems: { id: OrgPortalTab; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; count?: number; badgeColor?: string; adminOnly?: boolean }[] = [
    { id: 'overview', label: 'Overview', icon: IconDashboard },
    { id: 'proposals', label: 'Camp Proposals', icon: IconProposals, count: pendingProposalsCount, badgeColor: 'bg-amber-100 text-amber-800' },
    { id: 'camps', label: 'Camps & Collections', icon: IconCamps, count: approvedCampsCount, badgeColor: 'bg-emerald-100 text-emerald-800' },
    { id: 'inventory', label: 'Inventory', icon: IconInventory, count: collectionOverview?.summary?.totalAvailableComponents, badgeColor: 'bg-purple-100 text-purple-800' },
    { id: 'lab', label: 'Laboratory & Release', icon: IconLab, count: collectionOverview?.summary?.totalQuarantinedUnits, badgeColor: 'bg-blue-100 text-blue-800' },
    { id: 'handover', label: 'Handover & Receipt', icon: IconHandover, count: activeDiscrepanciesCount > 0 ? activeDiscrepanciesCount : manifests.length, badgeColor: activeDiscrepanciesCount > 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700' },
    { id: 'requests', label: 'Hospital Requests', icon: IconHospital },
    { id: 'reports', label: 'Reports & Analytics', icon: IconReports },
    { id: 'staff', label: 'Staff & Access', icon: IconStaff, count: staff.length },
    { id: 'settings', label: 'Organisation Settings', icon: IconSettings },
    ...(isPlatformAdmin ? [{ id: 'applications' as OrgPortalTab, label: 'Applications Review', icon: IconApplications, count: applications.filter((a) => a.status === 'PENDING').length, badgeColor: 'bg-purple-100 text-purple-800', adminOnly: true }] : []),
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-slate-300 border-t-[#C51F3A] rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold text-slate-600">Loading Blood Bank Workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row text-slate-800">
      {/* ======================================================== */}
      {/* 1. PERSISTENT DESKTOP SIDEBAR (lg:flex)                 */}
      {/* ======================================================== */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-white border-r border-slate-200 shrink-0 sticky top-0 h-screen select-none z-30">
        {/* Subtle Workspace Context Header */}
        <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Blood Bank Workspace
          </span>
          <span className="w-2 h-2 rounded-full bg-emerald-500" title="Workspace Active" />
        </div>

        {/* Organisation Switcher (if multiple organisations assigned) */}
        {memberships.length > 1 && (
          <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/50">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              Active Centre
            </label>
            <select
              value={activeOrgIndex}
              onChange={(e) => setActiveOrgIndex(Number(e.target.value))}
              className="w-full text-xs font-semibold py-1.5 px-2 bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-hidden"
            >
              {memberships.map((m, idx) => (
                <option key={m.membershipId} value={idx}>
                  {m.organisationName}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all cursor-pointer group ${
                  isActive
                    ? 'bg-red-50 text-[#C51F3A] font-bold border-l-2 border-[#C51F3A]'
                    : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 font-medium'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon size={18} className={isActive ? 'text-[#C51F3A]' : 'text-slate-400 group-hover:text-slate-600'} />
                  <span>{item.label}</span>
                </div>
                {item.count !== undefined && item.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    isActive ? 'bg-[#C51F3A]/10 text-[#C51F3A]' : item.badgeColor || 'bg-slate-100 text-slate-600'
                  }`}>
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User Identity & Sign Out Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/50">
          <div className="flex items-center justify-between mb-2">
            <div className="min-w-0">
              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                isAdmin ? 'bg-purple-100 text-purple-800' :
                isClinicalStaff ? 'bg-emerald-100 text-emerald-800' :
                isInventoryStaff ? 'bg-blue-100 text-blue-800' :
                'bg-amber-100 text-amber-800'
              }`}>
                {activeOrg?.role || (isPlatformAdmin ? 'PLATFORM_ADMIN' : 'USER')}
              </span>
            </div>
            <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} title={isLive ? 'Real-time connected' : 'Connecting'} />
          </div>

          <button
            onClick={handleSignOut}
            className="w-full py-1.5 px-3 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer text-center"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* ======================================================== */}
      {/* 2. MAIN APPLICATION CONTENT AREA                         */}
      {/* ======================================================== */}
      <div className="flex-1 flex flex-col min-w-0 pb-24 lg:pb-10">
        {/* Compact Application Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-20 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                  {collectionOverview?.organisation?.orgCode || activeOrg?.orgCode || 'RS-NAT'}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800">
                  CDSCO Licensed Centre
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                  isLive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                  {isLive ? 'Live' : 'Syncing'}
                </span>
              </div>
              <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate mt-0.5">
                {collectionOverview?.organisation?.name || activeOrg?.organisationName || 'National Centre Governance'}
              </h1>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={loadCollectionOverview}
              disabled={loadingOverview}
              title="Refresh operational overview"
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span className={loadingOverview ? 'animate-spin inline-block' : ''}>↻</span>
              <span className="hidden sm:inline">Refresh Data</span>
            </button>

            {isCollectionStaff && !isAuditor && (
              <Link
                href="/organisation/register-camp"
                className="px-3 py-1.5 bg-[#C51F3A] hover:bg-[#A8172E] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1"
              >
                <span>+</span>
                <span className="hidden sm:inline">Schedule Camp</span>
              </Link>
            )}

            <button
              onClick={handleSignOut}
              className="lg:hidden px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Exit
            </button>
          </div>
        </header>

        {/* Global Feedback Banners */}
        <div className="px-4 sm:px-6 pt-4 space-y-2">
          {isAuditor && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 flex items-center gap-2">
              <span className="font-bold text-blue-700">ℹ</span>
              <span>Auditor Read-Only Mode: You have inspection privileges. Operational modifications and unit creation are restricted.</span>
            </div>
          )}

          {realtimeNotice && (
            <div className="bg-slate-900 text-white rounded-xl p-2.5 text-xs font-medium flex items-center justify-between shadow-xs">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                <span>{realtimeNotice.message}</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">{realtimeNotice.timestamp}</span>
            </div>
          )}

          {campActionMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center justify-between shadow-xs font-semibold">
              <span>✓ {campActionMessage}</span>
              <button onClick={() => setCampActionMessage(null)} className="text-emerald-700 hover:text-emerald-900 font-bold ml-2">✕</button>
            </div>
          )}

          {campActionError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-center justify-between shadow-xs font-semibold">
              <span>⚠ {campActionError}</span>
              <button onClick={() => setCampActionError(null)} className="text-red-700 hover:text-red-900 font-bold ml-2">✕</button>
            </div>
          )}

          {handoverActionSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center justify-between shadow-xs font-semibold">
              <span>✓ {handoverActionSuccess}</span>
              <button onClick={() => setHandoverActionSuccess(null)} className="text-emerald-700 hover:text-emerald-900 font-bold ml-2">✕</button>
            </div>
          )}

          {handoverActionError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-center justify-between shadow-xs font-semibold">
              <span>⚠ {handoverActionError}</span>
              <button onClick={() => setHandoverActionError(null)} className="text-red-700 hover:text-red-900 font-bold ml-2">✕</button>
            </div>
          )}
        </div>

        {/* Dynamic Page Workspace Content */}
        <main className="p-4 sm:px-6 space-y-6 max-w-7xl w-full mx-auto">
          {/* ======================================================== */}
          {/* VIEW 1: OVERVIEW                                         */}
          {/* ======================================================== */}
          {activeTab === 'overview' && (
            <div className="space-y-6">

              {overviewError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-800">
                  ⚠ {overviewError}
                </div>
              )}

              {/* 6 Key Operational Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <button
                  onClick={() => setActiveTab('proposals')}
                  className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 text-left hover:border-amber-400 transition-colors cursor-pointer shadow-xs"
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Pending Proposals</div>
                  <div className="text-xl font-black text-amber-950 mt-1">
                    {pendingProposalsCount}
                  </div>
                  <div className="text-[10px] text-amber-700 mt-0.5">Awaiting review →</div>
                </button>

                <button
                  onClick={() => setActiveTab('camps')}
                  className="bg-white p-4 rounded-xl border border-slate-200 text-left hover:border-slate-400 transition-colors cursor-pointer shadow-xs"
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Scheduled Camps</div>
                  <div className="text-xl font-black text-slate-900 mt-1">
                    {approvedCampsCount}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Active donation drives →</div>
                </button>

                <button
                  onClick={() => setActiveTab('handover')}
                  className="bg-white p-4 rounded-xl border border-blue-200 bg-blue-50/20 text-left hover:border-blue-400 transition-colors cursor-pointer shadow-xs"
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-blue-800">In Transit</div>
                  <div className="text-xl font-black text-blue-900 mt-1">
                    {collectionOverview?.summary?.totalInTransitUnits ?? 0}
                  </div>
                  <div className="text-[10px] text-blue-700 mt-0.5">Awaiting intake →</div>
                </button>

                <button
                  onClick={() => setActiveTab('handover')}
                  className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 text-left hover:border-emerald-400 transition-colors cursor-pointer shadow-xs"
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">Received &amp; Reconciled</div>
                  <div className="text-xl font-black text-emerald-900 mt-1">
                    {collectionOverview?.summary?.totalReceivedUnits ?? 0}
                  </div>
                  <div className="text-[10px] text-emerald-700 mt-0.5">Verified custody →</div>
                </button>

                <button
                  onClick={() => setActiveTab('lab')}
                  className="bg-white p-4 rounded-xl border border-purple-200 bg-purple-50/20 text-left hover:border-purple-400 transition-colors cursor-pointer shadow-xs"
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-purple-800">Quarantine &amp; Lab</div>
                  <div className="text-xl font-black text-purple-900 mt-1">
                    {collectionOverview?.summary?.totalQuarantinedUnits ?? 0}
                  </div>
                  <div className="text-[10px] text-purple-700 mt-0.5">Viral testing queue →</div>
                </button>

                <button
                  onClick={() => setActiveTab('inventory')}
                  className="bg-white p-4 rounded-xl border border-[#B91C32]/30 bg-red-50/20 text-left hover:border-[#B91C32] transition-colors cursor-pointer shadow-xs"
                >
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#B91C32]">Released Inventory</div>
                  <div className="text-xl font-black text-[#B91C32] mt-1">
                    {collectionOverview?.summary?.totalAvailableComponents ?? 0}
                  </div>
                  <div className="text-[10px] text-red-700 mt-0.5">Ready for clinical issue →</div>
                </button>
              </div>

              {/* Priority Operational Actions Shortcuts */}
              <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold">Priority Operational Workflows</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Fast shortcuts to pending administrative, intake, and laboratory responsibilities.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {pendingProposalsCount > 0 && (
                    <button
                      onClick={() => setActiveTab('proposals')}
                      className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-900 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                    >
                      <span>📑 Review {pendingProposalsCount} Proposal(s)</span>
                    </button>
                  )}
                  {collectionOverview?.pendingManifests && collectionOverview.pendingManifests.length > 0 && (
                    <button
                      onClick={() => setActiveTab('handover')}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                    >
                      <span>🚚 Reconcile Inbound Manifests</span>
                    </button>
                  )}
                  <button
                    onClick={() => setActiveTab('lab')}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all border border-slate-700 cursor-pointer flex items-center gap-1.5"
                  >
                    <span>🔬 Lab Testing &amp; Release</span>
                  </button>
                </div>
              </div>

              {/* Custody Discrepancy Alert Box */}
              {collectionOverview?.discrepancies && collectionOverview.discrepancies.length > 0 && (
                <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 shadow-xs">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base">⚠️</span>
                      <h3 className="text-sm font-bold text-amber-950">
                        {collectionOverview.discrepancies.length} Unresolved Custody Discrepanc{collectionOverview.discrepancies.length === 1 ? 'y' : 'ies'}
                      </h3>
                    </div>
                    <button
                      onClick={() => setActiveTab('handover')}
                      className="text-xs font-bold text-amber-900 hover:text-amber-950 bg-amber-200/80 hover:bg-amber-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      Resolve in Handover Console →
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-amber-200 text-amber-900 font-bold uppercase tracking-wider text-[10px]">
                          <th className="py-2 px-3">Manifest</th>
                          <th className="py-2 px-3">Unit</th>
                          <th className="py-2 px-3">Category</th>
                          <th className="py-2 px-3">Severity</th>
                          <th className="py-2 px-3">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-200/50">
                        {collectionOverview.discrepancies.map((d: any) => (
                          <tr key={d.id} className="hover:bg-amber-100/40">
                            <td className="py-2.5 px-3 font-mono font-bold text-amber-950">
                              {d.manifest?.manifestNumber || 'Manifest'}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-amber-900">
                              {d.collectionUnit?.unitNumber || d.unitIdentifier || 'Unknown Unit'}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-amber-950">
                              {d.category}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                d.severity === 'CRITICAL' ? 'bg-red-200 text-red-900' : 'bg-amber-200 text-amber-900'
                              }`}>
                                {d.severity}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-amber-900">
                              {d.details}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Compact Blood Group Intake Summary */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Active Blood Collections Intake by Group</h3>
                    <p className="text-xs text-slate-500">Summary of units received and accepted into bank custody.</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('reports')}
                    className="text-xs font-bold text-[#B91C32] hover:text-[#9B1324] flex items-center gap-1 cursor-pointer"
                  >
                    <span>View Full Blood-Group Analytics Report</span>
                    <span>→</span>
                  </button>
                </div>

                {(!Array.isArray(collectionOverview?.receivedByBloodGroup) || collectionOverview.receivedByBloodGroup.length === 0) ? (
                  <div className="text-center py-6 text-xs text-slate-500">
                    No physical blood unit receipts recorded yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
                    {collectionOverview.receivedByBloodGroup.map((item: any) => (
                      <div key={item.bloodGroup || item.groupKey} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                        <div className="text-sm font-black text-slate-900">{item.bloodGroup}</div>
                        <div className="text-xs font-bold text-[#B91C32] mt-0.5">{item.receivedUnitsCount || 0} unit(s)</div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">{item.receivedVolumeMl || 0} mL</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW 2: CAMP PROPOSALS                                    */}
          {/* ======================================================== */}
          {activeTab === 'proposals' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Camp Drive Proposals &amp; Approval</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Review incoming mobile camp proposals, verify medical safety feasibility, and activate authorized drives.
                  </p>
                </div>
                {isCollectionStaff && !isAuditor && (
                  <Link
                    href="/organisation/register-camp"
                    className="px-4 py-2 bg-[#B91C32] hover:bg-[#9B1324] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1 shrink-0"
                  >
                    <span>+</span> Schedule New Camp
                  </Link>
                )}
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-2 flex-wrap">
                {(['PROPOSED', 'ALL', 'APPROVED', 'REJECTED'] as const).map((status) => {
                  const count = status === 'ALL'
                    ? camps.length
                    : camps.filter((c) => c.status === status).length;
                  return (
                    <button
                      key={status}
                      onClick={() => setProposalFilter(status)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        proposalFilter === status
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span>{status === 'PROPOSED' ? 'Pending Review' : status === 'ALL' ? 'All Proposals' : status}</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                        proposalFilter === status ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Proposals List */}
              {loadingCamps ? (
                <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-slate-300 border-t-[#B91C32] mb-2" />
                  <p className="text-xs text-slate-500 font-medium">Loading proposals...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {camps
                    .filter((c) => proposalFilter === 'ALL' || c.status === proposalFilter)
                    .map((proposal) => {
                      const isPending = proposal.status === 'PROPOSED';
                      return (
                        <div
                          key={proposal.id}
                          className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                                {proposal.campCode}
                              </span>
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                proposal.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                                proposal.status === 'PROPOSED' ? 'bg-amber-100 text-amber-800' :
                                'bg-red-100 text-red-800'
                              }`}>
                                {proposal.status === 'PROPOSED' ? 'AWAITING REVIEW' : proposal.status}
                              </span>
                            </div>

                            <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{proposal.title}</h3>
                            <p className="text-xs text-slate-500 mt-1">📍 {proposal.venue}</p>

                            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
                              <div>
                                <span className="text-[10px] text-slate-400 font-bold uppercase block">Target Date</span>
                                <span className="text-slate-800 font-medium">📅 {new Date(proposal.targetDate).toLocaleDateString()}</span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-400 font-bold uppercase block">Expected Turnout</span>
                                <span className="text-slate-800 font-bold">👥 {proposal.expectedDonors} donors</span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-400 font-bold uppercase block">Organizer</span>
                                <span className="text-slate-800 truncate block">{proposal.organizerName}</span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-400 font-bold uppercase block">Contact Phone</span>
                                <span className="font-mono text-slate-800">{proposal.coordinatorContact || '—'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                            <button
                              onClick={() => setReviewingProposal(proposal)}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                            >
                              View Details
                            </button>

                            {isPending && (isAdmin || isPlatformAdmin) && (
                              <div className="flex items-center gap-1.5">
                                <button
                                  disabled={statusUpdatingCampId === proposal.id}
                                  onClick={() => handleUpdateCampStatus(proposal.id, 'APPROVED')}
                                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-xs"
                                >
                                  {statusUpdatingCampId === proposal.id ? 'Approving...' : '✓ Approve'}
                                </button>
                                <button
                                  disabled={statusUpdatingCampId === proposal.id}
                                  onClick={() => setProposalToReject(proposal)}
                                  className="px-3 py-1.5 bg-red-100 hover:bg-red-200 disabled:opacity-50 text-red-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                                >
                                  Reject
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW 3: CAMPS & COLLECTIONS                              */}
          {/* ======================================================== */}
          {activeTab === 'camps' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Approved Camps &amp; Collection Drives</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Oversight of active donation camps, mobile staffing delegation, and operational collection progress.
                  </p>
                </div>
                {isCollectionStaff && !isAuditor && (
                  <Link
                    href="/organisation/register-camp"
                    className="px-4 py-2 bg-[#B91C32] hover:bg-[#9B1324] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1 shrink-0"
                  >
                    <span>+</span> Schedule New Camp
                  </Link>
                )}
              </div>

              {/* Camp Filters & Search */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <input
                  type="text"
                  placeholder="Search camp by title, code, venue..."
                  value={campSearchTerm}
                  onChange={(e) => setCampSearchTerm(e.target.value)}
                  className="p-2.5 bg-white border border-slate-200 rounded-xl text-xs w-full sm:w-72"
                />

                <div className="flex items-center gap-1.5">
                  {(['APPROVED', 'ALL', 'COMPLETED', 'CANCELLED'] as const).map((status) => (
                    <button
                      key={status}
                      onClick={() => setCampStatusFilter(status)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        campStatusFilter === status
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {status === 'APPROVED' ? 'Active / Scheduled' : status}
                    </button>
                  ))}
                </div>
              </div>

              {/* Camp Roster Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {camps
                  .filter((c) => {
                    if (campStatusFilter !== 'ALL' && c.status !== campStatusFilter) return false;
                    if (campSearchTerm.trim()) {
                      const q = campSearchTerm.toLowerCase().trim();
                      return (
                        c.title.toLowerCase().includes(q) ||
                        c.campCode.toLowerCase().includes(q) ||
                        c.venue.toLowerCase().includes(q)
                      );
                    }
                    return true;
                  })
                  .map((camp) => (
                    <div
                      key={camp.id}
                      className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            {camp.campCode}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            camp.status === 'COMPLETED' ? 'bg-slate-900 text-white' :
                            camp.isReadyForCollection ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {camp.status === 'COMPLETED' ? '● Closed & Archived' : camp.isReadyForCollection ? '✓ Ready' : '⏳ Readiness Check'}
                          </span>
                        </div>

                        <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{camp.title}</h3>
                        <p className="text-xs text-slate-500 mt-1">📍 {camp.venue}</p>

                        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                          <span className="text-slate-600">📅 {new Date(camp.targetDate).toLocaleDateString()}</span>
                          <span className="font-bold text-slate-800">Target: {camp.expectedDonors}</span>
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                        <Link
                          href={`/camp/dashboard?campId=${camp.id}`}
                          className="px-3 py-1.5 bg-[#B91C32] hover:bg-[#9B1324] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1"
                        >
                          <span>⛺ Open Workspace ↗</span>
                        </Link>

                        {(isAdmin || isPlatformAdmin) && (
                          <button
                            onClick={() => {
                              setSelectedCampId(camp.id);
                              setShowCampStaffModal(true);
                              loadCampStaff(camp.id);
                            }}
                            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                          >
                            👥 Staff Roster
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW 4: INVENTORY                                        */}
          {/* ======================================================== */}
          {activeTab === 'inventory' && activeOrg && (
            <div className="space-y-6">
              <ProcessingAndInventoryView
                key={activeOrg.organisationId}
                organisationId={activeOrg.organisationId}
                userRole={activeOrg.role}
                isAdmin={isAdmin}
                isAuditor={isAuditor}
                refreshSignal={inventoryRefreshSignal}
                initialSubTab="inventory"
              />
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW 5: LABORATORY & RELEASE                             */}
          {/* ======================================================== */}
          {activeTab === 'lab' && activeOrg && (
            <div className="space-y-6">
              <ProcessingAndInventoryView
                key={activeOrg.organisationId}
                organisationId={activeOrg.organisationId}
                userRole={activeOrg.role}
                isAdmin={isAdmin}
                isAuditor={isAuditor}
                refreshSignal={inventoryRefreshSignal}
                initialSubTab="lab"
              />
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW 6: HANDOVER & RECEIPT                               */}
          {/* ======================================================== */}
          {activeTab === 'handover' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Physical Handover &amp; Cold-Chain Transport</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Custody transfer verification, intake thermometer logging, discrepancy logging, and inventory reconciliation.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {canCreateManifest && (
                    <button
                      onClick={() => {
                        const validSourceCamps = camps.filter((c) => ['APPROVED', 'COMPLETED'].includes(c.status));
                        if (validSourceCamps.length > 0) setNewManifestCampId(validSourceCamps[0].id);
                        if (verifiedCentres.length > 0) {
                          const target = verifiedCentres.find((c) => c.id !== activeOrg?.organisationId);
                          if (target) setNewManifestReceivingOrgId(target.id);
                        }
                        setShowCreateManifestModal(true);
                      }}
                      className="px-3.5 py-2 bg-[#B91C32] hover:bg-[#9B1324] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                    >
                      <span>+ Create Manifest</span>
                    </button>
                  )}
                  <button
                    onClick={loadManifests}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    ↻ Refresh
                  </button>
                </div>
              </div>

              {/* Filter Toggle */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setHandoverDirection('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    handoverDirection === 'all'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  All Manifests ({manifests.length})
                </button>
                <button
                  onClick={() => setHandoverDirection('outbound')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    handoverDirection === 'outbound'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Outbound (From Our Camps) ({manifests.filter((m) => m.sourceCampId || m.sendingOrgId === activeOrg?.organisationId).length})
                </button>
                <button
                  onClick={() => setHandoverDirection('inbound')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    handoverDirection === 'inbound'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Inbound (Awaiting Intake Here) ({manifests.filter((m) => m.receivingOrgId === activeOrg?.organisationId).length})
                </button>
              </div>

              {/* Manifests List */}
              {loadingManifests ? (
                <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-slate-300 border-t-[#B91C32] mb-2" />
                  <p className="text-xs text-slate-500 font-medium">Loading handover manifests...</p>
                </div>
              ) : manifests.length === 0 ? (
                <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 space-y-2">
                  <p className="text-sm font-bold text-slate-700">No handover manifests found</p>
                  <p className="text-xs text-slate-500">
                    Create a draft manifest to group collected units from an approved camp for physical transport to a blood bank.
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                        <tr>
                          <th className="p-3">Manifest Number</th>
                          <th className="p-3">Direction</th>
                          <th className="p-3">Source Camp</th>
                          <th className="p-3">Destination Centre</th>
                          <th className="p-3 text-center">Units</th>
                          <th className="p-3 text-center">Status</th>
                          <th className="p-3">Created At</th>
                          <th className="p-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {manifests
                          .filter((m) => {
                            if (handoverDirection === 'outbound') return m.sourceCampId || m.sendingOrgId === activeOrg?.organisationId;
                            if (handoverDirection === 'inbound') return m.receivingOrgId === activeOrg?.organisationId;
                            return true;
                          })
                          .map((m) => {
                            const isInbound = m.receivingOrgId === activeOrg?.organisationId;
                            const isSelected = selectedManifestId === m.id;
                            return (
                              <tr
                                key={m.id}
                                className={`hover:bg-slate-50/80 transition-colors ${
                                  isSelected ? 'bg-amber-50/40 font-semibold' : ''
                                }`}
                              >
                                <td className="p-3 font-mono font-bold text-slate-900">
                                  {m.manifestNumber}
                                </td>
                                <td className="p-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    isInbound ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                                  }`}>
                                    {isInbound ? (m.sourceCampId ? 'Inbound (Camp)' : 'Inbound') : 'Outbound'}
                                  </span>
                                </td>
                                <td className="p-3 font-medium text-slate-800">
                                  {m.sourceCamp?.title || 'Community Camp'}
                                </td>
                                <td className="p-3 text-slate-600">
                                  {m.receivingOrg?.name || 'Blood Centre'}
                                </td>
                                <td className="p-3 text-center font-bold text-slate-900">
                                  {m.itemCount ?? m.items?.length ?? 0}
                                </td>
                                <td className="p-3 text-center">
                                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                    m.status === 'RECONCILED' ? 'bg-emerald-100 text-emerald-800' :
                                    m.status === 'RECEIVED_WITH_DISCREPANCIES' ? 'bg-red-100 text-red-800' :
                                    m.status === 'PARTIALLY_RECEIVED' ? 'bg-amber-100 text-amber-800' :
                                    m.status === 'DISPATCHED' ? 'bg-purple-100 text-purple-800' :
                                    'bg-slate-100 text-slate-700'
                                  }`}>
                                    {m.status === 'DISPATCHED' ? 'IN TRANSIT' : m.status}
                                  </span>
                                </td>
                                <td className="p-3 text-slate-500 text-[11px]">
                                  {new Date(m.createdAt).toLocaleDateString()}
                                </td>
                                <td className="p-3 text-right">
                                  <button
                                    onClick={() => setSelectedManifestId(m.id)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                      isSelected
                                        ? 'bg-slate-900 text-white'
                                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                    }`}
                                  >
                                    {isSelected ? 'Active Workbench' : 'Open Workbench'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Active Manifest Workbench Drilldown */}
              {selectedManifest && (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-black text-slate-900">
                          {selectedManifest.manifestNumber}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          selectedManifest.status === 'RECONCILED' ? 'bg-emerald-100 text-emerald-800' :
                          selectedManifest.status === 'RECEIVED_WITH_DISCREPANCIES' ? 'bg-red-100 text-red-800' :
                          selectedManifest.status === 'DISPATCHED' ? 'bg-purple-100 text-purple-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {selectedManifest.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Source: <strong>{selectedManifest.sourceCamp?.title}</strong> → Destination: <strong>{selectedManifest.receivingOrg?.name}</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {selectedManifest.status === 'DRAFT' && canDispatchManifest && (
                        <button
                          onClick={() => handleFinaliseManifest(selectedManifest.id)}
                          className="px-3.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                        >
                          Lock &amp; Finalise
                        </button>
                      )}
                      {selectedManifest.status === 'FINALISED' && canDispatchManifest && (
                        <button
                          onClick={() => setShowDispatchModal(true)}
                          className="px-3.5 py-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                        >
                          🚚 Dispatch Shipper
                        </button>
                      )}
                      {['DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED_WITH_DISCREPANCIES'].includes(selectedManifest.status) && canReceiveItem && (
                        <button
                          onClick={() => setShowUnexpectedModal(true)}
                          className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                        >
                          + Log Unexpected Bag
                        </button>
                      )}
                      {['DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED_WITH_DISCREPANCIES'].includes(selectedManifest.status) && canReconcile && (() => {
                        const openCount = selectedManifest.exceptions?.filter(e => e.status === 'OPEN' || e.status === 'INVESTIGATING').length ?? 0;
                        const pendingCount = selectedManifest.items?.filter(i => !(i.actualOutcome || (i as any).outcome) || (i.actualOutcome || (i as any).outcome) === 'PENDING').length ?? 0;
                        const isBlocked = openCount > 0 || pendingCount > 0;
                        return (
                          <button
                            disabled={reconcilingLoading || isBlocked}
                            onClick={() => handleReconcileManifest(selectedManifest.id)}
                            className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-xs"
                            title={
                              openCount > 0
                                ? `Reconciliation blocked: ${openCount} discrepancy exception(s) require resolution or waiver`
                                : pendingCount > 0
                                ? `Reconciliation blocked: ${pendingCount} unit(s) pending physical verification`
                                : 'Complete reconciliation and post to blood bank inventory'
                            }
                          >
                            {reconcilingLoading ? 'Reconciling...' : '✓ Complete Reconciliation'}
                          </button>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Manifest Operational Metrics Strip */}
                  {(() => {
                    const totalUnits = selectedManifest.items?.length ?? 0;
                    const intactUnits = selectedManifest.items?.filter(i => (i.actualOutcome || (i as any).outcome) === 'VERIFIED_INTACT').length ?? 0;
                    const discrepantUnits = selectedManifest.items?.filter(i => ['DAMAGED', 'TEMPERATURE_EXCURSION', 'MISSING', 'MISMATCHED', 'UNEXPECTED'].includes(i.actualOutcome || (i as any).outcome)).length ?? 0;
                    const pendingUnits = selectedManifest.items?.filter(i => !(i.actualOutcome || (i as any).outcome) || (i.actualOutcome || (i as any).outcome) === 'PENDING').length ?? 0;
                    const openExceptions = selectedManifest.exceptions?.filter(e => e.status === 'OPEN' || e.status === 'INVESTIGATING').length ?? 0;

                    return (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Units</div>
                            <div className="text-xl font-black text-slate-900 mt-0.5">{totalUnits}</div>
                          </div>
                          <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl">
                            <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Verified Intact</div>
                            <div className="text-xl font-black text-emerald-800 mt-0.5">{intactUnits}</div>
                          </div>
                          <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-xl">
                            <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">Discrepancies</div>
                            <div className="text-xl font-black text-amber-800 mt-0.5">{discrepantUnits}</div>
                          </div>
                          <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl">
                            <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Pending Intake</div>
                            <div className="text-xl font-black text-blue-800 mt-0.5">{pendingUnits}</div>
                          </div>
                          <div className="p-3 bg-red-50/60 border border-red-200 rounded-xl">
                            <div className="text-[10px] font-bold text-red-700 uppercase tracking-wider">Open Exceptions</div>
                            <div className="text-xl font-black text-red-800 mt-0.5">{openExceptions}</div>
                          </div>
                        </div>

                        {/* Reconciliation Status Alerts */}
                        {openExceptions > 0 ? (
                          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs flex items-start gap-2.5 text-amber-900">
                            <span className="text-base leading-none">⚠️</span>
                            <div>
                              <strong className="font-bold">Reconciliation Blocked:</strong> {openExceptions} discrepancy exception(s) remain unresolved.
                              Every exception must be investigated and resolved or formally waived by an Org Admin before final reconciliation sign-off and inventory commitment.
                            </div>
                          </div>
                        ) : pendingUnits > 0 ? (
                          <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs flex items-start gap-2.5 text-blue-900">
                            <span className="text-base leading-none">ℹ️</span>
                            <div>
                              <strong className="font-bold">Pending Physical Intake:</strong> {pendingUnits} unit(s) have not yet been verified at physical intake. Verify all items to enable final reconciliation.
                            </div>
                          </div>
                        ) : selectedManifest.status === 'RECONCILED' ? (
                          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs flex items-start gap-2.5 text-emerald-900">
                            <span className="text-base leading-none">✓</span>
                            <div>
                              <strong className="font-bold">Reconciliation Finalised:</strong> Manifest has been reconciled. All intact units have been committed to active blood bank inventory.
                            </div>
                          </div>
                        ) : (
                          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs flex items-start gap-2.5 text-emerald-900">
                            <span className="text-base leading-none">✓</span>
                            <div>
                              <strong className="font-bold">Ready for Reconciliation:</strong> All units are accounted for and all exceptions are resolved. Click &quot;Complete Reconciliation&quot; above to commit units to inventory.
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Discrepancy Exceptions & Resolution Audit Table */}
                  {selectedManifest.exceptions && selectedManifest.exceptions.length > 0 && (
                    <div className="space-y-2.5 pt-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                          <span>Discrepancy Exceptions &amp; Audit Trail</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                            {selectedManifest.exceptions.length} Total ({selectedManifest.exceptions.filter(e => e.status === 'OPEN' || e.status === 'INVESTIGATING').length} Open)
                          </span>
                        </h3>
                      </div>
                      <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[10px] uppercase">
                            <tr>
                              <th className="p-3">Category</th>
                              <th className="p-3">Associated Unit</th>
                              <th className="p-3">Severity</th>
                              <th className="p-3">Status</th>
                              <th className="p-3">Details / Resolution Notes</th>
                              <th className="p-3 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {selectedManifest.exceptions.map((exc) => {
                              const isOpen = exc.status === 'OPEN' || exc.status === 'INVESTIGATING';
                              return (
                                <tr key={exc.id} className="hover:bg-slate-50/60">
                                  <td className="p-3 font-bold text-slate-900">
                                    {exc.category?.replace(/_/g, ' ')}
                                  </td>
                                  <td className="p-3 font-mono font-bold text-slate-700">
                                    {exc.unitIdentifier || '—'}
                                  </td>
                                  <td className="p-3">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      exc.severity === 'CRITICAL' ? 'bg-red-100 text-red-800' :
                                      exc.severity === 'WARNING' ? 'bg-amber-100 text-amber-800' :
                                      'bg-blue-100 text-blue-800'
                                    }`}>
                                      {exc.severity}
                                    </span>
                                  </td>
                                  <td className="p-3">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                      exc.status === 'RESOLVED' ? 'bg-emerald-100 text-emerald-800' :
                                      exc.status === 'WAIVED' ? 'bg-purple-100 text-purple-800' :
                                      exc.status === 'INVESTIGATING' ? 'bg-blue-100 text-blue-800' :
                                      'bg-red-100 text-red-800'
                                    }`}>
                                      {exc.status}
                                    </span>
                                  </td>
                                  <td className="p-3 text-slate-600 max-w-sm">
                                    <div className="font-medium text-slate-800">{exc.details}</div>
                                    {exc.resolutionNotes && (
                                      <div className="mt-1 text-[11px] text-emerald-800 bg-emerald-50/80 p-1.5 rounded-lg border border-emerald-100">
                                        <div className="font-bold">Resolution Justification:</div>
                                        <div>{exc.resolutionNotes}</div>
                                        {exc.resolverName && (
                                          <div className="text-[10px] text-emerald-600 mt-0.5 font-medium">
                                            Signed off by {exc.resolverName} {exc.resolvedAt ? `on ${new Date(exc.resolvedAt).toLocaleDateString()}` : ''}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td className="p-3 text-right">
                                    {isOpen && canReconcile && (
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button
                                          onClick={() => {
                                            setResolvingException(exc);
                                            setResolutionTargetStatus('RESOLVED');
                                            setResolutionNotes('');
                                            setShowResolveModal(true);
                                          }}
                                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-colors shadow-xs"
                                        >
                                          Resolve
                                        </button>
                                        <button
                                          onClick={() => {
                                            setResolvingException(exc);
                                            setResolutionTargetStatus('WAIVED');
                                            setResolutionNotes('');
                                            setShowResolveModal(true);
                                          }}
                                          className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-colors shadow-xs"
                                        >
                                          Waive
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Units Verification Table */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 mb-2">Manifest Items &amp; Physical Intake Outcomes</h3>
                    <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[10px] uppercase">
                          <tr>
                            <th className="p-3">Unit Number</th>
                            <th className="p-3">Blood Group</th>
                            <th className="p-3">Volume</th>
                            <th className="p-3">Expected Outcome</th>
                            <th className="p-3">Intake Outcome</th>
                            <th className="p-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedManifest.items?.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50/60">
                              <td className="p-3 font-mono font-bold text-slate-900">
                                {item.collectionUnit?.unitNumber || (item as any).unitNumber || (item as any).expectedUnitNumber}
                              </td>
                              <td className="p-3 font-bold text-slate-800">
                                {item.collectionUnit?.bloodGroup || (item as any).bloodGroup || '—'}
                              </td>
                              <td className="p-3 font-mono text-slate-600">
                                {(item.collectionUnit?.volumeMl ?? (item as any).volumeMl) || 450} mL
                              </td>
                              <td className="p-3 text-slate-500">
                                {item.expectedOutcome || 'VERIFIED_INTACT'}
                              </td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  item.actualOutcome === 'VERIFIED_INTACT' ? 'bg-emerald-100 text-emerald-800' :
                                  item.actualOutcome === 'DAMAGED' || item.actualOutcome === 'TEMPERATURE_EXCURSION' || item.actualOutcome === 'MISSING' || item.actualOutcome === 'MISMATCHED' ? 'bg-red-100 text-red-800' :
                                  item.actualOutcome === 'UNEXPECTED' ? 'bg-purple-100 text-purple-800' :
                                  'bg-slate-100 text-slate-600'
                                }`}>
                                  {item.actualOutcome || 'PENDING'}
                                </span>
                              </td>
                              <td className="p-3 text-right">
                                {canReceiveItem && ['DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED_WITH_DISCREPANCIES'].includes(selectedManifest.status) && (
                                  <button
                                    onClick={() => {
                                      setReceivingItem(item);
                                      setShowReceiveModal(true);
                                    }}
                                    className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-[10px] font-bold cursor-pointer"
                                  >
                                    Verify Intake
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW 7: HOSPITAL REQUESTS                                */}
          {/* ======================================================== */}
          {activeTab === 'requests' && activeOrg && (
            <div className="space-y-6">
              <HospitalIntegrationView
                organisationId={activeOrg.organisationId}
                userRole={activeOrg.role}
                isAdmin={isAdmin}
                isAuditor={isAuditor}
                refreshSignal={inventoryRefreshSignal}
              />
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW 8: REPORTS & FULL BLOOD-GROUP ANALYTICS             */}
          {/* ======================================================== */}
          {activeTab === 'reports' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Authoritative Blood-Group Analytics &amp; Ledger</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Complete 9-row ABO/Rh custody analysis, volume in mL and Liters, and verified central bank receipts.
                  </p>
                </div>
              </div>

              {/* Full Blood-Group Analytics Table */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Received Blood Collections by Group</h3>
                    <p className="text-xs text-slate-500">
                      Authoritative units physically received, verified intact, and accepted into bank inventory.
                    </p>
                  </div>
                  <div className="text-xs text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 font-medium">
                    Total Volume: <span className="font-bold text-slate-900">
                      {Array.isArray(collectionOverview?.receivedByBloodGroup)
                        ? collectionOverview.receivedByBloodGroup.reduce((acc: number, curr: any) => acc + (Number(curr.receivedVolumeMl) || 0), 0)
                        : 0} mL
                    </span> (
                    {((Array.isArray(collectionOverview?.receivedByBloodGroup)
                      ? collectionOverview.receivedByBloodGroup.reduce((acc: number, curr: any) => acc + (Number(curr.receivedVolumeMl) || 0), 0)
                      : 0) / 1000).toFixed(2)} L)
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                        <th className="py-2.5 px-4">Blood Group</th>
                        <th className="py-2.5 px-4 text-center">Received Units</th>
                        <th className="py-2.5 px-4 text-center">Volume (mL)</th>
                        <th className="py-2.5 px-4 text-center">Volume (Liters)</th>
                        <th className="py-2.5 px-4 text-right">Inventory Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {(() => {
                        const groups: any[] = Array.isArray(collectionOverview?.receivedByBloodGroup)
                          ? collectionOverview.receivedByBloodGroup
                          : [];
                        const totalVol = groups.reduce((acc, curr) => acc + (Number(curr.receivedVolumeMl) || 0), 0);

                        return groups.map((row: any) => {
                          const share = totalVol > 0 ? (((row.receivedVolumeMl || 0) / totalVol) * 100).toFixed(1) : '0.0';
                          return (
                            <tr key={row.bloodGroup || row.groupKey} className="hover:bg-slate-50/60">
                              <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-[#B91C32] inline-block" />
                                <span>{row.bloodGroup}</span>
                              </td>
                              <td className="py-3 px-4 text-center font-bold text-slate-900">
                                {row.receivedUnitsCount || 0}
                              </td>
                              <td className="py-3 px-4 text-center font-mono text-slate-700">
                                {row.receivedVolumeMl > 0 ? `${row.receivedVolumeMl} mL` : '0 mL'}
                              </td>
                              <td className="py-3 px-4 text-center font-mono text-slate-600">
                                {row.receivedVolumeMl > 0 ? `${((row.receivedVolumeMl || 0) / 1000).toFixed(2)} L` : '0.00 L'}
                              </td>
                              <td className="py-3 px-4 text-right font-bold text-slate-700">
                                {share}%
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-900">
                        <td className="py-3 px-4 uppercase text-[11px]">Total Bank Receipts</td>
                        <td className="py-3 px-4 text-center">
                          {collectionOverview?.summary?.totalReceivedUnits ?? 0}
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          {Array.isArray(collectionOverview?.receivedByBloodGroup)
                            ? collectionOverview.receivedByBloodGroup.reduce((acc: number, curr: any) => acc + (Number(curr.receivedVolumeMl) || 0), 0)
                            : 0} mL
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          {((Array.isArray(collectionOverview?.receivedByBloodGroup)
                            ? collectionOverview.receivedByBloodGroup.reduce((acc: number, curr: any) => acc + (Number(curr.receivedVolumeMl) || 0), 0)
                            : 0) / 1000).toFixed(2)} L
                        </td>
                        <td className="py-3 px-4 text-right">100.0%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Camp-Level Traceability Ledger */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 mb-2">Camp-Level Collections &amp; Traceability Ledger</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                        <th className="py-2.5 px-3">Camp Details</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                        <th className="py-2.5 px-3 text-center">Target Date</th>
                        <th className="py-2.5 px-3 text-center">Donors Attended</th>
                        <th className="py-2.5 px-3 text-center">Units Collected</th>
                        <th className="py-2.5 px-3 text-center">Units Received</th>
                        <th className="py-2.5 px-3 text-center">Received Volume</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {collectionOverview?.campCollections?.map((c: any) => (
                        <tr key={c.campId} className="hover:bg-slate-50/60">
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900">{c.title}</div>
                            <div className="text-[10px] font-mono text-slate-500">{c.campCode}</div>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              {c.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center font-mono text-slate-600">
                            {new Date(c.targetDate).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-slate-900">
                            {c.attendancesCount} / {c.expectedDonors}
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-slate-900">
                            {c.collectedUnitsCount}
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-emerald-700">
                            {c.receivedUnitsCount}
                          </td>
                          <td className="py-3 px-3 text-center font-mono text-slate-700">
                            {c.receivedVolumeMl > 0 ? `${c.receivedVolumeMl} mL` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW 9: STAFF & ACCESS                                   */}
          {/* ======================================================== */}
          {activeTab === 'staff' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Staff Membership &amp; Role Delegation</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Assign authorized staff to inventory management, phlebotomy, clinical release, or auditing roles.
                  </p>
                </div>
              </div>

              {/* Add New Staff Form */}
              {isAdmin && !isAuditor && (
                <form onSubmit={handleAssignStaff} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                  <h3 className="text-sm font-bold text-slate-900">Assign New Staff Member</h3>
                  {assignSuccess && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-medium">✓ {assignSuccess}</div>}
                  {assignError && <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl font-medium">⚠ {assignError}</div>}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Mobile Number (10 digits) or User ID
                      </label>
                      <input
                        type="text"
                        required
                        value={newStaffPhone}
                        onChange={(e) => setNewStaffPhone(e.target.value)}
                        placeholder="e.g. 9876543210"
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">Role Assignment</label>
                      <select
                        value={newStaffRole}
                        onChange={(e) => setNewStaffRole(e.target.value as any)}
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-semibold text-xs"
                      >
                        <option value="INVENTORY_STAFF">INVENTORY_STAFF (Intake, Storage, Dispatch)</option>
                        <option value="CLINICAL_STAFF">CLINICAL_STAFF (Screening, Clinical Release)</option>
                        <option value="COLLECTION_STAFF">COLLECTION_STAFF (Camp Phlebotomy, Bag Confirm)</option>
                        <option value="AUDITOR">AUDITOR (Read-only Compliance Inspection)</option>
                        <option value="ORG_ADMIN">ORG_ADMIN (Full Administrative Governance)</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={assigning}
                      className="px-4 py-2 bg-[#B91C32] hover:bg-[#9B1324] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                    >
                      {assigning ? 'Assigning...' : '+ Assign Staff'}
                    </button>
                  </div>
                </form>
              )}

              {/* Staff Roster */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800">Current Staff Members ({staff.length})</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase">
                      <tr>
                        <th className="p-3">Staff Name / ID</th>
                        <th className="p-3">Assigned Role</th>
                        <th className="p-3 text-center">Status</th>
                        <th className="p-3">Assigned Date</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {staff.map((m) => (
                        <tr key={m.membershipId} className="hover:bg-slate-50/60">
                          <td className="p-3">
                            <div className="font-bold text-slate-900">{m.name || 'Staff User'}</div>
                            <div className="text-[10px] font-mono text-slate-500">{m.userId}</div>
                          </td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800">
                              {m.role}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              m.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                            }`}>
                              {m.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="p-3 text-slate-500 text-[11px]">
                            {new Date(m.assignedAt).toLocaleDateString()}
                          </td>
                          <td className="p-3 text-right">
                            {isAdmin && m.isActive && (
                              <button
                                onClick={() => handleDeactivateStaff(m.membershipId)}
                                className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-[10px] font-bold cursor-pointer"
                              >
                                Revoke
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW 10: ORGANISATION SETTINGS                           */}
          {/* ======================================================== */}
          {activeTab === 'settings' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                <h2 className="text-base font-bold text-slate-900">Organisation Profile &amp; Regulatory Settings</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  CDSCO accreditation details, biological licensing, and system configuration.
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Centre Name</span>
                    <span className="text-sm font-bold text-slate-900">{activeOrg?.organisationName || 'National Blood Centre'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Centre Code</span>
                    <span className="text-sm font-mono font-bold text-slate-800">{activeOrg?.orgCode}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Accreditation</span>
                    <span className="text-emerald-700 font-bold">CDSCO Biological License Active</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Your Active Role</span>
                    <span className="font-bold text-slate-800">{activeOrg?.role}</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                  <div className="text-xs text-slate-500">
                    Need to modify facility accreditation or license details? Contact platform support.
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="px-4 py-2 bg-red-50 hover:bg-red-100 text-[#B91C32] rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* VIEW 11: PLATFORM APPLICATIONS REVIEW (ADMIN ONLY)       */}
          {/* ======================================================== */}
          {activeTab === 'applications' && isPlatformAdmin && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">🏛️ National Blood Centre Onboarding Applications</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Platform console for reviewing institutional blood bank onboarding applications and CDSCO compliance.
                  </p>
                </div>
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-2">
                {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setAppFilterStatus(status)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      appFilterStatus === status
                        ? 'bg-purple-700 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {status} ({applications.filter((a) => status === 'ALL' || a.status === status).length})
                  </button>
                ))}
              </div>

              {/* Applications List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {applications.map((app) => (
                  <div key={app.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-slate-500">{app.applicationNumber}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        app.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                        app.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {app.status}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-900">{app.organisationName}</h3>
                    <p className="text-xs text-slate-500">License: <strong>{app.licenseNumber}</strong></p>
                    <div className="pt-2 border-t border-slate-100 flex justify-end">
                      <button
                        onClick={() => {
                          setSelectedAppForReview(app);
                          setCustomOrgCode(app.applicationNumber.replace('APP-', 'ORG-'));
                        }}
                        className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs"
                      >
                        Review Application
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ======================================================== */}
      {/* 3. MOBILE FIXED 5-ITEM BOTTOM NAVIGATION (lg:hidden)     */}
      {/* ======================================================== */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 flex items-center justify-around shadow-lg">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'overview' ? 'text-[#C51F3A] font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <IconDashboard size={18} />
          <span className="text-[10px] mt-0.5">Home</span>
        </button>

        <button
          onClick={() => setActiveTab('camps')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'camps' ? 'text-[#C51F3A] font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <IconCamps size={18} />
          <span className="text-[10px] mt-0.5">Camps</span>
        </button>

        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'inventory' ? 'text-[#C51F3A] font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <IconInventory size={18} />
          <span className="text-[10px] mt-0.5">Inventory</span>
        </button>

        <button
          onClick={() => setActiveTab('requests')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'requests' ? 'text-[#C51F3A] font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <IconHospital size={18} />
          <span className="text-[10px] mt-0.5">Requests</span>
        </button>

        <button
          onClick={() => setShowMobileMore(true)}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all cursor-pointer ${
            showMobileMore ? 'text-[#C51F3A] font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <IconMenu size={18} />
          <span className="text-[10px] mt-0.5">More</span>
        </button>
      </nav>

      {/* ======================================================== */}
      {/* 4. MOBILE MORE DRAWER / MODAL                            */}
      {/* ======================================================== */}
      {showMobileMore && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end justify-center lg:hidden">
          <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 space-y-4 shadow-2xl border-t border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">More Destinations</h3>
              <button
                onClick={() => setShowMobileMore(false)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
              <button
                onClick={() => {
                  setActiveTab('proposals');
                  setShowMobileMore(false);
                }}
                className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-left flex items-center justify-between text-slate-700"
              >
                <div className="flex items-center gap-2">
                  <IconProposals size={16} className="text-slate-500" />
                  <span>Proposals</span>
                </div>
                {pendingProposalsCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-800 font-bold">
                    {pendingProposalsCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setActiveTab('lab');
                  setShowMobileMore(false);
                }}
                className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-left flex items-center gap-2 text-slate-700"
              >
                <IconLab size={16} className="text-slate-500" />
                <span>Laboratory</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('handover');
                  setShowMobileMore(false);
                }}
                className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-left flex items-center justify-between text-slate-700"
              >
                <div className="flex items-center gap-2">
                  <IconHandover size={16} className="text-slate-500" />
                  <span>Handover</span>
                </div>
                {activeDiscrepanciesCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-red-100 text-red-700 font-bold">
                    {activeDiscrepanciesCount}
                  </span>
                )}
              </button>

              <button
                onClick={() => {
                  setActiveTab('reports');
                  setShowMobileMore(false);
                }}
                className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-left flex items-center gap-2 text-slate-700"
              >
                <IconReports size={16} className="text-slate-500" />
                <span>Reports</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('staff');
                  setShowMobileMore(false);
                }}
                className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-left flex items-center gap-2 text-slate-700"
              >
                <IconStaff size={16} className="text-slate-500" />
                <span>Staff &amp; Roles</span>
              </button>

              <button
                onClick={() => {
                  setActiveTab('settings');
                  setShowMobileMore(false);
                }}
                className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-left flex items-center gap-2 text-slate-700"
              >
                <IconSettings size={16} className="text-slate-500" />
                <span>Settings</span>
              </button>

              {isPlatformAdmin && (
                <button
                  onClick={() => {
                    setActiveTab('applications');
                    setShowMobileMore(false);
                  }}
                  className="p-3 bg-purple-50 hover:bg-purple-100 rounded-xl border border-purple-200 text-left flex items-center gap-2 text-purple-900 col-span-2"
                >
                  <IconApplications size={16} className="text-purple-700" />
                  <span>Onboarding Applications</span>
                </button>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100">
              <button
                onClick={handleSignOut}
                className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-[#C51F3A] rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <IconLogOut size={16} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. MODALS                                                */}
      {/* ======================================================== */}

      {/* Review Proposal Modal */}
      {reviewingProposal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Camp Proposal Details</h3>
              <button onClick={() => setReviewingProposal(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <span className="font-bold text-slate-500 uppercase text-[10px] block">Camp Title</span>
                <span className="text-sm font-bold text-slate-900">{reviewingProposal.title}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="font-bold text-slate-500 uppercase text-[10px] block">Camp Tracking Code</span>
                  <span className="font-mono font-bold text-slate-800">{reviewingProposal.campCode}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 uppercase text-[10px] block">Target Date &amp; Time</span>
                  <span className="text-slate-800">{new Date(reviewingProposal.targetDate).toLocaleDateString()} {reviewingProposal.timeSlot ? `(${reviewingProposal.timeSlot})` : ''}</span>
                </div>
              </div>
              <div>
                <span className="font-bold text-slate-500 uppercase text-[10px] block">Venue &amp; District</span>
                <span className="text-slate-800">{reviewingProposal.venue} {reviewingProposal.district ? `(${reviewingProposal.district})` : ''}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="font-bold text-slate-500 uppercase text-[10px] block">Organizer Name</span>
                  <span className="text-slate-800">{reviewingProposal.organizerName}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-500 uppercase text-[10px] block">Coordinator Phone</span>
                  <span className="text-slate-800">{reviewingProposal.coordinatorContact || 'Not provided'}</span>
                </div>
              </div>
              <div>
                <span className="font-bold text-slate-500 uppercase text-[10px] block">Expected Donors</span>
                <span className="text-slate-800 font-bold">{reviewingProposal.expectedDonors} expected</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setReviewingProposal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Close
              </button>
              {reviewingProposal.status === 'PROPOSED' && (isAdmin || isPlatformAdmin) && (
                <>
                  <button
                    onClick={() => {
                      const p = reviewingProposal;
                      setReviewingProposal(null);
                      setProposalToReject(p);
                    }}
                    className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-800 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Reject Proposal
                  </button>
                  <button
                    onClick={() => handleUpdateCampStatus(reviewingProposal.id, 'APPROVED')}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold cursor-pointer shadow-xs"
                  >
                    ✓ Approve &amp; Activate Camp
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject Proposal Modal */}
      {proposalToReject && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Reject Camp Proposal</h3>
            <p className="text-xs text-slate-500">
              Camp: <strong>{proposalToReject.title}</strong> ({proposalToReject.campCode})
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Rejection Reason</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="State the regulatory or operational reason for declining this proposal..."
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
                rows={3}
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setProposalToReject(null);
                  setRejectReason('');
                }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!rejectReason.trim()}
                onClick={() => handleUpdateCampStatus(proposalToReject.id, 'REJECTED', rejectReason)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camp Staff Delegation Modal */}
      {showCampStaffModal && selectedCampId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <span className="text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
                  Camp Staff Delegation
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">Manage Mobile Camp Personnel</h3>
              </div>
              <button onClick={() => setShowCampStaffModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            {campStaffError && <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl font-medium">⚠ {campStaffError}</div>}
            {campStaffSuccess && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-medium">✓ {campStaffSuccess}</div>}

            <div>
              <h4 className="text-xs font-bold text-slate-800 mb-2">Current Staff Roster</h4>
              {loadingCampStaff ? (
                <div className="p-4 text-center text-xs text-slate-500">Loading...</div>
              ) : campStaffList.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-xl">
                  No staff members currently assigned to this camp. Assign a coordinator below.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase">
                      <tr>
                        <th className="p-2.5">Staff Name</th>
                        <th className="p-2.5">Contact</th>
                        <th className="p-2.5">Role</th>
                        <th className="p-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {campStaffList.map((assignment) => (
                        <tr key={assignment.id} className="hover:bg-slate-50/60">
                          <td className="p-2.5 font-bold text-slate-900">{assignment.user?.name || 'Staff User'}</td>
                          <td className="p-2.5 font-mono text-[11px] text-slate-600">{assignment.user?.phoneNumber || assignment.userId}</td>
                          <td className="p-2.5">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">
                              {assignment.role}
                            </span>
                          </td>
                          <td className="p-2.5 text-right">
                            <button
                              onClick={() => handleRevokeCampStaff(assignment.id)}
                              className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-[10px] font-bold cursor-pointer"
                            >
                              Revoke
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <form onSubmit={handleAssignCampStaff} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <h4 className="text-xs font-bold text-slate-900">Assign New Camp Staff</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Mobile Number or User ID</label>
                  <input
                    type="text"
                    required
                    value={campStaffPhone}
                    onChange={(e) => setCampStaffPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Camp Role</label>
                  <select
                    value={campStaffRole}
                    onChange={(e) => setCampStaffRole(e.target.value as any)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-xl font-semibold text-xs"
                  >
                    <option value="CAMP_COORDINATOR">CAMP_COORDINATOR (Readiness, Walk-ins, Check-in)</option>
                    <option value="CLINICAL_STAFF">CLINICAL_STAFF (Medical Screening &amp; Clearance)</option>
                    <option value="COLLECTION_STAFF">COLLECTION_STAFF (Donations &amp; Unit Confirmation)</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={assigningCampStaff}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  {assigningCampStaff ? 'Assigning...' : '+ Assign to Camp'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Outbound Manifest Modal */}
      {showCreateManifestModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCreateDraftManifest}
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Create Outbound Transport Manifest</h3>
              <button type="button" onClick={() => setShowCreateManifestModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Source Camp Drive</label>
                <select
                  value={newManifestCampId}
                  onChange={(e) => setNewManifestCampId(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-semibold"
                  required
                >
                  {camps
                    .filter((c) => ['APPROVED', 'COMPLETED'].includes(c.status))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title} ({c.campCode})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Receiving Blood Centre</label>
                <select
                  value={newManifestReceivingOrgId}
                  onChange={(e) => setNewManifestReceivingOrgId(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-semibold"
                  required
                >
                  {verifiedCentres.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.orgCode}) {c.id === activeOrg?.organisationId ? '— (Our Centre)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCreateManifestModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingManifestLoading}
                className="px-4 py-2 bg-[#B91C32] hover:bg-[#9B1324] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
              >
                {creatingManifestLoading ? 'Creating...' : 'Create Draft Manifest'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Dispatch Modal */}
      {showDispatchModal && selectedManifest && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleDispatchManifest}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Record Physical Cold-Chain Dispatch</h3>
              <button type="button" onClick={() => setShowDispatchModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Carrier Name</label>
                <input
                  type="text"
                  required
                  value={dispatchCarrier}
                  onChange={(e) => setDispatchCarrier(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Vehicle Registration #</label>
                  <input
                    type="text"
                    required
                    value={dispatchVehicle}
                    onChange={(e) => setDispatchVehicle(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Departure Temp (°C)</label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    value={dispatchTemp}
                    onChange={(e) => setDispatchTemp(Number(e.target.value))}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-mono"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 pt-1 font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={dispatchSealsVerified}
                  onChange={(e) => setDispatchSealsVerified(e.target.checked)}
                />
                <span>Tamper-evident seals physically checked and intact</span>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDispatchModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={dispatchingLoading}
                className="px-4 py-2 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
              >
                {dispatchingLoading ? 'Committing...' : 'Commit Dispatch'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Verify Item Modal */}
      {showReceiveModal && receivingItem && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleReceiveItem}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Verify Collection Unit Intake</h3>
              <button type="button" onClick={() => setShowReceiveModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-600">
                Unit Number: <strong>{receivingItem.collectionUnit?.unitNumber}</strong> ({receivingItem.collectionUnit?.bloodGroup})
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Physical Condition Outcome</label>
                <select
                  value={receiveOutcome}
                  onChange={(e) => setReceiveOutcome(e.target.value as any)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-semibold"
                >
                  <option value="VERIFIED_INTACT">VERIFIED INTACT (Compliant &amp; Undamaged)</option>
                  <option value="DAMAGED">DAMAGED (Leaking / Port Compromise)</option>
                  <option value="TEMPERATURE_EXCURSION">TEMPERATURE EXCURSION (&gt; 10°C)</option>
                  <option value="MISSING">MISSING (Not found in shipper box)</option>
                  <option value="MISMATCHED">MISMATCHED (Label discrepancy)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Intake Thermometer Reading (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={recordedTempCelsius}
                  onChange={(e) => setRecordedTempCelsius(Number(e.target.value))}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Inspection Remarks</label>
                <textarea
                  value={receiveNotes}
                  onChange={(e) => setReceiveNotes(e.target.value)}
                  placeholder="Notes on physical inspection..."
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
                  rows={2}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowReceiveModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={receivingLoading}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
              >
                {receivingLoading ? 'Recording...' : 'Commit Verification'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Log Unexpected Bag Modal */}
      {showUnexpectedModal && selectedManifest && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleReceiveUnexpectedBag}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Log Unexpected Bag Received</h3>
              <button type="button" onClick={() => setShowUnexpectedModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-500">
                Record a collection bag physically found in this shipment that was not on manifest <strong>{selectedManifest.manifestNumber}</strong>.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Unit Number on Bag Label</label>
                <input
                  type="text"
                  required
                  value={unexpectedUnitNumber}
                  onChange={(e) => setUnexpectedUnitNumber(e.target.value)}
                  placeholder="e.g. RS-CAMP-9988"
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Physical Condition</label>
                <select
                  value={unexpectedOutcome}
                  onChange={(e) => setUnexpectedOutcome(e.target.value as any)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-semibold"
                >
                  <option value="UNEXPECTED">UNEXPECTED (Intact bag but unlisted)</option>
                  <option value="DAMAGED">DAMAGED (Leaking unlisted bag)</option>
                  <option value="TEMPERATURE_EXCURSION">TEMPERATURE EXCURSION</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Quarantine Reason</label>
                <textarea
                  value={unexpectedNotes}
                  onChange={(e) => setUnexpectedNotes(e.target.value)}
                  placeholder="Remarks for placing bag in quarantine..."
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
                  rows={2}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowUnexpectedModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={unexpectedLoading}
                className="px-4 py-2 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
              >
                {unexpectedLoading ? 'Quarantining...' : 'Quarantine &amp; Log'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Resolve Exception Modal */}
      {showResolveModal && resolvingException && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleResolveException}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {resolutionTargetStatus === 'WAIVED' ? 'Formally Waive Discrepancy' : 'Resolve Reconciliation Discrepancy'}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Manifest {selectedManifest?.manifestNumber}</p>
              </div>
              <button type="button" onClick={() => setShowResolveModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-red-900 uppercase tracking-wide text-[10px]">
                  {resolvingException.category?.replace(/_/g, ' ')}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  resolvingException.severity === 'CRITICAL' ? 'bg-red-200 text-red-900' : 'bg-amber-200 text-amber-900'
                }`}>
                  {resolvingException.severity}
                </span>
              </div>
              {resolvingException.unitIdentifier && (
                <div className="text-red-800 text-[11px] font-mono">
                  Unit: <strong>{resolvingException.unitIdentifier}</strong>
                </div>
              )}
              <div className="text-red-700 font-medium">{resolvingException.details}</div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">Action Protocol</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setResolutionTargetStatus('RESOLVED')}
                  className={`p-2.5 rounded-xl border text-left font-bold transition-all cursor-pointer ${
                    resolutionTargetStatus === 'RESOLVED'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="text-emerald-800">✓ Mark Resolved</div>
                  <div className="text-[10px] font-normal text-slate-500 mt-0.5">Investigated &amp; physical item corrected</div>
                </button>
                <button
                  type="button"
                  onClick={() => setResolutionTargetStatus('WAIVED')}
                  className={`p-2.5 rounded-xl border text-left font-bold transition-all cursor-pointer ${
                    resolutionTargetStatus === 'WAIVED'
                      ? 'border-purple-600 bg-purple-50 text-purple-900 ring-2 ring-purple-500/20'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div className="text-purple-800">⚖ Formally Waive</div>
                  <div className="text-[10px] font-normal text-slate-500 mt-0.5">Clinical admin justification override</div>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Formal Resolution Justification &amp; Audit Trail Notes <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder={
                  resolutionTargetStatus === 'WAIVED'
                    ? 'State regulatory rationale and clinical director sign-off justification for waiving this discrepancy...'
                    : 'Detail root cause inspection, correction performed, and confirmed unit disposition...'
                }
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                rows={3}
              />
              <p className="text-[10px] text-slate-400 mt-1">
                This entry is recorded in the permanent immutable regulatory compliance ledger with your account credentials.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowResolveModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={resolvingLoading || !resolutionNotes.trim()}
                className={`px-4 py-2 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-colors ${
                  resolutionTargetStatus === 'WAIVED'
                    ? 'bg-purple-700 hover:bg-purple-800'
                    : 'bg-emerald-700 hover:bg-emerald-800'
                }`}
              >
                {resolvingLoading ? 'Saving...' : resolutionTargetStatus === 'WAIVED' ? 'Formally Waive Exception' : 'Mark Discrepancy Resolved'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Review Platform Application Modal (Admin) */}
      {selectedAppForReview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleReviewSubmit}
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Review Onboarding Application</h3>
              <button type="button" onClick={() => setSelectedAppForReview(null)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>

            {reviewErrorMessage && <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl font-medium">⚠ {reviewErrorMessage}</div>}

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <div className="font-bold text-slate-900">{selectedAppForReview.organisationName}</div>
                <div className="text-slate-500">App #: {selectedAppForReview.applicationNumber}</div>
                <div className="text-slate-500">License: {selectedAppForReview.licenseNumber}</div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Decision</label>
                <select
                  value={reviewAction}
                  onChange={(e) => setReviewAction(e.target.value as any)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-semibold"
                >
                  <option value="APPROVED">APPROVE (Accreditation Verified)</option>
                  <option value="REJECTED">REJECT (Non-Compliant / Incomplete)</option>
                </select>
              </div>

              {reviewAction === 'APPROVED' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Assigned Official Org Code</label>
                  <input
                    type="text"
                    required
                    value={customOrgCode}
                    onChange={(e) => setCustomOrgCode(e.target.value)}
                    placeholder="e.g. MH-BB-0042"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-mono"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Audit Review Remarks</label>
                <textarea
                  value={reviewNotesInput}
                  onChange={(e) => setReviewNotesInput(e.target.value)}
                  placeholder="Formal regulatory remarks..."
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white"
                  rows={2}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedAppForReview(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingReview}
                className="px-4 py-2 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
              >
                {submittingReview ? 'Submitting...' : 'Commit Review Decision'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default function OrganisationPortalPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="text-center space-y-3">
            <div className="w-10 h-10 border-4 border-slate-300 border-t-[#B91C32] rounded-full animate-spin mx-auto" />
            <p className="text-xs font-bold text-slate-600">Loading Blood Bank Workspace...</p>
          </div>
        </div>
      }
    >
      <OrganisationPortalContent />
    </Suspense>
  );
}
