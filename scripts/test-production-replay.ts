/**
 * REAL Production-Replay, Voice-Band VAD, and Live Audio Failover Test Suite
 *
 * Unlike synthetic mock-string tests, this suite replays ACTUAL captured production
 * failure transcripts from Firestore (hrxUZtf9S3abz4YoVeOu, 6WZ0w31wrIyZD0SKzA4v,
 * lQ6kcXpUMPJTeyI2AQXX), tests realistic -32/-38 dBFS voice signals against the VAD,
 * and probes the REAL transcription failover endpoints with a valid 16kHz WAV file.
 */
import { config } from "dotenv";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import {
  buildEnhancedInterviewPrompt,
  extractLastQuestion,
  getLatestHeardPreview,
  getSelectableTranscriptTurns,
  isWhisperHallucinationNoise,
  parseConversationTurns,
  type ConversationTurn,
} from "../src/lib/transcript-context";
import { evaluateVoiceActivity, isDuplicateSpeakerBleed } from "../src/lib/audio-vad";
import {
  clearOpenRouterKeyCooldown,
  getOpenRouterKeyPool,
  getOrderedOpenRouterKeys,
  recordOpenRouterKeyFailure,
} from "../src/lib/openrouter-keys";

config({ path: ".env" });
config({ path: ".env.local" });

const SUGGEST_PROMPT =
  "Give me a smart real-time answer suggestion for the current meeting point.";

let passed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    const msg = `  ✗ ${name}${detail !== undefined ? ` — got ${JSON.stringify(detail)}` : ""}`;
    failures.push(msg);
    console.error(msg);
  }
}

function makeTestWav16k(durationSec = 1.2): Buffer {
  const sampleRate = 16000;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataBytes = numSamples * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // Mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataBytes, 40);
  // Subtle 440Hz tone so it's valid non-zero audio
  for (let i = 0; i < numSamples; i++) {
    const val = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 2000);
    buf.writeInt16LE(val, 44 + i * 2);
  }
  return buf;
}

async function runLiveTranscriptionEndpointProbes() {
  console.log("\n=== PART 3: LIVE TRANSCRIPTION PROVIDER PROBES (Real 16kHz WAV) ===");
  const wav = makeTestWav16k(1.0);

  if (process.env.GROQ_API_KEY) {
    for (const model of ["whisper-large-v3-turbo", "whisper-large-v3"]) {
      const fd = new FormData();
      fd.append("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "probe.wav");
      fd.append("model", model);
      fd.append("language", "en");
      fd.append("response_format", "verbose_json");
      const t0 = performance.now();
      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
        body: fd,
        signal: AbortSignal.timeout(15000),
      });
      const dt = Math.round(performance.now() - t0);
      const txt = await res.text();
      console.log(`  [Groq ${model}] HTTP ${res.status} (${dt}ms): ${txt.slice(0, 140)}`);
    }
  }

  if (process.env.GEMINI_API_KEY) {
    const b64 = wav.toString("base64");
    const endpoints = [
      {
        label: "generativelanguage (gemini-2.5-flash)",
        url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
      },
      {
        label: "aiplatform Vertex Express (gemini-2.5-flash)",
        url: `https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
      },
    ];
    for (const ep of endpoints) {
      const t0 = performance.now();
      const res = await fetch(ep.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: "If there is human speech transcribe it, otherwise say EMPTY." },
                { inline_data: { mime_type: "audio/wav", data: b64 } },
              ],
            },
          ],
          generationConfig: { temperature: 0, maxOutputTokens: 32 },
        }),
        signal: AbortSignal.timeout(15000),
      });
      const dt = Math.round(performance.now() - t0);
      const txt = await res.text();
      console.log(`  [Gemini ${ep.label}] HTTP ${res.status} (${dt}ms): ${txt.slice(0, 160)}`);
    }
  }

  const orKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (orKey) {
    const b64 = wav.toString("base64");
    const t0 = performance.now();
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${orKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Transcribe speech or reply EMPTY." },
              { type: "input_audio", input_audio: { data: b64, format: "wav" } },
            ],
          },
        ],
        max_tokens: 32,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const dt = Math.round(performance.now() - t0);
    const txt = await res.text();
    console.log(`  [OpenRouter audio] HTTP ${res.status} (${dt}ms): ${txt.slice(0, 160)}`);
  }
}

function synthesizeSpokenWav(text: string, outPath: string): boolean {
  const safeText = text.replace(/'/g, "''");
  const safePath = outPath.replace(/'/g, "''");
  const ps = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = 0
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$synth.SetOutputToWaveFile('${safePath}', $fmt)
$synth.Speak('${safeText}')
$synth.Dispose()
`;
  const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" });
  return r.status === 0 && fs.existsSync(outPath) && fs.statSync(outPath).size > 1000;
}

async function transcribeWavLiveGroq(wavBuf: Buffer): Promise<{ text: string; latencyMs: number }> {
  const apiKey = process.env.GROQ_API_KEY || "";
  if (!apiKey) throw new Error("GROQ_API_KEY missing");
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(wavBuf)], { type: "audio/wav" }), "speech.wav");
  fd.append("model", "whisper-large-v3-turbo");
  fd.append("language", "en");
  fd.append("response_format", "verbose_json");
  const t0 = performance.now();
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
    signal: AbortSignal.timeout(20000),
  });
  const latencyMs = Math.round(performance.now() - t0);
  if (!res.ok) throw new Error(`Groq Whisper HTTP ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  return { text: String(data.text || "").trim(), latencyMs };
}

async function askGroqLive(
  systemPrompt: string,
  history: ConversationTurn[],
  userMessageContent: string,
  temperature: number
): Promise<{ text: string; model: string; latencyMs: number }> {
  const apiKey = process.env.GROQ_API_KEY || "";
  if (!apiKey) throw new Error("GROQ_API_KEY missing");
  const models = ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b"];
  let lastErr = "";
  for (const model of models) {
    const t0 = performance.now();
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          ...history,
          { role: "user", content: userMessageContent },
        ],
        temperature,
        max_tokens: 1200,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const latencyMs = Math.round(performance.now() - t0);
    if (!res.ok) {
      lastErr = `HTTP ${res.status} (${model}): ${(await res.text()).slice(0, 120)}`;
      continue;
    }
    const data: any = await res.json();
    const raw = String(data.choices?.[0]?.message?.content || "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();
    if (raw) return { text: raw, model, latencyMs };
  }
  throw new Error(`All Groq chat models failed: ${lastErr}`);
}

async function runLiveSpokenAudioToAnswerE2E() {
  console.log("\n=== PART 4: LIVE END-TO-END (REAL SPOKEN WAV -> GROQ WHISPER -> CONTEXT ENGINE -> LIVE GROQ LLM) ===");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-e2e-"));
  try {
    const spokenSteps: Array<{
      label: string;
      spokenText: string;
      speaker: "THEM" | "YOU";
      timestamp: string;
      appendAfterTranscript?: string[];
      mustMatch: RegExp;
      mustNotBleed?: RegExp;
    }> = [
      {
        label: "Turn 1 (Outage behavioral question)",
        spokenText: "Tell me about a difficult production outage you diagnosed and resolved.",
        speaker: "THEM",
        timestamp: "0:15",
        mustMatch: /outage|incident|latency|root cause|diagnos|mitigat|rollback|database|production/i,
      },
      {
        label: "Turn 2 (Redis cache stampede + trailing 'Take your time' stall)",
        spokenText: "How do you prevent cache stampedes in Redis during a flash sale?",
        speaker: "THEM",
        timestamp: "1:05",
        appendAfterTranscript: [
          "[1:10] [YOU] Sure, let me think about that for a second.",
          "[1:13] [THEM] Take your time, no rush at all.",
        ],
        mustMatch: /redis|cache|stampede|lock|singleflight|ttl|jitter|probabilistic|mutex|stale/i,
        mustNotBleed: /production outage|black friday/i,
      },
      {
        label: "Turn 3 (Ultra-short follow-up: 'Why Rust?')",
        spokenText: "Why Rust?",
        speaker: "THEM",
        timestamp: "1:50",
        mustMatch: /rust|memory|ownership|borrow|zero[- ]cost|performance|safety|gc|garbage/i,
        mustNotBleed: /cache stampede|flash sale/i,
      },
      {
        label: "Turn 4 (WASAPI missed chunk — question arrives via speaker bleed in [YOU])",
        spokenText: "How do you keep shared API types in sync between backend and frontend?",
        speaker: "YOU",
        timestamp: "2:30",
        mustMatch: /openapi|trpc|graphql|schema|codegen|shared|monorepo|zod|contract|typescript|type/i,
        mustNotBleed: /borrow checker|cache stampede/i,
      },
    ];

    let liveTranscript = "";
    let prevLen = 0;
    let prevTail = "";
    let prevAnsweredQ = "";
    const history: ConversationTurn[] = [];

    for (let i = 0; i < spokenSteps.length; i++) {
      const step = spokenSteps[i];
      const wavPath = path.join(tmpDir, `turn-${i + 1}.wav`);
      const okSynth = synthesizeSpokenWav(step.spokenText, wavPath);
      check(`E2E.${i + 1}a Synthesized real 16kHz spoken WAV (${step.label})`, okSynth);
      if (!okSynth) continue;

      const wavBuf = fs.readFileSync(wavPath);
      const stt = await transcribeWavLiveGroq(wavBuf);
      check(`E2E.${i + 1}b Groq Whisper transcribed spoken audio non-empty`, stt.text.length >= 6, stt.text);

      const line = `[${step.timestamp}] [${step.speaker}] ${stt.text}`;
      liveTranscript = liveTranscript ? `${liveTranscript}\n\n${line}` : line;
      if (step.appendAfterTranscript?.length) {
        liveTranscript += "\n\n" + step.appendAfterTranscript.join("\n\n");
      }

      const ctx = buildEnhancedInterviewPrompt(SUGGEST_PROMPT, liveTranscript, {
        history,
        previousTranscriptLength: prevLen,
        previousTranscriptTail: prevTail,
        previousAnsweredQuestion: prevAnsweredQ || undefined,
      });

      const llm = await askGroqLive(ctx.systemPrompt, history, ctx.userMessageContent, ctx.recommendedTemperature);
      const hasBracketPlaceholder = /\[(?:insert|your|company|university|number|specific|project)[^\]]*\]/i.test(llm.text);

      console.log(`\n  --- ${step.label} ---`);
      console.log(`  Spoken WAV  -> Whisper (${stt.latencyMs}ms): "${stt.text}"`);
      console.log(`  Extracted Q -> mode=${ctx.responseMode} repeat=${ctx.isRepeatAsk} delta=${ctx.hasTranscriptDelta}: "${ctx.extractedQuestion}"`);
      console.log(`  Live Answer (${llm.model}, ${llm.latencyMs}ms):\n    ${llm.text.replace(/\n/g, "\n    ")}`);

      check(
        `E2E.${i + 1}c Suggest Answer extracted the LATEST question (not an older turn) & did not falsely repeat`,
        ctx.isRepeatAsk === false &&
          ctx.responseMode === "spoken_teleprompter" &&
          Boolean(ctx.extractedQuestion && step.mustMatch.test(ctx.extractedQuestion)),
        { repeat: ctx.isRepeatAsk, mode: ctx.responseMode, q: ctx.extractedQuestion }
      );
      check(
        `E2E.${i + 1}d Live LLM answer directly addresses the LATEST spoken question`,
        step.mustMatch.test(llm.text) && !hasBracketPlaceholder,
        llm.text.slice(0, 140)
      );
      if (step.mustNotBleed) {
        check(
          `E2E.${i + 1}e Live LLM answer has ZERO carryover from earlier question`,
          !step.mustNotBleed.test(llm.text),
          llm.text.slice(0, 140)
        );
      }

      // Mirror EXACT meeting-widget.tsx cursor & semantic history updates!
      history.push(
        {
          role: "user",
          content: ctx.extractedQuestion ? `[Asked for live answer to]: ${ctx.extractedQuestion}` : SUGGEST_PROMPT,
        },
        { role: "assistant", content: llm.text }
      );
      prevLen = liveTranscript.trim().length;
      prevTail = liveTranscript.trim().slice(-120);
      if (ctx.extractedQuestion) prevAnsweredQ = ctx.extractedQuestion;
    }

    // Also run LIVE LLM against the actual messy Nov 28 Firestore transcript `hrxUZtf9S3abz4YoVeOu`!
    const messyFirestoreTx = [
      "[0:01] [YOU] testing mic testing mic",
      "[0:11] [YOU] Gracias.",
      "[0:31] [YOU] ¿Qué pasa?",
      "[0:51] [YOU] We recommend taking this interview on a computer. If you're not on a computer, you can click end call and return at another time.",
      "[0:51] [THEM] we recommend taking this interview on a computer. If you're not on the computer, you can click end call and return at another time.",
      "[1:41] [YOU] Within software engineering, what are the two specific areas or topics you know best and feel most confident discussing?",
      "[1:41] [THEM] Within software engineering, what are the two specific areas or topics you know best and feel most confident discussing?",
      "[1:51] [YOU] I will say TypeScripts",
      "[2:41] [THEM] Thanks for confirming. Could you share a brief overview of your",
      "[2:51] [YOU] background and what led you to specialize in TypeScript and Rust",
    ].join("\n\n");

    const messyCtx = buildEnhancedInterviewPrompt(SUGGEST_PROMPT, messyFirestoreTx, {
      history: [
        {
          role: "user",
          content:
            "[Asked for live answer to]: Within software engineering, what are the two specific areas or topics you know best and feel most confident discussing?",
        },
        {
          role: "assistant",
          content: "**My two strongest areas are TypeScript full-stack architecture and Rust systems programming.**",
        },
      ],
      previousTranscriptLength: messyFirestoreTx.indexOf("[2:41]"),
      previousTranscriptTail: "[1:51] [YOU] I will say TypeScripts",
      previousAnsweredQuestion:
        "Within software engineering, what are the two specific areas or topics you know best and feel most confident discussing?",
    });
    const messyLlm = await askGroqLive(
      messyCtx.systemPrompt,
      [
        {
          role: "user",
          content:
            "[Asked for live answer to]: Within software engineering, what are the two specific areas or topics you know best and feel most confident discussing?",
        },
        {
          role: "assistant",
          content: "**My two strongest areas are TypeScript full-stack architecture and Rust systems programming.**",
        },
      ],
      messyCtx.userMessageContent,
      messyCtx.recommendedTemperature
    );
    console.log(`\n  --- Real Nov 28 Firestore Transcript (hrxUZtf9S3abz4YoVeOu) ---`);
    console.log(`  Extracted Q -> "${messyCtx.extractedQuestion}" (repeat=${messyCtx.isRepeatAsk})`);
    console.log(`  Live Answer (${messyLlm.model}, ${messyLlm.latencyMs}ms):\n    ${messyLlm.text.replace(/\n/g, "\n    ")}`);
    check(
      "E2E.5 Live LLM on real Nov 28 messy Firestore transcript answers TypeScript/Rust background (zero placeholders, zero old computer/end-call bleed)",
      /typescript/i.test(messyLlm.text) &&
        /rust/i.test(messyLlm.text) &&
        !/end call|recommend taking this interview/i.test(messyLlm.text) &&
        !/\[(?:insert|your|company|university|number|specific)[^\]]*\]/i.test(messyLlm.text),
      messyLlm.text.slice(0, 160)
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  console.log("=== PART 1: REAL PRODUCTION TRANSCRIPT REPLAYS ===");

  // REPLAY 1: Actual Nov 28 meeting `hrxUZtf9S3abz4YoVeOu` (Spanish noise, speaker bleed, split question!)
  {
    const realTx = [
      "[0:01] [YOU] testing mic testing mic",
      "[0:11] [YOU] Gracias.",
      "[0:31] [YOU] ¿Qué pasa?",
      "[0:51] [YOU] We recommend taking this interview on a computer. If you're not on a computer, you can click end call and return at another time.",
      "[0:51] [THEM] we recommend taking this interview on a computer. If you're not on the computer, you can click end call and return at another time.",
      "[1:41] [YOU] Within software engineering, what are the two specific areas or topics you know best and feel most confident discussing?",
      "[1:41] [THEM] Within software engineering, what are the two specific areas or topics you know best and feel most confident discussing?",
      "[1:51] [YOU] I will say TypeScripts",
      "[2:41] [THEM] Thanks for confirming. Could you share a brief overview of your",
      "[2:51] [YOU] background and what led you to specialize in TypeScript and Rust",
    ].join("\n\n");

    const turns = parseConversationTurns(realTx);
    check(
      "R1.1 Spanish silence noise ('Gracias.' / '¿Qué pasa?') filtered out",
      !turns.some((t) => /gracias|qué pasa/i.test(t.text)),
      turns.map((t) => t.text)
    );
    const recommendCopies = turns.filter((t) => /recommend taking this interview/i.test(t.text)).length;
    check("R1.2 Laptop speaker bleed ([YOU] echoing [THEM]) deduplicated to 1 turn", recommendCopies === 1, recommendCopies);

    const extracted = extractLastQuestion(realTx);
    check(
      "R1.3 Split question across [2:41][THEM] + [2:51][YOU] stitched completely",
      Boolean(extracted && /overview of your/i.test(extracted) && /typescript and rust/i.test(extracted)),
      extracted
    );

    const preview = getLatestHeardPreview(realTx);
    check(
      "R1.4 Live HUD 'Heard' preview shows clean stitched question",
      Boolean(preview && /overview of your/i.test(preview)),
      preview
    );
  }

  // REPLAY 2: Actual `themCount === 0` desktop meetings (5 of 9 real meetings had 0 [THEM] turns!)
  {
    const tx1 = "[0:15] [YOU] Tell me about a difficult production outage you resolved recently.";
    const r1 = buildEnhancedInterviewPrompt(SUGGEST_PROMPT, tx1, { history: [], previousTranscriptLength: 0 });
    check(
      "R2.1 [YOU]-only call (themCount=0): Turn 1 extracts question instead of returning null",
      Boolean(r1.extractedQuestion && /production outage/i.test(r1.extractedQuestion)),
      r1.extractedQuestion
    );

    const tx2 = tx1 + "\n\n[0:55] [YOU] Great, now how do you handle zero-downtime Postgres migrations at scale?";
    const hist: ConversationTurn[] = [
      { role: "user", content: `[Asked for live answer to]: ${r1.extractedQuestion}` },
      { role: "assistant", content: "**During a Black Friday checkout outage, I isolated a lock contention query and restored P99 latency in 12 minutes.**" },
    ];
    const r2 = buildEnhancedInterviewPrompt(SUGGEST_PROMPT, tx2, {
      history: hist,
      previousTranscriptLength: tx1.length,
      previousTranscriptTail: tx1.slice(-120),
      previousAnsweredQuestion: r1.extractedQuestion || undefined,
    });
    check(
      "R2.2 [YOU]-only call (themCount=0): Turn 2 sees NEW question (delta=true, repeat=false, spoken_teleprompter)",
      r2.hasTranscriptDelta === true &&
        r2.isRepeatAsk === false &&
        r2.responseMode === "spoken_teleprompter" &&
        Boolean(r2.extractedQuestion && /postgres migrations/i.test(r2.extractedQuestion)),
      { delta: r2.hasTranscriptDelta, repeat: r2.isRepeatAsk, mode: r2.responseMode, q: r2.extractedQuestion }
    );
  }

  // REPLAY 3: Actual Nov 27 meeting `lQ6kcXpUMPJTeyI2AQXX` (<|en|> tokens, ALL-CAPS garble, multi-question progression)
  {
    const noisyTx = [
      "[26:05] [THEM] THO TRO TRO THRONG-CH. THO T ROOOOLNNNNNNNNNNNNNNNNNNNN AAJKJUJD ROOSDORG.",
      "[27:15] [YOU] ... ...<|en|><|en|><|en|><|en|>jid<|en|><|en|><|en|><|en|><|en|><|en|>",
      "[72:05] [THEM] How did you handle it? And what was the outcome?",
      "[74:05] [THEM] Thanks for sharing that. What was the final outcome of the project after these adjustments?",
      "[74:10] [THEM] Thanks for watching!",
    ].join("\n\n");

    const turns = parseConversationTurns(noisyTx);
    check(
      "R3.1 Raw <|en|> tokens and ALL-CAPS gibberish stripped completely",
      !turns.some((t) => /<\|en\|>|ROOOOL|Thanks for watching/i.test(t.text)),
      turns.map((t) => t.text)
    );
    const q = extractLastQuestion(noisyTx);
    check(
      "R3.2 Latest real behavioral question survives trailing 'Thanks for watching!' hallucination",
      Boolean(q && /final outcome of the project/i.test(q)),
      q
    );
  }

  // REPLAY 4: Actual Nov 27 meeting `6WZ0w31wrIyZD0SKzA4v` (Italian n-gram loop & repeated English loop)
  {
    check(
      "R4.1 Italian n-gram loop ('come la parola' x5) flagged as hallucination noise",
      isWhisperHallucinationNoise(
        "come lo scrivo e non è l'unione di un monti stasera che colloca come la parola come la parola come la parola come la parola come la parola"
      )
    );
    check(
      "R4.2 Repeated English question loop ('What is that?' x5) flagged as hallucination noise",
      isWhisperHallucinationNoise("What is that? What is that? What is that? What is that? What is that?")
    );
  }

  // REPLAY 5: Dual-channel call where WASAPI drops latest chunk, interviewer question bleeds into [YOU]
  {
    const baseTx = "[0:15] [THEM] Tell me about your experience scaling TypeScript monorepos?";
    const nextTx = baseTx + "\n\n[0:50] [YOU] How do you keep shared API types in sync between backend and frontend?";
    const hist: ConversationTurn[] = [
      { role: "user", content: "[Asked for live answer to]: Tell me about your experience scaling TypeScript monorepos?" },
      { role: "assistant", content: "**I scale TypeScript monorepos with project references, Turborepo caching, and strict tsconfig boundaries.**" },
    ];
    const r = buildEnhancedInterviewPrompt(SUGGEST_PROMPT, nextTx, {
      history: hist,
      previousTranscriptLength: baseTx.length,
      previousTranscriptTail: baseTx.slice(-120),
      previousAnsweredQuestion: "Tell me about your experience scaling TypeScript monorepos?",
    });
    check(
      "R5.1 Speaker-bleed rescue: explicit interviewer question in [YOU] after [THEM] missed chunk IS answered",
      r.hasTranscriptDelta === true &&
        r.isRepeatAsk === false &&
        Boolean(r.extractedQuestion && /api types in sync/i.test(r.extractedQuestion)),
      { delta: r.hasTranscriptDelta, repeat: r.isRepeatAsk, q: r.extractedQuestion }
    );
  }

  // REPLAY 6: Dual-channel call where [YOU] actually speaks their own first-person answer (must NOT hijack!)
  {
    const baseTx = "[0:15] [THEM] Tell me about your experience scaling TypeScript monorepos?";
    const nextTx = baseTx + "\n\n[0:35] [YOU] I have five years using Turborepo and strict project references across 40 packages.";
    const hist: ConversationTurn[] = [
      { role: "user", content: "[Asked for live answer to]: Tell me about your experience scaling TypeScript monorepos?" },
      { role: "assistant", content: "**I scale TypeScript monorepos with project references and Turborepo caching.**" },
    ];
    const r = buildEnhancedInterviewPrompt(SUGGEST_PROMPT, nextTx, {
      history: hist,
      previousTranscriptLength: baseTx.length,
      previousTranscriptTail: baseTx.slice(-120),
      previousAnsweredQuestion: "Tell me about your experience scaling TypeScript monorepos?",
    });
    check(
      "R6.1 Genuine [YOU] answer monologue still switches to fresh_alternative (does not hijack)",
      r.isRepeatAsk === true && r.responseMode === "fresh_alternative",
      { repeat: r.isRepeatAsk, mode: r.responseMode, q: r.extractedQuestion }
    );
  }

  // REPLAY 7: Trailing [THEM] stall remark ("Take your time, no rush") after [YOU] interjection MUST NOT hide the real question!
  {
    const tx = [
      "[0:45] [THEM] How do you prevent cache stampedes in Redis during a flash sale?",
      "[0:49] [YOU] Sure, let me think about that for a second.",
      "[0:52] [THEM] Take your time, no rush at all.",
    ].join("\n\n");
    const r = buildEnhancedInterviewPrompt(SUGGEST_PROMPT, tx, { history: [], previousTranscriptLength: 0 });
    check(
      "R7.1 Trailing [THEM] stall ('Take your time, no rush') does NOT hide actual Redis question 1 turn earlier",
      Boolean(r.extractedQuestion && /cache stampedes in redis/i.test(r.extractedQuestion)),
      r.extractedQuestion
    );
  }

  // REPLAY 8: Split [THEM] question interrupted mid-sentence by [YOU] backchannel ("Sure, go ahead.")
  {
    const tx = [
      "[1:10] [THEM] Can you walk me through a time when you had to",
      "[1:12] [YOU] Sure, go ahead.",
      "[1:14] [THEM] resolve a production outage under tight deadline pressure?",
    ].join("\n\n");
    const q = extractLastQuestion(tx);
    check(
      "R8.1 Split [THEM] question interrupted by [YOU] stitched completely",
      Boolean(q && /walk me through/i.test(q) && /production outage/i.test(q)),
      q
    );
  }

  // REPLAY 9: Ultra-short follow-up question ("[THEM] Why Rust?") MUST advance delta instead of repeating Q1!
  {
    const tx1 = "[0:15] [THEM] Tell me about your experience scaling TypeScript monorepos?";
    const tx2 = tx1 + "\n\n[0:55] [THEM] Why Rust?";
    const hist: ConversationTurn[] = [
      { role: "user", content: "[Asked for live answer to]: Tell me about your experience scaling TypeScript monorepos?" },
      { role: "assistant", content: "**I scale TypeScript monorepos using project references and Turborepo caching.**" },
    ];
    const r = buildEnhancedInterviewPrompt(SUGGEST_PROMPT, tx2, {
      history: hist,
      previousTranscriptLength: tx1.length,
      previousTranscriptTail: tx1.slice(-120),
      previousAnsweredQuestion: "Tell me about your experience scaling TypeScript monorepos?",
    });
    check(
      "R9.1 Short follow-up '[THEM] Why Rust?' triggers fresh answer (NOT repeat of old TypeScript question)",
      r.hasTranscriptDelta === true &&
        r.isRepeatAsk === false &&
        r.responseMode === "spoken_teleprompter" &&
        Boolean(r.extractedQuestion && /why rust/i.test(r.extractedQuestion)),
      { delta: r.hasTranscriptDelta, repeat: r.isRepeatAsk, mode: r.responseMode, q: r.extractedQuestion }
    );
  }

  // REPLAY 10: Cursor-shift after speaker-bleed deduplication replaces longer [YOU] line with shorter [THEM] line + new Q2
  {
    const prevTxBeforeDedup =
      "[0:51] [YOU] Within software engineering, what are the two specific areas or topics you know best and feel most confident discussing right now?";
    const nextTxAfterDedup = [
      "[0:51] [THEM] Within software engineering, what are the two specific areas you know best?",
      "[1:15] [THEM] How big was that team?",
    ].join("\n\n");
    const hist: ConversationTurn[] = [
      {
        role: "user",
        content:
          "[Asked for live answer to]: Within software engineering, what are the two specific areas or topics you know best?",
      },
      { role: "assistant", content: "**My two strongest areas are distributed TypeScript backends and Postgres performance.**" },
    ];
    const r = buildEnhancedInterviewPrompt(SUGGEST_PROMPT, nextTxAfterDedup, {
      history: hist,
      previousTranscriptLength: prevTxBeforeDedup.length,
      previousTranscriptTail: prevTxBeforeDedup.slice(-120),
      previousAnsweredQuestion: "Within software engineering, what are the two specific areas or topics you know best?",
    });
    check(
      "R10.1 Cursor-shift rescue: shorter deduped transcript + new Q2 still detects new question instead of repeating Q1",
      r.isRepeatAsk === false && Boolean(r.extractedQuestion && /how big was that team/i.test(r.extractedQuestion)),
      { delta: r.hasTranscriptDelta, repeat: r.isRepeatAsk, q: r.extractedQuestion }
    );
  }

  // REPLAY 11: User explicitly selects an EARLIER turn from the transcript to answer (Transcript Picker!)
  {
    const multiTx = [
      "[0:10] [YOU] Gracias.",
      "[0:20] [THEM] How do you handle idempotency in payment webhooks?",
      "[0:55] [THEM] Take your time, no rush at all.",
      "[1:15] [THEM] Also, what is your preferred start date if selected?",
    ].join("\n\n");

    const selectable = getSelectableTranscriptTurns(multiTx);
    check(
      "S1.1 Selectable transcript turns filter out Spanish noise and 'Take your time' stall",
      selectable.length === 2 &&
        selectable.some((t) => /idempotency in payment webhooks/i.test(t.text)) &&
        selectable.some((t) => /preferred start date/i.test(t.text)),
      selectable.map((t) => t.text)
    );

    const chosenEarlier = selectable[0].text;
    const pickedCtx = buildEnhancedInterviewPrompt(SUGGEST_PROMPT, multiTx, {
      history: [
        { role: "user", content: "[Asked for live answer to]: Also, what is your preferred start date if selected?" },
        { role: "assistant", content: "**I can start within two weeks after wrapping up my current handover.**" },
      ],
      previousTranscriptLength: multiTx.length,
      previousTranscriptTail: multiTx.slice(-120),
      previousAnsweredQuestion: "Also, what is your preferred start date if selected?",
      selectedTranscriptText: chosenEarlier,
    });
    check(
      "S1.2 User-selected earlier transcript turn locks extractedQuestion & never falsely triggers repeat",
      pickedCtx.isRepeatAsk === false &&
        pickedCtx.responseMode === "spoken_teleprompter" &&
        Boolean(pickedCtx.extractedQuestion && /idempotency in payment webhooks/i.test(pickedCtx.extractedQuestion)) &&
        /USER-SELECTED TRANSCRIPT QUESTION/.test(pickedCtx.userMessageContent),
      { repeat: pickedCtx.isRepeatAsk, mode: pickedCtx.responseMode, q: pickedCtx.extractedQuestion }
    );

    const pickedCodeCtx = buildEnhancedInterviewPrompt(SUGGEST_PROMPT, multiTx, {
      selectedTranscriptText: "Implement a TypeScript LRU cache with O(1) get and put.",
    });
    check(
      "S1.3 User-selected coding transcript turn switches cleanly to code_technical mode",
      pickedCodeCtx.responseMode === "code_technical" &&
        pickedCodeCtx.isCodeRelated === true &&
        Boolean(pickedCodeCtx.extractedQuestion && /LRU cache/i.test(pickedCodeCtx.extractedQuestion)),
      { mode: pickedCodeCtx.responseMode, code: pickedCodeCtx.isCodeRelated, q: pickedCodeCtx.extractedQuestion }
    );
  }

  console.log("\n=== PART 2: VOICE-BAND + RMS VAD & SPEAKER-BLEED SIGNAL TESTS ===");
  {
    // Simulate 48kHz, fftSize=256 (128 bins, 187.5Hz/bin -> 300-3400Hz = bins 1..19)
    // Soft human voice at -32 dBFS: voice bins ~20, high bins (4-24kHz) = 0
    // NOTE: Old full-spectrum average = (19*20)/128 = 2.97 -> OLD VAD THRESHOLD 6.0 DROPPED THIS!
    const softVoiceFreq = new Uint8Array(128);
    for (let b = 2; b <= 18; b++) softVoiceFreq[b] = 20;
    const softVoiceTime = new Float32Array(256);
    for (let i = 0; i < 256; i++) softVoiceTime[i] = Math.sin((2 * Math.PI * 500 * i) / 48000) * 0.025;
    const softRes = evaluateVoiceActivity(softVoiceFreq, softVoiceTime, 48000, 256);
    check(
      "V1.1 Soft human speech (-32 dBFS, old full-spectrum avg=2.7) IS detected by voice-band + RMS VAD",
      softRes.hasSpeech === true,
      softRes
    );

    // Very quiet voice (-39 dBFS, RMS ~0.011, voice bins ~10)
    const quietVoiceFreq = new Uint8Array(128);
    for (let b = 2; b <= 15; b++) quietVoiceFreq[b] = 10;
    const quietVoiceTime = new Float32Array(256);
    for (let i = 0; i < 256; i++) quietVoiceTime[i] = Math.sin((2 * Math.PI * 400 * i) / 48000) * 0.014;
    const quietRes = evaluateVoiceActivity(quietVoiceFreq, quietVoiceTime, 48000, 256);
    check("V1.2 Very quiet voice (-39 dBFS) IS detected", quietRes.hasSpeech === true, quietRes);

    // Laptop fan / room floor noise (RMS ~0.002, low energy across bins ~2)
    const fanFreq = new Uint8Array(128).fill(2);
    const fanTime = new Float32Array(256);
    for (let i = 0; i < 256; i++) fanTime[i] = ((i % 7) - 3) * 0.0008;
    const fanRes = evaluateVoiceActivity(fanFreq, fanTime, 48000, 256);
    check("V1.3 Quiet room fan noise floor is REJECTED", fanRes.hasSpeech === false, fanRes);

    // Speaker-bleed deduplication check
    const committed = [
      {
        orderKey: 51000,
        text: "[0:51] [THEM] We recommend taking this interview on a computer. If you're not on the computer, you can click end call.",
      },
    ];
    check(
      "V1.4 Speaker bleed [YOU] matching adjacent [THEM] is suppressed",
      isDuplicateSpeakerBleed(
        "[0:51] [YOU] We recommend taking this interview on a computer. If you're not on a computer, you can click end call.",
        51001,
        committed
      ) === true
    );
    check(
      "V1.5 Genuine [YOU] answer next to [THEM] is preserved",
      isDuplicateSpeakerBleed("[0:55] [YOU] I am on a desktop computer and ready to start now.", 55001, committed) === false
    );
  }

  console.log("\n=== PART 2B: OPENROUTER MULTI-KEY ROTATION & 429 FAILOVER TESTS ===");
  {
    const orig1 = process.env.OPENROUTER_API_KEY;
    const orig2 = process.env.OPENROUTER_API_KEY_2;
    const orig3 = process.env.OPENROUTER_API_KEY_3;
    const orig4 = process.env.OPENROUTER_API_KEY_4;
    const origPool = process.env.OPENROUTER_API_KEYS;
    const origOpenAI = process.env.OPENAI_API_KEY;
    const origPub = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;
    try {
      process.env.OPENROUTER_API_KEYS = "";
      process.env.OPENROUTER_API_KEY = "sk-or-test-key-1";
      process.env.OPENROUTER_API_KEY_2 = "sk-or-test-key-2";
      process.env.OPENROUTER_API_KEY_3 = "sk-or-test-key-3";
      process.env.OPENROUTER_API_KEY_4 = "";
      process.env.OPENAI_API_KEY = "sk-or-test-key-1"; // duplicate should be deduped
      process.env.NEXT_PUBLIC_OPENROUTER_API_KEY = "";
      clearOpenRouterKeyCooldown("sk-or-test-key-1");
      clearOpenRouterKeyCooldown("sk-or-test-key-2");
      clearOpenRouterKeyCooldown("sk-or-test-key-3");

      const pool = getOpenRouterKeyPool();
      check("OR1.1 Pool loads all 3 OpenRouter keys deduplicated", pool.length === 3, pool.length);

      const firstOrder = getOrderedOpenRouterKeys();
      const secondOrder = getOrderedOpenRouterKeys();
      const thirdOrder = getOrderedOpenRouterKeys();
      check(
        "OR1.2 Round-robin cycles evenly across all 3 primary keys",
        new Set([firstOrder[0], secondOrder[0], thirdOrder[0]]).size === 3 && firstOrder.length === 3,
        [firstOrder[0], secondOrder[0], thirdOrder[0]]
      );

      // Simulate Key 1 hitting OpenRouter's 50/day free-tier limit
      const shouldRotate = recordOpenRouterKeyFailure(
        "sk-or-test-key-1",
        429,
        "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day"
      );
      check("OR1.3 Daily 429 signals immediate key rotation", shouldRotate === true);

      const afterFail = getOrderedOpenRouterKeys();
      check(
        "OR1.4 Exhausted Key 1 is skipped automatically; healthy Keys 2 & 3 remain active",
        afterFail.length === 2 && !afterFail.includes("sk-or-test-key-1") && afterFail.includes("sk-or-test-key-2") && afterFail.includes("sk-or-test-key-3"),
        afterFail
      );
    } finally {
      clearOpenRouterKeyCooldown("sk-or-test-key-1");
      clearOpenRouterKeyCooldown("sk-or-test-key-2");
      clearOpenRouterKeyCooldown("sk-or-test-key-3");
      process.env.OPENROUTER_API_KEY = orig1;
      process.env.OPENROUTER_API_KEY_2 = orig2;
      process.env.OPENROUTER_API_KEY_3 = orig3;
      process.env.OPENROUTER_API_KEY_4 = orig4;
      process.env.OPENROUTER_API_KEYS = origPool;
      process.env.OPENAI_API_KEY = origOpenAI;
      process.env.NEXT_PUBLIC_OPENROUTER_API_KEY = origPub;
    }
  }

  if (process.argv.includes("--probe-live")) {
    await runLiveTranscriptionEndpointProbes();
  }

  if (process.argv.includes("--live-e2e")) {
    await runLiveSpokenAudioToAnswerE2E();
  }

  console.log(`\n========================================`);
  console.log(`PRODUCTION-REPLAY PASSED: ${passed}`);
  console.log(`PRODUCTION-REPLAY FAILED: ${failures.length}`);
  console.log(`========================================`);
  if (failures.length > 0) {
    console.error("\nFailures:\n" + failures.join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

