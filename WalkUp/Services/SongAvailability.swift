import Foundation

enum SongStatus: Equatable {
    case unassigned
    case ready
    case spotifyOnline
    case spotifyOffline
    case missingFile
    case unavailable

    var isPlayable: Bool {
        switch self {
        case .ready, .spotifyOnline, .spotifyOffline: true
        default: false
        }
    }

    var isProblem: Bool {
        switch self {
        case .unassigned, .missingFile, .unavailable, .spotifyOffline: true
        default: false
        }
    }

    var message: String {
        switch self {
        case .unassigned: "No song assigned"
        case .ready: "Ready"
        case .spotifyOnline: "Opens in Spotify"
        case .spotifyOffline: "Needs internet"
        case .missingFile: "Audio file missing"
        case .unavailable: "Song unavailable on this device"
        }
    }

    static func evaluate(_ song: SongAssignment?, isOnline: Bool) -> SongStatus {
        guard let song else { return .unassigned }
        switch song.source {
        case .local:
            guard let name = song.fileName, SongFileStore.exists(name) else { return .missingFile }
            return .ready
        case .musicLibrary:
            guard let id = song.musicLibraryID, MusicLibrary.assetURL(persistentID: id) != nil else { return .unavailable }
            return .ready
        case .spotify:
            return isOnline ? .spotifyOnline : .spotifyOffline
        }
    }
}
