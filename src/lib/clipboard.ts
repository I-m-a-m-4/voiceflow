'use client';

import { isNativeApp } from './platform';

/**
 * Copies text to the system clipboard without triggering browser/webview permission prompts.
 * In Tauri desktop, uses the native @tauri-apps/plugin-clipboard-manager.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  if (isNativeApp()) {
    try {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
      await writeText(text);
      return true;
    } catch (e) {
      console.warn('Tauri native clipboard write failed, trying web fallback:', e);
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      console.warn('navigator.clipboard.writeText failed:', e);
    }
  }

  // Fallback for older or restricted environments
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch {
    return false;
  }
}

/**
 * Reads text from the system clipboard without triggering browser/webview permission prompts.
 * In Tauri desktop, uses the native @tauri-apps/plugin-clipboard-manager directly.
 */
export async function readTextFromClipboard(): Promise<string> {
  if (isNativeApp()) {
    try {
      const { readText } = await import('@tauri-apps/plugin-clipboard-manager');
      const text = await readText();
      return text || '';
    } catch (e) {
      console.warn('Tauri native clipboard read failed:', e);
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
    try {
      return await navigator.clipboard.readText();
    } catch (e) {
      console.warn('navigator.clipboard.readText failed:', e);
    }
  }

  return '';
}
