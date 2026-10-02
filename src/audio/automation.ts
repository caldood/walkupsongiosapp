/**
 * Gain automation shared by live playback (mixer.ts) and the offline QA render (render.ts), so an
 * exported file is built from exactly the same curves as what you hear in the app.
 */

/** Minimal slice of AudioParam we need (lets tests use a recording fake). */
export interface ParamLike {
  value: number;
  cancelScheduledValues(t: number): unknown;
  setValueAtTime(v: number, t: number): unknown;
  linearRampToValueAtTime(v: number, t: number): unknown;
}

export const SILENCE = 0.0001;
export const DUCK_RAMP_IN = 0.25;
export const DUCK_RAMP_OUT = 0.4;

/** Dip the music to `duck` for the announcement that runs [when, end], then bring it back up. */
export function scheduleDuck(g: ParamLike, now: number, when: number, end: number, duck: number): void {
  const level = Math.min(1, Math.max(0, duck));
  const rampIn = Math.min(DUCK_RAMP_IN, Math.max(0, when - now));
  g.cancelScheduledValues(now);
  g.setValueAtTime(1, now);
  g.setValueAtTime(1, when - rampIn);
  g.linearRampToValueAtTime(level, when);
  g.setValueAtTime(level, end);
  g.linearRampToValueAtTime(1, end + DUCK_RAMP_OUT);
}

/** Ease the sound to silence: starts at `now + startIn`, takes `duration` seconds. */
export function scheduleFadeOut(g: ParamLike, now: number, startIn: number, duration: number): void {
  const t0 = now + Math.max(0, startIn);
  g.cancelScheduledValues(now);
  g.setValueAtTime(1, now);
  g.setValueAtTime(1, t0);
  g.linearRampToValueAtTime(SILENCE, t0 + Math.max(0.05, duration));
}

/** Master limiter: stops a boosted announcer from clipping. */
export function configureLimiter(l: {
  threshold: { value: number };
  knee: { value: number };
  ratio: { value: number };
  attack: { value: number };
  release: { value: number };
}): void {
  l.threshold.value = -4;
  l.knee.value = 3;
  l.ratio.value = 20;
  l.attack.value = 0.002;
  l.release.value = 0.12;
}
