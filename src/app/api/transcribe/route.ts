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
    try {
      const transcription = await groq.audio.transcriptions.create({
        file: file,
        model: "whisper-large-v3-turbo",
        prompt: "Meeting conversation transcription",
        response_format: "json",
        language: "en",
        temperature: 0.0,
      });
      transcriptionText = transcription.text;
    } catch (turboErr: any) {
      console.warn("whisper-large-v3-turbo failed, falling back to whisper-large-v3:", turboErr?.message || turboErr);
      const fallbackTranscription = await groq.audio.transcriptions.create({
        file: file,
        model: "whisper-large-v3",
        prompt: "Meeting conversation transcription",
        response_format: "json",
        language: "en",
        temperature: 0.0,
      });
      transcriptionText = fallbackTranscription.text;
    }

    return NextResponse.json(
      { text: transcriptionText },
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
