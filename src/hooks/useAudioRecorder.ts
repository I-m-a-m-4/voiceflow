import { useState, useRef, useCallback, useEffect } from "react";
import { useUser } from "@/firebase/provider";
import { saveMeeting } from "@/firebase/meetings";
import { apiBase, isNativeApp } from "@/lib/platform";
import { recordDeviceSession } from "@/lib/device-fingerprint";
import { copyToClipboard } from "@/lib/clipboard";

const SPEECH_ENERGY_THRESHOLD = 3.5; // Avg frequency magnitude (0-255) tuned to catch softer mics & laptop speakers
const SEGMENT_DURATION_MS = 5000; // Rotate self-contained ~40KB WebM segments every 5 seconds for low-latency live transcript

export type TranscriptionHealth = "idle" | "listening" | "syncing" | "degraded";

function getSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "";
}

export function useAudioRecorder() {
  const { user } = useUser();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPausedBySilence, setIsPausedBySilence] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [transcriptionHealth, setTranscriptionHealth] = useState<TranscriptionHealth>("idle");
  const [systemAudioActive, setSystemAudioActive] = useState(false);

  const activeRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const finalStreamRef = useRef<MediaStream | null>(null);
  const mixAudioCtxRef = useRef<AudioContext | null>(null);
  const vadAudioCtxRef = useRef<AudioContext | null>(null);
  const vadTimerRef = useRef<NodeJS.Timeout | null>(null);
  const rotateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);

  const isRecordingRef = useRef<boolean>(false);
  const isStartingRef = useRef<boolean>(false);
  const activeMimeTypeRef = useRef<string>("");
  const shouldRestartRecognitionRef = useRef<boolean>(true);
  const sessionStartMsRef = useRef<number>(0);
  const sessionTypeRef = useRef<"dictation" | "meeting">("dictation");

  // Ordered rolling segment store keyed by millisecond timestamp so dual-channel
  // ([THEM] WASAPI system audio + [YOU] microphone) always merges in exact chronological order!
  const segmentIndexRef = useRef<number>(0);
  const committedSegmentsRef = useRef<Map<number, { orderKey: number; text: string }>>(new Map());
  const pendingUploadsRef = useRef<Set<Promise<void>>>(new Set());
  const segmentHadSpeechRef = useRef<boolean>(false);
  const interimTextRef = useRef<string>("");
  const consecutiveFailuresRef = useRef<number>(0);
  const nativeLoopbackActiveRef = useRef<boolean>(false);
  const lastLoopbackDrainMsRef = useRef<number>(0);
  const lastTranscriptTailRef = useRef<string>("");

  const buildCombinedLiveTranscript = useCallback(() => {
    const entries = Array.from(committedSegmentsRef.current.entries())
      .sort((a, b) => a[1].orderKey - b[1].orderKey || a[0] - b[0])
      .map(([, item]) => item.text.trim())
      .filter(Boolean);

    const committed = entries.join("\n\n");
    if (committed) {
      lastTranscriptTailRef.current = committed.replace(/\[\d+:\d+\]\s*(?:\[(?:THEM|YOU)\]\s*)?/g, "").slice(-200).trim();
    }
    const interim = interimTextRef.current.trim();

    // Show browser interim preview ONLY as a live trailing line so it never clobbers Whisper's committed history
    if (interim && (!committed || !committed.toLowerCase().endsWith(interim.toLowerCase().slice(-24)))) {
      return committed ? `${committed}\n\n... ${interim}` : interim;
    }
    return committed;
  }, []);

  const broadcastTranscript = useCallback((nextText: string, reset = false) => {
    setTranscript(nextText);
    if (typeof window !== "undefined") {
      try {
        if (reset && !nextText) {
          localStorage.removeItem("voiceflow_live_transcript");
          localStorage.removeItem("voiceflow_current_meeting_backup");
        } else if (nextText) {
          localStorage.setItem("voiceflow_live_transcript", nextText);
          localStorage.setItem(
            "voiceflow_current_meeting_backup",
            JSON.stringify({
              transcript: nextText,
              updatedAt: new Date().toISOString(),
              startTime: sessionStartMsRef.current,
            })
          );
        }
      } catch {
        // ignore storage quota
      }
      window.dispatchEvent(
        new CustomEvent("voiceflow-live-transcript", {
          detail: { transcript: nextText, reset },
        })
      );
    }
  }, []);

  const uploadSegmentToWhisper = useCallback(
    (
      blob: Blob,
      segIdx: number,
      offsetSeconds: number,
      hadSpeech: boolean,
      speaker?: "THEM" | "YOU",
      filename?: string
    ) => {
      // Skip tiny/empty blobs or purely silent windows to avoid Whisper hallucinations and save quota
      if (blob.size < 1200) return Promise.resolve();
      if (!hadSpeech && segIdx > 0) return Promise.resolve();

      const orderKey = Math.max(0, Math.round(offsetSeconds * 1000)) + (speaker === "THEM" ? 0 : 1);

      const task = (async () => {
        setTranscriptionHealth("syncing");
        const base = apiBase();
        const transcribeUrl = base ? `${base}/api/transcribe` : "/api/transcribe";

        const formData = new FormData();
        formData.append("file", blob, filename || `segment-${segIdx}.webm`);
        formData.append("offsetSeconds", String(Math.max(0, Math.round(offsetSeconds))));
        if (speaker) {
          formData.append("speaker", speaker);
        }
        if (lastTranscriptTailRef.current) {
          formData.append("prompt", lastTranscriptTailRef.current);
        }

        try {
          const res = await fetch(transcribeUrl, {
            method: "POST",
            body: formData,
            signal: AbortSignal.timeout(25000),
          });

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }

          const data = await res.json();
          const segmentText = (data.formattedTranscript || data.text || "").trim();
          consecutiveFailuresRef.current = 0;
          setTranscriptionHealth("listening");

          if (segmentText) {
            committedSegmentsRef.current.set(segIdx, { orderKey, text: segmentText });
            // Clear stale interim preview once Whisper commits real text
            interimTextRef.current = "";
            broadcastTranscript(buildCombinedLiveTranscript());
          }
        } catch (err) {
          consecutiveFailuresRef.current += 1;
          console.warn(`Live transcription segment #${segIdx} (${speaker || "MIC"}) failed:`, err);
          if (consecutiveFailuresRef.current >= 2) {
            setTranscriptionHealth("degraded");
          }
        }
      })();

      pendingUploadsRef.current.add(task);
      task.finally(() => pendingUploadsRef.current.delete(task));
      return task;
    },
    [broadcastTranscript, buildCombinedLiveTranscript]
  );

  // Drains Windows native WASAPI system audio loopback buffer ([THEM] — interviewer / call audio on headphones!)
  const drainNativeSystemAudio = useCallback(async () => {
    if (!nativeLoopbackActiveRef.current) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const nowMs = Date.now();
      const chunkStartMs = lastLoopbackDrainMsRef.current || sessionStartMsRef.current || nowMs;
      lastLoopbackDrainMsRef.current = nowMs;

      const chunk = await invoke<{
        supported: boolean;
        active: boolean;
        wav_base64: string;
        duration_ms: number;
        rms: number;
        has_speech: boolean;
      }>("drain_system_audio_wav");

      if (!chunk?.has_speech || !chunk.wav_base64) return;

      const binary = atob(chunk.wav_base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const wavBlob = new Blob([bytes], { type: "audio/wav" });
      const segIdx = segmentIndexRef.current++;
      const offsetSeconds = Math.max(0, (chunkStartMs - sessionStartMsRef.current) / 1000);
      await uploadSegmentToWhisper(wavBlob, segIdx, offsetSeconds, true, "THEM", `system-${segIdx}.wav`);
    } catch (err) {
      console.warn("Native WASAPI loopback drain warning:", err);
    }
  }, [uploadSegmentToWhisper]);

  // Starts a self-contained MediaRecorder for one rolling window (~8s = ~64KB valid WebM with EBML header)
  const spawnSegmentRecorder = useCallback(
    (stream: MediaStream, mimeType: string) => {
      const segIdx = segmentIndexRef.current++;
      const segStartMs = Date.now();
      const offsetSeconds = Math.max(0, (segStartMs - sessionStartMsRef.current) / 1000);
      const localChunks: BlobPart[] = [];
      let localHadSpeech = false;

      // Capture speech flag for this window right before rotation
      segmentHadSpeechRef.current = false;

      const options: MediaRecorderOptions = { audioBitsPerSecond: 64000 };
      if (mimeType) options.mimeType = mimeType;

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, options);
      } catch {
        // Fallback if specific mimeType/bitrate is unsupported on mixed streams or WebView2
        recorder = new MediaRecorder(stream);
      }

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          localChunks.push(e.data);
        }
        if (segmentHadSpeechRef.current) {
          localHadSpeech = true;
        }
      };

      recorder.onstop = () => {
        if (segmentHadSpeechRef.current) {
          localHadSpeech = true;
        }
        if (localChunks.length > 0) {
          const segmentBlob = new Blob(localChunks, { type: mimeType || "audio/webm" });
          const speaker = nativeLoopbackActiveRef.current ? "YOU" : undefined;
          void uploadSegmentToWhisper(segmentBlob, segIdx, offsetSeconds, localHadSpeech || segIdx === 0, speaker);
        }
      };

      recorder.start(1000);
      activeRecorderRef.current = recorder;
      return recorder;
    },
    [uploadSegmentToWhisper]
  );

  const releaseAllMediaResources = useCallback(() => {
    if (rotateTimerRef.current) {
      clearInterval(rotateTimerRef.current);
      rotateTimerRef.current = null;
    }
    if (vadTimerRef.current) {
      clearInterval(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    if (recognitionRef.current) {
      shouldRestartRecognitionRef.current = false;
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (vadAudioCtxRef.current) {
      vadAudioCtxRef.current.close().catch(() => {});
      vadAudioCtxRef.current = null;
    }
    if (mixAudioCtxRef.current) {
      mixAudioCtxRef.current.close().catch(() => {});
      mixAudioCtxRef.current = null;
    }
    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach((t) => t.stop());
      displayStreamRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (nativeLoopbackActiveRef.current) {
      nativeLoopbackActiveRef.current = false;
      import("@tauri-apps/api/core")
        .then(({ invoke }) => invoke("stop_system_audio_capture").catch(() => {}))
        .catch(() => {});
    }
    finalStreamRef.current = null;
    setSystemAudioActive(false);
  }, []);

  const finalizeAndSaveMeeting = useCallback(
    async (type: "dictation" | "meeting", elapsedSecs: number) => {
      setIsProcessing(true);
      if (typeof window !== "undefined") {
        localStorage.setItem("voiceflow_is_processing", "true");
        window.dispatchEvent(new CustomEvent("voiceflow-processing-state", { detail: { isProcessing: true } }));
      }

      let savedMeetingId: string | null = null;
      let combinedTranscript = "";

      try {
        // Wait for the final segment recorder's onstop & any in-flight Whisper uploads (bounded to 15s)
        await new Promise((r) => setTimeout(r, 350));
        if (pendingUploadsRef.current.size > 0) {
          await Promise.race([
            Promise.allSettled(Array.from(pendingUploadsRef.current)),
            new Promise((r) => setTimeout(r, 15000)),
          ]);
        }

        const committedOnly = Array.from(committedSegmentsRef.current.entries())
          .sort((a, b) => a[1].orderKey - b[1].orderKey || a[0] - b[0])
          .map(([, item]) => item.text.trim())
          .filter(Boolean)
          .join("\n\n");

        const fallbackInterim = interimTextRef.current.trim();
        const newTranscript = committedOnly || fallbackInterim || "";

        // Check if resuming an existing meeting session
        const resumeMeetingId = typeof window !== "undefined" ? localStorage.getItem("voiceflow_resume_meeting_id") : null;
        const prevTranscript = typeof window !== "undefined" ? localStorage.getItem("voiceflow_resume_previous_transcript") || "" : "";
        const prevDuration = typeof window !== "undefined" ? parseInt(localStorage.getItem("voiceflow_resume_previous_duration") || "0", 10) : 0;

        combinedTranscript =
          resumeMeetingId && prevTranscript
            ? `${prevTranscript}\n\n${newTranscript}`.trim()
            : newTranscript.trim();

        if (!combinedTranscript) {
          combinedTranscript =
            (typeof window !== "undefined" ? localStorage.getItem("voiceflow_live_transcript") || "" : "").trim();
        }

        const sessionDuration = Math.max(1, elapsedSecs);
        const totalDurationSeconds = resumeMeetingId ? prevDuration + sessionDuration : sessionDuration;
        const totalDurationMinutes = Math.max(1, Math.round(totalDurationSeconds / 60));

        // Extract current widget chat messages & assists (stripped of heavy base64)
        let currentChatMessages: any[] = [];
        let currentAssists: any[] = [];
        try {
          const rawChat = typeof window !== "undefined" ? localStorage.getItem("voiceflow_widget_messages") : null;
          if (rawChat) {
            currentChatMessages = JSON.parse(rawChat);
            if (Array.isArray(currentChatMessages)) {
              for (let i = 0; i < currentChatMessages.length; i++) {
                const u = currentChatMessages[i];
                const a = currentChatMessages[i + 1];
                if (u && a && u.sender === "user" && a.sender === "ai" && !a.isError) {
                  currentAssists.push({
                    prompt: u.text,
                    type: "Assist",
                    response: a.text,
                    timestamp: u.timestamp || a.timestamp,
                  });
                  i++;
                }
              }
            }
          }
        } catch (e) {
          console.warn("Could not parse widget messages for meeting save:", e);
        }

        // Derive clean initial title
        const activeTitle = typeof window !== "undefined" ? localStorage.getItem("voiceflow_active_meeting_title") : null;
        const cleanFirstLine = combinedTranscript
          .replace(/^\[\d+:\d+\]\s*/gm, "")
          .split("\n")
          .map((l) => l.trim())
          .find((l) => l.length > 5) || "";

        const derivedTitle =
          activeTitle ||
          (cleanFirstLine.length > 5
            ? cleanFirstLine.length > 52
              ? `${cleanFirstLine.slice(0, 49)}...`
              : cleanFirstLine
            : `Meeting Session (${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`);

        if (typeof window !== "undefined") {
          localStorage.removeItem("voiceflow_active_meeting_title");
        }

        // --- PHASE 1 IMMEDIATE SAVE ---
        if (user?.uid && (combinedTranscript || currentChatMessages.length > 0)) {
          if (resumeMeetingId) {
            savedMeetingId = resumeMeetingId;
            const { updateMeeting } = await import("@/firebase/meetings");
            await updateMeeting(
              resumeMeetingId,
              {
                transcript: combinedTranscript,
                durationSeconds: totalDurationSeconds,
                durationMinutes: totalDurationMinutes,
                chatMessages: currentChatMessages,
                assists: currentAssists,
                status: "summarizing",
              },
              user.uid
            );
          } else {
            savedMeetingId = await saveMeeting({
              userId: user.uid,
              title: derivedTitle,
              transcript: combinedTranscript,
              summary: "Generating executive AI summary...",
              durationSeconds: totalDurationSeconds,
              durationMinutes: totalDurationMinutes,
              type,
              chatMessages: currentChatMessages,
              assists: currentAssists,
            });
          }

          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("voiceflow-meeting-saved"));
          }
        }

        // --- PHASE 2 SUMMARIZE ---
        const base = apiBase();
        const summarizeUrl = base ? `${base}/api/summarize` : "/api/summarize";
        const customContext = typeof window !== "undefined" ? localStorage.getItem("voiceflow_custom_context") || "" : "";
        let finalOutput = "";
        let aiTitle = "";

        if (combinedTranscript.length >= 15) {
          try {
            const summarizeRes = await fetch(summarizeUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: combinedTranscript,
                type,
                customContext,
              }),
              signal: AbortSignal.timeout(35000),
            });

            if (summarizeRes.ok) {
              const summarizeData = await summarizeRes.json();
              finalOutput = summarizeData.text || "";
              aiTitle = summarizeData.title || "";
            }
          } catch (sumErr) {
            console.warn("Remote summarization failed, using local summary:", sumErr);
          }
        }

        if (!finalOutput || !finalOutput.trim()) {
          if (combinedTranscript) {
            const sentences = combinedTranscript
              .replace(/\[\d+:\d+\]\s*/g, "")
              .split(/(?<=[.!?])\s+/)
              .filter((s) => s.trim().length > 15);
            const lead = sentences.slice(0, 2).join(" ") || combinedTranscript.slice(0, 200);
            const keyPoints = sentences.slice(2, 6);
            finalOutput = `## Executive Summary\n${lead}\n\n## Key Takeaways\n`;
            if (keyPoints.length > 0) {
              keyPoints.forEach((kp) => {
                finalOutput += `• **Discussion Point**: ${kp.trim()}\n`;
              });
            } else {
              finalOutput += `• **Discussion Point**: ${combinedTranscript.slice(0, 250).trim()}\n`;
            }
          } else {
            finalOutput = "## Executive Summary\nNo spoken audio was detected during this session.";
          }
        }

        // Update saved meeting with summary (do NOT overwrite live transcript state with summary)
        if (user?.uid && savedMeetingId) {
          const { updateMeeting } = await import("@/firebase/meetings");
          const updatePayload: any = {
            summary: finalOutput,
            status: "completed",
          };
          if (!activeTitle && aiTitle && aiTitle.length > 5 && !resumeMeetingId) {
            updatePayload.title = aiTitle;
          }
          await updateMeeting(savedMeetingId, updatePayload, user.uid);

          try {
            const { getFirestore, doc, updateDoc, increment } = await import("firebase/firestore");
            const db = getFirestore();
            await updateDoc(doc(db, "users", user.uid), {
              sessionCount: increment(resumeMeetingId ? 0 : 1),
              usedMinutes: increment(Math.max(1, Math.round(sessionDuration / 60))),
            });
            recordDeviceSession(db, sessionDuration).catch(() => {});
          } catch (planErr) {
            console.warn("Could not increment user usage in firestore:", planErr);
          }
        }

        if (typeof window !== "undefined") {
          const curSessions = parseInt(localStorage.getItem("voiceflow_session_count") || "0", 10);
          const curMins = parseInt(localStorage.getItem("voiceflow_used_minutes") || "0", 10);
          if (!resumeMeetingId) {
            localStorage.setItem("voiceflow_session_count", String(curSessions + 1));
          }
          localStorage.setItem("voiceflow_used_minutes", String(curMins + Math.max(1, Math.round(sessionDuration / 60))));
          window.dispatchEvent(new CustomEvent("voiceflow-usage-updated"));
          window.dispatchEvent(new CustomEvent("voiceflow-meeting-saved"));
        }

        if (resumeMeetingId && typeof window !== "undefined") {
          localStorage.removeItem("voiceflow_resume_meeting_id");
          localStorage.removeItem("voiceflow_resume_meeting_title");
          localStorage.removeItem("voiceflow_resume_previous_transcript");
          localStorage.removeItem("voiceflow_resume_previous_duration");
          localStorage.removeItem("voiceflow_resume_chat_messages");
          localStorage.removeItem("voiceflow_auto_start_record");
          window.location.href = `/dashboard/meeting?id=${resumeMeetingId}`;
        }

        if (type === "dictation" && finalOutput) {
          await copyToClipboard(finalOutput);
        }
      } catch (err) {
        console.error("Meeting finalization error:", err);
      } finally {
        setIsProcessing(false);
        setTranscriptionHealth("idle");
        if (typeof window !== "undefined") {
          localStorage.removeItem("voiceflow_is_processing");
          window.dispatchEvent(new CustomEvent("voiceflow-processing-state", { detail: { isProcessing: false } }));
        }
      }
    },
    [user?.uid]
  );

  const startRecording = useCallback(
    async (captureSystemAudio = false) => {
      if (isRecordingRef.current || isStartingRef.current) return;
      isStartingRef.current = true;

      try {
        // Reset session state cleanly BEFORE starting so zero stale context leaks from prior sessions
        sessionStartMsRef.current = Date.now();
        segmentIndexRef.current = 0;
        committedSegmentsRef.current = new Map();
        pendingUploadsRef.current = new Set();
        segmentHadSpeechRef.current = false;
        interimTextRef.current = "";
        consecutiveFailuresRef.current = 0;
        setTranscriptionHealth("listening");
        broadcastTranscript("", true);

        // 0. On Windows Desktop (Tauri), silently start NATIVE WASAPI System Audio Loopback!
        // Captures crystal-clear [THEM] audio (Zoom/Meet/Teams/headphones) with ZERO "Share Screen" popup!
        let nativeLoopbackStarted = false;
        if (isNativeApp()) {
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            nativeLoopbackStarted = Boolean(await invoke<boolean>("start_system_audio_capture"));
            nativeLoopbackActiveRef.current = nativeLoopbackStarted;
            lastLoopbackDrainMsRef.current = Date.now();
          } catch (loopErr) {
            nativeLoopbackActiveRef.current = false;
            console.info("Native WASAPI loopback unavailable on this platform/device, using mic:", loopErr);
          }
        }

        // 1. Always acquire Microphone Audio FIRST (with safe fallback to plain `{ audio: true }`)
        // When native WASAPI loopback is active, enable echoCancellation on mic so speakers don't double-record as [YOU]
        let micStream: MediaStream;
        try {
          micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: nativeLoopbackStarted,
              noiseSuppression: nativeLoopbackStarted,
              autoGainControl: true,
            },
          });
        } catch {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        micStreamRef.current = micStream;

        // 2. Optional Browser Tab/System Audio (strictly web opt-in, NEVER blocks or crashes desktop start!)
        let hasSystemAudio = nativeLoopbackStarted;
        let finalStream: MediaStream = micStream;

        if (
          captureSystemAudio &&
          !isNativeApp() &&
          typeof navigator !== "undefined" &&
          navigator.mediaDevices?.getDisplayMedia
        ) {
          try {
            const displayStream = await navigator.mediaDevices.getDisplayMedia({
              video: true, // required by browser spec to expose audio checkbox
              audio: true,
            });
            displayStreamRef.current = displayStream;
            // Stop unneeded video track while keeping captured audio tracks
            displayStream.getVideoTracks().forEach((t) => t.stop());

            if (displayStream.getAudioTracks().length > 0) {
              const mixCtx = new AudioContext();
              mixAudioCtxRef.current = mixCtx;
              if (mixCtx.state === "suspended") {
                await mixCtx.resume().catch(() => {});
              }
              const dest = mixCtx.createMediaStreamDestination();
              mixCtx.createMediaStreamSource(micStream).connect(dest);
              mixCtx.createMediaStreamSource(displayStream).connect(dest);
              if (dest.stream.getAudioTracks().length > 0) {
                finalStream = dest.stream;
                hasSystemAudio = true;
              }
            }
          } catch (e) {
            // Non-fatal: always continue recording cleanly with microphone!
            console.info("Optional tab/system audio skipped or failed, continuing with microphone:", e);
            if (displayStreamRef.current) {
              displayStreamRef.current.getTracks().forEach((t) => t.stop());
              displayStreamRef.current = null;
            }
            if (mixAudioCtxRef.current) {
              mixAudioCtxRef.current.close().catch(() => {});
              mixAudioCtxRef.current = null;
            }
            finalStream = micStream;
            hasSystemAudio = false;
          }
        }

        setSystemAudioActive(hasSystemAudio);
        sessionTypeRef.current = hasSystemAudio ? "meeting" : "dictation";
        finalStreamRef.current = finalStream;

        const mimeType = getSupportedAudioMimeType();
        activeMimeTypeRef.current = mimeType;

        // 3. Start rolling self-contained segment recorder (8s windows = ~60KB each, scales to hours without 413!)
        try {
          spawnSegmentRecorder(finalStream, mimeType);
        } catch (recErr) {
          // If mixed stream fails MediaRecorder in any webview, fall back cleanly to raw micStream
          console.warn("Primary recorder stream failed, falling back to raw microphone stream:", recErr);
          finalStream = micStream;
          finalStreamRef.current = micStream;
          setSystemAudioActive(false);
          spawnSegmentRecorder(micStream, "");
        }

        isRecordingRef.current = true;
        setIsRecording(true);
        setIsPausedBySilence(false);

        if (typeof window !== "undefined") {
          try {
            localStorage.setItem("voiceflow_is_recording", "true");
            window.dispatchEvent(new CustomEvent("voiceflow-record-state", { detail: { isRecording: true } }));
          } catch {
            // ignore
          }
        }

        // Rotate recorder cleanly every 5 seconds: start next BEFORE stopping previous so 0ms audio is lost!
        // Also drain native Windows WASAPI system audio ([THEM]) on the same cadence!
        rotateTimerRef.current = setInterval(() => {
          if (!isRecordingRef.current || !finalStreamRef.current) return;
          if (nativeLoopbackActiveRef.current) {
            void drainNativeSystemAudio();
          }
          const previousRecorder = activeRecorderRef.current;
          spawnSegmentRecorder(finalStreamRef.current, mimeType);
          if (previousRecorder && previousRecorder.state !== "inactive") {
            try {
              previousRecorder.stop();
            } catch {
              // ignore
            }
          }
        }, SEGMENT_DURATION_MS);

        // 4. Lightweight 10Hz Speech Activity Detector (no 60fps React re-renders!)
        try {
          const vadCtx = new AudioContext();
          vadAudioCtxRef.current = vadCtx;
          const analyser = vadCtx.createAnalyser();
          analyser.fftSize = 256;
          vadCtx.createMediaStreamSource(finalStream).connect(analyser);
          const freqData = new Uint8Array(analyser.frequencyBinCount);
          let silentTicks = 0;

          vadTimerRef.current = setInterval(() => {
            if (!isRecordingRef.current) return;
            analyser.getByteFrequencyData(freqData);
            let sum = 0;
            for (let i = 0; i < freqData.length; i++) sum += freqData[i];
            const avg = sum / freqData.length;

            if (avg >= SPEECH_ENERGY_THRESHOLD) {
              segmentHadSpeechRef.current = true;
              silentTicks = 0;
              setIsPausedBySilence((prev) => (prev ? false : prev));
            } else {
              silentTicks += 1;
              if (silentTicks >= 20) {
                setIsPausedBySilence((prev) => (!prev ? true : prev));
              }
            }
          }, 100);
        } catch (vadErr) {
          // If AudioContext fails, default hadSpeech to true so segments always upload
          segmentHadSpeechRef.current = true;
          console.warn("VAD init skipped:", vadErr);
        }

        // 5. Optional Browser SpeechRecognition strictly for low-latency interim preview (NEVER overwrites Whisper!)
        const SpeechRecognitionAPI =
          typeof window !== "undefined" &&
          ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
        if (SpeechRecognitionAPI) {
          try {
            shouldRestartRecognitionRef.current = true;
            const recognition = new SpeechRecognitionAPI();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = "en-US";

            recognition.onresult = (event: any) => {
              if (!isRecordingRef.current) return;
              let latest = "";
              for (let i = event.resultIndex; i < event.results.length; i++) {
                latest += event.results[i][0].transcript + " ";
              }
              const cleaned = latest.trim();
              if (cleaned) {
                segmentHadSpeechRef.current = true;
                interimTextRef.current = cleaned;
                broadcastTranscript(buildCombinedLiveTranscript());
              }
            };

            recognition.onerror = (event: any) => {
              if (event.error === "not-allowed" || event.error === "service-not-allowed") {
                shouldRestartRecognitionRef.current = false;
              }
            };

            recognition.onend = () => {
              if (isRecordingRef.current && shouldRestartRecognitionRef.current) {
                setTimeout(() => {
                  try {
                    if (isRecordingRef.current && recognitionRef.current) {
                      recognitionRef.current.start();
                    }
                  } catch {
                    // ignore
                  }
                }, 800);
              }
            };

            recognition.start();
            recognitionRef.current = recognition;
          } catch {
            // Whisper handles everything even without SpeechRecognition
          }
        }
      } catch (err: any) {
        console.error("Error starting recording:", err);
        isRecordingRef.current = false;
        setIsRecording(false);
        setTranscriptionHealth("idle");
        releaseAllMediaResources();
        if (typeof window !== "undefined") {
          const msg =
            err?.name === "NotAllowedError"
              ? "Microphone permission was denied. Please allow microphone access in Windows/browser settings and try again."
              : err?.name === "NotFoundError"
                ? "No microphone device was found. Please connect a microphone and try again."
                : err?.message || "Could not start recording. Please check your microphone and try again.";
          window.dispatchEvent(new CustomEvent("voiceflow-recorder-error", { detail: { message: msg } }));
        }
      } finally {
        isStartingRef.current = false;
      }
    },
    [broadcastTranscript, buildCombinedLiveTranscript, drainNativeSystemAudio, releaseAllMediaResources, spawnSegmentRecorder]
  );

  const stopRecording = useCallback(() => {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;

    const elapsedSecs = Math.max(1, Math.round((Date.now() - (sessionStartMsRef.current || Date.now())) / 1000));
    const sessionType = sessionTypeRef.current;

    if (rotateTimerRef.current) {
      clearInterval(rotateTimerRef.current);
      rotateTimerRef.current = null;
    }

    // Flush final native WASAPI system audio buffer before stopping
    if (nativeLoopbackActiveRef.current) {
      void drainNativeSystemAudio();
    }

    // Flush the final in-progress segment
    const finalRecorder = activeRecorderRef.current;
    activeRecorderRef.current = null;
    if (finalRecorder && finalRecorder.state !== "inactive") {
      try {
        // Ensure final short segment gets transcribed even if user spoke briefly
        segmentHadSpeechRef.current = true;
        finalRecorder.stop();
      } catch {
        // ignore
      }
    }

    // Release mic, system audio, VAD, and SpeechRecognition cleanly
    setTimeout(() => {
      releaseAllMediaResources();
    }, 150);

    setIsRecording(false);
    setIsPausedBySilence(false);

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("voiceflow_is_recording", "false");
        window.dispatchEvent(new CustomEvent("voiceflow-record-state", { detail: { isRecording: false } }));
      } catch {
        // ignore
      }
    }

    void finalizeAndSaveMeeting(sessionType, elapsedSecs);
  }, [drainNativeSystemAudio, finalizeAndSaveMeeting, releaseAllMediaResources]);

  // Offline meeting sync listener + cleanup on unmount
  useEffect(() => {
    const handleOnline = async () => {
      try {
        const { syncOfflineMeetings } = await import("@/firebase/meetings");
        const count = await syncOfflineMeetings();
        if (count > 0 && typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("voiceflow-meeting-saved"));
        }
      } catch {
        // ignore
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("online", handleOnline);
      void handleOnline();
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
      }
      releaseAllMediaResources();
    };
  }, [releaseAllMediaResources]);

  /**
   * Immediately flushes the in-progress audio window to Whisper and awaits any in-flight
   * transcription (capped at 4.2s) so "Suggest Answer" / "Recap" ALWAYS sees speech spoken
   * right up to the moment the user clicked the button — even inside WebView2 where browser
   * SpeechRecognition is unavailable.
   */
  const flushPendingAudio = useCallback(async (): Promise<string> => {
    try {
      const flushPromises: Promise<any>[] = [];

      // 1. Immediately drain Windows native WASAPI system audio ([THEM] — interviewer's latest words!)
      if (isRecordingRef.current && nativeLoopbackActiveRef.current) {
        flushPromises.push(drainNativeSystemAudio());
      }

      // 2. Immediately rotate & flush the user's microphone segment ([YOU])
      if (isRecordingRef.current && finalStreamRef.current) {
        const previousRecorder = activeRecorderRef.current;
        if (previousRecorder && previousRecorder.state === "recording") {
          segmentHadSpeechRef.current = true;
          try {
            spawnSegmentRecorder(finalStreamRef.current, activeMimeTypeRef.current);
          } catch {
            // ignore if stream closed
          }
          try {
            previousRecorder.stop();
          } catch {
            // ignore
          }
          // Let recorder.onstop fire and enqueue the Whisper upload into pendingUploadsRef
          await new Promise((r) => setTimeout(r, 180));
        }
      }

      if (flushPromises.length > 0) {
        await Promise.race([
          Promise.allSettled(flushPromises),
          new Promise((r) => setTimeout(r, 4200)),
        ]);
      }

      if (pendingUploadsRef.current.size > 0) {
        await Promise.race([
          Promise.allSettled(Array.from(pendingUploadsRef.current)),
          new Promise((r) => setTimeout(r, 4200)),
        ]);
      }
    } catch {
      // Non-fatal: fall through to whatever transcript is already captured
    }
    return buildCombinedLiveTranscript();
  }, [buildCombinedLiveTranscript, drainNativeSystemAudio, spawnSegmentRecorder]);

  return {
    startRecording,
    stopRecording,
    flushPendingAudio,
    isRecording,
    isProcessing,
    isPausedBySilence,
    transcript,
    transcriptionHealth,
    systemAudioActive,
  };
}
