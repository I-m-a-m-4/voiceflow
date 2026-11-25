import { NextRequest, NextResponse, after } from "next/server";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Common Whisper hallucinations emitted during low-volume silence or static
const WHISPER_HALLUCINATION_PATTERNS = [
  /^(thank you(\s+for\s+watching)?|thanks\s+for\s+watching|you|bye|goodbye|okay|so|um+|uh+|hmm+|\.+|,+|subtitle[s]?\s+by.*|transcribed\s+by.*|amara\.org.*)\.?$/i,
];

function isLikelyHallucination(text: string, noSpeechProb?: number): boolean {
  const clean = text.trim();
  if (!clean) return true;
  if (typeof noSpeechProb === "number" && noSpeechProb > 0.75) return true;
  if (clean.length <= 2) return true;
  if (typeof noSpeechProb === "number" && noSpeechProb > 0.45 && WHISPER_HALLUCINATION_PATTERNS.some((p) => p.test(clean))) {
    return true;
  }
  return false;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

    if (!file || file.size === 0) {
      return NextResponse.json(
        { error: "No audio file provided or audio file is empty" },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
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
        groqFormData.append("language", "en");
        groqFormData.append("temperature", "0.0");

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

          // Filter out silent / hallucinated segments and shift timestamps by offsetSeconds
          segments = rawSegments
            .filter((seg: any) => !isLikelyHallucination(seg.text || "", seg.no_speech_prob))
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
          after(() => logAIError("groq-whisper", model, lastErrorMsg, groqRes.status));
        }
      } catch (err: any) {
        lastErrorMsg = err?.message || "Transcription request failed";
        lastStatus = 502;
        after(() => logAIError("groq-whisper", model, lastErrorMsg, 500));
      }
    }

    if (!succeeded) {
      return NextResponse.json(
        { error: lastErrorMsg },
        {
          status: lastStatus >= 400 && lastStatus < 600 ? lastStatus : 502,
          headers: { "Access-Control-Allow-Origin": "*" },
        }
      );
    }

    if (segments.length > 0) {
      // Group consecutive short segments within ~12s into readable blocks
      const blocks: string[] = [];
      let currentStart = segments[0].start;
      let currentTexts: string[] = [segments[0].text];

      for (let i = 1; i < segments.length; i++) {
        const seg = segments[i];
        if (seg.start - currentStart > 14 || currentTexts.join(" ").length > 260) {
          blocks.push(`[${formatTimestamp(currentStart)}] ${currentTexts.join(" ")}`);
          currentStart = seg.start;
          currentTexts = [seg.text];
        } else {
          currentTexts.push(seg.text);
        }
      }
      if (currentTexts.length > 0) {
        blocks.push(`[${formatTimestamp(currentStart)}] ${currentTexts.join(" ")}`);
      }
      formattedTranscript = blocks.join("\n\n");
    } else if (transcriptionText) {
      formattedTranscript = `[${formatTimestamp(offsetSeconds)}] ${transcriptionText}`;
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
