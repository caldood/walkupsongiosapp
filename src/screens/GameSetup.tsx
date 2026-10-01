import { useState } from 'react';
import { benchPlayers, lineup } from '../core/battingOrder';
import { isPlayable } from '../core/songs';
import { playback, store } from '../state/app';
import { switchMode, preloadBatters, walkUpRequest } from '../state/gameActions';
import { useActiveTeam, useAppState } from '../state/hooks';
import { useNav } from '../Nav';
import { Screen, Section } from '../components/ui';
import { MissingAudio } from '../components/MissingAudio';
import { SongPicker } from '../components/SongPicker';
import { SortableList } from '../components/SortableList';

const STEPS = ['Team', 'Batting order', 'Songs', 'Defense playlist', 'Go!'];

// Remembered across navigation (e.g. Add player → back) so the wizard doesn't jump to step 1.
let rememberedStep = 0;
export const restartSetupWizard = () => {
  rememberedStep = 0;
};

/** Pre-game setup: five quick steps, everything is remembered afterwards. */
export function GameSetup() {
  const { teams, settings, audioIds } = useAppState();
  const team = useActiveTeam();
  const nav = useNav();
  const [step, setStepState] = useState(rememberedStep);
  const setStep = (n: number) => {
    rememberedStep = n;
    setStepState(n);
  };
  const [pickFor, setPickFor] = useState<string | null>(null);

  const order = team ? lineup(team) : [];
  const canNext = step === 0 ? !!team : step === 1 ? order.length > 0 : true;
  const missing = store.missingSongs(team);

  return (
    <Screen title="Game setup">
      <ol className="steps" aria-label="Setup steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
            <span>{i + 1}</span>
          </li>
        ))}
      </ol>
      <h2 className="step-title">{STEPS[step]}</h2>

      {step === 0 && (
        <Section hint="Pick the team playing today.">
          <ul className="list">
            {teams.map((t) => (
              <li key={t.id}>
                <button className={`row pick ${t.id === settings.activeTeamId ? 'selected' : ''}`} onClick={() => store.selectTeam(t.id)}>
                  <span className="grow">
                    <span className="row-title">{t.name}</span>
                    <span className="row-sub">{t.players.length} players</span>
                  </span>
                  {t.id === settings.activeTeamId && <span>✓</span>}
                </button>
              </li>
            ))}
          </ul>
          <button className="btn wide" onClick={() => nav.go({ name: 'teams' })}>＋ Create or import a team</button>
        </Section>
      )}

      {step === 1 && team && (
        <Section hint="Drag ⠿ to reorder. Players who aren't here today can sit on the bench.">
          <SortableList
            items={order}
            getKey={(p) => p.id}
            label={(p) => p.name}
            onMove={(from, to) => store.reorderBatter(from, to)}
            render={(p, i, handle) => (
              <>
                {handle}
                <span className="pos">{i + 1}</span>
                <span className="grow row-title"><span className="num">#{p.number || '–'}</span> {p.name}</span>
                <button className="btn-icon sm" onClick={() => store.setInLineup(p.id, false)} aria-label={`Bench ${p.name}`}>✕</button>
              </>
            )}
          />
          {benchPlayers(team).map((p) => (
            <div key={p.id} className="row player-row muted-row">
              <span className="grow row-title"><span className="num">#{p.number || '–'}</span> {p.name} <span className="muted">(bench)</span></span>
              <button className="btn btn-small" onClick={() => store.setInLineup(p.id, true)}>＋ Batting</button>
            </div>
          ))}
          <button className="btn wide" onClick={() => nav.go({ name: 'player-edit' })}>＋ Add player</button>
        </Section>
      )}

      {step === 2 && team && (
        <Section hint="Tap ▶ to hear each walk-up. Tap a row to change the song.">
          <MissingAudio />
          <ul className="list">
            {order.map((p) => {
              const song = store.song(p.walkUpSongId);
              const ok = isPlayable(song, audioIds) || song?.sourceType === 'spotify';
              return (
                <li key={p.id} className="row player-row">
                  <button className="grow plain" onClick={() => setPickFor(p.id)}>
                    <span className="row-title"><span className="num">#{p.number || '–'}</span> {p.name}</span>
                    <span className={`row-sub ${ok ? '' : 'warn-text'}`}>{song ? `${ok ? '🎵' : '⚠'} ${song.name}${ok ? '' : ' – audio missing'}` : '⚠ No song yet'}</span>
                  </button>
                  {song?.sourceType === 'local' && ok && (
                    <button
                      className="btn btn-small"
                      onClick={() => {
                        const req = walkUpRequest(team, p, { preview: true });
                        if (typeof req !== 'string') playback.playWalkUp(req);
                      }}
                    >
                      ▶ Test
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {pickFor && (
            <SongPicker
              title="Walk-up song"
              selectedIds={[team.players.find((p) => p.id === pickFor)?.walkUpSongId ?? '']}
              onClose={() => setPickFor(null)}
              onPick={(s) => {
                store.assignWalkUp(pickFor, s.id);
                setPickFor(null);
              }}
            />
          )}
        </Section>
      )}

      {step === 3 && team && (
        <Section hint="Defense Mode plays this playlist.">
          {team.defensePlaylists.length === 0 && <p className="muted">No playlists yet.</p>}
          <ul className="list">
            {team.defensePlaylists.map((pl) => (
              <li key={pl.id}>
                <button className={`row pick ${pl.id === team.activeDefensePlaylistId ? 'selected' : ''}`} onClick={() => store.setActivePlaylist(pl.id)}>
                  <span className="grow">
                    <span className="row-title">{pl.name}</span>
                    <span className="row-sub">{pl.songIds.length} songs</span>
                  </span>
                  {pl.id === team.activeDefensePlaylistId && <span>✓</span>}
                </button>
              </li>
            ))}
          </ul>
          <button className="btn wide" onClick={() => nav.go({ name: 'playlists' })}>Edit playlists</button>
        </Section>
      )}

      {step === 4 && team && (
        <Section>
          <div className="summary">
            <p><strong>{team.name}</strong></p>
            <p>{order.length} batter{order.length === 1 ? "" : "s"} · default walk-up {team.settings.defaultClipSeconds}s</p>
            <p>Defense: {team.defensePlaylists.find((p) => p.id === team.activeDefensePlaylistId)?.name ?? 'none'}</p>
            {missing.length > 0 ? <p className="warn-text">⚠ {missing.length} song(s) missing on this device.</p> : <p>✓ All songs ready.</p>}
          </div>
          <p className="hint">Connect your Bluetooth speaker now, then check the sound with Settings › Test speaker.</p>
          <button className="btn-giant btn-play" onClick={() => { restartSetupWizard(); store.resetGame(); preloadBatters(); switchMode('walkup'); nav.go({ name: 'game' }); }}>
            ENTER GAME MODE
          </button>
        </Section>
      )}

      <div className="wizard-nav">
        <button className="btn" onClick={() => (step === 0 ? nav.back() : setStep(step - 1))}>{step === 0 ? 'Cancel' : '‹ Back'}</button>
        {step < STEPS.length - 1 && (
          <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Next ›</button>
        )}
      </div>
    </Screen>
  );
}
