import type { DateKey, Stamp } from '../core/model/types';

export function getLocalDateKey(now: Date = new Date()): DateKey {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getLocalStamp(now: Date = new Date()): Stamp {
  const datePart = getLocalDateKey(now);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const absMin = Math.abs(offsetMin);
  const oh = String(Math.floor(absMin / 60)).padStart(2, '0');
  const om = String(absMin % 60).padStart(2, '0');
  return `${datePart}T${hh}:${mm}:${ss}${sign}${oh}:${om}`;
}

export function downloadTextFile(filename: string, content: string, mimeType = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 1000);
}

export async function readFileText(file: File): Promise<string> {
  return file.text();
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function prefersLightTheme(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches;
}

export function triggerHaptic(
  kind: 'light' | 'medium',
  enabled: boolean,
  reducedMotion: boolean,
): void {
  if (!enabled || reducedMotion) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(kind === 'medium' ? 24 : 10);
  } catch {
    // Ignore vibration errors in locked-down webviews
  }
}

export function playGentleChime(
  kind: 'checkin' | 'stage-up',
  enabled: boolean,
): void {
  if (!enabled) return;
  if (typeof window === 'undefined') return;
  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;
  try {
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = kind === 'stage-up' ? 523.25 : 440;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.025, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'stage-up' ? 0.28 : 0.14));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
    window.setTimeout(() => {
      void ctx.close?.();
    }, 350);
  } catch {
    // Ignore audio errors in sandboxed / silent environments
  }
}
