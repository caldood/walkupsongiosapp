import { benchPlayers, lineup } from '../core/battingOrder';
import { store } from '../state/app';
import { useActiveTeam, useAppState } from '../state/hooks';
import { useNav } from '../Nav';
import { EmptyState, Screen, Section } from '../components/ui';

/** Roster + batting order. Simple up/down controls (big, reliable on touch). */
export function Players() {
  const team = useActiveTeam();
  const { songs } = useAppState();
  const nav = useNav();
  if (!team) {
    return (
      <Screen title="Players">
        <EmptyState title="No team yet" action={<button className="btn btn-primary" onClick={() => nav.go({ name: 'teams' })}>Create a team</button>} />
      </Screen>
    );
  }
  const order = lineup(team);
  const bench = benchPlayers(team);
  const songName = (id?: string | null) => songs.find((s) => s.id === id)?.name;

  return (
    <Screen title="Players" right={<button className="btn-text strong" onClick={() => nav.go({ name: 'player-edit' })}>＋ Add</button>}>
      <p className="team-label">{team.name}</p>
      <Section title="Batting order" hint="Use ▲ ▼ to reorder. Tap a player to edit their song and clip.">
        {order.length === 0 && <p className="muted">No one in the batting order yet.</p>}
        <ol className="order">
          {order.map((p, i) => (
            <li key={p.id} className="row player-row">
              <span className="pos">{i + 1}</span>
              <button className="grow plain" onClick={() => nav.go({ name: 'player-edit', playerId: p.id })}>
                <span className="row-title">
                  <span className="num">#{p.number || '–'}</span> {p.name}
                </span>
                <span className="row-sub">🎵 {songName(p.walkUpSongId) ?? 'No song'}</span>
              </button>
              <div className="stack">
                <button className="btn-icon sm" onClick={() => store.moveBatter(i, -1)} disabled={i === 0} aria-label={`Move ${p.name} up`}>
                  ▲
                </button>
                <button className="btn-icon sm" onClick={() => store.moveBatter(i, 1)} disabled={i === order.length - 1} aria-label={`Move ${p.name} down`}>
                  ▼
                </button>
              </div>
              <button className="btn-icon sm" onClick={() => store.setInLineup(p.id, false)} aria-label={`Move ${p.name} to bench`} title="Move to bench">
                ✕
              </button>
            </li>
          ))}
        </ol>
      </Section>
      {bench.length > 0 && (
        <Section title="Bench" hint="Players not batting today. Tap ＋ to add them to the bottom of the order.">
          <ul className="list">
            {bench.map((p) => (
              <li key={p.id} className="row player-row">
                <button className="grow plain" onClick={() => nav.go({ name: 'player-edit', playerId: p.id })}>
                  <span className="row-title">
                    <span className="num">#{p.number || '–'}</span> {p.name}
                  </span>
                  <span className="row-sub">🎵 {songName(p.walkUpSongId) ?? 'No song'}</span>
                </button>
                <button className="btn btn-small" onClick={() => store.setInLineup(p.id, true)}>
                  ＋ Batting
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Screen>
  );
}
