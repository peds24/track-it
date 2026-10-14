import IrisCore
import SwiftUI

/// A27 on iOS (I12): where the catalogue data comes from — TMDB's notice is a
/// condition of its API terms — and which build this is.
struct DataSourcesSheet: View {
    @Environment(\.dismiss) private var dismiss
    private let copy = aboutCopy()

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(copy.dataSources, id: \.self) { Text($0).foregroundStyle(IrisTokens.Colors.label) }
                } footer: {
                    Text(Self.version()).foregroundStyle(IrisTokens.Colors.label).accessibilityIdentifier("about.version")
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(copy.dataSourcesTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Close") { dismiss() } }
            }
        }
    }

    static func version(bundle: Bundle = .main) -> String {
        versionLine("Iris", bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?", "iOS")
    }
}
