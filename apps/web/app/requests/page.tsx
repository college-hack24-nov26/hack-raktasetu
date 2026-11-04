'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CardSkeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useRealtime } from '../hooks/useRealtime';
import { authFetch, safeJsonParse } from '../config/api';

interface BloodCentre {
  hospitalCode: string;
  hospitalName: string;
  address?: string | null;
  mobileNo?: string | null;
  districtCode?: number | null;
}

interface BloodRequestItem {
  id: string;
  requestReference?: string;
  patientName?: string | null;
  bloodGroup: string;
  component: string;
  unitsRequested: number;
  allocatedUnitsCount?: number;
  shortfallCount?: number;
  isPartialAllocation?: boolean;
  requiredBy?: string | null;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED' | 'EXPIRED';
  closureOutcome?: string | null;
  closureFeedback?: string | null;
  reportedDonationStatus?: string | null;
  message?: string | null;
  hospitalCode?: string | null;
  bloodCentre?: BloodCentre | null;
  closedAt?: string | null;
  createdAt: string;
  admittedHospitalName?: string | null;
  receivingFacilityId?: string | null;
  isHospitalVerified?: boolean;
  urgency?: 'NORMAL' | 'URGENT' | 'CRITICAL';
  fulfillmentStatus?: string;
  patientAcknowledgedAt?: string | null;
  hospitalIssueOrders?: any[];
}

const CLOSURE_OUTCOMES = [
  {
    value: 'DONATION_COMPLETED',
    label: 'Donation completed at blood centre',
    description: 'Blood units secured and donation completed through accredited blood centre.',
  },
  {
    value: 'ARRANGED_ELSEWHERE',
    label: 'Blood arranged through alternative source',
    description: 'Requirement fulfilled through another facility, donor, or hospital inventory.',
  },
  {
    value: 'NO_LONGER_NEEDED',
    label: 'Requirement is no longer needed',
    description: 'Patient stabilized or clinical requirement cancelled by medical team.',
  },
  {
    value: 'OTHER',
    label: 'Other reason',
    description: 'Closure due to other circumstances.',
  },
];

function RequestsContent() {
  const searchParams = useSearchParams();
  const queryId = searchParams.get('id');
  const isCreated = searchParams.get('created') === 'true';

  const [requests, setRequests] = useState<BloodRequestItem[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // Closure modal state
  const [closingRequestId, setClosingRequestId] = useState<string | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<string>('DONATION_COMPLETED');
  const [closureFeedback, setClosureFeedback] = useState<string>('');
  const [submittingClosure, setSubmittingClosure] = useState(false);

  // Patient delivery acknowledgement modal state
  const [ackModalRequestId, setAckModalRequestId] = useState<string | null>(null);
  const [ackNotes, setAckNotes] = useState('');
  const [submittingAck, setSubmittingAck] = useState(false);

  // Read current user
  useEffect(() => {
    try {
      const userStr = localStorage.getItem('raktasetu_user');
      if (userStr) {
        setCurrentUser(JSON.parse(userStr));
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);

    const token = typeof window !== 'undefined' ? localStorage.getItem('raktasetu_token') : null;
    if (!token) {
      setIsAuthenticated(false);
      setLoading(false);
      return;
    }

    setIsAuthenticated(true);

    const tryFetch = async (isRetry = false) => {
      try {
        const res = await authFetch('/api/v1/blood-requests');
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error?.message || 'Failed to load your blood requests');
        }

        const fetchedRequests: BloodRequestItem[] = data.data || [];
        setRequests(fetchedRequests);
      } catch (err: any) {
        if (!isRetry && (err.message.includes('database') || err.message.includes("Can't reach"))) {
          await new Promise((r) => setTimeout(r, 1500));
          return tryFetch(true);
        }
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    await tryFetch(false);
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Real-time synchronization
  const token = (typeof window !== 'undefined' ? localStorage.getItem('raktasetu_token') : null) || undefined;
  useRealtime({
    token,
    enabled: !!currentUser?.id,
    onEvent: (evt) => {
      if (
        evt.eventType === 'blood_request.status_changed' ||
        evt.eventType === 'blood_request.allocated' ||
        evt.eventType === 'hospital_issue.dispatched' ||
        evt.eventType === 'hospital_issue.received'
      ) {
        fetchRequests();
      }
    },
  });

  // Modal body scroll-locking and Escape key
  useEffect(() => {
    if (!closingRequestId && !ackModalRequestId) return;

    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setClosingRequestId(null);
        setAckModalRequestId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = origOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closingRequestId, ackModalRequestId]);

  const handleConfirmPatientAcknowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ackModalRequestId) return;
    setSubmittingAck(true);
    try {
      const res = await authFetch(`/api/v1/blood-requests/${ackModalRequestId}/patient-acknowledge`, {
        method: 'POST',
        body: JSON.stringify({ notes: ackNotes.trim() || undefined }),
      });
      const data = await safeJsonParse(res);
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || `Failed to acknowledge blood receipt (HTTP ${res.status}).`);
      }

      setAckModalRequestId(null);
      setAckNotes('');
      await fetchRequests();
    } catch (err: any) {
      alert(`Error confirming receipt: ${err.message}`);
    } finally {
      setSubmittingAck(false);
    }
  };

  const handleConfirmClosure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingRequestId) return;

    if (selectedOutcome === 'OTHER' && closureFeedback.trim().length < 5) {
      alert('Please provide an explanatory note for selecting "Other reason" (minimum 5 characters).');
      return;
    }

    setSubmittingClosure(true);
    try {
      const res = await authFetch(`/api/v1/blood-requests/${closingRequestId}/close`, {
        method: 'POST',
        body: JSON.stringify({
          outcome: selectedOutcome,
          feedback: closureFeedback.trim() || undefined,
        }),
      });

      const data = await safeJsonParse(res);
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || `Failed to close request (HTTP ${res.status}).`);
      }

      setClosingRequestId(null);
      setClosureFeedback('');
      await fetchRequests();
    } catch (err: any) {
      alert(`Error closing request: ${err.message}`);
    } finally {
      setSubmittingClosure(false);
    }
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'Not specified';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const activeClosingRequest = requests.find((r) => r.id === closingRequestId);

  if (isAuthenticated === false) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <EmptyState
          title="Sign in to View Requests"
          description="Please sign in with your mobile number to view and track your submitted blood requests."
          actionText="Sign In with Mobile"
          actionHref="/login"
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <span>Patient Blood Requests</span>
            <span className="text-xs bg-red-100 text-[#B91C32] px-2.5 py-0.5 rounded-full font-bold">
              {requests.length} Total
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Track real-time inventory allocation, cold-chain transport, and fulfilment by your designated Blood Bank.
          </p>
        </div>

        <Link
          href="/requests/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] text-white text-xs font-bold transition-all shadow-xs shrink-0"
        >
          <span>+</span>
          <span>Submit New Request</span>
        </Link>
      </div>

      {isCreated && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
              ✓
            </span>
            <span>
              <strong>Blood Request Created!</strong> Your request has been securely routed to the designated Blood Centre. Live tracking updates will appear below.
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-900 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => fetchRequests()}
            className="text-xs font-bold text-red-700 underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Requests List */}
      {loading ? (
        <div className="space-y-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : requests.length === 0 ? (
        <EmptyState
          title="No Blood Requests Found"
          description="You haven't submitted any blood requests yet. If you or a loved one needs blood, create an emergency request now."
          actionText="Submit Blood Request"
          actionHref="/requests/new"
        />
      ) : (
        <div className="space-y-6">
          {requests.map((req) => {
            const isOpen = req.status === 'OPEN';
            const currentStage = req.fulfillmentStatus || req.closureOutcome || req.status;
            const isRejected = currentStage === 'REJECTED';
            const isCancelled = currentStage === 'CANCELLED';

            // Fulfillment stage stepper indexing
            const getStageIndex = () => {
              if (isRejected || isCancelled) return -1;
              if (currentStage === 'FULFILLED' || currentStage === 'CLOSED' || currentStage === 'RECEIVED_BY_HOSPITAL') return 4;
              if (currentStage === 'DISPATCHED' || currentStage === 'PARTIALLY_RECEIVED') return 3;
              if (currentStage === 'PREPARING' || currentStage === 'AUTHORISED_FOR_ISSUE') return 2;
              if (currentStage === 'STOCK_RESERVED' || currentStage === 'PARTIALLY_ALLOCATED' || currentStage === 'PARTIALLY_FULFILLED') return 1;
              return 0; // SUBMITTED / OPEN
            };
            const currentStageIndex = getStageIndex();

            const canPatientAcknowledge =
              isOpen &&
              !req.patientAcknowledgedAt &&
              ['DISPATCHED', 'RECEIVED_BY_HOSPITAL', 'PARTIALLY_RECEIVED', 'STOCK_RESERVED', 'PARTIALLY_ALLOCATED', 'PARTIALLY_FULFILLED'].includes(currentStage);

            const linkedOrder = req.hospitalIssueOrders && req.hospitalIssueOrders.length > 0 ? req.hospitalIssueOrders[0] : null;

            return (
              <div
                key={req.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 transition-all hover:border-slate-300"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="font-mono text-xs font-bold text-slate-500">
                        {req.requestReference || `#${req.id.slice(0, 8)}`}
                      </span>
                      <StatusBadge status={currentStage} />
                      {req.urgency && req.urgency !== 'NORMAL' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-300">
                          ⚡ {req.urgency}
                        </span>
                      )}
                      <span className="text-xs text-slate-400">
                        • Submitted {formatDate(req.createdAt)}
                      </span>
                    </div>

                    <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                      <span className="text-[#B91C32]">{req.bloodGroup}</span>
                      <span>•</span>
                      <span>{req.component}</span>
                      <span>•</span>
                      <span className="text-slate-700">{req.unitsRequested} {req.unitsRequested === 1 ? 'Unit' : 'Units'}</span>
                    </h2>

                    {/* Hospital & Centre Attribution */}
                    <div className="mt-2 text-xs text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {req.admittedHospitalName && (
                        <span>
                          <strong>Admitted Hospital:</strong> {req.admittedHospitalName}
                        </span>
                      )}
                      {req.bloodCentre ? (
                        <span>
                          <strong>Designated Blood Centre:</strong> {req.bloodCentre.hospitalName}
                          {req.bloodCentre.mobileNo && ` • Tel: ${req.bloodCentre.mobileNo}`}
                        </span>
                      ) : (
                        <span className="text-slate-500 italic">Coordinated Blood Centre</span>
                      )}
                    </div>

                    {req.patientName && (
                      <p className="text-xs text-slate-700 mt-1">
                        <strong>Patient:</strong> {req.patientName}
                      </p>
                    )}

                    {req.closureOutcome && !isRejected && (
                      <p className="text-xs text-slate-600 mt-1">
                        <strong>Closure Outcome:</strong>{' '}
                        <span className="font-semibold text-slate-800">
                          {CLOSURE_OUTCOMES.find((o) => o.value === req.closureOutcome)?.label || req.closureOutcome}
                        </span>
                        {req.closureFeedback && <span className="italic text-slate-500"> — "{req.closureFeedback}"</span>}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {canPatientAcknowledge && (
                      <button
                        onClick={() => {
                          setAckModalRequestId(req.id);
                          setAckNotes('');
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
                      >
                        <span>✓</span>
                        <span>Confirm Blood Received</span>
                      </button>
                    )}

                    {isOpen && (
                      <button
                        onClick={() => {
                          setClosingRequestId(req.id);
                          setSelectedOutcome('DONATION_COMPLETED');
                          setClosureFeedback('');
                        }}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Close / Cancel Request
                      </button>
                    )}
                  </div>
                </div>

                {/* 5-STAGE FULFILLMENT STEPPER */}
                {!isRejected && !isCancelled && (
                  <div className="my-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 mb-2">
                      <span>Fulfilment Progress</span>
                      <span className="text-slate-400">Designated Blood Bank Coordination</span>
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {[
                        { label: '1. Received', desc: 'Request received by Blood Bank' },
                        {
                          label: '2. Allocated',
                          desc:
                            req.allocatedUnitsCount && req.allocatedUnitsCount > 0
                              ? `${req.allocatedUnitsCount} of ${req.unitsRequested} units allocated`
                              : 'Stock review in progress',
                        },
                        {
                          label: '3. Preparing',
                          desc:
                            currentStage === 'PREPARING'
                              ? 'Component collected; laboratory testing pending'
                              : 'Preparing dispatch',
                        },
                        { label: '4. Dispatched', desc: 'Dispatched to hospital' },
                        { label: '5. Confirmed', desc: 'Receipt confirmed' },
                      ].map((step, idx) => {
                        const isCompleted = currentStageIndex >= idx;
                        const isCurrent = currentStageIndex === idx;
                        return (
                          <div key={step.label} className="text-center">
                            <div
                              className={`h-2 rounded-full mb-1.5 transition-all ${
                                isCompleted
                                  ? 'bg-emerald-600'
                                  : isCurrent
                                  ? 'bg-[#B91C32] animate-pulse'
                                  : 'bg-slate-200'
                              }`}
                            />
                            <span
                              className={`block text-[11px] font-bold ${
                                isCompleted
                                  ? 'text-emerald-900'
                                  : isCurrent
                                  ? 'text-[#B91C32]'
                                  : 'text-slate-400'
                              }`}
                            >
                              {step.label}
                            </span>
                            <span className="text-[10px] text-slate-400 hidden sm:block">
                              {step.desc}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* INVENTORY ALLOCATION PROGRESS & SHORTFALL BANNER */}
                {req.allocatedUnitsCount !== undefined && req.allocatedUnitsCount > 0 && (
                  <div className="my-3 p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 text-xs text-indigo-950 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-1 font-bold">
                      <span className="flex items-center gap-1.5">
                        <span>📦</span>
                        <span>Inventory Allocation: {req.allocatedUnitsCount} of {req.unitsRequested} unit(s) secured</span>
                      </span>
                      {req.shortfallCount !== undefined && req.shortfallCount > 0 ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300">
                          Remaining Shortfall: {req.shortfallCount} unit(s)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          Full Quantity Allocated
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* SHORTFALL VOLUNTARY COORDINATION NOTICE */}
                {isOpen && req.shortfallCount !== undefined && req.shortfallCount > 0 && (
                  <div className="my-3 p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-950 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🤝</span>
                      <span className="font-bold text-amber-900">
                        Blood Bank is coordinating donor matching for {req.shortfallCount} remaining unit{req.shortfallCount === 1 ? '' : 's'}
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded border border-amber-300">
                      Coordinated by Bank
                    </span>
                  </div>
                )}

                {/* REJECTION REASON BANNER */}
                {isRejected && (
                  <div className="my-3 p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center shrink-0 font-bold text-xs">
                      ✕
                    </span>
                    <div>
                      <strong className="block text-red-900 font-bold mb-0.5">
                        Request Cannot Be Fulfilled by Designated Centre
                      </strong>
                      <p className="text-[11px] text-red-700">
                        <strong>Reason:</strong>{' '}
                        {req.closureFeedback || 'Designated blood centre does not currently have compatible, released stock.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* DISPATCH & COLD CHAIN INFORMATION */}
                {linkedOrder && ['DISPATCHED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'RECEIVED_WITH_DISCREPANCIES'].includes(linkedOrder.status) && (
                  <div className="my-3 p-3.5 rounded-xl bg-blue-50/60 border border-blue-200 text-xs text-blue-900 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold flex items-center gap-1.5 text-blue-900">
                        <span>🚚</span>
                        <span>Cold-Chain Transit Details</span>
                      </span>
                      <span className="text-[11px] text-blue-700 font-medium">
                        Dispatched: {formatDate(linkedOrder.dispatchedAt)}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] pt-1 border-t border-blue-100 text-blue-800">
                      <div>
                        <span className="text-blue-500 block">Courier / Carrier:</span>
                        <span className="font-semibold">{linkedOrder.carrierName || 'Hospital Direct Medical Courier'}</span>
                      </div>
                      <div>
                        <span className="text-blue-500 block">Tracking Reference:</span>
                        <span className="font-mono font-semibold">{linkedOrder.trackingReference || 'In Local Courier Transit'}</span>
                      </div>
                      <div>
                        <span className="text-blue-500 block">Cold Chain Storage:</span>
                        <span className="font-semibold">{linkedOrder.storageTemperature || '2°C to 6°C Monitored'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* OFFICIAL HOSPITAL INTAKE CONFIRMATION */}
                {['RECEIVED_BY_HOSPITAL', 'FULFILLED', 'RECEIVED_WITH_DISCREPANCIES'].includes(currentStage) && (
                  <div className="my-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 font-bold text-xs">
                        ✓
                      </span>
                      <div>
                        <strong className="block text-emerald-900 font-bold">
                          Official Hospital Intake Confirmed
                        </strong>
                        <span className="text-[11px] text-emerald-800">
                          Verified by admitted facility clinical receiving staff.
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* PATIENT DELIVERY ACKNOWLEDGEMENT STATUS */}
                {req.patientAcknowledgedAt && (
                  <div className="my-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <span>
                        <strong>Patient Receipt Confirmed:</strong> You confirmed blood arrival at{' '}
                        {formatDate(req.patientAcknowledgedAt)}.
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400">Personal Confirmation</span>
                  </div>
                )}

                {/* Details Footer */}
                <div className="pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-slate-500">
                  <div>
                    <span className="text-slate-400 block">Required By:</span>
                    <span className="font-medium text-slate-700">{formatDate(req.requiredBy)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Status:</span>
                    <span className="font-medium text-slate-700">{req.fulfillmentStatus || req.status}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Closed At:</span>
                    <span className="font-medium text-slate-700">{formatDate(req.closedAt)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Structured Closure & Feedback Modal Dialog */}
      {closingRequestId && activeClosingRequest && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 sm:p-6 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0 bg-white">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  Close Blood Request
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ref #{activeClosingRequest.id.slice(0, 8)} • {activeClosingRequest.unitsRequested}{' '}
                  {activeClosingRequest.unitsRequested === 1 ? 'Unit' : 'Units'}{' '}
                  {activeClosingRequest.bloodGroup} ({activeClosingRequest.component})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setClosingRequestId(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmClosure} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Please select the outcome to record on this blood request. Closing the request will cancel any active coordination.
                </p>

                <div className="space-y-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Select Request Outcome *
                  </label>
                  {CLOSURE_OUTCOMES.map((outcome) => (
                    <label
                      key={outcome.value}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                        selectedOutcome === outcome.value
                          ? 'border-[#B91C32] bg-red-50/50'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="closureOutcome"
                        value={outcome.value}
                        checked={selectedOutcome === outcome.value}
                        onChange={(e) => setSelectedOutcome(e.target.value)}
                        className="mt-0.5 text-[#B91C32] focus:ring-[#B91C32]"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-slate-900 block">{outcome.label}</span>
                        <span className="text-[11px] text-slate-500">{outcome.description}</span>
                      </div>
                    </label>
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    {selectedOutcome === 'OTHER' ? 'Explanatory Notes (Required for "Other") *' : 'Optional Feedback / Notes'}
                  </label>
                  <textarea
                    rows={2}
                    value={closureFeedback}
                    onChange={(e) => setClosureFeedback(e.target.value)}
                    required={selectedOutcome === 'OTHER'}
                    placeholder={
                      selectedOutcome === 'OTHER'
                        ? 'Please specify details explaining the closure (minimum 5 characters)...'
                        : 'Optional details for coordination record...'
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B91C32]"
                  />
                </div>
              </div>

              <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setClosingRequestId(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingClosure}
                  className="px-5 py-2 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
                >
                  {submittingClosure ? 'Closing Request...' : 'Confirm Closure'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Patient Delivery Acknowledgement Modal */}
      {ackModalRequestId && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3 bg-white">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Confirm Blood Delivery Arrival
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ref #{ackModalRequestId.slice(0, 8)} • Patient / Requester Confirmation
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAckModalRequestId(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmPatientAcknowledge}>
              <div className="p-5 space-y-3.5">
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
                  <strong>Clinical Safety Notice:</strong> This action records your personal confirmation as the requester/patient. Official hospital intake confirmation, crossmatch verification, and clinical safety checks are conducted independently by hospital personnel before transfusion.
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Optional Notes
                  </label>
                  <textarea
                    rows={2}
                    value={ackNotes}
                    onChange={(e) => setAckNotes(e.target.value)}
                    placeholder="e.g. Received at hospital blood bank counter; handed over to nursing staff..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B91C32]"
                  />
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAckModalRequestId(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingAck}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-50 shadow-xs"
                >
                  {submittingAck ? 'Recording...' : 'Confirm Delivery Arrival'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RequestsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading blood requests...</div>}>
      <RequestsContent />
    </Suspense>
  );
}
