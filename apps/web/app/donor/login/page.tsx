'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authFetch } from '../../config/api';
import { notifyAuthChange } from '../../components/Header';

export default function DonorLoginPage() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Cooldown countdown
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim()) return;

    try {
      setLoading(true);
      setError(null);
      setSuccessMsg(null);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'}/donor/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phoneNumber.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to send OTP.');
      }

      setStep('OTP');
      setCooldown(data.data?.cooldownSeconds || 30);
      setSuccessMsg(data.data?.demoNotice || 'Verification code sent to your mobile number.');
    } catch (err: any) {
      setError(err.message || 'Error sending OTP. Please check mobile number format.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) return;

    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'}/donor/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phoneNumber.trim(), otp: otp.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Verification failed. Incorrect OTP.');
      }

      // Store token in localStorage
      if (data.data?.token) {
        localStorage.setItem('raktasetu_token', data.data.token);
        notifyAuthChange();
      }

      router.push('/donor/portal');
    } catch (err: any) {
      setError(err.message || 'Incorrect verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <Link href="/" className="inline-flex items-center gap-2 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-[#991b1b] flex items-center justify-center text-white shadow-xs">
            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
          </div>
          <span className="text-2xl font-extrabold text-slate-900 tracking-tight">RaktaSetu</span>
        </Link>
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
          Donor Mobile Login
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          Access your donor profile, registration progress, and printable registration certificates.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 shadow-xl rounded-3xl border border-slate-200 sm:px-10 space-y-6">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold">
              {successMsg}
            </div>
          )}

          {step === 'PHONE' ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Mobile Number (10 digits)
                </label>
                <div className="flex rounded-xl shadow-xs">
                  <span className="inline-flex items-center px-3.5 rounded-l-xl border border-r-0 border-slate-200 bg-slate-50 text-slate-500 text-xs font-bold">
                    +91
                  </span>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="9876543210"
                    maxLength={10}
                    className="flex-1 block w-full rounded-none rounded-r-xl border border-slate-200 px-3.5 py-2.5 text-xs font-semibold focus:outline-hidden focus:border-[#991b1b]"
                    required
                  />
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600">
                🔐 <strong>Secure Access:</strong> We will verify your identity via a one-time password (OTP). In demo mode, use code <strong className="text-slate-900 font-mono">123456</strong>.
              </div>

              <button
                type="submit"
                disabled={loading || !phoneNumber.trim()}
                className="w-full py-2.5 px-4 border border-transparent rounded-xl shadow-xs text-xs font-extrabold text-white bg-[#991b1b] hover:bg-[#7f1d1d] focus:outline-hidden disabled:opacity-50 transition-colors cursor-pointer"
              >
                {loading ? 'Sending OTP...' : 'Get Verification Code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-700">Enter 6-Digit OTP</label>
                  <button
                    type="button"
                    onClick={() => setStep('PHONE')}
                    className="text-[11px] font-bold text-[#991b1b] hover:underline cursor-pointer"
                  >
                    Change Phone
                  </button>
                </div>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  className="w-full text-center tracking-widest text-lg font-mono font-extrabold px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-[#991b1b]"
                  required
                />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Didn't receive code?</span>
                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={cooldown > 0}
                  className="font-bold text-[#991b1b] disabled:text-slate-400 disabled:cursor-not-allowed hover:underline cursor-pointer"
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading || otp.length < 4}
                className="w-full py-2.5 px-4 border border-transparent rounded-xl shadow-xs text-xs font-extrabold text-white bg-[#991b1b] hover:bg-[#7f1d1d] focus:outline-hidden disabled:opacity-50 transition-colors cursor-pointer"
              >
                {loading ? 'Verifying...' : 'Verify & Enter Donor Portal'}
              </button>
            </form>
          )}

          <div className="pt-4 border-t border-slate-100 text-center">
            <Link href="/" className="text-xs font-bold text-slate-500 hover:text-slate-800">
              ← Back to RaktaSetu Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
