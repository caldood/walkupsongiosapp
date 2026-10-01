import { useEffect, useState } from 'react';
import { setKeepAwake } from '../audio/platform';
import { switchMode } from '../state/gameActions';
import { store } from '../state/app';
import { useActiveTeam, useAppState, usePlayback } from '../state/hooks';
import { useNav } from '../Nav';
import { AudioOutput } from '../components/AudioOutput';
import { HoldButton } from '../components/ui';
import { DefenseMode } from './DefenseMode';
import { WalkUpMode } from './WalkUpMode';

/** GAME MODE: one screen, one tap to swap between DEFENSE and WALK-UP. */
export function GameShell() {
  const { game, settings } = useAppState();
  const team = useActiveTeam();
  const { audio } = usePlayback();
  const nav = useNav();
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    setKeepAwake(settings.keepAwake);
    return () => setKeepAwake(false);
  }, [settings.keepAwake]);

  const playing = audio.status === 'playing';

  return (
    <div className={`screen game mode-${game.mode} ${locked ? 'is-locked' : ''}`}>
      <header className="scoreboard">
        <button className="btn-text" onClick={() => nav.back()} disabled={locked} aria-label="Home">
          ‹ HOME
        </button>
        <div className="team-name">{team?.name ?? 'No team'}</div>
        <button className={`btn-icon ${locked ? 'on' : ''}`} onClick={() => !locked && setLocked(true)} aria-label={locked ? 'Controls locked' : 'Lock controls'} aria-pressed={locked}>
          {locked ? '🔒' : '🔓'}
        </button>
        <div className="inning">
          <button className="btn-icon sm" disabled={locked} onClick={() => store.prevHalfInning()} aria-label="Previous half inning">
            ‹
          </button>
          <span className="inning-label" aria-live="polite">
            {game.half === 'top' ? '▲ TOP' : '▼ BOT'} <b>{game.inning}</b>
          </span>
          <button className="btn-icon sm" disabled={locked} onClick={() => store.nextHalfInning()} aria-label="Next half inning">
            ›
          </button>
        </div>
        <div className="status-cell">
          {playing && <span className="onair">● ON AIR</span>}
          <AudioOutput compact />
        </div>
      </header>

      {locked && (
        <div className="lockbar">
          Controls locked — Play, Pause and Stop still work.
          <HoldButton label="Hold to unlock" onHold={() => setLocked(false)} />
        </div>
      )}

      <main className="content game-content">{game.mode === 'defense' ? <DefenseMode locked={locked} /> : <WalkUpMode locked={locked} />}</main>

      <nav className="tabbar" aria-label="Game mode">
        <button className={game.mode === 'defense' ? 'on' : ''} disabled={locked} onClick={() => switchMode('defense')} aria-pressed={game.mode === 'defense'}>
          <span aria-hidden="true">🛡</span> DEFENSE
        </button>
        <button className={game.mode === 'walkup' ? 'on' : ''} disabled={locked} onClick={() => switchMode('walkup')} aria-pressed={game.mode === 'walkup'}>
          <span aria-hidden="true">⚾</span> WALK-UP
        </button>
        <button disabled={locked} onClick={() => nav.go({ name: 'settings' })}>
          <span aria-hidden="true">⚙</span> SETTINGS
        </button>
      </nav>
    </div>
  );
}
