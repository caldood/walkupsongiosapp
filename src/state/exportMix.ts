import { decodeToBuffer, encodeWav, measureMix, renderWalkUpMix, type MixReport } from '../audio/render';
import type { Player, Team } from '../core/types';
import { repository, store } from './app';
import { walkUpRequest } from './gameActions';

export type MixPlayer = Pick<Player, 'id' | 'name' | 'clipStart' | 'clipEnd' | 'walkUpSongId' | 'announcerSongId' | 'announcerDelay'>;

export interface MixResult {
  blob: Blob;
  filename: string;
  report: MixReport & { songName: string; announcerName?: string; announcerMissing: boolean; fadeOut: number; duck?: number; gain?: number; clipStart: number };
}

export class MixError extends Error {
  constructor(public code: 'no-song' | 'spotify' | 'missing' | 'unsupported' | 'failed') {
    super(code);
  }
}

const safe = (s: string) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'walkup';

/**
 * QA export: renders the single audio file a batter would get — music clip with fade-out and the announcer
 * mixed over it — using the current settings. Works from unsaved editor values too.
 */
export async function exportWalkUpMix(team: Team, player: MixPlayer): Promise<MixResult> {
  const req = walkUpRequest(team, player, { preview: true });
  if (req === 'no-song') throw new MixError('no-song');
  if (req === 'spotify') throw new MixError('spotify');

  const musicBlob = await repository.getAudio(req.songId);
  if (!musicBlob) throw new MixError('missing');
  let music: AudioBuffer;
  try {
    music = await decodeToBuffer(musicBlob);
  } catch {
    throw new MixError('unsupported');
  }

  let announcer: { buffer: AudioBuffer; delay: number; duck: number; gain: number } | undefined;
  let announcerMissing = false;
  if (req.announcer) {
    const blob = await repository.getAudio(req.announcer.songId);
    if (blob) {
      try {
        announcer = { buffer: await decodeToBuffer(blob), delay: req.announcer.delay, duck: req.announcer.duck, gain: req.announcer.gain };
      } catch {
        announcerMissing = true;
      }
    } else announcerMissing = true;
  }

  let rendered: AudioBuffer;
  try {
    rendered = await renderWalkUpMix({ music, start: req.start, end: req.end, fadeOut: req.fadeOut ?? 0, announcer });
  } catch {
    throw new MixError('failed');
  }
  const m = measureMix(rendered);
  return {
    blob: encodeWav(rendered),
    filename: `${safe(team.name)}_${safe(player.name)}_walkup-mix.wav`,
    report: {
      ...m,
      announcerStartsAt: announcer?.delay,
      announcerEndsAt: announcer ? announcer.delay + announcer.buffer.duration : undefined,
      songName: store.song(req.songId)?.name ?? 'Song',
      announcerName: req.announcer ? store.song(req.announcer.songId)?.name : undefined,
      announcerMissing,
      fadeOut: req.fadeOut ?? 0,
      duck: announcer?.duck,
      gain: announcer?.gain,
      clipStart: req.start,
    },
  };
}
