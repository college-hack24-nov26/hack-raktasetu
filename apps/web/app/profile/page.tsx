'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CardSkeleton, MetricSkeleton } from '../components/ui/Skeleton';
import {
  STATES_AND_DISTRICTS,
  DEFAULT_STATE_CODE,
  getDistrictsForState,
  getDistrictName,
  getStateName,
} from '../config/geography';
import { formatPhoneNumber } from '../config/phone';
import { useRealtime } from '../hooks/useRealtime';

interface UserData {
  id: string;
  phoneNumber: string;
  name: string | null;
  role: string;
  status: string;
  createdAt: string;
}

interface DonorProfileData {
  id: string;
  fullName: string;
  dateOfBirth: string;
  bloodGroup: string;
  stateCode: number;
  districtCode: number;
  cityOrLocality: string | null;
  primaryHospitalCode: string;
  lastDonationDate: string | null;
  verifiedLastDonationDate: string | null;
  isAvailable: boolean;
  isSearchable: boolean;
  donationCount?: number;
  latestDonationDate?: string | null;
  isEffectiveAvailable?: boolean;
  eligibility?: {
    isEligible: boolean;
    status: 'ELIGIBLE' | 'TEMPORARILY_INELIGIBLE' | 'REVIEW_REQUIRED';
    nextEligibleDate?: string | null;
    daysRemaining?: number;
    lastDonationDate?: string | null;
    policy?: string;
  };
  consentGrantedAt: string | null;
  consentWithdrawnAt: string | null;
  consentVersion: string;
  primaryCentre?: {
    hospitalCode: string;
    hospitalName: string;
    address: string | null;
  } | null;
  centrePreferences?: Array<{
    hospitalCode: string;
    isPrimary: boolean;
    bloodCentre?: {
      hospitalName: string;
      address: string | null;
    } | null;
  }>;
}

interface ProfileResponse {
  user: UserData;
  donorProfile: DonorProfileData | null;
  stats: {
    totalRequestsCreated: number;
    totalResponsesSubmitted: number;
    acceptedResponsesCount: number;
  };
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit Modal State
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editLocality, setEditLocality] = useState('');
  const [editDistrictCode, setEditDistrictCode] = useState<number>(27);
  const [editIsAvailable, setEditIsAvailable] = useState(true);
  const [editIsSearchable, setEditIsSearchable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
  const token = typeof window !== 'undefined' ? localStorage.getItem('raktasetu_token') || undefined : undefined;

  // Real-time synchronization for donor events on profile
  useRealtime({
    userId: profile?.user?.id,
    token,
    enabled: !!profile?.user?.id,
    onEvent: (evt) => {
      if (
        evt.eventType === 'donor.eligibility_updated' ||
        evt.eventType === 'camp.donation_completed' ||
        evt.eventType === 'donor_invitation.response_changed'
      ) {
        loadProfile();
      }
    },
  });

  async function loadProfile() {
    const token = localStorage.getItem('raktasetu_token');
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`${apiUrl}/profile/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (res.status === 401) {
          localStorage.removeItem('raktasetu_token');
          localStorage.removeItem('raktasetu_user');
          router.push('/login');
          return;
        }
        throw new Error(data.error?.message || 'Failed to load profile.');
      }

      setProfile(data.data);
      // Pre-fill edit fields
      if (data.data) {
        setEditName(data.data.donorProfile?.fullName || data.data.user?.name || '');
        setEditLocality(data.data.donorProfile?.cityOrLocality || '');
        setEditDistrictCode(data.data.donorProfile?.districtCode || 27);
        setEditIsAvailable(data.data.donorProfile?.isAvailable ?? true);
        setEditIsSearchable(data.data.donorProfile?.isSearchable ?? true);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfile();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);
    setSaving(true);

    const token = localStorage.getItem('raktasetu_token');
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      const res = await fetch(`${apiUrl}/profile/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fullName: editName.trim(),
          name: editName.trim(),
          cityOrLocality: editLocality.trim(),
          districtCode: editDistrictCode,
          isAvailable: editIsAvailable,
          isSearchable: editIsSearchable,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to update profile.');
      }

      setSaveSuccess('Profile updated successfully!');
      setIsEditing(false);
      // Reload updated profile
      await loadProfile();
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6">
        <MetricSkeleton count={3} />
        <CardSkeleton count={2} />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex-1 max-w-xl mx-auto w-full px-4 sm:px-6 py-12">
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-center">
          <p className="text-sm font-semibold text-[#B91C32] mb-3">{error || 'Unable to load profile'}</p>
          <button
            onClick={loadProfile}
            className="px-4 py-2 bg-[#B91C32] text-white text-xs font-bold rounded-lg cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { user, donorProfile, stats } = profile;
  const stateDistricts = getDistrictsForState(donorProfile?.stateCode || DEFAULT_STATE_CODE);

  // Check 90-day medical deferral status
  const verifiedDonation = donorProfile?.verifiedLastDonationDate
    ? new Date(donorProfile.verifiedLastDonationDate)
    : null;
  const daysSinceVerified = verifiedDonation
    ? Math.floor((Date.now() - verifiedDonation.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const isDeferred = daysSinceVerified !== null && daysSinceVerified < 90;

  return (
    <div className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <Link href="/" className="hover:underline">Home</Link>
            <span>/</span>
            <span className="font-semibold text-slate-800">My Profile</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <span>User Profile & Consent</span>
            {donorProfile && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-[#B91C32] border border-red-200">
                {donorProfile.bloodGroup.replace('_POS', '+').replace('_NEG', '-')} Donor
              </span>
            )}
          </h1>
        </div>

        <button
          onClick={() => {
            setIsEditing(!isEditing);
            setSaveError(null);
            setSaveSuccess(null);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] text-white text-xs font-bold transition-colors cursor-pointer shadow-xs self-start sm:self-auto"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          <span>{isEditing ? 'Cancel Edit' : 'Edit Profile'}</span>
        </button>
      </div>

      {saveSuccess && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {saveSuccess}
        </div>
      )}

      {/* Edit Form Modal/Drawer */}
      {isEditing && (
        <div className="mb-8 p-6 bg-white rounded-2xl border-2 border-red-200 shadow-md">
          <h2 className="text-lg font-bold text-slate-900 mb-1">Edit Profile Information</h2>
          <p className="text-xs text-slate-500 mb-4">
            Update your public display name, local district and availability. To change your registered contact number, an OTP verification step is required to protect your verified identity.
          </p>

          {saveError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-[#B91C32] font-semibold">
              {saveError}
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Full Name / Display Name
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B91C32]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Registered Contact Number
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    disabled
                    value={formatPhoneNumber(user.phoneNumber)}
                    className="w-full px-3 py-2 text-sm text-slate-500 bg-slate-100 border border-slate-200 rounded-lg cursor-not-allowed font-mono"
                  />
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg whitespace-nowrap">
                    Verified OTP
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Protected: Phone number cannot be changed silently without verification.
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  District
                </label>
                <select
                  value={editDistrictCode}
                  onChange={(e) => setEditDistrictCode(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B91C32] bg-white"
                >
                  {stateDistricts.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.name} ({d.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  City / Locality
                </label>
                <input
                  type="text"
                  placeholder="e.g. Shivaji Nagar, Kothrud, Bandra West"
                  value={editLocality}
                  onChange={(e) => setEditLocality(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B91C32]"
                />
              </div>
            </div>

            {donorProfile && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIsAvailable}
                    onChange={(e) => setEditIsAvailable(e.target.checked)}
                    className="w-4 h-4 text-[#B91C32] rounded border-slate-300 focus:ring-[#B91C32]"
                  />
                  <span className="text-xs font-semibold text-slate-800">
                    Currently Available for Blood Donation Coordination
                  </span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editIsSearchable}
                    onChange={(e) => setEditIsSearchable(e.target.checked)}
                    className="w-4 h-4 text-[#B91C32] rounded border-slate-300 focus:ring-[#B91C32]"
                  />
                  <span className="text-xs font-semibold text-slate-800">
                    Active Search Participation Consent (Searchable by Patients)
                  </span>
                </label>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                {saving ? 'Saving Changes...' : 'Save Profile Changes'}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Essential User Card */}
        <div className="lg:col-span-1 space-y-6">
          {/* User ID Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-200 text-[#B91C32] font-black text-xl flex items-center justify-center">
                {(donorProfile?.fullName || user.name || user.phoneNumber).charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 leading-tight">
                  {donorProfile?.fullName || user.name || 'Voluntary User'}
                </h2>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span className="text-xs font-semibold text-slate-600 font-mono">{formatPhoneNumber(user.phoneNumber)}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2.5 pt-4 border-t border-slate-100 text-xs text-slate-600">
              <div className="flex justify-between">
                <span className="text-slate-400">Account ID:</span>
                <span className="font-mono font-medium text-slate-700">{user.id.slice(0, 10)}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Auth Status:</span>
                <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  {user.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Member Since:</span>
                <span className="font-medium text-slate-700">
                  {new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>
          </div>

          {/* Activity Statistics Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
              Coordination Activity
            </h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-lg font-black text-slate-900">{stats.totalRequestsCreated}</div>
                <div className="text-[10px] text-slate-500 font-medium mt-0.5">Requests</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-lg font-black text-slate-900">{stats.totalResponsesSubmitted}</div>
                <div className="text-[10px] text-slate-500 font-medium mt-0.5">Invites</div>
              </div>
              <div className="p-3 rounded-xl bg-red-50 border border-red-100">
                <div className="text-lg font-black text-[#B91C32]">{stats.acceptedResponsesCount}</div>
                <div className="text-[10px] text-slate-600 font-medium mt-0.5">Accepted</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Donor Profile Details */}
        <div className="lg:col-span-2 space-y-6">
          {donorProfile ? (
            <>
              {/* Clinical Donor Status Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#B91C32]"></span>
                    Donor Status & Blood Group
                  </h3>
                  <div className="flex items-center gap-2">
                    {(donorProfile.donationCount ?? 0) > 0 && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 flex items-center gap-1 shadow-xs">
                        <span>🩸</span> Blood Donor ({donorProfile.donationCount} {donorProfile.donationCount === 1 ? 'Donation' : 'Donations'})
                      </span>
                    )}
                    <span className="px-3 py-1 rounded-full text-xs font-black bg-red-50 text-[#B91C32] border border-red-200">
                      Group {donorProfile.bloodGroup.replace('_POS', ' +ve').replace('_NEG', ' -ve')}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-slate-400 block mb-1">Availability Status</span>
                    {donorProfile.eligibility?.status === 'TEMPORARILY_INELIGIBLE' ? (
                      <span className="font-bold flex items-center gap-1.5 text-amber-700">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                        Status: Temporarily Unavailable (90-day recovery)
                      </span>
                    ) : (
                      <span className={`font-bold flex items-center gap-1.5 ${donorProfile.isAvailable ? 'text-emerald-700' : 'text-slate-500'}`}>
                        <span className={`w-2 h-2 rounded-full ${donorProfile.isAvailable ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                        {donorProfile.isAvailable ? 'Available for Donation' : 'Currently Unavailable'}
                      </span>
                    )}
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-slate-400 block mb-1">Search Consent</span>
                    <span className={`font-bold flex items-center gap-1.5 ${donorProfile.isSearchable && !donorProfile.consentWithdrawnAt ? 'text-emerald-700' : 'text-amber-700'}`}>
                      <span className={`w-2 h-2 rounded-full ${donorProfile.isSearchable && !donorProfile.consentWithdrawnAt ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                      {donorProfile.isSearchable && !donorProfile.consentWithdrawnAt ? 'Active & Consented' : 'Search Consent Withdrawn'}
                    </span>
                  </div>
                </div>

                {/* Medical Eligibility & Last Donation Status */}
                <div className="mt-4 p-4 rounded-xl bg-slate-50/80 border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-700">Donation History & Clinical Deferral</span>
                    {isDeferred ? (
                      <span className="text-[11px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2.5 py-0.5 rounded-full">
                        Deferred ({90 - (daysSinceVerified || 0)} days remaining)
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded-full">
                        Eligible for Whole Blood
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 block">Verified Last Donation:</span>
                      <span className="font-semibold text-slate-800">
                        {donorProfile.verifiedLastDonationDate
                          ? new Date(donorProfile.verifiedLastDonationDate).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })
                          : 'No clinical verified donation recorded'}
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-400 block">Self-Reported Last Donation:</span>
                      <span className="font-semibold text-slate-800">
                        {donorProfile.lastDonationDate
                          ? new Date(donorProfile.lastDonationDate).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })
                          : 'None reported'}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 mt-2.5 leading-relaxed">
                    <strong>Rule:</strong> Future matching eligibility uses verified donation records confirmed by blood centre staff. Unverified patient reports do not automatically defer donors. Clinical clearance is confirmed at the facility.
                  </p>
                </div>
              </div>

              {/* Geographic Coordination Details */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 pb-3 border-b border-slate-100 flex items-center gap-2">
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Location & Preferred Blood Centres
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-slate-400 block mb-0.5">State</span>
                    <span className="font-bold text-slate-900">{getStateName(donorProfile.stateCode)}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-slate-400 block mb-0.5">District</span>
                    <span className="font-bold text-slate-900">
                      {getDistrictName(donorProfile.stateCode, donorProfile.districtCode)} ({donorProfile.districtCode})
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-slate-400 block mb-0.5">Locality / City</span>
                    <span className="font-bold text-slate-900">
                      {donorProfile.cityOrLocality || 'Not specified'}
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-700 mb-2">Primary Blood Centre:</h4>
                  <div className="p-3 rounded-xl bg-red-50/60 border border-red-100 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        {donorProfile.primaryCentre?.hospitalName || donorProfile.primaryHospitalCode}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {donorProfile.primaryCentre?.address || 'Designated Facility'}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold bg-[#B91C32] text-white px-2 py-0.5 rounded-full">
                      Primary
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Unregistered Donor Prompt */
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-xs">
              <div className="w-12 h-12 rounded-2xl bg-red-50 text-[#B91C32] flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
                  <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Become a Voluntary Donor</h3>
              <p className="text-xs text-slate-600 max-w-md mx-auto mb-4 leading-relaxed">
                You have an authenticated RaktaSetu account. Complete voluntary donor registration to set your blood group, preferred blood centres, and receive direct match invitations.
              </p>
              <Link
                href="/donor-registration"
                className="inline-block px-5 py-2.5 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] text-white text-xs font-bold transition-colors shadow-xs"
              >
                Complete Donor Registration
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
