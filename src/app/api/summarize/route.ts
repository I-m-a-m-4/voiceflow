import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not set in the environment variables.");
    }
    
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    const { text, type } = await req.json();

    if (!text) {
      return NextResponse.json(
        { error: "No text provided" },
        { status: 400 }
      );
    }

    let systemPrompt = "You are a helpful assistant.";
    if (type === "dictation") {
      systemPrompt = "You are an AI that cleans up dictation transcripts. Remove filler words (ums, ahs), fix stuttering, and ensure proper punctuation and formatting. Output ONLY the cleaned text, without any conversational preamble or markdown code blocks.";
    } else if (type === "meeting") {
      systemPrompt = "You are an AI assistant specialized in structuring meeting transcripts. Your task is to extract:\n1. Executive Summary (3-5 bullets)\n2. Action Items (with owners if specified)\n3. Key Decisions.\nFormat the output in clean Markdown.";
    }

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: text,
        },
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.2,
      max_tokens: 2048,
    });

    const outputText = completion.choices[0]?.message?.content || "";

    return NextResponse.json({ text: outputText.trim() });
  } catch (error: any) {
    console.error("Summarize error:", error);
    return NextResponse.json(
      { error: error.message || "Something went wrong" },
      { status: 500 }
    );
  }
}
