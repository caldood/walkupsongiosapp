import Foundation
import Observation

@MainActor @Observable
final class AppSettings {
    static let shared = AppSettings()

    enum Appearance: String, CaseIterable, Identifiable {
        case system, light, dark
        var id: String { rawValue }
        var label: String { rawValue.capitalized }
    }

    private enum Key {
        static let clip = "defaultClipSeconds"
        static let fadeIn = "fadeInSeconds"
        static let fadeOut = "fadeOutSeconds"
        static let volume = "masterVolume"
        static let autoAdvance = "autoAdvanceAfterSong"
        static let playOnNext = "playOnNextBatter"
        static let awake = "keepScreenAwake"
        static let haptics = "hapticsEnabled"
        static let appearance = "appearance"
    }

    @ObservationIgnored private let defaults: UserDefaults

    var defaultClipSeconds: Double { didSet { defaults.set(defaultClipSeconds, forKey: Key.clip) } }
    var fadeInSeconds: Double { didSet { defaults.set(fadeInSeconds, forKey: Key.fadeIn) } }
    var fadeOutSeconds: Double { didSet { defaults.set(fadeOutSeconds, forKey: Key.fadeOut) } }
    var masterVolume: Double { didSet { defaults.set(masterVolume, forKey: Key.volume) } }
    /// Move the highlight to the next batter automatically when a song ends.
    var autoAdvanceAfterSong: Bool { didSet { defaults.set(autoAdvanceAfterSong, forKey: Key.autoAdvance) } }
    /// "Next Batter" also starts that batter's song.
    var playOnNextBatter: Bool { didSet { defaults.set(playOnNextBatter, forKey: Key.playOnNext) } }
    var keepScreenAwake: Bool { didSet { defaults.set(keepScreenAwake, forKey: Key.awake) } }
    var hapticsEnabled: Bool { didSet { defaults.set(hapticsEnabled, forKey: Key.haptics) } }
    var appearance: Appearance { didSet { defaults.set(appearance.rawValue, forKey: Key.appearance) } }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        func double(_ key: String, _ fallback: Double) -> Double {
            defaults.object(forKey: key) as? Double ?? fallback
        }
        func bool(_ key: String, _ fallback: Bool) -> Bool {
            defaults.object(forKey: key) as? Bool ?? fallback
        }
        defaultClipSeconds = double(Key.clip, 10)
        fadeInSeconds = double(Key.fadeIn, 0.5)
        fadeOutSeconds = double(Key.fadeOut, 2)
        masterVolume = double(Key.volume, 1)
        autoAdvanceAfterSong = bool(Key.autoAdvance, false)
        playOnNextBatter = bool(Key.playOnNext, false)
        keepScreenAwake = bool(Key.awake, true)
        hapticsEnabled = bool(Key.haptics, true)
        appearance = Appearance(rawValue: defaults.string(forKey: Key.appearance) ?? "") ?? .system
    }
}
