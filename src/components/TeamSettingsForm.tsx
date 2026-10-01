import { CLIP_DURATION_CHOICES } from '../core/types';
import { playback, store } from '../state/app';
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
        <span className="row-sub">Used when a player has no custom end time.</span>
      </div>
      <Toggle label="Auto advance" hint="When a walk-up finishes, move to the next batter (without playing)." checked={s.autoAdvance} onChange={(v) => store.updateTeamSettings({ autoAdvance: v, ...(v ? {} : { autoPlayNext: false }) })} />
      <Toggle label="Auto play next batter" hint="Also play the next batter's song right away. Off by default." checked={s.autoPlayNext} disabled={!s.autoAdvance} onChange={(v) => store.updateTeamSettings({ autoPlayNext: v })} />
      <Toggle label="Shuffle defense playlist" checked={s.defenseShuffle} onChange={(v) => { store.updateTeamSettings({ defenseShuffle: v }); playback.setDefenseOptions({ shuffle: v }); }} />
      <Toggle label="Repeat defense playlist" checked={s.defenseRepeat} onChange={(v) => { store.updateTeamSettings({ defenseRepeat: v }); playback.setDefenseOptions({ repeat: v }); }} />
    </>
  );
}
