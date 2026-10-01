import Foundation
import SwiftData
import UniformTypeIdentifiers

extension UTType {
    static let walkUpArchive = UTType(exportedAs: "com.walkupapp.team-archive", conformingTo: .json)
}

/// Portable representation of one or more teams (export, share, backup/restore).
struct TeamArchive: Codable {
    struct PlayerDTO: Codable {
        var id: UUID
        var name: String
        var jerseyNumber: String
        var orderIndex: Int
        var isActive: Bool
        var photoData: Data?
        var song: SongAssignment?
    }
    struct LineupDTO: Codable {
        var name: String
        var entries: [LineupEntry]
    }
    struct TeamDTO: Codable {
        var name: String
        var players: [PlayerDTO]
        var lineups: [LineupDTO]
    }

    var formatVersion = 1
    var exportedAt = Date()
    var teams: [TeamDTO]
    /// Local audio keyed by stored file name; only present when exported "with audio".
    var audio: [String: Data] = [:]
}

enum TeamArchiveError: LocalizedError {
    case unreadable
    case newerFormat

    var errorDescription: String? {
        switch self {
        case .unreadable: "That file isn't a valid WalkUp team file."
        case .newerFormat: "That file was created by a newer version of WalkUp."
        }
    }
}

@MainActor
enum TeamArchiveService {
    static func makeArchive(teams: [Team], includeAudio: Bool) -> TeamArchive {
        var audio: [String: Data] = [:]
        let dtos = teams.map { team in
            TeamArchive.TeamDTO(
                name: team.name,
                players: team.battingOrder.map { p in
                    if includeAudio, let name = p.song?.fileName, audio[name] == nil,
                       let data = try? Data(contentsOf: SongFileStore.url(for: name)) {
                        audio[name] = data
                    }
                    return TeamArchive.PlayerDTO(id: p.id, name: p.name, jerseyNumber: p.jerseyNumber,
                                                 orderIndex: p.orderIndex, isActive: p.isActive,
                                                 photoData: p.photoData, song: p.song)
                },
                lineups: team.lineups.sorted { $0.createdAt < $1.createdAt }
                    .map { TeamArchive.LineupDTO(name: $0.name, entries: $0.entries) })
        }
        return TeamArchive(teams: dtos, audio: audio)
    }

    /// Writes the archive to a temporary file suitable for `ShareLink`.
    static func writeTemporaryFile(_ archive: TeamArchive, baseName: String) throws -> URL {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(archive)
        let safe = baseName.replacingOccurrences(of: "/", with: "-")
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(safe).walkupteam")
        try data.write(to: url, options: .atomic)
        return url
    }

    static func read(from url: URL) throws -> TeamArchive {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url) else { throw TeamArchiveError.unreadable }
        return try decode(data)
    }

    static func decode(_ data: Data) throws -> TeamArchive {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        guard let archive = try? decoder.decode(TeamArchive.self, from: data) else { throw TeamArchiveError.unreadable }
        guard archive.formatVersion <= 1 else { throw TeamArchiveError.newerFormat }
        return archive
    }

    /// Always creates new teams (never overwrites), so restoring is non-destructive.
    @discardableResult
    static func restore(_ archive: TeamArchive, into context: ModelContext) -> [Team] {
        for (name, data) in archive.audio {
            guard let safe = SongFileStore.safeName(name), !SongFileStore.exists(safe) else { continue }
            try? data.write(to: SongFileStore.url(for: safe), options: .atomic)
        }
        let existing = (try? context.fetch(FetchDescriptor<Team>())) ?? []
        var nextSort = (existing.map(\.sortIndex).max() ?? -1) + 1
        var created: [Team] = []
        for dto in archive.teams {
            let team = Team(name: dto.name, sortIndex: nextSort)
            nextSort += 1
            context.insert(team)
            var idMap: [UUID: UUID] = [:]
            for p in dto.players.sorted(by: { $0.orderIndex < $1.orderIndex }) {
                let player = Player(name: p.name, jerseyNumber: p.jerseyNumber, orderIndex: p.orderIndex,
                                    isActive: p.isActive, photoData: p.photoData, song: p.song)
                player.team = team
                context.insert(player)
                idMap[p.id] = player.id
                if let song = p.song { SongLibrary.record(song, in: context) }
            }
            for l in dto.lineups {
                let entries = l.entries.compactMap { e in
                    idMap[e.playerID].map { LineupEntry(playerID: $0, isActive: e.isActive) }
                }
                let lineup = Lineup(name: l.name, entries: entries)
                lineup.team = team
                context.insert(lineup)
            }
            created.append(team)
        }
        try? context.save()
        return created
    }
}
