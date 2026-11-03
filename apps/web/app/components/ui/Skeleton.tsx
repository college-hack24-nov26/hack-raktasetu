import React from 'react';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Skeleton({ className = '', ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-shimmer rounded-xl bg-slate-200/80 ${className}`}
      {...props}
    />
  );
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4" role="status" aria-label="Loading content">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-3"
        >
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-6 w-3/5" />
          <Skeleton className="h-4 w-4/5" />
          <div className="pt-2 flex items-center gap-3">
            <Skeleton className="h-9 w-28 rounded-xl" />
            <Skeleton className="h-9 w-24 rounded-xl" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading content, please wait...</span>
    </div>
  );
}

export function TableSkeleton({ rows = 4, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white" role="status" aria-label="Loading table data">
      <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between gap-4">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-8 w-24 rounded-xl" />
      </div>
      <div className="divide-y divide-slate-100 p-4 space-y-3">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center justify-between gap-4 py-2">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={c}
                className={`h-4 ${c === 0 ? 'w-1/4' : c === cols - 1 ? 'w-20' : 'w-1/6'}`}
              />
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only">Loading table data, please wait...</span>
    </div>
  );
}

export function MetricSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" role="status" aria-label="Loading metrics">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
      <span className="sr-only">Loading metrics, please wait...</span>
    </div>
  );
}
