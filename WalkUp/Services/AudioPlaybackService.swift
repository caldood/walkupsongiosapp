import AVFoundation
import MediaPlayer
import Observation

enum PlaybackError: LocalizedError {
    case fileMissing
    case unavailable
    case spotifyNotPlayable
    case cannotPlay(String)

    var errorDescription: String? {
        switch self {
        case .fileMissing: "The audio file for this song is missing. Re-assign the song."
        case .unavailable: "This song isn't available on this device (it may be protected or removed)."
        case .spotifyNotPlayable: "Spotify songs play in the Spotify app."
        case .cannotPlay(let why): "This song couldn't be played: \(why)"
        }
    }
}

/// The single source of truth for local audio playback. Guarantees only one song plays at a
/// time, applies fade in/out and the walk-up clip length, and handles interruptions.
@MainActor @Observable
final class AudioPlaybackService {
    enum State: Equatable { case idle, playing, paused }
    enum EndReason { case completed, stopped }

    struct Session: Equatable {
        var assignment: SongAssignment
        var playerID: UUID?
        var playerName: String
        var jersey: String
        var isPreview: Bool
    }

    private(set) var state: State = .idle
    private(set) var session: Session?
    /// The last session that played, so "Replay" works after the song ended.
    private(set) var lastSession: Session?
    private(set) var elapsed: TimeInterval = 0
    private(set) var clipLength: TimeInterval = 0
    var remaining: TimeInterval { max(0, clipLength - elapsed) }
    var isPlaying: Bool { state == .playing }
    var isActive: Bool { state != .idle }

    @ObservationIgnored var onEnd: ((EndReason, Session) -> Void)?
    @ObservationIgnored private let settings: AppSettings
    @ObservationIgnored private var player: AVAudioPlayer?
    @ObservationIgnored private var timer: Timer?
    @ObservationIgnored private var startOffset: TimeInterval = 0
    @ObservationIgnored private var fadeInLength: TimeInterval = 0
    @ObservationIgnored private var fadeOutLength: TimeInterval = 0
    @ObservationIgnored private var stalledTicks = 0
    @ObservationIgnored private var resumeAfterInterruption = false

    init(settings: AppSettings) {
        self.settings = settings
        observeSystemEvents()
        configureRemoteCommands()
    }

    // MARK: - Resolving

    static func resolveURL(for song: SongAssignment) throws -> URL {
        switch song.source {
        case .local:
            guard let name = song.fileName, SongFileStore.exists(name) else { throw PlaybackError.fileMissing }
            return SongFileStore.url(for: name)
        case .musicLibrary:
            guard let id = song.musicLibraryID, let url = MusicLibrary.assetURL(persistentID: id) else { throw PlaybackError.unavailable }
            return url
        case .spotify:
            throw PlaybackError.spotifyNotPlayable
        }
    }

    // MARK: - Transport

    func play(_ song: SongAssignment, playerID: UUID? = nil, playerName: String,
              jersey: String = "", isPreview: Bool = false) throws {
        haltPlayer()
        let url = try Self.resolveURL(for: song)

        let newPlayer: AVAudioPlayer
        do { newPlayer = try AVAudioPlayer(contentsOf: url) }
        catch { throw PlaybackError.cannotPlay(error.localizedDescription) }
        guard newPlayer.duration > 0.5 else { throw PlaybackError.cannotPlay("the file is empty") }

        do {
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playback, mode: .default)
            try audioSession.setActive(true)
        } catch {
            throw PlaybackError.cannotPlay("audio output is unavailable")
        }

        let start = min(max(0, song.startSeconds), max(0, newPlayer.duration - 1))
        newPlayer.currentTime = start
        newPlayer.prepareToPlay()

        startOffset = start
        let requested = song.resolvedClip(default: settings.defaultClipSeconds)
        clipLength = max(1, min(requested, newPlayer.duration - start))
        fadeInLength = min(settings.fadeInSeconds, clipLength / 2)
        fadeOutLength = min(settings.fadeOutSeconds, clipLength / 2)
        elapsed = 0
        stalledTicks = 0
        newPlayer.volume = Float(volume(at: 0))

        guard newPlayer.play() else { throw PlaybackError.cannotPlay("playback failed to start") }

        player = newPlayer
        let newSession = Session(assignment: song, playerID: playerID, playerName: playerName,
                                 jersey: jersey, isPreview: isPreview)
        session = newSession
        lastSession = newSession
        state = .playing
        startTimer()
        updateNowPlaying()
    }

    /// Returns an error message, or nil on success.
    @discardableResult
    func preview(_ song: SongAssignment, label: String) -> String? {
        do { try play(song, playerName: label, isPreview: true); return nil }
        catch { return error.localizedDescription }
    }

    func pause() {
        guard state == .playing else { return }
        player?.pause()
        timer?.invalidate()
        state = .paused
        updateNowPlaying()
    }

    func resume() {
        guard state == .paused, let player else { return }
        do { try AVAudioSession.sharedInstance().setActive(true) } catch {}
        if player.play() {
            state = .playing
            startTimer()
            updateNowPlaying()
        } else {
            stop()
        }
    }

    func togglePlayPause() {
        if state == .playing { pause() } else if state == .paused { resume() }
    }

    /// Immediate stop.
    func stop() {
        guard let ended = session else { haltPlayer(); return }
        finish(.stopped, ended)
    }

    /// Ends the song with a short fade instead of a hard cut.
    func skip(fade: TimeInterval = 0.6) {
        guard state == .playing else { stop(); return }
        fadeOutLength = fade
        clipLength = min(clipLength, elapsed + fade)
    }

    // MARK: - Internals

    private func finish(_ reason: EndReason, _ ended: Session) {
        haltPlayer()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        onEnd?(reason, ended)
    }

    private func haltPlayer() {
        timer?.invalidate()
        timer = nil
        player?.stop()
        player = nil
        state = .idle
        session = nil
        elapsed = 0
        clipLength = 0
        resumeAfterInterruption = false
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    private func startTimer() {
        timer?.invalidate()
        let t = Timer(timeInterval: 0.05, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    private func tick() {
        guard state == .playing, let player, let current = session else { return }
        elapsed = max(0, player.currentTime - startOffset)
        if elapsed >= clipLength - 0.02 {
            finish(.completed, current)
            return
        }
        if !player.isPlaying {
            // The file ended before the clip did (or output was lost).
            stalledTicks += 1
            if stalledTicks > 10 { finish(.completed, current) }
            return
        }
        stalledTicks = 0
        player.volume = Float(volume(at: elapsed))
    }

    private func volume(at t: TimeInterval) -> Double {
        var factor = 1.0
        if fadeInLength > 0 { factor = min(factor, t / fadeInLength) }
        if fadeOutLength > 0 { factor = min(factor, (clipLength - t) / fadeOutLength) }
        return settings.masterVolume * max(0, min(1, factor))
    }

    // MARK: - System events

    private func observeSystemEvents() {
        let center = NotificationCenter.default
        center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            let typeValue = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
            let optionsValue = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            Task { @MainActor in self?.handleInterruption(typeValue: typeValue, optionsValue: optionsValue) }
        }
        center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
            let reasonValue = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
            Task { @MainActor in
                if reasonValue == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue { self?.pause() }
            }
        }
        center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { [weak self] _ in
            Task { @MainActor in self?.stop() }
        }
    }

    private func handleInterruption(typeValue: UInt?, optionsValue: UInt) {
        guard let typeValue, let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }
        switch type {
        case .began:
            if state == .playing { resumeAfterInterruption = true; pause() }
        case .ended:
            let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
            if resumeAfterInterruption, options.contains(.shouldResume) { resume() }
            resumeAfterInterruption = false
        @unknown default: break
        }
    }

    // MARK: - Lock screen / Control Center

    private func configureRemoteCommands() {
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.resume() }; return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.pause() }; return .success
        }
        center.togglePlayPauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.togglePlayPause() }; return .success
        }
        center.stopCommand.addTarget { [weak self] _ in
            Task { @MainActor in self?.stop() }; return .success
        }
    }

    private func updateNowPlaying() {
        guard let session else { MPNowPlayingInfoCenter.default().nowPlayingInfo = nil; return }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [
            MPMediaItemPropertyTitle: session.assignment.title,
            MPMediaItemPropertyArtist: session.playerName,
            MPMediaItemPropertyPlaybackDuration: clipLength,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: elapsed,
            MPNowPlayingInfoPropertyPlaybackRate: state == .playing ? 1.0 : 0.0,
        ]
    }
}
