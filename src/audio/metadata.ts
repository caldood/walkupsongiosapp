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

/** Reads a file's full duration in seconds, or undefined if the browser can't decode it. */
export function readDuration(blob: Blob, timeoutMs = 8000): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const a = new Audio();
    let settled = false;
    const finish = (v: number | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      a.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(v);
    };
    const timer = setTimeout(() => finish(undefined), timeoutMs);
    a.preload = 'metadata';
    a.onloadedmetadata = () => finish(Number.isFinite(a.duration) ? a.duration : undefined);
    a.onerror = () => finish(undefined);
    a.src = url;
  });
}
