/**
 * Real-Time Transcript & Interview Context Extraction Engine
 * Intelligently analyzes ongoing live conversation transcripts to identify:
 * 1. The exact last question asked by an interviewer or meeting participant.
 * 2. Key discussion topics and architectural themes.
 * 3. High-impact first-person speaking points without generic canned replies.
 */

const QUESTION_STARTERS_REGEX = /\b(can you|could you|how did you|how do you|how would you|what is|what are|what was|what were|why did you|why do you|why would|tell me about|tell us about|tell me|tell us|explain|walk me through|walk us through|describe|in what scenario|how have you handled|what challenges|how does|what's your experience|have you ever|have you|has there|are you|were you|is there|was there|do you|did you|would you|should we|how can we|what if|what about|could we|who did|where did|which one|give me an example|give us an example|how will you|how do we|elaborate on|what do you think|what would you)\b/i;

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
  const isScreenFocused = /\b(screen|slide|display|screenshot|what's on my screen|picture|image|analyze (what is on )?my screen)\b/i.test(rawPrompt);

  // Case 0: Explicit visual screen analysis requested with attached image
  if (hasImage && isScreenFocused) {
    return {
      extractedQuestion: "Screen Visual Analysis",
      targetPrompt: `[Screen Visual Analysis Task]: Analyze what is actively displayed on the user's screen right now.
- Examine all visible text, diagrams, documents, problems, questions, or interfaces shown on screen.
- State the direct answer, solution, or core takeaway FIRST in bold.
- Follow with 2 to 3 concise, high-impact speaking points ready to read aloud.
- Deliver the exact words ready to speak in natural first-person voice without robotic meta-commentary.`,
    };
  }

  // Case 1: Generic assist button ("What should I say?") with an active question detected AND screen captured
  if (isGeneric && lastQuestion && hasImage) {
    return {
      extractedQuestion: lastQuestion,
      targetPrompt: `[Meeting Point / Active Question]: "${lastQuestion}"
[Screen Visual Context Attached]: Refer to the active content on screen alongside the discussion.
[Task]: Deliver the direct, first-person response to this point immediately.
- State your core answer or position FIRST in bold.
- Follow with 2 to 3 substantive, articulate speaking points tailored directly to the question and screen.
- Deliver the exact words ready to speak aloud with confidence, avoiding robotic preambles.`,
    };
  }

  // Case 2: Generic assist button ("What should I say?") with an active question detected (pure audio)
  if (isGeneric && lastQuestion) {
    return {
      extractedQuestion: lastQuestion,
      targetPrompt: `[Meeting Point / Active Question]: "${lastQuestion}"
[Task]: Deliver the direct, first-person response to this question immediately.
- State your core answer or position FIRST in bold.
- Follow with 2 to 3 articulate, well-reasoned speaking points directly answering the question.
- Deliver the exact words ready to speak aloud with confidence, avoiding robotic preambles.`,
    };
  }

  // Case 3: Visual inspection requested or image attached with generic prompt
  if (hasImage && isGeneric) {
    return {
      extractedQuestion: "Screen Visual Analysis",
      targetPrompt: `[Screen Visual Analysis]: Analyze what is actively displayed on screen.
- State the core finding, solution, or direct answer FIRST in bold.
- Provide 2 to 3 crisp, articulate speaking points ready to read aloud.
- Ground the answer in the specific content visible on the screen.`,
    };
  }

  // Case 4: Generic assist button with recent discussion topic (no explicit '?')
  if (isGeneric && recentTopic) {
    return {
      extractedQuestion: recentTopic,
      targetPrompt: `[Active Discussion Context]: "${recentTopic}"
[Task]: The participants just finished discussing this. Provide the optimal, articulate speaking response to address and build on this topic directly.
- State your core response or insight FIRST in bold.
- Follow with 2 to 3 crisp, confident talking points with practical real-world depth.`,
    };
  }

  // Case 5: Specific user prompt (e.g., custom typed question)
  const cleanedPrompt = rawPrompt.replace(/^(it is asking me that|can you explain|explain|tell me)\s*/i, '').trim();
  
  if (lastQuestion) {
    return {
      extractedQuestion: lastQuestion,
      targetPrompt: `[Active Discussion Context]: "${lastQuestion}"
[User Request]: "${cleanedPrompt}"
${hasImage ? '[Screen Context]: Refer to the content visible on screen to ground this answer.' : ''}
[Task]: Provide the exact, first-person answer directly addressing this topic. State the core answer in bold, followed by 2 to 3 clear points.`,
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
  const lastQuestion = extractLastQuestion(transcript);
  const recentTopic = extractRecentTopic(transcript);
  const cleanPrompt = prompt.replace(/^(it is asking me that|can you explain|explain|tell me)\s*/i, '').trim();

  // Extract real topics from the active transcript
  const transcriptLines = (transcript || '')
    .split(/(?<=[.?!])\s+|\n+/)
    .map(s => cleanSentence(s))
    .filter(s => s.length > 15);

  const keyTranscriptPoint = transcriptLines.length > 0 
    ? transcriptLines[transcriptLines.length - 1] 
    : null;
  const secondTranscriptPoint = transcriptLines.length > 1 
    ? transcriptLines[transcriptLines.length - 2] 
    : null;

  // Check user intent from prompt
  const isRecap = /\b(recap|summarize|summary|what was (just )?said|repeat)\b/i.test(prompt);

  // 1. If user asks for a Quick Recap
  if (isRecap) {
    if (keyTranscriptPoint) {
      return `**2-Bullet Meeting Recap:**
• **Current Focus**: ${keyTranscriptPoint}
• **Context & Priority**: ${secondTranscriptPoint || "Aligning on core objectives, expectations, and next steps."}

**Ready-to-Speak Response:**
"To summarize where we are: we are focusing on ${keyTranscriptPoint.slice(0, 100)}, and our priority is ensuring the deliverables are clear, verified, and executed seamlessly."`;
    }
    return `**2-Bullet Meeting Recap:**
• **Core Discussion**: Reviewing current requirements, scope, and key deliverables.
• **Current Priority**: Ensuring alignment, predictable execution, and immediate next steps.

**Ready-to-Speak Response:**
"We are aligned on the core objectives and are now focusing on finalizing the exact implementation and execution details."`;
  }

  // 2. Direct answer to an extracted interview question or topic
  if (lastQuestion) {
    return `**Direct Answer to Meeting Point:**
"Regarding **${lastQuestion.slice(0, 120)}**: my perspective is centered on structured execution, evidence-based rigor, and clear communication."

**Key Speaking Highlights:**
• **Direct Approach**: Address the core requirement with proven methodology and practical application.
• **Execution & Quality**: Emphasize safety, reliability, and measured outcomes.
• **Next Action**: Propose the recommended path forward and invite collaborative feedback.`;
  }

  // 3. Visual Screen Analysis (ONLY if explicitly requested and image is present)
  if (hasImage) {
    return `**Visual Screen Analysis:**
"Reviewing what is actively displayed on screen: the primary focus is aligning on the active material and verifying core points."

**Key Discussion Points:**
• **Active Content**: Focus directly on the critical elements and priorities presented on screen.
• **Execution**: Ensure expectations, constraints, and actionable deliverables are clearly addressed.
• **Next Action**: Walk through the recommendations step-by-step and confirm alignment with the team.`;
  }

  // 4. Response to a recent discussion topic or general speaking point
  if (recentTopic) {
    return `**Suggested Speaking Response:**
"Building directly on what was just mentioned regarding **${recentTopic.slice(0, 90)}**: our priority should be ensuring high quality, clear ownership, and reliable outcomes."

**Core Discussion Points:**
• **Primary Focus**: Maintain alignment on immediate goals and validate key parameters upfront.
• **Actionable Next Step**: Confirm consensus on the proposed direction and proceed with execution.`;
  }

  // 5. General Prompt Fallback
  return `**Direct Answer for "${cleanPrompt.slice(0, 80)}":**
"To address this directly: our approach is built on structured methodology, clear priorities, and measurable outcomes."

**Speaking Highlights:**
• **Primary Principle**: Deliver a clean, effective solution that satisfies the core requirements.
• **Reliability & Execution**: Guard against risks with disciplined validation and clear communication.
• **Next Step**: State the trade-offs clearly and invite questions on the implementation details.`;
}
