import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBackend } from '../testing';
import { AudioManager, type Overlay, type OverlayEngine } from './AudioManager';

class FakeEngine implements OverlayEngine {
  calls: string[] = [];
  lateOk = true;
  prepare(needed: boolean) {
    this.calls.push(`prepare:${needed}`);
  }
  canAttachLate() {
    return this.lateOk;
  }
  start(o: Overlay, elapsed: number) {
    this.calls.push(`start:${o.delay}@${elapsed}`);
  }
  fadeOut(startIn: number, duration: number) {
    this.calls.push(`fade:${startIn.toFixed(1)}+${duration.toFixed(1)}`);
  }
  pause() {
    this.calls.push('pause');
  }
  resume() {
    this.calls.push('resume');
  }
  stop() {
    this.calls.push('stop');
  }
}

const overlay: Overlay = { clip: {}, duration: 3, delay: 2, duck: 0.3 };
let backend: FakeBackend;
let engine: FakeEngine;
let audio: AudioManager;
const settle = () => vi.advanceTimersByTimeAsync(0);
const req = (over = {}) => ({ key: 's', kind: 'walkup' as const, title: 'T', url: 'blob:s', start: 10, end: 30, overlay, ...over });

beforeEach(() => {
  vi.useFakeTimers();
  backend = new FakeBackend();
  engine = new FakeEngine();
  audio = new AudioManager(backend, { overlay: engine });
});
afterEach(() => vi.useRealTimers());

describe('AudioManager overlay (announcer over music)', () => {
  it('prepares synchronously in the tap and starts the overlay once the music is playing', async () => {
    audio.play(req());
    expect(engine.calls).toEqual(['stop', 'prepare:true']); // before any await – inside the gesture
    await settle();
    expect(engine.calls.at(-1)).toBe('start:2@0');
  });

  it('does not touch the overlay for plain tracks, but still prepares so a routed element stays audible', async () => {
    audio.play(req({ overlay: undefined }));
    await settle();
    expect(engine.calls).toEqual(['stop', 'prepare:false']);
  });

  it('pauses and resumes the overlay with the music (without restarting it)', async () => {
    audio.play(req());
    await settle();
    audio.pause();
    audio.resume();
    await settle();
    expect(engine.calls.slice(-2)).toEqual(['pause', 'resume']);
    expect(engine.calls.filter((c) => c.startsWith('start'))).toHaveLength(1);
  });

  it('stops the overlay on stop, on clip end, and when another track replaces it', async () => {
    audio.play(req());
    await settle();
    audio.stop();
    expect(engine.calls.at(-1)).toBe('stop');

    audio.play(req());
    await settle();
    backend.currentTime = 31;
    vi.advanceTimersByTime(100);
    expect(engine.calls.at(-1)).toBe('stop');

    audio.play(req());
    await settle();
    engine.calls.length = 0;
    audio.play(req({ key: 'other', overlay: undefined }));
    expect(engine.calls[0]).toBe('stop');
  });

  it('pauses the overlay when the OS interrupts playback', async () => {
    audio.play(req());
    await settle();
    backend.emit('interrupted');
    expect(engine.calls.at(-1)).toBe('pause');
  });

  it('attaches a late overlay mid-track with the elapsed time, only if the engine can', async () => {
    audio.play(req({ overlay: undefined }));
    await settle();
    backend.currentTime = 11; // 1s into the clip
    vi.advanceTimersByTime(100);
    audio.attachOverlay('s', overlay);
    expect(engine.calls.at(-1)).toMatch(/^start:2@1/);

    audio.play(req({ overlay: undefined }));
    await settle();
    engine.lateOk = false;
    engine.calls.length = 0;
    audio.attachOverlay('s', overlay);
    expect(engine.calls).toEqual([]);
  });

  it('ignores a late overlay for a track that is no longer playing', async () => {
    audio.play(req({ overlay: undefined }));
    await settle();
    engine.calls.length = 0;
    audio.attachOverlay('different-key', overlay);
    audio.stop();
    audio.attachOverlay('s', overlay);
    expect(engine.calls.filter((c) => c.startsWith('start'))).toEqual([]);
  });

  it('starts the overlay after a blocked autoplay is recovered with a tap', async () => {
    backend.rejectNextPlay = { name: 'NotAllowedError' };
    audio.play(req());
    await settle();
    expect(engine.calls.filter((c) => c.startsWith('start'))).toEqual([]);
    audio.resume();
    await settle();
    expect(engine.calls.filter((c) => c.startsWith('start'))).toHaveLength(1);
  });
});

describe('AudioManager fade-out', () => {
  it('prepares the mixer (so the fade is possible) and schedules the fade from the real position', async () => {
    audio.play(req({ overlay: undefined, fadeOut: 2 })); // clip 10 → 30
    expect(engine.calls).toContain('prepare:true');
    await settle();
    backend.currentTime = 10.2; // playback has reached the clip
    vi.advanceTimersByTime(100);
    expect(engine.calls.filter((c) => c.startsWith('fade'))).toEqual(['fade:17.8+2.0']); // 19.8s left, fade the last 2s
    backend.currentTime = 15;
    vi.advanceTimersByTime(100);
    expect(engine.calls.filter((c) => c.startsWith('fade'))).toHaveLength(1); // only once
  });

  it('does not wait for the seek to land before scheduling (no fade from a bogus position)', async () => {
    audio.play(req({ overlay: undefined, fadeOut: 2 }));
    await settle();
    backend.currentTime = 0.1; // browser hasn't honoured the start seek yet
    vi.advanceTimersByTime(100);
    expect(engine.calls.some((c) => c.startsWith('fade'))).toBe(false);
  });

  it('shortens the fade when less than the fade time remains', async () => {
    audio.play(req({ overlay: undefined, fadeOut: 5, start: 10, end: 12 }));
    await settle();
    backend.currentTime = 10.5;
    vi.advanceTimersByTime(100);
    expect(engine.calls.filter((c) => c.startsWith('fade'))).toEqual(['fade:0.0+1.5']);
  });

  it('never fades without a clip end, or when fade is off', async () => {
    audio.play(req({ overlay: undefined, fadeOut: 2, end: null, start: 0 }));
    await settle();
    audio.play(req({ overlay: undefined, fadeOut: 0 }));
    await settle();
    backend.currentTime = 11;
    vi.advanceTimersByTime(100);
    expect(engine.calls.some((c) => c.startsWith('fade'))).toBe(false);
    expect(engine.calls).toContain('prepare:false');
  });
});
