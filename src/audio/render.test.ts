import { describe, expect, it } from 'vitest';
import { scheduleDuck, scheduleFadeOut, SILENCE, type ParamLike } from './automation';
import { encodeWav, measureMix } from './render';

class Rec implements ParamLike {
  value = 1;
  calls: string[] = [];
  cancelScheduledValues(t: number) {
    this.calls.push(`cancel@${t}`);
  }
  setValueAtTime(v: number, t: number) {
    this.calls.push(`set ${v}@${t}`);
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.calls.push(`ramp ${v}@${t}`);
  }
}

const buf = (channels: number[][], sampleRate = 8000) => ({
  numberOfChannels: channels.length,
  length: channels[0].length,
  sampleRate,
  getChannelData: (c: number) => Float32Array.from(channels[c]),
});

describe('encodeWav', () => {
  it('writes a valid 16-bit stereo PCM header and interleaved samples', async () => {
    const blob = encodeWav(buf([[0, 0.5, -0.5], [1, -1, 0]]));
    const v = new DataView(await blob.arrayBuffer());
    const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    expect([tag(0), tag(8), tag(12), tag(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data']);
    expect(v.getUint16(22, true)).toBe(2); // channels
    expect(v.getUint32(24, true)).toBe(8000); // sample rate
    expect(v.getUint16(34, true)).toBe(16);
    expect(v.getUint32(40, true)).toBe(3 * 2 * 2); // data bytes
    expect(blob.size).toBe(44 + 12);
    expect(blob.type).toBe('audio/wav');
    // frame 0: L=0, R=1.0 → 32767 ; frame 1: L=0.5, R=-1 → -32768
    expect(v.getInt16(44, true)).toBe(0);
    expect(v.getInt16(46, true)).toBe(32767);
    expect(v.getInt16(50, true)).toBe(-32768);
  });
  it('clamps out-of-range samples instead of wrapping', async () => {
    const v = new DataView(await encodeWav(buf([[3, -3]])).arrayBuffer());
    expect(v.getInt16(44, true)).toBe(32767);
    expect(v.getInt16(46, true)).toBe(-32768);
  });
});

describe('measureMix', () => {
  it('reports length, peak in dBFS and clipping', () => {
    const m = measureMix(buf([[0.1, -0.5, 0.2]], 4));
    expect(m.durationSeconds).toBe(0.75);
    expect(m.peakDb).toBeCloseTo(-6.02, 1);
    expect(m.clipped).toBe(false);
    expect(measureMix(buf([[1, 0]])).clipped).toBe(true);
    expect(measureMix(buf([[0, 0]])).peakDb).toBe(-Infinity);
  });
});

describe('shared gain automation (same curves live and in the QA render)', () => {
  it('ducks the music under the announcement and brings it back', () => {
    const g = new Rec();
    scheduleDuck(g, 0, 3, 4.5, 0.35);
    expect(g.calls).toEqual(['cancel@0', 'set 1@0', 'set 1@2.75', 'ramp 0.35@3', 'set 0.35@4.5', 'ramp 1@4.9']);
  });
  it('starts the dip immediately if the announcement is already due', () => {
    const g = new Rec();
    scheduleDuck(g, 10, 10, 12, 0.5);
    expect(g.calls).toContain('set 1@10');
    expect(g.calls).toContain('ramp 0.5@10');
  });
  it('fades to near-silence over the given window', () => {
    const g = new Rec();
    scheduleFadeOut(g, 0, 13, 2);
    expect(g.calls).toEqual(['cancel@0', 'set 1@0', 'set 1@13', `ramp ${SILENCE}@15`]);
  });
});
