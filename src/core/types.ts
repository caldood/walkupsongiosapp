/**
 * Domain model. Pure data, no browser APIs — this file (and everything in `core/`) is
 * intentionally portable so a native iOS/Android app could reuse the same shapes.
 */

export type ID = string;

/** Where a song's audio comes from. Only `local` is playable by this app. */
export type SourceType = 'local' | 'spotify';

export interface Song {
  id: ID;
  /** Display name. */
  name: string;
  artist?: string;
  /** Original file name; used to re-link audio after importing a team onto a new device. */
  filename: string;
  sourceType: SourceType;
  /** local: key of the audio blob in the audio store (== song id once audio is stored). */
  localReference?: string;
  size?: number;
  mimeType?: string;
  /** Full-length duration in seconds, when known. */
  duration?: number;
  /** 'announcer' clips (spoken names) are kept apart from music in pickers and playlists. Missing = music. */
  role?: 'music' | 'announcer';
  /** spotify: reference only — we never download or play Spotify audio. */
  spotifyUri?: string;
}

export interface Player {
  id: ID;
  name: string;
  number: string;
  /** Small data-URL avatar. */
  photo?: string;
  walkUpSongId?: ID | null;
  /** Optional spoken announcement (a library song with role 'announcer') mixed over the walk-up music. */
  announcerSongId?: ID | null;
  /** Seconds after the clip starts when the announcement begins. */
  announcerDelay?: number;
  /** Seconds into the song where the walk-up starts. */
  clipStart: number;
  /** Seconds where it ends. null/undefined = clipStart + the team's default duration. */
  clipEnd?: number | null;
}

export interface Playlist {
  id: ID;
  name: string;
  songIds: ID[];
}

export interface TeamSettings {
  defaultClipSeconds: number;
  /** After a walk-up finishes, move the lineup to the next batter. */
  autoAdvance: boolean;
  /** …and also play that batter's walk-up (OFF by default). */
  autoPlayNext: boolean;
  defenseShuffle: boolean;
  defenseRepeat: boolean;
  /** Music level (0–1) while the announcer speaks. 1 = no ducking. */
  announcerDuck: number;
}

export interface Team {
  id: ID;
  name: string;
  players: Player[];
  /** Player ids, in batting order. Players not listed are on the bench. */
  battingOrder: ID[];
  defensePlaylists: Playlist[];
  activeDefensePlaylistId?: ID | null;
  settings: TeamSettings;
}

export type Half = 'top' | 'bottom';
export type GameMode = 'defense' | 'walkup';

export interface GameState {
  teamId: ID | null;
  inning: number;
  half: Half;
  /** Index into the team's batting order. */
  batterIndex: number;
  mode: GameMode;
}

export type Theme = 'dark' | 'light';

/** Small device-level preferences (kept in localStorage). */
export interface AppSettings {
  theme: Theme;
  keepAwake: boolean;
  activeTeamId: ID | null;
}

export const DEFAULT_TEAM_SETTINGS: TeamSettings = {
  defaultClipSeconds: 15,
  autoAdvance: false,
  autoPlayNext: false,
  defenseShuffle: false,
  defenseRepeat: true,
  announcerDuck: 0.35,
};

export const DEFAULT_ANNOUNCER_DELAY = 2;

export const DEFAULT_APP_SETTINGS: AppSettings = { theme: 'dark', keepAwake: true, activeTeamId: null };

export const CLIP_DURATION_CHOICES = [10, 15, 20, 30] as const;
