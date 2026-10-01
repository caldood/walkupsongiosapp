import { useState } from 'react';
import { lineup } from '../core/battingOrder';
import { store } from '../state/app';
import { useAppState } from '../state/hooks';
import { useNav } from '../Nav';
import { Screen, Section, useConfirm } from '../components/ui';

/** Team setup: create, switch, edit, duplicate, delete. */
export function TeamSelector() {
  const { teams, settings } = useAppState();
  const nav = useNav();
  const [name, setName] = useState('');
  const confirm = useConfirm();

  return (
    <Screen title="Teams">
      <Section title="New team">
        <div className="pair">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Del Mar Little League" aria-label="Team name" />
          <button className="btn btn-primary" disabled={!name.trim()} onClick={() => { store.createTeam(name); setName(''); }}>
            Create
          </button>
        </div>
      </Section>
      <Section title="Your teams" hint="The selected team is the one Game Mode uses.">
        {teams.length === 0 && <p className="muted">No teams yet.</p>}
        <ul className="list">
          {teams.map((t) => {
            const active = t.id === settings.activeTeamId;
            return (
              <li key={t.id} className={`card ${active ? 'active' : ''}`}>
                <button className="row pick" onClick={() => store.selectTeam(t.id)} aria-pressed={active}>
                  <span className="grow">
                    <span className="row-title">{t.name}</span>
                    <span className="row-sub">{t.players.length} players · {lineup(t).length} batting · {t.defensePlaylists.length} playlists</span>
                  </span>
                  {active && <span className="tag">SELECTED</span>}
                </button>
                <div className="card-actions">
                  <button className="btn btn-small" onClick={() => nav.go({ name: 'team-edit', teamId: t.id })}>Edit</button>
                  <button className="btn btn-small" onClick={() => store.duplicateTeam(t.id)}>Duplicate</button>
                  <button
                    className="btn btn-small btn-danger"
                    onClick={() => confirm.ask({ title: `Delete ${t.name}?`, message: 'Players, batting order and playlists for this team will be removed. Songs stay in your library.', confirmLabel: 'Delete team', danger: true }, () => store.deleteTeam(t.id))}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>
      <Section>
        <button className="btn wide" onClick={() => nav.go({ name: 'transfer' })}>Import / export a team</button>
      </Section>
      {confirm.dialog}
    </Screen>
  );
}

export function TeamEditor({ teamId }: { teamId: string }) {
  const { teams } = useAppState();
  const team = teams.find((t) => t.id === teamId);
  if (!team) return <Screen title="Team"><p className="muted">That team no longer exists.</p></Screen>;
  return (
    <Screen title="Edit team">
      <Section>
        <label className="label" htmlFor="tn">Team name</label>
        <input id="tn" className="field" defaultValue={team.name} onBlur={(e) => store.renameTeam(team.id, e.target.value)} />
      </Section>
      <Section hint="Open Settings to change playback options for the selected team.">
        <p className="muted">{team.players.length} players · {team.defensePlaylists.length} defense playlists</p>
      </Section>
    </Screen>
  );
}
