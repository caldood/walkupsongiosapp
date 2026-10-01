import type { GameState, Song, Team } from '../core/types';
import type { LoadedData, Repository } from './repository';

const DB_NAME = 'game-day-music';
const DB_VERSION = 1;
const STORES = { teams: 'teams', songs: 'songs', audio: 'audio', kv: 'kv' } as const;

interface AudioRecord {
  id: string;
  blob: Blob;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * IndexedDB persistence. Structured data (teams, songs, game) and audio blobs live in separate
 * object stores so reading the lineup never loads audio into memory.
 */
export class IdbRepository implements Repository {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    this.dbPromise ??= new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        const db = open.result;
        db.createObjectStore(STORES.teams, { keyPath: 'id' });
        db.createObjectStore(STORES.songs, { keyPath: 'id' });
        db.createObjectStore(STORES.audio, { keyPath: 'id' });
        db.createObjectStore(STORES.kv);
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    return this.dbPromise;
  }

  private async write(store: keyof typeof STORES, fn: (s: IDBObjectStore) => void): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(store, 'readwrite');
    fn(tx.objectStore(store));
    await done(tx);
  }

  async loadAll(): Promise<LoadedData> {
    const db = await this.db();
    const tx = db.transaction([STORES.teams, STORES.songs, STORES.audio, STORES.kv], 'readonly');
    const [teams, songs, audioIds, game] = await Promise.all([
      req<Team[]>(tx.objectStore(STORES.teams).getAll()),
      req<Song[]>(tx.objectStore(STORES.songs).getAll()),
      req<IDBValidKey[]>(tx.objectStore(STORES.audio).getAllKeys()),
      req<GameState | undefined>(tx.objectStore(STORES.kv).get('game')),
    ]);
    return { teams, songs, audioIds: audioIds.map(String), game: game ?? null };
  }

  saveTeam(team: Team) {
    return this.write('teams', (s) => void s.put(team));
  }
  deleteTeam(id: string) {
    return this.write('teams', (s) => void s.delete(id));
  }
  saveSong(song: Song) {
    return this.write('songs', (s) => void s.put(song));
  }
  deleteSong(id: string) {
    return this.write('songs', (s) => void s.delete(id));
  }
  saveGame(game: GameState) {
    return this.write('kv', (s) => void s.put(game, 'game'));
  }
  putAudio(id: string, blob: Blob) {
    return this.write('audio', (s) => void s.put({ id, blob } satisfies AudioRecord));
  }
  async getAudio(id: string): Promise<Blob | null> {
    const db = await this.db();
    const rec = await req<AudioRecord | undefined>(db.transaction(STORES.audio).objectStore(STORES.audio).get(id));
    return rec?.blob ?? null;
  }
  deleteAudio(id: string) {
    return this.write('audio', (s) => void s.delete(id));
  }
  async clearAll() {
    const db = await this.db();
    const tx = db.transaction([STORES.teams, STORES.songs, STORES.audio, STORES.kv], 'readwrite');
    for (const name of Object.values(STORES)) tx.objectStore(name).clear();
    await done(tx);
  }
}

/** Asks the browser not to evict our data under storage pressure. Best effort; iOS honours it mainly for installed web apps. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ignore */
  }
  return false;
}
