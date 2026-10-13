"use client";

import React, { useEffect } from "react";
import MeetingsFeed from "@/components/dashboard/meetings-feed";
import RightPanel from "@/components/dashboard/right-panel";
import { useAuth, useFirestore } from "@/firebase";
import { doc, updateDoc, collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";

export default function VoiceFlowApp() {
  const auth = useAuth();
  const firestore = useFirestore();
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const txRef = params.get("tx_ref");
    const planId = params.get("plan_id") || "pro";

    if (!status && !txRef) return;

    // Clean up address bar immediately so refresh doesn't trigger repeat toasts
    window.history.replaceState({}, "", window.location.pathname);

    if (status === "cancelled") {
      toast({
        variant: "destructive",
        title: "Checkout Cancelled",
        description: "Your payment was cancelled. You can upgrade anytime from settings or the sidebar.",
      });
      return;
    }

    if (status === "successful" || status === "completed" || (txRef && status !== "cancelled")) {
      toast({
        title: "🎉 Payment Successful!",
        description: "Welcome to Voiceflow Pro! Your high-performance AI features have been activated.",
      });

      // Update user subscription in Firestore
      if (auth?.currentUser?.uid && firestore) {
        const uid = auth.currentUser.uid;
        updateDoc(doc(firestore, "users", uid), {
          subscriptionPlan: planId === "pro" ? "Voiceflow Pro" : planId,
          planTier: planId,
          isPro: true,
          updatedAt: serverTimestamp(),
        }).catch((err) => console.warn("Failed to update user subscription doc:", err));

        // Add to purchases for admin-imamshaffy revenue tracking
        addDoc(collection(firestore, "purchases"), {
          userId: uid,
          userEmail: auth.currentUser.email || "",
          userName: auth.currentUser.displayName || auth.currentUser.email?.split("@")[0] || "Voiceflow User",
          plan: planId === "pro" ? "Voiceflow Pro" : planId,
          planId: planId,
          amount: planId === "pro" ? 11.99 : 29.99,
          currency: "USD",
          status: "completed",
          type: "subscription",
          paymentMethod: "Flutterwave",
          txRef: txRef || "",
          createdAt: serverTimestamp(),
          date: serverTimestamp(),
        }).catch((err) => console.warn("Failed to record purchase to Firestore:", err));
      }
    }
  }, [auth, firestore, toast]);

  const [isRecording, setIsRecording] = React.useState(false);

  useEffect(() => {
    const handleRecordState = (e: any) => {
      setIsRecording(Boolean(e.detail?.isRecording));
    };
    window.addEventListener('voiceflow-record-state', handleRecordState);
    return () => window.removeEventListener('voiceflow-record-state', handleRecordState);
  }, []);

  return (
    <div className={`flex flex-col lg:flex-row min-h-full w-full ${isRecording ? 'bg-transparent' : ''}`}>
      {!isRecording && <MeetingsFeed />}
      <RightPanel />
    </div>
  );
}
