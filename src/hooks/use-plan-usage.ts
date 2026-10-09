"use client";

import { useState, useEffect, useCallback } from 'react';
import { useAuth, useFirestore } from '@/firebase';
import { doc, getDoc, updateDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';

export interface PlanUsageState {
  isPro: boolean;
  planName: string;
  sessionCount: number;
  usedMinutes: number;
  maxMinutes: number;
  maxFreeSessions: number;
  isLimitReached: boolean;
  recordSession: (durationSeconds?: number) => Promise<void>;
  refreshUsage: () => void;
}

export function usePlanUsage(): PlanUsageState {
  const auth = useAuth();
  const firestore = useFirestore();

  const [isPro, setIsPro] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('voiceflow_is_pro') === 'true';
  });

  const [sessionCount, setSessionCount] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    const saved = localStorage.getItem('voiceflow_session_count');
    return saved ? parseInt(saved, 10) : 0;
  });

  const [usedMinutes, setUsedMinutes] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    const saved = localStorage.getItem('voiceflow_used_minutes');
    return saved ? parseInt(saved, 10) : 0;
  });

  const maxMinutes = 30; // 30 minutes monthly free limit
  const maxFreeSessions = 3; // 3 sessions free limit

  const syncFromStorage = useCallback(() => {
    if (typeof window === 'undefined') return;
    const pro = localStorage.getItem('voiceflow_is_pro') === 'true';
    const sessions = parseInt(localStorage.getItem('voiceflow_session_count') || '0', 10);
    const mins = parseInt(localStorage.getItem('voiceflow_used_minutes') || '0', 10);
    setIsPro(pro);
    setSessionCount(sessions);
    setUsedMinutes(mins);
  }, []);

  // Listen to cross-component usage events
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleUsageUpdated = () => syncFromStorage();
    window.addEventListener('voiceflow-usage-updated', handleUsageUpdated);
    return () => window.removeEventListener('voiceflow-usage-updated', handleUsageUpdated);
  }, [syncFromStorage]);

  // Sync with Firestore user document and meetings (Server authoritative)
  useEffect(() => {
    if (!auth?.currentUser?.uid || !firestore) {
      // Unauthenticated users are strictly non-pro
      if (typeof window !== 'undefined') {
        localStorage.removeItem('voiceflow_is_pro');
      }
      setIsPro(false);
      return;
    }
    const uid = auth.currentUser.uid;

    const userDocRef = doc(firestore, 'users', uid);
    const unsubscribe = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const proStatus = !!(data.isPro === true || data.planTier === 'pro' || data.subscriptionPlan?.toLowerCase().includes('pro'));
        const firestoreMins = typeof data.usedMinutes === 'number' ? data.usedMinutes : 0;
        const firestoreSessions = typeof data.sessionCount === 'number' ? data.sessionCount : 0;

        setIsPro(proStatus);
        if (proStatus) {
          localStorage.setItem('voiceflow_is_pro', 'true');
        } else {
          // Prevent forged localStorage is_pro
          localStorage.removeItem('voiceflow_is_pro');
        }

        // Use the maximum between local and server to avoid resetting upon offline/cache tampering
        const currentLocalSessions = parseInt(localStorage.getItem('voiceflow_session_count') || '0', 10);
        const currentLocalMins = parseInt(localStorage.getItem('voiceflow_used_minutes') || '0', 10);

        const finalSessions = Math.max(firestoreSessions, currentLocalSessions);
        const finalMins = Math.max(firestoreMins, currentLocalMins);

        setSessionCount(finalSessions);
        setUsedMinutes(finalMins);
        localStorage.setItem('voiceflow_session_count', String(finalSessions));
        localStorage.setItem('voiceflow_used_minutes', String(finalMins));
      }
    }, (err) => {
      console.warn("Could not listen to user doc for plan usage:", err);
    });

    // Also count existing meetings in Firestore to guarantee anti-cheating accuracy
    const meetingsQuery = query(collection(firestore, 'meetings'), where('userId', '==', uid));
    getDocs(meetingsQuery).then((snapshot) => {
      const realMeetingCount = snapshot.size;
      const currentSessions = parseInt(localStorage.getItem('voiceflow_session_count') || '0', 10);
      if (realMeetingCount > currentSessions) {
        setSessionCount(realMeetingCount);
        localStorage.setItem('voiceflow_session_count', String(realMeetingCount));
        // Approximate 2-3 mins per meeting if usedMinutes is 0
        const currentMins = parseInt(localStorage.getItem('voiceflow_used_minutes') || '0', 10);
        if (currentMins === 0 && realMeetingCount > 0) {
          const estimatedMins = realMeetingCount * 3;
          setUsedMinutes(estimatedMins);
          localStorage.setItem('voiceflow_used_minutes', String(estimatedMins));
        }
      }
    }).catch((e) => console.warn("Failed to count meetings:", e));

    return () => unsubscribe();
  }, [auth?.currentUser?.uid, firestore]);

  const recordSession = useCallback(async (durationSeconds: number = 60) => {
    const sessionMins = Math.max(1, Math.ceil(durationSeconds / 60));
    
    setSessionCount((prev) => {
      const next = prev + 1;
      if (typeof window !== 'undefined') {
        localStorage.setItem('voiceflow_session_count', String(next));
      }
      return next;
    });

    setUsedMinutes((prev) => {
      const next = prev + sessionMins;
      if (typeof window !== 'undefined') {
        localStorage.setItem('voiceflow_used_minutes', String(next));
      }
      return next;
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('voiceflow-usage-updated'));
    }

    // Persist to Firestore if user is authenticated
    if (auth?.currentUser?.uid && firestore) {
      try {
        const userDocRef = doc(firestore, 'users', auth.currentUser.uid);
        const userSnap = await getDoc(userDocRef);
        const currentSessions = userSnap.exists() && typeof userSnap.data()?.sessionCount === 'number' 
          ? userSnap.data().sessionCount 
          : sessionCount;
        const currentMins = userSnap.exists() && typeof userSnap.data()?.usedMinutes === 'number'
          ? userSnap.data().usedMinutes
          : usedMinutes;

        await updateDoc(userDocRef, {
          sessionCount: Math.max(currentSessions + 1, sessionCount + 1),
          usedMinutes: Math.max(currentMins + sessionMins, usedMinutes + sessionMins),
        });
      } catch (e) {
        console.warn("Failed to update Firestore plan usage:", e);
      }
    }
  }, [auth?.currentUser?.uid, firestore, sessionCount, usedMinutes]);

  // Anti-cheating: limit reached if user is not pro AND (exceeded 3 sessions OR exceeded 30 minutes)
  const isLimitReached = !isPro && (sessionCount >= maxFreeSessions || usedMinutes >= maxMinutes);

  return {
    isPro,
    planName: isPro ? 'Voiceflow Pro' : 'Basic Plan',
    sessionCount,
    usedMinutes,
    maxMinutes,
    maxFreeSessions,
    isLimitReached,
    recordSession,
    refreshUsage: syncFromStorage,
  };
}
