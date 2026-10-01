import { useRef, useState } from 'react';
import { ACCEPTED_AUDIO } from '../audio/metadata';
import { store } from '../state/app';
import { useActiveTeam, useAppState } from '../state/hooks';
import { Banner } from './ui';

/**
 * Lists the active team's songs whose audio isn't on this device (typical after importing a team)
 * and lets the user re-select the files; they're matched back to songs by file name.
 */
export function MissingAudio() {
  useAppState();
  const team = useActiveTeam();
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const missing = store.missingSongs(team);
  if (!missing.length && !result) return null;

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const r = await store.relinkFiles([...files]);
      setResult(
        r.unmatched.length
          ? `Matched ${r.matched}. Not recognised: ${r.unmatched.join(', ')} (file names must match the original).`
          : `Matched ${r.matched} file${r.matched === 1 ? '' : 's'}.`,
      );
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <>
      {missing.length > 0 && (
        <Banner
          kind="warn"
          action={
            <button className="btn btn-small" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? 'Matching…' : 'Choose files'}
            </button>
          }
        >
          <strong>{missing.length} song{missing.length === 1 ? '' : 's'} missing on this device</strong>
          <ul className="missing-list">
            {missing.map((s) => (
              <li key={s.id}>{s.filename || s.name}</li>
            ))}
          </ul>
          Pick the audio files again – they're matched by file name.
        </Banner>
      )}
      {result && <Banner>{result}</Banner>}
      <input ref={input} type="file" accept={ACCEPTED_AUDIO} multiple hidden onChange={(e) => void onFiles(e.target.files)} />
    </>
  );
}
