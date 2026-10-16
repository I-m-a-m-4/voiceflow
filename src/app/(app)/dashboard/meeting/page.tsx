"use client";

import React, { Suspense } from "react";
import MeetingDetailClient from "./[id]/meeting-detail-client";
import { Loader2 } from "lucide-react";

export default function MeetingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] bg-background text-foreground gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-voiceflow-orange" />
          <p className="text-sm text-muted-foreground font-medium font-dm-sans">Loading meeting details...</p>
        </div>
      }
    >
      <MeetingDetailClient />
    </Suspense>
  );
}
