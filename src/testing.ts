import type { BackendEvent, MediaBackend } from './audio/AudioManager';

/** Scriptable media backend for tests: no DOM needed. */
export class FakeBackend implements MediaBackend {
  currentTime = 0;
  duration = 180;
  url: string | null = null;
  playing = false;
  /** Set to make the next play() reject (e.g. { name: 'NotAllowedError' }). */
  rejectNextPlay: { name: string } | null = null;
  loads: string[] = [];
  playCalls = 0;
  private listeners = new Set<(e: BackendEvent) => void>();

  load(url: string) {
    this.url = url;
    this.loads.push(url);
    this.currentTime = 0;
  }
  async play() {
    this.playCalls++;
    if (this.rejectNextPlay) {
      const e = this.rejectNextPlay;
      this.rejectNextPlay = null;
      throw e;
    }
    this.playing = true;
  }
  pause() {
    this.playing = false;
  }
  clear() {
    this.url = null;
    this.playing = false;
  }
  seek(s: number) {
    this.currentTime = s;
  }
  setVolume() {}
  subscribe(l: (e: BackendEvent) => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  emit(e: BackendEvent) {
    this.listeners.forEach((l) => l(e));
  }
}

export const flush = () => new Promise<void>((r) => setTimeout(r, 0));
