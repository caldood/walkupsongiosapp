import XCTest
import SwiftData
@testable import WalkUp

final class SpotifyLinkTests: XCTestCase {
    func testParsesWebURL() {
        XCTAssertEqual(SpotifyLink.trackID(from: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc"), "4uLU6hMCjMI75M1A2tKUQC")
    }
    func testParsesIntlURL() {
        XCTAssertEqual(SpotifyLink.trackID(from: "https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC"), "4uLU6hMCjMI75M1A2tKUQC")
    }
    func testParsesURI() {
        XCTAssertEqual(SpotifyLink.trackID(from: "spotify:track:4uLU6hMCjMI75M1A2tKUQC"), "4uLU6hMCjMI75M1A2tKUQC")
    }
    func testRejectsOtherLinks() {
        XCTAssertNil(SpotifyLink.trackID(from: "https://open.spotify.com/album/4uLU6hMCjMI75M1A2tKUQC"))
        XCTAssertNil(SpotifyLink.trackID(from: "hello"))
    }
}

final class SongAssignmentTests: XCTestCase {
    func testClipFallsBackToDefault() {
        var song = SongAssignment(source: .local, title: "A")
        XCTAssertEqual(song.resolvedClip(default: 10), 10)
        song.clipSeconds = 6
        XCTAssertEqual(song.resolvedClip(default: 10), 6)
    }
    func testTolerantDecoding() throws {
        let song = try JSONDecoder().decode(SongAssignment.self, from: Data(#"{"title":"X"}"#.utf8))
        XCTAssertEqual(song.title, "X")
        XCTAssertEqual(song.source, .local)
    }
    func testSpotifyRequiresInternet() {
        XCTAssertTrue(SongAssignment(source: .spotify, title: "S", spotifyTrackID: "x").requiresInternet)
        XCTAssertFalse(SongAssignment(source: .local, title: "L").requiresInternet)
    }
    func testSafeNameStripsPaths() {
        XCTAssertEqual(SongFileStore.safeName("../../etc/passwd"), "passwd")
        XCTAssertNil(SongFileStore.safeName(".."))
    }
    func testTimeFormat() {
        XCTAssertEqual(TimeFormat.clock(75.9), "1:15")
        XCTAssertEqual(TimeFormat.clock(-3), "0:00")
    }
}

@MainActor
final class TeamLogicTests: XCTestCase {
    private func makeContext() throws -> ModelContext {
        let schema = Schema([Team.self, Player.self, Lineup.self, SavedSong.self])
        let container = try ModelContainer(for: schema, configurations: ModelConfiguration(isStoredInMemoryOnly: true))
        return ModelContext(container)
    }

    func testReorderAndLineupApply() throws {
        let repo = TeamRepository(context: try makeContext())
        let team = repo.createTeam(named: "Tigers")
        let a = repo.addPlayer(to: team, name: "A", jersey: "1", isActive: true, photoData: nil, song: nil)
        _ = repo.addPlayer(to: team, name: "B", jersey: "2", isActive: true, photoData: nil, song: nil)
        _ = repo.addPlayer(to: team, name: "C", jersey: "3", isActive: true, photoData: nil, song: nil)
        repo.saveLineup(named: "Original", from: team)

        repo.move(in: team, from: IndexSet(integer: 0), to: 3)
        XCTAssertEqual(team.battingOrder.map(\.name), ["B", "C", "A"])

        a.isActive = false
        XCTAssertEqual(team.activeBattingOrder.map(\.name), ["B", "C"])

        repo.apply(team.lineups[0], to: team)
        XCTAssertEqual(team.battingOrder.map(\.name), ["A", "B", "C"])
        XCTAssertTrue(team.battingOrder.allSatisfy(\.isActive))
    }

    func testDuplicateAndArchiveRoundTrip() throws {
        let context = try makeContext()
        let repo = TeamRepository(context: context)
        let team = repo.createTeam(named: "Tigers")
        let song = SongAssignment(source: .spotify, title: "Song", spotifyTrackID: "4uLU6hMCjMI75M1A2tKUQC")
        repo.addPlayer(to: team, name: "A", jersey: "7", isActive: true, photoData: nil, song: song)
        repo.saveLineup(named: "L", from: team)

        let copy = repo.duplicate(team)
        XCTAssertEqual(copy.players.count, 1)
        XCTAssertEqual(copy.lineups.count, 1)
        XCTAssertNotEqual(copy.players[0].id, team.players[0].id)

        let archive = TeamArchiveService.makeArchive(teams: [team], includeAudio: false)
        let url = try TeamArchiveService.writeTemporaryFile(archive, baseName: "test")
        let restored = TeamArchiveService.restore(try TeamArchiveService.read(from: url), into: context)
        XCTAssertEqual(restored.first?.players.first?.song, song)
        XCTAssertEqual(restored.first?.lineups.first?.entries.count, 1)
    }

    func testGameModeNextBatterWrapsAndSkipsInactive() throws {
        let repo = TeamRepository(context: try makeContext())
        let team = repo.createTeam(named: "T")
        let a = repo.addPlayer(to: team, name: "A", jersey: "1", isActive: true, photoData: nil, song: nil)
        let b = repo.addPlayer(to: team, name: "B", jersey: "2", isActive: false, photoData: nil, song: nil)
        let c = repo.addPlayer(to: team, name: "C", jersey: "3", isActive: true, photoData: nil, song: nil)
        _ = b
        let defaults = UserDefaults(suiteName: "test-\(UUID().uuidString)")!
        let settings = AppSettings(defaults: defaults)
        let vm = GameViewModel(team: team, audio: AudioPlaybackService(settings: settings), settings: settings, defaults: defaults)
        XCTAssertEqual(vm.currentPlayer?.id, a.id)
        vm.nextBatter()
        XCTAssertEqual(vm.currentPlayer?.id, c.id)
        vm.nextBatter()
        XCTAssertEqual(vm.currentPlayer?.id, a.id)
    }

    func testMissingSongNeverCrashes() throws {
        let repo = TeamRepository(context: try makeContext())
        let team = repo.createTeam(named: "T")
        let song = SongAssignment(source: .local, title: "Gone", fileName: "does-not-exist.mp3")
        let p = repo.addPlayer(to: team, name: "A", jersey: "1", isActive: true, photoData: nil, song: song)
        let defaults = UserDefaults(suiteName: "test-\(UUID().uuidString)")!
        let settings = AppSettings(defaults: defaults)
        let vm = GameViewModel(team: team, audio: AudioPlaybackService(settings: settings), settings: settings, defaults: defaults)
        vm.select(p)
        XCTAssertNotNil(vm.notice)
        XCTAssertEqual(SongStatus.evaluate(song, isOnline: true), .missingFile)
    }
}
