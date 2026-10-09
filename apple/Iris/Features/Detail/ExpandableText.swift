import SwiftUI

/// A26: a long description clamped to `lines`, with Show more / Show less.
/// Whether it overflows is measured, not guessed: a hidden, unclamped copy
/// reports its real height at the real width.
struct ExpandableText: View {
    let text: String
    var lines = 6

    @State private var expanded = false
    @State private var fullHeight: CGFloat = 0
    @State private var clampedHeight: CGFloat = 0

    static func overflows(fullHeight: CGFloat, clampedHeight: CGFloat) -> Bool { fullHeight > clampedHeight + 1 }

    var body: some View {
        VStack(alignment: .leading, spacing: IrisTokens.Space.sm) {
            Text(text)
                .font(IrisTokens.Typography.body.font)
                .foregroundStyle(IrisTokens.Colors.label)
                .lineLimit(expanded ? nil : lines)
                .fixedSize(horizontal: false, vertical: true)
                .onGeometryChange(for: CGFloat.self, of: \.size.height) { if !expanded { clampedHeight = $0 } }
                .background(alignment: .topLeading) {
                    // The unclamped copy: measured, never seen or read.
                    Text(text)
                        .font(IrisTokens.Typography.body.font)
                        .fixedSize(horizontal: false, vertical: true)
                        .hidden()
                        .accessibilityHidden(true)
                        .onGeometryChange(for: CGFloat.self, of: \.size.height) { fullHeight = $0 }
                }
            if Self.overflows(fullHeight: fullHeight, clampedHeight: clampedHeight) {
                Button {
                    withAnimation(IrisTokens.Motion.smooth) { expanded.toggle() }
                } label: {
                    // Label colour, not accent: system blue text is ~3.5:1 (I8 review).
                    // The 44 pt frame is inside the label, so it is the hit area.
                    Text(expanded ? "Show less" : "Show more")
                        .font(IrisTokens.Typography.subheadline.font.weight(.semibold))
                        .foregroundStyle(IrisTokens.Colors.label)
                        .underline()
                        .frame(minWidth: 44, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("detail.showMore")
            }
        }
    }
}
