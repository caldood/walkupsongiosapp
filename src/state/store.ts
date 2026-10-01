import { addPlayer, assignWalkUp, createPlayer, createPlaylist, createTeam, detachSong, duplicateTeam, removePlayer, updatePlayer } from '../core/teams';
import { clampIndex, lineup, moveInOrder, reconcileOrder } from '../core/battingOrder';
import { advanceBatter, advanceHalfInning, initialGame, previousBatter, resetGame, retreatHalfInning, setBatter } from '../core/game';
import { createLocalSong, createSpotifySong, findMissingSongs, matchFilesToSongs } from '../core/songs';
import { ImportError, parseTeamExport, prepareImport, serializeTeam, type ImportResult } from '../core/teamTransfer';
import { newId, type IdGenerator } from '../core/ids';
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type GameMode,
  type GameState,
  type Player,
  type Playlist,
  type Song,
  type Team,
  type TeamSettings,
} from '../core/types';
import { mimeFor, readDuration } from '../audio/metadata';
import type { Repository } from '../storage/repository';

export interface AppState {
  ready: boolean;
  teams: Team[];
  songs: Song[];
  /** Ids of songs whose audio is stored on this device. */
  audioIds: ReadonlySet<string>;
  game: GameState;
  settings: AppSettings;
  /** Set when saving failed (storage full / blocked) so the UI can warn. */
  storageError: string | null;
}

export interface StoreOptions {
  settings?: AppSettings;
  saveSettings?: (s: AppSettings) => void;
  id?: IdGenerator;
  /** Reads a file's duration; injectable for tests. */
  readDuration?: (b: Blob) => Promise<number | undefined>;
  /** Called after audio for a song changed so caches can drop stale URLs. */
  onAudioChanged?: (songId: string) => void;
}

/**
 * The app's single source of truth for configuration data and game state. Framework-free:
 * React subscribes via useSyncExternalStore (see hooks.ts).
 */
export class AppStore {
  private state: AppState;
  private listeners = new Set<() => void>();
  private id: IdGenerator;

  constructor(
    private repo: Repository,
    private opts: StoreOptions = {},
  ) {
    this.id = opts.id ?? newId;
    this.state = {
      ready: false,
      teams: [],
      songs: [],
      audioIds: new Set(),
      game: initialGame(null),
      settings: opts.settings ?? { ...DEFAULT_APP_SETTINGS },
      storageError: null,
    };
  }

  // ── subscription ────────────────────────────────────────────────────────────
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getState = (): AppState => this.state;

  private set(patch: Partial<AppState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private persist(p: Promise<unknown>) {
    p.catch((e: unknown) => this.set({ storageError: e instanceof Error ? e.message : 'Could not save data on this device.' }));
  }

  // ── lifecycle ───────────────────────────────────────────────────────────────
  async init(): Promise<void> {
    try {
      const data = await this.repo.loadAll();
      const settings = this.state.settings;
      const active = data.teams.find((t) => t.id === settings.activeTeamId) ?? data.teams[0];
      const game =
        data.game && data.game.teamId === active?.id ? data.game : initialGame(active?.id ?? null);
      this.set({
        ready: true,
        teams: data.teams.map(reconcileOrder),
        songs: data.songs,
        audioIds: new Set(data.audioIds),
        game: { ...game, batterIndex: clampIndex(active ? lineup(active).length : 0, game.batterIndex) },
        settings: { ...settings, activeTeamId: active?.id ?? null },
      });
    } catch {
      this.set({ ready: true, storageError: 'Saved data could not be loaded. Changes may not be kept.' });
    }
  }

  // ── selectors ───────────────────────────────────────────────────────────────
  get activeTeam(): Team | undefined {
    return this.state.teams.find((t) => t.id === this.state.settings.activeTeamId);
  }
  song = (id: string | null | undefined): Song | undefined => (id ? this.state.songs.find((s) => s.id === id) : undefined);
  missingSongs(team: Team | undefined = this.activeTeam): Song[] {
    return team ? findMissingSongs(team, this.state.songs, this.state.audioIds) : [];
  }

  // ── settings ────────────────────────────────────────────────────────────────
  updateSettings(patch: Partial<AppSettings>) {
    const settings = { ...this.state.settings, ...patch };
    this.set({ settings });
    this.opts.saveSettings?.(settings);
  }

  // ── teams ───────────────────────────────────────────────────────────────────
  private saveTeams(teams: Team[], changed: Team | undefined) {
    this.set({ teams });
    if (changed) this.persist(this.repo.saveTeam(changed));
  }

  createTeam(name: string): Team {
    const team = createTeam(name, this.id);
    this.saveTeams([...this.state.teams, team], team);
    this.selectTeam(team.id);
    return team;
  }

  /** Replace a team wholesale (editors build the new value with the pure helpers in core/teams). */
  updateTeam(team: Team) {
    const next = reconcileOrder(team);
    this.saveTeams(this.state.teams.map((t) => (t.id === next.id ? next : t)), next);
    if (this.state.game.teamId === next.id) {
      this.setGame({ batterIndex: clampIndex(lineup(next).length, this.state.game.batterIndex) });
    }
  }

  private mutateActive(fn: (t: Team) => Team) {
    const t = this.activeTeam;
    if (t) this.updateTeam(fn(t));
  }

  updateTeamSettings(patch: Partial<TeamSettings>) {
    this.mutateActive((t) => ({ ...t, settings: { ...t.settings, ...patch } }));
  }

  renameTeam(id: string, name: string) {
    const t = this.state.teams.find((x) => x.id === id);
    if (t && name.trim()) this.updateTeam({ ...t, name: name.trim() });
  }

  duplicateTeam(id: string): Team | undefined {
    const t = this.state.teams.find((x) => x.id === id);
    if (!t) return;
    const copy = duplicateTeam(t, this.id);
    this.saveTeams([...this.state.teams, copy], copy);
    return copy;
  }

  deleteTeam(id: string) {
    const teams = this.state.teams.filter((t) => t.id !== id);
    this.set({ teams });
    this.persist(this.repo.deleteTeam(id));
    if (this.state.settings.activeTeamId === id) this.selectTeam(teams[0]?.id ?? null);
  }

  selectTeam(id: string | null) {
    this.updateSettings({ activeTeamId: id });
    this.setGame({ ...initialGame(id), mode: this.state.game.mode });
  }

  // ── players & batting order ─────────────────────────────────────────────────
  savePlayer(player: Player | (Partial<Player> & { name: string })): Player | undefined {
    const t = this.activeTeam;
    if (!t) return;
    if ('id' in player && player.id && t.players.some((p) => p.id === player.id)) {
      this.updateTeam(updatePlayer(t, player as Player));
      return player as Player;
    }
    const created = createPlayer(player, this.id);
    this.updateTeam(addPlayer(t, created));
    return created;
  }

  removePlayer(id: string) {
    this.mutateActive((t) => removePlayer(t, id));
  }

  setBattingOrder(order: string[]) {
    this.mutateActive((t) => ({ ...t, battingOrder: order }));
  }

  /** Drag-and-drop: move the batter at `from` to position `to`. */
  reorderBatter(from: number, to: number) {
    this.mutateActive((t) => ({ ...t, battingOrder: moveInOrder(t.battingOrder, from, to) }));
  }

  moveBatter(index: number, delta: number) {
    this.mutateActive((t) => ({ ...t, battingOrder: moveInOrder(t.battingOrder, index, index + delta) }));
  }

  /** Adds/removes a player from the batting order (bench ↔ lineup). */
  setInLineup(playerId: string, inLineup: boolean) {
    this.mutateActive((t) => {
      const without = t.battingOrder.filter((x) => x !== playerId);
      return { ...t, battingOrder: inLineup ? [...without, playerId] : without };
    });
  }

  assignWalkUp(playerId: string, songId: string | null) {
    this.mutateActive((t) => assignWalkUp(t, playerId, songId));
  }

  // ── songs ───────────────────────────────────────────────────────────────────
  private async storeAudio(song: Song, file: Blob) {
    const blob = new Blob([await file.arrayBuffer()], { type: mimeFor({ name: song.filename, type: file.type }) });
    await this.repo.putAudio(song.id, blob);
    this.opts.onAudioChanged?.(song.id);
    this.set({ audioIds: new Set([...this.state.audioIds, song.id]) });
  }

  /** Imports audio files into the library (copying them into IndexedDB). Existing identical files are reused. */
  async addLocalSongs(files: File[], extra: Partial<Song> = {}): Promise<Song[]> {
    const out: Song[] = [];
    for (const file of files) {
      const dupe = this.state.songs.find((s) => s.sourceType === 'local' && s.filename === file.name && s.size === file.size);
      if (dupe) {
        if (!this.state.audioIds.has(dupe.id)) await this.storeAudio(dupe, file);
        out.push(dupe);
        continue;
      }
      const duration = await (this.opts.readDuration ?? readDuration)(file);
      const song = createLocalSong({ name: file.name, size: file.size, type: mimeFor(file) }, { duration, ...extra }, this.id);
      await this.storeAudio(song, file);
      this.set({ songs: [...this.state.songs, song] });
      this.persist(this.repo.saveSong(song));
      out.push(song);
    }
    return out;
  }

  addSpotifySong(name: string, uriOrUrl: string): Song {
    const song = createSpotifySong(name, uriOrUrl, this.id);
    this.set({ songs: [...this.state.songs, song] });
    this.persist(this.repo.saveSong(song));
    return song;
  }

  updateSong(song: Song) {
    this.set({ songs: this.state.songs.map((s) => (s.id === song.id ? song : s)) });
    this.persist(this.repo.saveSong(song));
  }

  /** Attach a freshly picked file to an existing (e.g. imported, missing) song. */
  async relinkSong(songId: string, file: File) {
    const song = this.song(songId);
    if (!song) return;
    const duration = await (this.opts.readDuration ?? readDuration)(file);
    await this.storeAudio(song, file);
    this.updateSong({ ...song, localReference: song.id, size: file.size, duration: duration ?? song.duration, mimeType: mimeFor(file) });
  }

  /** Bulk re-link: match picked files to the active team's missing songs by file name. */
  async relinkFiles(files: File[]): Promise<{ matched: number; unmatched: string[] }> {
    const pairs = matchFilesToSongs(files, this.missingSongs());
    for (const { file, song } of pairs) await this.relinkSong(song.id, file);
    const matchedFiles = new Set(pairs.map((p) => p.file));
    return { matched: pairs.length, unmatched: files.filter((f) => !matchedFiles.has(f)).map((f) => f.name) };
  }

  async deleteSong(id: string) {
    this.set({
      songs: this.state.songs.filter((s) => s.id !== id),
      audioIds: new Set([...this.state.audioIds].filter((a) => a !== id)),
    });
    for (const t of this.state.teams) {
      const next = detachSong(t, id);
      if (next !== t) this.updateTeam(next);
    }
    this.persist(this.repo.deleteSong(id));
    this.persist(this.repo.deleteAudio(id));
    this.opts.onAudioChanged?.(id);
  }

  // ── playlists ───────────────────────────────────────────────────────────────
  savePlaylist(p: Playlist | { name: string; songIds?: string[] }): Playlist | undefined {
    const t = this.activeTeam;
    if (!t) return;
    if ('id' in p) {
      this.updateTeam({ ...t, defensePlaylists: t.defensePlaylists.map((x) => (x.id === p.id ? p : x)) });
      return p;
    }
    const created = createPlaylist(p.name, p.songIds ?? [], this.id);
    this.updateTeam({ ...t, defensePlaylists: [...t.defensePlaylists, created], activeDefensePlaylistId: t.activeDefensePlaylistId ?? created.id });
    return created;
  }

  deletePlaylist(id: string) {
    this.mutateActive((t) => {
      const rest = t.defensePlaylists.filter((p) => p.id !== id);
      return { ...t, defensePlaylists: rest, activeDefensePlaylistId: t.activeDefensePlaylistId === id ? (rest[0]?.id ?? null) : t.activeDefensePlaylistId };
    });
  }

  setActivePlaylist(id: string | null) {
    this.mutateActive((t) => ({ ...t, activeDefensePlaylistId: id }));
  }

  // ── game ────────────────────────────────────────────────────────────────────
  private setGame(patch: Partial<GameState>) {
    const game = { ...this.state.game, ...patch };
    this.set({ game });
    this.persist(this.repo.saveGame(game));
  }

  private applyGame(fn: (g: GameState, t: Team) => GameState) {
    const t = this.activeTeam;
    if (!t) return;
    const game = fn({ ...this.state.game, teamId: t.id }, t);
    this.set({ game });
    this.persist(this.repo.saveGame(game));
  }

  nextBatter() {
    this.applyGame(advanceBatter);
  }
  previousBatter() {
    this.applyGame(previousBatter);
  }
  setBatterIndex(i: number) {
    this.applyGame((g, t) => setBatter(g, t, i));
  }
  nextHalfInning() {
    this.applyGame((g) => advanceHalfInning(g));
  }
  prevHalfInning() {
    this.applyGame((g) => retreatHalfInning(g));
  }
  setMode(mode: GameMode) {
    this.setGame({ mode });
  }
  resetGame() {
    this.applyGame((g) => resetGame(g));
  }

  // ── import / export ─────────────────────────────────────────────────────────
  exportTeam(id: string = this.state.settings.activeTeamId ?? ''): string | undefined {
    const t = this.state.teams.find((x) => x.id === id);
    return t ? serializeTeam(t, this.state.songs) : undefined;
  }

  /** Throws ImportError (with a friendly message) for bad files. */
  importTeam(text: string): ImportResult {
    const data = parseTeamExport(text);
    const result = prepareImport(data, this.state.songs, this.state.audioIds, this.id);
    this.set({ songs: [...this.state.songs, ...result.newSongs] });
    result.newSongs.forEach((s) => this.persist(this.repo.saveSong(s)));
    this.saveTeams([...this.state.teams, result.team], result.team);
    this.selectTeam(result.team.id);
    return result;
  }

  /** Wipes everything stored by the app (teams, songs, audio, game). */
  async eraseAllData() {
    await this.repo.clearAll();
    this.set({ teams: [], songs: [], audioIds: new Set(), game: initialGame(null) });
    this.updateSettings({ activeTeamId: null });
  }
}

export { ImportError };
