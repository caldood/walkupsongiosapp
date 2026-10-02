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

type LimiterLike = {
  threshold: { value: number };
  knee: { value: number };
  ratio: { value: number };
  attack: { value: number };
  release: { value: number };
};

/**
 * Two limiters, so the music-dip setting means what it says:
 *  - 'voice' tames the boosted announcer on its own (it doesn't touch the music);
 *  - 'master' is only a near-transparent safety net on the final mix (rarely does anything).
 * One shared limiter on everything would also pump the music down whenever the loud voice is present.
 */
export function configureLimiter(l: LimiterLike, kind: 'voice' | 'master'): void {
  if (kind === 'voice') {
    l.threshold.value = -6;
    l.knee.value = 6;
    l.ratio.value = 12;
    l.attack.value = 0.003;
    l.release.value = 0.1;
  } else {
    l.threshold.value = -1;
    l.knee.value = 0;
    l.ratio.value = 20;
    l.attack.value = 0.0005;
    l.release.value = 0.08;
  }
}
