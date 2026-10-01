import type { Player, Song, TeamSettings } from './types';

export interface Clip {
  start: number;
  /** Always set for walk-ups: the clip never plays to the end of the song. */
  end: number;
  duration: number;
}

export const MIN_CLIP_SECONDS = 1;

/**
 * Works out the exact portion of a song to play for a batter.
 * - start: the player's clipStart (>= 0)
 * - end: the player's clipEnd if it is after the start, otherwise start + default duration
 * - clamped to the song's real duration when known; never shorter than MIN_CLIP_SECONDS
 *   unless the song itself is shorter.
 */
export function resolveClip(
  player: Pick<Player, 'clipStart' | 'clipEnd'>,
  song: Pick<Song, 'duration'> | undefined,
  defaultSeconds: TeamSettings['defaultClipSeconds'],
): Clip {
  const total = song?.duration && song.duration > 0 ? song.duration : undefined;
  let start = Math.max(0, Number.isFinite(player.clipStart) ? player.clipStart : 0);
  if (total !== undefined && start >= total - MIN_CLIP_SECONDS) start = Math.max(0, total - MIN_CLIP_SECONDS);

  let end = player.clipEnd != null && player.clipEnd > start ? player.clipEnd : start + defaultSeconds;
  if (end - start < MIN_CLIP_SECONDS) end = start + MIN_CLIP_SECONDS;
  if (total !== undefined) end = Math.min(end, total);
  return { start, end, duration: Math.max(0, end - start) };
}

/** Human summary like "0:42–1:02" used on player cards. */
export function describeClip(clip: Clip, fmt: (s: number) => string): string {
  return `${fmt(clip.start)}–${fmt(clip.end)}`;
}
