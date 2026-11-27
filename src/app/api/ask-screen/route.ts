import { NextRequest, NextResponse, after } from "next/server";
import {
  buildEnhancedInterviewPrompt,
  sanitizeConversationHistory,
  tokenizeContent,
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
  const requestStartedAt = Date.now();
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
      lastAnsweredQuestion,
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
    const prevAssistantReply =
      [...cleanHistory].reverse().find((h) => h.role === "assistant")?.content || "";

    const prevTranscriptLen =
      typeof lastTranscriptLength === "number" && Number.isFinite(lastTranscriptLength)
        ? lastTranscriptLength
        : undefined;
    const prevTranscriptTail = typeof lastTranscriptTail === "string" ? lastTranscriptTail : undefined;
    const prevAnsweredQuestion =
      typeof lastAnsweredQuestion === "string" && lastAnsweredQuestion.trim()
        ? lastAnsweredQuestion.trim()
        : undefined;

    const promptCtx = buildEnhancedInterviewPrompt(prompt, rawTranscript, {
      history: cleanHistory,
      hasImage,
      previousTranscriptLength: prevTranscriptLen,
      previousTranscriptTail: prevTranscriptTail,
      previousAnsweredQuestion: prevAnsweredQuestion,
      customContext: cleanCustomContext,
      forceFreshAngle: Boolean(forceFreshAngle),
    });

    const responseMeta = {
      intent: promptCtx.intent,
      responseMode: promptCtx.responseMode,
      isRepeatAsk: promptCtx.isRepeatAsk,
      hasTranscriptDelta: promptCtx.hasTranscriptDelta,
      turnNumber: promptCtx.turnNumber,
      extractedQuestion: promptCtx.extractedQuestion || undefined,
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
              return createSSEResponseFromUpstream(
                orRes,
                "openrouter",
                model,
                responseMeta,
                prevAssistantReply,
                requestStartedAt,
                promptCtx.isTranscriptRelevant
              );
            }
            const orData = await orRes.json();
            const rawMsg = orData.choices?.[0]?.message;
            // Never dump internal `reasoning` chain-of-thought as the user's answer
            const text = stripThinkTags(rawMsg?.content || "").trim();
            if (text && !text.includes("User Safety: safe")) {
              const drift = evaluateContextDrift(text, prevAssistantReply, Date.now() - requestStartedAt, promptCtx.isRepeatAsk);
              after(() => {
                void recordUsage("openrouter", model);
                void recordContextTelemetry({
                  ...responseMeta,
                  isTranscriptRelevant: promptCtx.isTranscriptRelevant,
                  provider: "openrouter",
                  model,
                  latencyMs: Date.now() - requestStartedAt,
                  responseChars: text.length,
                  ...drift,
                });
              });
              return NextResponse.json({ text, provider: "openrouter", model, ...responseMeta, ...drift }, { headers: CORS_HEADERS });
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
          previousAnsweredQuestion: prevAnsweredQuestion,
          customContext: cleanCustomContext,
          forceFreshAngle: Boolean(forceFreshAngle),
        })
      : promptCtx;

    // Keep live spoken teleprompter answers fast & punchy (~55–95 words) while leaving full budget for code/analysis
    const textMaxTokens =
      !textCtx.isCodeRelated &&
      (textCtx.responseMode === "spoken_teleprompter" || textCtx.responseMode === "fresh_alternative")
        ? 500
        : 1800;

    const textMeta = {
      intent: textCtx.intent,
      responseMode: textCtx.responseMode,
      isRepeatAsk: textCtx.isRepeatAsk,
      hasTranscriptDelta: textCtx.hasTranscriptDelta,
      turnNumber: textCtx.turnNumber,
      extractedQuestion: textCtx.extractedQuestion || undefined,
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
              max_tokens: textMaxTokens,
              stream: Boolean(wantStream),
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (groqRes.ok) {
            if (wantStream && groqRes.body) {
              after(() => recordUsage("groq", model));
              return createSSEResponseFromUpstream(
                groqRes,
                "groq",
                model,
                textMeta,
                prevAssistantReply,
                requestStartedAt,
                textCtx.isTranscriptRelevant
              );
            }
            const data = await groqRes.json();
            const textOutput = stripThinkTags(data?.choices?.[0]?.message?.content || "").trim();
            if (textOutput) {
              const drift = evaluateContextDrift(textOutput, prevAssistantReply, Date.now() - requestStartedAt, textCtx.isRepeatAsk);
              after(() => {
                void recordUsage("groq", model);
                void recordContextTelemetry({
                  ...textMeta,
                  isTranscriptRelevant: textCtx.isTranscriptRelevant,
                  provider: "groq",
                  model,
                  latencyMs: Date.now() - requestStartedAt,
                  responseChars: textOutput.length,
                  ...drift,
                });
              });
              return NextResponse.json({ text: textOutput, provider: "groq", model, ...textMeta, ...drift }, { headers: CORS_HEADERS });
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
              max_tokens: textMaxTokens,
              stream: Boolean(wantStream),
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (orRes.ok) {
            if (wantStream && orRes.body) {
              after(() => recordUsage("openrouter", model));
              return createSSEResponseFromUpstream(
                orRes,
                "openrouter",
                model,
                textMeta,
                prevAssistantReply,
                requestStartedAt,
                textCtx.isTranscriptRelevant
              );
            }
            const orData = await orRes.json();
            const answer = stripThinkTags(orData.choices?.[0]?.message?.content || "").trim();
            if (answer && !answer.includes("User Safety: safe")) {
              const drift = evaluateContextDrift(answer, prevAssistantReply, Date.now() - requestStartedAt, textCtx.isRepeatAsk);
              after(() => {
                void recordUsage("openrouter", model);
                void recordContextTelemetry({
                  ...textMeta,
                  isTranscriptRelevant: textCtx.isTranscriptRelevant,
                  provider: "openrouter",
                  model,
                  latencyMs: Date.now() - requestStartedAt,
                  responseChars: answer.length,
                  ...drift,
                });
              });
              return NextResponse.json({ text: answer, provider: "openrouter", model, ...textMeta, ...drift }, { headers: CORS_HEADERS });
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
function evaluateContextDrift(
  responseText: string,
  prevAssistantReply: string,
  latencyMs: number,
  isRepeatAsk: boolean
): { overlapWithPrev: number | null; driftStatus: "healthy" | "watch" | "drifting" } {
  const cleanResp = (responseText || "").trim();
  if (cleanResp.length < 20) {
    return { overlapWithPrev: null, driftStatus: "drifting" };
  }
  let overlapWithPrev: number | null = null;
  if (prevAssistantReply && prevAssistantReply.trim().length > 15) {
    const a = tokenizeContent(cleanResp);
    const b = tokenizeContent(prevAssistantReply);
    if (a.size > 0 && b.size > 0) {
      let inter = 0;
      for (const t of a) if (b.has(t)) inter++;
      overlapWithPrev = Number((inter / (a.size + b.size - inter)).toFixed(3));
    }
  }
  const repeatThreshold = isRepeatAsk ? 0.58 : 0.68;
  if (overlapWithPrev !== null && overlapWithPrev >= repeatThreshold) {
    return { overlapWithPrev, driftStatus: "drifting" };
  }
  if ((overlapWithPrev !== null && overlapWithPrev >= 0.45) || latencyMs > 7000) {
    return { overlapWithPrev, driftStatus: "watch" };
  }
  return { overlapWithPrev, driftStatus: "healthy" };
}

function stripThinkTags(text: string): string {
  return (text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think>/gi, "")
    .trim();
}

/**
 * Proxies an OpenAI-compatible SSE stream (Groq / OpenRouter) into a clean, normalized SSE stream
 * emitting `{ delta }`, `{ done: true, provider, model }`, or `{ error }`.
 * Strips any `<think>...</think>` blocks on the fly and NEVER leaks raw `delta.reasoning`.
 */
function createSSEResponseFromUpstream(
  upstreamRes: Response,
  provider: string,
  model: string,
  meta: Record<string, any> = {},
  prevAssistantReply = "",
  startedAt = Date.now(),
  isTranscriptRelevant = false
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
      let accumulatedText = "";
      let inThinkBlock = false;
      let thinkPending = "";

      const emitFilteredText = (chunk: string) => {
        if (!chunk) return;
        thinkPending += chunk;

        while (thinkPending.length > 0) {
          if (inThinkBlock) {
            const closeIdx = thinkPending.toLowerCase().indexOf("</think>");
            if (closeIdx === -1) {
              // Retain trailing 7 chars in case "</think>" spans chunks
              if (thinkPending.length > 7) {
                thinkPending = thinkPending.slice(-7);
              }
              return;
            }
            thinkPending = thinkPending.slice(closeIdx + 8);
            inThinkBlock = false;
          } else {
            const openIdx = thinkPending.toLowerCase().indexOf("<think>");
            if (openIdx === -1) {
              // Hold back up to 6 trailing chars only if they could start "<think>"
              const lastLt = thinkPending.lastIndexOf("<");
              let safeEmit = thinkPending;
              if (lastLt !== -1 && thinkPending.length - lastLt < 7) {
                safeEmit = thinkPending.slice(0, lastLt);
                thinkPending = thinkPending.slice(lastLt);
              } else {
                thinkPending = "";
              }
              if (safeEmit) {
                emittedAny = true;
                accumulatedText += safeEmit;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: safeEmit })}\n\n`));
              }
              return;
            }
            const before = thinkPending.slice(0, openIdx);
            if (before) {
              emittedAny = true;
              accumulatedText += before;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: before })}\n\n`));
            }
            thinkPending = thinkPending.slice(openIdx + 7);
            inThinkBlock = true;
          }
        }
      };

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
                emitFilteredText(chunkText);
              }
            } catch {
              // ignore malformed keepalive SSE comments/fragments
            }
          }
        }

        // Flush any remaining buffered non-think text at stream end
        if (!inThinkBlock && thinkPending) {
          const cleanTail = stripThinkTags(thinkPending);
          if (cleanTail) {
            emittedAny = true;
            accumulatedText += cleanTail;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: cleanTail })}\n\n`));
          }
          thinkPending = "";
        }

        if (!emittedAny) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: "Model returned an empty response. Please tap Retry." })}\n\n`)
          );
        } else {
          const latencyMs = Date.now() - startedAt;
          const drift = evaluateContextDrift(accumulatedText, prevAssistantReply, latencyMs, Boolean(meta.isRepeatAsk));
          void recordContextTelemetry({
            intent: String(meta.intent || "custom"),
            responseMode: String(meta.responseMode || "direct_analytical"),
            isRepeatAsk: Boolean(meta.isRepeatAsk),
            hasTranscriptDelta: Boolean(meta.hasTranscriptDelta),
            isTranscriptRelevant,
            turnNumber: Number(meta.turnNumber || 1),
            provider,
            model,
            latencyMs,
            responseChars: accumulatedText.length,
            ...drift,
          });
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true, provider, model, ...meta, ...drift })}\n\n`)
          );
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

async function recordContextTelemetry(event: {
  intent: string;
  responseMode: string;
  isRepeatAsk: boolean;
  hasTranscriptDelta: boolean;
  isTranscriptRelevant: boolean;
  turnNumber: number;
  provider: string;
  model: string;
  latencyMs: number;
  responseChars: number;
  overlapWithPrev: number | null;
  driftStatus: "healthy" | "watch" | "drifting";
}) {
  try {
    const { adminFirestore } = await import("@/firebase/admin");
    if (!adminFirestore) return;
    const admin = (await import("firebase-admin")).default;
    const inc = admin.firestore.FieldValue.increment;

    const safeMode = event.responseMode.replace(/[^a-zA-Z0-9_]/g, "_");
    const safeIntent = event.intent.replace(/[^a-zA-Z0-9_]/g, "_");

    const rollupUpdate: Record<string, any> = {
      totalTurns: inc(1),
      [`status_${event.driftStatus}`]: inc(1),
      [`mode_${safeMode}`]: inc(1),
      [`intent_${safeIntent}`]: inc(1),
      latencyMsSum: inc(Math.max(0, Math.round(event.latencyMs))),
      lastDriftStatus: event.driftStatus,
      lastModel: event.model,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (event.isRepeatAsk) {
      rollupUpdate.repeatAskTurns = inc(1);
      if (event.driftStatus !== "drifting") {
        rollupUpdate.freshRepeatTurns = inc(1);
      }
    }
    if (event.hasTranscriptDelta) {
      rollupUpdate.transcriptDeltaHits = inc(1);
    }
    if (event.overlapWithPrev !== null) {
      rollupUpdate.overlapSum = inc(event.overlapWithPrev);
      rollupUpdate.overlapCount = inc(1);
    }

    await Promise.all([
      adminFirestore
        .collection("platform_stats")
        .doc("context_telemetry")
        .set(rollupUpdate, { merge: true }),
      adminFirestore.collection("context_telemetry_events").add({
        ...event,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
    ]);
  } catch {
    // Telemetry must never degrade live responses
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
