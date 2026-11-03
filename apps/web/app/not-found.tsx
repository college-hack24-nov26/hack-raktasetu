'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-6 bg-slate-50/60 min-h-[60vh]">
      <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-10 text-center">
        {/* Visual Brand Icon */}
        <div className="w-16 h-16 rounded-2xl bg-red-50 text-[#B91C32] flex items-center justify-center mx-auto mb-4 border border-red-100">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <span className="text-xs font-extrabold uppercase tracking-widest text-[#B91C32] bg-red-50 px-3 py-1 rounded-full border border-red-200">
          Error 404
        </span>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-3 mb-2">
          Page Not Found
        </h1>

        <p className="text-sm text-slate-600 leading-relaxed mb-6">
          The page or destination you requested could not be located. It may have been moved, renamed, or is temporarily unavailable.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/"
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#B91C32] hover:bg-[#9B1729] text-white text-sm font-bold transition-all shadow-xs"
          >
            Return Home
          </Link>

          <Link
            href="/find-blood"
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 text-sm font-bold transition-all"
          >
            Find Blood
          </Link>

          <button
            type="button"
            onClick={() => router.back()}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition-all cursor-pointer"
          >
            Go Back
          </button>
        </div>

        <div className="mt-8 pt-5 border-t border-slate-100 text-xs text-slate-500">
          Looking for blood availability? Try searching our{' '}
          <Link href="/find-blood" className="text-[#B91C32] font-semibold hover:underline">
            live blood directory
          </Link>
          .
        </div>
      </div>
    </div>
  );
}
