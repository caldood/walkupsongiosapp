import { lineup } from '../core/battingOrder';
import { isPlayable } from '../core/songs';
import { store } from '../state/app';
import { preloadBatters } from '../state/gameActions';
import { useActiveTeam, useAppState } from '../state/hooks';
import { useNav } from '../Nav';
import { AudioOutput } from '../components/AudioOutput';
import { DiamondArt, Icon, Logo, type IconName } from '../components/icons';
import { Banner } from '../components/ui';
import { restartSetupWizard } from './GameSetup';

export function Home() {
  const nav = useNav();
  const { teams, songs, audioIds } = useAppState();
  const team = useActiveTeam();
  const missing = store.missingSongs(team).length;
  const order = team ? lineup(team) : [];
  const ready = order.filter((p) => isPlayable(store.song(p.walkUpSongId), audioIds)).length;

  const steps = [
    { done: !!team, label: 'Create your team', go: () => nav.go({ name: 'teams' }) },
    { done: songs.some((s) => (s.role ?? 'music') === 'music' && s.sourceType === 'local' && audioIds.has(s.localReference ?? s.id)), label: 'Add songs to your library', go: () => nav.go({ name: 'songs' }) },
    { done: order.length > 0, label: 'Add players to the batting order', go: () => nav.go({ name: 'players' }) },
    { done: order.length > 0 && order.every((p) => p.walkUpSongId), label: 'Give every batter a walk-up song', go: () => nav.go({ name: 'players' }) },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  function enter() {
    preloadBatters();
    nav.go({ name: 'game' });
  }

  const tiles: { icon: IconName; label: string; go(): void }[] = [
    { icon: 'clipboard', label: 'Game setup', go: () => { restartSetupWizard(); nav.go({ name: 'setup' }); } },
    { icon: 'jersey', label: 'Players', go: () => nav.go({ name: 'players' }) },
    { icon: 'music', label: 'Songs & voices', go: () => nav.go({ name: 'songs' }) },
    { icon: 'users', label: 'Teams', go: () => nav.go({ name: 'teams' }) },
    { icon: 'box', label: 'Import / export', go: () => nav.go({ name: 'transfer' }) },
    { icon: 'sliders', label: 'Settings', go: () => nav.go({ name: 'settings' }) },
  ];

  return (
    <div className="screen home">
      <header className="home-head">
        <div className="brandmark">
          <Logo size={38} />
          <div>
            <div className="brand">WALK-UP</div>
            <div className="brand-sub">MUSIC</div>
          </div>
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

        <section className="hero">
          <DiamondArt />
          <button className="team-chip" onClick={() => nav.go({ name: 'teams' })} aria-label="Change team">
            <span>{team ? team.name : 'Create your team'}</span>
            <Icon name="chev-d" size={18} />
          </button>
          <div className="hero-stats">
            <div>
              <b>{order.length}</b>
              <span>batters</span>
            </div>
            <div>
              <b>{ready}</b>
              <span>songs ready</span>
            </div>
            <div>
              <b>{team?.settings.defaultClipSeconds ?? 15}s</b>
              <span>walk-up</span>
            </div>
          </div>
          <button className="btn-hero" onClick={enter} disabled={!team || order.length === 0}>
            <Icon name="play" size={26} />
            <span>START GAME</span>
          </button>
          <p className="hero-hint">{!team ? 'Create a team first.' : order.length === 0 ? 'Add players to the batting order first.' : 'Then tap any name to play their walk-up.'}</p>
        </section>

        {doneCount < steps.length && (
          <section className="checklist" aria-label="Getting ready">
            <h2>
              Getting ready <span>{doneCount} of {steps.length}</span>
            </h2>
            <div className="meter" aria-hidden="true">
              <div style={{ width: `${(doneCount / steps.length) * 100}%` }} />
            </div>
            <ol>
              {steps.map((s) => (
                <li key={s.label}>
                  <button onClick={s.go} className={s.done ? 'done' : ''}>
                    <span className="tick">{s.done && <Icon name="check" size={16} />}</span>
                    <span className="lbl2">{s.label}</span>
                    {!s.done && <Icon name="chev-r" size={18} />}
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}

        <nav className="home-grid" aria-label="Setup">
          {tiles.map((t) => (
            <button key={t.label} className="tile" onClick={t.go}>
              <span className="tile-icon">
                <Icon name={t.icon} size={26} />
              </span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </main>
    </div>
  );
}
