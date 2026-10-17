"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
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

  const [selectedType, setSelectedType] = useState<'all' | 'meeting' | 'dictation' | 'with_summary' | 'with_actions'>('all');
  const [selectedSort, setSelectedSort] = useState<'newest' | 'oldest' | 'duration'>('newest');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isFilterOpen]);

  const activeFilterCount = (selectedType !== 'all' ? 1 : 0) + (selectedSort !== 'newest' ? 1 : 0) + (selectedPlatform !== 'all' ? 1 : 0);

  const filteredMeetings = useMemo(() => {
    const result = meetings.filter((meeting) => {
      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const text = (meeting.transcript || '').toLowerCase();
        const sum = (meeting.summary || '').toLowerCase();
        const type = (meeting.type || '').toLowerCase();
        const title = ((meeting as any).title || '').toLowerCase();
        if (!text.includes(query) && !sum.includes(query) && !type.includes(query) && !title.includes(query)) {
          return false;
        }
      }

      // Type filter
      if (selectedType === 'meeting' && meeting.type === 'dictation') return false;
      if (selectedType === 'dictation' && meeting.type !== 'dictation') return false;
      if (selectedType === 'with_summary' && !meeting.summary) return false;
      if (selectedType === 'with_actions') {
        const summary = (meeting.summary || '').toLowerCase();
        if (!summary.includes('action item') && !summary.includes('- [ ]') && !summary.includes('next steps')) {
          return false;
        }
      }

      // Platform filter
      if (selectedPlatform !== 'all') {
        const p = ((meeting as any).platform || '').toLowerCase();
        const text = (((meeting as any).title || '') + ' ' + (meeting.summary || '')).toLowerCase();
        if (!p.includes(selectedPlatform) && !text.includes(selectedPlatform)) {
          return false;
        }
      }

      return true;
    });

    // Sorting
    result.sort((a, b) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt || 0).getTime();
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt || 0).getTime();

      if (selectedSort === 'oldest') {
        return dateA - dateB;
      } else if (selectedSort === 'duration') {
        const durA = (a as any).durationSeconds || ((a as any).durationMinutes ? (a as any).durationMinutes * 60 : 0);
        const durB = (b as any).durationSeconds || ((b as any).durationMinutes ? (b as any).durationMinutes * 60 : 0);
        return durB - durA;
      }
      return dateB - dateA;
    });

    return result;
  }, [meetings, searchQuery, selectedType, selectedSort, selectedPlatform]);

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
            
            {/* Filter Dropdown */}
            <div className="relative" ref={filterRef}>
              <button 
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all shrink-0 font-dm-sans ${
                  isFilterOpen || activeFilterCount > 0
                    ? 'border-voiceflow-orange text-voiceflow-orange bg-voiceflow-orange/10'
                    : 'border-border text-foreground hover:bg-muted'
                }`}
              >
                <span>Filter</span>
                {activeFilterCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-voiceflow-orange text-white text-[10px] font-bold flex items-center justify-center">
                    {activeFilterCount}
                  </span>
                )}
                <ChevronDown size={14} className={`text-muted-foreground transition-transform ${isFilterOpen ? 'rotate-180 text-voiceflow-orange' : ''}`} />
              </button>

              {isFilterOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-popover text-popover-foreground border border-border rounded-xl shadow-xl z-50 p-3 space-y-3 font-dm-sans animate-in fade-in zoom-in-95 duration-100">
                  <div className="flex items-center justify-between pb-2 border-b border-border text-xs">
                    <span className="font-bold text-foreground">Filter & Sort</span>
                    {activeFilterCount > 0 && (
                      <button 
                        onClick={() => {
                          setSelectedType('all');
                          setSelectedSort('newest');
                          setSelectedPlatform('all');
                        }}
                        className="text-voiceflow-orange hover:underline text-[11px] font-medium"
                      >
                        Reset all
                      </button>
                    )}
                  </div>

                  {/* Type Filter */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Type</label>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      {[
                        { id: 'all', label: 'All Types' },
                        { id: 'meeting', label: 'Meetings' },
                        { id: 'dictation', label: 'Dictations' },
                        { id: 'with_summary', label: 'With Summary' },
                        { id: 'with_actions', label: 'With Actions' },
                      ].map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setSelectedType(t.id as any)}
                          className={`px-2 py-1.5 rounded-lg text-left text-xs transition-colors ${
                            selectedType === t.id
                              ? 'bg-voiceflow-orange text-white font-semibold'
                              : 'hover:bg-muted text-foreground'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Sort Order */}
                  <div className="space-y-1.5 pt-2 border-t border-border">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Sort By</label>
                    <div className="grid grid-cols-3 gap-1 text-xs">
                      {[
                        { id: 'newest', label: 'Newest' },
                        { id: 'oldest', label: 'Oldest' },
                        { id: 'duration', label: 'Duration' },
                      ].map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setSelectedSort(s.id as any)}
                          className={`px-2 py-1.5 rounded-lg text-center text-xs transition-colors ${
                            selectedSort === s.id
                              ? 'bg-voiceflow-orange text-white font-semibold'
                              : 'hover:bg-muted text-foreground'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Platform Filter */}
                  <div className="space-y-1.5 pt-2 border-t border-border">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Platform</label>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      {[
                        { id: 'all', label: 'All Platforms' },
                        { id: 'meet', label: 'Google Meet' },
                        { id: 'zoom', label: 'Zoom' },
                        { id: 'teams', label: 'MS Teams' },
                      ].map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setSelectedPlatform(p.id)}
                          className={`px-2 py-1.5 rounded-lg text-left text-xs transition-colors ${
                            selectedPlatform === p.id
                              ? 'bg-voiceflow-orange text-white font-semibold'
                              : 'hover:bg-muted text-foreground'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
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
