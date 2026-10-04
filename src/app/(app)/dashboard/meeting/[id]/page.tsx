"use client";

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, Copy, Mail, Play, Sparkles, Send } from 'lucide-react';
import { useAuth } from '@/firebase';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function MeetingDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const auth = useAuth();
  const [meeting, setMeeting] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'transcript' | 'usage'>('summary');

  useEffect(() => {
    const fetchMeeting = async () => {
      if (!auth?.currentUser?.uid || !params.id) return;
      try {
        const docRef = doc(db, `users/${auth.currentUser.uid}/meetings/${params.id}`);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setMeeting({ id: docSnap.id, ...docSnap.data() });
        } else {
          console.log("No such document!");
        }
      } catch (error) {
        console.error("Error fetching meeting:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchMeeting();
  }, [auth?.currentUser?.uid, params.id]);

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
      {/* Top Nav (simplified for detail view context) */}
      <div className="flex items-center gap-4 px-6 py-4 sticky top-0 bg-[#0f0f0f]/95 backdrop-blur z-20 border-b border-white/5">
        <button onClick={() => router.back()} className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-300">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1" />
      </div>

      <div className="max-w-4xl mx-auto w-full px-6 py-8 pb-32">
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
            <button className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors">
              <RefreshCw size={14} />
              Regenerate
            </button>
            <button className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-200 transition-colors">
              <Copy size={14} />
              Copy summary
            </button>
          </div>
        </div>

        {/* Content Area */}
        {activeTab === 'summary' && (
          <div className="space-y-8 animate-fade-up">
            {meeting.summary ? (
              <div className="prose prose-invert prose-orange max-w-none">
                {/* Simulated structured summary if it's just plain text, or render as is */}
                <div className="whitespace-pre-wrap leading-relaxed text-[15px] text-gray-300">
                  {meeting.summary}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-gray-500 gap-4">
                <Sparkles size={32} className="text-gray-600 mb-2" />
                <p>No AI summary generated for this meeting yet.</p>
                <button className="px-4 py-2 bg-voiceflow-orange text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors mt-2">
                  Generate Summary
                </button>
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
                <span className="text-gray-200">Unknown</span>
              </li>
              <li className="flex justify-between border-b border-white/5 pb-2">
                <span>Words spoken</span>
                <span className="text-gray-200">{meeting.transcript?.split(' ').length || 0}</span>
              </li>
              <li className="flex justify-between border-b border-white/5 pb-2">
                <span>Type</span>
                <span className="text-gray-200 capitalize">{meeting.type || 'Meeting'}</span>
              </li>
            </ul>
          </div>
        )}
      </div>

      {/* Floating Bottom Input Bar */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-[240px] p-6 bg-gradient-to-t from-[#0f0f0f] via-[#0f0f0f]/90 to-transparent pointer-events-none flex justify-center z-30">
        <div className="w-full max-w-2xl bg-[#1a1a1a] rounded-full border border-white/10 p-1.5 flex items-center shadow-2xl pointer-events-auto">
          <button className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 rounded-full text-sm font-medium text-white transition-colors shrink-0">
            <Play size={14} className="fill-white" />
            Resume Session
          </button>
          <input
            type="text"
            placeholder="Ask about this meeting..."
            className="flex-1 bg-transparent border-none outline-none ring-0 focus:ring-0 text-sm text-white placeholder:text-gray-500 px-4 h-full min-h-[36px]"
          />
          <button className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-gray-300 transition-colors shrink-0">
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
