import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, prompt, transcript, customContext, history } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    // Keep only the most recent transcript context to stay focused and cheap
    const transcriptContext = (transcript || "").slice(-3000) || "None yet";
    const customContextSnippet = customContext && typeof customContext === 'string' && customContext.trim() 
      ? `\nUser Role & Custom Instructions:\n"${customContext.trim()}"\nTailor all answers directly to this profile.`
      : "";

    const systemPrompt = `You are Voiceflow AI, an intelligent, articulate, real-time live meeting assistant and conversational co-pilot.
You assist the user discreetly, naturally, and intelligently during live meetings, interviews, discussions, and presentations.

Rules:
- Natural Conversation: Speak naturally, warmly, and directly. If the user greets you (e.g. "hello", "hi"), greet them warmly and concisely, and ask how you can assist with their meeting or call.
- Meeting Co-Pilot Guidance:
  * When asked "What should I say next?", "Suggest follow-ups", or "Recap": use the live transcript context to provide crisp, articulate, high-value speaking points or questions relevant to what was just discussed.
  * If the live transcript context is empty or minimal, politely let the user know you are actively listening to the audio and ready to suggest points as soon as dialogue begins.
- Screen & Visual Questions:
  * If a screen image is provided or the user asks to analyze what is on screen: inspect the visible slide, code, or document and provide direct, practical answers or speaking points.
  * ONLY format as an exam/quiz solution (with correct option and explanation) if the screen or prompt is explicitly a multiple-choice quiz or test question. NEVER force normal conversations, greetings, or meetings into exam formats.
- High Impact & Brevity: Keep replies concise, easily scannable in real time with markdown bullet points or short paragraphs. Avoid robotic disclaimers, repetition, or unnecessary meta-commentary.`;

    // Extract prior conversation history (limited to last 6 turns for optimal token economy and low latency)
    const cleanHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (Array.isArray(history)) {
      for (const item of history.slice(-6)) {
        if ((item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string' && item.content.trim()) {
          cleanHistory.push({ role: item.role, content: item.content.trim() });
        }
      }
    }

    const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;
    const openRouterBaseUrl = (process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
    const openRouterModel = process.env.OPENAI_MODEL;
    const groqKey = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY;

    // 1. If GEMINI_API_KEY is available and imageBase64 is provided, try Gemini Vision with a strict timeout
    if (process.env.GEMINI_API_KEY && imageBase64) {
      try {
        const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        const payload = {
          contents: [
            {
              parts: [
                { text: `${systemPrompt}\n\n${prompt}\n\nContext transcript: ${transcriptContext}${customContextSnippet}` },
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
            temperature: 0.3,
            maxOutputTokens: 1024,
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
          if (answer && answer.trim()) {
            recordUsage('gemini', 'gemini-1.5-flash');
            return NextResponse.json({ text: answer });
          }
        }
      } catch (geminiErr: any) {
        console.warn("Gemini vision call failed or timed out, trying OpenRouter / Groq:", geminiErr?.message || geminiErr);
      }
    }

    // 2. If imageBase64 is provided, process via OpenRouter Vision with per-model timeouts
    if (openRouterKey && imageBase64) {
      try {
        const imageUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;

        const visionModels = [
          "meta-llama/llama-3.2-11b-vision-instruct:free",
          "google/gemma-4-26b-a4b-it:free",
          "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
          "openrouter/auto"
        ];
        if (openRouterModel && !visionModels.includes(openRouterModel) && openRouterModel !== "openrouter/free") {
          visionModels.unshift(openRouterModel);
        }

        const visionMessages: any[] = [
          { role: "system", content: systemPrompt },
          ...cleanHistory,
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${prompt}\n\nMeeting Context: ${transcriptContext}${customContextSnippet}`
              },
              {
                type: "image_url",
                image_url: { url: imageUrl }
              }
            ]
          }
        ];

        for (const model of visionModels) {
          const modelController = new AbortController();
          const timeoutId = setTimeout(() => modelController.abort(), 9000);
          try {
            const orRes = await fetch(`${openRouterBaseUrl}/chat/completions`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${openRouterKey}`,
                "HTTP-Referer": "https://voiceflow.space",
                "X-Title": "Voiceflow Co-Pilot",
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                model: model,
                messages: visionMessages,
                temperature: 0.3,
                max_tokens: 2048,
              }),
              signal: modelController.signal
            });
            clearTimeout(timeoutId);

            if (orRes.ok) {
              const orData = await orRes.json();
              const text = orData.choices?.[0]?.message?.content;
              if (text && text.trim() && !text.includes("User Safety: safe")) {
                recordUsage('openrouter', model);
                return NextResponse.json({ text });
              }
            }
          } catch (mErr) {
            clearTimeout(timeoutId);
            // try next model
          }
        }
      } catch (orErr: any) {
        console.warn("OpenRouter vision call failed, falling back to text models:", orErr?.message || orErr);
      }
    }

    // 3. Ultra-fast Groq text execution (primary for pure conversation, questions, and recaps)
    const textMessages: any[] = [
      { role: "system", content: systemPrompt },
      ...cleanHistory,
      {
        role: "user",
        content: `${prompt}\n\nMeeting Context: ${transcriptContext}${customContextSnippet}`
      }
    ];

    if (groqKey) {
      try {
        const groq = new Groq({ 
          apiKey: groqKey,
          timeout: 10000,
          maxRetries: 1,
        });
        
        const groqModels = [
          "openai/gpt-oss-120b",
          "qwen/qwen3.8-27b",
          "openai/gpt-oss-20b"
        ];

        for (const model of groqModels) {
          try {
            const candidate = await groq.chat.completions.create({
              messages: textMessages,
              model: model,
              temperature: 0.3,
              max_tokens: 2048,
            });

            const textOutput = candidate?.choices?.[0]?.message?.content || "";
            if (textOutput.trim()) {
              recordUsage('groq', model);
              return NextResponse.json({ text: textOutput });
            }
          } catch (err: any) {
            console.warn(`Groq model ${model} failed:`, err?.message || err);
          }
        }
      } catch (groqErr) {
        console.warn("Groq initialization/execution failed:", groqErr);
      }
    }

    // 4. Fallback to OpenRouter text models if Groq was unavailable
    if (openRouterKey) {
      const textModels = [
        "meta-llama/llama-3.3-70b-instruct:free",
        "google/gemma-4-26b-a4b-it:free",
        "qwen/qwen-2.5-72b-instruct:free",
        "openrouter/auto"
      ];
      if (openRouterModel && !textModels.includes(openRouterModel) && openRouterModel !== "openrouter/free") {
        textModels.unshift(openRouterModel);
      }

      for (const model of textModels) {
        const textController = new AbortController();
        const timeoutId = setTimeout(() => textController.abort(), 8000);
        try {
          const orRes = await fetch(`${openRouterBaseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${openRouterKey}`,
              "HTTP-Referer": "https://voiceflow.space",
              "X-Title": "Voiceflow Co-Pilot",
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: model,
              messages: textMessages,
              temperature: 0.3,
              max_tokens: 2048,
            }),
            signal: textController.signal
          });
          clearTimeout(timeoutId);

          if (orRes.ok) {
            const orData = await orRes.json();
            const answer = orData.choices?.[0]?.message?.content;
            if (answer && answer.trim() && !answer.includes("User Safety: safe")) {
              recordUsage('openrouter', model);
              return NextResponse.json({ text: answer });
            }
          }
        } catch (orTextErr: any) {
          clearTimeout(timeoutId);
          console.warn(`OpenRouter text call ${model} failed, checking next:`, orTextErr?.message || orTextErr);
        }
      }
    }

    return NextResponse.json(
      { error: "No response generated from remote providers." },
      { status: 502 }
    );

  } catch (error: any) {
    console.error("Error in ask-screen route:", error);
    const errorMessage = typeof error === 'string' ? error : (error?.message || (typeof error === 'object' ? JSON.stringify(error) : "Failed to process AI request"));
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

async function recordUsage(provider: 'groq' | 'openrouter' | 'gemini', model: string) {
  try {
    const { adminFirestore } = await import('@/firebase/admin');
    if (adminFirestore) {
      const admin = (await import('firebase-admin')).default;
      const today = new Date().toISOString().split('T')[0];
      const month = today.slice(0, 7);
      const docRef = adminFirestore.collection('platform_stats').doc('ai_provider_quotas');
      await docRef.set({
        [provider]: {
          totalRequests: admin.firestore.FieldValue.increment(1),
          [`monthlyRequests_${month}`]: admin.firestore.FieldValue.increment(1),
          [`dailyRequests_${today}`]: admin.firestore.FieldValue.increment(1),
          lastUsed: admin.firestore.FieldValue.serverTimestamp(),
          lastModel: model,
        },
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  } catch (err) {
    // silently ignore metrics failure so response is never delayed
  }
}
