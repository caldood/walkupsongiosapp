const MIME_BY_EXT: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  mp4: 'audio/mp4',
  wav: 'audio/wav',
  wave: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  flac: 'audio/flac',
  caf: 'audio/x-caf',
};

export const ACCEPTED_AUDIO = 'audio/*,.mp3,.m4a,.aac,.wav';

/** iOS sometimes reports an empty MIME type for files from the Files app. */
export function mimeFor(file: { name: string; type: string }): string {
  if (file.type && file.type.startsWith('audio/')) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'audio/mpeg';
}

/** WAV files carry their length in the header, so no decoding (or element load) is needed. */
export async function wavDuration(blob: Blob): Promise<number | undefined> {
  try {
    const buf = await blob.slice(0, 64 * 1024).arrayBuffer();
    const v = new DataView(buf);
    const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    if (buf.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return undefined;
    let byteRate = 0;
    let dataSize = 0;
    for (let o = 12; o + 8 <= buf.byteLength; ) {
      const id = tag(o);
      const size = v.getUint32(o + 4, true);
      if (id === 'fmt ') byteRate = v.getUint32(o + 16, true);
      if (id === 'data') {
        dataSize = size === 0 || size === 0xffffffff ? blob.size - (o + 8) : size;
        break;
      }
      o += 8 + size + (size % 2);
    }
    return byteRate > 0 && dataSize > 0 ? Math.min(dataSize, blob.size) / byteRate : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reads a file's full duration in seconds, or undefined if it can't be determined quickly.
 * Duration is only used to clamp clips and label songs, so a miss is harmless – never block on it.
 */
export async function readDuration(blob: Blob, timeoutMs = 4000): Promise<number | undefined> {
  const wav = await wavDuration(blob);
  if (wav) return wav;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const a = new Audio();
    let settled = false;
    const finish = (v: number | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      a.removeAttribute('src');
      a.load();
      URL.revokeObjectURL(url);
      resolve(v);
    };
    const timer = setTimeout(() => finish(undefined), timeoutMs);
    a.preload = 'metadata';
    a.onloadedmetadata = () => finish(Number.isFinite(a.duration) ? a.duration : undefined);
    a.ondurationchange = () => Number.isFinite(a.duration) && finish(a.duration);
    a.onerror = () => finish(undefined);
    a.src = url;
    a.load();
  });
}
