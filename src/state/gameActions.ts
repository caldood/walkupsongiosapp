import { currentBatter, lineup } from '../core/battingOrder';
import { fitAnnouncer, resolveClip } from '../core/clip';
import { DEFAULT_ANNOUNCER_DELAY, type GameMode, type Player, type Team } from '../core/types';
import { audioManager, playback, store } from './app';
import type { WalkUpRequest } from './playback';

/**
 * Builds the playback request for a player's walk-up: the music clip plus (if set) the announcer.
 * Takes a player-shaped object so the editor can test unsaved changes.
 */
export function walkUpRequest(
  team: Team,
  player: Pick<Player, 'id' | 'name' | 'clipStart' | 'clipEnd' | 'walkUpSongId' | 'announcerSongId' | 'announcerDelay'>,
  opts: { preview?: boolean } = {},
): WalkUpRequest | 'no-song' | 'spotify' {
  const song = store.song(player.walkUpSongId);
  if (!song) return 'no-song';
  if (song.sourceType !== 'local') return 'spotify';
  let clip = resolveClip(player, song, team.settings.defaultClipSeconds);
  const announcer = store.song(player.announcerSongId);
  const hasAnnouncer = !!announcer && announcer.sourceType === 'local';
  const delay = player.announcerDelay ?? DEFAULT_ANNOUNCER_DELAY;
  // Never cut the announcement off: stretch the clip if the announcer would outlast it.
  if (hasAnnouncer) clip = fitAnnouncer(clip, delay, announcer.duration);
  return {
    playerId: opts.preview ? 'preview' : player.id,
    songId: song.id,
    title: song.name,
    subtitle: player.name,
    start: clip.start,
    end: clip.end,
    announcer: hasAnnouncer ? { songId: announcer.id, delay, duck: team.settings.announcerDuck } : undefined,
  };
}

/** Plays a player's walk-up clip. Returns why nothing started, if so. */
export function playWalkUpFor(team: Team, player: Player, opts: { preview?: boolean } = {}): 'started' | 'no-song' | 'spotify' {
  const req = walkUpRequest(team, player, opts);
  if (typeof req === 'string') return req;
  playback.playWalkUp(req);
  return 'started';
}

export function playCurrentWalkUp() {
  const team = store.activeTeam;
  if (!team) return 'no-song' as const;
  const batter = currentBatter(team, store.getState().game.batterIndex);
  return batter ? playWalkUpFor(team, batter) : ('no-song' as const);
}

/**
 * Warms the audio cache for the whole batting order (current batter first) and the start of the
 * defense playlist, so a tap can call audio.play() synchronously inside the gesture. Safari
 * (desktop and iOS) rejects play() that happens after an await outside the tap.
 */
export function preloadBatters() {
  const team = store.activeTeam;
  if (!team) return;
  const i = store.getState().game.batterIndex;
  const order = lineup(team);
  const rotated = order.slice(i).concat(order.slice(0, i));
  const playlist = team.defensePlaylists.find((p) => p.id === team.activeDefensePlaylistId);
  playback.preload([...rotated.map((b) => b.walkUpSongId), ...(playlist?.songIds.slice(0, 3) ?? [])]);
  playback.preloadAnnouncers(rotated.map((b) => b.announcerSongId));
}

export function nextBatter() {
  // Moving on to the next batter ends any walk-up that's still sounding, but never cuts defense music.
  const a = audioManager.getState();
  if (a.track?.kind === 'walkup') playback.stopAll();
  store.nextBatter();
  preloadBatters();
}

export function previousBatter() {
  const a = audioManager.getState();
  if (a.track?.kind === 'walkup') playback.stopAll();
  store.previousBatter();
  preloadBatters();
}

/** Switching modes silences the other mode's sound: walk-up stops, defense pauses (so it can resume). */
export function switchMode(mode: GameMode) {
  const a = audioManager.getState();
  if (mode === 'walkup' && a.track?.kind === 'defense') playback.defensePause();
  if (mode === 'defense' && a.track?.kind === 'walkup') playback.stopAll();
  store.setMode(mode);
}

export function startActiveDefensePlaylist() {
  const team = store.activeTeam;
  const playlist = team?.defensePlaylists.find((p) => p.id === team.activeDefensePlaylistId);
  if (!team || !playlist) return false;
  playback.startDefense(playlist.id, playlist.songIds, { shuffle: team.settings.defenseShuffle, repeat: team.settings.defenseRepeat });
  return true;
}

export function resetGame() {
  playback.stopAll();
  store.resetGame();
  preloadBatters();
}

/** Wires auto-advance. Call once at startup. */
export function installAutoAdvance() {
  return playback.onWalkUpFinished((playerId) => {
    const team = store.activeTeam;
    if (!team?.settings.autoAdvance) return;
    const current = currentBatter(team, store.getState().game.batterIndex);
    if (current?.id !== playerId) return; // a preview of someone else shouldn't move the lineup
    store.nextBatter();
    preloadBatters();
    // Only ever auto-PLAY the next batter if explicitly enabled.
    if (team.settings.autoPlayNext) playCurrentWalkUp();
  });
}
