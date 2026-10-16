import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, prompt, transcript, customContext, history } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    // Keep the most recent transcript context to stay focused and latency-optimized
    const rawTranscript = (transcript || "").trim();
    const transcriptContext = rawTranscript.slice(-3500) || "None yet";

    const customContextSnippet = customContext && typeof customContext === 'string' && customContext.trim() 
      ? `\n\n[Active User Profile & Role Context]\n${customContext.trim()}\n(Strictly ground all answers, perspective, and phrasing in this role profile.)`
      : "";

    const systemPrompt = `You are Voiceflow AI, an elite real-time live meeting assistant, speaking co-pilot, and executive teleprompter.
You assist the user discreetly, naturally, and intelligently during live calls, client demos, technical interviews, and executive syncs.

Core Teleprompter Principles:
1. High-Impact Scannable Output:
   - State the core answer, suggestion, or direct response FIRST in bold.
   - Follow with 2 to 3 crisp, natural bullet points that the user can read aloud while maintaining eye contact.
   - Avoid robotic preambles, disclaimers, or excessive meta-commentary.
2. In-Call Guidance:
   * When asked "What should I say next?", "Suggest follow-ups", "Recap", or for smart meeting talking points:
     - Ground responses directly in what was said in the meeting transcript.
     - Frame points in natural, first-person speech that sounds confident, articulate, and conversational.
     - If transcript context is initial or minimal, provide proactive executive talking points (e.g. alignment checks, scope verification, priority confirmation).
3. Code & Technical Screen Questions:
   * Deliver the clean, optimized code solution immediately.
   * Highlight Time & Space complexity and key implementation steps.
4. Natural Greetings & Chat:
   * If the user greets you or asks for general advice, respond warmly, concisely, and ask how to assist with the ongoing meeting.`;

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
          "llama-3.3-70b-versatile",
          "llama-3.1-8b-instant",
          "openai/gpt-oss-120b",
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
        "google/gemma-2-9b-it:free",
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

    // 5. Intelligent conversational fallback if remote models all timed out or rate-limited
    const lowerPrompt = prompt.toLowerCase();
    let smartFallback = "";
    if (lowerPrompt.includes('hello') || lowerPrompt.includes('hi') || lowerPrompt.startsWith('hey')) {
      smartFallback = "Hello! I'm your Voiceflow live meeting assistant. I'm actively listening to your audio and tracking your screen. How can I help you in this session?";
    } else if (lowerPrompt.includes('what should i say') || lowerPrompt.includes('suggest speaking')) {
      smartFallback = transcriptContext && transcriptContext !== "None yet"
        ? `**Suggested Speaking Points:**\n• "Building on the points raised so far, let's make sure we align on the concrete next steps."\n• "Could we clarify our timeline and the key milestones for this?"`
        : `**Suggested Meeting Starters:**\n• "Thanks everyone for joining. Should we quickly align on the main goals for today's call?"\n• "Before we jump into the details, are there any priority items or blockers we should cover first?"`;
    } else if (lowerPrompt.includes('recap') || lowerPrompt.includes('summarize')) {
      smartFallback = transcriptContext && transcriptContext !== "None yet"
        ? `**Quick Recap of Recent Discussion:**\n• ${transcriptContext.slice(-300).replace(/\\n/g, ' ').trim()}`
        : "I'm listening to your live meeting audio. As soon as participants begin speaking, I'll generate live bulleted recaps for you.";
    } else {
      smartFallback = "I'm listening and tracking your live meeting. Ask any question or click 'Analyze This' for instant guidance on your active screen.";
    }

    return NextResponse.json({ text: smartFallback });

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
