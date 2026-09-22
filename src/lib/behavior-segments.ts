export const FAMILY_META: Record<string, any> = {};

export function humanUsage(usage: any) {
  return '';
}

export type BehaviorSegment = 'active' | 'churn_risk' | 'power_user' | 'dormant' | 'never_activated' | 'onboarding_stalled' | 'invested_then_left' | 'feature_focused' | 'champion' | 'casual_active' | 'slipping';

export interface BehaviorProfile {
  segment: BehaviorSegment;
  userId?: string;
  contactable?: boolean;
  optedOut?: boolean;
  email?: string;
  topFeature?: string;
  unusedHighValue: string[];
  firstName: string;
  businessName: string;
  plan: string;
  usageSeconds: number;
  pageViews: number;
  topFeatureShare?: number;
  daysSinceSeen?: number | null;
  lastPage?: string;
  familiesTouched?: number;
}

export function getBehaviorSegment(): BehaviorSegment {
  return 'active';
}

export function behaviorSegmentCounts(profiles: any[] = []): Record<BehaviorSegment, number> {
  return {
    active: 0,
    churn_risk: 0,
    power_user: 0,
    dormant: 0,
    never_activated: 0,
    onboarding_stalled: 0,
    invested_then_left: 0,
    feature_focused: 0,
    champion: 0,
    casual_active: 0,
    slipping: 0,
  };
}

export function profileAudience(users: any[] = [], businesses: any[] = []): BehaviorProfile[] {
  return [];
}
