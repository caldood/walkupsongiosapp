import type { BackendEvent, MediaBackend } from './AudioManager';

/** A ~0.1s silent WAV used to unlock the element on iOS from the first user tap. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

/** Wraps the single <audio> element the whole app shares. */
export class HtmlAudioBackend implements MediaBackend {
  private el: HTMLAudioElement;
  private listeners = new Set<(e: BackendEvent) => void>();
  private unlocked = false;
  /** Pauses we trigger ourselves fire async `pause` events; ignore those for a moment. */
  private ignorePauseUntil = 0;

  constructor(el: HTMLAudioElement = new Audio()) {
    this.el = el;
    el.preload = 'auto';
    el.setAttribute('playsinline', '');
    const emit = (e: BackendEvent) => this.listeners.forEach((l) => l(e));
    el.addEventListener('loadedmetadata', () => emit('metadata'));
    el.addEventListener('ended', () => emit('ended'));
    el.addEventListener('timeupdate', () => emit('time'));
    el.addEventListener('error', () => {
      if (el.getAttribute('src')) emit('error');
    });
    // A pause we didn't ask for = the OS interrupted us (call, Siri, route change…).
    el.addEventListener('pause', () => {
      if (performance.now() < this.ignorePauseUntil || el.ended) return;
      emit('interrupted');
    });
  }

  private expectPause(ms = 400) {
    this.ignorePauseUntil = performance.now() + ms;
  }

  get element(): HTMLAudioElement {
    return this.el;
  }

  get currentTime() {
    return this.el.currentTime;
  }
  get duration() {
    return this.el.duration;
  }

  load(url: string) {
    this.el.src = url;
    this.el.load();
  }

  play(): Promise<void> {
    return this.el.play();
  }

  pause() {
    this.expectPause();
    this.el.pause();
  }

  clear() {
    this.expectPause();
    this.el.removeAttribute('src');
    this.el.load();
  }

  seek(seconds: number) {
    try {
      this.el.currentTime = seconds;
    } catch {
      /* not seekable yet – AudioManager retries on metadata */
    }
  }

  setVolume(v: number) {
    this.el.volume = v;
  }

  subscribe(l: (e: BackendEvent) => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  /**
   * Some browsers (iOS Safari) only let an <audio> element play programmatically after it has been
   * started by a user gesture. Call this from the first tap anywhere so later auto-advance / auto-play
   * works. It must never disturb real playback: if a real track is loaded (or loads while the silent
   * clip is starting), the real track wins and the silent clip is abandoned untouched.
   */
  unlock() {
    if (this.unlocked || this.el.getAttribute('src')) return;
    this.unlocked = true;
    this.expectPause(1500);
    this.el.src = SILENT_WAV;
    const stillSilent = () => this.el.getAttribute('src') === SILENT_WAV;
    this.el
      .play()
      .then(() => {
        if (!stillSilent()) return; // a real track took over the element
        this.el.pause();
        this.el.removeAttribute('src');
        this.el.load();
      })
      .catch(() => {
        // Interrupted by a real load() (AbortError) or blocked: allow another attempt later.
        this.unlocked = false;
        if (stillSilent()) this.el.removeAttribute('src');
      });
  }
}
