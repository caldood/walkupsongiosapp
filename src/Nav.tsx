import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Screen =
  | { name: 'home' }
  | { name: 'game' }
  | { name: 'teams' }
  | { name: 'team-edit'; teamId: string }
  | { name: 'players' }
  | { name: 'player-edit'; playerId?: string }
  | { name: 'songs' }
  | { name: 'playlists' }
  | { name: 'setup' }
  | { name: 'settings' }
  | { name: 'transfer' };

interface NavApi {
  screen: Screen;
  go(s: Screen): void;
  back(): void;
  /** Go straight home (clears the stack). */
  home(): void;
}

const NavContext = createContext<NavApi | null>(null);

/**
 * Tiny stack navigator synced with the History API so the iOS edge-swipe / back button works,
 * including in the installed (standalone) web app.
 */
export function NavProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Screen[]>([{ name: 'home' }]);

  useEffect(() => {
    const onPop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = useCallback((s: Screen) => {
    history.pushState({ n: Date.now() }, '');
    setStack((st) => [...st, s]);
  }, []);
  const back = useCallback(() => {
    if (stack.length > 1) history.back();
  }, [stack.length]);
  const home = useCallback(() => {
    const extra = stack.length - 1;
    if (extra > 0) history.go(-extra);
  }, [stack.length]);

  const api = useMemo<NavApi>(() => ({ screen: stack[stack.length - 1], go, back, home }), [stack, go, back, home]);
  return <NavContext.Provider value={api}>{children}</NavContext.Provider>;
}

export function useNav(): NavApi {
  const n = useContext(NavContext);
  if (!n) throw new Error('useNav outside NavProvider');
  return n;
}
