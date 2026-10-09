"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, Copy, Mail, Play, Sparkles, Send, Loader2, Bot, User } from 'lucide-react';
import { useAuth } from '@/firebase';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const auth = useAuth();
  const { id } = React.use(params);
  const [meeting, setMeeting] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'transcript' | 'usage'>('summary');
  const [copied, setCopied] = useState(false);
  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [qaHistory, setQaHistory] = useState<{ q: string; a: string }[]>([]);

  const rawId = id || '';
  const cleanId = rawId.replace(/^\?/, '').split('?')[0].split('&')[0].trim();

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

        // 1. Primary: root 'meetings' collection (where saveMeeting stores docs)
        let docRef = doc(firestoreDb, 'meetings', resolvedId);
        let docSnap = await getDoc(docRef);

        // 2. Secondary fallback: subcollection 'users/{uid}/meetings/{id}'
        if (!docSnap.exists() && auth?.currentUser?.uid) {
          docRef = doc(firestoreDb, `users/${auth.currentUser.uid}/meetings/${resolvedId}`);
          docSnap = await getDoc(docRef);
        }

        if (docSnap.exists()) {
          const data = docSnap.data();
          setMeeting({ id: docSnap.id, ...data });
          // If no summary was generated, switch automatically to transcript tab
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
  }, [auth?.currentUser?.uid, cleanId]);

  const handleCopySummary = async () => {
    if (!meeting?.summary) return;
    await navigator.clipboard.writeText(meeting.summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAskMeeting = async () => {
    if (!question.trim() || isAsking) return;
    const q = question.trim();
    setQuestion("");
    setIsAsking(true);
    try {
      const res = await fetch("/api/ask-screen", {
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
      setQaHistory((prev) => [...prev, { q, a: ans }]);
    } catch (e: any) {
      setQaHistory((prev) => [...prev, { q, a: `Error: ${e?.message || "Failed to process request"}` }]);
    } finally {
      setIsAsking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAskMeeting();
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-background">
        <RefreshCw className="w-8 h-8 animate-spin text-voiceflow-orange" />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-background">
        <h2 className="text-2xl font-bold font-clash text-foreground">Meeting not found</h2>
        <button onClick={() => router.back()} className="mt-4 text-voiceflow-orange hover:underline">
          Go back
        </button>
      </div>
    );
  }

  const date = meeting.createdAt?.toDate ? meeting.createdAt.toDate() : new Date(meeting.createdAt || Date.now());
  const formattedDate = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#0f0f0f] h-full overflow-y-auto relative text-gray-100">
      {/* Top Nav */}
      <div className="flex items-center gap-4 px-6 py-4 sticky top-0 bg-[#0f0f0f]/95 backdrop-blur z-20 border-b border-white/5">
        <button onClick={() => router.back()} className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-300">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1" />
      </div>

      <div className="max-w-4xl mx-auto w-full px-6 py-8 pb-40">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-medium text-gray-400">{formattedDate}</div>
          <button className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-white/10 rounded-md hover:bg-white/5 transition-colors text-white">
            <Mail size={14} />
            Follow-up email
          </button>
        </div>

        <h1 className="text-3xl font-bold font-clash tracking-tight text-white mb-8">
          {meeting.title || (meeting.type === 'dictation' ? 'Dictation Session' : 'Meeting Transcript')}
        </h1>

        <div className="flex items-center justify-between border-b border-white/10 mb-8">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setActiveTab('summary')}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'summary' ? 'border-voiceflow-orange text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
            >
              Summary
            </button>
            <button
              onClick={() => setActiveTab('transcript')}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'transcript' ? 'border-voiceflow-orange text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
            >
              Transcript
            </button>
            <button
              onClick={() => setActiveTab('usage')}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'usage' ? 'border-voiceflow-orange text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
            >
              Usage
            </button>
          </div>
          <div className="flex items-center gap-4 hidden sm:flex">
            <button 
              onClick={handleCopySummary}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors"
            >
              <Copy size={14} />
              {copied ? "Copied!" : "Copy summary"}
            </button>
          </div>
        </div>

        {/* Content Area */}
        {activeTab === 'summary' && (
          <div className="space-y-8 animate-fade-up">
            {meeting.summary ? (
              <div className="prose prose-invert prose-orange max-w-none bg-white/5 p-6 rounded-2xl border border-white/10 text-gray-200">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ node, ...props }) => <p {...props} className="mb-3 last:mb-0 leading-relaxed text-[15px]" />,
                    ol: ({ node, ...props }) => <ol {...props} className="list-decimal pl-6 mb-3 space-y-1.5 marker:text-voiceflow-orange marker:font-semibold" />,
                    ul: ({ node, ...props }) => <ul {...props} className="list-disc pl-6 mb-3 space-y-1.5 marker:text-voiceflow-orange" />,
                    li: ({ node, ...props }) => <li {...props} className="pl-1 leading-relaxed text-[15px]" />,
                    strong: ({ node, ...props }) => <strong {...props} className="font-semibold text-white" />,
                    h1: ({ node, ...props }) => <h1 {...props} className="text-xl font-bold text-white mb-3 mt-4 first:mt-0 font-clash" />,
                    h2: ({ node, ...props }) => <h2 {...props} className="text-lg font-bold text-white mb-2 mt-4 first:mt-0 font-clash" />,
                    h3: ({ node, ...props }) => <h3 {...props} className="text-base font-semibold text-white mb-2 mt-3 first:mt-0" />,
                  }}
                >
                  {meeting.summary}
                </ReactMarkdown>
              </div>
            ) : meeting.transcript ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs font-semibold text-gray-400 px-1">
                  <span>Raw Transcript</span>
                  <span className="text-voiceflow-orange">Full captured audio text</span>
                </div>
                <div className="bg-white/5 p-6 rounded-2xl border border-white/10 text-gray-200">
                  <p className="text-[15px] whitespace-pre-wrap leading-relaxed font-mono">
                    {meeting.transcript}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500 gap-4">
                <Sparkles size={32} className="text-gray-600 mb-2" />
                <p>No content recorded for this session.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'transcript' && (
          <div className="animate-fade-up">
            <div className="p-6 bg-white/5 rounded-2xl border border-white/10">
               <p className="text-[15px] text-gray-300 whitespace-pre-wrap leading-relaxed font-mono">
                 {meeting.transcript || "No transcript available."}
               </p>
            </div>
          </div>
        )}

        {activeTab === 'usage' && (
          <div className="animate-fade-up p-6 bg-white/5 rounded-2xl border border-white/10">
            <h3 className="text-lg font-bold text-white mb-4">Meeting Details</h3>
            <ul className="space-y-3 text-sm text-gray-400">
              <li className="flex justify-between border-b border-white/5 pb-2">
                <span>Duration</span>
                <span className="text-gray-200">{meeting.durationMinutes ? `${meeting.durationMinutes} mins` : 'Recorded session'}</span>
              </li>
              <li className="flex justify-between border-b border-white/5 pb-2">
                <span>Words spoken</span>
                <span className="text-gray-200">{meeting.transcript?.split(/\s+/).filter(Boolean).length || 0}</span>
              </li>
              <li className="flex justify-between border-b border-white/5 pb-2">
                <span>Type</span>
                <span className="text-gray-200 capitalize">{meeting.type || 'Meeting'}</span>
              </li>
            </ul>
          </div>
        )}

        {/* Q&A Section */}
        {qaHistory.length > 0 && (
          <div className="mt-10 space-y-4 pt-6 border-t border-white/10">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">Meeting Q&A</h3>
            {qaHistory.map((item, idx) => (
              <div key={idx} className="space-y-2 bg-white/5 p-4 rounded-xl border border-white/5">
                <div className="flex items-center gap-2 text-xs font-semibold text-voiceflow-orange">
                  <User size={14} />
                  <span>{item.q}</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-gray-200 pl-4 border-l-2 border-white/10">
                  <Bot size={15} className="text-blue-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed flex-1 prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ node, ...props }) => <p {...props} className="mb-2 last:mb-0 leading-relaxed" />,
                        ol: ({ node, ...props }) => <ol {...props} className="list-decimal pl-5 mb-2 space-y-1 marker:text-voiceflow-orange" />,
                        ul: ({ node, ...props }) => <ul {...props} className="list-disc pl-5 mb-2 space-y-1 marker:text-voiceflow-orange" />,
                        li: ({ node, ...props }) => <li {...props} className="pl-1" />,
                        strong: ({ node, ...props }) => <strong {...props} className="font-semibold text-white" />,
                      }}
                    >
                      {item.a}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Bottom Input Bar */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-[240px] p-6 bg-gradient-to-t from-[#0f0f0f] via-[#0f0f0f]/90 to-transparent pointer-events-none flex justify-center z-30">
        <div className="w-full max-w-2xl bg-[#1a1a1a] rounded-full border border-white/10 p-1.5 flex items-center shadow-2xl pointer-events-auto">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isAsking}
            placeholder="Ask about this meeting transcript..."
            className="flex-1 bg-transparent border-none outline-none ring-0 focus:ring-0 text-sm text-white placeholder:text-gray-500 px-4 h-full min-h-[36px] disabled:opacity-50"
          />
          <button 
            onClick={handleAskMeeting}
            disabled={isAsking || !question.trim()}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-voiceflow-orange hover:bg-orange-600 text-white transition-colors shrink-0 disabled:opacity-40"
          >
            {isAsking ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
