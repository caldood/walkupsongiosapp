/** Thin wrappers over optional browser APIs. Every function degrades silently when unsupported. */

import type { AudioState } from './AudioManager';

// ── Screen wake lock ────────────────────────────────────────────────────────
type WakeLockSentinelLike = { release(): Promise<void> };
let sentinel: WakeLockSentinelLike | null = null;
let wanted = false;

async function acquire() {
  const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } };
  if (!wanted || !nav.wakeLock || sentinel || document.visibilityState !== 'visible') return;
  try {
    sentinel = await nav.wakeLock.request('screen');
  } catch {
    sentinel = null;
  }
}

export function setKeepAwake(on: boolean) {
  wanted = on;
  if (on) void acquire();
  else if (sentinel) {
    void sentinel.release().catch(() => undefined);
    sentinel = null;
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    // The browser drops the lock when the page is hidden; take it again when we're back.
    sentinel = null;
    void acquire();
  });
}

export const wakeLockSupported = () => typeof navigator !== 'undefined' && 'wakeLock' in navigator;

// ── Media Session (lock-screen / Bluetooth speaker buttons) ───────────────────
export interface MediaSessionHandlers {
  play(): void;
  pause(): void;
  next?(): void;
  previous?(): void;
}

export function bindMediaSession(h: MediaSessionHandlers) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  const set = (a: MediaSessionAction, fn?: () => void) => {
    try {
      navigator.mediaSession.setActionHandler(a, fn ?? null);
    } catch {
      /* unsupported action */
    }
  };
  set('play', h.play);
  set('pause', h.pause);
  set('nexttrack', h.next);
  set('previoustrack', h.previous);
}

export function updateMediaSession(state: AudioState) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  if (!state.track) {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = 'none';
    return;
  }
  navigator.mediaSession.metadata = new MediaMetadata({ title: state.track.title, artist: state.track.subtitle ?? 'Game Day Music' });
  navigator.mediaSession.playbackState = state.status === 'playing' ? 'playing' : 'paused';
}

// ── Audio output label ───────────────────────────────────────────────────────
/**
 * Best-effort description of where sound is going. Browsers (especially iOS Safari) do not expose
 * the active output, so the honest default is the device name (current system output). The app never depends on this.
 */
export async function describeAudioOutput(): Promise<string> {
  try {
    const devices = await navigator.mediaDevices?.enumerateDevices?.();
    const outs = (devices ?? []).filter((d) => d.kind === 'audiooutput' && d.label);
    const bt = outs.find((d) => /bluetooth|speaker|airpods|jbl|bose|ue/i.test(d.label) && !/iphone/i.test(d.label));
    if (bt) return bt.label;
  } catch {
    /* ignore */
  }
  return deviceName();
}

/** "iPhone", "iPad", "Mac" or "This device" – what the system output belongs to when no named output is exposed. */
export function deviceName(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Macintosh/.test(ua)) return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1 ? 'iPad' : 'Mac';
  return 'This device';
}

/** Short test tone so the coach can confirm the Bluetooth speaker is connected. */
export function playTestTone(): Promise<void> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return Promise.resolve();
  const ctx = new Ctx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 660;
  gain.gain.value = 0.25;
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  return new Promise((resolve) =>
    setTimeout(() => {
      osc.stop();
      void ctx.close();
      resolve();
    }, 700),
  );
}
