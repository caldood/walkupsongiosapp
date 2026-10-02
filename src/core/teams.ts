import { reconcileOrder } from './battingOrder';
import type { IdGenerator } from './ids';
import { newId } from './ids';
import { DEFAULT_TEAM_SETTINGS, MAX_CLIP_SECONDS, type Player, type Team } from './types';

export function createTeam(name: string, id: IdGenerator = newId): Team {
  return {
    id: id(),
    name: name.trim() || 'My Team',
    players: [],
    battingOrder: [],
    settings: { ...DEFAULT_TEAM_SETTINGS },
  };
}

export function createPlayer(fields: Partial<Player> & { name: string }, id: IdGenerator = newId): Player {
  return { id: id(), number: '', walkUpSongId: null, clipStart: 0, clipEnd: null, ...fields };
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

/** Removes a deleted song from every player. */
export function detachSong(team: Team, songId: string): Team {
  return {
    ...team,
    players: team.players.map((p) => ({
      ...p,
      walkUpSongId: p.walkUpSongId === songId ? null : p.walkUpSongId,
      announcerSongId: p.announcerSongId === songId ? null : p.announcerSongId,
    })),
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
  return {
    ...team,
    id: id(),
    name: `${team.name} (copy)`,
    players,
    battingOrder: team.battingOrder.map((p) => playerIds.get(p)).filter((p): p is string => !!p),
    settings: { ...team.settings },
  };
}

/**
 * Brings a team saved by an older version up to date: settings added since then get their defaults
 * (so e.g. teams created before the fade-out feature still fade), and retired fields are dropped.
 */
export function normalizeTeam(team: Team): Team {
  const rest: Record<string, unknown> = { ...team };
  delete rest.defensePlaylists;
  delete rest.activeDefensePlaylistId;
  const saved = (team.settings ?? {}) as Partial<Team['settings']>;
  const settings = { ...DEFAULT_TEAM_SETTINGS };
  for (const key of Object.keys(DEFAULT_TEAM_SETTINGS) as (keyof typeof DEFAULT_TEAM_SETTINGS)[]) {
    const v = saved[key];
    if (typeof v === typeof DEFAULT_TEAM_SETTINGS[key] && !(typeof v === 'number' && !Number.isFinite(v))) (settings[key] as unknown) = v;
  }
  settings.defaultClipSeconds = Math.min(MAX_CLIP_SECONDS, Math.max(1, settings.defaultClipSeconds));
  return { ...(rest as unknown as Team), settings };
}
