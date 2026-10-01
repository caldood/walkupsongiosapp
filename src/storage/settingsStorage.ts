import { DEFAULT_APP_SETTINGS, type AppSettings } from '../core/types';

const KEY = 'gdm.settings.v1';

/** Simple device preferences only (structured data lives in IndexedDB). */
export function loadAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_APP_SETTINGS };
    const p = JSON.parse(raw) as Partial<AppSettings>;
    return {
      theme: p.theme === 'light' ? 'light' : 'dark',
      keepAwake: typeof p.keepAwake === 'boolean' ? p.keepAwake : DEFAULT_APP_SETTINGS.keepAwake,
      activeTeamId: typeof p.activeTeamId === 'string' ? p.activeTeamId : null,
    };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

export function saveAppSettings(s: AppSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: settings simply won't persist */
  }
}

export function clearAppSettings() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
