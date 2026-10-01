import SwiftUI

/// Start point, custom length and a Test button for one song. Used inside a Form section.
struct SongClipEditor: View {
    @Binding var song: SongAssignment
    let label: String
    @Environment(AudioPlaybackService.self) private var audio
    @Environment(AppSettings.self) private var settings
    @State private var errorMessage: String?

    private var testing: Bool { audio.session?.isPreview == true && audio.isActive }
    private var maxStart: Double { max((song.durationSeconds ?? 600) - 1, 1) }

    var body: some View {
        if song.source == .spotify {
            Label("Spotify plays in the Spotify app, so start point and length can't be controlled here. Tap Test to open it.",
                  systemImage: "info.circle")
                .font(.footnote).foregroundStyle(.secondary)
            Button {
                Task { _ = await SpotifyDeepLinkPlayer().play(trackID: song.spotifyTrackID ?? "") }
            } label: { Label("Open in Spotify", systemImage: "arrow.up.forward.app") }
        } else {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Start at")
                    Spacer()
                    Text(TimeFormat.clock(song.startSeconds)).monospacedDigit().foregroundStyle(.secondary)
                }
                Slider(value: $song.startSeconds, in: 0...maxStart, step: 0.5)
                    .accessibilityLabel("Start point")
                HStack {
                    nudge("−5s", -5); nudge("−1s", -1); nudge("+1s", 1); nudge("+5s", 5)
                }
            }
            Toggle("Custom length", isOn: Binding(
                get: { song.clipSeconds != nil },
                set: { song.clipSeconds = $0 ? settings.defaultClipSeconds : nil }))
            if let clip = song.clipSeconds {
                Stepper(value: Binding(get: { clip }, set: { song.clipSeconds = $0 }), in: 3...60, step: 1) {
                    HStack { Text("Length"); Spacer(); Text("\(Int(clip)) sec").foregroundStyle(.secondary) }
                }
            } else {
                Text("Uses the default length (\(Int(settings.defaultClipSeconds)) sec).")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Button {
                if testing { audio.stop() } else { errorMessage = audio.preview(song, label: label) }
            } label: {
                Label(testing ? "Stop Test" : "Test From Start Point", systemImage: testing ? "stop.fill" : "play.fill")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .tint(testing ? Theme.stop : .accentColor)
            .alert("Couldn't Play Song", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
                Button("OK", role: .cancel) {}
            } message: { Text(errorMessage ?? "") }
        }
    }

    private func nudge(_ title: String, _ delta: Double) -> some View {
        Button(title) { song.startSeconds = min(max(0, song.startSeconds + delta), maxStart) }
            .buttonStyle(.bordered)
            .frame(maxWidth: .infinity)
    }
}
