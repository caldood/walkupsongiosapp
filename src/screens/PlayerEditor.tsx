import { useRef, useState } from 'react';
import { fitAnnouncer, resolveClip } from '../core/clip';
import { formatTime, parseTime } from '../core/format';
import { spotifyOpenUrl } from '../core/songs';
import { createPlayer } from '../core/teams';
import { playback, store } from '../state/app';
import { walkUpRequest } from '../state/gameActions';
import { DEFAULT_ANNOUNCER_DELAY } from '../core/types';
import { useActiveTeam, usePlayback, useAppState } from '../state/hooks';
import { useNav } from '../Nav';
import { Banner, Screen, Section, useConfirm } from '../components/ui';
import { SongPicker } from '../components/SongPicker';
import { fileToAvatar } from '../components/image';

export function PlayerEditor({ playerId }: { playerId?: string }) {
  const team = useActiveTeam();
  const { songs, audioIds } = useAppState();
  const { audio } = usePlayback();
  const nav = useNav();
  const existing = team?.players.find((p) => p.id === playerId);
  const photoInput = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();

  const [name, setName] = useState(existing?.name ?? '');
  const [number, setNumber] = useState(existing?.number ?? '');
  const [photo, setPhoto] = useState(existing?.photo);
  const [songId, setSongId] = useState(existing?.walkUpSongId ?? null);
  const [start, setStart] = useState(existing && existing.clipStart ? formatTime(existing.clipStart) : '');
  const [end, setEnd] = useState(existing?.clipEnd ? formatTime(existing.clipEnd) : '');
  const [picking, setPicking] = useState(false);
  const [announcerId, setAnnouncerId] = useState(existing?.announcerSongId ?? null);
  const [delay, setDelay] = useState(existing?.announcerDelay != null ? String(existing.announcerDelay) : '');
  const [pickingAnnouncer, setPickingAnnouncer] = useState(false);

  if (!team) return null;
  const song = songs.find((s) => s.id === songId);
  const startSec = start.trim() ? parseTime(start) : 0;
  const endSec = end.trim() ? parseTime(end) : null;
  const timeError =
    startSec === null || (end.trim() && endSec === null)
      ? 'Enter times like 0:42 or 42.'
      : endSec != null && startSec != null && endSec <= startSec
        ? 'End must be after start.'
        : null;
  const announcer = songs.find((s) => s.id === announcerId);
  const delaySec = delay.trim() ? Number(delay) : DEFAULT_ANNOUNCER_DELAY;
  const delayError = !Number.isFinite(delaySec) || delaySec < 0 ? 'Enter a number of seconds, like 2.' : null;
  const dirtyName = !name.trim();

  function save() {
    if (dirtyName || timeError || delayError) return;
    const fields = {
      name: name.trim(),
      number: number.trim(),
      photo,
      walkUpSongId: songId,
      clipStart: startSec ?? 0,
      clipEnd: endSec,
      announcerSongId: announcerId,
      announcerDelay: delay.trim() ? delaySec : undefined,
    };
    if (existing) store.savePlayer({ ...existing, ...fields });
    else store.savePlayer(fields);
    playback.stopAll();
    nav.back();
  }

  function test() {
    if (!song || song.sourceType !== 'local' || timeError || delayError) return;
    const req = walkUpRequest(
      team!,
      { id: existing?.id ?? 'preview', name: name || 'Preview', clipStart: startSec ?? 0, clipEnd: endSec, walkUpSongId: songId, announcerSongId: announcerId, announcerDelay: delay.trim() ? delaySec : undefined },
      { preview: true },
    );
    if (typeof req !== 'string') playback.playWalkUp(req);
  }

  const testing = audio.track?.key === songId && audio.track?.kind === 'walkup' && audio.status !== 'idle';
  const draft = createPlayer({ name, clipStart: startSec ?? 0, clipEnd: endSec });
  const baseClip = song ? resolveClip(draft, song, team.settings.defaultClipSeconds) : null;
  const clip = baseClip && announcer ? fitAnnouncer(baseClip, delaySec, announcer.duration) : baseClip;
  const stretched = !!baseClip && !!clip && clip.duration > baseClip.duration + 0.01;
  const spotify = song?.sourceType === 'spotify' ? spotifyOpenUrl(song) : null;

  return (
    <Screen
      title={existing ? 'Edit player' : 'New player'}
      onBack={() => {
        playback.stopAll();
        nav.back();
      }}
      right={
        <button className="btn-text strong" onClick={save} disabled={dirtyName || !!timeError || !!delayError}>
          Save
        </button>
      }
    >
      <Section>
        <div className="avatar-row">
          <button className="avatar" onClick={() => photoInput.current?.click()} aria-label="Choose photo">
            {photo ? <img src={photo} alt="" /> : <span>{name.trim() ? name.trim()[0].toUpperCase() : '📷'}</span>}
          </button>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setPhoto(await fileToAvatar(f));
            }}
          />
          <div className="grow">
            <label className="label" htmlFor="pname">Name</label>
            <input id="pname" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Brevan Sun" autoComplete="off" />
            <label className="label" htmlFor="pnum">Jersey number</label>
            <input id="pnum" className="field" value={number} onChange={(e) => setNumber(e.target.value)} inputMode="numeric" maxLength={3} placeholder="7" />
          </div>
        </div>
        {photo && (
          <button className="btn-text" onClick={() => setPhoto(undefined)}>
            Remove photo
          </button>
        )}
      </Section>

      <Section title="Walk-up song">
        <button className="row pick" onClick={() => setPicking(true)}>
          <span className="grow">
            <span className="row-title">🎵 {song ? song.name : 'Choose a song'}</span>
            <span className="row-sub">
              {song ? (song.sourceType === 'spotify' ? 'Spotify reference' : audioIds.has(song.localReference ?? song.id) ? 'On this device' : 'Audio missing on this device') : 'From your music library'}
            </span>
          </span>
          <span aria-hidden="true">›</span>
        </button>
        {song && (
          <button className="btn-text" onClick={() => { setSongId(null); setStart(''); setEnd(''); }}>
            Remove song
          </button>
        )}
        {song?.sourceType === 'local' && !audioIds.has(song.localReference ?? song.id) && <Banner kind="warn">Walk-up song not available on this device. Open Songs to choose the audio file again.</Banner>}
        {spotify && (
          <p>
            <a className="btn btn-spotify" href={spotify} target="_blank" rel="noopener noreferrer">
              ↗ Open in Spotify
            </a>
          </p>
        )}
      </Section>

      <Section title="Announcer (optional)" hint="A recording of the name being spoken. It plays over the walk-up music and the music dips while it talks.">
        <button className="row pick" onClick={() => setPickingAnnouncer(true)}>
          <span className="grow">
            <span className="row-title">🎙 {announcer ? announcer.name : 'Add announcer recording'}</span>
            <span className="row-sub">
              {announcer ? (audioIds.has(announcer.localReference ?? announcer.id) ? `On this device${announcer.duration ? ` · ${announcer.duration.toFixed(1)}s` : ''}` : 'Audio missing on this device') : 'e.g. “Now batting… number 7… Brevan Sun!”'}
            </span>
          </span>
          <span aria-hidden="true">›</span>
        </button>
        {announcer && (
          <>
            <label className="label" htmlFor="adelay">Announcer starts (seconds after the music starts)</label>
            <input id="adelay" className="field mono" value={delay} onChange={(e) => setDelay(e.target.value)} inputMode="decimal" placeholder={String(DEFAULT_ANNOUNCER_DELAY)} />
            {delayError && <p className="error-text">{delayError}</p>}
            {stretched && clip && <p className="hint">The announcement is longer than the clip, so the clip will run {Math.round(clip.duration)} seconds.</p>}
            <button className="btn-text" onClick={() => setAnnouncerId(null)}>Remove announcer</button>
          </>
        )}
        {announcer && !audioIds.has(announcer.localReference ?? announcer.id) && <Banner kind="warn">Announcer recording not available on this device. Open Songs to choose the audio file again.</Banner>}
      </Section>

      {song?.sourceType === 'local' && (
        <Section title="Clip" hint={`Leave End blank to play ${team.settings.defaultClipSeconds} seconds from the start (change the default in Settings).`}>
          <div className="pair">
            <div>
              <label className="label" htmlFor="cstart">Start (m:ss)</label>
              <input id="cstart" className="field mono" value={start} onChange={(e) => setStart(e.target.value)} inputMode="decimal" placeholder="0:00" />
            </div>
            <div>
              <label className="label" htmlFor="cend">End (m:ss)</label>
              <input id="cend" className="field mono" value={end} onChange={(e) => setEnd(e.target.value)} inputMode="decimal" placeholder={`auto`} />
            </div>
          </div>
          {timeError ? <p className="error-text">{timeError}</p> : clip && <p className="hint">Plays {formatTime(clip.start)}–{formatTime(clip.end)} ({Math.round(clip.duration)} seconds).</p>}
          <button className={`btn wide ${testing ? 'btn-stop' : 'btn-primary'}`} onClick={() => (testing ? playback.stopAll() : test())} disabled={!!timeError}>
            {testing ? '⏹ Stop test' : '▶ Test this clip'}
          </button>
          {audio.status === 'error' && audio.error === 'missing' && <p className="error-text">Walk-up song not available on this device.</p>}
        </Section>
      )}

      {existing && (
        <Section>
          <button
            className="btn btn-danger wide"
            onClick={() =>
              confirm.ask({ title: `Delete ${existing.name}?`, message: 'This removes the player from the team.', confirmLabel: 'Delete', danger: true }, () => {
                store.removePlayer(existing.id);
                nav.back();
              })
            }
          >
            Delete player
          </button>
        </Section>
      )}
      {confirm.dialog}
      {pickingAnnouncer && (
        <SongPicker
          title="Announcer recording"
          role="announcer"
          allowSpotify={false}
          selectedIds={announcerId ? [announcerId] : []}
          onClose={() => setPickingAnnouncer(false)}
          onPick={(s) => {
            setAnnouncerId(s.id);
            setPickingAnnouncer(false);
          }}
        />
      )}
      {picking && (
        <SongPicker
          title="Walk-up song"
          selectedIds={songId ? [songId] : []}
          onClose={() => setPicking(false)}
          onPick={(s) => {
            if (s.id !== songId) {
              setStart('');
              setEnd('');
            }
            setSongId(s.id);
            setPicking(false);
          }}
        />
      )}
    </Screen>
  );
}
