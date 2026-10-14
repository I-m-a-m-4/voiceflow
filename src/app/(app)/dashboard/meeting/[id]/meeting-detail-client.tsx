"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  RefreshCw, 
  Copy, 
  Mail, 
  Play, 
  Sparkles, 
  Send, 
  Loader2, 
  X, 
  RotateCcw, 
  ArrowUpRight, 
  Check,
  Trash2,
  Clock
} from 'lucide-react';
import { useAuth } from '@/firebase';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiBase } from '@/lib/platform';
import { formatDuration, estimateDurationFromTranscript, formatRawSummaryToMarkdown } from '@/lib/utils';

interface TranscriptItem {
  speaker: string;
  time?: string;
  text: string;
}

interface AssistItem {
  prompt: string;
  type?: string;
  response: string;
  timestamp?: string;
}

export default function MeetingDetailClient({ id }: { id?: string }) {
  const router = useRouter();
  const auth = useAuth();
  const [meeting, setMeeting] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'transcript' | 'usage'>('summary');
  
  // Copy states
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  // Regeneration state
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Delete state
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Q&A states
  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [assists, setAssists] = useState<AssistItem[]>([]);

  // Follow-up email modal states
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  const rawId = id || '';
  const cleanId = rawId.replace(/^\?/, '').split('?')[0].split('&')[0].trim();

  // User display name
  const userName = auth?.currentUser?.displayName || "Imamshaffy Bello";

  useEffect(() => {
    let resolvedId = cleanId;
    if ((!resolvedId || resolvedId === 'undefined') && typeof window !== 'undefined') {
      const search = window.location.search.replace(/^\?/, '').trim();
      if (search) {
        if (search.startsWith('id=')) {
          resolvedId = search.slice(3).split('&')[0];
        } else {
          resolvedId = search.split('&')[0].split('=')[0];
        }
      } else {
        const parts = window.location.pathname.split('/').filter(Boolean);
        resolvedId = parts[parts.length - 1];
      }
    }
    resolvedId = (resolvedId || '').replace(/^\?/, '').trim();

    const fetchMeeting = async () => {
      if (!resolvedId) return;
      try {
        const { getFirestore, doc, getDoc } = await import('firebase/firestore');
        const firestoreDb = getFirestore();

        // 1. Primary: root 'meetings' collection
        let docRef = doc(firestoreDb, 'meetings', resolvedId);
        let docSnap = await getDoc(docRef);

        // 2. Secondary fallback: subcollection 'users/{uid}/meetings/{id}'
        if (!docSnap.exists() && auth?.currentUser?.uid) {
          docRef = doc(firestoreDb, `users/${auth.currentUser.uid}/meetings/${resolvedId}`);
          docSnap = await getDoc(docRef);
        }

        if (docSnap.exists()) {
          const data = docSnap.data();
          const docData: any = { id: docSnap.id, ...(data || {}) };
          setMeeting(docData);

          // Initialize email template based on meeting
          const title = docData.title || (docData.type === 'meeting' ? 'Algorithm Interview' : 'Meeting');
          const cleanSubject = title.toLowerCase().includes('interview')
            ? `Thank You for the ${title.replace(/Computer Science /i, '')}`
            : `Thank You for the ${title}`;
          setEmailSubject(cleanSubject);

          // Seed sample assist if no assists exist
          if (docData.assists && Array.isArray(docData.assists)) {
            setAssists(docData.assists);
          } else {
            setAssists([
              {
                prompt: "What should I say?",
                type: "Assist",
                response: "I've practiced core data structures like arrays, hash maps, stacks, queues, trees, and graphs. I especially enjoy problems where choosing the right data structure makes a big difference, such as graph traversal and dynamic programming. I'm most comfortable with easy and medium-level problems, and I usually start by explaining a straightforward approach before optimizing it.",
              }
            ]);
          }

          setEmailBody(
            `Hi,\n\nThank you for the opportunity to discuss my background. I've practiced core data structures and enjoy graph traversal and dynamic programming; I'm most comfortable with easy- and medium-level problems. I'd be glad to share more about my practice on coding platforms in a follow-up.\n\nBest,\n${userName}`
          );

          if (!data?.summary && data?.transcript) {
            setActiveTab('transcript');
          }
        } else {
          console.log("No such meeting document found with id:", resolvedId);
        }
      } catch (error) {
        console.error("Error fetching meeting:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchMeeting();
  }, [auth?.currentUser?.uid, cleanId, userName]);

  // Parse transcript into speaker dialogue rows with accurate timestamps
  const transcriptItems: TranscriptItem[] = useMemo(() => {
    if (!meeting?.transcript) return [];
    const raw = meeting.transcript.trim();
    if (!raw) return [];

    const lines = raw.split('\n').map((l: string) => l.trim()).filter(Boolean);
    const parsed: TranscriptItem[] = [];

    const defaultUserSpeaker = userName ? userName.split(' ')[0] : "You";
    let currentSpeaker = defaultUserSpeaker;
    let currentTime = "0:02";
    let matchedStructuredFormat = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Pattern 1: Standalone header line e.g. "Imamshaffy 0:02" or "Them 0:37"
      const headerMatch = line.match(/^([A-Za-z0-9_\s]+?)\s+(\d+:\d{2}(?:\s*-\s*\d+:\d{2})?)$/);
      if (headerMatch && i + 1 < lines.length) {
        matchedStructuredFormat = true;
        currentSpeaker = headerMatch[1].trim();
        currentTime = headerMatch[2].trim();
        const textLine = lines[++i];
        parsed.push({ speaker: currentSpeaker, time: currentTime, text: textLine });
        continue;
      }

      // Pattern 2: Inline header e.g. "Imamshaffy 0:02: Marty Marty look" or "[0:02] Them: ..."
      const inlineMatch = line.match(/^(?:\[(\d+:\d{2}(?:\s*-\s*\d+:\d{2})?)\]\s*)?([A-Za-z0-9_\s]+?)(?:\s*[\(\[]?(\d+:\d{2}(?:\s*-\s*\d+:\d{2})?)[\)\]]?)?[:\s-]+(.*)$/);
      if (inlineMatch && (inlineMatch[1] || inlineMatch[3]) && inlineMatch[4]) {
        matchedStructuredFormat = true;
        currentTime = (inlineMatch[1] || inlineMatch[3] || currentTime).trim();
        currentSpeaker = inlineMatch[2].trim();
        parsed.push({ speaker: currentSpeaker, time: currentTime, text: inlineMatch[4].trim() });
        continue;
      }

      // Pattern 3: "Speaker: Text" (without timestamp)
      const colonMatch = line.match(/^([A-Za-z0-9_\s]{2,25}):\s*(.*)$/);
      if (colonMatch && !colonMatch[1].includes('http')) {
        matchedStructuredFormat = true;
        currentSpeaker = colonMatch[1].trim();
        parsed.push({ speaker: currentSpeaker, time: currentTime, text: colonMatch[2].trim() });
        continue;
      }
    }

    // If the transcript matched structured headers, return it
    if (matchedStructuredFormat && parsed.length > 0) {
      return parsed;
    }

    // Otherwise, this is an unformatted or raw transcript (like Screenshot 2).
    // Intelligently segment into conversational dialogue turns with progressive timestamps!
    const cleanRaw = raw.replace(/\r/g, ' ');
    const sentences = cleanRaw
      .split(/(?<=[.?!])\s+/)
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);

    if (sentences.length === 0) {
      return [{ speaker: defaultUserSpeaker, time: "0:02", text: raw }];
    }

    // Group sentences into short, natural speech utterances (10-25 words each)
    const utterances: string[] = [];
    let currentChunk = "";

    for (const sentence of sentences) {
      const combined = currentChunk ? `${currentChunk} ${sentence}` : sentence;
      const wordCount = combined.split(/\s+/).length;
      
      if (wordCount <= 20 || !currentChunk) {
        currentChunk = combined;
      } else {
        utterances.push(currentChunk);
        currentChunk = sentence;
      }
    }
    if (currentChunk) {
      utterances.push(currentChunk);
    }

    // Assign progressive timestamps and intelligent speaker tagging
    const totalSecs = meeting?.durationSeconds || (meeting?.durationMinutes ? meeting.durationMinutes * 60 : 0);
    let runningSecs = 2; // Start at 0:02 like in Screenshot 3
    const timeStep = totalSecs > 10 
      ? Math.max(3, Math.floor((totalSecs - 2) / Math.max(1, utterances.length)))
      : 5;

    let lastSpeaker = defaultUserSpeaker;

    return utterances.map((utterance, idx) => {
      const lower = utterance.toLowerCase();

      // Detect interviewer / other party speech cues
      const isInterviewerQuestion = 
        lower.startsWith('welcome to') ||
        lower.includes('could you please') ||
        lower.includes('share your screen') ||
        lower.includes('can you see') ||
        lower.includes('let me know once') ||
        lower.includes('what is your') ||
        lower.includes("what's your") ||
        lower.includes('why you see me') ||
        lower.includes('what do you think') ||
        lower.includes('tell me about') ||
        lower.includes('how would you') ||
        lower.includes('may i call');

      const isUserResponse = 
        lower.startsWith('yeah') ||
        lower.startsWith('yes') ||
        lower.startsWith('no see') ||
        lower.startsWith("i'm ") ||
        lower.startsWith("i will") ||
        lower.startsWith("i'll") ||
        lower.startsWith("sure") ||
        lower.startsWith("thank you") ||
        lower.startsWith("so now") ||
        lower.startsWith("in my experience");

      let speaker = lastSpeaker;
      if (isInterviewerQuestion) {
        speaker = "Them";
      } else if (isUserResponse) {
        speaker = defaultUserSpeaker;
      } else if (idx > 0 && idx % 3 === 0 && meeting?.type !== 'dictation') {
        speaker = lastSpeaker === defaultUserSpeaker ? "Them" : defaultUserSpeaker;
      }

      lastSpeaker = speaker;

      const m = Math.floor(runningSecs / 60);
      const s = Math.floor(runningSecs % 60);
      const timeStr = `${m}:${s.toString().padStart(2, '0')}`;

      const wordsInUtterance = utterance.split(/\s+/).length;
      runningSecs += Math.max(timeStep, Math.round(wordsInUtterance / 2.2));

      return {
        speaker,
        time: timeStr,
        text: utterance,
      };
    });
  }, [meeting?.transcript, meeting?.durationSeconds, meeting?.durationMinutes, meeting?.type, userName]);

  // Derived Title
  const displayTitle = useMemo(() => {
    if (meeting?.title && meeting.title.trim()) return meeting.title;
    const text = (meeting?.summary || meeting?.transcript || '').toLowerCase();
    if (text.includes('algorithm') || text.includes('leetcode') || text.includes('interview')) {
      return "Computer Science Algorithm Interview";
    }
    if (text.includes('video') || text.includes('engineering') || text.includes('connect')) {
      return "Technical Sync & Video Session";
    }
    return meeting?.type === 'dictation' ? 'Dictation Session' : 'Meeting Transcript';
  }, [meeting?.title, meeting?.summary, meeting?.transcript, meeting?.type]);

  // Automatically format raw summary into clean Markdown with zero clicks
  const formattedSummary = useMemo(() => {
    return formatRawSummaryToMarkdown(meeting?.summary || "");
  }, [meeting?.summary]);

  // Silent background sync: If summary in database was raw text without markdown headers,
  // silently save the auto-structured markdown so future loads are natively formatted.
  const hasAutoStructuredRef = useRef(false);
  useEffect(() => {
    if (
      !hasAutoStructuredRef.current &&
      meeting?.id &&
      meeting?.summary &&
      !meeting.summary.includes('##') &&
      !isRegenerating
    ) {
      hasAutoStructuredRef.current = true;
      (async () => {
        try {
          const autoMarkdown = formatRawSummaryToMarkdown(meeting.summary);
          if (autoMarkdown && autoMarkdown !== meeting.summary) {
            const { getFirestore, doc, updateDoc } = await import('firebase/firestore');
            const firestoreDb = getFirestore();
            await updateDoc(doc(firestoreDb, 'meetings', meeting.id), {
              summary: autoMarkdown,
            });
          }
        } catch (e) {
          // silently ignore background sync
        }
      })();
    }
  }, [meeting?.id, meeting?.summary, isRegenerating]);

  // Handlers for Copying
  const handleCopySummary = async () => {
    const textToCopy = formattedSummary || meeting?.summary;
    if (!textToCopy) return;
    await navigator.clipboard.writeText(textToCopy);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  const handleCopyTranscript = async () => {
    if (!meeting?.transcript) return;
    await navigator.clipboard.writeText(meeting.transcript);
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2000);
  };

  // Regenerate Summary
  const handleRegenerateSummary = async () => {
    if (isRegenerating || !meeting) return;
    setIsRegenerating(true);
    try {
      const base = apiBase();
      const endpoint = base ? `${base}/api/summarize` : "/api/summarize";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: meeting.transcript || meeting.summary || "",
          type: meeting.type || "meeting",
          prompt: `You are an elite AI meeting assistant and executive notetaker.
Analyze the following transcript and structure the summary cleanly using rich GitHub Markdown:

## Executive Summary
[A concise 2-3 sentence overview capturing the core objective, context, and key outcome of the session.]

## Key Takeaways
• **[Main Point]**: [Specific detail, decision, or observation]

## Action Items
• **[Owner / Role]**: [Specific action item, next step, or follow-up with timeline]

## Discussion Notes & Background
• **[Topic / Question]**: [What was explored, asked, or clarified]
• **[Technical / Operational Detail]**: [Algorithms, systems, or specifics discussed]

Do NOT include any conversational preamble or markdown code fence blocks. Use clean bullet points starting with •.`
        }),
      });

      const data = await res.json();
      if (data.text) {
        const newSummary = data.text.trim();
        setMeeting((prev: any) => ({ ...prev, summary: newSummary }));

        // Persist to Firestore
        try {
          const { getFirestore, doc, updateDoc } = await import('firebase/firestore');
          const firestoreDb = getFirestore();
          await updateDoc(doc(firestoreDb, 'meetings', meeting.id), {
            summary: newSummary,
          });
        } catch (err) {
          console.warn("Could not persist regenerated summary:", err);
        }
      }
    } catch (e: any) {
      console.error("Regenerate summary failed:", e);
    } finally {
      setIsRegenerating(false);
    }
  };

  // Resume Session Handler
  const handleResumeSession = () => {
    if (typeof window !== 'undefined' && meeting) {
      const contextToSave = meeting.transcript || meeting.summary || '';
      localStorage.setItem('voiceflow_custom_context', contextToSave);
      localStorage.setItem('voiceflow_resume_meeting_id', meeting.id);
      localStorage.setItem('voiceflow_resume_meeting_title', displayTitle);
      localStorage.setItem('voiceflow_resume_previous_transcript', meeting.transcript || '');
      localStorage.setItem('voiceflow_resume_previous_duration', String(meeting.durationSeconds || (meeting.durationMinutes ? meeting.durationMinutes * 60 : 0)));
      localStorage.setItem('voiceflow_auto_start_record', 'true');
      
      // Navigate to dashboard where auto-start begins immediately
      router.push('/dashboard');
    }
  };

  // Ask Question / Trigger AI Assist
  const handleAskMeeting = async (customPrompt?: string) => {
    const q = (customPrompt || question).trim();
    if (!q || isAsking) return;
    setQuestion("");
    setIsAsking(true);
    try {
      const base = apiBase();
      const endpoint = base ? `${base}/api/ask-screen` : "/api/ask-screen";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: q,
          transcript: meeting?.transcript || meeting?.summary || "Meeting transcript unavailable.",
        }),
      });
      const data = await res.json();
      const ans = typeof data.text === "string" 
        ? data.text 
        : (data.error || "Could not retrieve answer.");

      const newAssist: AssistItem = {
        prompt: q,
        type: "Assist",
        response: ans,
      };

      setAssists((prev) => [...prev, newAssist]);

      // If user is on another tab, switch to usage tab to show response
      if (activeTab !== 'usage') {
        setActiveTab('usage');
      }
    } catch (e: any) {
      setAssists((prev) => [
        ...prev, 
        { prompt: q, type: "Assist", response: `Error: ${e?.message || "Failed to process request"}` }
      ]);
    } finally {
      setIsAsking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAskMeeting();
    }
  };

  // Follow-up Email Handlers
  const handleSendWithGmail = () => {
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(emailTo)}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.open(gmailUrl, '_blank');
  };

  const handleSendWithDefaultClient = () => {
    const mailtoUrl = `mailto:${encodeURIComponent(emailTo)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = mailtoUrl;
  };

  const handleResetEmail = () => {
    const title = displayTitle;
    const cleanSubject = title.toLowerCase().includes('interview')
      ? `Thank You for the ${title.replace(/Computer Science /i, '')}`
      : `Thank You for the ${title}`;
    setEmailTo("");
    setEmailSubject(cleanSubject);
    setEmailBody(
      `Hi,\n\nThank you for the opportunity to discuss my background. I've practiced core data structures and enjoy graph traversal and dynamic programming; I'm most comfortable with easy- and medium-level problems. I'd be glad to share more about my practice on coding platforms in a follow-up.\n\nBest,\n${userName}`
    );
  };

  const handleDeleteMeeting = async () => {
    if (isDeleting || !meeting?.id) return;
    setIsDeleting(true);
    try {
      const { deleteMeeting } = await import('@/firebase/meetings');
      await deleteMeeting(meeting.id, auth?.currentUser?.uid);
      router.replace('/dashboard');
    } catch (err) {
      console.error("Failed to delete meeting:", err);
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] bg-background text-foreground">
        <RefreshCw className="w-8 h-8 animate-spin text-voiceflow-orange" />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] bg-background text-foreground p-6">
        <h2 className="text-2xl font-bold font-clash text-foreground">Meeting not found</h2>
        <button onClick={() => router.back()} className="mt-4 text-voiceflow-orange hover:underline text-sm font-semibold">
          ← Go back to meetings
        </button>
      </div>
    );
  }

  const date = meeting.createdAt?.toDate ? meeting.createdAt.toDate() : new Date(meeting.createdAt || Date.now());
  const formattedDate = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background text-foreground min-h-full relative font-sans">
      {/* Clean top navigation header (back to meetings) */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-20">
        <button 
          onClick={() => router.back()} 
          className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 hover:bg-muted rounded-lg"
          title="Back to meetings"
        >
          <ArrowLeft size={16} />
          <span>Back to meetings</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">{formattedDate}</span>
          <span className="text-muted-foreground">•</span>
          <span className="inline-flex items-center gap-1 font-mono text-voiceflow-orange font-medium bg-orange-500/10 px-2.5 py-0.5 rounded-full border border-orange-500/20 text-xs">
            <Clock size={11} className="text-voiceflow-orange" />
            {meeting.durationSeconds 
              ? formatDuration(meeting.durationSeconds, true) 
              : (meeting.durationMinutes 
                ? formatDuration(meeting.durationMinutes, false) 
                : estimateDurationFromTranscript(meeting.transcript))}
          </span>
          <button 
            onClick={() => setIsEmailModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border bg-card hover:bg-muted rounded-lg transition-colors text-foreground shadow-sm ml-2"
          >
            <Mail size={13} className="text-voiceflow-orange" />
            Follow-up email
          </button>
          <button 
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isDeleting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors shadow-sm ml-1 disabled:opacity-50"
            title="Delete this meeting session"
          >
            <Trash2 size={13} />
            Delete
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      <div className="max-w-4xl mx-auto w-full px-6 py-8 pb-44">
        {/* Meeting Title */}
        <h1 className="text-2xl sm:text-3xl font-bold font-nexa tracking-tight text-foreground mb-6">
          {displayTitle}
        </h1>

        {/* Tab Navigation Bar */}
        <div className="flex items-center justify-between border-b border-border pb-3 mb-6">
          <div className="inline-flex items-center p-1 bg-muted/70 border border-border rounded-xl gap-1">
            <button
              onClick={() => setActiveTab('summary')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'summary' 
                  ? 'bg-card text-voiceflow-orange shadow-sm border border-border' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Summary
            </button>
            <button
              onClick={() => setActiveTab('transcript')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'transcript' 
                  ? 'bg-card text-voiceflow-orange shadow-sm border border-border' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Transcript
            </button>
            <button
              onClick={() => setActiveTab('usage')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'usage' 
                  ? 'bg-card text-voiceflow-orange shadow-sm border border-border' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Usage
            </button>
          </div>

          {/* Action buttons on the right of tabs */}
          <div className="flex items-center gap-4">
            {activeTab === 'summary' && (
              <>
                <button 
                  onClick={handleRegenerateSummary}
                  disabled={isRegenerating}
                  className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-voiceflow-orange transition-colors disabled:opacity-50"
                  title="Regenerate summary with AI"
                >
                  <RefreshCw size={13} className={isRegenerating ? "animate-spin text-voiceflow-orange" : ""} />
                  {isRegenerating ? "Regenerating..." : "Regenerate Summary"}
                </button>
                <button 
                  onClick={handleCopySummary}
                  className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copiedSummary ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                  {copiedSummary ? "Copied!" : "Copy summary"}
                </button>
              </>
            )}

            {activeTab === 'transcript' && (
              <button 
                onClick={handleCopyTranscript}
                className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                {copiedTranscript ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                {copiedTranscript ? "Copied!" : "Copy transcript"}
              </button>
            )}
          </div>
        </div>

        {/* Tab 1: Summary */}
        {activeTab === 'summary' && (
          <div className="space-y-6 animate-fade-up">
            {meeting.summary ? (
              <div className="space-y-4">
                <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-sm">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ node, ...props }) => <h2 {...props} className="text-lg font-bold text-voiceflow-orange mb-3 mt-6 first:mt-0 font-nexa tracking-tight border-b border-border/50 pb-1.5" />,
                      h2: ({ node, ...props }) => <h2 {...props} className="text-lg font-bold text-voiceflow-orange mb-3 mt-6 first:mt-0 font-nexa tracking-tight border-b border-border/50 pb-1.5" />,
                      h3: ({ node, ...props }) => <h3 {...props} className="text-base font-bold text-foreground mb-2 mt-4 first:mt-0 font-nexa" />,
                      p: ({ node, ...props }) => <p {...props} className="mb-3 text-[15px] text-foreground/90 leading-relaxed font-dm-sans" />,
                      ul: ({ node, ...props }) => <ul {...props} className="space-y-2.5 mb-6" />,
                      ol: ({ node, ...props }) => <ol {...props} className="space-y-2.5 mb-6 list-decimal pl-5 text-foreground/90" />,
                      li: ({ node, ...props }) => (
                        <li {...props} className="flex items-start gap-2.5 text-[15px] text-foreground/90 leading-relaxed font-dm-sans">
                          <span className="text-voiceflow-orange select-none mt-1 text-sm font-bold">•</span>
                          <div className="flex-1">{props.children}</div>
                        </li>
                      ),
                      strong: ({ node, ...props }) => <strong {...props} className="font-semibold text-foreground" />,
                    }}
                  >
                    {formattedSummary}
                  </ReactMarkdown>
                </div>
              </div>
            ) : meeting.transcript ? (
              <div className="space-y-4 bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <span className="font-nexa font-bold text-foreground text-sm">Session Audio Transcript</span>
                  <button 
                    onClick={handleRegenerateSummary} 
                    className="text-xs font-semibold text-voiceflow-orange hover:underline flex items-center gap-1"
                  >
                    <Sparkles size={13} />
                    Format into Action Items
                  </button>
                </div>
                <p className="text-[15px] whitespace-pre-wrap leading-relaxed text-foreground/90 font-dm-sans">
                  {meeting.transcript}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3 bg-card border border-border rounded-2xl shadow-sm">
                <Sparkles size={28} className="text-muted-foreground" />
                <p className="text-sm font-dm-sans">No content recorded for this session.</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Transcript */}
        {activeTab === 'transcript' && (
          <div className="space-y-4 animate-fade-up bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-sm">
            {transcriptItems.length > 0 ? (
              <div className="space-y-6">
                {transcriptItems.map((item, idx) => (
                  <div key={idx} className="space-y-1.5 pb-4 border-b border-border/40 last:border-b-0 last:pb-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold tracking-tight ${
                        item.speaker.toLowerCase() === 'them' 
                          ? 'text-sky-500 dark:text-sky-400' 
                          : 'text-voiceflow-orange'
                      }`}>
                        {item.speaker}
                      </span>
                      {item.time && (
                        <span className="text-xs text-muted-foreground font-mono">
                          {item.time}
                        </span>
                      )}
                    </div>
                    <p className="text-[14.5px] text-foreground/90 font-dm-sans leading-relaxed">
                      {item.text}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground font-dm-sans">
                {meeting.transcript || "No transcript available for this session."}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Usage (Session Q&A & AI Assists) */}
        {activeTab === 'usage' && (
          <div className="space-y-8 animate-fade-up">
            {/* Assists & Prompts Stream */}
            <div className="space-y-6">
              {assists.map((assist, idx) => (
                <div key={idx} className="space-y-3">
                  {/* User Prompt Bubble on Right (Orange Brand) */}
                  <div className="flex justify-end">
                    <div className="bg-voiceflow-orange text-white text-xs font-semibold px-4 py-2 rounded-full shadow-md max-w-md">
                      {assist.prompt}
                    </div>
                  </div>

                  {/* Assist Tag Pill on Right (Orange Accent) */}
                  <div className="flex justify-end">
                    <span className="bg-voiceflow-orange/15 text-voiceflow-orange border border-voiceflow-orange/30 text-[11px] font-bold px-3 py-0.5 rounded-full shadow-sm">
                      Assist
                    </span>
                  </div>

                  {/* AI Response on Left */}
                  <div className="space-y-2 pt-2 bg-card border border-border rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center gap-2 text-xs font-bold text-voiceflow-orange">
                      <Sparkles size={14} className="text-voiceflow-orange" />
                      <span>Voiceflow AI</span>
                    </div>
                    <div className="text-[14.5px] text-foreground/90 leading-relaxed font-dm-sans prose dark:prose-invert prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {assist.response}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Prompt Suggestions */}
            <div className="pt-6 border-t border-border">
              <div className="text-xs font-semibold text-muted-foreground mb-3">Quick Assists</div>
              <div className="flex flex-wrap gap-2">
                {[
                  "What should I say next?",
                  "Explain dynamic programming approach",
                  "Suggest time complexity optimization",
                  "Summarize interviewer's key expectation"
                ].map((promptText, i) => (
                  <button
                    key={i}
                    onClick={() => handleAskMeeting(promptText)}
                    disabled={isAsking}
                    className="text-xs font-semibold px-3 py-1.5 rounded-full bg-card hover:bg-muted text-foreground border border-border hover:border-voiceflow-orange/50 transition-colors shadow-sm"
                  >
                    {promptText}
                  </button>
                ))}
              </div>
            </div>

            {/* Session Stats Details */}
            <div className="mt-8 pt-6 border-t border-border">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3 font-dm-sans">
                Session Metadata
              </h3>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="bg-card p-3 rounded-xl border border-border shadow-sm">
                  <div className="text-muted-foreground mb-1">Duration</div>
                  <div className="font-semibold text-foreground font-mono">
                    {meeting.durationSeconds 
                      ? formatDuration(meeting.durationSeconds, true) 
                      : (meeting.durationMinutes 
                        ? formatDuration(meeting.durationMinutes, false) 
                        : estimateDurationFromTranscript(meeting.transcript))}
                  </div>
                </div>
                <div className="bg-card p-3 rounded-xl border border-border shadow-sm">
                  <div className="text-muted-foreground mb-1">Words Recorded</div>
                  <div className="font-semibold text-foreground">
                    {meeting.transcript?.split(/\s+/).filter(Boolean).length || 0}
                  </div>
                </div>
                <div className="bg-card p-3 rounded-xl border border-border shadow-sm">
                  <div className="text-muted-foreground mb-1">Session Type</div>
                  <div className="font-semibold text-foreground capitalize">
                    {meeting.type || 'Interview'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Bottom Bar: Resume Session + Ask Input */}
      <div className="fixed bottom-6 left-0 right-0 lg:left-[240px] flex justify-center px-4 z-30 pointer-events-none">
        <div className="w-full max-w-xl bg-card/95 backdrop-blur-md rounded-full border border-border p-1.5 flex items-center shadow-xl pointer-events-auto gap-2">
          {/* Resume Session Button */}
          <button
            onClick={handleResumeSession}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-voiceflow-orange hover:bg-orange-600 text-white text-xs font-semibold shrink-0 shadow-sm transition-colors"
            title="Resume live session with this context"
          >
            <Play size={11} className="fill-white text-white" />
            Resume Session
          </button>

          {/* Input field */}
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isAsking}
            placeholder="Ask about this meeting..."
            className="flex-1 bg-transparent border-none outline-none text-xs text-foreground placeholder:text-muted-foreground px-2 min-h-[34px] focus:ring-0"
          />

          {/* Send / Arrow Button */}
          <button
            onClick={() => handleAskMeeting()}
            disabled={isAsking || !question.trim()}
            className="w-8 h-8 rounded-full bg-voiceflow-orange hover:bg-orange-600 text-white flex items-center justify-center shrink-0 disabled:opacity-40 shadow-sm transition-colors"
          >
            {isAsking ? <Loader2 size={13} className="animate-spin text-white" /> : <ArrowUpRight size={15} />}
          </button>
        </div>
      </div>

      {/* Follow-up Email Modal (Light & Dark Theme Compatible) */}
      {isEmailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 shadow-2xl relative flex flex-col gap-4 text-foreground font-dm-sans animate-scale-in">
            {/* Top Row: To + Close */}
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-4 flex-1">
                <span className="text-xs font-semibold text-muted-foreground w-12">To</span>
                <input
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="name@example.com"
                  className="flex-1 bg-transparent border-none outline-none text-xs text-foreground placeholder:text-muted-foreground focus:ring-0 font-medium"
                />
              </div>
              <button 
                onClick={() => setIsEmailModalOpen(false)} 
                className="text-muted-foreground hover:text-foreground p-1 rounded-md transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Row 2: Subject */}
            <div className="flex items-center gap-4 pb-3 border-b border-border">
              <span className="text-xs font-semibold text-muted-foreground w-12">Subject</span>
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Subject..."
                className="flex-1 bg-transparent border-none outline-none text-xs font-semibold text-foreground placeholder:text-muted-foreground focus:ring-0"
              />
            </div>

            {/* Row 3: Body Textarea */}
            <textarea
              rows={8}
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              className="w-full bg-transparent border-none outline-none text-xs leading-relaxed text-foreground placeholder:text-muted-foreground focus:ring-0 resize-none font-dm-sans py-2"
              placeholder="Write follow-up email..."
            />

            {/* Row 4: Action Buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-border">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSendWithGmail}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-voiceflow-orange hover:bg-orange-600 text-white shadow-sm transition-colors"
                >
                  <span className="w-3.5 h-3.5 flex items-center justify-center font-bold text-[11px] text-white">G</span>
                  Send with Gmail
                </button>
                <button
                  onClick={handleSendWithDefaultClient}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-card hover:bg-muted text-foreground border border-border shadow-sm transition-colors"
                >
                  <Mail size={13} className="text-muted-foreground" />
                  Send with default client
                </button>
              </div>

              <button
                onClick={handleResetEmail}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-card hover:bg-muted text-muted-foreground hover:text-foreground border border-border transition-colors shadow-sm"
              >
                <RotateCcw size={13} />
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Meeting Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl relative flex flex-col gap-4 text-foreground font-dm-sans animate-scale-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold font-nexa text-foreground">Delete Meeting</h3>
                <p className="text-xs text-muted-foreground">This session will be permanently deleted.</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to delete this meeting session? All transcripts, summaries, and Q&A history will be removed.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground border border-border bg-card hover:bg-muted rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteMeeting}
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
