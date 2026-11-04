'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { notifyAuthChange } from '../../components/Header';
import { isValidIndianMobile, formatPhoneNumber } from '../../config/phone';

interface OrgMembership {
  membershipId: string;
  organisationId: string;
  orgCode: string;
  organisationName: string;
  role: string;
  status: string;
  isActive: boolean;
}

export default function OrganisationLoginPage() {
  const router = useRouter();
  const [officerPhone, setOfficerPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'creds' | 'otp' | 'no_membership'>('creds');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<OrgMembership[]>([]);
  const [userApplication, setUserApplication] = useState<any>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

  const handleUseDemoOtp = () => {
    setOtp('123456');
  };

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!officerPhone.trim()) {
      setError('Please provide your registered mobile number.');
      return;
    }

    if (!isValidIndianMobile(officerPhone)) {
      setError('Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    setStep('otp');
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!otp.trim()) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);

    try {
      // 1. Authenticate with real API
      const authRes = await fetch(`${apiUrl}/auth/demo-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: officerPhone.trim(),
          otp: otp.trim(),
        }),
      });

      const authData = await authRes.json();
      if (!authRes.ok || !authData.success) {
        throw new Error(authData.error?.message || 'Authentication failed. Please check your credentials.');
      }

      const token = authData.data.token;
      localStorage.setItem('raktasetu_user', JSON.stringify(authData.data.user));
      localStorage.setItem('raktasetu_token', token);
      notifyAuthChange();

      // 2. Fetch active organisation memberships
      const memRes = await fetch(`${apiUrl}/organisations/me/memberships`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!memRes.ok) {
        throw new Error('Failed to retrieve institutional staff memberships.');
      }

      const memData = await memRes.json();
      const activeMemberships: OrgMembership[] = memData.data || [];

      if (authData.data.user?.role === 'ADMIN') {
        router.push('/organisation/portal?tab=applications');
        return;
      }

      if (activeMemberships.length === 0) {
        let userApp: any = null;
        try {
          const appRes = await fetch(`${apiUrl}/organisations/me/applications`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (appRes.ok) {
            const appData = await appRes.json();
            if (appData.data && appData.data.length > 0) {
              userApp = appData.data[0];
            }
          }
        } catch {
          // ignore error fetching applications
        }
        setUserApplication(userApp);
        setMemberships([]);
        setStep('no_membership');
        return;
      }

      setMemberships(activeMemberships);
      // Route directly to organisation portal with active membership
      router.push('/organisation/portal');
    } catch (err: any) {
      setError(err.message || 'Error completing organisation login.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 bg-slate-50 min-h-screen py-12 px-4 sm:px-6">
      <div className="max-w-md mx-auto">
        {/* Breadcrumb Navigation */}
        <div className="mb-6">
          <nav className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <Link href="/" className="hover:text-[#B91C32]">Home</Link>
            <span>/</span>
            <span className="text-slate-800 font-semibold">Organisation Login</span>
          </nav>
        </div>

        {/* Institutional Login Card */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-red-100 text-[#B91C32] flex items-center justify-center font-bold mb-4 mx-auto shadow-xs">
            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z" />
            </svg>
          </div>

          <h1 className="text-xl font-bold text-center text-slate-900 mb-1.5">
            Blood Centre Staff &amp; Officer Login
          </h1>
          <p className="text-xs text-center text-slate-600 mb-6 leading-relaxed">
            Institutional access for Medical Officers, Laboratory Technicians, Inventory Staff, and Transfusion Coordinators.
          </p>

          {/* Prototype Demo Banner */}
          <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 mb-6 space-y-1">
            <div className="font-semibold flex items-center gap-1.5 text-amber-800">
              <span>⚠️ Demo Verification Flow:</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Enter your registered mobile number. For authentication in this prototype, enter or click <strong>Use Code 123456</strong>.
            </p>
          </div>

          {error && (
            <div className="p-3.5 bg-red-50 text-red-800 text-xs rounded-xl border border-red-200 mb-5">
              <strong>Authentication Error: </strong> {error}
            </div>
          )}

          {step === 'no_membership' ? (
            userApplication && (userApplication.status === 'SUBMITTED' || userApplication.status === 'UNDER_REVIEW') ? (
              <div className="p-5 rounded-2xl bg-amber-50/90 border border-amber-200 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-800 mx-auto flex items-center justify-center font-bold text-base">
                  ⏳
                </div>
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-900 uppercase tracking-wider">
                  Application Under Review
                </span>
                <h2 className="text-sm font-bold text-amber-900">{userApplication.hospitalName}</h2>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Your institutional onboarding application (License: <strong className="font-mono">{userApplication.licenseNumber}</strong>)
                  was received and is currently under review by the Platform Administrator for CDSCO compliance.
                </p>
                <div className="p-3 bg-white rounded-xl border border-amber-200 text-[11px] text-slate-600 text-left space-y-1">
                  <strong>Status &amp; Next Steps:</strong>
                  <p>• District: {userApplication.districtName || userApplication.districtCode} (State: {userApplication.stateCode})</p>
                  <p>• Contact Registered: {userApplication.contactPerson} ({formatPhoneNumber(officerPhone)})</p>
                  <p>• Once approved by the National Blood Transfusion Council, your mobile will automatically be activated as <strong>Blood Bank Administrator (ORG_ADMIN)</strong>.</p>
                </div>
                <div className="pt-2 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => { setStep('creds'); setOtp(''); }}
                    className="w-full py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
                  >
                    Return to Login
                  </button>
                </div>
              </div>
            ) : userApplication && userApplication.status === 'RETURNED_FOR_CORRECTION' ? (
              <div className="p-5 rounded-2xl bg-blue-50/90 border border-blue-200 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-800 mx-auto flex items-center justify-center font-bold text-base">
                  ✍️
                </div>
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-200 text-blue-900 uppercase tracking-wider">
                  Action Required: Returned for Correction
                </span>
                <h2 className="text-sm font-bold text-blue-900">{userApplication.hospitalName}</h2>
                <p className="text-xs text-blue-800 leading-relaxed">
                  The Platform Administrator reviewed your application and requested revisions before approval:
                </p>
                {userApplication.reviewNotes && (
                  <div className="p-3 bg-white rounded-xl border border-blue-200 text-xs text-slate-700 text-left italic">
                    "{userApplication.reviewNotes}"
                  </div>
                )}
                <div className="pt-2 flex flex-col gap-2">
                  <Link
                    href="/organisation/register-bank"
                    className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors text-center"
                  >
                    Update &amp; Re-submit Application
                  </Link>
                  <button
                    type="button"
                    onClick={() => { setStep('creds'); setOtp(''); }}
                    className="w-full py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
                  >
                    Return to Login
                  </button>
                </div>
              </div>
            ) : userApplication && userApplication.status === 'REJECTED' ? (
              <div className="p-5 rounded-2xl bg-red-50/90 border border-red-200 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-red-100 text-red-800 mx-auto flex items-center justify-center font-bold text-base">
                  ✕
                </div>
                <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-200 text-red-900 uppercase tracking-wider">
                  Application Rejected
                </span>
                <h2 className="text-sm font-bold text-red-900">{userApplication.hospitalName}</h2>
                <p className="text-xs text-red-800 leading-relaxed">
                  Your onboarding application could not be verified under National Blood Centre standards.
                </p>
                {userApplication.reviewNotes && (
                  <div className="p-3 bg-white rounded-xl border border-red-200 text-xs text-slate-700 text-left italic">
                    "{userApplication.reviewNotes}"
                  </div>
                )}
                <div className="pt-2 flex flex-col gap-2">
                  <Link
                    href="/organisation/register-bank"
                    className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors text-center"
                  >
                    Submit New Application
                  </Link>
                  <button
                    type="button"
                    onClick={() => { setStep('creds'); setOtp(''); }}
                    className="w-full py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
                  >
                    Return to Login
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-5 rounded-2xl bg-amber-50/90 border border-amber-200 text-center space-y-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-800 mx-auto flex items-center justify-center font-bold text-base">
                  !
                </div>
                <h2 className="text-sm font-bold text-amber-900">No Active Blood Bank Memberships Found</h2>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Your mobile (<strong>{formatPhoneNumber(officerPhone)}</strong>) authenticated successfully, but is not currently linked
                  to an active, verified institutional blood bank.
                </p>
                <div className="p-3 bg-white rounded-xl border border-amber-200 text-[11px] text-slate-600 text-left space-y-1">
                  <strong>Next steps:</strong>
                  <p>• If you represent an accredited hospital or blood bank, apply to register below.</p>
                  <p>• If your facility is already verified, ask your Blood Bank Administrator (ORG_ADMIN) to send a staff invite to your mobile number.</p>
                </div>
                <div className="pt-2 flex flex-col gap-2">
                  <Link
                    href="/organisation/register-bank"
                    className="w-full py-2.5 rounded-xl bg-[#B91C32] text-white text-xs font-bold hover:bg-[#991B2B] transition-colors text-center"
                  >
                    Register Blood Bank Facility
                  </Link>
                  <button
                    type="button"
                    onClick={() => { setStep('creds'); setOtp(''); }}
                    className="w-full py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
                  >
                    Try Different Account Number
                  </button>
                </div>
              </div>
            )
          ) : step === 'creds' ? (
            <form onSubmit={handleSendOtp} className="space-y-4 text-xs sm:text-sm">
              <div>
                <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px] mb-1.5">
                  Medical Officer / Staff Registered Mobile *
                </label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 text-xs font-mono font-semibold bg-slate-100 text-slate-600 border border-r-0 border-slate-300 rounded-l-xl">
                    +91
                  </span>
                  <input
                    type="tel"
                    required
                    value={officerPhone}
                    onChange={(e) => setOfficerPhone(e.target.value)}
                    placeholder="10-digit mobile number"
                    className="w-full bg-slate-50 border border-slate-300 rounded-r-xl px-3.5 py-2.5 text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-[#B91C32] focus:bg-white"
                  />
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Must be registered as an institutional administrator or staff member.
                </span>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] text-white font-bold text-xs sm:text-sm transition-all shadow-xs cursor-pointer"
              >
                Proceed to Verification
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4 text-xs sm:text-sm">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                    Enter 6-Digit OTP Code *
                  </label>
                  <button
                    type="button"
                    onClick={handleUseDemoOtp}
                    className="text-[11px] font-bold text-[#B91C32] hover:underline"
                  >
                    Use Code 123456
                  </button>
                </div>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  className="w-full text-center font-mono tracking-widest text-lg bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#B91C32] focus:bg-white"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] text-white font-bold text-xs sm:text-sm transition-all shadow-xs cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Authenticating & Verifying Roles...' : 'Verify & Enter Institutional Portal'}
              </button>

              <button
                type="button"
                onClick={() => setStep('creds')}
                className="w-full text-center text-xs text-slate-500 hover:text-slate-800 py-1"
              >
                ← Change phone number
              </button>
            </form>
          )}

          <div className="mt-8 pt-5 border-t border-slate-100 text-center text-xs text-slate-500 space-y-2">
            <p>Need to register a hospital blood centre?</p>
            <Link
              href="/organisation/register-bank"
              className="text-[#B91C32] font-semibold hover:underline block"
            >
              Submit Blood Bank Onboarding Application →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
