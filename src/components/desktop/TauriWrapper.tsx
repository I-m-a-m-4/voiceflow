'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { usePOS } from '@/context/pos-context';

/**
 * Routes that own the top inset, so the wrapper must not paint it.
 *
 * The `h-9` spacer below exists for the **desktop** custom title bar, but
 * `__TAURI_INTERNALS__` is present on Android and iOS too, so the mobile shells get
 * it as well — and there it lands exactly where the OS status bar sits. That is
 * harmless (36px is about a status bar tall, so it doubles as the inset that keeps
 * a page's top row clear of the clock) right up until the page behind it is dark:
 * the spacer is transparent, the wrapper is `bg-background`, and on `/welcome` that
 * put a warm-white band across the top of a full-bleed dark video. The status bar
 * icons are drawn by Android from the *system* theme, so a shop running the app in
 * light mode with the phone in dark mode gets white icons on that white band —
 * invisible.
 *
 * So a route listed here keeps the spacer (removing it would slide the logo under
 * the clock) and gets a black wrapper instead of the app background. It is a list
 * rather than a prop because the wrapper is mounted once in the root layout, above
 * every route group.
 *
 * Note this is the *only* lever that works in the Tauri Android shell: the WebView
 * ignores `<meta name="theme-color">`, which is why the imperative one in
 * `welcome/page.tsx` never moved this band — that meta is for the browser and the
 * PWA, where there is no spacer to begin with.
 */
const DARK_TOP_INSET_ROUTES = new Set(['/welcome']);

export function TauriLayoutWrapper({ children }: { children: React.ReactNode }) {
  const [isTauri, setIsTauri] = useState(false);
  const pathname = usePathname();
  const darkTopInset = DARK_TOP_INSET_ROUTES.has(pathname ?? '');

  const { business } = usePOS();

  useEffect(() => {
    const checkTauri = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        if (getCurrentWindow()) {
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
          if (!isMobile) {
            setIsTauri(true);
          }
        }
      } catch {
        if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
          setIsTauri(true);
        }
      }
    };
    checkTauri();
  }, []);

  useEffect(() => {
    if (isTauri) {
      const enabled = !!(business?.settings as any)?.screenShareProtectionEnabled;
      import('@tauri-apps/api/window').then(async ({ getAllWindows }) => {
        const windows = await getAllWindows();
        windows.forEach((w: any) => w.setContentProtected(enabled).catch(console.error));
      }).catch(console.error);

      // Listen for Global Shortcuts from Tauri Rust Backend
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen('shortcut-visibility', () => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('voiceflow-shortcut-visibility'));
          }
        });
        listen('shortcut-ask', () => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('voiceflow-shortcut-ask'));
          }
        });
        listen('shortcut-clear', () => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('voiceflow-shortcut-clear'));
          }
        });
        listen('shortcut-session', () => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('voiceflow-shortcut-session'));
          }
        });
      }).catch(console.error);
    }
  }, [isTauri, (business?.settings as any)?.screenShareProtectionEnabled]);

  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    const handleRecordState = (e: any) => {
      setIsRecording(Boolean(e.detail?.isRecording));
    };
    window.addEventListener('voiceflow-record-state', handleRecordState);
    return () => window.removeEventListener('voiceflow-record-state', handleRecordState);
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      if (isRecording) {
        document.documentElement.classList.add('tauri-recording-mode');
        document.body.classList.add('tauri-recording-mode');
      } else {
        document.documentElement.classList.remove('tauri-recording-mode');
        document.body.classList.remove('tauri-recording-mode');
      }
    }
  }, [isRecording]);

  // On the web (browser), render normal scrollable page layout for marketing/public routes only
  const isMarketingRoute = !pathname || pathname === '/' || 
    pathname.startsWith('/pricing') || 
    pathname.startsWith('/blog') || 
    pathname.startsWith('/legal') || 
    pathname.startsWith('/careers') || 
    pathname.startsWith('/contact') || 
    pathname.startsWith('/help-center') || 
    pathname.startsWith('/about') || 
    pathname.startsWith('/zen-ai') || 
    pathname.startsWith('/download');

  if (!isTauri && isMarketingRoute) {
    return (
      <div className="flex flex-col min-h-screen w-full bg-background text-foreground overflow-x-hidden">
        {children}
      </div>
    );
  }

  // Inside desktop Tauri shell OR application routes on web
  return (
    <div
      className={cn(
        "flex flex-col w-full overflow-hidden",
        isRecording 
          ? "h-0 max-h-0 bg-transparent overflow-hidden pointer-events-none" 
          : (darkTopInset 
              ? "h-screen max-h-screen overflow-hidden bg-black text-white" 
              : "h-screen max-h-screen overflow-hidden bg-background text-foreground")
      )}
    >
      <div className={cn("flex-1 flex flex-col relative min-h-0 overflow-hidden", isRecording && "hidden")}>
        {children}
      </div>
    </div>
  );
}
