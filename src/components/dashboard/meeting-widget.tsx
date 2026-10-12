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
  MoreHorizontal, 
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
  Camera
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
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const setClickThrough = async (ignore: boolean) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('set_ignore_cursor_events', { ignore });
    } catch {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().setIgnoreCursorEvents(ignore);
      } catch {
        // Web browser environment
      }
    }
  };

  // Sync stealth mode and click-through when recording starts or on mount
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('voiceflow_stealth_mode') : null;
    const shouldBeStealth = saved !== null ? saved === 'true' : true;
    setIsStealth(shouldBeStealth);
    if (isRecording) {
      applyStealth(shouldBeStealth);
      setClickThrough(true);
    } else {
      applyStealth(false);
      setClickThrough(false);
    }
    return () => {
      setClickThrough(false);
    };
  }, [isRecording]);

  const toggleStealth = async () => {
    const next = !isStealth;
    setIsStealth(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('voiceflow_stealth_mode', String(next));
    }
    await applyStealth(next);
  };
  
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
    
    setIsQuerying(true);
    try {
      let base64Image: string | null = null;
      if (includeScreenCapture) {
        try {
          base64Image = await captureScreenBase64();
        } catch (e) {
          console.warn("Screen capture skipped, proceeding with transcript context:", e);
        }
      }

      const customContext = typeof window !== 'undefined' ? localStorage.getItem('voiceflow_custom_context') || '' : '';

      const base = apiBase();
      const endpoint = base ? `${base}/api/ask-screen` : '/api/ask-screen';

      let cleanAnswer = "";
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            imageBase64: base64Image || "", 
            prompt: promptToUse,
            transcript: transcript || "",
            customContext: customContext,
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
        console.warn("Server ask-screen endpoint failed, checking client Groq fallback:", remoteErr);
      }

      // If remote server has no API key or failed, execute fast client-side OpenRouter or Groq call
      if (!cleanAnswer) {
        const openRouterKey = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;
        const transcriptSnippet = (transcript || "").slice(-4000) || "None yet";
        const fullPrompt = `You are an ultra-intelligent live meeting and interview co-pilot.
User Request / Question: "${promptToUse}"
Current Meeting Transcript Context: "${transcriptSnippet}"
${customContext ? `User Role / Custom Instructions:\n"${customContext}"\nTailor all answers directly to this profile.` : ""}

Fulfill the user's request thoroughly and directly. If they request a specific format (e.g. bullet points, code, list), follow that exact structure.`;

        if (openRouterKey) {
          try {
            const messagesPayload: any[] = [
              { role: "system", content: "You are an articulate, lightning-fast live meeting and interview co-pilot. When provided an image of a user's screen, analyze it carefully and directly give the exact solution, answer, or smart speaking points." }
            ];

            if (base64Image) {
              const imgUrl = base64Image.startsWith("data:") ? base64Image : `data:image/jpeg;base64,${base64Image}`;
              messagesPayload.push({
                role: "user",
                content: [
                  { type: "text", text: fullPrompt },
                  { type: "image_url", image_url: { url: imgUrl } }
                ]
              });
            } else {
              messagesPayload.push({
                role: "user",
                content: fullPrompt
              });
            }

            const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${openRouterKey}`,
                "HTTP-Referer": "https://voiceflow.space",
                "X-Title": "Voiceflow Co-Pilot"
              },
              body: JSON.stringify({
                model: "openrouter/free",
                messages: messagesPayload,
                temperature: 0.3,
                max_tokens: 2048,
              })
            });

            if (orRes.ok) {
              const orData = await orRes.json();
              cleanAnswer = orData.choices?.[0]?.message?.content || "";
            }
          } catch (e) {
            console.warn("Client OpenRouter fallback skipped:", e);
          }
        }

        if (!cleanAnswer) {
          const groqApiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY || process.env.GROQ_API_KEY;
          if (groqApiKey) {
            const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${groqApiKey}`,
              },
              body: JSON.stringify({
                model: "qwen/qwen3.8-27b",
                messages: [
                  { role: "system", content: "You are an articulate, lightning-fast live meeting and interview co-pilot." },
                  { role: "user", content: fullPrompt }
                ],
                temperature: 0.3,
                max_tokens: 2048,
              })
            });

            if (groqRes.ok) {
              const groqData = await groqRes.json();
              cleanAnswer = groqData.choices?.[0]?.message?.content || "";
            }
          }
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
      if (!customPrompt) setQuery(""); // Clear text input if user typed it
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
      drag
      dragMomentum={false}
      onMouseEnter={() => setClickThrough(false)}
      onMouseLeave={() => setClickThrough(true)}
      className={`fixed top-12 sm:top-14 inset-x-0 mx-auto z-[2147483647] w-[92%] ${isExpanded ? "max-w-[700px]" : "max-w-[620px]"} flex flex-col items-center pointer-events-none select-none font-dm-sans`}
    >
      {/* Top Pill Controls - Draggable Handle */}
      <div className="bg-[#222225]/95 backdrop-blur-md border border-white/10 rounded-full flex items-center p-1.5 gap-2 shadow-2xl mb-4 pointer-events-auto transition-transform hover:scale-[1.01] cursor-grab active:cursor-grabbing">
        <div className="pl-2 pr-1 text-white/40 hover:text-white/80" title="Drag to reposition widget">
          <GripHorizontal size={16} />
        </div>

        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
          <Send size={15} className="text-white transform -rotate-45 ml-0.5" />
        </div>
        
        {/* Toggleable Undetectable Mode button */}
        <button 
          onClick={toggleStealth}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
            isStealth 
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30" 
              : "bg-white/10 text-white/70 hover:text-white hover:bg-white/20 border border-white/10"
          }`}
          title={isStealth ? "Undetectable Mode ON: Window excluded from Zoom/Meet capture & hidden from taskbar" : "Undetectable Mode OFF: Click to enable"}
        >
          {isStealth ? <ShieldCheck size={14} className="text-emerald-400" /> : <ShieldAlert size={14} className="text-amber-400" />}
          <span>{isStealth ? "Undetectable: ON" : "Undetectable: OFF"}</span>
        </button>

        {/* Expand / Collapse Height Toggle */}
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors text-xs font-semibold"
          title={isExpanded ? "Collapse height (Compact)" : "Expand height (Expanded)"}
        >
          {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          <span>{isExpanded ? "Compact" : "Expand"}</span>
        </button>

        <button 
          onClick={() => setIsHidden(!isHidden)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors text-xs font-semibold"
        >
          <ChevronDown size={14} className={isHidden ? "rotate-180 transition-transform" : "transition-transform"} />
          {isHidden ? "Show" : "Hide"}
        </button>
        
        <button 
          onClick={stopRecording}
          className="w-8 h-8 rounded-full bg-white/10 hover:bg-red-500/30 flex items-center justify-center transition-colors group"
          title="Stop & Save Meeting"
        >
          <Square size={12} fill="currentColor" className="text-white group-hover:text-red-400 transition-colors" />
        </button>
      </div>

      {/* Main Floating Card */}
      {!isHidden && (
        <div className={`w-full bg-[#18181b]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl pointer-events-auto animate-in fade-in slide-in-from-top-4 duration-300 relative overflow-hidden transition-all duration-300 ${isExpanded ? "max-w-[700px]" : "max-w-[620px]"}`}>
          
          {/* Blurred Background Overlay When Basic Limit is Reached */}
          {isLimitReached && (
            <div className="absolute inset-0 z-50 rounded-2xl flex flex-col items-center justify-center p-6 text-center backdrop-blur-xl bg-white/85 dark:bg-black/90 border border-voiceflow-orange/30 shadow-2xl animate-in fade-in duration-300">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-voiceflow-orange to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/25 mb-3 text-white">
                <Lock size={22} />
              </div>
              <span className="text-[11px] font-bold tracking-wider uppercase bg-orange-500/10 text-voiceflow-orange border border-orange-500/20 px-2.5 py-1 rounded-full mb-2">
                Free Limit Reached ({sessionCount}/{maxFreeSessions} Sessions)
              </span>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 font-nexa">
                Upgrade to Voiceflow Pro
              </h3>
              <p className="text-xs text-gray-600 dark:text-white/70 max-w-sm mb-5 leading-relaxed">
                You have used your 3 free meeting sessions on the Basic Plan. Upgrade to Pro for unlimited AI notetaking, live stealth co-pilot, and custom instructions.
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

          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-semibold text-white/70">Listening live...</span>
            </div>
            <button 
              onClick={() => handleAskAI("What should I say next in this meeting?")}
              disabled={isQuerying}
              className="bg-voiceflow-orange hover:bg-orange-600 text-white text-xs font-bold py-1.5 px-4 rounded-full shadow-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {isQuerying ? <Loader2 size={13} className="animate-spin" /> : null}
              What should I say?
            </button>
          </div>

          <div className="flex justify-between items-center mb-2 px-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">Chat Flow & Responses</span>
              {messages.length > 0 && (
                <span className="text-[10px] bg-white/10 text-white/70 px-1.5 py-0.5 rounded-full font-mono">
                  {messages.length}
                </span>
              )}
            </div>
            {messages.length > 0 && (
              <button 
                onClick={() => {
                  setMessages([]);
                  if (typeof window !== 'undefined') {
                    localStorage.removeItem('voiceflow_widget_messages');
                  }
                }}
                className="text-[11px] text-white/40 hover:text-red-400 flex items-center gap-1 transition-colors"
                title="Clear chat history"
              >
                <Trash2 size={12} />
                <span>Clear chat</span>
              </button>
            )}
          </div>

          <div 
            ref={chatContainerRef}
            className={`mb-5 bg-white/5 p-4 rounded-xl border border-white/5 overflow-y-auto space-y-3.5 transition-all duration-300 ${isExpanded ? "h-[450px] max-h-[450px]" : "h-72 max-h-72"} select-text cursor-text pointer-events-auto scrollbar-thin scrollbar-thumb-white/20 hover:scrollbar-thumb-white/30 scrollbar-track-transparent pr-1.5`}
          >
            {messages.length === 0 ? (
              <div className="text-white/70 text-[13px] leading-relaxed py-2">
                <p className="font-medium text-white/90 mb-1">Live Meeting Co-Pilot Ready</p>
                <p className="text-white/60 text-xs">
                  {transcript || "Listening to conversation... Click 'What should I say?' or ask anything below. Your questions and AI responses will appear here as a live chat thread."}
                </p>
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
                    className={`max-w-[92%] break-words selection:bg-white selection:text-voiceflow-orange ${
                      msg.sender === 'user' 
                        ? 'bg-voiceflow-orange text-white font-medium text-xs sm:text-[13px] py-1.5 px-3.5 rounded-2xl rounded-tr-sm shadow-md leading-normal' 
                        : 'rounded-xl p-3 text-[13px] leading-relaxed bg-[#212124] border border-white/10 text-white/95 shadow-sm'
                    }`}
                  >
                    {msg.sender === 'user' ? (
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    ) : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ node, ...props }) => <p {...props} className="mb-2 last:mb-0 leading-relaxed" />,
                          ol: ({ node, ...props }) => <ol {...props} className="list-decimal pl-5 mb-2 space-y-1 marker:text-voiceflow-orange" />,
                          ul: ({ node, ...props }) => <ul {...props} className="list-disc pl-5 mb-2 space-y-1 marker:text-voiceflow-orange" />,
                          li: ({ node, ...props }) => <li {...props} className="pl-0.5 leading-snug" />,
                          strong: ({ node, ...props }) => <strong {...props} className="font-semibold text-white" />,
                          em: ({ node, ...props }) => <em {...props} className="italic text-white/90" />,
                          h1: ({ node, ...props }) => <h1 {...props} className="text-sm font-bold text-white mb-1.5 mt-2 first:mt-0" />,
                          h2: ({ node, ...props }) => <h2 {...props} className="text-xs font-bold text-white mb-1 mt-2 first:mt-0" />,
                          code: ({ node, className, children, ...props }: any) => {
                            const isInline = !className;
                            return isInline ? (
                              <code {...props} className="px-1 py-0.5 rounded bg-white/10 text-orange-300 font-mono text-[11px]">
                                {children}
                              </code>
                            ) : (
                              <pre className="p-2.5 rounded-lg bg-black/40 text-orange-200 font-mono text-[11px] overflow-x-auto my-1.5 border border-white/10">
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
                <div className="rounded-xl p-3 bg-[#212124] border border-white/10 text-white/70 text-[13px] flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-voiceflow-orange" />
                  <span>Generating...</span>
                </div>
              </div>
            )}
          </div>

          {/* Prompt Pills */}
          <div className="flex flex-wrap items-center gap-2 mb-4 text-xs font-medium text-white/70">
            <button 
              onClick={() => handleAskAI(query.trim() ? query : "Analyze what is on my screen right now and give me the exact answer, code, or speaking points.", true)}
              disabled={isQuerying}
              className="flex items-center gap-1.5 transition-all bg-gradient-to-r from-blue-600/30 to-indigo-600/30 hover:from-blue-600/50 hover:to-indigo-600/50 text-blue-200 hover:text-white px-3 py-1.5 rounded-lg border border-blue-500/40 disabled:opacity-50 font-semibold shadow-sm"
              title="Take a screenshot of your screen and analyze with AI"
            >
              <Camera size={13} className="text-blue-300" />
              Analyze This
            </button>
            <button 
              onClick={() => handleAskAI("Give me a smart real-time answer suggestion for the current meeting point.")}
              disabled={isQuerying}
              className="flex items-center gap-1.5 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/5 disabled:opacity-50"
            >
              <Sparkles size={13} className="text-amber-400" />
              Assist
            </button>
            <button 
              onClick={() => handleAskAI("What should I say next?")}
              disabled={isQuerying}
              className="flex items-center gap-1.5 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/5 disabled:opacity-50"
            >
              <Wand2 size={13} className="text-purple-400" />
              What should I say?
            </button>
            <button 
              onClick={() => handleAskAI("Suggest 3 follow-up questions I can ask right now.")}
              disabled={isQuerying}
              className="flex items-center gap-1.5 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/5 disabled:opacity-50"
            >
              <MessageSquare size={13} className="text-orange-400" />
              Follow-ups
            </button>
            <button 
              onClick={() => handleAskAI("Give me a 2-bullet point quick recap of what was just said.")}
              disabled={isQuerying}
              className="flex items-center gap-1.5 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/5 disabled:opacity-50"
            >
              <RotateCcw size={13} className="text-green-400" />
              Recap
            </button>
          </div>

          {/* Input Box */}
          <div className="relative flex items-center bg-[#252528] rounded-xl border border-white/10 p-1.5">
            <button 
              onClick={() => handleAskAI(query.trim() ? query : "Analyze what is on my screen and tell me key highlights and answers.", true)}
              disabled={isQuerying}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors border border-white/5 disabled:opacity-50" 
              title="Capture & Analyze Screen (Sends your question with a screenshot)"
            >
              <Camera size={12} className="text-blue-400" />
              Screen
            </button>

            <input 
              type="text" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isQuerying}
              placeholder="Ask about the conversation or question..."
              className="flex-1 bg-transparent border-none outline-none text-white text-xs px-3 placeholder:text-white/40 disabled:opacity-50"
            />

            <button 
              onClick={() => handleAskAI()}
              disabled={isQuerying || !query.trim()}
              className="w-8 h-8 rounded-full bg-voiceflow-orange hover:bg-orange-600 flex items-center justify-center transition-colors shadow-md disabled:opacity-40"
            >
              {isQuerying ? (
                <Loader2 size={13} className="text-white animate-spin" />
              ) : (
                <Play size={13} fill="currentColor" className="text-white ml-0.5" />
              )}
            </button>
          </div>

        </div>
      )}
    </motion.div>,
    document.body
  );
}
