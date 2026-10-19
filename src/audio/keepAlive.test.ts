import { describe, expect, it } from 'vitest';
import { KEEP_ALIVE_GAIN, KEEP_ALIVE_HZ, SpeakerKeepAlive } from './keepAlive';

class FakeCtx {
  state: string = 'suspended';
  oscs: { frequency: { value: number }; started: boolean; stopped: boolean }[] = [];
  gains: { gain: { value: number } }[] = [];
  resumes = 0;
  closed = false;
  destination = {};
  private listeners = new Map<string, () => void>();
  createOscillator() {
    const o = { frequency: { value: 0 }, started: false, stopped: false, connect: (n: unknown) => n, disconnect() {}, start() { o.started = true; }, stop() { o.stopped = true; } };
    this.oscs.push(o);
    return o;
  }
  createGain() {
    const g = { gain: { value: 1 }, connect: (n: unknown) => n };
    this.gains.push(g);
    return g;
  }
  resume() {
    this.resumes++;
    this.state = 'running';
    return Promise.resolve();
  }
  close() {
    this.closed = true;
    this.state = 'closed';
    return Promise.resolve();
  }
  addEventListener(type: string, fn: () => void) {
    this.listeners.set(type, fn);
  }
  fire(type: string) {
    this.listeners.get(type)?.();
  }
}

function setup(contexts = 1) {
  const ctxs: FakeCtx[] = [];
  const target = new EventTarget();
  let visible = true;
  const keep = new SpeakerKeepAlive({
    makeContext: () => {
      const c = new FakeCtx();
      ctxs.push(c);
      return contexts-- > 0 ? (c as unknown as AudioContext) : null;
    },
    target,
    visible: () => visible,
  });
  return { keep, ctxs, target, setVisible: (v: boolean) => (visible = v) };
}

describe('SpeakerKeepAlive', () => {
  it('plays a constant, quiet, sub-audible tone', async () => {
    const { keep, ctxs } = setup();
    keep.start();
    await Promise.resolve();
    expect(ctxs).toHaveLength(1);
    expect(ctxs[0].oscs[0].started).toBe(true);
    expect(ctxs[0].oscs[0].frequency.value).toBe(KEEP_ALIVE_HZ);
    expect(KEEP_ALIVE_HZ).toBeLessThanOrEqual(25);
    expect(ctxs[0].gains[0].gain.value).toBe(KEEP_ALIVE_GAIN);
    expect(KEEP_ALIVE_GAIN).toBeLessThan(0.01); // quieter than -40 dBFS
    expect(keep.running).toBe(true);
  });

  it('is idempotent: starting twice builds one tone', () => {
    const { keep, ctxs } = setup();
    keep.start();
    keep.start();
    expect(ctxs).toHaveLength(1);
    expect(ctxs[0].oscs).toHaveLength(1);
  });

  it('stop() ends the tone and releases the context; it can start again afterwards', () => {
    const { keep, ctxs } = setup(2);
    keep.start();
    keep.stop();
    expect(ctxs[0].oscs[0].stopped).toBe(true);
    expect(ctxs[0].closed).toBe(true);
    expect(keep.running).toBe(false);
    keep.start();
    expect(ctxs).toHaveLength(2);
    keep.stop();
  });

  it('retries on the next tap if the browser held the context back, and when the page returns', async () => {
    const { keep, ctxs, target, setVisible } = setup();
    keep.start();
    ctxs[0].state = 'suspended'; // blocked until a gesture
    const before = ctxs[0].resumes;
    target.dispatchEvent(new Event('pointerdown'));
    expect(ctxs[0].resumes).toBe(before + 1);
    ctxs[0].state = 'interrupted'; // e.g. a phone call
    ctxs[0].fire('statechange');
    expect(ctxs[0].resumes).toBe(before + 2);
    setVisible(false);
    ctxs[0].state = 'suspended';
    target.dispatchEvent(new Event('visibilitychange'));
    expect(ctxs[0].resumes).toBe(before + 2); // hidden pages are left alone
    setVisible(true);
    target.dispatchEvent(new Event('visibilitychange'));
    expect(ctxs[0].resumes).toBe(before + 3);
  });

  it('ignores gestures after stop() and survives having no Web Audio', () => {
    const { keep, ctxs, target } = setup(0);
    expect(() => keep.start()).not.toThrow();
    expect(keep.running).toBe(false);
    keep.stop();
    target.dispatchEvent(new Event('pointerdown'));
    expect(ctxs).toHaveLength(1); // only the failed attempt from start()
  });
});
