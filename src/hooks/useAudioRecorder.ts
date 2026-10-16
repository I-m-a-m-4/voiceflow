import { useState, useRef, useCallback, useEffect } from "react";
import { useUser } from "@/firebase/provider";
import { saveMeeting } from "@/firebase/meetings";
import { apiBase } from "@/lib/platform";

const SILENCE_THRESHOLD = 5; // Very low volume threshold (0-255 scale)
const SILENCE_DURATION = 2000; // 2 seconds of silence before pausing

export function useAudioRecorder() {
  const { user } = useUser();
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPausedBySilence, setIsPausedBySilence] = useState(false);
  const [transcript, setTranscript] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const vadLoopRef = useRef<number | null>(null);
  const recognitionRef = useRef<any>(null);
  const isRecordingRef = useRef<boolean>(false);
  const shouldRestartRecognitionRef = useRef<boolean>(true);
  const startTimeRef = useRef<number>(0);
  const liveTranscribeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isTranscribingLiveRef = useRef<boolean>(false);
  const lastProcessedChunkCountRef = useRef<number>(0);

  const triggerLiveWhisperTranscribe = async () => {
    if (isTranscribingLiveRef.current || !isRecordingRef.current) return;
    if (chunksRef.current.length < 3) return; // Wait for at least ~3 seconds of initial audio
    if (chunksRef.current.length <= lastProcessedChunkCountRef.current) return;

    isTranscribingLiveRef.current = true;
    lastProcessedChunkCountRef.current = chunksRef.current.length;

    try {
      const mimeType = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const currentBlob = new Blob(chunksRef.current, { type: mimeType });
      const formData = new FormData();
      formData.append("file", currentBlob, "live-slice.webm");

      const base = apiBase();
      const transcribeUrl = base ? `${base}/api/transcribe` : "/api/transcribe";

      const res = await fetch(transcribeUrl, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        const liveText = (data.formattedTranscript || data.text || "").trim();
        if (liveText && isRecordingRef.current) {
          setTranscript(liveText);
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem('voiceflow_live_transcript', liveText);
            } catch (e) {}
            window.dispatchEvent(new CustomEvent('voiceflow-live-transcript', { detail: { transcript: liveText } }));
          }
        }
      }
    } catch (err) {
      console.warn("Live transcription slice skipped:", err);
    } finally {
      isTranscribingLiveRef.current = false;
    }
  };

  const startRecording = useCallback(async (captureSystemAudio = false) => {
    try {
      startTimeRef.current = Date.now();
      // 1. Get Microphone Audio (reuse healthy stream if already open to prevent permission prompts)
      // Note: echoCancellation: false is critical so laptop/desktop speaker audio isn't cancelled out by the OS
      let micStream = micStreamRef.current;
      const isStreamActive = micStream && micStream.getAudioTracks().some(track => track.readyState === 'live');
      
      if (!isStreamActive) {
        micStream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: true,
          } 
        });
        micStreamRef.current = micStream;
      }

      let finalStream = micStream!;

      // 2. Combine with System Audio (if user explicitly requested and supported)
      if (captureSystemAudio && navigator.mediaDevices?.getDisplayMedia) {
        try {
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true, // required by browser spec to get display media
            audio: true,
          });
          displayStreamRef.current = displayStream;
          
          const audioContext = new AudioContext();
          const dest = audioContext.createMediaStreamDestination();
          
          const micSource = audioContext.createMediaStreamSource(micStream!);
          micSource.connect(dest);

          // Check if user actually shared audio
          if (displayStream.getAudioTracks().length > 0) {
            const sysSource = audioContext.createMediaStreamSource(displayStream);
            sysSource.connect(dest);
          }
          
          finalStream = dest.stream;

          // Keep display stream around to stop video tracks immediately
          displayStream.getVideoTracks().forEach(track => {
             track.stop();
          });
        } catch (e) {
          console.info("System audio share cancelled or not provided, proceeding with microphone:", e);
        }
      }

      streamRef.current = finalStream;
      chunksRef.current = [];
      lastProcessedChunkCountRef.current = 0;

      const mimeType = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const mediaRecorder = new MediaRecorder(finalStream, { 
        mimeType,
        audioBitsPerSecond: 64000 // Voice-optimized 64kbps Opus for lightweight fast uploads
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        const elapsedSecs = Math.max(1, Math.round((Date.now() - (startTimeRef.current || Date.now())) / 1000));
        await processAudio(audioBlob, captureSystemAudio ? "meeting" : "dictation", elapsedSecs);
      };

      mediaRecorder.start(1000); // chunk every second
      setIsRecording(true);
      isRecordingRef.current = true;
      shouldRestartRecognitionRef.current = true;
      setIsPausedBySilence(false);
      setTranscript("");

      // Start periodic live Whisper transcription every 5 seconds
      if (liveTranscribeTimerRef.current) clearInterval(liveTranscribeTimerRef.current);
      liveTranscribeTimerRef.current = setInterval(triggerLiveWhisperTranscribe, 5000);

      // --- Real-Time Speech Recognition Setup (local fast bonus when supported) ---
      const SpeechRecognitionAPI = typeof window !== "undefined" && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
      if (SpeechRecognitionAPI) {
        try {
          const recognition = new SpeechRecognitionAPI();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = "en-US";

          let finalTranscript = "";

          recognition.onresult = (event: any) => {
            let interimTranscript = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript + " ";
              } else {
                interimTranscript += event.results[i][0].transcript;
              }
            }
            const currentText = (finalTranscript + interimTranscript).trim();
            if (currentText) {
              setTranscript(currentText);
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('voiceflow-live-transcript', { detail: { transcript: currentText } }));
              }
            }
          };

          recognition.onerror = (event: any) => {
            if (event.error === 'network' || event.error === 'not-allowed' || event.error === 'service-not-allowed') {
              shouldRestartRecognitionRef.current = false;
              console.info(`SpeechRecognition disabled (${event.error}). Recording continues via Whisper AI.`);
            } else {
              console.warn("SpeechRecognition warning:", event.error);
            }
          };

          recognition.onend = () => {
            if (isRecordingRef.current && shouldRestartRecognitionRef.current) {
              try {
                recognition.start();
              } catch (e) {
                // Ignore if already running
              }
            }
          };

          recognition.start();
          recognitionRef.current = recognition;
        } catch (recErr) {
          console.warn("SpeechRecognition start failed:", recErr);
        }
      }

      // --- Volume Level Monitor (VAD without disruptive recorder pausing) ---
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      
      const source = audioCtx.createMediaStreamSource(finalStream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;

        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((acc, val) => acc + val, 0) / bufferLength;

        if (average < SILENCE_THRESHOLD) {
          setIsPausedBySilence(true);
        } else {
          setIsPausedBySilence(false);
        }

        vadLoopRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
      // -----------------------------------

    } catch (err) {
      console.error("Error starting recording", err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    if (liveTranscribeTimerRef.current) {
      clearInterval(liveTranscribeTimerRef.current);
      liveTranscribeTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      recognitionRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    
    // Cleanup VAD
    if (vadLoopRef.current) cancelAnimationFrame(vadLoopRef.current);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    
    // Stop display stream tracks
    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach(track => track.stop());
      displayStreamRef.current = null;
    }

    setIsRecording(false);
    setIsPausedBySilence(false);
  }, []);

  useEffect(() => {
    // Pre-authorize audio permission once on mount so starting Voiceflow is automatic and never prompts repeatedly
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        }
      }).then((stream) => {
        micStreamRef.current = stream;
      }).catch((err) => {
        console.info("Audio auto-access warmup:", err);
      });
    }

    return () => {
      if (liveTranscribeTimerRef.current) {
        clearInterval(liveTranscribeTimerRef.current);
        liveTranscribeTimerRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop());
        micStreamRef.current = null;
      }
    };
  }, []);

  const processAudio = async (blob: Blob, type: "dictation" | "meeting", elapsedSecs = 0) => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append("file", blob, "audio.webm");

      const base = apiBase();
      const transcribeUrl = base ? `${base}/api/transcribe` : "/api/transcribe";
      const summarizeUrl = base ? `${base}/api/summarize` : "/api/summarize";

      // 1. Transcribe
      const transcribeRes = await fetch(transcribeUrl, {
        method: "POST",
        body: formData,
      });
      const transcribeData = await transcribeRes.json();

      if (!transcribeRes.ok) throw new Error(transcribeData.error);

      // Check if resuming an existing meeting session
      const resumeMeetingId = typeof window !== 'undefined' ? localStorage.getItem('voiceflow_resume_meeting_id') : null;
      const prevTranscript = typeof window !== 'undefined' ? (localStorage.getItem('voiceflow_resume_previous_transcript') || '') : '';
      const prevDuration = typeof window !== 'undefined' ? parseInt(localStorage.getItem('voiceflow_resume_previous_duration') || '0', 10) : 0;

      const newTranscript = transcribeData.formattedTranscript || transcribeData.text || "";
      const combinedTranscript = resumeMeetingId && prevTranscript
        ? `${prevTranscript}\n\n${newTranscript}`
        : newTranscript;

      const sessionDuration = elapsedSecs || (typeof transcribeData.duration === 'number' ? transcribeData.duration : 0);
      const totalDurationSeconds = resumeMeetingId ? (prevDuration + sessionDuration) : sessionDuration;
      const totalDurationMinutes = Math.max(1, Math.round(totalDurationSeconds / 60));

      // 2. Summarize / Clean up with user's custom context if provided
      const customContext = typeof window !== 'undefined' ? localStorage.getItem('voiceflow_custom_context') || '' : '';
      const summarizeRes = await fetch(summarizeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          text: combinedTranscript, 
          type, 
          customContext 
        }),
      });
      const summarizeData = await summarizeRes.json();

      if (!summarizeRes.ok) throw new Error(summarizeData.error);

      const finalOutput = summarizeData.text;
      setTranscript(finalOutput);

      // 3. Save or Update in Firestore
      if (user?.uid) {
        // Read current widget chat messages from localStorage so they are persisted to Firestore
        let currentChatMessages: any[] = [];
        let currentAssists: any[] = [];
        try {
          const rawChat = typeof window !== 'undefined' ? localStorage.getItem('voiceflow_widget_messages') : null;
          if (rawChat) {
            currentChatMessages = JSON.parse(rawChat);
            if (Array.isArray(currentChatMessages)) {
              for (let i = 0; i < currentChatMessages.length; i += 2) {
                const u = currentChatMessages[i];
                const a = currentChatMessages[i + 1];
                if (u && a && u.sender === 'user' && a.sender === 'ai') {
                  currentAssists.push({
                    prompt: u.text,
                    type: 'Assist',
                    response: a.text,
                    timestamp: u.timestamp || a.timestamp,
                  });
                }
              }
            }
          }
        } catch (e) {
          console.warn("Could not parse widget messages for meeting save:", e);
        }

        if (resumeMeetingId) {
          const { updateMeeting } = await import("@/firebase/meetings");
          await updateMeeting(resumeMeetingId, {
            transcript: combinedTranscript,
            summary: finalOutput,
            durationSeconds: totalDurationSeconds,
            durationMinutes: totalDurationMinutes,
            chatMessages: currentChatMessages,
            assists: currentAssists,
          }, user.uid);
        } else {
          await saveMeeting({
            userId: user.uid,
            transcript: combinedTranscript,
            summary: finalOutput,
            durationSeconds: totalDurationSeconds,
            durationMinutes: totalDurationMinutes,
            type,
            chatMessages: currentChatMessages,
            assists: currentAssists,
          });
        }

        // Also persist user plan usage directly to Firestore (anti-cheating)
        try {
          const { getFirestore, doc, updateDoc, increment } = await import("firebase/firestore");
          const db = getFirestore();
          await updateDoc(doc(db, "users", user.uid), {
            sessionCount: increment(resumeMeetingId ? 0 : 1),
            usedMinutes: increment(Math.max(1, Math.round(sessionDuration / 60)))
          });
        } catch (planErr) {
          console.warn("Could not increment user usage in firestore:", planErr);
        }
      }

      // Track usage & increment session count locally
      if (typeof window !== 'undefined') {
        const curSessions = parseInt(localStorage.getItem('voiceflow_session_count') || '0', 10);
        const curMins = parseInt(localStorage.getItem('voiceflow_used_minutes') || '0', 10);
        if (!resumeMeetingId) {
          localStorage.setItem('voiceflow_session_count', String(curSessions + 1));
        }
        localStorage.setItem('voiceflow_used_minutes', String(curMins + Math.max(1, Math.round(sessionDuration / 60))));
        window.dispatchEvent(new CustomEvent('voiceflow-usage-updated'));
      }

      // Clean up resumption state & redirect if resumed
      if (resumeMeetingId && typeof window !== 'undefined') {
        localStorage.removeItem('voiceflow_resume_meeting_id');
        localStorage.removeItem('voiceflow_resume_meeting_title');
        localStorage.removeItem('voiceflow_resume_previous_transcript');
        localStorage.removeItem('voiceflow_resume_previous_duration');
        localStorage.removeItem('voiceflow_resume_chat_messages');
        localStorage.removeItem('voiceflow_auto_start_record');

        // Redirect back to meeting details page so user sees resumed transcript immediately
        window.location.href = `/dashboard/meeting?id=${resumeMeetingId}`;
      }

      // Notify dashboard to refresh meetings feed immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('voiceflow-meeting-saved'));
      }

      // 4. Auto Copy to Clipboard
      if (type === "dictation") {
        await navigator.clipboard.writeText(finalOutput);
      }
      
    } catch (err) {
      console.error("Processing failed", err);
    } finally {
      setIsProcessing(false);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('voiceflow-processing-state', { detail: { isProcessing: false } }));
      }
    }
  };

  return { startRecording, stopRecording, isRecording, isProcessing, isPausedBySilence, transcript };
}

