import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export default function MeetingLoading() {
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background text-foreground min-h-full p-6 sm:p-8 space-y-6 animate-in fade-in duration-150">
      {/* Top Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <Skeleton className="h-6 w-36 rounded-lg" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-4xl mx-auto w-full space-y-6">
        <Skeleton className="h-9 w-2/3 rounded-xl" />

        {/* Tab row */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <Skeleton className="h-8 w-56 rounded-xl" />
          <Skeleton className="h-6 w-32 rounded-lg" />
        </div>

        {/* Card skeleton */}
        <div className="p-8 border border-border rounded-2xl bg-card space-y-4 shadow-sm">
          <Skeleton className="h-6 w-48 rounded" />
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-11/12 rounded" />
          <Skeleton className="h-4 w-4/5 rounded" />

          <div className="pt-4 space-y-2">
            <Skeleton className="h-5 w-36 rounded" />
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-3/4 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}
