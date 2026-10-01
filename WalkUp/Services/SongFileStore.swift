import Foundation
import AVFoundation

enum SongImportError: LocalizedError {
    case unsupportedType(String)
    case copyFailed(String)
    case unreadable

    var errorDescription: String? {
        switch self {
        case .unsupportedType(let ext): "“.\(ext)” files aren't supported. Use MP3, M4A, AAC or WAV."
        case .copyFailed(let why): "Couldn't copy the file into WalkUp: \(why)"
        case .unreadable: "That file couldn't be read as audio. It may be protected or damaged."
        }
    }
}

/// Owns the on-disk copies of imported audio. Everything is addressed by file name so data
/// survives container path changes and can be backed up/restored.
enum SongFileStore {
    static let supportedExtensions: Set<String> = ["mp3", "m4a", "aac", "wav", "aif", "aiff", "caf", "mp4"]

    static var directory: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("Songs", isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    /// Strips any path components so a malicious archive can't write outside `directory`.
    static func safeName(_ name: String) -> String? {
        let last = (name as NSString).lastPathComponent
        guard !last.isEmpty, last != ".", last != ".." else { return nil }
        return last
    }

    static func url(for fileName: String) -> URL {
        directory.appendingPathComponent(safeName(fileName) ?? "invalid", isDirectory: false)
    }

    static func exists(_ fileName: String) -> Bool {
        FileManager.default.fileExists(atPath: url(for: fileName).path)
    }

    /// Copies a user-selected file (Files app, iCloud Drive, …) into app storage and reads its metadata.
    static func importFile(from source: URL) async throws -> SongAssignment {
        let ext = source.pathExtension.lowercased()
        guard supportedExtensions.contains(ext) else { throw SongImportError.unsupportedType(ext) }

        let scoped = source.startAccessingSecurityScopedResource()
        defer { if scoped { source.stopAccessingSecurityScopedResource() } }

        let originalBase = source.deletingPathExtension().lastPathComponent
        let stored = "\(UUID().uuidString)-\(safeName(source.lastPathComponent) ?? "song.\(ext)")"
        let destination = url(for: stored)
        do {
            try FileManager.default.copyItem(at: source, to: destination)
        } catch {
            throw SongImportError.copyFailed(error.localizedDescription)
        }

        do {
            let meta = try await SongMetadataReader.read(url: destination, fallbackTitle: originalBase)
            return SongAssignment(source: .local, title: meta.title, artist: meta.artist,
                                  fileName: stored, durationSeconds: meta.duration)
        } catch {
            try? FileManager.default.removeItem(at: destination)
            throw SongImportError.unreadable
        }
    }

    static func allFileNames() -> [String] {
        (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
    }

    /// Deletes files no player/library entry refers to. Returns bytes reclaimed.
    @discardableResult
    static func removeOrphans(keeping referenced: Set<String>) -> Int64 {
        var reclaimed: Int64 = 0
        for name in allFileNames() where !referenced.contains(name) {
            let u = url(for: name)
            let size = (try? u.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
            if (try? FileManager.default.removeItem(at: u)) != nil { reclaimed += Int64(size) }
        }
        return reclaimed
    }
}

enum SongMetadataReader {
    struct Result { var title: String; var artist: String; var duration: Double }

    static func read(url: URL, fallbackTitle: String) async throws -> Result {
        let asset = AVURLAsset(url: url)
        let duration = try await asset.load(.duration).seconds
        guard duration.isFinite, duration > 0 else { throw SongImportError.unreadable }
        let metadata = (try? await asset.load(.commonMetadata)) ?? []

        func string(_ id: AVMetadataIdentifier) async -> String? {
            guard let item = AVMetadataItem.metadataItems(from: metadata, filteredByIdentifier: id).first else { return nil }
            let value = try? await item.load(.stringValue)
            let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines)
            return (trimmed?.isEmpty == false) ? trimmed : nil
        }
        let title = await string(.commonIdentifierTitle) ?? fallbackTitle
        let artist = await string(.commonIdentifierArtist) ?? ""
        return Result(title: title, artist: artist, duration: duration)
    }
}
