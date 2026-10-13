import IrisCore
import SwiftUI

/// A26: your ranked list, one category at a time (app/rankings.tsx).
struct RankingsView: View {
    @State var model: RankingsModel
    @Environment(\.irisFactories) private var factories
    @State private var opened: TrackRef?
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        List {
            Section {
                Picker("Category", selection: $model.category) {
                    ForEach(RankingsModel.order, id: \.self) { Text(categoryPlural($0).capitalized).tag($0) }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets())
            }
            if model.loaded && model.ranking.isEmpty {
                let empty = rankingsEmpty(model.category)
                IrisEmptyState(empty.title, symbol: .rankings, message: empty.body)
                    .listRowBackground(Color.clear)
            } else {
                Section {
                    ForEach(model.ranking, id: \.key) { item in
                        Button { opened = TrackRef(kind: item.kind, id: item.id) } label: { row(item) }
                            .buttonStyle(.plain)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Rankings")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(item: $opened) { ref in
            if let factories { TrackDetailView(model: factories.detail(ref)) }
        }
        .task { model.start() }
    }

    private func row(_ item: RankedTrack) -> some View {
        let rank = Text("\(item.rank)").font(IrisTokens.Typography.headline.font.monospacedDigit())
        let cover = IrisCover(url: item.coverUrl, title: item.title, category: model.category, size: .row)
        let badge = IrisRatingBadge(score: item.score, sentiment: item.sentiment)
        let text = VStack(alignment: .leading, spacing: IrisTokens.Space.xxs) {
            Text(item.title).font(IrisTokens.Typography.headline.font)
            let meta = [item.creator, item.releaseYear].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
            if !meta.isEmpty { Text(meta).font(IrisTokens.Typography.subheadline.font) }
        }
        return Group {
            if typeSize.isAccessibilitySize {
                // At AX sizes the text gets the full width, as a shelf row does (I7).
                VStack(alignment: .leading, spacing: IrisTokens.Space.sm) {
                    HStack(spacing: IrisTokens.Space.md) { rank; cover; Spacer(minLength: 0); badge }
                    text
                }
            } else {
                HStack(spacing: IrisTokens.Space.md) {
                    rank.frame(minWidth: 28, alignment: .trailing)
                    cover
                    text
                    Spacer(minLength: 0)
                    badge
                }
            }
        }
        .foregroundStyle(IrisTokens.Colors.label)
        .padding(.vertical, IrisTokens.Space.xs)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(rankingRowLabel(rank: item.rank, title: item.title, score: item.score))
        .accessibilityAddTraits(.isButton)
    }
}
