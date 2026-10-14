import IrisCore
import SwiftUI

/// A25 on iOS (I12): a note for the developer, sent from the user's own mail
/// app as a pre-addressed draft — Iris has no server. Copy from
/// src/ui/aboutText.ts (shared/fixtures/aboutText.json).
struct FeedbackSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var draft = ""
    @State private var noMailApp = false
    private let copy = aboutCopy()

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(copy.feedbackPlaceholder, text: $draft, axis: .vertical)
                        .lineLimit(5...12)
                        .accessibilityIdentifier("feedback.text")
                } footer: {
                    Text(copy.feedbackIntro).foregroundStyle(IrisTokens.Colors.label)
                }
            }
            .navigationTitle(copy.feedbackTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send", action: send)
                        .disabled(Self.isBlank(draft))
                        .accessibilityIdentifier("feedback.send")
                }
            }
            .alert(copy.noMailTitle, isPresented: $noMailApp) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(noMailMessage())
            }
        }
    }

    static func isBlank(_ text: String) -> Bool { jsTrim(text).isEmpty }

    /// The draft for this build, as iOS's Iris.
    static func mailto(_ message: String, bundle: Bundle = .main) -> URL? {
        let version = bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
        return URL(string: feedbackMailto(message, app: FeedbackApp(version: version, platform: "iOS", name: "Iris")))
    }

    private func send() {
        guard let url = Self.mailto(draft) else { noMailApp = true; return }
        // Rejected when no app handles mailto: — say where to write instead.
        openURL(url) { accepted in
            if accepted { draft = ""; dismiss() } else { noMailApp = true }
        }
    }
}
