import SwiftUI
import SwiftData

struct TeamListView: View {
    @Binding var selection: UUID?
    @Environment(\.modelContext) private var context
    @Query(sort: \Team.sortIndex) private var teams: [Team]
    @State private var showNewTeam = false
    @State private var newTeamName = ""
    @State private var showSettings = false
    @State private var showImporter = false
    @State private var teamToDelete: Team?
    @State private var message: String?

    var body: some View {
        List(selection: $selection) {
            ForEach(teams) { team in
                VStack(alignment: .leading, spacing: 2) {
                    Text(team.name).font(.headline)
                    Text("\(team.activeBattingOrder.count) active of \(team.players.count) players")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                .padding(.vertical, 6)
                .tag(team.id)
                .swipeActions(edge: .trailing) {
                    Button("Delete", role: .destructive) { teamToDelete = team }
                    Button("Duplicate") { TeamRepository(context: context).duplicate(team) }.tint(.blue)
                }
            }
        }
        .overlay {
            if teams.isEmpty {
                ContentUnavailableView {
                    Label("No Teams Yet", systemImage: "person.3")
                } description: {
                    Text("Create your first team to build a batting order.")
                } actions: {
                    Button("Create Team") { showNewTeam = true }.buttonStyle(.borderedProminent)
                }
            }
        }
        .navigationTitle("Teams")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { showSettings = true } label: { Label("Settings", systemImage: "gearshape") }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { showNewTeam = true } label: { Label("New Team", systemImage: "plus") }
                    Button { showImporter = true } label: { Label("Import Team File…", systemImage: "square.and.arrow.down") }
                } label: { Label("Add", systemImage: "plus") }
            }
        }
        .alert("New Team", isPresented: $showNewTeam) {
            TextField("Team name", text: $newTeamName)
            Button("Create") {
                let name = newTeamName.trimmingCharacters(in: .whitespacesAndNewlines)
                if !name.isEmpty { selection = TeamRepository(context: context).createTeam(named: name).id }
                newTeamName = ""
            }
            Button("Cancel", role: .cancel) { newTeamName = "" }
        }
        .confirmationDialog("Delete \(teamToDelete?.name ?? "team")?", isPresented: Binding(
            get: { teamToDelete != nil }, set: { if !$0 { teamToDelete = nil } }), titleVisibility: .visible) {
            Button("Delete Team and Players", role: .destructive) {
                if let team = teamToDelete {
                    if selection == team.id { selection = nil }
                    TeamRepository(context: context).delete(team)
                }
                teamToDelete = nil
            }
        } message: { Text("This can't be undone. Export a backup first if you might need it.") }
        .fileImporter(isPresented: $showImporter, allowedContentTypes: [.walkUpArchive, .json]) { result in
            switch result {
            case .success(let url):
                do {
                    let archive = try TeamArchiveService.read(from: url)
                    let created = TeamArchiveService.restore(archive, into: context)
                    selection = created.first?.id
                } catch { message = error.localizedDescription }
            case .failure(let error): message = error.localizedDescription
            }
        }
        .alert("Import Failed", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
            Button("OK", role: .cancel) {}
        } message: { Text(message ?? "") }
        .sheet(isPresented: $showSettings) { SettingsView() }
    }
}
