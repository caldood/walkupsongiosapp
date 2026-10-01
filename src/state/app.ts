/**
 * Composition root: builds the long-lived services once. UI imports from here; tests build
 * their own instances with fakes.
 */
import { AudioManager } from '../audio/AudioManager';
import { HtmlAudioBackend } from '../audio/HtmlAudioBackend';
import { WebAudioMixer } from '../audio/mixer';
import { AnnouncerLibrary } from '../storage/announcerLibrary';
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
export const mixer = new WebAudioMixer(backend.element);
export const audioManager = new AudioManager(backend, { overlay: mixer });
export const audioLibrary = new AudioLibrary(repository);
export const announcerLibrary = new AnnouncerLibrary(repository, (b) => mixer.decode(b));
export const store = new AppStore(repository, {
  settings: loadAppSettings(),
  saveSettings: saveAppSettings,
  onAudioChanged: (id) => {
    audioLibrary.invalidate(id);
    announcerLibrary.invalidate(id);
  },
});
export const playback = new PlaybackController(audioManager, audioLibrary, (id) => store.song(id), { announcers: announcerLibrary });
