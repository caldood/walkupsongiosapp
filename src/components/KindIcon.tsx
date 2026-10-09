import { Icon } from './icons';

export type Kind = 'music' | 'announcer' | 'spotify';

/** A colored icon tile that says what kind of audio this is: amber note = song, blue microphone = announcer voice, green arrow = Spotify link. */
export function KindIcon({ kind, size = 40 }: { kind: Kind; size?: number }) {
  const name = kind === 'music' ? 'music' : kind === 'announcer' ? 'mic' : 'external';
  const label = kind === 'music' ? 'Song' : kind === 'announcer' ? 'Announcer voice' : 'Spotify link';
  return (
    <span className={`kind-icon ${kind}`} style={{ width: size, height: size, borderRadius: size * 0.3 }} role="img" aria-label={label} title={label}>
      <Icon name={name} size={Math.round(size * 0.52)} />
    </span>
  );
}
