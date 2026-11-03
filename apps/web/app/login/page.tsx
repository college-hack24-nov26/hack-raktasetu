'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { notifyAuthChange } from '../components/Header';

export default function LoginPage() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

  const handleUseDemoOtp = () => {
    setOtp('123456');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${apiUrl}/auth/demo-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: phoneNumber.trim(),
          otp: otp.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Verification failed. Please check your inputs.');
      }

      // Store in localStorage for client UI state
      localStorage.setItem('raktasetu_user', JSON.stringify(data.data.user));
      localStorage.setItem('raktasetu_token', data.data.token);
      notifyAuthChange();

      // Redirect depending on donor profile status
      if (data.data.user.hasDonorProfile) {
        router.push('/donor-dashboard');
      } else {
        router.push('/donor-registration');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-6 bg-slate-50/50 min-h-[70vh]">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 transition-shadow hover:shadow-md">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-[#B91C32] flex items-center justify-center mx-auto mb-3 border border-red-100">
            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Sign In with Phone</h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">Access your donor dashboard, patient requests, or register.</p>
        </div>

        {/* Demo Mode Notice Banner */}
        <div className="mb-6 p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 leading-relaxed">
          <div className="font-semibold flex items-center gap-1.5 mb-1 text-amber-800">
            <svg className="w-4 h-4 fill-current text-amber-600 shrink-0" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span>Demo-Only Verification Flow</span>
          </div>
          <p>
            Enter any 10-digit mobile number. For authentication in this prototype, click <strong>Use Code 123456</strong>.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            aria-live="polite"
            className="mb-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-[#B91C32] font-semibold flex items-start gap-2"
          >
            <svg className="w-4 h-4 text-[#B91C32] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-phone" className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
              Mobile Number
            </label>
            <div className="flex rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-[#B91C32] focus-within:border-transparent overflow-hidden">
              <span className="inline-flex items-center px-3.5 bg-slate-50 text-slate-600 text-sm border-r border-slate-200 font-semibold select-none">
                +91
              </span>
              <input
                id="login-phone"
                type="tel"
                required
                autoComplete="tel"
                maxLength={10}
                placeholder="9876543210"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                className="w-full px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:outline-none min-h-[44px]"
              />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">Enter 10-digit Indian mobile number</span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="login-otp" className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Verification Code (OTP)
              </label>
              <button
                type="button"
                onClick={handleUseDemoOtp}
                className="text-xs text-[#B91C32] hover:text-[#9B1324] font-bold underline cursor-pointer"
              >
                Use Code 123456
              </button>
            </div>
            <input
              id="login-otp"
              type="text"
              required
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              className="w-full px-3.5 py-2.5 text-sm font-mono font-bold tracking-widest text-center text-slate-900 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#B91C32] focus:border-transparent min-h-[44px]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] active:bg-[#851323] text-white font-bold text-sm transition-all disabled:opacity-50 cursor-pointer shadow-xs min-h-[44px] flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Verifying...</span>
              </>
            ) : (
              <span>Verify &amp; Continue</span>
            )}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-100 text-center text-xs sm:text-sm text-slate-600">
          <span>New donor? </span>
          <Link
            href="/donor-registration"
            className="font-bold text-[#B91C32] hover:text-[#9B1324] underline underline-offset-2"
          >
            Register as a Donor
          </Link>
        </div>
      </div>
    </div>
  );
}
