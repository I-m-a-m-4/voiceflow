"use client";

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Check, Loader2, Crown, Sparkles, ShieldCheck, X, RefreshCw } from 'lucide-react';
import { useAuth, useFirestore } from '@/firebase';
import { doc, updateDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { useCurrencyGeo } from '@/hooks/use-currency-geo';
import { apiBase, isNativeApp } from '@/lib/platform';
import { markDevicePro } from '@/lib/device-fingerprint';
import { toast } from '@/hooks/use-toast';


const loadFlutterwaveScript = (): Promise<void> => {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.FlutterwaveCheckout) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.getElementById('flutterwave-inline-sdk');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.id = 'flutterwave-inline-sdk';
    script.src = 'https://checkout.flutterwave.com/v3.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Flutterwave SDK load error'));
    document.body.appendChild(script);
  });
};

interface BillingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PricingPlansView({ onUpgradeSuccess }: { onUpgradeSuccess?: () => void }) {
  const [isAnnual, setIsAnnual] = useState(false);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [inAppCheckout, setInAppCheckout] = useState<{ url: string; plan: any; txRef: string } | null>(null);
  const { currency, currencySymbol, isNigeria, formatPrice } = useCurrencyGeo();
  const auth = useAuth();
  const firestore = useFirestore();

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
        'Unlimited AI Screen Capture & Real-Time Visual Q&A',
        'Screen Share Shield: Private Notes during Zoom, Meet & Teams',
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
        'Screen Share Shield: Private Notes during Zoom, Meet & Teams',
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

  const activateUserPro = async (plan: typeof plans[0], txRef?: string) => {
    try {
      if (auth?.currentUser?.uid && firestore) {
        await updateDoc(doc(firestore, "users", auth.currentUser.uid), {
          subscriptionPlan: plan.name,
          planTier: plan.id,
          isPro: true,
          updatedAt: serverTimestamp(),
        }).catch((err) => console.warn("Failed to update user doc:", err));

        await markDevicePro(firestore).catch(() => {});

        // Record purchase to Firestore
        await addDoc(collection(firestore, "purchases"), {
          userId: auth.currentUser.uid,
          userEmail: auth.currentUser.email || "",
          userName: auth.currentUser.displayName || "Voiceflow User",
          plan: plan.name,
          planId: plan.id,
          amount: isAnnual 
            ? (currency === 'NGN' ? plan.annualNgn : plan.annualUsd) 
            : (currency === 'NGN' ? plan.monthlyNgn : plan.monthlyUsd),
          currency: currency,
          status: "completed",
          type: "subscription",
          paymentMethod: "Flutterwave",
          txRef: txRef || "",
          createdAt: serverTimestamp(),
          date: serverTimestamp(),
        }).catch(() => {});
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem('voiceflow_is_pro', 'true');
        window.dispatchEvent(new CustomEvent('voiceflow-usage-updated'));
      }

      toast({
        title: "🎉 Payment Successful!",
        description: `Welcome to ${plan.name}! Your high-performance AI features have been activated.`,
      });

      onUpgradeSuccess?.();
    } catch (e) {
      console.error("Activation error:", e);
    }
  };

  // Poll for completion when in-app checkout modal is open
  useEffect(() => {
    if (!inAppCheckout) return;

    let isCancelled = false;
    const interval = setInterval(async () => {
      if (isCancelled) return;
      try {
        const base = apiBase();
        const verifyEndpoint = base ? `${base}/api/flutterwave/verify` : "/api/flutterwave/verify";
        const res = await fetch(verifyEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tx_ref: inAppCheckout.txRef,
            userId: auth?.currentUser?.uid || "guest",
            planId: inAppCheckout.plan.id,
            planName: inAppCheckout.plan.name,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success && data.status === "successful") {
            clearInterval(interval);
            const planToActivate = inAppCheckout.plan;
            const ref = inAppCheckout.txRef;
            setInAppCheckout(null);
            await activateUserPro(planToActivate, ref);
          }
        }
      } catch (err) {
        // Continue polling silently
      }
    }, 3000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [inAppCheckout]);

  const handleCheckout = async (plan: typeof plans[0]) => {
    setLoadingPlanId(plan.id);

    try {
      const isNative = isNativeApp();
      const clientOrigin = isNative ? 'https://voiceflow-azure.vercel.app' : (typeof window !== 'undefined' ? window.location.origin : 'https://voiceflow-azure.vercel.app');
      const amount = isAnnual 
        ? (currency === 'NGN' ? plan.annualNgn : plan.annualUsd) 
        : (currency === 'NGN' ? plan.monthlyNgn : plan.monthlyUsd);
      const txRef = `tx-${auth?.currentUser?.uid || 'guest'}-${plan.id}-${Date.now()}`;

      // Preload inline script
      try {
        await loadFlutterwaveScript();
      } catch {}

      const publicKey = process.env.NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY;

      // 1. If Flutterwave Inline SDK is loaded, open popup directly inside the app (no browser redirect)
      if (typeof window !== 'undefined' && window.FlutterwaveCheckout && publicKey) {
        window.FlutterwaveCheckout({
          public_key: publicKey,
          tx_ref: txRef,
          amount: amount,
          currency: currency,
          payment_options: 'card, ussd, bank_transfer',
          customer: {
            email: auth?.currentUser?.email || "user@voiceflow.space",
            name: auth?.currentUser?.displayName || "Voiceflow User",
          },
          customizations: {
            title: `Voiceflow ${plan.name}`,
            description: `Subscription payment for Voiceflow ${plan.name}`,
            logo: `${clientOrigin}/icon.svg`,
          },
          meta: {
            user_id: auth?.currentUser?.uid || 'guest',
            plan_id: plan.id,
          },
          callback: async (response: any) => {
            setLoadingPlanId(null);
            if (response.status === 'successful' || response.status === 'completed') {
              try {
                const base = apiBase();
                const verifyEndpoint = base ? `${base}/api/flutterwave/verify` : "/api/flutterwave/verify";
                await fetch(verifyEndpoint, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    transaction_id: response.transaction_id,
                    tx_ref: response.tx_ref || txRef,
                    userId: auth?.currentUser?.uid,
                    planId: plan.id,
                    planName: plan.name,
                    amount: amount,
                    currency: currency,
                  }),
                });
              } catch (verifyErr) {
                console.warn("Server verify check skipped:", verifyErr);
              }

              await activateUserPro(plan, response.tx_ref || txRef);
            } else {
              toast({
                variant: "destructive",
                title: "Payment Incomplete",
                description: response.charge_response_message || "Payment was not completed. Please try again.",
              });
            }
          },
          onclose: () => {
            setLoadingPlanId(null);
          },
        });
        return;
      }

      // 2. Fallback: Call Flutterwave checkout endpoint and open in an In-App Modal Dialog (never opens external browser)
      const base = apiBase();
      const checkoutEndpoint = base ? `${base}/api/flutterwave/checkout` : "/api/flutterwave/checkout";

      const res = await fetch(checkoutEndpoint, {
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
          redirectUrl: `${clientOrigin}/dashboard`,
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(res.ok ? "Unexpected response format from payment server" : `Payment server error (${res.status})`);
      }

      const data = await res.json();
      if (res.ok && data.url) {
        // Open inside the app via In-App Checkout modal (no external browser)
        setInAppCheckout({ url: data.url, plan, txRef: data.txRef || txRef });
        return;
      }
      throw new Error(data.error || "Failed to initialize payment gateway");
    } catch (err: any) {
      console.error("Payment initiation error:", err);
      toast({
        variant: "destructive",
        title: "Checkout Error",
        description: err.message || "Could not initialize checkout. Please check your network.",
      });
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

      {/* In-App Checkout Modal Dialog (Runs 100% inside Voiceflow, no external browser) */}
      {inAppCheckout && (
        <Dialog open={!!inAppCheckout} onOpenChange={() => setInAppCheckout(null)}>
          <DialogContent className="sm:max-w-[580px] w-[96vw] h-[86vh] max-h-[760px] p-0 flex flex-col overflow-hidden bg-background border-border shadow-2xl rounded-2xl z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40 shrink-0">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-bold text-foreground">Secure In-App Checkout</span>
                <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">256-bit Encrypted</span>
              </div>
              <button
                type="button"
                onClick={() => setInAppCheckout(null)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Close checkout"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 w-full h-full relative bg-background">
              <iframe
                src={inAppCheckout.url}
                className="w-full h-full border-0"
                title="Voiceflow Secure Checkout"
                allow="payment; camera"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
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
            Experience unlimited real-time meeting transcription, instant AI copilot, and Presenter Privacy Shield.
          </DialogDescription>
        </DialogHeader>

        <PricingPlansView onUpgradeSuccess={onClose} />
      </DialogContent>
    </Dialog>
  );
}
export default BillingModal;
