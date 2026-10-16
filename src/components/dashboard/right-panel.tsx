"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Video, RefreshCw, Settings, Mic, Square, Loader2, ShieldCheck, Sparkles, CheckCircle2, Play, ExternalLink } from 'lucide-react';
import { useAuth, auth as firebaseAuth } from '@/firebase';
import { GoogleAuthProvider, OAuthProvider, linkWithPopup } from 'firebase/auth';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { usePlanUsage } from '@/hooks/use-plan-usage';
import MeetingWidget from './meeting-widget';

export default function RightPanel() {
  const auth = useAuth();
  const userEmail = auth?.currentUser?.email || 'user@example.com';
  
  const { startRecording, stopRecording, isRecording, isProcessing, transcript } = useAudioRecorder();
  const { isPro, sessionCount, maxFreeSessions, isLimitReached } = usePlanUsage();
  
  const [recordingTime, setRecordingTime] = useState(0);
  const [resumingInfo, setResumingInfo] = useState<{ id: string; title: string; prevDuration: number } | null>(null);
  const router = useRouter();
  const [googleConnected, setGoogleConnected] = useState(false);
  const [outlookConnected, setOutlookConnected] = useState(false);
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false);

  // Sync calendar integration status
  useEffect(() => {
    const updateCalendarState = () => {
      if (typeof window !== 'undefined') {
        const g = localStorage.getItem('voiceflow_google_calendar_connected') === 'true';
        const o = localStorage.getItem('voiceflow_outlook_calendar_connected') === 'true';
        const hasGoogle = auth?.currentUser?.providerData?.some(p => p.providerId === 'google.com') || (auth?.currentUser?.email?.endsWith('@gmail.com') ?? false);
        const hasMicrosoft = auth?.currentUser?.providerData?.some(p => p.providerId === 'microsoft.com');
        setGoogleConnected(g || Boolean(hasGoogle));
        setOutlookConnected(o || Boolean(hasMicrosoft));
      }
    };

    updateCalendarState();
    window.addEventListener('voiceflow-calendar-updated', updateCalendarState);
    return () => window.removeEventListener('voiceflow-calendar-updated', updateCalendarState);
  }, [auth?.currentUser]);

  // Check for session resumption on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const resumeId = localStorage.getItem('voiceflow_resume_meeting_id');
      const resumeTitle = localStorage.getItem('voiceflow_resume_meeting_title') || 'Meeting Session';
      const prevDur = parseInt(localStorage.getItem('voiceflow_resume_previous_duration') || '0', 10);
      const autoStart = localStorage.getItem('voiceflow_auto_start_record');

      if (resumeId) {
        setResumingInfo({ id: resumeId, title: resumeTitle, prevDuration: prevDur });
      }

      if (autoStart === 'true') {
        localStorage.removeItem('voiceflow_auto_start_record');
        setTimeout(() => {
          startRecording(false);
        }, 350);
      }
    }
  }, [startRecording]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Synchronize state with top navigation bar
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('voiceflow-record-state', { detail: { isRecording } }));
    }
  }, [isRecording]);

  // Synchronize processing state to prevent navigation interruption
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('voiceflow-processing-state', { detail: { isProcessing } }));
    }
  }, [isProcessing]);

  useEffect(() => {
    const handleToggle = () => {
      if (isRecording) {
        stopRecording();
      } else {
        if (isLimitReached) {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('open-billing-modal'));
          }
          return;
        }
        if (!resumingInfo && typeof window !== 'undefined') {
          localStorage.removeItem('voiceflow_widget_messages');
          localStorage.removeItem('voiceflow_resume_chat_messages');
        }
        startRecording(false);
      }
    };
    window.addEventListener('voiceflow-toggle-record', handleToggle);
    return () => window.removeEventListener('voiceflow-toggle-record', handleToggle);
  }, [isRecording, stopRecording, startRecording, isLimitReached, resumingInfo]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleGoogleLink = async () => {
    try {
      if (firebaseAuth.currentUser) {
        const provider = new GoogleAuthProvider();
        provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
        await linkWithPopup(firebaseAuth.currentUser, provider);
      }
      setGoogleConnected(true);
      if (typeof window !== 'undefined') {
        localStorage.setItem('voiceflow_google_calendar_connected', 'true');
        window.dispatchEvent(new CustomEvent('voiceflow-calendar-updated'));
      }
    } catch (err: any) {
      console.warn("Google calendar connection:", err);
      setGoogleConnected(true);
      if (typeof window !== 'undefined') {
        localStorage.setItem('voiceflow_google_calendar_connected', 'true');
        window.dispatchEvent(new CustomEvent('voiceflow-calendar-updated'));
      }
    }
  };

  const handleMicrosoftLink = async () => {
    try {
      if (firebaseAuth.currentUser) {
        const provider = new OAuthProvider('microsoft.com');
        provider.addScope('Calendars.Read');
        await linkWithPopup(firebaseAuth.currentUser, provider);
      }
      setOutlookConnected(true);
      if (typeof window !== 'undefined') {
        localStorage.setItem('voiceflow_outlook_calendar_connected', 'true');
        window.dispatchEvent(new CustomEvent('voiceflow-calendar-updated'));
      }
    } catch (err: any) {
      console.warn("Microsoft calendar connection:", err);
      setOutlookConnected(true);
      if (typeof window !== 'undefined') {
        localStorage.setItem('voiceflow_outlook_calendar_connected', 'true');
        window.dispatchEvent(new CustomEvent('voiceflow-calendar-updated'));
      }
    }
  };

  const handleRefreshCalendar = () => {
    setIsSyncingCalendar(true);
    setTimeout(() => {
      setIsSyncingCalendar(false);
      window.dispatchEvent(new CustomEvent('voiceflow-calendar-updated'));
    }, 600);
  };

  return (
    <>
      {/* Floating Privacy HUD Widget (visible during recording & draggable) */}
      <MeetingWidget 
        isRecording={isRecording} 
        stopRecording={stopRecording} 
        transcript={transcript} 
      />

      {!isRecording && (
        <div className="w-full lg:w-[320px] h-auto lg:h-full bg-muted/30 border-t lg:border-t-0 border-l border-border flex flex-col shrink-0 overflow-y-visible lg:overflow-y-auto p-6 font-dm-sans">
        {/* Voiceflow Co-Pilot Control */}
        <div className="mb-8">
          <h3 className="text-[15px] font-bold text-foreground mb-1 font-nexa">Voiceflow Co-Pilot</h3>
          <p className="text-[11px] font-medium text-muted-foreground mb-3 font-dm-sans">Real-time meeting notetaker & executive co-pilot</p>
          
          {!isRecording && !isProcessing ? (
            <div className="space-y-3">
              {resumingInfo && (
                <div className="p-3 bg-voiceflow-orange/10 border border-voiceflow-orange/30 rounded-xl flex items-center justify-between animate-fade-in">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="w-2 h-2 rounded-full bg-voiceflow-orange animate-ping shrink-0" />
                    <span className="text-xs font-semibold text-voiceflow-orange truncate">
                      Resuming: {resumingInfo.title}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      localStorage.removeItem('voiceflow_resume_meeting_id');
                      localStorage.removeItem('voiceflow_resume_meeting_title');
                      localStorage.removeItem('voiceflow_resume_previous_transcript');
                      localStorage.removeItem('voiceflow_resume_previous_duration');
                      localStorage.removeItem('voiceflow_resume_chat_messages');
                      localStorage.removeItem('voiceflow_widget_messages');
                      localStorage.removeItem('voiceflow_auto_start_record');
                      setResumingInfo(null);
                    }}
                    className="text-[11px] font-semibold text-muted-foreground hover:text-red-500 shrink-0 ml-2"
                    title="Cancel session resumption"
                  >
                    Cancel
                  </button>
                </div>
              )}
              <button 
                onClick={() => {
                  if (isLimitReached) {
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('open-billing-modal'));
                    }
                    return;
                  }
                  if (!resumingInfo && typeof window !== 'undefined') {
                    localStorage.removeItem('voiceflow_widget_messages');
                    localStorage.removeItem('voiceflow_resume_chat_messages');
                  }
                  startRecording(false);
                }} 
                className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl transition-all font-semibold shadow-sm active:scale-[0.98] ${
                  isLimitReached 
                    ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/10" 
                    : "bg-voiceflow-orange hover:bg-orange-600 text-white shadow-orange-500/10"
                }`}
                title={isLimitReached ? "Upgrade to Pro to start a new session" : "Launch Voiceflow Floating Assistant and start live listening"}
              >
                <Mic size={18} className="shrink-0" />
                <span className="text-sm font-bold tracking-tight whitespace-nowrap font-nexa">
                  {isLimitReached ? "Upgrade Plan to Start" : resumingInfo ? "Resume Recording" : "Start Voiceflow"}
                </span>
              </button>
              {isLimitReached && (
                <p className="text-[11px] text-center text-red-500 font-medium leading-tight font-dm-sans">
                  Free limit reached (30 mins / 3 sessions)
                </p>
              )}
              <div className="flex items-center justify-center gap-1.5 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 py-1.5 px-3 rounded-full border border-emerald-500/20">
                <ShieldCheck size={14} className="text-emerald-500" />
                <span className="text-[11px] font-bold tracking-tight font-dm-sans">Presenter Privacy Shield • Draggable • Taskbar Hidden</span>
              </div>
            </div>
          ) : isRecording ? (
            <div className="w-full p-4 border border-red-500/30 bg-red-500/10 rounded-xl flex flex-col items-center justify-center gap-3">
              <div className="flex items-center gap-2 text-red-500 font-semibold animate-pulse text-sm">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                {resumingInfo ? 'Resumed Session' : 'Session Active'} • {formatTime(recordingTime + (resumingInfo?.prevDuration || 0))}
              </div>
              <p className="text-[11px] text-muted-foreground text-center font-dm-sans">
                Floating co-pilot active above your meeting tabs. Drag anywhere on screen.
              </p>
              <button 
                onClick={stopRecording} 
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-semibold shadow-sm text-sm active:scale-[0.98]"
              >
                <Square size={15} fill="currentColor" />
                Stop & Save Meeting
              </button>
            </div>
          ) : (
            <div className="w-full p-4 border border-orange-500/30 bg-orange-500/10 rounded-xl flex flex-col items-center justify-center gap-2 text-voiceflow-orange font-semibold font-dm-sans">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-sm">Processing Meeting & Notes...</span>
            </div>
          )}
        </div>

        {/* Upcoming meetings */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-bold text-foreground">Upcoming meetings</h3>
            {(googleConnected || outlookConnected) && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 size={11} /> Synced
              </span>
            )}
          </div>
          
          <button 
            onClick={() => router.push('/dashboard/notetaker')}
            className="w-full flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted transition-colors mb-4 bg-card/60 group"
          >
            <span className="text-sm font-semibold text-foreground group-hover:text-voiceflow-orange transition-colors">AI Notetaker settings</span>
            <Settings size={16} className="text-muted-foreground group-hover:text-voiceflow-orange transition-colors" />
          </button>

          <div className="flex items-center justify-between mb-3">
            <button 
              onClick={() => {
                window.dispatchEvent(new CustomEvent('open-settings-modal', { detail: { tab: 'calendar' } }));
              }}
              className="flex items-center gap-1.5 text-xs font-bold text-foreground hover:bg-muted px-2 py-1 rounded transition-colors"
            >
              <Calendar size={13} className="text-muted-foreground" />
              Calendar Integrations
              <ExternalLink size={11} className="text-muted-foreground ml-0.5" />
            </button>
            <button 
              onClick={handleRefreshCalendar}
              title="Refresh Calendar Sync"
              className="p-1.5 text-muted-foreground hover:bg-muted rounded-full transition-colors"
            >
              <RefreshCw size={13} className={isSyncingCalendar ? 'animate-spin text-voiceflow-orange' : ''} />
            </button>
          </div>

          {(googleConnected || outlookConnected) ? (
            <div className="space-y-2.5 mb-4">
              {/* Meeting Item 1 */}
              <div className="p-3 bg-card border border-border rounded-xl shadow-xs hover:border-voiceflow-orange/50 transition-all">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div>
                    <h4 className="text-xs font-bold text-foreground line-clamp-1">Product & Architecture Review</h4>
                    <span className="text-[11px] text-muted-foreground font-medium">10:00 AM • Google Meet</span>
                  </div>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 shrink-0">Meet</span>
                </div>
                <button
                  onClick={() => {
                    if (isLimitReached) {
                      window.dispatchEvent(new CustomEvent('open-billing-modal'));
                      return;
                    }
                    startRecording(false);
                  }}
                  className="w-full mt-2 py-1.5 px-2.5 rounded-lg bg-voiceflow-orange hover:bg-orange-600 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                >
                  <Play size={12} fill="currentColor" />
                  Join & Start Notetaker
                </button>
              </div>

              {/* Meeting Item 2 */}
              <div className="p-3 bg-card border border-border rounded-xl shadow-xs hover:border-blue-500/50 transition-all">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div>
                    <h4 className="text-xs font-bold text-foreground line-clamp-1">Client Discovery & Scope Demo</h4>
                    <span className="text-[11px] text-muted-foreground font-medium">02:30 PM • Microsoft Teams</span>
                  </div>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 shrink-0">Teams</span>
                </div>
                <button
                  onClick={() => {
                    if (isLimitReached) {
                      window.dispatchEvent(new CustomEvent('open-billing-modal'));
                      return;
                    }
                    startRecording(false);
                  }}
                  className="w-full mt-2 py-1.5 px-2.5 rounded-lg bg-card hover:bg-muted border border-border text-foreground font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                >
                  <Play size={12} fill="currentColor" />
                  Join & Start Notetaker
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground leading-relaxed mb-3">
                Looks like you don't have any upcoming meetings linked yet from <span className="font-semibold text-foreground">{userEmail}</span>.
              </div>
              
              <div className="text-xs text-muted-foreground leading-relaxed mb-3">
                Connect your calendars to automatically sync meeting schedules and launch the notetaker:
              </div>

              <div className="flex items-center gap-2">
                <button onClick={handleGoogleLink} className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-border rounded-lg hover:bg-muted transition-colors bg-card font-semibold text-xs text-foreground shadow-xs">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                  Google
                </button>
                <button onClick={handleMicrosoftLink} className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-border rounded-lg hover:bg-muted transition-colors bg-card font-semibold text-xs text-foreground shadow-xs">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 21 21">
                      <path fill="#f25022" d="M1 1h9v9H1z"/>
                      <path fill="#7fba00" d="M11 1h9v9h-9z"/>
                      <path fill="#00a4ef" d="M1 11h9v9H1z"/>
                      <path fill="#ffb900" d="M11 11h9v9h-9z"/>
                  </svg>
                  Outlook
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      )}
    </>
  );
}
