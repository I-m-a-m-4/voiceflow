"use client";

import React, { useState, useEffect } from 'react';
import { ChevronDown, MessageSquare, Play, Video, Share, Settings2, FileText, Loader2, Calendar, RefreshCw } from 'lucide-react';
import { useAuth } from '@/firebase';
import { getUserMeetings, MeetingData } from '@/firebase/meetings';

export default function MeetingsFeed() {
  const [activeTab, setActiveTab] = useState<'meetings' | 'actionitems'>('meetings');
  const auth = useAuth();
  
  const [meetings, setMeetings] = useState<(MeetingData & { id: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMeetings = async (silent = false) => {
    if (!auth?.currentUser?.uid) return;
    try {
      if (!silent) setIsLoading(true);
      const data = await getUserMeetings(auth.currentUser.uid);
      setMeetings(data as any);
    } catch (err) {
      console.error("Error fetching meetings", err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
    
    // Set up a simple interval to poll for new meetings every 10 seconds 
    // since the user might be recording in the right panel
    const interval = setInterval(() => fetchMeetings(true), 10000);
    return () => clearInterval(interval);
  }, [auth?.currentUser?.uid]);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'Just now';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background h-full overflow-y-auto relative">
      {/* Top Tabs */}
      <div className="flex items-center gap-6 px-8 border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10">
        <button 
          onClick={() => setActiveTab('meetings')}
          className={`py-4 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'meetings' ? 'border-voiceflow-orange text-voiceflow-orange' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          My Meetings
        </button>
        <button 
          onClick={() => setActiveTab('actionitems')}
          className={`py-4 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'actionitems' ? 'border-voiceflow-orange text-voiceflow-orange' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          Action Items
        </button>
        {/* Icons removed per user request */}
      </div>

      {/* Main Content Area */}
      <div className="p-8 w-full pb-32">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-foreground">Recent Transcripts</h1>
          <button className="flex items-center gap-1 text-sm font-bold text-foreground hover:bg-muted px-3 py-1.5 rounded border border-border">
            Filter <ChevronDown size={16} className="text-muted-foreground" />
          </button>
        </div>

        {isLoading && meetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-voiceflow-orange" />
            <p>Loading your meetings...</p>
          </div>
        ) : meetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-muted-foreground border-2 border-dashed border-border rounded-2xl bg-muted/30 p-12">
            <FileText className="w-20 h-20 text-muted-foreground/50 mb-6" />
            <h3 className="text-2xl font-bold text-foreground mb-2">No meetings yet</h3>
            <p className="text-base text-muted-foreground">Click "Start Recording" in the right panel to capture your first meeting.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {meetings.map((meeting) => (
              <div key={meeting.id} className="bg-card border border-border rounded-2xl overflow-hidden hover:shadow-lg dark:hover:shadow-none transition-all cursor-pointer flex flex-col group">
                
                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                       <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-voiceflow-orange font-bold text-sm">
                        <FileText size={16} />
                      </div>
                      <div className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
                        {formatDate(meeting.createdAt)} • {meeting.type === 'dictation' ? 'Dictation' : 'Meeting'}
                      </div>
                    </div>
                  </div>
                  
                  <h2 className="text-xl font-bold text-card-foreground mb-3 group-hover:text-voiceflow-orange transition-colors">
                    {meeting.summary ? 'AI Summary' : 'Raw Transcript'}
                  </h2>
                  
                  <div className="bg-muted/50 p-4 rounded-xl border border-border mb-4">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Summary</h4>
                    <p className="text-sm text-card-foreground leading-relaxed whitespace-pre-wrap line-clamp-4">
                      {meeting.summary || "No summary available."}
                    </p>
                  </div>
                  
                  <details className="group/details">
                    <summary className="text-sm text-voiceflow-orange font-semibold hover:underline cursor-pointer list-none flex items-center gap-1 mb-2">
                      <span className="group-open/details:hidden">View full transcript</span>
                      <span className="hidden group-open/details:block">Hide transcript</span>
                      <ChevronDown size={14} className="group-open/details:rotate-180 transition-transform" />
                    </summary>
                    <div className="mt-4 p-4 bg-muted/50 rounded-xl border border-border max-h-64 overflow-y-auto">
                       <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Transcript</h4>
                       <p className="text-sm text-card-foreground/80 whitespace-pre-wrap leading-relaxed font-mono text-[13px]">
                         {meeting.transcript}
                       </p>
                    </div>
                  </details>
                  
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Get Started Modal - Only show if no meetings */}
      {!isLoading && meetings.length === 0 && (
        <div className="fixed bottom-6 right-6 lg:right-[340px] w-80 bg-popover rounded-2xl shadow-lg border border-border p-6 z-40">
          <button className="absolute -top-3 -right-3 w-8 h-8 bg-popover border border-border rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground shadow-sm transition-colors hover:bg-muted">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
          <h3 className="text-lg font-bold text-popover-foreground mb-2">Get started</h3>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            Welcome {auth?.currentUser?.displayName || 'User'}! Here's a checklist to help you get started.
          </p>
          <div className="space-y-4">
            <button className="w-full flex items-center justify-between group">
              <div className="flex items-center gap-3 text-sm font-medium text-popover-foreground group-hover:text-voiceflow-orange">
                <div className="w-4 h-4 rounded-full border-2 border-dashed border-muted-foreground/30"></div>
                Transcribe your first file
              </div>
              <ChevronDown size={16} className="text-muted-foreground/50 -rotate-90 group-hover:text-voiceflow-orange" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RefreshCwIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  )
}
