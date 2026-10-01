import SwiftUI

struct GameModeView: View {
    let team: Team
    @State private var model: GameViewModel
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(AudioPlaybackService.self) private var audio
    @Environment(AppSettings.self) private var settings
    @Environment(ConnectivityMonitor.self) private var connectivity

    init(team: Team, audio: AudioPlaybackService, settings: AppSettings) {
        self.team = team
        _model = State(initialValue: GameViewModel(team: team, audio: audio, settings: settings))
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle(team.name)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("Done") { model.teardown(); dismiss() }
                            .font(.headline)
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        if !connectivity.isOnline {
                            Label("Offline", systemImage: "wifi.slash").font(.footnote.weight(.semibold))
                        }
                    }
                }
        }
        .onAppear { UIApplication.shared.isIdleTimerDisabled = settings.keepScreenAwake }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
    }

    @ViewBuilder private var content: some View {
        if sizeClass == .regular {
            HStack(alignment: .top, spacing: 0) {
                ScrollView { panel.padding() }.frame(width: 420)
                Divider()
                batterList
            }
        } else {
            VStack(spacing: 0) {
                panel.padding([.horizontal, .top]).padding(.bottom, 8)
                Divider()
                batterList
            }
        }
    }

    // MARK: Now playing + controls

    private var panel: some View {
        VStack(spacing: 12) {
            if let notice = model.notice {
                HStack(alignment: .top) {
                    Image(systemName: "exclamationmark.triangle.fill")
                    Text(notice).font(.subheadline.weight(.semibold))
                    Spacer()
                    Button { model.dismissNotice() } label: { Image(systemName: "xmark") }.accessibilityLabel("Dismiss")
                }
                .padding(10).foregroundStyle(.white)
                .background(Theme.clay, in: RoundedRectangle(cornerRadius: 10))
            }
            if let name = model.spotifyHandoff {
                Label("\(name)'s song was sent to Spotify. Pause it in Spotify when done — WalkUp can't control it.",
                      systemImage: "antenna.radiowaves.left.and.right")
                    .font(.subheadline.weight(.semibold))
                    .padding(10).frame(maxWidth: .infinity, alignment: .leading)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 10))
            }

            nowPlaying

            HStack(spacing: 8) {
                ControlButton(title: "Stop", systemImage: "stop.fill", tint: Theme.stop) { model.stop() }
                ControlButton(title: audio.isPlaying ? "Pause" : "Play",
                              systemImage: audio.isPlaying ? "pause.fill" : "play.fill", tint: Theme.grass) { model.togglePlayPause() }
                ControlButton(title: "Replay", systemImage: "arrow.counterclockwise", tint: Theme.neutralButton) { model.replay() }
                ControlButton(title: "Skip", systemImage: "forward.end.fill", tint: Theme.neutralButton, enabled: audio.isPlaying) { model.skip() }
            }

            Button { model.nextBatter() } label: {
                HStack {
                    Image(systemName: "figure.baseball")
                    VStack(alignment: .leading, spacing: 0) {
                        Text("Next Batter").font(.title3.weight(.bold))
                        if let next = model.nextPlayer {
                            Text("#\(next.displayJersey) \(next.name)").font(.footnote).lineLimit(1)
                        }
                    }
                    Spacer()
                    Image(systemName: "chevron.right.circle.fill").font(.title)
                }
                .padding(.horizontal, 16)
                .frame(maxWidth: .infinity, minHeight: 64)
                .foregroundStyle(.white)
                .background(Theme.clay, in: RoundedRectangle(cornerRadius: 16))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Next batter")
        }
    }

    @ViewBuilder private var nowPlaying: some View {
        if audio.isActive, let session = audio.session {
            VStack(spacing: 6) {
                Text("#\(session.jersey.isEmpty ? "–" : session.jersey)  \(session.playerName)")
                    .font(.system(.title, design: .rounded, weight: .heavy)).lineLimit(1).minimumScaleFactor(0.6)
                Text(session.assignment.title + (session.assignment.artist.isEmpty ? "" : " · \(session.assignment.artist)"))
                    .font(.headline).foregroundStyle(.secondary).lineLimit(1)
                ProgressView(value: min(audio.elapsed, max(audio.clipLength, 0.1)), total: max(audio.clipLength, 0.1))
                    .tint(Theme.grass)
                HStack {
                    Text(TimeFormat.clock(audio.elapsed))
                    Spacer()
                    Text(audio.state == .paused ? "PAUSED" : "").font(.footnote.weight(.bold))
                    Spacer()
                    Text("-" + TimeFormat.clock(audio.remaining))
                }
                .font(.system(.title2, design: .rounded, weight: .semibold)).monospacedDigit()
            }
            .accessibilityElement(children: .combine)
        } else if let p = model.currentPlayer {
            VStack(spacing: 4) {
                Text("AT BAT").font(.caption.weight(.bold)).foregroundStyle(.secondary)
                Text("#\(p.displayJersey)  \(p.name)")
                    .font(.system(.title, design: .rounded, weight: .heavy)).lineLimit(1).minimumScaleFactor(0.6)
                Text(p.song?.title ?? "No song assigned").font(.headline).foregroundStyle(.secondary).lineLimit(1)
            }
            .padding(.vertical, 6)
        } else {
            Text("No active players").font(.title2.bold())
        }
    }

    // MARK: Batting order

    private var batterList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 340), spacing: 12)], spacing: 12) {
                    ForEach(Array(model.batters.enumerated()), id: \.element.id) { index, player in
                        BatterCard(player: player, position: index + 1,
                                   isCurrent: player.id == model.currentPlayerID,
                                   isPlaying: audio.isPlaying && audio.session?.playerID == player.id,
                                   isOnline: connectivity.isOnline) {
                            Haptics.tap(settings)
                            model.select(player)
                        }
                        .id(player.id)
                    }
                }
                .padding()
            }
            .onChange(of: model.currentPlayerID) { _, id in
                if let id { proxy.scrollTo(id, anchor: .center) }
            }
        }
    }
}

private struct ControlButton: View {
    let title: String
    let systemImage: String
    let tint: Color
    var enabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: systemImage).font(.title.weight(.bold))
                Text(title).font(.caption.weight(.semibold))
            }
            .frame(maxWidth: .infinity, minHeight: 72)
            .foregroundStyle(.white)
            .background(tint, in: RoundedRectangle(cornerRadius: 16))
            .opacity(enabled ? 1 : 0.4)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityLabel(title)
    }
}

private struct BatterCard: View {
    let player: Player
    let position: Int
    let isCurrent: Bool
    let isPlaying: Bool
    let isOnline: Bool
    let action: () -> Void

    var body: some View {
        let status = SongStatus.evaluate(player.song, isOnline: isOnline)
        let fg: Color = isCurrent ? .white : .primary
        Button(action: action) {
            HStack(spacing: 14) {
                VStack(spacing: 0) {
                    Text("#\(player.displayJersey)")
                        .font(.system(size: 34, weight: .heavy, design: .rounded))
                        .minimumScaleFactor(0.5).lineLimit(1)
                    Text("\(position)").font(.caption.weight(.semibold)).opacity(0.8)
                }
                .frame(width: 76)

                VStack(alignment: .leading, spacing: 4) {
                    if isCurrent { Text("AT BAT").font(.caption.weight(.heavy)) }
                    Text(player.name).font(.title2.weight(.bold)).lineLimit(1).minimumScaleFactor(0.7)
                    if let song = player.song {
                        HStack(spacing: 6) {
                            Text(song.title).font(.subheadline).lineLimit(1)
                            if song.requiresInternet { Image(systemName: "wifi").font(.caption) }
                        }
                    }
                    if status.isProblem {
                        Label(status.message, systemImage: "exclamationmark.triangle.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(isCurrent ? Color.yellow : Color.orange)
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: isPlaying ? "speaker.wave.3.fill" : "play.circle.fill")
                    .font(.system(size: 44))
            }
            .foregroundStyle(fg)
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: 92)
            .background(isCurrent ? Theme.grass : Theme.card, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(isCurrent ? Color.white.opacity(0.6) : Color.secondary.opacity(0.25), lineWidth: isCurrent ? 3 : 1))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Batter \(position), number \(player.displayJersey), \(player.name). \(player.song?.title ?? "No song"). \(status.isProblem ? status.message : "")")
        .accessibilityHint("Plays walk-up song")
        .accessibilityAddTraits(isCurrent ? [.isSelected, .isButton] : .isButton)
    }
}
