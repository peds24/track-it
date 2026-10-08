import IrisCore
import SwiftUI

/// Placeholder until I7 builds the shelves. Imports IrisCore so the
/// package link is exercised from the very first build.
struct RootView: View {
    #if DEBUG
    @State private var showsGallery = GalleryLaunchOptions.current.opensGallery
    #endif

    var body: some View {
        NavigationStack {
            ContentUnavailableView {
                Label("Iris", systemImage: "camera.aperture")
                    .foregroundStyle(IrisTokens.Colors.accent)
            } description: {
                Text("Schema v\(IrisSchema.version)")
            }
            .navigationTitle("Iris")
            #if DEBUG
            .toolbar {
                Button("Gallery", systemImage: IrisSymbol.gallery.systemName) { showsGallery = true }
                    .accessibilityIdentifier("gallery.open")
            }
            .navigationDestination(isPresented: $showsGallery) { GalleryView() }
            #endif
        }
    }
}

#Preview {
    RootView()
}
