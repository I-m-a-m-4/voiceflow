"use client";

import React, { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { FileText, Calendar, Clock, Download, ChevronRight } from 'lucide-react';
import { useAuth } from '@/firebase';
import { getUserMeetings, MeetingData } from '@/firebase/meetings';
import { Loader2 } from 'lucide-react';

export default function NotetakerPage() {
  const [autoStart, setAutoStart] = useState(true);
  const [autoJoin, setAutoJoin] = useState(false);
  const [summaryDetail, setSummaryDetail] = useState('standard');
  const auth = useAuth();
  
  const [meetings, setMeetings] = useState<(MeetingData & { id: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  React.useEffect(() => {
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
    <div className="p-8 w-full h-full flex flex-col">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">AI Meeting Notetaker</h1>
        <p className="text-gray-500 dark:text-gray-400">Configure how VoiceFlow listens to your conversations and generates summaries.</p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1">
        
        {/* Left Column - Settings */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-[#111111] border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-6">Automation Settings</h2>
            
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-bold text-gray-900 dark:text-white mb-1">Auto-Start Notetaker</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 max-w-md">Automatically begin listening and transcribing when a supported meeting is detected (Zoom, Teams, Meet).</div>
                </div>
                <Switch checked={autoStart} onCheckedChange={setAutoStart} className="data-[state=checked]:bg-voiceflow-orange" />
              </div>

              <div className="flex items-start justify-between pt-6 border-t border-gray-100 dark:border-gray-800/50">
                <div>
                  <div className="text-sm font-bold text-gray-900 dark:text-white mb-1">Auto-join Calendar Events</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 max-w-md">VoiceFlow will automatically join meetings listed in your connected Google or Outlook calendar.</div>
                </div>
                <Switch checked={autoJoin} onCheckedChange={setAutoJoin} className="data-[state=checked]:bg-voiceflow-orange" />
              </div>

              <div className="pt-6 border-t border-gray-100 dark:border-gray-800/50">
                <div className="text-sm font-bold text-gray-900 dark:text-white mb-3">Summary Detail Level</div>
                <div className="grid grid-cols-3 gap-3">
                  {['brief', 'standard', 'comprehensive'].map((level) => (
                    <button 
                      key={level}
                      onClick={() => setSummaryDetail(level)}
                      className={`py-3 px-4 rounded-xl border text-sm font-medium transition-all capitalize ${
                        summaryDetail === level 
                          ? 'border-voiceflow-orange bg-orange-50 dark:bg-orange-500/10 text-voiceflow-orange ring-1 ring-voiceflow-orange/50' 
                          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-[#161616] text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700'
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
              <h2 className="text-lg font-bold mb-2">Want better summaries?</h2>
              <p className="text-white/80 text-sm mb-4 max-w-sm">Provide VoiceFlow with context about your role and company in the Live Answers settings to get hyper-tailored notes.</p>
              <button className="bg-white text-orange-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-50 transition-colors">
                Configure Context
              </button>
            </div>
            <FileText className="absolute -right-4 -bottom-4 w-32 h-32 text-white/10" />
          </div>
        </div>

        {/* Right Column - History Preview */}
        <div className="bg-white dark:bg-[#111111] border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm flex flex-col h-[500px]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Recent Transcripts</h2>
            <button className="text-xs text-voiceflow-orange hover:text-orange-600 font-semibold">View all</button>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 space-y-3">
            {isLoading ? (
              <div className="flex justify-center items-center h-20">
                <Loader2 className="w-6 h-6 animate-spin text-voiceflow-orange" />
              </div>
            ) : meetings.length === 0 ? (
              <div className="text-center text-sm text-gray-500 py-8">
                No recent transcripts found.
              </div>
            ) : (
              meetings.map((meeting) => {
                const dateObj = meeting.createdAt?.toDate ? meeting.createdAt.toDate() : new Date(meeting.createdAt);
                const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                return (
                  <div key={meeting.id} className="group p-4 border border-gray-100 dark:border-gray-800/60 rounded-xl hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-[#161616] transition-all cursor-pointer">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2 group-hover:text-voiceflow-orange transition-colors">
                      {meeting.summary ? 'AI Summary' : 'Raw Transcript'}
                    </h3>
                    <div className="flex flex-wrap gap-y-2 gap-x-4 text-xs text-gray-500 dark:text-gray-400">
                      <div className="flex items-center gap-1.5"><Calendar size={12} /> {dateStr}</div>
                      <div className="flex items-center gap-1.5"><Clock size={12} /> {meeting.type === 'dictation' ? 'Dictation' : 'Meeting'}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-gray-800 mt-auto">
            <button className="w-full flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors py-2">
              <Download size={16} />
              Export all data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
