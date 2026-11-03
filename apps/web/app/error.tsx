'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log non-sensitive client error info for diagnosis without exposing stack traces
    console.error('App Router Caught Error:', error.message);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-6 bg-slate-50/60 min-h-[60vh]">
      <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-10 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4 border border-amber-200">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        <span className="text-xs font-extrabold uppercase tracking-widest text-amber-800 bg-amber-50 px-3 py-1 rounded-full border border-amber-200">
          Temporary Issue
        </span>

        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-3 mb-2">
          Something went wrong
        </h1>

        <p className="text-sm text-slate-600 leading-relaxed mb-6">
          We encountered an unexpected display issue while loading this page. Your data and account remain safe.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#B91C32] hover:bg-[#9B1729] text-white text-sm font-bold transition-all shadow-xs cursor-pointer"
          >
            Try Again
          </button>

          <Link
            href="/"
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-sm font-bold transition-all"
          >
            Return Home
          </Link>
        </div>

        <div className="mt-8 pt-5 border-t border-slate-100 text-xs text-slate-500">
          If this issue persists, please verify your internet connection or check back shortly.
        </div>
      </div>
    </div>
  );
}
