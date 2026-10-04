'use client';

import React, { createContext, useContext } from 'react';
import { useUser, useAuth as useFirebaseAuth } from '@/firebase';
import type { User } from 'firebase/auth';

interface AuthContextType {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading } = useUser();
  return (
    <AuthContext.Provider value={{ user, loading: isUserLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const { user, isUserLoading } = useUser();
  const authInstance = useFirebaseAuth();
  return { user, loading: isUserLoading, auth: authInstance };
}
