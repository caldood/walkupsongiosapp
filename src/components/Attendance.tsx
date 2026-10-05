import { benchPlayers, lineup } from '../core/battingOrder';
import { store } from '../state/app';
import { useActiveTeam } from '../state/hooks';
import { Avatar, Toggle } from './ui';

/**
 * "Who's here today?" – flip anyone on or off the bench. Benched players are skipped in Game Mode and keep
 * their slot in the batting order, so turning them back on puts them where they were.
 */
export function Attendance({ onClose }: { onClose(): void }) {
  const team = useActiveTeam();
  if (!team) return null;
  const batting = lineup(team).length;
  const benched = new Set(benchPlayers(team).map((p) => p.id));
  // Show everyone in batting-order order (benched players keep their slot), then anyone never in the order.
  const ordered = [...team.battingOrder.map((id) => team.players.find((p) => p.id === id)), ...team.players.filter((p) => !team.battingOrder.includes(p.id))].filter(
    (p): p is NonNullable<typeof p> => !!p,
  );

  return (
    <div className="modal-backdrop sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Who's here today" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Who's here today?</h2>
          <button className="btn-text" onClick={onClose}>
            Done
          </button>
        </div>
        <p className="hint">
          <b>{batting}</b> of {team.players.length} batting. Players you switch off sit on the bench and are skipped; switching them back on returns them to their spot in the order.
        </p>
        <div className="group">
          {ordered.map((p) => (
            <div key={p.id} className="row attend-row">
              <Avatar name={p.name} photo={p.photo} size={38} />
              <Toggle label={`${p.number ? `#${p.number} ` : ''}${p.name}`} hint={benched.has(p.id) ? 'On the bench' : 'Batting'} checked={!benched.has(p.id)} onChange={(v) => store.setInLineup(p.id, v)} />
            </div>
          ))}
          {ordered.length === 0 && <p className="hint" style={{ padding: 12 }}>No players yet.</p>}
        </div>
        <button className="btn wide" onClick={() => store.setEveryonePresent()} disabled={benched.size === 0}>
          Everyone's here
        </button>
      </div>
    </div>
  );
}
