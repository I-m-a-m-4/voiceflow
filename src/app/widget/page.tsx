"use client";

import { useEffect, useState } from "react";
import { Mic, Square, Check } from "lucide-react";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { getCurrentWindow } from "@tauri-apps/api/window";

export default function WidgetPage() {
  const { startRecording, stopRecording, isRecording, isProcessing, transcript } = useAudioRecorder();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // If it finishes processing and has a transcript, show copied state and auto hide after 2s
    if (transcript && !isProcessing) {
      setCopied(true);
      const timer = setTimeout(() => {
        setCopied(false);
        getCurrentWindow().hide();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [transcript, isProcessing]);

  useEffect(() => {
    // Global keydown escape to hide widget
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        getCurrentWindow().hide();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="w-full h-screen bg-slate-900/90 text-white rounded-xl shadow-2xl border border-slate-700 flex flex-col items-center justify-center p-4 backdrop-blur-md" style={{ borderRadius: "12px", overflow: "hidden" }} data-tauri-drag-region>
      <div className="flex-1 flex flex-col items-center justify-center w-full" data-tauri-drag-region>
        {isProcessing ? (
          <div className="flex items-center gap-2 text-sm text-slate-300">
             <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
             Processing...
          </div>
        ) : copied ? (
          <div className="flex items-center gap-2 text-emerald-400 font-medium">
             <Check className="w-5 h-5" />
             Copied to clipboard
          </div>
        ) : (
          <button
            onClick={() => isRecording ? stopRecording() : startRecording(false)}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg ${
              isRecording 
                ? "bg-red-500 hover:bg-red-600 animate-pulse" 
                : "bg-indigo-600 hover:bg-indigo-700"
            }`}
          >
            {isRecording ? <Square className="w-5 h-5 fill-white text-white" /> : <Mic className="w-6 h-6 text-white" />}
          </button>
        )}
      </div>
      
      {!isProcessing && !copied && (
        <div className="text-xs text-slate-400 mt-2 font-medium pointer-events-none text-center">
          {isRecording ? "Recording... Click to stop" : "Click to dictate"}
        </div>
      )}
    </div>
  );
}
