import { useState } from 'react';
import { playTestTone, wakeLockSupported } from '../audio/platform';
import { requestPersistentStorage } from '../storage/idbRepository';
import { store } from '../state/app';
import { resetGame } from '../state/gameActions';
import { useActiveTeam, useAppState } from '../state/hooks';
import { useNav } from '../Nav';
import { Banner, Screen, Section, Segmented, Toggle, useConfirm } from '../components/ui';
import { TeamSettingsForm } from '../components/TeamSettingsForm';

export function Settings() {
  const { settings, storageError } = useAppState();
  const team = useActiveTeam();
  const nav = useNav();
  const confirm = useConfirm();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [tone, setTone] = useState(false);

  return (
    <Screen title="Settings">
      {storageError && <Banner kind="error">{storageError}</Banner>}

      <Section title={team ? `Playback · ${team.name}` : 'Playback'}>
        {team ? <TeamSettingsForm /> : <p className="muted">Create a team to change playback settings.</p>}
      </Section>

      <Section title="Device">
        <div className="row stacked">
          <span className="row-title">Theme</span>
          <Segmented label="Theme" value={settings.theme} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light (sunny)' }]} onChange={(theme) => store.updateSettings({ theme })} />
        </div>
        <Toggle label="Keep screen awake" hint={wakeLockSupported() ? 'In Game Mode, so the phone doesn’t lock between batters.' : 'Not supported by this browser – set Auto-Lock to Never in iOS Settings.'} checked={settings.keepAwake} onChange={(keepAwake) => store.updateSettings({ keepAwake })} />
        <button
          className="btn wide"
          disabled={tone}
          onClick={async () => {
            setTone(true);
            await playTestTone();
            setTone(false);
          }}
        >
          {tone ? '🔊 Playing…' : '🔊 Test speaker'}
        </button>
      </Section>

      <Section title="Manage">
        <button className="btn wide" onClick={() => nav.go({ name: 'teams' })}>Teams</button>
        <button className="btn wide" onClick={() => nav.go({ name: 'players' })}>Players & batting order</button>
        <button className="btn wide" onClick={() => nav.go({ name: 'songs' })}>Songs</button>
        <button className="btn wide" onClick={() => nav.go({ name: 'playlists' })}>Defense playlists</button>
        <button className="btn wide" onClick={() => nav.go({ name: 'transfer' })}>Import / export team</button>
      </Section>

      <Section title="Game">
        <button
          className="btn btn-danger wide big"
          onClick={() => confirm.ask({ title: 'Reset game?', message: 'Stops the music and returns to inning 1, top, first batter. Your teams, players and songs are not changed.', confirmLabel: 'RESET GAME', danger: true }, () => { resetGame(); nav.back(); })}
        >
          RESET GAME
        </button>
      </Section>

      <Section title="Storage" hint="Songs are stored in this browser's private storage. Safari can clear it if the phone runs very low on space, so add the app to your Home Screen and keep a team export as a backup.">
        <button className="btn wide" onClick={async () => setPersisted(await requestPersistentStorage())}>Ask to keep my data</button>
        {persisted !== null && <p className="hint">{persisted ? 'Storage marked as persistent.' : 'Not granted. Installing to the Home Screen helps.'}</p>}
        <button
          className="btn btn-danger wide"
          onClick={() => confirm.ask({ title: 'Erase all app data?', message: 'Deletes every team, song and saved audio file on this device. Export your teams first. This cannot be undone.', confirmLabel: 'Erase everything', danger: true }, () => void store.eraseAllData())}
        >
          Erase all data
        </button>
      </Section>
      {confirm.dialog}
    </Screen>
  );
}
