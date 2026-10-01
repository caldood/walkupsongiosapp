import type { IdGenerator } from './ids';
import { newId } from './ids';
import type { Song, Team } from './types';

export function displayNameFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || filename;
}

export function createLocalSong(
  file: { name: string; size: number; type: string },
  extra: Partial<Song> = {},
  id: IdGenerator = newId,
): Song {
  const sid = id();
  return {
    id: sid,
    name: displayNameFromFilename(file.name),
    filename: file.name,
    sourceType: 'local',
    localReference: sid,
    size: file.size,
    mimeType: file.type,
    ...extra,
  };
}

export function createSpotifySong(name: string, uriOrUrl: string, id: IdGenerator = newId): Song {
  return { id: id(), name: name.trim() || 'Spotify song', filename: '', sourceType: 'spotify', spotifyUri: uriOrUrl.trim() };
}

/** Canonical https link for a stored Spotify uri/url, or null if it isn't a Spotify link. */
export function spotifyOpenUrl(song: Pick<Song, 'spotifyUri'>): string | null {
  const v = song.spotifyUri?.trim();
  if (!v) return null;
  const uri = /^spotify:(track|album|playlist|episode):([A-Za-z0-9]+)$/.exec(v);
  if (uri) return `https://open.spotify.com/${uri[1]}/${uri[2]}`;
  const web = /^https:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist|episode)\/([A-Za-z0-9]+)/.exec(v);
  return web ? `https://open.spotify.com/${web[1]}/${web[2]}` : null;
}

/** Song ids a team depends on (walk-ups + defense playlists). */
export function songIdsUsedBy(team: Team): string[] {
  const ids = new Set<string>();
  for (const p of team.players) {
    if (p.walkUpSongId) ids.add(p.walkUpSongId);
    if (p.announcerSongId) ids.add(p.announcerSongId);
  }
  for (const pl of team.defensePlaylists) pl.songIds.forEach((s) => ids.add(s));
  return [...ids];
}

/** A song is playable on this device when it is local and its audio is stored. */
export function isPlayable(song: Song | undefined, audioIds: ReadonlySet<string>): boolean {
  return !!song && song.sourceType === 'local' && audioIds.has(song.localReference ?? song.id);
}

/** Local songs used by the team whose audio isn't on this device. */
export function findMissingSongs(team: Team, songs: Song[], audioIds: ReadonlySet<string>): Song[] {
  const byId = new Map(songs.map((s) => [s.id, s]));
  return songIdsUsedBy(team)
    .map((id) => byId.get(id))
    .filter((s): s is Song => !!s && s.sourceType === 'local' && !audioIds.has(s.localReference ?? s.id));
}

export interface FileLike {
  name: string;
  size?: number;
}

/**
 * Pairs freshly-picked files with missing songs by filename (case-insensitive). If several
 * songs share a filename the size is used to disambiguate. Each file/song is matched once.
 */
export function matchFilesToSongs<F extends FileLike>(files: F[], missing: Song[]): { file: F; song: Song }[] {
  const out: { file: F; song: Song }[] = [];
  const used = new Set<string>();
  for (const file of files) {
    const candidates = missing.filter((s) => !used.has(s.id) && s.filename.toLowerCase() === file.name.toLowerCase());
    const pick = candidates.find((s) => s.size != null && s.size === file.size) ?? candidates[0];
    if (pick) {
      used.add(pick.id);
      out.push({ file, song: pick });
    }
  }
  return out;
}
