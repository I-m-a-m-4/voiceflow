"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Check, Loader2 } from 'lucide-react';
import { useAuth } from '@/firebase';

interface BillingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const UpgradeButton = ({ plan, isAnnual, auth, onClose, className, children }: any) => {
  const [loading, setLoading] = useState(false);
  const amount = isAnnual ? plan.annualPrice : plan.discountedMonthly;

  const handleUpgrade = async () => {
    setLoading(true);
    try {
      const clientOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const redirectUrl = `${clientOrigin}/dashboard`;

      // Log checkout attempt to Firestore so admin-imamshaffy tracks it immediately
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
          currency: "USD",
          gateway: "Flutterwave",
          timestamp: serverTimestamp(),
          status: "initiated"
        });
      } catch (logErr) {
        console.warn("Could not log checkout attempt:", logErr);
      }

      // 1. Call real backend checkout API
      const res = await fetch("/api/flutterwave/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: auth?.currentUser?.uid || "guest",
          planId: plan.id,
          amount: amount,
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
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={handleUpgrade}
      disabled={loading}
      className={className}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Processing...
        </span>
      ) : children}
    </button>
  );
};

export function BillingModal({ isOpen, onClose }: BillingModalProps) {
  const [isAnnual, setIsAnnual] = useState(false);
  const auth = useAuth();

  const plans = [
    {
      id: 'pro',
      name: 'Pro plan',
      monthlyPrice: 19.99,
      discountedMonthly: 11.99,
      annualPrice: 143.88, // 11.99 * 12
      features: [
        'Unlimited AI Responses',
        'Unlimited meetings',
        'Access to newest AI models',
        'Priority chat support'
      ],
      isPopular: false,
    },
    {
      id: 'stealth_pro',
      name: 'Pro + Undetectability',
      monthlyPrice: 149.99,
      discountedMonthly: 79.99,
      annualPrice: 959.88, // 79.99 * 12
      features: [
        'Voiceflow Undetectability',
        'Voiceflow will be invisible to screen share during meetings',
        'Automatic taskbar hiding in calls'
      ],
      isPopular: true,
    }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[700px] bg-white dark:bg-[#111111] text-black dark:text-white border-gray-200 dark:border-gray-800 p-0 overflow-hidden">
        <div className="p-8">
          <DialogHeader className="mb-8">
            <DialogTitle className="text-3xl font-bold">Choose your plan</DialogTitle>
            <DialogDescription className="text-gray-400 text-base">
              Unlock all features with Voiceflow Pro
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end mb-6">
            <div className="bg-gray-100 dark:bg-[#1C1C1E] p-1 rounded-full flex items-center gap-2 border border-gray-200 dark:border-gray-800">
              <span className={`px-4 py-1.5 text-sm rounded-full cursor-pointer transition-colors ${!isAnnual ? 'bg-white dark:bg-[#333333] text-black dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`} onClick={() => setIsAnnual(false)}>
                Monthly
              </span>
              <span className={`px-4 py-1.5 text-sm rounded-full cursor-pointer transition-colors flex items-center gap-2 ${isAnnual ? 'bg-white dark:bg-[#333333] text-black dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`} onClick={() => setIsAnnual(true)}>
                Annual <span className="bg-orange-100 text-orange-600 text-[10px] px-2 py-0.5 rounded-full font-bold">Save 45%</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {/* Pro Plan */}
            <div className="bg-orange-500 rounded-2xl p-6 text-white flex flex-col h-full relative overflow-hidden">
              <h3 className="font-medium text-lg mb-2">Pro plan</h3>
              <div className="flex items-baseline gap-2 mb-6">
                <span className="text-white/60 line-through text-xl">${plans[0].monthlyPrice}</span>
                <span className="text-4xl font-bold">${plans[0].discountedMonthly}</span>
                <span className="text-white/80">/month</span>
              </div>
              
              <ul className="space-y-4 mb-8 flex-1">
                {plans[0].features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm font-medium">
                    <div className="mt-0.5 bg-white/20 rounded-full p-0.5 shrink-0">
                      <Check size={14} className="text-white" />
                    </div>
                    {feature}
                  </li>
                ))}
              </ul>
              
              <UpgradeButton 
                plan={plans[0]} 
                isAnnual={isAnnual} 
                auth={auth} 
                onClose={onClose}
                className="w-full bg-white text-black py-3 rounded-xl font-bold text-lg hover:bg-gray-100 transition-colors flex justify-center items-center gap-2"
              >
                Upgrade <span className="bg-orange-100 text-orange-600 text-xs px-2 py-0.5 rounded-full">-45%</span>
              </UpgradeButton>
            </div>

            {/* Pro + Undetectability */}
            <div className="bg-gradient-to-b from-orange-50 to-orange-100 dark:from-zinc-800 dark:to-zinc-900 rounded-2xl p-6 text-black dark:text-white flex flex-col h-full relative border border-orange-500/30">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-medium text-lg text-orange-600 dark:text-orange-400">Pro + Undetectability</h3>
                <span className="bg-orange-500/20 text-orange-600 dark:text-orange-400 px-2 py-1 rounded-md text-xs font-medium border border-orange-500/30">Popular</span>
              </div>
              <div className="flex items-baseline gap-2 mb-6">
                <span className="text-black/60 dark:text-white/60 line-through text-xl">${plans[1].monthlyPrice}</span>
                <span className="text-4xl font-bold text-black dark:text-white">${plans[1].discountedMonthly}</span>
                <span className="text-black/80 dark:text-white/80">/month</span>
              </div>
              
              <ul className="space-y-4 mb-8 flex-1 relative z-10">
                <li className="flex items-start gap-3 text-sm">
                  <div className="mt-0.5 bg-orange-500 rounded-full p-0.5 shrink-0">
                    <Check size={14} className="text-white" />
                  </div>
                  <div>
                    <span className="font-bold block mb-1">{plans[1].features[0]}</span>
                    <span className="text-black/80 dark:text-white/80 leading-snug block">{plans[1].features[1]}</span>
                  </div>
                </li>
              </ul>
              
              <UpgradeButton 
                plan={plans[1]} 
                isAnnual={isAnnual} 
                auth={auth} 
                onClose={onClose}
                className="w-full bg-orange-500 text-white py-3 rounded-xl font-bold text-lg hover:bg-orange-600 transition-colors flex justify-center items-center gap-2 relative z-10"
              >
                Upgrade <span className="bg-white text-orange-600 text-xs px-2 py-0.5 rounded-full">-45%</span>
              </UpgradeButton>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-800 pt-6 flex items-center justify-between text-sm">
            <div>
              <span className="text-gray-600 dark:text-gray-400 block mb-1">Free plan</span>
              <span className="text-2xl font-bold text-black dark:text-white">$0</span>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                <div className="bg-gray-200 dark:bg-gray-800 p-0.5 rounded-full"><Check size={12} className="text-gray-500 dark:text-gray-400" /></div>
                Limited AI usage per meeting
              </div>
              <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                <div className="bg-gray-200 dark:bg-gray-800 p-0.5 rounded-full"><Check size={12} className="text-gray-500 dark:text-gray-400" /></div>
                Limited free meetings
              </div>
              <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                <div className="bg-gray-200 dark:bg-gray-800 p-0.5 rounded-full"><Check size={12} className="text-gray-500 dark:text-gray-400" /></div>
                Ask AI about past meetings
              </div>
              <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                <div className="bg-gray-200 dark:bg-gray-800 p-0.5 rounded-full"><Check size={12} className="text-gray-500 dark:text-gray-400" /></div>
                Customize AI instructions
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
