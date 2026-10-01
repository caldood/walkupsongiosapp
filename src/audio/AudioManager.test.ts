import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeBackend, flush } from '../testing';
import { AudioManager, classifyPlayError, describeAudioError, type EndedInfo } from './AudioManager';

let backend: FakeBackend;
let audio: AudioManager;
let ended: EndedInfo[];

beforeEach(() => {
  vi.useFakeTimers();
  backend = new FakeBackend();
  audio = new AudioManager(backend);
  ended = [];
  audio.onEnded((e) => ended.push(e));
});
afterEach(() => vi.useRealTimers());

const req = (over = {}) => ({ key: 's1', kind: 'walkup' as const, title: 'Enter Sandman', url: 'blob:1', start: 42, end: 62, ...over });
const settle = async () => {
  await vi.advanceTimersByTimeAsync(0);
};

describe('AudioManager state transitions', () => {
  it('goes idle → loading → playing and seeks to the clip start', async () => {
    expect(audio.getState().status).toBe('idle');
    audio.play(req());
    expect(audio.getState()).toMatchObject({ status: 'loading', length: 20, error: null });
    expect(backend.url).toBe('blob:1');
    expect(backend.currentTime).toBe(42);
    await settle();
    expect(audio.getState().status).toBe('playing');
  });

  it('calls backend.play() synchronously inside play() (iOS gesture requirement)', () => {
    audio.play(req());
    expect(backend.playCalls).toBe(1); // before any await
  });

  it('reports position within the clip and stops itself at the clip end', async () => {
    audio.play(req());
    await settle();
    backend.currentTime = 47;
    vi.advanceTimersByTime(100);
    expect(audio.getState().position).toBe(5);
    backend.currentTime = 62;
    vi.advanceTimersByTime(100);
    expect(audio.getState().status).toBe('idle');
    expect(ended).toEqual([{ track: expect.objectContaining({ key: 's1' }), reason: 'finished' }]);
    expect(backend.playing).toBe(false);
  });

  it('pauses and resumes', async () => {
    audio.play(req());
    await settle();
    audio.pause();
    expect(audio.getState().status).toBe('paused');
    expect(backend.playing).toBe(false);
    audio.resume();
    await settle();
    expect(audio.getState().status).toBe('playing');
    expect(backend.playing).toBe(true);
    audio.toggle();
    expect(audio.getState().status).toBe('paused');
  });

  it('stop() returns to idle and reports a stopped end', async () => {
    audio.play(req());
    await settle();
    audio.stop();
    expect(audio.getState()).toMatchObject({ status: 'idle', track: null, position: 0 });
    expect(ended[0].reason).toBe('stopped');
    audio.stop();
    expect(ended).toHaveLength(1); // stopping when idle is a no-op
  });

  it('only ever has one track: a new play() replaces the old without an end event', async () => {
    audio.play(req({ key: 'a', url: 'blob:a' }));
    await settle();
    audio.play(req({ key: 'b', url: 'blob:b', start: 0, end: null }));
    await settle();
    expect(audio.getState().track?.key).toBe('b');
    expect(backend.url).toBe('blob:b');
    expect(ended).toHaveLength(0);
  });

  it('a stale play() promise cannot overwrite a newer track', async () => {
    audio.play(req({ key: 'a', url: 'blob:a' }));
    audio.play(req({ key: 'b', url: 'blob:b' }));
    await settle();
    expect(audio.getState()).toMatchObject({ status: 'playing', track: { key: 'b' } });
  });

  it('finishes when the media ends naturally (no clip end)', async () => {
    audio.play(req({ kind: 'defense', start: 0, end: null }));
    await settle();
    backend.emit('ended');
    expect(audio.getState().status).toBe('idle');
    expect(ended[0]).toMatchObject({ reason: 'finished', track: { kind: 'defense' } });
  });

  it('becomes paused when the OS interrupts playback', async () => {
    audio.play(req());
    await settle();
    backend.emit('interrupted');
    expect(audio.getState().status).toBe('paused');
    audio.resume();
    await settle();
    expect(audio.getState().status).toBe('playing');
  });

  it('clamps the clip to the real media duration on metadata', async () => {
    backend.duration = 50;
    audio.play(req({ start: 30, end: 90 }));
    await settle();
    backend.emit('metadata');
    expect(audio.getState().length).toBe(20);
  });

  it('re-seeks to the start if the browser began at 0 before metadata', async () => {
    audio.play(req());
    await settle();
    backend.currentTime = 0.2; // browser ignored the early seek
    vi.advanceTimersByTime(100);
    expect(backend.currentTime).toBe(42);
  });

  it('seeks within the clip', async () => {
    audio.play(req());
    await settle();
    audio.seek(10);
    expect(backend.currentTime).toBe(52);
    audio.seek(999);
    expect(audio.getState().position).toBe(20);
  });
});

describe('AudioManager errors', () => {
  it('missing audio → friendly error and no playback', () => {
    audio.play(req({ url: null }));
    expect(audio.getState()).toMatchObject({ status: 'error', error: 'missing' });
    expect(backend.loads).toHaveLength(0);
    expect(describeAudioError('missing')).toBe('Walk-up song not available on this device.');
  });

  it('autoplay block → needs-gesture, and a tap on Play recovers', async () => {
    backend.rejectNextPlay = { name: 'NotAllowedError' };
    audio.play(req());
    await settle();
    expect(audio.getState()).toMatchObject({ status: 'error', error: 'needs-gesture' });
    expect(describeAudioError('needs-gesture')).toBe('Tap Play to start audio.');
    audio.resume();
    await settle();
    expect(audio.getState()).toMatchObject({ status: 'playing', error: null });
  });

  it('unsupported format and generic failures map to friendly text', async () => {
    backend.rejectNextPlay = { name: 'NotSupportedError' };
    audio.play(req());
    await settle();
    expect(audio.getState().error).toBe('unsupported');
    expect(describeAudioError('unsupported')).not.toMatch(/NotSupported/);
    expect(classifyPlayError(new Error('boom'))).toBe('failed');
    expect(classifyPlayError({ name: 'AbortError' })).toBe('failed');
  });

  it('a decode error while loading is reported as unsupported', () => {
    audio.play(req());
    backend.emit('error');
    expect(audio.getState()).toMatchObject({ status: 'error', error: 'unsupported' });
  });

  it('can recover from an error by playing another track', async () => {
    audio.play(req({ url: null }));
    audio.play(req({ key: 'ok', url: 'blob:ok' }));
    await settle();
    expect(audio.getState()).toMatchObject({ status: 'playing', error: null });
  });
});

describe('AudioManager subscriptions', () => {
  it('notifies subscribers and supports unsubscribe', async () => {
    const seen: string[] = [];
    const off = audio.subscribe((s) => seen.push(s.status));
    audio.play(req());
    await settle();
    off();
    audio.stop();
    expect(seen).toEqual(['loading', 'playing']);
  });
  it('flush helper settles real timers', async () => {
    vi.useRealTimers();
    await flush();
  });
});

describe('AudioManager background safety', () => {
  it("enforces the clip end from the media element's own timeupdate when timers are throttled", async () => {
    vi.useFakeTimers();
    const b = new FakeBackend();
    const a = new AudioManager(b);
    a.play({ key: 's', kind: 'walkup', title: 'T', url: 'blob:x', start: 5, end: 10 });
    await vi.advanceTimersByTimeAsync(0);
    b.currentTime = 10.1; // no interval tick has run
    b.emit('time');
    expect(a.getState().status).toBe('idle');
    vi.useRealTimers();
  });
});
