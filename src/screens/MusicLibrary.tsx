import { useRef, useState } from 'react';
import { ACCEPTED_AUDIO } from '../audio/metadata';
import { formatTime } from '../core/format';
import { spotifyOpenUrl } from '../core/songs';
import type { Song } from '../core/types';
import { playback, store } from '../state/app';
import { useAppState, usePlayback } from '../state/hooks';
import { Banner, Screen, Section, useConfirm } from '../components/ui';
import { MissingAudio } from '../components/MissingAudio';

export function MusicLibrary() {
  const { songs, audioIds, teams } = useAppState();
  const { audio } = usePlayback();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [spName, setSpName] = useState('');
  const [spUri, setSpUri] = useState('');
  const confirm = useConfirm();

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setMessage(null);
    try {
      const added = await store.addLocalSongs([...files]);
      setMessage(`Added ${added.length} song${added.length === 1 ? '' : 's'}.`);
    } catch {
      setMessage('Could not add one of those files. Check that it is an MP3, M4A or WAV and that there is free storage.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  const spValid = !!spName.trim() && !!spotifyOpenUrl({ spotifyUri: spUri });
  const sorted = [...songs].sort((a, b) => a.name.localeCompare(b.name));
  const usedBy = (s: Song) => teams.filter((t) => t.players.some((p) => p.walkUpSongId === s.id) || t.defensePlaylists.some((pl) => pl.songIds.includes(s.id))).map((t) => t.name);

  return (
    <Screen title="Songs">
      <Section hint="Audio is copied into this app's private storage on your iPhone, so it plays with no signal. MP3, M4A/AAC and WAV work in Safari.">
        <input ref={input} type="file" accept={ACCEPTED_AUDIO} multiple hidden onChange={(e) => void addFiles(e.target.files)} />
        <button className="btn btn-primary wide big" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Adding…' : '＋ ADD MUSIC'}
        </button>
        {message && <Banner>{message}</Banner>}
      </Section>

      <MissingAudio />

      <Section title={`Library (${songs.length})`}>
        {sorted.length === 0 && <p className="muted">No songs yet. Tap “Add Music” and choose files from the Files app.</p>}
        <ul className="list">
          {sorted.map((s) => {
            const local = s.sourceType === 'local';
            const has = local && audioIds.has(s.localReference ?? s.id);
            const playingThis = audio.track?.key === s.id && audio.track.ref === 'preview' && audio.status !== 'idle';
            const url = spotifyOpenUrl(s);
            return (
              <li key={s.id} className="card">
                <div className="row">
                  <button className="grow plain" onClick={() => setOpen(open === s.id ? null : s.id)} aria-expanded={open === s.id}>
                    <span className="row-title">{s.name}</span>
                    <span className="row-sub">
                      {local ? (has ? `On this device${s.duration ? ` · ${formatTime(s.duration)}` : ''}` : '⚠ Audio missing – choose the file again') : 'Spotify reference (not playable here)'}
                    </span>
                  </button>
                  {has && (
                    <button className={`btn btn-small ${playingThis ? 'btn-stop' : ''}`} onClick={() => (playingThis ? playback.stopAll() : playback.previewSong(s))}>
                      {playingThis ? '⏹' : '▶'}
                    </button>
                  )}
                  {!local && url && (
                    <a className="btn btn-small btn-spotify" href={url} target="_blank" rel="noopener noreferrer">
                      ↗
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
                      onClick={() => confirm.ask({ title: `Delete “${s.name}”?`, message: 'It will be removed from all players and playlists and the audio deleted from this device.', confirmLabel: 'Delete', danger: true }, () => void store.deleteSong(s.id))}
                    >
                      Delete song
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

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
          Add Spotify reference
        </button>
      </Section>
      {confirm.dialog}
    </Screen>
  );
}
