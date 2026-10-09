import IrisCore
import SwiftUI

/// One catalogue hit: cover, title, "creator · year" (src/ui/SearchResultRow.tsx).
struct SearchResultRow: View {
    let result: SearchResult
    @Environment(\.dynamicTypeSize) private var typeSize

    var subtitle: String { [result.creator, result.year].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ") }

    var body: some View {
        HStack(spacing: IrisTokens.Space.md) {
            IrisCover(url: result.thumbnailUrl, title: result.title, category: result.category, size: .row)
            VStack(alignment: .leading, spacing: IrisTokens.Space.xxs) {
                Text(result.title)
                    .font(IrisTokens.Typography.headline.font)
                    .lineLimit(typeSize.isAccessibilitySize ? nil : 2)
                if !subtitle.isEmpty {
                    Text(subtitle).font(IrisTokens.Typography.subheadline.font)
                }
            }
            .foregroundStyle(IrisTokens.Colors.label)
            Spacer(minLength: 0)
        }
        .padding(.vertical, IrisTokens.Space.xs)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}
