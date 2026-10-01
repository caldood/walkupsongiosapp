import type { ID, Player, Team } from './types';

export function playerById(team: Team, id: ID | undefined | null): Player | undefined {
  return id ? team.players.find((p) => p.id === id) : undefined;
}

/** Batting order as Player objects, dropping any ids that no longer exist. */
export function lineup(team: Team): Player[] {
  return team.battingOrder.map((id) => playerById(team, id)).filter((p): p is Player => !!p);
}

export function benchPlayers(team: Team): Player[] {
  const inOrder = new Set(team.battingOrder);
  return team.players.filter((p) => !inOrder.has(p.id));
}

/** Removes stale ids and duplicates. */
export function reconcileOrder(team: Team): Team {
  const valid = new Set(team.players.map((p) => p.id));
  const seen = new Set<ID>();
  const order = team.battingOrder.filter((id) => valid.has(id) && !seen.has(id) && !!seen.add(id));
  return order.length === team.battingOrder.length ? team : { ...team, battingOrder: order };
}

export function addToOrder(order: ID[], id: ID): ID[] {
  return order.includes(id) ? order : [...order, id];
}

export function removeFromOrder(order: ID[], id: ID): ID[] {
  return order.filter((x) => x !== id);
}

/** Moves the item at `from` to position `to` (both clamped). */
export function moveInOrder<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return list;
  const target = Math.max(0, Math.min(list.length - 1, to));
  if (target === from) return list;
  const copy = list.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(target, 0, item);
  return copy;
}

export function nextIndex(length: number, index: number): number {
  return length === 0 ? 0 : (index + 1) % length;
}

export function prevIndex(length: number, index: number): number {
  return length === 0 ? 0 : (index - 1 + length) % length;
}

/** Keeps a batter index valid after the lineup changes size. */
export function clampIndex(length: number, index: number): number {
  return length === 0 ? 0 : Math.max(0, Math.min(length - 1, index));
}

export function currentBatter(team: Team, index: number): Player | undefined {
  const l = lineup(team);
  return l.length ? l[clampIndex(l.length, index)] : undefined;
}

/** The next `count` batters after `index`, wrapping around, never including the current batter. */
export function upNext(team: Team, index: number, count = 3): Player[] {
  const l = lineup(team);
  const out: Player[] = [];
  for (let i = 1; i <= Math.min(count, l.length - 1); i++) out.push(l[(clampIndex(l.length, index) + i) % l.length]);
  return out;
}
