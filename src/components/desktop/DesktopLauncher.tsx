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
          body.style.background = 'transparent';
          root.style.background = 'transparent';
          return;
        }

        // Get the actual computed HSL background from CSS variables
        const bgValue = getComputedStyle(root).getPropertyValue('--background').trim();
        
        if (bgValue) {
          const hslColor = `hsl(${bgValue})`;
          if (body.style.backgroundColor !== hslColor) {
            body.style.backgroundColor = hslColor;
          }
          if (root.style.backgroundColor !== hslColor) {
            root.style.backgroundColor = hslColor;
          }
        }
      };

      updateBackground();

      const handleRecordState = (e: any) => {
        if (e.detail?.isRecording) {
          document.body.classList.add('tauri-recording-mode');
          document.documentElement.classList.add('tauri-recording-mode');
          document.body.style.backgroundColor = 'transparent';
          document.documentElement.style.backgroundColor = 'transparent';
          document.body.style.background = 'transparent';
          document.documentElement.style.background = 'transparent';
        } else {
          document.body.classList.remove('tauri-recording-mode');
          document.documentElement.classList.remove('tauri-recording-mode');
          updateBackground();
        }
      };
      window.addEventListener('voiceflow-record-state', handleRecordState);

      // Observe class and theme changes without recursion on style attribute
      const observer = new MutationObserver(() => {
        updateBackground();
      });
      
      observer.observe(document.documentElement, { 
        attributes: true, 
        attributeFilter: ['class', 'data-theme'] 
      });

      return () => {
        window.removeEventListener('voiceflow-record-state', handleRecordState);
        observer.disconnect();
      };
    }
  }, []);

  return null;
}
