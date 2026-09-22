import { useState, useRef, useCallback, useEffect } from "react";
import { useUser } from "@/firebase/provider";
import { saveMeeting } from "@/firebase/meetings";

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
  const streamRef = useRef<MediaStream | null>(null);
  
  // VAD refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const vadLoopRef = useRef<number | null>(null);

  const startRecording = useCallback(async (captureSystemAudio = false) => {
    try {
      // 1. Get Microphone Audio
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      let finalStream = micStream;

      // 2. Combine with System Audio (if Granola mode)
      if (captureSystemAudio) {
        try {
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: true, // required to get display media, we'll ignore it
            audio: true,
          });
          
          const audioContext = new AudioContext();
          const dest = audioContext.createMediaStreamDestination();
          
          const micSource = audioContext.createMediaStreamSource(micStream);
          micSource.connect(dest);

          // Check if user actually shared audio
          if (displayStream.getAudioTracks().length > 0) {
            const sysSource = audioContext.createMediaStreamSource(displayStream);
            sysSource.connect(dest);
          }
          
          finalStream = dest.stream;

          // Keep display stream around to stop it later
          displayStream.getVideoTracks().forEach(track => {
             // stop video track immediately since we only want audio
             track.stop();
          });
        } catch (e) {
          console.warn("Could not capture system audio", e);
        }
      }

      streamRef.current = finalStream;
      chunksRef.current = [];

      const mediaRecorder = new MediaRecorder(finalStream, { mimeType: "audio/webm" });
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
      setIsPausedBySilence(false);
      setTranscript("");

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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    
    // Cleanup VAD
    if (vadLoopRef.current) cancelAnimationFrame(vadLoopRef.current);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (audioCtxRef.current) audioCtxRef.current.close();
    
    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    setIsRecording(false);
    setIsPausedBySilence(false);
  }, []);

  const processAudio = async (blob: Blob, type: "dictation" | "meeting") => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append("file", blob, "audio.webm");

      // 1. Transcribe
      const transcribeRes = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });
      const transcribeData = await transcribeRes.json();

      if (!transcribeRes.ok) throw new Error(transcribeData.error);

      // 2. Summarize / Clean up
      const summarizeRes = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: transcribeData.text, type }),
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
