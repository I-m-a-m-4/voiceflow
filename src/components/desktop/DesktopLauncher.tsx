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

        // If recording mode is active, background MUST be 100% transparent for floating overlay
        if (
          root.classList.contains('tauri-recording-mode') || 
          body.classList.contains('tauri-recording-mode')
        ) {
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
        }
      };

      updateBackground();

      const handleRecordState = (e: any) => {
        if (e.detail?.isRecording) {
          document.body.style.backgroundColor = 'transparent';
          document.documentElement.style.backgroundColor = 'transparent';
        } else {
          updateBackground();
        }
      };
      window.addEventListener('voiceflow-record-state', handleRecordState);

      // Observe BOTH class changes (theme) and style changes
      const observer = new MutationObserver(() => {
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
