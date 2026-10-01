import type { GameState, Song, Team } from '../core/types';

export interface LoadedData {
  teams: Team[];
  songs: Song[];
  game: GameState | null;
  /** Ids of songs whose audio is stored on this device. */
  audioIds: string[];
}

/**
 * Persistence boundary. The UI and stores only know this interface; IndexedDB is one
 * implementation. A native app (or cloud sync) can supply another.
 */
export interface Repository {
  loadAll(): Promise<LoadedData>;
  saveTeam(team: Team): Promise<void>;
  deleteTeam(id: string): Promise<void>;
  saveSong(song: Song): Promise<void>;
  deleteSong(id: string): Promise<void>;
  saveGame(game: GameState): Promise<void>;
  putAudio(id: string, blob: Blob): Promise<void>;
  getAudio(id: string): Promise<Blob | null>;
  deleteAudio(id: string): Promise<void>;
  clearAll(): Promise<void>;
}

/** In-memory implementation: used by tests and as a last-resort fallback when IndexedDB is unavailable. */
export class MemoryRepository implements Repository {
  teams = new Map<string, Team>();
  songs = new Map<string, Song>();
  audio = new Map<string, Blob>();
  game: GameState | null = null;

  async loadAll(): Promise<LoadedData> {
    return { teams: [...this.teams.values()], songs: [...this.songs.values()], game: this.game, audioIds: [...this.audio.keys()] };
  }
  async saveTeam(t: Team) {
    this.teams.set(t.id, structuredClone(t));
  }
  async deleteTeam(id: string) {
    this.teams.delete(id);
  }
  async saveSong(s: Song) {
    this.songs.set(s.id, structuredClone(s));
  }
  async deleteSong(id: string) {
    this.songs.delete(id);
  }
  async saveGame(g: GameState) {
    this.game = structuredClone(g);
  }
  async putAudio(id: string, blob: Blob) {
    this.audio.set(id, blob);
  }
  async getAudio(id: string) {
    return this.audio.get(id) ?? null;
  }
  async deleteAudio(id: string) {
    this.audio.delete(id);
  }
  async clearAll() {
    this.teams.clear();
    this.songs.clear();
    this.audio.clear();
    this.game = null;
  }
}
