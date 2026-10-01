import { useEffect } from 'react';
import { bindMediaSession, updateMediaSession } from './audio/platform';
import { audioManager, backend, playback, store } from './state/app';
import { installAutoAdvance, preloadBatters } from './state/gameActions';
import { useAppState } from './state/hooks';
import { NavProvider, useNav } from './Nav';
import { GameSetup } from './screens/GameSetup';
import { GameShell } from './screens/GameShell';
import { Home } from './screens/Home';
import { MusicLibrary } from './screens/MusicLibrary';
import { PlayerEditor } from './screens/PlayerEditor';
import { Players } from './screens/Players';
import { PlaylistEditor } from './screens/PlaylistEditor';
import { Settings } from './screens/Settings';
import { TeamEditor, TeamSelector } from './screens/TeamSelector';
import { Transfer } from './screens/Transfer';

function Router() {
  const { screen } = useNav();
  switch (screen.name) {
    case 'home':
      return <Home />;
    case 'game':
      return <GameShell />;
    case 'teams':
      return <TeamSelector />;
    case 'team-edit':
      return <TeamEditor teamId={screen.teamId} />;
    case 'players':
      return <Players />;
    case 'player-edit':
      return <PlayerEditor key={screen.playerId ?? 'new'} playerId={screen.playerId} />;
    case 'songs':
      return <MusicLibrary />;
    case 'playlists':
      return <PlaylistEditor />;
    case 'setup':
      return <GameSetup />;
    case 'settings':
      return <Settings />;
    case 'transfer':
      return <Transfer />;
  }
}

export function App() {
  const { ready, settings, teams, audioIds } = useAppState();

  useEffect(() => {
    void store.init();
    const offAuto = installAutoAdvance();
    const offMedia = audioManager.subscribe(updateMediaSession);
    bindMediaSession({ play: () => playback.resume(), pause: () => playback.pause() });
    // iOS: the audio element must be "unlocked" by a real tap before scripts can start it later
    // (auto-advance, auto-play next, playlist progression).
    const unlock = () => backend.unlock();
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    return () => {
      offAuto();
      offMedia();
      window.removeEventListener('pointerdown', unlock, { capture: true });
    };
  }, []);

  // Keep audio warm whenever the team, lineup or stored audio changes.
  useEffect(() => {
    if (ready) preloadBatters();
  }, [ready, teams, audioIds]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', settings.theme === 'dark' ? '#0b1220' : '#f4f1e8');
  }, [settings.theme]);

  if (!ready) return <div className="screen center-screen">Loading…</div>;
  return (
    <NavProvider>
      <Router />
    </NavProvider>
  );
}
