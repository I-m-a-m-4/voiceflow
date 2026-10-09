"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Send, Mic, Square, Image as ImageIcon, Play, Pause, 
  Trash2, Loader2, Check, User, Bot, AlertCircle, Sparkles, X, Headphones
} from "lucide-react";
import { 
  getFirestore, collection, query, orderBy, onSnapshot, 
  addDoc, doc, setDoc, updateDoc, serverTimestamp, getDocs, where 
} from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

interface SupportChatWidgetProps {
  user: any;
}

export function SupportChatWidget({ user }: SupportChatWidgetProps) {
  const { toast } = useToast();
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingThread, setIsLoadingThread] = useState(true);

  // Attachment states
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Voice recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedVoiceUrl, setRecordedVoiceUrl] = useState<string | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);

  // Audio playback states
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioElemRef = useRef<HTMLAudioElement | null>(null);

  const scrollBottomRef = useRef<HTMLDivElement>(null);

  const userEmail = user?.email || "anonymous@voiceflow.space";
  const userName = user?.displayName || userEmail.split("@")[0] || "User";
  const userId = user?.uid || "guest";

  // 1. Find or create user's support thread
  useEffect(() => {
    if (!userId || userId === "guest") {
      setIsLoadingThread(false);
      return;
    }

    const db = getFirestore();
    const threadsRef = collection(db, "supportThreads");
    const q = query(threadsRef, where("userId", "==", userId));

    let unsubMessages = () => {};

    const initThread = async () => {
      try {
        const snap = await getDocs(q);
        let resolvedThreadId = "";

        if (!snap.empty) {
          resolvedThreadId = snap.docs[0].id;
        } else {
          // Create new thread doc
          const newThreadRef = doc(threadsRef);
          resolvedThreadId = newThreadRef.id;
          await setDoc(newThreadRef, {
            id: resolvedThreadId,
            userId,
            userName,
            userEmail,
            subject: "Voiceflow Live Support",
            status: "open",
            lastMessageAt: serverTimestamp(),
            lastMessageSnippet: "Thread started",
            isReadByAdmin: false,
            isReadByUser: true,
            createdAt: serverTimestamp(),
          });
        }

        setThreadId(resolvedThreadId);

        // 2. Subscribe to messages subcollection
        const messagesRef = collection(db, `supportThreads/${resolvedThreadId}/messages`);
        const msgQuery = query(messagesRef, orderBy("createdAt", "asc"));

        unsubMessages = onSnapshot(msgQuery, (snapshot) => {
          const list: any[] = [];
          snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
          setMessages(list);
          setIsLoadingThread(false);
          setTimeout(() => {
            scrollBottomRef.current?.scrollIntoView({ behavior: "smooth" });
          }, 100);
        });
      } catch (err) {
        console.error("Support thread init error:", err);
        setIsLoadingThread(false);
      }
    };

    initThread();

    return () => {
      unsubMessages();
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, [userId]);

  // Image Upload handler
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: "Please select an image smaller than 5MB.",
      });
      return;
    }

    setIsUploadingImage(true);
    try {
      // Try /api/upload
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          setAttachedImage(data.url);
          setIsUploadingImage(false);
          return;
        }
      }

      // Fallback: Read as Base64 Data URL
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedImage(reader.result as string);
        setIsUploadingImage(false);
      };
      reader.readAsDataURL(file);
    } catch {
      // Fallback: Read as Base64 Data URL
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedImage(reader.result as string);
        setIsUploadingImage(false);
      };
      reader.readAsDataURL(file);
    }
  };

  // Voice Recording handlers
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setRecordedDuration(recordingSeconds);

        const reader = new FileReader();
        reader.onloadend = () => {
          setRecordedVoiceUrl(reader.result as string);
        };
        reader.readAsDataURL(audioBlob);

        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Microphone Access Required",
        description: "Please allow microphone permissions to record a voice note.",
      });
    }
  };

  const stopVoiceRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const discardVoiceRecording = () => {
    stopVoiceRecording();
    setRecordedVoiceUrl(null);
    setRecordingSeconds(0);
    setRecordedDuration(0);
  };

  // Send Message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() && !attachedImage && !recordedVoiceUrl) return;
    if (!threadId) return;

    setIsSending(true);
    const db = getFirestore();

    const textToSend = inputText.trim();
    const imageToSend = attachedImage;
    const voiceToSend = recordedVoiceUrl;
    const durationToSend = recordedDuration || recordingSeconds;

    setInputText("");
    setAttachedImage(null);
    setRecordedVoiceUrl(null);
    setRecordedDuration(0);
    setRecordingSeconds(0);

    try {
      const messagesRef = collection(db, `supportThreads/${threadId}/messages`);
      await addDoc(messagesRef, {
        senderId: userId,
        senderName: userName,
        text: textToSend,
        imageUrl: imageToSend || null,
        voiceUrl: voiceToSend || null,
        voiceDuration: durationToSend || null,
        createdAt: serverTimestamp(),
      });

      // Update parent thread document
      let snippet = textToSend;
      if (!snippet && voiceToSend) snippet = "🎤 Voice note";
      if (!snippet && imageToSend) snippet = "📷 Attached photo";

      const threadDocRef = doc(db, "supportThreads", threadId);
      await updateDoc(threadDocRef, {
        lastMessageAt: serverTimestamp(),
        lastMessageSnippet: snippet.slice(0, 100),
        isReadByAdmin: false,
        status: "open",
      });

      setTimeout(() => {
        scrollBottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err: any) {
      console.error("Failed to send support message:", err);
      toast({
        variant: "destructive",
        title: "Message Failed",
        description: "Could not send message. Please try again.",
      });
    } finally {
      setIsSending(false);
    }
  };

  const togglePlayAudio = (id: string, url: string) => {
    if (playingId === id) {
      audioElemRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioElemRef.current) {
        audioElemRef.current.pause();
      }
      const audio = new Audio(url);
      audioElemRef.current = audio;
      audio.play();
      setPlayingId(id);
      audio.onended = () => setPlayingId(null);
    }
  };

  return (
    <div className="flex flex-col h-[520px] bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-border bg-muted/40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-voiceflow-orange/10 flex items-center justify-center text-voiceflow-orange">
            <Headphones size={18} />
          </div>
          <div>
            <div className="text-sm font-bold text-foreground flex items-center gap-2">
              Voiceflow Support Team
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="text-[11px] text-muted-foreground">
              Direct line to Bello Imam & Engineering team • Typically replies in minutes
            </div>
          </div>
        </div>
      </div>

      {/* Message Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-background/50">
        {isLoadingThread ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <Loader2 size={24} className="animate-spin text-voiceflow-orange" />
            <span className="text-xs">Connecting to support channel...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 text-muted-foreground">
            <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center text-voiceflow-orange mb-3">
              <Sparkles size={22} />
            </div>
            <h4 className="text-sm font-bold text-foreground mb-1">How can we help you today?</h4>
            <p className="text-xs max-w-sm">
              Send us a message, share a screenshot, or record a quick voice note. Bello Imam and the Voiceflow team will reply right here!
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === userId || msg.senderId === userEmail;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
              >
                <div className="flex items-end gap-2 max-w-[85%] sm:max-w-[75%]">
                  {!isMe && (
                    <div className="w-7 h-7 rounded-full bg-voiceflow-orange text-white text-[11px] font-bold flex items-center justify-center shrink-0 shadow-xs mb-1">
                      BI
                    </div>
                  )}

                  <div
                    className={`rounded-2xl px-4 py-2.5 text-xs sm:text-sm shadow-xs ${
                      isMe
                        ? "bg-voiceflow-orange text-white rounded-br-xs"
                        : "bg-muted border border-border text-foreground rounded-bl-xs"
                    }`}
                  >
                    {!isMe && (
                      <div className="text-[10px] font-bold text-voiceflow-orange mb-1">
                        {msg.senderName || "Voiceflow Support"}
                      </div>
                    )}

                    {/* Image Attachment */}
                    {msg.imageUrl && (
                      <div className="mb-2 rounded-xl overflow-hidden border border-black/10 max-w-[240px]">
                        <img
                          src={msg.imageUrl}
                          alt="Support attachment"
                          className="w-full h-auto object-cover max-h-48 cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => window.open(msg.imageUrl, "_blank")}
                        />
                      </div>
                    )}

                    {/* Voice Note Player */}
                    {msg.voiceUrl && (
                      <div className={`flex items-center gap-2.5 p-2 rounded-xl mb-1.5 ${
                        isMe ? "bg-white/20" : "bg-background border border-border"
                      }`}>
                        <button
                          type="button"
                          onClick={() => togglePlayAudio(msg.id, msg.voiceUrl)}
                          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                            isMe ? "bg-white text-voiceflow-orange" : "bg-voiceflow-orange text-white"
                          }`}
                        >
                          {playingId === msg.id ? <Pause size={13} /> : <Play size={13} className="ml-0.5" />}
                        </button>
                        <div className="flex-1 min-w-[90px]">
                          <div className="text-[10px] font-bold">Voice Note</div>
                          <div className="text-[9px] opacity-80">
                            {msg.voiceDuration ? `${msg.voiceDuration}s` : "Audio message"}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Text Message */}
                    {msg.text && <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={scrollBottomRef} />
      </div>

      {/* Attachment Previews */}
      {attachedImage && (
        <div className="p-2.5 bg-muted/60 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={attachedImage} alt="Attachment Preview" className="w-10 h-10 object-cover rounded-lg border border-border" />
            <span className="text-xs text-muted-foreground font-medium">Image attached</span>
          </div>
          <button
            type="button"
            onClick={() => setAttachedImage(null)}
            className="p-1 hover:bg-muted rounded-full text-muted-foreground hover:text-foreground"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {recordedVoiceUrl && (
        <div className="p-2.5 bg-orange-500/10 border-t border-voiceflow-orange/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic size={15} className="text-voiceflow-orange animate-pulse" />
            <span className="text-xs font-bold text-foreground">
              Voice note ready ({recordedDuration}s)
            </span>
          </div>
          <button
            type="button"
            onClick={discardVoiceRecording}
            className="text-xs text-red-500 hover:underline font-semibold flex items-center gap-1"
          >
            <Trash2 size={13} /> Discard
          </button>
        </div>
      )}

      {/* Input Bar */}
      <div className="p-3 border-t border-border bg-card">
        {isRecording ? (
          <div className="flex items-center justify-between py-1 px-3 bg-red-500/10 border border-red-500/30 rounded-full animate-pulse">
            <div className="flex items-center gap-2 text-xs font-bold text-red-500">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
              Recording audio: {recordingSeconds}s
            </div>
            <button
              type="button"
              onClick={stopVoiceRecording}
              className="px-3 py-1 bg-red-500 text-white rounded-full text-xs font-bold hover:bg-red-600 transition-colors"
            >
              Finish Recording
            </button>
          </div>
        ) : (
          <form onSubmit={handleSendMessage} className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageSelect}
              accept="image/*"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingImage}
              title="Attach screenshot or photo"
              className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {isUploadingImage ? <Loader2 size={17} className="animate-spin text-voiceflow-orange" /> : <ImageIcon size={17} />}
            </button>

            <button
              type="button"
              onClick={startVoiceRecording}
              title="Record a voice note"
              className="p-2 rounded-xl text-muted-foreground hover:text-voiceflow-orange hover:bg-muted transition-colors"
            >
              <Mic size={17} />
            </button>

            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Write a message to support..."
              className="flex-1 bg-muted/40 border border-border rounded-xl px-3.5 py-2 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-voiceflow-orange shadow-none"
            />

            <button
              type="submit"
              disabled={isSending || (!inputText.trim() && !attachedImage && !recordedVoiceUrl)}
              className="p-2 rounded-xl bg-voiceflow-orange hover:bg-orange-600 disabled:opacity-40 text-white transition-colors shadow-xs"
              title="Send message"
            >
              {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
export default SupportChatWidget;
