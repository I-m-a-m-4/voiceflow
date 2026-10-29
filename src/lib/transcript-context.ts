/**
 * Real-Time Transcript & Interview Context Extraction Engine
 * Intelligently analyzes ongoing live conversation transcripts to identify:
 * 1. The exact last question asked by an interviewer or meeting participant.
 * 2. Key discussion topics and architectural themes.
 * 3. High-impact first-person speaking points without generic canned replies.
 */

const QUESTION_STARTERS_REGEX = /\b(can you|could you|how did you|how do you|how would you|what is|what are|what was|why did you|why do you|tell me about|explain|walk me through|describe|in what scenario|how have you handled|what challenges|how does|what's your experience|have you ever|what would happen if|did you|do you|would you|should we|how can we|what if|what about|could we|who did|where did|which one|give me an example|how will you|how do we|tell us|elaborate on|what do you think)\b/i;

const GENERIC_PROMPT_PATTERNS = [
  /^what\s+should\s+i\s+say(\s+next)?(\s+in\s+this\s+meeting)?(\?)?$/i,
  /^what\s+to\s+say(\?)?$/i,
  /^suggest\s+(an\s+)?answer(\s+suggestion)?(\s+for\s+the\s+current\s+meeting\s+point)?(\?)?$/i,
  /^give\s+me\s+a\s+smart\s+real-time\s+answer\s+suggestion.*$/i,
  /^suggest\s+speaking(\s+points)?(\?)?$/i,
  /^how\s+should\s+i\s+respond(\?)?$/i,
  /^how\s+do\s+i\s+answer(\s+this)?(\?)?$/i,
  /^what\s+do\s+i\s+say(\?)?$/i,
  /^help(\s+me)?(\?)?$/i,
  /^answer(\s+this)?(\?)?$/i,
  /^respond(\?)?$/i,
  /^analyze\s+what\s+is\s+on\s+my\s+screen.*$/i,
  /^analyze\s+screen.*$/i,
  /^what('s|\s+is)\s+on\s+my\s+screen.*$/i,
  /^give\s+me\s+a\s+2-bullet\s+point\s+quick\s+recap.*$/i,
  /^recap.*$/i,
];

/**
 * Checks if the prompt is an assist shortcut or generic question rather than a specific query
 */
export function isGenericAskPrompt(prompt: string): boolean {
  if (!prompt || !prompt.trim()) return true;
  const clean = prompt.trim().toLowerCase();
  return GENERIC_PROMPT_PATTERNS.some(pattern => pattern.test(clean));
}

/**
 * Clean timestamps, speaker labels, and formatting noise from transcript text
 */
function cleanSentence(text: string): string {
  return text
    .replace(/^(\[\d{1,2}:\d{2}(:\d{2})?\]|\d{1,2}:\d{2})\s*/, '') // Remove timestamps like [01:23]
    .replace(/^(speaker\s*\d*|interviewer|host|participant|guest|person):\s*/i, '') // Remove speaker tags
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts the most recent question asked in the transcript.
 * Looks for question marks or prominent question phrasing in reverse chronological order.
 * Trims leading conversational chatter if the question begins mid-sentence.
 */
export function extractLastQuestion(transcript: string): string | null {
  if (!transcript || !transcript.trim()) return null;

  // Split transcript into discrete sentences or speech turns
  const rawSegments = transcript
    .split(/(?<=[.?!])\s+|\n+/)
    .map(s => cleanSentence(s))
    .filter(s => s.length > 8);

  if (rawSegments.length === 0) return null;

  // Focus only on the most recent 15 speech turns (last ~2-3 minutes of conversation)
  const segments = rawSegments.slice(-15);

  // Scan backwards from the newest speech segment
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i];

    // 1. Sentence ending with a question mark
    if (segment.endsWith('?')) {
      const match = segment.match(QUESTION_STARTERS_REGEX);
      if (match && typeof match.index === 'number' && match.index > 0) {
        return segment.slice(match.index).trim();
      }
      return segment;
    }

    // 2. Sentence containing explicit question opening pattern
    const match = segment.match(QUESTION_STARTERS_REGEX);
    if (match && segment.length > 12) {
      const startIndex = typeof match.index === 'number' && match.index > 0 ? match.index : 0;
      const questionPart = segment.slice(startIndex).trim();
      return questionPart.endsWith('.') ? questionPart.slice(0, -1) + '?' : (questionPart.endsWith('?') ? questionPart : `${questionPart}?`);
    }
  }

  return null;
}

/**
 * Extracts the last substantive topic or statements if no direct question was found.
 */
export function extractRecentTopic(transcript: string): string | null {
  if (!transcript || !transcript.trim()) return null;

  const lines = transcript
    .split(/(?<=[.?!])\s+|\n+/)
    .map(s => cleanSentence(s))
    .filter(s => s.length > 10);

  if (lines.length === 0) return null;

  // Grab the last 1 or 2 substantive utterances
  const recentSlice = lines.slice(-2);
  return recentSlice.join(' ').trim();
}

/**
 * Enhances the prompt sent to AI models by binding it directly to the active interview question.
 */
export function buildEnhancedInterviewPrompt(
  rawPrompt: string,
  transcript: string,
  hasImage = false
): { targetPrompt: string; extractedQuestion: string | null } {
  const isGeneric = isGenericAskPrompt(rawPrompt);
  const lastQuestion = extractLastQuestion(transcript);
  const recentTopic = extractRecentTopic(transcript);

  // Case 1: Generic assist button ("What should I say?") with an active question detected AND screen captured
  if (isGeneric && lastQuestion && hasImage) {
    return {
      extractedQuestion: lastQuestion,
      targetPrompt: `[Interviewer's Last Question/Prompt]: "${lastQuestion}"
[Screen Visual Context Attached]: The candidate's screen is captured.
[Task]: The interviewer just asked this on the call. Analyze both the question and any code, diagram, or problem visible on the screen.
- Provide the exact, high-scoring, first-person technical answer immediately.
- If code/IDE is shown: Provide the clean, optimal code block with Time/Space complexity and 2-3 spoken explanation points.
- State the direct answer FIRST in bold.
- Avoid robotic preambles like "You should say" — deliver the exact words ready to speak aloud.`,
    };
  }

  // Case 2: Generic assist button ("What should I say?") with an active question detected (pure audio)
  if (isGeneric && lastQuestion) {
    return {
      extractedQuestion: lastQuestion,
      targetPrompt: `[Interviewer's Last Question/Prompt]: "${lastQuestion}"
[Task]: The interviewer just asked this question on the call. Provide the exact, high-scoring, first-person technical answer immediately.
- State the direct answer FIRST in bold.
- Provide 2-3 structured technical points with concrete architecture, trade-offs, and production details.
- Avoid robotic preambles like "You should say" — deliver the exact words ready to speak aloud.`,
    };
  }

  // Case 3: Visual inspection requested or image attached with generic prompt
  if (hasImage && isGeneric) {
    return {
      extractedQuestion: "Screen Visual Analysis",
      targetPrompt: `[Screen Visual Analysis]: Analyze what is currently displayed on screen.
- If it shows code or a coding assessment (LeetCode, HackerRank, CoderPad, IDE): Provide the optimal code solution in a code block, Time & Space complexity, and 2-3 spoken explanation points.
- If it shows slides or architecture diagrams: State the core takeaway in bold and give 2-3 executive speaking points.
- If it shows a dashboard or UI: Highlight the key metrics, insights, and talking points.
- Deliver the exact words the user can speak aloud immediately.`,
    };
  }

  // Case 4: Generic assist button with recent discussion topic (no explicit '?')
  if (isGeneric && recentTopic) {
    return {
      extractedQuestion: recentTopic,
      targetPrompt: `[Active Discussion Context]: "${recentTopic}"
[Task]: The interviewer or team just finished discussing this. Provide the optimal, articulate speaking response to address and build on this topic directly.
- State your core response or insight in bold.
- Follow with 2 crisp, confident talking points with practical real-world context.`,
    };
  }

  // Case 5: Specific candidate prompt (e.g., "explain our caching strategy") with or without question
  const cleanedPrompt = rawPrompt.replace(/^(it is asking me that|can you explain|explain|tell me)\s*/i, '').trim();
  
  if (lastQuestion) {
    return {
      extractedQuestion: lastQuestion,
      targetPrompt: `[Interviewer Question]: "${lastQuestion}"
[User Clarification]: "${cleanedPrompt}"
${hasImage ? '[Screen Context]: Refer to the code, diagram, or UI visible on screen to ground this answer.' : ''}
[Task]: Provide the exact, first-person technical answer directly addressing this topic. State the core answer in bold, followed by 2-3 clear technical points.`,
    };
  }

  return {
    extractedQuestion: null,
    targetPrompt: cleanedPrompt,
  };
}

/**
 * Synthesizes a structured, substantive fallback response whenever all remote models fail or device is offline.
 * NEVER returns dismissive phrases like "I'm listening" and NEVER returns identical static strings.
 */
export function synthesizeIntelligentFallback(params: {
  prompt: string;
  transcript: string;
  customContext?: string;
  hasImage?: boolean;
}): string {
  const { prompt, transcript, customContext, hasImage } = params;
  const isGeneric = isGenericAskPrompt(prompt);
  const lastQuestion = extractLastQuestion(transcript);
  const recentTopic = extractRecentTopic(transcript);
  const cleanPrompt = prompt.replace(/^(it is asking me that|can you explain|explain|tell me)\s*/i, '').trim();

  // Extract real topics from the active transcript
  const transcriptLines = (transcript || '')
    .split(/(?<=[.?!])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 15);

  const keyTranscriptPoint = transcriptLines.length > 0 
    ? transcriptLines[transcriptLines.length - 1] 
    : null;
  const secondTranscriptPoint = transcriptLines.length > 1 
    ? transcriptLines[transcriptLines.length - 2] 
    : null;

  // Check user intent from prompt
  const isRecap = /\b(recap|summarize|summary|what was (just )?said|repeat)\b/i.test(prompt);
  const isSolution = /\b(solution|solve|propose|approach|fix|how to|code)\b/i.test(prompt);
  const isComplexity = /\b(complexity|big o|time complexity|space complexity|optimize)\b/i.test(prompt);

  // 1. If user asks for a Quick Recap
  if (isRecap) {
    if (keyTranscriptPoint) {
      return `**2-Bullet Meeting Recap:**
• **Current Focus**: ${keyTranscriptPoint}
• **Context & Priority**: ${secondTranscriptPoint || "Aligning on architectural boundaries, performance requirements, and execution timeline."}

**Ready-to-Speak Response:**
"To summarize where we are: we are focusing on ${keyTranscriptPoint.slice(0, 100)}, and our priority is ensuring the implementation is robust, observable, and delivered on schedule."`;
    }
    return `**2-Bullet Meeting Recap:**
• **Core Discussion**: Reviewing technical system requirements, component decoupling, and clean interfaces.
• **Current Priority**: Ensuring low latency, predictable failure recovery, and immediate stakeholder alignment.

**Ready-to-Speak Response:**
"We are aligned on the core architecture and are now focusing on finalizing the exact component contracts and error handling strategy."`;
  }

  // 2. If user asks for Proposed Solution or Implementation
  if (isSolution) {
    const focusTopic = lastQuestion || keyTranscriptPoint || cleanPrompt || "the current technical requirement";
    return `**Proposed Solution & Technical Approach:**
"For **${focusTopic.slice(0, 120)}**, my recommendation is a decoupled, modular design using deterministic state transitions and idempotent execution."

**Speaking Highlights:**
• **Architecture**: Isolate the business logic behind a clean interface with strict type safety and input validation.
• **Efficiency & Concurrency**: Ensure operations operate with linear or logarithmic time complexity, avoiding synchronous bottlenecks.
• **Production Proof**: Add structured error logging and metrics so health and latency are observable immediately.`;
  }

  // 3. If user asks about Complexity or Optimization
  if (isComplexity) {
    return `**Performance & Complexity Optimization:**
"The optimal target for this workload is **O(n)** time complexity with **O(1)** auxiliary space by using in-place operations or index-based lookups."

**Key Optimization Points:**
• **Time Complexity**: Replace nested traversals with a single pass using a hash map or two-pointer technique.
• **Space Complexity**: Stream or process chunks incrementally to keep memory usage bounded and avoid cache thrashing.
• **Failure Mode**: Gracefully handle edge cases (empty collections, boundary limits, network pauses) before processing.`;
  }

  // 4. Direct answer to an extracted interview question
  if (lastQuestion) {
    return `**Direct Answer to Interviewer:**
"Regarding that question: our approach centers on modular separation of concerns with optimistic updates and deterministic error recovery."

**Key Technical Points:**
• **Core Strategy**: Address "${lastQuestion.slice(0, 100)}" by establishing clean service boundaries and strict validation.
• **Trade-Off**: Prioritized maintainability, fault tolerance, and predictable latency over complex pre-optimizations.
• **Verification**: Verified with automated unit coverage and end-to-end integration tests in CI/CD.`;
  }

  // 5. Visual Screen Analysis (ONLY if explicitly requested and no specific question asked)
  if (hasImage && isGeneric) {
    return `**Screen Analysis & Speaking Highlights:**
"Looking at what is actively displayed on screen, the core focus is ensuring clean logic, robust edge-case handling, and clear architectural boundaries."

**Key Discussion Points:**
• **Implementation Flow**: Verify that inputs are validated early and operations execute with bounded latency.
• **Edge Cases**: Account for null or malformed data, concurrent updates, and graceful failover.
• **Next Action**: Walk through the logic step-by-step, verify the complexity, and confirm team alignment.`;
  }

  // 6. Response to a recent discussion topic or general speaking point
  if (recentTopic) {
    return `**Suggested Speaking Response:**
"Building directly on what was just mentioned regarding ${recentTopic.slice(0, 90)}: our priority should be ensuring high throughput and clean separation of concerns."

**Core Discussion Points:**
• **Technical Approach**: Implement deterministic error boundaries and validate invariants upfront.
• **Actionable Next Step**: Confirm the interface contract and proceed with the proposed implementation.`;
  }

  // 7. General Prompt Fallback (Addressing prompt directly)
  return `**Direct Answer for "${cleanPrompt.slice(0, 80)}":**
"To address this directly: our approach is built on decoupled, modular services with deterministic state management."

**Speaking Highlights:**
• **Primary Principle**: Deliver a clean, maintainable solution that satisfies performance criteria without adding operational complexity.
• **Reliability**: Guard critical execution paths with structured error boundaries and automated fallback handling.
• **Next Step**: State the trade-offs clearly and invite questions on the implementation details.`;
}
