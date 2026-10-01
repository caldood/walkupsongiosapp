import { AudioManager, type AudioState, type EndedInfo } from '../audio/AudioManager';
import type { AudioResolver } from '../storage/audioLibrary';
import type { AnnouncerResolver } from '../storage/announcerLibrary';
import {
  buildQueue,
  currentSongId,
  nextInQueue,
  prevInQueue,
  upcoming,
  type Queue,
  type Rng,
} from '../core/playlistQueue';
import type { Song } from '../core/types';

export interface DefenseView {
  playlistId: string | null;
  queue: Queue | null;
  currentSongId: string | null;
  upcomingSongIds: string[];
  shuffle: boolean;
  repeat: boolean;
  /** Songs skipped in this session because their audio isn't on the device. */
  skipped: number;
  /** The playlist finished (repeat off). */
  finished: boolean;
}

export interface PlaybackSnapshot {
  audio: AudioState;
  defense: DefenseView;
}

export interface WalkUpRequest {
  playerId: string;
  songId: string;
  title: string;
  subtitle?: string;
  start: number;
  end: number;
  /** Spoken name mixed over the music. */
  announcer?: { songId: string; delay: number; duck: number };
}

const EMPTY_DEFENSE: DefenseView = {
  playlistId: null,
  queue: null,
  currentSongId: null,
  upcomingSongIds: [],
  shuffle: false,
  repeat: true,
  skipped: 0,
  finished: false,
};

/**
 * Orchestrates everything audible on top of the single AudioManager: walk-up clips and the
 * defense playlist queue. UI components call this; they never touch audio elements.
 */
export class PlaybackController {
  private defense: DefenseView = EMPTY_DEFENSE;
  private defenseToken = 0; // invalidates in-flight loads when the user moves on
  private resumeAt = 0; // seconds into the current defense song to resume from after a walk-up interrupted it
  private snapshot: PlaybackSnapshot;
  private listeners = new Set<() => void>();
  private walkUpFinished = new Set<(playerId: string, songId: string) => void>();
  private rng?: Rng;
  private announcers?: AnnouncerResolver;

  constructor(
    private audio: AudioManager,
    private resolver: AudioResolver,
    private getSong: (id: string) => Song | undefined,
    opts: { rng?: Rng; announcers?: AnnouncerResolver } = {},
  ) {
    this.announcers = opts.announcers;
    this.rng = opts.rng;
    this.snapshot = { audio: audio.getState(), defense: this.defense };
    audio.subscribe((a) => this.publish({ audio: a }));
    audio.onEnded((e) => this.handleEnded(e));
  }

  // ── subscription (React: useSyncExternalStore) ──────────────────────────────
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = (): PlaybackSnapshot => this.snapshot;

  onWalkUpFinished(l: (playerId: string, songId: string) => void) {
    this.walkUpFinished.add(l);
    return () => this.walkUpFinished.delete(l);
  }

  private publish(patch: Partial<PlaybackSnapshot>) {
    if (patch.defense) this.defense = patch.defense;
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((l) => l());
  }

  private setDefense(patch: Partial<DefenseView>) {
    this.publish({ defense: { ...this.defense, ...patch } });
  }

  // ── walk-up ─────────────────────────────────────────────────────────────────
  /** Call from a tap handler. Starts synchronously when the audio is already cached. */
  playWalkUp(req: WalkUpRequest): void {
    this.defenseToken++;
    this.rememberDefensePosition();
    const base = { key: req.songId, ref: req.playerId, kind: 'walkup' as const, title: req.title, subtitle: req.subtitle, start: req.start, end: req.end };
    const ann = req.announcer;
    const overlayFor = (d: { clip: unknown; duration: number }) => ({ clip: d.clip, duration: d.duration, delay: ann!.delay, duck: ann!.duck });
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
    // Not cached yet: show "loading", then try (iOS may need a second tap).
    void Promise.all([this.resolver.get(req.songId), ann ? this.announcers?.get(ann.songId) : null]).then(([url, d]) =>
      this.audio.play({ ...base, url, overlay: d ? overlayFor(d) : undefined }),
    );
  }

  /** Decode announcer clips ahead of time so they can be mixed in the instant the music starts. */
  preloadAnnouncers(songIds: (string | undefined | null)[]) {
    for (const id of songIds) if (id) void this.announcers?.get(id).catch(() => null);
  }

  /** Plays a whole song from the start (library preview). Never triggers walk-up auto-advance. */
  previewSong(song: Song): void {
    this.defenseToken++;
    this.rememberDefensePosition();
    const base = { key: song.id, ref: 'preview', kind: 'walkup' as const, title: song.name, subtitle: song.artist, start: 0, end: null };
    const cached = this.resolver.peek(song.id);
    if (cached) this.audio.play({ ...base, url: cached });
    else void this.resolver.get(song.id).then((url) => this.audio.play({ ...base, url }));
  }

  /** Preload audio for upcoming batters/songs so taps start instantly. */
  preload(songIds: (string | undefined | null)[]) {
    for (const id of songIds) if (id) void this.resolver.get(id).catch(() => null);
  }

  // ── defense playlist ────────────────────────────────────────────────────────
  startDefense(playlistId: string, songIds: string[], opts: { shuffle: boolean; repeat: boolean; startSongId?: string }): void {
    const queue = buildQueue(songIds, { shuffle: opts.shuffle, startSongId: opts.startSongId, rng: this.rng });
    this.resumeAt = 0;
    this.setDefense({ playlistId, queue, shuffle: opts.shuffle, repeat: opts.repeat, skipped: 0, finished: false, ...this.view(queue) });
    this.playCurrentDefense(1);
  }

  /** Play/resume the defense music (from a tap). */
  defensePlay(): void {
    const a = this.audio.getState();
    if (a.track?.kind === 'defense' && (a.status === 'paused' || (a.status === 'error' && a.error === 'needs-gesture'))) {
      this.audio.resume();
      return;
    }
    if (a.track?.kind === 'defense' && (a.status === 'playing' || a.status === 'loading')) return;
    if (this.defense.queue) {
      if (this.defense.finished) {
        const q = buildQueue(this.defense.queue.songIds, { shuffle: this.defense.shuffle, rng: this.rng });
        this.resumeAt = 0;
        this.setDefense({ queue: q, finished: false, skipped: 0, ...this.view(q) });
      }
      this.playCurrentDefense(1);
    }
  }

  defensePause(): void {
    this.audio.pause();
  }

  /** Pause whatever is playing (walk-up or defense). */
  pause(): void {
    this.audio.pause();
  }

  /** Resume whatever is paused (must be called from a tap on iOS). */
  resume(): void {
    this.audio.resume();
  }

  defenseNext(): void {
    const q = this.defense.queue;
    if (!q) return;
    const n = nextInQueue(q, true, { shuffle: this.defense.shuffle, rng: this.rng }); // manual next always wraps
    if (n) this.moveDefense(n, 1);
  }

  defensePrev(): void {
    const q = this.defense.queue;
    if (!q) return;
    this.moveDefense(prevInQueue(q, true), -1);
  }

  setDefenseOptions(opts: { shuffle?: boolean; repeat?: boolean }) {
    const patch: Partial<DefenseView> = {};
    if (opts.repeat !== undefined) patch.repeat = opts.repeat;
    if (opts.shuffle !== undefined && opts.shuffle !== this.defense.shuffle) {
      patch.shuffle = opts.shuffle;
      const q = this.defense.queue;
      if (q) {
        const rebuilt = buildQueue(q.songIds, { shuffle: opts.shuffle, startSongId: currentSongId(q), rng: this.rng });
        patch.queue = rebuilt;
        Object.assign(patch, this.view(rebuilt));
      }
    }
    this.setDefense(patch);
  }

  stopAll(): void {
    this.defenseToken++;
    // Stopping a walk-up shouldn't forget where the defense song was; stopping defense music does.
    if (this.audio.getState().track?.kind !== 'walkup') this.resumeAt = 0;
    this.audio.stop();
  }

  // ── internals ───────────────────────────────────────────────────────────────
  private view(q: Queue): Pick<DefenseView, 'currentSongId' | 'upcomingSongIds'> {
    return { currentSongId: currentSongId(q) ?? null, upcomingSongIds: upcoming(q, 3) };
  }

  private moveDefense(q: Queue, direction: 1 | -1) {
    this.resumeAt = 0;
    this.setDefense({ queue: q, finished: false, ...this.view(q) });
    this.playCurrentDefense(direction);
  }

  private rememberDefensePosition() {
    const a = this.audio.getState();
    if (a.track?.kind === 'defense' && (a.status === 'playing' || a.status === 'paused')) this.resumeAt = a.position;
  }

  /**
   * Plays the queue's current song, skipping any whose audio is missing. Starts synchronously
   * when the audio is already cached (needed for iOS); otherwise loads it first.
   */
  private playCurrentDefense(direction: 1 | -1) {
    const q = this.defense.queue;
    if (!q || q.order.length === 0) return;
    this.defenseToken++;
    this.tryPlay(q, direction, this.defenseToken, 0, this.defense.skipped);
  }

  private tryPlay(q: Queue, direction: 1 | -1, token: number, tried: number, skipped: number) {
    const id = currentSongId(q);
    const song = id ? this.getSong(id) : undefined;
    const commit = (url: string) => {
      this.setDefense({ queue: q, skipped, ...this.view(q) });
      this.startDefenseTrack(id!, song!, url);
      this.preload(upcoming(q, 2));
    };
    const skipThis = () => {
      if (token !== this.defenseToken) return;
      if (tried + 1 >= q.order.length) {
        // Went all the way round: nothing here can play on this device.
        this.setDefense({ queue: q, skipped: skipped + 1, ...this.view(q) });
        this.audio.play({ key: id ?? 'none', kind: 'defense', title: 'Defense music', url: null });
        return;
      }
      const n = direction === 1 ? nextInQueue(q, true) : prevInQueue(q, true);
      if (n) this.tryPlay(n, direction, token, tried + 1, skipped + 1);
    };

    const cached = id ? this.resolver.peek(id) : null;
    if (id && song && cached) return commit(cached);
    if (id && song && song.sourceType === 'local') {
      this.setDefense({ queue: q, ...this.view(q) });
      void this.resolver.get(id).then((url) => {
        if (token !== this.defenseToken) return; // the user moved on
        if (url) commit(url);
        else skipThis();
      });
      return;
    }
    skipThis();
  }

  private startDefenseTrack(id: string, song: Song, url: string) {
    const start = this.resumeAt;
    this.resumeAt = 0;
    this.audio.play({ key: id, kind: 'defense', title: song.name, subtitle: song.artist, url, start });
  }

  private handleEnded(e: EndedInfo) {
    if (e.reason !== 'finished') return;
    if (e.track.kind === 'walkup') {
      if (e.track.ref) this.walkUpFinished.forEach((l) => l(e.track.ref!, e.track.key));
      return;
    }
    const q = this.defense.queue;
    if (!q) return;
    const n = nextInQueue(q, this.defense.repeat, { shuffle: this.defense.shuffle, rng: this.rng });
    if (!n) {
      this.setDefense({ finished: true });
      return;
    }
    this.resumeAt = 0;
    this.setDefense({ queue: n, ...this.view(n) });
    this.playCurrentDefense(1);
  }
}
