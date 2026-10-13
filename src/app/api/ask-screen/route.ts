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

    const systemPrompt = `You are an elite, ultra-fast meeting, exam, and interview co-pilot.
When answering questions or analyzing screens (e.g. quiz/exam questions, technical problems, slides, code, or live discussions):
- Direct & Decisive: Give the direct, correct answer immediately at the very beginning. For multiple-choice questions, clearly specify the correct option (e.g., "**Correct Answer:** B) Inca").
- Reasoning: Provide concise, clear explanation explaining why this answer is correct.
- Why other options are incorrect: If choices or alternatives exist, briefly explain why each other option is wrong.
- Summary: Provide a 1-sentence quick recap.
Format cleanly with Markdown headers and bullet points. Be clear, concise, and articulate.`;

    // Extract prior conversation history (limited to last 6 turns for optimal token economy and low latency)
    const cleanHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (Array.isArray(history)) {
      for (const item of history.slice(-6)) {
        if ((item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string' && item.content.trim()) {
          cleanHistory.push({ role: item.role, content: item.content.trim() });
        }
      }
    }

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

    const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;
    const openRouterBaseUrl = (process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
    const openRouterModel = process.env.OPENAI_MODEL;

    // 2. If OpenRouter is available and imageBase64 is provided, process via OpenRouter Vision
    if (openRouterKey && imageBase64) {
      try {
        const imageUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        // DO NOT include openrouter/free in visionModels as it routes to safety classifiers!
        const visionModels = [
          "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
          "dots-studio/dots-3-note-preview:free",
          "google/gemma-4-26b-a4b-it:free",
          "meta-llama/llama-3.2-11b-vision-instruct:free",
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
              signal: controller.signal
            });

            if (orRes.ok) {
              const orData = await orRes.json();
              const text = orData.choices?.[0]?.message?.content;
              if (text && text.trim()) {
                clearTimeout(timeoutId);
                recordUsage('openrouter', model);
                return NextResponse.json({ text });
              }
            }
          } catch (mErr) {
            // try next model
          }
        }
        clearTimeout(timeoutId);
      } catch (orErr: any) {
        console.warn("OpenRouter vision call failed, falling back to text models:", orErr?.message || orErr);
      }
    }

    // 3. Fallback to OpenRouter text or Groq API (includes history context for follow-ups)
    const textMessages: any[] = [
      { role: "system", content: systemPrompt },
      ...cleanHistory,
      {
        role: "user",
        content: `${prompt}\n\nMeeting Context: ${transcriptContext}${customContextSnippet}`
      }
    ];

    // Try OpenRouter text
    if (openRouterKey) {
      const textModels = [
        "meta-llama/llama-3.3-70b-instruct:free",
        "google/gemma-4-26b-a4b-it:free",
        "qwen/qwen-2.5-72b-instruct:free",
        "openrouter/free",
        "openrouter/auto"
      ];
      if (openRouterModel && !textModels.includes(openRouterModel)) {
        textModels.unshift(openRouterModel);
      }

      for (const model of textModels) {
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
            })
          });

          if (orRes.ok) {
            const orData = await orRes.json();
            const answer = orData.choices?.[0]?.message?.content;
            if (answer && answer.trim()) {
              recordUsage('openrouter', model);
              return NextResponse.json({ text: answer });
            }
          }
        } catch (orTextErr: any) {
          console.warn(`OpenRouter text call ${model} failed, checking next:`, orTextErr?.message || orTextErr);
        }
      }
    }

    // 4. Try Groq API
    const groqKey = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY;
    if (groqKey) {
      const groq = new Groq({ 
        apiKey: groqKey,
        timeout: 15000,
        maxRetries: 1,
      });
      
      const groqModels = [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "qwen/qwen3.8-27b",
        "openai/gpt-oss-120b"
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
