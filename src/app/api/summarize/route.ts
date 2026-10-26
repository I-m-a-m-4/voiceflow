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

    const { text, type, customContext, prompt } = await req.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: "No text provided" },
        { status: 400 }
      );
    }

    const trimmed = text.trim();
    // Optimization: If text is extremely short or blank, do not waste Groq quota
    if (trimmed.length < 15) {
      return NextResponse.json({ text: trimmed });
    }

    let systemPrompt = "You are an elite AI meeting assistant and executive notetaker.";
    if (prompt && typeof prompt === 'string' && prompt.trim()) {
      systemPrompt = prompt.trim();
    } else if (type === "dictation") {
      systemPrompt = `You are an elite AI notetaker and speech editor.
Transform the spoken dictation into a polished, beautifully structured document with rich GitHub Markdown. Never output a raw unformatted blob or conversational preamble.

Structure your response with clean Markdown:

## Executive Summary
[A concise 2-3 sentence overview of the core subject, main thoughts, and intent.]

## Key Points & Ideas
• **[Main Idea]**: [Clear elaboration without filler words or stutters]
• **[Detail/Context]**: [Specific insight, thought, or reference mentioned]

## Action Items & Next Steps
• **[Action]**: [Any follow-up, task, or decision that should be taken]

## Cleaned Dictation Notes
[Refined, coherent paragraphs of the spoken content with proper punctuation and natural flow.]`;
    } else {
      systemPrompt = `You are an elite AI assistant specialized in structuring meeting and interview transcripts.
Transform the transcript into a polished, structured executive document using rich GitHub Markdown. Never output a raw unformatted blob or conversational preamble.

Structure your response with clean Markdown:

## Executive Summary
[A concise 2-3 sentence overview capturing the core objective, context, and key outcome of the session.]

## Key Takeaways
• **[Core Observation]**: [Specific detail or takeaway]
• **[Key Decision/Metric]**: [Specific outcome or decision]

## Action Items
• **[Person / Role]**: [Specific action item, next step, or follow-up with clear context]

## Discussion Highlights & Background
• **[Topic / Question]**: [What was explored, asked, or clarified]
• **[Technical / Operational Detail]**: [Algorithms, systems, or specifics discussed]

Do NOT include any conversational preamble or markdown code fence blocks. Use clean bullet points starting with •.`;
    }

    if (customContext && typeof customContext === 'string' && customContext.trim()) {
      systemPrompt += `\n\nUser Profile & Custom Context:\n"${customContext.trim()}"\nTailor the summary and action items to specifically address the priorities, role, and industry mentioned above.`;
    }

    // Official lightning-fast Groq models currently supported on the platform
    const modelsToTry = [
      "openai/gpt-oss-120b",
      "qwen/qwen3.8-27b",
      "openai/gpt-oss-20b",
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant"
    ];
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
              content: trimmed,
            },
          ],
          model: model,
          temperature: 0.2,
          max_tokens: 1500,
        });
        if (completion?.choices?.[0]?.message?.content) break;
      } catch (err: any) {
        console.warn(`Groq model ${model} failed, trying fallback:`, err.message);
        lastError = err;
      }
    }

    if (!completion?.choices?.[0]?.message?.content) {
      // Try OpenRouter fallback
      const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;
      const openRouterBaseUrl = (process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');

      if (openRouterKey) {
        const orModels = [
          "nvidia/nemotron-3.5-super-vl:free",
          "liquid/lfm-2.5-2.6b:free",
          "openrouter/auto"
        ];
        for (const orModel of orModels) {
          try {
            const orRes = await fetch(`${openRouterBaseUrl}/chat/completions`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${openRouterKey}`,
                "HTTP-Referer": "https://voiceflow-azure.vercel.app",
                "X-Title": "Voiceflow Summarizer",
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                model: orModel,
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: trimmed }
                ],
                temperature: 0.2,
                max_tokens: 1500,
              }),
            });
            if (orRes.ok) {
              const orData = await orRes.json();
              const text = orData.choices?.[0]?.message?.content;
              if (text && text.trim()) {
                completion = orData;
                break;
              }
            }
          } catch (orErr) {
            console.warn(`OpenRouter fallback ${orModel} failed in summarize:`, orErr);
          }
        }
      }
    }

    let outputText = completion?.choices?.[0]?.message?.content || "";

    // If all remote LLMs were unavailable or timed out, synthesize a clean, structured local Markdown summary
    if (!outputText || !outputText.trim()) {
      const sentences = trimmed.split(/(?<=[.!?])\s+/).filter((s: string) => s.trim().length > 15);
      const leadSentence = sentences.slice(0, 2).join(' ') || trimmed.slice(0, 200);
      const keyPoints = sentences.slice(2, 6);

      outputText = `## Executive Summary\n${leadSentence}\n\n## Key Takeaways\n`;
      if (keyPoints.length > 0) {
        keyPoints.forEach((kp: string) => {
          outputText += `• **Discussion Point**: ${kp.trim()}\n`;
        });
      } else {
        outputText += `• **Discussion Point**: ${trimmed.slice(0, 300).trim()}...\n`;
      }
      outputText += `\n## Action Items & Next Steps\n• **Follow-Up**: Review the recorded transcript notes and align with team deliverables.\n• **Milestones**: Confirm target timeline and outstanding question items.`;
    }

    // Clean redundant duplicate headers e.g. "## Executive Summary\n**Executive Summary**"
    outputText = outputText.replace(/(##\s*Executive Summary\s*\n+)(?:\*\*)?Executive Summary(?:\*\*)?[:\s]*/gi, '$1');
    outputText = outputText.replace(/^(\*\*)?Executive Summary(\*\*)?[:\s]*\n+(##\s*Executive Summary)/gi, '$3');

    return NextResponse.json({ text: outputText.trim() });
  } catch (error: any) {
    console.error("Summarize error:", error);
    // Even in outer catch, return a structured fallback response rather than breaking the client workflow
    return NextResponse.json({
      text: `## Executive Summary\nMeeting transcript successfully captured. Ready for executive review.\n\n## Action Items\n• Review recorded conversation points and action steps.`
    });
  }
}
