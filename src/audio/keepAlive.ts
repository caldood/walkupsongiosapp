/**
 * Keeps a Bluetooth speaker awake during a game.
 *
 * Many portable speakers drop their audio link (or switch the amplifier off) after a stretch of silence. The first
 * sound after that has to wake the link, which can swallow the opening second of a walk-up. While Game Mode is open
 * we play a constant sub-audible tone, so the phone keeps streaming and the speaker never decides it is idle.
 *
 * It is a low sine (below what small speakers reproduce) rather than digital silence, because speakers and the
 * Bluetooth codec treat exact zeros as "nothing playing". It runs on its own AudioContext so it never touches the
 * walk-up mixer, the limiters or the ducking.
 */

/** Below the bottom of the range a small speaker reproduces, so it is felt by the link but not heard. */
export const KEEP_ALIVE_HZ = 20;
/** About -48 dBFS: non-zero after Bluetooth encoding, far too quiet to move a driver audibly. */
export const KEEP_ALIVE_GAIN = 0.004;

interface Listenable {
  addEventListener(type: string, fn: () => void, opts?: boolean): void;
  removeEventListener(type: string, fn: () => void, opts?: boolean): void;
}

export interface KeepAliveEnv {
  makeContext(): AudioContext | null;
  /** Where gestures arrive; used to (re)start the tone, since browsers only allow audio to begin after a tap. */
  target: Listenable | null;
  visible(): boolean;
}

function defaultContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!C) return null;
  try {
    return new C();
  } catch {
    return null;
  }
}

const defaultEnv: KeepAliveEnv = {
  makeContext: defaultContext,
  target: typeof document === 'undefined' ? null : document,
  visible: () => typeof document === 'undefined' || document.visibilityState === 'visible',
};

const GESTURES = ['pointerdown', 'touchend', 'keydown'];

export class SpeakerKeepAlive {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private wanted = false;

  constructor(private env: KeepAliveEnv = defaultEnv) {}

  /** True while the tone is actually sounding. */
  get running(): boolean {
    return this.wanted && this.ctx?.state === 'running';
  }

  /** Call from a tap when you can (START GAME); it also retries by itself on the next tap or when the page returns. */
  start(): void {
    if (this.wanted) {
      this.ensure();
      return;
    }
    this.wanted = true;
    for (const g of GESTURES) this.env.target?.addEventListener(g, this.retry, true);
    this.env.target?.addEventListener('visibilitychange', this.retry);
    this.ensure();
  }

  stop(): void {
    if (!this.wanted) return;
    this.wanted = false;
    for (const g of GESTURES) this.env.target?.removeEventListener(g, this.retry, true);
    this.env.target?.removeEventListener('visibilitychange', this.retry);
    try {
      this.osc?.stop();
    } catch {
      /* already stopped */
    }
    this.osc?.disconnect();
    this.osc = null;
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }

  private retry = () => {
    if (this.wanted && this.env.visible()) this.ensure();
  };

  private ensure(): void {
    if (!this.ctx) {
      const ctx = this.env.makeContext();
      if (!ctx) return;
      try {
        // iOS Safari silences Web Audio when the ringer switch is on silent unless the page asks for "playback".
        const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
        if (session) session.type = 'playback';
      } catch {
        /* optional API */
      }
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = KEEP_ALIVE_HZ;
        gain.gain.value = KEEP_ALIVE_GAIN;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        // A phone call or another app can interrupt the context; pick it back up when it is released.
        ctx.addEventListener?.('statechange', this.retry);
        this.osc = osc;
        this.ctx = ctx;
      } catch {
        void ctx.close().catch(() => undefined);
        return;
      }
    }
    const state = this.ctx.state as string;
    if (state !== 'running') void this.ctx.resume().catch(() => undefined);
  }
}

export const speakerKeepAlive = new SpeakerKeepAlive();
