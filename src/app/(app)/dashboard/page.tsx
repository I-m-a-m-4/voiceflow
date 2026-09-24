"use client";

import React from "react";
import MeetingsFeed from "@/components/dashboard/meetings-feed";
import RightPanel from "@/components/dashboard/right-panel";

export default function VoiceFlowApp() {
  return (
    <div className="flex flex-col lg:flex-row min-h-full w-full">
      <MeetingsFeed />
      <RightPanel />
    </div>
  );
}
