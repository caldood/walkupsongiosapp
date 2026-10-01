import SwiftUI
import SwiftData

struct RootView: View {
    let storageProblem: Bool
    @Environment(\.modelContext) private var context
    @Query(sort: \Team.sortIndex) private var teams: [Team]
    @AppStorage("selectedTeamID") private var savedSelection = ""
    @State private var selection: UUID?
    @State private var column: NavigationSplitViewColumn = .detail
    @State private var importMessage: String?
    @State private var showStorageAlert = false

    var body: some View {
        NavigationSplitView(preferredCompactColumn: $column) {
            TeamListView(selection: $selection)
        } detail: {
            if let team = teams.first(where: { $0.id == selection }) {
                NavigationStack { TeamHomeView(team: team, selection: $selection) }
                    .id(team.id)
            } else {
                ContentUnavailableView("No Team Selected", systemImage: "baseball",
                                       description: Text("Create or choose a team to get started."))
            }
        }
        .onAppear {
            if selection == nil {
                selection = UUID(uuidString: savedSelection).flatMap { id in teams.contains { $0.id == id } ? id : nil }
                    ?? teams.first?.id
            }
            column = selection == nil ? .sidebar : .detail
            showStorageAlert = storageProblem
        }
        .onChange(of: selection) { _, new in
            if let new { savedSelection = new.uuidString; column = .detail } else { column = .sidebar }
        }
        .onOpenURL { url in
            do {
                let archive = try TeamArchiveService.read(from: url)
                let created = TeamArchiveService.restore(archive, into: context)
                importMessage = "Imported \(created.count) team\(created.count == 1 ? "" : "s")."
                selection = created.first?.id
            } catch {
                importMessage = error.localizedDescription
            }
        }
        .alert("Import", isPresented: Binding(get: { importMessage != nil }, set: { if !$0 { importMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(importMessage ?? "") }
        .alert("Storage Problem", isPresented: $showStorageAlert) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("WalkUp couldn't open its saved data. Changes made now won't be kept. Restart the app, and restore from a backup if the problem persists.")
        }
    }
}
