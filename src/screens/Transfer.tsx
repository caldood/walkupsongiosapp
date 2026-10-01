import { useRef, useState } from 'react';
import { ImportError } from '../core/teamTransfer';
import { store } from '../state/app';
import { useActiveTeam } from '../state/hooks';
import { Banner, Screen, Section } from '../components/ui';
import { MissingAudio } from '../components/MissingAudio';

async function shareOrDownload(filename: string, text: string): Promise<'shared' | 'downloaded'> {
  const file = new File([text], filename, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'shared'; // user closed the share sheet
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}

export function Transfer() {
  const team = useActiveTeam();
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [pasted, setPasted] = useState('');

  async function doExport() {
    const text = team && store.exportTeam(team.id);
    if (!team || !text) return;
    const how = await shareOrDownload(`${team.name.replace(/[^\w\- ]+/g, '').trim() || 'team'}.gdm.json`, text);
    setMessage({ kind: 'info', text: how === 'shared' ? 'Team file ready.' : 'Team file downloaded.' });
  }

  function importText(text: string) {
    try {
      const r = store.importTeam(text);
      setMessage({
        kind: 'info',
        text: r.missingSongIds.length
          ? `Imported “${r.team.name}”. ${r.missingSongIds.length} song${r.missingSongIds.length === 1 ? ' needs its' : 's need their'} audio file${r.missingSongIds.length === 1 ? '' : 's'} on this device.`
          : `Imported “${r.team.name}”.`,
      });
      setPasted('');
    } catch (e) {
      setMessage({ kind: 'error', text: e instanceof ImportError ? e.message : 'Could not import that file.' });
    }
  }

  return (
    <Screen title="Import / Export">
      <Section title="Export team" hint="Saves the team's players, batting order, clip times, announcers, settings and song names. Audio files are NOT included — they stay on this phone.">
        <button className="btn btn-primary wide" disabled={!team} onClick={() => void doExport()}>
          Export “{team?.name ?? '—'}”
        </button>
      </Section>
      <Section title="Import team" hint="Creates a new team (nothing is overwritten). Songs you already have are matched by file name; others show as missing until you choose the audio files.">
        <input ref={input} type="file" accept=".json,application/json" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) importText(await f.text());
          e.target.value = '';
        }} />
        <button className="btn wide" onClick={() => input.current?.click()}>Choose team file…</button>
        <label className="label" htmlFor="paste">…or paste team data</label>
        <textarea id="paste" className="field" rows={4} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder='{"format":"game-day-music/team", …}' />
        <button className="btn wide" disabled={!pasted.trim()} onClick={() => importText(pasted)}>Import pasted data</button>
      </Section>
      {message && <Banner kind={message.kind === 'error' ? 'error' : 'info'}>{message.text}</Banner>}
      <MissingAudio />
    </Screen>
  );
}
