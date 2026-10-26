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
 * NEVER returns dismissive phrases like "I'm listening".
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

  // Extract core domain keywords from transcript or prompt
  const combinedText = `${prompt} ${transcript} ${customContext || ''}`.toLowerCase();

  let domainFocus = "Engineering & Systems Architecture";
  let techDetails = "Optimistic concurrency, modular microservices, resilient data caching, and automated failover";

  if (combinedText.includes('pos') || combinedText.includes('inventory') || combinedText.includes('zeneva') || combinedText.includes('stock')) {
    domainFocus = "Enterprise POS & Real-Time Inventory (Zeneva)";
    techDetails = "Multi-device vector clocks, offline-first SQLite synchronization, idempotent delta mutations, and optimistic locking to prevent stock collision";
  } else if (combinedText.includes('database') || combinedText.includes('sql') || combinedText.includes('postgres') || combinedText.includes('mongo')) {
    domainFocus = "Database Architecture & Query Optimization";
    techDetails = "B-tree and composite indexing, read-replicas, connection pooling, and idempotent transaction boundaries";
  } else if (combinedText.includes('auth') || combinedText.includes('security') || combinedText.includes('token') || combinedText.includes('jwt')) {
    domainFocus = "Authentication, Security & Session Hardening";
    techDetails = "Signed cryptographic tokens, stateless verification, rate-limiting, and short-lived refresh token rotation";
  } else if (combinedText.includes('cache') || combinedText.includes('redis') || combinedText.includes('latency')) {
    domainFocus = "High-Throughput Caching & Low Latency";
    techDetails = "Redis distributed cache, cache-aside pattern with TTL eviction, and stale-while-revalidate invalidation";
  }

  // 1. Direct answer to an extracted interview question
  if (lastQuestion) {
    if (hasImage) {
      return `**Direct Solution & Speaking Points:**
"To address that directly, our implementation leverages ${techDetails}. Based on the active screen assessment, here is the clean, production-grade approach:"

\`\`\`typescript
// Optimal approach with deterministic state and error boundaries
export async function handleOperation(input: Record<string, any>) {
  // Validate input invariants early
  if (!input) throw new Error("Invalid payload");
  
  // Apply idempotent execution with optimistic locking
  return { success: true, timestamp: Date.now() };
}
\`\`\`

**Key Points to Deliver:**
• **Complexity**: Operates in **O(n)** time and **O(1)** auxiliary space.
• **Resilience**: Accounts for edge conditions (network timeouts, duplicate events) deterministically.
• **Trade-Off**: Chose predictability and thread-safety over naive state mutation.`;
    }

    return `**Direct Answer to Interviewer:**
"To address that directly, our approach centers on ${techDetails}. In production, this guarantees low latency, complete data consistency, and seamless scalability without single points of failure."

**Key Technical Points:**
• **Core Architecture**: Engineered with decoupled, modular layers so each subsystem operates independently under high load.
• **Trade-Offs & Decisions**: Prioritized consistency and fault tolerance over naive synchronization, ensuring deterministic state even during network interruptions.
• **Production Proof**: Validated under real-world traffic with automated telemetry, zero-downtime deployment, and comprehensive monitoring.`;
  }

  // 2. Image / Screen analysis fallback (when screen is captured but no specific question in audio)
  if (hasImage) {
    return `**Visual Screen Analysis & Speaking Points:**
"Reviewing the active screen: the focus is on optimizing implementation efficiency, clean error boundaries, and predictable state."

**Speaking Highlights:**
• **Logic & Algorithm**: Ensure time complexity is minimized with linear or logarithmic lookup structures.
• **Robustness**: Account for edge cases (null inputs, concurrent updates, network drops) gracefully.
• **Next Step**: State the proposed solution clearly, explain the trade-offs, and invite review.`;
  }

  // 3. Response to a recent discussion topic
  if (recentTopic) {
    return `**Suggested Speaking Response:**
"Building directly on what was just raised, the key priority here is ensuring our architecture remains both resilient and scalable under production workloads."

**Core Discussion Points:**
• **Technical Approach**: Implement ${techDetails} to maintain high throughput and clean separation of concerns.
• **Actionable Next Step**: Align on the immediate milestone, verify API boundaries, and establish observable health metrics.`;
  }

  // 4. Initial call / zero-transcript starter
  if (isGeneric) {
    return `**Suggested Opening & Positioning:**
"Thanks everyone for joining today! I'm excited to dive into the technical details and walk you through the systems and architecture we've built."

**High-Impact Opening Points:**
• **Context**: "I can walk you through the end-to-end technical architecture, our scalability decisions, or a specific deep dive into our core modules."
• **Alignment**: "Before we jump into the details, is there a specific area or priority you'd like to focus on first?"`;
  }

  // 5. Specific candidate query fallback
  const cleanPrompt = prompt.replace(/^(it is asking me that|can you explain|explain|tell me)\s*/i, '').trim();
  return `**Direct Answer:**
"Regarding **${cleanPrompt}**: In our systems, this is solved by leveraging ${techDetails}."

**Key Points to Deliver:**
• **Technical Foundation**: State the fundamental technical reasoning and architecture choices upfront.
• **Practical Trade-Offs**: Discuss performance, maintainability, and operational simplicity in production environments.
• **Real-World Evidence**: Ground your response in concrete systems and lessons learned from past deployments.`;
}
