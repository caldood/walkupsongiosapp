/**
 * The ONE authoritative playback state machine. Everything that makes sound goes through here,
 * backed by a single media element, so two tracks can never fight each other.
 *
 *   idle ──play()──▶ loading ──▶ playing ◀──▶ paused
 *     ▲                              │
 *     └──── stop() / clip end / ended┘            error (missing, unsupported, needs-gesture…)
 */

export type AudioStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export type AudioErrorCode = 'missing' | 'needs-gesture' | 'unsupported' | 'failed';
export type TrackKind = 'walkup';

export interface TrackRequest {
  /** Caller's identifier (song id) – lets the UI show which row is playing. */
  key: string;
  /** Optional second reference (e.g. the batter's player id). */
  ref?: string;
  kind: TrackKind;
  title: string;
  subtitle?: string;
  /** null = the audio isn't available on this device. */
  url: string | null;
  /** Seconds into the media where playback begins. */
  start?: number;
  /** Seconds where playback stops; omitted = play to the end of the media. */
  end?: number | null;
  /** Optional announcer-style sound mixed over the track. */
  overlay?: Overlay;
  /** Seconds to fade out before the clip end (or the end of the media if there is no `end`). */
  fadeOut?: number;
}

export interface AudioState {
  status: AudioStatus;
  track: Omit<TrackRequest, 'url'> | null;
  /** Seconds played within the clip (0 at the clip start). */
  position: number;
  /** Clip length in seconds, if known. */
  length: number | null;
  error: AudioErrorCode | null;
}

export type BackendEvent = 'metadata' | 'ended' | 'error' | 'interrupted' | 'time';

/** What AudioManager needs from a media element. Implemented by HtmlAudioBackend (and by fakes in tests). */
export interface MediaBackend {
  load(url: string): void;
  play(): Promise<void>;
  pause(): void;
  /** Detach the current media. */
  clear(): void;
  seek(seconds: number): void;
  setVolume(v: number): void;
  readonly currentTime: number;
  readonly duration: number;
  subscribe(listener: (e: BackendEvent) => void): () => void;
}

/**
 * A second sound mixed over the track (e.g. the announcer saying the batter's name).
 * `clip` is opaque to AudioManager – the OverlayEngine knows how to play it.
 */
export interface Overlay {
  clip: unknown;
  /** Length of the overlay in seconds. */
  duration: number;
  /** Seconds after the track's clip start when the overlay begins. */
  delay: number;
  /** Music level (0–1) while the overlay is speaking. */
  duck: number;
}

/** Plays overlays alongside the media element (Web Audio in the browser; a fake in tests). */
export interface OverlayEngine {
  /** Called synchronously from the tap that starts/resumes playback. `needed` = this track has an overlay. */
  prepare(needed: boolean): void;
  /**
   * Fade the music to silence: start in `startIn` seconds and take `duration` seconds. Runs on the audio
   * clock, so it pauses and resumes with the music.
   */
  fadeOut(startIn: number, duration: number): void;
  /** Whether an overlay can be added to a track that is already playing without cutting the music. */
  canAttachLate(): boolean;
  /** Start the overlay; `elapsed` = seconds of the clip already played. */
  start(overlay: Overlay, elapsed: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

export type EndReason = 'finished' | 'stopped';
export interface EndedInfo {
  track: NonNullable<AudioState['track']>;
  reason: EndReason;
}

const IDLE: AudioState = { status: 'idle', track: null, position: 0, length: null, error: null };

export class AudioManager {
  private state: AudioState = IDLE;
  private listeners = new Set<(s: AudioState) => void>();
  private endedListeners = new Set<(e: EndedInfo) => void>();
  private token = 0;
  private start = 0;
  private end: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private seekPending = false;
  private volume = 1;
  private pendingOverlay: Overlay | undefined;
  private overlayStarted = false;
  private fadeLength = 0;
  private fadeScheduled = false;

  constructor(
    private backend: MediaBackend,
    private opts: { tickMs?: number; overlay?: OverlayEngine } = {},
  ) {
    backend.subscribe((e) => this.onBackend(e));
  }

  // ── subscriptions ──────────────────────────────────────────────────────────
  getState = (): AudioState => this.state;

  subscribe = (l: (s: AudioState) => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  /** Fires when a track finishes by itself or is stopped explicitly (not when replaced by another play()). */
  onEnded(l: (e: EndedInfo) => void): () => void {
    this.endedListeners.add(l);
    return () => this.endedListeners.delete(l);
  }

  private set(patch: Partial<AudioState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  // ── commands ───────────────────────────────────────────────────────────────
  /**
   * Starts a track, replacing whatever was playing. IMPORTANT for iOS Safari: call this
   * synchronously from a tap handler; `backend.play()` is invoked before any `await`.
   */
  play(req: TrackRequest): void {
    const token = ++this.token;
    this.stopTimer();
    this.backend.pause();
    this.opts.overlay?.stop();
    // With no clip end the track plays to the end of the media; the end is learned from its duration.
    this.fadeLength = req.fadeOut && req.fadeOut > 0 ? req.fadeOut : 0;
    this.fadeScheduled = false;
    this.opts.overlay?.prepare(!!req.overlay || this.fadeLength > 0);
    this.pendingOverlay = req.overlay;
    this.overlayStarted = false;
    const { url, ...track } = req;
    delete (track as { overlay?: Overlay }).overlay;
    delete (track as { fadeOut?: number }).fadeOut;
    this.start = Math.max(0, req.start ?? 0);
    this.end = req.end != null && req.end > this.start ? req.end : null;
    this.seekPending = this.start > 0;

    if (!url) {
      this.backend.clear();
      this.set({ status: 'error', track, position: 0, length: null, error: 'missing' });
      return;
    }
    this.set({
      status: 'loading',
      track,
      position: 0,
      length: this.end != null ? this.end - this.start : null,
      error: null,
    });
    this.backend.load(url);
    this.backend.setVolume(this.volume);
    if (this.start > 0) this.backend.seek(this.start); // honoured as "default start" before metadata on most browsers
    this.backend
      .play()
      .then(() => {
        if (token !== this.token) return;
        this.set({ status: 'playing', error: null });
        this.startTimer();
        this.startPendingOverlay(0);
      })
      .catch((err: unknown) => {
        if (token !== this.token) return;
        this.fail(classifyPlayError(err));
      });
  }

  /**
   * Adds an overlay to the track that is playing now (used when the overlay's audio finished
   * loading just after the tap). Ignored if that track is gone or the engine can't add it safely.
   */
  attachOverlay(trackKey: string, overlay: Overlay): void {
    if (this.state.status !== 'playing' || this.state.track?.key !== trackKey) return;
    if (!this.opts.overlay?.canAttachLate()) return;
    this.pendingOverlay = overlay;
    this.overlayStarted = false;
    this.startPendingOverlay(this.state.position);
  }

  pause(): void {
    if (this.state.status !== 'playing' && this.state.status !== 'loading') return;
    this.stopTimer();
    this.backend.pause();
    this.opts.overlay?.pause();
    this.set({ status: 'paused' });
  }

  /** Resume after pause / needs-gesture. Must be called from a tap handler on iOS. */
  resume(): void {
    const { status, track } = this.state;
    if (!track || (status !== 'paused' && !(status === 'error' && this.state.error === 'needs-gesture'))) return;
    const token = ++this.token;
    this.set({ status: 'loading', error: null });
    this.opts.overlay?.resume();
    this.backend
      .play()
      .then(() => {
        if (token !== this.token) return;
        this.set({ status: 'playing', error: null });
        this.startTimer();
        this.startPendingOverlay(this.state.position); // no-op unless the overlay never got to start
      })
      .catch((err: unknown) => {
        if (token !== this.token) return;
        this.fail(classifyPlayError(err));
      });
  }

  toggle(): void {
    if (this.state.status === 'playing' || this.state.status === 'loading') this.pause();
    else this.resume();
  }

  stop(): void {
    const track = this.state.track;
    const active = this.state.status !== 'idle';
    this.token++;
    this.stopTimer();
    this.backend.pause();
    this.backend.clear();
    this.opts.overlay?.stop();
    this.pendingOverlay = undefined;
    this.overlayStarted = false;
    this.set({ ...IDLE });
    if (track && active) this.emitEnded({ track, reason: 'stopped' });
  }

  /** Seek within the clip (0 = clip start). */
  seek(positionSeconds: number): void {
    if (!this.state.track) return;
    const max = this.state.length ?? Infinity;
    const p = Math.max(0, Math.min(max, positionSeconds));
    this.backend.seek(this.start + p);
    this.set({ position: p });
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.backend.setVolume(this.volume); // note: iOS Safari ignores element volume; the hardware buttons control it
  }

  /** Polls position and enforces the clip end. Public so tests (and rAF-less environments) can drive it. */
  tick(): void {
    if (this.state.status !== 'playing') return;
    const t = this.backend.currentTime;
    if (this.seekPending && t < this.start - 0.5) {
      this.backend.seek(this.start);
      return;
    }
    this.seekPending = false;
    this.scheduleFade(t);
    if (this.end != null && t >= this.end - 0.02) {
      this.finish();
      return;
    }
    this.set({ position: Math.max(0, t - this.start) });
  }

  // ── internals ──────────────────────────────────────────────────────────────
  private onBackend(e: BackendEvent) {
    switch (e) {
      case 'metadata': {
        const duration = this.backend.duration;
        if (this.state.status === 'idle') return;
        if (this.start > 0) {
          const safe = Number.isFinite(duration) ? Math.min(this.start, Math.max(0, duration - 0.5)) : this.start;
          this.backend.seek(safe);
        }
        if (Number.isFinite(duration)) {
          const end = this.end != null ? Math.min(this.end, duration) : duration;
          this.end = this.end != null || this.fadeLength > 0 ? end : null; // fading needs a known end
          this.set({ length: Math.max(0, end - this.start) });
        }
        break;
      }
      case 'time':
        // The media element's own clock: a second chance to enforce the clip end if timers are throttled (screen locked).
        this.tick();
        break;
      case 'ended':
        if (this.state.status === 'playing' || this.state.status === 'loading') this.finish();
        break;
      case 'interrupted':
        // Phone call, Siri, headphones unplugged, another app took the audio session…
        if (this.state.status === 'playing') {
          this.stopTimer();
          this.opts.overlay?.pause();
          this.set({ status: 'paused' });
        }
        break;
      case 'error':
        if (this.state.status !== 'idle') this.fail(this.state.status === 'loading' ? 'unsupported' : 'failed');
        break;
    }
  }

  /** Once playback has really reached the clip, tell the engine when to start fading (relative to the actual position). */
  private scheduleFade(t: number) {
    if (this.fadeScheduled || this.fadeLength <= 0 || this.end == null) return;
    this.fadeScheduled = true;
    const remaining = Math.max(0, this.end - t);
    const duration = Math.min(this.fadeLength, remaining);
    this.opts.overlay?.fadeOut(remaining - duration, duration);
  }

  private startPendingOverlay(elapsed: number) {
    if (!this.pendingOverlay || this.overlayStarted) return;
    this.overlayStarted = true;
    this.opts.overlay?.start(this.pendingOverlay, elapsed);
  }

  private finish() {
    const track = this.state.track;
    this.token++;
    this.stopTimer();
    this.backend.pause();
    this.backend.clear();
    this.opts.overlay?.stop();
    this.pendingOverlay = undefined;
    this.overlayStarted = false;
    this.set({ ...IDLE });
    if (track) this.emitEnded({ track, reason: 'finished' });
  }

  private fail(code: AudioErrorCode) {
    this.stopTimer();
    this.opts.overlay?.stop();
    if (code !== 'needs-gesture') this.backend.pause();
    this.set({ status: 'error', error: code });
  }

  private emitEnded(e: EndedInfo) {
    this.endedListeners.forEach((l) => l(e));
  }

  private startTimer() {
    this.stopTimer();
    this.timer = setInterval(() => this.tick(), this.opts.tickMs ?? 100);
  }

  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export function classifyPlayError(err: unknown): AudioErrorCode {
  const name = typeof err === 'object' && err && 'name' in err ? String((err as { name: unknown }).name) : '';
  if (name === 'NotAllowedError') return 'needs-gesture';
  if (name === 'NotSupportedError') return 'unsupported';
  if (name === 'AbortError') return 'failed';
  return 'failed';
}

/** Friendly, non-technical text for each error. Never shows raw browser messages. */
export function describeAudioError(code: AudioErrorCode, _kind: TrackKind = 'walkup'): string {
  switch (code) {
    case 'missing':
      return 'Walk-up song not available on this device.';
    case 'needs-gesture':
      return 'Tap Play to start audio.';
    case 'unsupported':
      return "This audio format can't be played here. Try an MP3 or M4A file.";
    case 'failed':
      return 'Audio stopped unexpectedly. Tap Play to try again.';
  }
}
