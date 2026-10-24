"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Calendar, Video, RefreshCw, Settings, Mic, Square, Loader2, 
  Sparkles, CheckCircle2, Play, ExternalLink, Plus, Trash2, X 
} from 'lucide-react';
import { useAuth, auth as firebaseAuth } from '@/firebase';
import { 
  GoogleAuthProvider, 
  OAuthProvider, 
  linkWithPopup, 
  reauthenticateWithPopup, 
  signInWithPopup 
} from 'firebase/auth';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { usePlanUsage } from '@/hooks/use-plan-usage';
import { useToast } from '@/hooks/use-toast';
import { openExternal } from '@/lib/platform';
import MeetingWidget from './meeting-widget';

interface UpcomingMeeting {
  id: string;
  title: string;
  time: string;
  platform: string;
  url: string;
}

export default function RightPanel() {
  const auth = useAuth();
  const { toast } = useToast();
  const userEmail = auth?.currentUser?.email || 'user@example.com';
  
  const { startRecording, stopRecording, isRecording, isProcessing, transcript } = useAudioRecorder();
  const { isPro, sessionCount, maxFreeSessions, isLimitReached, bonusMinutes, maxMinutes } = usePlanUsage();
  
  const [recordingTime, setRecordingTime] = useState(0);
  const [resumingInfo, setResumingInfo] = useState<{ id: string; title: string; prevDuration: number } | null>(null);
  const router = useRouter();
  const [googleConnected, setGoogleConnected] = useState(false);
  const [outlookConnected, setOutlookConnected] = useState(false);
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false);

  // Custom upcoming meetings management
  const [meetings, setMeetings] = useState<UpcomingMeeting[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('voiceflow_upcoming_meetings');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            // Strip out legacy mock/hardcoded meetings
            const cleaned = parsed.filter(
              (m: any) =>
                m.title !== 'Product & Architecture Review' &&
                m.title !== 'Client Discovery & Scope Demo'
            );
            if (cleaned.length !== parsed.length) {
              localStorage.setItem('voiceflow_upcoming_meetings', JSON.stringify(cleaned));
            }
            return cleaned;
          }
        }
      } catch (e) {}
    }
    return [];
  });

  const [isAddingMeeting, setIsAddingMeeting] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newTime, setNewTime] = useState('');

  // Sync calendar integration status
  useEffect(() => {
    const updateCalendarState = () => {
      if (typeof window !== 'undefined') {
        const g = localStorage.getItem('voiceflow_google_calendar_connected') === 'true';
        const o = localStorage.getItem('voiceflow_outlook_calendar_connected') === 'true';
        setGoogleConnected(g);
        setOutlookConnected(o);

        try {
          const savedMeetings = localStorage.getItem('voiceflow_upcoming_meetings');
          if (savedMeetings) {
            const parsed = JSON.parse(savedMeetings);
            if (Array.isArray(parsed)) {
              const cleaned = parsed.filter(
                (m: any) =>
                  m.title !== 'Product & Architecture Review' &&
                  m.title !== 'Client Discovery & Scope Demo'
              );
              setMeetings(cleaned);
              if (cleaned.length !== parsed.length) {
                localStorage.setItem('voiceflow_upcoming_meetings', JSON.stringify(cleaned));
              }
            }
          } else {
            setMeetings([]);
          }
        } catch (e) {}
      }
    };

    updateCalendarState();
    window.addEventListener('voiceflow-calendar-updated', updateCalendarState);
    return () => window.removeEventListener('voiceflow-calendar-updated', updateCalendarState);
  }, []);

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
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
      provider.setCustomParameters({ prompt: 'consent select_account' });

      let userCred: any;
      if (firebaseAuth.currentUser) {
        try {
          userCred = await linkWithPopup(firebaseAuth.currentUser, provider);
        } catch (linkErr: any) {
          if (linkErr.code === 'auth/provider-already-linked' || linkErr.code === 'auth/credential-already-in-use') {
            userCred = await reauthenticateWithPopup(firebaseAuth.currentUser, provider);
          } else {
            userCred = await signInWithPopup(firebaseAuth, provider);
          }
        }
      } else {
        userCred = await signInWithPopup(firebaseAuth, provider);
      }

      setGoogleConnected(true);
      if (typeof window !== 'undefined') {
        localStorage.setItem('voiceflow_google_calendar_connected', 'true');
        window.dispatchEvent(new CustomEvent('voiceflow-calendar-updated'));
      }

      // Fetch real events from Google Calendar API
      const credential = GoogleAuthProvider.credentialFromResult(userCred);
      const token = credential?.accessToken;
      if (token) {
        try {
          const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${new Date().toISOString()}&maxResults=6&singleEvents=true&orderBy=startTime`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            const realMeetings = (data.items || []).map((item: any) => ({
              id: item.id,
              title: item.summary || 'Meeting Session',
              time: item.start?.dateTime ? new Date(item.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'All Day',
              platform: (item.hangoutLink || item.location || '').includes('meet.google') ? 'Meet' : (item.location || '').includes('teams') ? 'Teams' : (item.location || '').includes('zoom') ? 'Zoom' : 'Meet',
              url: item.hangoutLink || (item.location?.startsWith('http') ? item.location : 'https://meet.google.com/new')
            }));
            if (realMeetings.length > 0) {
              setMeetings(realMeetings);
              if (typeof window !== 'undefined') {
                localStorage.setItem('voiceflow_upcoming_meetings', JSON.stringify(realMeetings));
              }
            }
          }
        } catch (fetchErr) {
          console.warn("Could not fetch Google Calendar events:", fetchErr);
        }
      }

      toast({
        title: "Google Calendar Connected",
        description: "Your Google Meet & calendar schedules are now synced with Voiceflow.",
      });
    } catch (err: any) {
      const isCancellation =
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request' ||
        err?.code === 'auth/user-cancelled';
      if (!isCancellation) {
        console.warn("Google calendar connection error:", err);
        toast({
          variant: "destructive",
          title: "Calendar Link Failed",
          description: err?.message || "Failed to link Google Calendar.",
        });
      }
    }
  };

  const handleMicrosoftLink = async () => {
    try {
      const provider = new OAuthProvider('microsoft.com');
      provider.addScope('Calendars.Read');
      provider.setCustomParameters({ prompt: 'select_account' });

      if (firebaseAuth.currentUser) {
        try {
          await linkWithPopup(firebaseAuth.currentUser, provider);
        } catch (linkErr: any) {
          if (linkErr.code === 'auth/provider-already-linked' || linkErr.code === 'auth/credential-already-in-use') {
            await reauthenticateWithPopup(firebaseAuth.currentUser, provider);
          } else {
            await signInWithPopup(firebaseAuth, provider);
          }
        }
      } else {
        await signInWithPopup(firebaseAuth, provider);
      }

      setOutlookConnected(true);
      if (typeof window !== 'undefined') {
        localStorage.setItem('voiceflow_outlook_calendar_connected', 'true');
        window.dispatchEvent(new CustomEvent('voiceflow-calendar-updated'));
      }
      toast({
        title: "Outlook Calendar Connected",
        description: "Your Microsoft Teams meetings are now linked with Voiceflow.",
      });
    } catch (err: any) {
      const isCancellation =
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request' ||
        err?.code === 'auth/user-cancelled';
      if (!isCancellation) {
        console.warn("Microsoft calendar connection error:", err);
        if (err?.code === 'auth/operation-not-allowed' || err?.code === 'auth/configuration-not-found') {
          toast({
            variant: "destructive",
            title: "Microsoft OAuth Notice",
            description: "To connect Microsoft, enable Microsoft Provider in Firebase Console. You can also connect Google Calendar or add meeting links directly.",
          });
        } else {
          toast({
            variant: "destructive",
            title: "Outlook Connection Failed",
            description: err?.message || "Failed to connect to Outlook.",
          });
        }
      }
    }
  };

  const handleDisconnectCalendar = (providerName: 'google' | 'outlook') => {
    if (providerName === 'google') {
      setGoogleConnected(false);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('voiceflow_google_calendar_connected');
        window.dispatchEvent(new CustomEvent('voiceflow-calendar-updated'));
      }
      toast({ title: 'Google Calendar Disconnected', description: 'Google Calendar has been unlinked.' });
    } else {
      setOutlookConnected(false);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('voiceflow_outlook_calendar_connected');
        window.dispatchEvent(new CustomEvent('voiceflow-calendar-updated'));
      }
      toast({ title: 'Outlook Calendar Disconnected', description: 'Outlook Calendar has been unlinked.' });
    }
  };

  const handleRefreshCalendar = () => {
    setIsSyncingCalendar(true);
    setTimeout(() => {
      setIsSyncingCalendar(false);
      window.dispatchEvent(new CustomEvent('voiceflow-calendar-updated'));
      toast({ title: "Meetings Refreshed", description: "Upcoming calendar items updated." });
    }, 600);
  };

  const handleAddMeeting = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    let platform = 'Meet';
    const lowerUrl = newUrl.toLowerCase();
    if (lowerUrl.includes('teams') || lowerUrl.includes('microsoft')) {
      platform = 'Teams';
    } else if (lowerUrl.includes('zoom')) {
      platform = 'Zoom';
    } else if (lowerUrl.includes('webex')) {
      platform = 'Webex';
    }

    const meetingItem: UpcomingMeeting = {
      id: Date.now().toString(),
      title: newTitle.trim(),
      time: newTime.trim() || 'Today',
      platform,
      url: newUrl.trim() || (platform === 'Meet' ? 'https://meet.google.com/new' : 'https://teams.microsoft.com')
    };

    const updated = [meetingItem, ...meetings];
    setMeetings(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('voiceflow_upcoming_meetings', JSON.stringify(updated));
    }
    setNewTitle('');
    setNewUrl('');
    setNewTime('');
    setIsAddingMeeting(false);
    toast({
      title: "Meeting Added",
      description: `"${meetingItem.title}" is ready. Click Join & Start Notetaker to launch.`,
    });
  };

  const handleDeleteMeeting = (id: string) => {
    const updated = meetings.filter(m => m.id !== id);
    setMeetings(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('voiceflow_upcoming_meetings', JSON.stringify(updated));
    }
  };

  const handleJoinAndStart = async (meeting: UpcomingMeeting) => {
    if (isLimitReached) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('open-billing-modal'));
      }
      return;
    }
    if (meeting.url) {
      await openExternal(meeting.url);
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('voiceflow_active_meeting_title', meeting.title);
    }
    startRecording(false);
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
        <div className="w-full lg:w-[320px] h-full bg-muted/30 border-t lg:border-t-0 border-l border-border flex flex-col shrink-0 overflow-y-auto p-6 font-dm-sans">
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
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl transition-all font-semibold shadow-sm active:scale-[0.98] bg-voiceflow-orange hover:bg-orange-600 text-white shadow-orange-500/20"
                title={isLimitReached ? "Upgrade to Pro to start a new session" : "Launch Voiceflow Floating Assistant and start live listening"}
              >
                {isLimitReached ? (
                  <Sparkles size={18} className="shrink-0 fill-white" />
                ) : (
                  <Mic size={18} className="shrink-0" />
                )}
                <span className="text-sm font-bold tracking-tight whitespace-nowrap font-nexa">
                  {isLimitReached ? "Upgrade Plan to Start" : resumingInfo ? "Resume Recording" : "Start Voiceflow"}
                </span>
              </button>
              {isLimitReached && (
                <p className="text-[11px] text-center text-voiceflow-orange font-medium leading-tight font-dm-sans">
                  {bonusMinutes > 0
                    ? `All ${maxMinutes} credits depleted • Click to Upgrade`
                    : 'Free limit reached (30 mins / 3 sessions) • Click to Upgrade'}
                </p>
              )}
            </div>
          ) : isRecording ? (
            <div className="w-full p-4 border border-orange-500/30 bg-orange-500/10 rounded-xl flex flex-col items-center justify-center gap-3">
              <div className="flex items-center gap-2 text-voiceflow-orange font-semibold animate-pulse text-sm">
                <div className="w-2.5 h-2.5 rounded-full bg-voiceflow-orange"></div>
                {resumingInfo ? 'Resumed Session' : 'Session Active'} • {formatTime(recordingTime + (resumingInfo?.prevDuration || 0))}
              </div>
              <p className="text-[11px] text-muted-foreground text-center font-dm-sans">
                Floating co-pilot active above your meeting tabs. Drag anywhere on screen.
              </p>
              <button 
                onClick={stopRecording} 
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-voiceflow-orange text-white rounded-lg hover:bg-orange-600 transition-colors font-semibold shadow-sm text-sm active:scale-[0.98]"
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
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setIsAddingMeeting(!isAddingMeeting)}
                title="Add Meeting Link"
                className="p-1.5 text-muted-foreground hover:bg-muted rounded-full transition-colors hover:text-voiceflow-orange"
              >
                <Plus size={14} />
              </button>
              <button 
                onClick={handleRefreshCalendar}
                title="Refresh Calendar Sync"
                className="p-1.5 text-muted-foreground hover:bg-muted rounded-full transition-colors"
              >
                <RefreshCw size={13} className={isSyncingCalendar ? 'animate-spin text-voiceflow-orange' : ''} />
              </button>
            </div>
          </div>

          {/* Quick Add Meeting Form */}
          {isAddingMeeting && (
            <form onSubmit={handleAddMeeting} className="p-3 mb-3 bg-card border border-voiceflow-orange/40 rounded-xl space-y-2 animate-fade-in shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">Add Meeting Call</span>
                <button type="button" onClick={() => setIsAddingMeeting(false)} className="text-muted-foreground hover:text-foreground">
                  <X size={14} />
                </button>
              </div>
              <input 
                type="text" 
                placeholder="Meeting Title (e.g. Design Sync)" 
                value={newTitle} 
                onChange={e => setNewTitle(e.target.value)}
                className="w-full text-xs p-2 rounded-lg border border-border bg-background focus:outline-none focus:border-voiceflow-orange"
                required
              />
              <input 
                type="text" 
                placeholder="Meeting Link (Meet, Zoom, or Teams URL)" 
                value={newUrl} 
                onChange={e => setNewUrl(e.target.value)}
                className="w-full text-xs p-2 rounded-lg border border-border bg-background focus:outline-none focus:border-voiceflow-orange"
              />
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Time (e.g. 03:00 PM)" 
                  value={newTime} 
                  onChange={e => setNewTime(e.target.value)}
                  className="w-2/3 text-xs p-2 rounded-lg border border-border bg-background focus:outline-none focus:border-voiceflow-orange"
                />
                <button 
                  type="submit"
                  className="w-1/3 bg-voiceflow-orange hover:bg-orange-600 text-white font-bold text-xs py-2 rounded-lg transition-colors"
                >
                  Save
                </button>
              </div>
            </form>
          )}

          {meetings.length > 0 ? (
            <div className="space-y-2.5 mb-4">
              {meetings.map((meeting) => (
                <div key={meeting.id} className="p-3 bg-card border border-border rounded-xl shadow-xs hover:border-voiceflow-orange/50 transition-all group/item">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-foreground truncate">{meeting.title}</h4>
                      <span className="text-[11px] text-muted-foreground font-medium">{meeting.time} • {meeting.platform}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        meeting.platform === 'Teams' 
                          ? 'bg-blue-500/10 text-blue-600' 
                          : meeting.platform === 'Zoom'
                            ? 'bg-indigo-500/10 text-indigo-600'
                            : 'bg-emerald-500/10 text-emerald-600'
                      }`}>
                        {meeting.platform}
                      </span>
                      <button 
                        onClick={() => handleDeleteMeeting(meeting.id)}
                        className="opacity-0 group-hover/item:opacity-100 text-muted-foreground hover:text-red-500 p-0.5 transition-opacity"
                        title="Remove meeting"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => handleJoinAndStart(meeting)}
                    className="w-full mt-2 py-1.5 px-2.5 rounded-lg bg-voiceflow-orange hover:bg-orange-600 text-white font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-sm transition-colors active:scale-[0.98]"
                  >
                    <Play size={12} fill="currentColor" />
                    Join & Start Notetaker
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-dashed border-border bg-card/40 text-center mb-3">
              <Calendar size={18} className="mx-auto text-muted-foreground/60 mb-1.5" />
              <p className="text-xs font-semibold text-foreground">No upcoming meetings</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 mb-2.5 leading-relaxed">
                Connect your Google or Outlook calendar below, or click + to add a custom meeting link.
              </p>
              <button
                type="button"
                onClick={() => setIsAddingMeeting(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-voiceflow-orange/10 hover:bg-voiceflow-orange/20 text-voiceflow-orange font-bold text-xs transition-colors cursor-pointer"
              >
                <Plus size={13} />
                <span>Add Meeting Call</span>
              </button>
            </div>
          )}

          {/* Connected Calendar Quick Status & Links */}
          <div className="pt-2 border-t border-border/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-muted-foreground">Accounts</span>
              {(googleConnected || outlookConnected) && (
                <span className="text-[10px] text-muted-foreground">Click to unlink</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={googleConnected ? () => handleDisconnectCalendar('google') : handleGoogleLink} 
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 border rounded-lg transition-colors font-semibold text-xs shadow-xs ${
                  googleConnected 
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20' 
                    : 'border-border bg-card hover:bg-muted text-foreground'
                }`}
                title={googleConnected ? "Google Calendar connected. Click to disconnect." : "Click to connect Google Calendar."}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                {googleConnected ? 'Google ✓' : 'Google'}
              </button>
              <button 
                onClick={outlookConnected ? () => handleDisconnectCalendar('outlook') : handleMicrosoftLink} 
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 border rounded-lg transition-colors font-semibold text-xs shadow-xs ${
                  outlookConnected 
                    ? 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20' 
                    : 'border-border bg-card hover:bg-muted text-foreground'
                }`}
                title={outlookConnected ? "Outlook Calendar connected. Click to disconnect." : "Click to connect Outlook Calendar."}
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 21 21">
                  <path fill="#f25022" d="M1 1h9v9H1z"/>
                  <path fill="#7fba00" d="M11 1h9v9h-9z"/>
                  <path fill="#00a4ef" d="M1 11h9v9H1z"/>
                  <path fill="#ffb900" d="M11 11h9v9h-9z"/>
                </svg>
                {outlookConnected ? 'Outlook ✓' : 'Outlook'}
              </button>
            </div>
          </div>
        </div>
      </div>
      )}
    </>
  );
}
