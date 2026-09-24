'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { requireSuperAdmin } from '@/actions/admin-guard';
export type ContentStrategyInput = any;
export type ContentStrategyOutput = any;

const PlatformStatsSchema = z.object({
  totalUsers: z.number().optional(),
  totalBusinesses: z.number().optional(),
  totalProducts: z.number().optional(),
  totalReceipts: z.number().optional(),
  platformGmv: z.number().optional(),
  averageSalesPerDay: z.number().optional(),
  platformAOV: z.number().optional(),
  topLocation: z.string().optional(),
  topIndustries: z.array(z.string()).optional(),
}).optional();

const ContentStrategyInputSchema = z.object({
  theme: z.string().describe('The core theme of the content (e.g., Offline POS, Employee theft, USD payouts).'),
  platform: z.string().describe('Target marketing platform: Medium, Substack, LinkedIn, Twitter.'),
  persona: z.string().describe('Target reader persona (e.g., Pharmacy owners, Boutique retailers).'),
  seedKnowledge: z.string().optional().describe('Optional custom context or stories to inject.'),
  platformStats: PlatformStatsSchema,
});

const SectionOutlineSchema = z.object({
  heading: z.string().describe('The section heading or title.'),
  talkingPoints: z.array(z.string()).describe('Core talking points, stats, or arguments to cover in this section.'),
});

const ContentStrategyOutputSchema = z.object({
  title: z.string().describe('Recommended title, headline, or hook for the post.'),
  seoKeywords: z.array(z.string()).describe('Target SEO keywords to optimize for.'),
  introduction: z.string().describe('A compelling introduction and hook paragraph (at least 4-5 sentences).'),
  outline: z.array(SectionOutlineSchema).describe('Step-by-step section outline for the article.'),
  ctaText: z.string().describe('Recommended Call-to-Action text incorporating voiceflow.space links.'),
  backlinkOpportunities: z.array(z.string()).describe('Recommended context or anchors for inserting backlinks.'),
  marketingPitch: z.string().describe('Strategic explanation of why this piece will resonate and convert readers.'),
});

// The types live in '@/types' and consumers import them from there directly.
// Do NOT re-export them here: a 'use server' file may only export async
// functions, and Next's SWC check rejects even a type-only re-export because
// it cannot tell types from values before stripping them.
// Server Action = public endpoint. This one is only ever called from the admin
// dashboard, so it takes the stricter owner check. The guard sits outside the
// try/catch deliberately: inside it, "Not authorized." would be swallowed and
// reported to the caller as a transient AI error.
export async function generateContentPlan(input: ContentStrategyInput, idToken?: string): Promise<ContentStrategyOutput> {
  await requireSuperAdmin(idToken);
  try {
    const result = await contentStrategyFlow(input);
    return result;
  } catch (error: any) {
    console.error("Content Strategy AI Flow failed:", error);
    throw new Error("Zen AI Content Director is busy or encountered an error. Please try again.");
  }
}

const prompt = ai.definePrompt({
  name: 'contentStrategyPrompt',
  input: { schema: ContentStrategyInputSchema },
  output: { schema: ContentStrategyOutputSchema },
  prompt: `You are Zen AI, a world-class growth marketing director and SaaS strategist for Voiceflow. Voiceflow is an undetectable, real-time AI Meeting Notetaker & Stealth Co-Pilot.

Your task is to take the provided theme, platform, persona, custom seed knowledge, and real-time live platform metrics from the Voiceflow admin dashboard, and generate a high-impact marketing content blueprint.

**CONTEXT ABOUT VOICEFLOW:**
- **Core Value Proposition**: Takes perfect meeting notes, transcribes live audio, and provides undetectable real-time AI assistance during calls.
- **Killer Feature**: Stealth Meeting Overlay Widget (MeetingWidget) with multimodal screen & transcript analysis (/api/ask-screen). Provides live prompts (*"What should I say next?"*, *"Fact check this"*, *"Summarize last 2 mins"*) during Zoom, Google Meet, and Teams calls without being detected.
- **Target Audience**: Executives, founders, software engineers, sales professionals, and consultants who need discreet live answers and automated transcription during critical calls.

**LIVE PLATFORM METRICS & DASHBOARD INSIGHTS:**
- Total Platform Users: {{platformStats.totalUsers}}
- Total Meetings Recorded: {{platformStats.totalMeetings}}
- Total Transcribed Minutes: {{platformStats.totalMinutes}}
- Total Stealth AI Queries Answered: {{platformStats.totalQueries}}
- Top Active Industries: {{platformStats.topIndustries}}

**INPUTS:**
- **Core Theme**: {{theme}}
- **Platform**: {{platform}}
- **Target Persona**: {{persona}}
- **Additional Seed Context**: {{seedKnowledge}}

**OUTPUT INSTRUCTIONS:**
- Generate a JSON response matching the output schema.
- **CRITICAL**: The title, hook, and outline MUST directly quote or reference the provided live metrics where appropriate (e.g., "how we helped process over ₦[GMV] across [totalBusinesses] stores", or referencing the top location/industry, or offline-sales-saved figures).
- Write highly engaging titles like "Why Nigerian Retailers Lose ₦200,000+ to Internet blackouts (and How to Fix It)" or based on the live statistics.
- Make the content blueprint detailed, deeply practical, and tailored to the target platform (e.g., shorter and hook-heavy for LinkedIn; longer and keyword-rich for Medium/Substack). All CTA recommendations must guide the reader back to voiceflow.space.`,
});

const contentStrategyFlow = ai.defineFlow(
  {
    name: 'contentStrategyFlow',
    inputSchema: ContentStrategyInputSchema,
    outputSchema: ContentStrategyOutputSchema,
  },
  async (input: any) => {
    const { output } = await prompt(input);
    return output!;
  }
);
