import Foundation

enum SongSource: String, Codable, CaseIterable, Hashable {
    case local
    case musicLibrary
    case spotify

    var label: String {
        switch self {
        case .local: "Imported file"
        case .musicLibrary: "Music Library"
        case .spotify: "Spotify"
        }
    }

    var shortLabel: String {
        switch self {
        case .local: "Local"
        case .musicLibrary: "Music"
        case .spotify: "Spotify"
        }
    }

    var systemImage: String {
        switch self {
        case .local: "waveform"
        case .musicLibrary: "music.note.list"
        case .spotify: "antenna.radiowaves.left.and.right"
        }
    }
}

/// A walk-up song reference. Stored inline on `Player` (and `SavedSong`) as a Codable value.
/// Local audio is referenced by file name inside `SongFileStore.directory`, never by absolute
/// path, because the app container path changes between installs/updates.
struct SongAssignment: Codable, Hashable {
    var source: SongSource
    var title: String
    var artist: String = ""
    var fileName: String?
    var musicLibraryID: String?
    var spotifyTrackID: String?
    var durationSeconds: Double?
    var startSeconds: Double = 0
    /// nil means "use the default walk-up length from Settings".
    var clipSeconds: Double?

    init(source: SongSource, title: String, artist: String = "", fileName: String? = nil,
         musicLibraryID: String? = nil, spotifyTrackID: String? = nil,
         durationSeconds: Double? = nil, startSeconds: Double = 0, clipSeconds: Double? = nil) {
        self.source = source
        self.title = title
        self.artist = artist
        self.fileName = fileName
        self.musicLibraryID = musicLibraryID
        self.spotifyTrackID = spotifyTrackID
        self.durationSeconds = durationSeconds
        self.startSeconds = startSeconds
        self.clipSeconds = clipSeconds
    }

    // Tolerant decoding so future versions can add fields without breaking stored data.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        source = try c.decodeIfPresent(SongSource.self, forKey: .source) ?? .local
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? "Untitled"
        artist = try c.decodeIfPresent(String.self, forKey: .artist) ?? ""
        fileName = try c.decodeIfPresent(String.self, forKey: .fileName)
        musicLibraryID = try c.decodeIfPresent(String.self, forKey: .musicLibraryID)
        spotifyTrackID = try c.decodeIfPresent(String.self, forKey: .spotifyTrackID)
        durationSeconds = try c.decodeIfPresent(Double.self, forKey: .durationSeconds)
        startSeconds = try c.decodeIfPresent(Double.self, forKey: .startSeconds) ?? 0
        clipSeconds = try c.decodeIfPresent(Double.self, forKey: .clipSeconds)
    }

    var requiresInternet: Bool { source == .spotify }

    /// Stable identity used to de-duplicate entries in the song library.
    var libraryKey: String {
        switch source {
        case .local: "local:\(fileName ?? title)"
        case .musicLibrary: "music:\(musicLibraryID ?? title)"
        case .spotify: "spotify:\(spotifyTrackID ?? title)"
        }
    }

    func resolvedClip(default value: Double) -> Double { clipSeconds ?? value }

    var subtitle: String { artist.isEmpty ? source.label : artist }
}

struct LineupEntry: Codable, Hashable {
    var playerID: UUID
    var isActive: Bool
}
