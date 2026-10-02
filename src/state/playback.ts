import { AudioManager, type AudioState, type EndedInfo } from '../audio/AudioManager';
import type { AnnouncerResolver } from '../storage/announcerLibrary';
import type { AudioResolver } from '../storage/audioLibrary';
import type { Song } from '../core/types';

export interface PlaybackSnapshot {
  audio: AudioState;
}

export interface WalkUpRequest {
  playerId: string;
  songId: string;
  title: string;
  subtitle?: string;
  start: number;
  end: number;
  /** Spoken name mixed over the music. */
  announcer?: { songId: string; delay: number; duck: number; gain: number };
  /** Seconds of fade-out before `end` (0/undefined = hard cut). */
  fadeOut?: number;
}

/**
 * Orchestrates walk-up playback on top of the single AudioManager. UI components call this;
 * they never touch audio elements.
 */
export class PlaybackController {
  private snapshot: PlaybackSnapshot;
  private listeners = new Set<() => void>();
  private walkUpFinished = new Set<(playerId: string, songId: string) => void>();
  private announcers?: AnnouncerResolver;

  constructor(
    private audio: AudioManager,
    private resolver: AudioResolver,
    _getSong: (id: string) => Song | undefined = () => undefined,
    opts: { announcers?: AnnouncerResolver } = {},
  ) {
    this.announcers = opts.announcers;
    this.snapshot = { audio: audio.getState() };
    audio.subscribe((a) => {
      this.snapshot = { audio: a };
      this.listeners.forEach((l) => l());
    });
    audio.onEnded((e) => this.handleEnded(e));
  }

  // ── subscription (React: useSyncExternalStore) ──────────────────────────────
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = (): PlaybackSnapshot => this.snapshot;

  /** Fires when a walk-up finishes by itself (not when stopped). */
  onWalkUpFinished(l: (playerId: string, songId: string) => void) {
    this.walkUpFinished.add(l);
    return () => this.walkUpFinished.delete(l);
  }

  /** Call from a tap handler. Starts synchronously when the audio is already cached. */
  playWalkUp(req: WalkUpRequest): void {
    const base = { key: req.songId, ref: req.playerId, kind: 'walkup' as const, title: req.title, subtitle: req.subtitle, start: req.start, end: req.end, fadeOut: req.fadeOut };
    const ann = req.announcer;
    const overlayFor = (d: { clip: unknown; duration: number }) => ({ clip: d.clip, duration: d.duration, delay: ann!.delay, duck: ann!.duck, gain: ann!.gain });
    const decoded = ann ? this.announcers?.peek(ann.songId) : null;
    const cached = this.resolver.peek(req.songId);
    if (cached) {
      this.audio.play({ ...base, url: cached, overlay: decoded ? overlayFor(decoded) : undefined });
      // The announcer wasn't decoded yet: add it as soon as it is (if it's still in time).
      if (ann && !decoded) {
        void this.announcers?.get(ann.songId).then((d) => d && this.audio.attachOverlay(req.songId, overlayFor(d)));
      }
      return;
    }
    // Not cached yet: show "loading", then try (Safari may need a second tap).
    void Promise.all([this.resolver.get(req.songId), ann ? this.announcers?.get(ann.songId) : null]).then(([url, d]) =>
      this.audio.play({ ...base, url, overlay: d ? overlayFor(d) : undefined }),
    );
  }

  /** Plays a whole song from the start (library preview). Never triggers walk-up auto-advance. */
  previewSong(song: Song, fadeOut = 0): void {
    const base = { key: song.id, ref: 'preview', kind: 'walkup' as const, title: song.name, subtitle: song.artist, start: 0, end: null, fadeOut };
    const cached = this.resolver.peek(song.id);
    if (cached) this.audio.play({ ...base, url: cached });
    else void this.resolver.get(song.id).then((url) => this.audio.play({ ...base, url }));
  }

  /** Preload audio so taps start instantly (Safari only allows play() directly inside the tap). */
  preload(songIds: (string | undefined | null)[]) {
    for (const id of songIds) if (id) void this.resolver.get(id).catch(() => null);
  }

  /** Decode announcer clips ahead of time so they can be mixed in the instant the music starts. */
  preloadAnnouncers(songIds: (string | undefined | null)[]) {
    for (const id of songIds) if (id) void this.announcers?.get(id).catch(() => null);
  }

  pause(): void {
    this.audio.pause();
  }

  /** Resume whatever is paused (must be called from a tap on iOS). */
  resume(): void {
    this.audio.resume();
  }

  stopAll(): void {
    this.audio.stop();
  }

  private handleEnded(e: EndedInfo) {
    if (e.reason === 'finished' && e.track.ref) this.walkUpFinished.forEach((l) => l(e.track.ref!, e.track.key));
  }
}
