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

  const startRecording = useCallback(async (captureSystemAudio = false) => {
    try {
      // 1. Get Microphone Audio (reuse healthy stream if already open to prevent permission prompts)
      let micStream = micStreamRef.current;
      const isStreamActive = micStream && micStream.getAudioTracks().some(track => track.readyState === 'live');
      
      if (!isStreamActive) {
        micStream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
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
        await processAudio(audioBlob, captureSystemAudio ? "meeting" : "dictation");
      };

      mediaRecorder.start(1000); // chunk every second
      setIsRecording(true);
      isRecordingRef.current = true;
      shouldRestartRecognitionRef.current = true;
      setIsPausedBySilence(false);
      setTranscript("");

      // --- Real-Time Speech Recognition Setup ---
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

      // --- VAD (Silence Detection) Setup ---
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
          // It's silent
          if (!silenceTimerRef.current && mediaRecorderRef.current.state === "recording") {
            silenceTimerRef.current = setTimeout(() => {
              if (mediaRecorderRef.current?.state === "recording") {
                mediaRecorderRef.current.pause();
                setIsPausedBySilence(true);
                console.log("VAD: Paused recording due to silence.");
              }
            }, SILENCE_DURATION);
          }
        } else {
          // Someone is speaking
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
          if (mediaRecorderRef.current.state === "paused") {
            mediaRecorderRef.current.resume();
            setIsPausedBySilence(false);
            console.log("VAD: Resumed recording (speech detected).");
          }
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
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      }).then((stream) => {
        micStreamRef.current = stream;
      }).catch((err) => {
        console.info("Audio auto-access warmup:", err);
      });
    }

    return () => {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(track => track.stop());
        micStreamRef.current = null;
      }
    };
  }, []);

  const processAudio = async (blob: Blob, type: "dictation" | "meeting") => {
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

      // 2. Summarize / Clean up with user's custom context if provided
      const customContext = typeof window !== 'undefined' ? localStorage.getItem('voiceflow_custom_context') || '' : '';
      const summarizeRes = await fetch(summarizeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          text: transcribeData.text, 
          type, 
          customContext 
        }),
      });
      const summarizeData = await summarizeRes.json();

      if (!summarizeRes.ok) throw new Error(summarizeData.error);

      const finalOutput = summarizeData.text;
      setTranscript(finalOutput);

      // 3. Save to Firestore
      if (user?.uid) {
        await saveMeeting({
          userId: user.uid,
          transcript: transcribeData.text,
          summary: finalOutput,
          type
        });

        // Also persist user plan usage directly to Firestore (anti-cheating)
        try {
          const { getFirestore, doc, updateDoc, increment } = await import("firebase/firestore");
          const db = getFirestore();
          await updateDoc(doc(db, "users", user.uid), {
            sessionCount: increment(1),
            usedMinutes: increment(2)
          });
        } catch (planErr) {
          console.warn("Could not increment user usage in firestore:", planErr);
        }
      }

      // Track usage & increment session count locally
      if (typeof window !== 'undefined') {
        const curSessions = parseInt(localStorage.getItem('voiceflow_session_count') || '0', 10);
        const curMins = parseInt(localStorage.getItem('voiceflow_used_minutes') || '0', 10);
        localStorage.setItem('voiceflow_session_count', String(curSessions + 1));
        localStorage.setItem('voiceflow_used_minutes', String(curMins + 2)); // Add 2 minutes per session
        window.dispatchEvent(new CustomEvent('voiceflow-usage-updated'));
      }

      // 4. Auto Copy to Clipboard
      if (type === "dictation") {
        await navigator.clipboard.writeText(finalOutput);
      }
      
    } catch (err) {
      console.error("Processing failed", err);
    } finally {
      setIsProcessing(false);
    }
  };

  return { startRecording, stopRecording, isRecording, isProcessing, isPausedBySilence, transcript };
}

