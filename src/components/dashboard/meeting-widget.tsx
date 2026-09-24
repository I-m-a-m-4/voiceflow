"use client";

import React, { useState } from 'react';
import { ChevronDown, Square, Sparkles, Wand2, MessageSquare, RotateCcw, MoreHorizontal, Play, Send, Loader2 } from 'lucide-react';
import { captureScreenBase64 } from '@/lib/capture-screen';

interface MeetingWidgetProps {
  isRecording: boolean;
  stopRecording: () => void;
  transcript?: string;
}

export default function MeetingWidget({ isRecording, stopRecording, transcript }: MeetingWidgetProps) {
  const [isHidden, setIsHidden] = useState(false);
  const [query, setQuery] = useState("");
  const [isQuerying, setIsQuerying] = useState(false);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  
  if (!isRecording) return null;

  const handleAskAI = async (customPrompt?: string) => {
    const promptToUse = customPrompt || query;
    if (!promptToUse.trim() || isQuerying) return;
    
    setIsQuerying(true);
    try {
      let base64Image: string | null = null;
      try {
        base64Image = await captureScreenBase64();
      } catch (e) {
        console.warn("Screen capture not available, proceeding with text context", e);
      }

      const res = await fetch("/api/ask-screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          imageBase64: base64Image || "", 
          prompt: promptToUse,
          transcript: transcript || "" 
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to process AI request");
      
      setAiResponse(data.text);
      if (!customPrompt) setQuery(""); // Clear text input if user typed it
    } catch (err: any) {
      console.error(err);
      setAiResponse(`Sorry, could not process request: ${err.message || 'Unknown error'}`);
    } finally {
      setIsQuerying(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAskAI();
    }
  };

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] w-[90%] max-w-[600px] flex flex-col items-center pointer-events-none">
      
      {/* Top Pill Controls */}
      <div className="bg-[#2a2a2c]/95 backdrop-blur-md border border-white/10 rounded-full flex items-center p-1.5 gap-2 shadow-2xl mb-4 pointer-events-auto transition-transform hover:scale-105">
        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
          <Send size={16} className="text-white transform -rotate-45 ml-1" />
        </div>
        
        <button 
          onClick={() => setIsHidden(!isHidden)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors text-sm font-semibold"
        >
          <ChevronDown size={14} className={isHidden ? "rotate-180 transition-transform" : "transition-transform"} />
          {isHidden ? "Show" : "Hide"}
        </button>
        
        <button 
          onClick={stopRecording}
          className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors group"
          title="Stop Recording"
        >
          <Square size={12} fill="currentColor" className="text-white group-hover:text-red-400 transition-colors" />
        </button>
      </div>

      {/* Main Card */}
      {!isHidden && (
        <div className="w-full bg-[#1e1e1e]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl pointer-events-auto animate-in fade-in slide-in-from-top-4 duration-300">
          
          <div className="flex justify-end mb-4">
            <button 
              onClick={() => handleAskAI("What should I say next in this meeting?")}
              disabled={isQuerying}
              className="bg-[#0052cc] hover:bg-[#0047b3] text-white text-sm font-bold py-1.5 px-4 rounded-full shadow-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isQuerying ? <Loader2 size={14} className="animate-spin" /> : null}
              What should I say?
            </button>
          </div>

          <div className="mb-6 bg-white/5 p-4 rounded-xl border border-white/5">
            <p className="text-white/95 text-[15px] font-normal leading-relaxed tracking-wide">
              {isQuerying ? (
                <span className="flex items-center gap-2 text-white/60 animate-pulse">
                  <Loader2 size={16} className="animate-spin text-[#0052cc]" /> AI is thinking...
                </span>
              ) : (
                aiResponse || transcript || "Speak into your mic or start talking, and click 'What should I say?' or ask AI live questions below."
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-6 text-[13px] font-medium text-white/70">
            <button 
              onClick={() => handleAskAI("Give me a smart real-time answer suggestion for the current meeting point.")}
              disabled={isQuerying}
              className="flex items-center gap-1.5 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-md border border-white/5 disabled:opacity-50"
            >
              <Sparkles size={14} className="text-amber-400" />
              Assist
            </button>
            <button 
              onClick={() => handleAskAI("What should I say next?")}
              disabled={isQuerying}
              className="flex items-center gap-1.5 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-md border border-white/5 disabled:opacity-50"
            >
              <Wand2 size={14} className="text-purple-400" />
              What should I say?
            </button>
            <button 
              onClick={() => handleAskAI("Suggest 3 follow-up questions I can ask right now.")}
              disabled={isQuerying}
              className="flex items-center gap-1.5 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-md border border-white/5 disabled:opacity-50"
            >
              <MessageSquare size={14} className="text-blue-400" />
              Follow-up questions
            </button>
            <button 
              onClick={() => handleAskAI("Give me a 2-bullet point quick recap of what was just said.")}
              disabled={isQuerying}
              className="flex items-center gap-1.5 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-md border border-white/5 disabled:opacity-50"
            >
              <RotateCcw size={14} className="text-green-400" />
              Recap
            </button>
          </div>

          <div className="relative flex items-center bg-[#2a2a2c] rounded-xl border border-white/10 p-1.5">
            <button 
              onClick={() => handleAskAI("Analyze my current screen and tell me key highlights.")}
              disabled={isQuerying}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors border border-white/5 disabled:opacity-50" 
              title="Analyze Screen"
            >
              <Sparkles size={12} className="text-blue-400" />
              Smart
            </button>
            
            <button className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors ml-1">
              <MoreHorizontal size={16} />
            </button>

            <input 
              type="text" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isQuerying}
              placeholder="Ask about your screen or conversation..."
              className="flex-1 bg-transparent border-none outline-none text-white text-sm px-3 placeholder:text-white/40 disabled:opacity-50"
            />

            <button 
              onClick={() => handleAskAI()}
              disabled={isQuerying || !query.trim()}
              className="w-8 h-8 rounded-full bg-[#0052cc] hover:bg-[#0047b3] flex items-center justify-center transition-colors shadow-md disabled:bg-[#0052cc]/50"
            >
              {isQuerying ? (
                <Loader2 size={14} className="text-white animate-spin" />
              ) : (
                <Play size={14} fill="currentColor" className="text-white ml-0.5" />
              )}
            </button>
          </div>

        </div>
      )}
    </div>
  );
}
