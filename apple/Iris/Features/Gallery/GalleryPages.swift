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
        case .IrisCover:
            GallerySection(title: "Fallback — row, card, card (non-Latin)") {
                HStack(alignment: .top, spacing: IrisTokens.Space.lg) {
                    IrisCover(url: nil, title: "Dune", category: .book, size: .row)
                    IrisCover(url: nil, title: "Severance", category: .show, size: .card)
                    IrisCover(url: "", title: "進撃の巨人", category: .manga, size: .card)
                }
            }
            GallerySection(title: "Loaded") {
                IrisCoverArt(image: GallerySample.cover, title: "Sample", category: .movie, size: .card).frame(width: 120)
            }
            GallerySection(title: "Every category") {
                HStack { ForEach(IrisCore.Category.allCases, id: \.self) { IrisCover(url: nil, title: $0.label, category: $0, size: .row) } }
            }
        case .IrisProgress:
            GallerySection(title: "Flat 3 of 10") { IrisProgress(.flat(done: 3, total: 10)) }
            GallerySection(title: "Over-full 12 of 10 (clamped)") { IrisProgress(.flat(done: 12, total: 10)) }
            GallerySection(title: "Empty 0 of 0") { IrisProgress(.flat(done: 0, total: 0)) }
            GallerySection(title: "Seasons 10/10 · 3/8 · 0/0") {
                IrisProgress(.seasons([.init(number: 1, episodeCount: 10, done: 10), .init(number: 2, episodeCount: 8, done: 3), .init(number: 3, episodeCount: 0, done: 0)]))
            }
        case .IrisCategoryChip:
            GallerySection(title: "Regular") { VStack(alignment: .leading) { ForEach(IrisCore.Category.allCases, id: \.self) { IrisCategoryChip($0) } } }
            GallerySection(title: "Compact") { VStack(alignment: .leading) { ForEach(IrisCore.Category.allCases, id: \.self) { IrisCategoryChip($0, compact: true) } } }
        default: Text(component.rawValue)
        }
    }
}

@MainActor
enum GallerySample {
    /// A gradient "cover" so the loaded state needs no network.
    static let cover: Image = {
        let art = LinearGradient(colors: [IrisTokens.Colors.categoryMovie, IrisTokens.Colors.categoryShow], startPoint: .top, endPoint: .bottom)
            .frame(width: 200, height: 300)
            .overlay(Text("SAMPLE").font(.system(size: 28, weight: .heavy)).foregroundStyle(.white))
        return ImageRenderer(content: art).uiImage.map(Image.init(uiImage:)) ?? Image(systemName: "photo")
    }()
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
