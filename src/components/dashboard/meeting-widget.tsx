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

  const handleSmartAsk = async () => {
    if (!query.trim() || isQuerying) return;
    
    setIsQuerying(true);
    setAiResponse(null);
    try {
      const base64Image = await captureScreenBase64();
      const res = await fetch("/api/ask-screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64Image, prompt: query })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to process screen");
      
      setAiResponse(data.text);
      setQuery(""); // Clear input on success
    } catch (err) {
      console.error(err);
      setAiResponse("Oops! Something went wrong capturing or analyzing your screen.");
    } finally {
      setIsQuerying(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Optional: Check if CMD is pressed for "Cmd + Enter"
      // if (e.metaKey || e.ctrlKey) { handleSmartAsk(); }
      handleSmartAsk();
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
            <button className="bg-[#0052cc] hover:bg-[#0047b3] text-white text-sm font-bold py-1.5 px-4 rounded-full shadow-lg transition-colors">
              What should I say?
            </button>
          </div>

          <div className="mb-6">
            <p className="text-white/95 text-[15px] font-normal leading-relaxed tracking-wide">
              {aiResponse || transcript || "“A discounted cash flow model values a company by projecting future free cash flows and discounting them to present value using the weighted average cost of capital.”"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-6 text-[13px] font-medium text-white/70">
            <button className="flex items-center gap-1.5 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-md border border-white/5">
              <Sparkles size={14} />
              Assist
            </button>
            <button className="flex items-center gap-1.5 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-md border border-white/5">
              <Wand2 size={14} />
              What should I say?
            </button>
            <button className="flex items-center gap-1.5 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-md border border-white/5">
              <MessageSquare size={14} />
              Follow-up questions
            </button>
            <button className="flex items-center gap-1.5 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded-md border border-white/5">
              <RotateCcw size={14} />
              Recap
            </button>
          </div>

          <div className="relative flex items-center bg-[#2a2a2c] rounded-xl border border-white/10 p-1.5">
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors border border-white/5" title="Take Screenshot">
              <Sparkles size={12} />
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
              placeholder="Ask about your screen or conversation, or ⌘ ↵ for Assist"
              className="flex-1 bg-transparent border-none outline-none text-white text-sm px-3 placeholder:text-white/40 disabled:opacity-50"
            />

            <button 
              onClick={handleSmartAsk}
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
