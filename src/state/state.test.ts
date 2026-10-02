import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioManager } from '../audio/AudioManager';
import { lineup } from '../core/battingOrder';
import { MemoryRepository } from '../storage/repository';
import { FakeBackend } from '../testing';
import { PlaybackController } from './playback';
import { AppStore } from './store';
import type { AudioResolver } from '../storage/audioLibrary';

const seq = () => {
  let n = 0;
  return () => `id${++n}`;
};
const fakeFile = (name: string, size = 100) => ({ name, size, type: 'audio/mpeg', arrayBuffer: async () => new ArrayBuffer(size) }) as unknown as File;

async function makeStore() {
  const repo = new MemoryRepository();
  const store = new AppStore(repo, { id: seq(), readDuration: async () => 200 });
  await store.init();
  return { repo, store };
}

describe('AppStore', () => {
  it('creates teams, players and keeps the batting order', async () => {
    const { store, repo } = await makeStore();
    store.createTeam('Del Mar');
    store.savePlayer({ name: 'Jack', number: '1' });
    store.savePlayer({ name: 'Brevan', number: '7' });
    store.savePlayer({ name: 'Luke', number: '3' });
    expect(lineup(store.activeTeam!).map((p) => p.name)).toEqual(['Jack', 'Brevan', 'Luke']);
    store.moveBatter(2, -2);
    expect(lineup(store.activeTeam!).map((p) => p.name)).toEqual(['Luke', 'Jack', 'Brevan']);
    store.setInLineup(store.activeTeam!.players[0].id, false); // bench Jack
    expect(lineup(store.activeTeam!).map((p) => p.name)).toEqual(['Luke', 'Brevan']);
    expect(repo.teams.get(store.activeTeam!.id)?.battingOrder).toHaveLength(2); // persisted
  });

  it('moves through the batting order and wraps; reset restores the start', async () => {
    const { store } = await makeStore();
    store.createTeam('T');
    ['A', 'B', 'C'].forEach((name) => store.savePlayer({ name }));
    store.nextBatter();
    store.nextBatter();
    expect(store.getState().game.batterIndex).toBe(2);
    store.nextBatter();
    expect(store.getState().game.batterIndex).toBe(0);
    store.previousBatter();
    expect(store.getState().game.batterIndex).toBe(2);
    store.nextHalfInning();
    store.nextHalfInning();
    store.nextBatter();
    store.resetGame();
    expect(store.getState().game).toMatchObject({ inning: 1, half: 'top', batterIndex: 0 });
    // reset must not touch configuration
    expect(store.activeTeam!.players).toHaveLength(3);
  });

  it('keeps the batter index valid when the lineup shrinks', async () => {
    const { store } = await makeStore();
    store.createTeam('T');
    ['A', 'B', 'C'].forEach((name) => store.savePlayer({ name }));
    store.setBatterIndex(2);
    store.removePlayer(store.activeTeam!.players[2].id);
    expect(store.getState().game.batterIndex).toBe(1);
  });

  it('imports audio, assigns songs, and detects missing audio after a team import', async () => {
    const { store } = await makeStore();
    store.createTeam('Del Mar');
    const p = store.savePlayer({ name: 'Brevan', number: '7' })!;
    const [song] = await store.addLocalSongs([fakeFile('Enter Sandman.mp3', 500)]);
    expect(store.getState().audioIds.has(song.id)).toBe(true);
    expect(song.duration).toBe(200);
    store.assignWalkUp(p.id, song.id);
    expect(store.missingSongs()).toEqual([]);

    const exported = store.exportTeam()!;
    // a second device with no audio
    const other = await makeStore();
    const result = other.store.importTeam(exported);
    expect(result.missingSongIds).toHaveLength(1);
    expect(other.store.missingSongs().map((s) => s.filename)).toEqual(['Enter Sandman.mp3']);

    const outcome = await other.store.relinkFiles([fakeFile('enter sandman.mp3', 500), fakeFile('nope.mp3')]);
    expect(outcome).toEqual({ matched: 1, unmatched: ['nope.mp3'] });
    expect(other.store.missingSongs()).toEqual([]);
  });

  it('does not duplicate a file imported twice', async () => {
    const { store } = await makeStore();
    await store.addLocalSongs([fakeFile('a.mp3', 10)]);
    await store.addLocalSongs([fakeFile('a.mp3', 10)]);
    expect(store.getState().songs).toHaveLength(1);
  });

  it('deleting a song clears it from players', async () => {
    const { store } = await makeStore();
    store.createTeam('T');
    const p = store.savePlayer({ name: 'A' })!;
    const [song] = await store.addLocalSongs([fakeFile('a.mp3')]);
    store.assignWalkUp(p.id, song.id);
    await store.deleteSong(song.id);
    expect(store.activeTeam!.players[0].walkUpSongId).toBeNull();
    expect(store.getState().audioIds.has(song.id)).toBe(false);
  });

  it('duplicates and deletes teams, selecting a sensible fallback', async () => {
    const { store } = await makeStore();
    const a = store.createTeam('A');
    store.savePlayer({ name: 'X' });
    const copy = store.duplicateTeam(a.id)!;
    expect(copy.players).toHaveLength(1);
    expect(store.getState().teams).toHaveLength(2);
    store.deleteTeam(a.id);
    expect(store.getState().settings.activeTeamId).toBe(copy.id);
    store.deleteTeam(copy.id);
    expect(store.getState().settings.activeTeamId).toBeNull();
  });

  it('restores everything from storage on init', async () => {
    const { store, repo } = await makeStore();
    store.createTeam('Persisted');
    store.savePlayer({ name: 'A' });
    store.nextBatter();
    await new Promise((r) => setTimeout(r, 0));
    const again = new AppStore(repo, { settings: store.getState().settings });
    await again.init();
    expect(again.activeTeam?.name).toBe('Persisted');
    expect(again.getState().game.teamId).toBe(again.activeTeam?.id);
  });

  it('erase all wipes data', async () => {
    const { store } = await makeStore();
    store.createTeam('A');
    await store.eraseAllData();
    expect(store.getState().teams).toEqual([]);
  });
});

describe('PlaybackController (walk-ups)', () => {
  let backend: FakeBackend;
  let audio: AudioManager;
  let pc: PlaybackController;
  const available = new Set(['a', 'b']);
  const resolver: AudioResolver = {
    peek: (id) => (available.has(id) ? `blob:${id}` : null),
    get: async (id) => (available.has(id) ? `blob:${id}` : null),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    backend = new FakeBackend();
    audio = new AudioManager(backend);
    pc = new PlaybackController(audio, resolver);
  });
  afterEach(() => vi.useRealTimers());

  const settle = () => vi.advanceTimersByTimeAsync(0);

  it('plays a clip, stops itself at the end and reports it finished', async () => {
    const finished: string[] = [];
    pc.onWalkUpFinished((p) => finished.push(p));
    pc.playWalkUp({ playerId: 'p1', songId: 'a', title: 'A', start: 5, end: 10 });
    await settle();
    expect(pc.getSnapshot().audio).toMatchObject({ status: 'playing', track: { key: 'a', ref: 'p1' } });
    backend.currentTime = 10;
    vi.advanceTimersByTime(100);
    expect(pc.getSnapshot().audio.status).toBe('idle');
    expect(finished).toEqual(['p1']);
  });

  it('tapping another player replaces the song (never two at once) and a stop is not "finished"', async () => {
    const finished: string[] = [];
    pc.onWalkUpFinished((p) => finished.push(p));
    pc.playWalkUp({ playerId: 'p1', songId: 'a', title: 'A', start: 0, end: 10 });
    await settle();
    pc.playWalkUp({ playerId: 'p2', songId: 'b', title: 'B', start: 0, end: 10 });
    await settle();
    expect(pc.getSnapshot().audio.track).toMatchObject({ key: 'b', ref: 'p2' });
    expect(backend.url).toBe('blob:b');
    pc.stopAll();
    expect(pc.getSnapshot().audio.status).toBe('idle');
    expect(finished).toEqual([]);
  });

  it('pauses and resumes', async () => {
    pc.playWalkUp({ playerId: 'p1', songId: 'a', title: 'A', start: 0, end: 10 });
    await settle();
    pc.pause();
    expect(pc.getSnapshot().audio.status).toBe('paused');
    pc.resume();
    await settle();
    expect(pc.getSnapshot().audio.status).toBe('playing');
  });

  it('reports a missing walk-up song instead of failing silently', async () => {
    pc.playWalkUp({ playerId: 'p1', songId: 'x', title: 'X', start: 0, end: 10 });
    await settle();
    expect(pc.getSnapshot().audio).toMatchObject({ status: 'error', error: 'missing' });
  });

  it('starts synchronously from cached audio (needed for Safari taps)', () => {
    pc.playWalkUp({ playerId: 'p1', songId: 'a', title: 'A', start: 0, end: 10 });
    expect(backend.playCalls).toBe(1);
  });

  it('previews a whole song without triggering auto-advance', async () => {
    const finished: string[] = [];
    pc.onWalkUpFinished((p) => finished.push(p));
    pc.previewSong({ id: 'a', name: 'A', filename: 'a.mp3', sourceType: 'local' });
    await settle();
    backend.emit('ended');
    expect(finished).toEqual(['preview']); // ref 'preview' never matches the current batter
  });
});

describe('PlaybackController with an announcer', () => {
  it('passes the decoded announcer to the audio manager and attaches it late if it was not decoded yet', async () => {
    vi.useFakeTimers();
    const backend = new FakeBackend();
    const calls: string[] = [];
    const audio = new AudioManager(backend, {
      overlay: {
        prepare: (n) => void calls.push(`prepare:${n}`),
        canAttachLate: () => true,
        start: (o, e) => void calls.push(`start:${o.delay}@${e}`),
        fadeOut() {},
        fadeNow: () => true,
        pause() {},
        resume() {},
        stop() {},
      },
    });
    const decoded = new Map<string, { clip: unknown; duration: number }>();
    const announcers = {
      peek: (id: string) => decoded.get(id) ?? null,
      get: async (id: string) => {
        const d = { clip: {}, duration: 3 };
        decoded.set(id, d);
        return d;
      },
    };
    const resolver = { peek: () => 'blob:m', get: async () => 'blob:m' };
    const pc = new PlaybackController(audio, resolver, () => undefined, { announcers });
    const req = { playerId: 'p', songId: 'm', title: 'M', start: 0, end: 20, announcer: { songId: 'v', delay: 2, duck: 0.3, gain: 2.5 } };

    pc.playWalkUp(req); // announcer not decoded yet → music starts at once, announcer joins when ready
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toContain('prepare:false');
    expect(calls.filter((c) => c.startsWith('start'))).toEqual(['start:2@0']);

    calls.length = 0;
    pc.playWalkUp(req); // now cached → included in the very first start
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toContain('prepare:true');
    expect(calls.filter((c) => c.startsWith('start'))).toEqual(['start:2@0']);
    vi.useRealTimers();
  });
});
