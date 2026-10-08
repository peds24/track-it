#if DEBUG
import IrisCore
import SwiftUI

struct GalleryPage: View {
    let component: GalleryComponent

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: IrisTokens.Space.xxl) {
                content
            }
            .padding(IrisTokens.Space.lg)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(IrisTokens.Colors.groupedBackground)
    }

    @ViewBuilder private var content: some View {
        switch component {
        default: Text(component.rawValue)
        }
    }
}

/// A captioned group of states on a Gallery page.
struct GallerySection<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: IrisTokens.Space.sm) {
            Text(title).font(IrisTokens.Typography.footnote.font).foregroundStyle(IrisTokens.Colors.secondaryLabel)
            content
        }
    }
}
#endif
