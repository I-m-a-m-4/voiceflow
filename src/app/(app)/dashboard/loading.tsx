import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="flex flex-col lg:flex-row min-h-full w-full bg-background animate-in fade-in duration-150">
      {/* Left Feed Skeleton */}
      <div className="flex-1 flex flex-col min-w-0 p-8 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <Skeleton className="h-6 w-32 rounded-lg" />
          <Skeleton className="h-8 w-64 rounded-lg" />
        </div>

        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-6 border border-border rounded-2xl bg-card space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-48 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-6 w-3/4 rounded-lg" />
              <div className="bg-muted/40 p-4 rounded-xl space-y-2 border border-border/50">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-4 w-full rounded" />
                <Skeleton className="h-4 w-5/6 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Panel Skeleton */}
      <div className="w-full lg:w-[320px] bg-muted/20 border-l border-border p-6 space-y-6 hidden lg:block">
        <div className="space-y-2">
          <Skeleton className="h-5 w-36 rounded" />
          <Skeleton className="h-3 w-48 rounded" />
        </div>
        <Skeleton className="h-12 w-full rounded-xl bg-orange-500/10" />
        <Skeleton className="h-8 w-full rounded-full" />
        <div className="pt-6 border-t border-border space-y-3">
          <Skeleton className="h-4 w-32 rounded" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
