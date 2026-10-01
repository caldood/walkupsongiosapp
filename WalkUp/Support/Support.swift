import SwiftUI
import UIKit

enum Theme {
    /// Deep infield green: ≥7:1 contrast with white text in light and dark mode.
    static let grass = Color(red: 0.05, green: 0.38, blue: 0.22)
    static let stop = Color(red: 0.72, green: 0.10, blue: 0.10)
    static let clay = Color(red: 0.62, green: 0.30, blue: 0.12)
    static let neutralButton = Color(red: 0.22, green: 0.24, blue: 0.28)
    static let card = Color(.secondarySystemGroupedBackground)
}

enum TimeFormat {
    static func clock(_ t: TimeInterval) -> String {
        let total = Int(max(0, t).rounded(.down))
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}

@MainActor
enum Haptics {
    static func tap(_ settings: AppSettings) {
        guard settings.hapticsEnabled else { return }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }
}

enum ImageTools {
    /// Downsamples a picked photo so rosters stay small in storage and backups.
    static func avatarData(from data: Data, maxDimension: CGFloat = 400) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let scale = min(1, maxDimension / max(image.size.width, image.size.height))
        let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.jpegData(withCompressionQuality: 0.8) { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
    }
}

struct AvatarView: View {
    let name: String
    let jersey: String
    let photoData: Data?
    var size: CGFloat = 52

    var body: some View {
        Group {
            if let photoData, let image = UIImage(data: photoData) {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                ZStack {
                    Theme.grass
                    Text(jersey.isEmpty ? String(name.prefix(1)).uppercased() : jersey)
                        .font(.system(size: size * 0.42, weight: .heavy, design: .rounded))
                        .foregroundStyle(.white)
                        .minimumScaleFactor(0.5)
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .accessibilityHidden(true)
    }
}

/// Distinguishes local audio from Spotify at a glance and flags internet requirements.
struct SongSourceBadge: View {
    let song: SongAssignment

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: song.source.systemImage)
            Text(song.source.shortLabel)
            if song.requiresInternet {
                Image(systemName: "wifi")
                Text("Internet")
            }
        }
        .font(.caption.weight(.semibold))
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(song.requiresInternet ? Theme.clay : Color.secondary.opacity(0.25), in: Capsule())
        .foregroundStyle(song.requiresInternet ? Color.white : Color.primary)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(song.requiresInternet ? "Spotify song, requires internet" : "\(song.source.label) song, works offline")
    }
}

struct SongSummaryRow: View {
    let song: SongAssignment?

    var body: some View {
        if let song {
            VStack(alignment: .leading, spacing: 4) {
                Text(song.title).font(.headline)
                if !song.artist.isEmpty { Text(song.artist).font(.subheadline).foregroundStyle(.secondary) }
                SongSourceBadge(song: song)
            }
        } else {
            Text("Choose a song").foregroundStyle(.secondary)
        }
    }
}
