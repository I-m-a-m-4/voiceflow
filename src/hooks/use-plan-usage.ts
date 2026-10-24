"use client";

import { useState, useEffect, useCallback } from 'react';
import { useAuth, useFirestore } from '@/firebase';
import { doc, getDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs, increment, serverTimestamp } from 'firebase/firestore';
import { syncDeviceTrial, recordDeviceSession, recordDeviceScreenCapture } from '@/lib/device-fingerprint';

export interface PlanUsageState {
  isPro: boolean;
  isAdmin: boolean;
  planName: string;
  sessionCount: number;
  usedMinutes: number;
  bonusMinutes: number;
  maxMinutes: number;
  maxFreeSessions: number;
  availableCredits: number;
  isLimitReached: boolean;
  recordSession: (durationSeconds?: number) => Promise<void>;
  refreshUsage: () => void;
  screenCaptureCount: number;
  maxFreeScreenCaptures: number;
  isScreenCaptureLimitReached: boolean;
  recordScreenCapture: () => Promise<boolean>;
}

export function usePlanUsage(): PlanUsageState {
  const auth = useAuth();
  const firestore = useFirestore();

  const currentUserEmail = auth?.currentUser?.email?.toLowerCase() || '';
  const isAdmin = currentUserEmail === 'belloimam431@gmail.com';

  const [isPro, setIsPro] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (isAdmin) return true;
    return localStorage.getItem('voiceflow_is_pro') === 'true';
  });

  const [isDeviceExceeded, setIsDeviceExceeded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    if (isAdmin) return false;
    return localStorage.getItem('voiceflow_device_trial_exceeded') === 'true';
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

  const [bonusMinutes, setBonusMinutes] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    const saved = localStorage.getItem('voiceflow_bonus_minutes');
    return saved ? parseInt(saved, 10) : 0;
  });

  const [screenCaptureCount, setScreenCaptureCount] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    const saved = localStorage.getItem('voiceflow_screen_capture_count');
    return saved ? parseInt(saved, 10) : 0;
  });

  const baseFreeMinutes = 30; // 30 minutes monthly free limit
  const maxFreeSessions = 3; // 3 sessions free limit
  const maxFreeScreenCaptures = 3; // 3 screen captures free limit

  const syncFromStorage = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (isAdmin) {
      setIsPro(true);
      setIsDeviceExceeded(false);
      return;
    }
    const pro = localStorage.getItem('voiceflow_is_pro') === 'true';
    const devExceeded = localStorage.getItem('voiceflow_device_trial_exceeded') === 'true';
    const sessions = parseInt(localStorage.getItem('voiceflow_session_count') || '0', 10);
    const mins = parseInt(localStorage.getItem('voiceflow_used_minutes') || '0', 10);
    const bonus = parseInt(localStorage.getItem('voiceflow_bonus_minutes') || '0', 10);
    const captures = parseInt(localStorage.getItem('voiceflow_screen_capture_count') || '0', 10);
    setIsPro(pro);
    setIsDeviceExceeded(devExceeded);
    setSessionCount(sessions);
    setUsedMinutes(mins);
    setBonusMinutes(bonus);
    setScreenCaptureCount(captures);
  }, [isAdmin]);

  // Synchronize device trial with Firestore across accounts
  useEffect(() => {
    if (isAdmin) return;
    let isMounted = true;
    syncDeviceTrial(firestore, auth?.currentUser)
      .then((res: any) => {
        if (!isMounted) return;
        if (res.screenCaptureCount !== undefined) {
          setScreenCaptureCount((prev) => Math.max(prev, res.screenCaptureCount || 0));
        }
        // Only mark device exceeded if user is neither Pro nor has bonus minutes!
        if (res.trialExceeded && !res.isPro && bonusMinutes <= 0) {
          setIsDeviceExceeded(true);
          setSessionCount((prev) => Math.max(prev, res.sessionCount, 3));
          setUsedMinutes((prev) => Math.max(prev, res.usedMinutes, 30));
        }
      })
      .catch((e) => console.warn('Device trial check error:', e));

    return () => {
      isMounted = false;
    };
  }, [auth?.currentUser, firestore, isAdmin, bonusMinutes]);

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

    // Merge any orphaned pre-granted document for this email
    const email = auth.currentUser.email?.toLowerCase();
    if (email) {
      const orphanQuery = query(collection(firestore, 'users'), where('email', '==', email));
      getDocs(orphanQuery).then((snap) => {
        snap.forEach((d) => {
          if (d.id !== uid) {
            const oData = d.data();
            if (oData.bonusMinutesGranted || oData.isPro || oData.subscriptionPlan) {
              const updates: any = {};
              if (typeof oData.bonusMinutesGranted === 'number') {
                updates.bonusMinutesGranted = increment(oData.bonusMinutesGranted);
              }
              if (oData.isPro) updates.isPro = true;
              if (oData.subscriptionPlan) updates.subscriptionPlan = oData.subscriptionPlan;
              if (oData.planTier) updates.planTier = oData.planTier;
              updates.dashedBy = oData.dashedBy || 'admin';
              updates.dashedAt = oData.dashedAt || serverTimestamp();
              updates.updatedAt = serverTimestamp();

              updateDoc(userDocRef, updates).catch(() => {});
              deleteDoc(doc(firestore, 'users', d.id)).catch(() => {});
            }
          }
        });
      }).catch(() => {});
    }

    if (isAdmin) {
      setIsPro(true);
      if (typeof window !== 'undefined') {
        localStorage.setItem('voiceflow_is_pro', 'true');
      }
    }

    const unsubscribe = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (isAdmin) {
          setIsPro(true);
          if (!data.isPro || data.role !== 'admin') {
            updateDoc(userDocRef, {
              isPro: true,
              role: 'admin',
              subscriptionPlan: 'Voiceflow Founder & Admin',
              planTier: 'pro'
            }).catch((e) => console.warn('Could not sync admin status in Firestore:', e));
          }
          return;
        }

        const proStatus = !!(data.isPro === true || data.planTier === 'pro' || data.subscriptionPlan?.toLowerCase().includes('pro'));
        const firestoreBonusMins = typeof data.bonusMinutesGranted === 'number' ? data.bonusMinutesGranted : 0;
        const firestoreMins = typeof data.usedMinutes === 'number' ? data.usedMinutes : 0;
        const firestoreSessions = typeof data.sessionCount === 'number' ? data.sessionCount : 0;
        const firestoreCaptures = typeof data.screenCaptureCount === 'number' ? data.screenCaptureCount : 0;

        setIsPro(proStatus);
        setBonusMinutes(firestoreBonusMins);
        setSessionCount(firestoreSessions);
        setUsedMinutes(firestoreMins);
        setScreenCaptureCount(firestoreCaptures);

        if (typeof window !== 'undefined') {
          localStorage.setItem('voiceflow_bonus_minutes', String(firestoreBonusMins));
          localStorage.setItem('voiceflow_session_count', String(firestoreSessions));
          localStorage.setItem('voiceflow_used_minutes', String(firestoreMins));
          localStorage.setItem('voiceflow_screen_capture_count', String(firestoreCaptures));
          if (proStatus) {
            localStorage.setItem('voiceflow_is_pro', 'true');
          } else {
            localStorage.removeItem('voiceflow_is_pro');
          }
        }

        // If user has bonus minutes, isPro, or was dashed by admin: clear device lock
        if (proStatus || firestoreBonusMins > 0 || data.dashedAt) {
          setIsDeviceExceeded(false);
          if (typeof window !== 'undefined') {
            localStorage.removeItem('voiceflow_device_trial_exceeded');
          }
        }
      }
    }, (err) => {
      console.warn("Could not listen to user doc for plan usage:", err);
    });

    // Also count existing meetings in Firestore to guarantee anti-cheating accuracy
    // Only applies to non-pro users with no bonus credits and no admin dash
    const meetingsQuery = query(collection(firestore, 'meetings'), where('userId', '==', uid));
    getDocs(meetingsQuery).then((snapshot) => {
      const realMeetingCount = snapshot.size;
      const currentSessions = parseInt(localStorage.getItem('voiceflow_session_count') || '0', 10);
      const curBonus = parseInt(localStorage.getItem('voiceflow_bonus_minutes') || '0', 10);
      if (curBonus <= 0 && realMeetingCount > currentSessions) {
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

    // Also persist usage to permanent device ledger to prevent account hopping
    recordDeviceSession(firestore, durationSeconds).catch((e) => {
      console.warn("Failed to update device session:", e);
    });
  }, [auth?.currentUser?.uid, firestore, sessionCount, usedMinutes]);

  const recordScreenCapture = useCallback(async (): Promise<boolean> => {
    if (isAdmin || isPro) {
      return true;
    }
    const currentCaptures = parseInt(localStorage.getItem('voiceflow_screen_capture_count') || '0', 10);
    if (currentCaptures >= maxFreeScreenCaptures) {
      return false;
    }
    const next = currentCaptures + 1;
    setScreenCaptureCount(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('voiceflow_screen_capture_count', String(next));
      window.dispatchEvent(new CustomEvent('voiceflow-usage-updated'));
    }

    if (auth?.currentUser?.uid && firestore) {
      try {
        const userDocRef = doc(firestore, 'users', auth.currentUser.uid);
        await updateDoc(userDocRef, {
          screenCaptureCount: increment(1)
        });
      } catch (e) {
        console.warn('Failed to update Firestore screen capture count:', e);
      }
    }

    recordDeviceScreenCapture(firestore).catch((e) => {
      console.warn('Failed to update device screen capture:', e);
    });

    return true;
  }, [auth?.currentUser?.uid, firestore, isAdmin, isPro, maxFreeScreenCaptures]);

  // Anti-cheating & Anti-account hopping:
  // Bello Imam is the owner/admin: NEVER restricted by limits
  // Pro users: NEVER restricted
  // User with available credits (availableCredits > 0): NEVER restricted!
  const effectiveMaxMinutes = baseFreeMinutes + bonusMinutes;
  const availableCredits = Math.max(0, effectiveMaxMinutes - usedMinutes);

  const isLimitReached = isAdmin
    ? false
    : isPro
    ? false
    : bonusMinutes > 0
    ? availableCredits <= 0
    : (availableCredits <= 0 || isDeviceExceeded || sessionCount >= maxFreeSessions);

  const isScreenCaptureLimitReached = isAdmin
    ? false
    : (!isPro && screenCaptureCount >= maxFreeScreenCaptures);

  // If device trial is exhausted without bonus minutes, clamp displayed usage to the limit
  const displaySessions = (isDeviceExceeded && !isPro && bonusMinutes <= 0) ? Math.max(sessionCount, maxFreeSessions) : sessionCount;
  const displayMinutes = (isDeviceExceeded && !isPro && bonusMinutes <= 0) ? Math.max(usedMinutes, effectiveMaxMinutes) : usedMinutes;

  return {
    isPro: isAdmin ? true : isPro,
    isAdmin,
    planName: isAdmin ? 'Voiceflow Founder & Admin' : isPro ? 'Voiceflow Pro' : bonusMinutes > 0 ? 'Basic + Bonus Credits' : 'Basic Plan',
    sessionCount: displaySessions,
    usedMinutes: displayMinutes,
    bonusMinutes,
    maxMinutes: isAdmin ? 999999 : effectiveMaxMinutes,
    maxFreeSessions: isAdmin ? 999999 : (bonusMinutes > 0 ? 999999 : maxFreeSessions),
    availableCredits: isAdmin ? 999999 : availableCredits,
    isLimitReached,
    recordSession,
    refreshUsage: syncFromStorage,
    screenCaptureCount,
    maxFreeScreenCaptures: isAdmin ? 999999 : maxFreeScreenCaptures,
    isScreenCaptureLimitReached,
    recordScreenCapture,
  };
}
