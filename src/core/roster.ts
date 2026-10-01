export interface RosterLine {
  name: string;
  number: string;
}

/**
 * Turns pasted text into players. One player per line; the jersey number may come first or last:
 *   "7 Brevan Sun"   "#7 Brevan Sun"   "7. Brevan Sun"   "Brevan Sun 7"   "7, Brevan Sun"   "Brevan Sun"
 */
export function parseRosterText(text: string): RosterLine[] {
  const out: RosterLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/\s+/g, ' ');
    if (!line) continue;
    let m = /^#?(\d{1,3})\s*[.,:;)\-–—\t ]\s*(.+)$/.exec(line);
    if (m) {
      out.push({ number: m[1], name: m[2].trim() });
      continue;
    }
    m = /^(.+?)\s*[,:;\-–—#\t ]\s*#?(\d{1,3})$/.exec(line);
    if (m && /\D/.test(m[1])) {
      out.push({ number: m[2], name: m[1].replace(/[,:;\-–—#]+$/, '').trim() });
      continue;
    }
    out.push({ number: '', name: line });
  }
  return out.filter((r) => r.name);
}
