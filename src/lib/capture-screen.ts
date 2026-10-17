import { isNativeApp } from './platform';

let cachedStream: MediaStream | null = null;

async function bmpToJpeg(bmpDataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve('');
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 1280;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.75));
        } else {
          resolve(bmpDataUrl);
        }
      } catch (err) {
        console.warn('BMP conversion failed:', err);
        resolve(bmpDataUrl);
      }
    };
    img.onerror = (e) => {
      console.warn('Failed to load BMP data URL:', e);
      resolve('');
    };
    img.src = bmpDataUrl;
  });
}

export function canCaptureScreen(): boolean {
  if (typeof window === 'undefined') return true;
  const isPro = localStorage.getItem('voiceflow_is_pro') === 'true';
  if (isPro) return true;
  const count = parseInt(localStorage.getItem('voiceflow_screen_capture_count') || '0', 10);
  return count < 3;
}

export async function captureScreenBase64(): Promise<string> {
  if (!canCaptureScreen()) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open-billing-modal'));
    }
    console.warn('Screen capture blocked: Free tier limit (3 captures) reached.');
    return '';
  }

  // 1. Native Desktop App: Silent Win32 GDI capture (Zero permission prompts, completely invisible)
  if (isNativeApp()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const bmpDataUrl = await invoke<string>('capture_screen');
      if (bmpDataUrl && bmpDataUrl.startsWith('data:image/bmp;base64,')) {
        return await bmpToJpeg(bmpDataUrl);
      }
      return bmpDataUrl || '';
    } catch (err) {
      console.warn('Native screen capture failed, falling back to browser API:', err);
    }
  }

  // 2. Web fallback: Use getDisplayMedia with stream caching to avoid re-prompting every time
  try {
    let stream = cachedStream;
    if (!stream || !stream.active || stream.getVideoTracks().length === 0) {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor',
        }
      });
      cachedStream = stream;

      stream.getVideoTracks().forEach(track => {
        track.onended = () => {
          if (cachedStream === stream) {
            cachedStream = null;
          }
        };
      });
    }

    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;

      video.onloadedmetadata = () => {
        video.play();
        setTimeout(() => {
          const canvas = document.createElement('canvas');
          let width = video.videoWidth;
          let height = video.videoHeight;
          const maxDim = 1280;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');

          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const base64Image = canvas.toDataURL('image/jpeg', 0.75);
            resolve(base64Image);
          } else {
            resolve('');
          }
        }, 150);
      };

      video.onerror = () => {
        resolve('');
      };
    });
  } catch (err) {
    console.warn('Screen capture skipped or permission denied:', err);
    return '';
  }
}
