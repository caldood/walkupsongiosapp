import Foundation
import Observation

@MainActor @Observable
final class GameViewModel {
    let team: Team
    private let audio: AudioPlaybackService
    private let settings: AppSettings
    private let spotify: SpotifyPlaying
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private var noticeTask: Task<Void, Never>?

    private(set) var currentPlayerID: UUID?
    private(set) var notice: String?
    /// Name of the batter whose Spotify song was handed off (we can't control it after that).
    private(set) var spotifyHandoff: String?

    init(team: Team, audio: AudioPlaybackService, settings: AppSettings,
         spotify: SpotifyPlaying = SpotifyDeepLinkPlayer(), defaults: UserDefaults = .standard) {
        self.team = team
        self.audio = audio
        self.settings = settings
        self.spotify = spotify
        self.defaults = defaults
        currentPlayerID = (defaults.string(forKey: Self.key(team)).flatMap(UUID.init(uuidString:)))
        normalizeCurrent()
        audio.onEnd = { [weak self] reason, session in self?.songEnded(reason, session) }
    }

    private static func key(_ team: Team) -> String { "game.current.\(team.id.uuidString)" }

    var batters: [Player] { team.activeBattingOrder }
    var currentIndex: Int? { batters.firstIndex { $0.id == currentPlayerID } }
    var currentPlayer: Player? { currentIndex.map { batters[$0] } }
    var nextPlayer: Player? {
        guard let i = currentIndex, !batters.isEmpty else { return batters.first }
        return batters[(i + 1) % batters.count]
    }
    /// The batter whose song is loaded in the player (playing or paused).
    var nowPlayingPlayer: Player? {
        guard let id = audio.session?.playerID else { return nil }
        return batters.first { $0.id == id }
    }

    func normalizeCurrent() {
        if currentIndex == nil { setCurrent(batters.first?.id) }
    }

    private func setCurrent(_ id: UUID?) {
        currentPlayerID = id
        defaults.set(id?.uuidString, forKey: Self.key(team))
    }

    // MARK: Actions

    /// Tap on a batter card: make them current and start their song.
    func select(_ player: Player) {
        setCurrent(player.id)
        play(player)
    }

    func playCurrent() {
        normalizeCurrent()
        if let p = currentPlayer { play(p) }
    }

    func play(_ player: Player) {
        spotifyHandoff = nil
        guard let song = player.song else {
            audio.stop()
            show("\(player.name) has no walk-up song. Assign one in the lineup screen.")
            return
        }
        if song.source == .spotify {
            audio.stop()
            guard let id = song.spotifyTrackID else { show("This Spotify song is missing its track ID."); return }
            Task {
                switch await spotify.play(trackID: id) {
                case .openedApp, .openedWeb: spotifyHandoff = player.name
                case .failed: show("Couldn't open Spotify. Check that it's installed and you're online.")
                }
            }
            return
        }
        do {
            try audio.play(song, playerID: player.id, playerName: player.name, jersey: player.jerseyNumber)
        } catch {
            show("\(player.name): \(error.localizedDescription)")
        }
    }

    func togglePlayPause() {
        if audio.isActive { audio.togglePlayPause() } else { playCurrent() }
    }

    func stop() {
        audio.stop()
        spotifyHandoff = nil
    }

    func skip() { audio.skip() }

    func replay() {
        if let id = audio.lastSession?.playerID, let p = batters.first(where: { $0.id == id }) { play(p) }
        else { playCurrent() }
    }

    func nextBatter() {
        audio.stop()
        spotifyHandoff = nil
        advance()
        if settings.playOnNextBatter { playCurrent() }
    }

    func previousBatter() {
        guard let i = currentIndex, !batters.isEmpty else { return }
        audio.stop()
        setCurrent(batters[(i - 1 + batters.count) % batters.count].id)
    }

    private func advance() {
        guard !batters.isEmpty else { return }
        let i = currentIndex.map { ($0 + 1) % batters.count } ?? 0
        setCurrent(batters[i].id)
    }

    private func songEnded(_ reason: AudioPlaybackService.EndReason, _ session: AudioPlaybackService.Session) {
        guard reason == .completed, !session.isPreview, settings.autoAdvanceAfterSong,
              session.playerID == currentPlayerID else { return }
        advance()
    }

    func dismissNotice() { notice = nil; noticeTask?.cancel() }

    private func show(_ message: String) {
        notice = message
        noticeTask?.cancel()
        noticeTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(8))
            if !Task.isCancelled { self?.notice = nil }
        }
    }

    func teardown() {
        audio.stop()
        audio.onEnd = nil
    }
}
