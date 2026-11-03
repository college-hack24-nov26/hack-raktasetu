import React from 'react';
import Link from 'next/link';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  actionText?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  actionText,
  actionHref,
  onAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center shadow-xs ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-500 mx-auto flex items-center justify-center mb-3">
        {icon || (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
        )}
      </div>
      <h3 className="text-base font-bold text-slate-900 mb-1">{title}</h3>
      <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed mb-5">
        {description}
      </p>

      {actionText && actionHref && (
        <Link
          href={actionHref}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#B91C32] hover:bg-[#9B1729] text-white text-xs sm:text-sm font-semibold transition-all shadow-xs"
        >
          <span>{actionText}</span>
          <span>→</span>
        </Link>
      )}

      {actionText && onAction && !actionHref && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#B91C32] hover:bg-[#9B1729] text-white text-xs sm:text-sm font-semibold transition-all shadow-xs cursor-pointer"
        >
          <span>{actionText}</span>
        </button>
      )}
    </div>
  );
}
