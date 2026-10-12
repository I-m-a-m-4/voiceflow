'use client';

import { useEffect } from 'react';

/**
 * DesktopLauncher handles Tauri-specific body styling and system events.
 */
export function DesktopLauncher() {
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) return;

      // Mark as desktop environment
      document.body.classList.add('is-desktop');
      
      const updateBackground = () => {
        const root = document.documentElement;
        const body = document.body;
        
        // If recording / stealth overlay is active, keep background 100% transparent so other desktop windows remain visible
        if (root.classList.contains('recording-active') || body.classList.contains('recording-active')) {
          body.style.backgroundColor = 'transparent';
          root.style.backgroundColor = 'transparent';
          return;
        }

        // Get the actual computed HSL background from CSS variables
        const bgValue = getComputedStyle(root).getPropertyValue('--background').trim();
        
        if (bgValue) {
          const hslColor = `hsl(${bgValue})`;
          body.style.backgroundColor = hslColor;
          root.style.backgroundColor = hslColor;
          
          // Debugging log for Tauri console
          console.log(`[Voiceflow Desktop] Syncing background: ${hslColor} (Theme: ${root.classList.contains('dark') ? 'Dark' : 'Light'})`);
        }
      };

      updateBackground();

      // Listen for recording state changes to instantly make background transparent
      const handleRecordState = (e: any) => {
        const active = Boolean(e.detail?.isRecording);
        const root = document.documentElement;
        const body = document.body;
        if (active) {
          body.style.backgroundColor = 'transparent';
          root.style.backgroundColor = 'transparent';
        } else {
          updateBackground();
        }
      };
      window.addEventListener('voiceflow-record-state', handleRecordState);

      // Observe BOTH class changes (theme) and style changes
      const observer = new MutationObserver((mutations) => {
        updateBackground();
      });
      
      observer.observe(document.documentElement, { 
        attributes: true, 
        attributeFilter: ['class', 'style', 'data-theme'] 
      });

      return () => {
        window.removeEventListener('voiceflow-record-state', handleRecordState);
        observer.disconnect();
      };
    }
  }, []);

  return null;
}
