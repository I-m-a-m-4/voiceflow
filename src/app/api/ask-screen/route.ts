import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, prompt, transcript } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    // 1. If GEMINI_API_KEY is available and imageBase64 is provided, try Gemini Vision
    if (process.env.GEMINI_API_KEY && imageBase64) {
      try {
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        const payload = {
          contents: [
            {
              parts: [
                { text: `${prompt}\n\nContext transcript: ${transcript || 'None'}` },
                {
                  inline_data: {
                    mime_type: "image/jpeg",
                    data: base64Data
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 800,
          }
        };

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          }
        );

        if (response.ok) {
          const data = await response.json();
          const answer = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (answer) {
            return NextResponse.json({ text: answer });
          }
        }
      } catch (geminiErr) {
        console.warn("Gemini vision call failed, falling back to Groq:", geminiErr);
      }
    }

    // 2. Fallback to Groq API (which is configured in environment)
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: "No API key configured for AI assistant." }, { status: 500 });
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const modelsToTry = ["llama3-70b-8192", "llama-3.1-8b-instant", "llama3-8b-8192", "mixtral-8x7b-32768"];

    let completion = null;
    let lastError = null;

    const fullPrompt = `You are a real-time live meeting assistant during an active call.
User Request / Question: "${prompt}"
Current Meeting Transcript Context: "${transcript || 'User is asking for live meeting assist.'}"

Provide a direct, concise, highly helpful answer or response that the user can immediately say or use in their call. Keep it professional and under 4 sentences.`;

    for (const model of modelsToTry) {
      try {
        completion = await groq.chat.completions.create({
          messages: [
            { role: "system", content: "You are a concise, ultra-smart live meeting assistant." },
            { role: "user", content: fullPrompt }
          ],
          model: model,
          temperature: 0.3,
          max_tokens: 500,
        });
        if (completion) break;
      } catch (err: any) {
        lastError = err;
      }
    }

    if (!completion) {
      throw lastError || new Error("Failed to generate AI response from Groq.");
    }

    const answer = completion.choices[0]?.message?.content || "No response generated.";
    return NextResponse.json({ text: answer });

  } catch (error: any) {
    console.error("Error in ask-screen route:", error);
    return NextResponse.json({ error: error.message || "Failed to process AI request" }, { status: 500 });
  }
}
