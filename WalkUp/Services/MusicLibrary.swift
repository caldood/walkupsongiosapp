import SwiftUI
import MediaPlayer

/// Optional local Apple Music / iTunes library support. Only items physically stored on the
/// device with an `assetURL` are playable; DRM-protected/streaming-only items have no URL and
/// are rejected (Apple does not allow playing those through AVAudioPlayer).
enum MusicLibrary {
    static func item(persistentID: String) -> MPMediaItem? {
        guard let id = UInt64(persistentID) else { return nil }
        let query = MPMediaQuery.songs()
        query.addFilterPredicate(MPMediaPropertyPredicate(value: NSNumber(value: id),
                                                          forProperty: MPMediaItemPropertyPersistentID))
        return query.items?.first
    }

    static func assetURL(persistentID: String) -> URL? {
        item(persistentID: persistentID)?.assetURL
    }

    static func requestAccess() async -> Bool {
        await MPMediaLibrary.requestAuthorization() == .authorized
    }
}

struct MusicLibraryPicker: UIViewControllerRepresentable {
    var onPick: (MPMediaItem) -> Void
    var onCancel: () -> Void

    func makeUIViewController(context: Context) -> MPMediaPickerController {
        let picker = MPMediaPickerController(mediaTypes: .music)
        picker.allowsPickingMultipleItems = false
        picker.showsCloudItems = false
        picker.prompt = "Choose a song stored on this device"
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: MPMediaPickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, MPMediaPickerControllerDelegate {
        let parent: MusicLibraryPicker
        init(_ parent: MusicLibraryPicker) { self.parent = parent }

        func mediaPicker(_ mediaPicker: MPMediaPickerController, didPickMediaItems mediaItemCollection: MPMediaItemCollection) {
            if let item = mediaItemCollection.items.first { parent.onPick(item) } else { parent.onCancel() }
        }

        func mediaPickerDidCancel(_ mediaPicker: MPMediaPickerController) { parent.onCancel() }
    }
}
