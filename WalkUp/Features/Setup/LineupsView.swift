import SwiftUI

/// Saved, reusable game lineups (batting order + who's active).
struct LineupsView: View {
    @Bindable var team: Team
    @Environment(\.modelContext) private var context
    @State private var showSave = false
    @State private var name = ""
    @State private var toApply: Lineup?
    @State private var toDelete: Lineup?

    private var lineups: [Lineup] { team.lineups.sorted { $0.createdAt > $1.createdAt } }

    var body: some View {
        List {
            Section {
                Button { name = "Lineup \(team.lineups.count + 1)"; showSave = true } label: {
                    Label("Save Current Order as Lineup", systemImage: "plus.circle.fill").font(.headline).frame(minHeight: 44)
                }
            } footer: { Text("A lineup remembers the batting order and which players are active, so you can switch between game-day lineups.") }

            Section("Saved") {
                ForEach(lineups) { lineup in
                    HStack {
                        Button { toApply = lineup } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(lineup.name).font(.headline)
                                Text("\(lineup.entries.filter(\.isActive).count) active · \(lineup.createdAt.formatted(date: .abbreviated, time: .omitted))")
                                    .font(.subheadline).foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        ShareLink(item: text(for: lineup)) { Image(systemName: "square.and.arrow.up").frame(width: 44, height: 44) }
                            .buttonStyle(.borderless)
                    }
                    .swipeActions { Button("Delete", role: .destructive) { toDelete = lineup } }
                }
                if lineups.isEmpty { Text("No saved lineups yet.").foregroundStyle(.secondary) }
            }
        }
        .navigationTitle("Lineups")
        .alert("Save Lineup", isPresented: $showSave) {
            TextField("Lineup name", text: $name)
            Button("Save") {
                if !name.trimmingCharacters(in: .whitespaces).isEmpty {
                    TeamRepository(context: context).saveLineup(named: name, from: team)
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog("Use “\(toApply?.name ?? "")”?", isPresented: Binding(
            get: { toApply != nil }, set: { if !$0 { toApply = nil } }), titleVisibility: .visible) {
            Button("Replace Current Batting Order") {
                if let l = toApply { TeamRepository(context: context).apply(l, to: team) }
                toApply = nil
            }
        } message: { Text("Your current order and active players will be replaced. Save it first if you want to keep it.") }
        .confirmationDialog("Delete “\(toDelete?.name ?? "")”?", isPresented: Binding(
            get: { toDelete != nil }, set: { if !$0 { toDelete = nil } }), titleVisibility: .visible) {
            Button("Delete Lineup", role: .destructive) {
                if let l = toDelete { context.delete(l); TeamRepository(context: context).save() }
                toDelete = nil
            }
        }
    }

    /// Text export of a saved lineup, resolved against current players.
    private func text(for lineup: Lineup) -> String {
        let byID = Dictionary(uniqueKeysWithValues: team.players.map { ($0.id, $0) })
        var lines = ["\(team.name) – \(lineup.name)"]
        var n = 1
        for entry in lineup.entries where entry.isActive {
            guard let p = byID[entry.playerID] else { continue }
            lines.append("\(n). #\(p.displayJersey) \(p.name)" + (p.song.map { " — \($0.title)" } ?? ""))
            n += 1
        }
        return lines.joined(separator: "\n")
    }
}
