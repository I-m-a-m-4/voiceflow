/**
 * Device Fingerprinting & Permanent Hardware Identification
 * Prevents free-trial abuse across multiple Gmail/OAuth accounts on the same machine.
 */

import { doc, getDoc, setDoc, updateDoc, increment, arrayUnion, serverTimestamp } from 'firebase/firestore';

let cachedDeviceId: string | null = null;
let cachedIP: string | null = null;

/**
 * Fast DJB2 hash implementation for deterministic string hashing
 */
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * 2D Canvas Fingerprinting
 * Exploits differences in GPU rasterization, antialiasing, and font rendering.
 */
function getCanvasFingerprint(): string {
  try {
    if (typeof document === 'undefined') return 'server';
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'nocanvas';

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ff6b00';
    ctx.fillRect(100, 5, 80, 25);

    ctx.fillStyle = '#111827';
    ctx.font = '15px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Voiceflow 🎙️ AntiFraud v1', 4, 18);

    ctx.fillStyle = 'rgba(255, 107, 0, 0.65)';
    ctx.shadowBlur = 4;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.fillText('Voiceflow 🎙️ AntiFraud v1', 6, 20);

    return djb2Hash(canvas.toDataURL());
  } catch {
    return 'canvas_err';
  }
}

/**
 * WebGL GPU Renderer Fingerprint
 */
function getWebGLFingerprint(): string {
  try {
    if (typeof document === 'undefined') return 'nowebgl';
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return 'nowebgl';

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '';
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
      return `${vendor}_${renderer}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
    }
    return String(gl.getParameter(gl.RENDERER) || 'webgl').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  } catch {
    return 'webgl_err';
  }
}

/**
 * Cookie persistence helper (10-year persistence)
 */
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name: string, value: string) {
  if (typeof document === 'undefined') return;
  // 10 years expiration = 315360000 seconds
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=315360000; SameSite=Lax`;
}

/**
 * Retrieves or generates the permanent device identifier.
 * Priority:
 * 1. Tauri Native Machine GUID (Windows registry MachineGuid / macOS IOPlatformUUID / Linux machine-id)
 * 2. Persistent storage (localStorage / 10-year Cookie)
 * 3. Deterministic hardware synthesis (CPU + GPU + Canvas + Screen + Timezone)
 */
export async function getDeviceFingerprint(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  // 1. Check permanent storage caches
  if (typeof window !== 'undefined') {
    const localSaved = localStorage.getItem('voiceflow_permanent_device_id');
    const cookieSaved = getCookie('vf_perm_device_id');
    if (localSaved && localSaved.length > 8) {
      cachedDeviceId = localSaved;
      if (!cookieSaved) setCookie('vf_perm_device_id', localSaved);
      return cachedDeviceId;
    }
    if (cookieSaved && cookieSaved.length > 8) {
      cachedDeviceId = cookieSaved;
      localStorage.setItem('voiceflow_permanent_device_id', cookieSaved);
      return cachedDeviceId;
    }
  }

  let machineGuid = '';

  // 2. Query Tauri native command if available in Desktop App
  if (typeof window !== 'undefined') {
    try {
      const isTauri = !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__;
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        const guid = await invoke<string>('get_machine_guid');
        if (guid && typeof guid === 'string' && guid.trim().length > 0) {
          machineGuid = guid.trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '');
        }
      }
    } catch {
      // Non-tauri or invoke failed, fallback to browser synthesis
    }
  }

  if (machineGuid && machineGuid.length > 5) {
    const deviceId = `hw_${machineGuid}`;
    cachedDeviceId = deviceId;
    if (typeof window !== 'undefined') {
      localStorage.setItem('voiceflow_permanent_device_id', deviceId);
      setCookie('vf_perm_device_id', deviceId);
    }
    return deviceId;
  }

  // 3. Deterministic hardware signal synthesis
  let screenSpec = '0x0';
  let cores = '4';
  let memory = '8';
  let timezone = 'UTC';
  let platform = 'unknown';

  if (typeof window !== 'undefined') {
    screenSpec = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}@${window.devicePixelRatio || 1}`;
    cores = String(navigator.hardwareConcurrency || 4);
    memory = String((navigator as any).deviceMemory || 8);
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      timezone = 'UTC';
    }
    platform = (navigator.platform || '').replace(/[^a-zA-Z0-9]/g, '');
  }

  const canvasHash = getCanvasFingerprint();
  const gpuRenderer = getWebGLFingerprint();

  const hardwareKey = `dev_${platform}_${cores}c_${memory}m_${screenSpec}_${canvasHash}_${gpuRenderer}_${timezone}`;
  const finalHash = djb2Hash(hardwareKey) + djb2Hash(hardwareKey.split('').reverse().join(''));
  const deviceId = `dev_${platform.slice(0, 4)}_${finalHash}`;

  cachedDeviceId = deviceId;
  if (typeof window !== 'undefined') {
    localStorage.setItem('voiceflow_permanent_device_id', deviceId);
    setCookie('vf_perm_device_id', deviceId);
  }

  return deviceId;
}

/**
 * Fetch and cache public IP address
 */
export async function getPublicIP(): Promise<string> {
  if (cachedIP) return cachedIP;

  if (typeof window !== 'undefined') {
    const saved = sessionStorage.getItem('voiceflow_public_ip') || localStorage.getItem('voiceflow_public_ip');
    if (saved) {
      cachedIP = saved;
      return saved;
    }
  }

  const providers = [
    { url: 'https://api.ipify.org?format=json', read: (d: any) => d?.ip },
    { url: 'https://ipwho.is/', read: (d: any) => (d?.success ? d.ip : undefined) },
    { url: 'https://api.db-ip.com/v2/free/self', read: (d: any) => d?.ipAddress },
  ];

  for (const p of providers) {
    try {
      const res = await fetch(p.url, { signal: AbortSignal.timeout(3500) });
      if (!res.ok) continue;
      const data = await res.json();
      const ip = p.read(data);
      if (ip && typeof ip === 'string') {
        cachedIP = ip.trim();
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('voiceflow_public_ip', cachedIP);
          localStorage.setItem('voiceflow_public_ip', cachedIP);
        }
        return cachedIP;
      }
    } catch {
      // try next provider
    }
  }

  return 'Unknown';
}

export interface DeviceTrialInfo {
  deviceId: string;
  trialExceeded: boolean;
  sessionCount: number;
  usedMinutes: number;
  screenCaptureCount?: number;
  primaryEmail?: string;
  isPro?: boolean;
}

/**
 * Synchronizes and enforces the permanent device-level free trial.
 * Prevents account hopping: if this laptop has already completed 3 sessions or 30 minutes,
 * any new Gmail account created or logged into on this laptop is immediately marked limit reached.
 */
export async function syncDeviceTrial(
  firestore: any,
  user?: { uid: string; email?: string | null } | null
): Promise<DeviceTrialInfo> {
  const deviceId = await getDeviceFingerprint();
  const currentEmail = user?.email?.toLowerCase() || '';
  const isAdmin = currentEmail === 'belloimam431@gmail.com';

  if (isAdmin) {
    return {
      deviceId,
      trialExceeded: false,
      sessionCount: 0,
      usedMinutes: 0,
      screenCaptureCount: 0,
      isPro: true
    };
  }

  const localSessions = parseInt(localStorage.getItem('voiceflow_session_count') || '0', 10);
  const localMins = parseInt(localStorage.getItem('voiceflow_used_minutes') || '0', 10);
  const localExceeded = localStorage.getItem('voiceflow_device_trial_exceeded') === 'true' || localSessions >= 3 || localMins >= 30;

  if (!firestore) {
    return {
      deviceId,
      trialExceeded: localExceeded,
      sessionCount: localSessions,
      usedMinutes: localMins,
      screenCaptureCount: parseInt(localStorage.getItem('voiceflow_screen_capture_count') || '0', 10)
    };
  }

  try {
    const devDocRef = doc(firestore, 'devices', deviceId);
    const devSnap = await getDoc(devDocRef);

    if (devSnap.exists()) {
      const devData = devSnap.data();
      const serverSessions = typeof devData.sessionCount === 'number' ? devData.sessionCount : 0;
      const serverMins = typeof devData.usedMinutes === 'number' ? devData.usedMinutes : 0;
      const devHasPro = devData.hasPro === true || devData.isPro === true;
      const serverCaptures = typeof devData.screenCaptureCount === 'number' ? devData.screenCaptureCount : 0;
      const localCaptures = parseInt(localStorage.getItem('voiceflow_screen_capture_count') || '0', 10);
      const effectiveCaptures = Math.max(serverCaptures, localCaptures);
      localStorage.setItem('voiceflow_screen_capture_count', String(effectiveCaptures));

      const effectiveSessions = Math.max(serverSessions, localSessions);
      const effectiveMins = Math.max(serverMins, localMins);
      const isExceeded = !devHasPro && (devData.trialExceeded === true || effectiveSessions >= 3 || effectiveMins >= 30);

      if (isExceeded) {
        // Enforce limit lock locally
        localStorage.setItem('voiceflow_device_trial_exceeded', 'true');
        localStorage.setItem('voiceflow_session_count', String(Math.max(3, effectiveSessions)));
        localStorage.setItem('voiceflow_used_minutes', String(Math.max(30, effectiveMins)));
        window.dispatchEvent(new CustomEvent('voiceflow-usage-updated'));

        // If user is logged in, link user doc to this device's exceeded state
        if (user?.uid) {
          const userDocRef = doc(firestore, 'users', user.uid);
          updateDoc(userDocRef, {
            deviceId,
            deviceTrialExceeded: true,
            sessionCount: Math.max(3, effectiveSessions),
            usedMinutes: Math.max(30, effectiveMins)
          }).catch(() => {});
        }
      }

      // Keep registered emails updated
      if (currentEmail) {
        updateDoc(devDocRef, {
          lastSeen: serverTimestamp(),
          registeredEmails: arrayUnion(currentEmail),
          registeredUids: user?.uid ? arrayUnion(user.uid) : [],
          trialExceeded: isExceeded,
          sessionCount: effectiveSessions,
          usedMinutes: effectiveMins,
          screenCaptureCount: effectiveCaptures
        }).catch(() => {});
      }

      return {
        deviceId,
        trialExceeded: isExceeded,
        sessionCount: effectiveSessions,
        usedMinutes: effectiveMins,
        screenCaptureCount: effectiveCaptures,
        primaryEmail: devData.primaryEmail,
        isPro: devHasPro
      };
    } else {
      // First time device is registered
      const ip = await getPublicIP().catch(() => 'Unknown');
      const isExceeded = localExceeded;
      const localCaptures = parseInt(localStorage.getItem('voiceflow_screen_capture_count') || '0', 10);

      await setDoc(devDocRef, {
        deviceId,
        primaryEmail: currentEmail,
        primaryUid: user?.uid || '',
        registeredEmails: currentEmail ? [currentEmail] : [],
        registeredUids: user?.uid ? [user.uid] : [],
        sessionCount: localSessions,
        usedMinutes: localMins,
        screenCaptureCount: localCaptures,
        trialExceeded: isExceeded,
        hasPro: false,
        ip,
        platform: typeof navigator !== 'undefined' ? navigator.platform : '',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        firstSeen: serverTimestamp(),
        lastSeen: serverTimestamp()
      }, { merge: true });

      if (isExceeded) {
        localStorage.setItem('voiceflow_device_trial_exceeded', 'true');
      }

      return {
        deviceId,
        trialExceeded: isExceeded,
        sessionCount: localSessions,
        usedMinutes: localMins,
        screenCaptureCount: localCaptures,
        primaryEmail: currentEmail,
        isPro: false
      };
    }
  } catch (err) {
    console.warn('Could not sync device trial with Firestore:', err);
    return {
      deviceId,
      trialExceeded: localExceeded,
      sessionCount: localSessions,
      usedMinutes: localMins,
      screenCaptureCount: parseInt(localStorage.getItem('voiceflow_screen_capture_count') || '0', 10)
    };
  }
}

/**
 * Increment usage on the permanent device record when a session completes
 */
export async function recordDeviceSession(
  firestore: any,
  durationSeconds: number = 60
): Promise<void> {
  const sessionMins = Math.max(1, Math.ceil(durationSeconds / 60));
  const deviceId = await getDeviceFingerprint();

  // Update local storage
  const curSessions = parseInt(localStorage.getItem('voiceflow_session_count') || '0', 10) + 1;
  const curMins = parseInt(localStorage.getItem('voiceflow_used_minutes') || '0', 10) + sessionMins;

  localStorage.setItem('voiceflow_session_count', String(curSessions));
  localStorage.setItem('voiceflow_used_minutes', String(curMins));

  if (curSessions >= 3 || curMins >= 30) {
    localStorage.setItem('voiceflow_device_trial_exceeded', 'true');
  }

  window.dispatchEvent(new CustomEvent('voiceflow-usage-updated'));

  if (!firestore) return;

  try {
    const devDocRef = doc(firestore, 'devices', deviceId);
    await updateDoc(devDocRef, {
      sessionCount: increment(1),
      usedMinutes: increment(sessionMins),
      lastSeen: serverTimestamp(),
      trialExceeded: curSessions >= 3 || curMins >= 30
    });
  } catch (err) {
    console.warn('Could not update device usage in Firestore:', err);
  }
}

/**
 * Increment screen capture count on the permanent device record
 */
export async function recordDeviceScreenCapture(firestore: any): Promise<number> {
  const deviceId = await getDeviceFingerprint();
  const curCaptures = parseInt(localStorage.getItem('voiceflow_screen_capture_count') || '0', 10) + 1;
  localStorage.setItem('voiceflow_screen_capture_count', String(curCaptures));
  window.dispatchEvent(new CustomEvent('voiceflow-usage-updated'));

  if (!firestore) return curCaptures;

  try {
    const devDocRef = doc(firestore, 'devices', deviceId);
    await updateDoc(devDocRef, {
      screenCaptureCount: increment(1),
      lastSeen: serverTimestamp()
    });
  } catch (err) {
    console.warn('Could not update device screen capture in Firestore:', err);
  }
  return curCaptures;
}

/**
 * Upgrade device status to Pro upon purchase
 */
export async function markDevicePro(firestore: any): Promise<void> {
  const deviceId = await getDeviceFingerprint();
  if (typeof window !== 'undefined') {
    localStorage.removeItem('voiceflow_device_trial_exceeded');
  }
  if (!firestore) return;
  try {
    const devDocRef = doc(firestore, 'devices', deviceId);
    await updateDoc(devDocRef, {
      hasPro: true,
      isPro: true,
      trialExceeded: false,
      lastSeen: serverTimestamp()
    });
  } catch (err) {
    console.warn('Could not mark device as Pro in Firestore:', err);
  }
}
