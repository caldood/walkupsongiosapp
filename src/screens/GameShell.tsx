import { useEffect, useRef, useState } from 'react';
import { setKeepAwake } from '../audio/platform';
import { formatTime } from '../core/format';
import { playback, store } from '../state/app';
import { nextBatter, playCurrentWalkUp, previousBatter } from '../state/gameActions';
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
  const mainRef = useRef<HTMLElement>(null);
  const [controlsVisible, setControlsVisible] = useState(true);

  // When the big controls scroll out of view, keep Pause/Stop one tap away in a floating bar.
  useEffect(() => {
    const controls = mainRef.current?.querySelector('.controls');
    if (!controls || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setControlsVisible(e.isIntersecting), { root: mainRef.current, threshold: 0.15 });
    io.observe(controls);
    return () => io.disconnect();
  }, [team?.id, game.batterIndex]);

  // Keyboard shortcuts (handy on a Mac): Space play/pause, S or Esc stop, N / → next batter, P / ← previous.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (document.querySelector('.modal-backdrop')) return;
      const status = playback.getSnapshot().audio.status;
      const key = e.key.toLowerCase();
      if (key === ' ') {
        e.preventDefault();
        if (status === 'playing') playback.pause();
        else if (status === 'paused') playback.resume();
        else playCurrentWalkUp();
      } else if (key === 'escape' || key === 's') {
        playback.stopAll();
      } else if (!locked && (key === 'n' || key === 'arrowright')) {
        nextBatter();
      } else if (!locked && (key === 'p' || key === 'arrowleft')) {
        previousBatter();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked]);

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

      <main className="content game-content" ref={mainRef}>
        <WalkUpMode locked={locked} />
      </main>

      {audio.track && audio.status !== 'idle' && !controlsVisible && (
        <div className="nowbar" role="region" aria-label="Now playing">
          <Icon name="eq" size={22} />
          <div className="nb-info">
            <b>{audio.track.subtitle || audio.track.title}</b>
            <span>{audio.track.title}</span>
          </div>
          <span className="nb-time">-{formatTime(Math.max(0, (audio.length ?? 0) - audio.position))}</span>
          <button className="btn-icon" onClick={() => (audio.status === 'playing' ? playback.pause() : playback.resume())} aria-label={audio.status === 'playing' ? 'Pause' : 'Resume'}>
            <Icon name={audio.status === 'playing' ? 'pause' : 'play'} size={22} />
          </button>
          <button className="btn-icon stop" onClick={() => playback.stopAll()} aria-label="Stop">
            <Icon name="stop" size={22} />
          </button>
        </div>
      )}
    </div>
  );
}
