import { describe, expect, it } from 'vitest';
import { addToOrder, benchPlayers, clampIndex, currentBatter, lineup, moveInOrder, nextIndex, prevIndex, reconcileOrder, upNext } from './battingOrder';
import { describeClip, fitAnnouncer, resolveClip } from './clip';
import { formatTime, parseTime } from './format';
import { advanceBatter, advanceHalfInning, initialGame, previousBatter, resetGame, retreatHalfInning, setBatter } from './game';
import { buildQueue, currentSongId, nextInQueue, prevInQueue, upcoming } from './playlistQueue';
import { findMissingSongs, isPlayable, matchFilesToSongs, songIdsUsedBy, spotifyOpenUrl, createLocalSong, createSpotifySong } from './songs';
import { addPlayer, assignWalkUp, createPlayer, createPlaylist, createTeam, detachSong, duplicateTeam, removePlayer } from './teams';
import { ImportError, exportTeam, parseTeamExport, prepareImport, serializeTeam } from './teamTransfer';
import type { GameState, Team } from './types';

const seqId = () => {
  let n = 0;
  return () => `id${++n}`;
};

function sampleTeam(): Team {
  const id = seqId();
  let t = createTeam('Del Mar', id);
  for (const [name, number] of [['Jack', '1'], ['Brevan', '7'], ['Luke', '3'], ['Ethan', '9']]) {
    t = addPlayer(t, createPlayer({ name, number }, id));
  }
  return t;
}

describe('batting order', () => {
  it('adds players to the bottom of the order', () => {
    const t = sampleTeam();
    expect(lineup(t).map((p) => p.name)).toEqual(['Jack', 'Brevan', 'Luke', 'Ethan']);
  });
  it('reorders with moveInOrder and clamps', () => {
    expect(moveInOrder([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    expect(moveInOrder([1, 2, 3], 2, 99)).toEqual([1, 2, 3]);
    expect(moveInOrder([1, 2, 3], 1, -5)).toEqual([2, 1, 3]);
    expect(moveInOrder([1, 2, 3], 9, 0)).toEqual([1, 2, 3]);
  });
  it('wraps next / previous', () => {
    expect(nextIndex(4, 3)).toBe(0);
    expect(prevIndex(4, 0)).toBe(3);
    expect(nextIndex(0, 0)).toBe(0);
    expect(clampIndex(3, 7)).toBe(2);
  });
  it('lists up-next batters, wrapping and excluding the current batter', () => {
    const t = sampleTeam();
    expect(upNext(t, 2, 3).map((p) => p.name)).toEqual(['Ethan', 'Jack', 'Brevan']);
    expect(upNext(t, 0, 10).map((p) => p.name)).toEqual(['Brevan', 'Luke', 'Ethan']);
  });
  it('keeps bench players out of the lineup', () => {
    const t = sampleTeam();
    const benched = { ...t, battingOrder: t.battingOrder.slice(0, 2) };
    expect(benchPlayers(benched).map((p) => p.name)).toEqual(['Luke', 'Ethan']);
    expect(addToOrder(benched.battingOrder, benched.players[2].id)).toHaveLength(3);
    expect(addToOrder(benched.battingOrder, benched.players[0].id)).toHaveLength(2);
  });
  it('reconciles stale and duplicate ids', () => {
    const t = sampleTeam();
    const messy = { ...t, battingOrder: [...t.battingOrder, 'ghost', t.battingOrder[0]] };
    expect(reconcileOrder(messy).battingOrder).toEqual(t.battingOrder);
  });
  it('removing a player removes them from the order', () => {
    const t = sampleTeam();
    const r = removePlayer(t, t.players[1].id);
    expect(lineup(r).map((p) => p.name)).toEqual(['Jack', 'Luke', 'Ethan']);
  });
  it('currentBatter is safe on empty lineups', () => {
    expect(currentBatter(createTeam('x'), 0)).toBeUndefined();
  });
});

describe('player / song assignment', () => {
  it('assigns a walk-up and resets the clip when the song changes', () => {
    let t = sampleTeam();
    const p = t.players[1];
    t = assignWalkUp(t, p.id, 's1');
    t = { ...t, players: t.players.map((x) => (x.id === p.id ? { ...x, clipStart: 42, clipEnd: 62 } : x)) };
    const same = assignWalkUp(t, p.id, 's1');
    expect(same.players[1].clipStart).toBe(42); // unchanged song keeps its clip
    const changed = assignWalkUp(t, p.id, 's2');
    expect(changed.players[1]).toMatchObject({ walkUpSongId: 's2', clipStart: 0, clipEnd: null });
  });
  it('detaches a deleted song everywhere', () => {
    let t = sampleTeam();
    t = assignWalkUp(t, t.players[0].id, 's1');
    t = { ...t, defensePlaylists: [createPlaylist('Warmup', ['s1', 's2'])] };
    const d = detachSong(t, 's1');
    expect(d.players[0].walkUpSongId).toBeNull();
    expect(d.defensePlaylists[0].songIds).toEqual(['s2']);
  });
  it('duplicates a team with fresh, consistent ids', () => {
    let t = sampleTeam();
    t = { ...t, defensePlaylists: [createPlaylist('W', ['s1'])] };
    t.activeDefensePlaylistId = t.defensePlaylists[0].id;
    const c = duplicateTeam(t);
    expect(c.id).not.toBe(t.id);
    expect(c.name).toBe('Del Mar (copy)');
    expect(lineup(c).map((p) => p.name)).toEqual(lineup(t).map((p) => p.name));
    expect(c.players.every((p) => !t.players.some((o) => o.id === p.id))).toBe(true);
    expect(c.activeDefensePlaylistId).toBe(c.defensePlaylists[0].id);
    expect(c.activeDefensePlaylistId).not.toBe(t.activeDefensePlaylistId);
  });
});

describe('clip timing', () => {
  it('uses the default duration when no end is set', () => {
    expect(resolveClip({ clipStart: 42, clipEnd: null }, undefined, 15)).toEqual({ start: 42, end: 57, duration: 15 });
  });
  it('honours an explicit end', () => {
    expect(resolveClip({ clipStart: 42, clipEnd: 62 }, { duration: 200 }, 15)).toEqual({ start: 42, end: 62, duration: 20 });
  });
  it('ignores an end before the start', () => {
    expect(resolveClip({ clipStart: 30, clipEnd: 10 }, undefined, 10).end).toBe(40);
  });
  it('clamps to the song length', () => {
    expect(resolveClip({ clipStart: 0, clipEnd: 999 }, { duration: 100 }, 15).end).toBe(100);
    const near = resolveClip({ clipStart: 99, clipEnd: null }, { duration: 100 }, 15);
    expect(near.start).toBe(99);
    expect(near.end).toBe(100);
    const past = resolveClip({ clipStart: 500, clipEnd: null }, { duration: 100 }, 15);
    expect(past.start).toBe(99);
  });
  it('never returns a negative start', () => {
    expect(resolveClip({ clipStart: -5, clipEnd: null }, undefined, 10).start).toBe(0);
  });
  it('formats and parses times', () => {
    expect(formatTime(42)).toBe('0:42');
    expect(formatTime(62.9)).toBe('1:02');
    expect(parseTime('0:42')).toBe(42);
    expect(parseTime('1:02.5')).toBe(62.5);
    expect(parseTime('90')).toBe(90);
    expect(parseTime('1:75')).toBeNull();
    expect(parseTime('abc')).toBeNull();
    expect(describeClip({ start: 42, end: 62, duration: 20 }, formatTime)).toBe('0:42–1:02');
  });
});

describe('game state', () => {
  it('advances and wraps the batter, and goes back', () => {
    const t = sampleTeam();
    let g = initialGame(t.id);
    g = advanceBatter(g, t);
    expect(g.batterIndex).toBe(1);
    g = setBatter(g, t, 3);
    g = advanceBatter(g, t);
    expect(g.batterIndex).toBe(0);
    expect(previousBatter(g, t).batterIndex).toBe(3);
  });
  it('tracks half innings', () => {
    let g = initialGame('t');
    g = advanceHalfInning(g);
    expect(g).toMatchObject({ inning: 1, half: 'bottom' });
    g = advanceHalfInning(g);
    expect(g).toMatchObject({ inning: 2, half: 'top' });
    expect(retreatHalfInning(g)).toMatchObject({ inning: 1, half: 'bottom' });
    expect(retreatHalfInning(initialGame('t'))).toMatchObject({ inning: 1, half: 'top' });
  });
  it('reset returns to the start but keeps team and mode', () => {
    const t = sampleTeam();
    let g: GameState = { ...initialGame(t.id), inning: 4, half: 'bottom', batterIndex: 3, mode: 'defense' };
    g = resetGame(g);
    expect(g).toEqual({ teamId: t.id, inning: 1, half: 'top', batterIndex: 0, mode: 'defense' });
  });
});

describe('defense playlist progression', () => {
  const ids = ['a', 'b', 'c'];
  it('plays in order and stops at the end without repeat', () => {
    let q = buildQueue(ids, { shuffle: false });
    expect(currentSongId(q)).toBe('a');
    q = nextInQueue(q, false)!;
    q = nextInQueue(q, false)!;
    expect(currentSongId(q)).toBe('c');
    expect(nextInQueue(q, false)).toBeNull();
  });
  it('wraps with repeat', () => {
    let q = buildQueue(ids, { shuffle: false });
    q = nextInQueue(nextInQueue(q, true)!, true)!;
    expect(currentSongId(nextInQueue(q, true)!)).toBe('a');
  });
  it('goes to previous songs', () => {
    const q = buildQueue(ids, { shuffle: false, startSongId: 'b' });
    expect(currentSongId(prevInQueue(q, false))).toBe('a');
    expect(currentSongId(prevInQueue(prevInQueue(q, false), false))).toBe('a');
    expect(currentSongId(prevInQueue(prevInQueue(q, true), true))).toBe('c');
  });
  it('shuffles deterministically with an RNG and plays each song once per pass', () => {
    let n = 0;
    const rng = () => [0.9, 0.1, 0.5, 0.3, 0.7][n++ % 5];
    const q = buildQueue(['a', 'b', 'c', 'd'], { shuffle: true, rng });
    expect([...q.order].sort()).toEqual([0, 1, 2, 3]);
  });
  it('keeps the chosen start song first when shuffled', () => {
    const q = buildQueue(ids, { shuffle: true, startSongId: 'c', rng: () => 0.5 });
    expect(currentSongId(q)).toBe('c');
    expect(q.order).toHaveLength(3);
  });
  it('does not repeat the same song back-to-back when reshuffling', () => {
    let q = buildQueue(['a', 'b'], { shuffle: true, rng: () => 0 });
    q = { ...q, pos: q.order.length - 1 };
    const last = currentSongId(q);
    const n = nextInQueue(q, true, { shuffle: true, rng: () => 0 })!;
    expect(currentSongId(n)).not.toBe(last);
  });
  it('handles empty queues and lists upcoming songs', () => {
    expect(nextInQueue(buildQueue([], { shuffle: false }), true)).toBeNull();
    expect(upcoming(buildQueue(ids, { shuffle: false }), 5)).toEqual(['b', 'c']);
  });
});

describe('missing songs', () => {
  const file = { name: 'Enter Sandman.mp3', size: 1000, type: 'audio/mpeg' };
  it('reports local songs without audio, ignoring spotify and present audio', () => {
    const id = seqId();
    const local = createLocalSong(file, {}, id);
    const other = createLocalSong({ ...file, name: 'Other.mp3' }, {}, id);
    const spot = createSpotifySong('Thunderstruck', 'spotify:track:abc', id);
    let t = sampleTeam();
    t = assignWalkUp(t, t.players[0].id, local.id);
    t = assignWalkUp(t, t.players[1].id, spot.id);
    t = { ...t, defensePlaylists: [createPlaylist('W', [other.id], id)] };
    const songs = [local, other, spot];
    expect(findMissingSongs(t, songs, new Set()).map((s) => s.name)).toEqual(['Enter Sandman', 'Other']);
    expect(findMissingSongs(t, songs, new Set([local.id])).map((s) => s.name)).toEqual(['Other']);
    expect(isPlayable(local, new Set([local.id]))).toBe(true);
    expect(isPlayable(spot, new Set([spot.id]))).toBe(false);
    expect(isPlayable(undefined, new Set())).toBe(false);
  });
  it('matches picked files to missing songs by filename', () => {
    const id = seqId();
    const a = createLocalSong(file, {}, id);
    const b = createLocalSong({ ...file, name: 'Thunderstruck.m4a' }, {}, id);
    const pairs = matchFilesToSongs([{ name: 'thunderstruck.M4A' }, { name: 'random.mp3' }, { name: 'Enter Sandman.mp3' }], [a, b]);
    expect(pairs.map((p) => p.song.id)).toEqual([b.id, a.id]);
  });
  it('uses size to disambiguate duplicate filenames and matches each song once', () => {
    const id = seqId();
    const a = createLocalSong({ ...file, size: 1 }, {}, id);
    const b = createLocalSong({ ...file, size: 2 }, {}, id);
    const pairs = matchFilesToSongs([{ name: file.name, size: 2 }, { name: file.name, size: 2 }], [a, b]);
    expect(pairs).toHaveLength(2);
    expect(pairs[0].song.id).toBe(b.id);
    expect(pairs[1].song.id).toBe(a.id);
  });
  it('builds Spotify open links', () => {
    expect(spotifyOpenUrl({ spotifyUri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC' })).toBe('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
    expect(spotifyOpenUrl({ spotifyUri: 'https://open.spotify.com/intl-de/track/abc?si=1' })).toBe('https://open.spotify.com/track/abc');
    expect(spotifyOpenUrl({ spotifyUri: 'https://evil.com/https://open.spotify.com/track/abc' })).toBeNull();
    expect(spotifyOpenUrl({ spotifyUri: 'javascript:alert(1)' })).toBeNull();
    expect(spotifyOpenUrl({})).toBeNull();
  });
});

describe('import / export', () => {
  function fixture() {
    const id = seqId();
    const song = createLocalSong({ name: 'Enter Sandman.mp3', size: 1234, type: 'audio/mpeg' }, { duration: 200 }, id);
    const spot = createSpotifySong('Thunderstruck', 'spotify:track:abc', id);
    let t = createTeam('Del Mar', id);
    t = addPlayer(t, createPlayer({ name: 'Brevan', number: '7' }, id));
    t = addPlayer(t, createPlayer({ name: 'Luke', number: '3' }, id));
    t = assignWalkUp(t, t.players[0].id, song.id);
    t = assignWalkUp(t, t.players[1].id, spot.id);
    t = { ...t, players: t.players.map((p, i) => (i === 0 ? { ...p, clipStart: 42, clipEnd: 62 } : p)) };
    t = { ...t, defensePlaylists: [createPlaylist('Warmup', [song.id], id)], settings: { ...t.settings, defaultClipSeconds: 20, autoAdvance: true } };
    t.activeDefensePlaylistId = t.defensePlaylists[0].id;
    return { t, song, spot };
  }

  it('exports team config + only the songs it uses, without audio', () => {
    const { t, song, spot } = fixture();
    const unused = createLocalSong({ name: 'Unused.mp3', size: 1, type: 'audio/mpeg' });
    const data = exportTeam(t, [song, spot, unused]);
    expect(data.songs.map((s) => s.id).sort()).toEqual([song.id, spot.id].sort());
    expect(JSON.stringify(data)).not.toContain('blob');
  });

  it('round-trips through JSON onto a fresh device and flags missing audio', () => {
    const { t, song, spot } = fixture();
    const text = serializeTeam(t, [song, spot]);
    const result = prepareImport(parseTeamExport(text), [], new Set(), seqId());
    expect(result.team.id).not.toBe(t.id);
    expect(result.team.name).toBe('Del Mar');
    expect(result.team.settings).toMatchObject({ defaultClipSeconds: 20, autoAdvance: true });
    const [brevan, luke] = lineup(result.team);
    expect(brevan).toMatchObject({ name: 'Brevan', number: '7', clipStart: 42, clipEnd: 62 });
    expect(luke.name).toBe('Luke');
    const imported = result.newSongs.find((s) => s.id === brevan.walkUpSongId)!;
    expect(imported.filename).toBe('Enter Sandman.mp3');
    expect(result.missingSongIds).toEqual([imported.id]); // spotify isn't "missing audio"
    expect(result.team.defensePlaylists[0].songIds).toEqual([imported.id]);
    expect(result.team.activeDefensePlaylistId).toBe(result.team.defensePlaylists[0].id);
  });

  it('reuses songs already on the device (same filename + size) so audio is found automatically', () => {
    const { t, song, spot } = fixture();
    const existing = createLocalSong({ name: 'Enter Sandman.mp3', size: 1234, type: 'audio/mpeg' }, {}, seqId());
    const result = prepareImport(parseTeamExport(serializeTeam(t, [song, spot])), [existing], new Set([existing.id]), seqId());
    expect(result.newSongs.map((s) => s.name)).toEqual(['Thunderstruck']);
    expect(lineup(result.team)[0].walkUpSongId).toBe(existing.id);
    expect(result.missingSongIds).toEqual([]);
  });

  it('never overwrites: importing twice makes distinct teams', () => {
    const { t, song, spot } = fixture();
    const data = parseTeamExport(serializeTeam(t, [song, spot]));
    const id = seqId();
    const a = prepareImport(data, [], new Set(), id);
    const b = prepareImport(data, a.newSongs, new Set(), id);
    expect(a.team.id).not.toBe(b.team.id);
    expect(b.newSongs).toHaveLength(0);
  });

  it('rejects bad files with friendly errors', () => {
    expect(() => parseTeamExport('nope')).toThrow(ImportError);
    expect(() => parseTeamExport('{"format":"other"}')).toThrow('not a team export');
    expect(() => parseTeamExport(JSON.stringify({ format: 'game-day-music/team', version: 99, team: {} }))).toThrow('newer version');
    expect(() => parseTeamExport(JSON.stringify({ format: 'game-day-music/team', version: 1, team: { players: 'x' } }))).toThrow('incomplete');
  });

  it('tolerates missing optional fields', () => {
    const text = JSON.stringify({
      format: 'game-day-music/team',
      version: 1,
      team: { id: 't', name: 'T', players: [{ id: 'p', name: 'A' }] },
    });
    const parsed = parseTeamExport(text);
    expect(parsed.team.settings.defaultClipSeconds).toBe(15);
    expect(parsed.team.players[0]).toMatchObject({ clipStart: 0, clipEnd: null, number: '' });
    expect(prepareImport(parsed, [], new Set(), seqId()).team.battingOrder).toEqual([]);
  });
});

describe('announcer', () => {
  it('stretches a clip so the announcement is never cut off', () => {
    const clip = { start: 40, end: 50, duration: 10 };
    expect(fitAnnouncer(clip, 2, 3)).toBe(clip); // 2 + 3 + 0.75 fits in 10s
    expect(fitAnnouncer(clip, 8, 4)).toEqual({ start: 40, end: 52.75, duration: 12.75 });
    expect(fitAnnouncer(clip, 2, undefined)).toBe(clip);
  });

  it('counts announcer recordings as songs the team depends on, and clears them when deleted', () => {
    let t = sampleTeam();
    t = { ...t, players: t.players.map((p, i) => (i === 0 ? { ...p, announcerSongId: 'a1', announcerDelay: 3 } : p)) };
    expect(songIdsUsedBy(t)).toContain('a1');
    expect(detachSong(t, 'a1').players[0].announcerSongId).toBeNull();
    const announcer = createLocalSong({ name: 'Jack.wav', size: 5, type: 'audio/wav' }, { role: 'announcer' });
    expect(findMissingSongs({ ...t, players: [{ ...t.players[0], announcerSongId: announcer.id }] }, [announcer], new Set()).map((s) => s.id)).toEqual([announcer.id]);
  });

  it('survives export / import with the announcer, delay, role and ducking level', () => {
    const id = seqId();
    const music = createLocalSong({ name: 'Song.mp3', size: 10, type: 'audio/mpeg' }, {}, id);
    const voice = createLocalSong({ name: 'Brevan.wav', size: 3, type: 'audio/wav' }, { role: 'announcer', duration: 3.2 }, id);
    let t = createTeam('T', id);
    t = addPlayer(t, createPlayer({ name: 'Brevan', walkUpSongId: music.id, announcerSongId: voice.id, announcerDelay: 2.5 }, id));
    t = { ...t, settings: { ...t.settings, announcerDuck: 0.2 } };
    const r = prepareImport(parseTeamExport(serializeTeam(t, [music, voice])), [], new Set(), seqId());
    const p = r.team.players[0];
    const voiceImported = r.newSongs.find((s) => s.id === p.announcerSongId)!;
    expect(voiceImported).toMatchObject({ role: 'announcer', filename: 'Brevan.wav' });
    expect(p.announcerDelay).toBe(2.5);
    expect(r.team.settings.announcerDuck).toBe(0.2);
    expect(r.missingSongIds).toHaveLength(2);
  });
});
