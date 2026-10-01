import { describeAudioError } from '../audio/AudioManager';
import { formatTime } from '../core/format';
import { playback, store } from '../state/app';
import { startActiveDefensePlaylist } from '../state/gameActions';
import { useActiveTeam, useAppState, usePlayback } from '../state/hooks';
import { useNav } from '../Nav';
import { Banner, EmptyState } from '../components/ui';

export function DefenseMode({ locked }: { locked: boolean }) {
  const team = useActiveTeam();
  const { songs } = useAppState();
  const { audio, defense } = usePlayback();
  const nav = useNav();

  if (!team) return <EmptyState title="No team yet" action={<button className="btn btn-primary" onClick={() => nav.go({ name: 'teams' })}>Create a team</button>} />;
  const playlist = team.defensePlaylists.find((p) => p.id === team.activeDefensePlaylistId) ?? team.defensePlaylists[0];
  if (!playlist) {
    return (
      <EmptyState title="No defense playlist" action={<button className="btn btn-primary" onClick={() => nav.go({ name: 'playlists' })}>Create playlist</button>}>
        Make a playlist of warm-up songs to play while the team is in the field.
      </EmptyState>
    );
  }

  const name = (id: string | null | undefined) => songs.find((s) => s.id === id)?.name ?? 'Unknown song';
  const mine = audio.track?.kind === 'defense';
  const status = mine ? audio.status : 'idle';
  const loaded = defense.playlistId === playlist.id && defense.queue && defense.queue.songIds.join() === playlist.songIds.join();
  const current = mine && audio.track ? audio.track.title : loaded ? name(defense.currentSongId) : name(playlist.songIds[0]);
  const upcoming = loaded ? defense.upcomingSongIds : playlist.songIds.slice(1, 4);
  const error = mine && audio.status === 'error' && audio.error ? audio.error : null;

  function ensureStarted(then: 'play' | 'next') {
    if (!loaded) {
      startActiveDefensePlaylist();
      if (then === 'next') playback.defenseNext();
    } else if (then === 'play') playback.defensePlay();
    else playback.defenseNext();
  }

  function setOption(opt: 'defenseShuffle' | 'defenseRepeat', value: boolean) {
    store.updateTeamSettings({ [opt]: value });
    playback.setDefenseOptions(opt === 'defenseShuffle' ? { shuffle: value } : { repeat: value });
  }

  return (
    <div className="defense">
      <section className="batter-card">
        <div className="kicker">🛡 DEFENSE MUSIC</div>
        {team.defensePlaylists.length > 1 ? (
          <select
            className="field playlist-select"
            aria-label="Playlist"
            value={playlist.id}
            disabled={locked}
            onChange={(e) => {
              playback.stopAll();
              store.setActivePlaylist(e.target.value);
            }}
          >
            {team.defensePlaylists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        ) : (
          <div className="playlist-name">{playlist.name}</div>
        )}
        <div className="batter-song big">
          <span aria-hidden="true">🎵</span> {current}
        </div>
        <div className="times solo">
          {mine && (status === 'playing' || status === 'paused') ? (
            <>
              {formatTime(audio.position)}
              {audio.length ? ` / ${formatTime(audio.length)}` : ''}
              {status === 'paused' ? ' · PAUSED' : ''}
            </>
          ) : (
            <span className="muted">Ready</span>
          )}
        </div>
        {defense.skipped > 0 && <Banner kind="warn">{defense.skipped} song{defense.skipped === 1 ? '' : 's'} skipped – audio not on this device.</Banner>}
        {error && <Banner kind={error === 'needs-gesture' ? 'info' : 'error'}>{error === 'missing' ? 'No songs in this playlist can play on this device.' : describeAudioError(error, 'defense')}</Banner>}
        {defense.finished && <Banner>Playlist finished.</Banner>}
      </section>

      <section className="controls">
        <button className="btn-giant btn-play" onClick={() => ensureStarted('play')} disabled={status === 'playing' || status === 'loading'}>
          {status === 'paused' ? '▶ RESUME' : status === 'playing' || status === 'loading' ? '♪ PLAYING…' : '▶ PLAY'}
        </button>
        <div className="pair">
          <button className="btn-big btn-neutral" onClick={() => playback.defensePause()} disabled={status !== 'playing'}>
            ⏸ PAUSE
          </button>
          <button className="btn-big btn-neutral" onClick={() => ensureStarted('next')} disabled={locked}>
            ⏭ NEXT
          </button>
        </div>
        <button className="btn-big btn-stop wide" onClick={() => playback.stopAll()} disabled={!mine}>
          ⏹ STOP
        </button>
        <div className="trio">
          <button className="chip" onClick={() => playback.defensePrev()} disabled={locked || !loaded}>
            ⏮ Previous
          </button>
          <button className={`chip ${team.settings.defenseShuffle ? 'on' : ''}`} aria-pressed={team.settings.defenseShuffle} onClick={() => setOption('defenseShuffle', !team.settings.defenseShuffle)} disabled={locked}>
            🔀 Shuffle
          </button>
          <button className={`chip ${team.settings.defenseRepeat ? 'on' : ''}`} aria-pressed={team.settings.defenseRepeat} onClick={() => setOption('defenseRepeat', !team.settings.defenseRepeat)} disabled={locked}>
            🔁 Repeat
          </button>
        </div>
      </section>

      <section className="upnext">
        <h2>UP NEXT</h2>
        {upcoming.length === 0 ? (
          <p className="muted">That's the last song.</p>
        ) : (
          <ol>
            {upcoming.map((id, i) => (
              <li key={`${id}-${i}`}>
                <div className="static">
                  <span className="nm">{name(id)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
