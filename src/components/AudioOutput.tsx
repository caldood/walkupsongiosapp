import { useEffect, useState } from 'react';
import { describeAudioOutput, deviceName } from '../audio/platform';
import { Icon } from './icons';

/** "Audio Output: iPhone" — informational only; the app never depends on detection. */
export function AudioOutput({ compact }: { compact?: boolean }) {
  const [label, setLabel] = useState(() => deviceName());
  useEffect(() => {
    let alive = true;
    const refresh = () => void describeAudioOutput().then((l) => alive && setLabel(l));
    refresh();
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => {
      alive = false;
      navigator.mediaDevices?.removeEventListener?.('devicechange', refresh);
    };
  }, []);
  return (
    <div className={`output ${compact ? 'compact' : ''}`} title="Sound plays through this device's current output (e.g. a connected Bluetooth speaker).">
      <Icon name="speaker" size={16} />
      {!compact && <span className="lbl">Audio Output:</span>}
      <strong>{label}</strong>
    </div>
  );
}
