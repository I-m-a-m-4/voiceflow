"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronDown, MessageSquare, Play, Video, Share, Settings2, FileText, Loader2, Calendar, RefreshCw, Search, Trash2, Clock, Sparkles } from 'lucide-react';
import { useAuth } from '@/firebase';
import { getUserMeetings, MeetingData } from '@/firebase/meetings';
import { formatDuration, estimateDurationFromTranscript, cleanSummaryForCard } from '@/lib/utils';

export default function MeetingsFeed() {
  const [searchQuery, setSearchQuery] = useState('');
  const auth = useAuth();
  
  const [meetings, setMeetings] = useState<(MeetingData & { id: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [meetingToDelete, setMeetingToDelete] = useState<(MeetingData & { id: string }) | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchMeetings();
    
    // Check URL query parameter on mount
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('q');
      if (q) setSearchQuery(q);
    }

    const handleSearch = (e: any) => {
      if (typeof e.detail?.query === 'string') {
        setSearchQuery(e.detail.query);
      }
    };
    const handleProcessing = (e: any) => {
      setIsProcessing(Boolean(e.detail?.isProcessing));
    };
    const handleSaved = () => {
      fetchMeetings(true);
    };

    window.addEventListener('voiceflow-search-query', handleSearch);
    window.addEventListener('voiceflow-processing-state', handleProcessing);
    window.addEventListener('voiceflow-meeting-saved', handleSaved);
    
    // Set up a simple interval to poll for new meetings every 10 seconds 
    // since the user might be recording in the right panel
    const interval = setInterval(() => fetchMeetings(true), 10000);
    return () => {
      clearInterval(interval);
      window.removeEventListener('voiceflow-search-query', handleSearch);
      window.removeEventListener('voiceflow-processing-state', handleProcessing);
      window.removeEventListener('voiceflow-meeting-saved', handleSaved);
    };
  }, [auth?.currentUser?.uid]);

  const handleConfirmDelete = async () => {
    if (!meetingToDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      const { deleteMeeting } = await import('@/firebase/meetings');
      await deleteMeeting(meetingToDelete.id, auth?.currentUser?.uid);
      setMeetings((prev) => prev.filter((m) => m.id !== meetingToDelete.id));
      setMeetingToDelete(null);
    } catch (err) {
      console.error("Failed to delete meeting:", err);
    } finally {
      setIsDeleting(false);
    }
  };

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
            <h1 className="text-2xl font-bold text-foreground font-nexa">Recent Transcripts</h1>
            <p className="text-xs text-muted-foreground mt-0.5 font-dm-sans">Browse and search your meeting recordings, dictations, and AI notes.</p>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search transcripts or summaries..."
                className="pl-8 pr-3 py-1.5 text-xs bg-muted/60 hover:bg-muted/80 focus:bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-voiceflow-orange transition-all w-60 sm:w-72 font-dm-sans"
              />
            </div>
            <button className="flex items-center gap-1 text-xs font-semibold text-foreground hover:bg-muted px-3 py-1.5 rounded-lg border border-border transition-colors shrink-0 font-dm-sans">
              Filter <ChevronDown size={14} className="text-muted-foreground" />
            </button>
          </div>
        </div>

        {isLoading && meetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-voiceflow-orange" />
            <p className="font-dm-sans">Loading your meetings...</p>
          </div>
        ) : meetings.length === 0 ? (
          <div className="space-y-6">
            <div className="flex flex-col items-center justify-center text-center p-8 sm:p-10 border border-border/80 bg-card/60 backdrop-blur-sm rounded-2xl shadow-sm">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-voiceflow-orange/10 border border-voiceflow-orange/25 text-voiceflow-orange text-xs font-semibold mb-4">
                <Sparkles size={14} />
                <span>AI Meeting Notetaker & In-Call Co-Pilot</span>
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-2 font-nexa">Ready for your next meeting</h3>
              <p className="text-sm text-muted-foreground font-dm-sans max-w-lg mb-6">
                VoiceFlow automatically transcribes your calls, highlights executive action items, and discreetly coaches you during live Zoom, Teams, and Google Meet meetings.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/dashboard/meeting?id=sample"
                  className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl bg-voiceflow-orange text-white hover:bg-voiceflow-orange-hover shadow-sm transition-all"
                >
                  <FileText size={15} />
                  Explore Sample Meeting Notes
                </Link>
                <Link
                  href="/dashboard/notetaker"
                  className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground border border-border transition-all"
                >
                  Configure Notetaker & Auto-Join
                </Link>
              </div>
            </div>

            {/* Interactive Sample Meeting Preview Card */}
            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Interactive Demo Preview</span>
                <span className="text-xs text-voiceflow-orange font-medium">Click to open full notes →</span>
              </div>
              <Link 
                href="/dashboard/meeting?id=sample"
                className="bg-card border border-border/90 rounded-2xl p-6 hover:shadow-lg dark:hover:border-voiceflow-orange/50 transition-all cursor-pointer flex flex-col group relative overflow-hidden"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">Google Meet</span>
                      <span className="text-xs text-muted-foreground font-dm-sans">Today • 25 mins</span>
                    </div>
                    <h4 className="text-lg font-bold text-foreground group-hover:text-voiceflow-orange transition-colors font-nexa">
                      Q3 Product Strategy & AI Roadmap Sync
                    </h4>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs px-3 py-1 rounded-lg bg-voiceflow-orange/10 text-voiceflow-orange font-semibold border border-voiceflow-orange/20">
                      Executive Summary
                    </span>
                  </div>
                </div>

                <div className="space-y-3 text-sm text-muted-foreground font-dm-sans bg-muted/30 p-4 rounded-xl border border-border/50">
                  <p className="line-clamp-2 text-foreground/90">
                    <strong className="text-foreground">Key Takeaways:</strong> The leadership team aligned on Q3 roadmap deliverables, prioritizing AI streaming latency under 200ms and deep calendar auto-join for Google Meet and Teams.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-border/40 text-xs">
                    <div className="flex items-center gap-2 text-foreground">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>Streaming latency benchmark: Friday EOD</span>
                    </div>
                    <div className="flex items-center gap-2 text-foreground">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>Presenter Privacy Shield active by default</span>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          </div>
        ) : filteredMeetings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border border-dashed border-border rounded-2xl bg-muted/20 p-8">
            <p className="text-sm font-semibold text-foreground mb-1 font-nexa">No matching transcripts found</p>
            <p className="text-xs text-muted-foreground font-dm-sans">Try clearing or changing your search query "{searchQuery}".</p>
          </div>
        ) : (
          <div className="space-y-6">
            {filteredMeetings.map((meeting) => (
              <Link 
                href={`/dashboard/meeting?id=${meeting.id}`}
                key={meeting.id} 
                onClick={(e) => {
                  if (isProcessing) {
                    e.preventDefault();
                    return;
                  }
                  if (typeof window !== 'undefined') {
                    localStorage.setItem('voiceflow_current_meeting_id', meeting.id);
                  }
                }}
                className={`bg-card border border-border rounded-2xl overflow-hidden hover:shadow-lg dark:hover:shadow-none transition-all cursor-pointer flex flex-col group ${isProcessing ? 'opacity-75 cursor-not-allowed' : ''}`}
              >
                
                {(() => {
                  const durationText = (meeting as any).durationSeconds 
                    ? formatDuration((meeting as any).durationSeconds, true) 
                    : ((meeting as any).durationMinutes 
                      ? formatDuration((meeting as any).durationMinutes, false) 
                      : estimateDurationFromTranscript(meeting.transcript));

                  const cardTitle = (meeting as any).title || (() => {
                    const text = (meeting.summary || meeting.transcript || '').toLowerCase();
                    if (text.includes('algorithm') || text.includes('leetcode') || text.includes('interview')) {
                      return 'Computer Science Algorithm Interview';
                    }
                    if (text.includes('video') || text.includes('engineering') || text.includes('connect')) {
                      return 'Technical Sync & Video Session';
                    }
                    return meeting.type === 'dictation' ? 'Dictation Session' : 'Meeting Transcript';
                  })();

                  const cleanSummary = cleanSummaryForCard(meeting.summary || meeting.transcript);

                  return (
                    <div className="p-6 flex-1 flex flex-col">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                           <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-voiceflow-orange font-bold text-sm">
                            <FileText size={16} />
                          </div>
                          <div className="text-xs font-semibold text-muted-foreground flex items-center flex-wrap gap-2 font-dm-sans">
                            <span>{formatDate(meeting.createdAt)}</span>
                            <span>•</span>
                            <span className="capitalize">{meeting.type === 'dictation' ? 'Dictation' : 'Meeting'}</span>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1 font-mono text-voiceflow-orange font-medium bg-orange-500/10 px-2 py-0.5 rounded-full border border-orange-500/20">
                              <Clock size={11} className="text-voiceflow-orange" />
                              {durationText}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMeetingToDelete(meeting);
                          }}
                          className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Delete meeting"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      
                      <h2 className="text-xl font-bold text-card-foreground mb-3 group-hover:text-voiceflow-orange transition-colors font-nexa">
                        {cardTitle}
                      </h2>
                      
                      <div className="bg-muted/50 p-4 rounded-xl border border-border mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider font-nexa">
                            {meeting.summary ? 'AI Summary' : 'Transcript Excerpt'}
                          </h4>
                          <span className="text-[11px] font-mono text-muted-foreground font-medium">
                            {durationText}
                          </span>
                        </div>
                        <p className="text-sm text-card-foreground leading-relaxed whitespace-pre-wrap line-clamp-3 font-dm-sans">
                          {cleanSummary}
                        </p>
                      </div>
                      
                      <div className="text-sm text-voiceflow-orange font-semibold flex items-center gap-1 mt-2">
                        View full details →
                      </div>
                    </div>
                  );
                })()}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {meetingToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl relative flex flex-col gap-4 text-foreground font-dm-sans animate-scale-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold font-nexa text-foreground">Delete Meeting</h3>
                <p className="text-xs text-muted-foreground">Permanently remove this session?</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to delete this recorded session? This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setMeetingToDelete(null)}
                disabled={isDeleting}
                className="px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground border border-border bg-card hover:bg-muted rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors shadow-sm disabled:opacity-50"
              >
                {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                {isDeleting ? "Deleting..." : "Delete Session"}
              </button>
            </div>
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
