import { useSyncExternalStore } from 'react';
import { playback, store } from './app';

export const useAppState = () => useSyncExternalStore(store.subscribe, store.getState);
export const usePlayback = () => useSyncExternalStore(playback.subscribe, playback.getSnapshot);

export function useActiveTeam() {
  const s = useAppState();
  return s.teams.find((t) => t.id === s.settings.activeTeamId);
}
