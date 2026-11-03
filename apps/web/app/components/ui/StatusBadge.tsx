import React from 'react';

export type StatusType =
  | 'AVAILABLE'
  | 'UNAVAILABLE'
  | 'STALE'
  | 'ZERO'
  | 'OPEN'
  | 'CLOSED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'PENDING'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'CLEARED'
  | 'DEFERRED'
  | 'RESERVED'
  | 'ISSUED'
  | 'DISPATCHED'
  | 'RECEIVED'
  | 'TRANSFUSED'
  | 'DISCARDED'
  | 'RECONCILED'
  | 'DRAFT'
  | 'FINALISED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED_WITH_DISCREPANCIES';

interface StatusBadgeProps {
  status: string;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function StatusBadge({ status, label, size = 'sm', className = '' }: StatusBadgeProps) {
  const norm = (status || '').toUpperCase().trim();
  const displayLabel = label || norm.replace(/_/g, ' ');

  // Size styling
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  // Semantic styles
  let colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';
  let dotColor = 'bg-slate-400';

  if (['AVAILABLE', 'ACCEPTED', 'CLEARED', 'RECONCILED', 'RECEIVED', 'TRANSFUSED'].includes(norm)) {
    colorClasses = 'bg-emerald-50 text-emerald-800 border-emerald-200';
    dotColor = 'bg-emerald-500';
  } else if (['OPEN', 'ISSUED', 'DISPATCHED', 'FINALISED'].includes(norm)) {
    colorClasses = 'bg-blue-50 text-blue-800 border-blue-200';
    dotColor = 'bg-blue-500';
  } else if (['PENDING', 'DRAFT', 'PARTIALLY_RECEIVED', 'RESERVED'].includes(norm)) {
    colorClasses = 'bg-amber-50 text-amber-800 border-amber-200';
    dotColor = 'bg-amber-500';
  } else if (['ZERO', 'CANCELLED', 'EXPIRED', 'DECLINED', 'DEFERRED', 'DISCARDED', 'RECEIVED_WITH_DISCREPANCIES'].includes(norm)) {
    colorClasses = 'bg-red-50 text-red-800 border-red-200';
    dotColor = 'bg-red-500';
  } else if (['STALE', 'UNAVAILABLE'].includes(norm)) {
    colorClasses = 'bg-amber-50/70 text-amber-700 border-amber-200';
    dotColor = 'bg-amber-400';
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-bold uppercase tracking-wider rounded-md border ${sizeClasses} ${colorClasses} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} aria-hidden="true" />
      <span>{displayLabel}</span>
    </span>
  );
}
