"use client";

import React, { useEffect, useState } from 'react';
import { Calendar, Video, RefreshCw, Settings, Mic, Square, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
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
        startRecording(false);
      }
    };
    window.addEventListener('voiceflow-toggle-record', handleToggle);
    return () => window.removeEventListener('voiceflow-toggle-record', handleToggle);
  }, [isRecording, stopRecording, startRecording, isLimitReached]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleGoogleLink = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
      await linkWithPopup(firebaseAuth.currentUser!, provider);
      alert('Google Calendar successfully linked!');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/credential-already-in-use') {
        alert('This Google account is already linked to another user.');
      } else {
        alert('Failed to link Google account.');
      }
    }
  };

  const handleMicrosoftLink = async () => {
    try {
      const provider = new OAuthProvider('microsoft.com');
      provider.addScope('Calendars.Read');
      await linkWithPopup(firebaseAuth.currentUser!, provider);
      alert('Microsoft Calendar successfully linked!');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/credential-already-in-use') {
        alert('This Microsoft account is already linked to another user.');
      } else {
        alert('Failed to link Microsoft account.');
      }
    }
  };

  return (
    <div className="w-full lg:w-[320px] h-auto lg:h-full bg-muted/30 border-t lg:border-t-0 border-l border-border flex flex-col shrink-0 overflow-y-visible lg:overflow-y-auto p-6">
      
      {/* Floating Undetectable Widget (visible during recording & draggable) */}
      <MeetingWidget 
        isRecording={isRecording} 
        stopRecording={stopRecording} 
        transcript={transcript} 
      />

      {/* Voiceflow Co-Pilot Control */}
      <div className="mb-8">
        <h3 className="text-[15px] font-bold text-foreground mb-1">Voiceflow Co-Pilot</h3>
        <p className="text-[11px] font-medium text-muted-foreground mb-3">Stealth real-time notetaker & live assistant</p>
        
        {!isRecording && !isProcessing ? (
          <div className="space-y-3">
            <button 
              onClick={() => {
                if (isLimitReached) {
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('open-billing-modal'));
                  }
                  return;
                }
                startRecording(false);
              }} 
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl transition-all font-semibold shadow-md active:scale-[0.98] ${
                isLimitReached 
                  ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/10" 
                  : "bg-voiceflow-orange hover:bg-orange-600 text-white shadow-orange-500/10"
              }`}
              title={isLimitReached ? "Upgrade to Pro to start a new session" : "Launch Voiceflow Floating Assistant and start live listening"}
            >
              <Mic size={18} />
              {isLimitReached ? "Upgrade to Start (Limit Reached)" : "Start Voiceflow"}
            </button>
            <div className="flex items-center justify-center gap-1.5 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 py-1.5 px-3 rounded-full border border-emerald-500/20">
              <ShieldCheck size={14} className="text-emerald-500" />
              <span className="text-[11px] font-bold tracking-tight">100% Undetectable • Draggable • Taskbar Hidden</span>
            </div>
          </div>
        ) : isRecording ? (
          <div className="w-full p-4 border border-red-500/30 bg-red-500/10 rounded-xl flex flex-col items-center justify-center gap-3">
            <div className="flex items-center gap-2 text-red-500 font-semibold animate-pulse text-sm">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
              Session Active • {formatTime(recordingTime)}
            </div>
            <p className="text-[11px] text-muted-foreground text-center">
              Floating widget active above your meeting tabs. Drag anywhere on screen.
            </p>
            <button 
              onClick={stopRecording} 
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-semibold shadow-sm text-sm"
            >
              <Square size={15} fill="currentColor" />
              Stop & Save Meeting
            </button>
          </div>
        ) : (
          <div className="w-full p-4 border border-orange-500/30 bg-orange-500/10 rounded-xl flex flex-col items-center justify-center gap-2 text-voiceflow-orange font-semibold">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-sm">Processing Meeting & Notes...</span>
          </div>
        )}
      </div>

      {/* Upcoming meetings */}
      <div>
        <h3 className="text-[15px] font-bold text-foreground mb-3">Upcoming meetings</h3>
        
        <button className="w-full flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted transition-colors mb-4 bg-transparent">
          <span className="text-sm font-semibold text-foreground">AI Notetaker settings</span>
          <Settings size={16} className="text-muted-foreground" />
        </button>

        <div className="flex items-center justify-between mb-4">
          <button className="flex items-center gap-1.5 text-sm font-bold text-foreground hover:bg-muted px-2 py-1 rounded">
            <Calendar size={14} className="text-muted-foreground" />
            Calendar
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground ml-0.5"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <button className="p-1.5 text-muted-foreground hover:bg-muted rounded-full transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="text-sm text-muted-foreground leading-relaxed mb-4">
          Looks like you don't have any upcoming meetings with a conferencing link from <span className="font-semibold">{userEmail}</span>.
        </div>
        
        <div className="text-sm text-muted-foreground leading-relaxed mb-4">
          You can connect to additional calendars.
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleGoogleLink} className="flex-1 flex items-center justify-center gap-2 py-2 border border-border rounded-lg hover:bg-muted transition-colors bg-background font-semibold text-sm text-foreground shadow-sm">
            <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            Google
          </button>
          <button onClick={handleMicrosoftLink} className="flex-1 flex items-center justify-center gap-2 py-2 border border-border rounded-lg hover:bg-muted transition-colors bg-background font-semibold text-sm text-foreground shadow-sm">
            <svg className="h-4 w-4" viewBox="0 0 21 21">
                <path fill="#f25022" d="M1 1h9v9H1z"/>
                <path fill="#7fba00" d="M11 1h9v9h-9z"/>
                <path fill="#00a4ef" d="M1 11h9v9H1z"/>
                <path fill="#ffb900" d="M11 11h9v9h-9z"/>
            </svg>
            Outlook
          </button>
        </div>

      </div>
    </div>
  );
}
