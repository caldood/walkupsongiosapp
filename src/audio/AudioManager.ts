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
export type TrackKind = 'walkup' | 'defense';

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

  constructor(
    private backend: MediaBackend,
    private opts: { tickMs?: number } = {},
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
    const { url, ...track } = req;
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
      })
      .catch((err: unknown) => {
        if (token !== this.token) return;
        this.fail(classifyPlayError(err));
      });
  }

  pause(): void {
    if (this.state.status !== 'playing' && this.state.status !== 'loading') return;
    this.stopTimer();
    this.backend.pause();
    this.set({ status: 'paused' });
  }

  /** Resume after pause / needs-gesture. Must be called from a tap handler on iOS. */
  resume(): void {
    const { status, track } = this.state;
    if (!track || (status !== 'paused' && !(status === 'error' && this.state.error === 'needs-gesture'))) return;
    const token = ++this.token;
    this.set({ status: 'loading', error: null });
    this.backend
      .play()
      .then(() => {
        if (token !== this.token) return;
        this.set({ status: 'playing', error: null });
        this.startTimer();
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
          this.end = this.end != null ? end : null;
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
          this.set({ status: 'paused' });
        }
        break;
      case 'error':
        if (this.state.status !== 'idle') this.fail(this.state.status === 'loading' ? 'unsupported' : 'failed');
        break;
    }
  }

  private finish() {
    const track = this.state.track;
    this.token++;
    this.stopTimer();
    this.backend.pause();
    this.backend.clear();
    this.set({ ...IDLE });
    if (track) this.emitEnded({ track, reason: 'finished' });
  }

  private fail(code: AudioErrorCode) {
    this.stopTimer();
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
export function describeAudioError(code: AudioErrorCode, kind: TrackKind = 'walkup'): string {
  switch (code) {
    case 'missing':
      return kind === 'walkup' ? 'Walk-up song not available on this device.' : 'This song is not available on this device.';
    case 'needs-gesture':
      return 'Tap Play to start audio.';
    case 'unsupported':
      return "This audio format can't be played here. Try an MP3 or M4A file.";
    case 'failed':
      return 'Audio stopped unexpectedly. Tap Play to try again.';
  }
}
