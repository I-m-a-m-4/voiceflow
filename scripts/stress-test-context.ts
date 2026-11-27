/**
 * Extreme Stress Test Suite for Voiceflow Co-Pilot Context Management
 *
 * Run deterministic + live multi-turn tests:
 *   npm run test:context-stress
 *   npx tsx scripts/stress-test-context.ts --live
 *   npx tsx scripts/stress-test-context.ts --unit-only
 *
 * Tests two layers rigorously:
 *  PART A (Deterministic, 70+ assertions):
 *    1. Repeat-ask & anti-repetition detection (including negative tests for distinct Q1 vs Q2)
 *    2. Transcript delta & anchor tracking (never resurrects answered old questions)
 *    3. Dynamic code/technical mode (and zero false positives on business/medical/HR)
 *    4. Transcript anti-hijacking isolation for standalone/code queries
 *    5. Visual screen analysis adaptation & repeat-capture handling
 *    6. History sanitization & adversarial fuzzing (100KB transcript, malformed turns, 50-turn history)
 *
 *  PART B (Live Multi-Turn Groq LLM Stress Tests, when --live or GROQ_API_KEY present):
 *    1. Same "Suggest Answer" clicked twice on identical transcript -> genuinely distinct Turn 2
 *    2. Live transcript shifts from DB architecture to coding exercise -> pivots cleanly to code
 *    3. Code understanding -> TS fix -> junior-dev re-explanation with noisy unrelated HR transcript
 *    4. Exact same typed question asked twice -> fresh angle, low overlap with Turn 1
 *    5. Back-to-back unrelated questions -> zero topic bleed
 */

import { config } from "dotenv";
import {
  buildEnhancedInterviewPrompt,
  extractLastQuestion,
  isCodeOrTechnicalPrompt,
  isFollowUpPrompt,
  isRecapPrompt,
  sanitizeConversationHistory,
  splitTranscriptDelta,
  tokenizeContent,
  type ConversationTurn,
} from "../src/lib/transcript-context";

config({ path: ".env" });
config({ path: ".env.local" });

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
  } else {
    const info = detail === undefined ? "" : ` — got ${JSON.stringify(detail)}`;
    failures.push(`[FAIL] ${name}${info}`);
    console.error(`  ✗ ${name}${info}`);
  }
}

function jaccard(a: string, b: string): number {
  const ta = tokenizeContent(a);
  const tb = tokenizeContent(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

function firstLine(text: string): string {
  return (text || "")
    .split(/\n+/)
    .map((l) => l.trim())
    .find(Boolean) || "";
}

// ============================================================================
// PART A: DETERMINISTIC UNIT & ADVERSARIAL STRESS SUITE
// ============================================================================
function runDeterministicSuite() {
  console.log("\n=== PART A: Deterministic Context Engine Stress Tests ===");
  const start = performance.now();

  // --------------------------------------------------------------------------
  // 1. Repeat-Ask & Anti-Repetition Detection
  // --------------------------------------------------------------------------
  {
    const tx =
      "[0:10] Interviewer: How do you handle high-traffic database bottlenecks in production?";

    const turn1 = buildEnhancedInterviewPrompt(
      "Give me a smart real-time answer suggestion for the current meeting point.",
      tx,
      { history: [], previousTranscriptLength: 0 }
    );
    check("1.1 Turn 1 Suggest Answer intent=suggest", turn1.intent === "suggest", turn1.intent);
    check(
      "1.2 Turn 1 Suggest Answer mode=spoken_teleprompter",
      turn1.responseMode === "spoken_teleprompter",
      turn1.responseMode
    );
    check("1.3 Turn 1 isRepeatAsk=false", turn1.isRepeatAsk === false, turn1.isRepeatAsk);
    check(
      "1.4 Turn 1 extracted DB question",
      Boolean(turn1.extractedQuestion?.toLowerCase().includes("database bottlenecks")),
      turn1.extractedQuestion
    );

    const historyAfterT1: ConversationTurn[] = [
      {
        role: "user",
        content: "Give me a smart real-time answer suggestion for the current meeting point.",
      },
      {
        role: "assistant",
        content:
          "**I tackle database bottlenecks by profiling slow queries first, then combining indexing, read replicas, and Redis caching.**\n- I run EXPLAIN ANALYZE to eliminate full table scans.\n- I offload read-heavy traffic to replicas and cache hot keys.",
      },
    ];

    // Turn 2: Click Suggest Answer AGAIN with NO new transcript
    const turn2Repeat = buildEnhancedInterviewPrompt(
      "Give me a smart real-time answer suggestion for the current meeting point.",
      tx,
      {
        history: historyAfterT1,
        previousTranscriptLength: tx.length,
        previousTranscriptTail: tx.slice(-120),
      }
    );
    check("1.5 Turn 2 repeat Suggest triggers isRepeatAsk=true", turn2Repeat.isRepeatAsk === true, turn2Repeat.isRepeatAsk);
    check(
      "1.6 Turn 2 repeat Suggest switches to fresh_alternative",
      turn2Repeat.responseMode === "fresh_alternative",
      turn2Repeat.responseMode
    );
    check(
      "1.7 Turn 2 repeat Suggest bumps temperature >= 0.6",
      turn2Repeat.recommendedTemperature >= 0.6,
      turn2Repeat.recommendedTemperature
    );
    check(
      "1.8 Turn 2 prompt explicitly forbids repeating previous reply",
      /do not repeat/i.test(turn2Repeat.userMessageContent),
      turn2Repeat.userMessageContent.slice(0, 200)
    );

    // Turn 2: Exact same typed question twice
    const typedHist: ConversationTurn[] = [
      { role: "user", content: "How does React useMemo work?" },
      { role: "assistant", content: "**useMemo caches the result of an expensive calculation between renders.**" },
    ];
    const typedRepeatExact = buildEnhancedInterviewPrompt("How does React useMemo work?", "", {
      history: typedHist,
    });
    check("1.9 Exact same typed question triggers isRepeatAsk=true", typedRepeatExact.isRepeatAsk === true);
    check("1.10 Exact same typed question mode=fresh_alternative", typedRepeatExact.responseMode === "fresh_alternative");

    // Near-duplicate reworded question
    const typedRepeatNear = buildEnhancedInterviewPrompt("Explain how React useMemo works", "", {
      history: typedHist,
    });
    check("1.11 Near-duplicate question triggers isRepeatAsk=true", typedRepeatNear.isRepeatAsk === true);

    // CRITICAL NEGATIVE TEST: Similar syntax, DIFFERENT topic!
    const typedDistinct1 = buildEnhancedInterviewPrompt("How does React useCallback work?", "", {
      history: typedHist,
    });
    check(
      "1.12 Distinct question (useMemo -> useCallback) MUST NOT be repeat",
      typedDistinct1.isRepeatAsk === false,
      typedDistinct1.isRepeatAsk
    );

    const redisHist: ConversationTurn[] = [
      { role: "user", content: "What is Redis?" },
      { role: "assistant", content: "**Redis is an in-memory data structure store.**" },
    ];
    const kafkaNext = buildEnhancedInterviewPrompt("What is Kafka?", "", { history: redisHist });
    check("1.13 Distinct question (Redis -> Kafka) MUST NOT be repeat", kafkaNext.isRepeatAsk === false);
    check("1.14 Distinct question (Redis -> Kafka) mode != fresh_alternative", kafkaNext.responseMode !== "fresh_alternative");

    // Explicit alternative phrase
    const explicitAlt = buildEnhancedInterviewPrompt("Give me a different angle on that", tx, {
      history: historyAfterT1,
    });
    check("1.15 Explicit alternative triggers fresh_alternative", explicitAlt.responseMode === "fresh_alternative");

    // Repeated Recap without new transcript
    const recapHist: ConversationTurn[] = [
      { role: "user", content: "Give me a 2-bullet point quick recap of what was just said." },
      { role: "assistant", content: "**We discussed database bottlenecks and caching.**" },
    ];
    const recapRepeat = buildEnhancedInterviewPrompt(
      "Give me a 2-bullet point quick recap of what was just said.",
      tx,
      { history: recapHist, previousTranscriptLength: tx.length, previousTranscriptTail: tx.slice(-120) }
    );
    check("1.16 Repeated Recap triggers isRepeatAsk=true", recapRepeat.isRepeatAsk === true);
    check("1.17 Repeated Recap mode=fresh_alternative", recapRepeat.responseMode === "fresh_alternative");
  }

  // --------------------------------------------------------------------------
  // 2. Transcript Delta & No Old-Question Resurrection
  // --------------------------------------------------------------------------
  {
    const txPart1 = "[0:15] Interviewer: Tell me about your experience with Kubernetes clusters?";
    const txPart2 =
      txPart1 +
      "\n\n[1:05] Candidate: Sure, I managed multi-region EKS clusters for three years.\n\n[1:40] Interviewer: Awesome. Now let's solve a coding problem on CoderPad. Implement an LRU cache with O(1) get and put operations.";

    const histAfterPart1: ConversationTurn[] = [
      { role: "user", content: "What should I say?" },
      { role: "assistant", content: "**I managed multi-region Kubernetes clusters on EKS for three years.**" },
    ];

    const turn2NewTopic = buildEnhancedInterviewPrompt("What should I say?", txPart2, {
      history: histAfterPart1,
      previousTranscriptLength: txPart1.length,
      previousTranscriptTail: txPart1.slice(-120),
    });

    check("2.1 New speech detected hasTranscriptDelta=true", turn2NewTopic.hasTranscriptDelta === true);
    check("2.2 New speech NOT treated as repeat", turn2NewTopic.isRepeatAsk === false);
    check(
      "2.3 Extracted NEW LRU cache task instead of old Kubernetes question",
      Boolean(turn2NewTopic.extractedQuestion?.toLowerCase().includes("lru cache")) &&
        !turn2NewTopic.extractedQuestion?.toLowerCase().includes("kubernetes"),
      turn2NewTopic.extractedQuestion
    );
    check(
      "2.4 Live coding problem auto-switches Suggest Answer to code_technical",
      turn2NewTopic.responseMode === "code_technical",
      turn2NewTopic.responseMode
    );
    check(
      "2.5 User message separates Earlier vs NEW transcript blocks",
      turn2NewTopic.userMessageContent.includes("[Earlier Meeting Context") &&
        turn2NewTopic.userMessageContent.includes("[NEW Transcript Spoken Since Last Reply"),
      true
    );

    // Whisper interim -> committed shift (anchor resilience)
    const interimTx = "[0:10] Welcome to the call.\n\n... how do you design a rate limiter";
    const committedTx =
      "[0:10] Welcome to the call.\n\n[0:22] How do you design a rate limiter? Specifically, compare token bucket and sliding window.";
    const deltaShifted = splitTranscriptDelta(committedTx, interimTx.length, interimTx.slice(-80));
    check(
      "2.6 Anchor matching isolates newly committed sentence after interim shift",
      deltaShifted.hasMeaningfulDelta &&
        deltaShifted.newTranscript.toLowerCase().includes("token bucket"),
      deltaShifted
    );

    // Filler-only delta must NOT count as meaningful new speech
    const txWithFiller = txPart1 + "\n\n[0:25] Yeah, okay, um, sure, right.";
    const fillerDelta = splitTranscriptDelta(txWithFiller, txPart1.length, txPart1.slice(-120));
    check("2.7 Filler-only addition hasMeaningfulDelta=false", fillerDelta.hasMeaningfulDelta === false, fillerDelta);

    // Transcript reset (e.g. brand new meeting shorter than old cursor)
    const resetDelta = splitTranscriptDelta(
      "[0:05] Hi, can you walk me through your resume and recent projects?",
      2500,
      "some completely old unrelated meeting tail from yesterday"
    );
    check("2.8 Reset transcript treated as fresh delta", resetDelta.hasMeaningfulDelta === true, resetDelta);

    // Mid-sentence false question trap
    const declarativeTrap =
      "We migrated to PostgreSQL because what is really critical for our ledger is strict ACID transactions.";
    const extractedTrap = extractLastQuestion(declarativeTrap);
    check(
      "2.9 Mid-sentence 'what is' in declarative statement NOT extracted as question",
      extractedTrap === null,
      extractedTrap
    );

    // Old question buried behind 3+ newer non-question sentences must not be resurrected
    const oldQuestionBuried = [
      "Can you hear me okay?",
      "Great, let's review the Q4 enterprise roadmap together.",
      "Our primary bottleneck right now is onboarding time for hospital clinics.",
      "We need a concrete plan to reduce activation from 14 days down to 3 days.",
    ].join(" ");
    const extractedBuried = extractLastQuestion(oldQuestionBuried);
    check(
      "2.10 Old 'Can you hear me?' buried behind 3 newer substantive sentences NOT resurrected",
      extractedBuried === null,
      extractedBuried
    );
  }

  // --------------------------------------------------------------------------
  // 3. Dynamic Code & Technical Understanding (and Zero Non-Tech False Positives)
  // --------------------------------------------------------------------------
  {
    const codeSamples = [
      "What does this code do?\n```js\nconst res = arr.reduce((a, b) => a + b, 0);\n```",
      "Fix this bug: TypeError: Cannot read properties of undefined (reading 'map')",
      "Write a Python function to detect a cycle in a linked list and give Big-O complexity",
      "SELECT u.id, COUNT(o.id) FROM users u LEFT JOIN orders o ON u.id = o.user_id GROUP BY u.id — why is this slow?",
      "Explain why useEffect runs twice in React StrictMode",
      "Summarize what this code does: function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }",
      "Refactor this async/await try { fetchData() } catch (e) {} block",
    ];

    codeSamples.forEach((sample, idx) => {
      const r = buildEnhancedInterviewPrompt(sample, "", {});
      check(`3.${idx + 1} Code sample detected as intent=code`, r.intent === "code", { sample: sample.slice(0, 45), intent: r.intent });
      check(
        `3.${idx + 1}b Code sample responseMode=code_technical`,
        r.responseMode === "code_technical",
        r.responseMode
      );
      check(
        `3.${idx + 1}c Code sample does not trigger recap`,
        !isRecapPrompt(sample),
        sample.slice(0, 45)
      );
      check(
        `3.${idx + 1}d Code system prompt mentions fenced Markdown code blocks`,
        r.systemPrompt.includes("fenced Markdown code blocks")
      );
    });

    // Multi-turn code follow-up continuity
    const codeHistory: ConversationTurn[] = [
      { role: "user", content: "Write a binary search function in TypeScript" },
      {
        role: "assistant",
        content:
          "**Binary search runs in O(log n) time.**\n```ts\nfunction binarySearch(nums: number[], target: number): number { return -1; }\n```",
      },
    ];
    const codeFollowups = [
      "Now convert it to Python",
      "What about edge cases when the array is empty?",
      "Explain line 2 step by step",
      "Can you make it recursive?",
    ];
    codeFollowups.forEach((fp, idx) => {
      const r = buildEnhancedInterviewPrompt(fp, "", { history: codeHistory });
      check(
        `3.20.${idx + 1} Code follow-up stays code-aware ("${fp}")`,
        r.intent === "code" || r.responseMode === "code_technical" || r.intent === "followup",
        { intent: r.intent, mode: r.responseMode }
      );
      check(
        `3.20.${idx + 1}b Follow-up prompt carries code continuity ("${fp}")`,
        isCodeOrTechnicalPrompt(fp, codeHistory) || isFollowUpPrompt(fp, codeHistory)
      );
    });

    // Non-tech negative tests (MUST NOT trigger code_technical!)
    const nonTechSamples = [
      "How should I respond to their pricing objection on the enterprise tier?",
      "Tell me about a time you resolved a team conflict under a tight deadline",
      "Explain how our marketing function aligns with sales quota in Q4",
      "What are the main clinical side effects of beta blockers?",
      "How do I negotiate a higher base salary politely?",
      "What is our expected return on investment for the new retail store?",
      "Let me ask how export tariffs affect our Q3 supply chain margins",
      "How can we improve our client onboarding interface with enterprise hospitals?",
    ];
    nonTechSamples.forEach((sample, idx) => {
      const r = buildEnhancedInterviewPrompt(sample, "", {});
      check(
        `3.30.${idx + 1} Non-tech prompt MUST NOT trigger code mode ("${sample.slice(0, 38)}...")`,
        r.intent !== "code" && r.responseMode !== "code_technical",
        { intent: r.intent, mode: r.responseMode }
      );
    });
  }

  // --------------------------------------------------------------------------
  // 4. Transcript Anti-Hijacking Isolation
  // --------------------------------------------------------------------------
  {
    const marketingTranscript =
      "[0:10] VP Marketing: Our Q3 paid search CPA climbed to $142 across EMEA campaigns. " +
      "We need to reallocate 30% of Google Ads spend toward LinkedIn ABM and partner webinars. ".repeat(15);

    // Unrelated standalone code question during marketing meeting
    const standaloneCode = buildEnhancedInterviewPrompt(
      "Explain how JavaScript event loop microtasks vs macrotasks work",
      marketingTranscript,
      {}
    );
    check("4.1 Standalone code question has isTranscriptRelevant=false", standaloneCode.isTranscriptRelevant === false);
    check(
      "4.2 Standalone code question does NOT dump marketing transcript into prompt",
      !standaloneCode.userMessageContent.includes("Google Ads spend"),
      standaloneCode.userMessageContent.length
    );

    // Unrelated standalone conceptual question during marketing meeting
    const standaloneGeneral = buildEnhancedInterviewPrompt(
      "What is the difference between inflation and stagflation?",
      marketingTranscript,
      {}
    );
    check("4.3 Standalone conceptual question has isTranscriptRelevant=false", standaloneGeneral.isTranscriptRelevant === false);
    check(
      "4.4 Standalone conceptual question labels background as optional & bounded",
      standaloneGeneral.userMessageContent.includes("Optional Meeting Background") &&
        standaloneGeneral.userMessageContent.length < 1600,
      standaloneGeneral.userMessageContent.length
    );

    // Meeting-referential question during marketing meeting
    const meetingRef = buildEnhancedInterviewPrompt(
      "What did the VP say about our Q3 CPA target and Google Ads?",
      marketingTranscript,
      {}
    );
    check("4.5 Meeting-referential question has isTranscriptRelevant=true", meetingRef.isTranscriptRelevant === true);
    check(
      "4.6 Meeting-referential question includes full transcript context",
      meetingRef.userMessageContent.includes("Google Ads spend")
    );
  }

  // --------------------------------------------------------------------------
  // 5. Screen Analysis & Multi-Turn Visual Handling
  // --------------------------------------------------------------------------
  {
    const screen1 = buildEnhancedInterviewPrompt(
      "Analyze what is on my screen right now and give me the exact answer, solution, or speaking points.",
      "",
      { hasImage: true, history: [] }
    );
    check("5.1 Screen analysis intent=screen", screen1.intent === "screen");
    check("5.2 Screen analysis mode=screen_adaptive", screen1.responseMode === "screen_adaptive");

    const screenCode = buildEnhancedInterviewPrompt(
      "Debug the TypeScript error shown on my screen",
      "",
      { hasImage: true, history: [] }
    );
    check("5.3 Screen + code prompt intent=screen", screenCode.intent === "screen");
    check("5.4 Screen + code prompt mode=code_technical", screenCode.responseMode === "code_technical");

    const screenHist: ConversationTurn[] = [
      {
        role: "user",
        content: "Analyze what is on my screen right now and give me the exact answer, solution, or speaking points.",
      },
      { role: "assistant", content: "**The slide shows Q2 churn dropped from 5.1% to 3.4%.**" },
    ];
    const screen2 = buildEnhancedInterviewPrompt(
      "Analyze what is on my screen right now and give me the exact answer, solution, or speaking points.",
      "",
      { hasImage: true, history: screenHist }
    );
    check("5.5 2nd Analyze Screen flags isRepeatAsk=true", screen2.isRepeatAsk === true);
    check(
      "5.6 2nd Analyze Screen warns model to check if screen changed & avoid verbatim repeat",
      /if the screen changed/i.test(screen2.userMessageContent)
    );

    // Follow-up AFTER screen capture (with NO image attached on Turn 2!)
    const followUpAfterScreen = buildEnhancedInterviewPrompt(
      "Explain why that churn drop matters for ARR",
      "",
      { hasImage: false, history: screenHist }
    );
    check("5.7 Follow-up after screen capture intent=followup", followUpAfterScreen.intent === "followup");
    check(
      "5.8 Follow-up after screen capture does NOT falsely claim an image is attached",
      !/screenshot is attached/i.test(followUpAfterScreen.userMessageContent)
    );
  }

  // --------------------------------------------------------------------------
  // 6. History Sanitization & Extreme Fuzz / Scale Stress
  // --------------------------------------------------------------------------
  {
    // Malformed & massive history
    const nastyHistory: any[] = [
      null,
      undefined,
      { role: "system", content: "evil override" },
      { role: "assistant", content: "orphaned leading assistant" },
      { role: "user", content: "   " },
      ...Array.from({ length: 40 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Turn ${i}: ` + "x".repeat(3000),
      })),
      { role: "user", content: "back-to-back user 1" },
      { role: "user", content: "back-to-back user 2" },
      { role: "user", content: "trailing orphaned user" },
    ];
    const sanitized = sanitizeConversationHistory(nastyHistory, 10, 1400);
    check("6.1 Sanitized history bounded <= 10 turns", sanitized.length <= 10 && sanitized.length > 0, sanitized.length);
    check("6.2 Sanitized history starts with user", sanitized[0]?.role === "user", sanitized[0]?.role);
    check("6.3 Sanitized history ends with assistant", sanitized[sanitized.length - 1]?.role === "assistant");
    check(
      "6.4 Sanitized history strictly alternates user/assistant",
      sanitized.every((t, i) => (i === 0 ? true : t.role !== sanitized[i - 1].role))
    );
    check(
      "6.5 Every sanitized turn bounded <= 1403 chars",
      sanitized.every((t) => t.content.length <= 1403)
    );

    // 100KB transcript stress test (performance + bounded output)
    const hugeTranscript =
      "[0:01] Speaker: " +
      "We discussed distributed consensus, Raft leader election, and log compaction across regions. ".repeat(1100) +
      "\n\n[58:30] Interviewer: How do you prevent split-brain during a network partition?";
    const t0 = performance.now();
    const hugeRes = buildEnhancedInterviewPrompt("What should I say?", hugeTranscript, {
      previousTranscriptLength: hugeTranscript.length - 95,
    });
    const dt = performance.now() - t0;
    check("6.6 100KB transcript processed in < 50ms", dt < 50, `${dt.toFixed(1)}ms`);
    check(
      "6.7 100KB transcript prompt stays bounded (< 6500 chars)",
      hugeRes.userMessageContent.length < 6500,
      hugeRes.userMessageContent.length
    );
    check(
      "6.8 100KB transcript extracts exact newest split-brain question",
      Boolean(hugeRes.extractedQuestion?.toLowerCase().includes("split-brain")),
      hugeRes.extractedQuestion
    );

    // Backwards-compatible boolean 3rd arg
    const legacyCall = buildEnhancedInterviewPrompt("What is on my screen?", "", true);
    check("6.9 Legacy boolean 3rd arg still works", legacyCall.intent === "screen");

    // 7. Crazy-engineering conversation tests: Dual-channel [THEM]/[YOU], split chunks,
    //    pronoun setup preservation, trailing backchannels, and 48-turn marathon!
    const dualChannelTx = [
      "[0:10] [THEM] Tell me about your experience scaling PostgreSQL.",
      "[0:35] [YOU] Sure, I led a migration to partitioned tables and read replicas.",
      "[1:02] [THEM] We are currently using Redis Pub/Sub for order notifications and dropping messages during deploys.",
      "[1:08] [THEM] how would you make that resilient without losing events?",
      "[1:14] [YOU] Yeah, good question, let me think for a second.",
    ].join("\n\n");

    const dualRes = buildEnhancedInterviewPrompt(
      "Give me a smart real-time answer suggestion for the current meeting point.",
      dualChannelTx,
      { history: [], previousTranscriptLength: 0 }
    );
    check(
      "7.1 Dual-channel stitches split [THEM] chunks & preserves Redis Pub/Sub setup sentence",
      Boolean(
        dualRes.extractedQuestion?.toLowerCase().includes("redis pub/sub") &&
          dualRes.extractedQuestion?.toLowerCase().includes("resilient")
      ),
      dualRes.extractedQuestion
    );
    check(
      "7.2 Dual-channel ignores trailing [YOU] filler ('good question, let me think')",
      !dualRes.extractedQuestion?.toLowerCase().includes("good question"),
      dualRes.extractedQuestion
    );
    check(
      "7.3 Recency-anchored prompt places ACTIVE QUESTION marker at end",
      dualRes.userMessageContent.includes("<<< ACTIVE QUESTION / MOMENT TO ANSWER RIGHT NOW >>>")
    );

    // Unlabeled split-chunk question across Whisper boundary + implicit spoken question
    const implicitSplitTx = [
      "[0:20] We noticed hydration warnings on our Next.js App Router checkout page after adding a dynamic theme.",
      "[0:26] I'm curious how you would track that down and fix it cleanly.",
      "[0:31] Yeah, okay, um, good question.",
    ].join("\n\n");
    const implicitRes = buildEnhancedInterviewPrompt("What should I say?", implicitSplitTx, {});
    check(
      "7.4 Implicit spoken question ('I'm curious how...') preserves Next.js hydration setup & ignores trailing filler",
      Boolean(
        implicitRes.extractedQuestion?.toLowerCase().includes("hydration") &&
          implicitRes.extractedQuestion?.toLowerCase().includes("track that down")
      ),
      implicitRes.extractedQuestion
    );

    // 48-turn marathon stress test (simulating the real user's 48-conversation session!)
    const marathonHistory: ConversationTurn[] = [];
    for (let i = 1; i <= 48; i++) {
      marathonHistory.push(
        { role: "user", content: `[Asked for live answer to]: Question number ${i} about topic_${i}` },
        { role: "assistant", content: `**Direct answer for topic_${i}.**\n- Concrete point for topic_${i}.` }
      );
    }
    const marathonTx =
      "[40:00] [THEM] Earlier we talked about topic_48.\n\n[41:00] [YOU] Yes that worked well.\n\n[41:15] [THEM] Final question: how do you prevent memory leaks in long-lived WebSocket connections in Node.js?";
    const mStart = performance.now();
    const marathonRes = buildEnhancedInterviewPrompt(
      "Give me a smart real-time answer suggestion for the current meeting point.",
      marathonTx,
      {
        history: marathonHistory,
        previousTranscriptLength: marathonTx.indexOf("[41:15]"),
        previousTranscriptTail: "[41:00] [YOU] Yes that worked well.",
      }
    );
    const mDt = performance.now() - mStart;
    check("7.5 48-turn marathon executes in < 25ms", mDt < 25, `${mDt.toFixed(1)}ms`);
    check(
      "7.6 48-turn marathon locks cleanly onto final WebSocket memory leak question",
      Boolean(marathonRes.extractedQuestion?.toLowerCase().includes("websocket")),
      marathonRes.extractedQuestion
    );
    check(
      "7.7 48-turn marathon does NOT confuse new WebSocket question with repeat ask",
      marathonRes.isRepeatAsk === false,
      marathonRes.isRepeatAsk
    );
  }

  // --------------------------------------------------------------------------
  // 8. Production Suggest-Answer Regression Guards (Widget history, [YOU] delta,
  //    natural spoken prompts without '?', self-reply guard, Whisper loops)
  // --------------------------------------------------------------------------
  {
    // 8.1 Widget rewrites prior prompt to "[Asked for live answer to]: ..."
    const tx1 =
      "[0:12] [THEM] Tell me about a time you handled a major production outage under pressure?";
    const res1 = buildEnhancedInterviewPrompt(
      "Give me a smart real-time answer suggestion for the current meeting point.",
      tx1,
      {
        history: [
          {
            role: "user",
            content: `[Asked for live answer to]: "${tx1.replace("[0:12] [THEM] ", "")}"`,
          },
          {
            role: "assistant",
            content:
              "**When our checkout queue backed up during Black Friday, I stabilized latency in 15 minutes.**\n- Isolated the locking query and rolled back the batch job.",
          },
        ],
        previousTranscriptLength: tx1.length,
        previousTranscriptTail: tx1.slice(-120),
        previousAnsweredQuestion:
          "Tell me about a time you handled a major production outage under pressure?",
      }
    );
    check(
      "8.1 Widget rewritten history '[Asked for live answer to]:' triggers repeat-ask",
      res1.isRepeatAsk === true && res1.responseMode === "fresh_alternative",
      { isRepeatAsk: res1.isRepeatAsk, mode: res1.responseMode }
    );

    // 8.2 Dual-channel [YOU]-only speech after Q1 must NOT count as new interviewer delta
    const tx2Base =
      "[0:10] [THEM] Why do you want to join our infrastructure team at Acme?";
    const tx2After =
      tx2Base +
      "\n\n[0:22] [YOU] Yeah so I have been following Acme's distributed storage work and uh wait how should I frame the impact?";
    const res2 = buildEnhancedInterviewPrompt(
      "Give me a smart real-time answer suggestion for the current meeting point.",
      tx2After,
      {
        history: [
          {
            role: "user",
            content:
              '[Asked for live answer to]: "Why do you want to join our infrastructure team at Acme?"',
          },
          {
            role: "assistant",
            content:
              "**I'm drawn to Acme because of your high-throughput storage architecture.**\n- My background scaling Kafka pipelines maps directly to your roadmap.",
          },
        ],
        previousTranscriptLength: tx2Base.length,
        previousTranscriptTail: tx2Base.slice(-120),
        previousAnsweredQuestion:
          "Why do you want to join our infrastructure team at Acme?",
      }
    );
    check(
      "8.2 [YOU]-only delta after Q1 triggers fresh_alternative (does not echo [YOU] as interviewer Q)",
      res2.isRepeatAsk === true &&
        res2.responseMode === "fresh_alternative" &&
        !res2.extractedQuestion?.toLowerCase().includes("how should i frame"),
      { isRepeatAsk: res2.isRepeatAsk, mode: res2.responseMode, q: res2.extractedQuestion }
    );

    // 8.3 Clause-prefixed spoken question without '?'
    const tx3 =
      "[1:05] [THEM] Okay cool, so before we dive into coding how would you handle zero-downtime schema migrations on a 500GB Postgres table";
    const q3 = extractLastQuestion(tx3);
    check(
      "8.3 Clause-prefixed spoken question without '?' extracts cleanly",
      Boolean(q3 && /zero-downtime|schema migrations/i.test(q3)),
      q3
    );

    // 8.4 Natural non-'?' imperative spoken prompt ("I'd love to understand...")
    const tx4 =
      "[2:10] [THEM] Yeah, I'd love to understand your experience with distributed caching and how you prevent cache stampedes";
    const q4 = extractLastQuestion(tx4);
    check(
      "8.4 Natural spoken prompt ('I'd love to understand...') without '?' extracts cleanly",
      Boolean(q4 && /distributed caching|cache stampedes/i.test(q4)),
      q4
    );

    // 8.5 Single-channel user self-reply delta does NOT resurrect Q1 as a brand new question
    const tx5Base =
      "[0:10] What is your biggest strength as an engineering manager?";
    const tx5After =
      tx5Base +
      "\n\n[0:24] I think my biggest strength is hiring and coaching senior engineers through ambiguity.";
    const res5 = buildEnhancedInterviewPrompt(
      "Give me a smart real-time answer suggestion for the current meeting point.",
      tx5After,
      {
        history: [
          {
            role: "user",
            content:
              '[Asked for live answer to]: "What is your biggest strength as an engineering manager?"',
          },
          {
            role: "assistant",
            content:
              "**My biggest strength is building high-ownership teams that ship reliably under ambiguity.**",
          },
        ],
        previousTranscriptLength: tx5Base.length,
        previousTranscriptTail: tx5Base.slice(-120),
        previousAnsweredQuestion:
          "What is your biggest strength as an engineering manager?",
      }
    );
    check(
      "8.5 Single-channel user first-person self-reply does NOT resurrect Q1 as non-repeat",
      res5.isRepeatAsk === true && res5.responseMode === "fresh_alternative",
      { isRepeatAsk: res5.isRepeatAsk, mode: res5.responseMode, q: res5.extractedQuestion }
    );

    // 8.6 Whisper repetition loop noise does NOT clobber real interviewer question
    const tx6 =
      "[0:10] [THEM] How do you measure success during your first 90 days in a new role?\n\n[0:18] [THEM] new\n\n[0:23] [THEM] new\n\n[0:28] [THEM] new\n\n[0:33] [THEM] Thank you.";
    const q6 = extractLastQuestion(tx6);
    check(
      "8.6 Whisper repetition loop noise is ignored so real interviewer question survives",
      Boolean(q6 && /first 90 days/i.test(q6)),
      q6
    );
  }

  const elapsed = (performance.now() - start).toFixed(1);
  console.log(`Part A completed in ${elapsed}ms (${passed} checks passed so far).`);
}

// ============================================================================
// PART B: LIVE MULTI-TURN LLM STRESS SUITE (Real Groq Calls)
// ============================================================================
async function callGroq(
  systemPrompt: string,
  history: ConversationTurn[],
  userContent: string,
  temperature: number
): Promise<{ text: string; model: string; latencyMs: number }> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error("GROQ_API_KEY missing");

  const models = ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b"];
  let lastErr = "unknown";

  for (let attempt = 0; attempt < 2; attempt++) {
    let sawRateLimit = false;
    for (const model of models) {
      const t0 = performance.now();
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${groqKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              ...history,
              { role: "user", content: userContent },
            ],
            temperature,
            max_tokens: 900,
            stream: false,
          }),
          signal: AbortSignal.timeout(18000),
        });

        if (res.ok) {
          const data: any = await res.json();
          const text = (data?.choices?.[0]?.message?.content || "").trim();
          if (text) {
            return { text, model, latencyMs: Math.round(performance.now() - t0) };
          }
        } else {
          const errData: any = await res.json().catch(() => ({}));
          lastErr = errData?.error?.message || `HTTP ${res.status}`;
          if (res.status === 429) sawRateLimit = true;
        }
      } catch (e: any) {
        lastErr = e?.message || "request failed";
      }
    }
    if (sawRateLimit && attempt === 0) {
      await new Promise((r) => setTimeout(r, 7000));
    } else {
      break;
    }
  }
  throw new Error(`All Groq models failed: ${lastErr}`);
}

async function runLiveMultiTurnStressSuite() {
  console.log("\n=== PART B: LIVE Multi-Turn LLM Context Stress Tests (Real Groq) ===");

  // --------------------------------------------------------------------------
  // Live Scenario 1: Same "Suggest Answer" clicked TWICE on identical transcript
  // --------------------------------------------------------------------------
  {
    const tx =
      "[0:12] Interviewer: We are seeing P99 latency spikes on our checkout API during flash sales. How would you diagnose and fix it?";
    const prompt = "Give me a smart real-time answer suggestion for the current meeting point.";

    const ctx1 = buildEnhancedInterviewPrompt(prompt, tx, { history: [], previousTranscriptLength: 0 });
    const r1 = await callGroq(ctx1.systemPrompt, [], ctx1.userMessageContent, ctx1.recommendedTemperature);

    const hist: ConversationTurn[] = [
      { role: "user", content: prompt },
      { role: "assistant", content: r1.text },
    ];

    const ctx2 = buildEnhancedInterviewPrompt(prompt, tx, {
      history: hist,
      previousTranscriptLength: tx.length,
      previousTranscriptTail: tx.slice(-120),
    });
    const r2 = await callGroq(ctx2.systemPrompt, hist, ctx2.userMessageContent, ctx2.recommendedTemperature);

    const sim = jaccard(r1.text, r2.text);
    const sameOpening = firstLine(r1.text).toLowerCase() === firstLine(r2.text).toLowerCase();
    console.log(
      `  [Live 1] Repeat Suggest Answer | model=${r2.model} | sim=${sim.toFixed(2)} | T1=${r1.latencyMs}ms T2=${r2.latencyMs}ms`
    );
    console.log(`    T1 lead: ${firstLine(r1.text).slice(0, 110)}`);
    console.log(`    T2 lead: ${firstLine(r2.text).slice(0, 110)}`);

    check("Live 1.1 Turn 1 non-empty & relevant", r1.text.length > 60);
    check("Live 1.2 Turn 2 non-empty & distinct opening line", r2.text.length > 60 && !sameOpening, {
      t1: firstLine(r1.text).slice(0, 80),
      t2: firstLine(r2.text).slice(0, 80),
    });
    check("Live 1.3 Turn 2 genuinely different from Turn 1 (Jaccard < 0.55)", sim < 0.55, sim.toFixed(3));
    check("Live 1.4 No leaked <think> tags", !/<think>/i.test(r1.text) && !/<think>/i.test(r2.text));
  }

  // --------------------------------------------------------------------------
  // Live Scenario 2: Live transcript shifts from Checkout Latency -> Coding Task
  // --------------------------------------------------------------------------
  {
    const tx1 =
      "[0:12] Interviewer: How would you diagnose P99 latency spikes on our checkout API during flash sales?";
    const tx2 =
      tx1 +
      "\n\n[1:20] Interviewer: Great explanation. Now let's do a quick live coding task: implement a TypeScript debounce function that delays invoking a callback until after wait milliseconds have elapsed.";
    const prompt = "What should I say?";

    const ctx1 = buildEnhancedInterviewPrompt(prompt, tx1, { history: [], previousTranscriptLength: 0 });
    const r1 = await callGroq(ctx1.systemPrompt, [], ctx1.userMessageContent, ctx1.recommendedTemperature);

    const hist: ConversationTurn[] = [
      { role: "user", content: prompt },
      { role: "assistant", content: r1.text },
    ];

    const ctx2 = buildEnhancedInterviewPrompt(prompt, tx2, {
      history: hist,
      previousTranscriptLength: tx1.length,
      previousTranscriptTail: tx1.slice(-120),
    });
    const r2 = await callGroq(ctx2.systemPrompt, hist, ctx2.userMessageContent, ctx2.recommendedTemperature);

    console.log(`  [Live 2] Transcript Pivot -> Live Coding | mode=${ctx2.responseMode} | T2=${r2.latencyMs}ms`);
    console.log(`    T2 lead: ${firstLine(r2.text).slice(0, 110)}`);

    check("Live 2.1 Turn 2 pivots to debounce coding solution", /debounce/i.test(r2.text));
    check("Live 2.2 Turn 2 includes fenced code block", /```/.test(r2.text), r2.text.slice(0, 160));
    check(
      "Live 2.3 Turn 2 does NOT repeat old checkout flash sale latency topic",
      !/flash sale|checkout api/i.test(r2.text)
    );
  }

  // --------------------------------------------------------------------------
  // Live Scenario 3: Multi-Turn Code Understanding -> Fix -> New Explanation
  //                  (with noisy unrelated HR transcript in background!)
  // --------------------------------------------------------------------------
  {
    const noisyHrTx =
      "[0:05] HR Recruiter: Welcome! Our benefits package includes 25 days PTO, dental coverage, 401k matching up to 6%, and commuter stipends. We also host quarterly offsites in Austin.";
    const q1 =
      "What does this JS code print and why?\n```js\nfor (var i = 0; i < 3; i++) {\n  setTimeout(() => console.log(i), 50);\n}\n```";
    const q2 = "Fix it in TypeScript and show an alternative using closure or let";
    const q3 = "Explain that bug in 2 super simple sentences for a complete beginner, no jargon";

    const hist: ConversationTurn[] = [];

    const c1 = buildEnhancedInterviewPrompt(q1, noisyHrTx, { history: hist });
    const a1 = await callGroq(c1.systemPrompt, hist, c1.userMessageContent, c1.recommendedTemperature);
    hist.push({ role: "user", content: q1 }, { role: "assistant", content: a1.text });

    const c2 = buildEnhancedInterviewPrompt(q2, noisyHrTx, { history: hist });
    const a2 = await callGroq(c2.systemPrompt, hist, c2.userMessageContent, c2.recommendedTemperature);
    hist.push({ role: "user", content: q2 }, { role: "assistant", content: a2.text });

    const c3 = buildEnhancedInterviewPrompt(q3, noisyHrTx, { history: hist });
    const a3 = await callGroq(c3.systemPrompt, hist, c3.userMessageContent, c3.recommendedTemperature);

    console.log(
      `  [Live 3] 3-Turn Code Chain (w/ HR noise) | sim(1,2)=${jaccard(a1.text, a2.text).toFixed(2)} | sim(1,3)=${jaccard(a1.text, a3.text).toFixed(2)}`
    );

    check("Live 3.1 Turn 1 correctly identifies 3 / var scoping", /\b3\b/.test(a1.text) && /\bvar\b/i.test(a1.text));
    check("Live 3.2 Turn 1 NOT hijacked by HR/PTO/401k transcript", !/\b(pto|401k|dental|austin)\b/i.test(a1.text));
    check("Live 3.3 Turn 2 includes TypeScript code fix with let", /```/.test(a2.text) && /\blet\b/.test(a2.text));
    check("Live 3.4 Turn 2 distinct from Turn 1", jaccard(a1.text, a2.text) < 0.65, jaccard(a1.text, a2.text).toFixed(3));
    check("Live 3.5 Turn 3 beginner explanation distinct from Turn 1", jaccard(a1.text, a3.text) < 0.55, jaccard(a1.text, a3.text).toFixed(3));
  }

  // --------------------------------------------------------------------------
  // Live Scenario 4: Exact Same Typed Question Asked Twice
  // --------------------------------------------------------------------------
  {
    const q = "How does React useEffect cleanup work?";
    const c1 = buildEnhancedInterviewPrompt(q, "", { history: [] });
    const a1 = await callGroq(c1.systemPrompt, [], c1.userMessageContent, c1.recommendedTemperature);

    const hist: ConversationTurn[] = [
      { role: "user", content: q },
      { role: "assistant", content: a1.text },
    ];
    const c2 = buildEnhancedInterviewPrompt(q, "", { history: hist });
    const a2 = await callGroq(c2.systemPrompt, hist, c2.userMessageContent, c2.recommendedTemperature);

    const sim = jaccard(a1.text, a2.text);
    const sameLead = firstLine(a1.text).toLowerCase() === firstLine(a2.text).toLowerCase();
    console.log(`  [Live 4] Exact Same Typed Q Twice | sim=${sim.toFixed(2)} | sameLead=${sameLead}`);
    console.log(`    T1 lead: ${firstLine(a1.text).slice(0, 110)}`);
    console.log(`    T2 lead: ${firstLine(a2.text).slice(0, 110)}`);

    check("Live 4.1 Turn 2 different opening than Turn 1", !sameLead);
    check("Live 4.2 Turn 2 meaningfully distinct (Jaccard < 0.58)", sim < 0.58, sim.toFixed(3));
  }

  // --------------------------------------------------------------------------
  // Live Scenario 5: Back-to-Back Completely Unrelated Questions (Zero Bleed)
  // --------------------------------------------------------------------------
  {
    const q1 = "Explain event bubbling in the browser DOM briefly.";
    const q2 = "Explain SQL LEFT JOIN vs INNER JOIN with a quick query example.";

    const c1 = buildEnhancedInterviewPrompt(q1, "", { history: [] });
    const a1 = await callGroq(c1.systemPrompt, [], c1.userMessageContent, c1.recommendedTemperature);

    const hist: ConversationTurn[] = [
      { role: "user", content: q1 },
      { role: "assistant", content: a1.text },
    ];
    const c2 = buildEnhancedInterviewPrompt(q2, "", { history: hist });
    const a2 = await callGroq(c2.systemPrompt, hist, c2.userMessageContent, c2.recommendedTemperature);

    console.log(`  [Live 5] Distinct Q1 (DOM) -> Q2 (SQL) | sim=${jaccard(a1.text, a2.text).toFixed(2)}`);

    check("Live 5.1 Turn 1 covers DOM bubbling", /bubbl|dom|parent|event/i.test(a1.text));
    check("Live 5.2 Turn 2 covers SQL LEFT JOIN & INNER JOIN with code", /left join/i.test(a2.text) && /inner join/i.test(a2.text) && /```/.test(a2.text));
    check("Live 5.3 Zero DOM bubbling bleed into Turn 2 SQL answer", !/bubbl|event listener/i.test(a2.text));
  }

  // --------------------------------------------------------------------------
  // Live Scenario 6: 6-Turn Mixed-Mode Marathon (Live Meeting -> Repeat ->
  //                  Transcript Advance -> Code Debug -> Code Follow-up -> Non-Tech Pivot)
  // --------------------------------------------------------------------------
  {
    const hist: ConversationTurn[] = [];
    let tx = "[0:10] Hiring Manager: Tell me about a difficult cross-team conflict you resolved.";
    let prevLen = 0;
    let prevTail = "";

    const runTurn = async (prompt: string, nextTx = tx) => {
      tx = nextTx;
      const ctx = buildEnhancedInterviewPrompt(prompt, tx, {
        history: hist,
        previousTranscriptLength: prevLen,
        previousTranscriptTail: prevTail,
      });
      const res = await callGroq(ctx.systemPrompt, hist, ctx.userMessageContent, ctx.recommendedTemperature);
      hist.push({ role: "user", content: prompt }, { role: "assistant", content: res.text });
      prevLen = tx.trim().length;
      prevTail = tx.trim().slice(-120);
      return { ctx, res };
    };

    // T1: Live meeting behavioral question
    const m1 = await runTurn("Suggest answer");
    // T2: Repeat Suggest Answer with NO new transcript -> must be distinct & first-person (no meta-coaching)
    const m2 = await runTurn("Suggest answer");
    // T3: Transcript advances to a brand-new pricing/timeline question -> must pivot
    const m3 = await runTurn(
      "Suggest answer",
      tx + "\n\n[1:10] Hiring Manager: How do you prioritize features when engineering capacity is cut in half?"
    );
    // T4: User suddenly pastes buggy Python code -> must switch to code_technical & ignore meeting
    const m4 = await runTurn(
      "Why does this Python function mutate across calls?\n```python\ndef add_item(item, bucket=[]):\n    bucket.append(item)\n    return bucket\n```"
    );
    // T5: Follow-up on code -> must stay code-aware & show the None default fix
    const m5 = await runTurn("Fix it cleanly and add type hints");
    // T6: Sudden pivot to a completely unrelated non-tech question -> zero code bleed & zero meeting hijack
    const m6 = await runTurn("What are 3 concise questions I should ask a VP of Product at the end of an interview?");

    const sim12 = jaccard(m1.res.text, m2.res.text);
    const sim23 = jaccard(m2.res.text, m3.res.text);
    console.log(
      `  [Live 6] 6-Turn Marathon | modes=[${[m1, m2, m3, m4, m5, m6].map((m) => m.ctx.responseMode).join(" -> ")}] | sim(1,2)=${sim12.toFixed(2)} sim(2,3)=${sim23.toFixed(2)}`
    );

    check("Live 6.1 T1 spoken_teleprompter", m1.ctx.responseMode === "spoken_teleprompter");
    check("Live 6.2 T2 fresh_alternative & distinct (sim < 0.55)", m2.ctx.responseMode === "fresh_alternative" && sim12 < 0.55, sim12.toFixed(3));
    check(
      "Live 6.3 T2 avoids robotic meta-coaching ('Frame your...' / 'You should say...')",
      !/^\**(frame |tell them|you should say|here is another)/i.test(firstLine(m2.res.text)),
      firstLine(m2.res.text).slice(0, 90)
    );
    check(
      "Live 6.4 T3 pivots cleanly to new capacity/prioritization question",
      /priorit|capacit|scope|impact|trade[- ]?off/i.test(m3.res.text) && sim23 < 0.5
    );
    check(
      "Live 6.5 T4 switches to code_technical & explains Python mutable default argument",
      m4.ctx.responseMode === "code_technical" && /mutable|default|evaluated once|shared/i.test(m4.res.text)
    );
    check(
      "Live 6.6 T5 fixes with None default and type hints in code block",
      /None/.test(m5.res.text) && /```/.test(m5.res.text)
    );
    check(
      "Live 6.7 T6 exits code mode cleanly with zero Python bucket bleed",
      m6.ctx.responseMode !== "code_technical" && !/bucket|mutable default/i.test(m6.res.text)
    );
  }
}

async function main() {
  const unitOnly = process.argv.includes("--unit-only");
  const forceLive = process.argv.includes("--live");

  runDeterministicSuite();

  if (!unitOnly && (forceLive || process.env.GROQ_API_KEY)) {
    await runLiveMultiTurnStressSuite();
  } else {
    console.log("\n(Skipped Part B live LLM tests — pass --live with GROQ_API_KEY set to run)");
  }

  console.log(`\n========================================`);
  console.log(`TOTAL PASSED: ${passed}`);
  console.log(`TOTAL FAILED: ${failures.length}`);
  console.log(`========================================`);

  if (failures.length > 0) {
    console.error("\nFailures:\n" + failures.join("\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Stress test crashed:", err);
  process.exit(1);
});
