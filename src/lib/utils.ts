import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function safeToDate(timestamp: any): Date {
  if (!timestamp) return new Date(0);
  
  let date: Date;
  if (timestamp instanceof Date) {
    date = timestamp;
  } else if (timestamp && typeof timestamp.toDate === 'function') {
    date = timestamp.toDate();
  } else if (timestamp && typeof timestamp === 'object' && timestamp.seconds !== undefined) {
    date = new Date(timestamp.seconds * 1000);
  } else if (typeof timestamp === 'number' || typeof timestamp === 'string') {
    date = new Date(timestamp);
  } else {
    date = new Date(timestamp);
  }

  return isNaN(date.getTime()) ? new Date(0) : date;
}

export async function getCountryFromIP(): Promise<string> {
  // Check session storage cache first
  try {
    const cached = sessionStorage.getItem('voiceflow_ip_country');
    if (cached) return cached;
  } catch (e) {
    // Ignore storage errors
  }

  let country = 'Unknown';

  // Ordered by reliability. freeipapi.com was first here but now answers with a
  // 302 and no Access-Control-Allow-Origin, so every call failed CORS and logged
  // a console error the try/catch cannot suppress - the browser logs a blocked
  // request regardless of whether the promise is handled.
  const providers: Array<{ url: string; read: (data: any) => string | undefined }> = [
    { url: 'https://ipwho.is/', read: (d) => (d?.success ? d.country : undefined) },
    { url: 'https://ipapi.co/json/', read: (d) => d?.country_name },
    { url: 'https://api.db-ip.com/v2/free/self', read: (d) => d?.countryName },
    { url: 'https://api.country.is/', read: (d) => d?.country },
  ];

  for (const provider of providers) {
    if (country !== 'Unknown') break;
    try {
      const res = await fetch(provider.url);
      if (!res.ok) continue;
      const value = provider.read(await res.json());
      if (value) country = value;
    } catch {
      // Provider unreachable or blocked - fall through to the next one.
    }
  }

  // Cache result if valid
  if (country !== 'Unknown') {
    try {
      sessionStorage.setItem('voiceflow_ip_country', country);
    } catch (e) {
      // Ignore storage errors
    }
  }

  return country;
}

export function formatDuration(secondsOrMinutes?: number, isSeconds = true): string {
  if (!secondsOrMinutes || secondsOrMinutes <= 0) return '0s';
  const totalSeconds = isSeconds ? Math.round(secondsOrMinutes) : Math.round(secondsOrMinutes * 60);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

export function estimateDurationFromTranscript(transcript?: string): string {
  if (!transcript || !transcript.trim()) return '1m';
  const words = transcript.trim().split(/\s+/).filter(Boolean).length;
  // Natural speaking rate: ~135 words per minute
  const estimatedSecs = Math.max(12, Math.round((words / 135) * 60));
  return formatDuration(estimatedSecs, true);
}

export function cleanSummaryForCard(raw?: string): string {
  if (!raw || typeof raw !== 'string') return "No transcript content recorded.";
  let text = raw.replace(/^SUMMARY:\s*/i, '').trim();

  // Strip Markdown code fences if any
  text = text.replace(/```[a-z]*\n[\s\S]*?```/gi, '');

  // Strip any leading section headers (e.g. "## Executive Summary", "**Executive Summary**", "Executive Summary")
  // repeatedly until we reach the actual body text
  let prev = '';
  while (prev !== text) {
    prev = text;
    text = text
      .replace(/^(?:#+\s*)?(?:\*\*)?(?:Executive Summary|Summary|Key Takeaways|Overview|Meeting Summary)(?:\*\*)?:?\s*/i, '')
      .trim();
  }

  // Strip remaining markdown headers (e.g. ## Key Points, ### Action Items)
  text = text.replace(/^#+\s+/gm, '');

  // Strip markdown bold / italic symbols (**bold** -> bold, *italic* -> italic)
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');

  // Clean bullet points
  text = text.replace(/^[•\-\*]\s+/gm, '• ');

  // Collapse 3+ linebreaks into 2
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return text || "No transcript content recorded.";
}

/**
 * Automatically converts raw or unformatted session summary text into
 * clean GitHub Markdown with executive sections and bullet points.
 */
export function formatRawSummaryToMarkdown(raw?: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw.replace(/^SUMMARY:\s*/i, '').trim();

  // Clean redundant duplicate headers (e.g. "## Executive Summary\n**Executive Summary**")
  text = text.replace(/(##\s*Executive Summary\s*\n+)(?:\*\*)?Executive Summary(?:\*\*)?[:\s]*/gi, '$1');
  text = text.replace(/^(\*\*)?Executive Summary(\*\*)?[:\s]*\n+(##\s*Executive Summary)/gi, '$3');

  // If already structured with Markdown headers and bullet points, return cleanly
  if (/^##\s+/m.test(text)) {
    return text;
  }

  // Check for common plain-text section headers and convert to Markdown
  const headerPatterns = [
    { pattern: /(?:^|\n)(?:Executive Summary|Overview|Summary):/i, replacement: '\n\n## Executive Summary\n' },
    { pattern: /(?:^|\n)(?:Key Takeaways|Key Points|Main Points|Highlights):/i, replacement: '\n\n## Key Takeaways\n' },
    { pattern: /(?:^|\n)(?:Action Items|Next Steps|Follow-ups|Todos):/i, replacement: '\n\n## Action Items\n' },
    { pattern: /(?:^|\n)(?:Discussion Notes|Discussion Highlights|Detailed Notes|Background):/i, replacement: '\n\n## Discussion Notes & Background\n' }
  ];

  let converted = text;
  let matchedExplicit = false;
  for (const { pattern, replacement } of headerPatterns) {
    if (pattern.test(converted)) {
      matchedExplicit = true;
      converted = converted.replace(pattern, replacement);
    }
  }

  converted = converted.replace(/^[•\-\*]\s+/gm, '• ');

  if (matchedExplicit && /^##\s+/m.test(converted)) {
    return converted.trim();
  }

  // Pure unformatted paragraphs or blob: split into intelligent sections
  const paragraphs = text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return text;

  // First paragraph or initial sentences become Executive Summary
  const execSummary = paragraphs[0];
  const remainingText = paragraphs.slice(1).join('\n\n');

  // Extract sentences from remaining text or entire text
  const sentences = (remainingText || execSummary)
    .split(/(?<=[.?!])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 5);

  const actionSentences: string[] = [];
  const keyPointSentences: string[] = [];

  for (const s of sentences) {
    const lower = s.toLowerCase();
    if (
      lower.includes('will ') ||
      lower.includes('should ') ||
      lower.includes('need to') ||
      lower.includes('action') ||
      lower.includes('assigned') ||
      lower.includes('follow up') ||
      lower.includes('next step') ||
      lower.includes('deadline') ||
      lower.includes('by ')
    ) {
      actionSentences.push(s);
    } else {
      keyPointSentences.push(s);
    }
  }

  let result = `## Executive Summary\n${execSummary}\n\n`;

  if (keyPointSentences.length > 0) {
    result += `## Key Takeaways\n`;
    keyPointSentences.slice(0, 5).forEach(kp => {
      result += `• ${kp}\n`;
    });
    result += `\n`;
  }

  if (actionSentences.length > 0) {
    result += `## Action Items & Next Steps\n`;
    actionSentences.slice(0, 4).forEach(act => {
      result += `• **Action**: ${act}\n`;
    });
  } else if (remainingText && remainingText !== execSummary) {
    result += `## Discussion Notes\n${remainingText}\n`;
  }

  return result.trim();
}
