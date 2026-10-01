import { useEffect, useRef, useState } from 'react';
import { describeAudioError } from '../audio/AudioManager';
import { ACCEPTED_AUDIO } from '../audio/metadata';
import { currentBatter, lineup } from '../core/battingOrder';
import { describeClip, fitAnnouncer, resolveClip } from '../core/clip';
import { DEFAULT_ANNOUNCER_DELAY } from '../core/types';
import { formatTime } from '../core/format';
import { isPlayable, spotifyOpenUrl } from '../core/songs';
import { playback, store } from '../state/app';
import { nextBatter, playCurrentWalkUp, playPlayer, preloadBatters, previousBatter } from '../state/gameActions';
import { useActiveTeam, useAppState, usePlayback } from '../state/hooks';
import { useNav } from '../Nav';
import { Icon } from '../components/icons';
import { Avatar, Banner, EmptyState } from '../components/ui';

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
  const announcer = store.song(batter.announcerSongId);
  const announcerReady = isPlayable(announcer, audioIds);
  const baseClip = song ? resolveClip(batter, song, team.settings.defaultClipSeconds) : null;
  const clip = baseClip && announcer && announcerReady ? fitAnnouncer(baseClip, batter.announcerDelay ?? DEFAULT_ANNOUNCER_DELAY, announcer.duration) : baseClip;
  const mine = audio.track?.kind === 'walkup' && audio.track.ref === batter.id;
  const status = mine ? audio.status : 'idle';
  const walkUpActive = audio.track?.kind === 'walkup';
  const error = walkUpActive && audio.status === 'error' && audio.error ? audio.error : null;
  const spotify = song?.sourceType === 'spotify' ? spotifyOpenUrl(song) : null;

  function play() {
    setNotice(null);
    if (status === 'paused') return playback.resume();
    if (playCurrentWalkUp() === 'no-song') setNotice('No walk-up song assigned yet.');
  }

  function tap(p: (typeof batters)[number]) {
    setNotice(null);
    const r = playPlayer(team!, p);
    if (r === 'no-song') setNotice(`${p.name} has no walk-up song yet.`);
    if (r === 'spotify') {
      const link = spotifyOpenUrl(store.song(p.walkUpSongId)!);
      if (link) window.open(link, '_blank', 'noopener,noreferrer');
    }
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
          <Icon name="ball" size={16} /> NOW BATTING
          <span className="kicker-count">
            {batters.findIndex((b) => b.id === batter.id) + 1} / {batters.length}
          </span>
        </div>
        <div className="batter-main">
          <div className="plate" aria-label={`Number ${batter.number || 'none'}`}>
            <small>#</small>
            {batter.number || '–'}
          </div>
          <div className="batter-id">
            <div className="batter-name">{batter.name}</div>
            <div className="batter-song">
              {song ? (
                <>
                  <Icon name="music" size={18} /> <span>{song.name}</span>
                </>
              ) : (
                <span className="muted">No walk-up song assigned</span>
              )}
            </div>
            <div className="chips-row">
              {clip && song?.sourceType === 'local' && (
                <span className="pill">
                  {describeClip(clip, formatTime)} · {Math.round(clip.duration)}s
                </span>
              )}
              {announcer && (
                <span className={`pill ${announcerReady ? '' : 'warn'}`}>
                  <Icon name="mic" size={14} /> {announcer.name}
                  {!announcerReady && ' · missing'}
                </span>
              )}
            </div>
          </div>
          {batter.photo && <img className="batter-photo" src={batter.photo} alt="" />}
        </div>
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
              <Icon name="external" size={24} /> OPEN IN SPOTIFY
            </a>
            <p className="hint center">Spotify needs internet and plays in the Spotify app. Come back here afterwards.</p>
          </>
        ) : (
          <button className="btn-giant btn-play" onClick={play} disabled={status === 'playing' || status === 'loading'}>
            {status === 'playing' || status === 'loading' ? (
              <>
                <Icon name="eq" size={26} /> PLAYING
              </>
            ) : status === 'paused' ? (
              <>
                <Icon name="play" size={26} /> RESUME
              </>
            ) : (
              <>
                <Icon name="play" size={26} /> PLAY WALK-UP
              </>
            )}
          </button>
        )}

        <div className="pair">
          <button className="btn-big btn-neutral" onClick={() => playback.pause()} disabled={!(mine && status === 'playing')}>
            <Icon name="pause" size={22} /> PAUSE
          </button>
          <button className="btn-big btn-stop" onClick={() => playback.stopAll()} disabled={audio.status === 'idle'}>
            <Icon name="stop" size={22} /> STOP
          </button>
        </div>

        <div className="pair nav-pair">
          <button className="btn-big btn-ghost" onClick={previousBatter} disabled={locked} aria-label="Previous batter">
            <Icon name="back" size={22} />
          </button>
          <button className="btn-giant btn-next" onClick={nextBatter} disabled={locked}>
            NEXT BATTER <Icon name="next" size={26} />
          </button>
        </div>
      </section>

      <section className="upnext">
        <h2>Batting order <span>tap a name to play</span></h2>
        <ol>
          {batters.map((p, i) => {
            const isCurrent = p.id === batter.id;
            const sng = store.song(p.walkUpSongId);
            const sounding = audio.track?.ref === p.id && (audio.status === 'playing' || audio.status === 'loading');
            return (
              <li key={p.id}>
                <button className={`${isCurrent ? 'current' : ''} ${sounding ? 'sounding' : ''}`} disabled={locked} onClick={() => tap(p)} aria-label={`${sounding ? 'Stop' : 'Play'} ${p.name}'s walk-up song`}>
                  <span className="pos">{i + 1}</span>
                  <Avatar name={p.name} photo={p.photo} size={42} tone={sounding || isCurrent ? 'accent' : 'default'} />
                  <span className="who">
                    <span className="nm">
                      <span className="num">#{p.number || '–'}</span> {p.name}
                    </span>
                    <span className="sg">{sng ? sng.name : 'no song'}</span>
                  </span>
                  <span className="go" aria-hidden="true">
                    <Icon name={sounding ? 'eq' : 'play'} size={sounding ? 22 : 20} />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
