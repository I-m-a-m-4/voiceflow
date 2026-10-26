/**
 * Global Meeting & Recording State Utility
 * Guards against disruptive UI events (popups, toasts, billing modals, updater banners, notification sounds)
 * while a meeting or interview recording session is actively in progress.
 */

export function isMeetingRecordingActive(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (document.body?.classList?.contains('tauri-recording-mode')) return true;
    if (document.documentElement?.classList?.contains('tauri-recording-mode')) return true;
    if (localStorage.getItem('voiceflow_is_recording') === 'true') return true;
    if (sessionStorage.getItem('voiceflow_is_recording') === 'true') return true;
  } catch {
    // ignore local storage restrictions in sandbox
  }
  return false;
}
