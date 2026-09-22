"use client";
import React, { createContext, useContext } from 'react';

const BranchContext = createContext<any>({
  currentBranch: null,
  branches: [],
  switchBranch: () => {},
});

export function BranchProvider({ children }: { children: React.ReactNode }) {
  return <BranchContext.Provider value={{ currentBranch: null, branches: [], switchBranch: () => {} }}>{children}</BranchContext.Provider>;
}

export function useBranch() {
  return useContext(BranchContext);
}
