'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CardSkeleton, MetricSkeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useRealtime } from '../hooks/useRealtime';

interface DonorProfileData {
  id: string;
  userId: string;
  fullName: string;
  bloodGroup: string;
  districtCode: number;
  primaryHospitalCode: string;
  isAvailable: boolean;
  isSearchable: boolean;
  donationCount?: number;
  latestDonationDate?: string | null;
  isEffectiveAvailable?: boolean;
  lastDonationDate?: string | null;
  verifiedLastDonationDate?: string | null;
  eligibility?: {
    isEligible: boolean;
    status: 'ELIGIBLE' | 'TEMPORARILY_INELIGIBLE' | 'REVIEW_REQUIRED';
    nextEligibleDate?: string | null;
    daysRemaining?: number;
    lastDonationDate?: string | null;
    policy?: string;
  };
  consentGrantedAt?: string;
  consentWithdrawnAt?: string;
  primaryCentre?: {
    hospitalName: string;
    hospitalCode: string;
  };
}

interface EligibleRequest {
  id: string;
  patientName?: string | null;
  requesterName?: string | null;
  requesterPhone?: string | null;
  bloodGroup: string;
  component: string;
  unitsRequested: number;
  requiredBy?: string | null;
  hospitalName: string;
  hospitalAddress?: string | null;
  hospitalPhone?: string | null;
  districtCode?: number | null;
  searchScope: string;
  message?: string | null;
  requestStatus: 'OPEN' | 'CLOSED' | 'CANCELLED';
  closureOutcome?: string | null;
  reportedDonationStatus?: string | null;
  createdAt: string;
  matchTier: string;
  myResponse?: {
    id: string;
    status: 'ACCEPTED' | 'DECLINED' | 'PENDING' | 'CANCELLED';
    respondedAt?: string | null;
    disclosureAuthorized: boolean;
  } | null;
}

export default function DonorDashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<DonorProfileData | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Eligible blood requests / invitations for donor
  const [eligibleRequests, setEligibleRequests] = useState<EligibleRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [responseActionLoading, setResponseActionLoading] = useState<string | null>(null);

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

  // Real-time synchronization for donor events
  const { status: realtimeStatus } = useRealtime({
    userId: currentUser?.id,
    token,
    enabled: !!currentUser?.id,
    onEvent: (evt) => {
      if (
        evt.eventType === 'donor_invitation.response_changed' ||
        evt.eventType === 'blood_request.status_changed' ||
        evt.eventType === 'donor.eligibility_updated' ||
        evt.eventType === 'camp.donation_completed'
      ) {
        loadProfileAndRequests();
      }
    },
  });

  const loadProfileAndRequests = async () => {
    const token = localStorage.getItem('raktasetu_token');
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      setRequestsLoading(true);
      const [profileRes, requestsRes] = await Promise.all([
        fetch(`${apiUrl}/donors/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${apiUrl}/donors/me/eligible-requests`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const profileData = await profileRes.json();
      const requestsData = await requestsRes.json();

      if (!profileRes.ok || !profileData.success) {
        if (profileData.error?.code === 'DONOR_PROFILE_NOT_FOUND') {
          router.push('/donor-registration');
          return;
        }
        throw new Error(profileData.error?.message || 'Failed to load profile');
      }

      setProfile(profileData.data);

      if (requestsData.success && Array.isArray(requestsData.data?.requests)) {
        setEligibleRequests(requestsData.data.requests);
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setLoading(false);
      setRequestsLoading(false);
    }
  };

  useEffect(() => {
    loadProfileAndRequests();
  }, []);

  const handleToggleAvailability = async () => {
    if (!profile) return;
    setUpdating(true);
    setMessage(null);
    const token = localStorage.getItem('raktasetu_token');

    try {
      const res = await fetch(`${apiUrl}/donors/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          isAvailable: !profile.isAvailable,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message);

      setProfile(data.data);
      setMessage({
        text: `Availability updated to ${data.data.isAvailable ? 'Available' : 'Paused'}.`,
        type: 'success',
      });
      loadProfileAndRequests();
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setUpdating(false);
    }
  };

  const handleWithdrawConsent = async () => {
    if (
      !confirm(
        'Are you sure you want to withdraw search consent? You will be immediately removed from all donor coordination searches.'
      )
    ) {
      return;
    }

    setUpdating(true);
    setMessage(null);
    const token = localStorage.getItem('raktasetu_token');

    try {
      const res = await fetch(`${apiUrl}/donors/me/withdraw-consent`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message);

      setProfile((prev) => (prev ? { ...prev, isSearchable: false } : null));
      setEligibleRequests([]);
      setMessage({
        text: 'Search consent successfully withdrawn. You are now excluded from matching searches.',
        type: 'success',
      });
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setUpdating(false);
    }
  };

  const handleDeactivate = async () => {
    if (
      !confirm(
        'Are you sure you want to deactivate your account? All active sessions will be terminated.'
      )
    ) {
      return;
    }

    const token = localStorage.getItem('raktasetu_token');
    try {
      await fetch(`${apiUrl}/users/me/deactivate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      localStorage.removeItem('raktasetu_user');
      localStorage.removeItem('raktasetu_token');
      router.push('/');
    } catch (err: any) {
      alert(`Deactivation failed: ${err.message}`);
    }
  };

  // Donor accepts or declines an invitation independently
  const handleDonorResponse = async (requestId: string, action: 'ACCEPT' | 'DECLINE') => {
    setResponseActionLoading(requestId);
    setMessage(null);

    const token = localStorage.getItem('raktasetu_token');
    try {
      const res = await fetch(`${apiUrl}/donors/me/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ requestId, action }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to submit response');
      }

      // Re-fetch to get updated requester contacts upon ACCEPT
      await loadProfileAndRequests();

      setMessage({
        text:
          action === 'ACCEPT'
            ? 'Thank you! You accepted this coordination request. Authorized contact numbers are now unlocked for direct coordination.'
            : 'You have declined this coordination request.',
        type: 'success',
      });
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setResponseActionLoading(null);
    }
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'None specified';
    try {
      return new Date(isoString).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return isoString;
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6 sm:py-12 space-y-6">
        <MetricSkeleton count={2} />
        <CardSkeleton count={2} />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:px-6 sm:py-12">
      {/* Top Banner & Profile Overview */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-8 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 mb-6 border-b border-slate-200 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-50 text-[#B91C32] border border-red-200">
                {profile?.bloodGroup.replace('_POS', '+').replace('_NEG', '-')} Donor
              </span>
              {profile?.eligibility?.status === 'TEMPORARILY_INELIGIBLE' ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                  <span>⏳</span> DONATION COMPLETED • TEMPORARILY INELIGIBLE
                </span>
              ) : profile?.eligibility?.status === 'REVIEW_REQUIRED' ? (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-800 border border-purple-200">
                  ELIGIBILITY REVIEW REQUIRED
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                  <span>●</span> ELIGIBLE TO DONATE
                </span>
              )}
              {(profile?.donationCount ?? 0) > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center gap-1.5 shadow-xs">
                  <span>🩸</span> Blood Donor ({profile?.donationCount} {profile?.donationCount === 1 ? 'Donation' : 'Donations'})
                </span>
              )}
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Voluntary Dashboard</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {profile?.fullName || 'Registered Donor'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              District Code: {profile?.districtCode} • Primary Facility: {profile?.primaryCentre?.hospitalName || profile?.primaryHospitalCode}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Link
              href="/profile"
              className="px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
            >
              Edit Profile
            </Link>
            {profile?.eligibility?.status === 'TEMPORARILY_INELIGIBLE' ? (
              <div
                title="Temporarily unavailable due to mandatory 90-day recovery interval"
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300 shadow-xs flex items-center gap-1.5 cursor-not-allowed"
              >
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                <span>Status: Temporarily Unavailable</span>
              </div>
            ) : (
              <button
                onClick={handleToggleAvailability}
                disabled={updating}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs ${
                  profile?.isAvailable
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                    : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                }`}
              >
                {profile?.isAvailable ? 'Status: Available' : 'Status: Paused'}
              </button>
            )}
          </div>
        </div>

        {message && (
          <div
            className={`mb-6 p-4 rounded-xl text-xs font-semibold border ${
              message.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Status Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-xs font-medium text-slate-600 mb-1">Primary Preferred Centre</div>
            <div className="text-sm font-semibold text-slate-900">
              {profile?.primaryCentre?.hospitalName || profile?.primaryHospitalCode}
            </div>
            <span className="text-[11px] text-slate-500">Designated clinical blood facility</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-xs font-medium text-slate-600 mb-1">Search Discoverability</div>
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  profile?.isSearchable ? 'bg-emerald-500' : 'bg-slate-400'
                }`}
              ></span>
              <span className="text-sm font-semibold text-slate-900">
                {profile?.isSearchable ? 'Active in Search Pool' : 'Excluded from Search'}
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              {profile?.isSearchable
                ? 'Eligible to receive direct invitations from patients'
                : 'Opted out or consent withdrawn'}
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-xs font-medium text-slate-600 mb-1">Donation Eligibility Status</div>
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  profile?.eligibility?.status === 'TEMPORARILY_INELIGIBLE'
                    ? 'bg-amber-500'
                    : profile?.eligibility?.status === 'REVIEW_REQUIRED'
                    ? 'bg-purple-500'
                    : 'bg-emerald-500'
                }`}
              />
              <span className="text-sm font-semibold text-slate-900">
                {profile?.eligibility?.status === 'TEMPORARILY_INELIGIBLE'
                  ? 'TEMPORARILY INELIGIBLE'
                  : profile?.eligibility?.status === 'REVIEW_REQUIRED'
                  ? 'REVIEW REQUIRED'
                  : 'ELIGIBLE TO DONATE'}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {profile?.eligibility?.status === 'TEMPORARILY_INELIGIBLE' ? (
                <>
                  Next eligible:{' '}
                  <strong>
                    {profile.eligibility.nextEligibleDate
                      ? new Date(profile.eligibility.nextEligibleDate).toLocaleDateString('en-IN', {
                          dateStyle: 'medium',
                        })
                      : 'Pending recovery'}
                  </strong>{' '}
                  ({profile.eligibility.daysRemaining ?? 0} days remaining on 90-day whole blood interval)
                </>
              ) : (
                'Standard 90-day whole blood interval cleared. Ready for voluntary camp or hospital donation.'
              )}
            </div>
          </div>
        </div>

        {/* INCOMING DIRECT INVITATIONS */}
        <div className="mb-8 pt-6 border-t border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Direct Patient Invitations</span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-[#B91C32] border border-red-200">
                  {eligibleRequests.length} Received
                </span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Official donation coordination invitations dispatched by designated Blood Banks for pending blood requests.
              </p>
            </div>
          </div>

          {requestsLoading ? (
            <CardSkeleton count={2} />
          ) : eligibleRequests.length === 0 ? (
            <EmptyState
              title="No Pending Invitations"
              description={
                profile?.isSearchable && profile?.isAvailable
                  ? 'No direct invitations currently pending for your profile. You will see direct patient invitations here when patients select you for coordination.'
                  : 'You are currently paused or excluded from searches. Enable availability and consent above to receive invitations.'
              }
              actionText={profile?.isAvailable ? undefined : 'Enable Availability'}
              onAction={profile?.isAvailable ? undefined : handleToggleAvailability}
            />
          ) : (
            <div className="space-y-4">
              {eligibleRequests.map((req) => {
                const myStatus = req.myResponse?.status;
                const isAccepting = responseActionLoading === req.id;
                const isRequestClosed = req.requestStatus === 'CLOSED' || req.requestStatus === 'CANCELLED';
                const isInvitationCancelled = myStatus === 'CANCELLED';

                return (
                  <div
                    key={req.id}
                    className={`p-5 rounded-2xl border transition-all shadow-xs ${
                      isRequestClosed
                        ? 'border-slate-200 bg-slate-50/60'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-red-50 text-[#B91C32] border border-red-200">
                            {req.bloodGroup.replace('_POS', '+').replace('_NEG', '-')} {req.component}
                          </span>
                          <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                            {req.matchTier}
                          </span>

                          {/* Request Status Badge */}
                          {req.requestStatus === 'OPEN' ? (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                              Open Request
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-700">
                              Request {req.requestStatus}
                            </span>
                          )}

                          {/* Invitation Status Badge */}
                          {myStatus === 'ACCEPTED' ? (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-600 text-white">
                              Accepted by You
                            </span>
                          ) : myStatus === 'DECLINED' ? (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-200 text-slate-600">
                              Declined by You
                            </span>
                          ) : isInvitationCancelled ? (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-[#B91C32] border border-red-200">
                              Cancelled
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              Pending Your Decision
                            </span>
                          )}

                          <span className="text-[11px] text-slate-400 font-mono">
                            Ref #{req.id.slice(0, 8)}
                          </span>
                        </div>

                        <div className="text-sm font-bold text-slate-900">
                          {req.unitsRequested} {req.unitsRequested === 1 ? 'Unit' : 'Units'} requested at{' '}
                          {req.hospitalName}
                        </div>

                        {req.patientName && (
                          <div className="text-xs text-slate-700 mt-1">
                            <strong>Patient:</strong> {req.patientName}
                          </div>
                        )}

                        {req.hospitalAddress && (
                          <div className="text-xs text-slate-500 mt-0.5">
                            📍 Recommended Centre: {req.hospitalName} ({req.hospitalAddress})
                          </div>
                        )}

                        <div className="text-[11px] text-amber-900 bg-amber-50/80 p-2 rounded-lg border border-amber-200 mt-2">
                          <strong>Medical Safety Directive:</strong> Please coordinate voluntary donation through the accredited blood centre above.
                          Under strict medical safety regulations, blood must never be delivered directly to the patient or hospital ward.
                        </div>

                        {req.message && (
                          <div className="text-xs italic text-slate-600 bg-slate-50 p-2.5 rounded-lg mt-2 border border-slate-100 max-w-xl">
                            "{req.message}"
                          </div>
                        )}

                        {/* Accredited Centre Coordination after Acceptance */}
                        {myStatus === 'ACCEPTED' && (
                          <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="text-xs text-emerald-950">
                              <span className="font-bold block">Designated Blood Centre Venue:</span>
                              <span className="font-medium text-emerald-900">
                                {req.hospitalName} {req.hospitalPhone ? `• Tel: ${req.hospitalPhone}` : ''}
                              </span>
                              <p className="text-[11px] text-emerald-800 mt-1">
                                Notice: Acceptance coordinates your arrival at this accredited centre. Formal clinical screening and phlebotomy will be conducted by authorized clinical staff upon check-in.
                              </p>
                            </div>
                            {req.hospitalPhone && (
                              <a
                                href={`tel:${req.hospitalPhone}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-xs shrink-0 self-start sm:self-auto"
                              >
                                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
                                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 4V3z" />
                                </svg>
                                <span>Call Blood Centre</span>
                              </a>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Response Action Buttons */}
                      <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                        {isRequestClosed ? (
                          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
                            Request Closed
                          </span>
                        ) : isInvitationCancelled ? (
                          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">
                            Invitation Cancelled
                          </span>
                        ) : myStatus === 'ACCEPTED' ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-bold">
                              ✓ Accepted
                            </span>
                            <button
                              onClick={() => handleDonorResponse(req.id, 'DECLINE')}
                              disabled={isAccepting}
                              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium cursor-pointer"
                            >
                              Change to Decline
                            </button>
                          </div>
                        ) : myStatus === 'DECLINED' ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400 font-medium">Declined</span>
                            <button
                              onClick={() => handleDonorResponse(req.id, 'ACCEPT')}
                              disabled={isAccepting}
                              className="px-3 py-1.5 rounded-lg bg-[#B91C32] hover:bg-[#9B1324] text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
                            >
                              Re-Accept
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDonorResponse(req.id, 'ACCEPT')}
                              disabled={isAccepting}
                              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                            >
                              {isAccepting ? 'Saving...' : 'Accept Invitation'}
                            </button>
                            <button
                              onClick={() => handleDonorResponse(req.id, 'DECLINE')}
                              disabled={isAccepting}
                              className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              Decline
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-500 pt-3 border-t border-slate-100 flex flex-wrap justify-between gap-2">
                      <span>Required By: {formatDate(req.requiredBy)}</span>
                      <span>Matching Scope: {req.searchScope}</span>
                      <span>Received: {formatDate(req.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Privacy & Consent Controls */}
        <div className="pt-6 border-t border-slate-200 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-900">Privacy & Consent Controls</h2>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl border border-slate-200 gap-3">
            <div>
              <div className="text-xs font-bold text-slate-900">Search Participation Consent</div>
              <div className="text-xs text-slate-600 max-w-lg mt-0.5">
                Withdrawing consent immediately removes your profile from all matching algorithms. Existing requests will follow documented cancellation policies.
              </div>
            </div>
            {profile?.isSearchable && (
              <button
                onClick={handleWithdrawConsent}
                disabled={updating}
                className="px-3.5 py-1.5 rounded-lg border border-red-300 text-[#B91C32] hover:bg-red-50 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
              >
                Withdraw Search Consent
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl border border-red-200 bg-red-50 gap-3">
            <div>
              <div className="text-xs font-bold text-red-950">Deactivate Account</div>
              <div className="text-xs text-slate-600 max-w-lg mt-0.5">
                Revokes all active login sessions and soft-deactivates your donor profile.
              </div>
            </div>
            <button
              onClick={handleDeactivate}
              className="px-3.5 py-1.5 rounded-lg bg-[#B91C32] hover:bg-[#9B1324] text-white text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
            >
              Deactivate Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
