'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CardSkeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useRealtime } from '../hooks/useRealtime';

interface BloodCentre {
  hospitalCode: string;
  hospitalName: string;
  address?: string | null;
  mobileNo?: string | null;
  districtCode?: number | null;
}

interface MatchedDonor {
  donorId: string;
  displayName: string;
  bloodGroup: string;
  districtCode: number;
  locality?: string | null;
  matchLevel: 'LEVEL_1_CENTRE' | 'LEVEL_2_DISTRICT' | 'LEVEL_3_EXPANDED';
  matchReason: string;
  responseStatus: string | null;
  invitationStatus: string | null;
  disclosureAuthorized: boolean;
  contactNumber: string | null;
}

interface DonorResponseItem {
  id: string;
  donorId: string;
  donorName: string;
  bloodGroup: string;
  districtCode: number;
  locality?: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED';
  respondedAt?: string | null;
  disclosureAuthorized: boolean;
  contactNumber: string | null;
}

interface BloodRequestItem {
  id: string;
  patientName?: string | null;
  bloodGroup: string;
  component: string;
  unitsRequested: number;
  requiredBy?: string | null;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED' | 'EXPIRED';
  closureOutcome?: string | null;
  closureFeedback?: string | null;
  reportedDonationStatus?: string | null;
  reportedDonorId?: string | null;
  donationVerifiedAt?: string | null;
  verifiedBy?: string | null;
  searchScope: 'EXACT_CENTRE' | 'DISTRICT_EXPANDED' | 'OUT_OF_DISTRICT';
  message?: string | null;
  hospitalCode?: string | null;
  bloodCentre?: BloodCentre | null;
  closedAt?: string | null;
  createdAt: string;
}

const CLOSURE_OUTCOMES = [
  {
    value: 'DONATION_COMPLETED',
    label: 'A responding donor completed the donation',
    description: 'Report that blood was successfully donated by an accepted voluntary donor.',
  },
  {
    value: 'ARRANGED_ELSEWHERE',
    label: 'Blood was arranged through another donor or blood bank',
    description: 'Requirement fulfilled through alternative channels or inventory.',
  },
  {
    value: 'NO_LONGER_NEEDED',
    label: 'The blood requirement is no longer needed',
    description: 'Patient condition stabilized or clinical requirement cancelled.',
  },
  {
    value: 'DONOR_UNAVAILABLE',
    label: 'Donation did not happen or donor could not attend',
    description: 'Coordinated donor was unavailable, unfit, or unable to reach centre.',
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
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // Active expanded coordination panel for a request
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [coordinationLoading, setCoordinationLoading] = useState(false);
  const [matchedDonors, setMatchedDonors] = useState<MatchedDonor[]>([]);
  const [matchingCounts, setMatchingCounts] = useState<{ level1: number; level2: number; level3: number; total: number } | null>(null);
  const [donorResponses, setDonorResponses] = useState<DonorResponseItem[]>([]);

  // Selective donor invitation state
  const [selectedDonorIds, setSelectedDonorIds] = useState<Set<string>>(new Set());
  const [invitingLoading, setInvitingLoading] = useState(false);
  const [invitationMessage, setInvitationMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Closure modal state
  const [closingRequestId, setClosingRequestId] = useState<string | null>(null);
  const [closureResponses, setClosureResponses] = useState<DonorResponseItem[]>([]);
  const [loadingClosureDonors, setLoadingClosureDonors] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<string>('DONATION_COMPLETED');
  const [selectedReportedDonorId, setSelectedReportedDonorId] = useState<string>('');
  const [closureFeedback, setClosureFeedback] = useState<string>('');
  const [submittingClosure, setSubmittingClosure] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

  // Read stored user identity on client mount
  useEffect(() => {
    const userStr = localStorage.getItem('raktasetu_user');
    if (userStr) {
      try {
        setCurrentUser(JSON.parse(userStr));
      } catch {}
    }
  }, []);

  const token = typeof window !== 'undefined' ? localStorage.getItem('raktasetu_token') || undefined : undefined;

  // Real-time synchronization for request and invitation responses
  useRealtime({
    userId: currentUser?.id,
    token,
    enabled: !!currentUser?.id,
    onEvent: (evt) => {
      if (
        evt.eventType === 'donor_invitation.response_changed' ||
        evt.eventType === 'blood_request.status_changed'
      ) {
        fetchRequests();
        if (expandedRequestId) {
          loadCoordinationData(expandedRequestId);
        }
      }
    },
  });

  // Modal body scroll-locking, keyboard Escape listener, and response loading
  useEffect(() => {
    if (!closingRequestId) {
      setClosureResponses([]);
      return;
    }

    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setClosingRequestId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Fetch latest donor responses for the closing request
    const loadResponses = async () => {
      setLoadingClosureDonors(true);
      try {
        const storedToken = localStorage.getItem('raktasetu_token');
        const res = await fetch(`${apiUrl}/blood-requests/${closingRequestId}/responses`, {
          headers: { Authorization: `Bearer ${storedToken}` },
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          setClosureResponses(data.data);
          const accepted = data.data.filter((r: DonorResponseItem) => r.status === 'ACCEPTED');
          if (accepted.length > 0) {
            setSelectedReportedDonorId(accepted[0].donorId);
          } else {
            setSelectedReportedDonorId('');
          }
        }
      } catch (err) {
        console.error('Failed to load closure donors:', err);
      } finally {
        setLoadingClosureDonors(false);
      }
    };

    loadResponses();

    return () => {
      document.body.style.overflow = origOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closingRequestId, apiUrl]);

  const fetchRequests = async () => {
    setLoading(true);
    setError(null);

    const token = localStorage.getItem('raktasetu_token');
    if (!token) {
      setIsAuthenticated(false);
      setLoading(false);
      return;
    }

    setIsAuthenticated(true);

    const tryFetch = async (isRetry = false) => {
      try {
        const res = await fetch(`${apiUrl}/blood-requests`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error?.message || 'Failed to load your blood requests');
        }

        const fetchedRequests: BloodRequestItem[] = data.data || [];
        setRequests(fetchedRequests);

        // Auto-expand request if id is present in URL
        if (queryId) {
          const found = fetchedRequests.find((r) => r.id === queryId);
          if (found) {
            handleToggleCoordination(queryId);
          }
        }
      } catch (err: any) {
        if (!isRetry && (err.message.includes('database') || err.message.includes('Can\'t reach'))) {
          await new Promise((r) => setTimeout(r, 1500));
          return tryFetch(true);
        }
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    await tryFetch(false);
  };

  useEffect(() => {
    fetchRequests();
  }, [queryId]);

  const loadCoordinationData = async (requestId: string) => {
    setCoordinationLoading(true);
    setInvitationMessage(null);
    setSelectedDonorIds(new Set());

    try {
      const token = localStorage.getItem('raktasetu_token');
      const [donorsRes, responsesRes] = await Promise.all([
        fetch(`${apiUrl}/blood-requests/${requestId}/matching-donors`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiUrl}/blood-requests/${requestId}/responses`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const donorsData = await donorsRes.json();
      const responsesData = await responsesRes.json();

      if (donorsData.success) {
        setMatchedDonors(donorsData.data.donors || []);
        setMatchingCounts(donorsData.data.counts || null);
      }
      if (responsesData.success) {
        setDonorResponses(responsesData.data || []);
      }
    } catch (err: any) {
      console.error('Failed to load coordination data:', err);
    } finally {
      setCoordinationLoading(false);
    }
  };

  const handleToggleCoordination = async (requestId: string) => {
    if (expandedRequestId === requestId) {
      setExpandedRequestId(null);
      return;
    }

    setExpandedRequestId(requestId);
    await loadCoordinationData(requestId);
  };

  // Checkbox toggle for a single donor
  const handleToggleDonorSelect = (donorId: string) => {
    setSelectedDonorIds((prev) => {
      const next = new Set(prev);
      if (next.has(donorId)) {
        next.delete(donorId);
      } else {
        next.add(donorId);
      }
      return next;
    });
  };

  // Select all visible donors
  const handleSelectAllVisible = () => {
    const uninvitedDonors = matchedDonors.filter(
      (d) => d.responseStatus !== 'PENDING' && d.responseStatus !== 'ACCEPTED'
    );
    setSelectedDonorIds(new Set(uninvitedDonors.map((d) => d.donorId)));
  };

  // Clear selection
  const handleClearSelection = () => {
    setSelectedDonorIds(new Set());
  };

  // Send invitations to selected donors
  const handleSendInvitations = async (requestId: string) => {
    if (selectedDonorIds.size === 0) return;

    setInvitingLoading(true);
    setInvitationMessage(null);

    try {
      const token = localStorage.getItem('raktasetu_token');
      const res = await fetch(`${apiUrl}/blood-requests/${requestId}/invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          donorIds: Array.from(selectedDonorIds),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to send invitations.');
      }

      setInvitationMessage({
        type: 'success',
        text: `Invitations sent successfully to ${data.data?.invitedCount || selectedDonorIds.size} donor(s).`,
      });
      setSelectedDonorIds(new Set());

      // Refresh coordination data and request list
      await loadCoordinationData(requestId);
      await fetchRequests();
    } catch (err: any) {
      setInvitationMessage({
        type: 'error',
        text: err.message,
      });
    } finally {
      setInvitingLoading(false);
    }
  };

  const handleUpdateScope = async (requestId: string, newScope: 'EXACT_CENTRE' | 'DISTRICT_EXPANDED' | 'OUT_OF_DISTRICT') => {
    setActionLoading(requestId);
    try {
      const token = localStorage.getItem('raktasetu_token');
      const res = await fetch(`${apiUrl}/blood-requests/${requestId}/scope`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ searchScope: newScope }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to update search scope');
      }

      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, searchScope: newScope } : r))
      );

      await loadCoordinationData(requestId);
    } catch (err: any) {
      alert(`Error updating scope: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Submit closure with outcome feedback
  const handleConfirmClosure = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingRequestId) return;

    if (selectedOutcome === 'DONATION_COMPLETED') {
      const accepted = closureResponses.filter((r) => r.status === 'ACCEPTED');
      if (accepted.length === 0) {
        alert(
          'No voluntary donors have accepted an invitation for this request yet. If blood was obtained from another donor or blood bank, please select "Blood was arranged through another donor or blood bank".'
        );
        return;
      }
      if (!selectedReportedDonorId || !accepted.some((d) => d.donorId === selectedReportedDonorId)) {
        alert('Please select an accepted responding donor who completed the donation.');
        return;
      }
    }

    if (selectedOutcome === 'OTHER' && closureFeedback.trim().length < 5) {
      alert('Please provide an explanatory note for selecting "Other reason" (minimum 5 characters).');
      return;
    }

    setSubmittingClosure(true);
    try {
      const token = localStorage.getItem('raktasetu_token');
      const res = await fetch(`${apiUrl}/blood-requests/${closingRequestId}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          outcome: selectedOutcome,
          reportedDonorId: selectedOutcome === 'DONATION_COMPLETED' ? selectedReportedDonorId : undefined,
          feedback: closureFeedback.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to close request');
      }

      setClosingRequestId(null);
      setClosureFeedback('');
      setSelectedReportedDonorId('');
      await fetchRequests();
      if (expandedRequestId === closingRequestId) {
        await loadCoordinationData(closingRequestId);
      }
    } catch (err: any) {
      alert(`Error closing request: ${err.message}`);
    } finally {
      setSubmittingClosure(false);
    }
  };

  // Clinical verification action (Authorized blood bank personnel)
  const handleVerifyDonation = async (requestId: string) => {
    if (!confirm('Confirm clinical donation verification? This will update the donor\'s verified donation history and enforce a 90-day medical deferral.')) {
      return;
    }

    setActionLoading(requestId);
    try {
      const token = localStorage.getItem('raktasetu_token');
      const res = await fetch(`${apiUrl}/blood-requests/${requestId}/verify-donation`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Verification failed');
      }

      alert('Donation verified successfully! Donor record updated with verified donation date.');
      await fetchRequests();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'None';
    try {
      return new Date(isoString).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return isoString;
    }
  };

  const getStatusBadge = (status: string, closureOutcome?: string | null) => {
    switch (status) {
      case 'OPEN':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            Open
          </span>
        );
      case 'CLOSED':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300">
            {closureOutcome === 'DONATION_COMPLETED' ? 'Donation Completed' : 'Closed'}
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-[#B91C32] border border-red-200">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
            {status}
          </span>
        );
    }
  };

  if (isAuthenticated === false) {
    return (
      <div className="flex-1 max-w-lg mx-auto w-full px-4 sm:px-6 py-12">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-red-50 text-[#B91C32] mx-auto flex items-center justify-center mb-4">
            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Sign In Required</h2>
          <p className="text-sm text-slate-600 mb-6">
            Please sign in to track your blood coordination requests, select matching voluntary donors, and view verified responses.
          </p>
          <Link
            href="/login"
            className="inline-block px-6 py-2.5 rounded-xl bg-[#B91C32] text-white font-semibold text-sm hover:bg-[#9B1324] transition-colors shadow-sm"
          >
            Sign In with Demo Phone Login
          </Link>
        </div>
      </div>
    );
  }

  // Find accepted donors for closing modal if current request selected
  const activeClosingRequest = requests.find((r) => r.id === closingRequestId);

  return (
    <div className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Link href="/" className="hover:underline">Home</Link>
            <span>/</span>
            <span className="font-semibold text-slate-800">My Requests</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            My Blood Requests
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Track active coordination requests, select voluntary donors to invite, and receive verified responses.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Link
            href="/find-blood"
            className="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors"
          >
            Find Blood Centres
          </Link>
          <Link
            href="/requests/new"
            className="px-4 py-2 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] text-white text-xs font-bold transition-colors shadow-xs"
          >
            + New Request
          </Link>
        </div>
      </div>

      {isCreated && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-3">
          <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 font-bold text-xs">✓</span>
          <div>
            <strong className="block text-emerald-900 font-bold">Blood Request Created Successfully</strong>
            Your request is now open. Voluntary donors matching your request across priority tiers are displayed below. Select specific donors and send invitations.
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <strong>Error loading requests:</strong> {error}
          </div>
          <button
            onClick={() => fetchRequests()}
            className="px-3.5 py-1.5 rounded-lg bg-[#B91C32] hover:bg-[#9B1324] text-white text-xs font-bold transition-colors cursor-pointer shrink-0 shadow-xs"
          >
            Retry Connection
          </button>
        </div>
      )}

      {loading ? (
        <CardSkeleton count={2} />
      ) : requests.length === 0 ? (
        <EmptyState
          title="No Blood Requests Yet"
          description="You haven't initiated any blood requests. Search blood centres or create a new request for hospital coordination."
          actionText="+ Create Blood Request"
          actionHref="/requests/new"
        />
      ) : (
        <div className="space-y-6">
          {requests.map((req) => {
            const isOpen = req.status === 'OPEN';
            const isExpanded = expandedRequestId === req.id;

            return (
              <div
                key={req.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6 transition-all hover:border-slate-300"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="text-[11px] font-mono text-slate-400">
                        Ref #{req.id.slice(0, 8)}
                      </span>
                      {getStatusBadge(req.status, req.closureOutcome)}

                      {/* Reported / Verified Donation Lifecycle Badges */}
                      {req.reportedDonationStatus === 'REPORTED_UNVERIFIED' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          Reported Donation (Awaiting Verification)
                        </span>
                      )}

                      {req.reportedDonationStatus === 'DONATION_VERIFIED' && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Verified Donation ({req.verifiedBy || 'Blood Centre Personnel'})
                        </span>
                      )}

                      <span className="text-xs text-slate-400">• Created {formatDate(req.createdAt)}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xl font-extrabold text-slate-900">
                        {req.unitsRequested} {req.unitsRequested === 1 ? 'Unit' : 'Units'} {req.bloodGroup}
                      </span>
                      <span className="text-sm font-semibold text-slate-700">
                        ({req.component})
                      </span>
                    </div>

                    {req.patientName && (
                      <p className="text-xs text-slate-700 mt-1">
                        <strong>Patient Name:</strong> {req.patientName}
                      </p>
                    )}

                    {req.bloodCentre && (
                      <p className="text-xs text-slate-600 mt-0.5">
                        <strong>Target Facility:</strong> {req.bloodCentre.hospitalName}
                        {req.bloodCentre.mobileNo && ` • Tel: ${req.bloodCentre.mobileNo}`}
                      </p>
                    )}

                    {req.closureOutcome && (
                      <p className="text-xs text-slate-600 mt-1">
                        <strong>Closure Outcome:</strong>{' '}
                        <span className="font-semibold text-slate-800">
                          {CLOSURE_OUTCOMES.find((o) => o.value === req.closureOutcome)?.label || req.closureOutcome}
                        </span>
                        {req.closureFeedback && <span className="italic text-slate-500"> — "{req.closureFeedback}"</span>}
                      </p>
                    )}

                    {req.message && (
                      <p className="text-xs text-slate-500 mt-2 italic bg-slate-50 p-2.5 rounded-lg border border-slate-100 max-w-xl">
                        "{req.message}"
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {/* Expand / Hide Coordination */}
                    <button
                      onClick={() => handleToggleCoordination(req.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
                        isExpanded
                          ? 'bg-slate-900 text-white'
                          : 'bg-red-50 text-[#B91C32] border border-red-200 hover:bg-red-100'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
                        <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                      </svg>
                      <span>{isExpanded ? 'Hide Donors' : 'Matching Donors'}</span>
                    </button>

                    {/* Close / Cancel Dialog Trigger */}
                    {isOpen && (
                      <button
                        onClick={() => {
                          setClosingRequestId(req.id);
                          setSelectedOutcome('DONATION_COMPLETED');
                          setSelectedReportedDonorId('');
                          setClosureFeedback('');
                        }}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Close Request
                      </button>
                    )}

                    {/* Authorized Blood Bank Verification Action (Visible when reported unverified) */}
                    {req.reportedDonationStatus === 'REPORTED_UNVERIFIED' && (
                      <button
                        onClick={() => handleVerifyDonation(req.id)}
                        disabled={actionLoading === req.id}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs disabled:opacity-50"
                      >
                        {actionLoading === req.id ? 'Verifying...' : 'Verify Donation'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Details Footer */}
                <div className="pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-500">
                  <div>
                    <span className="text-slate-400 block">Required By:</span>
                    <span className="font-medium text-slate-700">{formatDate(req.requiredBy)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Search Scope:</span>
                    <span className="font-medium text-slate-700">
                      {req.searchScope === 'EXACT_CENTRE'
                        ? 'Exact Centre'
                        : req.searchScope === 'DISTRICT_EXPANDED'
                        ? 'Same District'
                        : 'Out of District'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Status:</span>
                    <span className="font-medium text-slate-700">{req.status}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Closed At:</span>
                    <span className="font-medium text-slate-700">{formatDate(req.closedAt)}</span>
                  </div>
                </div>

                {/* EXPANDED DONOR COORDINATION PANEL */}
                {isExpanded && (
                  <div className="mt-5 pt-5 border-t-2 border-dashed border-slate-200">
                    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                        <div>
                          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <span>Matching Voluntary Donors</span>
                            <span className="text-xs bg-red-100 text-[#B91C32] px-2 py-0.5 rounded-full font-bold">
                              Individual Selection
                            </span>
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Select individual donors to send coordination invitations. Contact phone numbers are disclosed only after a donor accepts.
                          </p>
                        </div>

                        {/* Search Scope Expander */}
                        {isOpen && (
                          <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-slate-200 self-start sm:self-auto">
                            <button
                              onClick={() => handleUpdateScope(req.id, 'EXACT_CENTRE')}
                              disabled={actionLoading === req.id || req.searchScope === 'EXACT_CENTRE'}
                              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                                req.searchScope === 'EXACT_CENTRE'
                                  ? 'bg-[#B91C32] text-white shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Preferred Centre
                            </button>
                            <button
                              onClick={() => handleUpdateScope(req.id, 'DISTRICT_EXPANDED')}
                              disabled={actionLoading === req.id || req.searchScope === 'DISTRICT_EXPANDED'}
                              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                                req.searchScope === 'DISTRICT_EXPANDED'
                                  ? 'bg-[#B91C32] text-white shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Expand: District
                            </button>
                            <button
                              onClick={() => handleUpdateScope(req.id, 'OUT_OF_DISTRICT')}
                              disabled={actionLoading === req.id || req.searchScope === 'OUT_OF_DISTRICT'}
                              className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                                req.searchScope === 'OUT_OF_DISTRICT'
                                  ? 'bg-[#B91C32] text-white shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              Expand: Out of District
                            </button>
                          </div>
                        )}
                      </div>

                      {invitationMessage && (
                        <div
                          className={`mb-4 p-3 rounded-lg text-xs font-semibold ${
                            invitationMessage.type === 'success'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-red-50 text-red-800 border border-red-200'
                          }`}
                        >
                          {invitationMessage.text}
                        </div>
                      )}

                      {coordinationLoading ? (
                        <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
                          Querying eligible voluntary donors...
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {/* Matching Donors List with Checkbox Selection Controls */}
                          {isOpen ? (
                            <div>
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs mb-3 pb-2 border-b border-slate-200">
                              <div className="font-bold text-slate-700 uppercase tracking-wider">
                                Matching Candidates ({matchedDonors.length})
                                {matchingCounts && (
                                  <span className="text-[11px] font-normal text-slate-500 lowercase ml-2">
                                    ({matchingCounts.level1} centre • {matchingCounts.level2} district • {matchingCounts.level3} expanded)
                                  </span>
                                )}
                              </div>

                              {isOpen && matchedDonors.length > 0 && (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={handleSelectAllVisible}
                                    className="text-[11px] text-[#B91C32] hover:underline font-semibold cursor-pointer"
                                  >
                                    Select Uninvited ({matchedDonors.filter((d) => d.responseStatus !== 'PENDING' && d.responseStatus !== 'ACCEPTED').length})
                                  </button>
                                  {selectedDonorIds.size > 0 && (
                                    <>
                                      <span className="text-slate-300">|</span>
                                      <button
                                        type="button"
                                        onClick={handleClearSelection}
                                        className="text-[11px] text-slate-500 hover:underline cursor-pointer"
                                      >
                                        Clear Selection
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Batch Action Bar if donors selected */}
                            {isOpen && selectedDonorIds.size > 0 && (
                              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between gap-3">
                                <span className="text-xs font-bold text-[#B91C32]">
                                  {selectedDonorIds.size} {selectedDonorIds.size === 1 ? 'donor' : 'donors'} selected for invitation
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleSendInvitations(req.id)}
                                  disabled={invitingLoading}
                                  className="px-4 py-2 rounded-lg bg-[#B91C32] hover:bg-[#9B1324] text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
                                >
                                  {invitingLoading ? 'Sending Invitations...' : `Send Invitations (${selectedDonorIds.size})`}
                                </button>
                              </div>
                            )}

                            {matchedDonors.length === 0 ? (
                              <div className="p-4 rounded-lg bg-white border border-slate-200 text-center text-xs text-slate-500">
                                No active voluntary donors found matching this search scope. Click <strong>"Expand: District"</strong> or <strong>"Expand: Out of District"</strong> above to broaden matching.
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {matchedDonors.map((d, dIdx) => {
                                  const isSelected = selectedDonorIds.has(d.donorId);
                                  const isAlreadyInvited = d.responseStatus === 'PENDING';
                                  const isAccepted = d.responseStatus === 'ACCEPTED';
                                  const isDeclined = d.responseStatus === 'DECLINED';

                                  return (
                                    <div
                                      key={`${d.donorId}-${dIdx}`}
                                      onClick={() => {
                                        if (isOpen && !isAlreadyInvited && !isAccepted) {
                                          handleToggleDonorSelect(d.donorId);
                                        }
                                      }}
                                      className={`bg-white p-3.5 rounded-xl border transition-all text-xs space-y-2 cursor-pointer ${
                                        isSelected
                                          ? 'border-[#B91C32] ring-2 ring-red-100 shadow-sm'
                                          : 'border-slate-200 hover:border-slate-300'
                                      }`}
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                          {isOpen && (
                                            <input
                                              type="checkbox"
                                              checked={isSelected || isAlreadyInvited || isAccepted}
                                              disabled={isAlreadyInvited || isAccepted}
                                              onChange={() => handleToggleDonorSelect(d.donorId)}
                                              onClick={(e) => e.stopPropagation()}
                                              className="w-4 h-4 text-[#B91C32] rounded border-slate-300 focus:ring-[#B91C32]"
                                            />
                                          )}
                                          <div>
                                            <span className="font-bold text-slate-900 block">{d.displayName}</span>
                                            {d.locality && (
                                              <span className="text-[11px] text-slate-500">{d.locality}</span>
                                            )}
                                          </div>
                                        </div>

                                        <span className="font-bold text-[#B91C32] bg-red-50 border border-red-100 px-2 py-0.5 rounded text-[11px]">
                                          {d.bloodGroup.replace('_POS', '+').replace('_NEG', '-')}
                                        </span>
                                      </div>

                                      <div className="flex items-center justify-between text-[11px]">
                                        <span
                                          className={`px-1.5 py-0.5 rounded font-medium ${
                                            d.matchLevel === 'LEVEL_1_CENTRE'
                                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                              : d.matchLevel === 'LEVEL_2_DISTRICT'
                                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                              : 'bg-slate-100 text-slate-600'
                                          }`}
                                        >
                                          {d.matchLevel === 'LEVEL_1_CENTRE'
                                            ? '★ Preferred Centre'
                                            : d.matchLevel === 'LEVEL_2_DISTRICT'
                                            ? 'Same District'
                                            : 'Expanded District'}
                                        </span>
                                        <span className="text-slate-400">District {d.districtCode}</span>
                                      </div>

                                      {/* Pre-acceptance privacy guarantee: Phone strictly withheld */}
                                      <div className="pt-1.5 border-t border-slate-100 text-[11px] flex items-center justify-between">
                                        <span className="text-slate-400">Status:</span>
                                        {isAccepted ? (
                                          <span className="text-emerald-700 font-bold flex items-center gap-1">
                                            <span>✓ Accepted</span>
                                          </span>
                                        ) : isAlreadyInvited ? (
                                          <span className="text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-full">
                                            Invitation Pending
                                          </span>
                                        ) : isDeclined ? (
                                          <span className="text-slate-400">Declined</span>
                                        ) : (
                                          <span className="text-slate-500 font-medium">Ready to Invite</span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="p-4 rounded-xl bg-slate-100/90 border border-slate-200 text-xs text-slate-600 leading-relaxed">
                            <span className="font-bold text-slate-800 block mb-1">
                              ℹ️ Coordination Closed:
                            </span>
                            This blood request is <strong>{req.status}</strong>. Active voluntary donor matching and invitations are closed. All historical invitations, donor responses, and authorized unlocked contacts remain archived below.
                          </div>
                        )}

                        {/* Incoming Responses & Disclosed Contacts */}
                        <div>
                            <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                              Authorized Contact Coordination ({donorResponses.length})
                            </div>

                            {donorResponses.length === 0 ? (
                              <div className="p-4 rounded-lg bg-white border border-slate-200 text-center text-xs text-slate-500">
                                No invitations have been answered yet. Select voluntary donors above to send coordination invitations.
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {donorResponses.map((res, resIdx) => {
                                  const isAccepted = res.status === 'ACCEPTED';

                                  return (
                                    <div
                                      key={`${res.id}-${resIdx}`}
                                      className="p-3.5 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                                    >
                                      <div>
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="font-bold text-slate-900">{res.donorName}</span>
                                          <span className="text-[#B91C32] font-bold">
                                            {res.bloodGroup.replace('_POS', '+').replace('_NEG', '-')}
                                          </span>
                                          {isAccepted ? (
                                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                                              Accepted Coordination
                                            </span>
                                          ) : (
                                            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                                              {res.status}
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[11px] text-slate-500">
                                          Responded: {formatDate(res.respondedAt)}
                                          {res.locality && ` • Locality: ${res.locality}`}
                                        </div>
                                      </div>

                                      {/* Authorized contact disclosed only after acceptance */}
                                      {isAccepted && res.contactNumber ? (
                                        <div className="flex items-center gap-2">
                                          <a
                                            href={`tel:${res.contactNumber}`}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors shadow-xs"
                                          >
                                            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
                                              <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 4V3z" />
                                            </svg>
                                            <span>Call: {res.contactNumber}</span>
                                          </a>
                                        </div>
                                      ) : isAccepted ? (
                                        <span className="text-[11px] text-slate-500 italic">
                                          Contact authorized for coordination
                                        </span>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Mandatory Safety Notice */}
                          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-relaxed">
                            <strong>Safety & Compliance Notice:</strong> RaktaSetu coordinates voluntary matching leads. Hospital personnel must make the final clinical eligibility and blood compatibility determination.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Structured Closure & Feedback Modal Dialog (Phase 5) */}
      {closingRequestId && activeClosingRequest && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-close-title"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 my-auto overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0 bg-white">
              <div>
                <h3 id="modal-close-title" className="text-base sm:text-lg font-bold text-slate-900">
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
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <form onSubmit={handleConfirmClosure} className="flex flex-col flex-1 overflow-hidden">
              <div className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Please select the outcome to record on this coordination request. Closing the request
                  will cancel pending coordination invitations.
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

                {/* Conditional Donor Selection for DONATION_COMPLETED */}
                {selectedOutcome === 'DONATION_COMPLETED' && (
                  <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 space-y-3">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-amber-900 mb-1">
                        Which donor completed the donation? *
                      </label>
                      {loadingClosureDonors ? (
                        <div className="text-xs text-amber-800 py-1.5 animate-pulse">
                          Loading responding donors...
                        </div>
                      ) : (
                        (() => {
                          const accepted = closureResponses.filter((r) => r.status === 'ACCEPTED');
                          if (accepted.length === 0) {
                            return (
                              <div className="p-3 bg-white rounded-lg border border-amber-300 text-xs text-amber-900">
                                <p className="font-semibold text-[#B91C32] mb-1">
                                  No accepted voluntary donors for this request.
                                </p>
                                <p className="text-[11px] text-slate-600 leading-relaxed">
                                  A donation can only be attributed to a donor who explicitly accepted the coordination request. If blood was obtained from another voluntary donor or hospital blood bank, please select <strong>"Blood was arranged through another donor or blood bank"</strong> above.
                                </p>
                              </div>
                            );
                          }

                          return (
                            <select
                              value={selectedReportedDonorId}
                              onChange={(e) => setSelectedReportedDonorId(e.target.value)}
                              required
                              className="w-full px-3 py-2 text-xs border border-amber-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#B91C32]"
                            >
                              <option value="">-- Select Accepted Responding Donor --</option>
                              {accepted.map((r, rIdx) => (
                                <option key={`${r.donorId}-${rIdx}`} value={r.donorId}>
                                  {r.donorName} ({r.bloodGroup.replace('_POS', '+').replace('_NEG', '-')}) — ✓ Accepted Coordination
                                </option>
                              ))}
                            </select>
                          );
                        })()
                      )}
                    </div>

                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      <strong>Clinical Integrity Notice:</strong> Recording this outcome records a <em>patient-reported donation event</em>. Under NBTC guidelines, it does not modify the voluntary donor's clinically verified transfusion history or medical deferral until confirmed by authorized blood centre staff.
                    </p>
                  </div>
                )}

                {/* Explanatory feedback / notes */}
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
                        : 'Optional details for audit and coordination history...'
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B91C32]"
                  />
                </div>
              </div>

              {/* Modal Sticky Footer */}
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
