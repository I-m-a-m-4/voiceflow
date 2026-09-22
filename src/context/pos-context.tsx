"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '@/firebase';
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
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [businessData, setBusinessData] = useState<BusinessInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [isConfettiActive, setIsConfettiActive] = useState(false);

  useEffect(() => {
    if (!auth?.currentUser) {
      setUserProfile(null);
      setBusinessData(null);
      setLoading(false);
      return;
    }

    const userRef = doc(db, 'users', auth.currentUser.uid);
    const unsubUser = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const uData = { id: snap.id, ...snap.data() } as UserProfile;
        setUserProfile(uData);

        if (uData.businessId) {
          const bizRef = doc(db, 'businesses', uData.businessId);
          onSnapshot(bizRef, (bSnap) => {
            if (bSnap.exists()) {
              setBusinessData({ id: bSnap.id, ...bSnap.data() } as BusinessInstance);
            }
          });
        }
      }
      setLoading(false);
    });

    return () => unsubUser();
  }, [auth]);

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
