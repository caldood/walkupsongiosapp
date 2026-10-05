import type { ID, Player, Team } from './types';

export function playerById(team: Team, id: ID | undefined | null): Player | undefined {
  return id ? team.players.find((p) => p.id === id) : undefined;
}

/** Who is batting today, in order: the batting order minus benched players (and ids that no longer exist). */
export function lineup(team: Team): Player[] {
  return team.battingOrder.map((id) => playerById(team, id)).filter((p): p is Player => !!p && !p.benched);
}

/** Players not batting today: benched ones, plus anyone who was never put in the order. */
export function benchPlayers(team: Team): Player[] {
  const inOrder = new Set(team.battingOrder);
  return team.players.filter((p) => p.benched || !inOrder.has(p.id));
}

/**
 * Bench a player or put them back. A benched player stays in `battingOrder`, so bringing them back
 * restores their old slot; a player who was never in the order is added at the bottom.
 */
export function setPresent(team: Team, playerId: ID, present: boolean): Team {
  if (!team.players.some((p) => p.id === playerId)) return team;
  const players = team.players.map((p) => (p.id === playerId ? { ...p, benched: !present } : p));
  const battingOrder = present && !team.battingOrder.includes(playerId) ? [...team.battingOrder, playerId] : team.battingOrder;
  return { ...team, players, battingOrder };
}

export function setAllPresent(team: Team): Team {
  let t: Team = { ...team, players: team.players.map((p) => ({ ...p, benched: false })) };
  for (const p of t.players) if (!t.battingOrder.includes(p.id)) t = { ...t, battingOrder: [...t.battingOrder, p.id] };
  return t;
}

/**
 * New `battingOrder` after dragging the batter at lineup position `from` to lineup position `to`.
 * Positions refer to the visible lineup; benched players keep their place around it.
 */
export function reorderLineup(team: Team, from: number, to: number): ID[] {
  const ids = lineup(team).map((p) => p.id);
  if (from < 0 || from >= ids.length) return team.battingOrder;
  const target = ids[Math.max(0, Math.min(ids.length - 1, to))];
  return moveInOrder(team.battingOrder, team.battingOrder.indexOf(ids[from]), team.battingOrder.indexOf(target));
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
