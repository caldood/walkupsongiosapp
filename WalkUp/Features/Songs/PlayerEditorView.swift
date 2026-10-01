import SwiftUI
import PhotosUI

struct PlayerEditorView: View {
    let team: Team
    let player: Player?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var context
    @Environment(AudioPlaybackService.self) private var audio

    @State private var name: String
    @State private var jersey: String
    @State private var isActive: Bool
    @State private var photoData: Data?
    @State private var song: SongAssignment?
    @State private var photoItem: PhotosPickerItem?

    init(team: Team, player: Player?) {
        self.team = team
        self.player = player
        _name = State(initialValue: player?.name ?? "")
        _jersey = State(initialValue: player?.jerseyNumber ?? "")
        _isActive = State(initialValue: player?.isActive ?? true)
        _photoData = State(initialValue: player?.photoData)
        _song = State(initialValue: player?.song)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 16) {
                        AvatarView(name: name, jersey: jersey, photoData: photoData, size: 72)
                        VStack(alignment: .leading, spacing: 8) {
                            PhotosPicker(selection: $photoItem, matching: .images) {
                                Label(photoData == nil ? "Add Photo" : "Change Photo", systemImage: "photo")
                            }
                            if photoData != nil {
                                Button("Remove Photo", role: .destructive) { photoData = nil }
                            }
                        }
                        .buttonStyle(.borderless)
                    }
                    TextField("Player name", text: $name).textContentType(.name).font(.title3)
                    TextField("Jersey number", text: $jersey)
                        .keyboardType(.numbersAndPunctuation)
                        .font(.title3)
                    Toggle("Active in lineup", isOn: $isActive)
                }

                Section("Walk-up Song") {
                    NavigationLink {
                        SongPickerView { picked in song = picked }
                    } label: { SongSummaryRow(song: song) }
                    if let binding = Binding($song) {
                        SongClipEditor(song: binding, label: name.isEmpty ? "Preview" : name)
                        Button("Remove Song", role: .destructive) { audio.stop(); song = nil }
                    }
                }
            }
            .navigationTitle(player == nil ? "New Player" : "Edit Player")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { close() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onChange(of: photoItem) { _, item in
                guard let item else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self) {
                        photoData = ImageTools.avatarData(from: data)
                    }
                }
            }
            .onDisappear { if audio.session?.isPreview == true { audio.stop() } }
        }
    }

    private func close() {
        audio.stop()
        dismiss()
    }

    private func save() {
        let repo = TeamRepository(context: context)
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let number = jersey.trimmingCharacters(in: .whitespacesAndNewlines)
        if let player {
            repo.update(player, name: trimmed, jersey: number, isActive: isActive, photoData: photoData, song: song)
        } else {
            repo.addPlayer(to: team, name: trimmed, jersey: number, isActive: isActive, photoData: photoData, song: song)
        }
        close()
    }
}
