import { clampIndex, lineup, nextIndex, prevIndex } from './battingOrder';
import type { GameState, Team } from './types';

export const initialGame = (teamId: string | null = null): GameState => ({
  teamId,
  inning: 1,
  half: 'top',
  batterIndex: 0,
  mode: 'walkup',
});

export function advanceBatter(game: GameState, team: Team): GameState {
  return { ...game, batterIndex: nextIndex(lineup(team).length, game.batterIndex) };
}

export function previousBatter(game: GameState, team: Team): GameState {
  return { ...game, batterIndex: prevIndex(lineup(team).length, game.batterIndex) };
}

export function setBatter(game: GameState, team: Team, index: number): GameState {
  return { ...game, batterIndex: clampIndex(lineup(team).length, index) };
}

/** top 1 -> bottom 1 -> top 2 … (manual; the app never infers outs). */
export function advanceHalfInning(game: GameState): GameState {
  return game.half === 'top' ? { ...game, half: 'bottom' } : { ...game, half: 'top', inning: game.inning + 1 };
}

export function retreatHalfInning(game: GameState): GameState {
  if (game.half === 'bottom') return { ...game, half: 'top' };
  return game.inning > 1 ? { ...game, half: 'bottom', inning: game.inning - 1 } : game;
}

/** Back to the start of the game for the same team (does not touch team configuration). */
export function resetGame(game: GameState): GameState {
  return { ...initialGame(game.teamId), mode: game.mode };
}
