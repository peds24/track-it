#if DEBUG
import IrisCore
import SwiftUI

struct GalleryPage: View {
    let component: GalleryComponent

    var body: some View {
        if component == .IrisShelfRow {
            // A real inset-grouped list, so rows render as they will on a shelf.
            List {
                ForEach(GallerySample.rows, id: \.title) { m in IrisShelfRow(m, onOpen: {}) }
                GalleryRowTapProbe()
            }
            .listStyle(.insetGrouped)
        } else {
            scrollingPage
        }
    }

    private var scrollingPage: some View {
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
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: IrisTokens.Space.lg) { coverFallbacks }
                    VStack(alignment: .leading, spacing: IrisTokens.Space.lg) { coverFallbacks }
                }
            }
            GallerySection(title: "Hero (standalone, read as \"Cover of …\")") {
                IrisCover(url: nil, title: "Project Hail Mary", category: .book, size: .hero, decorative: false)
            }
            GallerySection(title: "Loaded") {
                IrisCoverArt(image: GallerySample.cover, title: "Sample", category: .movie, size: .card).frame(width: 120)
            }
            GallerySection(title: "Every category") {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 48 * 1.5), alignment: .leading)], alignment: .leading) {
                    ForEach(IrisCore.Category.allCases, id: \.self) { IrisCover(url: nil, title: $0.label, category: $0, size: .row) }
                }
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
        case .IrisComparisonCard:
            GallerySection(title: "Which did you prefer?") {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top) { comparisonPair }
                    VStack { comparisonPair }
                }
            }
        case .IrisSheet:
            GallerySheetDemo()
        case .IrisSymbol:
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 96))], spacing: IrisTokens.Space.lg) {
                ForEach(IrisSymbol.allCases, id: \.self) { s in
                    VStack(spacing: IrisTokens.Space.xs) {
                        s.image.font(IrisTokens.Typography.title2.font).foregroundStyle(IrisTokens.Colors.accent).frame(height: 32)
                        Text(s.rawValue).font(IrisTokens.Typography.caption1.font).foregroundStyle(IrisTokens.Colors.secondaryLabel)
                    }
                }
            }
        case .IrisShelfRow: EmptyView() // rendered as a List in body
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

extension GalleryPage {
    @ViewBuilder var coverFallbacks: some View {
        IrisCover(url: nil, title: "Dune", category: .book, size: .row)
        IrisCover(url: nil, title: "Severance", category: .show, size: .card)
        IrisCover(url: "", title: "進撃の巨人", category: .manga, size: .card)
    }

    @ViewBuilder var comparisonPair: some View {
        IrisComparisonCard(title: "Arrival", subtitle: "Denis Villeneuve", coverURL: nil, category: .movie, chosen: true) {}
        IrisComparisonCard(title: "Interstellar", subtitle: "Christopher Nolan", coverURL: nil, category: .movie) {}
    }
}

extension GallerySample {
    static let rows: [IrisShelfRow.Model] = [
        // First, so the AX5 screenshot shows a long title wrapping in full.
        .init(title: "The Lord of the Rings: The Fellowship of the Ring (Extended Edition)", category: .movie, detail: "Not started",
              progress: nil, coverURL: nil,
              accessory: .action(title: "Watched", symbol: .start, accessibilityName: "Mark The Lord of the Rings: The Fellowship of the Ring (Extended Edition) watched")),
        .init(title: "Severance", category: .show, detail: "S2 Ep 4 of 10",
              progress: .seasons([.init(number: 1, episodeCount: 9, done: 9), .init(number: 2, episodeCount: 10, done: 3)]), coverURL: nil,
              accessory: .action(title: "Done", symbol: .advance, accessibilityName: "Mark Episode 13 watched")),
        .init(title: "Dune", category: .book, detail: "Reading", progress: .flat(done: 120, total: 412), coverURL: nil,
              accessory: .action(title: "Done", symbol: .advance, accessibilityName: "Mark Dune read")),
        .init(title: "One Piece", category: .manga, detail: "Paused · Volume 31", progress: .flat(done: 30, total: 108), coverURL: nil,
              accessory: .action(title: "Resume", symbol: .start, accessibilityName: "Resume One Piece")),
        .init(title: "Saga", category: .comic, detail: "Finished", progress: nil, coverURL: nil, accessory: .rating(score: 8.7, sentiment: .liked)),
        .init(title: "Arrival", category: .movie, detail: "Watched", progress: nil, coverURL: nil, accessory: .rate),
    ]
}

struct GallerySheetDemo: View {
    @State private var shown = false
    var body: some View {
        VStack(alignment: .leading, spacing: IrisTokens.Space.lg) {
            IrisPrimaryButton("Show sheet", symbol: .add) { shown = true }.accessibilityIdentifier("sheet.present")
            Text("Glass on a busy background").font(IrisTokens.Typography.footnote.font).foregroundStyle(IrisTokens.Colors.secondaryLabel)
            HStack(spacing: IrisTokens.Space.lg) {
                Text("regular").padding().irisGlass(.regular, in: .capsule)
                Text("clear").padding().irisGlass(.clear, in: .capsule)
            }
            .padding(IrisTokens.Space.xl)
            .background(LinearGradient(colors: IrisCore.Category.allCases.map(\.tint), startPoint: .leading, endPoint: .trailing),
                        in: .rect(cornerRadius: IrisTokens.Radius.card))
        }
        .irisSheet(isPresented: $shown) {
            NavigationStack {
                Text("A medium-detent sheet. Drag up for large.")
                    .accessibilityIdentifier("sheet.body")
                    .padding()
                    .navigationTitle("IrisSheet")
                    .navigationBarTitleDisplayMode(.inline)
            }
        }
    }
}

/// A row that counts what a tap did, for GalleryTests' hit-target check.
struct GalleryRowTapProbe: View {
    @State private var accessory = 0
    @State private var open = 0
    var body: some View {
        Section("Tap probe") {
            IrisShelfRow(.init(title: "Probe", category: .show, detail: "Tap test", progress: nil, coverURL: nil,
                               accessory: .action(title: "Done", symbol: .advance, accessibilityName: "Mark probe watched")),
                         onOpen: { open += 1 }, onAccessory: { accessory += 1 })
                .accessibilityIdentifier("row.interactive")
            Text("accessory \(accessory) · open \(open)").accessibilityIdentifier("row.counts")
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
