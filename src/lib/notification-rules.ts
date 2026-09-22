import type { AuditLog } from '@/types';

export interface RuleNotificationCandidate {
  id: string;
  title: string;
  body: string;
  link?: string;
  severity: 'info' | 'warning' | 'alert';
}

export function evaluateNotificationRules(data: {
  auditLogs?: AuditLog[];
}): RuleNotificationCandidate[] {
  const candidates: RuleNotificationCandidate[] = [];
  return candidates;
}
