import Foundation

// Port of src/ui/aboutText.ts and src/ui/feedback.ts (I12), held to them by
// shared/fixtures/aboutText.json.

/// Where feedback goes (A25): the user's own mail app, pre-addressed.
public let feedbackEmail = "serdiopedro@gmail.com"

/// The Done screen's feedback and data-sources copy.
public struct AboutCopy: Encodable, Equatable, Sendable {
    public let feedbackTitle = "Send feedback"
    public let feedbackIntro = "Something broken, missing, or great? It opens in your mail app, addressed to the developer."
    public let feedbackPlaceholder = "Your feedback"
    public let noMailTitle = "No mail app found"
    public let dataSourcesTitle = "Data sources"
    /// TMDB's notice is a condition of its API terms.
    public let dataSources = [
        "This product uses the TMDB API but is not endorsed or certified by TMDB.",
        "Book and manga data from Google Books. Comic data from Metron.",
    ]
}

public func aboutCopy() -> AboutCopy { AboutCopy() }

public func noMailMessage() -> String { "You can email your feedback to \(feedbackEmail)." }

public func versionLine(_ name: String, _ version: String, _ platform: String) -> String { "\(name) v\(version) · \(platform)" }

/// Which build is writing in, for the draft's subject and signature.
public struct FeedbackApp: Decodable, Sendable {
    public let version: String, platform: String, name: String?
    public init(version: String, platform: String, name: String? = nil) {
        self.version = version; self.platform = platform; self.name = name
    }
}

/// A pre-addressed `mailto:` draft, encoded with JSCompat's
/// `encodeURIComponent` (spaces as %20, never +).
public func feedbackMailto(_ message: String, app: FeedbackApp) -> String {
    let name = app.name ?? "Track It"
    let subject = "\(name) feedback (v\(app.version))"
    let body = "\(jsTrim(message))\n\n—\n\(name) \(app.version) · \(app.platform)"
    return "mailto:\(feedbackEmail)?subject=\(encodeURIComponent(subject))&body=\(encodeURIComponent(body))"
}
