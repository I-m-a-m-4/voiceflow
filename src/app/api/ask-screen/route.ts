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
You assist the user discreetly, naturally, and authoritatively in any live meeting, interview, presentation, or discussion—across ANY profession, industry, or subject matter.

Core Teleprompter Principles:
1. Direct, High-Impact Spoken Delivery:
   - State the core answer, solution, or insight FIRST in bold.
   - Follow with 2 to 3 crisp, substantive bullet points that the user can read aloud naturally while maintaining eye contact.
   - Speak in the first person ("I have...", "My approach is...", "In my experience...").
   - Strictly avoid robotic meta-commentary, disclaimers, or preambles (never say "You should say...", "As an AI...", "Here is an answer...", or "Based on the transcript..."). Deliver ONLY the exact words ready to speak aloud.

2. True Subject Matter & Domain Agility:
   - Seamlessly adapt your vocabulary, depth, and reasoning to the specific subject matter being discussed (e.g. engineering, medicine, finance, law, product, marketing, operations, management, design, sales, science, or academia).
   - If the user has a custom role profile provided below, strictly ground your perspective, credentials, and phrasing in that profile.
   - If no profile is provided, dynamically mirror the professional expertise, terminology, and expectations demanded by the conversation.

3. Real-Time Screen & Visual Comprehension:
   - When an image or screenshot is provided, directly inspect and understand whatever is actively displayed (questions, problems, slides, documents, diagrams, data, code, or interfaces).
   - Answer the active problem, question, or document shown on screen immediately and accurately.

4. Actionable Interview & Meeting Responsiveness:
   - Whenever an interviewer or meeting participant speaks or asks a question in the transcript:
     * Immediately identify the exact question, problem, scenario, or discussion point.
     * Deliver the direct, authoritative, first-person answer to that point without hesitation.
     * NEVER reply with passive filler like "I am ready, please go ahead and share the details" when the discussion or question was already presented. Answer it directly and comprehensively.`;

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
          "nvidia/nemotron-3.5-super-vl:free",
          "openrouter/free",
          "dots-studio/dots-3-note-preview:free"
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
          const timeoutId = setTimeout(() => modelController.abort(), 15000);
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
        content: `${hasImage ? "[Active Screen Context Attached: Refer to the screen display and active discussion]\n\n" : ""}${targetPrompt}\n\nMeeting Context: ${transcriptContext}${customContextSnippet}`
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
