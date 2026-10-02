import { CLIP_DURATION_CHOICES, MAX_CLIP_SECONDS } from '../core/types';
import { store } from '../state/app';
import { useActiveTeam } from '../state/hooks';
import { Segmented, Toggle } from './ui';

/** The per-team playback preferences. Shared by Settings and Team editor. */
export function TeamSettingsForm() {
  const team = useActiveTeam();
  if (!team) return null;
  const s = team.settings;
  const options = [...new Set<number>([...CLIP_DURATION_CHOICES, s.defaultClipSeconds])].sort((a, b) => a - b).map((v) => ({ value: v, label: `${v}s` }));
  return (
    <>
      <div className="row stacked">
        <span className="row-title">Default walk-up length</span>
        <Segmented label="Default walk-up length" value={s.defaultClipSeconds} options={options} onChange={(v) => store.updateTeamSettings({ defaultClipSeconds: v })} />
        <span className="row-sub">Used when a player has no custom end time. Walk-ups are capped at {MAX_CLIP_SECONDS} seconds.</span>
      </div>
      <div className="row stacked">
        <span className="row-title">Fade out at the end of a walk-up</span>
        <Segmented
          label="Fade out"
          value={s.fadeOutSeconds ?? 0}
          options={[
            { value: 0, label: 'Off' },
            { value: 1, label: '1s' },
            { value: 2, label: '2s' },
            { value: 3, label: '3s' },
          ]}
          onChange={(v) => store.updateTeamSettings({ fadeOutSeconds: v })}
        />
        <span className="row-sub">The music eases out instead of cutting off.</span>
      </div>
      <div className="row stacked">
        <span className="row-title">Music level while the announcer speaks</span>
        <Segmented
          label="Announcer ducking"
          value={s.announcerDuck}
          options={[
            { value: 1, label: 'No dip' },
            { value: 0.6, label: 'Light' },
            { value: 0.35, label: 'Medium' },
            { value: 0.15, label: 'Strong' },
          ]}
          onChange={(v) => store.updateTeamSettings({ announcerDuck: v })}
        />
        <span className="row-sub">Only applies to players that have an announcer recording.</span>
      </div>
      <Toggle label="Auto advance" hint="When a walk-up finishes, move to the next batter (without playing)." checked={s.autoAdvance} onChange={(v) => store.updateTeamSettings({ autoAdvance: v, ...(v ? {} : { autoPlayNext: false }) })} />
      <Toggle label="Auto play next batter" hint="Also play the next batter's song right away. Off by default." checked={s.autoPlayNext} disabled={!s.autoAdvance} onChange={(v) => store.updateTeamSettings({ autoPlayNext: v })} />
    </>
  );
}
