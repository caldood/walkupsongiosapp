import Foundation
import SwiftData

@Model
final class Team {
    var id: UUID
    var name: String
    var createdAt: Date
    var sortIndex: Int
    @Relationship(deleteRule: .cascade, inverse: \Player.team) var players: [Player] = []
    @Relationship(deleteRule: .cascade, inverse: \Lineup.team) var lineups: [Lineup] = []

    init(name: String, sortIndex: Int = 0) {
        self.id = UUID()
        self.name = name
        self.createdAt = Date()
        self.sortIndex = sortIndex
    }

    /// Full batting order (active and inactive).
    var battingOrder: [Player] { players.sorted { $0.orderIndex < $1.orderIndex } }
    /// The order used in Game Mode.
    var activeBattingOrder: [Player] { battingOrder.filter(\.isActive) }
}

@Model
final class Player {
    var id: UUID
    var name: String
    var jerseyNumber: String
    var orderIndex: Int
    var isActive: Bool
    @Attribute(.externalStorage) var photoData: Data?
    var song: SongAssignment?
    var team: Team?

    init(name: String, jerseyNumber: String = "", orderIndex: Int = 0, isActive: Bool = true,
         photoData: Data? = nil, song: SongAssignment? = nil) {
        self.id = UUID()
        self.name = name
        self.jerseyNumber = jerseyNumber
        self.orderIndex = orderIndex
        self.isActive = isActive
        self.photoData = photoData
        self.song = song
    }

    var displayJersey: String { jerseyNumber.isEmpty ? "–" : jerseyNumber }
}

/// A named, reusable snapshot of a batting order + which players are active.
@Model
final class Lineup {
    var id: UUID
    var name: String
    var createdAt: Date
    var entries: [LineupEntry]
    var team: Team?

    init(name: String, entries: [LineupEntry]) {
        self.id = UUID()
        self.name = name
        self.createdAt = Date()
        self.entries = entries
    }
}

/// The song library: everything the user has imported/linked, with favorites and recency.
@Model
final class SavedSong {
    var key: String
    var assignment: SongAssignment
    var isFavorite: Bool
    var lastUsedAt: Date
    var useCount: Int

    init(assignment: SongAssignment) {
        self.key = assignment.libraryKey
        self.assignment = assignment
        self.isFavorite = false
        self.lastUsedAt = Date()
        self.useCount = 0
    }
}
