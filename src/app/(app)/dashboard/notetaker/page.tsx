"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Switch } from '@/components/ui/switch';
import { 
  FileText, Calendar, Clock, Download, ChevronRight, 
  Mic, Play, Square, Sparkles, CheckCircle2, Radio, Video
} from 'lucide-react';
import { useAuth } from '@/firebase';
import { getUserMeetings, MeetingData } from '@/firebase/meetings';
import { Loader2 } from 'lucide-react';

export default function NotetakerPage() {
  const [autoStart, setAutoStart] = useState(true);
  const [autoJoin, setAutoJoin] = useState(false);
  const [summaryDetail, setSummaryDetail] = useState('standard');
  const [selectedPlatform, setSelectedPlatform] = useState('all');
  const [isLiveRecording, setIsLiveRecording] = useState(false);
  const auth = useAuth();
  
  const [meetings, setMeetings] = useState<(MeetingData & { id: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const handleRecordState = (e: any) => {
      if (typeof e.detail?.isRecording === 'boolean') {
        setIsLiveRecording(e.detail.isRecording);
      }
    };
    window.addEventListener('voiceflow-record-state', handleRecordState);
    return () => window.removeEventListener('voiceflow-record-state', handleRecordState);
  }, []);

  const handleToggleNotetaker = () => {
    window.dispatchEvent(new CustomEvent('voiceflow-toggle-record'));
  };

  useEffect(() => {
    const fetchMeetings = async () => {
      if (!auth?.currentUser?.uid) return;
      try {
        setIsLoading(true);
        const data = await getUserMeetings(auth.currentUser.uid);
        setMeetings(data as any);
      } catch (err) {
        console.error("Error fetching meetings", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchMeetings();
  }, [auth?.currentUser?.uid]);

  return (
    <div className="p-4 sm:p-8 w-full max-w-7xl mx-auto flex flex-col space-y-8 animate-fade-up">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground font-clash mb-2">
          AI Meeting Notetaker
        </h1>
        <p className="text-sm text-muted-foreground">
          Initialize VoiceFlow to attend your meetings, listen to live speech, and generate automated executive summaries.
        </p>
      </div>

      {/* Hero: Initialize Notetaker Card */}
      <div className={`p-6 sm:p-8 rounded-3xl border transition-all ${
        isLiveRecording 
          ? 'bg-orange-500/10 border-voiceflow-orange/50 shadow-lg shadow-orange-500/10' 
          : 'bg-card border-border shadow-sm'
      }`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                isLiveRecording 
                  ? 'bg-red-500 text-white animate-pulse' 
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              }`}>
                <Radio size={13} className={isLiveRecording ? 'animate-bounce' : ''} />
                {isLiveRecording ? 'Notetaker Active & Listening' : 'Notetaker Ready to Launch'}
              </span>
              <span className="text-xs text-muted-foreground font-medium hidden sm:inline">
                • 100% Stealth Mode Active
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-foreground font-clash">
              {isLiveRecording ? 'Meeting in Progress' : 'Initialize Live Meeting Notetaker'}
            </h2>
            <p className="text-sm text-muted-foreground max-w-xl">
              {isLiveRecording 
                ? 'Voiceflow is capturing your conversation audio in real-time. Click Stop when the meeting finishes to generate your AI summary.' 
                : 'Choose your meeting platform and click Initialize below. VoiceFlow will instantly begin live audio analysis and capture transcripts.'}
            </p>

            {/* Target Meeting Platform Chips */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs font-semibold text-muted-foreground mr-1">Platform:</span>
              {[
                { id: 'all', label: 'All Sources / Auto' },
                { id: 'zoom', label: 'Zoom' },
                { id: 'meet', label: 'Google Meet' },
                { id: 'teams', label: 'Microsoft Teams' },
                { id: 'mic', label: 'In-Person / Mic' },
              ].map((plat) => (
                <button
                  key={plat.id}
                  type="button"
                  onClick={() => setSelectedPlatform(plat.id)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all ${
                    selectedPlatform === plat.id 
                      ? 'bg-voiceflow-orange text-white border-voiceflow-orange shadow-sm' 
                      : 'border-border bg-muted/40 hover:bg-muted text-foreground'
                  }`}
                >
                  {plat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Action Button */}
          <div className="shrink-0 flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={handleToggleNotetaker}
              className={`w-full sm:w-auto px-8 py-4 rounded-2xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2.5 ${
                isLiveRecording 
                  ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20' 
                  : 'bg-voiceflow-orange hover:bg-orange-600 text-white shadow-orange-500/20 hover:scale-[1.02]'
              }`}
            >
              {isLiveRecording ? (
                <>
                  <Square size={17} className="fill-white" />
                  <span>Stop & Save Meeting Notes</span>
                </>
              ) : (
                <>
                  <Play size={17} className="fill-white" />
                  <span>Initialize & Start Notetaker</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      
      {/* 2-Column Grid: Settings & Recent Transcripts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column - Settings */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-foreground mb-6">Automation Settings</h2>
            
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-bold text-foreground mb-1">Auto-Start Notetaker</div>
                  <div className="text-xs text-muted-foreground max-w-md">Automatically begin listening and transcribing when a supported meeting is detected (Zoom, Teams, Meet).</div>
                </div>
                <Switch checked={autoStart} onCheckedChange={setAutoStart} className="data-[state=checked]:bg-voiceflow-orange" />
              </div>

              <div className="flex items-start justify-between pt-6 border-t border-border">
                <div>
                  <div className="text-sm font-bold text-foreground mb-1">Auto-join Calendar Events</div>
                  <div className="text-xs text-muted-foreground max-w-md">VoiceFlow will automatically join meetings listed in your connected Google or Outlook calendar.</div>
                </div>
                <Switch checked={autoJoin} onCheckedChange={setAutoJoin} className="data-[state=checked]:bg-voiceflow-orange" />
              </div>

              <div className="pt-6 border-t border-border">
                <div className="text-sm font-bold text-foreground mb-3">Summary Detail Level</div>
                <div className="grid grid-cols-3 gap-3">
                  {['brief', 'standard', 'comprehensive'].map((level) => (
                    <button 
                      key={level}
                      onClick={() => setSummaryDetail(level)}
                      className={`py-3 px-4 rounded-xl border text-sm font-semibold transition-all capitalize ${
                        summaryDetail === level 
                          ? 'border-voiceflow-orange bg-orange-50 dark:bg-orange-950/20 text-voiceflow-orange ring-1 ring-voiceflow-orange' 
                          : 'border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-orange-500 to-orange-400 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
            <div className="relative z-10">
              <h2 className="text-lg font-bold mb-2">Want hyper-tailored notes?</h2>
              <p className="text-white/90 text-sm mb-4 max-w-sm">Provide VoiceFlow with context about your role and company in Live Answers settings to get tailored action items.</p>
              <button 
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('open-settings-modal', { detail: { tab: 'answers' } }));
                }}
                className="inline-flex items-center gap-1.5 bg-white text-orange-600 px-4 py-2 rounded-xl text-sm font-bold hover:bg-orange-50 transition-colors shadow-sm"
              >
                Configure Context
                <ChevronRight size={16} />
              </button>
            </div>
            <FileText className="absolute -right-4 -bottom-4 w-32 h-32 text-white/10" />
          </div>
        </div>

        {/* Right Column - History Preview */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col h-[520px]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-foreground">Recent Transcripts</h2>
            <Link href="/dashboard" className="text-xs text-voiceflow-orange hover:underline font-semibold">
              View all
            </Link>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-1 space-y-3">
            {isLoading ? (
              <div className="flex justify-center items-center h-20">
                <Loader2 className="w-6 h-6 animate-spin text-voiceflow-orange" />
              </div>
            ) : meetings.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                No recent transcripts found.
              </div>
            ) : (
              meetings.map((meeting) => {
                const dateObj = meeting.createdAt?.toDate ? meeting.createdAt.toDate() : new Date(meeting.createdAt);
                const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                return (
                  <Link 
                    key={meeting.id} 
                    href={`/dashboard/meeting/${meeting.id}`}
                    className="block group p-4 border border-border rounded-xl hover:border-voiceflow-orange hover:bg-muted/40 transition-all cursor-pointer"
                  >
                    <h3 className="text-sm font-bold text-foreground mb-1.5 group-hover:text-voiceflow-orange transition-colors truncate">
                      {meeting.summary ? 'AI Summary' : 'Raw Transcript'}
                    </h3>
                    <div className="flex flex-wrap gap-y-1 gap-x-3 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1"><Calendar size={12} /> {dateStr}</div>
                      <div className="flex items-center gap-1"><Clock size={12} /> {meeting.type === 'dictation' ? 'Dictation' : 'Meeting'}</div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          <div className="pt-4 border-t border-border mt-auto">
            <Link 
              href="/dashboard"
              className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2 font-medium"
            >
              <Download size={15} />
              Open All Meeting Transcripts
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
