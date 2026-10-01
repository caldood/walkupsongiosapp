import SwiftUI
import SwiftData
import MediaPlayer

/// Pick from the song library or add a new song (file, music library, Spotify link).
struct SongPickerView: View {
    var onSelect: (SongAssignment) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @Environment(AudioPlaybackService.self) private var audio
    @Query(sort: \SavedSong.lastUsedAt, order: .reverse) private var songs: [SavedSong]

    @State private var search = ""
    @State private var showImporter = false
    @State private var showMusicPicker = false
    @State private var showSpotify = false
    @State private var errorMessage: String?
    @State private var isImporting = false

    private var filtered: [SavedSong] {
        guard !search.isEmpty else { return songs }
        return songs.filter {
            $0.assignment.title.localizedCaseInsensitiveContains(search) ||
            $0.assignment.artist.localizedCaseInsensitiveContains(search)
        }
    }

    var body: some View {
        List {
            if search.isEmpty {
                Section("Add a Song") {
                    Button { showImporter = true } label: { Label("Import Audio File…", systemImage: "folder") }
                    Button { Task { await openMusicLibrary() } } label: { Label("Music Library (on this device)", systemImage: "music.note.list") }
                    Button { showSpotify = true } label: { Label("Spotify Link (needs internet)", systemImage: "antenna.radiowaves.left.and.right") }
                    if isImporting { ProgressView("Importing…") }
                }
                let favorites = songs.filter(\.isFavorite)
                if !favorites.isEmpty {
                    Section("Favorites") { ForEach(favorites, id: \.key) { row($0) } }
                }
                let recents = Array(songs.filter { $0.useCount > 0 }.prefix(5))
                if !recents.isEmpty {
                    Section("Recently Used") { ForEach(recents, id: \.key) { row($0) } }
                }
            }
            Section(search.isEmpty ? "All Songs" : "Results") {
                ForEach(filtered.sorted { $0.assignment.title.localizedCaseInsensitiveCompare($1.assignment.title) == .orderedAscending }, id: \.key) { row($0) }
                    .onDelete { offsets in
                        let sorted = filtered.sorted { $0.assignment.title.localizedCaseInsensitiveCompare($1.assignment.title) == .orderedAscending }
                        for i in offsets { context.delete(sorted[i]) }
                    }
                if filtered.isEmpty { Text(search.isEmpty ? "No songs yet." : "No matches.").foregroundStyle(.secondary) }
            }
        }
        .navigationTitle("Choose Song")
        .searchable(text: $search, prompt: "Search title or artist")
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.audio]) { result in
            switch result {
            case .success(let url):
                isImporting = true
                Task {
                    defer { isImporting = false }
                    do { choose(try await SongFileStore.importFile(from: url)) }
                    catch { errorMessage = error.localizedDescription }
                }
            case .failure(let error): errorMessage = error.localizedDescription
            }
        }
        .sheet(isPresented: $showMusicPicker) {
            MusicLibraryPicker { item in
                showMusicPicker = false
                guard item.assetURL != nil else {
                    errorMessage = "“\(item.title ?? "That song")” is protected or not downloaded to this device, so WalkUp can't play it. Choose a downloaded or purchased song, or import the audio file."
                    return
                }
                choose(SongAssignment(source: .musicLibrary, title: item.title ?? "Untitled",
                                      artist: item.artist ?? "", musicLibraryID: String(item.persistentID),
                                      durationSeconds: item.playbackDuration))
            } onCancel: { showMusicPicker = false }
        }
        .sheet(isPresented: $showSpotify) {
            SpotifyTrackSheet { choose($0) }
        }
        .alert("Song Problem", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(errorMessage ?? "") }
        .onDisappear { if audio.session?.isPreview == true { audio.stop() } }
    }

    private func row(_ saved: SavedSong) -> some View {
        let song = saved.assignment
        let previewing = audio.isActive && audio.session?.isPreview == true && audio.session?.assignment.libraryKey == song.libraryKey
        return HStack(spacing: 8) {
            Button { choose(song) } label: {
                VStack(alignment: .leading, spacing: 3) {
                    Text(song.title).font(.headline)
                    if !song.artist.isEmpty { Text(song.artist).font(.subheadline).foregroundStyle(.secondary) }
                    SongSourceBadge(song: song)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            Button {
                if previewing { audio.stop(); return }
                if song.source == .spotify {
                    Task { _ = await SpotifyDeepLinkPlayer().play(trackID: song.spotifyTrackID ?? "") }
                } else {
                    errorMessage = audio.preview(song, label: song.title)
                }
            } label: {
                Image(systemName: previewing ? "stop.circle.fill" : (song.source == .spotify ? "arrow.up.forward.app" : "play.circle"))
                    .font(.title2).frame(width: 44, height: 44)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel(previewing ? "Stop preview" : "Preview \(song.title)")
            Button { saved.isFavorite.toggle() } label: {
                Image(systemName: saved.isFavorite ? "star.fill" : "star")
                    .font(.title3).frame(width: 44, height: 44)
                    .foregroundStyle(saved.isFavorite ? Color.yellow : Color.secondary)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel(saved.isFavorite ? "Remove favorite" : "Add favorite")
        }
    }

    private func choose(_ song: SongAssignment) {
        audio.stop()
        SongLibrary.record(song, in: context)
        onSelect(song)
        dismiss()
    }

    private func openMusicLibrary() async {
        if await MusicLibrary.requestAccess() { showMusicPicker = true }
        else { errorMessage = "Allow access to your music library in Settings › WalkUp to use songs from Apple Music / iTunes." }
    }
}

/// Spotify track entry. Spotify's terms don't allow downloading or embedding its audio, so tracks
/// are referenced by ID and played by handing off to the Spotify app.
struct SpotifyTrackSheet: View {
    var onAdd: (SongAssignment) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(ConnectivityMonitor.self) private var connectivity
    @State private var input = ""
    @State private var title = ""
    @State private var artist = ""
    @State private var loading = false

    private var trackID: String? { SpotifyLink.trackID(from: input) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Button {
                        Task { await UIApplication.shared.open(URL(string: "spotify:")!) }
                    } label: { Label("Open Spotify to Find a Song", systemImage: "arrow.up.forward.app") }
                    Text("In Spotify tap ••• on a track › Share › Copy Link, then come back and paste it here.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Section("Track Link") {
                    TextField("https://open.spotify.com/track/…", text: $input)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    PasteButton(payloadType: String.self) { strings in input = strings.first ?? "" }
                    if !input.isEmpty && trackID == nil {
                        Label("That doesn't look like a Spotify track link.", systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.orange)
                    }
                }
                if trackID != nil {
                    Section("Details") {
                        TextField("Song title", text: $title)
                        TextField("Artist (optional)", text: $artist)
                        if loading { ProgressView() }
                        if !connectivity.isOnline {
                            Label("You're offline — type the title yourself.", systemImage: "wifi.slash").font(.footnote)
                        }
                    }
                    Section {
                        Label("Spotify songs need internet and play in the Spotify app. WalkUp can't fade, trim or auto-stop them.",
                              systemImage: "info.circle").font(.footnote).foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Spotify Song")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add") {
                        guard let id = trackID else { return }
                        onAdd(SongAssignment(source: .spotify, title: title.trimmingCharacters(in: .whitespaces),
                                             artist: artist.trimmingCharacters(in: .whitespaces), spotifyTrackID: id))
                        dismiss()
                    }
                    .disabled(trackID == nil || title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .task(id: trackID) {
                guard let id = trackID else { return }
                loading = true
                defer { loading = false }
                if let info = await SpotifyMetadata.fetch(trackID: id), title.isEmpty { title = info.title }
            }
        }
    }
}
