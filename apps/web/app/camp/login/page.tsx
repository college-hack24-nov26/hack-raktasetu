'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { notifyAuthChange } from '../../components/Header';
import { isValidIndianMobile, formatPhoneNumber } from '../../config/phone';
import { authFetch, getAuthToken } from '../../config/api';

interface CampAssignment {
  campId: string;
  campCode: string;
  title: string;
  venue: string;
  targetDate: string;
  timeSlot?: string | null;
  status: string;
  isReadyForCollection: boolean;
  parentOrganisation?: {
    id: string;
    name: string;
    orgCode: string;
  } | null;
  role: 'CAMP_ADMIN' | 'CAMP_COORDINATOR' | 'CLINICAL_STAFF' | 'COLLECTION_STAFF';
  assignmentSource: string;
  assignedAt: string;
}

export default function CampLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'creds' | 'otp' | 'select_camp' | 'no_camp'>('creds');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignedCamps, setAssignedCamps] = useState<CampAssignment[]>([]);
  const [userPhone, setUserPhone] = useState<string>('');

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

  // Check if user already has an active session
  useEffect(() => {
    async function checkExistingSession() {
      const token = getAuthToken();
      if (!token) return;

      try {
        const res = await authFetch('/api/v1/camps/me/assignments');
        if (res.ok) {
          const data = await res.json();
          const camps: CampAssignment[] = data.data || [];
          if (camps.length === 1) {
            router.push(`/camp/dashboard?campId=${camps[0].campId}`);
          } else if (camps.length > 1) {
            setAssignedCamps(camps);
            setStep('select_camp');
          }
        }
      } catch {
        // Not authenticated or network issue; stay on login
      }
    }
    checkExistingSession();
  }, [router]);

  const handleUseDemoOtp = () => {
    setOtp('123456');
  };

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!phone.trim()) {
      setError('Please provide your registered mobile number.');
      return;
    }

    if (!isValidIndianMobile(phone)) {
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
      const authRes = await fetch(`${apiUrl}/auth/demo-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: phone.trim(),
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
      setUserPhone(phone.trim());

      // Fetch user's assigned camps
      const campsRes = await fetch(`${apiUrl}/camps/me/assignments`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!campsRes.ok) {
        throw new Error('Failed to retrieve assigned camp workspaces.');
      }

      const campsData = await campsRes.json();
      const camps: CampAssignment[] = campsData.data || [];
      setAssignedCamps(camps);

      if (camps.length === 1) {
        router.push(`/camp/dashboard?campId=${camps[0].campId}`);
      } else if (camps.length > 1) {
        setStep('select_camp');
      } else {
        setStep('no_camp');
      }
    } catch (err: any) {
      setError(err.message || 'Error authenticating camp session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-slate-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-2">
          <span className="text-4xl">🏕️</span>
        </div>
        <h2 className="text-center text-2xl font-black text-slate-900 tracking-tight">
          Camp Operations Portal
        </h2>
        <p className="mt-1.5 text-center text-xs text-slate-500">
          Dedicated, role-tailored workspace for camp coordinators, collection teams, and clinical screening staff.
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl border border-slate-200 sm:px-10">
          {error && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-start gap-2">
              <span className="font-bold">⚠</span>
              <span>{error}</span>
            </div>
          )}

          {step === 'creds' && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Registered Mobile Number
                </label>
                <div className="relative rounded-xl shadow-2xs">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 font-bold text-xs pointer-events-none">
                    +91
                  </span>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="9876543210"
                    className="w-full pl-12 pr-3 py-2.5 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-[#B91C32] focus:border-transparent font-medium"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Enter the 10-digit mobile number assigned by your parent blood bank.
                </p>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-[#B91C32] hover:bg-[#9B1324] text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                Continue to Verify
              </button>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <Link href="/organisation/login" className="hover:text-slate-900 transition-colors">
                  ← Blood Bank Login
                </Link>
                <Link href="/organisation/register-camp" className="hover:text-slate-900 font-semibold transition-colors">
                  Propose New Camp
                </Link>
              </div>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={handleVerify} className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex justify-between items-center">
                <span className="text-slate-600">
                  Verifying: <strong>{formatPhoneNumber(phone)}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setStep('creds')}
                  className="text-[#B91C32] font-semibold hover:underline"
                >
                  Change
                </button>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    6-Digit Verification Code
                  </label>
                  <button
                    type="button"
                    onClick={handleUseDemoOtp}
                    className="text-[11px] text-[#B91C32] font-bold hover:underline"
                  >
                    Auto-fill (123456)
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  maxLength={6}
                  className="w-full tracking-widest text-center py-2.5 text-base font-mono rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-[#B91C32] focus:border-transparent font-bold"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-[#B91C32] hover:bg-[#9B1324] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
              >
                {loading ? 'Verifying Camp Assignments...' : 'Sign In to Camp Workspace'}
              </button>
            </form>
          )}

          {step === 'select_camp' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Select Active Camp</h3>
                <p className="text-xs text-slate-500">
                  You are assigned to multiple camps. Choose which operational console to open:
                </p>
              </div>

              <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
                {assignedCamps.map((camp) => (
                  <div
                    key={camp.campId}
                    onClick={() => router.push(`/camp/dashboard?campId=${camp.campId}`)}
                    className="p-4 rounded-xl border border-slate-200 hover:border-[#B91C32] hover:shadow-xs transition-all cursor-pointer bg-slate-50/60 hover:bg-white"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-mono text-[10px] font-bold bg-slate-200/80 text-slate-800 px-2 py-0.5 rounded">
                        {camp.campCode}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        camp.role === 'CAMP_ADMIN' ? 'bg-purple-100 text-purple-800' :
                        camp.role === 'CAMP_COORDINATOR' ? 'bg-indigo-100 text-indigo-800' :
                        camp.role === 'CLINICAL_STAFF' ? 'bg-emerald-100 text-emerald-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {camp.role === 'CAMP_ADMIN' ? '👑 Camp Admin' : camp.role}
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-slate-900">{camp.title}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      📍 {camp.venue} | 📅 {new Date(camp.targetDate).toLocaleDateString()}
                    </p>

                    {camp.parentOrganisation && (
                      <p className="text-[11px] text-slate-600 mt-2 pt-2 border-t border-slate-200/60">
                        Parent Bank: <strong>{camp.parentOrganisation.name}</strong> ({camp.parentOrganisation.orgCode})
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 'no_camp' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto text-amber-700 text-xl font-bold">
                !
              </div>
              <h3 className="text-base font-bold text-slate-900">
                No Active Camp Assignment Found
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
                Your mobile number (<strong>{formatPhoneNumber(userPhone)}</strong>) is authenticated, but you have not yet been assigned to an active blood donation camp.
              </p>
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-left text-xs text-amber-900 space-y-1.5">
                <p className="font-bold">How to obtain access:</p>
                <p>1. Contact the coordinating <strong>Parent Blood Bank Administrator</strong>.</p>
                <p>2. Ask them to assign your mobile number as <strong>Camp Coordinator</strong>, <strong>Clinical Staff</strong>, or <strong>Collection Staff</strong> under their approved camp.</p>
                <p>3. Once assigned, return here to open your camp console immediately.</p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row gap-2 justify-center text-xs">
                <Link
                  href="/organisation/portal"
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold"
                >
                  Blood Bank Portal
                </Link>
                <button
                  onClick={() => {
                    localStorage.removeItem('raktasetu_token');
                    localStorage.removeItem('raktasetu_user');
                    notifyAuthChange();
                    setStep('creds');
                  }}
                  className="px-4 py-2 bg-slate-900 hover:bg-black text-white rounded-xl font-bold cursor-pointer"
                >
                  Sign In with Another Mobile
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
