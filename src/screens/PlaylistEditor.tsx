import { useState } from 'react';
import { moveInOrder } from '../core/battingOrder';
import { formatTime } from '../core/format';
import { store } from '../state/app';
import { useActiveTeam, useAppState } from '../state/hooks';
import { useNav } from '../Nav';
import { EmptyState, Screen, Section, useConfirm } from '../components/ui';
import { SongPicker } from '../components/SongPicker';

export function PlaylistEditor() {
  const team = useActiveTeam();
  const { songs } = useAppState();
  const nav = useNav();
  const confirm = useConfirm();
  const [newName, setNewName] = useState('');
  const [picking, setPicking] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!team) {
    return (
      <Screen title="Defense playlists">
        <EmptyState title="No team yet" action={<button className="btn btn-primary" onClick={() => nav.go({ name: 'teams' })}>Create a team</button>} />
      </Screen>
    );
  }
  const playlist = team.defensePlaylists.find((p) => p.id === (selectedId ?? team.activeDefensePlaylistId)) ?? team.defensePlaylists[0];
  const song = (id: string) => songs.find((s) => s.id === id);

  return (
    <Screen title="Defense playlists">
      <Section>
        <div className="pair">
          <input className="field" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New playlist name (e.g. Warm-up)" />
          <button
            className="btn btn-primary"
            disabled={!newName.trim()}
            onClick={() => {
              const created = store.savePlaylist({ name: newName });
              setNewName('');
              if (created) setSelectedId(created.id);
            }}
          >
            Create
          </button>
        </div>
      </Section>

      {!playlist ? (
        <p className="muted">No playlists yet. Create one above, then add songs.</p>
      ) : (
        <>
          <div className="chips scroll">
            {team.defensePlaylists.map((p) => (
              <button key={p.id} className={`chip ${p.id === playlist.id ? 'on' : ''}`} onClick={() => setSelectedId(p.id)}>
                {p.name}
                {p.id === team.activeDefensePlaylistId ? ' ★' : ''}
              </button>
            ))}
          </div>
          <Section title={playlist.name} hint={playlist.id === team.activeDefensePlaylistId ? '★ This is the playlist Defense Mode plays.' : undefined}>
            {playlist.id !== team.activeDefensePlaylistId && (
              <button className="btn wide" onClick={() => store.setActivePlaylist(playlist.id)}>
                Use for Defense Mode
              </button>
            )}
            <input className="field" defaultValue={playlist.name} key={playlist.id} aria-label="Playlist name" onBlur={(e) => e.target.value.trim() && store.savePlaylist({ ...playlist, name: e.target.value.trim() })} />
            <ol className="order">
              {playlist.songIds.map((id, i) => {
                const s = song(id);
                return (
                  <li key={`${id}-${i}`} className="row player-row">
                    <span className="pos">{i + 1}</span>
                    <span className="grow">
                      <span className="row-title">{s?.name ?? 'Missing song'}</span>
                      <span className="row-sub">{s?.duration ? formatTime(s.duration) : ''}</span>
                    </span>
                    <div className="stack">
                      <button className="btn-icon sm" disabled={i === 0} aria-label="Move up" onClick={() => store.savePlaylist({ ...playlist, songIds: moveInOrder(playlist.songIds, i, i - 1) })}>▲</button>
                      <button className="btn-icon sm" disabled={i === playlist.songIds.length - 1} aria-label="Move down" onClick={() => store.savePlaylist({ ...playlist, songIds: moveInOrder(playlist.songIds, i, i + 1) })}>▼</button>
                    </div>
                    <button className="btn-icon sm" aria-label="Remove song" onClick={() => store.savePlaylist({ ...playlist, songIds: playlist.songIds.filter((_, j) => j !== i) })}>✕</button>
                  </li>
                );
              })}
            </ol>
            {playlist.songIds.length === 0 && <p className="muted">Empty playlist.</p>}
            <button className="btn btn-primary wide" onClick={() => setPicking(true)}>＋ Add songs</button>
            <button
              className="btn btn-danger wide"
              onClick={() => confirm.ask({ title: `Delete “${playlist.name}”?`, confirmLabel: 'Delete', danger: true }, () => { store.deletePlaylist(playlist.id); setSelectedId(null); })}
            >
              Delete playlist
            </button>
          </Section>
        </>
      )}
      {confirm.dialog}
      {picking && playlist && (
        <SongPicker
          title={`Add to ${playlist.name}`}
          allowSpotify={false}
          selectedIds={playlist.songIds}
          onClose={() => setPicking(false)}
          onPick={(s) =>
            store.savePlaylist({
              ...playlist,
              songIds: playlist.songIds.includes(s.id) ? playlist.songIds.filter((x) => x !== s.id) : [...playlist.songIds, s.id],
            })
          }
        />
      )}
    </Screen>
  );
}
