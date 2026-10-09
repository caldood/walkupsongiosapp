import { useRef, useState } from 'react';
import { ACCEPTED_AUDIO } from '../audio/metadata';
import { formatTime } from '../core/format';
import { spotifyOpenUrl } from '../core/songs';
import type { Song } from '../core/types';
import { playback, store } from '../state/app';
import { useAppState, usePlayback } from '../state/hooks';
import { Banner, Screen, Section, useConfirm } from '../components/ui';
import { KindIcon } from '../components/KindIcon';
import { MissingAudio } from '../components/MissingAudio';
import { Icon } from '../components/icons';

type Kind = 'music' | 'announcer';

const COPY: Record<Kind, { title: string; short: string; blurb: string; add: string; empty: string }> = {
  music: {
    title: 'Songs',
    short: 'Songs',
    blurb: 'Walk-up music. A batter’s clip plays when you tap their name.',
    add: 'Add songs',
    empty: 'No songs yet. Tap “Add songs” and choose MP3, M4A or WAV files from the Files app.',
  },
  announcer: {
    title: 'Announcer voices',
    short: 'Voices',
    blurb: 'Recordings of a player’s name being spoken. They play over the walk-up music.',
    add: 'Add announcer voices',
    empty: 'No announcer voices yet. Record “Now batting… number 7… Brevan Sun!” on your phone and add the file here.',
  },
};

export function MusicLibrary() {
  const { songs, audioIds, teams } = useAppState();
  const { audio } = usePlayback();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>('music');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [spName, setSpName] = useState('');
  const [spUri, setSpUri] = useState('');
  const confirm = useConfirm();

  const isVoice = (s: Song) => s.role === 'announcer';
  const counts = { music: songs.filter((s) => !isVoice(s)).length, announcer: songs.filter(isVoice).length };
  const copy = COPY[kind];

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setMessage(null);
    try {
      const added = await store.addLocalSongs([...files], kind === 'announcer' ? { role: 'announcer' } : {});
      const noun = kind === 'announcer' ? 'announcer voice' : 'song';
      setMessage(`Added ${added.length} ${noun}${added.length === 1 ? '' : 's'}.`);
    } catch {
      setMessage('Could not add one of those files. Check that it is an MP3, M4A or WAV and that there is free storage.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  function switchKind(k: Kind) {
    setKind(k);
    setOpen(null);
    setMessage(null);
  }

  const spValid = !!spName.trim() && !!spotifyOpenUrl({ spotifyUri: spUri });
  const list = songs.filter((s) => (kind === 'announcer' ? isVoice(s) : !isVoice(s))).sort((a, b) => a.name.localeCompare(b.name));
  const usedBy = (s: Song) => teams.filter((t) => t.players.some((p) => p.walkUpSongId === s.id || p.announcerSongId === s.id)).map((t) => t.name);

  return (
    <Screen title="Songs & voices">
      <div className="kind-tabs" role="tablist" aria-label="Library">
        {(['music', 'announcer'] as Kind[]).map((k) => (
          <button key={k} role="tab" aria-selected={kind === k} className={`kind-tab ${k} ${kind === k ? 'on' : ''}`} onClick={() => switchKind(k)}>
            <KindIcon kind={k} size={40} />
            <span className="kt-text">
              <b>{COPY[k].short}</b>
              <small>{counts[k]} {k === 'music' ? (counts[k] === 1 ? 'song' : 'songs') : counts[k] === 1 ? 'voice' : 'voices'}</small>
            </span>
          </button>
        ))}
      </div>

      <MissingAudio />

      <section className={`kind-panel ${kind}`} role="tabpanel" aria-label={copy.title}>
        <div className="kind-head">
          <KindIcon kind={kind} size={48} />
          <div>
            <h2>{copy.title}</h2>
            <p>{copy.blurb}</p>
          </div>
        </div>
        <input ref={input} type="file" accept={ACCEPTED_AUDIO} multiple hidden onChange={(e) => void addFiles(e.target.files)} />
        <button className={`btn wide big add-${kind}`} disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Adding…' : <><Icon name="plus" size={22} /> {copy.add}</>}
        </button>
        {message && <Banner>{message}</Banner>}
        <p className="hint">Audio is copied into this app's private storage on your device, so it plays with no signal. MP3, M4A/AAC and WAV work in Safari.</p>
      </section>

      <Section title={`${copy.title} (${list.length})`}>
        {list.length === 0 && (
          <div className="lib-empty">
            <KindIcon kind={kind} size={56} />
            <p>{copy.empty}</p>
          </div>
        )}
        <ul className="list">
          {list.map((s) => {
            const local = s.sourceType === 'local';
            const has = local && audioIds.has(s.localReference ?? s.id);
            const playingThis = audio.track?.key === s.id && audio.track.ref === 'preview' && audio.status !== 'idle';
            const url = spotifyOpenUrl(s);
            return (
              <li key={s.id} className={`card lib-item ${isVoice(s) ? 'announcer' : 'music'}`}>
                <div className="row">
                  <KindIcon kind={!local ? 'spotify' : isVoice(s) ? 'announcer' : 'music'} size={42} />
                  <button className="grow plain" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
                    <span className="row-title">{s.name}</span>
                    <span className="row-sub">
                      {local ? (has ? `On this device${s.duration ? ` · ${formatTime(s.duration)}` : ''}` : 'Audio missing – choose the file again') : 'Spotify link (opens in Spotify)'}
                    </span>
                  </button>
                  {has && (
                    <button className={`btn btn-small ${playingThis ? 'btn-stop' : ''}`} aria-label={`${playingThis ? 'Stop' : 'Play'} ${s.name}`} onClick={() => (playingThis ? playback.stopAll() : playback.previewSong(s, store.activeTeam?.settings.fadeOutSeconds))}>
                      <Icon name={playingThis ? 'stop' : 'play'} size={18} />
                    </button>
                  )}
                  {!local && url && (
                    <a className="btn btn-small btn-spotify" href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${s.name} in Spotify`}>
                      <Icon name="external" size={18} />
                    </a>
                  )}
                </div>
                {open === s.id && (
                  <div className="card-body">
                    <label className="label" htmlFor={`n-${s.id}`}>Name</label>
                    <input id={`n-${s.id}`} className="field" defaultValue={s.name} onBlur={(e) => e.target.value.trim() && store.updateSong({ ...s, name: e.target.value.trim() })} />
                    {s.filename && <p className="hint">File: {s.filename}</p>}
                    {usedBy(s).length > 0 && <p className="hint">Used by: {usedBy(s).join(', ')}</p>}
                    <button
                      className="btn btn-danger"
                      onClick={() => confirm.ask({ title: `Delete “${s.name}”?`, message: `It will be removed from all players and the audio deleted from this device.`, confirmLabel: 'Delete', danger: true }, () => void store.deleteSong(s.id))}
                    >
                      <Icon name="trash" size={18} /> Delete {isVoice(s) ? 'voice' : 'song'}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      {kind === 'music' && (
        <Section title="Spotify (optional reference)" hint="Spotify audio can't be saved or played inside this app. You can keep a link and tap “Open in Spotify” — it needs internet and the Spotify app.">
          <label className="label" htmlFor="spn">Song name</label>
          <input id="spn" className="field" value={spName} onChange={(e) => setSpName(e.target.value)} placeholder="Enter Sandman" />
          <label className="label" htmlFor="spu">Spotify link or URI</label>
          <input id="spu" className="field" value={spUri} onChange={(e) => setSpUri(e.target.value)} placeholder="https://open.spotify.com/track/… or spotify:track:…" autoCapitalize="off" autoCorrect="off" />
          <button
            className="btn wide"
            disabled={!spValid}
            onClick={() => {
              store.addSpotifySong(spName, spUri);
              setSpName('');
              setSpUri('');
            }}
          >
            <Icon name="external" size={18} /> Add Spotify link
          </button>
        </Section>
      )}
      {confirm.dialog}
    </Screen>
  );
}
