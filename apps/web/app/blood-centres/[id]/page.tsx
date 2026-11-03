'use client';

import { use, useEffect, useState, Suspense } from 'react';
import Link from 'next/link';

interface BloodAvailabilitySnapshot {
  id: string;
  component: string;
  bloodGroup?: string | null;
  rawStockString?: string | null;
  reportedQuantity: number | null;
  quantityUnit?: string | null;
  sourceEntryDate?: string | null;
  retrievedAt: string;
  isStale: boolean;
}

interface BloodCentreDetail {
  hospitalCode: string;
  hospitalName: string;
  mobileNo?: string | null;
  hasValidContact: boolean;
  address?: string | null;
  stateCode: number;
  districtCode?: number | null;
  lastFetchedAt?: string | null;
  snapshots?: BloodAvailabilitySnapshot[];
}

function BloodCentreDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const hospitalCode = resolvedParams.id;

  const [centre, setCentre] = useState<BloodCentreDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

  useEffect(() => {
    async function fetchCentre() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiUrl}/blood-centres/${hospitalCode}`);
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error?.message || 'Failed to fetch blood centre details');
        }
        setCentre(data.data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchCentre();
  }, [hospitalCode]);

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'Not recorded';
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
      <div className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-12">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 rounded w-1/4"></div>
          <div className="h-8 bg-slate-200 rounded w-2/3"></div>
          <div className="h-4 bg-slate-100 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error || !centre) {
    return (
      <div className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-12">
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-red-50 text-[#B91C32] mx-auto flex items-center justify-center mb-3 font-bold">
            !
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Blood Centre Not Found</h2>
          <p className="text-sm text-slate-600 mb-6">{error || 'Unable to load details for this blood centre.'}</p>
          <Link
            href="/find-blood"
            className="px-5 py-2.5 rounded-xl bg-[#B91C32] text-white font-semibold text-sm hover:bg-[#9B1324] transition-colors"
          >
            Return to Blood Search
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-8">
      {/* Breadcrumb navigation */}
      <div className="mb-6 flex items-center gap-2 text-xs text-slate-500 font-medium">
        <Link href="/find-blood" className="hover:text-slate-800 transition-colors">
          Blood Search
        </Link>
        <span>/</span>
        <span className="text-slate-900 truncate">Centre #{centre.hospitalCode}</span>
      </div>

      {/* Main Centre Profile Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-8 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-red-50 text-[#B91C32] border border-red-200">
                Hospital Code #{centre.hospitalCode}
              </span>
              <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-slate-50 text-slate-600 border border-slate-200">
                State {centre.stateCode} / District {centre.districtCode || 'Unassigned'}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {centre.hospitalName}
            </h1>
            <p className="text-sm text-slate-600 mt-2 max-w-xl leading-relaxed">
              {centre.address || 'Standard facility address not listed in public directory.'}
            </p>
          </div>

          <Link
            href={`/requests/new?hospitalCode=${centre.hospitalCode}&hospitalName=${encodeURIComponent(centre.hospitalName)}`}
            className="px-5 py-2.5 rounded-xl bg-[#B91C32] hover:bg-[#9B1324] active:bg-[#851323] text-white font-semibold text-sm transition-colors text-center shadow-sm shrink-0"
          >
            Initiate Request Here
          </Link>
        </div>

        {/* Contact Info & Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Contact Telephone
            </div>
            {centre.hasValidContact ? (
              <a
                href={`tel:${centre.mobileNo}`}
                className="text-base font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-2"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 4V3z" />
                </svg>
                <span>{centre.mobileNo}</span>
              </a>
            ) : (
              <span className="text-slate-500 italic">No public telephone recorded in directory</span>
            )}
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Directory Sync
            </div>
            <div className="text-xs text-slate-600">
              Last Synced: {formatDate(centre.lastFetchedAt)}
            </div>
          </div>
        </div>
      </div>

      {/* Availability Snapshot History */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Availability Snapshot History
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Time-stamped external observations recorded by RaktaSetu for this centre.
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
            {centre.snapshots?.length || 0} recorded
          </span>
        </div>

        {centre.snapshots && centre.snapshots.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {centre.snapshots.map((snap) => (
              <div key={snap.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-slate-900">
                      {snap.component}
                    </span>
                    {snap.bloodGroup && (
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-800">
                        {snap.bloodGroup}
                      </span>
                    )}
                    {snap.isStale && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">
                        Stale
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    Source Entry Timestamp: <strong>{formatDate(snap.sourceEntryDate)}</strong> • Retrieved:{' '}
                    {formatDate(snap.retrievedAt)}
                  </div>
                </div>

                <div className="text-right">
                  {snap.reportedQuantity !== null ? (
                    snap.reportedQuantity === 0 ? (
                      <div className="text-base font-extrabold text-rose-700">
                        0 units <span className="text-xs font-normal text-rose-600">(Out of Stock)</span>
                      </div>
                    ) : (
                      <div className="text-base font-extrabold text-slate-900">
                        {snap.reportedQuantity} units
                      </div>
                    )
                  ) : (
                    <div className="text-xs text-slate-500 italic">
                      {snap.rawStockString || 'Stock unverified online'}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-slate-500 text-sm">
            No availability observations recorded for this centre yet.
          </div>
        )}
      </div>
    </div>
  );
}

export default function BloodCentreDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-12">
          <div className="bg-white rounded-2xl border border-slate-200 p-8 animate-pulse space-y-4">
            <div className="h-6 bg-slate-200 rounded w-1/4"></div>
            <div className="h-8 bg-slate-200 rounded w-2/3"></div>
            <div className="h-4 bg-slate-100 rounded w-1/2"></div>
          </div>
        </div>
      }
    >
      <BloodCentreDetailContent params={params} />
    </Suspense>
  );
}
