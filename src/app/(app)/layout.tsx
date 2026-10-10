"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/firebase';
import AppSidebar from '@/components/dashboard/app-sidebar';
import AppHeader from '@/components/dashboard/app-header';

export default function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = useAuth();
  const router = useRouter();
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    if (user === null) {
      router.replace('/login');
    }
  }, [user, router]);

  useEffect(() => {
    const handleRecordState = (e: any) => {
      const active = Boolean(e.detail?.isRecording);
      setIsRecording(active);
      if (typeof document !== 'undefined') {
        if (active) {
          document.documentElement.classList.add('recording-active');
          document.body.classList.add('recording-active');
        } else {
          document.documentElement.classList.remove('recording-active');
          document.body.classList.remove('recording-active');
        }
      }
    };
    window.addEventListener('voiceflow-record-state', handleRecordState);
    return () => {
      window.removeEventListener('voiceflow-record-state', handleRecordState);
      if (typeof document !== 'undefined') {
        document.documentElement.classList.remove('recording-active');
        document.body.classList.remove('recording-active');
      }
    };
  }, []);

  if (!user) return null; // Or a loading spinner

  return (
    <div className={`flex h-screen max-h-screen w-full overflow-hidden font-jakarta text-foreground selection:bg-primary/20 ${
      isRecording ? 'bg-transparent' : 'bg-background'
    }`}>
      {!isRecording && <AppSidebar />}
      <div className={`flex-1 flex flex-col min-w-0 h-full max-h-screen overflow-hidden ${isRecording ? 'bg-transparent' : ''}`}>
        {!isRecording && <AppHeader />}
        <main className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative ${isRecording ? 'bg-transparent overflow-visible' : ''}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
