import IrisCore
import SwiftUI

/// Stand-in for the track detail screen until I8 builds it.
struct TrackPlaceholderView: View {
    let ref: TrackRef

    var body: some View {
        IrisEmptyState("Track details arrive in I8", symbol: .more, message: "\(ref.kind.rawValue) \(ref.id)")
            .navigationTitle("Track")
            .navigationBarTitleDisplayMode(.inline)
    }
}
