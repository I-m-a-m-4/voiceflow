import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { buildEnhancedInterviewPrompt, synthesizeIntelligentFallback } from '@/lib/transcript-context';

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, prompt, transcript, customContext, history } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    // Keep the most recent transcript context to stay focused and latency-optimized
    const rawTranscript = (transcript || "").trim();
    const transcriptContext = rawTranscript.slice(-3500) || "None yet";
    const hasImage = Boolean(imageBase64 && typeof imageBase64 === 'string' && imageBase64.trim().length > 100);

    const { targetPrompt, extractedQuestion } = buildEnhancedInterviewPrompt(prompt, rawTranscript, hasImage);

    const customContextSnippet = customContext && typeof customContext === 'string' && customContext.trim() 
      ? `\n\n[Active User Profile & Role Context]\n${customContext.trim()}\n(Strictly ground all answers, perspective, and phrasing in this role profile.)`
      : "";

    const systemPrompt = `You are Voiceflow AI, an elite real-time live meeting assistant, speaking co-pilot, and executive teleprompter.
You assist the user discreetly, naturally, and intelligently across all types of live calls: client demos, sales pitches, executive syncs, team discussions, design reviews, and technical interviews.

Core Teleprompter Principles:
1. High-Impact Scannable Output:
   - State the core answer, suggestion, or direct response FIRST in bold.
   - Follow with 2 to 3 crisp, natural bullet points that the user can read aloud while maintaining eye contact.
   - Avoid robotic preambles, disclaimers, or meta-advice (never say "You should say...", "As an AI...", or "I am listening to your audio"). Deliver the exact words the user can speak aloud.

2. Context-Aware Visual & Screen Analysis:
   - When an image or screenshot is provided, dynamically adapt to what is actively being discussed or what the user asked about:
     * If the screen shows Code or an IDE / Technical Assessment (e.g. VS Code, LeetCode, CoderPad, terminal):
       - Identify the language and logic.
       - Provide the optimal, clean solution in a code block with Time/Space complexity and 2-3 spoken explanation points.
     * If the screen shows Slides / Presentation deck:
       - Summarize the key takeaway of the active slide and provide confident speaking points to present or comment on it.
     * If the screen shows Dashboards, Metrics, or Spreadsheets (e.g. Stripe, GA, Excel):
       - Highlight key metrics, trends, anomalies, and what they mean for the business discussion.
     * If the screen shows UI / Product Designs (e.g. Figma, Miro, product demo):
       - Focus on user flow, design critique, features, or architectural talking points.
     * If the screen shows Documents, Emails, or Proposals:
       - Extract key clauses, questions, or action items.

3. In-Call Interview & Discussion Answering:
   * When the user asks "What should I say?", "Suggest answer", "Recap", or when an interviewer asks a question in the transcript:
     - IDENTIFY THE EXACT QUESTION OR TOPIC ASKED BY THE INTERVIEWER / PARTICIPANTS IN THE TRANSCRIPT.
     - DELIVER THE DIRECT, FIRST-PERSON TECHNICAL ANSWER TO THAT QUESTION IMMEDIATELY.
     - Frame points in natural, first-person speech ("I built...", "Our approach was...", "We chose...") that sounds confident, articulate, and experienced.
     - If transcript context is initial or minimal, provide proactive executive talking points (e.g. alignment checks, scope verification, priority confirmation).

4. Natural Greetings & Chat:
   * If the user greets you or asks for general advice, respond warmly, concisely, and ask how to assist with the ongoing meeting.`;

    // Extract prior conversation history (last 6 turns, bounded to 800 chars per turn for strict Groq TPM & context protection)
    const cleanHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (Array.isArray(history)) {
      for (const item of history.slice(-6)) {
        if ((item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string' && item.content.trim()) {
          const trimmed = item.content.trim();
          const boundedContent = trimmed.length > 800 ? `${trimmed.slice(0, 800)}...` : trimmed;
          cleanHistory.push({ role: item.role, content: boundedContent });
        }
      }
    }

    const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;
    const openRouterBaseUrl = (process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
    const openRouterModel = process.env.OPENAI_MODEL;
    const groqKey = process.env.GROQ_API_KEY || process.env.NEXT_PUBLIC_GROQ_API_KEY;

    let visionSuccess = false;

    // 1. Free Vision Analysis via OpenRouter free tier (50 free requests/day)
    if (openRouterKey && imageBase64 && !visionSuccess) {
      try {
        const imageUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;

        const visionModels = [
          "openrouter/free",
          "dots-studio/dots-3-note-preview:free",
          "nvidia/nemotron-3.5-super-vl:free"
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
                text: `${targetPrompt}\n\nMeeting Context: ${transcriptContext}${customContextSnippet}`
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
          const timeoutId = setTimeout(() => modelController.abort(), 7000);
          try {
            const orRes = await fetch(`${openRouterBaseUrl}/chat/completions`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${openRouterKey}`,
                "HTTP-Referer": "https://voiceflow-azure.vercel.app",
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
              const rawMsg = orData.choices?.[0]?.message;
              const text = ((rawMsg?.content && rawMsg.content.trim()) || (rawMsg?.reasoning && rawMsg.reasoning.trim()) || "").trim();
              if (text && !text.includes("User Safety: safe")) {
                recordUsage('openrouter', model);
                visionSuccess = true;
                return NextResponse.json({ text, provider: 'openrouter', model });
              }
            } else {
              const errData: any = await orRes.json().catch(() => ({}));
              logAIError('openrouter-vision', model, errData?.message || `HTTP ${orRes.status}`, orRes.status);
            }
          } catch (mErr: any) {
            clearTimeout(timeoutId);
            logAIError('openrouter-vision', model, mErr?.message || 'Timeout / error', 500);
          }
        }
      } catch (orErr: any) {
        console.warn("OpenRouter vision call failed, falling back to text models:", orErr?.message || orErr);
        logAIError('openrouter-vision', 'all', orErr?.message || 'Vision failed', 500);
      }
    }

    // 3. Ultra-fast Groq text execution (handles questions, recaps, and text-based interview prompts)
    const sanitizedHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const h of cleanHistory) {
      if (sanitizedHistory.length === 0 || sanitizedHistory[sanitizedHistory.length - 1].role !== h.role) {
        sanitizedHistory.push(h);
      }
    }
    if (sanitizedHistory.length > 0 && sanitizedHistory[sanitizedHistory.length - 1].role === 'user') {
      sanitizedHistory.pop();
    }

    const textMessages: any[] = [
      { role: "system", content: systemPrompt },
      ...sanitizedHistory,
      {
        role: "user",
        content: `${hasImage ? "[Active Screen Context Attached: Focus on the screen, active code/slides, and interviewer question]\n\n" : ""}${targetPrompt}\n\nMeeting Context: ${transcriptContext}${customContextSnippet}`
      }
    ];

    if (groqKey) {
      try {
        const groq = new Groq({ 
          apiKey: groqKey,
          timeout: 12000,
          maxRetries: 1,
        });
        
        // Prioritize verified ultra-fast models on this Groq account
        const groqModels = [
          "qwen/qwen3.8-27b",
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
              return NextResponse.json({ text: textOutput, provider: 'groq', model });
            }
          } catch (err: any) {
            console.warn(`Groq model ${model} failed:`, err?.message || err);
            logAIError('groq', model, err?.message || 'Groq error', 500);
          }
        }
      } catch (groqErr: any) {
        console.warn("Groq initialization/execution failed:", groqErr);
        logAIError('groq', 'init', groqErr?.message || 'Groq init error', 500);
      }
    }

    // 4. Fallback to OpenRouter text models if Groq was unavailable
    if (openRouterKey) {
      const textModels = [
        "openrouter/free",
        "liquid/lfm-2.5-2.6b:free"
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
              "HTTP-Referer": "https://voiceflow-azure.vercel.app",
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
              return NextResponse.json({ text: answer, provider: 'openrouter', model });
            }
          } else {
            const errData: any = await orRes.json().catch(() => ({}));
            logAIError('openrouter-text', model, errData?.message || `HTTP ${orRes.status}`, orRes.status);
          }
        } catch (orTextErr: any) {
          clearTimeout(timeoutId);
          logAIError('openrouter-text', model, orTextErr?.message || 'Failed', 500);
        }
      }
    }

    // 5. Intelligent dynamic fallback (never returns static boilerplate)
    const smartFallback = synthesizeIntelligentFallback({
      prompt,
      transcript: rawTranscript,
      customContext,
      hasImage,
    });

    return NextResponse.json({ 
      text: smartFallback, 
      provider: 'local-fallback', 
      model: 'dynamic-synthesizer', 
      isFallback: true 
    });

  } catch (error: any) {
    console.error("Error in ask-screen route:", error);
    const errorMessage = typeof error === 'string' ? error : (error?.message || (typeof error === 'object' ? JSON.stringify(error) : "Failed to process AI request"));
    logAIError('server', 'outer-catch', errorMessage, 500);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

async function recordUsage(provider: 'groq' | 'openrouter', model: string) {
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

async function logAIError(provider: string, model: string, error: string, status?: number) {
  try {
    const { adminFirestore } = await import('@/firebase/admin');
    if (adminFirestore) {
      const admin = (await import('firebase-admin')).default;
      await adminFirestore.collection('error_logs').add({
        message: `[AI Provider: ${provider.toUpperCase()}] Model '${model}' failed: ${error}`,
        stack: `HTTP Status: ${status || 500}\nTimestamp: ${new Date().toISOString()}`,
        url: '/api/ask-screen',
        userAgent: 'Voiceflow Server Co-Pilot',
        userId: 'system',
        businessId: 'system',
        type: 'ai_error',
        provider,
        model,
        status: status || 500,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  } catch (e) {
    console.warn("Failed to write AI error to error_logs:", e);
  }
}
