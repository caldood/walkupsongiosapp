import type { Overlay, OverlayEngine } from './AudioManager';

type Ctor = typeof AudioContext;

function audioContextCtor(): Ctor | null {
  if (typeof window === 'undefined') return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext ?? null;
}

/**
 * Mixes the announcer over the walk-up music with Web Audio.
 *
 *   <audio> ──▶ MediaElementSource ──▶ musicGain ──▶ fadeGain ──┐
 *                                      (ducking)      (fade-out)    ├──▶ speakers
 *   announcer AudioBuffer ──▶ announcerGain ──▶ (fadeGain) ───────┘
 *
 * The music still streams from the single <audio> element (no big decode in memory); routing it through a
 * GainNode is what lets us duck it under the announcer even on iPhone, where `audio.volume` is ignored.
 * The graph is built lazily, only once something needs an overlay.
 */
export class WebAudioMixer implements OverlayEngine {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private fadeGain: GainNode | null = null;
  private announcerGain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;

  constructor(private element: HTMLMediaElement) {}

  get supported(): boolean {
    return audioContextCtor() !== null;
  }

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const C = audioContextCtor();
    if (!C) return null;
    try {
      this.ctx = new C();
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  private buildGraph(): boolean {
    if (this.musicGain) return true;
    const ctx = this.context();
    if (!ctx) return false;
    try {
      const music = ctx.createGain();
      const fade = ctx.createGain();
      const announcer = ctx.createGain();
      ctx.createMediaElementSource(this.element).connect(music);
      music.connect(fade);
      fade.connect(ctx.destination);
      announcer.connect(fade);
      this.musicGain = music;
      this.fadeGain = fade;
      this.announcerGain = announcer;
      return true;
    } catch {
      return false;
    }
  }

  prepare(needed: boolean): void {
    if (needed) this.buildGraph();
    // Once the element is routed through the context, the context must be running for ANY playback.
    if (this.musicGain) void this.ctx?.resume().catch(() => undefined);
  }

  canAttachLate(): boolean {
    return !!this.musicGain && this.ctx?.state === 'running';
  }

  start(overlay: Overlay, elapsed: number): void {
    const ctx = this.ctx;
    const buffer = overlay.clip as AudioBuffer;
    if (!ctx || !this.musicGain || !this.announcerGain || !buffer) return;
    const wait = overlay.delay - elapsed;
    let when = ctx.currentTime;
    let offset = 0;
    if (wait >= 0) when += wait;
    else {
      offset = -wait; // already part-way through the announcement
      if (offset >= buffer.duration) return;
    }
    this.stopOverlay();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.announcerGain);
    src.start(when, offset);
    this.source = src;

    // Duck the music under the announcement, then bring it back up.
    const g = this.musicGain.gain;
    const now = ctx.currentTime;
    const duck = Math.min(1, Math.max(0, overlay.duck));
    const rampIn = Math.min(0.25, Math.max(0, when - now));
    const end = when + (buffer.duration - offset);
    g.cancelScheduledValues(now);
    g.setValueAtTime(1, now);
    g.setValueAtTime(1, when - rampIn);
    g.linearRampToValueAtTime(duck, when);
    g.setValueAtTime(duck, end);
    g.linearRampToValueAtTime(1, end + 0.4);
  }

  fadeOut(startIn: number, duration: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.fadeGain) return;
    const g = this.fadeGain.gain;
    const t0 = ctx.currentTime + Math.max(0, startIn);
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(1, ctx.currentTime);
    g.setValueAtTime(1, t0);
    // A short exponential-ish curve sounds smoother than a straight line: ramp to near-silence, then to 0.
    g.linearRampToValueAtTime(0.0001, t0 + Math.max(0.05, duration));
  }

  fadeNow(duration: number): boolean {
    const ctx = this.ctx;
    if (!ctx || !this.fadeGain || ctx.state !== 'running') return false;
    const g = this.fadeGain.gain;
    const now = ctx.currentTime;
    const current = g.value;
    g.cancelScheduledValues(now);
    g.setValueAtTime(current, now);
    g.linearRampToValueAtTime(0.0001, now + Math.max(0.02, duration));
    return true;
  }

  pause(): void {
    if (this.musicGain) void this.ctx?.suspend().catch(() => undefined);
  }

  resume(): void {
    if (this.musicGain) void this.ctx?.resume().catch(() => undefined);
  }

  /** Stops just the announcer and restores the music level (leaves any scheduled fade-out alone). */
  private stopOverlay(): void {
    try {
      this.source?.stop();
    } catch {
      /* already stopped */
    }
    this.source?.disconnect();
    this.source = null;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicGain.gain.setValueAtTime(1, this.ctx.currentTime);
    }
  }

  stop(): void {
    this.stopOverlay();
    if (this.fadeGain && this.ctx) {
      this.fadeGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.fadeGain.gain.setValueAtTime(1, this.ctx.currentTime);
    }
  }

  /** Decodes a stored announcer file into a buffer; null if the browser can't decode it. */
  async decode(blob: Blob): Promise<AudioBuffer | null> {
    const ctx = this.context();
    if (!ctx) return null;
    try {
      const data = await blob.arrayBuffer();
      // Callback form works in every Safari version; the promise form only in newer ones.
      return await new Promise<AudioBuffer>((resolve, reject) => ctx.decodeAudioData(data, resolve, reject));
    } catch {
      return null;
    }
  }
}
