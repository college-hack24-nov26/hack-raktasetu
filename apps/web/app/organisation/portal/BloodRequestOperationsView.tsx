'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { authFetch, getAuthToken } from '../../config/api';
import { useRealtime } from '../../hooks/useRealtime';

interface BloodRequestOperationsViewProps {
  isPlatformAdmin: boolean;
}

interface AdminRequestItem {
  id: string;
  requestReference: string;
  patientName: string;
  requester?: {
    id: string;
    name: string | null;
    phoneNumber?: string | null;
    email?: string | null;
  };
  bloodGroup: string;
  component: string;
  unitsRequested: number;
  allocatedUnitsCount?: number;
  shortfallCount?: number;
  isPartialAllocation?: boolean;
  reservedUnitDetails?: Array<{
    id: string;
    componentCode: string;
    componentType?: string;
    bloodGroup?: string;
    volumeMl?: number | null;
    expiresAt?: string | null;
    status?: string;
  }>;
  requiredBy?: string | null;
  urgency: 'ROUTINE' | 'URGENT' | 'CRITICAL' | string;
  status: string;
  fulfillmentStatus: string;
  closureOutcome?: string | null;
  closureFeedback?: string | null;
  hospitalCode?: string | null;
  admittedHospitalName: string;
  isHospitalVerified: boolean;
  receivingFacilityId?: string | null;
  assignedBankId?: string | null;
  assignedBankName?: string | null;
  routingType: 'DIRECT_PARTICIPATING' | 'EXTERNAL_DIRECTORY' | 'DISTRICT_COORDINATION' | string;
  transportDetails?: any;
  patientAcknowledgedAt?: string | null;
  patientAcknowledgedBy?: string | null;
  receiptNotes?: string | null;
  confirmedByRole?: string | null;
  createdAt: string;
  updatedAt: string;
  activityHistory: Array<{
    id: string;
    action: string;
    userId?: string;
    metadata?: any;
    timestamp: string;
  }>;
}

export function BloodRequestOperationsView({ isPlatformAdmin }: BloodRequestOperationsViewProps) {
  const [requests, setRequests] = useState<AdminRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [bloodGroupFilter, setBloodGroupFilter] = useState('ALL');
  const [selectedRequest, setSelectedRequest] = useState<AdminRequestItem | null>(null);
  const [realtimeAlert, setRealtimeAlert] = useState<string | null>(null);
  const [metrics, setMetrics] = useState({
    total: 0,
    submitted: 0,
    accepted: 0,
    reserved: 0,
    dispatched: 0,
    fulfilled: 0,
    closed: 0,
  });

  // Phase 3: Donor Matching Operations State
  const [activeSection, setActiveSection] = useState<'requests' | 'matching'>('requests');
  const [matchingRequests, setMatchingRequests] = useState<any[]>([]);
  const [loadingMatching, setLoadingMatching] = useState(false);
  const [selectedMatchingRequest, setSelectedMatchingRequest] = useState<any | null>(null);
  const [matchingSearchResults, setMatchingSearchResults] = useState<any | null>(null);
  const [searchingCandidates, setSearchingCandidates] = useState(false);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [releasingCandidates, setReleasingCandidates] = useState(false);
  const [roadDirections, setRoadDirections] = useState<Record<string, { distanceKm: number; durationMinutes: number; loading?: boolean; error?: string }>>({});

  const fetchCandidateRoadDirections = async (candidateId: string) => {
    if (!selectedMatchingRequest) return;
    setRoadDirections(prev => ({ ...prev, [candidateId]: { distanceKm: 0, durationMinutes: 0, loading: true } }));
    try {
      const res = await authFetch(`/api/v1/admin/matching/requests/${selectedMatchingRequest.id}/candidates/${candidateId}/directions`);
      const data = await res.json();
      if (!res.ok || !data.data) {
        throw new Error(data.error?.message || 'Route not found');
      }
      setRoadDirections(prev => ({
        ...prev,
        [candidateId]: {
          distanceKm: data.data.distanceKm,
          durationMinutes: data.data.durationMinutes,
          loading: false,
        },
      }));
    } catch (err: any) {
      setRoadDirections(prev => ({
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
  const [scopeInput, setScopeInput] = useState<'EXACT_CENTRE' | 'DISTRICT_EXPANDED' | 'OUT_OF_DISTRICT'>('EXACT_CENTRE');
  const [expansionReasonInput, setExpansionReasonInput] = useState('');
  const [releaseSuccessAlert, setReleaseSuccessAlert] = useState<string | null>(null);

  const fetchMatchingRequests = useCallback(async () => {
    try {
      setLoadingMatching(true);
      const res = await authFetch('/api/v1/admin/matching/requests');
      const data = await res.json();
      if (res.ok && data.success) {
        setMatchingRequests(data.data || []);
      }
    } catch (err: any) {
      console.warn('Could not load matching requests:', err);
    } finally {
      setLoadingMatching(false);
    }
  }, []);

  const handleOpenMatchingModal = async (mr: any) => {
    setSelectedMatchingRequest(mr);
    setScopeInput(mr.searchScope || 'EXACT_CENTRE');
    setExpansionReasonInput(mr.expansionReason || '');
    setSelectedCandidateIds(new Set());
    setMatchingSearchResults(null);
    setReleaseSuccessAlert(null);

    // Auto-run search on open to populate current eligible candidates
    try {
      setSearchingCandidates(true);
      const res = await authFetch(`/api/v1/admin/matching/requests/${mr.requestId}/run-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: mr.searchScope || 'EXACT_CENTRE',
          expansionReason: mr.expansionReason || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMatchingSearchResults(data.data);
        // Pre-select candidates up to shortfall if available
        const shortfall = mr.requestedShortfall || 1;
        const candidates = data.data?.candidates || [];
        const topIds = candidates.slice(0, shortfall).map((c: any) => c.donorId);
        setSelectedCandidateIds(new Set(topIds));
      }
    } catch (err: any) {
      console.warn('Auto search runner failed:', err);
    } finally {
      setSearchingCandidates(false);
    }
  };

  const handleRunSearch = async () => {
    if (!selectedMatchingRequest) return;
    try {
      setSearchingCandidates(true);
      const res = await authFetch(`/api/v1/admin/matching/requests/${selectedMatchingRequest.requestId}/run-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: scopeInput,
          expansionReason: expansionReasonInput || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Matching search failed');
      }
      setMatchingSearchResults(data.data);
      const shortfall = selectedMatchingRequest.requestedShortfall || 1;
      const candidates = data.data?.candidates || [];
      const topIds = candidates.slice(0, shortfall).map((c: any) => c.donorId);
      setSelectedCandidateIds(new Set(topIds));
      fetchMatchingRequests();
    } catch (err: any) {
      alert(err.message || 'Failed to run matching search');
    } finally {
      setSearchingCandidates(false);
    }
  };

  const handleReleaseCandidates = async () => {
    if (!selectedMatchingRequest || selectedCandidateIds.size === 0) return;
    try {
      setReleasingCandidates(true);
      const res = await authFetch(`/api/v1/admin/matching/requests/${selectedMatchingRequest.requestId}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateIds: Array.from(selectedCandidateIds),
          notes: `Released ${selectedCandidateIds.size} candidates to ${selectedMatchingRequest.requestingOrgName}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to release candidates');
      }
      setReleaseSuccessAlert(`✓ Released ${selectedCandidateIds.size} candidate(s) to ${selectedMatchingRequest.requestingOrgName}!`);
      fetchMatchingRequests();
      fetchAdminRequests();
    } catch (err: any) {
      alert(err.message || 'Failed to release candidates');
    } finally {
      setReleasingCandidates(false);
    }
  };

  const pendingMatchingCount = useMemo(() => {
    return matchingRequests.filter((m) => m.status === 'REQUESTED' || m.status === 'SEARCH_RUNNING').length;
  }, [matchingRequests]);

  const fetchAdminRequests = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = getAuthToken();
      if (!token) {
        throw new Error('Authentication required.');
      }

      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (bloodGroupFilter !== 'ALL') params.set('bloodGroup', bloodGroupFilter);
      params.set('limit', '100');

      const res = await authFetch(`/api/v1/admin/blood-requests?${params.toString()}`);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to fetch platform blood requests');
      }

      setRequests(data.data || []);
      if (data.metrics) {
        setMetrics(data.metrics);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading platform blood requests');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, bloodGroupFilter]);

  useEffect(() => {
    if (isPlatformAdmin) {
      fetchAdminRequests();
      fetchMatchingRequests();
    }
  }, [isPlatformAdmin, fetchAdminRequests, fetchMatchingRequests]);

  // Real-time synchronization for Platform Admin operations
  const { status: realtimeStatus } = useRealtime({
    channel: 'admin:blood-requests',
    token: getAuthToken() || undefined,
    enabled: isPlatformAdmin && Boolean(getAuthToken()),
    onEvent: (evt) => {
      if (evt.eventType.startsWith('blood_request.')) {
        fetchAdminRequests();
        fetchMatchingRequests();
        const payload = evt.payload as any;
        const idForRef = payload?.requestId || evt.entityId || '';
        const ref = payload?.requestReference || (idForRef ? `#${idForRef.slice(0, 8)}` : '#REQUEST');
        const status = payload?.status || evt.eventType.replace('blood_request.', '').toUpperCase();
        setRealtimeAlert(`⚡ Real-time Alert: Request ${ref} — ${status}`);
        setTimeout(() => setRealtimeAlert(null), 7000);
      }
    },
    onReconnect: () => {
      fetchAdminRequests();
      fetchMatchingRequests();
    },
  });

  // Client-side filtering by search query & urgency
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (urgencyFilter !== 'ALL' && r.urgency !== urgencyFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesRef = r.requestReference.toLowerCase().includes(q) || r.id.toLowerCase().includes(q);
        const matchesPatient = r.patientName.toLowerCase().includes(q);
        const matchesHospital = r.admittedHospitalName.toLowerCase().includes(q);
        const matchesBank = (r.assignedBankName || '').toLowerCase().includes(q) || (r.hospitalCode || '').toLowerCase().includes(q);
        const matchesRequester = (r.requester?.name || '').toLowerCase().includes(q) || (r.requester?.phoneNumber || '').includes(q);
        if (!matchesRef && !matchesPatient && !matchesHospital && !matchesBank && !matchesRequester) {
          return false;
        }
      }
      return true;
    });
  }, [requests, urgencyFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Header & Status Indicator */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-slate-900">Platform Blood Request Operations</h2>
            {realtimeStatus === 'connected' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Real-time Feed
              </span>
            ) : realtimeStatus === 'reconnecting' ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                Reconnecting...
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                Stream Inactive
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Authoritative national monitoring of blood requests, designated Blood Bank queues, and cold-chain deliveries.
          </p>
        </div>

        <button
          onClick={() => {
            fetchAdminRequests();
            fetchMatchingRequests();
          }}
          disabled={loading}
          className="text-xs text-slate-700 hover:text-slate-900 font-bold flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors shadow-2xs self-start md:self-auto cursor-pointer"
        >
          <span className={loading || loadingMatching ? 'animate-spin' : ''}>↻</span> Refresh Stream
        </button>
      </div>

      {/* Platform Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-3">
        <button
          onClick={() => setActiveSection('requests')}
          className={`pb-3 px-3 text-xs font-bold transition-all cursor-pointer border-b-2 ${
            activeSection === 'requests'
              ? 'border-[#B91C32] text-[#B91C32]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          📋 National Blood Request Monitor ({requests.length})
        </button>
        <button
          onClick={() => {
            setActiveSection('matching');
            fetchMatchingRequests();
          }}
          className={`pb-3 px-3 text-xs font-bold transition-all cursor-pointer border-b-2 flex items-center gap-2 ${
            activeSection === 'matching'
              ? 'border-[#B91C32] text-[#B91C32]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>🤝 Donor Matching Operations</span>
          {pendingMatchingCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-100 text-purple-800 border border-purple-200 font-extrabold animate-pulse">
              {pendingMatchingCount} Action Required
            </span>
          )}
        </button>
      </div>

      {/* Real-time incoming flash alert */}
      {realtimeAlert && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-950 flex items-center justify-between shadow-xs animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="text-base">🔔</span>
            <span>{realtimeAlert}</span>
          </div>
          <button
            onClick={() => setRealtimeAlert(null)}
            className="text-emerald-700 hover:text-emerald-950 text-xs font-extrabold cursor-pointer px-2 py-0.5 rounded"
          >
            ✕
          </button>
        </div>
      )}

      {/* Section 1: National Blood Request Queue */}
      {activeSection === 'requests' && (
        <>
          {/* KPI Status Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div
          onClick={() => setStatusFilter('ALL')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer shadow-2xs ${
            statusFilter === 'ALL' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className={`text-[10px] font-bold uppercase tracking-wider ${statusFilter === 'ALL' ? 'text-slate-300' : 'text-slate-500'}`}>
            Total Requests
          </div>
          <div className={`text-xl font-black mt-1 ${statusFilter === 'ALL' ? 'text-white' : 'text-slate-900'}`}>
            {metrics.total}
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('SUBMITTED')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer shadow-2xs ${
            statusFilter === 'SUBMITTED' ? 'bg-amber-600 text-white border-amber-600' : 'bg-amber-50/40 border-amber-200 hover:border-amber-300'
          }`}
        >
          <div className={`text-[10px] font-bold uppercase tracking-wider ${statusFilter === 'SUBMITTED' ? 'text-amber-100' : 'text-amber-800'}`}>
            Awaiting Bank
          </div>
          <div className={`text-xl font-black mt-1 ${statusFilter === 'SUBMITTED' ? 'text-white' : 'text-amber-950'}`}>
            {metrics.submitted}
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('ACCEPTED')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer shadow-2xs ${
            statusFilter === 'ACCEPTED' ? 'bg-blue-600 text-white border-blue-600' : 'bg-blue-50/40 border-blue-200 hover:border-blue-300'
          }`}
        >
          <div className={`text-[10px] font-bold uppercase tracking-wider ${statusFilter === 'ACCEPTED' ? 'text-blue-100' : 'text-blue-800'}`}>
            Bank Accepted
          </div>
          <div className={`text-xl font-black mt-1 ${statusFilter === 'ACCEPTED' ? 'text-white' : 'text-blue-950'}`}>
            {metrics.accepted}
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('STOCK_RESERVED')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer shadow-2xs ${
            statusFilter === 'STOCK_RESERVED' ? 'bg-purple-600 text-white border-purple-600' : 'bg-purple-50/40 border-purple-200 hover:border-purple-300'
          }`}
        >
          <div className={`text-[10px] font-bold uppercase tracking-wider ${statusFilter === 'STOCK_RESERVED' ? 'text-purple-100' : 'text-purple-800'}`}>
            Stock Reserved
          </div>
          <div className={`text-xl font-black mt-1 ${statusFilter === 'STOCK_RESERVED' ? 'text-white' : 'text-purple-950'}`}>
            {metrics.reserved}
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('DISPATCHED')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer shadow-2xs ${
            statusFilter === 'DISPATCHED' ? 'bg-teal-600 text-white border-teal-600' : 'bg-teal-50/40 border-teal-200 hover:border-teal-300'
          }`}
        >
          <div className={`text-[10px] font-bold uppercase tracking-wider ${statusFilter === 'DISPATCHED' ? 'text-teal-100' : 'text-teal-800'}`}>
            In Transit
          </div>
          <div className={`text-xl font-black mt-1 ${statusFilter === 'DISPATCHED' ? 'text-white' : 'text-teal-950'}`}>
            {metrics.dispatched}
          </div>
        </div>

        <div
          onClick={() => setStatusFilter('FULFILLED')}
          className={`p-3.5 rounded-xl border transition-all cursor-pointer shadow-2xs ${
            statusFilter === 'FULFILLED' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-emerald-50/40 border-emerald-200 hover:border-emerald-300'
          }`}
        >
          <div className={`text-[10px] font-bold uppercase tracking-wider ${statusFilter === 'FULFILLED' ? 'text-emerald-100' : 'text-emerald-800'}`}>
            Fulfilled
          </div>
          <div className={`text-xl font-black mt-1 ${statusFilter === 'FULFILLED' ? 'text-white' : 'text-emerald-950'}`}>
            {metrics.fulfilled}
          </div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="flex-1 relative">
            <span className="absolute left-3.5 top-2.5 text-slate-400 text-sm">🔍</span>
            <input
              type="text"
              placeholder="Search by Patient, Ref #, Hospital, Blood Bank, or Requester Phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#C51F3A]"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={urgencyFilter}
              onChange={(e) => setUrgencyFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#C51F3A]"
            >
              <option value="ALL">All Urgency</option>
              <option value="CRITICAL">Critical</option>
              <option value="URGENT">Urgent</option>
              <option value="ROUTINE">Routine</option>
            </select>

            <select
              value={bloodGroupFilter}
              onChange={(e) => setBloodGroupFilter(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#C51F3A]"
            >
              <option value="ALL">All Groups</option>
              <option value="A_POS">A+</option>
              <option value="A_NEG">A-</option>
              <option value="B_POS">B+</option>
              <option value="B_NEG">B-</option>
              <option value="AB_POS">AB+</option>
              <option value="AB_NEG">AB-</option>
              <option value="O_POS">O+</option>
              <option value="O_NEG">O-</option>
            </select>
          </div>
        </div>
      </div>

      {/* Requests Table / List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              National Requests Operations Queue ({filteredRequests.length})
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Live ledger of all patient and facility blood requests across Maharashtra
            </p>
          </div>
        </div>

        {loading ? (
          <div className="p-16 text-center text-xs text-slate-500 space-y-3">
            <div className="w-8 h-8 border-3 border-slate-300 border-t-[#C51F3A] rounded-full animate-spin mx-auto" />
            <p>Syncing platform request records...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-xs text-rose-700 space-y-2">
            <p className="font-bold">⚠️ {error}</p>
            <button
              onClick={fetchAdminRequests}
              className="text-xs font-bold text-rose-800 underline cursor-pointer"
            >
              Try again
            </button>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-16 text-center text-xs text-slate-400 space-y-2">
            <span className="text-3xl">📭</span>
            <p className="font-bold text-slate-600">No matching requests found</p>
            <p className="text-slate-400">Try adjusting your filters or search terms.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3 px-4">Request / Patient</th>
                  <th className="py-3 px-3">Blood / Units</th>
                  <th className="py-3 px-3">Urgency</th>
                  <th className="py-3 px-4">Admitted Hospital</th>
                  <th className="py-3 px-4">Designated Blood Bank</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Created</th>
                  <th className="py-3 px-4 text-right">Operations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRequests.map((req) => {
                  const isCritical = req.urgency === 'CRITICAL';
                  const isUrgent = req.urgency === 'URGENT';

                  return (
                    <tr key={req.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-[#C51F3A] text-xs">
                          {req.requestReference}
                        </div>
                        <div className="font-bold text-slate-900 mt-0.5">
                          {req.patientName}
                        </div>
                        {req.requester && (
                          <div className="text-[10px] text-slate-500">
                            By: {req.requester.name || 'User'} ({req.requester.phoneNumber || 'No phone'})
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-black bg-rose-50 text-rose-800 border border-rose-200">
                          {req.bloodGroup.replace('_POS', '+').replace('_NEG', '-')}
                        </span>
                        <div className="text-[11px] font-bold text-slate-700 mt-1">
                          {req.unitsRequested} {req.unitsRequested === 1 ? 'unit' : 'units'}
                        </div>
                        {req.allocatedUnitsCount !== undefined && req.allocatedUnitsCount > 0 && (
                          <div className="text-[10px] font-bold text-indigo-700 mt-0.5">
                            Allocated: {req.allocatedUnitsCount}/{req.unitsRequested}
                          </div>
                        )}
                        {req.shortfallCount !== undefined && req.shortfallCount > 0 && req.allocatedUnitsCount !== undefined && req.allocatedUnitsCount > 0 && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            Shortfall: {req.shortfallCount}
                          </span>
                        )}
                        <div className="text-[10px] text-slate-400">{req.component}</div>
                      </td>

                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${
                            isCritical
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : isUrgent
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {isCritical && <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping" />}
                          {req.urgency}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 flex items-center gap-1">
                          <span>{req.admittedHospitalName}</span>
                          {req.isHospitalVerified && (
                            <span className="text-emerald-600 text-[11px]" title="Canonical Registered Facility">
                              ✓
                            </span>
                          )}
                        </div>
                        {req.receivingFacilityId && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            Facility ID: {req.receivingFacilityId.slice(0, 8)}...
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800">
                          {req.assignedBankName || req.hospitalCode || 'District Queue'}
                        </div>
                        <span
                          className={`inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                            req.routingType === 'DIRECT_PARTICIPATING'
                              ? 'bg-blue-50 text-blue-800 border border-blue-200'
                              : req.routingType === 'EXTERNAL_DIRECTORY'
                              ? 'bg-purple-50 text-purple-800 border border-purple-200'
                              : 'bg-amber-50 text-amber-800 border border-amber-200'
                          }`}
                        >
                          {req.routingType.replace('_', ' ')}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            req.fulfillmentStatus === 'FULFILLED'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : req.fulfillmentStatus === 'DISPATCHED'
                              ? 'bg-teal-100 text-teal-800 border border-teal-300'
                              : req.fulfillmentStatus === 'STOCK_RESERVED'
                              ? 'bg-purple-100 text-purple-800 border border-purple-300'
                              : req.fulfillmentStatus === 'ACCEPTED'
                              ? 'bg-blue-100 text-blue-800 border border-blue-300'
                              : req.fulfillmentStatus === 'REJECTED'
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}
                        >
                          {req.fulfillmentStatus.replace('_', ' ')}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-[11px] text-slate-500">
                        {new Date(req.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedRequest(req)}
                          className="px-3 py-1.5 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-100 text-xs font-bold text-slate-800 transition-colors cursor-pointer shadow-2xs"
                        >
                          Inspect Detail →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}

      {/* Section 2: Phase 3 Admin Donor Matching Operations */}
      {activeSection === 'matching' && (
        <div className="space-y-6">
          {/* Header Bar */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span>🤝</span>
                <span>System Admin Donor Matching Queue</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Authorized Platform Administration console to execute deterministic donor matching and release candidates to requesting Blood Banks.
              </p>
            </div>
            <button
              onClick={fetchMatchingRequests}
              disabled={loadingMatching}
              className="text-xs text-slate-700 hover:text-slate-900 font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <span className={loadingMatching ? 'animate-spin' : ''}>↻</span> Refresh Queue
            </button>
          </div>

          {loadingMatching ? (
            <div className="p-12 text-center text-xs text-slate-400 animate-pulse bg-white rounded-2xl border border-slate-200">
              Loading matching queue...
            </div>
          ) : matchingRequests.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-xs text-slate-500 space-y-2">
              <span className="text-3xl block">✓</span>
              <div className="font-bold text-slate-800">No Pending Matching Requests</div>
              <p className="text-slate-400 max-w-md mx-auto">
                Blood banks submit shortfall requests here when clinical inventory cannot cover full patient requirements.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3.5">
              {matchingRequests.map((mr) => {
                const isPending = mr.status === 'REQUESTED';
                const isSearchRunning = mr.status === 'SEARCH_RUNNING';
                const isFound = mr.status === 'CANDIDATES_FOUND';
                const isReleased = mr.status === 'RELEASED';

                return (
                  <div
                    key={mr.matchingRequestId || mr.requestId}
                    className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition-all shadow-xs space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono font-bold text-xs text-slate-900">
                            {mr.requestReference}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            {mr.bloodGroup?.replace('_POS', '+')?.replace('_NEG', '-')}
                          </span>
                          <span className="text-xs font-bold text-slate-700">{mr.component}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              mr.urgency === 'CRITICAL'
                                ? 'bg-red-100 text-red-800'
                                : mr.urgency === 'URGENT'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {mr.urgency}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Admitted at: <strong>{mr.hospitalName}</strong> • Patient: <strong>{mr.patientName || 'Emergency Patient'}</strong>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                            isReleased
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : isPending
                              ? 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                              : isSearchRunning
                              ? 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                              : 'bg-purple-100 text-purple-800 border border-purple-300'
                          }`}
                        >
                          {isReleased && `✓ Candidates Released (${mr.releasedCount || 0})`}
                          {isPending && '⚡ Action Required: Pending Search'}
                          {isSearchRunning && '🔍 Search In Progress'}
                          {isFound && `✓ ${mr.candidatesCount || 0} Candidates Found (Review Ready)`}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Requesting Blood Bank</span>
                        <span className="font-bold text-slate-900">{mr.requestingOrgName}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Shortfall to Match</span>
                        <span className="font-bold text-purple-900">
                          {mr.requestedShortfall} Unit(s) of {mr.unitsRequested}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Search Scope</span>
                        <span className="font-bold text-slate-700">
                          {mr.searchScope === 'EXACT_CENTRE'
                            ? 'Preferred Centre / Radius'
                            : mr.searchScope === 'DISTRICT_EXPANDED'
                            ? 'Same District'
                            : 'Out of District'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Requested Timestamp</span>
                        <span className="text-slate-600">
                          {mr.requestedAt ? new Date(mr.requestedAt).toLocaleString() : 'Recent'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <span className="text-[11px] text-slate-400">
                        {isReleased
                          ? `Released by Admin (${mr.releasedById || 'Admin'}) at ${mr.releasedAt ? new Date(mr.releasedAt).toLocaleTimeString() : ''}`
                          : 'Deterministic Algorithm: Hard Eligibility Gate → Registered Area → GPS Proximity → Regular Donor Priority'}
                      </span>

                      <button
                        onClick={() => handleOpenMatchingModal(mr)}
                        className="px-4 py-2 rounded-xl bg-[#B91C32] hover:bg-[#9B1527] text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                      >
                        <span>🔍</span>
                        <span>{isReleased ? 'Review / Re-release Candidates' : 'Run Matching & Release Candidates'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* DETAIL INSPECTION MODAL */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-7 space-y-6 shadow-2xl border border-slate-200 animate-scale-up my-8">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Platform Operations Audit
                </div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2 mt-0.5">
                  <span>Request {selectedRequest.requestReference}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    {selectedRequest.fulfillmentStatus}
                  </span>
                </h3>
              </div>
              <button
                onClick={() => setSelectedRequest(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Request Summary Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Patient</span>
                <span className="font-bold text-slate-900">{selectedRequest.patientName}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Blood Group</span>
                <span className="font-bold text-rose-700">
                  {selectedRequest.bloodGroup.replace('_POS', '+').replace('_NEG', '-')} ({selectedRequest.unitsRequested} units)
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Component</span>
                <span className="font-bold text-slate-800">{selectedRequest.component}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Admitted Hospital</span>
                <span className="font-bold text-slate-900">{selectedRequest.admittedHospitalName}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Designated Blood Bank</span>
                <span className="font-bold text-slate-900">
                  {selectedRequest.assignedBankName || selectedRequest.hospitalCode || 'District Queue'}
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Routing Classification</span>
                <span className="font-bold text-blue-700">{selectedRequest.routingType}</span>
              </div>
            </div>

            {/* Inventory Allocation & Shortfall Status */}
            <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-200 text-xs space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="font-bold text-indigo-950 uppercase tracking-wider text-[11px]">
                  Clinical Inventory Allocation Status
                </span>
                <span className="font-bold text-indigo-900 text-xs">
                  Requested: {selectedRequest.unitsRequested} | Allocated: {selectedRequest.allocatedUnitsCount || 0} | Shortfall: {selectedRequest.shortfallCount || 0}
                </span>
              </div>

              {(selectedRequest.isPartialAllocation || ((selectedRequest.shortfallCount ?? 0) > 0 && (selectedRequest.allocatedUnitsCount ?? 0) > 0)) && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <span>⚠️</span>
                    <span>Partial Inventory Allocation: Shortfall of {selectedRequest.shortfallCount} Unit(s)</span>
                  </div>
                  <p className="text-[11px] text-amber-800">
                    {selectedRequest.allocatedUnitsCount} of {selectedRequest.unitsRequested} requested units were allocated from blood bank active inventory. Request remains open in the national coordination queue. Donor matching workflow will be introduced in Phase 3.
                  </p>
                </div>
              )}

              {selectedRequest.reservedUnitDetails && selectedRequest.reservedUnitDetails.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold text-slate-500 uppercase">Allocated Inventory Units</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {selectedRequest.reservedUnitDetails.map((u) => (
                      <div key={u.id} className="p-2.5 bg-white rounded-lg border border-indigo-100 font-mono text-xs flex justify-between items-center">
                        <div>
                          <div className="font-bold text-indigo-950">{u.componentCode}</div>
                          <div className="text-[10px] text-slate-500 font-sans">{u.componentType || selectedRequest.component} • {u.volumeMl || '350'} ml</div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 font-sans">
                          {u.status || 'RESERVED'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Cold-Chain Transport Details (if dispatched) */}
            {selectedRequest.transportDetails && (
              <div className="p-4 rounded-2xl bg-teal-50/60 border border-teal-200 space-y-2 text-xs">
                <div className="font-bold text-teal-900 text-xs flex items-center gap-1.5">
                  <span>🚚 Cold-Chain Logistics Telemetry</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-700">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Courier:</span>
                    <span className="font-bold">{selectedRequest.transportDetails.courierName || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Vehicle:</span>
                    <span className="font-bold">{selectedRequest.transportDetails.vehicleNumber || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Driver Phone:</span>
                    <span className="font-bold">{selectedRequest.transportDetails.driverPhone || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Cold Box Temp:</span>
                    <span className="font-bold">{selectedRequest.transportDetails.coldBoxTempCelsius ?? 'N/A'} °C</span>
                  </div>
                </div>
              </div>
            )}

            {/* Activity History & Audit Trail */}
            <div className="space-y-2">
              <div className="text-xs font-black uppercase tracking-wider text-slate-900">
                Audit Trail &amp; Activity History ({selectedRequest.activityHistory.length})
              </div>
              {selectedRequest.activityHistory.length === 0 ? (
                <div className="p-4 rounded-xl border border-slate-200 text-center text-xs text-slate-400">
                  No explicit audit actions logged for this request.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {selectedRequest.activityHistory.map((act) => (
                    <div key={act.id} className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 text-xs flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-900">{act.action}</div>
                        <div className="text-[10px] text-slate-500">
                          Actor ID: <code className="font-mono">{act.userId?.slice(0, 8) || 'System'}</code>
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(act.timestamp).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Informational Footer */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
              <span>
                🔒 <strong>System Admin Guard:</strong> Monitoring view only. Clinical inventory reservations and dispatches are strictly authorized by accredited Blood Bank personnel.
              </span>
              <button
                onClick={() => setSelectedRequest(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 3: ADMIN CANDIDATE REVIEW & RELEASE MODAL */}
      {selectedMatchingRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-7 space-y-5 shadow-2xl border border-slate-200 my-8 max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-wider text-purple-700">
                  System Admin Donor Matching Engine (Phase 3)
                </div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2 mt-0.5">
                  <span>Candidate Review — Request {selectedMatchingRequest.requestReference}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                    Shortfall: {selectedMatchingRequest.requestedShortfall} Unit(s)
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Deterministic Ranking: Hard Eligibility Gate → Registered Area → Location Proximity → Regular Donor Priority
                </p>
              </div>
              <button
                onClick={() => setSelectedMatchingRequest(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {releaseSuccessAlert && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-950 flex items-center justify-between">
                <span>{releaseSuccessAlert}</span>
                <button
                  onClick={() => setReleaseSuccessAlert(null)}
                  className="text-emerald-700 font-bold px-2 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Scope Selection & Search Execution Bar */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px] block">
                    Geographic Matching Scope
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Only System Admin can expand search scope. Expansion beyond preferred centre requires reason justification.
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={scopeInput}
                    onChange={(e: any) => setScopeInput(e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#C51F3A]"
                  >
                    <option value="EXACT_CENTRE">Exact Preferred Centre</option>
                    <option value="DISTRICT_EXPANDED">Same District Radius</option>
                    <option value="OUT_OF_DISTRICT">Out of District (All)</option>
                  </select>

                  <button
                    onClick={handleRunSearch}
                    disabled={searchingCandidates}
                    className="px-3.5 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <span className={searchingCandidates ? 'animate-spin' : ''}>🔍</span>
                    <span>{searchingCandidates ? 'Running Search...' : 'Run Matching Algorithm'}</span>
                  </button>
                </div>
              </div>

              {scopeInput !== 'EXACT_CENTRE' && (
                <div className="pt-2 border-t border-slate-200 space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 block">
                    Expansion Justification (Required for Audit Trail):
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Blood bank inventory depleted; expanding to district/out-of-district voluntary donors..."
                    value={expansionReasonInput}
                    onChange={(e) => setExpansionReasonInput(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#C51F3A]"
                  />
                </div>
              )}
            </div>

            {/* Candidate List / Table */}
            <div className="flex-1 overflow-y-auto space-y-3 min-h-[220px]">
              {searchingCandidates ? (
                <div className="p-12 text-center text-xs text-slate-400 animate-pulse bg-slate-50 rounded-2xl border border-slate-200">
                  Executing deterministic ranking algorithm across active donor pool...
                </div>
              ) : !matchingSearchResults || matchingSearchResults.candidates?.length === 0 ? (
                <div className="p-10 text-center bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-500 space-y-1.5">
                  <span className="text-2xl block">🔍</span>
                  <div className="font-bold text-slate-800">No Eligible Donors Found in Current Scope</div>
                  <p className="text-slate-400 max-w-sm mx-auto">
                    Try selecting <strong>Same District Radius</strong> or <strong>Out of District</strong> above with an expansion reason.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {matchingSearchResults.requestSummary?.compatibilityReason && (
                    <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-xl text-[11px] text-purple-900 font-semibold flex items-center gap-1.5">
                      <span>🧬</span>
                      <span><strong>Transfusion Safety Protocol:</strong> {matchingSearchResults.requestSummary.compatibilityReason}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-200">
                    <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                      Ranked Candidates ({matchingSearchResults.candidates.length})
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        const shortfall = selectedMatchingRequest.requestedShortfall || 1;
                        const topIds = matchingSearchResults.candidates.slice(0, shortfall).map((c: any) => c.donorId);
                        setSelectedCandidateIds(new Set(topIds));
                      }}
                      className="text-[11px] font-bold text-purple-700 hover:underline cursor-pointer"
                    >
                      Select Top {selectedMatchingRequest.requestedShortfall} (Shortfall Target)
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[38vh] overflow-y-auto pr-1">
                    {matchingSearchResults.candidates.map((c: any) => {
                      const isSelected = selectedCandidateIds.has(c.donorId);
                      return (
                        <div
                          key={c.donorId}
                          onClick={() => {
                            const next = new Set(selectedCandidateIds);
                            if (next.has(c.donorId)) next.delete(c.donorId);
                            else next.add(c.donorId);
                            setSelectedCandidateIds(next);
                          }}
                          className={`p-3.5 rounded-xl border transition-all text-xs cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'border-purple-600 bg-purple-50/50 ring-1 ring-purple-500 shadow-xs'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}} // Handled by container
                              className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500"
                            />

                            <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold text-[11px] flex items-center justify-center">
                              #{c.selectionRank}
                            </span>

                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900">{c.displayName}</span>
                                <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                  {c.bloodGroup?.replace('_POS', '+')?.replace('_NEG', '-')}
                                </span>
                                {c.isExactBloodGroupMatch ? (
                                  <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.2 rounded">
                                    Exact Match
                                  </span>
                                ) : (
                                  <span className="text-[9px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.2 rounded" title={c.matchReason}>
                                    Compatible Donor
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 mt-0.5">
                                {c.locality || `District ${c.districtCode}`}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 text-[10px]">
                            {/* Proximity Tier */}
                            <span
                              className={`px-2 py-0.5 rounded font-semibold ${
                                c.proximityTier === 'FRESH_GPS'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : c.proximityTier === 'STALE_GPS'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {c.proximityTier === 'FRESH_GPS' && '🟢 Fresh GPS'}
                              {c.proximityTier === 'STALE_GPS' && '🟡 Stale Location'}
                              {c.proximityTier === 'REGISTERED_AREA' && '📍 Registered Area'}
                              {c.proximityTier === 'UNKNOWN' && 'Area Unknown'}
                              {c.distanceKm !== null ? ` (Straight-line: ~${c.distanceKm} km)` : ''}
                            </span>

                            {/* Road directions on-demand */}
                            {roadDirections[c.donorId] ? (
                              roadDirections[c.donorId].loading ? (
                                <span className="text-[10px] text-slate-400 animate-pulse">Calculating road route...</span>
                              ) : roadDirections[c.donorId].error ? (
                                <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200" title={roadDirections[c.donorId].error}>
                                  ⚠️ Road route unavailable
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 flex items-center gap-1">
                                  <span>🚗</span> ~${roadDirections[c.donorId].distanceKm} km · ~${roadDirections[c.donorId].durationMinutes}m drive
                                </span>
                              )
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  fetchCandidateRoadDirections(c.donorId);
                                }}
                                className="text-[10px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-0.5 rounded transition-colors cursor-pointer"
                              >
                                Road Route &amp; ETA
                              </button>
                            )}

                            {/* Match Level */}
                            <span
                              className={`px-2 py-0.5 rounded font-bold ${
                                c.matchLevel === 'LEVEL_1_CENTRE'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : c.matchLevel === 'LEVEL_2_DISTRICT'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}
                            >
                              {c.matchLevel === 'LEVEL_1_CENTRE'
                                ? '★ Preferred'
                                : c.matchLevel === 'LEVEL_2_DISTRICT'
                                ? 'Same District'
                                : 'Expanded'}
                            </span>

                            {/* Regular Donor */}
                            {c.isRegularDonor && (
                              <span className="px-2 py-0.5 rounded font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                ★ Regular ({c.completedDonationsCount})
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Action Footer */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-200">
              <div className="text-xs text-slate-600">
                Selected: <strong className="text-purple-900">{selectedCandidateIds.size}</strong> candidate(s) for release
                (Target Shortfall: <strong>{selectedMatchingRequest.requestedShortfall} units</strong>)
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedMatchingRequest(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Close
                </button>

                <button
                  type="button"
                  onClick={handleReleaseCandidates}
                  disabled={releasingCandidates || selectedCandidateIds.size === 0}
                  className="px-5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span>✓</span>
                  <span>{releasingCandidates ? 'Releasing...' : `Release ${selectedCandidateIds.size} Candidates to Blood Bank`}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

