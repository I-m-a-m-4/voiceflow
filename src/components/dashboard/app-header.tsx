"use client";

import React, { useState, useEffect } from 'react';
import { Search, Video, Upload, Mic, Sun, Moon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useTheme } from 'next-themes';

export default function AppHeader() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleState = (e: any) => {
      if (typeof e.detail?.isRecording === 'boolean') {
        setIsRecording(e.detail.isRecording);
      }
    };
    window.addEventListener('voiceflow-record-state', handleState);
    return () => window.removeEventListener('voiceflow-record-state', handleState);
  }, []);

  const handleRecordToggle = () => {
    window.dispatchEvent(new CustomEvent('voiceflow-toggle-record'));
  };

  const isDarkMode = resolvedTheme === 'dark';

  return (
    <div className="flex flex-col border-b border-border bg-background">
      {/* Main Header Row */}
      <header className="flex items-center justify-between h-14 px-4 bg-muted/30">
        <div className="flex-1 max-w-xl relative group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-muted-foreground group-focus-within:text-primary" />
          </div>
          <Input 
            type="text" 
            placeholder="Ask or search" 
            className="w-full pl-10 h-9 bg-background border-border rounded-full focus-visible:ring-1 focus-visible:ring-primary shadow-sm text-sm"
          />
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <span className="text-xs text-muted-foreground font-medium">CtrlK</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {mounted && (
            <button 
              onClick={() => setTheme(isDarkMode ? 'light' : 'dark')}
              className="p-2 text-muted-foreground hover:bg-muted hover:text-foreground rounded-full transition-colors"
              aria-label="Toggle theme"
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          )}
          <button 
            onClick={handleRecordToggle}
            className={`flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded-full shadow-sm transition-all ${
              isRecording 
                ? "bg-red-500 hover:bg-red-600 text-white animate-pulse shadow-red-500/20" 
                : "bg-voiceflow-orange hover:bg-orange-600 text-white shadow-orange-500/20"
            }`}
            title="Start or stop capturing meeting/conversation audio"
          >
            <Mic size={15} className={isRecording ? "animate-bounce" : ""} />
            <span>{isRecording ? "Listening Live..." : "Capture Conversation"}</span>
          </button>
        </div>
      </header>
    </div>
  );
}
