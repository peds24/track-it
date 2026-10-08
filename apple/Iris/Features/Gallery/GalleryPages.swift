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
        case .IrisPrimaryButton:
            GallerySection(title: "Default") { IrisPrimaryButton("Add", symbol: .add) {}.accessibilityIdentifier("primary") }
            GallerySection(title: "Full width") { IrisPrimaryButton("Rate it", symbol: .rate, fullWidth: true) {}.accessibilityIdentifier("primary") }
            GallerySection(title: "In progress") { IrisPrimaryButton("Adding…", inProgress: true) {}.accessibilityIdentifier("primary") }
            GallerySection(title: "Disabled") { IrisPrimaryButton("Add", symbol: .add) {}.disabled(true).accessibilityIdentifier("primary") }
        case .IrisRatingBadge:
            GallerySection(title: "Liked · fine · disliked") {
                HStack { IrisRatingBadge(score: 9.2, sentiment: .liked); IrisRatingBadge(score: 5.5, sentiment: .fine); IrisRatingBadge(score: 2.1, sentiment: .disliked) }
            }
            GallerySection(title: "Bounds") { HStack { IrisRatingBadge(score: 10, sentiment: .liked); IrisRatingBadge(score: 0, sentiment: .disliked) } }
        case .IrisEmptyState:
            GallerySection(title: "With action") {
                IrisEmptyState("Nothing in progress", symbol: .emptyShelf, message: "Start something from Backlog and it shows up here.", actionTitle: "Add a track") {}
            }
            GallerySection(title: "Without action") {
                IrisEmptyState("No results", symbol: .search, message: "Try a different title, or add it by hand.")
            }
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
