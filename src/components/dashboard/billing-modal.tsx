"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Check, Loader2, Crown, Sparkles } from 'lucide-react';
import { useAuth } from '@/firebase';
import { useCurrencyGeo } from '@/hooks/use-currency-geo';

interface BillingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PricingPlansView({ onUpgradeSuccess }: { onUpgradeSuccess?: () => void }) {
  const [isAnnual, setIsAnnual] = useState(false);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const { currency, currencySymbol, isNigeria, formatPrice } = useCurrencyGeo();
  const auth = useAuth();

  const plans = [
    {
      id: 'pro',
      name: 'Voiceflow Pro',
      badge: 'Standard Plan',
      description: 'Generous monthly meeting hours & live AI meeting assistance.',
      monthlyUsd: 11.99,
      monthlyNgn: 12500,
      annualUsd: 119.00,
      annualNgn: 120000,
      icon: Crown,
      features: [
        'Stealth Mode: 100% Undetectable to Zoom, Meet & Teams',
        '10 Hours (600 Mins) / month meeting transcription',
        'Up to 30 meeting sessions monthly',
        'Live Real-Time AI Copilot & Suggested Responses',
        'Automated Executive Summaries & Action Items',
        'Ultra-Fast Neural Audio Intelligence',
        'Audio Dictation & Voice Note Recording',
        'Standard Support',
      ],
      isPopular: false,
      buttonText: 'Upgrade to Voiceflow Pro',
    },
    {
      id: 'unlimited',
      name: 'Voiceflow Unlimited',
      badge: 'Highest Tier • Unlimited',
      description: 'The ultimate all-inclusive copilot with zero caps, infinite meeting minutes, and live screen intelligence.',
      monthlyUsd: 24.99,
      monthlyNgn: 25000,
      annualUsd: 239.00,
      annualNgn: 240000,
      icon: Sparkles,
      features: [
        '100% UNLIMITED Minutes (Zero monthly caps)',
        '100% UNLIMITED Meeting Sessions (Infinite calls)',
        'Stealth Mode: 100% Undetectable to Zoom, Meet & Teams',
        'Live Real-Time Screen Q&A & Visual Screen Intelligence',
        'Instant AI Meeting Copilot with Suggested Responses',
        'Deep Executive Briefs & Automated Follow-up Email Drafts',
        'Custom Role, Company & Persona Intelligence Context',
        'Ultra-Fast Neural Audio Intelligence & Copilot Engine',
        'Priority 24/7 Dedicated Support & Rapid Assistance',
      ],
      isPopular: true,
      buttonText: 'Get Unlimited Access',
    },
  ];

  const handleCheckout = async (plan: typeof plans[0]) => {
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

      // Call Flutterwave checkout endpoint with country-locked currency
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
      {/* Top Header Controls: Strict Currency Indicator + Monthly/Annual Cycle Switch */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-border">
        {/* Fixed Non-switchable Currency Badge */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/60 border border-border text-xs font-semibold text-foreground">
            {isNigeria ? (
              <>
                <span>🇳🇬</span>
                <span>Billing in Nigerian Naira (₦)</span>
              </>
            ) : (
              <>
                <span>🌐</span>
                <span>Billing in US Dollars ($)</span>
              </>
            )}
          </span>
        </div>

        {/* Monthly vs Annual Toggle */}
        <div className="inline-flex rounded-full border border-border p-1 bg-muted/40">
          <button
            type="button"
            onClick={() => setIsAnnual(false)}
            className={`px-4 py-1 text-xs font-bold rounded-full transition-all ${
              !isAnnual
                ? "bg-background text-foreground shadow-xs"
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
                ? "bg-background text-voiceflow-orange shadow-xs"
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

      {/* 2-Column Spacious Plans Grid (Without cramped Free box) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {plans.map((p) => {
          const isFeatured = p.isPopular;
          const priceStr = isAnnual
            ? formatPrice(p.annualUsd / 12, Math.round(p.annualNgn / 12))
            : formatPrice(p.monthlyUsd, p.monthlyNgn);

          return (
            <div
              key={p.id}
              className={`rounded-2xl p-6 sm:p-7 flex flex-col relative transition-all ${
                isFeatured
                  ? 'border-2 border-voiceflow-orange bg-orange-500/[0.03] dark:bg-orange-500/[0.05] shadow-lg shadow-orange-500/10'
                  : 'border border-border bg-card'
              }`}
            >
              {/* Badge positioned with proper clearance */}
              {p.badge && (
                <div className={`absolute top-4 right-4 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-xs ${
                  isFeatured 
                    ? 'bg-voiceflow-orange text-white' 
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {p.badge}
                </div>
              )}

              <div className="mb-4 pr-16">
                <div className="flex items-center gap-2 mb-1.5">
                  <p.icon size={20} className={isFeatured ? "text-voiceflow-orange" : "text-foreground"} />
                  <h3 className="text-xl font-bold text-foreground font-clash">{p.name}</h3>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{p.description}</p>
              </div>

              <div className="mb-6 pt-2">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-extrabold text-foreground font-clash tracking-tight">
                    {priceStr}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium">/month</span>
                </div>
                {isAnnual && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Billed annually ({formatPrice(p.annualUsd, p.annualNgn)}/year)
                  </p>
                )}
              </div>

              <ul className="space-y-3 mb-8 flex-1 text-xs">
                {p.features.map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-foreground">
                    <div className={`mt-0.5 rounded-full p-0.5 shrink-0 ${
                      isFeatured ? 'bg-orange-500/10 text-voiceflow-orange' : 'bg-muted text-foreground'
                    }`}>
                      <Check size={13} strokeWidth={3} />
                    </div>
                    <span className="leading-snug">{feat}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => handleCheckout(p)}
                disabled={loadingPlanId === p.id}
                className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                  isFeatured
                    ? 'bg-voiceflow-orange hover:bg-orange-600 text-white shadow-md shadow-orange-500/20 hover:scale-[1.01]'
                    : 'bg-foreground hover:bg-foreground/90 text-background'
                }`}
              >
                {loadingPlanId === p.id ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Initializing Checkout...
                  </>
                ) : (
                  <>
                    <p.icon size={16} />
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
      <DialogContent className="sm:max-w-[1000px] w-[96vw] max-h-[92vh] overflow-y-auto bg-background text-foreground border-border p-6 sm:p-8">
        <DialogHeader className="mb-4">
          <DialogTitle className="text-2xl sm:text-3xl font-bold font-clash">
            Subscription Plans & Pricing
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Experience unlimited real-time meeting transcription, instant AI copilot, and 100% stealth mode.
          </DialogDescription>
        </DialogHeader>

        <PricingPlansView />
      </DialogContent>
    </Dialog>
  );
}
export default BillingModal;
