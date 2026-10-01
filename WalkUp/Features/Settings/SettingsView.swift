import SwiftUI
import SwiftData

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @Environment(AppSettings.self) private var settings
    @Query private var teams: [Team]
    @Query private var players: [Player]
    @Query private var library: [SavedSong]
    @State private var showRestore = false
    @State private var shareURL: URL?
    @State private var message: String?

    var body: some View {
        @Bindable var settings = settings
        NavigationStack {
            Form {
                Section("Walk-up Playback") {
                    Stepper(value: $settings.defaultClipSeconds, in: 3...60, step: 1) {
                        HStack { Text("Default length"); Spacer(); Text("\(Int(settings.defaultClipSeconds)) sec").foregroundStyle(.secondary) }
                    }
                    Stepper(value: $settings.fadeOutSeconds, in: 0...10, step: 0.5) {
                        HStack { Text("Fade out"); Spacer(); Text(String(format: "%.1f sec", settings.fadeOutSeconds)).foregroundStyle(.secondary) }
                    }
                    Stepper(value: $settings.fadeInSeconds, in: 0...5, step: 0.5) {
                        HStack { Text("Fade in"); Spacer(); Text(String(format: "%.1f sec", settings.fadeInSeconds)).foregroundStyle(.secondary) }
                    }
                    VStack(alignment: .leading) {
                        Text("Volume")
                        Slider(value: $settings.masterVolume, in: 0.1...1)
                    }
                    Text("Use the device volume buttons for overall loudness; this scales WalkUp's output.")
                        .font(.footnote).foregroundStyle(.secondary)
                }

                Section("Game Mode") {
                    Toggle("Next Batter also plays their song", isOn: $settings.playOnNextBatter)
                    Toggle("Advance to next batter when a song ends", isOn: $settings.autoAdvanceAfterSong)
                    Toggle("Keep screen awake", isOn: $settings.keepScreenAwake)
                    Toggle("Haptic feedback", isOn: $settings.hapticsEnabled)
                }

                Section("Appearance") {
                    Picker("Theme", selection: $settings.appearance) {
                        ForEach(AppSettings.Appearance.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }

                Section {
                    Button { backup(includeAudio: false) } label: { Label("Back Up All Teams", systemImage: "externaldrive") }
                    Button { backup(includeAudio: true) } label: { Label("Back Up With Audio Files", systemImage: "shippingbox") }
                    Button { showRestore = true } label: { Label("Restore From Backup…", systemImage: "arrow.counterclockwise.circle") }
                    Button { cleanUp() } label: { Label("Remove Unused Audio Files", systemImage: "trash.slash") }
                } header: { Text("Backup & Storage") } footer: {
                    Text("Restoring adds the backed-up teams alongside your current ones; nothing is overwritten.")
                }

                Section("About Spotify") {
                    Text("Spotify doesn't allow its audio to be downloaded or played inside other apps without its SDK, and it needs internet. WalkUp opens Spotify songs in the Spotify app instead. For reliable, offline, auto-stopping walk-ups, import an audio file or use a song stored on this device.")
                        .font(.footnote)
                }
            }
            .navigationTitle("Settings")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .fileImporter(isPresented: $showRestore, allowedContentTypes: [.walkUpArchive, .json]) { result in
                switch result {
                case .success(let url):
                    do {
                        let created = TeamArchiveService.restore(try TeamArchiveService.read(from: url), into: context)
                        message = "Restored \(created.count) team\(created.count == 1 ? "" : "s")."
                    } catch { message = error.localizedDescription }
                case .failure(let error): message = error.localizedDescription
                }
            }
            .sheet(item: Binding(get: { shareURL.map(ShareItem.init) }, set: { if $0 == nil { shareURL = nil } })) {
                ShareSheet(url: $0.url)
            }
            .alert("WalkUp", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
                Button("OK", role: .cancel) {}
            } message: { Text(message ?? "") }
        }
    }

    private func backup(includeAudio: Bool) {
        do {
            let archive = TeamArchiveService.makeArchive(teams: teams.sorted { $0.sortIndex < $1.sortIndex }, includeAudio: includeAudio)
            shareURL = try TeamArchiveService.writeTemporaryFile(archive, baseName: "WalkUp Backup")
        } catch { message = error.localizedDescription }
    }

    private func cleanUp() {
        var referenced = Set(players.compactMap { $0.song?.fileName })
        referenced.formUnion(library.compactMap { $0.assignment.fileName })
        let bytes = SongFileStore.removeOrphans(keeping: referenced)
        message = "Freed \(ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file))."
    }
}
