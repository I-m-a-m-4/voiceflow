"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Check, Loader2, Sparkles, ShieldCheck, Zap, Globe, Crown } from 'lucide-react';
import { useAuth } from '@/firebase';
import { useCurrencyGeo, CurrencyCode } from '@/hooks/use-currency-geo';

interface BillingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PricingPlansView({ onUpgradeSuccess }: { onUpgradeSuccess?: () => void }) {
  const [isAnnual, setIsAnnual] = useState(false);
  const auth = useAuth();
  const { currency, currencySymbol, setCurrency, formatPrice } = useCurrencyGeo();
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);

  const plans = [
    {
      id: 'free',
      name: 'Free Plan',
      description: 'Essential meeting recording and basic transcription.',
      monthlyUsd: 0,
      monthlyNgn: 0,
      annualUsd: 0,
      annualNgn: 0,
      features: [
        'Stealth Mode: 100% Undetectable to Zoom & Google Meet',
        '30 minutes / month limit',
        'Up to 3 meeting sessions',
        'Standard Whisper transcription',
        'Basic meeting notes & action items',
      ],
      isPopular: false,
      buttonText: 'Current Free Tier',
      isFree: true,
    },
    {
      id: 'pro',
      name: 'Voiceflow Pro',
      badge: 'Most Popular',
      description: 'The ultimate live meeting copilot & unlimited AI companion.',
      monthlyUsd: 11.99,
      monthlyNgn: 12500,
      annualUsd: 119.00, // ~$9.90/mo
      annualNgn: 120000, // ₦10,000/mo
      features: [
        'Stealth Mode: 100% Undetectable to Zoom, Meet & Teams',
        'Unlimited Minutes (No monthly caps)',
        'Unlimited Meeting Sessions',
        'Live Real-Time AI Copilot & Suggested Answers',
        'Screen Q&A (Ask AI about active screen during call)',
        'Automated Executive Summaries & Follow-up Email Drafts',
        'Custom Role & Company Context Tuning',
        'High-Speed Whisper Turbo & Llama 3.3 70B AI Engine',
        'Unlimited Audio Dictation & Voice Note Clean-up',
      ],
      isPopular: true,
      buttonText: 'Upgrade to Pro',
      isFree: false,
    },
    {
      id: 'business',
      name: 'Team / Business',
      badge: 'For Power Users',
      description: 'Multi-seat collaboration, custom integrations and direct support.',
      monthlyUsd: 29.99,
      monthlyNgn: 35000,
      annualUsd: 299.00,
      annualNgn: 350000,
      features: [
        'Everything in Pro included',
        'Team Shared Workspace & Centralized Meeting Library',
        'Priority 24/7 Dedicated Support with Bello Imam',
        'Custom CRM & Slack / Notion Sync',
        'Multi-user Meeting Analytics',
      ],
      isPopular: false,
      buttonText: 'Upgrade to Business',
      isFree: false,
    },
  ];

  const handleCheckout = async (plan: typeof plans[0]) => {
    if (plan.isFree) return;
    setLoadingPlanId(plan.id);

    try {
      const clientOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const redirectUrl = `${clientOrigin}/dashboard`;
      const amount = isAnnual 
        ? (currency === 'NGN' ? plan.annualNgn : plan.annualUsd) 
        : (currency === 'NGN' ? plan.monthlyNgn : plan.monthlyUsd);

      // Log checkout attempt
      try {
        const { collection, addDoc, serverTimestamp, getFirestore } = await import("firebase/firestore");
        const db = getFirestore();
        await addDoc(collection(db, "checkout_attempts"), {
          userId: auth?.currentUser?.uid || "guest",
          userEmail: auth?.currentUser?.email || "",
          userName: auth?.currentUser?.displayName || "Voiceflow User",
          plan: plan.name,
          planId: plan.id,
          cycle: isAnnual ? "annual" : "monthly",
          amount: amount,
          currency: currency,
          gateway: "Flutterwave",
          timestamp: serverTimestamp(),
          status: "initiated"
        });
      } catch (logErr) {
        console.warn("Could not log checkout attempt:", logErr);
      }

      // Call Flutterwave checkout endpoint with selected currency & amount
      const res = await fetch("/api/flutterwave/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: auth?.currentUser?.uid || "guest",
          planId: plan.id,
          amount: amount,
          currency: currency,
          planName: plan.name,
          email: auth?.currentUser?.email || "user@voiceflow.space",
          name: auth?.currentUser?.displayName || "Voiceflow User",
          origin: clientOrigin,
          redirectUrl: redirectUrl,
        }),
      });

      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error(data.error || "Failed to initialize payment gateway");
    } catch (err: any) {
      console.error("Payment initiation error:", err);
      alert(`Could not open checkout: ${err.message || "Please check your network or try again."}`);
    } finally {
      setLoadingPlanId(null);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Controls Bar: Currency Selector + Billing Cycle Toggle */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-2 border-b border-border">
        {/* Currency Switcher */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
            <Globe size={13} />
            Currency:
          </span>
          <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/40">
            <button
              type="button"
              onClick={() => setCurrency("USD")}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                currency === "USD"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              $ USD (Global)
            </button>
            <button
              type="button"
              onClick={() => setCurrency("NGN")}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${
                currency === "NGN"
                  ? "bg-background text-voiceflow-orange shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              ₦ NGN (Nigeria)
            </button>
          </div>
        </div>

        {/* Monthly vs Annual Toggle */}
        <div className="inline-flex rounded-full border border-border p-1 bg-muted/40">
          <button
            type="button"
            onClick={() => setIsAnnual(false)}
            className={`px-4 py-1 text-xs font-bold rounded-full transition-all ${
              !isAnnual
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setIsAnnual(true)}
            className={`px-4 py-1 text-xs font-bold rounded-full transition-all flex items-center gap-1.5 ${
              isAnnual
                ? "bg-background text-voiceflow-orange shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Annual
            <span className="bg-orange-500/10 text-voiceflow-orange text-[10px] px-2 py-0.5 rounded-full font-bold">
              Save 20%
            </span>
          </button>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {plans.map((p) => {
          const isPro = p.id === 'pro';
          const priceStr = p.isFree
            ? `${currencySymbol}0`
            : isAnnual
            ? formatPrice(p.annualUsd / 12, Math.round(p.annualNgn / 12))
            : formatPrice(p.monthlyUsd, p.monthlyNgn);

          return (
            <div
              key={p.id}
              className={`rounded-2xl p-5 sm:p-6 flex flex-col relative transition-all ${
                isPro
                  ? 'border-2 border-voiceflow-orange bg-orange-500/[0.03] dark:bg-orange-500/[0.05] shadow-lg shadow-orange-500/10'
                  : 'border border-border bg-card'
              }`}
            >
              {p.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-voiceflow-orange text-white text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider shadow-sm">
                  {p.badge}
                </div>
              )}

              <div className="mb-4">
                <h3 className="text-lg font-bold text-foreground font-clash">{p.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-foreground font-clash">{priceStr}</span>
                  {!p.isFree && <span className="text-xs text-muted-foreground">/mo</span>}
                </div>
                {!p.isFree && isAnnual && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Billed annually ({formatPrice(p.annualUsd, p.annualNgn)}/yr)
                  </p>
                )}
              </div>

              <ul className="space-y-2.5 mb-6 flex-1 text-xs">
                {p.features.map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-foreground">
                    <Check size={14} className="text-voiceflow-orange shrink-0 mt-0.5" />
                    <span className="leading-tight">{feat}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => handleCheckout(p)}
                disabled={p.isFree || loadingPlanId === p.id}
                className={`w-full py-3 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                  p.isFree
                    ? 'bg-muted text-muted-foreground cursor-default'
                    : isPro
                    ? 'bg-voiceflow-orange hover:bg-orange-600 text-white shadow-md shadow-orange-500/20'
                    : 'bg-foreground hover:bg-foreground/90 text-background'
                }`}
              >
                {loadingPlanId === p.id ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Initializing Checkout...
                  </>
                ) : (
                  <>
                    {isPro && <Crown size={14} />}
                    {p.buttonText}
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BillingModal({ isOpen, onClose }: BillingModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[900px] w-[95vw] max-h-[90vh] overflow-y-auto bg-background text-foreground border-border p-6 sm:p-8">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-2xl sm:text-3xl font-bold font-clash">
            Subscription Plans & Pricing
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Experience unlimited real-time meeting transcription, instant AI suggestions, and 100% stealth mode.
          </DialogDescription>
        </DialogHeader>

        <PricingPlansView />
      </DialogContent>
    </Dialog>
  );
}
export default BillingModal;
