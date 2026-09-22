export const AI_DAILY_COLLECTION = 'ai_daily_usage';

export interface AiDailyStats {
  intents?: Record<string, number>;
  keywords?: Record<string, number>;
  blocked?: Record<string, number>;
  hours?: Record<string, number>;
  plans?: Record<string, number>;
  businesses?: Record<string, number>;
  businessTokensIn?: Record<string, number>;
  businessTokensOut?: Record<string, number>;
  [key: string]: any;
}

export const INTENTS: any[] = [];
export const TOOL_GROUPS: any[] = [];

export function aiDailyDocId(dateStr: string) {
  return dateStr;
}

export function classifyPrompt(prompt: string) {
  return 'general';
}

export function extractKeywords(prompt: string) {
  return [];
}

export function trackAiUsage() {}

export function getAiAnalytics() {
  return {};
}

export function groupForTool(toolName: string): string {
  return 'general';
}

export function mergeCountMaps(maps: (Record<string, number> | undefined)[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const map of maps) {
    if (!map) continue;
    for (const [k, v] of Object.entries(map)) {
      result[k] = (result[k] || 0) + (Number(v) || 0);
    }
  }
  return result;
}

export function topEntries(map: Record<string, number>, limitCount = 10): { key: string; value: number }[] {
  return Object.entries(map)
    .map(([key, value]) => ({ key, value: Number(value) || 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limitCount);
}

export function recentDates(count: number): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}
