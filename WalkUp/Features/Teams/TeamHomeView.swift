import SwiftUI
import SwiftData

/// The team's pre-game hub: batting order, song assignment/testing, lineups, team actions.
struct TeamHomeView: View {
    @Bindable var team: Team
    @Binding var selection: UUID?
    @Environment(\.modelContext) private var context
    @Environment(AudioPlaybackService.self) private var audio
    @Environment(AppSettings.self) private var settings
    @Environment(ConnectivityMonitor.self) private var connectivity
    @Query(sort: \Team.sortIndex) private var allTeams: [Team]

    @State private var editMode: EditMode = .inactive
    @State private var editorTarget: EditorTarget?
    @State private var showGame = false
    @State private var showRename = false
    @State private var renameText = ""
    @State private var playerToDelete: Player?
    @State private var showDeleteTeam = false
    @State private var shareURL: URL?
    @State private var includeAudio = false
    @State private var errorMessage: String?

    private struct EditorTarget: Identifiable {
        let id = UUID()
        var player: Player?
    }

    private var repo: TeamRepository { TeamRepository(context: context) }

    var body: some View {
        List {
            Section {
                Button {
                    audio.stop()
                    showGame = true
                } label: {
                    Label("Start Game Mode", systemImage: "play.circle.fill")
                        .font(.title2.weight(.bold))
                        .frame(maxWidth: .infinity, minHeight: 56)
                }
                .buttonStyle(.borderedProminent)
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
                .disabled(team.activeBattingOrder.isEmpty)
                if team.activeBattingOrder.isEmpty {
                    Text("Add at least one active player to start a game.").font(.footnote).foregroundStyle(.secondary)
                }
            }

            Section("Walk-up Length") {
                Stepper(value: Bindable(settings).defaultClipSeconds, in: 3...60, step: 1) {
                    HStack { Text("Default length"); Spacer(); Text("\(Int(settings.defaultClipSeconds)) sec").foregroundStyle(.secondary) }
                }
            }

            Section {
                ForEach(Array(team.battingOrder.enumerated()), id: \.element.id) { index, player in
                    PlayerRow(player: player, position: index + 1,
                              isOnline: connectivity.isOnline,
                              onEdit: { editorTarget = EditorTarget(player: player) },
                              onToggleActive: { player.isActive.toggle(); repo.save() },
                              onTest: { test(player) })
                        .swipeActions(edge: .trailing) {
                            Button("Delete", role: .destructive) { playerToDelete = player }
                        }
                }
                .onMove { repo.move(in: team, from: $0, to: $1) }
                Button { editorTarget = EditorTarget(player: nil) } label: {
                    Label("Add Player", systemImage: "plus.circle.fill").font(.headline)
                        .frame(minHeight: 44)
                }
            } header: {
                Text("Batting Order")
            } footer: {
                Text("Tap Edit to drag players into a new order. Inactive players are skipped in Game Mode.")
            }

            Section("Lineups") {
                NavigationLink { LineupsView(team: team) } label: {
                    Label("Saved Lineups (\(team.lineups.count))", systemImage: "list.number")
                }
                ShareLink(item: LineupFormatter.text(team: team)) {
                    Label("Share Batting Order", systemImage: "square.and.arrow.up")
                }
            }
        }
        .environment(\.editMode, $editMode)
        .navigationTitle(team.name)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { EditButton() }
            ToolbarItem(placement: .topBarTrailing) { teamMenu }
        }
        .sheet(item: Binding(get: { shareURL.map(ShareItem.init) }, set: { if $0 == nil { shareURL = nil } })) { item in
            ShareSheet(url: item.url)
        }
        .sheet(item: $editorTarget) { target in
            PlayerEditorView(team: team, player: target.player)
        }
        .fullScreenCover(isPresented: $showGame) {
            GameModeView(team: team, audio: audio, settings: settings)
        }
        .alert("Rename Team", isPresented: $showRename) {
            TextField("Team name", text: $renameText)
            Button("Save") {
                let n = renameText.trimmingCharacters(in: .whitespacesAndNewlines)
                if !n.isEmpty { team.name = n; repo.save() }
            }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog("Remove \(playerToDelete?.name ?? "player")?", isPresented: Binding(
            get: { playerToDelete != nil }, set: { if !$0 { playerToDelete = nil } }), titleVisibility: .visible) {
            Button("Remove Player", role: .destructive) {
                if let p = playerToDelete { repo.delete(p) }
                playerToDelete = nil
            }
        }
        .confirmationDialog("Delete \(team.name)?", isPresented: $showDeleteTeam, titleVisibility: .visible) {
            Button("Delete Team and Players", role: .destructive) {
                selection = nil
                repo.delete(team)
            }
        } message: { Text("This can't be undone.") }
        .alert("Couldn't Play Song", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(errorMessage ?? "") }
        .onDisappear { if audio.session?.isPreview == true { audio.stop() } }
    }

    private var teamMenu: some View {
        Menu {
            if allTeams.count > 1 {
                Menu("Switch Team", systemImage: "arrow.left.arrow.right") {
                    ForEach(allTeams) { t in
                        Button(t.name) { selection = t.id }
                    }
                }
            }
            Button { renameText = team.name; showRename = true } label: { Label("Rename", systemImage: "pencil") }
            Button { selection = repo.duplicate(team).id } label: { Label("Duplicate Team", systemImage: "plus.square.on.square") }
            Divider()
            Button { export(includeAudio: false) } label: { Label("Export Team File", systemImage: "square.and.arrow.up") }
            Button { export(includeAudio: true) } label: { Label("Export With Audio Files", systemImage: "shippingbox") }
            Divider()
            Button(role: .destructive) { showDeleteTeam = true } label: { Label("Delete Team", systemImage: "trash") }
        } label: { Label("Team Options", systemImage: "ellipsis.circle") }
    }

    private func export(includeAudio: Bool) {
        do {
            let archive = TeamArchiveService.makeArchive(teams: [team], includeAudio: includeAudio)
            shareURL = try TeamArchiveService.writeTemporaryFile(archive, baseName: team.name)
        } catch { errorMessage = error.localizedDescription }
    }

    private func test(_ player: Player) {
        if audio.session?.playerID == player.id, audio.isActive { audio.stop(); return }
        guard let song = player.song else { errorMessage = "\(player.name) has no song yet."; return }
        if song.source == .spotify {
            Task { _ = await SpotifyDeepLinkPlayer().play(trackID: song.spotifyTrackID ?? "") }
            return
        }
        do { try audio.play(song, playerID: player.id, playerName: player.name, jersey: player.jerseyNumber, isPreview: true) }
        catch { errorMessage = error.localizedDescription }
    }
}

struct ShareItem: Identifiable { let url: URL; var id: URL { url } }

struct ShareSheet: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

private struct PlayerRow: View {
    let player: Player
    let position: Int
    let isOnline: Bool
    let onEdit: () -> Void
    let onToggleActive: () -> Void
    let onTest: () -> Void
    @Environment(AudioPlaybackService.self) private var audio

    var body: some View {
        let status = SongStatus.evaluate(player.song, isOnline: isOnline)
        HStack(spacing: 12) {
            Button(action: onToggleActive) {
                Image(systemName: player.isActive ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel(player.isActive ? "Active" : "Inactive")
            .accessibilityHint("Toggles whether this player is in the lineup")

            Button(action: onEdit) {
                HStack(spacing: 12) {
                    Text("\(position)").font(.headline).foregroundStyle(.secondary).frame(minWidth: 22)
                    AvatarView(name: player.name, jersey: player.jerseyNumber, photoData: player.photoData)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("#\(player.displayJersey)  \(player.name)").font(.headline)
                        if let song = player.song {
                            Text(song.title).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                            SongSourceBadge(song: song)
                        }
                        if status.isProblem {
                            Label(status.message, systemImage: "exclamationmark.triangle.fill")
                                .font(.caption).foregroundStyle(.orange)
                        }
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if player.song != nil {
                let testing = audio.session?.playerID == player.id && audio.isActive
                Button(action: onTest) {
                    Image(systemName: testing ? "stop.circle.fill" : "play.circle")
                        .font(.title)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.borderless)
                .disabled(!status.isPlayable)
                .accessibilityLabel(testing ? "Stop test" : "Test song")
            }
        }
        .opacity(player.isActive ? 1 : 0.5)
    }
}
