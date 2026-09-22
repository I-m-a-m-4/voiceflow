import { tool } from 'ai';
import { z } from 'zod';
import type { Firestore } from 'firebase-admin/firestore';

type Ctx = {
  db: Firestore;
  businessId: string;
  currency: string;
  ratingEnabled: boolean;
};

export function buildZenTools({ db, businessId }: Ctx) {
  return {
    getMeetingSummary: tool({
      description: 'Get AI generated summary and action items for a meeting.',
      inputSchema: z.object({
        meetingId: z.string().describe('ID of the meeting'),
      }),
      execute: async ({ meetingId }) => {
        try {
          const doc = await db.collection('meetings').doc(meetingId).get();
          if (!doc.exists) return { error: 'Meeting not found.' };
          const data = doc.data();
          if (data?.businessId !== businessId) return { error: 'Meeting not found.' };
          return {
            title: data?.title,
            summary: data?.summary || 'No summary available.',
            actionItems: data?.actionItems || [],
          };
        } catch (e: any) {
          return { error: `Failed to fetch meeting summary: ${e?.message}` };
        }
      },
    }),
  };
}

export const createZenTools = buildZenTools;

export function slimHistory(messages: any[]) {
  return messages || [];
}
