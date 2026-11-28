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
  /^(thank\s+you(\s+(very|so)\s+much)?|thanks|you|bye|goodbye|see\s+you(\s+(next\s+time|later|soon))?|okay|ok|so|um+|uh+|hmm+|oh|ah|huh|gracias|merci|danke|\.+|,+)\.?$/i,
];

// In-memory circuit-breaker per transcription model/provider so exhausted free-tier RPD
// models (e.g., Groq whisper-large-v3-turbo 2000/2000 RPD) are skipped immediately instead
// of burning 500-800ms on every 8s audio chunk.
const modelCooldownUntil = new Map<string, number>();
const lastErrorLogAt = new Map<string, number>();

function stripWhisperSpecialTokens(text: string): string {
  return (text || "")
    .replace(/<\|[^|]{1,32}\|>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

  // Same single word repeated 4+ times consecutively anywhere in the segment
  let run = 1;
  for (let i = 1; i < words.length; i++) {
    if (words[i] === words[i - 1]) {
      run += 1;
      if (run >= 4) return true;
    } else {
      run = 1;
    }
  }

  // Repeated 2-word or 3-word phrase 3+ times consecutively
  // Catches real production loops like "come la parola come la parola come la parola" or "what is that what is that what is that"
  for (const n of [2, 3, 4]) {
    if (words.length < n * 3) continue;
    let phraseRun = 1;
    for (let i = n; i <= words.length - n; i += n) {
      const prev = words.slice(i - n, i).join(" ");
      const curr = words.slice(i, i + n).join(" ");
      if (prev === curr) {
        phraseRun += 1;
        if (phraseRun >= 3) return true;
      } else {
        phraseRun = 1;
      }
    }
  }

  // Detect Whisper garble bursts like "THO T ROOOOLNNNNNNNNNNNNNNN AAJKJUJD"
  if (/(.)\1{6,}/.test(text)) return true;
  const longGibberishTokens = text
    .split(/\s+/)
    .filter((tok) => tok.length >= 8 && /^[A-Z]{8,}$/.test(tok) && !/[AEIOU]/.test(tok));
  if (longGibberishTokens.length >= 2) return true;

  return false;
}

function sanitizeWhisperPrompt(raw: string): string {
  const trimmed = stripWhisperSpecialTokens(raw).slice(-180);
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
  const clean = stripWhisperSpecialTokens(text);
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

function parseRetrySecondsFromError(headerVal: string | null, errMsg: string): number {
  const fromHeader = headerVal ? Number(headerVal) : NaN;
  if (Number.isFinite(fromHeader) && fromHeader > 0) {
    return Math.ceil(fromHeader);
  }
  // Parse Groq messages like "Please try again in 43.2s" or "try again in 2m15s"
  const minSec = errMsg.match(/try\s+again\s+in\s+(\d+)m(?:(\d+(?:\.\d+)?)s)?/i);
  if (minSec) {
    return Number(minSec[1]) * 60 + Math.ceil(Number(minSec[2] || 0));
  }
  const secOnly = errMsg.match(/try\s+again\s+in\s+(\d+(?:\.\d+)?)s/i);
  if (secOnly) {
    return Math.ceil(Number(secOnly[1]));
  }
  return 15;
}

function setModelCooldown(key: string, errMsg: string, retryAfterHeader: string | null): number {
  const parsedSecs = parseRetrySecondsFromError(retryAfterHeader, errMsg);
  const isDailyOrHourlyExhausted = /requests\s+per\s+day|\(RPD\)|per\s+hour|\(ASH\)|per\s+day|\(ASD\)/i.test(errMsg);
  // If daily RPD is exhausted (e.g. 2000/2000), skip this model for 2–5 minutes so we go straight to healthy fallbacks
  const cooldownSecs = isDailyOrHourlyExhausted
    ? Math.min(300, Math.max(parsedSecs, 120))
    : Math.min(90, Math.max(parsedSecs, 10));
  modelCooldownUntil.set(key, Date.now() + cooldownSecs * 1000);
  return cooldownSecs;
}

function isModelInCooldown(key: string): boolean {
  const until = modelCooldownUntil.get(key) || 0;
  if (until <= Date.now()) {
    if (until > 0) modelCooldownUntil.delete(key);
    return false;
  }
  return true;
}

function shouldLogModelError(key: string, status: number): boolean {
  if (status !== 429) return true;
  const now = Date.now();
  const last = lastErrorLogAt.get(key) || 0;
  if (now - last < 60_000) return false;
  lastErrorLogAt.set(key, now);
  return true;
}

async function transcribeWithGemini(
  file: File,
  language: string,
  whisperPrompt: string
): Promise<{ text: string; model: string } | null> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return null;

  const geminiModels = ["gemini-2.5-flash", "gemini-2.0-flash"];
  const rawBytes = Buffer.from(await file.arrayBuffer());
  if (rawBytes.length === 0) return null;

  const base64Audio = rawBytes.toString("base64");
  let mimeType = (file.type || "").split(";")[0].trim().toLowerCase();
  if (!mimeType || mimeType === "application/octet-stream") {
    const name = (file.name || "").toLowerCase();
    mimeType = name.endsWith(".wav")
      ? "audio/wav"
      : name.endsWith(".mp4") || name.endsWith(".m4a")
        ? "audio/mp4"
        : name.endsWith(".mp3")
          ? "audio/mp3"
          : "audio/webm";
  }

  const langHint = language ? `Primary spoken language is ISO code "${language}". ` : "";
  const contextHint = whisperPrompt ? `Recent conversation context for spelling only (DO NOT repeat this): "${whisperPrompt.slice(-120)}". ` : "";
  const instruction =
    `${langHint}${contextHint}Transcribe ONLY clearly spoken human speech from this audio clip verbatim with proper punctuation. ` +
    `If the audio is silent, room noise, static, breathing, or unintelligible, return strictly an empty response. ` +
    `Do NOT add timestamps, speaker labels, explanations, or commentary.`;

  for (const model of geminiModels) {
    const cooldownKey = `gemini:${model}`;
    if (isModelInCooldown(cooldownKey)) continue;

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  { text: instruction },
                  { inline_data: { mime_type: mimeType, data: base64Audio } },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.0,
              maxOutputTokens: 400,
            },
          }),
          signal: AbortSignal.timeout(18000),
        }
      );

      if (res.ok) {
        const data: any = await res.json();
        const parts = data?.candidates?.[0]?.content?.parts;
        const rawOut = Array.isArray(parts)
          ? parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join(" ")
          : "";
        const cleaned = stripWhisperSpecialTokens(rawOut)
          .replace(/^["']|["']$/g, "")
          .replace(/^\[(?:silence|no speech|inaudible|music|blank_audio)\]$/i, "")
          .trim();

        if (!cleaned || isLikelyHallucination(cleaned)) {
          return { text: "", model };
        }
        return { text: cleaned, model };
      } else {
        const errData: any = await res.json().catch(() => ({}));
        const msg = errData?.error?.message || `HTTP ${res.status}`;
        if (res.status === 429) {
          setModelCooldown(cooldownKey, msg, res.headers.get("retry-after"));
        } else if (res.status === 402 || res.status === 403 || res.status === 401) {
          // Billing depleted or key invalid — cool down for 15 minutes so we don't waste 1.5s per request
          modelCooldownUntil.set(cooldownKey, Date.now() + 900_000);
        }
        if (shouldLogModelError(cooldownKey, res.status)) {
          after(() => logAIError("gemini-audio", model, msg, res.status));
        }
      }
    } catch (err: any) {
      const msg = err?.message || "Gemini audio fallback failed";
      after(() => logAIError("gemini-audio", model, msg, 500));
    }
  }

  return null;
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
    if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) {
      throw new Error("Neither GROQ_API_KEY nor GEMINI_API_KEY is set in environment variables.");
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (formErr: any) {
      console.error("Transcription error parsing form data:", formErr);
      return NextResponse.json(
        { error: `Failed to read audio stream: ${formErr?.message || "File too large or request aborted"}` },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const file = formData.get("file") as File;
    const rawOffset = formData.get("offsetSeconds");
    const offsetSeconds = Math.max(0, Number(rawOffset) || 0);
    const rawSpeaker = String(formData.get("speaker") || "").trim().toUpperCase();
    const speakerTag = rawSpeaker === "THEM" || rawSpeaker === "YOU" ? `[${rawSpeaker}] ` : "";
    const whisperPrompt = sanitizeWhisperPrompt(String(formData.get("prompt") || ""));

    // Default to English ("en") unless caller explicitly selects "auto" or another ISO language code.
    // Prevents silent/noisy mic chunks from hallucinating random Spanish/Russian/Italian phrases!
    const rawLanguage = String(formData.get("language") || "").trim().toLowerCase();
    const requestedLanguage =
      rawLanguage === "auto"
        ? ""
        : /^[a-z]{2,3}$/.test(rawLanguage)
          ? rawLanguage
          : "en";

    if (!file || file.size === 0) {
      return NextResponse.json(
        { error: "No audio file provided or audio file is empty" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Support optional multi-key pool (`GROQ_API_KEYS=key1,key2` or `GROQ_API_KEY_2`) for instant RPD scaling
    const groqApiKeys = Array.from(
      new Set(
        [
          ...(process.env.GROQ_API_KEYS || "").split(","),
          process.env.GROQ_API_KEY || "",
          process.env.GROQ_API_KEY_2 || "",
        ]
          .map((k) => k.trim())
          .filter(Boolean)
      )
    );
    let transcriptionText = "";
    let durationSeconds = 0;
    let formattedTranscript = "";
    let segments: any[] = [];
    let succeeded = false;
    let providerUsed = "groq";
    let modelUsed = "";
    let lastErrorMsg = "Transcription failed across all models";
    let lastStatus = 502;
    let retryAfterSeconds: number | null = null;

    const formatTimestamp = (secs: number) => {
      const total = Math.max(0, Math.floor(secs));
      const m = Math.floor(total / 60);
      const s = total % 60;
      return `${m}:${s.toString().padStart(2, "0")}`;
    };

    // 1. Primary path: Groq Whisper (fast, accurate) with per-(key, model) 429 circuit-breaker
    if (groqApiKeys.length > 0) {
      const groqModels = ["whisper-large-v3-turbo", "whisper-large-v3"];

      outerGroq: for (let keyIdx = 0; keyIdx < groqApiKeys.length; keyIdx++) {
        const groqApiKey = groqApiKeys[keyIdx];
        for (const model of groqModels) {
          const cooldownKey = `groq:k${keyIdx}:${model}`;
          if (isModelInCooldown(cooldownKey)) {
            lastStatus = 429;
            lastErrorMsg = `Model ${model} is in rate-limit cooldown`;
            continue;
          }

          try {
            const groqFormData = new FormData();
            groqFormData.append("file", file, file.name || "audio.webm");
            groqFormData.append("model", model);
            groqFormData.append("response_format", "verbose_json");
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
              signal: AbortSignal.timeout(15000),
            });

            if (groqRes.ok) {
              const transcription: any = await groqRes.json();
              durationSeconds = typeof transcription.duration === "number" ? transcription.duration : 0;
              const rawSegments = Array.isArray(transcription.segments) ? transcription.segments : [];

              // Strip Whisper special tokens (<|en|>, etc.) and filter silent / hallucinated / repetitive segments
              segments = rawSegments
                .map((seg: any) => ({
                  ...seg,
                  start: (seg.start || 0) + offsetSeconds,
                  end: (seg.end || 0) + offsetSeconds,
                  text: stripWhisperSpecialTokens(seg.text || ""),
                }))
                .filter((seg: any) => !isLikelyHallucination(seg.text, seg));

              if (segments.length > 0) {
                transcriptionText = segments.map((s: any) => s.text).join(" ").trim();
              } else {
                const rawText = stripWhisperSpecialTokens(transcription.text || "");
                transcriptionText = rawSegments.length > 0 || isLikelyHallucination(rawText) ? "" : rawText;
              }

              succeeded = true;
              providerUsed = "groq";
              modelUsed = model;
              break outerGroq;
            } else {
              const errData: any = await groqRes.json().catch(() => ({}));
              lastErrorMsg = errData?.error?.message || `HTTP ${groqRes.status}`;
              lastStatus = groqRes.status;
              if (groqRes.status === 429) {
                const cd = setModelCooldown(cooldownKey, lastErrorMsg, groqRes.headers.get("retry-after"));
                retryAfterSeconds = Math.min(30, Math.max(5, cd));
              }
              if (shouldLogModelError(cooldownKey, groqRes.status)) {
                after(() => logAIError("groq-whisper", model, lastErrorMsg, groqRes.status));
              }
            }
          } catch (err: any) {
            lastErrorMsg = err?.message || "Transcription request failed";
            lastStatus = 502;
            after(() => logAIError("groq-whisper", model, lastErrorMsg, 500));
          }
        }
      }
    }

    // 2. Failover path: Google Gemini Flash native audio transcription (saves calls when Groq RPD is exhausted!)
    if (!succeeded && process.env.GEMINI_API_KEY) {
      const geminiRes = await transcribeWithGemini(file, requestedLanguage, whisperPrompt);
      if (geminiRes !== null) {
        transcriptionText = geminiRes.text;
        succeeded = true;
        providerUsed = "gemini";
        modelUsed = geminiRes.model;
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
      // Group consecutive short segments within ~14s into readable blocks
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
        provider: providerUsed,
        model: modelUsed,
      },
      {
        headers: CORS_HEADERS,
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
        headers: CORS_HEADERS,
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
