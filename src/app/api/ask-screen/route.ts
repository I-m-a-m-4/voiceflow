import { NextRequest, NextResponse, after } from "next/server";
import {
  buildEnhancedInterviewPrompt,
  sanitizeConversationHistory,
} from "@/lib/transcript-context";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

interface ProviderAttemptResult {
  streamRes?: Response;
  text?: string;
  provider: "groq" | "openrouter";
  model: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      imageBase64,
      prompt,
      transcript,
      customContext,
      history,
      stream: wantStream = false,
      lastTranscriptLength,
      lastTranscriptTail,
      forceFreshAngle,
    } = body;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400, headers: CORS_HEADERS });
    }

    const rawTranscript = (typeof transcript === "string" ? transcript : "").trim();
    const hasImage = Boolean(imageBase64 && typeof imageBase64 === "string" && imageBase64.trim().length > 100);
    const cleanCustomContext = typeof customContext === "string" ? customContext.trim() : "";

    // Sanitize & bound prior conversation history (last 10 turns / 5 full exchanges, capped at 1400 chars each)
    const cleanHistory = sanitizeConversationHistory(history, 10, 1400);

    const prevTranscriptLen =
      typeof lastTranscriptLength === "number" && Number.isFinite(lastTranscriptLength)
        ? lastTranscriptLength
        : undefined;
    const prevTranscriptTail = typeof lastTranscriptTail === "string" ? lastTranscriptTail : undefined;

    const promptCtx = buildEnhancedInterviewPrompt(prompt, rawTranscript, {
      history: cleanHistory,
      hasImage,
      previousTranscriptLength: prevTranscriptLen,
      previousTranscriptTail: prevTranscriptTail,
      customContext: cleanCustomContext,
      forceFreshAngle: Boolean(forceFreshAngle),
    });

    const responseMeta = {
      intent: promptCtx.intent,
      responseMode: promptCtx.responseMode,
      isRepeatAsk: promptCtx.isRepeatAsk,
      hasTranscriptDelta: promptCtx.hasTranscriptDelta,
      turnNumber: promptCtx.turnNumber,
    };

    const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
    const openRouterBaseUrl = (process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
    const openRouterModel = process.env.OPENAI_MODEL;
    const groqKey = process.env.GROQ_API_KEY;

    // ------------------------------------------------------------------
    // PATH 1: VISION (when screenshot is attached)
    // ------------------------------------------------------------------
    if (hasImage) {
      if (!openRouterKey) {
        return NextResponse.json(
          { error: "Vision provider API key is not configured on the server.", code: "VISION_CONFIG_MISSING", retryable: false },
          { status: 503, headers: CORS_HEADERS }
        );
      }

      const imageUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;
      const visionModels = ["nvidia/nemotron-3.5-super-vl:free", "openrouter/free", "dots-studio/dots-3-note-preview:free"];
      if (openRouterModel && !visionModels.includes(openRouterModel) && openRouterModel !== "openrouter/free") {
        visionModels.unshift(openRouterModel);
      }

      const visionMessages: any[] = [
        { role: "system", content: promptCtx.systemPrompt },
        ...cleanHistory,
        {
          role: "user",
          content: [
            {
              type: "text",
              text: promptCtx.userMessageContent,
            },
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
          ],
        },
      ];

      let lastVisionError = "Vision models timed out or were busy.";

      for (const model of visionModels) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 14000);
        try {
          const orRes = await fetch(`${openRouterBaseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openRouterKey}`,
              "HTTP-Referer": "https://voiceflow-azure.vercel.app",
              "X-Title": "Voiceflow Co-Pilot",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: visionMessages,
              temperature: promptCtx.recommendedTemperature,
              max_tokens: 1800,
              stream: Boolean(wantStream),
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (orRes.ok) {
            if (wantStream && orRes.body) {
              after(() => recordUsage("openrouter", model));
              return createSSEResponseFromUpstream(orRes, "openrouter", model, responseMeta);
            }
            const orData = await orRes.json();
            const rawMsg = orData.choices?.[0]?.message;
            const text = ((rawMsg?.content && rawMsg.content.trim()) || (rawMsg?.reasoning && rawMsg.reasoning.trim()) || "").trim();
            if (text && !text.includes("User Safety: safe")) {
              after(() => recordUsage("openrouter", model));
              return NextResponse.json({ text, provider: "openrouter", model, ...responseMeta }, { headers: CORS_HEADERS });
            }
          } else {
            const errData: any = await orRes.json().catch(() => ({}));
            lastVisionError = errData?.error?.message || errData?.message || `HTTP ${orRes.status}`;
            after(() => logAIError("openrouter-vision", model, lastVisionError, orRes.status));
          }
        } catch (mErr: any) {
          clearTimeout(timeoutId);
          lastVisionError = mErr?.name === "AbortError" ? "Vision model timed out" : (mErr?.message || "Vision error");
          after(() => logAIError("openrouter-vision", model, lastVisionError, 504));
        }
      }

      // CRITICAL FIX: If the user explicitly asked to analyze their screen and ALL vision models failed,
      // DO NOT fall through to text-only Groq (which cannot see the image and will blindly hallucinate!).
      if (promptCtx.intent === "screen") {
        return NextResponse.json(
          {
            error: `Screen analysis timed out (${lastVisionError}). Please tap Retry.`,
            code: "VISION_UNAVAILABLE",
            retryable: true,
          },
          { status: 503, headers: CORS_HEADERS }
        );
      }
      // For non-screen-focused prompts with an optional image, fall through to text models cleanly WITHOUT claiming an image is attached.
    }

    // Rebuild text-only prompt if we fell through from failed optional vision so the text model never hallucinates seeing an image
    const textCtx = hasImage
      ? buildEnhancedInterviewPrompt(prompt, rawTranscript, {
          history: cleanHistory,
          hasImage: false,
          previousTranscriptLength: prevTranscriptLen,
          previousTranscriptTail: prevTranscriptTail,
          customContext: cleanCustomContext,
          forceFreshAngle: Boolean(forceFreshAngle),
        })
      : promptCtx;

    const textMeta = {
      intent: textCtx.intent,
      responseMode: textCtx.responseMode,
      isRepeatAsk: textCtx.isRepeatAsk,
      hasTranscriptDelta: textCtx.hasTranscriptDelta,
      turnNumber: textCtx.turnNumber,
    };

    // ------------------------------------------------------------------
    // PATH 2: ULTRA-FAST GROQ TEXT EXECUTION (Direct native fetch + SSE)
    // ------------------------------------------------------------------
    const textMessages: any[] = [
      { role: "system", content: textCtx.systemPrompt },
      ...cleanHistory,
      {
        role: "user",
        content: textCtx.userMessageContent,
      },
    ];

    let lastTextError = "All AI models are temporarily unavailable.";

    if (groqKey) {
      const groqModels = ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b"];

      for (const model of groqModels) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 11000);
        try {
          const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${groqKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: textMessages,
              temperature: textCtx.recommendedTemperature,
              max_tokens: 1800,
              stream: Boolean(wantStream),
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (groqRes.ok) {
            if (wantStream && groqRes.body) {
              after(() => recordUsage("groq", model));
              return createSSEResponseFromUpstream(groqRes, "groq", model, textMeta);
            }
            const data = await groqRes.json();
            const textOutput = (data?.choices?.[0]?.message?.content || "").trim();
            if (textOutput) {
              after(() => recordUsage("groq", model));
              return NextResponse.json({ text: textOutput, provider: "groq", model, ...textMeta }, { headers: CORS_HEADERS });
            }
          } else {
            const errData: any = await groqRes.json().catch(() => ({}));
            lastTextError = errData?.error?.message || `HTTP ${groqRes.status}`;
            after(() => logAIError("groq", model, lastTextError, groqRes.status));
          }
        } catch (err: any) {
          clearTimeout(timeoutId);
          lastTextError = err?.name === "AbortError" ? "Request timed out" : (err?.message || "Groq error");
          after(() => logAIError("groq", model, lastTextError, 504));
        }
      }
    }

    // ------------------------------------------------------------------
    // PATH 3: OPENROUTER TEXT FALLBACK
    // ------------------------------------------------------------------
    if (openRouterKey) {
      const textModels = ["openrouter/free", "liquid/lfm-2.5-2.6b:free"];
      if (openRouterModel && !textModels.includes(openRouterModel) && openRouterModel !== "openrouter/free") {
        textModels.unshift(openRouterModel);
      }

      for (const model of textModels) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 9000);
        try {
          const orRes = await fetch(`${openRouterBaseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openRouterKey}`,
              "HTTP-Referer": "https://voiceflow-azure.vercel.app",
              "X-Title": "Voiceflow Co-Pilot",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: textMessages,
              temperature: textCtx.recommendedTemperature,
              max_tokens: 1800,
              stream: Boolean(wantStream),
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (orRes.ok) {
            if (wantStream && orRes.body) {
              after(() => recordUsage("openrouter", model));
              return createSSEResponseFromUpstream(orRes, "openrouter", model, textMeta);
            }
            const orData = await orRes.json();
            const answer = (orData.choices?.[0]?.message?.content || "").trim();
            if (answer && !answer.includes("User Safety: safe")) {
              after(() => recordUsage("openrouter", model));
              return NextResponse.json({ text: answer, provider: "openrouter", model, ...textMeta }, { headers: CORS_HEADERS });
            }
          } else {
            const errData: any = await orRes.json().catch(() => ({}));
            lastTextError = errData?.error?.message || errData?.message || `HTTP ${orRes.status}`;
            after(() => logAIError("openrouter-text", model, lastTextError, orRes.status));
          }
        } catch (orTextErr: any) {
          clearTimeout(timeoutId);
          lastTextError = orTextErr?.name === "AbortError" ? "Timed out" : (orTextErr?.message || "Failed");
          after(() => logAIError("openrouter-text", model, lastTextError, 504));
        }
      }
    }

    // Honest failure instead of fake corporate boilerplate disguised as a real answer
    return NextResponse.json(
      {
        error: `AI co-pilot could not respond right now (${lastTextError}). Please tap Retry.`,
        code: "PROVIDERS_UNAVAILABLE",
        retryable: true,
      },
      { status: 503, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    console.error("Error in ask-screen route:", error);
    const errorMessage = typeof error === "string" ? error : (error?.message || "Failed to process AI request");
    after(() => logAIError("server", "outer-catch", errorMessage, 500));
    return NextResponse.json({ error: errorMessage, retryable: true }, { status: 500, headers: CORS_HEADERS });
  }
}

/**
 * Proxies an OpenAI-compatible SSE stream (Groq / OpenRouter) into a clean, normalized SSE stream
 * emitting `{ delta }`, `{ done: true, provider, model }`, or `{ error }`.
 */
function createSSEResponseFromUpstream(
  upstreamRes: Response,
  provider: string,
  model: string,
  meta: Record<string, unknown> = {}
): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const readable = new ReadableStream({
    async start(controller) {
      const reader = upstreamRes.body?.getReader();
      if (!reader) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Empty upstream stream" })}\n\n`));
        controller.close();
        return;
      }

      let buffer = "";
      let emittedAny = false;
      let reasoningFallback = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;

            try {
              const parsed = JSON.parse(payload);
              const deltaObj = parsed.choices?.[0]?.delta;
              const chunkText = deltaObj?.content || "";
              if (chunkText) {
                emittedAny = true;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: chunkText })}\n\n`));
              } else if (deltaObj?.reasoning) {
                reasoningFallback += deltaObj.reasoning;
              }
            } catch {
              // ignore malformed keepalive SSE comments/fragments
            }
          }
        }

        if (!emittedAny && reasoningFallback.trim()) {
          emittedAny = true;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: reasoningFallback.trim() })}\n\n`));
        }

        if (!emittedAny) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: "Model returned an empty response. Please tap Retry." })}\n\n`)
          );
        } else {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, provider, model, ...meta })}\n\n`));
        }
      } catch (streamErr: any) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: streamErr?.message || "Stream interrupted" })}\n\n`)
        );
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // ignore
        }
        controller.close();
      }
    },
  });

  return new Response(readable, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

async function recordUsage(provider: "groq" | "openrouter", model: string) {
  try {
    const { adminFirestore } = await import("@/firebase/admin");
    if (adminFirestore) {
      const admin = (await import("firebase-admin")).default;
      const today = new Date().toISOString().split("T")[0];
      const month = today.slice(0, 7);
      const docRef = adminFirestore.collection("platform_stats").doc("ai_provider_quotas");
      await docRef.set(
        {
          [provider]: {
            totalRequests: admin.firestore.FieldValue.increment(1),
            [`monthlyRequests_${month}`]: admin.firestore.FieldValue.increment(1),
            [`dailyRequests_${today}`]: admin.firestore.FieldValue.increment(1),
            lastUsed: admin.firestore.FieldValue.serverTimestamp(),
            lastModel: model,
          },
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch {
    // silently ignore metrics failure
  }
}

async function logAIError(provider: string, model: string, error: string, status?: number) {
  try {
    const { adminFirestore } = await import("@/firebase/admin");
    if (adminFirestore) {
      const admin = (await import("firebase-admin")).default;
      await adminFirestore.collection("error_logs").add({
        message: `[AI Provider: ${provider.toUpperCase()}] Model '${model}' failed: ${error}`,
        stack: `HTTP Status: ${status || 500}\nTimestamp: ${new Date().toISOString()}`,
        url: "/api/ask-screen",
        userAgent: "Voiceflow Server Co-Pilot",
        userId: "system",
        businessId: "system",
        type: "ai_error",
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
