import { useEffect, useRef, useState } from 'react';
import { describeAudioError } from '../audio/AudioManager';
import { ACCEPTED_AUDIO } from '../audio/metadata';
import { currentBatter, lineup, upNext } from '../core/battingOrder';
import { describeClip, resolveClip } from '../core/clip';
import { formatTime } from '../core/format';
import { isPlayable, spotifyOpenUrl } from '../core/songs';
import { playback, store } from '../state/app';
import { nextBatter, playCurrentWalkUp, preloadBatters, previousBatter } from '../state/gameActions';
import { useActiveTeam, useAppState, usePlayback } from '../state/hooks';
import { useNav } from '../Nav';
import { Banner, EmptyState } from '../components/ui';

export function WalkUpMode({ locked }: { locked: boolean }) {
  const { game, audioIds } = useAppState();
  const team = useActiveTeam();
  const { audio } = usePlayback();
  const nav = useNav();
  const fileInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const batterId = team ? currentBatter(team, game.batterIndex)?.id : undefined;
  useEffect(() => {
    preloadBatters();
  }, [team?.id, game.batterIndex, batterId, audioIds]);
  useEffect(() => setNotice(null), [batterId]);

  if (!team) return <EmptyState title="No team yet" action={<button className="btn btn-primary" onClick={() => nav.go({ name: 'teams' })}>Create a team</button>} />;
  const batters = lineup(team);
  const batter = currentBatter(team, game.batterIndex);
  if (!batter) {
    return (
      <EmptyState title="No batting order" action={<button className="btn btn-primary" onClick={() => nav.go({ name: 'players' })}>Add players</button>}>
        Add players and put them in the batting order.
      </EmptyState>
    );
  }

  const song = store.song(batter.walkUpSongId);
  const playable = isPlayable(song, audioIds);
  const clip = song ? resolveClip(batter, song, team.settings.defaultClipSeconds) : null;
  const mine = audio.track?.kind === 'walkup' && audio.track.ref === batter.id;
  const status = mine ? audio.status : 'idle';
  const walkUpActive = audio.track?.kind === 'walkup';
  const error = walkUpActive && audio.status === 'error' && audio.error ? audio.error : null;
  const spotify = song?.sourceType === 'spotify' ? spotifyOpenUrl(song) : null;
  const queue = upNext(team, game.batterIndex, 3);

  function play() {
    setNotice(null);
    if (status === 'paused') return playback.resume();
    if (playCurrentWalkUp() === 'no-song') setNotice('No walk-up song assigned yet.');
  }

  async function relink(files: FileList | null) {
    const f = files?.[0];
    if (f && song) {
      await store.relinkSong(song.id, f);
      setNotice(null);
    }
  }

  const position = mine ? audio.position : 0;
  const length = mine && audio.length ? audio.length : (clip?.duration ?? 0);

  return (
    <div className="walkup">
      <section className="batter-card" aria-live="polite">
        <div className="kicker">
          ⚾ NOW BATTING <span className="muted">· {batters.findIndex((b) => b.id === batter.id) + 1} of {batters.length}</span>
        </div>
        <div className="batter-main">
          {batter.photo ? <img className="batter-photo" src={batter.photo} alt="" /> : null}
          <div className="batter-number">#{batter.number || '–'}</div>
          <div className="batter-name">{batter.name}</div>
        </div>
        <div className="batter-song">
          {song ? (
            <>
              <span aria-hidden="true">🎵</span> {song.name}
            </>
          ) : (
            <span className="muted">No walk-up song assigned</span>
          )}
        </div>
        {clip && song?.sourceType === 'local' && (
          <div className="batter-clip">
            {describeClip(clip, formatTime)} · {Math.round(clip.duration)}s
          </div>
        )}
        {song && song.sourceType === 'local' && !playable && (
          <Banner kind="warn" action={<button className="btn btn-small" onClick={() => fileInput.current?.click()}>Choose Audio File</button>}>
            Walk-up song not available on this device.
          </Banner>
        )}
        {error && (
          <Banner kind={error === 'needs-gesture' ? 'info' : 'error'} action={error === 'missing' && song ? <button className="btn btn-small" onClick={() => fileInput.current?.click()}>Choose Audio File</button> : undefined}>
            {describeAudioError(error, 'walkup')}
          </Banner>
        )}
        {notice && <Banner kind="warn">{notice}</Banner>}
        <input ref={fileInput} type="file" accept={ACCEPTED_AUDIO} hidden onChange={(e) => void relink(e.target.files)} />
      </section>

      <section className="controls">
        {mine && (status === 'playing' || status === 'paused') && (
          <div className="progress" aria-label="Playback progress">
            <div className="bar">
              <div style={{ width: `${length ? Math.min(100, (position / length) * 100) : 0}%` }} />
            </div>
            <div className="times">
              <span>{formatTime(position)}</span>
              <span>-{formatTime(Math.max(0, length - position))}</span>
            </div>
          </div>
        )}

        {spotify ? (
          <>
            <a className="btn-giant btn-spotify" href={spotify} target="_blank" rel="noopener noreferrer">
              ↗ OPEN IN SPOTIFY
            </a>
            <p className="hint center">Spotify needs internet and plays in the Spotify app. Come back here afterwards.</p>
          </>
        ) : (
          <button className="btn-giant btn-play" onClick={play} disabled={status === 'playing' || status === 'loading'}>
            {status === 'playing' || status === 'loading' ? '♪ PLAYING…' : status === 'paused' ? '▶ RESUME' : '▶ PLAY WALK-UP'}
          </button>
        )}

        <div className="pair">
          <button className="btn-big btn-neutral" onClick={() => playback.pause()} disabled={!(mine && status === 'playing')}>
            ⏸ PAUSE
          </button>
          <button className="btn-big btn-stop" onClick={() => playback.stopAll()} disabled={audio.status === 'idle'}>
            ⏹ STOP
          </button>
        </div>

        <button className="btn-giant btn-next" onClick={nextBatter} disabled={locked}>
          NEXT BATTER →
        </button>
        <button className="btn-text prev" onClick={previousBatter} disabled={locked}>
          ‹ Previous batter
        </button>
      </section>

      <section className="upnext">
        <h2>UP NEXT</h2>
        {queue.length === 0 ? (
          <p className="muted">Only one batter in the lineup.</p>
        ) : (
          <ol>
            {queue.map((p, i) => (
              <li key={`${p.id}-${i}`}>
                <button disabled={locked} onClick={() => store.setBatterIndex(lineup(team).findIndex((x) => x.id === p.id))}>
                  <span className="num">#{p.number || '–'}</span>
                  <span className="nm">{p.name}</span>
                  <span className="sg">{store.song(p.walkUpSongId)?.name ?? '—'}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
