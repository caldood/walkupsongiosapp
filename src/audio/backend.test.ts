import { describe, expect, it } from 'vitest';
import { HtmlAudioBackend } from './HtmlAudioBackend';
import { wavDuration } from './metadata';

/** Minimal stand-in for HTMLAudioElement. play() promises are controlled by the test. */
class FakeEl {
  attrs: Record<string, string> = {};
  currentTime = 0;
  duration = NaN;
  volume = 1;
  ended = false;
  preload = '';
  plays: { resolve(): void; reject(e: unknown): void }[] = [];
  setAttribute(k: string, v: string) {
    this.attrs[k] = v;
  }
  getAttribute(k: string) {
    return this.attrs[k] ?? null;
  }
  removeAttribute(k: string) {
    delete this.attrs[k];
  }
  set src(v: string) {
    this.attrs.src = v;
  }
  addEventListener() {}
  load() {}
  pause() {}
  play() {
    return new Promise<void>((resolve, reject) => this.plays.push({ resolve, reject }));
  }
}
const make = () => {
  const el = new FakeEl();
  return { el, backend: new HtmlAudioBackend(el as unknown as HTMLAudioElement) };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('HtmlAudioBackend iOS unlock', () => {
  it('does not wipe a real track started by the very first tap (silent play resolves late)', async () => {
    const { el, backend } = make();
    backend.unlock(); // pointerdown (capture) fires first…
    backend.load('blob:real'); // …then the click handler starts the real track
    el.plays[0].resolve(); // silent clip's promise settles afterwards
    await tick();
    expect(el.getAttribute('src')).toBe('blob:real');
  });

  it('does not wipe a real track when the silent play is aborted by the new load', async () => {
    const { el, backend } = make();
    backend.unlock();
    backend.load('blob:real');
    el.plays[0].reject({ name: 'AbortError' });
    await tick();
    expect(el.getAttribute('src')).toBe('blob:real');
  });

  it('cleans up the silent clip when nothing else loads', async () => {
    const { el, backend } = make();
    backend.unlock();
    expect(el.getAttribute('src')).toMatch(/^data:audio\/wav/);
    el.plays[0].resolve();
    await tick();
    expect(el.getAttribute('src')).toBeNull();
  });

  it('never interferes when a track is already loaded', () => {
    const { el, backend } = make();
    backend.load('blob:real');
    backend.unlock();
    expect(el.getAttribute('src')).toBe('blob:real');
    expect(el.plays).toHaveLength(0);
  });
});

function wav(seconds: number, rate = 8000) {
  const dataSize = seconds * rate * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, dataSize, true);
  return new Blob([buf]);
}

describe('wavDuration', () => {
  it('reads the length from the header', async () => {
    expect(await wavDuration(wav(12))).toBeCloseTo(12, 2);
  });
  it('returns undefined for non-WAV data', async () => {
    expect(await wavDuration(new Blob([new Uint8Array(100)]))).toBeUndefined();
  });
});
