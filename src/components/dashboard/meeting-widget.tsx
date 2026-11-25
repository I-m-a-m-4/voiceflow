"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  ChevronDown,
  Square,
  Sparkles,
  RotateCcw,
  Play,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  GripHorizontal,
  Maximize2,
  Minimize2,
  User,
  Bot,
  Trash2,
  Camera,
  Minus,
  Paperclip,
  X,
  Image as ImageIcon,
  MessageSquare,
  FileText,
  History,
  Copy,
  Check,
  Plus,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { captureScreenBase64 } from "@/lib/capture-screen";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { usePlanUsage } from "@/hooks/use-plan-usage";
import { apiBase } from "@/lib/platform";
import { copyToClipboard } from "@/lib/clipboard";
import { isScreenFocusedPrompt } from "@/lib/transcript-context";
import type { TranscriptionHealth } from "@/hooks/useAudioRecorder";

interface MeetingWidgetProps {
  isRecording: boolean;
  stopRecording: () => void;
  transcript?: string;
  transcriptionHealth?: TranscriptionHealth;
  systemAudioActive?: boolean;
}

type AskMode = "auto" | "capture-screen" | "text-only";

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
  imageBase64?: string;
  hadImage?: boolean;
  provider?: string;
  model?: string;
  isStreaming?: boolean;
  isError?: boolean;
  retryPrompt?: string;
  retryMode?: AskMode;
  retryImageBase64?: string;
}

interface SavedSession {
  id: string;
  title: string;
  timestamp: string;
  messageCount: number;
  messages: ChatMessage[];
}

// Strip heavy base64 screenshots before serializing to localStorage so 5MB storage quota is never blown
function stripImagesForStorage(msgs: ChatMessage[]): ChatMessage[] {
  return msgs
    .filter((m) => !m.isStreaming)
    .slice(-30)
    .map(({ imageBase64, retryImageBase64, ...rest }) => ({
      ...rest,
      hadImage: rest.hadImage || Boolean(imageBase64),
    }));
}

export default function MeetingWidget({
  isRecording,
  stopRecording,
  transcript,
  transcriptionHealth = "listening",
  systemAudioActive = false,
}: MeetingWidgetProps) {
  const [mounted, setMounted] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"chat" | "transcript" | "history">("chat");
  const [query, setQuery] = useState("");
  const [isQuerying, setIsQuerying] = useState(false);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [previewModalImage, setPreviewModalImage] = useState<string | null>(null);
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("voiceflow_hud_chat_sessions");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }
      } catch {
        // ignore
      }
    }
    return [];
  });

  const [isStealth, setIsStealth] = useState<boolean>(true);
  const [isTauri, setIsTauri] = useState(() => {
    if (typeof window === "undefined") return false;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return !isMobile && Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
  });

  const [liveTranscript, setLiveTranscript] = useState<string>("");
  const [hasAttachedImage, setHasAttachedImage] = useState<boolean>(false);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const lastImageBase64Ref = useRef<string | null>(null);
  const lastAskedTranscriptLenRef = useRef<number>(0);
  const lastAskedTranscriptTailRef = useRef<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasPositionedRef = useRef(false);
  const prevIsRecordingRef = useRef(false);

  // Refs for fresh closures inside global/keyboard shortcuts (eliminates stale closure bug!)
  const latestAskRef = useRef<(customPrompt?: string, mode?: AskMode, retryImg?: string) => Promise<void>>(async () => {});
  const latestStartOverRef = useRef<() => void>(() => {});
  const latestStopRef = useRef<() => Promise<void>>(async () => {});
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;
  const liveTranscriptRef = useRef<string>(liveTranscript);
  liveTranscriptRef.current = liveTranscript;

  const { isPro, isAdmin, screenCaptureCount, recordScreenCapture } = usePlanUsage();

  const handleHaltGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch {
        // ignore
      }
      abortControllerRef.current = null;
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.isStreaming
          ? {
              ...m,
              isStreaming: false,
              text: m.text.trim() || "Generation halted.",
            }
          : m
      )
    );
    setIsQuerying(false);
  }, []);

  // Clean session initialization when recording transitions false -> true (eliminates cross-meeting leaks!)
  useEffect(() => {
    const wasRecording = prevIsRecordingRef.current;
    prevIsRecordingRef.current = isRecording;

    if (isRecording && !wasRecording) {
      hasPositionedRef.current = false;
      setIsHidden(false);
      setActiveTab("chat");
      setQuery("");
      lastImageBase64Ref.current = null;
      lastAskedTranscriptLenRef.current = 0;
      lastAskedTranscriptTailRef.current = "";
      setHasAttachedImage(false);

      if (typeof window !== "undefined") {
        const resumeMeetingId = localStorage.getItem("voiceflow_resume_meeting_id");
        if (resumeMeetingId) {
          const prevTx = localStorage.getItem("voiceflow_resume_previous_transcript") || "";
          setLiveTranscript(prevTx);
          try {
            const resumeChat = localStorage.getItem("voiceflow_resume_chat_messages");
            const parsed = resumeChat ? JSON.parse(resumeChat) : [];
            setMessages(Array.isArray(parsed) ? parsed : []);
          } catch {
            setMessages([]);
          }
        } else {
          // Fresh meeting: guarantee 100% clean slate
          setLiveTranscript("");
          setMessages([]);
          localStorage.removeItem("voiceflow_widget_messages");
          localStorage.removeItem("voiceflow_live_transcript");
        }
      }
    }
  }, [isRecording]);

  // Sync transcript from props (including explicit empty resets while recording)
  useEffect(() => {
    if (typeof transcript === "string") {
      if (transcript.trim()) {
        setLiveTranscript(transcript);
      }
    }
  }, [transcript]);

  // Sync live Whisper / interim transcript events (honoring explicit reset flag)
  useEffect(() => {
    const handleLiveTranscript = (e: any) => {
      if (e.detail?.reset) {
        setLiveTranscript(e.detail?.transcript || "");
      } else if (typeof e.detail?.transcript === "string") {
        setLiveTranscript(e.detail.transcript);
      }
    };
    window.addEventListener("voiceflow-live-transcript", handleLiveTranscript);
    return () => window.removeEventListener("voiceflow-live-transcript", handleLiveTranscript);
  }, []);

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
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
    // Reset input value so uploading the same file twice works
    e.target.value = "";
  };

  useEffect(() => {
    setMounted(true);
    const checkTauri = async () => {
      try {
        if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
          if (!isMobile) {
            setIsTauri(true);
            return;
          }
        }
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        if (getCurrentWindow()) {
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
          if (!isMobile) setIsTauri(true);
        }
      } catch {
        if (typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__) {
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

  const formattedTimer = `${String(Math.floor(secondsElapsed / 60)).padStart(2, "0")}:${String(secondsElapsed % 60).padStart(2, "0")}`;

  // Manage Tauri Floating Desktop Window Size & Position (never resets drag position on resize!)
  useEffect(() => {
    if (!isTauri || typeof window === "undefined" || !isRecording) return;

    const shouldReposition = !hasPositionedRef.current;

    const configureTauriWindow = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("enter_hud_mode", {
          isExpanded,
          isHidden,
          reposition: shouldReposition,
        });
        hasPositionedRef.current = true;
      } catch {
        try {
          const { getCurrentWindow, LogicalSize, LogicalPosition } = await import("@tauri-apps/api/window");
          const win = getCurrentWindow();
          if (await win.isMaximized()) {
            await win.unmaximize();
          }

          const targetW = isHidden ? 440 : isExpanded ? 660 : 580;
          const targetH = isHidden ? 70 : isExpanded ? 600 : 480;
          await win.setSize(new LogicalSize(targetW, targetH));

          if (shouldReposition) {
            const monitor =
              typeof (win as any).currentMonitor === "function" ? await (win as any).currentMonitor() : null;
            if (monitor) {
              const scale = monitor.scaleFactor || 1;
              const screenW = monitor.size.width / scale;
              const posX = Math.max(0, (screenW - targetW) / 2);
              await win.setPosition(new LogicalPosition(posX, 35));
            } else {
              await win.center();
            }
            hasPositionedRef.current = true;
          }

          await win.setAlwaysOnTop(true);
          await win.setSkipTaskbar(true);
          await win.setContentProtected(true);
        } catch (e) {
          console.warn("HUD resize fallback:", e);
        }
      }
    };

    void configureTauriWindow();
  }, [isRecording, isHidden, isExpanded, isTauri]);

  const archiveCurrentSession = useCallback(() => {
    const currentMsgs = messagesRef.current.filter((m) => !m.isStreaming);
    if (currentMsgs.length === 0) return;

    const lightMsgs = stripImagesForStorage(currentMsgs);
    const sessionTitle =
      lightMsgs[0]?.text?.slice(0, 45) ||
      `Session ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

    const newSession: SavedSession = {
      id: `session-${Date.now()}`,
      title: sessionTitle,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      messageCount: lightMsgs.length,
      messages: lightMsgs,
    };

    setSavedSessions((prev) => {
      const updated = [newSession, ...prev.filter((s) => s.id !== newSession.id)].slice(0, 20);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("voiceflow_hud_chat_sessions", JSON.stringify(updated));
        } catch {
          // ignore quota
        }
      }
      return updated;
    });
  }, []);

  const handleStop = useCallback(async () => {
    hasPositionedRef.current = false;
    handleHaltGeneration();
    archiveCurrentSession();
    if (isTauri && typeof window !== "undefined") {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("exit_hud_mode");
      } catch {
        try {
          const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
          const win = getCurrentWindow();
          await win.setAlwaysOnTop(false);
          await win.setSkipTaskbar(false);
          await win.setContentProtected(false);
          await win.setSize(new LogicalSize(1024, 768));
          await win.center();
          await win.setFocus();
        } catch (e) {
          console.warn("Could not restore Tauri window on stop:", e);
        }
      }
    }
    stopRecording();
  }, [archiveCurrentSession, handleHaltGeneration, isTauri, stopRecording]);

  const handleStartOver = useCallback(() => {
    handleHaltGeneration();
    archiveCurrentSession();
    setMessages([]);
    lastImageBase64Ref.current = null;
    lastAskedTranscriptLenRef.current = 0;
    lastAskedTranscriptTailRef.current = "";
    setHasAttachedImage(false);
    setQuery("");
    if (typeof window !== "undefined") {
      localStorage.removeItem("voiceflow_widget_messages");
      localStorage.removeItem("voiceflow_resume_chat_messages");
    }
  }, [archiveCurrentSession, handleHaltGeneration]);

  const handleRestoreSession = (session: SavedSession) => {
    archiveCurrentSession();
    setMessages(session.messages);
    lastImageBase64Ref.current = null;
    lastAskedTranscriptLenRef.current = 0;
    lastAskedTranscriptTailRef.current = "";
    setHasAttachedImage(false);
    setActiveTab("chat");
  };

  const handleDeleteSession = (id: string) => {
    setSavedSessions((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("voiceflow_hud_chat_sessions", JSON.stringify(updated));
        } catch {
          // ignore
        }
      }
      return updated;
    });
  };

  // Persist lightweight text-only chat history (never stores megabytes of base64 screenshots!)
  useEffect(() => {
    if (typeof window !== "undefined" && messages.length > 0) {
      const finalized = stripImagesForStorage(messages);
      if (finalized.length === 0) return;
      try {
        const serialized = JSON.stringify(finalized);
        localStorage.setItem("voiceflow_widget_messages", serialized);
        const resumeMeetingId = localStorage.getItem("voiceflow_resume_meeting_id");
        if (resumeMeetingId) {
          localStorage.setItem("voiceflow_resume_chat_messages", serialized);
        }
      } catch {
        // ignore quota
      }
    }
  }, [messages]);

  // Smooth auto-scroll when messages stream or transcript updates
  useEffect(() => {
    if (activeTab === "chat" && chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    } else if (activeTab === "transcript" && transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [messages, liveTranscript, isQuerying, activeTab]);

  const applyStealth = useCallback(async (stealthOn: boolean) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("set_detectable", { detectable: stealthOn });
    } catch {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        await win.setSkipTaskbar(stealthOn);
        if (stealthOn) {
          await win.setAlwaysOnTop(true);
          await win.setContentProtected(true);
        }
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("voiceflow_stealth_mode") : null;
    const shouldBeStealth = saved !== null ? saved === "true" : true;
    setIsStealth(shouldBeStealth);
    if (isRecording) {
      void applyStealth(shouldBeStealth);
    } else {
      void applyStealth(false);
    }
  }, [isRecording, applyStealth]);

  const toggleStealth = async () => {
    const next = !isStealth;
    setIsStealth(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("voiceflow_stealth_mode", String(next));
    }
    await applyStealth(next);
  };

  const handleAskAI = useCallback(
    async (customPrompt?: string, mode: AskMode = "auto", retryImageBase64?: string) => {
      const promptToUse = (customPrompt || query || "What should I say right now?").trim();
      if (!promptToUse || isQuerying) return;

      setActiveTab("chat");
      if (isHidden) setIsHidden(false);
      // Clear input whenever the typed query was consumed (including when clicking Screen with typed text!)
      if (!customPrompt || customPrompt.trim() === query.trim()) {
        setQuery("");
      }

      setIsQuerying(true);
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const nowStamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const userMsgId = `user-${Date.now()}`;
      const aiMsgId = `ai-${Date.now() + 1}`;

      try {
        // Determine exact image payload cleanly based on mode (ZERO sticky screenshot hijacking across turns!)
        let effectiveImage = "";
        const shouldAutoCaptureScreen =
          mode === "capture-screen" ||
          (mode === "auto" && !lastImageBase64Ref.current && isScreenFocusedPrompt(promptToUse));

        if (typeof retryImageBase64 === "string" && retryImageBase64.length > 100) {
          effectiveImage = retryImageBase64;
        } else if (shouldAutoCaptureScreen) {
          try {
            const freshCapture = await captureScreenBase64();
            if (freshCapture) {
              await recordScreenCapture();
              effectiveImage = freshCapture;
              // Do NOT persist fresh capture in lastImageBase64Ref — keep captures one-shot so subsequent typed questions aren't hijacked by an old screen!
              lastImageBase64Ref.current = null;
              setHasAttachedImage(false);
            } else {
              lastImageBase64Ref.current = null;
              setHasAttachedImage(false);
              setMessages((prev) => [
                ...prev,
                {
                  id: userMsgId,
                  sender: "user",
                  text: promptToUse,
                  timestamp: nowStamp,
                },
                {
                  id: aiMsgId,
                  sender: "ai",
                  text: "Screen capture was blocked or unavailable. Please grant screen permission (or paste a screenshot with Ctrl+V) and tap Retry.",
                  timestamp: nowStamp,
                  isError: true,
                  retryPrompt: promptToUse,
                  retryMode: "capture-screen",
                },
              ]);
              return;
            }
          } catch (capErr) {
            console.warn("Screen capture failed:", capErr);
            setMessages((prev) => [
              ...prev,
              { id: userMsgId, sender: "user", text: promptToUse, timestamp: nowStamp },
              {
                id: aiMsgId,
                sender: "ai",
                text: "Could not capture your screen right now. Please tap Retry or paste a screenshot with Ctrl+V.",
                timestamp: nowStamp,
                isError: true,
                retryPrompt: promptToUse,
                retryMode: "capture-screen",
              },
            ]);
            return;
          }
        } else if (mode === "text-only") {
          // Suggest Answer / Recap are strictly transcript-focused — NEVER hijacked by an old screenshot!
          effectiveImage = "";
        } else if (lastImageBase64Ref.current) {
          // mode === 'auto': consume manually pasted/uploaded attachment for THIS turn, then clear it cleanly
          effectiveImage = lastImageBase64Ref.current;
          lastImageBase64Ref.current = null;
          setHasAttachedImage(false);
        }

        if (controller.signal.aborted) return;

        // Optimistic UI: render user message + streaming AI bubble IMMEDIATELY!
        const userMsg: ChatMessage = {
          id: userMsgId,
          sender: "user",
          text: promptToUse,
          timestamp: nowStamp,
          imageBase64: effectiveImage || undefined,
          hadImage: Boolean(effectiveImage),
        };

        const placeholderAiMsg: ChatMessage = {
          id: aiMsgId,
          sender: "ai",
          text: "",
          timestamp: nowStamp,
          isStreaming: true,
        };

        const historyPayload = messagesRef.current
          .filter((m) => !m.isError && !m.isStreaming && m.text.trim())
          .slice(-10)
          .map((m) => ({
            role: m.sender === "user" ? "user" : "assistant",
            content: m.text,
          }));

        setMessages((prev) => [...prev, userMsg, placeholderAiMsg]);

        const customContext = typeof window !== "undefined" ? localStorage.getItem("voiceflow_custom_context") || "" : "";
        const activeTranscript =
          liveTranscriptRef.current ||
          transcript ||
          (typeof window !== "undefined" ? localStorage.getItem("voiceflow_live_transcript") || "" : "");

        const prevTranscriptLength = lastAskedTranscriptLenRef.current;
        const prevTranscriptTail = lastAskedTranscriptTailRef.current;

        const commitTranscriptCursor = () => {
          const cleanActive = activeTranscript.trim();
          lastAskedTranscriptLenRef.current = cleanActive.length;
          lastAskedTranscriptTailRef.current = cleanActive.slice(-120);
        };

        const base = apiBase();
        const endpoint = base ? `${base}/api/ask-screen` : "/api/ask-screen";

        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), 35000);
        const onParentAbort = () => timeoutController.abort();
        controller.signal.addEventListener("abort", onParentAbort);

        let res: Response;
        try {
          res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: timeoutController.signal,
            body: JSON.stringify({
              imageBase64: effectiveImage,
              prompt: promptToUse,
              transcript: activeTranscript,
              customContext,
              history: historyPayload,
              lastTranscriptLength: prevTranscriptLength,
              lastTranscriptTail: prevTranscriptTail,
              stream: true,
            }),
          });
        } finally {
          clearTimeout(timeoutId);
          controller.signal.removeEventListener("abort", onParentAbort);
        }

        if (controller.signal.aborted) return;

        const contentType = res.headers.get("content-type") || "";

        // Handle streaming SSE response (sub-second time-to-first-token!)
        if (res.ok && contentType.includes("text/event-stream") && res.body) {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let accumulated = "";
          let streamError = "";
          let providerUsed = "voiceflow";
          let modelUsed = "";

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (controller.signal.aborted) {
                await reader.cancel().catch(() => {});
                break;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line.startsWith("data:")) continue;
                const payload = line.slice(5).trim();
                if (!payload || payload === "[DONE]") continue;

                try {
                  const evt = JSON.parse(payload);
                  if (evt.delta) {
                    accumulated += evt.delta;
                    setMessages((prev) =>
                      prev.map((m) => (m.id === aiMsgId ? { ...m, text: accumulated } : m))
                    );
                  } else if (evt.done) {
                    providerUsed = evt.provider || "voiceflow";
                    modelUsed = evt.model || "";
                  } else if (evt.error) {
                    streamError = evt.error;
                  }
                } catch {
                  // ignore partial chunk
                }
              }
            }
          } finally {
            try {
              reader.releaseLock();
            } catch {
              // ignore
            }
          }

          if (controller.signal.aborted) return;

          if (accumulated.trim()) {
            commitTranscriptCursor();
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId
                  ? {
                      ...m,
                      text: accumulated.trim(),
                      isStreaming: false,
                      provider: providerUsed,
                      model: modelUsed,
                    }
                  : m
              )
            );
          } else {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId
                  ? {
                      ...m,
                      text: streamError || "No response received from AI. Please tap Retry.",
                      isStreaming: false,
                      isError: true,
                      retryPrompt: promptToUse,
                      retryMode: mode,
                      retryImageBase64: effectiveImage || undefined,
                    }
                  : m
              )
            );
          }
          return;
        }

        // Handle standard JSON response (non-streaming or error JSON)
        if (contentType.includes("application/json")) {
          const data = await res.json();
          if (res.ok && data.text && typeof data.text === "string" && data.text.trim()) {
            commitTranscriptCursor();
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiMsgId
                  ? {
                      ...m,
                      text: data.text.trim(),
                      isStreaming: false,
                      provider: data.provider || "voiceflow",
                      model: data.model || "",
                    }
                  : m
              )
            );
            return;
          }

          const errMsg = data?.error || `Request failed (HTTP ${res.status}). Please tap Retry.`;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiMsgId
                ? {
                    ...m,
                    text: errMsg,
                    isStreaming: false,
                    isError: true,
                    retryPrompt: promptToUse,
                    retryMode: mode,
                    retryImageBase64: effectiveImage || undefined,
                  }
                : m
            )
          );
          return;
        }

        // Unexpected non-JSON response
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId
              ? {
                  ...m,
                  text: `Server returned an unexpected response (HTTP ${res.status}). Please tap Retry.`,
                  isStreaming: false,
                  isError: true,
                  retryPrompt: promptToUse,
                  retryMode: mode,
                  retryImageBase64: effectiveImage || undefined,
                }
              : m
          )
        );
      } catch (err: any) {
        if (controller.signal.aborted) return;
        const isTimeout = err?.name === "AbortError";
        const displayErr = isTimeout
          ? "Request timed out before AI responded. Please tap Retry."
          : err?.message || "Network error contacting Voiceflow AI. Please tap Retry.";

        setMessages((prev) => {
          const hasPlaceholder = prev.some((m) => m.id === aiMsgId);
          if (hasPlaceholder) {
            return prev.map((m) =>
              m.id === aiMsgId
                ? {
                    ...m,
                    text: displayErr,
                    isStreaming: false,
                    isError: true,
                    retryPrompt: promptToUse,
                    retryMode: mode,
                    retryImageBase64: retryImageBase64,
                  }
                : m
            );
          }
          return [
            ...prev,
            {
              id: aiMsgId,
              sender: "ai",
              text: displayErr,
              timestamp: nowStamp,
              isError: true,
              retryPrompt: promptToUse,
              retryMode: mode,
              retryImageBase64: retryImageBase64,
            },
          ];
        });
      } finally {
        abortControllerRef.current = null;
        setIsQuerying(false);
      }
    },
    [isHidden, isQuerying, query, recordScreenCapture, transcript]
  );

  // Keep shortcut refs pointing to the latest closures every render
  latestAskRef.current = handleAskAI;
  latestStartOverRef.current = handleStartOver;
  latestStopRef.current = handleStop;

  const handleRetryMessage = (msg: ChatMessage) => {
    if (isQuerying || !msg.retryPrompt) return;
    // Remove the failed error bubble (and its immediately preceding duplicate user bubble) before re-running cleanly
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === msg.id);
      if (idx === -1) return prev;
      const removeStart = idx > 0 && prev[idx - 1].sender === "user" ? idx - 1 : idx;
      return [...prev.slice(0, removeStart), ...prev.slice(idx + 1)];
    });
    void handleAskAI(msg.retryPrompt, msg.retryMode || "auto", msg.retryImageBase64);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      void handleAskAI();
    }
  };

  // Global & Tauri shortcut listeners — ALWAYS call latest refs (zero stale closures!)
  useEffect(() => {
    if (typeof window === "undefined" || !isRecording) return;

    const onShortcutAsk = () => void latestAskRef.current(undefined, "text-only");
    const onShortcutClear = () => latestStartOverRef.current();
    const onShortcutSession = () => void latestStopRef.current();
    const onShortcutVisibility = () => setIsHidden((prev) => !prev);

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        void latestAskRef.current(undefined, "text-only");
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        latestStartOverRef.current();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "`") {
        e.preventDefault();
        setIsHidden((prev) => !prev);
      }
    };

    window.addEventListener("voiceflow-shortcut-ask", onShortcutAsk);
    window.addEventListener("voiceflow-shortcut-clear", onShortcutClear);
    window.addEventListener("voiceflow-shortcut-session", onShortcutSession);
    window.addEventListener("voiceflow-shortcut-visibility", onShortcutVisibility);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("voiceflow-shortcut-ask", onShortcutAsk);
      window.removeEventListener("voiceflow-shortcut-clear", onShortcutClear);
      window.removeEventListener("voiceflow-shortcut-session", onShortcutSession);
      window.removeEventListener("voiceflow-shortcut-visibility", onShortcutVisibility);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isRecording]);

  if (!mounted || !isRecording) return null;

  const healthLabel =
    transcriptionHealth === "degraded"
      ? "Transcription reconnecting..."
      : transcriptionHealth === "syncing"
        ? "Transcribing live audio..."
        : systemAudioActive
          ? "Listening (Mic + Call Audio)"
          : "Listening (Microphone)";

  return createPortal(
    <>
      <style>{`
        #meeting-widget-root,
        #meeting-widget-root *,
        #meeting-widget-root button,
        #meeting-widget-root input,
        #meeting-widget-root div,
        #meeting-widget-root span {
          cursor: default !important;
        }
      `}</style>

      {/* Screen Capture Lightbox Preview Modal */}
      {previewModalImage && (
        <div
          onClick={() => setPreviewModalImage(null)}
          className="fixed inset-0 z-[2147483647] bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-3xl max-h-[85vh] bg-[#18181b] border border-white/20 rounded-2xl p-3 shadow-2xl flex flex-col items-center"
          >
            <div className="flex items-center justify-between w-full px-2 py-1 mb-2 text-xs text-white/80">
              <span className="font-semibold flex items-center gap-1.5">
                <Camera size={13} className="text-blue-400" />
                Active Screen Capture Sent to AI
              </span>
              <button
                onClick={() => setPreviewModalImage(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
              >
                <X size={15} />
              </button>
            </div>
            <img
              src={previewModalImage}
              alt="Screen Capture Snapshot"
              className="max-w-full max-h-[75vh] object-contain rounded-xl border border-white/10 shadow-lg"
            />
          </div>
        </div>
      )}

      <motion.div
        id="meeting-widget-root"
        drag={!isTauri}
        dragMomentum={false}
        className={
          isTauri
            ? `fixed inset-0 top-0 left-0 w-full h-full flex flex-col items-center justify-start p-2 pointer-events-auto select-none font-dm-sans z-[2147483647]`
            : `fixed top-12 sm:top-14 inset-x-0 mx-auto z-[2147483647] w-[92%] ${isExpanded ? "max-w-[700px]" : "max-w-[620px]"} flex flex-col items-center pointer-events-none select-none font-dm-sans`
        }
      >
        {/* Top Pill Controls - Stealth Floating Handle */}
        <div
          data-tauri-drag-region
          onMouseDown={async (e) => {
            if ((e.target as HTMLElement).closest("button, input, textarea")) return;
            if (isTauri) {
              try {
                const { getCurrentWindow } = await import("@tauri-apps/api/window");
                await getCurrentWindow().startDragging();
              } catch {
                // ignore
              }
            }
          }}
          className="bg-[#18181b]/95 backdrop-blur-md border border-white/10 rounded-full flex items-center p-1.5 px-3 gap-2.5 shadow-2xl mb-2.5 pointer-events-auto transition-transform shrink-0"
        >
          <div className="text-white/40 hover:text-white/80" title="Drag to reposition widget">
            <GripHorizontal size={15} />
          </div>

          <button
            onClick={toggleStealth}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all ${
              isStealth
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                : "bg-white/10 text-white/70 hover:text-white hover:bg-white/20 border border-white/10"
            }`}
            title={isStealth ? "Stealth Mode ON: Excluded from screenshare & taskbar" : "Stealth Mode OFF: Click to enable"}
          >
            {isStealth ? <ShieldCheck size={13} className="text-emerald-400" /> : <ShieldAlert size={13} className="text-amber-400" />}
            <span>{isStealth ? "Stealth: ON" : "Stealth: OFF"}</span>
          </button>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/5 text-xs font-mono font-medium text-white/90">
            <span
              className={`w-2 h-2 rounded-full ${
                transcriptionHealth === "degraded" ? "bg-amber-400 animate-pulse" : "bg-red-500 animate-pulse"
              }`}
            />
            <span>{formattedTimer}</span>
          </div>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            title={isExpanded ? "Collapse height" : "Expand height"}
          >
            {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>

          <button
            onClick={() => setIsHidden(!isHidden)}
            className="p-1.5 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            title={isHidden ? "Show co-pilot" : "Hide co-pilot"}
          >
            <ChevronDown size={14} className={isHidden ? "rotate-180 transition-transform" : "transition-transform"} />
          </button>

          <button
            onClick={async () => {
              if (isTauri) {
                try {
                  const { getCurrentWindow } = await import("@tauri-apps/api/window");
                  await getCurrentWindow().minimize();
                } catch {
                  // ignore
                }
              } else {
                setIsHidden(true);
              }
            }}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white/70 hover:text-white"
            title="Minimize"
          >
            <Minus size={12} />
          </button>

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
          <div
            className={`w-full bg-[#18181b]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-3.5 shadow-2xl pointer-events-auto animate-in fade-in slide-in-from-top-4 duration-300 relative overflow-hidden transition-all duration-300 ${isExpanded ? "max-w-[660px]" : "max-w-[560px]"}`}
          >
            {/* Top Navigation Tabs */}
            <div className="flex items-center gap-1 mb-2.5 bg-black/40 p-1 rounded-xl border border-white/5">
              <button
                onClick={() => setActiveTab("chat")}
                className={`flex-1 py-1 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === "chat"
                    ? "bg-voiceflow-orange text-white shadow-sm"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <MessageSquare size={12} />
                <span>Co-Pilot</span>
                {messages.length > 0 && (
                  <span className="text-[10px] bg-black/30 text-white/90 px-1.5 py-0.2 rounded-full font-mono ml-0.5">
                    {messages.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab("transcript")}
                className={`flex-1 py-1 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === "transcript"
                    ? "bg-voiceflow-orange text-white shadow-sm"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <FileText size={12} />
                <span>Transcript</span>
                {liveTranscript && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />}
              </button>

              <button
                onClick={() => setActiveTab("history")}
                className={`flex-1 py-1 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === "history"
                    ? "bg-voiceflow-orange text-white shadow-sm"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                <History size={12} />
                <span>History</span>
                {savedSessions.length > 0 && (
                  <span className="text-[10px] bg-black/30 text-white/90 px-1.5 py-0.2 rounded-full font-mono ml-0.5">
                    {savedSessions.length}
                  </span>
                )}
              </button>
            </div>

            {/* TAB 1: CO-PILOT CHAT */}
            {activeTab === "chat" && (
              <>
                <div className="flex justify-between items-center mb-2 px-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        transcriptionHealth === "degraded" ? "bg-amber-400" : "bg-emerald-400 animate-pulse"
                      }`}
                    />
                    <span className="text-[11px] font-semibold text-white/60">{healthLabel}</span>
                  </div>
                  {messages.length > 0 && (
                    <button
                      onClick={handleStartOver}
                      className="text-[11px] text-white/40 hover:text-red-400 flex items-center gap-1 transition-colors"
                      title="Archive and start a new clean chat thread"
                    >
                      <Plus size={11} />
                      <span>New Chat</span>
                    </button>
                  )}
                </div>

                {/* Messages Container */}
                <div
                  ref={chatContainerRef}
                  className={`mb-2.5 bg-white/5 p-3 rounded-xl border border-white/5 overflow-y-auto space-y-3 transition-all duration-300 ${isExpanded ? "h-[320px] max-h-[320px]" : "h-56 max-h-56"} select-text pointer-events-auto scrollbar-thin scrollbar-thumb-white/20 hover:scrollbar-thumb-white/30 scrollbar-track-transparent pr-1.5`}
                >
                  {messages.length === 0 ? (
                    <div className="text-white/70 text-[13px] leading-relaxed py-3 text-center">
                      <p className="font-semibold text-white/90 mb-1">Live Meeting Co-Pilot Active</p>
                      <p className="text-white/60 text-xs max-w-sm mx-auto">
                        Click <strong className="text-voiceflow-orange">Analyze Screen</strong> or use one of the quick suggestions below. Live answers stream here in real time.
                      </p>
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div key={msg.id} className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}>
                        <div className="flex items-center gap-1.5 mb-1 px-1">
                          {msg.sender === "user" ? (
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

                        {msg.imageBase64 && (
                          <div className="mb-1.5 flex flex-col items-end">
                            <div
                              onClick={() => setPreviewModalImage(msg.imageBase64!)}
                              className="relative group rounded-lg overflow-hidden border border-white/20 bg-black/40 shadow-md"
                              title="Click to zoom screen capture"
                            >
                              <img src={msg.imageBase64} alt="Screen Snapshot" className="w-24 h-16 object-cover" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-[10px] text-white font-medium">
                                Zoom
                              </div>
                            </div>
                            <span className="text-[9px] text-white/40 mt-0.5">Attached Screen Capture</span>
                          </div>
                        )}

                        <div
                          className={`max-w-[92%] break-words selection:bg-white selection:text-voiceflow-orange ${
                            msg.sender === "user"
                              ? "bg-voiceflow-orange text-white font-medium text-xs sm:text-[13px] py-1.5 px-3.5 rounded-2xl rounded-tr-sm shadow-md leading-normal"
                              : msg.isError
                                ? "rounded-xl p-3 text-[12px] leading-relaxed bg-red-500/10 border border-red-500/30 text-red-200 shadow-sm w-full"
                                : "rounded-xl p-3 text-[13px] leading-relaxed bg-[#212124] border border-white/10 text-white/95 shadow-sm"
                          }`}
                        >
                          {msg.sender === "user" ? (
                            <p className="whitespace-pre-wrap">{msg.text}</p>
                          ) : msg.isError ? (
                            <div className="flex flex-col gap-2">
                              <div className="flex items-start gap-2">
                                <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                                <span>{msg.text}</span>
                              </div>
                              {msg.retryPrompt && (
                                <button
                                  onClick={() => handleRetryMessage(msg)}
                                  disabled={isQuerying}
                                  className="self-start flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-100 border border-red-500/30 text-[11px] font-semibold transition-all disabled:opacity-40"
                                >
                                  <RefreshCw size={11} />
                                  <span>Retry</span>
                                </button>
                              )}
                            </div>
                          ) : msg.isStreaming && !msg.text ? (
                            <div className="flex items-center justify-between gap-4">
                              <div className="flex items-center gap-2 text-white/80">
                                <Loader2 size={14} className="animate-spin text-voiceflow-orange" />
                                <span>Thinking...</span>
                              </div>
                              <button
                                onClick={handleHaltGeneration}
                                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 text-[11px] font-semibold"
                              >
                                <Square size={10} className="fill-current" />
                                <span>Halt</span>
                              </button>
                            </div>
                          ) : (
                            <>
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  p: ({ node, ...props }) => <p {...props} className="mb-2 last:mb-0 leading-relaxed" />,
                                  ol: ({ node, ...props }) => (
                                    <ol {...props} className="list-decimal pl-5 mb-2 space-y-1 marker:text-voiceflow-orange" />
                                  ),
                                  ul: ({ node, ...props }) => (
                                    <ul {...props} className="list-disc pl-5 mb-2 space-y-1 marker:text-voiceflow-orange" />
                                  ),
                                  li: ({ node, ...props }) => <li {...props} className="pl-0.5 leading-snug" />,
                                  strong: ({ node, ...props }) => <strong {...props} className="font-semibold text-white" />,
                                  em: ({ node, ...props }) => <em {...props} className="italic text-white/90" />,
                                  h1: ({ node, ...props }) => (
                                    <h1 {...props} className="text-sm font-bold text-white mb-1.5 mt-2 first:mt-0" />
                                  ),
                                  h2: ({ node, ...props }) => (
                                    <h2 {...props} className="text-xs font-bold text-white mb-1 mt-2 first:mt-0" />
                                  ),
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
                              {msg.isStreaming ? (
                                <span className="inline-block w-1.5 h-3.5 bg-voiceflow-orange animate-pulse ml-0.5 align-middle" />
                              ) : (
                                <span className="text-[9px] text-white/40 block mt-1.5 border-t border-white/5 pt-1">
                                  ⚡ Voiceflow AI
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Quick-Action Triggers */}
                <div className="grid grid-cols-3 gap-2 mb-2.5 text-xs font-semibold">
                  <button
                    onClick={() => {
                      void handleAskAI(
                        query.trim()
                          ? query
                          : "Analyze what is on my screen right now and give me the exact answer, solution, or speaking points.",
                        "capture-screen"
                      );
                    }}
                    disabled={isQuerying}
                    className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-gradient-to-r from-blue-600/20 to-indigo-600/20 hover:from-blue-600/30 hover:to-indigo-600/30 text-blue-200 hover:text-white border border-blue-500/30 transition-all active:scale-[0.98] disabled:opacity-50 text-[11px] font-medium shadow-sm"
                    title="Capture active desktop display & analyze"
                  >
                    <Camera size={13} className="text-blue-400 shrink-0" />
                    <span className="truncate">
                      {isPro || isAdmin ? "Analyze Screen" : `Screen (${Math.max(0, 3 - screenCaptureCount)} left)`}
                    </span>
                  </button>

                  <button
                    onClick={() =>
                      void handleAskAI(
                        "Give me a smart real-time answer suggestion for the current meeting point.",
                        "text-only"
                      )
                    }
                    disabled={isQuerying}
                    className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/90 border border-white/10 transition-all active:scale-[0.98] disabled:opacity-50 text-[11px] font-medium shadow-sm"
                    title="Suggest speaking answer from live transcript"
                  >
                    <Sparkles size={13} className="text-amber-400 shrink-0" />
                    <span className="truncate">Suggest Answer</span>
                  </button>

                  <button
                    onClick={() =>
                      void handleAskAI("Give me a 2-bullet point quick recap of what was just said.", "text-only")
                    }
                    disabled={isQuerying}
                    className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/90 border border-white/10 transition-all active:scale-[0.98] disabled:opacity-50 text-[11px] font-medium shadow-sm"
                    title="Quick recap of discussion"
                  >
                    <RotateCcw size={13} className="text-emerald-400 shrink-0" />
                    <span className="truncate">Recap</span>
                  </button>
                </div>

                {/* Attached Screenshot Notification Badge */}
                {hasAttachedImage && (
                  <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/30 px-3 py-1.5 rounded-lg mb-2 text-xs text-blue-300">
                    <span className="flex items-center gap-1.5 font-medium">
                      <ImageIcon size={12} className="text-blue-400" />
                      Screenshot attached for next message
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

                {/* Input Box */}
                <div className="relative flex items-center bg-[#252528] rounded-xl border border-white/10 p-1.5">
                  <button
                    onClick={() => {
                      void handleAskAI(
                        query.trim()
                          ? query
                          : "Analyze what is on my screen right now and give me the exact answer, solution, or speaking points.",
                        "capture-screen"
                      );
                    }}
                    disabled={isQuerying}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors border border-white/5 disabled:opacity-50"
                    title="Capture screen with question"
                  >
                    <Camera size={12} className="text-blue-400" />
                    <span>Screen</span>
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isQuerying}
                    className="p-1.5 text-white/60 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    title="Attach image"
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
                    placeholder="Ask co-pilot, follow up, or paste screenshot (Ctrl+V)..."
                    className="flex-1 bg-transparent border-none outline-none text-white text-xs px-2.5 placeholder:text-white/40 disabled:opacity-50"
                  />

                  {isQuerying ? (
                    <button
                      onClick={handleHaltGeneration}
                      className="w-8 h-8 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-all shadow-md active:scale-95 text-white"
                      title="Halt generation"
                    >
                      <Square size={12} className="fill-current text-white" />
                    </button>
                  ) : (
                    <button
                      onClick={() => void handleAskAI()}
                      disabled={!query.trim() && !hasAttachedImage}
                      className="w-8 h-8 rounded-full bg-voiceflow-orange hover:bg-orange-600 flex items-center justify-center transition-colors shadow-md disabled:opacity-40"
                      title="Send query"
                    >
                      <Play size={13} fill="currentColor" className="text-white ml-0.5" />
                    </button>
                  )}
                </div>
              </>
            )}

            {/* TAB 2: LIVE TRANSCRIPT */}
            {activeTab === "transcript" && (
              <div className="flex flex-col space-y-2.5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between text-xs text-white/80 px-1">
                  <div className="flex items-center gap-1.5 font-medium">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        transcriptionHealth === "degraded" ? "bg-amber-400" : "bg-emerald-400 animate-pulse"
                      }`}
                    />
                    <span>Live Audio Stream</span>
                    <span className="text-[10px] text-white/50 ml-1">
                      ({liveTranscript.trim() ? liveTranscript.trim().split(/\s+/).length : 0} words)
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        if (liveTranscript) {
                          copyToClipboard(liveTranscript);
                          setCopiedTranscript(true);
                          setTimeout(() => setCopiedTranscript(false), 2000);
                        }
                      }}
                      className="flex items-center gap-1 text-[11px] font-medium text-white/70 hover:text-white px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                      title="Copy complete live transcript"
                    >
                      {copiedTranscript ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                      <span>{copiedTranscript ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                </div>

                <div
                  ref={transcriptContainerRef}
                  className={`bg-black/40 border border-white/10 rounded-xl p-3.5 ${isExpanded ? "h-[340px]" : "h-64"} overflow-y-auto text-xs text-white/90 leading-relaxed select-text font-mono whitespace-pre-wrap scrollbar-thin scrollbar-thumb-white/20`}
                >
                  {liveTranscript.trim() ? (
                    liveTranscript
                  ) : (
                    <div className="text-white/40 italic py-6 text-center font-sans">
                      {systemAudioActive
                        ? "Listening to microphone and call audio... Speech will stream here in real time."
                        : "Listening to microphone... Words spoken will stream here in real time."}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-white/50 px-1">
                  <span>{healthLabel}</span>
                  <button
                    onClick={() => void handleAskAI("Summarize what has been said in this meeting so far.", "text-only")}
                    className="text-voiceflow-orange hover:text-orange-400 font-semibold transition-colors"
                  >
                    Summarize transcript →
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: SAVED CHAT SESSIONS / HISTORY */}
            {activeTab === "history" && (
              <div className="flex flex-col space-y-2.5 animate-in fade-in duration-200">
                <div className="flex items-center justify-between text-xs text-white/80 px-1">
                  <span className="font-semibold">Archived Meeting Chats</span>
                  <button
                    onClick={() => {
                      handleStartOver();
                      setActiveTab("chat");
                    }}
                    className="flex items-center gap-1 text-[11px] font-semibold text-voiceflow-orange hover:text-orange-400 transition-colors"
                  >
                    <Plus size={12} />
                    <span>Start New Thread</span>
                  </button>
                </div>

                <div className={`space-y-2 overflow-y-auto pr-1 ${isExpanded ? "h-[340px]" : "h-64"} scrollbar-thin scrollbar-thumb-white/20`}>
                  {savedSessions.length === 0 && messages.length === 0 ? (
                    <div className="text-white/40 text-xs italic py-8 text-center">
                      No archived chat sessions yet. When you clear a chat or start a new thread, it gets archived here so you never lose context.
                    </div>
                  ) : (
                    <>
                      {messages.length > 0 && (
                        <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-between">
                          <div className="overflow-hidden mr-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400 block mb-0.5">
                              Current Active Chat ({messages.length} messages)
                            </span>
                            <p className="text-xs text-white/90 truncate font-medium">
                              {messages[0]?.text || "Current conversation"}
                            </p>
                          </div>
                          <button
                            onClick={() => setActiveTab("chat")}
                            className="text-[11px] font-bold text-white bg-voiceflow-orange hover:bg-orange-600 px-2.5 py-1 rounded-lg transition-colors shrink-0"
                          >
                            Open
                          </button>
                        </div>
                      )}

                      {savedSessions.map((session) => (
                        <div
                          key={session.id}
                          className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 flex items-center justify-between transition-colors"
                        >
                          <div className="overflow-hidden mr-2">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[10px] text-white/40 font-mono">{session.timestamp}</span>
                              <span className="text-[10px] bg-white/10 text-white/70 px-1.5 py-0.2 rounded-full font-mono">
                                {session.messageCount} msg
                              </span>
                            </div>
                            <p className="text-xs text-white/90 truncate font-medium">{session.title}</p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleRestoreSession(session)}
                              className="text-[11px] font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-2 py-1 rounded-lg transition-colors"
                              title="Restore this conversation to active chat"
                            >
                              Restore
                            </button>
                            <button
                              onClick={() => handleDeleteSession(session.id)}
                              className="p-1 text-white/30 hover:text-red-400 transition-colors rounded-lg"
                              title="Delete archived session"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}

            <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />
          </div>
        )}
      </motion.div>
    </>,
    document.body
  );
}
