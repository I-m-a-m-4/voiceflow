"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth, useUser } from '@/firebase';
import { ensureUserProfile } from '@/firebase/users';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase';
import type { UserProfile, BusinessInstance } from '@/types';

interface AppContextType {
  userProfile: UserProfile | null;
  currentUserProfile: UserProfile | null;
  user: UserProfile | null;
  businessData: BusinessInstance | null;
  business: BusinessInstance | null;
  businessId: string | null;
  loading: boolean;
  isLoading: boolean;
  isOnline: boolean;
  refreshData: () => Promise<void>;
  triggerRefresh: () => Promise<void>;
  addToQueue: (action: any, label?: string) => Promise<void>;
  removeFromQueue: (id: string) => Promise<void>;
  clearFailedActions: () => Promise<void>;
  processQueue: () => Promise<void>;
  mutateBusiness: (data: any) => Promise<void>;
  impersonateUser: (u: any) => void;
  stats: any;
  isImpersonating: boolean;
  currencySymbol: string;
  firestore: any;
  isConfettiActive: boolean;
  setIsConfettiActive: (active: boolean) => void;
  users: UserProfile[];
  currentBusiness: BusinessInstance | null;
  // Legacy arrays
  products: any[];
  customers: any[];
  receipts: any[];
  cart: any[];
}

const AppContext = createContext<AppContextType>({
  userProfile: null,
  currentUserProfile: null,
  user: null,
  businessData: null,
  business: null,
  currentBusiness: null,
  businessId: null,
  loading: true,
  isLoading: true,
  isOnline: true,
  refreshData: async () => {},
  triggerRefresh: async () => {},
  addToQueue: async () => {},
  removeFromQueue: async () => {},
  clearFailedActions: async () => {},
  processQueue: async () => {},
  mutateBusiness: async () => {},
  impersonateUser: () => {},
  stats: null,
  isImpersonating: false,
  currencySymbol: '$',
  firestore: null,
  isConfettiActive: false,
  setIsConfettiActive: () => {},
  users: [],
  products: [],
  customers: [],
  receipts: [],
  cart: [],
});

export function POSProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const { user: authUser, isUserLoading } = useUser();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [businessData, setBusinessData] = useState<BusinessInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConfettiActive, setIsConfettiActive] = useState(false);
  const healedUidsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (isUserLoading) return;

    const liveUser = auth?.currentUser;
    if (!liveUser || !authUser) {
      setUserProfile(null);
      setBusinessData(null);
      setLoading(false);
      return;
    }

    let unsubBiz: (() => void) | null = null;
    const userRef = doc(db, 'users', liveUser.uid);
    const unsubUser = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          const uData = { id: snap.id, ...snap.data() } as UserProfile;
          setUserProfile(uData);

          if (uData.businessId) {
            if (unsubBiz) unsubBiz();
            const bizRef = doc(db, 'businessInstances', uData.businessId);
            unsubBiz = onSnapshot(
              bizRef,
              (bSnap) => {
                if (bSnap.exists()) {
                  setBusinessData({ id: bSnap.id, ...bSnap.data() } as BusinessInstance);
                }
              },
              () => {}
            );
          }
        } else if (!healedUidsRef.current.has(liveUser.uid)) {
          // Self-heal any signed-in user whose Firestore profile was never created during signup
          healedUidsRef.current.add(liveUser.uid);
          void ensureUserProfile(db, liveUser).catch((err) => {
            console.warn('POSProvider profile self-heal failed:', err);
          });
        }
        setLoading(false);
      },
      () => {
        setLoading(false);
      }
    );

    return () => {
      unsubUser();
      if (unsubBiz) unsubBiz();
    };
  }, [auth, authUser, isUserLoading]);

  const refreshData = async () => {};

  return (
    <AppContext.Provider
      value={{
        userProfile,
        currentUserProfile: userProfile,
        user: userProfile,
        businessData,
        business: businessData,
        businessId: userProfile?.businessId || null,
        loading,
        isLoading: loading,
        isOnline: true,
        refreshData,
        triggerRefresh: refreshData,
        addToQueue: async () => {},
        removeFromQueue: async () => {},
        clearFailedActions: async () => {},
        processQueue: async () => {},
        mutateBusiness: async () => {},
        impersonateUser: () => {},
        stats: null,
        isImpersonating: false,
        currencySymbol: '$',
        firestore: db,
        isConfettiActive,
        setIsConfettiActive,
        users: [],
        currentBusiness: businessData,
        products: [],
        customers: [],
        receipts: [],
        cart: [],
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function usePOS() {
  return useContext(AppContext);
}

export function useApp() {
  return useContext(AppContext);
}
