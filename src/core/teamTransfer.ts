import { reconcileOrder } from './battingOrder';
import type { IdGenerator } from './ids';
import { newId } from './ids';
import { songIdsUsedBy } from './songs';
import { DEFAULT_TEAM_SETTINGS, MAX_CLIP_SECONDS, type Player, type Song, type Team } from './types';

export const EXPORT_FORMAT = 'game-day-music/team';
export const EXPORT_VERSION = 1;

/**
 * Team configuration only (older files may also contain defense playlists; those are ignored). Audio files are deliberately NOT included (copyright, size, and the
 * browser can't re-attach them anyway): songs travel as metadata and are re-linked by file name.
 */
export interface TeamExport {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  team: Team;
  songs: Song[];
}

export class ImportError extends Error {}

export function exportTeam(team: Team, songs: Song[], now: Date = new Date()): TeamExport {
  const used = new Set(songIdsUsedBy(team));
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    team,
    songs: songs.filter((s) => used.has(s.id)),
  };
}

export function serializeTeam(team: Team, songs: Song[]): string {
  return JSON.stringify(exportTeam(team, songs), null, 2);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

/** Parses and validates untrusted JSON. Throws ImportError with a friendly message. */
export function parseTeamExport(text: string): TeamExport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError('That file is not a team export.');
  }
  if (!isObj(raw) || raw.format !== EXPORT_FORMAT) throw new ImportError('That file is not a team export.');
  if (num(raw.version) > EXPORT_VERSION) throw new ImportError('That file was made by a newer version of the app.');
  if (!isObj(raw.team) || !Array.isArray(raw.team.players)) throw new ImportError('The team data is incomplete.');

  const t = raw.team;
  const s = isObj(t.settings) ? t.settings : {};
  const team: Team = {
    id: str(t.id, 'imported'),
    name: str(t.name, 'Imported Team'),
    players: (t.players as unknown[]).filter(isObj).map((p) => ({
      id: str(p.id),
      name: str(p.name, 'Player'),
      number: str(p.number),
      photo: typeof p.photo === 'string' ? p.photo : undefined,
      walkUpSongId: typeof p.walkUpSongId === 'string' ? p.walkUpSongId : null,
      announcerSongId: typeof p.announcerSongId === 'string' ? p.announcerSongId : null,
      announcerDelay: typeof p.announcerDelay === 'number' && Number.isFinite(p.announcerDelay) ? Math.max(0, p.announcerDelay) : undefined,
      clipStart: Math.max(0, num(p.clipStart)),
      clipEnd: typeof p.clipEnd === 'number' && Number.isFinite(p.clipEnd) ? p.clipEnd : null,
    })),
    battingOrder: Array.isArray(t.battingOrder) ? t.battingOrder.filter((x): x is string => typeof x === 'string') : [],
    settings: {
      defaultClipSeconds: Math.min(MAX_CLIP_SECONDS, Math.max(1, num(s.defaultClipSeconds, DEFAULT_TEAM_SETTINGS.defaultClipSeconds))),
      autoAdvance: bool(s.autoAdvance, DEFAULT_TEAM_SETTINGS.autoAdvance),
      autoPlayNext: bool(s.autoPlayNext, DEFAULT_TEAM_SETTINGS.autoPlayNext),
      fadeOutSeconds: Math.min(10, Math.max(0, num(s.fadeOutSeconds, DEFAULT_TEAM_SETTINGS.fadeOutSeconds))),
      announcerDuck: Math.min(1, Math.max(0, num(s.announcerDuck, DEFAULT_TEAM_SETTINGS.announcerDuck))),
    },
  };
  const songs: Song[] = (Array.isArray(raw.songs) ? raw.songs : []).filter(isObj).map((x) => ({
    id: str(x.id),
    name: str(x.name, 'Song'),
    artist: typeof x.artist === 'string' ? x.artist : undefined,
    role: x.role === 'announcer' ? 'announcer' : undefined,
    filename: str(x.filename),
    sourceType: x.sourceType === 'spotify' ? 'spotify' : 'local',
    size: typeof x.size === 'number' ? x.size : undefined,
    mimeType: typeof x.mimeType === 'string' ? x.mimeType : undefined,
    duration: typeof x.duration === 'number' ? x.duration : undefined,
    spotifyUri: typeof x.spotifyUri === 'string' ? x.spotifyUri : undefined,
  }));
  if (team.players.some((p) => !p.id)) throw new ImportError('The team data is incomplete.');
  return { format: EXPORT_FORMAT, version: num(raw.version, 1), exportedAt: str(raw.exportedAt), team, songs };
}

export interface ImportResult {
  team: Team;
  /** Songs that must be added to the library (not already present on this device). */
  newSongs: Song[];
  /** Local songs from the import that have no audio on this device yet. */
  missingSongIds: string[];
}

/**
 * Turns an export into a new team on this device. Never overwrites: the team and its players get
 * fresh ids. Songs already in the library (same id, or same filename+size) are reused so their
 * audio is picked up automatically; others are added as metadata-only and reported as missing.
 */
export function prepareImport(
  data: TeamExport,
  existingSongs: Song[],
  audioIds: ReadonlySet<string>,
  id: IdGenerator = newId,
): ImportResult {
  const songMap = new Map<string, string>();
  const newSongs: Song[] = [];
  for (const s of data.songs) {
    const existing = existingSongs.find(
      (e) =>
        e.id === s.id ||
        (s.sourceType === 'local' && e.sourceType === 'local' && !!s.filename && e.filename === s.filename && (s.size == null || e.size == null || s.size === e.size)) ||
        (s.sourceType === 'spotify' && e.sourceType === 'spotify' && !!s.spotifyUri && e.spotifyUri === s.spotifyUri),
    );
    if (existing) {
      songMap.set(s.id, existing.id);
    } else {
      const nid = id();
      songMap.set(s.id, nid);
      newSongs.push({ ...s, id: nid, localReference: s.sourceType === 'local' ? nid : undefined });
    }
  }
  const remap = (sid: string | null | undefined) => (sid ? (songMap.get(sid) ?? null) : null);

  const playerIds = new Map<string, string>();
  const players: Player[] = data.team.players.map((p) => {
    const nid = id();
    playerIds.set(p.id, nid);
    return { ...p, id: nid, walkUpSongId: remap(p.walkUpSongId), announcerSongId: remap(p.announcerSongId) };
  });
  const team = reconcileOrder({
    ...data.team,
    id: id(),
    players,
    battingOrder: data.team.battingOrder.map((p) => playerIds.get(p)).filter((p): p is string => !!p),
  });

  const missingSongIds = [...new Set([...songMap.values()])].filter((sid) => {
    const song = [...existingSongs, ...newSongs].find((s) => s.id === sid);
    return !!song && song.sourceType === 'local' && !audioIds.has(song.localReference ?? song.id);
  });
  return { team, newSongs, missingSongIds };
}
