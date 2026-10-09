"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function StealthModeRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('open-settings-modal', { detail: { tab: 'general' } }));
      }
    }, 150);
  }, [router]);

  return null;
}
