import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

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

    // Allocate 120s timeout for audio uploads and processing with 1 retry
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
      timeout: 120000,
      maxRetries: 1,
    });

    let transcriptionText = "";
    let durationSeconds = 0;
    let formattedTranscript = "";
    let segments: any[] = [];

    const formatTimestamp = (secs: number) => {
      const m = Math.floor(secs / 60);
      const s = Math.floor(secs % 60);
      return `${m}:${s.toString().padStart(2, '0')}`;
    };

    try {
      const transcription: any = await groq.audio.transcriptions.create({
        file: file,
        model: "whisper-large-v3-turbo",
        prompt: "Meeting and interview conversation transcription",
        response_format: "verbose_json",
        language: "en",
        temperature: 0.0,
      });
      transcriptionText = transcription.text || "";
      durationSeconds = typeof transcription.duration === 'number' ? transcription.duration : 0;
      segments = Array.isArray(transcription.segments) ? transcription.segments : [];
    } catch (turboErr: any) {
      console.warn("whisper-large-v3-turbo verbose_json failed, falling back to whisper-large-v3:", turboErr?.message || turboErr);
      try {
        const fallbackTranscription: any = await groq.audio.transcriptions.create({
          file: file,
          model: "whisper-large-v3",
          prompt: "Meeting and interview conversation transcription",
          response_format: "verbose_json",
          language: "en",
          temperature: 0.0,
        });
        transcriptionText = fallbackTranscription.text || "";
        durationSeconds = typeof fallbackTranscription.duration === 'number' ? fallbackTranscription.duration : 0;
        segments = Array.isArray(fallbackTranscription.segments) ? fallbackTranscription.segments : [];
      } catch (fallbackErr: any) {
        console.warn("verbose_json failed, retrying with standard json:", fallbackErr?.message || fallbackErr);
        const basicTranscription: any = await groq.audio.transcriptions.create({
          file: file,
          model: "whisper-large-v3-turbo",
          response_format: "json",
          language: "en",
          temperature: 0.0,
        });
        transcriptionText = basicTranscription.text || "";
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
