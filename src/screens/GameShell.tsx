import { useEffect, useState } from 'react';
import { setKeepAwake } from '../audio/platform';
import { store } from '../state/app';
import { useActiveTeam, useAppState, usePlayback } from '../state/hooks';
import { useNav } from '../Nav';
import { AudioOutput } from '../components/AudioOutput';
import { Icon } from '../components/icons';
import { HoldButton } from '../components/ui';
import { WalkUpMode } from './WalkUpMode';

/** GAME MODE: the batting order, big controls, and one tap on a name to play that player's walk-up. */
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
    <div className={`screen game ${locked ? 'is-locked' : ''}`}>
      <header className="scoreboard">
        <button className="btn-text back" onClick={() => nav.back()} disabled={locked} aria-label="Home">
          <Icon name="chev-l" size={22} />
          <span>HOME</span>
        </button>
        <div className="team-name">{team?.name ?? 'No team'}</div>
        <button className={`btn-icon ${locked ? 'on' : ''}`} onClick={() => !locked && setLocked(true)} aria-label={locked ? 'Controls locked' : 'Lock controls'} aria-pressed={locked}>
          <Icon name={locked ? 'lock' : 'unlock'} size={22} />
        </button>
        <div className="inning">
          <button className="btn-icon sm" disabled={locked} onClick={() => store.prevHalfInning()} aria-label="Previous half inning">
            <Icon name="chev-l" size={18} />
          </button>
          <span className="inning-label" aria-live="polite">
            <span className="half">{game.half === 'top' ? '▲ TOP' : '▼ BOT'}</span> <b>{game.inning}</b>
          </span>
          <button className="btn-icon sm" disabled={locked} onClick={() => store.nextHalfInning()} aria-label="Next half inning">
            <Icon name="chev-r" size={18} />
          </button>
        </div>
        <div className="status-cell">
          {playing && <span className="onair"><i /> ON AIR</span>}
          <AudioOutput compact />
        </div>
      </header>

      {locked && (
        <div className="lockbar">
          Locked — tapping names and Next Batter are off. Play, Pause and Stop still work.
          <HoldButton label="Hold to unlock" onHold={() => setLocked(false)} />
        </div>
      )}

      <main className="content game-content">
        <WalkUpMode locked={locked} />
      </main>
    </div>
  );
}
