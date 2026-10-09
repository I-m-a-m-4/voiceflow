"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronDown, MessageSquare, Play, Video, Share, Settings2, FileText, Loader2, Calendar, RefreshCw, Search } from 'lucide-react';
import { useAuth } from '@/firebase';
import { getUserMeetings, MeetingData } from '@/firebase/meetings';

export default function MeetingsFeed() {
  const [searchQuery, setSearchQuery] = useState('');
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

  const filteredMeetings = meetings.filter((meeting) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const text = (meeting.transcript || '').toLowerCase();
    const sum = (meeting.summary || '').toLowerCase();
    const type = (meeting.type || '').toLowerCase();
    return text.includes(query) || sum.includes(query) || type.includes(query);
  });

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background h-full overflow-y-auto relative">
      {/* Top Header */}
      <div className="flex items-center gap-6 px-8 border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10">
        <div className="py-4 text-sm font-semibold border-b-2 border-voiceflow-orange text-voiceflow-orange">
          My Meetings
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-8 w-full pb-32">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground font-clash">Recent Transcripts</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Browse and search your meeting recordings, dictations, and AI notes.</p>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search transcripts or summaries..."
                className="pl-8 pr-3 py-1.5 text-xs bg-muted/60 hover:bg-muted/80 focus:bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-voiceflow-orange transition-all w-60 sm:w-72"
              />
            </div>
            <button className="flex items-center gap-1 text-xs font-semibold text-foreground hover:bg-muted px-3 py-1.5 rounded-lg border border-border transition-colors shrink-0">
              Filter <ChevronDown size={14} className="text-muted-foreground" />
            </button>
          </div>
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
            <p className="text-base text-muted-foreground">Click "Start Voiceflow" in the right panel to capture your first meeting.</p>
          </div>
        ) : filteredMeetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border border-dashed border-border rounded-2xl bg-muted/20 p-8">
            <p className="text-sm font-semibold text-foreground mb-1">No matching transcripts found</p>
            <p className="text-xs text-muted-foreground">Try clearing or changing your search query "{searchQuery}".</p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredMeetings.map((meeting) => (
              <Link 
                href={`/dashboard/meeting/${meeting.id}`}
                key={meeting.id} 
                className="bg-card border border-border rounded-2xl overflow-hidden hover:shadow-lg dark:hover:shadow-none transition-all cursor-pointer flex flex-col group"
              >
                
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
                  
                  <h2 className="text-xl font-bold text-card-foreground mb-3 group-hover:text-voiceflow-orange transition-colors font-clash">
                    {meeting.summary ? 'AI Summary' : 'Raw Transcript'}
                  </h2>
                  
                  <div className="bg-muted/50 p-4 rounded-xl border border-border mb-4">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
                      {meeting.summary ? 'Summary' : 'Transcript'}
                    </h4>
                    <p className="text-sm text-card-foreground leading-relaxed whitespace-pre-wrap line-clamp-4">
                      {meeting.summary || meeting.transcript || "No transcript content recorded."}
                    </p>
                  </div>
                  
                  <div className="text-sm text-voiceflow-orange font-semibold flex items-center gap-1 mt-2">
                    View full details
                  </div>
                </div>
              </Link>
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
