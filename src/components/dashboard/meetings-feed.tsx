"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronDown, MessageSquare, Play, Video, Share, Settings2, FileText, Loader2, Calendar, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useAuth } from '@/firebase';
import { getUserMeetings, MeetingData } from '@/firebase/meetings';

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
    window.addEventListener('voiceflow-search-query', handleSearch);
    
    // Set up a simple interval to poll for new meetings every 10 seconds 
    // since the user might be recording in the right panel
    const interval = setInterval(() => fetchMeetings(true), 10000);
    return () => {
      clearInterval(interval);
      window.removeEventListener('voiceflow-search-query', handleSearch);
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
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-muted-foreground border-2 border-dashed border-border rounded-2xl bg-muted/30 p-12">
            <FileText className="w-20 h-20 text-muted-foreground/50 mb-6" />
            <h3 className="text-2xl font-bold text-foreground mb-2 font-nexa">No meetings yet</h3>
            <p className="text-base text-muted-foreground font-dm-sans">Click "Start Voiceflow" in the right panel to capture your first meeting.</p>
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
                      <div className="text-xs font-semibold text-muted-foreground flex items-center gap-2 font-dm-sans">
                        {formatDate(meeting.createdAt)} • {meeting.type === 'dictation' ? 'Dictation' : 'Meeting'}
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
                    {meeting.summary ? 'AI Summary' : 'Raw Transcript'}
                  </h2>
                  
                  <div className="bg-muted/50 p-4 rounded-xl border border-border mb-4">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 font-nexa">
                      {meeting.summary ? 'Summary' : 'Transcript'}
                    </h4>
                    <p className="text-sm text-card-foreground leading-relaxed whitespace-pre-wrap line-clamp-4 font-dm-sans">
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
