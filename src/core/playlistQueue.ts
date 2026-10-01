import type { ID } from './types';

/** An ordered play queue over a playlist's song ids. Pure: shuffle takes an injected RNG. */
export interface Queue {
  songIds: ID[];
  /** Indexes into songIds in play order (a permutation when shuffled). */
  order: number[];
  /** Position within `order`. */
  pos: number;
}

export type Rng = () => number;

export function shuffled<T>(items: T[], rng: Rng = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** `startSongId` (if present) is played first, even when shuffled. */
export function buildQueue(songIds: ID[], opts: { shuffle: boolean; startSongId?: ID; rng?: Rng }): Queue {
  const idx = songIds.map((_, i) => i);
  let order = opts.shuffle ? shuffled(idx, opts.rng) : idx;
  const startIdx = opts.startSongId ? songIds.indexOf(opts.startSongId) : -1;
  let pos = 0;
  if (startIdx >= 0) {
    if (opts.shuffle) order = [startIdx, ...order.filter((i) => i !== startIdx)];
    else pos = startIdx;
  }
  return { songIds, order, pos };
}

export function currentSongId(q: Queue): ID | undefined {
  return q.songIds[q.order[q.pos]];
}

/** Next queue (or null when the playlist is over and repeat is off). */
export function nextInQueue(q: Queue, repeat: boolean, opts: { shuffle?: boolean; rng?: Rng } = {}): Queue | null {
  if (q.order.length === 0) return null;
  if (q.pos + 1 < q.order.length) return { ...q, pos: q.pos + 1 };
  if (!repeat) return null;
  if (opts.shuffle) {
    // New shuffled pass, but avoid repeating the song that just played back-to-back.
    const last = q.order[q.pos];
    let order = shuffled(q.order, opts.rng);
    if (order.length > 1 && order[0] === last) order = [...order.slice(1), order[0]];
    return { ...q, order, pos: 0 };
  }
  return { ...q, pos: 0 };
}

/** Previous queue; stays on the first song at the start unless repeating. */
export function prevInQueue(q: Queue, repeat: boolean): Queue {
  if (q.pos > 0) return { ...q, pos: q.pos - 1 };
  return repeat ? { ...q, pos: q.order.length - 1 } : q;
}

export function upcoming(q: Queue, count = 3): ID[] {
  return q.order.slice(q.pos + 1, q.pos + 1 + count).map((i) => q.songIds[i]);
}
