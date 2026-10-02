import { configureLimiter, scheduleDuck, scheduleFadeOut } from './automation';

type OfflineCtor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext;

function offlineCtor(): OfflineCtor | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor }).OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: OfflineCtor }).webkitOfflineAudioContext ?? null;
}

export const renderSupported = () => offlineCtor() !== null;

/** Decode any audio file the browser can play into samples at `sampleRate`. */
export async function decodeToBuffer(blob: Blob, sampleRate = 44100): Promise<AudioBuffer> {
  const C = offlineCtor();
  if (!C) throw new Error('unsupported');
  const ctx = new C(1, 1, sampleRate);
  const data = await blob.arrayBuffer();
  return await new Promise<AudioBuffer>((resolve, reject) => ctx.decodeAudioData(data, resolve, reject));
}

export interface MixSpec {
  music: AudioBuffer;
  /** Where the clip starts/ends inside the song, in seconds. */
  start: number;
  end: number;
  fadeOut: number;
  announcer?: { buffer: AudioBuffer; delay: number; duck: number; gain: number };
  sampleRate?: number;
}

export interface MixReport {
  durationSeconds: number;
  peakDb: number;
  clipped: boolean;
  announcerStartsAt?: number;
  announcerEndsAt?: number;
}

/**
 * Renders the walk-up exactly as it would play live: music clip → ducking → fade-out → limiter, with the
 * announcer boosted and mixed in. Same gain curves as the live mixer (shared via automation.ts).
 */
export async function renderWalkUpMix(spec: MixSpec): Promise<AudioBuffer> {
  const C = offlineCtor();
  if (!C) throw new Error('unsupported');
  const sr = spec.sampleRate ?? 44100;
  const clip = Math.max(0.1, Math.min(spec.end, spec.music.duration) - spec.start);
  const ctx = new C(2, Math.ceil(clip * sr), sr);

  const musicGain = ctx.createGain();
  const fadeGain = ctx.createGain();
  const master = ctx.createDynamicsCompressor();
  configureLimiter(master, 'master');
  musicGain.connect(fadeGain);
  fadeGain.connect(master);
  master.connect(ctx.destination);

  const music = ctx.createBufferSource();
  music.buffer = spec.music;
  music.connect(musicGain);
  music.start(0, spec.start, clip);

  if (spec.announcer) {
    const a = spec.announcer;
    const announcerGain = ctx.createGain();
    announcerGain.gain.value = Math.max(0, a.gain);
    const voiceLimiter = ctx.createDynamicsCompressor();
    configureLimiter(voiceLimiter, 'voice');
    announcerGain.connect(voiceLimiter);
    voiceLimiter.connect(fadeGain);
    const src = ctx.createBufferSource();
    src.buffer = a.buffer;
    src.connect(announcerGain);
    src.start(Math.max(0, a.delay));
    scheduleDuck(musicGain.gain, 0, Math.max(0, a.delay), Math.max(0, a.delay) + a.buffer.duration, a.duck);
  }
  if (spec.fadeOut > 0) {
    const d = Math.min(spec.fadeOut, clip);
    scheduleFadeOut(fadeGain.gain, 0, clip - d, d);
  }
  return await ctx.startRendering();
}

/** Peak level of a rendered buffer in dBFS (0 = full scale). */
export function measureMix(buf: Pick<AudioBuffer, 'numberOfChannels' | 'length' | 'sampleRate' | 'getChannelData'>): Pick<MixReport, 'durationSeconds' | 'peakDb' | 'clipped'> {
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  }
  return { durationSeconds: buf.length / buf.sampleRate, peakDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity, clipped: peak >= 0.999 };
}

/** 16-bit PCM WAV (RIFF) encoding of a rendered buffer. */
export function encodeWav(buf: Pick<AudioBuffer, 'numberOfChannels' | 'length' | 'sampleRate' | 'getChannelData'>): Blob {
  const ch = buf.numberOfChannels;
  const frames = buf.length;
  const dataSize = frames * ch * 2;
  const out = new ArrayBuffer(44 + dataSize);
  const v = new DataView(out);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, ch, true);
  v.setUint32(24, buf.sampleRate, true);
  v.setUint32(28, buf.sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, dataSize, true);
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([out], { type: 'audio/wav' });
}
