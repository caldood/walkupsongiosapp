import Foundation
import UIKit

/// Parses the various ways a Spotify track can be shared.
enum SpotifyLink {
    private static let patterns = [
        "spotify:track:([A-Za-z0-9]{22})",
        "open\\.spotify\\.com/(?:intl-[A-Za-z-]+/)?track/([A-Za-z0-9]{22})",
    ]

    static func trackID(from text: String) -> String? {
        let range = NSRange(text.startIndex..., in: text)
        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern),
                  let match = regex.firstMatch(in: text, range: range),
                  match.numberOfRanges > 1,
                  let r = Range(match.range(at: 1), in: text) else { continue }
            return String(text[r])
        }
        return nil
    }

    static func appURL(trackID: String) -> URL { URL(string: "spotify:track:\(trackID)")! }
    static func webURL(trackID: String) -> URL { URL(string: "https://open.spotify.com/track/\(trackID)")! }
}

enum SpotifyHandoffResult { case openedApp, openedWeb, failed }

/// Seam for Spotify playback. Spotify does not permit downloading/decoding its audio, so the
/// default implementation hands the track to the Spotify app. A `SpotifyAppRemote`-based
/// implementation (Spotify iOS SDK; requires a registered client ID, Premium and the Spotify
/// app installed) can conform to this protocol without touching any UI code.
@MainActor
protocol SpotifyPlaying {
    func play(trackID: String) async -> SpotifyHandoffResult
}

@MainActor
struct SpotifyDeepLinkPlayer: SpotifyPlaying {
    func play(trackID: String) async -> SpotifyHandoffResult {
        let app = SpotifyLink.appURL(trackID: trackID)
        if UIApplication.shared.canOpenURL(app), await UIApplication.shared.open(app) {
            return .openedApp
        }
        if await UIApplication.shared.open(SpotifyLink.webURL(trackID: trackID)) { return .openedWeb }
        return .failed
    }
}

enum SpotifyMetadata {
    struct Info { var title: String; var thumbnailURL: URL? }

    /// Uses Spotify's public, unauthenticated oEmbed endpoint. Best effort; failure is non-fatal
    /// because the user can type the title themselves.
    static func fetch(trackID: String) async -> Info? {
        var comps = URLComponents(string: "https://open.spotify.com/oembed")!
        comps.queryItems = [URLQueryItem(name: "url", value: SpotifyLink.webURL(trackID: trackID).absoluteString)]
        guard let url = comps.url else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = 6
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let title = json["title"] as? String else { return nil }
        return Info(title: title, thumbnailURL: (json["thumbnail_url"] as? String).flatMap(URL.init(string:)))
    }
}
