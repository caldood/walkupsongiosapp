# WalkUp — Walk-up songs for Little League

A native SwiftUI iPhone/iPad app (iOS 17+) for managing a team's batting order and playing each
batter's walk-up song at the ballpark — offline-first, one-handed, big tap targets.

## Build

The Xcode project is generated from `project.yml` with [XcodeGen](https://github.com/yonaskolb/XcodeGen):

```sh
brew install xcodegen
xcodegen generate
open WalkUp.xcodeproj
```

Set your signing team and bundle identifier (`com.walkupapp.WalkUp` is a placeholder), then run.
Add a 1024×1024 PNG to `WalkUp/Assets.xcassets/AppIcon.appiconset` for an app icon.
`.github/workflows/ios.yml` builds and runs the unit tests on a macOS runner.

> Note: this code was authored without access to Xcode, so run the CI/first build and fix any
> compiler nits before shipping.

## Architecture

```
WalkUp/
  App/            WalkUpApp (container, DI), RootView (split view, team selection, file open)
  Models/         SwiftData models (Team, Player, Lineup, SavedSong), SongAssignment value type, AppSettings
  Services/       AudioPlaybackService (AVAudioPlayer, fades, interruptions, lock screen),
                  SongFileStore + metadata, MusicLibrary (local Apple Music), SpotifyService (handoff seam),
                  ConnectivityMonitor, TeamArchive (export/import/backup), SongAvailability
  Repositories/   TeamRepository (all mutations), LineupFormatter, SongLibrary
  Features/       Teams (list, team hub), Songs (picker, player editor, clip editor),
                  Setup (lineups), Game (view model + Game Mode), Settings
  Support/        Theme, haptics, shared small views
```

Views are declarative and talk to `@Observable` services/view models and the repository; the
audio service is the only owner of playback so two songs can never overlap.

## Behaviour notes

* **Local files** are copied into Application Support/Songs and referenced by file name. Missing or
  unplayable files show a warning on the card and in a banner; they never crash or block the game.
* **Walk-up length** = per-player custom length, else the default in Settings. Playback fades in/out
  and stops itself. Start point is saved per song assignment.
* **Background audio** (`UIBackgroundModes: audio`), lock-screen/Control Center play/pause/stop,
  interruption handling (calls resume if the system says so) and pause-on-headphone-unplug.
* **Music Library**: songs downloaded/purchased on the device only; DRM/streaming-only items have no
  asset URL and are rejected with an explanation.
* **Spotify**: audio can't be downloaded or decoded (DRM/terms). Tracks are stored by ID (paste a
  share link) and played by handing off to the Spotify app via `spotify:track:<id>`. Start point,
  length and auto-stop can't be controlled, and it needs internet; the UI says so everywhere.
  `SpotifyPlaying` is the seam for a future `SpotifyAppRemote` (Spotify iOS SDK) implementation,
  which requires a client ID registered with Spotify, Premium, and the Spotify app installed.
* **Export/backup**: `.walkupteam` JSON (players, photos, songs, lineups), optionally with embedded
  audio. Restoring always adds new teams, never overwrites.
