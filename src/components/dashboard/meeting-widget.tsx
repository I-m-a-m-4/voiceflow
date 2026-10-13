"use client";

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { 
  ChevronDown, 
  Square, 
  Sparkles, 
  Wand2, 
  MessageSquare, 
  RotateCcw, 
  Play, 
  Send, 
  Loader2, 
  ShieldCheck, 
  ShieldAlert,
  GripHorizontal,
  Maximize2,
  Minimize2,
  Lock,
  User,
  Bot,
  Trash2,
  Camera,
  Minus,
  X,
  Mic
} from 'lucide-react';
import { captureScreenBase64 } from '@/lib/capture-screen';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { usePlanUsage } from '@/hooks/use-plan-usage';
import { apiBase } from '@/lib/platform';

interface MeetingWidgetProps {
  isRecording: boolean;
  stopRecording: () => void;
  transcript?: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
}

export default function MeetingWidget({ isRecording, stopRecording, transcript }: MeetingWidgetProps) {
  const [mounted, setMounted] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [isQuerying, setIsQuerying] = useState(false);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('voiceflow_widget_messages');
        if (saved) return JSON.parse(saved);
      } catch (e) {
        // fallback
      }
    }
    return [];
  });
  const [isStealth, setIsStealth] = useState<boolean>(true);
  const [isTauri, setIsTauri] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const lastImageBase64Ref = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const checkTauri = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        if (getCurrentWindow()) {
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
          if (!isMobile) setIsTauri(true);
        }
      } catch {
        if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
          setIsTauri(true);
        }
      }
    };
    checkTauri();
  }, []);

  // Live session timer
  useEffect(() => {
    if (!isRecording) {
      setSecondsElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      setSecondsElapsed((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isRecording]);

  const formattedTimer = `${String(Math.floor(secondsElapsed / 60)).padStart(2, '0')}:${String(secondsElapsed % 60).padStart(2, '0')}`;

  // Manage Tauri Floating Desktop Window Size & Position (HUD Overlay Mode)
  useEffect(() => {
    if (!isTauri || !isRecording) return;

    let isCancelled = false;
    const adjustWindow = async () => {
      try {
        const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        if (!win || isCancelled) return;

        await win.setAlwaysOnTop(true);
        await win.setSkipTaskbar(true);

        const targetW = 580;
        const targetH = isHidden ? 58 : (isExpanded ? 640 : 490);

        await win.setSize(new LogicalSize(targetW, targetH));
      } catch (err) {
        console.warn("Tauri window resize error:", err);
      }
    };

    adjustWindow();
    return () => { isCancelled = true; };
  }, [isTauri, isRecording, isHidden, isExpanded]);

  const handleStop = async () => {
    if (isTauri) {
      try {
        const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        await win.setSize(new LogicalSize(1024, 768));
        await win.center();
        await win.setAlwaysOnTop(false);
        await win.setSkipTaskbar(false);
      } catch (e) {
        console.warn("Error restoring Tauri window on stop:", e);
      }
    }
    stopRecording();
  };

  const handleStartOver = () => {
    setMessages([]);
    lastImageBase64Ref.current = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('voiceflow_widget_messages');
    }
  };

  // Persist chat history across requests and re-renders
  useEffect(() => {
    if (typeof window !== 'undefined' && messages.length > 0) {
      try {
        localStorage.setItem('voiceflow_widget_messages', JSON.stringify(messages.slice(-30)));
      } catch (e) {
        // ignore
      }
    }
  }, [messages]);

  // Auto-scroll chat box when new messages arrive or query starts
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [messages, isQuerying]);

  const { isPro, sessionCount, maxFreeSessions, isLimitReached } = usePlanUsage();

  const applyStealth = async (stealthOn: boolean) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('set_detectable', { detectable: stealthOn });
    } catch {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        await win.setSkipTaskbar(stealthOn);
        if (stealthOn) {
          await win.setAlwaysOnTop(true);
          await win.setContentProtected(true);
        }
      } catch {
        // Web browser environment
      }
    }
  };

  // Sync stealth mode when recording starts or on mount
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('voiceflow_stealth_mode') : null;
    const shouldBeStealth = saved !== null ? saved === 'true' : true;
    setIsStealth(shouldBeStealth);
    if (isRecording) {
      applyStealth(shouldBeStealth);
    } else {
      applyStealth(false);
    }
  }, [isRecording]);

  const toggleStealth = async () => {
    const next = !isStealth;
    setIsStealth(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('voiceflow_stealth_mode', String(next));
    }
    await applyStealth(next);
  };

  // Global hotkeys (Cmd/Ctrl + Enter: Ask screen, Cmd/Ctrl + R: Reset, Cmd/Ctrl + \: Show/Hide)
  useEffect(() => {
    const handleKeyDownGlobal = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleAskAI(query.trim() || "Analyze what is on my screen right now and give me the exact answer, code, or speaking points.", true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        handleStartOver();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setIsHidden(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDownGlobal);
    return () => window.removeEventListener('keydown', handleKeyDownGlobal);
  }, [query]);
  
  if (!mounted || !isRecording) return null;

  const handleAskAI = async (customPrompt?: string, includeScreenCapture = false) => {
    if (isLimitReached) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('open-billing-modal'));
      }
      return;
    }

    const promptToUse = customPrompt || query;
    if (!promptToUse.trim() || isQuerying) return;
    
    // Automatically make response card visible when asking
    if (isHidden) setIsHidden(false);

    setIsQuerying(true);
    try {
      let base64Image: string | null = null;
      if (includeScreenCapture) {
        try {
          base64Image = await captureScreenBase64();
          if (base64Image) {
            lastImageBase64Ref.current = base64Image;
          }
        } catch (e) {
          console.warn("Screen capture skipped, proceeding with transcript context:", e);
        }
      }

      // If no fresh screenshot captured, re-use cached screenshot so follow-ups have full visual context
      const effectiveImage = base64Image || lastImageBase64Ref.current || "";

      const customContext = typeof window !== 'undefined' ? localStorage.getItem('voiceflow_custom_context') || '' : '';

      // Lightweight conversation history (last 6 messages) for token economy and low latency
      const historyPayload = messages.slice(-6).map(m => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text
      }));

      const base = apiBase();
      const endpoint = base ? `${base}/api/ask-screen` : '/api/ask-screen';

      let cleanAnswer = "";
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            imageBase64: effectiveImage, 
            prompt: promptToUse,
            transcript: transcript || "",
            customContext: customContext,
            history: historyPayload
          })
        });
        
        const contentType = res.headers.get("content-type") || "";
        if (res.ok && contentType.includes("application/json")) {
          const data = await res.json();
          cleanAnswer = typeof data.text === 'object' && data.text !== null
            ? (data.text.content || JSON.stringify(data.text))
            : (data.text || "");
        }
      } catch (remoteErr) {
        console.warn("Server ask-screen endpoint failed, checking client fallback:", remoteErr);
      }

      // Check for bogus error string or empty answer
      if (
        !cleanAnswer || 
        cleanAnswer.includes("No response generated") || 
        cleanAnswer.includes("check your AI API key") ||
        cleanAnswer.includes("User Safety: safe") ||
        cleanAnswer.trim() === ""
      ) {
        cleanAnswer = "";
      }

      // Resilient client-side OpenRouter / Groq fallback
      if (!cleanAnswer) {
        const openRouterKey = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
        const transcriptSnippet = (transcript || "").slice(-3000) || "None yet";
        const systemPrompt = "You are an elite, ultra-fast meeting, exam, and interview co-pilot. When answering questions or analyzing screens: Direct Answer first, followed by concise Reasoning and Summary.";

        if (openRouterKey) {
          try {
            const messagesPayload: any[] = [
              { role: "system", content: systemPrompt },
              ...historyPayload
            ];

            if (effectiveImage) {
              const imgUrl = effectiveImage.startsWith("data:") ? effectiveImage : `data:image/jpeg;base64,${effectiveImage}`;
              messagesPayload.push({
                role: "user",
                content: [
                  { type: "text", text: `${promptToUse}\n\nContext transcript: ${transcriptSnippet}` },
                  { type: "image_url", image_url: { url: imgUrl } }
                ]
              });
            } else {
              messagesPayload.push({
                role: "user",
                content: `${promptToUse}\n\nContext transcript: ${transcriptSnippet}`
              });
            }

            const clientVisionModels = [
              "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
              "dots-studio/dots-3-note-preview:free",
              "google/gemma-4-26b-a4b-it:free",
              "meta-llama/llama-3.2-11b-vision-instruct:free",
              "openrouter/auto"
            ];
            const clientTextModels = [
              "meta-llama/llama-3.3-70b-instruct:free",
              "google/gemma-4-26b-a4b-it:free",
              "qwen/qwen-2.5-72b-instruct:free",
              "openrouter/free",
              "openrouter/auto"
            ];
            const clientModels = effectiveImage ? clientVisionModels : clientTextModels;

            for (const model of clientModels) {
              try {
                const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${openRouterKey}`,
                    "HTTP-Referer": "https://voiceflow.space",
                    "X-Title": "Voiceflow Co-Pilot"
                  },
                  body: JSON.stringify({
                    model: model,
                    messages: messagesPayload,
                    temperature: 0.3,
                    max_tokens: 2048,
                  })
                });

                if (orRes.ok) {
                  const orData = await orRes.json();
                  const text = orData.choices?.[0]?.message?.content;
                  if (text && text.trim() && !text.includes("User Safety: safe")) {
                    cleanAnswer = text;
                    break;
                  }
                }
              } catch (modelErr) {
                // try next model
              }
            }
          } catch (e) {
            console.warn("Client OpenRouter fallback skipped:", e);
          }
        }

        if (!cleanAnswer) {
          const groqApiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY || process.env.GROQ_API_KEY;
          if (groqApiKey) {
            const groqModels = [
              "llama-3.3-70b-versatile",
              "llama-3.1-8b-instant",
              "qwen/qwen3.8-27b"
            ];

            for (const gModel of groqModels) {
              try {
                const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${groqApiKey}`,
                  },
                  body: JSON.stringify({
                    model: gModel,
                    messages: [
                      { role: "system", content: "You are an articulate, lightning-fast live meeting and interview co-pilot." },
                      ...historyPayload,
                      { role: "user", content: `${promptToUse}\n\nContext transcript: ${transcriptSnippet}` }
                    ],
                    temperature: 0.3,
                    max_tokens: 2048,
                  })
                });

                if (groqRes.ok) {
                  const groqData = await groqRes.json();
                  const text = groqData.choices?.[0]?.message?.content;
                  if (text && text.trim()) {
                    cleanAnswer = text;
                    break;
                  }
                }
              } catch (gErr) {
                // try next model
              }
            }
          }
        }

        if (!cleanAnswer) {
          cleanAnswer = "I'm listening and tracking your live screen and audio! Ask anything or click 'Analyze This' for instant guidance.";
        }
      }

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        sender: 'user',
        text: promptToUse,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: cleanAnswer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, userMsg, aiMsg]);
      if (!customPrompt) setQuery("");
    } catch (err: any) {
      console.error("AI Error:", err);
      const displayErr = typeof err === 'string' 
        ? err 
        : (err?.message || (typeof err === 'object' ? JSON.stringify(err) : "Unknown error"));
      
      const errMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        sender: 'ai',
        text: `Sorry, could not process request: ${displayErr}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsQuerying(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAskAI();
    }
  };

  return createPortal(
    <motion.div 
      id="meeting-widget-root"
      drag={!isTauri}
      dragMomentum={false}
      className={isTauri 
        ? `w-full h-full flex flex-col items-center justify-start p-1 pointer-events-none select-none font-dm-sans bg-transparent`
        : `fixed top-3 inset-x-0 mx-auto z-[2147483647] w-[95%] max-w-[580px] flex flex-col items-center pointer-events-none select-none font-dm-sans`
      }
    >
      {/* Floating Top Pill Bar - Matches Image 2 layout */}
      <div 
        data-tauri-drag-region
        onMouseDown={async (e) => {
          if ((e.target as HTMLElement).closest('button, input, textarea')) return;
          if (isTauri) {
            try {
              const { getCurrentWindow } = await import('@tauri-apps/api/window');
              await getCurrentWindow().startDragging();
            } catch {}
          }
        }}
        className="bg-[#18181b]/95 backdrop-blur-xl border border-white/10 rounded-full flex items-center px-3 py-1.5 gap-2 shadow-2xl mb-2 pointer-events-auto transition-transform cursor-grab active:cursor-grabbing text-xs text-white"
      >
        <div className="pl-1 pr-0.5 text-white/30 hover:text-white/70" title="Drag to reposition">
          <GripHorizontal size={14} />
        </div>

        {/* Ask Follow-Up Button */}
        <button 
          onClick={() => handleAskAI(query.trim() || "Analyze what is on my screen right now and give me the exact answer, code, or speaking points.", true)}
          disabled={isQuerying}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 transition-all font-medium text-white/90 hover:text-white disabled:opacity-50"
          title="Analyze current screen & ask question (Cmd/Ctrl + Enter)"
        >
          <span>Ask Follow-Up</span>
          <kbd className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded text-white/60 font-mono">⌘ ↵</kbd>
        </button>

        {/* Start Over Button */}
        <button 
          onClick={handleStartOver}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full hover:bg-white/10 transition-all text-white/80 hover:text-white font-medium"
          title="Reset conversation context & clear screen cache (Cmd/Ctrl + R)"
        >
          <span>Start Over</span>
          <kbd className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded text-white/60 font-mono">⌘ R</kbd>
        </button>

        {/* Show/Hide Button */}
        <button 
          onClick={() => setIsHidden(!isHidden)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full hover:bg-white/10 transition-all text-white/80 hover:text-white font-medium"
          title="Toggle visibility (Cmd/Ctrl + \)"
        >
          <span>{isHidden ? "Show" : "Hide"}</span>
          <kbd className="text-[10px] bg-black/40 px-1.5 py-0.5 rounded text-white/60 font-mono">⌘ \</kbd>
        </button>

        <div className="h-4 w-[1px] bg-white/10 mx-0.5" />

        {/* Live Timer */}
        <div className="font-mono text-xs text-white/80 px-1 tracking-wider" title="Session duration">
          {formattedTimer}
        </div>

        {/* Mic Indicator */}
        <div className="flex items-center px-1 text-emerald-400" title="Live audio active">
          <Mic size={14} className="text-emerald-400 animate-pulse" />
        </div>

        <div className="h-4 w-[1px] bg-white/10 mx-0.5" />

        {/* Undetectable Stealth Mode */}
        <button 
          onClick={toggleStealth}
          className={`p-1.5 rounded-full transition-all ${
            isStealth 
              ? "text-emerald-400 hover:bg-emerald-500/20" 
              : "text-white/50 hover:bg-white/10 hover:text-white"
          }`}
          title={isStealth ? "Undetectable ON (Hidden from Zoom/Meet capture)" : "Undetectable OFF"}
        >
          {isStealth ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
        </button>

        {/* Minimize Button */}
        <button 
          onClick={async () => {
            if (isTauri) {
              try {
                const { getCurrentWindow } = await import('@tauri-apps/api/window');
                await getCurrentWindow().minimize();
              } catch {}
            } else {
              setIsHidden(true);
            }
          }}
          className="p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          title="Minimize to taskbar"
        >
          <Minus size={13} />
        </button>

        {/* Stop Button */}
        <button 
          onClick={handleStop}
          className="p-1.5 rounded-full text-white/60 hover:text-red-400 hover:bg-red-500/20 transition-colors"
          title="Stop & Save Meeting"
        >
          <Square size={12} fill="currentColor" />
        </button>
      </div>

      {/* Main Floating Response Card - Matches Image 2 */}
      {!isHidden && (
        <div className={`w-full max-w-[560px] bg-[#18181b]/95 backdrop-blur-2xl border border-white/15 rounded-2xl p-4 shadow-2xl pointer-events-auto animate-in fade-in slide-in-from-top-3 duration-200 relative overflow-hidden transition-all text-white flex flex-col ${isExpanded ? "max-h-[580px]" : "max-h-[440px]"}`}>
          
          {/* Blurred Background Overlay When Basic Limit is Reached */}
          {isLimitReached && (
            <div className="absolute inset-0 z-50 rounded-2xl flex flex-col items-center justify-center p-6 text-center backdrop-blur-xl bg-black/90 border border-voiceflow-orange/30 shadow-2xl animate-in fade-in duration-300">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-voiceflow-orange to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/25 mb-3 text-white">
                <Lock size={22} />
              </div>
              <span className="text-[11px] font-bold tracking-wider uppercase bg-orange-500/10 text-voiceflow-orange border border-orange-500/20 px-2.5 py-1 rounded-full mb-2">
                Free Limit Reached ({sessionCount}/{maxFreeSessions} Sessions)
              </span>
              <h3 className="text-lg font-bold text-white mb-2 font-nexa">
                Upgrade to Voiceflow Pro
              </h3>
              <p className="text-xs text-white/70 max-w-sm mb-5 leading-relaxed">
                You have used your 3 free meeting sessions on the Basic Plan. Upgrade to Pro for unlimited AI notetaking and live stealth co-pilot.
              </p>
              <button
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('open-billing-modal'));
                  }
                }}
                className="w-full max-w-xs py-2.5 px-6 rounded-xl bg-voiceflow-orange hover:bg-orange-600 text-white font-bold text-sm shadow-xl shadow-orange-500/20 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
              >
                Upgrade to Pro
              </button>
            </div>
          )}

          {/* Header Bar */}
          <div className="flex items-center justify-between pb-2.5 border-b border-white/10 mb-3">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsHidden(true)}
                className="text-white/40 hover:text-white transition-colors p-0.5 rounded"
                title="Close response card"
              >
                <X size={15} />
              </button>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-white/95">
                <Bot size={13} className="text-voiceflow-orange" />
                <span>AI Response</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-white/50 hover:text-white transition-colors p-1"
                title={isExpanded ? "Compact view" : "Expand view"}
              >
                {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
              {messages.length > 0 && (
                <button 
                  onClick={handleStartOver}
                  className="text-[11px] text-white/50 hover:text-red-400 flex items-center gap-1 transition-colors px-1.5 py-0.5 rounded hover:bg-white/5"
                  title="Clear chat and start over"
                >
                  <RotateCcw size={11} />
                  <span>Start Over</span>
                </button>
              )}
            </div>
          </div>

          {/* Chat / Response Body */}
          <div 
            ref={chatContainerRef}
            className={`flex-1 overflow-y-auto space-y-3 pr-1 text-[13px] leading-relaxed select-text cursor-text scrollbar-thin scrollbar-thumb-white/20 hover:scrollbar-thumb-white/30 ${isExpanded ? "min-h-[380px]" : "min-h-[220px]"}`}
          >
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center text-white/70 space-y-3">
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 text-white/60">
                  <Camera size={18} />
                </div>
                <div>
                  <p className="font-semibold text-white/90 text-sm">Ready to Assist</p>
                  <p className="text-white/50 text-xs mt-0.5 max-w-xs">
                    Click <strong>Analyze This</strong> below or press <kbd className="bg-white/10 px-1 py-0.5 rounded text-[10px] font-mono">⌘ ↵</kbd> to solve questions, code, or slides on your screen.
                  </p>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div 
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    {msg.sender === 'user' ? (
                      <>
                        <span className="text-[10px] text-white/40">{msg.timestamp}</span>
                        <span className="text-[11px] font-semibold text-orange-400 flex items-center gap-1">
                          <User size={11} /> You
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-[11px] font-semibold text-voiceflow-orange flex items-center gap-1">
                          <Bot size={11} /> Voiceflow AI
                        </span>
                        <span className="text-[10px] text-white/40">{msg.timestamp}</span>
                      </>
                    )}
                  </div>
                  <div 
                    className={`max-w-[95%] break-words selection:bg-white selection:text-voiceflow-orange ${
                      msg.sender === 'user' 
                        ? 'bg-voiceflow-orange text-white font-medium text-xs py-1.5 px-3.5 rounded-2xl rounded-tr-sm shadow-md' 
                        : 'rounded-xl p-3.5 text-[13px] leading-relaxed bg-[#202024] border border-white/10 text-white/95 shadow-sm w-full'
                    }`}
                  >
                    {msg.sender === 'user' ? (
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    ) : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ node, ...props }) => <p {...props} className="mb-2 last:mb-0 leading-relaxed text-white/95" />,
                          ol: ({ node, ...props }) => <ol {...props} className="list-decimal pl-5 mb-2 space-y-1 marker:text-voiceflow-orange text-white/90" />,
                          ul: ({ node, ...props }) => <ul {...props} className="list-disc pl-5 mb-2 space-y-1 marker:text-voiceflow-orange text-white/90" />,
                          li: ({ node, ...props }) => <li {...props} className="pl-0.5 leading-snug" />,
                          strong: ({ node, ...props }) => <strong {...props} className="font-bold text-white text-orange-200" />,
                          em: ({ node, ...props }) => <em {...props} className="italic text-white/90" />,
                          h1: ({ node, ...props }) => <h1 {...props} className="text-sm font-bold text-white mb-1.5 mt-2 first:mt-0 text-voiceflow-orange" />,
                          h2: ({ node, ...props }) => <h2 {...props} className="text-xs font-bold text-white mb-1 mt-2 first:mt-0 text-orange-300" />,
                          h3: ({ node, ...props }) => <h3 {...props} className="text-xs font-semibold text-white/95 mb-1 mt-2 first:mt-0 underline underline-offset-2" />,
                          code: ({ node, className, children, ...props }: any) => {
                            const isInline = !className;
                            return isInline ? (
                              <code {...props} className="px-1 py-0.5 rounded bg-white/10 text-orange-300 font-mono text-[11px]">
                                {children}
                              </code>
                            ) : (
                              <pre className="p-2.5 rounded-lg bg-black/50 text-orange-200 font-mono text-[11px] overflow-x-auto my-1.5 border border-white/10">
                                <code {...props}>{children}</code>
                              </pre>
                            );
                          },
                          blockquote: ({ node, ...props }) => (
                            <blockquote {...props} className="border-l-2 border-voiceflow-orange pl-2.5 italic text-white/80 my-1.5" />
                          ),
                        }}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    )}
                  </div>
                </div>
              ))
            )}

            {isQuerying && (
              <div className="flex flex-col items-start animate-in fade-in duration-200">
                <div className="flex items-center gap-1.5 mb-1 px-1">
                  <span className="text-[11px] font-semibold text-voiceflow-orange flex items-center gap-1">
                    <Bot size={11} /> Voiceflow AI
                  </span>
                </div>
                <div className="rounded-xl p-3 bg-[#202024] border border-white/10 text-white/70 text-xs flex items-center gap-2">
                  <Loader2 size={13} className="animate-spin text-voiceflow-orange" />
                  <span>Analyzing screen and generating direct answer...</span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Action Pills */}
          <div className="flex items-center gap-1.5 my-2.5 overflow-x-auto pb-1 text-xs font-medium scrollbar-none">
            <button 
              onClick={() => handleAskAI(query.trim() ? query : "Analyze what is on my screen right now and give me the exact answer, code, or speaking points.", true)}
              disabled={isQuerying}
              className="flex items-center gap-1.5 bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 hover:text-white px-3 py-1 rounded-lg border border-blue-500/40 font-semibold shadow-sm shrink-0 disabled:opacity-50 transition-colors"
            >
              <Camera size={12} className="text-blue-300" />
              Analyze This
            </button>
            <button 
              onClick={() => handleAskAI("Give me a smart real-time answer suggestion for the current point.")}
              disabled={isQuerying}
              className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white px-2.5 py-1 rounded-lg border border-white/5 shrink-0 disabled:opacity-50 transition-colors"
            >
              <Sparkles size={12} className="text-amber-400" />
              Assist
            </button>
            <button 
              onClick={() => handleAskAI("What should I say next?")}
              disabled={isQuerying}
              className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white px-2.5 py-1 rounded-lg border border-white/5 shrink-0 disabled:opacity-50 transition-colors"
            >
              <Wand2 size={12} className="text-purple-400" />
              What to say?
            </button>
            <button 
              onClick={() => handleAskAI("Suggest 3 follow-up questions I can ask right now.")}
              disabled={isQuerying}
              className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white px-2.5 py-1 rounded-lg border border-white/5 shrink-0 disabled:opacity-50 transition-colors"
            >
              <MessageSquare size={12} className="text-orange-400" />
              Follow-ups
            </button>
            <button 
              onClick={() => handleAskAI("Give me a 2-bullet point quick recap.")}
              disabled={isQuerying}
              className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white px-2.5 py-1 rounded-lg border border-white/5 shrink-0 disabled:opacity-50 transition-colors"
            >
              <RotateCcw size={12} className="text-green-400" />
              Recap
            </button>
          </div>

          {/* Bottom Follow-Up Input */}
          <div className="relative flex items-center bg-[#232327] rounded-xl border border-white/10 p-1.5">
            <button 
              onClick={() => handleAskAI(query.trim() ? query : "Analyze what is on my screen and tell me key highlights and answers.", true)}
              disabled={isQuerying}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors border border-white/5 disabled:opacity-50" 
              title="Capture & Analyze Screen (Sends your question with a screenshot)"
            >
              <Camera size={12} className="text-blue-400" />
              <span>Screen</span>
            </button>

            <input 
              type="text" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isQuerying}
              placeholder="Ask a follow-up or custom question..."
              className="flex-1 bg-transparent border-none outline-none text-white text-xs px-3 placeholder:text-white/40 disabled:opacity-50"
            />

            <button 
              onClick={() => handleAskAI()}
              disabled={isQuerying || !query.trim()}
              className="w-7 h-7 rounded-full bg-voiceflow-orange hover:bg-orange-600 flex items-center justify-center transition-colors shadow-md disabled:opacity-40"
              title="Send question"
            >
              {isQuerying ? (
                <Loader2 size={12} className="text-white animate-spin" />
              ) : (
                <Play size={11} fill="currentColor" className="text-white ml-0.5" />
              )}
            </button>
          </div>

        </div>
      )}
    </motion.div>,
    document.body
  );
}
