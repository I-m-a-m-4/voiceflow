/**
 * Dynamic Multi-Turn Context & Intent Engine for Voiceflow Co-Pilot
 *
 * Solves three core real-time AI assistant problems:
 * 1. Zero Stale Repetition: Tracks transcript deltas (earlier vs. newly spoken speech) and
 *    prior conversation turns so asking a 2nd question (or clicking Suggest Answer again)
 *    never regurgitates Turn 1's answer or resurrects an already-answered old question.
 * 2. Dynamic Response Adaptation: Automatically shifts persona, formatting, and temperature
 *    for code/debugging/algorithms, visual screen analysis, live meeting teleprompter replies,
 *    follow-up drill-downs, recaps, and standalone analytical questions.
 * 3. Clean Context Isolation: Prevents unrelated meeting transcript chatter from hijacking
 *    explicit standalone or code questions while preserving deep multi-turn continuity.
 */

export type PromptIntent = "screen" | "recap" | "suggest" | "code" | "followup" | "custom";

export type ResponseMode =
  | "code_technical"
  | "spoken_teleprompter"
  | "recap_brief"
  | "screen_adaptive"
  | "direct_analytical"
  | "fresh_alternative";

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ContextAnalysisOptions {
  history?: ConversationTurn[];
  hasImage?: boolean;
  previousTranscriptLength?: number;
  previousTranscriptTail?: string;
  previousAnsweredQuestion?: string;
  selectedTranscriptText?: string;
  customContext?: string;
  forceFreshAngle?: boolean;
}

export interface TranscriptDelta {
  earlierTranscript: string;
  newTranscript: string;
  hasMeaningfulDelta: boolean;
  fullLength: number;
}

export interface EnhancedPromptResult {
  intent: PromptIntent;
  responseMode: ResponseMode;
  targetPrompt: string;
  systemPrompt: string;
  userMessageContent: string;
  extractedQuestion: string | null;
  isRepeatAsk: boolean;
  isFollowUp: boolean;
  isCodeRelated: boolean;
  isTranscriptRelevant: boolean;
  hasTranscriptDelta: boolean;
  recommendedTemperature: number;
  turnNumber: number;
}

const LEAD_IN_PREFIX_REGEX =
  /^(?:(?:so|okay|ok|alright|great|right|well|now|actually|also|and|but|wait|hey|hi|hello|thanks|thank you|got it|makes sense|sure|yeah|yes|hmm|um|uh|good question|moving on|next)[,.\s-]*)+/i;

const QUESTION_STARTERS_REGEX =
  /^(?:can you|could you|how did you|how do you|how would you|how will you|how can we|how do we|how does|how have you|how is|how are|what is|what are|what was|what were|what if|what about|what challenges|what's your|what's the|what do you|what would you|why did you|why do you|why would|why is|why are|when did|when would|where did|which one|who did|have you ever|have you|has there|are you|were you|is there|was there|do you|did you|would you|should we|could we)\b/i;

const IMPERATIVE_PROMPT_REGEX =
  /^(?:tell me about|tell us about|tell me|tell us|explain|walk me through|walk us through|talk me through|talk us through|describe|in what scenario|give me an example|give us an example|give me a sense of|give us a sense of|share an example|share a time|think of a time|elaborate on|implement|write a|write an|design a|design an|debug|fix this|fix the|refactor|optimize|compare|contrast|let's solve|let's look at|let's implement|let's talk about|let's discuss|show me how|build a|create a|help me understand|i'm curious|i am curious|i was wondering|i'd love to hear|i would love to hear|i'd love to know|i'd love to understand|i would love to understand|i'd like to hear|i would like to hear|i'd like to know|i would like to know|thoughts on|your take on|what's your take on|suppose we|suppose you|imagine we|imagine you|let's say)\b/i;

const PURE_BACKCHANNEL_REGEX =
  /^(?:yeah|yes|yep|yup|no|nope|okay|ok|alright|right|sure|got it|makes sense|uh[- ]?huh|mm[- ]?hmm|hmm+|um+|uh+|cool|great|awesome|nice|thanks|thank you|thank you for watching|thanks for watching|good question|great question|that's a good question|interesting|let me think|give me a second|one second|hold on|go ahead|please go ahead|sounds good|i see|totally|exactly|definitely|yes ma'am|yes sir|i'm coming)[.!?,;\s]*$/i;

const INTERVIEWER_STALL_FILLER_REGEX =
  /^(?:(?:yeah|yes|sure|okay|ok|no worries|of course|absolutely)[,.\s]+)*(?:take your time|no rush(?: at all)?|take a (?:second|moment|minute)|feel free to (?:think|take a (?:second|moment)|share your screen)|whenever you(?:'re| are) ready|think out loud|no pressure)[.!?,;\s]*(?:no rush(?: at all)?|take your time|whenever you(?:'re| are) ready)?[.!?,;\s]*$/i;

const WHISPER_SPECIAL_TOKEN_REGEX = /<\|[^|]{1,32}\|>/g;
const WHISPER_REPEATED_TOKEN_REGEX = /^(\b[a-z0-9']+\b)(?:[\s,.!?]+\1){2,}[\s,.!?]*$/i;

const CLAUSE_COMMA_SPLIT_REGEX = /^([^,]{4,120}),\s+(.+)$/;
const SUBORDINATING_END_REGEX = /\b(?:because|since|although|though|whether|that|while|whereas)\s*$/i;
const HANGING_CLAUSE_END_REGEX =
  /\b(?:of|to|for|with|about|in|on|at|from|your|our|their|the|a|an|and|or|that|which|how|what|why|when|where)\s*$/i;
const USER_META_SELF_QUESTION_REGEX =
  /\b(?:how should i|what should i|should i say|how do i frame|how do i answer|frame the impact)\b/i;

const FIRST_PERSON_SELF_REPLY_REGEX =
  /^(?:(?:yeah|yes|no|nope|sure|well|actually|so|honestly|basically|right|alright|okay|ok)[,.\s]+)*(?:i'm|i am|i've|i have|i was|i did|i do|i don't|i didn't|i haven't|i think|i believe|i feel|i usually|i typically|i prefer|i tend|i would|i'd|i can|i could|i use|i used|i built|i led|i worked|i specialize|i focus|in my\b|for me\b|my\b)/i;

const PRONOUN_CONTEXT_NEED_REGEX = /\b(it|that|this|them|those|these|such|there|here)\b/i;

export interface SpeakerTurn {
  speaker: "them" | "you" | "unknown";
  timestamp: string;
  text: string;
}

/**
 * Parses a live transcript into speaker-aware, sentence-stitched conversational turns.
 * - Recognizes native dual-channel tags (`[THEM]` from WASAPI loopback, `[YOU]` from Mic)
 *   as well as textual labels (`Interviewer:`, `Host:`, `Candidate:`, `You:`).
 * - Stitches sentences split mid-thought across 5-second Whisper segment boundaries so
 *   a question is NEVER torn in half!
 */
export function parseConversationTurns(transcript: string): SpeakerTurn[] {
  if (!transcript || !transcript.trim()) return [];

  // Bound parsing to the newest 8,000 chars (~10–15 min of live speech) so 100KB+ marathon
  // transcripts execute in < 5ms instead of re-tokenizing hour-old history on every click.
  const boundedTranscript = transcript.length > 8000 ? transcript.slice(-8000) : transcript;

  const rawLines = boundedTranscript
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const turns: SpeakerTurn[] = [];

  for (const raw of rawLines) {
    let line = raw
      .replace(WHISPER_SPECIAL_TOKEN_REGEX, " ")
      .replace(/^\.\.\.\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!line) continue;

    let timestamp = "";
    const tsMatch = line.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*/);
    if (tsMatch) {
      timestamp = tsMatch[1];
      line = line.slice(tsMatch[0].length).trim();
    } else {
      const bareTs = line.match(/^(\d{1,2}:\d{2})\s+/);
      if (bareTs) {
        timestamp = bareTs[1];
        line = line.slice(bareTs[0].length).trim();
      }
    }

    let speaker: "them" | "you" | "unknown" = "unknown";
    const bracketTag = line.match(/^\[(THEM|YOU)\]\s*/i);
    if (bracketTag) {
      speaker = bracketTag[1].toUpperCase() === "THEM" ? "them" : "you";
      line = line.slice(bracketTag[0].length).trim();
    } else {
      const colonTag = line.match(/^(interviewer|host|client|recruiter|hiring manager|technical screener|frontend lead|vp marketing|them|guest|speaker\s*\d*|candidate|you|me):\s*/i);
      if (colonTag) {
        const who = colonTag[1].toLowerCase();
        speaker = who === "you" || who === "me" || who === "candidate" ? "you" : "them";
        line = line.slice(colonTag[0].length).trim();
      }
    }

    if (!line) continue;

    // Filter out Whisper hallucination bursts (e.g. "new", "new", "Thank you." repeated)
    if (isWhisperHallucinationNoise(line)) continue;

    const prev = turns[turns.length - 1];
    // Skip consecutive verbatim duplicate short lines emitted by Whisper loops
    if (prev && prev.text.toLowerCase() === line.toLowerCase() && line.length <= 60) {
      continue;
    }
    const shouldStitch =
      prev &&
      ((prev.speaker === speaker && speaker !== "unknown") ||
        (prev.speaker === "unknown" &&
          speaker === "unknown" &&
          (!/[.?!]["']?$/.test(prev.text) ||
            /^[a-z]/.test(line) ||
            /^(?:and|but|or|so|because|if|when|how|what|why|where|which|without|with|for|to)\b/i.test(line))));

    if (shouldStitch && prev) {
      // Avoid stitching identical trailing repeated token ("the new" + "new")
      const prevLastWord = prev.text.split(/\s+/).pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "";
      const currOnlyWord = line.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      if (line.trim().split(/\s+/).length === 1 && prevLastWord && prevLastWord === currOnlyWord) {
        continue;
      }
      prev.text = `${prev.text} ${line}`.replace(/\s+/g, " ").trim();
    } else {
      turns.push({ speaker, timestamp, text: line.replace(/\s+/g, " ").trim() });
    }
  }

  // Pass 1: Stitch interviewer questions split mid-sentence across [THEM] -> [YOU]
  // (e.g., "[2:41] [THEM] Could you share a brief overview of your" + "[2:51] [YOU] background and what led you...")
  const stitched: SpeakerTurn[] = [];
  for (let i = 0; i < turns.length; i++) {
    const cur = turns[i];
    const prev = stitched[stitched.length - 1];
    if (
      prev &&
      prev.speaker === "them" &&
      cur.speaker === "you" &&
      (!/[.?!]["']?$/.test(prev.text) || HANGING_CLAUSE_END_REGEX.test(prev.text)) &&
      !FIRST_PERSON_SELF_REPLY_REGEX.test(cur.text)
    ) {
      const prevTokens = tokenizeContent(prev.text);
      const curTokens = tokenizeContent(cur.text);
      const overlap = jaccardSimilarity(prevTokens, curTokens);
      if (overlap < 0.6) {
        prev.text = `${prev.text} ${cur.text}`.replace(/\s+/g, " ").trim();
        continue;
      }
    }
    stitched.push({ ...cur });
  }

  // Pass 2: Drop redundant [YOU] speaker-bleed echoes that duplicate an adjacent [THEM] turn
  const deduped: SpeakerTurn[] = [];
  for (let i = 0; i < stitched.length; i++) {
    const cur = stitched[i];
    if (cur.speaker === "you") {
      const curTokens = tokenizeContent(cur.text);
      if (curTokens.size >= 2) {
        let isSpeakerBleedEcho = false;
        for (let j = Math.max(0, i - 2); j <= Math.min(stitched.length - 1, i + 2); j++) {
          if (j === i || stitched[j].speaker !== "them") continue;
          const themTokens = tokenizeContent(stitched[j].text);
          if (themTokens.size < 2) continue;
          let shared = 0;
          for (const t of curTokens) if (themTokens.has(t)) shared++;
          const containment = shared / curTokens.size;
          const jac = jaccardSimilarity(curTokens, themTokens);
          if (containment >= 0.75 || jac >= 0.65) {
            isSpeakerBleedEcho = true;
            break;
          }
        }
        if (isSpeakerBleedEcho) continue;
      }
    }
    deduped.push(cur);
  }

  return deduped;
}

export function isWhisperHallucinationNoise(text: string): boolean {
  const cleaned = (text || "")
    .replace(WHISPER_SPECIAL_TOKEN_REGEX, " ")
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return true;
  if (/^[.\s,!?-]+$/.test(cleaned)) return true;
  if (WHISPER_REPEATED_TOKEN_REGEX.test(cleaned)) return true;
  // Detect Whisper garble bursts like "THO T ROOOOLNNNNNNNNNNNNN AAJKJUJD"
  if (/(.)\1{6,}/.test(cleaned)) return true;
  const upperNoVowelTokens = cleaned
    .split(/\s+/)
    .filter((tok) => tok.length >= 8 && /^[A-Z]{8,}$/.test(tok) && !/[AEIOU]/.test(tok));
  if (upperNoVowelTokens.length >= 2) return true;

  if (
    /^(?:thank you(?:\s+for\s+watching|\s+for\s+listening)?|thanks\s+for\s+watching|please\s+subscribe|subtitles?\s+by.*|transcribed\s+by.*|amara\.org.*|gracias|¿?qu[eé]\s+pasa|merci|danke)$/i.test(
      cleaned.replace(/[.!?]+$/, "").trim()
    )
  ) {
    return true;
  }
  const words = cleaned.toLowerCase().replace(/[^a-z0-9'\s]/g, " ").split(/\s+/).filter(Boolean);
  if (words.length >= 4) {
    const unique = new Set(words);
    if (unique.size === 1) return true;
    // Detect 2-4 word n-gram repetition loops ("come la parola come la parola come la parola")
    for (const n of [2, 3, 4]) {
      if (words.length < n * 3) continue;
      let phraseRun = 1;
      for (let i = n; i <= words.length - n; i += n) {
        if (words.slice(i - n, i).join(" ") === words.slice(i, i + n).join(" ")) {
          phraseRun += 1;
          if (phraseRun >= 3) return true;
        } else {
          phraseRun = 1;
        }
      }
    }
  }
  return false;
}

export function isPureBackchannel(text: string): boolean {
  const cleaned = cleanSentence(text || "").replace(/^["']|["']$/g, "").trim();
  if (!cleaned) return true;
  if (isWhisperHallucinationNoise(cleaned)) return true;
  if (PURE_BACKCHANNEL_REGEX.test(cleaned)) return true;
  const meaningful = stripFillersForDeltaCheck(cleaned);
  const words = meaningful ? meaningful.split(/\s+/).filter(Boolean) : [];
  // Never discard genuine short follow-up questions ("Why Rust?", "Why Go?", "What's Big-O?") as backchannel!
  if (/\?$/.test(cleaned) && meaningful.length >= 4 && words.length >= 2) {
    return false;
  }
  return meaningful.length < 10 || words.length < 2;
}

const PRIOR_SUGGEST_HISTORY_PREFIX_REGEX = /^\[asked\s+for\s+live\s+answer\s+to\]:\s*/i;

export function extractPriorAnsweredQuestion(history: ConversationTurn[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== "user") continue;
    const raw = (history[i].content || "").trim();
    if (PRIOR_SUGGEST_HISTORY_PREFIX_REGEX.test(raw)) {
      const q = cleanSentence(
        raw
          .replace(PRIOR_SUGGEST_HISTORY_PREFIX_REGEX, "")
          .replace(/^["']|["']$/g, "")
          .trim()
      );
      if (q.length >= 6) return q;
    }
    break;
  }
  return null;
}

const GENERIC_ASSIST_PATTERNS = [
  /^what\s+should\s+i\s+say(\s+right\s+now|\s+next)?(\s+in\s+this\s+meeting)?(\?)?$/i,
  /^what\s+to\s+say(\?)?$/i,
  /^suggest\s+(an?\s+)?answer(\s+suggestion)?(\s+for\s+the\s+current\s+meeting\s+point)?(\?)?$/i,
  /^give\s+me\s+a\s+smart\s+real-time\s+answer\s+suggestion.*$/i,
  /^\[asked\s+for\s+live\s+answer\s+to\]:.*$/i,
  /^suggest\s+speaking(\s+points)?(\?)?$/i,
  /^how\s+should\s+i\s+respond(\?)?$/i,
  /^how\s+do\s+i\s+answer(\s+this)?(\?)?$/i,
  /^what\s+do\s+i\s+say(\?)?$/i,
  /^help(\s+me)?(\?)?$/i,
  /^answer(\s+this)?(\?)?$/i,
  /^respond(\?)?$/i,
];

const RECAP_PROMPT_REGEX =
  /\b(recap|summarize|summary|what was (just )?said|catch me up|so far|tldr|tl;dr|key takeaways|action items)\b/i;

const MEETING_REFERENCE_REGEX =
  /\b(meeting|transcript|call|conversation|discussion|interviewer|speaker|they said|he said|she said|they asked|he asked|she asked|just said|so far|mentioned|discussed|earlier|catch me up|action items|what did (they|he|she|we)|recap)\b/i;

const SCREEN_PROMPT_REGEX =
  /\b(screen|slide|display|screenshot|what's on my screen|whats on my screen|picture|image|analyze (what is on )?my screen|look at my screen|on my screen|this image|this screenshot)\b/i;

const EXPLICIT_ALTERNATIVE_REGEX =
  /\b(try again|different answer|different angle|different take|different perspective|different approach|different example|another answer|another angle|another take|another way|another option|other angle|other options?|something else|something different|rephrase|say it differently|not that|give me another|regenerate|fresh take|second opinion|new answer)\b/i;

const FOLLOWUP_PHRASE_REGEX =
  /^(?:and\s+|but\s+|ok\s+|okay\s+|great\s+|now\s+|wait\s+|also\s+)?(?:explain more|go deeper|elaborate|give me an example|show me an example|more detail|more details|break (it|that|this) down|step by step|make (it|that|this) shorter|shorter|more concise|simpler|simplify|eli5|why\??$|how\??$|what else\??$|anything else\??$|what about\b|how about\b|what if\b|compare (that|it|them|this)|pros and cons|edge cases|expand on|convert (it|that|this) to|rewrite (it|that|this)|optimize (it|that|this)|fix (it|that|this)|debug (it|that|this)|in (python|javascript|typescript|java|go|rust|sql|c\+\+|c#|bash)|show (me )?(the )?code|with code|explain line\b|explain point\b|explain the (first|second|third|last))\b/i;

const FOLLOWUP_ANAPHORA_REGEX =
  /\b(that answer|your answer|previous answer|last answer|above|that approach|this approach|that code|this code|that snippet|that function|the first one|the second one|point \d|step \d)\b/i;

const CODE_SYNTAX_REGEX =
  /```|`[^`]{2,}`|=>|===|!==|\b(?:const|let|var)\s+[a-zA-Z_$][\w$]*\s*=|\bfunction\s*(?:[a-zA-Z_$][\w$]*)?\s*\(|\b(?:async\s+function|await\s+\w+\s*\()|\bimport\s+(?:\{[^}]+\}|\*\s+as\s+\w+|[a-zA-Z_$][\w$]*)\s+from\b|\bexport\s+(?:default\s+)?(?:const|let|var|function|class|interface|type|async)\b|\binterface\s+[A-Z]\w*\s*\{|\b(?:struct|enum|impl)\s+[A-Z]\w*|\b(?:fn|def)\s+[a-zA-Z_]\w*\s*\(|\b(?:elif|nullptr|console\.log|System\.out|fmt\.Print|printf|std::|SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|CREATE\s+TABLE|useState\s*\(|useEffect\s*\(|useMemo\s*\(|useCallback\s*\(|try\s*\{|catch\s*\(|Traceback\s*\(|TypeError:|ReferenceError:|SyntaxError:|RangeError:|ValueError:|KeyError:|AttributeError:|NullPointerException)\b|#include\b|<\?php/;

const CODE_INTENT_REGEX =
  /\b(code|codebase|snippet|pseudocode|algorithm|leetcode|big[- ]?o|time complexity|space complexity|data structure|regex|regular expression|sql|query|graphql|json|yaml|dockerfile|docker|kubernetes|git|bash|shell|powershell|typescript|javascript|python|golang|rust|java\b|c\+\+|c#|kotlin|swift|react|next\.?js|node\.?js|html|css|tailwind|unit test|test case|debug|debugger|refactor|stack ?trace|traceback|syntax error|runtime error|compile error|build error|type error|api endpoint|binary search|linked list|binary tree|dynamic programming|sliding window|hash ?map|lru cache|recursion|memoization|closure|promise|async\/await|useEffect|useState|hydration|mutex|deadlock|race condition)\b/i;

const CODE_ACTION_NOUN_REGEX =
  /\b(write|implement|fix|debug|explain|understand|trace|dry[- ]?run|review|optimize|refactor|parse|compile|convert|translate)\s+(?:a\s+|an\s+|the\s+|this\s+|my\s+)?(?:(?:async|recursive|arrow|callback|helper|python|js|ts|javascript|typescript|java|rust|go|sql|react|next\.?js|custom|pure)\s+)?(code|snippet|script|program|bug|error|exception|loop|recursion|component|hook|query|endpoint|handler|algorithm|reducer|middleware|regex|sql|function|method|class)\b/i;

const TRANSCRIPT_CODE_HINT_REGEX =
  /\b(leetcode|coderpad|whiteboard|time complexity|space complexity|big[- ]?o|binary tree|linked list|lru cache|sliding window|dynamic programming|implement (a|an|the)|write a function|debug this|fix this bug|sql query|time and space|o\(n\)|o\(log n\)|o\(1\)|hash ?map|algorithm)\b/i;

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being", "am",
  "to", "of", "in", "on", "for", "with", "at", "by", "from", "as", "into",
  "it", "its", "this", "that", "these", "those", "i", "me", "my", "mine",
  "you", "your", "yours", "we", "us", "our", "they", "them", "their",
  "please", "can", "could", "would", "should", "will", "just", "now", "right",
  "give", "tell", "about", "what", "how", "why", "when", "where", "which", "who",
  "do", "does", "did", "have", "has", "had", "explain", "help", "say", "answer",
  "suggestion", "suggest", "smart", "real", "time", "current", "point", "get",
  "make", "some", "any", "more", "very", "really", "actually", "basically",
  "like", "okay", "ok", "yeah", "yes", "no", "so", "and", "or", "but", "if",
  "then", "than", "also", "too", "here", "there", "up", "out", "over",
]);

function normalizeText(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#._/\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lightStem(token: string): string {
  if (token.length >= 5 && token.endsWith("ing") && !token.endsWith("string")) {
    return token.slice(0, -3);
  }
  if (token.length >= 5 && token.endsWith("ies")) {
    return `${token.slice(0, -3)}y`;
  }
  if (
    token.length >= 4 &&
    token.endsWith("s") &&
    !token.endsWith("ss") &&
    !token.endsWith("is") &&
    !token.endsWith("us") &&
    !token.endsWith("js") &&
    !token.endsWith("ts") &&
    !token.endsWith("css")
  ) {
    return token.slice(0, -1);
  }
  return token;
}

export function tokenizeContent(text: string): Set<string> {
  const norm = normalizeText(text);
  if (!norm) return new Set();
  const tokens = norm
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
    .map(lightStem)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
  return new Set(tokens);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function isGenericAskPrompt(prompt: string): boolean {
  if (!prompt || !prompt.trim()) return true;
  const clean = prompt.trim().toLowerCase();
  return GENERIC_ASSIST_PATTERNS.some((pattern) => pattern.test(clean));
}

export function isRecapPrompt(prompt: string): boolean {
  if (!prompt || !prompt.trim()) return false;
  const trimmed = prompt.trim();
  if (!RECAP_PROMPT_REGEX.test(trimmed)) return false;
  // Do NOT hijack "summarize this code" or "summarize this function/error" into a meeting recap!
  const mentionsCodeTarget =
    CODE_SYNTAX_REGEX.test(trimmed) ||
    /\b(this code|the code|this function|this snippet|this error|this file|this class|this query|this script)\b/i.test(
      trimmed
    );
  if (mentionsCodeTarget && !MEETING_REFERENCE_REGEX.test(trimmed)) {
    return false;
  }
  return true;
}

export function isScreenFocusedPrompt(prompt: string): boolean {
  if (!prompt) return false;
  return SCREEN_PROMPT_REGEX.test(prompt.trim());
}

export function isCodeOrTechnicalPrompt(prompt: string, recentHistory: ConversationTurn[] = []): boolean {
  if (!prompt || !prompt.trim()) return false;
  const trimmed = prompt.trim();
  if (CODE_SYNTAX_REGEX.test(trimmed)) return true;
  if (CODE_INTENT_REGEX.test(trimmed)) return true;
  if (CODE_ACTION_NOUN_REGEX.test(trimmed)) return true;

  // Continue in code mode if the previous assistant turn had fenced code and the user is following up
  const lastAssistant = [...recentHistory].reverse().find((m) => m.role === "assistant");
  if (lastAssistant && /```/.test(lastAssistant.content)) {
    if (
      FOLLOWUP_PHRASE_REGEX.test(trimmed) ||
      FOLLOWUP_ANAPHORA_REGEX.test(trimmed) ||
      /\b(line \d+|complexity|edge case|null|empty|faster|cleaner|shorter|optimize|explain it|walk through|step by step|how does it work|why does it)\b/i.test(
        trimmed
      )
    ) {
      return true;
    }
  }

  return false;
}

export function isFollowUpPrompt(prompt: string, history: ConversationTurn[] = []): boolean {
  if (!prompt || !prompt.trim() || history.length === 0) return false;
  const hasAssistantReply = history.some((h) => h.role === "assistant");
  if (!hasAssistantReply) return false;

  const trimmed = prompt.trim();
  if (isGenericAskPrompt(trimmed) || isRecapPrompt(trimmed) || isScreenFocusedPrompt(trimmed)) {
    return false;
  }
  if (EXPLICIT_ALTERNATIVE_REGEX.test(trimmed)) return true;
  if (FOLLOWUP_PHRASE_REGEX.test(trimmed)) return true;
  if (FOLLOWUP_ANAPHORA_REGEX.test(trimmed)) return true;

  // Short pronoun-anchored follow-up (e.g., "Can you make it faster?", "What about edge cases for that?")
  if (
    trimmed.length <= 120 &&
    /\b(it|that|this|those|them)\b/i.test(trimmed) &&
    !MEETING_REFERENCE_REGEX.test(trimmed)
  ) {
    // Only treat as follow-up if it doesn't introduce an obviously self-contained new coding snippet
    if (!CODE_SYNTAX_REGEX.test(trimmed)) {
      return true;
    }
  }

  return false;
}

export function isTranscriptRelevantPrompt(
  prompt: string,
  transcript: string,
  intent: PromptIntent
): boolean {
  if (intent === "recap" || intent === "suggest") return true;
  if (!transcript || !transcript.trim()) return false;
  if (MEETING_REFERENCE_REGEX.test(prompt)) return true;

  // For explicit code prompts with pasted code or standalone technical questions,
  // don't let unrelated transcript chatter hijack the answer unless there's clear topical overlap.
  const promptTokens = tokenizeContent(prompt);
  if (promptTokens.size === 0) return true;

  const recentTranscriptTokens = tokenizeContent(transcript.slice(-1800));
  if (recentTranscriptTokens.size === 0) return false;

  let overlap = 0;
  for (const tok of promptTokens) {
    if (recentTranscriptTokens.has(tok)) overlap++;
  }

  // Require strong overlap for code prompts (at least 2 shared non-stopword terms and >=30% of prompt terms)
  if (intent === "code") {
    return overlap >= 2 && overlap / promptTokens.size >= 0.3;
  }

  // For custom/followup prompts, require at least 2 shared domain terms or >=25% overlap
  return overlap >= 2 || (promptTokens.size <= 3 && overlap >= 1 && overlap / promptTokens.size >= 0.34);
}

/**
 * Sanitizes and bounds prior conversation turns:
 * - Preserves up to `maxTurns` turns (default 10 = 5 full Q&A exchanges)
 * - Caps each turn at `maxCharsPerTurn` (default 1400 chars so code blocks remain intact)
 * - Merges consecutive same-role turns cleanly instead of silently dropping user context
 * - Guarantees clean `user` -> `assistant` alternation ending with `assistant`
 */
export function sanitizeConversationHistory(
  history: unknown,
  maxTurns = 10,
  maxCharsPerTurn = 1400
): ConversationTurn[] {
  if (!Array.isArray(history) || history.length === 0) return [];

  const merged: ConversationTurn[] = [];
  for (const raw of history.slice(-Math.max(maxTurns * 2, 16))) {
    if (!raw || typeof raw !== "object") continue;
    const role = (raw as any).role;
    const content = (raw as any).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;

    const trimmed = content.trim();
    if (!trimmed) continue;

    const bounded =
      trimmed.length > maxCharsPerTurn ? `${trimmed.slice(0, maxCharsPerTurn)}...` : trimmed;

    if (merged.length > 0 && merged[merged.length - 1].role === role) {
      const combined = `${merged[merged.length - 1].content}\n${bounded}`;
      merged[merged.length - 1].content =
        combined.length > maxCharsPerTurn ? `${combined.slice(0, maxCharsPerTurn)}...` : combined;
    } else {
      merged.push({ role, content: bounded });
    }
  }

  // Slice to maxTurns from the end
  const recent = merged.slice(-maxTurns);

  // Strip leading orphaned assistant turns so conversation starts cleanly with user
  while (recent.length > 0 && recent[0].role === "assistant") {
    recent.shift();
  }

  // Strip trailing orphaned user turns (the current turn appends the active user message)
  while (recent.length > 0 && recent[recent.length - 1].role === "user") {
    recent.pop();
  }

  return recent;
}

function cleanSentence(text: string): string {
  return text
    .replace(WHISPER_SPECIAL_TOKEN_REGEX, " ")
    .replace(/^(\[\d{1,2}:\d{2}(:\d{2})?\]|\d{1,2}:\d{2})\s*/, "")
    .replace(/^\[(THEM|YOU)\]\s*/i, "")
    .replace(/^(speaker\s*\d*|interviewer|host|client|recruiter|hiring manager|participant|guest|person|them|candidate|you|me):\s*/i, "")
    .replace(/^\.\.\.\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripFillersForDeltaCheck(text: string): string {
  return text
    .replace(/\[\d{1,2}:\d{2}(:\d{2})?\]/g, " ")
    .replace(/\[(THEM|YOU)\]/gi, " ")
    .replace(/\.\.\./g, " ")
    .replace(/\b(um+|uh+|hmm+|okay|ok|yeah|yes|right|sure|thanks|thank you|got it)\b/gi, " ")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isShortExplicitQuestionDelta(rawDelta: string, meaningfulNew: string): boolean {
  const words = meaningfulNew ? meaningfulNew.split(/\s+/).filter(Boolean) : [];
  if (words.length < 2 || meaningfulNew.length < 6) return false;
  const cleaned = cleanSentence(rawDelta);
  if (!cleaned || cleaned.length < 6) return false;
  if (/\?/.test(rawDelta)) return true;
  const stripped = cleaned.replace(LEAD_IN_PREFIX_REGEX, "").trim();
  return QUESTION_STARTERS_REGEX.test(stripped);
}

/**
 * Splits live transcript into earlier background context vs. NEW speech since the previous AI reply.
 * Handles Whisper re-timestamping and interim-preview replacement gracefully via anchor matching.
 */
export function splitTranscriptDelta(
  transcript: string,
  previousLength?: number,
  previousTail?: string
): TranscriptDelta {
  const full = (transcript || "").trim();
  if (!full) {
    return {
      earlierTranscript: "",
      newTranscript: "",
      hasMeaningfulDelta: false,
      fullLength: 0,
    };
  }

  const hasValidPrevLen = typeof previousLength === "number" && Number.isFinite(previousLength) && previousLength > 0;
  const cleanTail = (previousTail || "").replace(/^\.\.\.\s*/, "").trim();

  // First turn (no prior cursor)
  if (!hasValidPrevLen && !cleanTail) {
    const meaningful = stripFillersForDeltaCheck(full);
    const words = meaningful ? meaningful.split(/\s+/).length : 0;
    return {
      earlierTranscript: "",
      newTranscript: full.slice(-3000),
      hasMeaningfulDelta:
        (meaningful.length >= 16 && words >= 3) || isShortExplicitQuestionDelta(full, meaningful),
      fullLength: full.length,
    };
  }

  let splitIdx = -1;

  // 1. Try anchor matching with previousTail (resilient when interim "... " shifts into committed Whisper text)
  if (cleanTail.length >= 20) {
    const anchorCandidates = [
      cleanTail.slice(-80),
      cleanTail.slice(-45),
      cleanTail.slice(-24),
    ].filter((a) => a.length >= 16);

    const lowerFull = full.toLowerCase();
    for (const anchor of anchorCandidates) {
      const found = lowerFull.lastIndexOf(anchor.toLowerCase());
      if (found !== -1) {
        splitIdx = found + anchor.length;
        break;
      }
    }
  }

  // 2. Fallback to numeric length cursor
  if (splitIdx === -1 && hasValidPrevLen) {
    if (previousLength! <= full.length) {
      splitIdx = previousLength!;
    } else if (previousLength! - full.length > 300) {
      // Transcript was reset to a brand-new shorter session
      splitIdx = 0;
    } else {
      // Slight shrink after interim line collapsed into committed Whisper text — no new speech yet
      splitIdx = full.length;
    }
  }

  if (splitIdx < 0) splitIdx = 0;
  if (splitIdx > full.length) splitIdx = full.length;

  const earlierRaw = full.slice(0, splitIdx).trim();
  const newRaw = full.slice(splitIdx).trim();

  const meaningfulNew = stripFillersForDeltaCheck(newRaw);
  const newWords = meaningfulNew ? meaningfulNew.split(/\s+/).length : 0;
  const hasMeaningfulDelta =
    (meaningfulNew.length >= 16 && newWords >= 3) || isShortExplicitQuestionDelta(newRaw, meaningfulNew);

  return {
    earlierTranscript: earlierRaw.slice(-2200),
    newTranscript: newRaw.slice(-2800),
    hasMeaningfulDelta,
    fullLength: full.length,
  };
}

/**
 * Extracts the COMPLETE active question or prompt from a transcript slice.
 * Next-Gen Speaker-Aware & Context-Preserving Algorithm:
 * 1. Stitches sentences split across 5s Whisper chunks via `parseConversationTurns`.
 * 2. When dual-channel `[THEM]` (WASAPI loopback) turns exist, locks onto the LAST
 *    substantive `[THEM]` turn — completely ignoring `[YOU]`'s trailing filler ("good question, um...").
 * 3. Preserves 1 preceding setup sentence whenever the question contains pronouns ("that", "it", "this")
 *    or is short (< 70 chars), so context like "We use Redis Pub/Sub. How do you make that resilient?"
 *    is NEVER severed from the question!
 * 4. Avoids false mid-sentence matches and never resurrects ancient buried questions.
 */
export function extractLastQuestion(
  transcript: string,
  excludeText?: string | null,
  secondaryExcludeText?: string | null
): string | null {
  if (!transcript || !transcript.trim()) return null;

  const turns = parseConversationTurns(transcript);
  if (turns.length === 0) return null;

  const excludeSets = [excludeText, secondaryExcludeText]
    .filter((s): s is string => Boolean(s && s.trim()))
    .map((s) => tokenizeContent(s))
    .filter((set) => set.size >= 2);

  const isExcludedCandidate = (text: string): boolean => {
    if (excludeSets.length === 0) return false;
    const candTokens = tokenizeContent(text);
    if (candTokens.size < 2) return false;
    return excludeSets.some((ex) => jaccardSimilarity(candTokens, ex) >= 0.72);
  };

  const matchQuestionOrPrompt = (segment: string): string | null => {
    const stripped = segment.replace(LEAD_IN_PREFIX_REGEX, "").trim();
    if (stripped.length < 7) return null;

    if (segment.endsWith("?")) {
      return stripped.length >= 7 ? stripped : segment;
    }
    if (QUESTION_STARTERS_REGEX.test(stripped) && stripped.length > 10) {
      return stripped.endsWith(".") ? `${stripped.slice(0, -1)}?` : `${stripped}?`;
    }
    if (IMPERATIVE_PROMPT_REGEX.test(stripped) && stripped.length > 14) {
      return stripped;
    }

    // Clause-prefixed spoken questions/prompts without trailing '?':
    // e.g. "Within software engineering, what are two architectural challenges you solved."
    // e.g. "Before we dive into coding, give us a sense of your strongest backend project."
    const clauseMatch = stripped.match(CLAUSE_COMMA_SPLIT_REGEX);
    if (clauseMatch) {
      const leadClause = clauseMatch[1].trim();
      const afterComma = clauseMatch[2].replace(LEAD_IN_PREFIX_REGEX, "").trim();
      if (afterComma.length >= 10 && !SUBORDINATING_END_REGEX.test(leadClause)) {
        if (QUESTION_STARTERS_REGEX.test(afterComma)) {
          return stripped.endsWith(".") ? `${stripped.slice(0, -1)}?` : `${stripped}?`;
        }
        if (IMPERATIVE_PROMPT_REGEX.test(afterComma) && afterComma.length > 14) {
          return stripped;
        }
      }
    }

    return null;
  };

  const extractFromSentences = (sentences: string[], allowFinalStatementFallback: boolean): string | null => {
    const recent = sentences.slice(-10);
    for (let i = recent.length - 1; i >= 0; i--) {
      const segment = recent[i];
      const distanceFromEnd = recent.length - 1 - i;

      // Never jump backwards over >= 2 newer substantive sentences to resurrect an old passed question
      if (distanceFromEnd >= 3) {
        const newerSubstantive = recent
          .slice(i + 1)
          .filter((s) => !isPureBackchannel(s) && stripFillersForDeltaCheck(s).length >= 25);
        if (newerSubstantive.length >= 2) {
          break;
        }
      }

      if (isPureBackchannel(segment)) continue;

      const candidate = matchQuestionOrPrompt(segment);

      if (candidate) {
        // Attach 1 preceding setup sentence when the question refers back to it ("it/that/this") or is brief
        let enriched = candidate;
        if (i > 0 && (candidate.length < 75 || PRONOUN_CONTEXT_NEED_REGEX.test(candidate))) {
          const prevSent = recent[i - 1];
          if (
            prevSent &&
            !isPureBackchannel(prevSent) &&
            !INTERVIEWER_STALL_FILLER_REGEX.test(prevSent) &&
            !prevSent.endsWith("?") &&
            prevSent.length >= 16 &&
            prevSent.length <= 220
          ) {
            enriched = `${prevSent} ${candidate}`;
          }
        }

        if (isExcludedCandidate(enriched) || isExcludedCandidate(candidate)) {
          continue;
        }
        return enriched;
      }
    }

    if (allowFinalStatementFallback) {
      const substantive = recent.filter((s) => !isPureBackchannel(s));
      if (substantive.length > 0) {
        const fallback = substantive.slice(-2).join(" ").trim();
        if (!isExcludedCandidate(fallback)) {
          return fallback;
        }
      }
    }
    return null;
  };

  // PRIORITY 1: If dual-channel `[THEM]` turns exist (WASAPI loopback or labeled Interviewer),
  // lock onto the most recent substantive `[THEM]` turn — UNLESS a newer `[YOU]` turn after it
  // contains an explicit interviewer-style question (speaker bleed caught by mic when WASAPI missed a chunk).
  const themTurns = turns.filter((t) => t.speaker === "them" && !isPureBackchannel(t.text));
  if (themTurns.length > 0) {
    const lastThemIndex = turns.lastIndexOf(themTurns[themTurns.length - 1]);
    const trailingYouTurns = turns
      .slice(lastThemIndex + 1)
      .filter((t) => t.speaker === "you" && !isPureBackchannel(t.text) && !USER_META_SELF_QUESTION_REGEX.test(t.text));
    if (trailingYouTurns.length > 0) {
      const trailingYouSentences = trailingYouTurns
        .map((t) => t.text)
        .join(" ")
        .split(/(?<=[.?!])\s+/)
        .map((s) => cleanSentence(s))
        .filter((s) => s.length > 6 && !FIRST_PERSON_SELF_REPLY_REGEX.test(s));
      const explicitQuestionInTrailingYou = extractFromSentences(trailingYouSentences, false);
      if (explicitQuestionInTrailingYou) return explicitQuestionInTrailingYou;
    }

    // Scan up to the last 3 substantive [THEM] turns from newest -> oldest for an explicit question/prompt FIRST.
    // This prevents a brief trailing interviewer stall ("Take your time, no rush.") after a [YOU] interjection
    // from masking the actual question asked 1 turn earlier, AND stitches [THEM] questions interrupted mid-sentence by [YOU].
    const recentThemTurns = themTurns.slice(-3);
    for (let tIdx = recentThemTurns.length - 1; tIdx >= 0; tIdx--) {
      let turnText = recentThemTurns[tIdx].text;
      if (
        tIdx > 0 &&
        (!/[.?!]["']?$/.test(recentThemTurns[tIdx - 1].text) ||
          HANGING_CLAUSE_END_REGEX.test(recentThemTurns[tIdx - 1].text) ||
          /^[a-z]/.test(turnText))
      ) {
        turnText = `${recentThemTurns[tIdx - 1].text} ${turnText}`.replace(/\s+/g, " ").trim();
      }
      const themSentences = turnText
        .split(/(?<=[.?!])\s+/)
        .map((s) => cleanSentence(s))
        .filter((s) => s.length > 6);
      const explicitFromThem = extractFromSentences(themSentences, false);
      if (explicitFromThem) return explicitFromThem;

      const substantiveNonStall = themSentences.filter(
        (s) =>
          !isPureBackchannel(s) &&
          !INTERVIEWER_STALL_FILLER_REGEX.test(s) &&
          stripFillersForDeltaCheck(s).length >= 25
      );
      if (substantiveNonStall.length >= 2) break;
    }

    // Statement fallback: use newest substantive non-stalling [THEM] turn
    for (let tIdx = recentThemTurns.length - 1; tIdx >= 0; tIdx--) {
      const themSentences = recentThemTurns[tIdx].text
        .split(/(?<=[.?!])\s+/)
        .map((s) => cleanSentence(s))
        .filter((s) => s.length > 6 && !INTERVIEWER_STALL_FILLER_REGEX.test(s));
      const fromThem = extractFromSentences(themSentences, true);
      if (fromThem) return fromThem;
    }
    return null;
  }

  // PRIORITY 2: Unlabeled OR `[YOU]`-only single-channel transcript.
  // CRITICAL: When WASAPI captured 0 `[THEM]` turns (e.g., laptop speakers / routing mismatch),
  // ALL speech (including the interviewer) is tagged `[YOU]`. Never throw away `[YOU]` when
  // there are ZERO `[THEM]` turns — treat it as single-channel mixed audio!
  const nonYouTurns = turns.filter((t) => t.speaker !== "you" && !isPureBackchannel(t.text));
  const activeTurns =
    nonYouTurns.length > 0
      ? nonYouTurns
      : turns.filter((t) => !isPureBackchannel(t.text) && !USER_META_SELF_QUESTION_REGEX.test(t.text));
  if (activeTurns.length === 0) return null;

  const stitchedText = activeTurns.map((t) => t.text).join(" ");

  const rawSegments = stitchedText
    .split(/(?<=[.?!])\s+/)
    .map((s) => cleanSentence(s))
    .filter((s) => s.length > 6);

  if (rawSegments.length === 0) return null;
  return extractFromSentences(rawSegments, false);
}

export function extractRecentTopic(transcript: string): string | null {
  if (!transcript || !transcript.trim()) return null;

  const turns = parseConversationTurns(transcript);
  const nonYouTurns = turns.filter((t) => t.speaker !== "you" && !isPureBackchannel(t.text));
  const substantiveTurns = turns.filter((t) => !isPureBackchannel(t.text));

  // Prefer non-`[YOU]` turns when dual-channel `[THEM]` exists; fall back to all substantive turns
  // when `[THEM]` is absent (so single-channel desktop calls tagged `[YOU]` are never blinded!).
  const selectedTurns = nonYouTurns.length > 0 ? nonYouTurns : substantiveTurns;
  if (selectedTurns.length === 0) return null;

  const sourceText = selectedTurns.slice(-2).map((t) => t.text).join(" ");

  const lines = sourceText
    .split(/(?<=[.?!])(?:\s+|\n+)|\n+/)
    .map((s) => cleanSentence(s))
    .filter((s) => s.length > 10 && !isPureBackchannel(s));

  if (lines.length === 0) return null;
  return lines.slice(-2).join(" ").trim();
}

/**
 * Returns a clean 1-line preview of the latest real heard question or discussion point
 * for the floating HUD status strip (filters out hallucinations, backchannels, and special tokens).
 */
export function getLatestHeardPreview(transcript: string): string | null {
  if (!transcript || !transcript.trim()) return null;
  const q = extractLastQuestion(transcript);
  if (q && q.length >= 8) return q;
  const topic = extractRecentTopic(transcript);
  if (topic && topic.length >= 8) return topic;
  return null;
}

export interface SelectableTranscriptTurn {
  id: string;
  speaker: "them" | "you" | "unknown";
  timestamp: string;
  text: string;
  isQuestion: boolean;
}

/**
 * Returns clean, hallucination-filtered, speaker-bleed-deduplicated items from the live
 * transcript so the user can 1-click pick ANY specific turn or question for Suggest Answer.
 * Splits multi-question speaker blocks into individual clickable questions while filtering
 * out pure backchannels and stalling remarks ("Take your time, no rush").
 */
export function getSelectableTranscriptTurns(transcript: string, maxTurns = 30): SelectableTranscriptTurn[] {
  if (!transcript || !transcript.trim()) return [];
  const turns = parseConversationTurns(transcript);
  const items: SelectableTranscriptTurn[] = [];

  for (const turn of turns) {
    const sentences = turn.text
      .split(/(?<=[.?!])\s+/)
      .map((s) => cleanSentence(s))
      .filter((s) => s.length >= 6 && !isPureBackchannel(s) && !INTERVIEWER_STALL_FILLER_REGEX.test(s));

    for (let i = 0; i < sentences.length; i++) {
      let text = sentences[i];
      const stripped = text.replace(LEAD_IN_PREFIX_REGEX, "").trim();
      const isQ =
        text.includes("?") ||
        QUESTION_STARTERS_REGEX.test(stripped) ||
        IMPERATIVE_PROMPT_REGEX.test(stripped);

      // If this sentence is a brief setup statement immediately followed by a short pronoun-dependent question
      // ("We use Redis Pub/Sub." + "How do you make that resilient?"), keep them together as one coherent card.
      if (!isQ && i + 1 < sentences.length) {
        const next = sentences[i + 1];
        const nextStripped = next.replace(LEAD_IN_PREFIX_REGEX, "").trim();
        const nextIsQ =
          next.includes("?") ||
          QUESTION_STARTERS_REGEX.test(nextStripped) ||
          IMPERATIVE_PROMPT_REGEX.test(nextStripped);
        if (nextIsQ && (next.length < 75 || PRONOUN_CONTEXT_NEED_REGEX.test(next)) && text.length <= 180) {
          text = `${text} ${next}`.trim();
          i++;
          items.push({
            id: `turn-${items.length}-${turn.timestamp || "na"}-${text.length}`,
            speaker: turn.speaker,
            timestamp: turn.timestamp,
            text,
            isQuestion: true,
          });
          continue;
        }
      }

      items.push({
        id: `turn-${items.length}-${turn.timestamp || "na"}-${text.length}`,
        speaker: turn.speaker,
        timestamp: turn.timestamp,
        text,
        isQuestion: isQ,
      });
    }
  }

  return items.slice(-maxTurns);
}

export function detectRepeatAsk(
  prompt: string,
  history: ConversationTurn[],
  hasMeaningfulTranscriptDelta: boolean,
  intentHint: { isGeneric: boolean; isRecap: boolean; isScreen: boolean; hasImage: boolean }
): { isRepeat: boolean; repeatedTurnContent: string | null } {
  const userTurns = history.filter((h) => h.role === "user");
  const assistantTurns = history.filter((h) => h.role === "assistant");
  if (userTurns.length === 0 || assistantTurns.length === 0) {
    return { isRepeat: false, repeatedTurnContent: null };
  }

  const lastUser = userTurns[userTurns.length - 1].content;
  const lastAssistant = assistantTurns[assistantTurns.length - 1].content;

  // Explicit request for a different/fresh answer
  if (EXPLICIT_ALTERNATIVE_REGEX.test(prompt)) {
    return { isRepeat: true, repeatedTurnContent: lastAssistant };
  }

  // Repeated "Suggest Answer" when no new transcript arrived
  if (intentHint.isGeneric) {
    const prevWasGeneric = isGenericAskPrompt(lastUser);
    if (prevWasGeneric && !hasMeaningfulTranscriptDelta) {
      return { isRepeat: true, repeatedTurnContent: lastAssistant };
    }
    return { isRepeat: false, repeatedTurnContent: null };
  }

  // Repeated "Recap" when no new transcript arrived
  if (intentHint.isRecap) {
    const prevWasRecap = isRecapPrompt(lastUser);
    if (prevWasRecap && !hasMeaningfulTranscriptDelta) {
      return { isRepeat: true, repeatedTurnContent: lastAssistant };
    }
    return { isRepeat: false, repeatedTurnContent: null };
  }

  // Repeated "Analyze Screen" without a fresh screenshot
  if (intentHint.isScreen && !intentHint.hasImage) {
    const prevWasScreen = isScreenFocusedPrompt(lastUser);
    if (prevWasScreen) {
      return { isRepeat: true, repeatedTurnContent: lastAssistant };
    }
  }

  // Compare typed prompt against last 3 user prompts
  const normCurr = normalizeText(prompt);
  const currTokens = tokenizeContent(prompt);

  const recentUsers = userTurns.slice(-3);
  for (let i = recentUsers.length - 1; i >= 0; i--) {
    const prev = recentUsers[i].content;
    const normPrev = normalizeText(prev);
    if (normCurr && normCurr === normPrev) {
      // Exact same typed question again (unless it's a fresh screen capture that might show a new screen!)
      if (intentHint.isScreen && intentHint.hasImage) {
        return { isRepeat: true, repeatedTurnContent: lastAssistant };
      }
      return { isRepeat: true, repeatedTurnContent: lastAssistant };
    }

    const prevTokens = tokenizeContent(prev);
    if (currTokens.size >= 2 && prevTokens.size >= 2) {
      let newTokenCount = 0;
      for (const t of currTokens) {
        if (!prevTokens.has(t)) newTokenCount++;
      }
      const sim = jaccardSimilarity(currTokens, prevTokens);
      // Only consider near-duplicate if ZERO new content keywords were introduced
      // (so "What is Redis?" vs "What is Kafka?" is NEVER mistaken for a repeat!)
      if (newTokenCount === 0 && sim >= 0.78) {
        return { isRepeat: true, repeatedTurnContent: lastAssistant };
      }
    }
  }

  return { isRepeat: false, repeatedTurnContent: null };
}

export function buildDynamicSystemPrompt(mode: ResponseMode, customContext?: string): string {
  const profileSection =
    customContext && customContext.trim()
      ? `\n\n[Active User Profile & Role Context]\n${customContext.trim()}\n(Ground your perspective, credentials, and phrasing in this profile whenever relevant.)`
      : "";

  const universalProgressionRule = `
Universal Multi-Turn & Anti-Repetition Rules:
- Always answer the LATEST user request and the newest conversation context.
- NEVER repeat, recycle, or lightly paraphrase your previous reply from conversation history.
- If the user asks a new question, pivot cleanly to the new question — do NOT stay stuck on an earlier topic or older transcript question.
- Never output robotic meta-commentary ("As an AI...", "Based on the transcript...", "Here is an answer...").`;

  switch (mode) {
    case "code_technical":
      return `You are Voiceflow AI, an elite software engineering co-pilot, debugger, and technical advisor.
You adapt dynamically to understand, explain, debug, optimize, and write production-quality code across any programming language, framework, or system architecture.

Formatting & Technical Delivery:
- Lead with a clear, direct diagnosis, solution, or takeaway in **bold**.
- Use clean syntax-highlighted fenced Markdown code blocks (\`\`\`ts, \`\`\`python, \`\`\`sql, etc.) whenever code, a fix, or an algorithm is needed.
- Explain *why* the code works (or why the bug happens), key edge cases, and Big-O time/space complexity when relevant.
- Do NOT force awkward first-person interview speech ("In my experience...") when the user simply wants to understand, debug, or write code. If they are in a live technical interview and need to speak it aloud, include a crisp 1-2 sentence verbal explanation before or after the code.
${universalProgressionRule}${profileSection}`;

    case "screen_adaptive":
      return `You are Voiceflow AI, an elite real-time visual co-pilot with sharp comprehension across code editors, terminals, slides, charts, quizzes, emails, and documents.

Adaptive Visual Delivery:
- Inspect everything visible in the attached screenshot carefully and adapt your format to what is actually on screen:
  1. **Code / IDE / Terminal / Error / Coding Problem**: State the bug, output, or optimal approach FIRST in **bold**, provide the clean corrected/solution code in a fenced code block, and add 1-2 crisp notes on complexity or edge cases.
  2. **Question / Multiple Choice / Assessment / Form**: State the exact direct answer FIRST in **bold**, followed by a brief 1-2 sentence justification.
  3. **Slide / Dashboard / Chart / Document / Live Meeting**: State the core takeaway FIRST in **bold**, followed by 2-3 sharp talking points ready to speak aloud.
- NEVER output square-bracket placeholders or fill-in-the-blank templates like [your background/education], [Insert University], or [Your Company]. Every word must be immediately speakable aloud as-is.
- If this is a follow-up or second screen capture, examine what is visibly on screen NOW: if the screen changed, answer the NEW content completely; if it shows the same content, give a clearer, deeper, or different angle rather than repeating your previous answer.
${universalProgressionRule}${profileSection}`;

    case "recap_brief":
      return `You are Voiceflow AI, a crisp real-time meeting summarizer.

Recap Delivery:
- Give a sharp 1-sentence **bold** headline capturing the main theme of the discussion.
- Follow with 2-3 concise bullet points highlighting the key points, decisions, or open questions from the transcript.
- Strictly rely ONLY on the provided transcript. If the transcript is empty or very short, state that briefly and honestly.
${universalProgressionRule}${profileSection}`;

    case "fresh_alternative":
      return `You are Voiceflow AI, an elite adaptive co-pilot.
The user already received a prior answer in the conversation history and is explicitly asking again or requesting a fresh take.

STRICT Fresh-Response Rules:
- You MUST deliver a meaningfully DIFFERENT response from your previous reply above.
- Do NOT reuse the same opening line, the same phrasing, or the same repeated bullets.
- Shift to a genuinely new layer of value: a concrete real-world example, a code snippet/implementation, a sharper alternative framing, deeper nuance/trade-offs, or a smart counter-question they can ask.
- NEVER output square-bracket placeholders or fill-in-the-blank templates like [Insert University], [Your Company], [Number], or [Specific Area]. Every single word must be immediately speakable aloud as-is.
- STRICT length limit for spoken replies: 50–85 words total (1 crisp **bold** sentence + 2 concise bullets; NEVER exceed 90 words unless writing code).
- Match the format naturally to the topic (code blocks for technical/coding topics; crisp spoken bullets for live meeting answers; direct clear explanation for conceptual questions).
${universalProgressionRule}${profileSection}`;

    case "direct_analytical":
      return `You are Voiceflow AI, an intelligent, adaptive real-time co-pilot across any profession, technical domain, or subject matter.

Dynamic Response Delivery:
- Answer the user's EXACT question directly and accurately — lead with the core answer in **bold**.
- Dynamically choose the best format for what they asked: concise paragraphs, sharp bullets, a comparison, a step-by-step breakdown, or fenced code blocks if technical.
- On follow-ups, build directly on the prior turns without repeating points you already stated.
- Only draw on the meeting transcript if it is directly relevant to the user's question; never let unrelated background transcript pull you off-topic.
${universalProgressionRule}${profileSection}`;

    case "spoken_teleprompter":
    default:
      return `You are Voiceflow AI, an elite real-time live meeting assistant, speaking co-pilot, and executive teleprompter.
You assist the user discreetly, naturally, and authoritatively in any live meeting, interview, presentation, or discussion across ANY profession, industry, or subject matter.

Spoken Teleprompter Delivery:
- State the direct answer, solution, or core takeaway FIRST in **bold** (1 crisp sentence).
- Follow with ONLY 2 concise, high-impact bullet points the user can speak aloud naturally in first person ("I...", "My approach...", "We...").
- STRICT teleprompter length budget: **50–85 words total** (NEVER exceed 90 words). Short, punchy sentences that can be glanced at and spoken smoothly in under 25 seconds.
- NEVER output square-bracket placeholders or fill-in-the-blank templates like [Insert University], [Your Company], [Number], or [Specific Area]. If personal credentials or dates are not in the user profile or transcript, phrase smoothly and naturally in general first-person terms without inventing fake school/company names or brackets.
- If the transcript shows [YOU] speaking, treat [YOU] as what the user ALREADY said — NEVER parrot it back as a confirmation ("Yes, that aligns with my expertise..."). Answer ONLY what [THEM] asked, or advance the conversation forward.
- Dynamically mirror the vocabulary and depth of the subject matter being discussed (and include a concise code snippet only if the live meeting prompt explicitly asks to write/debug code).
- Prioritize the NEWEST spoken speech in the transcript — never re-answer an old question that was already addressed earlier.
${universalProgressionRule}${profileSection}`;
  }
}

export function buildEnhancedInterviewPrompt(
  rawPrompt: string,
  transcript: string,
  hasImageOrOptions: boolean | ContextAnalysisOptions = false
): EnhancedPromptResult {
  const options: ContextAnalysisOptions =
    typeof hasImageOrOptions === "boolean"
      ? { hasImage: hasImageOrOptions }
      : hasImageOrOptions || {};

  const hasImage = Boolean(options.hasImage);
  const cleanHistory = sanitizeConversationHistory(options.history || []);
  const turnNumber = cleanHistory.filter((h) => h.role === "assistant").length + 1;
  const trimmed = (rawPrompt || "").trim();
  const cleanTranscript = (transcript || "").trim();
  const selectedTranscriptText = cleanSentence((options.selectedTranscriptText || "").trim());

  const delta = splitTranscriptDelta(
    cleanTranscript,
    options.previousTranscriptLength,
    options.previousTranscriptTail
  );

  const isRecap = isRecapPrompt(trimmed);
  const isScreenFocused = isScreenFocusedPrompt(trimmed);
  const isGeneric = isGenericAskPrompt(trimmed);
  const isCode = isCodeOrTechnicalPrompt(trimmed, cleanHistory);
  const isFollowUp = isFollowUpPrompt(trimmed, cleanHistory);

  const lastAssistantText =
    [...cleanHistory].reverse().find((h) => h.role === "assistant")?.content || null;
  const priorAnsweredQuestion =
    (options.previousAnsweredQuestion || "").trim() || extractPriorAnsweredQuestion(cleanHistory);

  // Detect whether the NEW transcript delta actually contains NEW speech from the OTHER party ([THEM]),
  // rather than ONLY `[YOU]` speaking your own answer aloud or a single-channel first-person reply!
  // IMPORTANT: Only treat `[YOU]`-only deltas as user monologue when `[THEM]` is actually active in this
  // session AND the `[YOU]` delta does NOT contain an explicit interviewer question (speaker-bleed rescue!).
  const allTranscriptTurns = parseConversationTurns(cleanTranscript);
  const hasAnyThemInTranscript = allTranscriptTurns.some(
    (t) => t.speaker === "them" && !isPureBackchannel(t.text)
  );
  const newDeltaTurns = delta.hasMeaningfulDelta ? parseConversationTurns(delta.newTranscript) : [];
  let rawDeltaQuestion = delta.hasMeaningfulDelta
    ? extractLastQuestion(delta.newTranscript, priorAnsweredQuestion)
    : null;
  // If delta split a question mid-sentence (e.g. fragment starts lowercase or is very short without context),
  // recover the complete stitched question from cleanTranscript while still excluding priorAnsweredQuestion.
  if (
    rawDeltaQuestion &&
    (/^[a-z]/.test(rawDeltaQuestion) || rawDeltaQuestion.split(/\s+/).length <= 4)
  ) {
    const stitchedFullQ = extractLastQuestion(cleanTranscript, priorAnsweredQuestion, lastAssistantText);
    if (
      stitchedFullQ &&
      stitchedFullQ.length > rawDeltaQuestion.length + 6 &&
      (stitchedFullQ.toLowerCase().includes(rawDeltaQuestion.replace(/[?.!]+$/, "").toLowerCase()) ||
        jaccardSimilarity(tokenizeContent(stitchedFullQ), tokenizeContent(rawDeltaQuestion)) >= 0.35)
    ) {
      rawDeltaQuestion = stitchedFullQ;
    }
  }
  // Cursor-shift rescue: if speaker-bleed deduplication slightly shrunk transcript length right as a new
  // question arrived after priorAnsweredQuestion, detect that genuinely newer question so it's never treated as a repeat!
  let rescuedNewQuestionAfterShift: string | null = null;
  if (!delta.hasMeaningfulDelta && isGeneric && priorAnsweredQuestion && cleanTranscript.length > 0) {
    const candidateQ = extractLastQuestion(cleanTranscript, priorAnsweredQuestion, lastAssistantText);
    if (candidateQ) {
      const simToPrior = jaccardSimilarity(tokenizeContent(candidateQ), tokenizeContent(priorAnsweredQuestion));
      if (simToPrior < 0.4) {
        const lowerFull = cleanTranscript.toLowerCase();
        const priorCore = priorAnsweredQuestion.replace(/[?.!]+$/, "").toLowerCase().slice(-28);
        const candCore = candidateQ.replace(/[?.!]+$/, "").toLowerCase().slice(-24);
        const priorPos = priorCore.length >= 8 ? lowerFull.lastIndexOf(priorCore) : -1;
        const candPos = candCore.length >= 6 ? lowerFull.lastIndexOf(candCore) : -1;
        if (candPos > priorPos) {
          rescuedNewQuestionAfterShift = candidateQ;
        }
      }
    }
  }
  const deltaHasExplicitInterviewerQuestion = Boolean(
    rawDeltaQuestion &&
      !USER_META_SELF_QUESTION_REGEX.test(rawDeltaQuestion) &&
      !FIRST_PERSON_SELF_REPLY_REGEX.test(rawDeltaQuestion)
  );
  const deltaIsOnlyYouSpeaking =
    delta.hasMeaningfulDelta &&
    hasAnyThemInTranscript &&
    newDeltaTurns.length > 0 &&
    newDeltaTurns.every((t) => t.speaker === "you") &&
    !deltaHasExplicitInterviewerQuestion;

  const newQuestion =
    (delta.hasMeaningfulDelta && !deltaIsOnlyYouSpeaking ? rawDeltaQuestion : null) ||
    rescuedNewQuestionAfterShift;

  // Single-channel self-reply guard: if Turn 1 already answered a question and the new delta has
  // NO question/prompt AND is a short first-person reply ("I'm actually not licensed, no.")
  // echoing tokens from the prior question/answer, do NOT mistake the user's own reply for a new question!
  const cleanedNewDeltaText = cleanSentence(delta.newTranscript);
  const deltaLooksLikeUserSelfReply = (() => {
    if (!delta.hasMeaningfulDelta || deltaIsOnlyYouSpeaking || newQuestion || turnNumber <= 1) return false;
    if (newDeltaTurns.some((t) => t.speaker === "them")) return false;
    if (!cleanedNewDeltaText || cleanedNewDeltaText.includes("?")) return false;
    if (!FIRST_PERSON_SELF_REPLY_REGEX.test(cleanedNewDeltaText)) return false;
    if (cleanedNewDeltaText.length > 260) return false;
    // Confirm topical tie to previous question or answer (or concise direct answer like "Yes, I am ready.")
    const deltaTokens = tokenizeContent(cleanedNewDeltaText);
    const refTokens = tokenizeContent(`${priorAnsweredQuestion || ""} ${lastAssistantText || ""}`);
    if (deltaTokens.size === 0) return true;
    let shared = 0;
    for (const t of deltaTokens) if (refTokens.has(t)) shared++;
    return shared >= 1 || deltaTokens.size <= 5;
  })();

  const hasActionableNewDelta =
    (delta.hasMeaningfulDelta && !deltaIsOnlyYouSpeaking && !deltaLooksLikeUserSelfReply) ||
    Boolean(rescuedNewQuestionAfterShift);

  const effectiveDeltaForRepeat = isGeneric ? hasActionableNewDelta : delta.hasMeaningfulDelta;

  const repeatCheck = detectRepeatAsk(trimmed, cleanHistory, effectiveDeltaForRepeat, {
    isGeneric,
    isRecap,
    isScreen: isScreenFocused,
    hasImage,
  });

  const newTopic = hasActionableNewDelta ? extractRecentTopic(delta.newTranscript) : null;

  const fallbackQuestion =
    newQuestion ||
    extractLastQuestion(
      cleanTranscript,
      turnNumber > 1 ? priorAnsweredQuestion : null,
      turnNumber > 1 ? lastAssistantText : null
    );
  const fallbackTopic = newTopic || extractRecentTopic(cleanTranscript);

  // Also detect repeat when a freshly extracted question is essentially the SAME question just answered
  const sameQuestionAsPrior = Boolean(
    isGeneric &&
      priorAnsweredQuestion &&
      (newQuestion || fallbackQuestion) &&
      jaccardSimilarity(
        tokenizeContent(newQuestion || fallbackQuestion || ""),
        tokenizeContent(priorAnsweredQuestion)
      ) >= 0.72
  );

  const isRepeatAsk = Boolean(options.forceFreshAngle || repeatCheck.isRepeat || sameQuestionAsPrior);

  const buildTranscriptBlock = (
    primary: boolean,
    includeBackgroundOnly = false
  ): string => {
    if (!cleanTranscript) {
      return primary ? "\n\nRecent Transcript Context:\nNone captured yet." : "";
    }

    if (includeBackgroundOnly) {
      const compactBg = cleanTranscript.slice(-700);
      return `\n\n[Optional Meeting Background — ONLY reference if directly relevant to the user's question]:\n${compactBg}`;
    }

    if (delta.earlierTranscript && delta.hasMeaningfulDelta) {
      return `\n\n[Earlier Meeting Context (already covered background)]:\n${delta.earlierTranscript}\n\n[NEW Transcript Spoken Since Last Reply — PRIORITIZE THIS]:\n${delta.newTranscript}`;
    }

    return `\n\nRecent Transcript Context:\n${cleanTranscript.slice(-4500)}`;
  };

  let intent: PromptIntent;
  let responseMode: ResponseMode;
  let extractedQuestion: string | null = null;
  let targetPrompt = "";
  let isTranscriptRelevant = false;
  let recommendedTemperature = 0.35;
  let userMessageContent = "";

  // ------------------------------------------------------------------
  // 1. Explicit Meeting Recap / Summary
  // ------------------------------------------------------------------
  if (isRecap) {
    intent = "recap";
    isTranscriptRelevant = true;
    responseMode = isRepeatAsk ? "fresh_alternative" : "recap_brief";
    recommendedTemperature = isRepeatAsk ? 0.6 : 0.25;
    extractedQuestion = null;

    targetPrompt = isRepeatAsk
      ? `[User Request]: "${trimmed}"
[Anti-Repetition Note]: You already gave a recap in the previous turn and no new transcript arrived yet. Provide a DIFFERENT perspective — for example, concrete action items, open risks/questions, or next steps derived from the transcript rather than repeating the same summary.`
      : `[User Request]: "${trimmed}"
[Task]: Summarize what has actually been discussed in the meeting transcript below.
- Give a crisp 1-sentence headline in **bold** capturing the main theme right now.
- Follow with 2 to 3 concise bullet points highlighting the key points, decisions, or questions raised.
- Strictly rely ONLY on the provided transcript. If the transcript is empty or very short, state that briefly and clearly.`;

    userMessageContent = `${targetPrompt}${buildTranscriptBlock(true)}`;
  }
  // ------------------------------------------------------------------
  // 2. Visual Screen Analysis (with attached image)
  // ------------------------------------------------------------------
  else if (hasImage && (isScreenFocused || isGeneric)) {
    intent = "screen";
    responseMode = isCode ? "code_technical" : "screen_adaptive";
    isTranscriptRelevant = Boolean(cleanTranscript && cleanTranscript.length > 20);
    recommendedTemperature = isCode ? 0.2 : isRepeatAsk ? 0.35 : 0.3;
    extractedQuestion = "Screen Visual Analysis";

    const repeatScreenGuidance = isRepeatAsk
      ? "\n- IMPORTANT: This is a NEW screen capture after a previous analysis. Carefully inspect what is visible NOW — if the screen changed to new content/questions/code, answer the NEW content completely. If the screen shows the same problem, give a clearer, deeper, or alternative explanation instead of repeating your previous reply."
      : "";

    const customFocus =
      !isGeneric && !/^analyze what is on my screen/i.test(trimmed)
        ? `\n[Specific User Focus]: "${trimmed}"`
        : "";

    targetPrompt = `[Screen Visual Analysis Task]: Inspect what is actively displayed in the attached screenshot right now.${customFocus}
- Dynamically adapt your answer to what is visible:
  * If code, an IDE, terminal error, or coding problem is shown: diagnose or solve it directly with a clean fenced code block and concise explanation.
  * If a question, quiz, or prompt is shown: state the exact answer FIRST in **bold** with brief reasoning (NEVER emit [your background] or [Insert ...] bracket placeholders).
  * If slides, charts, docs, or meeting notes are shown: state the key takeaway FIRST in **bold** followed by 2-3 sharp talking points.${repeatScreenGuidance}`;

    userMessageContent = `${targetPrompt}${
      isTranscriptRelevant ? buildTranscriptBlock(false, true) : ""
    }`;
  }
  // ------------------------------------------------------------------
  // 3. Code Understanding / Debugging / Algorithm / Technical Request
  // ------------------------------------------------------------------
  else if (isCode) {
    intent = "code";
    isTranscriptRelevant = isTranscriptRelevantPrompt(trimmed, cleanTranscript, "code");
    responseMode = isRepeatAsk ? "fresh_alternative" : "code_technical";
    recommendedTemperature = isRepeatAsk ? 0.58 : 0.2;
    extractedQuestion = null;

    const imageNote = hasImage
      ? "\n[Attached Screenshot]: Inspect the code, error, or diagram in the attached image directly."
      : "";

    const repeatNote = isRepeatAsk
      ? "\n[Anti-Repetition Directive]: The user is asking again or requesting a different approach. Do NOT repeat your previous code or explanation — provide an alternative algorithm/implementation, deeper line-by-line walkthrough, concrete edge-case test, or optimization."
      : "";

    const followUpNote =
      isFollowUp && !isRepeatAsk
        ? "\n[Follow-Up Continuity]: Build directly on the code and explanation from the previous turn — do NOT re-explain what you already covered."
        : "";

    targetPrompt = `[Technical / Code Request]: "${trimmed}"${imageNote}${repeatNote}${followUpNote}
[Task]: Directly understand, explain, debug, or implement what the user asked.
- Start with the direct answer, root cause, or core idea in **bold**.
- Use clean fenced Markdown code blocks with the proper language tag when showing code, fixes, or examples.
- Include brief complexity or edge-case notes where helpful.`;

    userMessageContent = `${targetPrompt}${
      isTranscriptRelevant ? buildTranscriptBlock(false, true) : ""
    }`;
  }
  // ------------------------------------------------------------------
  // 4. Generic Live Assist ("Suggest Answer" / "What should I say?")
  //    (Also handles explicit user-selected transcript turn/excerpt!)
  // ------------------------------------------------------------------
  else if (isGeneric || Boolean(selectedTranscriptText)) {
    intent = "suggest";
    isTranscriptRelevant = true;

    if (selectedTranscriptText) {
      // User EXPLICITLY selected a specific turn or excerpt from the transcript to answer!
      // Lock 100% onto their selection — never override with auto-extraction or repeat-ask drift.
      const isSelectedCode =
        isCodeOrTechnicalPrompt(selectedTranscriptText, cleanHistory) ||
        TRANSCRIPT_CODE_HINT_REGEX.test(selectedTranscriptText);
      const asksForSelectedCodeImpl = /\b(write|implement|code|fix|debug|refactor|convert|sql query|function|algorithm)\b/i.test(
        selectedTranscriptText
      );
      extractedQuestion = selectedTranscriptText;
      responseMode = options.forceFreshAngle
        ? "fresh_alternative"
        : isSelectedCode
          ? "code_technical"
          : "spoken_teleprompter";
      recommendedTemperature = options.forceFreshAngle ? 0.65 : isSelectedCode ? 0.25 : 0.35;

      const selectedFormatRule = isSelectedCode
        ? asksForSelectedCodeImpl
          ? "This selected prompt asks for code: lead with a crisp 1-2 sentence spoken intuition in **bold** FIRST, followed by clean fenced code and Big-O complexity."
          : "This is a technical/code question: state the direct answer FIRST in **bold**, followed by 2 concise spoken bullets (and clean code only if helpful)."
        : "State your direct spoken answer FIRST in **bold** (1 crisp sentence), followed by ONLY 2 concise first-person speaking bullets (STRICT 50–85 words total).";

      targetPrompt = `[User-Selected Transcript Prompt]: The user explicitly selected the exact transcript excerpt below to answer right now.
- Answer ONLY this exact selected question/point directly in first person ("I...", "My approach...", "We...") so they can speak it immediately.
- Use the surrounding meeting transcript below ONLY as background context — do NOT drift to an earlier or later question.
- NEVER use square-bracket placeholders like [Insert X] or [Your Company].
- ${selectedFormatRule}`;

      userMessageContent = `${targetPrompt}${
        cleanTranscript ? buildTranscriptBlock(false, true) : ""
      }\n\n<<< USER-SELECTED TRANSCRIPT QUESTION TO ANSWER RIGHT NOW >>>\n"${selectedTranscriptText}"`;
    } else {
    const activeSegmentText = hasActionableNewDelta ? delta.newTranscript : cleanTranscript;
    const isLiveCodingPrompt = TRANSCRIPT_CODE_HINT_REGEX.test(activeSegmentText.slice(-1200));
    const asksForNewCodeImplementation = /\b(write|implement|code|fix|debug|refactor|convert|sql query|function|algorithm)\b/i.test(
      activeSegmentText.slice(-500)
    );
    const liveCodingTaskInstruction = asksForNewCodeImplementation
      ? "This is a live coding prompt: give a crisp 1-2 sentence spoken intuition in **bold** FIRST, followed by clean fenced code and Big-O complexity."
      : "This is a live technical follow-up (e.g., complexity, edge cases, or trade-offs): state the direct answer FIRST in **bold** (including Big-O if asked), followed by 2 concise spoken bullets. Do NOT re-paste code already shown in the previous turn.";

    if (hasActionableNewDelta && !isRepeatAsk) {
      // Fresh speech from the other side arrived since last reply -> prioritize ONLY the new speech!
      const focusItem = newQuestion || newTopic || fallbackQuestion || fallbackTopic;
      extractedQuestion = focusItem;
      responseMode = isLiveCodingPrompt ? "code_technical" : "spoken_teleprompter";
      recommendedTemperature = isLiveCodingPrompt ? 0.25 : 0.35;

      targetPrompt = `[Task]: Deliver a direct, ready-to-use spoken response specifically answering the NEWEST question/moment at the bottom below.
- If the transcript has [THEM] and [YOU] speaker tags, ALWAYS answer what [THEM] just asked or raised — NEVER parrot [YOU]'s own remarks or repeat an earlier answered question.
- NEVER use square-bracket placeholders like [Insert X] or [Your Company].
- ${
        isLiveCodingPrompt
          ? liveCodingTaskInstruction
          : "State your direct spoken answer FIRST in **bold** (1 sentence), followed by ONLY 2 concise first-person speaking bullets (STRICT 50–85 words total)."
      }`;

      userMessageContent = `${targetPrompt}${buildTranscriptBlock(true)}\n\n<<< ACTIVE QUESTION / MOMENT TO ANSWER RIGHT NOW >>>\n"${focusItem}"`;
    } else if (isRepeatAsk) {
      // User clicked "Suggest Answer" again with NO new [THEM] question (or only [YOU] spoke aloud) -> MUST give a fresh, distinct angle!
      // On single-channel self-reply, avoid resurrecting the old Q1 into extractedQuestion while still giving continuation help.
      const activeAnchor = deltaLooksLikeUserSelfReply
        ? null
        : priorAnsweredQuestion || fallbackQuestion || fallbackTopic;
      extractedQuestion = activeAnchor;
      responseMode = "fresh_alternative";
      recommendedTemperature = 0.68;

      const userSpokeNote =
        deltaIsOnlyYouSpeaking || deltaLooksLikeUserSelfReply
          ? `\n- Note: The user ([YOU]) just spoke part of their own reply ("${cleanedNewDeltaText.slice(0, 180)}"), and the other person has NOT asked a new question yet. Help the user CONTINUE or STRENGTHEN their answer smoothly with a fresh concrete point, proof metric, or natural wrap-up — NEVER parrot back what [YOU] just said!`
          : "";

      targetPrompt = `[Repeat Assist Request — Turn #${turnNumber}]: The user clicked "Suggest Answer" again on the same conversation point${
        activeAnchor ? ` ("${activeAnchor}")` : ""
      } with no new question from the other speaker yet.${userSpokeNote}
[STRICT Anti-Repetition Task]:
- Look at your previous answer in the conversation history above. Do NOT repeat it, do NOT reuse its opening line, and do NOT just reword the exact same points.
- Deliver a genuinely DIFFERENT, high-value alternative the user can say aloud directly in first person ("I...", "In one project...", "Another angle I focus on...") — NEVER give meta-coaching like "Frame your answer around..." and NEVER use [Insert ...] placeholders.
- Pick a distinct angle from your prior reply, such as:
  1. A concrete real-world example, trade-off, or metric-backed story illustrating the point, OR
  2. A sharper, more concise alternative framing / deeper technical nuance, OR
  3. A smart follow-up question the user can ask back to lead the conversation.
- Lead with the new spoken core point in **bold**, followed by 2 fresh first-person talking points (STRICT 50–85 words total).`;

      userMessageContent = `${targetPrompt}${buildTranscriptBlock(true)}${
        activeAnchor ? `\n\n<<< SAME ACTIVE POINT (GIVE A FRESH DIFFERENT ANGLE) >>>\n"${activeAnchor}"` : ""
      }`;
    } else if (fallbackQuestion) {
      extractedQuestion = fallbackQuestion;
      responseMode = isLiveCodingPrompt ? "code_technical" : "spoken_teleprompter";
      recommendedTemperature = isLiveCodingPrompt ? 0.25 : 0.35;

      targetPrompt = `[Task]: Answer ONLY the active question/moment highlighted at the bottom below immediately and directly.
- If the transcript has [THEM] and [YOU] speaker tags, answer what [THEM] asked. Ignore older already-passed questions from earlier in the conversation.
- NEVER use square-bracket placeholders like [Insert X] or [Your Company].
- ${
        isLiveCodingPrompt
          ? liveCodingTaskInstruction
          : "State your direct spoken answer FIRST in **bold** (1 sentence), followed by ONLY 2 concise first-person speaking bullets (STRICT 50–85 words total)."
      }`;

      userMessageContent = `${targetPrompt}${buildTranscriptBlock(true)}\n\n<<< ACTIVE QUESTION / MOMENT TO ANSWER RIGHT NOW >>>\n"${fallbackQuestion}"`;
    } else if (fallbackTopic) {
      extractedQuestion = fallbackTopic;
      responseMode = isLiveCodingPrompt ? "code_technical" : "spoken_teleprompter";
      recommendedTemperature = 0.35;

      targetPrompt = `[Task]: Provide the strongest, most articulate first-person speaking response for the active discussion moment at the bottom below.
- State your core point or answer FIRST in **bold** (1 sentence).
- Follow with ONLY 2 crisp, confident talking points (STRICT 50–85 words total) with zero [Insert ...] placeholders.`;

      userMessageContent = `${targetPrompt}${buildTranscriptBlock(true)}\n\n<<< ACTIVE DISCUSSION MOMENT RIGHT NOW >>>\n"${fallbackTopic}"`;
    } else {
      extractedQuestion = null;
      responseMode = hasImage ? "screen_adaptive" : "spoken_teleprompter";
      recommendedTemperature = 0.4;

      targetPrompt = hasImage
        ? `[Screen Visual Analysis]: Inspect what is actively displayed on screen and give the direct answer, code solution, or speaking points in **bold** first.`
        : `[Task]: No transcript speech has been captured yet. Give 2 brief, natural opening talking points the user can use to kick off or clarify the agenda of the call.`;

      userMessageContent = targetPrompt;
    }
    }
  }
  // ------------------------------------------------------------------
  // 5. Conversational Follow-Up / Refinement / Pivot on Prior Turn
  // ------------------------------------------------------------------
  else if (isFollowUp) {
    intent = "followup";
    isTranscriptRelevant = isTranscriptRelevantPrompt(trimmed, cleanTranscript, "followup");
    const wantsFresh = isRepeatAsk || EXPLICIT_ALTERNATIVE_REGEX.test(trimmed);
    responseMode = wantsFresh ? "fresh_alternative" : "direct_analytical";
    recommendedTemperature = wantsFresh ? 0.65 : 0.4;
    extractedQuestion = null;

    targetPrompt = `[User Follow-Up (Turn #${turnNumber})]: "${trimmed}"
${hasImage ? "[Attached Screenshot]: Refer directly to the attached image.\n" : ""}[Task]: Build directly on the prior turns in conversation history to fulfill this exact follow-up request.
- Do NOT repeat points you already gave in your previous reply — focus exclusively on the new angle, clarification, example, or refinement requested.
- Lead with the key point in **bold**, adapting your format naturally (bullets, prose, table, or code block as needed).`;

    userMessageContent = `${targetPrompt}${
      isTranscriptRelevant ? buildTranscriptBlock(false, true) : ""
    }`;
  }
  // ------------------------------------------------------------------
  // 6. Custom Explicit User Question (Dynamic & Transcript-Aware Without Hijacking)
  // ------------------------------------------------------------------
  else {
    intent = "custom";
    isTranscriptRelevant = isTranscriptRelevantPrompt(trimmed, cleanTranscript, "custom");
    responseMode = isRepeatAsk
      ? "fresh_alternative"
      : hasImage
        ? "screen_adaptive"
        : "direct_analytical";
    recommendedTemperature = isRepeatAsk ? 0.65 : 0.35;
    extractedQuestion = isTranscriptRelevant ? fallbackQuestion : null;

    const repeatDirective = isRepeatAsk
      ? `\n[STRICT Anti-Repetition Directive]: The user asked this same question again (Turn #${turnNumber}). Look at your previous answer in history — do NOT repeat it. Give a genuinely different, deeper, or alternative explanation, new examples, or a sharper angle.`
      : "";

    const transcriptInstruction = isTranscriptRelevant
      ? "Use the relevant meeting transcript context below alongside conversation history."
      : "Answer the user's exact question directly — ignore any unrelated background meeting chatter.";

    targetPrompt = `[User Request]: "${trimmed}"
${hasImage ? "[Attached Screenshot]: An active screenshot is attached — inspect and refer to it directly.\n" : ""}${repeatDirective}
[Task]: ${transcriptInstruction}
- State the direct answer FIRST in **bold**.
- Adapt your structure naturally to what the user asked (concise points, explanation, comparison, or code if relevant).`;

    userMessageContent = `${targetPrompt}${
      isTranscriptRelevant
        ? buildTranscriptBlock(true)
        : cleanTranscript
          ? buildTranscriptBlock(false, true)
          : ""
    }`;
  }

  const systemPrompt = buildDynamicSystemPrompt(responseMode, options.customContext);

  return {
    intent,
    responseMode,
    targetPrompt,
    systemPrompt,
    userMessageContent,
    extractedQuestion,
    isRepeatAsk: selectedTranscriptText ? Boolean(options.forceFreshAngle) : isRepeatAsk,
    isFollowUp,
    isCodeRelated: isCode || responseMode === "code_technical",
    isTranscriptRelevant,
    hasTranscriptDelta: selectedTranscriptText
      ? true
      : isGeneric
        ? hasActionableNewDelta
        : delta.hasMeaningfulDelta,
    recommendedTemperature,
    turnNumber,
  };
}

/**
 * Minimal honest fallback retained only for legacy imports — live chat surfaces real retryable errors instead.
 */
export function synthesizeIntelligentFallback(params: {
  prompt: string;
  transcript: string;
  customContext?: string;
  hasImage?: boolean;
}): string {
  const { transcript } = params;
  const recent = extractRecentTopic(transcript);
  return recent
    ? `Connection interrupted before AI could respond. Recent transcript captured: "${recent.slice(0, 160)}". Please tap Retry.`
    : "Connection interrupted before AI could respond. Please tap Retry.";
}
