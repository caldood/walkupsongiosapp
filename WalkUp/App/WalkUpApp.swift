import SwiftUI
import SwiftData

@main
struct WalkUpApp: App {
    private let container: ModelContainer
    private let storageProblem: Bool
    @State private var settings = AppSettings.shared
    @State private var audio: AudioPlaybackService
    @State private var connectivity = ConnectivityMonitor()

    init() {
        let schema = Schema([Team.self, Player.self, Lineup.self, SavedSong.self])
        var problem = false
        if let persistent = try? ModelContainer(for: schema) {
            container = persistent
        } else {
            // Never crash on launch: fall back to memory and tell the user.
            problem = true
            container = try! ModelContainer(for: schema, configurations: ModelConfiguration(isStoredInMemoryOnly: true))
        }
        storageProblem = problem
        _audio = State(initialValue: AudioPlaybackService(settings: AppSettings.shared))
    }

    var body: some Scene {
        WindowGroup {
            RootView(storageProblem: storageProblem)
                .environment(settings)
                .environment(audio)
                .environment(connectivity)
                .preferredColorScheme(colorScheme)
        }
        .modelContainer(container)
    }

    private var colorScheme: ColorScheme? {
        switch settings.appearance {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}
