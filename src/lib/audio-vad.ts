/**
 * Pure audio signal & speaker-bleed helpers shared between `useAudioRecorder`
 * and production-replay tests.
 */

// Human speech lives primarily in 300 Hz – 3,400 Hz.
// Measuring only these FFT bins (instead of averaging all 0–24 kHz bins) prevents
// high-frequency silence from diluting speech energy by ~6x and dropping softer voices.
export const VOICE_BAND_MIN_HZ = 300;
export const VOICE_BAND_MAX_HZ = 3400;
export const VOICE_BAND_ENERGY_THRESHOLD = 8.0;
export const TIME_DOMAIN_RMS_THRESHOLD = 0.008;

export interface VoiceActivityResult {
  hasSpeech: boolean;
  voiceBandAvg: number;
  rms: number;
}

export function evaluateVoiceActivity(
  freqData: Uint8Array,
  timeData: Float32Array | null,
  sampleRate = 48000,
  fftSize = 256
): VoiceActivityResult {
  let voiceBandAvg = 0;
  if (freqData && freqData.length > 0) {
    const sr = sampleRate > 0 ? sampleRate : 48000;
    const binHz = sr / Math.max(fftSize, freqData.length * 2);
    const startBin = Math.max(1, Math.floor(VOICE_BAND_MIN_HZ / binHz));
    const endBin = Math.min(freqData.length - 1, Math.max(startBin, Math.ceil(VOICE_BAND_MAX_HZ / binHz)));

    let sum = 0;
    let count = 0;
    for (let i = startBin; i <= endBin; i++) {
      sum += freqData[i];
      count += 1;
    }
    voiceBandAvg = count > 0 ? sum / count : 0;
  }

  let rms = 0;
  if (timeData && timeData.length > 0) {
    let sumSq = 0;
    for (let i = 0; i < timeData.length; i++) {
      const s = timeData[i];
      sumSq += s * s;
    }
    rms = Math.sqrt(sumSq / timeData.length);
  }

  const hasSpeech = voiceBandAvg >= VOICE_BAND_ENERGY_THRESHOLD || rms >= TIME_DOMAIN_RMS_THRESHOLD;
  return { hasSpeech, voiceBandAvg, rms };
}

function normalizeWords(text: string): string[] {
  return (text || "")
    .replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/g, " ")
    .replace(/\[(THEM|YOU)\]\s*/gi, " ")
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

/**
 * Detects laptop-speaker echo where the microphone (`[YOU]`) picked up the exact same
 * sentence that WASAPI loopback (`[THEM]`) already transcribed within ±14 seconds.
 */
export function isDuplicateSpeakerBleed(
  youText: string,
  youOrderKey: number,
  committedEntries: Array<{ orderKey: number; text: string }>
): boolean {
  if (!/\[YOU\]/i.test(youText)) return false;
  const youWords = normalizeWords(youText);
  if (youWords.length < 3) return false;
  const youSet = new Set(youWords);

  for (const entry of committedEntries) {
    if (!/\[THEM\]/i.test(entry.text)) continue;
    if (Math.abs(entry.orderKey - youOrderKey) > 14_000) continue;

    const themWords = normalizeWords(entry.text);
    if (themWords.length < 3) continue;
    const themSet = new Set(themWords);

    let overlap = 0;
    for (const w of youSet) {
      if (themSet.has(w)) overlap += 1;
    }
    const containment = overlap / youSet.size;
    const jaccard = overlap / (youSet.size + themSet.size - overlap);

    // If >= 75% of [YOU]'s words are verbatim inside the adjacent [THEM] turn (or Jaccard >= 0.65),
    // this mic chunk is pure speaker bleed rather than the user speaking.
    if (containment >= 0.75 || jaccard >= 0.65) {
      return true;
    }
  }

  return false;
}

