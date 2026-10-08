import IrisCore
import SwiftUI

/// Names a track's category at a glance (components.md § IrisCategoryChip).
struct IrisCategoryChip: View {
    let category: IrisCore.Category
    var compact = false
    init(_ category: IrisCore.Category, compact: Bool = false) { self.category = category; self.compact = compact }

    var body: some View {
        HStack(spacing: IrisTokens.Space.xs) {
            category.symbol.image.foregroundStyle(category.tint)
            Text(category.label).foregroundStyle(IrisTokens.Colors.secondaryLabel)
        }
        .font(IrisTokens.Typography.caption1.font.weight(.semibold))
        .padding(.horizontal, compact ? 0 : IrisTokens.Space.sm)
        .padding(.vertical, compact ? 0 : IrisTokens.Space.xs)
        .background { if !compact { Capsule().fill(IrisTokens.Colors.fill) } }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(category.label)
    }
}
