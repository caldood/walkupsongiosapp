# Game Day Music

A Little League game-day music controller that runs in **Safari** (macOS and iPhone/iPad; also Chrome/Edge/Firefox) as an
offline-capable web app. It is a plain website, not a native iOS app. Connect your laptop or phone to a Bluetooth speaker and run two things with almost no friction:

* **Defense Music** – a continuous playlist while the team is in the field or warming up.
* **Walk-Up Music** – tap once to play the current batter's song clip (e.g. Enter Sandman 0:42–1:02), tap once for the next batter.

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
inside a click/tap), the app pre-loads the whole batting order and the start of the defense playlist whenever the
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
4. **Playlists** → create "Defense Warmup" and add songs.
5. **Game setup** walks through team → batting order → songs → defense playlist → Enter Game Mode.
6. Open the app once more in Airplane Mode to confirm it works offline.

**At the field**

1. Connect the phone to the Bluetooth speaker in iOS Settings (the app plays through whatever output iOS is using;
   use Settings → **Test speaker** to check).
2. In iOS Settings set Auto-Lock to Never *or* leave "Keep screen awake" on in the app (needs iOS 16.4+).
3. Open the app → **DEFENSE MUSIC** or **WALK-UP MUSIC**. The bottom bar switches DEFENSE ⇄ WALK-UP in one tap.
4. Walk-up: **▶ PLAY WALK-UP** → clip stops by itself at the end time → **NEXT BATTER →**.
   Use **🔒** to lock navigation (Next/Previous, mode tabs, inning, up-next) so pockets and kids can't mess it up;
   Play/Pause/Stop stay live. Unlock by holding the button.
5. Inning (▲ TOP 1) is a manual indicator; the app never guesses outs.

Settings include: default walk-up length (10/15/20/30s, per-player override), **Auto advance** (moves the lineup to the
next batter after a walk-up finishes), **Auto play next batter** (off by default, requires Auto advance), shuffle/repeat
for defense, theme (dark / light-for-sunshine), keep-awake, and a confirmed **RESET GAME**.

## Import / export

*Team → Import / export*. Exports a `.json` file with the team, players, batting order, clip times, song **metadata**
(name, file name, size), defense playlists and settings. **Audio files are never exported** (copyright and size).
Importing creates a *new* team (nothing is overwritten); songs you already have are matched by file name (and size);
the rest are listed as *missing* until you re-select the audio files (matched by file name, in bulk).

## Browser / iOS limitations (read this)

| Topic | Reality |
|---|---|
| **Local file access** | Safari (iOS) has no persistent file handles (no File System Access API). The app *copies* picked files into **IndexedDB** instead. |
| **Storage eviction** | Safari may evict site data for sites you haven't used in ~7 days, or under storage pressure — **unless the site is added to the Home Screen**, which is exempt from the 7‑day rule. The app also requests persistent storage. Keep an exported team file as backup; if audio is ever gone the app shows "Walk-up song not available on this device." with *Choose Audio File*. |
| **Audio start needs a tap** | iOS only lets audio start from a user tap. The app starts playback directly in the tap handler and pre-loads the current/next batter's audio so it starts instantly. If the very first play needs a second tap it says "Tap Play to start audio." After the first tap, auto-advance / playlist progression work. |
| **Volume / fades** | iOS Safari ignores script volume; use the phone's buttons. No fade-out (cut at clip end) in the MVP. |
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
             types, battingOrder, clip, game, playlistQueue, songs, teams, teamTransfer (import/export)
  audio/     AudioManager (the single authoritative playback state machine over ONE <audio> element),
             HtmlAudioBackend (DOM wrapper + iOS unlock), metadata, platform (wake lock, Media Session, output)
  storage/   Repository interface; IdbRepository (IndexedDB), MemoryRepository (tests/fallback),
             AudioLibrary (blob → object-URL cache), settingsStorage (localStorage for tiny prefs)
  state/     AppStore (config + game state, framework-free), PlaybackController (walk-up + defense queue on
             top of AudioManager), gameActions (next batter, auto-advance, mode switching), hooks
  screens/   Home, GameShell, WalkUpMode, DefenseMode, TeamSelector/TeamEditor, Players, PlayerEditor,
             MusicLibrary, PlaylistEditor, GameSetup, Settings, Transfer
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

`npm test` runs 81 unit tests covering batting order, player/song assignment, clip timing, next batter & wrap,
defense playlist progression (repeat, shuffle, skipping missing audio), import/export round trips and re-linking,
missing songs, game reset, and the audio state machine (loading/playing/paused/stop, clip end, interruptions,
autoplay-blocked recovery, stale-play protection).

The UI was also exercised end-to-end in headless Chromium with iPhone emulation (390×844 portrait and 844×390
landscape): importing WAV files, building a team, walk-up clip auto-stop, auto-advance on/off, defense
playlist, lock/unlock, reset confirmation, export/import with missing-audio re-link, and offline reload through the
service worker. **Always do a real-device check on Safari before game day** (see the checklist above).

## Roadmap

Fade out at clip end (WebAudio gain), batter photos in Game Mode up-next list, per-song waveform trimmer, drag‑and‑drop reordering,
sound-effect pads (cheers, "Charge!"), multi-team quick switch inside Game Mode, backup/restore of audio, Spotify Web Playback
integration, shared team links, and Apple Watch / second-phone remote.
