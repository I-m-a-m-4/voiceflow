import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not set in the environment variables.");
    }
    
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
      timeout: 25000,
      maxRetries: 1,
    });

    const { text, type, customContext } = await req.json();

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

    if (customContext && typeof customContext === 'string' && customContext.trim()) {
      systemPrompt += `\n\nUser Profile & Custom Context:\n"${customContext.trim()}"\nTailor the summary and action items to specifically address the priorities, role, and industry mentioned above.`;
    }

    // Prioritize fast 20b model first for rapid turnaround
    const modelsToTry = ["openai/gpt-oss-20b", "qwen/qwen3.8-27b", "openai/gpt-oss-120b"];
    let completion = null;
    let lastError = null;

    for (const model of modelsToTry) {
      try {
        completion = await groq.chat.completions.create({
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
          model: model,
          temperature: 0.2,
          max_tokens: 2048,
        });
        if (completion) break;
      } catch (err: any) {
        console.warn(`Model ${model} failed, trying fallback:`, err.message);
        lastError = err;
      }
    }

    if (!completion) {
      throw lastError || new Error("All Groq summarization models failed");
    }

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
