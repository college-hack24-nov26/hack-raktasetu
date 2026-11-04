'use client';

import React, { useState, useEffect } from 'react';
import { authFetch, getAuthToken, safeJsonParse } from '../../config/api';
import { useRealtime } from '../../hooks/useRealtime';

export type WorkflowQueue =
  | 'incoming'
  | 'allocation'
  | 'matching'
  | 'clinical'
  | 'lab'
  | 'dispatch'
  | 'receipt'
  | 'traceability';

interface HospitalIntegrationViewProps {
  organisationId: string;
  userRole: string;
  isAdmin: boolean;
  isAuditor: boolean;
  refreshSignal?: number;
  initialSubTab?: WorkflowQueue | 'orders' | 'intake' | 'discrepancies' | 'disposition' | 'custody';
}

function normalizeQueueTab(tab?: string): WorkflowQueue {
  if (!tab) return 'incoming';
  if (tab === 'orders') return 'dispatch';
  if (tab === 'intake') return 'receipt';
  if (tab === 'disposition' || tab === 'custody') return 'traceability';
  if (
    [
      'incoming',
      'allocation',
      'matching',
      'clinical',
      'lab',
      'dispatch',
      'receipt',
      'traceability',
    ].includes(tab)
  ) {
    return tab as WorkflowQueue;
  }
  return 'incoming';
}

export function HospitalIntegrationView({
  organisationId,
  userRole,
  isAdmin,
  isAuditor,
  refreshSignal = 0,
  initialSubTab,
}: HospitalIntegrationViewProps) {
  const [activeQueue, setActiveQueue] = useState<WorkflowQueue>(
    normalizeQueueTab(initialSubTab)
  );

  useEffect(() => {
    if (initialSubTab) {
      setActiveQueue(normalizeQueueTab(initialSubTab));
    }
  }, [initialSubTab]);

  // Role permissions
  const isClinicalStaff = userRole === 'CLINICAL_STAFF' || isAdmin;
  const isCollectionStaff = userRole === 'COLLECTION_STAFF' || isAdmin;
  const isOperationalStaff =
    userRole === 'OPERATIONAL_STAFF' ||
    userRole === 'ORG_ADMIN' ||
    userRole === 'CAMP_COORDINATOR' ||
    isAdmin;

  // Requests and orders data
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  // Global messages & feedback
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [realtimeNotice, setRealtimeNotice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Primary action button states
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Modals state
  const [selectedRequestForDetail, setSelectedRequestForDetail] = useState<any | null>(null);
  const [selectedRequestForReject, setSelectedRequestForReject] = useState<any | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);

  // Direct dispatch modal
  const [selectedRequestForDirectDispatch, setSelectedRequestForDirectDispatch] = useState<any | null>(null);
  const [courierName, setCourierName] = useState('Maharashtra Cold-Chain Logistics');
  const [vehicleNumber, setVehicleNumber] = useState('MH-12-HB-4021');
  const [driverPhone, setDriverPhone] = useState('+919876543210');
  const [coldBoxTempCelsius, setColdBoxTempCelsius] = useState(4.0);
  const [dispatchNotes, setDispatchNotes] = useState('Calibrated cold shipper; temperature logger sealed');
  const [dispatchLoading, setDispatchLoading] = useState(false);

  // Released Candidates / Donor Workflow Modal
  const [releasedCandidatesModal, setReleasedCandidatesModal] = useState<{
    requestId: string;
    requestRef: string;
    bloodGroup?: string;
    component?: string;
    shortfall?: number;
    matchingStatus?: string;
    releasedAt?: string | null;
    candidates: any[];
  } | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [invitingDonorIds, setInvitingDonorIds] = useState<Record<string, boolean>>({});
  const [arrivalLoading, setArrivalLoading] = useState<Record<string, boolean>>({});
  const [handoffLoading, setHandoffLoading] = useState<Record<string, boolean>>({});
  const [invitationSuccessNotice, setInvitationSuccessNotice] = useState<string | null>(null);
  const [releasedRoadDirections, setReleasedRoadDirections] = useState<Record<string, { distanceKm: number; durationMinutes: number; loading?: boolean; error?: string }>>({});

  const fetchReleasedCandidateRoadDirections = async (requestId: string, candidateId: string) => {
    setReleasedRoadDirections(prev => ({ ...prev, [candidateId]: { distanceKm: 0, durationMinutes: 0, loading: true } }));
    try {
      const res = await authFetch(`/api/v1/organisation/${organisationId}/requests/${requestId}/candidates/${candidateId}/directions`);
      const data = await res.json();
      if (!res.ok || !data.data) {
        throw new Error(data.error?.message || 'Route unavailable');
      }
      setReleasedRoadDirections(prev => ({
        ...prev,
        [candidateId]: {
          distanceKm: data.data.distanceKm,
          durationMinutes: data.data.durationMinutes,
          loading: false,
        },
      }));
    } catch (err: any) {
      setReleasedRoadDirections(prev => ({
        ...prev,
        [candidateId]: {
          distanceKm: 0,
          durationMinutes: 0,
          loading: false,
          error: err.message || 'Route unavailable',
        },
      }));
    }
  };

  // Clinical Screening Modal
  const [clinicalScreeningModal, setClinicalScreeningModal] = useState<{
    requestId: string;
    requestRef: string;
    attendanceId: string;
    donorName?: string;
  } | null>(null);
  const [consentGiven, setConsentGiven] = useState(true);
  const [hemoglobin, setHemoglobin] = useState('13.5');
  const [eligibilityDecision, setEligibilityDecision] = useState<
    'CLEARED' | 'TEMPORARY_DEFERRAL' | 'PERMANENT_DEFERRAL'
  >('CLEARED');
  const [deferralCategory, setDeferralCategory] = useState<
    'LOW_HEMOGLOBIN' | 'RECENT_ILLNESS' | 'MEDICATION' | 'WEIGHT_CRITERIA' | 'OTHER'
  >('LOW_HEMOGLOBIN');
  const [deferralDurationDays, setDeferralDurationDays] = useState(90);
  const [clinicalNotes, setClinicalNotes] = useState('Vital signs stable; cleared under national guidelines.');
  const [screeningLoading, setScreeningLoading] = useState(false);

  // Phlebotomy Collection Modal
  const [collectionModal, setCollectionModal] = useState<{
    requestId: string;
    requestRef: string;
    attendanceId: string;
    bloodGroup: string;
  } | null>(null);
  const [collectionVolume, setCollectionVolume] = useState<number>(350);
  const [bagIdentifier, setBagIdentifier] = useState('');
  const [componentType, setComponentType] = useState<
    'PRBC' | 'WHOLE_BLOOD' | 'PLATELET_CONCENTRATE' | 'FRESH_FROZEN_PLASMA'
  >('PRBC');
  const [collectionNotes, setCollectionNotes] = useState('Collection completed uneventfully.');
  const [collectionLoading, setCollectionLoading] = useState(false);

  // Traceability Modal
  const [traceabilityModal, setTraceabilityModal] = useState<{
    loading: boolean;
    data: any | null;
    error: string | null;
  } | null>(null);

  // Authorise Issue Order Modal (Legacy bridge)
  const [showAuthoriseModal, setShowAuthoriseModal] = useState(false);
  const [receivingFacilityId, setReceivingFacilityId] = useState('');
  const [componentUnitIdsInput, setComponentUnitIdsInput] = useState('');
  const [requestIdInput, setRequestIdInput] = useState('');
  const [authorisationReason, setAuthorisationReason] = useState('Urgent transfusion request matching protocol');
  const [authoriseNotes, setAuthoriseNotes] = useState('');
  const [authoriseLoading, setAuthoriseLoading] = useState(false);

  // Component Custody Search Tool
  const [custodySearchId, setCustodySearchId] = useState('');
  const [custodyData, setCustodyData] = useState<any | null>(null);
  const [custodyLoading, setCustodyLoading] = useState(false);

  // Real-time WebSocket connection
  const { status: realtimeStatus } = useRealtime({
    organisationId,
    token: getAuthToken() || undefined,
    enabled: Boolean(organisationId && getAuthToken()),
    onEvent: (evt) => {
      const knownEvents = [
        'blood_request.created',
        'blood_request.status_changed',
        'blood_request.allocated',
        'blood_request.matching_requested',
        'blood_request.matching_searched',
        'blood_request.matching_released',
        'donor_invitation.response_changed',
        'donor_intake.arrival_recorded',
        'clinical_assessment.completed',
        'blood_collection.completed',
        'laboratory_testing.completed',
        'hospital_issue.authorised',
        'hospital_issue.dispatched',
        'hospital_issue.received',
      ];

      if (knownEvents.includes(evt.eventType)) {
        fetchIncomingRequests();
        fetchOrders();
        const payload = evt.payload as any;
        const idForRef = payload?.requestId || evt.entityId || '';
        const ref = payload?.requestReference || (idForRef ? `#${idForRef.slice(0, 8)}` : '#REQUEST');
        const status =
          payload?.status ||
          (evt.eventType === 'blood_request.matching_released'
            ? 'CANDIDATES RELEASED'
            : evt.eventType === 'donor_intake.arrival_recorded'
            ? 'DONOR ARRIVED'
            : evt.eventType === 'clinical_assessment.completed'
            ? 'SCREENING COMPLETED'
            : evt.eventType === 'blood_collection.completed'
            ? 'COLLECTION COMPLETED'
            : 'UPDATED');

        setRealtimeNotice(`⚡ Real-time Update: Blood Request ${ref} — ${status}`);
        setTimeout(() => setRealtimeNotice(null), 6000);

        // Live update released candidates modal if open
        if (evt.eventType === 'donor_invitation.response_changed') {
          setReleasedCandidatesModal((prev) => {
            if (!prev || prev.requestId !== payload?.requestId) return prev;
            return {
              ...prev,
              candidates: prev.candidates.map((c: any) =>
                c.donorId === payload?.donorId
                  ? {
                      ...c,
                      invitationStatus: payload?.status,
                      contactNumber: payload?.donorPhone || c.contactNumber,
                      disclosureAuthorized: payload?.contactDisclosed ?? c.disclosureAuthorized,
                    }
                  : c
              ),
            };
          });
        }
      }
    },
    onReconnect: () => {
      fetchIncomingRequests();
      fetchOrders();
    },
  });

  // Fetch incoming blood requests
  const fetchIncomingRequests = async () => {
    if (!organisationId || !getAuthToken()) return;
    try {
      setLoadingRequests(true);
      setRequestsError(null);
      const res = await authFetch(`/api/v1/organisation/${organisationId}/incoming-requests`, {
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to fetch incoming blood requests');
      }
      setIncomingRequests(data.data || []);
    } catch (err: any) {
      setRequestsError(err.message || 'Error loading incoming blood requests');
    } finally {
      setLoadingRequests(false);
    }
  };

  // Fetch orders
  const fetchOrders = async () => {
    if (!organisationId || !getAuthToken()) return;
    try {
      setLoadingOrders(true);
      setOrdersError(null);
      const res = await authFetch(`/api/v1/hospital/orders?organisationId=${organisationId}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) return;
        throw new Error(data.error?.message || 'Failed to fetch orders');
      }
      setOrders(data.data || []);
    } catch (err: any) {
      if (err.message && !err.message.includes('Authentication')) {
        setOrdersError(err.message);
      }
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    if (organisationId && getAuthToken()) {
      fetchIncomingRequests();
      fetchOrders();
    }
  }, [organisationId, refreshSignal]);

  // Format blood group
  const formatBloodGroup = (bg: string) => {
    if (!bg) return 'Unknown';
    return bg
      .replace('_POS', '+')
      .replace('_NEG', '-')
      .replace('POS', '+')
      .replace('NEG', '-');
  };

  // State-driven Primary Next Action Resolver
  const getPrimaryAction = (req: any) => {
    const status = req.status || req.fulfillmentStatus || 'OPEN';
    const stock = req.availableStockCount ?? req.availableEligibleStockCount ?? 0;
    const units = req.units || req.unitsRequested || 1;
    const allocated = req.reservedUnits?.length || req.allocatedUnitsCount || 0;
    const shortfall = req.shortfallCount ?? Math.max(0, units - allocated);
    const matchingReq = req.matchingRequest || req.metadata?.matchingRequest;
    const matchingStatus =
      req.matchingStatus ||
      matchingReq?.status ||
      req.metadata?.donorMatching?.status ||
      'NOT_REQUESTED';
    const releasedCount =
      req.releasedCandidateCount ??
      req.matchingCandidatesCount ??
      matchingReq?.releasedCandidateIds?.length ??
      req.metadata?.donorMatching?.releasedDonorIds?.length ??
      0;
    const hasMatching = Boolean(
      req.hasMatchingRequest ||
      (matchingReq && matchingStatus !== 'NOT_REQUESTED') ||
      req.metadata?.donorMatching
    );
    const hasAccepted = req.hasAcceptedDonor || (req.metadata?.donorOutreach?.some((o: any) => o.status === 'ACCEPTED'));
    const intake = req.donorIntake || req.metadata?.donorIntake;
    const intakeStatus = intake?.intakeStatus;

    // 1. Fulfilled / Closed
    if (status === 'FULFILLED' || status === 'COMPLETED') {
      return {
        label: 'Fulfilled & Delivered',
        disabled: true,
        variant: 'secondary',
        action: 'NONE',
      };
    }

    // 2. Dispatched / In Transit -> Confirm Facility Receipt
    if (status === 'IN_TRANSIT' || status === 'DISPATCHED') {
      return {
        label: 'Confirm Facility Receipt',
        disabled: !isOperationalStaff,
        tooltip: !isOperationalStaff ? 'Operational Staff required' : undefined,
        variant: 'primary',
        action: 'CONFIRM_RECEIPT',
      };
    }

    // 3. Stock Allocated & Reserved, ready for Dispatch
    if ((status === 'RESERVED' || status === 'STOCK_RESERVED' || status === 'ALLOCATED') && shortfall === 0) {
      return {
        label: 'Prepare & Authorize Dispatch',
        disabled: !isOperationalStaff,
        tooltip: !isOperationalStaff ? 'Operational Staff required for dispatch' : undefined,
        variant: 'primary',
        action: 'DIRECT_DISPATCH',
      };
    }

    // 4. Component Released from Lab -> Allocate Component to Request
    if (intakeStatus === 'COLLECTION_COMPLETED' && intake?.componentUnitId && shortfall > 0) {
      return {
        label: 'Allocate Released Component',
        disabled: !isOperationalStaff,
        tooltip: !isOperationalStaff ? 'Operational Staff required to allocate stock' : undefined,
        variant: 'primary',
        action: 'ALLOCATE_COMPONENT',
      };
    }

    // 5. Phlebotomy Completed -> Lab Testing & Clinical Release Pending
    if (intakeStatus === 'COLLECTION_COMPLETED') {
      return {
        label: 'Laboratory Testing & Release Pending',
        disabled: !isClinicalStaff,
        tooltip: !isClinicalStaff ? 'Clinical Staff required for laboratory release' : undefined,
        variant: 'primary',
        action: 'LAB_RELEASE',
      };
    }

    // 6. Clinically Cleared -> Record Phlebotomy Collection
    if (intakeStatus === 'CLEARED') {
      return {
        label: 'Record Phlebotomy Collection',
        disabled: !isCollectionStaff,
        tooltip: !isCollectionStaff ? 'Collection Staff required for phlebotomy' : undefined,
        variant: 'primary',
        action: 'RECORD_COLLECTION',
      };
    }

    // 7. Donor Arrived -> Start Clinical Screening
    if (intakeStatus === 'ARRIVED') {
      return {
        label: 'Start Clinical Screening',
        disabled: !isClinicalStaff,
        tooltip: !isClinicalStaff ? 'Clinical Staff required for screening assessment' : undefined,
        variant: 'primary',
        action: 'START_SCREENING',
      };
    }

    // 8. Donor Accepted -> Verify Identity & Mark Arrived
    if (hasAccepted && (!intake || intakeStatus !== 'ARRIVED')) {
      return {
        label: 'Verify Identity & Mark Arrived',
        disabled: false,
        variant: 'primary',
        action: 'OPEN_CANDIDATES',
      };
    }

    // 9. Candidates Released by System Admin -> View Released Candidates
    if ((matchingStatus === 'RELEASED' || matchingStatus === 'CANDIDATES_RELEASED' || releasedCount > 0) && !hasAccepted) {
      return {
        label: `View Released Candidates (${releasedCount})`,
        disabled: false,
        variant: 'primary',
        action: 'OPEN_CANDIDATES',
      };
    }

    // 10. Matching Requested -> Awaiting Admin Review
    if (hasMatching && (matchingStatus === 'REQUESTED' || matchingStatus === 'SEARCHING' || matchingStatus === 'SEARCH_RUNNING' || matchingStatus === 'PENDING_REVIEW' || matchingStatus === 'AWAITING_ADMIN_REVIEW')) {
      return {
        label: 'Matching Requested — Awaiting Admin Review',
        disabled: true,
        variant: 'secondary',
        action: 'NONE',
      };
    }

    // 11. Shortfall Exists & Stock Available -> Allocate Stock
    if (stock >= shortfall && shortfall > 0 && status !== 'RESERVED' && status !== 'STOCK_RESERVED' && status !== 'ALLOCATED') {
      return {
        label: 'Allocate & Reserve Stock',
        disabled: !isOperationalStaff,
        tooltip: !isOperationalStaff ? 'Operational Staff required to reserve stock' : undefined,
        variant: 'primary',
        action: 'ACCEPT_RESERVE',
      };
    }

    if (stock > 0 && stock < shortfall && status !== 'RESERVED' && status !== 'STOCK_RESERVED' && status !== 'ALLOCATED') {
      return {
        label: `Allocate Available Units (${stock})`,
        disabled: !isOperationalStaff,
        tooltip: !isOperationalStaff ? 'Operational Staff required to reserve stock' : undefined,
        variant: 'primary',
        action: 'ACCEPT_RESERVE',
      };
    }

    // 12. Shortfall Exists & No Stock -> Request Donor Matching
    if (shortfall > 0 && !hasMatching && matchingStatus !== 'RELEASED') {
      return {
        label: `Request Donor Matching (${shortfall} shortfall)`,
        disabled: !isOperationalStaff,
        tooltip: !isOperationalStaff ? 'Operational Staff required to request matching' : undefined,
        variant: 'primary',
        action: 'REQUEST_MATCHING',
      };
    }

    // Fallback
    return {
      label: 'View Details',
      disabled: false,
      variant: 'secondary',
      action: 'VIEW_DETAILS',
    };
  };

  // Queue Filter Definition
  const getRequestsForQueue = (queue: WorkflowQueue) => {
    return incomingRequests.filter((req) => {
      const status = req.status || req.fulfillmentStatus || 'OPEN';
      const stock = req.availableStockCount ?? req.availableEligibleStockCount ?? 0;
      const units = req.units || req.unitsRequested || 1;
      const allocated = req.reservedUnits?.length || req.allocatedUnitsCount || 0;
      const shortfall = req.shortfallCount ?? Math.max(0, units - allocated);
      const matchingReq = req.matchingRequest || req.metadata?.matchingRequest;
      const matchingStatus =
        req.matchingStatus ||
        matchingReq?.status ||
        req.metadata?.donorMatching?.status ||
        'NOT_REQUESTED';
      const releasedCount =
        req.releasedCandidateCount ??
        req.matchingCandidatesCount ??
        matchingReq?.releasedCandidateIds?.length ??
        req.metadata?.donorMatching?.releasedDonorIds?.length ??
        0;
      const hasMatching = Boolean(
        req.hasMatchingRequest ||
        (matchingReq && matchingStatus !== 'NOT_REQUESTED') ||
        req.metadata?.donorMatching
      );
      const hasAccepted = req.hasAcceptedDonor || (req.metadata?.donorOutreach?.some((o: any) => o.status === 'ACCEPTED'));
      const intakeStatus = req.donorIntake?.intakeStatus || req.metadata?.donorIntake?.intakeStatus;

      if (queue === 'incoming') {
        return status === 'OPEN' || status === 'PENDING' || status === 'REQUESTED' || status === 'PARTIALLY_ALLOCATED';
      }
      if (queue === 'allocation') {
        return (
          allocated > 0 ||
          stock > 0 ||
          status === 'PARTIALLY_ALLOCATED' ||
          status === 'STOCK_RESERVED' ||
          status === 'RESERVED'
        );
      }
      if (queue === 'matching') {
        return shortfall > 0 || hasMatching || matchingStatus === 'RELEASED' || matchingStatus === 'CANDIDATES_RELEASED' || releasedCount > 0;
      }
      if (queue === 'clinical') {
        return hasAccepted || intakeStatus === 'ARRIVED' || intakeStatus === 'CLEARED' || intakeStatus === 'DEFERRED';
      }
      if (queue === 'lab') {
        return intakeStatus === 'COLLECTION_COMPLETED' || req.metadata?.collectionUnit;
      }
      if (queue === 'dispatch') {
        return (
          status === 'RESERVED' ||
          status === 'STOCK_RESERVED' ||
          status === 'PREPARING' ||
          status === 'ALLOCATED' ||
          status === 'DISPATCHED' ||
          status === 'IN_TRANSIT'
        );
      }
      if (queue === 'receipt') {
        return status === 'DISPATCHED' || status === 'IN_TRANSIT' || status === 'DELIVERED';
      }
      if (queue === 'traceability') {
        return true;
      }
      return true;
    });
  };

  // Search filter
  const filterBySearch = (list: any[]) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter((req) => {
      const matchRef = (req.requestReference || '').toLowerCase().includes(q) || req.id.toLowerCase().includes(q);
      const matchPatient = (req.patientName || '').toLowerCase().includes(q);
      const matchHospital = (req.hospitalName || req.admittedHospitalName || '').toLowerCase().includes(q);
      const matchGroup = (req.bloodGroup || '').toLowerCase().includes(q);
      return matchRef || matchPatient || matchHospital || matchGroup;
    });
  };

  // Action: Allocate & Reserve Stock
  const handleAcceptAndReserve = async (req: any) => {
    try {
      setActionLoadingId(req.id);
      setError(null);
      setSuccessMsg(null);
      const res = await authFetch(`/api/v1/organisation/${organisationId}/requests/${req.id}/accept-reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organisationId }),
      });
      const data = await safeJsonParse(res);
      if (!res.ok) {
        throw new Error(data.error?.message || `Failed to reserve stock (HTTP ${res.status})`);
      }
      setSuccessMsg(`Stock reserved for Request ${req.requestReference}! (${data.data?.reservedUnits?.length || 1} unit(s) allocated)`);
      fetchIncomingRequests();
      fetchOrders();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('inventory:refresh'));
      }
    } catch (err: any) {
      setError(err.message || 'Error reserving stock');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Action: Request Donor Matching for Shortfall
  const handleRequestMatching = async (req: any) => {
    try {
      setActionLoadingId(req.id);
      setError(null);
      setSuccessMsg(null);
      const res = await authFetch(`/api/v1/organisation/${organisationId}/requests/${req.id}/request-matching`, {
        method: 'POST',
      });
      const data = await safeJsonParse(res);
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || `Failed to request donor matching (HTTP ${res.status})`);
      }
      setSuccessMsg(data.message || `Donor matching requested for shortfall of ${req.shortfallCount} unit(s).`);
      fetchIncomingRequests();
    } catch (err: any) {
      setError(err.message || 'Error requesting donor matching');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Action: View Released Candidates Modal
  const handleViewReleasedCandidates = async (req: any) => {
    try {
      setLoadingCandidates(true);
      setError(null);
      const res = await authFetch(`/api/v1/organisation/${organisationId}/requests/${req.id}/matching-candidates`);
      const data = await safeJsonParse(res);
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to retrieve released candidates.');
      }
      const matchingReq = req.matchingRequest || req.metadata?.matchingRequest;
      const matchingStatus = req.matchingStatus || matchingReq?.status || 'RELEASED';
      const units = req.unitsRequested || req.units || 1;
      const allocated = req.reservedUnits?.length || req.allocatedUnitsCount || 0;
      const shortfall = req.shortfallCount ?? Math.max(0, units - allocated);

      setReleasedCandidatesModal({
        requestId: req.id,
        requestRef: req.requestReference,
        bloodGroup: req.bloodGroup,
        component: req.component,
        shortfall,
        matchingStatus,
        releasedAt: req.releasedAt || matchingReq?.releasedAt || data.data?.releasedAt || null,
        candidates: data.data?.candidates || [],
      });
    } catch (err: any) {
      setError(err.message || 'Error fetching released candidates');
    } finally {
      setLoadingCandidates(false);
    }
  };

  // Action: Donor Outreach Response
  const handleDonorOutreach = async (
    requestId: string,
    donorId: string,
    status: 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'PENDING',
    notes?: string
  ) => {
    try {
      setError(null);
      const res = await authFetch(`/api/v1/organisation/${organisationId}/requests/${requestId}/donor-outreach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ donorId, status, notes: notes || `Outreach response: ${status}` }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to record donor outreach');
      }
      setInvitationSuccessNotice(`Donor outreach status recorded: ${status}`);
      setTimeout(() => setInvitationSuccessNotice(null), 4000);

      setReleasedCandidatesModal((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          candidates: prev.candidates.map((c: any) =>
            c.donorId === donorId
              ? {
                  ...c,
                  invitationStatus: status,
                  contactNumber: data.donorPhone || c.contactNumber,
                  disclosureAuthorized: status === 'ACCEPTED' ? true : c.disclosureAuthorized,
                }
              : c
          ),
        };
      });
      fetchIncomingRequests();
    } catch (err: any) {
      setError(err.message || 'Error recording donor outreach');
    }
  };

  // Action: Invite Candidates in Bulk
  const handleInviteCandidates = async (requestId: string, donorIds: string[]) => {
    if (!donorIds || donorIds.length === 0) return;
    try {
      const nextInviting = { ...invitingDonorIds };
      donorIds.forEach((id) => (nextInviting[id] = true));
      setInvitingDonorIds(nextInviting);
      setError(null);

      const res = await authFetch(`/api/v1/organisation/${organisationId}/requests/${requestId}/invite-donors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ donorIds }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to dispatch donor invitations.');
      }

      setInvitationSuccessNotice(`Dispatched invitations to ${data.invitedCount} candidate(s).`);
      setTimeout(() => setInvitationSuccessNotice(null), 5000);

      const invitedSet = new Set(data.invitedDonorIds || donorIds);
      setReleasedCandidatesModal((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          candidates: prev.candidates.map((c: any) =>
            invitedSet.has(c.donorId) ? { ...c, invitationStatus: 'PENDING' } : c
          ),
        };
      });
      fetchIncomingRequests();
    } catch (err: any) {
      setError(err.message || 'Error inviting donor candidates');
    } finally {
      const nextInviting = { ...invitingDonorIds };
      donorIds.forEach((id) => delete nextInviting[id]);
      setInvitingDonorIds(nextInviting);
    }
  };

  // Action: Record Donor Arrival & Verify Identity
  const handleRecordArrival = async (requestId: string, donorId: string) => {
    try {
      setArrivalLoading((prev) => ({ ...prev, [donorId]: true }));
      setError(null);

      // Attempt candidate arrival endpoint first, fallback to donor-intake
      let res = await authFetch(`/api/v1/organisation/${organisationId}/requests/${requestId}/candidates/${donorId}/arrival`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ donorId, verificationNotes: 'Arrival verified in-person at blood bank' }),
      });
      if (res.status === 404) {
        res = await authFetch(`/api/v1/organisation/${organisationId}/requests/${requestId}/donor-intake`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ donorId, verificationNotes: 'Arrival verified in-person at blood bank' }),
        });
      }
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to record donor arrival.');
      }

      setInvitationSuccessNotice(`Donor arrival recorded! Photo ID verified. Proceed to clinical handoff.`);
      setTimeout(() => setInvitationSuccessNotice(null), 5000);

      setReleasedCandidatesModal((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          candidates: prev.candidates.map((c: any) =>
            c.donorId === donorId ? { ...c, arrived: true, intakeStatus: 'ARRIVED' } : c
          ),
        };
      });
      fetchIncomingRequests();
    } catch (err: any) {
      setError(err.message || 'Error recording donor arrival');
    } finally {
      setArrivalLoading((prev) => ({ ...prev, [donorId]: false }));
    }
  };

  // Action: Verify Donor Identity & Send to Authorized Clinical Staff
  const handleVerifyDonorHandoff = async (requestId: string, donorId: string) => {
    try {
      setHandoffLoading((prev) => ({ ...prev, [donorId]: true }));
      setError(null);

      const res = await authFetch(`/api/v1/organisation/${organisationId}/requests/${requestId}/candidates/${donorId}/verify-handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verificationNotes: 'Donor verified at front desk: 90-day whole blood interval checked; forwarded to Clinical Staff.' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to verify donor and hand off.');
      }

      setInvitationSuccessNotice(`Donor verified! Handoff complete. Forwarded to Clinical Screening queue.`);
      setTimeout(() => setInvitationSuccessNotice(null), 5000);

      setReleasedCandidatesModal((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          candidates: prev.candidates.map((c: any) =>
            c.donorId === donorId ? { ...c, arrived: true, intakeStatus: 'SCREENING_IN_PROGRESS', readyForScreening: true } : c
          ),
        };
      });
      fetchIncomingRequests();
    } catch (err: any) {
      setError(err.message || 'Error verifying donor handoff');
    } finally {
      setHandoffLoading((prev) => ({ ...prev, [donorId]: false }));
    }
  };

  // Action: Save Clinical Screening
  const handleSaveClinicalScreening = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clinicalScreeningModal) return;
    try {
      setScreeningLoading(true);
      setError(null);
      const res = await authFetch(
        `/api/v1/organisation/${organisationId}/requests/${clinicalScreeningModal.requestId}/clinical-screening`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attendanceId: clinicalScreeningModal.attendanceId,
            consentGiven,
            consentVersion: 'v1.0',
            eligibilityDecision,
            deferralCategory: eligibilityDecision !== 'CLEARED' ? deferralCategory : undefined,
            deferralDurationDays: eligibilityDecision !== 'CLEARED' ? Number(deferralDurationDays) : undefined,
            clinicalNotes,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to record clinical screening');
      }
      setSuccessMsg(
        `Clinical screening recorded: ${eligibilityDecision}. ${
          eligibilityDecision === 'CLEARED'
            ? 'Donor is cleared! Proceed to phlebotomy collection.'
            : 'Donor deferral recorded in audit log.'
        }`
      );
      setClinicalScreeningModal(null);
      fetchIncomingRequests();
    } catch (err: any) {
      setError(err.message || 'Error saving clinical screening');
    } finally {
      setScreeningLoading(false);
    }
  };

  // Action: Save Blood Collection
  const handleSaveCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectionModal) return;
    try {
      setCollectionLoading(true);
      setError(null);
      const res = await authFetch(
        `/api/v1/organisation/${organisationId}/requests/${collectionModal.requestId}/collection`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attendanceId: collectionModal.attendanceId,
            bloodGroup: collectionModal.bloodGroup,
            volumeMl: Number(collectionVolume),
            bagIdentifier: bagIdentifier || `BAG-${Date.now().toString().slice(-6)}`,
            componentType,
            notes: collectionNotes,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to record blood collection');
      }
      setSuccessMsg(`Collection successfully recorded! Derived component quarantined for lab testing & release.`);
      setCollectionModal(null);
      fetchIncomingRequests();
    } catch (err: any) {
      setError(err.message || 'Error saving collection');
    } finally {
      setCollectionLoading(false);
    }
  };

  // Action: Allocate Released Component
  const handleAllocateComponent = async (req: any, componentUnitId?: string) => {
    const compId = componentUnitId || req.donorIntake?.componentUnitId;
    if (!compId) {
      setError('No released component unit found to allocate.');
      return;
    }
    try {
      setActionLoadingId(req.id);
      setError(null);
      const res = await authFetch(
        `/api/v1/organisation/${organisationId}/requests/${req.id}/allocate-component`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ componentUnitId: compId }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to allocate component');
      }
      setSuccessMsg(`Released component successfully allocated to Request ${req.requestReference}!`);
      fetchIncomingRequests();
    } catch (err: any) {
      setError(err.message || 'Error allocating component');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Action: Direct Dispatch for Reserved Request
  const handleDirectDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequestForDirectDispatch) return;
    try {
      setDispatchLoading(true);
      setError(null);
      const res = await authFetch(
        `/api/v1/organisation/${organisationId}/requests/${selectedRequestForDirectDispatch.id}/dispatch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transportDetails: {
              courierName,
              vehicleNumber,
              driverPhone,
              coldBoxTempCelsius: Number(coldBoxTempCelsius),
              notes: dispatchNotes,
            },
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Direct dispatch failed');
      }
      setSuccessMsg(`Request ${selectedRequestForDirectDispatch.requestReference} dispatched successfully.`);
      setSelectedRequestForDirectDispatch(null);
      fetchIncomingRequests();
      fetchOrders();
    } catch (err: any) {
      setError(err.message || 'Error during dispatch');
    } finally {
      setDispatchLoading(false);
    }
  };

  // Action: Confirm Facility Receipt
  const handleConfirmReceipt = async (req: any) => {
    try {
      setActionLoadingId(req.id);
      setError(null);
      const res = await authFetch(`/api/v1/blood-requests/${req.id}/confirm-receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Confirmed receipt at hospital facility' }),
      });
      const data = await safeJsonParse(res);
      if (!res.ok) {
        throw new Error(data.error?.message || `Failed to confirm receipt (HTTP ${res.status})`);
      }
      setSuccessMsg(`Facility receipt verified for Request ${req.requestReference}! Request fulfilled.`);
      fetchIncomingRequests();
      fetchOrders();
    } catch (err: any) {
      setError(err.message || 'Error confirming receipt');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Action: Reject Request with Mandatory Documented Reason
  const handleRejectRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequestForReject) return;
    try {
      setRejectLoading(true);
      setError(null);
      const res = await authFetch(
        `/api/v1/organisation/${organisationId}/requests/${selectedRequestForReject.id}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: rejectionReasonInput }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to reject request');
      }
      setSuccessMsg(`Request ${selectedRequestForReject.requestReference} rejected and documented.`);
      setSelectedRequestForReject(null);
      fetchIncomingRequests();
    } catch (err: any) {
      setError(err.message || 'Error rejecting request');
    } finally {
      setRejectLoading(false);
    }
  };

  // Action: View Traceability Lineage
  const handleViewTraceability = async (req: any) => {
    setTraceabilityModal({ loading: true, data: null, error: null });
    try {
      const res = await authFetch(`/api/v1/organisation/${organisationId}/requests/${req.id}/traceability`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to fetch traceability lineage.');
      }
      setTraceabilityModal({ loading: false, data: data.data, error: null });
    } catch (err: any) {
      setTraceabilityModal({ loading: false, data: null, error: err.message || 'Failed to load traceability.' });
    }
  };

  // Component Custody Search Handler
  const handleLookupCustody = async (componentId: string) => {
    if (!componentId) return;
    try {
      setCustodyLoading(true);
      const res = await authFetch(`/api/v1/hospital/components/${componentId}/custody`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Custody lookup failed');
      }
      setCustodyData(data.data);
    } catch (err: any) {
      setError(err.message || 'Custody lookup failed');
    } finally {
      setCustodyLoading(false);
    }
  };

  // Authorise Issue Order Handler (Legacy Bridge)
  const handleAuthoriseIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setAuthoriseLoading(true);
      setError(null);
      const componentUnitIds = componentUnitIdsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await authFetch('/api/v1/hospital/issues/authorise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organisationId,
          receivingFacilityId,
          componentUnitIds,
          bloodRequestId: requestIdInput || undefined,
          authorisationReason,
          clinicalProtocolRef: 'Standard Cross-Match Protocol v2.1',
          notes: authoriseNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Authorisation failed');
      }
      setSuccessMsg(`Issue Order #${data.data?.orderNumber} authorised successfully!`);
      setShowAuthoriseModal(false);
      setComponentUnitIdsInput('');
      setRequestIdInput('');
      fetchOrders();
      fetchIncomingRequests();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAuthoriseLoading(false);
    }
  };

  // Execute State-Driven Primary Next Action
  const executePrimaryAction = (action: string, req: any) => {
    switch (action) {
      case 'ACCEPT_RESERVE':
        handleAcceptAndReserve(req);
        break;
      case 'REQUEST_MATCHING':
        handleRequestMatching(req);
        break;
      case 'OPEN_CANDIDATES':
        handleViewReleasedCandidates(req);
        break;
      case 'START_SCREENING': {
        const attendanceId = req.donorIntake?.attendanceId || req.metadata?.donorIntake?.attendanceId;
        setClinicalScreeningModal({
          requestId: req.id,
          requestRef: req.requestReference,
          attendanceId,
          donorName: 'Voluntary Donor',
        });
        break;
      }
      case 'RECORD_COLLECTION': {
        const attendanceId = req.donorIntake?.attendanceId || req.metadata?.donorIntake?.attendanceId;
        setCollectionModal({
          requestId: req.id,
          requestRef: req.requestReference,
          attendanceId,
          bloodGroup: req.bloodGroup,
        });
        break;
      }
      case 'LAB_RELEASE':
      case 'ALLOCATE_COMPONENT':
        handleAllocateComponent(req);
        break;
      case 'DIRECT_DISPATCH':
        setSelectedRequestForDirectDispatch(req);
        break;
      case 'CONFIRM_RECEIPT':
        handleConfirmReceipt(req);
        break;
      case 'VIEW_DETAILS':
        setSelectedRequestForDetail(req);
        break;
      default:
        setSelectedRequestForDetail(req);
        break;
    }
  };

  // Queue definitions
  const QUEUES: { id: WorkflowQueue; label: string; icon: string }[] = [
    { id: 'incoming', label: 'Incoming Requests', icon: '📥' },
    { id: 'allocation', label: 'Allocation & Preparation', icon: '📦' },
    { id: 'matching', label: 'Donor Matching', icon: '🤝' },
    { id: 'clinical', label: 'Clinical & Collection', icon: '🩺' },
    { id: 'lab', label: 'Laboratory & Release', icon: '🔬' },
    { id: 'dispatch', label: 'Orders & Dispatch', icon: '🚚' },
    { id: 'receipt', label: 'Facility Receipt', icon: '🏥' },
    { id: 'traceability', label: 'Traceability', icon: '🧬' },
  ];

  // Requests in current queue
  const currentQueueRequests = filterBySearch(getRequestsForQueue(activeQueue));

  return (
    <div className="space-y-5">
      {/* Realtime Alert Notice */}
      {realtimeNotice && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-950 flex items-center justify-between shadow-xs animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="text-base">🔔</span>
            <span>{realtimeNotice}</span>
          </div>
          <button
            onClick={() => setRealtimeNotice(null)}
            className="text-emerald-700 hover:text-emerald-950 text-xs font-extrabold cursor-pointer px-2 py-0.5 rounded"
          >
            ✕
          </button>
        </div>
      )}

      {/* Global Error Notice */}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-800 text-xs font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Global Success Notice */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✓</span>
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-900 text-xs font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Header and Queue Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-4">
        {/* Top bar with Realtime Status and Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
              Blood Bank Fulfilment Hub
            </h2>
            {realtimeStatus === 'connected' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Realtime Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                {realtimeStatus === 'reconnecting' ? 'Reconnecting...' : 'REST Standby'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search reference, patient, hospital..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#B91C32] w-64"
            />
            <button
              onClick={() => {
                fetchIncomingRequests();
                fetchOrders();
              }}
              disabled={loadingRequests || loadingOrders}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
            >
              <span className={loadingRequests || loadingOrders ? 'animate-spin' : ''}>↻</span>
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* 8 Separate Queues Tabs Header */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-t border-slate-100 pt-3">
          {QUEUES.map((q) => {
            const count = getRequestsForQueue(q.id).length;
            const isActive = activeQueue === q.id;

            return (
              <button
                key={q.id}
                onClick={() => setActiveQueue(q.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-[#B91C32] text-white shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200'
                }`}
              >
                <span>{q.icon}</span>
                <span>{q.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    isActive ? 'bg-white text-[#B91C32]' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Queue Content */}
      <div className="space-y-4">
        {loadingRequests ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-500 space-y-2">
            <div className="w-8 h-8 border-3 border-slate-300 border-t-[#B91C32] rounded-full animate-spin mx-auto" />
            <p className="font-semibold">Loading requests for {QUEUES.find((q) => q.id === activeQueue)?.label}...</p>
          </div>
        ) : requestsError ? (
          <div className="bg-white rounded-2xl border border-rose-200 p-8 text-center text-xs text-rose-600 space-y-2">
            <p className="font-bold text-sm">⚠️ {requestsError}</p>
            <button
              onClick={fetchIncomingRequests}
              className="px-4 py-1.5 rounded-lg bg-slate-900 text-white font-bold cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : currentQueueRequests.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-400 space-y-2">
            <span className="text-3xl">📭</span>
            <p className="font-bold text-slate-700">No requests in {QUEUES.find((q) => q.id === activeQueue)?.label}</p>
            <p className="text-slate-400">
              {activeQueue === 'incoming' && 'New blood requests submitted for this centre will appear here.'}
              {activeQueue === 'allocation' && 'Requests with eligible stock available or reserved will appear here.'}
              {activeQueue === 'matching' && 'Requests with shortfalls or active donor matching will appear here.'}
              {activeQueue === 'clinical' && 'Donors who accepted invitations and arrived for screening will appear here.'}
              {activeQueue === 'lab' && 'Blood units collected and awaiting laboratory release will appear here.'}
              {activeQueue === 'dispatch' && 'Reserved requests ready for courier dispatch will appear here.'}
              {activeQueue === 'receipt' && 'Dispatched orders in transit awaiting delivery confirmation will appear here.'}
              {activeQueue === 'traceability' && 'No requests found.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {currentQueueRequests.map((req) => {
              const primaryAction = getPrimaryAction(req);
              const units = req.units || req.unitsRequested || 1;
              const allocated = req.reservedUnits?.length || req.allocatedUnitsCount || 0;
              const shortfall = req.shortfallCount ?? Math.max(0, units - allocated);
              const stock = req.availableStockCount ?? req.availableEligibleStockCount ?? 0;
              const status = req.status || req.fulfillmentStatus || 'OPEN';
              const matchingReq = req.matchingRequest || req.metadata?.matchingRequest;
              const matchingStatus =
                req.matchingStatus ||
                matchingReq?.status ||
                req.metadata?.donorMatching?.status ||
                'NOT_REQUESTED';
              const releasedCandidateIds =
                req.releasedCandidateIds ||
                matchingReq?.releasedCandidateIds ||
                req.metadata?.donorMatching?.releasedDonorIds ||
                [];
              const releasedCount =
                req.releasedCandidateCount ??
                req.matchingCandidatesCount ??
                releasedCandidateIds.length ??
                0;
              const hasMatching = Boolean(
                req.hasMatchingRequest ||
                (matchingReq && matchingStatus !== 'NOT_REQUESTED') ||
                req.metadata?.donorMatching
              );
              const intakeStatus = req.donorIntake?.intakeStatus || req.metadata?.donorIntake?.intakeStatus;
              const canReject =
                isOperationalStaff &&
                (status === 'OPEN' || status === 'PENDING' || status === 'REQUESTED') &&
                allocated === 0;

              return (
                <div
                  key={req.id}
                  className="bg-white rounded-2xl border border-slate-200 p-4 hover:border-slate-300 transition-all space-y-3 shadow-xs"
                >
                  {/* Card Row 1: Identifiers, Urgency, Status */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-black text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md">
                        {req.requestReference}
                      </span>

                      {/* Urgency Badge */}
                      <span
                        className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${
                          req.urgency === 'CRITICAL'
                            ? 'bg-red-100 text-red-800 animate-pulse border border-red-300'
                            : req.urgency === 'URGENT'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {req.urgency} URGENCY
                      </span>

                      {/* Current Workflow Status */}
                      {(() => {
                        if (status === 'FULFILLED' || status === 'DELIVERED') {
                          return <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">✓ Fulfilled</span>;
                        }
                        if (status === 'DISPATCHED' || status === 'IN_TRANSIT') {
                          return <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200">🚚 Dispatched / In Transit</span>;
                        }
                        if (intakeStatus === 'COLLECTED' || intakeStatus === 'COLLECTION_COMPLETED') {
                          return <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-red-50 text-red-800 border border-red-200">🩸 Blood Collected</span>;
                        }
                        if (intakeStatus === 'SCREENING_IN_PROGRESS' || intakeStatus === 'CLEARED') {
                          return <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200">💉 Screening in Progress</span>;
                        }
                        if (intakeStatus === 'ARRIVED') {
                          return <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200">🏥 Donor Arrived</span>;
                        }
                        if (matchingStatus === 'RELEASED' || matchingStatus === 'CANDIDATES_RELEASED' || releasedCount > 0) {
                          return <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">👥 Candidates Released ({releasedCount})</span>;
                        }
                        if (hasMatching && (matchingStatus === 'SEARCHING' || matchingStatus === 'IN_PROGRESS')) {
                          return <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-200">🔍 Matching in Progress</span>;
                        }
                        if (hasMatching && (matchingStatus === 'REQUESTED' || matchingStatus === 'PENDING_REVIEW')) {
                          return <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">⏳ Matching Requested</span>;
                        }
                        if (allocated > 0 && shortfall > 0) {
                          return <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">⚡ Partially Allocated</span>;
                        }
                        if (status === 'ALLOCATED' || status === 'RESERVED' || status === 'STOCK_RESERVED') {
                          return <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200">📦 Stock Allocated</span>;
                        }
                        if (stock > 0) {
                          return <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">📋 Pending Allocation</span>;
                        }
                        return <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200">● {status.replace('_', ' ')}</span>;
                      })()}

                      {/* Patient Acknowledged Badge */}
                      {req.patientAcknowledgedAt && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          ✓ Patient Delivery Confirmed
                        </span>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-400 font-medium">
                      Submitted: {new Date(req.createdAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>

                  {/* Card Row 2: Four-Column Core Operational Facts Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
                    {/* Blood Group & Component */}
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Blood Group &amp; Component
                      </span>
                      <div className="font-black text-slate-900 text-sm mt-0.5">
                        <span className="text-[#B91C32]">{formatBloodGroup(req.bloodGroup)}</span>
                      </div>
                      <div className="text-[11px] text-slate-600 font-semibold truncate">
                        {req.component || 'PRBC (Red Blood Cells)'}
                      </div>
                    </div>

                    {/* Required Units & Stock Availability */}
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Units &amp; Stock Availability
                      </span>
                      <div className="font-bold text-slate-900 mt-0.5 flex items-center gap-1.5">
                        <span>Required: <strong>{units} unit(s)</strong></span>
                        {stock >= units ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">Fully Available</span>
                        ) : stock > 0 ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 bg-amber-50 text-amber-700 border border-amber-200 rounded">Partially Available</span>
                        ) : (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 bg-rose-50 text-rose-700 border border-rose-200 rounded">Out of Stock</span>
                        )}
                      </div>
                      <div className="text-[11px] mt-0.5 flex flex-wrap items-center gap-1.5">
                        {allocated > 0 ? (
                          <span className="text-indigo-700 font-bold bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                            Allocated: {allocated} of {units}
                          </span>
                        ) : (
                          <span className={stock > 0 ? 'text-emerald-700 font-bold' : 'text-slate-500 font-medium'}>
                            Eligible Stock: {stock}
                          </span>
                        )}
                        <span className="text-slate-300">•</span>
                        <span className={shortfall > 0 ? 'text-amber-700 font-bold' : 'text-emerald-700 font-bold'}>
                          {shortfall > 0 ? `Shortfall: ${shortfall}` : 'Shortfall: 0'}
                        </span>
                      </div>
                      {req.compatibleBloodGroups && req.compatibleBloodGroups.length > 0 && (
                        <div className="text-[10px] text-slate-500 mt-0.5 truncate" title={`Compatible groups: ${req.compatibleBloodGroups.map(formatBloodGroup).join(', ')}`}>
                          Compatible: {req.compatibleBloodGroups.map(formatBloodGroup).join(', ')}
                        </div>
                      )}
                      <div className="mt-1">
                        {shortfall > 0 ? (
                          <span className="text-[10px] font-semibold text-amber-700">
                            {stock > 0 ? `⚠️ ${stock} compatible unit(s) available for allocation` : `⚠️ Shortfall of ${shortfall} unit(s) — Matching Required`}
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-emerald-700">
                            ✓ Ready for Allocation / Dispatched
                          </span>
                        )}
                      </div>
                      {req.reservedUnits && req.reservedUnits.length > 0 && (
                        <div className="text-[10px] font-mono text-indigo-800 mt-0.5 truncate" title={req.reservedUnits.map((u: any) => u.componentCode).join(', ')}>
                          Units: {req.reservedUnits.map((u: any) => u.componentCode).join(', ')}
                        </div>
                      )}
                    </div>

                    {/* Patient & Requester Display */}
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Patient / Requester
                      </span>
                      <div className="font-bold text-slate-900 truncate mt-0.5">
                        {req.patientName || 'Patient'}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {req.contactNumber || req.requesterContact
                          ? `📞 ${req.contactNumber || req.requesterContact}`
                          : 'Portal Submission'}
                      </div>
                    </div>

                    {/* Admitted Hospital & Designated Bank */}
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Hospital &amp; Designated Bank
                      </span>
                      <div className="font-bold text-slate-900 truncate mt-0.5">
                        {req.hospitalName || req.admittedHospitalName || 'Admitted Hospital'}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        Bank: {req.designatedBloodBank?.name || 'This Blood Centre'}
                      </div>
                    </div>
                  </div>

                  {/* Candidates Received Section: Prominently displayed when candidates are released */}
                  {(releasedCount > 0 || matchingStatus === 'RELEASED' || matchingStatus === 'CANDIDATES_RELEASED') && (
                    <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 text-base flex items-center justify-center font-bold">
                          👥
                        </span>
                        <div>
                          <div className="text-xs font-bold text-emerald-950 flex items-center gap-2">
                            <span>Candidates Received ({releasedCount || releasedCandidateIds.length})</span>
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                              System Admin Approved
                            </span>
                          </div>
                          <p className="text-[11px] text-emerald-800 mt-0.5">
                            {req.releasedAt || matchingReq?.releasedAt
                              ? `Released ${new Date(req.releasedAt || matchingReq.releasedAt).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} • Approved voluntary donors ready for outreach & intake.`
                              : 'Approved voluntary donor candidates ready for direct contact and arrival intake.'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleViewReleasedCandidates(req)}
                        disabled={loadingCandidates}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>View {releasedCount || releasedCandidateIds.length || 'Released'} Candidates</span>
                        <span>→</span>
                      </button>
                    </div>
                  )}

                  {/* Card Row 3: Action Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                    {/* Secondary Actions: View Details and Traceability */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedRequestForDetail(req)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                      >
                        <span>🔍</span>
                        <span>View Details</span>
                      </button>

                      <button
                        onClick={() => handleViewTraceability(req)}
                        className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                      >
                        <span>🧬</span>
                        <span>Traceability</span>
                      </button>

                      {canReject && (
                        <button
                          onClick={() => {
                            setSelectedRequestForReject(req);
                            setRejectionReasonInput('');
                          }}
                          className="px-2.5 py-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                        >
                          ✕ Reject
                        </button>
                      )}
                    </div>

                    {/* Action Controls for this Request */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* 1. Allocate Available Stock: Visible when eligible stock >= 1 and shortfall > 0 */}
                      {stock > 0 && shortfall > 0 && status !== 'ALLOCATED' && status !== 'RESERVED' && status !== 'STOCK_RESERVED' && status !== 'DISPATCHED' && status !== 'FULFILLED' && (
                        <button
                          onClick={() => handleAcceptAndReserve(req)}
                          disabled={!isOperationalStaff || actionLoadingId === req.id}
                          title={!isOperationalStaff ? 'Operational Staff required to allocate stock' : undefined}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                        >
                          {actionLoadingId === req.id ? 'Allocating...' : stock >= shortfall ? 'Allocate Stock' : `Allocate Available (${stock})`}
                        </button>
                      )}

                      {/* 2. Request Donor Matching: Visible ONLY when shortfall > 0 AND matching not already requested */}
                      {shortfall > 0 && !hasMatching && (
                        <button
                          onClick={() => handleRequestMatching(req)}
                          disabled={!isOperationalStaff || actionLoadingId === req.id}
                          title={!isOperationalStaff ? 'Operational Staff required to request matching' : undefined}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                        >
                          {actionLoadingId === req.id ? 'Submitting...' : `Request Matching for ${shortfall} Shortfall`}
                        </button>
                      )}

                      {/* 2b. Matching already requested indicator */}
                      {shortfall > 0 && hasMatching && (matchingStatus === 'REQUESTED' || matchingStatus === 'PENDING_REVIEW') && (
                        <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                          ⏳ Matching requested — awaiting System Admin review
                        </span>
                      )}

                      {/* 3. View Released Candidates: Visible when System Admin has released candidates */}
                      {(releasedCount > 0 || matchingStatus === 'RELEASED' || matchingStatus === 'CANDIDATES_RELEASED') && (
                        <button
                          onClick={() => handleViewReleasedCandidates(req)}
                          disabled={loadingCandidates}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                        >
                          {loadingCandidates ? 'Loading...' : `View ${releasedCount || 'Released'} Candidates`}
                        </button>
                      )}

                      {/* 4. Downstream Workflow Action (e.g. Dispatch, Receipt, Lab) */}
                      {primaryAction.action !== 'ACCEPT_RESERVE' && primaryAction.action !== 'REQUEST_MATCHING' && primaryAction.action !== 'OPEN_CANDIDATES' && primaryAction.action !== 'NONE' && (
                        <button
                          onClick={() => executePrimaryAction(primaryAction.action, req)}
                          disabled={primaryAction.disabled || actionLoadingId === req.id}
                          title={primaryAction.tooltip}
                          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer ${
                            primaryAction.action === 'DIRECT_DISPATCH'
                              ? 'bg-sky-600 hover:bg-sky-700 text-white'
                              : primaryAction.action === 'CONFIRM_RECEIPT'
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : primaryAction.action === 'START_SCREENING'
                              ? 'bg-teal-600 hover:bg-teal-700 text-white'
                              : 'bg-slate-900 hover:bg-slate-800 text-white'
                          }`}
                        >
                          {actionLoadingId === req.id && <span className="inline-block animate-spin mr-1">↻</span>}
                          <span>{primaryAction.label}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Orders List Bridge in Dispatch Queue */}
        {activeQueue === 'dispatch' && orders.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3 mt-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                Hospital Cold-Chain Issue Orders ({orders.length})
              </h3>
              <button
                onClick={() => setShowAuthoriseModal(true)}
                className="px-3 py-1 bg-[#B91C32] text-white rounded-lg text-xs font-bold hover:bg-[#9B1527] cursor-pointer"
              >
                + Authorise Issue Order
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {orders.map((ord) => (
                <div key={ord.id} className="py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div>
                    <span className="font-mono font-bold text-slate-900">Order #{ord.orderNumber}</span>
                    <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                      {ord.status}
                    </span>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Destination: {ord.receivingFacility?.name || 'Receiving Facility'} • {ord.items?.length || 1} item(s)
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400">
                    Created: {new Date(ord.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Traceability Lookup Tool in Traceability Queue */}
        {activeQueue === 'traceability' && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3 mt-6">
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Component Custody &amp; Unit Traceability Tool
            </h3>
            <p className="text-xs text-slate-500">
              Lookup any individual blood bag or component unit ID to reconstruct its complete custody trail.
            </p>
            <div className="flex gap-2 max-w-md">
              <input
                type="text"
                placeholder="Enter Component Unit ID..."
                value={custodySearchId}
                onChange={(e) => setCustodySearchId(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono"
              />
              <button
                onClick={() => handleLookupCustody(custodySearchId.trim())}
                disabled={custodyLoading || !custodySearchId.trim()}
                className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 cursor-pointer"
              >
                {custodyLoading ? 'Tracing...' : 'Trace'}
              </button>
            </div>

            {custodyData && (
              <div className="p-4 bg-slate-50 rounded-xl space-y-2 border border-slate-200 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-black text-slate-900">{custodyData.component?.componentCode}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white border border-slate-200 text-slate-800">
                    Status: {custodyData.component?.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-600">
                  <div>Type: {custodyData.component?.componentType}</div>
                  <div>Blood Group: {custodyData.component?.bloodGroup}</div>
                  <div>Volume: {custodyData.component?.volumeMl} ml</div>
                  <div>Origin Unit: {custodyData.component?.originatingCollectionUnit?.unitNumber}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* MODAL: Donor Workflow Panel (Released Candidates) */}
      {/* ======================================================== */}
      {releasedCandidatesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 my-8">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg">👥</span>
                  <h3 className="text-base font-bold text-slate-900">
                    Donor Outreach &amp; Intake — Request {releasedCandidatesModal.requestRef}
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                  {releasedCandidatesModal.bloodGroup && (
                    <span className="font-bold text-[#B91C32] bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                      {formatBloodGroup(releasedCandidatesModal.bloodGroup)}
                    </span>
                  )}
                  {releasedCandidatesModal.component && (
                    <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                      {releasedCandidatesModal.component}
                    </span>
                  )}
                  {releasedCandidatesModal.shortfall !== undefined && (
                    <span className="font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                      Shortfall: {releasedCandidatesModal.shortfall} unit(s)
                    </span>
                  )}
                  <span className="font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                    Status: {releasedCandidatesModal.matchingStatus || 'RELEASED'}
                  </span>
                  {releasedCandidatesModal.releasedAt && (
                    <span className="text-slate-500 font-medium">
                      Released: {new Date(releasedCandidatesModal.releasedAt).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  Officially released voluntary donor candidates approved by System Administration. Contact candidates directly or record arrival intake.
                  Raw GPS coordinates withheld under medical privacy guidelines.
                </p>
              </div>
              <button
                onClick={() => setReleasedCandidatesModal(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {releasedCandidatesModal.candidates.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                No candidates were selected in the release. Contact System Administration if shortfall persists.
              </div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                  <span>Approved Candidates ({releasedCandidatesModal.candidates.length})</span>
                  {invitationSuccessNotice && (
                    <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded text-[11px] font-bold">
                      {invitationSuccessNotice}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {releasedCandidatesModal.candidates.map((c: any, idx: number) => {
                    const isReadyForScreening = c.intakeStatus === 'SCREENING_IN_PROGRESS' || c.readyForScreening;
                    const isArrived = c.arrived || c.intakeStatus === 'ARRIVED' || isReadyForScreening;
                    const isAccepted = c.invitationStatus === 'ACCEPTED';
                    const isPending = c.invitationStatus === 'PENDING';
                    const isDeclined = c.invitationStatus === 'DECLINED';
                    const isUnreachable = c.invitationStatus === 'CANCELLED';

                    return (
                      <div
                        key={c.donorId || idx}
                        className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all text-xs space-y-2.5 shadow-2xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 font-bold text-[10px] flex items-center justify-center">
                              #{idx + 1}
                            </span>
                            <div>
                              <span className="font-bold text-slate-900 block">
                                Voluntary Donor #{c.donorId ? c.donorId.slice(0, 6) : idx + 1}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {c.locality || `District Centroid`}
                              </span>
                            </div>
                          </div>

                          <span className="font-bold text-[#B91C32] bg-red-50 border border-red-200 px-2 py-0.5 rounded text-[11px]">
                            {formatBloodGroup(c.bloodGroup)}
                          </span>
                        </div>

                        {/* Proximity and Tier */}
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                          {/* Transfusion Compatibility */}
                          <span className="px-1.5 py-0.5 rounded font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            ✓ Compatible
                          </span>

                          {/* Match Level */}
                          <span className="px-2 py-0.5 rounded font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            {c.matchLevel === 'LEVEL_1_CENTRE'
                              ? '★ Preferred Centre'
                              : c.matchLevel === 'LEVEL_2_DISTRICT'
                              ? 'Same District'
                              : 'District Scope'}
                          </span>

                          {/* Proximity Tier: STRICT LABELS */}
                          {c.proximityTier === 'FRESH_GPS' ? (
                            <span className="px-2 py-0.5 rounded font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                              <span>🟢</span> Live GPS
                            </span>
                          ) : c.proximityTier === 'STALE_GPS' ? (
                            <span className="px-2 py-0.5 rounded font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1" title="Recorded location is older than 30 minutes">
                              <span>🟡</span> Stale Location {c.distanceKm !== null ? `(~${c.distanceKm} km)` : ''}
                            </span>
                          ) : c.proximityTier === 'REGISTERED_AREA' ? (
                            <span className="px-2 py-0.5 rounded font-bold bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                              <span>📍</span> Area Centroid
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded font-bold bg-slate-100 text-slate-500 border border-slate-200">
                              Location Unknown
                            </span>
                          )}

                          {c.distanceKm !== null && (
                            <span className="px-2 py-0.5 rounded font-semibold bg-slate-100 text-slate-600" title="Straight-line Haversine distance">
                              Straight-line: ~{c.distanceKm} km
                            </span>
                          )}

                          {/* Road directions on-demand */}
                          {releasedRoadDirections[c.donorId] ? (
                            releasedRoadDirections[c.donorId].loading ? (
                              <span className="text-[10px] text-slate-400 animate-pulse">Calculating route...</span>
                            ) : releasedRoadDirections[c.donorId].error ? (
                              <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200" title={releasedRoadDirections[c.donorId].error}>
                                ⚠️ Road route unavailable
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 flex items-center gap-1">
                                <span>🚗</span> ~{releasedRoadDirections[c.donorId].distanceKm} km · ~{releasedRoadDirections[c.donorId].durationMinutes}m drive
                              </span>
                            )
                          ) : (
                            <button
                              type="button"
                              onClick={() => fetchReleasedCandidateRoadDirections(releasedCandidatesModal.requestId, c.donorId)}
                              className="text-[10px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded transition-colors border border-blue-200 cursor-pointer"
                            >
                              Calculate Road Route &amp; ETA
                            </button>
                          )}
                        </div>

                        {/* Phone Number Display upon acceptance */}
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                          <div>
                            {c.contactNumber ? (
                              <div className="font-bold text-emerald-700 flex items-center gap-1">
                                <span>📞 {c.contactNumber}</span>
                                <span className="text-[9px] text-emerald-600 bg-emerald-50 px-1 py-0.2 rounded">
                                  Disclosed
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[10px]">
                                {isAccepted ? 'Phone disclosing...' : '🔒 Phone disclosed upon acceptance'}
                              </span>
                            )}
                          </div>

                          {/* Status Badge */}
                          <div>
                            {isReadyForScreening ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 text-teal-800 border border-teal-200">
                                📋 In Clinical Queue
                              </span>
                            ) : isArrived ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                                🏥 Arrived / Verified
                              </span>
                            ) : isAccepted ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                ✓ Accepted
                              </span>
                            ) : isPending ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                ⏳ Pending Response
                              </span>
                            ) : isDeclined ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                                Declined
                              </span>
                            ) : isUnreachable ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700">
                                Unreachable
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500">
                                Released
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Outreach & Workflow Action Controls */}
                        <div className="pt-2 flex flex-col gap-1.5 border-t border-slate-100">
                          {isReadyForScreening ? (
                            <div>
                              {isClinicalStaff ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReleasedCandidatesModal(null);
                                    setClinicalScreeningModal({
                                      requestId: releasedCandidatesModal.requestId,
                                      requestRef: releasedCandidatesModal.requestRef,
                                      attendanceId: c.attendanceId || c.donorId,
                                      donorName: `Voluntary Donor #${c.donorId ? c.donorId.slice(0, 6) : (idx + 1)}`,
                                    });
                                  }}
                                  className="w-full px-2.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold text-[10px] cursor-pointer text-center"
                                >
                                  Start Clinical Screening (Medical Staff)
                                </button>
                              ) : (
                                <div className="text-[10px] text-slate-500 bg-slate-50 border border-slate-200 rounded p-1.5 text-center font-medium">
                                  🔒 Awaiting Clinical Screening (Requires CLINICAL_STAFF role; Reception cannot screen)
                                </div>
                              )}
                            </div>
                          ) : isArrived ? (
                            <div className="space-y-1">
                              <button
                                type="button"
                                onClick={() => handleVerifyDonorHandoff(releasedCandidatesModal.requestId, c.donorId)}
                                disabled={handoffLoading[c.donorId]}
                                className="w-full px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg font-bold text-[10px] cursor-pointer text-center flex items-center justify-center gap-1"
                              >
                                {handoffLoading[c.donorId] ? 'Verifying 90-day interval...' : 'Verify Donor & Send to Clinical Staff'}
                              </button>
                              <div className="text-[9px] text-slate-400 text-center">
                                Checks 90-day interval &amp; photo ID before clinical queue handoff
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-1.5">
                              <button
                                type="button"
                                onClick={() => handleRecordArrival(releasedCandidatesModal.requestId, c.donorId)}
                                disabled={arrivalLoading[c.donorId]}
                                className="w-full px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-bold text-[10px] cursor-pointer text-center"
                              >
                                {arrivalLoading[c.donorId] ? 'Verifying...' : 'Mark Arrived / Ready for Donation'}
                              </button>

                              {!isAccepted && !isDeclined && !isUnreachable && (
                                <div className="flex items-center gap-1 w-full">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDonorOutreach(releasedCandidatesModal.requestId, c.donorId, 'ACCEPTED')
                                    }
                                    className="flex-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded font-semibold text-[9px] cursor-pointer text-center"
                                  >
                                    Mark Accepted
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDonorOutreach(releasedCandidatesModal.requestId, c.donorId, 'DECLINED')
                                    }
                                    className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded font-semibold text-[9px] cursor-pointer"
                                  >
                                    Declined
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDonorOutreach(releasedCandidatesModal.requestId, c.donorId, 'CANCELLED')
                                    }
                                    className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded font-semibold text-[9px] cursor-pointer"
                                  >
                                    Unreachable
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4 border-t border-slate-200">
              <button
                onClick={() => setReleasedCandidatesModal(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                Close Candidate Pool
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: Clinical Screening & Deferral Assessment */}
      {/* ======================================================== */}
      {clinicalScreeningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  🩺 Clinical Screening &amp; Deferral Assessment
                </h3>
                <p className="text-xs text-slate-500">
                  Request {clinicalScreeningModal.requestRef} • {clinicalScreeningModal.donorName || 'Voluntary Donor'}
                </p>
              </div>
              <button
                onClick={() => setClinicalScreeningModal(null)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveClinicalScreening} className="space-y-4 text-xs">
              {/* Role Gate Notice */}
              <div className="p-2.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-900 text-[11px] font-semibold flex items-center justify-between">
                <span>Authorized Clinician: {userRole}</span>
                <span className="font-mono text-[10px] bg-white px-2 py-0.5 rounded border border-teal-200">
                  Protocol v1.0
                </span>
              </div>

              {/* Informed Consent */}
              <label className="flex items-center gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentGiven}
                  onChange={(e) => setConsentGiven(e.target.checked)}
                  className="rounded text-[#B91C32]"
                />
                <span className="font-bold text-slate-800">
                  Informed Consent Received (Mandatory prior to phlebotomy)
                </span>
              </label>

              {/* Hemoglobin */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Hemoglobin (g/dL)</label>
                <input
                  type="text"
                  value={hemoglobin}
                  onChange={(e) => setHemoglobin(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold"
                  placeholder="e.g. 13.5"
                />
              </div>

              {/* Eligibility Decision */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Eligibility Decision</label>
                <select
                  value={eligibilityDecision}
                  onChange={(e) => setEligibilityDecision(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold"
                >
                  <option value="CLEARED">CLEARED (Eligible for Collection)</option>
                  <option value="TEMPORARY_DEFERRAL">TEMPORARY DEFERRAL</option>
                  <option value="PERMANENT_DEFERRAL">PERMANENT DEFERRAL</option>
                </select>
              </div>

              {/* Deferral Fields if not cleared */}
              {eligibilityDecision !== 'CLEARED' && (
                <div className="space-y-3 p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <div>
                    <label className="block font-bold text-amber-900 mb-1">Deferral Reason Category</label>
                    <select
                      value={deferralCategory}
                      onChange={(e) => setDeferralCategory(e.target.value as any)}
                      className="w-full px-3 py-1.5 rounded-lg border border-amber-300 text-xs bg-white"
                    >
                      <option value="LOW_HEMOGLOBIN">LOW HEMOGLOBIN (&lt; 12.5 g/dL)</option>
                      <option value="RECENT_ILLNESS">RECENT ILLNESS / INFECTION</option>
                      <option value="MEDICATION">CONTRAINDICATED MEDICATION</option>
                      <option value="WEIGHT_CRITERIA">WEIGHT CRITERIA (&lt; 45 kg)</option>
                      <option value="OTHER">OTHER CLINICAL CONTRAINDICATION</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-amber-900 mb-1">Deferral Duration (Days)</label>
                    <input
                      type="number"
                      value={deferralDurationDays}
                      onChange={(e) => setDeferralDurationDays(Number(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-lg border border-amber-300 text-xs bg-white"
                    />
                  </div>
                </div>
              )}

              {/* Clinical Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Clinical Assessment Notes</label>
                <textarea
                  rows={2}
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setClinicalScreeningModal(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={screeningLoading || !consentGiven}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg font-bold cursor-pointer"
                >
                  {screeningLoading ? 'Recording...' : 'Submit Clinical Decision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: Phlebotomy Collection */}
      {/* ======================================================== */}
      {collectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  🩸 Phlebotomy &amp; Component Collection
                </h3>
                <p className="text-xs text-slate-500">
                  Request {collectionModal.requestRef} • Phlebotomy Quarantined Collection
                </p>
              </div>
              <button
                onClick={() => setCollectionModal(null)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCollection} className="space-y-4 text-xs">
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-900 text-[11px] font-semibold flex items-center justify-between">
                <span>Authorized Phlebotomist: {userRole}</span>
                <span className="font-mono text-[10px] bg-white px-2 py-0.5 rounded border border-red-200">
                  {formatBloodGroup(collectionModal.bloodGroup)}
                </span>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Bag Barcode / Identifier</label>
                <input
                  type="text"
                  placeholder="e.g. BAG-847291"
                  value={bagIdentifier}
                  onChange={(e) => setBagIdentifier(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Volume (mL)</label>
                  <select
                    value={collectionVolume}
                    onChange={(e) => setCollectionVolume(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold"
                  >
                    <option value={350}>350 mL (Standard Bag)</option>
                    <option value={450}>450 mL (High Volume Bag)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Derived Component</label>
                  <select
                    value={componentType}
                    onChange={(e) => setComponentType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold"
                  >
                    <option value="PRBC">PRBC (Packed Red Cells)</option>
                    <option value="WHOLE_BLOOD">WHOLE BLOOD</option>
                    <option value="PLATELET_CONCENTRATE">PLATELET CONCENTRATE</option>
                    <option value="FRESH_FROZEN_PLASMA">FRESH FROZEN PLASMA</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Collection Notes</label>
                <textarea
                  rows={2}
                  value={collectionNotes}
                  onChange={(e) => setCollectionNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCollectionModal(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={collectionLoading}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-bold cursor-pointer"
                >
                  {collectionLoading ? 'Recording Collection...' : 'Record Quarantined Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: Direct Dispatch for Reserved Blood Request */}
      {/* ======================================================== */}
      {selectedRequestForDirectDispatch && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="font-mono text-xs font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                  {selectedRequestForDirectDispatch.requestReference}
                </span>
                <h3 className="text-base font-black text-slate-900 mt-1">Direct Cold-Chain Dispatch</h3>
              </div>
              <button
                onClick={() => setSelectedRequestForDirectDispatch(null)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleDirectDispatch} className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1">
                <div><strong>Destination Hospital:</strong> {selectedRequestForDirectDispatch.hospitalName || selectedRequestForDirectDispatch.admittedHospitalName}</div>
                <div><strong>Patient:</strong> {selectedRequestForDirectDispatch.patientName}</div>
                <div><strong>Component:</strong> {formatBloodGroup(selectedRequestForDirectDispatch.bloodGroup)} ({selectedRequestForDirectDispatch.units} unit(s))</div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Cold-Chain Courier / Service Name</label>
                <input
                  type="text"
                  required
                  value={courierName}
                  onChange={(e) => setCourierName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Vehicle Number</label>
                  <input
                    type="text"
                    required
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Driver Contact</label>
                  <input
                    type="text"
                    required
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Cold Box Temperature (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={coldBoxTempCelsius}
                  onChange={(e) => setColdBoxTempCelsius(Number(e.target.value))}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Dispatch Notes</label>
                <textarea
                  rows={2}
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedRequestForDirectDispatch(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={dispatchLoading}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg font-bold cursor-pointer"
                >
                  {dispatchLoading ? 'Dispatching...' : 'Confirm Dispatch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: Request Details & Lifecycle */}
      {/* ======================================================== */}
      {selectedRequestForDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="font-mono text-xs font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                  {selectedRequestForDetail.requestReference}
                </span>
                <h3 className="text-base font-black text-slate-900 mt-1">
                  Blood Request Details &amp; Lifecycle
                </h3>
              </div>
              <button
                onClick={() => setSelectedRequestForDetail(null)}
                className="text-slate-400 hover:text-slate-700 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Patient &amp; Hospital</span>
                <div><strong>Patient:</strong> {selectedRequestForDetail.patientName}</div>
                <div><strong>Hospital:</strong> {selectedRequestForDetail.hospitalName || selectedRequestForDetail.admittedHospitalName}</div>
                <div><strong>Contact:</strong> {selectedRequestForDetail.contactNumber || selectedRequestForDetail.requesterContact || 'Portal'}</div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl space-y-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Requirements &amp; Stock</span>
                <div><strong>Blood Group:</strong> {formatBloodGroup(selectedRequestForDetail.bloodGroup)}</div>
                <div><strong>Units Requested:</strong> {selectedRequestForDetail.units || selectedRequestForDetail.unitsRequested} Unit(s)</div>
                <div><strong>Eligible Stock:</strong> {selectedRequestForDetail.availableStockCount ?? 0} Unit(s)</div>
                <div><strong>Shortfall:</strong> {selectedRequestForDetail.shortfallCount ?? 0} Unit(s)</div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setSelectedRequestForDetail(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: Reject Request with Documented Reason */}
      {/* ======================================================== */}
      {selectedRequestForReject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-black text-slate-900">
              Document Rejection — {selectedRequestForReject.requestReference}
            </h3>
            <p className="text-xs text-slate-500">
              Regulatory guidelines require a documented clinical or administrative reason for request rejection.
            </p>

            <form onSubmit={handleRejectRequest} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Reason for Rejection</label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Incompatible cross-match; unconfirmed facility admission"
                  value={rejectionReasonInput}
                  onChange={(e) => setRejectionReasonInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedRequestForReject(null)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rejectLoading || !rejectionReasonInput.trim()}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg font-bold cursor-pointer"
                >
                  {rejectLoading ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: Traceability Lineage */}
      {/* ======================================================== */}
      {traceabilityModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 space-y-6 my-8">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-indigo-100 text-indigo-800 rounded-lg text-sm font-bold">🧬</span>
                  <h3 className="text-base font-extrabold text-slate-900">
                    End-to-End Clinical &amp; Supply Traceability Lineage
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Complete audit trail spanning request intake, donor outreach, clinical screening, testing, clinical release, inventory, dispatch and receipt.
                </p>
              </div>
              <button
                onClick={() => setTraceabilityModal(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {traceabilityModal.loading && (
              <div className="py-16 text-center space-y-3">
                <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs font-semibold text-slate-500">Reconstructing complete regulatory lineage graph...</p>
              </div>
            )}

            {traceabilityModal.error && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-bold">
                {traceabilityModal.error}
              </div>
            )}

            {traceabilityModal.data && (
              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 text-xs">
                {/* 1. Request Node */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900">1. Canonical Blood Request</span>
                    <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                      {traceabilityModal.data.request.reference}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-600">
                    <div>Patient: <strong>{traceabilityModal.data.request.patientName}</strong></div>
                    <div>Blood Group: <strong>{formatBloodGroup(traceabilityModal.data.request.bloodGroup)}</strong></div>
                    <div>Units: <strong>{traceabilityModal.data.request.units}</strong></div>
                    <div>Status: <strong>{traceabilityModal.data.request.status}</strong></div>
                  </div>
                </div>

                {/* 2. Clinical Screening Node */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900">2. Donor Intake &amp; Clinical Screening</span>
                    {traceabilityModal.data.clinicalScreening ? (
                      <span className="px-2 py-0.5 rounded font-bold bg-teal-100 text-teal-800 text-[10px]">
                        {traceabilityModal.data.clinicalScreening.decision}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">Not applicable</span>
                    )}
                  </div>
                  {traceabilityModal.data.clinicalScreening && (
                    <div className="grid grid-cols-2 gap-2 text-slate-600">
                      <div>Consent: <strong>{traceabilityModal.data.clinicalScreening.consentGiven ? 'Given' : 'Withheld'}</strong></div>
                      <div>Decision Time: <strong>{new Date(traceabilityModal.data.clinicalScreening.screeningDate).toLocaleString()}</strong></div>
                    </div>
                  )}
                </div>

                {/* 3. Phlebotomy Collection Unit */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900">3. Collection Unit</span>
                    {traceabilityModal.data.collectionUnit ? (
                      <span className="px-2 py-0.5 rounded font-bold bg-red-100 text-red-800 text-[10px]">
                        {traceabilityModal.data.collectionUnit.status}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">No collection recorded</span>
                    )}
                  </div>
                  {traceabilityModal.data.collectionUnit && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-600">
                      <div>Bag: <strong>{traceabilityModal.data.collectionUnit.unitNumber}</strong></div>
                      <div>Blood Group: <strong>{formatBloodGroup(traceabilityModal.data.collectionUnit.bloodGroup)}</strong></div>
                      <div>Volume: <strong>{traceabilityModal.data.collectionUnit.volumeMl} ml</strong></div>
                    </div>
                  )}
                </div>

                {/* 4. Dual Confirmation Node */}
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <span className="font-extrabold text-slate-900 block">4. Dual Receipt Confirmation</span>
                  <div className="grid grid-cols-2 gap-2 text-slate-600">
                    <div>
                      Hospital Received: {traceabilityModal.data.dualReceiptConfirmation?.isHospitalReceived ? '✓ Confirmed' : 'Pending'}
                    </div>
                    <div>
                      Patient Acknowledged: {traceabilityModal.data.dualReceiptConfirmation?.isPatientAcknowledged ? '✓ Acknowledged' : 'Pending'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-200">
              <button
                onClick={() => setTraceabilityModal(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                Close Traceability
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL: Authorise Hospital Issue Order (Legacy Bridge) */}
      {/* ======================================================== */}
      {showAuthoriseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-black text-slate-900">Authorise Hospital Issue Order</h3>
            <form onSubmit={handleAuthoriseIssue} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Receiving Facility Organisation ID</label>
                <input
                  type="text"
                  required
                  placeholder="Organisation UUID of receiving hospital"
                  value={receivingFacilityId}
                  onChange={(e) => setReceivingFacilityId(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Component Unit IDs (Comma-separated)</label>
                <input
                  type="text"
                  required
                  placeholder="ID-1, ID-2"
                  value={componentUnitIdsInput}
                  onChange={(e) => setComponentUnitIdsInput(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Authorisation Reason</label>
                <input
                  type="text"
                  value={authorisationReason}
                  onChange={(e) => setAuthorisationReason(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAuthoriseModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg font-bold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={authoriseLoading}
                  className="px-5 py-2 bg-[#B91C32] hover:bg-[#9B1527] disabled:opacity-50 text-white rounded-lg font-bold cursor-pointer"
                >
                  {authoriseLoading ? 'Authorising...' : 'Authorise Issue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
