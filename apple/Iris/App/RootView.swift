import IrisCore
import SwiftUI

/// Placeholder until I7 builds the shelves. Imports IrisCore so the
/// package link is exercised from the very first build.
struct RootView: View {
    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "Iris",
                systemImage: "camera.aperture",
                description: Text("Schema v\(IrisCore.schemaVersion)")
            )
            .navigationTitle("Iris")
        }
    }
}

#Preview {
    RootView()
}
