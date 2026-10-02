/** Hands a file to the user: the iOS share sheet when available, otherwise a normal download. Call from a tap. */
export async function shareOrDownload(filename: string, content: string | Blob, type = 'application/json'): Promise<'shared' | 'downloaded'> {
  const file = new File([content], filename, { type: content instanceof Blob ? content.type || type : type });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'shared'; // user closed the share sheet
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}
