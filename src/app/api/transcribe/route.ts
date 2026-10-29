import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300; // Allow up to 5 minutes for large files
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
        { status: 400 }
      );
    }

    const file = formData.get("file") as File;

    if (!file || file.size === 0) {
      return NextResponse.json(
        { error: "No audio file provided or audio file is empty" },
        { status: 400 }
      );
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    let transcriptionText = "";
    let durationSeconds = 0;
    let formattedTranscript = "";
    let segments: any[] = [];

    const formatTimestamp = (secs: number) => {
      const m = Math.floor(secs / 60);
      const s = Math.floor(secs % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
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
            "Authorization": `Bearer ${groqApiKey}`,
          },
          body: groqFormData,
          signal: AbortSignal.timeout(45000),
        });

        if (groqRes.ok) {
          const transcription: any = await groqRes.json();
          transcriptionText = transcription.text || "";
          durationSeconds = typeof transcription.duration === 'number' ? transcription.duration : 0;
          segments = Array.isArray(transcription.segments) ? transcription.segments : [];
          break;
        } else {
          const errData: any = await groqRes.json().catch(() => ({}));
          const errMsg = errData?.error?.message || `HTTP ${groqRes.status}`;
          logAIError("groq-whisper", model, errMsg, groqRes.status);
        }
      } catch (err: any) {
        logAIError("groq-whisper", model, err?.message || "Transcription request failed", 500);
      }
    }

    // Format segments into timestamped speaker turns
    if (segments.length > 0) {
      formattedTranscript = segments.map((seg: any) => {
        const time = formatTimestamp(seg.start || 0);
        const text = (seg.text || "").trim();
        return `Speaker ${time}\n${text}`;
      }).filter((block: string) => block.length > 0).join("\n\n");
    } else {
      formattedTranscript = transcriptionText;
    }

    return NextResponse.json(
      { 
        text: transcriptionText,
        formattedTranscript: formattedTranscript,
        duration: Math.round(durationSeconds),
        segments: segments
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error: any) {
    console.error("Transcription error:", error);
    const errorMessage = typeof error === "string" ? error : (error?.message || "Something went wrong transcribing audio");
    logAIError("groq-whisper", "transcribe-route", errorMessage, 500);
    return NextResponse.json(
      { error: errorMessage },
      { 
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}

async function logAIError(provider: string, model: string, error: string, status?: number) {
  try {
    const { adminFirestore } = await import('@/firebase/admin');
    if (adminFirestore) {
      const admin = (await import('firebase-admin')).default;
      await adminFirestore.collection('error_logs').add({
        message: `[AI Transcription: ${provider.toUpperCase()}] Model '${model}' error: ${error}`,
        stack: `HTTP Status: ${status || 500}\nTimestamp: ${new Date().toISOString()}`,
        url: '/api/transcribe',
        userAgent: 'Voiceflow Audio Transcriber',
        userId: 'system',
        businessId: 'system',
        type: 'transcription_error',
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
