import { lineup } from '../core/battingOrder';
import { store } from '../state/app';
import { preloadBatters, switchMode } from '../state/gameActions';
import { useActiveTeam, useAppState } from '../state/hooks';
import { useNav } from '../Nav';
import { AudioOutput } from '../components/AudioOutput';
import { Banner } from '../components/ui';
import { restartSetupWizard } from './GameSetup';

export function Home() {
  const nav = useNav();
  const { teams, settings } = useAppState();
  const team = useActiveTeam();
  const missing = store.missingSongs(team).length;

  function enter(mode: 'defense' | 'walkup') {
    switchMode(mode);
    preloadBatters();
    nav.go({ name: 'game' });
  }

  return (
    <div className="screen home">
      <header className="home-head">
        <div>
          <div className="brand">GAME DAY MUSIC</div>
          <button className="team-chip" onClick={() => nav.go({ name: 'teams' })} aria-label="Change team">
            {team ? team.name : 'Create your team'} <span aria-hidden="true">▾</span>
          </button>
        </div>
        <AudioOutput />
      </header>

      <main className="content home-main">
        {!team ? (
          <Banner action={<button className="btn btn-small btn-primary" onClick={() => nav.go({ name: 'teams' })}>Create team</button>}>
            {teams.length === 0 ? 'Welcome! Start by creating your team.' : 'Choose a team.'}
          </Banner>
        ) : (
          missing > 0 && (
            <Banner kind="warn" action={<button className="btn btn-small" onClick={() => nav.go({ name: 'songs' })}>Fix</button>}>
              {missing} song{missing === 1 ? '' : 's'} not on this device.
            </Banner>
          )
        )}

        <button className="btn-giant home-btn defense" onClick={() => enter('defense')} disabled={!team}>
          <span className="icon" aria-hidden="true">🛡</span>
          DEFENSE MUSIC
          <small>{team?.defensePlaylists.find((p) => p.id === team.activeDefensePlaylistId)?.name ?? 'Warm-up playlist'}</small>
        </button>
        <button className="btn-giant home-btn walkup" onClick={() => enter('walkup')} disabled={!team}>
          <span className="icon" aria-hidden="true">⚾</span>
          WALK-UP MUSIC
          <small>{team ? `${lineup(team).length} batters` : 'Batting order'}</small>
        </button>

        <nav className="home-grid" aria-label="Setup">
          <button className="tile" onClick={() => { restartSetupWizard(); nav.go({ name: 'setup' }); }}>📋<span>Game setup</span></button>
          <button className="tile" onClick={() => nav.go({ name: 'teams' })}>👥<span>Team setup</span></button>
          <button className="tile" onClick={() => nav.go({ name: 'players' })}>🧢<span>Players</span></button>
          <button className="tile" onClick={() => nav.go({ name: 'songs' })}>🎵<span>Songs</span></button>
          <button className="tile" onClick={() => nav.go({ name: 'playlists' })}>🎶<span>Playlists</span></button>
          <button className="tile" onClick={() => nav.go({ name: 'settings' })}>⚙<span>Settings</span></button>
        </nav>
        <p className="footnote">{settings.keepAwake ? 'Screen stays awake in Game Mode.' : ''}</p>
      </main>
    </div>
  );
}
