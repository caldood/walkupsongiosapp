/**
 * Composition root: builds the long-lived services once. UI imports from here; tests build
 * their own instances with fakes.
 */
import { AudioManager } from '../audio/AudioManager';
import { HtmlAudioBackend } from '../audio/HtmlAudioBackend';
import { AudioLibrary } from '../storage/audioLibrary';
import { IdbRepository } from '../storage/idbRepository';
import { MemoryRepository, type Repository } from '../storage/repository';
import { loadAppSettings, saveAppSettings } from '../storage/settingsStorage';
import { AppStore } from './store';
import { PlaybackController } from './playback';

function createRepository(): Repository {
  try {
    if (typeof indexedDB !== 'undefined') return new IdbRepository();
  } catch {
    /* fall through */
  }
  return new MemoryRepository();
}

export const repository = createRepository();
export const backend = new HtmlAudioBackend();
export const audioManager = new AudioManager(backend);
export const audioLibrary = new AudioLibrary(repository);
export const store = new AppStore(repository, {
  settings: loadAppSettings(),
  saveSettings: saveAppSettings,
  onAudioChanged: (id) => audioLibrary.invalidate(id),
});
export const playback = new PlaybackController(audioManager, audioLibrary, (id) => store.song(id));
