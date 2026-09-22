"use client";

import React from 'react';
import MeetingsFeed from '@/components/dashboard/meetings-feed';

export default function DashboardClientContent() {
    return (
        <div className="w-full">
            <MeetingsFeed />
        </div>
    );
}
