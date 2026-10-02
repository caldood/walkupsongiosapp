import { useEffect, useRef, useState } from 'react';
import { fitAnnouncer, resolveClip } from '../core/clip';
import { formatTime, parseTime } from '../core/format';
import { spotifyOpenUrl } from '../core/songs';
import { createPlayer } from '../core/teams';
import { playback, store } from '../state/app';
import { walkUpRequest } from '../state/gameActions';
import { exportWalkUpMix, MixError, type MixResult } from '../state/exportMix';
import { renderSupported } from '../audio/render';
import { shareOrDownload } from '../components/share';
import { MAX_CLIP_SECONDS } from '../core/types';
import { useActiveTeam, usePlayback, useAppState } from '../state/hooks';
import { useNav } from '../Nav';
import { Banner, Screen, Section, useConfirm } from '../components/ui';
import { SongPicker } from '../components/SongPicker';
import { fileToAvatar } from '../components/image';
import { Icon } from '../components/icons';

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
  const [mix, setMix] = useState<(MixResult & { url: string }) | null>(null);
  const [mixBusy, setMixBusy] = useState(false);
  const [mixError, setMixError] = useState<string | null>(null);
  useEffect(() => () => { if (mix) URL.revokeObjectURL(mix.url); }, [mix]);

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
  const delaySec = delay.trim() ? Number(delay) : team.settings.announcerDelay;
  const delayError = !Number.isFinite(delaySec) || delaySec < 0 ? 'Enter a number of seconds, like 2.' : null;
  const dirtyName = !name.trim();

  function save(opts: { stay?: boolean } = {}) {
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
    if (!opts.stay) nav.back();
  }

  /** Save this player and immediately start a blank one (fast roster entry). */
  function saveAndNew() {
    if (dirtyName || timeError || delayError) return;
    save({ stay: true });
    setName('');
    setNumber('');
    setPhoto(undefined);
    setSongId(null);
    setStart('');
    setEnd('');
    setAnnouncerId(null);
    setDelay('');
    document.querySelector('.content')?.scrollTo(0, 0);
  }

  /** QA: render the finished walk-up (clip + fade + announcer) to one WAV, with a report and a player. */
  async function runExport() {
    if (!song || timeError || delayError) return;
    setMixBusy(true);
    setMixError(null);
    setMix(null);
    try {
      const res = await exportWalkUpMix(team!, { id: existing?.id ?? 'preview', name: name || 'Player', clipStart: startSec ?? 0, clipEnd: endSec, walkUpSongId: songId, announcerSongId: announcerId, announcerDelay: delay.trim() ? delaySec : undefined });
      setMix({ ...res, url: URL.createObjectURL(res.blob) });
    } catch (e) {
      const code = e instanceof MixError ? e.code : 'failed';
      setMixError(
        {
          'no-song': 'Choose a walk-up song first.',
          spotify: "Spotify songs can't be exported — only audio stored on this device.",
          missing: "The song's audio isn't on this device. Choose the file again in Songs.",
          unsupported: "This browser couldn't decode that audio file.",
          failed: "Couldn't render the mix.",
        }[code],
      );
    } finally {
      setMixBusy(false);
    }
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
  const overCap = !timeError && endSec != null && startSec != null && endSec - startSec > MAX_CLIP_SECONDS;
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
        <button className="btn-text strong" onClick={() => save()} disabled={dirtyName || !!timeError || !!delayError}>
          Save
        </button>
      }
    >
      <Section>
        <div className="avatar-row">
          <button className="avatar" onClick={() => photoInput.current?.click()} aria-label="Choose photo">
            {photo ? <img src={photo} alt="" /> : <span>{name.trim() ? name.trim()[0].toUpperCase() : '+'}</span>}
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
            <span className="row-title"><Icon name="music" size={18} /> {song ? song.name : 'Choose a song'}</span>
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
              <Icon name="external" size={18} /> Open in Spotify
            </a>
          </p>
        )}
      </Section>

      <Section title="Announcer (optional)" hint="A recording of the name being spoken. It plays over the walk-up music and the music dips while it talks.">
        <button className="row pick" onClick={() => setPickingAnnouncer(true)}>
          <span className="grow">
            <span className="row-title"><Icon name="mic" size={18} /> {announcer ? announcer.name : 'Add announcer recording'}</span>
            <span className="row-sub">
              {announcer ? (audioIds.has(announcer.localReference ?? announcer.id) ? `On this device${announcer.duration ? ` · ${announcer.duration.toFixed(1)}s` : ''}` : 'Audio missing on this device') : 'e.g. “Now batting… number 7… Brevan Sun!”'}
            </span>
          </span>
          <span aria-hidden="true">›</span>
        </button>
        {announcer && (
          <>
            <label className="label" htmlFor="adelay">Announcer starts (seconds after the music starts; blank = team setting)</label>
            <input id="adelay" className="field mono" value={delay} onChange={(e) => setDelay(e.target.value)} inputMode="decimal" placeholder={String(team.settings.announcerDelay)} />
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
          {timeError ? <p className="error-text">{timeError}</p> : clip && (
              <p className="hint">
                Plays {formatTime(clip.start)}–{formatTime(clip.end)} ({Math.round(clip.duration)} seconds).
                {overCap && ` Walk-ups are limited to ${MAX_CLIP_SECONDS} seconds, so it stops there.`}
              </p>
            )}
          <button className={`btn wide ${testing ? 'btn-stop' : 'btn-primary'}`} onClick={() => (testing ? playback.stopAll() : test())} disabled={!!timeError}>
            <Icon name={testing ? 'stop' : 'play'} size={18} /> {testing ? 'Stop test' : 'Test this clip'}
          </button>
          {audio.status === 'error' && audio.error === 'missing' && <p className="error-text">Walk-up song not available on this device.</p>}
        </Section>
      )}

      {song?.sourceType === 'local' && (
        <Section title="QA export" hint="Renders the finished walk-up — music clip, fade-out and announcer mixed together — as one WAV file, built the same way as playback in the game.">
          <button className="btn wide" onClick={() => void runExport()} disabled={mixBusy || !!timeError || !!delayError || !renderSupported()}>
            <Icon name="box" size={20} /> {mixBusy ? 'Rendering…' : 'Export mixed audio (WAV)'}
          </button>
          {!renderSupported() && <p className="error-text">This browser can't render audio offline.</p>}
          {mixError && <p className="error-text">{mixError}</p>}
          {mix && (
            <div className="mixcard">
              <audio controls src={mix.url} preload="metadata" />
              <dl>
                <dt>File</dt>
                <dd>{mix.filename}</dd>
                <dt>Length</dt>
                <dd>{mix.report.durationSeconds.toFixed(1)} s</dd>
                <dt>Peak</dt>
                <dd className={mix.report.clipped ? 'warn-text' : ''}>
                  {Number.isFinite(mix.report.peakDb) ? `${mix.report.peakDb.toFixed(1)} dBFS` : 'silent'}
                  {mix.report.clipped ? ' — at full scale (lower the announcer volume)' : ''}
                </dd>
                <dt>Music</dt>
                <dd>
                  {mix.report.songName} from {formatTime(mix.report.clipStart)}
                  {mix.report.fadeOut > 0 ? `, ${mix.report.fadeOut}s fade-out` : ', no fade-out'}
                </dd>
                <dt>Announcer</dt>
                <dd>
                  {mix.report.announcerName
                    ? mix.report.announcerMissing
                      ? `${mix.report.announcerName} — audio missing, not included`
                      : `${mix.report.announcerName}, ${mix.report.announcerStartsAt?.toFixed(1)}–${mix.report.announcerEndsAt?.toFixed(1)} s, ${mix.report.gain}× volume, music dipped to ${Math.round((mix.report.duck ?? 1) * 100)}%`
                    : 'none'}
                </dd>
              </dl>
              <button className="btn btn-primary wide" onClick={() => void shareOrDownload(mix.filename, mix.blob, 'audio/wav')}>
                <Icon name="external" size={20} /> Save / share WAV
              </button>
            </div>
          )}
        </Section>
      )}

      {!existing && (
        <Section>
          <button className="btn wide" onClick={saveAndNew} disabled={dirtyName || !!timeError || !!delayError}>
            <Icon name="plus" size={20} /> Save & add another
          </button>
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
