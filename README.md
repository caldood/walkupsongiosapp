# Game Day Music

A Little League game-day music controller that runs in **Safari** (macOS and iPhone/iPad; also Chrome/Edge/Firefox) as an
offline-capable web app. It is a plain website, not a native iOS app. Connect your laptop or phone to a Bluetooth speaker and run walk-up songs with almost no friction.

**Walk-up music for every batter.** Open Game Mode, see the batting order, and **tap a player's name** to play their song
clip (e.g. Enter Sandman 0:42–1:02) — optionally with a spoken announcement over it. Or use **NEXT BATTER →** and **PLAY**.

No backend, no account, no internet needed for game day. Your music never leaves your phone.

---

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173 (use your LAN IP to open it on a phone)
npm test           # unit tests (Vitest)
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run build      # production build in dist/
npm run preview    # serve dist/ locally (service worker only runs in production builds)
```

Requires Node 20+. Open the printed URL in Safari. (Teams, songs and audio are stored per browser and per address,
so `localhost:5173`, a LAN IP and the deployed site each start empty — export/import a team to move it.)

### Playing local files

**Songs → Add Music** copies MP3/M4A/AAC/WAV files into the browser's IndexedDB; playback uses that copy, so the
original file can move or be deleted. To keep a tap-to-play start instant (Safari only allows `play()` directly
inside a click/tap), the app pre-loads the whole batting order whenever the
lineup or audio changes.

## Deploy to GitHub Pages

1. Push this repo to GitHub with your default branch named `main`.
2. In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Every push to `main` runs `.github/workflows/pages.yml` (tests → build → deploy). The URL is
   `https://<user>.github.io/<repo>/`.

The build uses relative paths (`base: './'`), so it works from a project sub-path, a custom domain, or any
static host (Netlify, Cloudflare Pages, S3, a plain folder) with no configuration.

> Safari only installs/caches PWAs over **HTTPS** (GitHub Pages is HTTPS). `localhost` also works.

## Using it at the ballpark

**One-time, at home (with Wi-Fi)**

1. Open the site in **Safari** → Share → **Add to Home Screen**. Launch it from the Home Screen icon from now on
   (this is important for storage reliability – see limitations).
2. **Songs → Add Music** and choose your audio files (MP3, M4A/AAC, WAV from the Files app / iCloud Drive / Downloads).
   They are copied into the app's private storage on your phone.
3. **Team setup** → create the team. **Players** → add players, set jersey numbers, pick a walk-up song and a clip
   (start/end like `0:42` / `1:02`; leave End blank for the default length). Use ▶ Test.
4. **Game setup** walks through team → batting order → songs → Start game.
5. Open the app once more in Airplane Mode to confirm it works offline.

**At the field**

1. Connect the phone to the Bluetooth speaker in iOS Settings (the app plays through whatever output iOS is using;
   use Settings → **Test speaker** to check).
2. In iOS Settings set Auto-Lock to Never *or* leave "Keep screen awake" on in the app (needs iOS 16.4+).
3. Open the app → **START GAME**. The batting order is on screen: **tap a name to play that player's song** (tap the playing name again to stop it).
4. Walk-up: **▶ PLAY WALK-UP** → clip stops by itself at the end time → **NEXT BATTER →**.
   Use **🔒** to lock navigation (Next/Previous, mode tabs, inning, up-next) so pockets and kids can't mess it up;
   Play/Pause/Stop stay live. Unlock by holding the button.
5. Inning (▲ TOP 1) is a manual indicator; the app never guesses outs.

Walk-up clips are **capped at 15 seconds** (a longer end time is cut to 15 s after the start; older saved defaults above 15 s are lowered).

Settings include: default walk-up length (5/10/15s, per-player override), **Auto advance** (moves the lineup to the
next batter after a walk-up finishes), **Auto play next batter** (off by default, requires Auto advance), shuffle/repeat
theme (dark / light-for-sunshine), keep-awake, and a confirmed **RESET GAME**.

## Fade-out and reordering

* **Fade-out:** walk-up clips ease out over 1–3 seconds (Settings → *Fade out at the end of a walk-up*, default 2s, or Off).
  The fade is scheduled on the Web Audio clock from the real playback position, so it lands exactly on the clip end and
  pauses/resumes with the music. When a clip has an announcer, the clip is stretched so the name finishes before the fade starts.
* **Drag and drop:** drag the ⠿ handle to reorder the batting order (Players, Game setup). It uses Pointer
  Events, so it works with touch on iPhone and with a mouse; the list auto-scrolls near the edges, and the handle also responds
  to ↑ / ↓ on a keyboard.

* **Soft Stop:** pressing Stop (or moving to another batter) eases the sound out over ~0.25 s so there's no click. The screen
  goes idle instantly, and starting another song during that moment replaces the old one at once.
* **Whole-song fade:** if a clip plays through to the very end of the song (or the end time is past the song's end),
  it still fades out over the last seconds. Teams saved by older versions are upgraded on load so they get the fade too.

## Speed-ups

* **Paste a list of players** (Players screen): one per line, number first or last (“7 Brevan Sun”, “Luke 3”). **Save & add another** in the player editor for one-by-one entry.
* **Floating now-playing bar:** if you scroll the batting list so the big controls are off screen, a bar with the player, time left, Pause and Stop stays on screen.
* **Getting ready checklist** on Home until team, songs, players and walk-up songs are all set.
* **Keyboard (Mac):** Space play/pause · S or Esc stop · N or → next batter · P or ← previous batter.

## Announcer over walk-up music

Each player can have a **music clip** *and* an **announcer recording** (e.g. “Now batting, number 7, Brevan Sun!”).
Add recordings with **Songs → Add announcer recordings** (they're kept apart from your music), then pick one in the player editor and set when it starts: Settings → *Announcer comes in after* (3, 4 or 5 seconds for the whole team), or a custom number in a player's editor. Both play at the same
time; the announcer is boosted (Settings → *Announcer volume*, default Loud) and the music dips while they talk
(*Music level while the announcer speaks*), rising back afterwards. A limiter on the output keeps the boosted voice from distorting. If the announcer would outlast the clip, the clip is stretched so the name is never cut off.

How it works: the music still streams from the single `<audio>` element but is routed through a Web Audio `GainNode`
(this is what makes ducking work on iPhone, where `audio.volume` is ignored); the announcer is decoded into an
`AudioBuffer` ahead of time and started on the Web Audio clock. The routing is only set up once a player with an
announcer is used. If an announcer file is missing the music plays alone and the screen says so.

## Updates

The app caches itself for offline use. Page loads try the network first (falling back to the cache after 3 s on a bad signal), and
when a new version finishes downloading in the background a **“A new version is ready — Reload”** bar appears. If you ever don't see a
new feature, tap Reload (or close and reopen the app).

## QA export of the mixed walk-up

In the player editor, **QA export → Export mixed audio (WAV)** renders the finished walk-up — music clip, fade-out and the
announcer mixed together — to a single 16-bit stereo WAV (44.1 kHz), using the player's current (even unsaved) settings. You get
an in-page audio player to listen to it, a report (length, peak level in dBFS, whether it clips, announcer window, volume and
music dip) and **Save / share WAV** (iOS share sheet, or a normal download). The render uses the same gain curves and limiter as
live playback (`audio/automation.ts` is shared), so it is the file QA should compare against what the game plays. Spotify songs
can't be exported (no audio on the device).

## Import / export

*Team → Import / export*. Exports a `.json` file with the team, players, batting order, clip times, song **metadata**
(name, file name, size), announcer recordings and settings. **Audio files are never exported** (copyright and size).
Importing creates a *new* team (nothing is overwritten); songs you already have are matched by file name (and size);
the rest are listed as *missing* until you re-select the audio files (matched by file name, in bulk).

## Browser / iOS limitations (read this)

| Topic | Reality |
|---|---|
| **Local file access** | Safari (iOS) has no persistent file handles (no File System Access API). The app *copies* picked files into **IndexedDB** instead. |
| **Storage eviction** | Safari may evict site data for sites you haven't used in ~7 days, or under storage pressure — **unless the site is added to the Home Screen**, which is exempt from the 7‑day rule. The app also requests persistent storage. Keep an exported team file as backup; if audio is ever gone the app shows "Walk-up song not available on this device." with *Choose Audio File*. |
| **Audio start needs a tap** | iOS only lets audio start from a user tap. The app starts playback directly in the tap handler and pre-loads the current/next batter's audio so it starts instantly. If the very first play needs a second tap it says "Tap Play to start audio." After the first tap, auto-advance works. |
| **Volume / fades** | iOS Safari ignores script volume on plain audio; use the phone's buttons. The only volume the app controls is the music dip under the announcer (via Web Audio). Walk-up clips fade out via Web Audio (see above). |
| **Screen lock / background** | Audio keeps playing with the screen locked, but iOS throttles timers, so a clip end may overshoot by ~1s while locked. Lock-screen play/pause works via Media Session. Keep the screen on during walk-ups for exact timing. |
| **Interruptions** | Calls/Siri pause playback (the app shows Paused; tap Resume). Disconnecting the speaker pauses too. |
| **Audio output** | Browsers can't reliably report the active output. The badge shows "iPhone" (current system output); never relied on. AirPlay/multi-speaker routing is done in iOS Control Center. |
| **Formats** | MP3, M4A/AAC and WAV play in Safari. FLAC/OGG may not. Apple Music/iTunes-purchased DRM files can't be used; use DRM-free files. |
| **Spotify** | Spotify audio can't be downloaded, cached or played inside a web app (DRM + terms). A song can be stored as a Spotify *link* and opened with **Open in Spotify** (needs internet and the Spotify app). Local audio is the reliable path. |
| **Offline** | The app shell is cached by a service worker after the first online visit; teams/songs/audio are in IndexedDB. Nothing else touches the network. *Not* possible offline: first install, updates (applied on next online launch), Spotify. |
| **Wake lock** | Supported iOS 16.4+. Otherwise set Auto-Lock to Never. |

## Architecture

```
src/
  core/      Pure TypeScript domain logic – no DOM, no React. Portable to a native app.
             types, battingOrder, clip, game, songs, teams, teamTransfer (import/export)
  audio/     AudioManager (the single authoritative playback state machine over ONE <audio> element),
             HtmlAudioBackend (DOM wrapper + iOS unlock), metadata, platform (wake lock, Media Session, output)
  storage/   Repository interface; IdbRepository (IndexedDB), MemoryRepository (tests/fallback),
             AudioLibrary (blob → object-URL cache), settingsStorage (localStorage for tiny prefs)
  state/     AppStore (config + game state, framework-free), PlaybackController (walk-up playback on
             top of AudioManager), gameActions (next batter, auto-advance, mode switching), hooks
  screens/   Home, GameShell, WalkUpMode, TeamSelector/TeamEditor, Players, PlayerEditor,
             MusicLibrary, GameSetup, Settings, Transfer
  components/ shared UI (dialogs, hold button, song picker, missing-audio panel…)
public/      manifest, service worker (precache list is generated at build), icons
```

Key decisions: **one** `<audio>` element and one state machine (no competing players); persistence behind a
`Repository` interface; a `Song` model with `sourceType: 'local' | 'spotify'` so other sources can be added without
touching the UI; React only renders – all rules live in `core/` and are unit-tested.

### Extension points (not implemented)

1. **Native iOS** – reuse `core/` rules and the JSON export format; replace `Repository`/`MediaBackend`.
2. **iPad** – layouts already scale to wider screens (`max-width` content, two-column landscape).
3. **Apple Watch / remote controller** – `PlaybackController` + `AppStore` are UI-free command surfaces (`playWalkUp`, `nextBatter`, …); expose them over a transport (WebRTC/BLE/CloudKit).
4. **Spotify** – add a `SpotifyBackend` implementing `MediaBackend`/Web Playback SDK (Premium) behind `sourceType: 'spotify'`.
5. **Cloud sync / sharing / coach accounts** – implement another `Repository`; `TeamExport` is already versioned.
6. **GameChanger / automatic lineups, stats** – feed `GameState` and `setBattingOrder` from an adapter.
7. **Multiple speakers / AirPlay** – an output-routing abstraction beside `MediaBackend` (e.g. `setSinkId` on supporting browsers).

## Testing

`npm test` runs 118 unit tests covering batting order, player/song assignment, clip timing, next batter & wrap,
tap-to-play and replacing songs, import/export round trips and re-linking,
missing songs, game reset, and the audio state machine (loading/playing/paused/stop, clip end, interruptions,
autoplay-blocked recovery, stale-play protection).

The UI was also exercised end-to-end in headless Chromium with iPhone emulation (390×844 portrait and 844×390
landscape): importing WAV files, building a team, walk-up clip auto-stop, auto-advance on/off,
tap-a-name-to-play, lock/unlock, reset confirmation, export/import with missing-audio re-link, and offline reload through the
service worker. **Always do a real-device check on Safari before game day** (see the checklist above).

## Roadmap

Batter photos in Game Mode up-next list, per-song waveform trimmer, record announcers in the app,
sound-effect pads (cheers, "Charge!"), multi-team quick switch inside Game Mode, backup/restore of audio, Spotify Web Playback
integration, shared team links, and Apple Watch / second-phone remote.
