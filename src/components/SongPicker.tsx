import { useRef, useState } from 'react';
import { ACCEPTED_AUDIO } from '../audio/metadata';
import { formatTime } from '../core/format';
import type { Song } from '../core/types';
import { store } from '../state/app';
import { useAppState } from '../state/hooks';

/** Bottom-sheet song chooser: pick from the library, or add new audio files on the spot. */
export function SongPicker({
  title = 'Choose a song',
  selectedIds = [],
  allowSpotify = true,
  role = 'music',
  onPick,
  onClose,
}: {
  title?: string;
  selectedIds?: string[];
  allowSpotify?: boolean;
  /** Which kind of library item to show/add. Announcer clips are kept apart from music. */
  role?: 'music' | 'announcer';
  onPick(song: Song): void;
  onClose(): void;
}) {
  const { songs, audioIds } = useAppState();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();
  const list = songs
      .filter((s) => (s.role ?? 'music') === role && (allowSpotify || s.sourceType === 'local') && (!q || `${s.name} ${s.artist ?? ''} ${s.filename}`.toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name));

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      const added = await store.addLocalSongs([...files], role === 'announcer' ? { role } : {});
      if (added.length === 1) onPick(added[0]);
    } catch {
      setError('Could not add that file. Make sure it is an MP3, M4A or WAV and that the device has free storage.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="modal-backdrop sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="btn-text" onClick={onClose}>
            Close
          </button>
        </div>
        <input className="field" type="search" placeholder="Search songs" value={query} onChange={(e) => setQuery(e.target.value)} />
        <input ref={input} type="file" accept={ACCEPTED_AUDIO} multiple hidden onChange={(e) => void addFiles(e.target.files)} />
        <button className="btn btn-primary wide" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Adding…' : role === 'announcer' ? '＋ Add announcer recording' : '＋ Add audio file'}
        </button>
        {error && <p className="error-text">{error}</p>}
        <ul className="list">
          {list.map((s) => {
            const playable = s.sourceType === 'local' && audioIds.has(s.localReference ?? s.id);
            return (
              <li key={s.id}>
                <button className={`row pick ${selectedIds.includes(s.id) ? 'selected' : ''}`} onClick={() => onPick(s)}>
                  <span className="grow">
                    <span className="row-title">{s.name}</span>
                    <span className="row-sub">
                      {s.sourceType === 'spotify' ? 'Spotify link (opens Spotify)' : playable ? `On this device${s.duration ? ` · ${formatTime(s.duration)}` : ''}` : 'Audio missing – re-select the file'}
                    </span>
                  </span>
                  {selectedIds.includes(s.id) && <span aria-label="selected">✓</span>}
                </button>
              </li>
            );
          })}
          {list.length === 0 && (
            <li className="hint">{role === 'announcer' ? 'No announcer recordings yet. Add an audio file of the name being spoken.' : 'No songs yet. Add an audio file from your phone.'}</li>
          )}
        </ul>
      </div>
    </div>
  );
}
