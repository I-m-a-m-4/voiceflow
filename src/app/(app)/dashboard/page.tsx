"use client";

import React from "react";
import MeetingsFeed from "@/components/dashboard/meetings-feed";
import RightPanel from "@/components/dashboard/right-panel";

export default function VoiceFlowApp() {
  return (
    <div className="flex h-full w-full overflow-hidden">
      <MeetingsFeed />
      <RightPanel />
    </div>
  );
}
