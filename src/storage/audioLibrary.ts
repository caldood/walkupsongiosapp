import type { Repository } from './repository';

/**
 * Turns stored audio blobs into playable object URLs, with a small cache.
 * `peek()` is synchronous so a tap can start playback immediately (iOS Safari only allows
 * play() inside the tap's call stack); call `preload()` ahead of time for the songs likely to play next.
 */
export class AudioLibrary {
  private urls = new Map<string, string>();
  private max: number;

  constructor(
    private repo: Repository,
    private createUrl: (b: Blob) => string = (b) => URL.createObjectURL(b),
    private revokeUrl: (u: string) => void = (u) => URL.revokeObjectURL(u),
    max = 8,
  ) {
    this.max = max;
  }

  peek(id: string): string | null {
    const u = this.urls.get(id);
    if (u) {
      // refresh LRU position
      this.urls.delete(id);
      this.urls.set(id, u);
    }
    return u ?? null;
  }

  async get(id: string): Promise<string | null> {
    const hit = this.peek(id);
    if (hit) return hit;
    const blob = await this.repo.getAudio(id);
    if (!blob) return null;
    const url = this.createUrl(blob);
    this.urls.set(id, url);
    while (this.urls.size > this.max) {
      const [oldest, oldUrl] = this.urls.entries().next().value as [string, string];
      this.urls.delete(oldest);
      this.revokeUrl(oldUrl);
    }
    return url;
  }

  async preload(ids: (string | undefined | null)[]): Promise<void> {
    await Promise.all(ids.filter((x): x is string => !!x).map((id) => this.get(id).catch(() => null)));
  }

  invalidate(id: string) {
    const u = this.urls.get(id);
    if (u) this.revokeUrl(u);
    this.urls.delete(id);
  }
}

/** The shape PlaybackController needs; lets tests pass a fake. */
export interface AudioResolver {
  peek(id: string): string | null;
  get(id: string): Promise<string | null>;
}
