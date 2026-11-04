'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { notifyAuthChange } from '../components/Header';
import {
  STATES_AND_DISTRICTS,
  DEFAULT_STATE_CODE,
  DEFAULT_DISTRICT_CODE,
  getDistrictsForState,
} from '../config/geography';

interface BloodCentreOption {
  hospitalCode: string;
  hospitalName: string;
  districtCode: number;
  isParticipatingCentre?: boolean;
  sourceType?: 'INTERNAL' | 'EXTERNAL';
  sourceLabel?: string;
}

const BLOOD_GROUPS = [
  { label: 'A+', value: 'A_POS' },
  { label: 'A-', value: 'A_NEG' },
  { label: 'B+', value: 'B_POS' },
  { label: 'B-', value: 'B_NEG' },
  { label: 'AB+', value: 'AB_POS' },
  { label: 'AB-', value: 'AB_NEG' },
  { label: 'O+', value: 'O_POS' },
  { label: 'O-', value: 'O_NEG' },
];

export default function DonorRegistrationPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  // Form states
  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [bloodGroup, setBloodGroup] = useState('B_POS');
  const [stateCode, setStateCode] = useState(DEFAULT_STATE_CODE);
  const [districtCode, setDistrictCode] = useState(DEFAULT_DISTRICT_CODE);
  const [centreSource, setCentreSource] = useState<'internal' | 'external'>('internal');
  const [centres, setCentres] = useState<BloodCentreOption[]>([]);
  const [primaryCentre, setPrimaryCentre] = useState('');
  const [secondaryCentres, setSecondaryCentres] = useState<string[]>([]);
  const [lastDonationDate, setLastDonationDate] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [consentToSearch, setConsentToSearch] = useState(false);

  const [loadingCentres, setLoadingCentres] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableDistricts = getDistrictsForState(stateCode);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

  // Check auth
  useEffect(() => {
    const savedToken = localStorage.getItem('raktasetu_token');
    if (!savedToken) {
      router.push('/login');
    } else {
      setToken(savedToken);
    }
  }, [router]);

  // Handle state change
  const handleStateChange = (newStateCode: number) => {
    setStateCode(newStateCode);
    const districts = getDistrictsForState(newStateCode);
    if (districts.length > 0) {
      setDistrictCode(districts[0].code);
    }
  };

  // Fetch blood centres when state, district, or source changes
  useEffect(() => {
    async function loadCentres() {
      setLoadingCentres(true);
      try {
        const res = await fetch(
          `${apiUrl}/blood-centres?source=${centreSource}&stateCode=${stateCode}&districtCode=${districtCode}&limit=50`
        );
        const data = await res.json();
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          const seen = new Set<string>();
          const dedupedCentres = data.data.filter((c: any) => {
            const code = c?.hospitalCode;
            if (!code || seen.has(code)) return false;
            seen.add(code);
            return true;
          });
          setCentres(dedupedCentres);
          setPrimaryCentre(dedupedCentres[0]?.hospitalCode || '');
        } else {
          setCentres([]);
          setPrimaryCentre('');
        }
      } catch (e) {
        setCentres([]);
        setPrimaryCentre('');
      } finally {
        setLoadingCentres(false);
      }
    }
    loadCentres();
  }, [stateCode, districtCode, centreSource, apiUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (!consentToSearch) {
        throw new Error('You must explicitly provide consent to participate in voluntary donor searches.');
      }

      const res = await fetch(`${apiUrl}/donors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fullName: fullName.trim(),
          dateOfBirth,
          bloodGroup,
          stateCode,
          districtCode,
          primaryHospitalCode: primaryCentre,
          secondaryHospitalCodes: secondaryCentres,
          lastDonationDate: lastDonationDate ? lastDonationDate : undefined,
          isAvailable,
          consentToSearch,
          consentVersion: 'v1.0',
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to complete registration.');
      }

      // Update local storage
      const userStr = localStorage.getItem('raktasetu_user');
      if (userStr) {
        const u = JSON.parse(userStr);
        u.hasDonorProfile = true;
        u.name = fullName.trim();
        localStorage.setItem('raktasetu_user', JSON.stringify(u));
      }
      notifyAuthChange();

      router.push('/donor-dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 sm:py-10">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-8">
        <div className="border-b border-slate-200 pb-6 mb-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#B91C32] mb-1">
            <span>Voluntary Donor Network</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Register as a Blood Donor
          </h1>
          <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
            Join the community coordination network. Choose your state, district, and preferred blood centres with full consent control.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-[#B91C32] font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Personal Details */}
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-4 pb-2 border-b border-slate-200 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-800 text-xs flex items-center justify-center font-bold border border-slate-200">1</span>
              Personal Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Aarav Sharma"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-slate-900 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B91C32]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Date of Birth * (Must be 18–65)
                </label>
                <input
                  type="date"
                  required
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-slate-900 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B91C32]"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
                Blood Group *
              </label>
              <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                {BLOOD_GROUPS.map((bg) => (
                  <button
                    type="button"
                    key={bg.value}
                    onClick={() => setBloodGroup(bg.value)}
                    className={`py-2 px-3 rounded-lg text-sm font-bold border transition-colors cursor-pointer ${
                      bloodGroup === bg.value
                        ? 'bg-[#B91C32] text-white border-[#B91C32] shadow-sm'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {bg.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section 2: Preferred Centres */}
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-4 pb-2 border-b border-slate-200 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-800 text-xs flex items-center justify-center font-bold border border-slate-200">2</span>
              Preferred Blood Centres
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  State *
                </label>
                <select
                  value={stateCode}
                  onChange={(e) => handleStateChange(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm text-slate-900 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B91C32] bg-white"
                >
                  {STATES_AND_DISTRICTS.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  District *
                </label>
                <select
                  value={districtCode}
                  onChange={(e) => setDistrictCode(Number(e.target.value))}
                  disabled={availableDistricts.length === 0}
                  className="w-full px-3 py-2 text-sm text-slate-900 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B91C32] bg-white disabled:bg-slate-50"
                >
                  {availableDistricts.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Source Selection Buttons */}
            <div className="mb-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                Directory Source *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCentreSource('internal')}
                  className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                    centreSource === 'internal'
                      ? 'border-[#B91C32] bg-rose-50/50 ring-1 ring-[#B91C32]'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">🩸</span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">RaktaSetu Participating</div>
                      <div className="text-[10px] text-slate-500">Live system centres</div>
                    </div>
                  </div>
                  {centreSource === 'internal' && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#B91C32] text-white">Active</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setCentreSource('external')}
                  className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                    centreSource === 'external'
                      ? 'border-[#B91C32] bg-rose-50/50 ring-1 ring-[#B91C32]'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">🏛️</span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">e-RaktKosh Banks</div>
                      <div className="text-[10px] text-slate-500">National directory</div>
                    </div>
                  </div>
                  {centreSource === 'external' && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#B91C32] text-white">Active</span>
                  )}
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Primary Preferred Blood Centre *
                </label>
                <span className="text-[11px] text-slate-500">
                  {loadingCentres ? 'Loading...' : `${centres.length} centre${centres.length === 1 ? '' : 's'} available`}
                </span>
              </div>

              {centres.length > 0 ? (
                <select
                  required
                  disabled={loadingCentres}
                  value={primaryCentre}
                  onChange={(e) => setPrimaryCentre(e.target.value)}
                  className="w-full px-3 py-2 text-sm text-slate-900 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B91C32] bg-white disabled:bg-slate-100"
                >
                  {centres.map((c, idx) => (
                    <option key={`${c.hospitalCode}-${idx}`} value={c.hospitalCode}>
                      {c.isParticipatingCentre ? '✓ [RaktaSetu Verified] ' : '[e-RaktKosh] '}
                      {c.hospitalName} ({c.hospitalCode})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800 space-y-2">
                  <p>
                    No {centreSource === 'internal' ? 'participating RaktaSetu centres' : 'e-RaktKosh blood banks'} found for the selected district.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCentreSource(centreSource === 'internal' ? 'external' : 'internal')}
                    className="inline-flex items-center gap-1 font-semibold text-[#B91C32] underline hover:no-underline"
                  >
                    Switch to {centreSource === 'internal' ? 'e-RaktKosh Blood Banks' : 'RaktaSetu Participating Centres'}
                  </button>
                </div>
              )}
              <span className="text-[11px] text-slate-500 mt-1 block">
                Your preferred donation facility. Does not assign membership or change your donor role.
              </span>
            </div>
          </div>

          {/* Section 3: Readiness & Consent */}
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-4 pb-2 border-b border-slate-200 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-800 text-xs flex items-center justify-center font-bold border border-slate-200">3</span>
              Availability & Consent
            </h2>

            <div className="mb-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Last Donation Date (Optional)
              </label>
              <input
                type="date"
                value={lastDonationDate}
                onChange={(e) => setLastDonationDate(e.target.value)}
                className="w-full sm:w-1/2 px-3 py-2 text-sm text-slate-900 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#B91C32]"
              />
            </div>

            <div className="space-y-4 pt-2">
              <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
                <input
                  type="checkbox"
                  checked={isAvailable}
                  onChange={(e) => setIsAvailable(e.target.checked)}
                  className="w-4 h-4 mt-0.5 text-[#B91C32] rounded border-slate-300 focus:ring-[#B91C32]"
                />
                <div className="text-xs">
                  <span className="font-semibold text-slate-900 block">Available for Immediate Coordination</span>
                  <span className="text-slate-600">You can temporarily pause or unpause this at any time from your dashboard.</span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-4 rounded-xl border border-red-200 bg-red-50 cursor-pointer hover:bg-red-100/60 transition-colors">
                <input
                  type="checkbox"
                  required
                  checked={consentToSearch}
                  onChange={(e) => setConsentToSearch(e.target.checked)}
                  className="w-4 h-4 mt-0.5 text-[#B91C32] rounded border-red-300 focus:ring-[#B91C32]"
                />
                <div className="text-xs leading-relaxed text-slate-900">
                  <span className="font-semibold text-[#B91C32] block mb-1">Search Participation & Privacy Consent *</span>
                  I consent to being discoverable in voluntary donor coordination searches based on my blood group and preferred centres. I understand that an application match is a preliminary coordination lead, not medical clearance, and that clinical eligibility and compatibility must be confirmed by qualified blood bank personnel.
                </div>
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 px-6 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] active:bg-[#851323] text-white font-bold text-sm transition-all shadow-xs disabled:opacity-50 cursor-pointer min-h-[44px] flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Registering Profile...</span>
              </>
            ) : (
              <span>Complete Donor Registration</span>
            )}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-100 text-center text-xs sm:text-sm text-slate-600">
          <span>Already have an account? </span>
          <Link
            href="/login"
            className="font-bold text-[#B91C32] hover:text-[#9B1324] underline underline-offset-2"
          >
            Sign In with Phone
          </Link>
        </div>
      </div>
    </div>
  );
}
