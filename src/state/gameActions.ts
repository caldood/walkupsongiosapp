import { currentBatter, lineup } from '../core/battingOrder';
import { resolveClip } from '../core/clip';
import type { GameMode, Player, Team } from '../core/types';
import { audioManager, playback, store } from './app';

/** Plays a player's walk-up clip. Returns why nothing started, if so. */
export function playWalkUpFor(team: Team, player: Player): 'started' | 'no-song' | 'spotify' {
  const song = store.song(player.walkUpSongId);
  if (!song) return 'no-song';
  if (song.sourceType !== 'local') return 'spotify';
  const clip = resolveClip(player, song, team.settings.defaultClipSeconds);
  playback.playWalkUp({
    playerId: player.id,
    songId: song.id,
    title: song.name,
    subtitle: player.name,
    start: clip.start,
    end: clip.end,
  });
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
