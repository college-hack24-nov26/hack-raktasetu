'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authFetch, getAuthToken } from '../../config/api';
import { notifyAuthChange } from '../../components/Header';

export default function DonorPortalPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDonorData = async () => {
      try {
        setLoading(true);
        // Verify session
        const meRes = await authFetch('/api/v1/auth/me');
        if (!meRes.ok) {
          router.push('/donor/login');
          return;
        }

        const meData = await meRes.json();
        setUser(meData.data?.user);

        // Fetch registrations
        const regRes = await authFetch('/api/v1/donor/my-registrations');
        if (regRes.ok) {
          const regData = await regRes.json();
          setRegistrations(regData.data || []);
        }
      } catch (err: any) {
        setError(err.message || 'Error loading donor account.');
      } finally {
        setLoading(false);
      }
    };

    loadDonorData();
  }, [router]);

  const handleDownloadPdf = async (regId: string) => {
    try {
      const res = await authFetch(`/api/v1/donor-registration/${regId}/pdf`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || 'Failed to download donor registration PDF');
      }
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `donor-registration-${regId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10000);
    } catch (err: any) {
      setError(err.message || 'Could not download PDF.');
    }
  };

  const handleSignOut = async () => {
    try {
      await authFetch('/api/v1/auth/logout', { method: 'POST' });
    } catch {}
    localStorage.removeItem('raktasetu_token');
    notifyAuthChange();
    router.push('/donor/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-slate-300 border-t-[#B91C32] rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold text-slate-600">Loading Donor Portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-20">
      {/* Top Application Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 sm:px-8 py-3.5 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm transition-colors"
            >
              ←
            </Link>
            <div>
              <span className="text-[10px] font-extrabold tracking-wider uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                Donor Self-Service Portal
              </span>
              <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">
                Welcome, {user?.name || user?.phoneNumber || 'Donor'}
              </h1>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-8">
        {/* Profile Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-[#991b1b] text-white flex items-center justify-center text-2xl font-bold shadow-xs shrink-0">
              {user?.name ? user.name.charAt(0).toUpperCase() : '🩸'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold text-slate-900">{user?.name || 'Registered Donor'}</h2>
                <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                  +91 {user?.phoneNumber?.slice(-10)}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Voluntary Blood Donor • Thank you for saving lives!
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/camps"
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors"
            >
              Find Blood Camps
            </Link>
            <Link
              href="/find-blood"
              className="px-4 py-2 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 text-xs font-bold rounded-xl transition-colors"
            >
              Check Availability
            </Link>
          </div>
        </div>

        {/* Registrations List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 tracking-tight">
                My Blood Donation Registrations
              </h3>
              <p className="text-xs text-slate-500">
                Official registration episodes, status, and printable A4 certificates.
              </p>
            </div>
            <span className="text-xs font-bold bg-slate-200 text-slate-700 px-2.5 py-1 rounded-full">
              {registrations.length} Records
            </span>
          </div>

          {registrations.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center space-y-3 shadow-xs">
              <span className="text-3xl text-slate-300 block">📄</span>
              <p className="text-xs font-bold text-slate-600">No donation registrations found for your account.</p>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                When you visit an authorized blood camp or blood centre, the camp coordinator registers your details and they will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {registrations.map((reg) => (
                <div
                  key={reg.id}
                  className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold bg-slate-100 text-slate-800 px-2.5 py-1 rounded-lg">
                        {reg.registrationNumber}
                      </span>
                      <span
                        className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${
                          reg.workflowStatus === 'COMPLETED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : reg.workflowStatus === 'DEFERRED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        ● {reg.workflowStatus}
                      </span>
                    </div>

                    <h4 className="text-sm font-extrabold text-slate-900">
                      {reg.campTitle || reg.organisationName || 'RaktaSetu Blood Centre'}
                    </h4>

                    <div className="text-xs text-slate-600 space-y-1">
                      <p><strong>Date:</strong> {new Date(reg.createdAt).toLocaleDateString('en-IN')}</p>
                      <p><strong>Type:</strong> {reg.donationType} ({reg.registrationSource})</p>
                      <p><strong>Screening Status:</strong> <span className="font-bold">{reg.screeningStatus || 'PENDING'}</span></p>
                      <p><strong>Collection Status:</strong> <span className="font-bold">{reg.collectionStatus || 'NOT_COLLECTED'}</span></p>
                      {reg.barcode && (
                        <p className="font-mono text-[11px] text-indigo-700"><strong>Barcode:</strong> {reg.barcode}</p>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">
                      {reg.isCompleted ? '✓ Clinically recorded' : 'Draft in progress'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDownloadPdf(reg.id)}
                      className="px-4 py-2 bg-[#991b1b] hover:bg-[#7f1d1d] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                    >
                      <span>📄</span>
                      <span>Download Official PDF</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
