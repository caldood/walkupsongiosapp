import SwiftUI
import SwiftData

/// All mutations of teams/players/lineups go through here so views stay declarative.
@MainActor
struct TeamRepository {
    let context: ModelContext

    // MARK: Teams

    @discardableResult
    func createTeam(named name: String) -> Team {
        let existing = (try? context.fetch(FetchDescriptor<Team>())) ?? []
        let team = Team(name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                        sortIndex: (existing.map(\.sortIndex).max() ?? -1) + 1)
        context.insert(team)
        save()
        return team
    }

    @discardableResult
    func duplicate(_ team: Team) -> Team {
        let copy = createTeam(named: "\(team.name) Copy")
        var idMap: [UUID: UUID] = [:]
        for p in team.battingOrder {
            let c = Player(name: p.name, jerseyNumber: p.jerseyNumber, orderIndex: p.orderIndex,
                           isActive: p.isActive, photoData: p.photoData, song: p.song)
            c.team = copy
            context.insert(c)
            idMap[p.id] = c.id
        }
        for l in team.lineups {
            let entries = l.entries.compactMap { e in idMap[e.playerID].map { LineupEntry(playerID: $0, isActive: e.isActive) } }
            let lineup = Lineup(name: l.name, entries: entries)
            lineup.team = copy
            context.insert(lineup)
        }
        save()
        return copy
    }

    func delete(_ team: Team) {
        context.delete(team)
        save()
    }

    // MARK: Players

    @discardableResult
    func addPlayer(to team: Team, name: String, jersey: String, isActive: Bool,
                   photoData: Data?, song: SongAssignment?) -> Player {
        let player = Player(name: name, jerseyNumber: jersey, orderIndex: team.players.count,
                            isActive: isActive, photoData: photoData, song: song)
        player.team = team
        context.insert(player)
        if let song { SongLibrary.record(song, in: context) }
        save()
        return player
    }

    func update(_ player: Player, name: String, jersey: String, isActive: Bool,
                photoData: Data?, song: SongAssignment?) {
        player.name = name
        player.jerseyNumber = jersey
        player.isActive = isActive
        player.photoData = photoData
        player.song = song
        if let song { SongLibrary.record(song, in: context) }
        save()
    }

    func delete(_ player: Player) {
        let team = player.team
        context.delete(player)
        if let team { renumber(team.battingOrder.filter { $0.id != player.id }) }
        save()
    }

    func move(in team: Team, from source: IndexSet, to destination: Int) {
        var ordered = team.battingOrder
        ordered.move(fromOffsets: source, toOffset: destination)
        renumber(ordered)
        save()
    }

    private func renumber(_ ordered: [Player]) {
        for (index, p) in ordered.enumerated() { p.orderIndex = index }
    }

    // MARK: Lineups

    func saveLineup(named name: String, from team: Team) {
        let entries = team.battingOrder.map { LineupEntry(playerID: $0.id, isActive: $0.isActive) }
        let lineup = Lineup(name: name.trimmingCharacters(in: .whitespacesAndNewlines), entries: entries)
        lineup.team = team
        context.insert(lineup)
        save()
    }

    func apply(_ lineup: Lineup, to team: Team) {
        let byID = Dictionary(uniqueKeysWithValues: team.players.map { ($0.id, $0) })
        var index = 0
        var placed = Set<UUID>()
        for entry in lineup.entries {
            guard let p = byID[entry.playerID], !placed.contains(p.id) else { continue }
            p.orderIndex = index
            p.isActive = entry.isActive
            index += 1
            placed.insert(p.id)
        }
        // Players added after the lineup was saved go to the end, inactive.
        for p in team.battingOrder where !placed.contains(p.id) {
            p.orderIndex = index
            p.isActive = false
            index += 1
        }
        save()
    }

    func save() {
        do { try context.save() } catch { assertionFailure("Save failed: \(error)") }
    }
}

enum LineupFormatter {
    @MainActor
    static func text(team: Team, title: String? = nil) -> String {
        var lines = ["\(title ?? team.name) – Batting Order"]
        for (i, p) in team.activeBattingOrder.enumerated() {
            let song = p.song.map { " — \($0.title)" + ($0.artist.isEmpty ? "" : " (\($0.artist))") } ?? ""
            lines.append("\(i + 1). #\(p.displayJersey) \(p.name)\(song)")
        }
        return lines.joined(separator: "\n")
    }
}

/// The song library: favorites, recents, search.
enum SongLibrary {
    @MainActor
    static func record(_ song: SongAssignment, in context: ModelContext) {
        let key = song.libraryKey
        var descriptor = FetchDescriptor<SavedSong>(predicate: #Predicate { $0.key == key })
        descriptor.fetchLimit = 1
        if let existing = try? context.fetch(descriptor).first {
            existing.assignment = song
            existing.lastUsedAt = Date()
            existing.useCount += 1
        } else {
            let saved = SavedSong(assignment: song)
            saved.useCount = 1
            context.insert(saved)
        }
    }
}
