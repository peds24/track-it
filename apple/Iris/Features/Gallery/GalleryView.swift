#if DEBUG
import SwiftUI

/// Debug-only catalogue of the Iris kit (spec §8 I6).
struct GalleryView: View {
    var body: some View {
        List(GalleryComponent.allCases) { component in
            NavigationLink(component.rawValue) {
                GalleryPage(component: component)
                    .navigationTitle(component.rawValue)
                    .navigationBarTitleDisplayMode(.inline)
                    .accessibilityIdentifier("page.\(component.rawValue)")
            }
            .accessibilityIdentifier("gallery.\(component.rawValue)")
        }
        .navigationTitle("Gallery")
    }
}
#endif
