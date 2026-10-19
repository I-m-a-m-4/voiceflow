"use client";

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUser } from '@/firebase';
import AppSidebar from '@/components/dashboard/app-sidebar';
import AppHeader from '@/components/dashboard/app-header';

export default function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const isDashboard = pathname === '/dashboard';

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.replace('/login');
    }
  }, [user, isUserLoading, router]);

  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    const handleRecordState = (e: any) => {
      setIsRecording(Boolean(e.detail?.isRecording));
    };
    window.addEventListener('voiceflow-record-state', handleRecordState);
    return () => window.removeEventListener('voiceflow-record-state', handleRecordState);
  }, []);

  if (isUserLoading && !user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-muted-foreground font-medium">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className={`flex flex-1 min-h-0 h-full w-full overflow-hidden font-jakarta text-foreground selection:bg-primary/20 ${isRecording ? 'bg-transparent' : 'bg-background'}`}>
      {!isRecording && <AppSidebar />}
      <div className={`flex-1 flex flex-col min-w-0 h-full overflow-hidden ${isRecording ? 'bg-transparent' : ''}`}>
        {!isRecording && <AppHeader />}
        <main className={`flex-1 min-h-0 relative ${
          isRecording 
            ? 'overflow-visible bg-transparent' 
            : (isDashboard ? 'overflow-hidden h-full' : 'overflow-y-auto overflow-x-hidden')
        }`}>
          {children}
        </main>
      </div>
    </div>
  );
}
