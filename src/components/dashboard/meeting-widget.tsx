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
  Paperclip,
  X,
  Image as ImageIcon
} from 'lucide-react';
import { captureScreenBase64 } from '@/lib/capture-screen';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { usePlanUsage } from '@/hooks/use-plan-usage';
import { toast } from '@/hooks/use-toast';
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
        const resumeMeetingId = localStorage.getItem('voiceflow_resume_meeting_id');
        if (resumeMeetingId) {
          const resumeChat = localStorage.getItem('voiceflow_resume_chat_messages');
          if (resumeChat) {
            const parsed = JSON.parse(resumeChat);
            if (Array.isArray(parsed)) return parsed;
          }
          return [];
        }
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
  const [liveTranscript, setLiveTranscript] = useState<string>(() => {
    return transcript || (typeof window !== 'undefined' ? localStorage.getItem('voiceflow_live_transcript') || '' : '');
  });
  const [hasAttachedImage, setHasAttachedImage] = useState<boolean>(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const lastImageBase64Ref = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync transcript from props or live background Whisper events
  useEffect(() => {
    if (transcript && transcript.trim()) {
      setLiveTranscript(transcript);
    }
  }, [transcript]);

  useEffect(() => {
    const handleLiveTranscript = (e: any) => {
      if (e.detail?.transcript) {
        setLiveTranscript(e.detail.transcript);
      }
    };
    window.addEventListener('voiceflow-live-transcript', handleLiveTranscript);
    return () => window.removeEventListener('voiceflow-live-transcript', handleLiveTranscript);
  }, []);

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (uploadEvent) => {
            const base64 = uploadEvent.target?.result as string;
            if (base64) {
              lastImageBase64Ref.current = base64;
              setHasAttachedImage(true);
            }
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const base64 = uploadEvent.target?.result as string;
        if (base64) {
          lastImageBase64Ref.current = base64;
          setHasAttachedImage(true);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    setMounted(true);
    const checkTauri = async () => {
      try {
        if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
          if (!isMobile) {
            setIsTauri(true);
            return;
          }
        }
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

  const hasPositionedRef = useRef(false);

  // Manage Tauri Floating Desktop Window Size & Position (HUD Overlay Mode)
  useEffect(() => {
    if (!isTauri || !isRecording) {
      hasPositionedRef.current = false;
      return;
    }

    let isCancelled = false;
    const adjustWindow = async () => {
      try {
        // 1. Native Rust Command: executes with full privileges without capability hurdles
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('enter_hud_mode', { isExpanded, isHidden });
      } catch (invokeErr) {
        console.warn("enter_hud_mode invoke failed, trying JS API fallback:", invokeErr);
        try {
          const { getCurrentWindow, LogicalSize, LogicalPosition, currentMonitor } = await import('@tauri-apps/api/window');
          const win = getCurrentWindow();
          if (!win || isCancelled) return;

          // If the window was maximized by the user, Windows OS refuses to resize it.
          // Calling unmaximize() first frees the window to shrink into the floating widget.
          if (await win.isMaximized()) {
            await win.unmaximize();
          }

          const targetW = isHidden ? 440 : (isExpanded ? 660 : 580);
          const targetH = isHidden ? 70 : (isExpanded ? 620 : 500);

          await win.setSize(new LogicalSize(targetW, targetH));

          // Position widget nicely at top center of screen on initial recording start
          if (!hasPositionedRef.current) {
            hasPositionedRef.current = true;
            try {
              const monitor = await currentMonitor();
              if (monitor) {
                const scaleFactor = monitor.scaleFactor || 1;
                const screenLogicalW = monitor.size.width / scaleFactor;
                const posX = Math.max(0, Math.round((screenLogicalW - targetW) / 2));
                const posY = 35; // 35px from top
                await win.setPosition(new LogicalPosition(posX, posY));
              } else {
                await win.center();
              }
            } catch (posErr) {
              console.warn("Could not set top position:", posErr);
            }
          }

          await win.setAlwaysOnTop(true);
          await win.setSkipTaskbar(true);
          await win.setContentProtected(true);
        } catch (err) {
          console.warn("Tauri window resize error:", err);
        }
      }
    };

    adjustWindow();
    return () => { isCancelled = true; };
  }, [isTauri, isRecording, isHidden, isExpanded]);

  const handleStop = async () => {
    hasPositionedRef.current = false;
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('exit_hud_mode');
      } catch (err) {
        console.warn("exit_hud_mode invoke failed, trying JS API fallback:", err);
        try {
          const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
          const win = getCurrentWindow();
          await win.setSize(new LogicalSize(1024, 768));
          await win.center();
          await win.setAlwaysOnTop(false);
          await win.setSkipTaskbar(false);
          await win.setContentProtected(false);
        } catch (e) {
          console.warn("Error restoring Tauri window on stop:", e);
        }
      }
    }
    stopRecording();
  };

  const handleStartOver = () => {
    setMessages([]);
    lastImageBase64Ref.current = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('voiceflow_widget_messages');
      localStorage.removeItem('voiceflow_resume_chat_messages');
    }
  };

  // Ensure resumed chat history is synchronized into state when recording starts
  useEffect(() => {
    if (!isRecording || typeof window === 'undefined') return;
    try {
      const resumeMeetingId = localStorage.getItem('voiceflow_resume_meeting_id');
      if (resumeMeetingId) {
        const resumeChat = localStorage.getItem('voiceflow_resume_chat_messages');
        if (resumeChat) {
          const parsed = JSON.parse(resumeChat);
          if (Array.isArray(parsed)) {
            setMessages(parsed);
            return;
          }
        }
        setMessages([]);
        return;
      }

      const saved = localStorage.getItem('voiceflow_widget_messages');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setMessages(parsed);
          return;
        }
      }
      setMessages([]);
    } catch (e) {
      console.warn("Could not synchronize resumed messages:", e);
    }
  }, [isRecording]);

  // Persist chat history across requests and re-renders
  useEffect(() => {
    if (typeof window !== 'undefined' && messages.length > 0) {
      try {
        const serialized = JSON.stringify(messages.slice(-30));
        localStorage.setItem('voiceflow_widget_messages', serialized);
        const resumeMeetingId = localStorage.getItem('voiceflow_resume_meeting_id');
        if (resumeMeetingId) {
          localStorage.setItem('voiceflow_resume_chat_messages', serialized);
        }
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

  const { 
    isPro, 
    sessionCount, 
    maxFreeSessions, 
    isLimitReached, 
    screenCaptureCount, 
    isScreenCaptureLimitReached, 
    recordScreenCapture 
  } = usePlanUsage();

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
      // Detect if prompt requires visual screen inspection
      const wantsScreenAnalysis = includeScreenCapture || 
        /\b(screen|slide|display|image|photo|visual|picture|diagram|look at this|see on|what's on my screen|screenshot)\b/i.test(promptToUse);

      let base64Image: string | null = null;
      if (wantsScreenAnalysis && !lastImageBase64Ref.current) {
        if (isScreenCaptureLimitReached) {
          toast({
            title: "Screen Capture Limit Reached (3/3 Free Uses)",
            description: "Free plan is limited to 3 AI screen captures. Upgrade to Voiceflow Pro for unlimited real-time visual analysis.",
            variant: "destructive"
          });
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('open-billing-modal'));
          }
          if (includeScreenCapture) {
            setIsQuerying(false);
            return;
          }
        } else {
          try {
            base64Image = await captureScreenBase64();
            if (base64Image) {
              lastImageBase64Ref.current = base64Image;
              setHasAttachedImage(true);
              await recordScreenCapture();
            }
          } catch (e) {
            console.warn("Screen capture skipped, proceeding with transcript context:", e);
          }
        }
      }

      const effectiveImage = base64Image || lastImageBase64Ref.current || "";
      const customContext = typeof window !== 'undefined' ? localStorage.getItem('voiceflow_custom_context') || '' : '';
      const activeTranscript = liveTranscript || transcript || (typeof window !== 'undefined' ? localStorage.getItem('voiceflow_live_transcript') || '' : '');

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
            transcript: activeTranscript,
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

      // Resilient client-side Groq / OpenRouter fallback
      if (!cleanAnswer) {
        const groqApiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY || process.env.GROQ_API_KEY;
        const openRouterKey = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY;
        const transcriptSnippet = (transcript || "").slice(-3000) || "None yet";
        const systemPrompt = "You are Voiceflow AI, an articulate, intelligent, and natural live meeting co-pilot. When answering, be direct, conversational, and helpful. Use clean Markdown bullet points when listing ideas.";

        // Try client-side Groq first for ultra-fast (200ms) execution
        if (groqApiKey) {
          const groqModels = [
            "openai/gpt-oss-120b",
            "qwen/qwen3.8-27b",
            "openai/gpt-oss-20b"
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
                    { role: "system", content: systemPrompt },
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

        // Try client-side OpenRouter if Groq was empty
        if (!cleanAnswer && openRouterKey) {
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
              "meta-llama/llama-3.2-11b-vision-instruct:free",
              "google/gemma-4-26b-a4b-it:free",
              "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
              "openrouter/auto"
            ];
            const clientTextModels = [
              "meta-llama/llama-3.3-70b-instruct:free",
              "google/gemma-4-26b-a4b-it:free",
              "qwen/qwen-2.5-72b-instruct:free",
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

        // Smart, natural conversational fallback based on intent
        if (!cleanAnswer) {
          const lowerPrompt = promptToUse.toLowerCase();
          if (lowerPrompt.includes('hello') || lowerPrompt.includes('hi') || lowerPrompt.startsWith('hey')) {
            cleanAnswer = "Hello! I'm your Voiceflow live meeting assistant. I'm actively listening to your audio and tracking your screen. How can I help you in this session?";
          } else if (lowerPrompt.includes('recap') || lowerPrompt.includes('summarize')) {
            if (transcript && transcript.trim()) {
              const cleanSnippet = transcript.slice(-400).replace(/\n/g, ' ').trim();
              cleanAnswer = `**Quick Recap of Recent Discussion:**\n• ${cleanSnippet}`;
            } else {
              cleanAnswer = "I haven't captured any spoken dialogue in the meeting transcript yet. As soon as participants begin speaking, I'll generate live bulleted recaps for you.";
            }
          } else if (lowerPrompt.includes('what should i say')) {
            if (transcript && transcript.trim()) {
              cleanAnswer = `**Suggested Speaking Points:**\n• "Building on the points raised so far, let's make sure we align on the concrete next steps."\n• "Could we clarify our timeline and the key milestones for this?"`;
            } else {
              cleanAnswer = `**Suggested Meeting Starters:**\n• "Thanks everyone for joining. Should we quickly align on the main goals for today's call?"\n• "Before we jump into the details, are there any priority items or blockers we should cover first?"`;
            }
          } else {
            cleanAnswer = "I'm listening and tracking your live meeting. Ask any question or click 'Analyze This' for instant guidance on your active screen.";
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
        ? `fixed inset-0 top-0 left-0 w-full h-full flex flex-col items-center justify-start p-2 pointer-events-auto select-none font-dm-sans z-[2147483647]`
        : `fixed top-12 sm:top-14 inset-x-0 mx-auto z-[2147483647] w-[92%] ${isExpanded ? "max-w-[700px]" : "max-w-[620px]"} flex flex-col items-center pointer-events-none select-none font-dm-sans`
      }
    >
      {/* Top Pill Controls - Draggable Handle */}
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
        className="bg-[#18181b]/95 backdrop-blur-md border border-white/10 rounded-full flex items-center p-1.5 px-3 gap-2.5 shadow-2xl mb-2.5 pointer-events-auto transition-transform cursor-grab active:cursor-grabbing shrink-0"
      >
        <div className="text-white/40 hover:text-white/80 cursor-grab" title="Drag to reposition widget">
          <GripHorizontal size={15} />
        </div>

        {/* Toggleable Presenter Privacy Shield button */}
        <button 
          onClick={toggleStealth}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all ${
            isStealth 
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.25)]" 
              : "bg-white/10 text-white/70 hover:text-white hover:bg-white/20 border border-white/10"
          }`}
          title={isStealth ? "Presenter Privacy Shield ON: Window excluded from Zoom/Teams/Meet screen share & hidden from taskbar" : "Presenter Privacy Shield OFF: Click to enable"}
        >
          {isStealth ? <ShieldCheck size={13} className="text-emerald-400" /> : <ShieldAlert size={13} className="text-amber-400" />}
          <span>{isStealth ? "Presenter Privacy: ON" : "Presenter Privacy: OFF"}</span>
        </button>

        {/* Live Session Timer */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/5 text-xs font-mono font-medium text-white/90">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span>{formattedTimer}</span>
        </div>

        {/* Expand / Collapse Height Toggle */}
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          title={isExpanded ? "Collapse height (Compact)" : "Expand height (Expanded)"}
        >
          {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>

        {/* Hide / Show Card Toggle */}
        <button 
          onClick={() => setIsHidden(!isHidden)}
          className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          title={isHidden ? "Show co-pilot" : "Hide co-pilot"}
        >
          <ChevronDown size={14} className={isHidden ? "rotate-180 transition-transform" : "transition-transform"} />
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
          className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white/70 hover:text-white"
          title="Minimize floating assistant"
        >
          <Minus size={12} />
        </button>
        
        {/* Stop Button */}
        <button 
          onClick={handleStop}
          className="w-7 h-7 rounded-full bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 flex items-center justify-center transition-colors group"
          title="Stop & Save Meeting"
        >
          <Square size={10} fill="currentColor" className="text-red-400 group-hover:text-red-300 transition-colors" />
        </button>
      </div>

      {/* Main Floating Card */}
      {!isHidden && (
        <div className={`w-full bg-[#18181b]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl pointer-events-auto animate-in fade-in slide-in-from-top-4 duration-300 relative overflow-hidden transition-all duration-300 ${isExpanded ? "max-w-[660px]" : "max-w-[560px]"}`}>
          
          {/* Subtle Top Handle */}
          <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-2.5" />

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
                You have used your 3 free meeting sessions on the Basic Plan. Upgrade to Pro for unlimited AI notetaking, live privacy co-pilot, and custom instructions.
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

          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-semibold text-white/70">Listening live...</span>
            </div>
            <button 
              onClick={() => handleAskAI("What should I say next in this meeting?")}
              disabled={isQuerying}
              className="bg-voiceflow-orange hover:bg-orange-600 text-white text-xs font-bold py-1.5 px-3.5 rounded-full shadow-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
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
                onClick={handleStartOver}
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
            className={`mb-3 bg-white/5 p-3 rounded-xl border border-white/5 overflow-y-auto space-y-3 transition-all duration-300 ${isExpanded ? "h-[320px] max-h-[320px]" : "h-56 max-h-56"} select-text cursor-text pointer-events-auto scrollbar-thin scrollbar-thumb-white/20 hover:scrollbar-thumb-white/30 scrollbar-track-transparent pr-1.5`}
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

          {/* Quick-Action Triggers */}
          <div className="grid grid-cols-3 gap-2 mb-3 text-xs font-semibold">
            <button 
              onClick={() => {
                if (isScreenCaptureLimitReached) {
                  toast({
                    title: "Screen Capture Limit Reached (3/3 Free Uses)",
                    description: "Free plan is limited to 3 AI screen captures. Upgrade to Voiceflow Pro for unlimited real-time visual analysis.",
                    variant: "destructive"
                  });
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('open-billing-modal'));
                  }
                  return;
                }
                handleAskAI(query.trim() ? query : "Analyze what is on my screen right now and give me the exact answer, code, or speaking points.", true);
              }}
              disabled={isQuerying}
              className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-gradient-to-r from-blue-600/20 to-indigo-600/20 hover:from-blue-600/30 hover:to-indigo-600/30 text-blue-200 hover:text-white border border-blue-500/30 hover:border-blue-500/50 transition-all active:scale-[0.98] disabled:opacity-50 text-[11px] font-medium shadow-sm"
              title={!isPro ? `Capture & Analyze Screen (${screenCaptureCount}/3 free uses)` : "Capture & Analyze Screen with AI"}
            >
              <Camera size={13} className="text-blue-400 shrink-0" />
              <span className="truncate">
                {!isPro ? (
                  isScreenCaptureLimitReached ? "Screen (3/3 Free)" : `Screen (${3 - screenCaptureCount} left)`
                ) : (
                  "Analyze Screen"
                )}
              </span>
              {!isPro && isScreenCaptureLimitReached && (
                <span className="text-[9px] uppercase px-1 py-0.5 rounded bg-amber-500/30 text-amber-300 font-bold ml-0.5">Pro</span>
              )}
            </button>
            <button 
              onClick={() => handleAskAI("Give me a smart real-time answer suggestion for the current meeting point.")}
              disabled={isQuerying}
              className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/90 border border-white/10 hover:border-white/20 transition-all active:scale-[0.98] disabled:opacity-50 text-[11px] font-medium shadow-sm"
              title="Suggest Answer based on conversation"
            >
              <Sparkles size={13} className="text-amber-400 shrink-0" />
              <span className="truncate">Suggest Answer</span>
            </button>
            <button 
              onClick={() => handleAskAI("Give me a 2-bullet point quick recap of what was just said.")}
              disabled={isQuerying}
              className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/90 border border-white/10 hover:border-white/20 transition-all active:scale-[0.98] disabled:opacity-50 text-[11px] font-medium shadow-sm"
              title="Quick Recap of current topic"
            >
              <RotateCcw size={13} className="text-emerald-400 shrink-0" />
              <span className="truncate">Recap</span>
            </button>
          </div>

          {/* Attached image preview badge if available */}
          {hasAttachedImage && (
            <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/30 px-3 py-1.5 rounded-lg mb-2 text-xs text-blue-300">
              <span className="flex items-center gap-1.5 font-medium">
                <ImageIcon size={12} className="text-blue-400" />
                Screenshot attached & ready for analysis
              </span>
              <button 
                onClick={() => {
                  lastImageBase64Ref.current = null;
                  setHasAttachedImage(false);
                }}
                className="hover:text-white p-0.5 rounded transition-colors"
                title="Remove attached image"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {/* Hidden file input for screenshot upload */}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept="image/*" 
            className="hidden" 
          />

          {/* Input Box */}
          <div className="relative flex items-center bg-[#252528] rounded-xl border border-white/10 p-1.5">
            <button 
              onClick={() => {
                if (isScreenCaptureLimitReached) {
                  toast({
                    title: "Screen Capture Limit Reached (3/3 Free Uses)",
                    description: "Free plan is limited to 3 AI screen captures. Upgrade to Voiceflow Pro for unlimited real-time visual analysis.",
                    variant: "destructive"
                  });
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('open-billing-modal'));
                  }
                  return;
                }
                handleAskAI(query.trim() ? query : "Analyze what is on my screen right now and give me the exact answer, code, or speaking points.", true);
              }}
              disabled={isQuerying}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors border border-white/5 disabled:opacity-50" 
              title={!isPro ? `Capture Screen (${screenCaptureCount}/3 free used)` : "Capture & Analyze Screen (Sends your question with a live display capture)"}
            >
              <Camera size={12} className="text-blue-400" />
              <span>Screen</span>
              {!isPro && (
                <span className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-white/70">
                  {screenCaptureCount >= 3 ? '3/3' : `${3 - screenCaptureCount} left`}
                </span>
              )}
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isQuerying}
              className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Upload slide or screenshot image"
            >
              <Paperclip size={13} />
            </button>

            <input 
              type="text" 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              disabled={isQuerying}
              placeholder="Ask about conversation, screen, or paste screenshot (Ctrl+V)..."
              className="flex-1 bg-transparent border-none outline-none text-white text-xs px-2.5 placeholder:text-white/40 disabled:opacity-50"
            />

            <button 
              onClick={() => handleAskAI()}
              disabled={isQuerying || (!query.trim() && !hasAttachedImage)}
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
