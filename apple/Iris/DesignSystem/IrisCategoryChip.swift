import IrisCore
import SwiftUI

/// Names a track's category at a glance (components.md § IrisCategoryChip).
struct IrisCategoryChip: View {
    let category: IrisCore.Category
    var compact = false
    init(_ category: IrisCore.Category, compact: Bool = false) { self.category = category; self.compact = compact }

    /// The compact chip as text, for running inline with other text (a shelf
    /// row's detail line) so it wraps with it instead of claiming a column.
    static func inline(_ category: IrisCore.Category) -> Text {
        // The glyph takes the text colour: inside Text it is judged as text, and
        // the category tints fail contrast there. The row's cover carries the tint.
        Text("\(Text(category.symbol.image)) \(Text(category.label).fontWeight(.semibold))")
    }

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
