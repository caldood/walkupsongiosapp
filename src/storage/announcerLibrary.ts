import type { Repository } from './repository';

/** The announcer audio, decoded and ready to play. Opaque to everything except the mixer. */
export interface AnnouncerResolver {
  peek(id: string): { clip: unknown; duration: number } | null;
  get(id: string): Promise<{ clip: unknown; duration: number } | null>;
}

interface Decoded {
  clip: unknown;
  duration: number;
}

/** Caches decoded announcer clips (short, so memory stays tiny). `peek()` is synchronous for in-tap starts. */
export class AnnouncerLibrary implements AnnouncerResolver {
  private cache = new Map<string, Decoded>();
  private pending = new Map<string, Promise<Decoded | null>>();

  constructor(
    private repo: Repository,
    private decode: (blob: Blob) => Promise<{ duration: number } | null>,
    private max = 48,
  ) {}

  peek(id: string): Decoded | null {
    return this.cache.get(id) ?? null;
  }

  get(id: string): Promise<Decoded | null> {
    const hit = this.cache.get(id);
    if (hit) return Promise.resolve(hit);
    let p = this.pending.get(id);
    if (!p) {
      p = this.load(id).finally(() => this.pending.delete(id));
      this.pending.set(id, p);
    }
    return p;
  }

  private async load(id: string): Promise<Decoded | null> {
    const blob = await this.repo.getAudio(id);
    if (!blob) return null;
    const buffer = await this.decode(blob);
    if (!buffer) return null;
    const decoded = { clip: buffer, duration: buffer.duration };
    this.cache.set(id, decoded);
    while (this.cache.size > this.max) this.cache.delete(this.cache.keys().next().value as string);
    return decoded;
  }

  invalidate(id: string) {
    this.cache.delete(id);
  }
}
