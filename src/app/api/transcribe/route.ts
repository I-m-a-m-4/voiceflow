import { NextRequest, NextResponse, after } from "next/server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Always-drop Whisper boilerplate hallucinations (YouTube / caption artifacts)
const ALWAYS_HALLUCINATION_PATTERNS = [
  /^(thank\s+you(\s+(very|so)\s+much)?\s+for\s+(watching|listening)|thanks(\s+(so\s+much|a\s+lot))?\s+for\s+(watching|listening)|please\s+(subscribe|like)|like\s+and\s+subscribe|subscribe\s+to\s+(my|the)\s+channel|subtitle[s]?\s+by.*|transcribed\s+by.*|captions\s+by.*|amara\.org.*|mbc\s+news.*|copyright.*|www\..*|https?:\/\/.*)\.?$/i,
];

// Short filler/silence hallucinations dropped when no_speech_prob is elevated or standalone
const SILENCE_HALLUCINATION_PATTERNS = [
  /^(thank\s+you(\s+(very|so)\s+much)?|thanks|you|bye|goodbye|see\s+you(\s+(next\s+time|later|soon))?|okay|ok|so|um+|uh+|hmm+|oh|ah|huh|\.+|,+)\.?$/i,
];

function hasRepetitiveLoop(text: string): boolean {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < 4) return false;

  const unique = new Set(words);
  // e.g. "new new new new" or "the the the the"
  if (unique.size <= 1) return true;
  // e.g. "thank you thank you thank you"
  if (words.length >= 6 && unique.size <= 2 && words.length / unique.size >= 3) return true;

  // Same word repeated 4+ times consecutively anywhere in the segment
  let run = 1;
  for (let i = 1; i < words.length; i++) {
    if (words[i] === words[i - 1]) {
      run += 1;
      if (run >= 4) return true;
    } else {
      run = 1;
    }
  }
  return false;
}

function sanitizeWhisperPrompt(raw: string): string {
  const trimmed = raw.trim().slice(-180);
  if (!trimmed || hasRepetitiveLoop(trimmed)) return "";
  const words = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  if (words.length < 4) return "";
  const unique = new Set(words);
  if (unique.size < 4 || unique.size / words.length < 0.45) return "";
  return trimmed;
}

interface WhisperSegmentMetrics {
  no_speech_prob?: number;
  compression_ratio?: number;
  avg_logprob?: number;
}

function isLikelyHallucination(text: string, metrics?: WhisperSegmentMetrics | number): boolean {
  const clean = text.trim();
  if (!clean) return true;
  if (clean.length <= 2) return true;
  if (hasRepetitiveLoop(clean)) return true;
  if (ALWAYS_HALLUCINATION_PATTERNS.some((p) => p.test(clean))) return true;

  const noSpeechProb = typeof metrics === "number" ? metrics : metrics?.no_speech_prob;
  const compressionRatio = typeof metrics === "number" ? undefined : metrics?.compression_ratio;
  const avgLogprob = typeof metrics === "number" ? undefined : metrics?.avg_logprob;

  if (typeof noSpeechProb === "number" && noSpeechProb > 0.72) return true;
  if (typeof compressionRatio === "number" && compressionRatio > 2.4) return true;
  if (typeof avgLogprob === "number" && avgLogprob < -1.15 && (noSpeechProb ?? 0) > 0.4) return true;

  if (SILENCE_HALLUCINATION_PATTERNS.some((p) => p.test(clean))) {
    if (typeof noSpeechProb !== "number" || noSpeechProb > 0.35) return true;
  }
  return false;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "Retry-After",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Expose-Headers": "Retry-After",
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not set in the environment variables.");
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (formErr: any) {
      console.error("Transcription error parsing form data:", formErr);
      return NextResponse.json(
        { error: `Failed to read audio stream: ${formErr?.message || "File too large or request aborted"}` },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const file = formData.get("file") as File;
    const rawOffset = formData.get("offsetSeconds");
    const offsetSeconds = Math.max(0, Number(rawOffset) || 0);
    const rawSpeaker = String(formData.get("speaker") || "").trim().toUpperCase();
    const speakerTag = rawSpeaker === "THEM" || rawSpeaker === "YOU" ? `[${rawSpeaker}] ` : "";
    const whisperPrompt = sanitizeWhisperPrompt(String(formData.get("prompt") || ""));
    const rawLanguage = String(formData.get("language") || "").trim().toLowerCase();
    const requestedLanguage = /^[a-z]{2,3}$/.test(rawLanguage) ? rawLanguage : "";

    if (!file || file.size === 0) {
      return NextResponse.json(
        { error: "No audio file provided or audio file is empty" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    let transcriptionText = "";
    let durationSeconds = 0;
    let formattedTranscript = "";
    let segments: any[] = [];
    let succeeded = false;
    let lastErrorMsg = "Transcription failed across all models";
    let lastStatus = 502;
    let retryAfterSeconds: number | null = null;

    const formatTimestamp = (secs: number) => {
      const total = Math.max(0, Math.floor(secs));
      const m = Math.floor(total / 60);
      const s = total % 60;
      return `${m}:${s.toString().padStart(2, "0")}`;
    };

    const modelsToTry = ["whisper-large-v3-turbo", "whisper-large-v3"];

    for (const model of modelsToTry) {
      try {
        const groqFormData = new FormData();
        groqFormData.append("file", file, file.name || "audio.webm");
        groqFormData.append("model", model);
        groqFormData.append("response_format", "verbose_json");
        // Only pass explicit language when caller requests one; otherwise allow Whisper auto-detection
        if (requestedLanguage) {
          groqFormData.append("language", requestedLanguage);
        }
        groqFormData.append("temperature", "0.0");
        if (whisperPrompt) {
          groqFormData.append("prompt", whisperPrompt);
        }

        const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${groqApiKey}`,
          },
          body: groqFormData,
          signal: AbortSignal.timeout(30000),
        });

        if (groqRes.ok) {
          const transcription: any = await groqRes.json();
          durationSeconds = typeof transcription.duration === "number" ? transcription.duration : 0;
          const rawSegments = Array.isArray(transcription.segments) ? transcription.segments : [];

          // Filter out silent / hallucinated / repetitive-loop segments and shift timestamps by offsetSeconds
          segments = rawSegments
            .filter((seg: any) => !isLikelyHallucination(seg.text || "", seg))
            .map((seg: any) => ({
              ...seg,
              start: (seg.start || 0) + offsetSeconds,
              end: (seg.end || 0) + offsetSeconds,
              text: (seg.text || "").trim(),
            }));

          if (segments.length > 0) {
            transcriptionText = segments.map((s: any) => s.text).join(" ").trim();
          } else {
            const rawText = (transcription.text || "").trim();
            transcriptionText = rawSegments.length > 0 || isLikelyHallucination(rawText) ? "" : rawText;
          }

          succeeded = true;
          break;
        } else {
          const errData: any = await groqRes.json().catch(() => ({}));
          lastErrorMsg = errData?.error?.message || `HTTP ${groqRes.status}`;
          lastStatus = groqRes.status;
          if (groqRes.status === 429) {
            const raRaw = groqRes.headers.get("retry-after");
            const parsedRa = raRaw ? Number(raRaw) : NaN;
            retryAfterSeconds = Number.isFinite(parsedRa) && parsedRa > 0
              ? Math.min(30, Math.max(5, Math.ceil(parsedRa)))
              : (retryAfterSeconds ?? 8);
          }
          after(() => logAIError("groq-whisper", model, lastErrorMsg, groqRes.status));
        }
      } catch (err: any) {
        lastErrorMsg = err?.message || "Transcription request failed";
        lastStatus = 502;
        after(() => logAIError("groq-whisper", model, lastErrorMsg, 500));
      }
    }

    if (!succeeded) {
      const responseStatus = lastStatus >= 400 && lastStatus < 600 ? lastStatus : 502;
      const errHeaders: Record<string, string> = { ...CORS_HEADERS };
      const errBody: Record<string, unknown> = { error: lastErrorMsg };
      if (responseStatus === 429) {
        const ra = retryAfterSeconds ?? 8;
        errHeaders["Retry-After"] = String(ra);
        errBody.retryAfterSeconds = ra;
      }
      return NextResponse.json(errBody, {
        status: responseStatus,
        headers: errHeaders,
      });
    }

    if (segments.length > 0) {
      // Group consecutive short segments within ~12s into readable blocks
      const blocks: string[] = [];
      let currentStart = segments[0].start;
      let currentTexts: string[] = [segments[0].text];

      for (let i = 1; i < segments.length; i++) {
        const seg = segments[i];
        if (seg.start - currentStart > 14 || currentTexts.join(" ").length > 260) {
          blocks.push(`[${formatTimestamp(currentStart)}] ${speakerTag}${currentTexts.join(" ")}`);
          currentStart = seg.start;
          currentTexts = [seg.text];
        } else {
          currentTexts.push(seg.text);
        }
      }
      if (currentTexts.length > 0) {
        blocks.push(`[${formatTimestamp(currentStart)}] ${speakerTag}${currentTexts.join(" ")}`);
      }
      formattedTranscript = blocks.join("\n\n");
    } else if (transcriptionText) {
      formattedTranscript = `[${formatTimestamp(offsetSeconds)}] ${speakerTag}${transcriptionText}`;
    } else {
      formattedTranscript = "";
    }

    return NextResponse.json(
      {
        text: transcriptionText,
        formattedTranscript,
        duration: Math.round(durationSeconds),
        offsetSeconds,
        segments,
      },
      {
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  } catch (error: any) {
    console.error("Transcription error:", error);
    const errorMessage = typeof error === "string" ? error : (error?.message || "Something went wrong transcribing audio");
    after(() => logAIError("groq-whisper", "transcribe-route", errorMessage, 500));
    return NextResponse.json(
      { error: errorMessage },
      {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  }
}

async function logAIError(provider: string, model: string, error: string, status?: number) {
  try {
    const { adminFirestore } = await import("@/firebase/admin");
    if (adminFirestore) {
      const admin = (await import("firebase-admin")).default;
      await adminFirestore.collection("error_logs").add({
        message: `[AI Transcription: ${provider.toUpperCase()}] Model '${model}' error: ${error}`,
        stack: `HTTP Status: ${status || 500}\nTimestamp: ${new Date().toISOString()}`,
        url: "/api/transcribe",
        userAgent: "Voiceflow Audio Transcriber",
        userId: "system",
        businessId: "system",
        type: "transcription_error",
        provider,
        model,
        status: status || 500,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  } catch (e) {
    console.warn("Failed to write transcription error to error_logs:", e);
  }
}
