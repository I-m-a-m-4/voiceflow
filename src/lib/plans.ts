export interface Plan {
  id: string;
  name: string;
  price: number;
  features: string[];
}

export const SUBSCRIPTION_PLANS: Record<string, Plan> = {
  basic: {
    id: "basic",
    name: "Zen Basic",
    price: 0,
    features: [
      "100 minutes of transcription/mo",
      "Standard meeting summaries",
      "Basic AI interactions",
    ],
  },
  pro: {
    id: "pro",
    name: "Zen Pro",
    price: 9,
    features: [
      "Unlimited transcription",
      "Advanced meeting summaries",
      "Smart Vision (Gemini 1.5)",
      "Priority Support",
    ],
  },
  max: {
    id: "max",
    name: "Zen Max",
    price: 19,
    features: [
      "Everything in Zen Pro",
      "Custom AI system prompts",
      "API access",
      "White-labeling",
    ],
  },
};
