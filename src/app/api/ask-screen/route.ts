import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, prompt, transcript, customContext } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    // Keep only the most recent context so the live prompt stays focused
    const transcriptContext = (transcript || "").slice(-4000) || "None yet";
    const customContextSnippet = customContext && typeof customContext === 'string' && customContext.trim() 
      ? `\nUser Role & Custom Instructions:\n"${customContext.trim()}"\nTailor all answers and advice directly to this profile.`
      : "";

    // 1. If GEMINI_API_KEY is available and imageBase64 is provided, try Gemini Vision with a strict timeout
    if (process.env.GEMINI_API_KEY && imageBase64) {
      try {
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        const payload = {
          contents: [
            {
              parts: [
                { text: `${prompt}\n\nContext transcript: ${transcriptContext}${customContextSnippet}` },
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

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal,
          }
        );
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          const answer = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (answer) {
            return NextResponse.json({ text: answer });
          }
        }
      } catch (geminiErr: any) {
        console.warn("Gemini vision call failed or timed out, falling back to Groq:", geminiErr?.message || geminiErr);
      }
    }

    // 2. Fallback to Groq API (which is configured in environment)
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json({ error: "No API key configured for AI assistant." }, { status: 500 });
    }

    // Use a 15-second per-request timeout with 1 retry so fallback is fast and responsive
    const groq = new Groq({ 
      apiKey: process.env.GROQ_API_KEY,
      timeout: 15000,
      maxRetries: 1,
    });
    
    // Official high-speed Groq models for instant answers
    const modelsToTry = ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "mixtral-8x7b-32768"];

    let completion = null;
    let lastError: any = null;

    const fullPrompt = `You are a real-time live meeting and interview assistant during an active call.
User Request / Question: "${prompt}"
Current Meeting Transcript Context: "${transcriptContext}"${customContextSnippet}

The user may be in a job interview, technical interview, or business meeting. Ground your answer in the transcript context: address what was actually said, who said it, and what the user is being asked. Provide a direct, concise response the user can immediately say out loud — professional, confident, under 4 sentences. If the transcript context is empty or irrelevant, give the strongest generally-useful answer for the request.`;

    for (const model of modelsToTry) {
      try {
        completion = await groq.chat.completions.create({
          messages: [
            { role: "system", content: "You are a concise, ultra-smart live meeting and interview assistant." },
            { role: "user", content: fullPrompt }
          ],
          model: model,
          temperature: 0.3,
          max_tokens: 500,
        });
        if (completion) break;
      } catch (err: any) {
        console.warn(`Groq model ${model} failed:`, err?.message || err);
        lastError = err;
      }
    }

    if (!completion) {
      const errMsg = lastError?.message || (typeof lastError === 'object' ? JSON.stringify(lastError) : "Failed to generate AI response from Groq.");
      throw new Error(errMsg);
    }

    const answer = completion.choices[0]?.message?.content || "No response generated.";
    return NextResponse.json({ text: answer });

  } catch (error: any) {
    console.error("Error in ask-screen route:", error);
    const errorMessage = typeof error === 'string' ? error : (error?.message || (typeof error === 'object' ? JSON.stringify(error) : "Failed to process AI request"));
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
