import { reconcileOrder } from './battingOrder';
import type { IdGenerator } from './ids';
import { newId } from './ids';
import { DEFAULT_TEAM_SETTINGS, type Player, type Playlist, type Team } from './types';

export function createTeam(name: string, id: IdGenerator = newId): Team {
  return {
    id: id(),
    name: name.trim() || 'My Team',
    players: [],
    battingOrder: [],
    defensePlaylists: [],
    activeDefensePlaylistId: null,
    settings: { ...DEFAULT_TEAM_SETTINGS },
  };
}

export function createPlayer(fields: Partial<Player> & { name: string }, id: IdGenerator = newId): Player {
  return { id: id(), number: '', walkUpSongId: null, clipStart: 0, clipEnd: null, ...fields };
}

export function createPlaylist(name: string, songIds: string[] = [], id: IdGenerator = newId): Playlist {
  return { id: id(), name: name.trim() || 'Playlist', songIds };
}

/** Adds a player and puts them at the bottom of the batting order. */
export function addPlayer(team: Team, player: Player): Team {
  return { ...team, players: [...team.players, player], battingOrder: [...team.battingOrder, player.id] };
}

export function updatePlayer(team: Team, player: Player): Team {
  return { ...team, players: team.players.map((p) => (p.id === player.id ? player : p)) };
}

export function removePlayer(team: Team, playerId: string): Team {
  return reconcileOrder({ ...team, players: team.players.filter((p) => p.id !== playerId) });
}

/** Assigns (or clears) a walk-up song. Changing the song resets the clip points. */
export function assignWalkUp(team: Team, playerId: string, songId: string | null): Team {
  return {
    ...team,
    players: team.players.map((p) =>
      p.id === playerId && p.walkUpSongId !== songId
        ? { ...p, walkUpSongId: songId, clipStart: 0, clipEnd: null }
        : p,
    ),
  };
}

/** Removes a deleted song from every player and playlist. */
export function detachSong(team: Team, songId: string): Team {
  return {
    ...team,
    players: team.players.map((p) => (p.walkUpSongId === songId ? { ...p, walkUpSongId: null } : p)),
    defensePlaylists: team.defensePlaylists.map((pl) => ({ ...pl, songIds: pl.songIds.filter((s) => s !== songId) })),
  };
}

/** Deep copy with fresh ids; batting order and playlist references are remapped. */
export function duplicateTeam(team: Team, id: IdGenerator = newId): Team {
  const playerIds = new Map<string, string>();
  const players = team.players.map((p) => {
    const nid = id();
    playerIds.set(p.id, nid);
    return { ...p, id: nid };
  });
  const playlistIds = new Map<string, string>();
  const defensePlaylists = team.defensePlaylists.map((pl) => {
    const nid = id();
    playlistIds.set(pl.id, nid);
    return { ...pl, id: nid, songIds: [...pl.songIds] };
  });
  return {
    ...team,
    id: id(),
    name: `${team.name} (copy)`,
    players,
    battingOrder: team.battingOrder.map((p) => playerIds.get(p)).filter((p): p is string => !!p),
    defensePlaylists,
    activeDefensePlaylistId: team.activeDefensePlaylistId ? (playlistIds.get(team.activeDefensePlaylistId) ?? null) : null,
    settings: { ...team.settings },
  };
}
